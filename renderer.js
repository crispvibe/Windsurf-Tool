// renderer.js - 渲染进程脚本
// 将 ipcRenderer 挂载到 window 对象，供全局使用
window.ipcRenderer = require('electron').ipcRenderer;

// 加载 lucide 图标库
try {
  const lucideModule = require('lucide');
  window.lucide = lucideModule;
  window.lucideIcons = lucideModule.icons || lucideModule;
  console.log('✅ Lucide 图标库加载成功');
  
  // 创建全局的图标初始化函数
  window.initLucideIcons = function() {
    try {
      if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons({ icons: window.lucideIcons });
      }
    } catch (error) {
      console.warn('初始化 Lucide 图标失败:', error);
    }
  };
  
  // 重写 lucide.createIcons 为我们的包装函数
  if (window.lucide && window.lucide.createIcons) {
    const originalCreateIcons = window.lucide.createIcons;
    window.lucide.createIcons = function(options) {
      try {
        if (!options || !options.icons) {
          return originalCreateIcons.call(window.lucide, { icons: window.lucideIcons });
        }
        return originalCreateIcons.call(window.lucide, options);
      } catch (error) {
        console.warn('创建图标失败:', error);
      }
    };
  }
} catch (error) {
  console.error('❌ Lucide 图标库加载失败:', error);
  // 提供一个空的函数避免报错
  window.lucide = {
    createIcons: () => console.warn('Lucide 图标库未加载')
  };
  window.lucideIcons = {};
  window.initLucideIcons = () => console.warn('Lucide 图标库未加载');
}

/**
 * 刷新所有数据（账号列表、域名配置等）
 */
async function refreshAllData() {
  try {
    console.log('🔄 开始刷新所有数据...');
    
    // 显示加载提示
    if (typeof showToast === 'function') {
      showToast('正在刷新所有数据...', 'info');
    }
    
    // 1. 刷新账号列表
    console.log('📋 刷新账号列表...');
    if (typeof loadAccounts === 'function') {
      await loadAccounts();
    }
    
    // 2. 刷新域名配置
    console.log('🌐 刷新域名配置...');
    if (typeof window.DomainManager !== 'undefined' && window.DomainManager.init) {
      await window.DomainManager.init();
    }
    
    // 3. 刷新邮箱配置
    console.log('📧 刷新邮箱配置...');
    if (typeof loadEmailConfig === 'function') {
      await loadEmailConfig();
    }
    
    // 4. 刷新当前登录账号
    console.log('👤 刷新当前登录账号...');
    if (typeof refreshCurrentAccount === 'function') {
      await refreshCurrentAccount();
    }
    
    // 5. 重新初始化图标
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ icons: window.lucideIcons });
    }
    
    console.log('✅ 所有数据刷新完成');
    if (typeof showToast === 'function') {
      showToast('所有数据已刷新', 'success');
    }
  } catch (error) {
    console.error('❌ 刷新数据失败:', error);
    if (typeof showToast === 'function') {
      showToast('刷新失败: ' + error.message, 'error');
    } else {
      alert('刷新失败: ' + error.message);
    }
  }
}

// 使用全局的 ipcRenderer (通过 window.ipcRenderer 访问)

// 引入 Electron shell 模块（全局使用）
const { shell } = require('electron');

// 版本更新相关变量
let versionUpdateInfo = null;
let lastVersionCheckTime = 0;
let versionCheckCooldown = 30 * 1000; // 30秒冷却时间
let isForceUpdateActive = false; // 是否有强制更新弹窗激活

// 维护模式相关变量
let isMaintenanceModeActive = false; // 是否处于维护模式

// 赞助弹窗相关变量
let sponsorPopupTimer = null;
let lastSponsorPopupTime = 0;
const SPONSOR_POPUP_INTERVAL = 10 * 60 * 1000; // 10分钟

/**
 * 显示赞助弹窗
 */
function showSponsorPopup() {
  // 检查是否已经有弹窗
  if (document.getElementById('sponsorPopupOverlay')) {
    return;
  }
  
  const now = Date.now();
  // 如果距离上次弹窗不足10分钟，不弹出
  if (now - lastSponsorPopupTime < SPONSOR_POPUP_INTERVAL) {
    return;
  }
  
  lastSponsorPopupTime = now;
  
  const popupHTML = `
    <div id="sponsorPopupOverlay" style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      animation: fadeIn 0.3s ease;
    ">
      <div style="
        background: linear-gradient(135deg, #ffffff 0%, #fafafa 100%);
        border-radius: 24px;
        padding: 0;
        max-width: 520px;
        width: 90%;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
        animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        position: relative;
        overflow: hidden;
      " onclick="event.stopPropagation()">
        <!-- 顶部装饰条 -->
        <div style="
          height: 6px;
          background: linear-gradient(90deg, #ff9500, #ff3b30, #ff9500);
          background-size: 200% 100%;
          animation: gradientMove 3s ease infinite;
        "></div>
        
        <!-- 关闭按钮 -->
        <button onclick="closeSponsorPopup()" style="
          position: absolute;
          top: 20px;
          right: 20px;
          background: rgba(0, 0, 0, 0.06);
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
          z-index: 10;
        " onmouseover="this.style.background='rgba(0, 0, 0, 0.12)'; this.style.transform='rotate(90deg)'" onmouseout="this.style.background='rgba(0, 0, 0, 0.06)'; this.style.transform='rotate(0)'">
          <i data-lucide="x" style="width: 20px; height: 20px; color: #1d1d1f;"></i>
        </button>
        
        <!-- 内容区域 -->
        <div style="padding: 48px 40px 40px;">
          <!-- 图标和标题 -->
          <div style="text-align: center; margin-bottom: 32px;">
            <div style="
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 80px;
              height: 80px;
              background: linear-gradient(135deg, #ff9500, #ff3b30);
              border-radius: 50%;
              margin-bottom: 20px;
              box-shadow: 0 12px 32px rgba(255, 59, 48, 0.35);
              position: relative;
              animation: heartbeat 2s ease-in-out infinite;
            ">
              <i data-lucide="heart" style="width: 40px; height: 40px; color: white;"></i>
              <!-- 光晕效果 -->
              <div style="
                position: absolute;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                background: linear-gradient(135deg, #ff9500, #ff3b30);
                opacity: 0.3;
                animation: pulse 2s ease-in-out infinite;
              "></div>
            </div>
            <h3 style="
              margin: 0 0 12px 0;
              font-size: 26px;
              font-weight: 800;
              background: linear-gradient(135deg, #ff9500, #ff3b30);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
              letter-spacing: -0.5px;
            ">感谢您的支持</h3>
            <p style="
              margin: 0;
              font-size: 13px;
              color: #86868b;
              font-weight: 500;
            ">让我们一起让工具变得更好</p>
          </div>
          
          <!-- 特性卡片 -->
          <div style="
            background: linear-gradient(135deg, #f0f8ff 0%, #e6f2ff 100%);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 28px;
            border: 1px solid #d1e7ff;
          ">
            <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;">
              <div style="
                width: 32px;
                height: 32px;
                background: linear-gradient(135deg, #007aff, #5ac8fa);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
              ">
                <i data-lucide="check" style="width: 18px; height: 18px; color: white;"></i>
              </div>
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #1d1d1f; margin-bottom: 4px;">
                  完全免费开源
                </div>
                <div style="font-size: 12px; color: #6e6e73; line-height: 1.6;">
                  所有功能永久免费，代码开源透明
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 12px;">
              <div style="
                width: 32px;
                height: 32px;
                background: linear-gradient(135deg, #ff9500, #ff3b30);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
              ">
                <i data-lucide="zap" style="width: 18px; height: 18px; color: white;"></i>
              </div>
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #1d1d1f; margin-bottom: 4px;">
                  持续运营成本
                </div>
                <div style="font-size: 12px; color: #6e6e73; line-height: 1.6;">
                  服务器、CDN、API 中转需要您的支持
                </div>
              </div>
            </div>
          </div>
          
          <!-- 按钮组 -->
          <div style="display: flex; gap: 12px;">
            <button onclick="closeSponsorPopup()" style="
              flex: 1;
              padding: 14px 24px;
              background: #f5f5f7;
              border: 1px solid #e5e5ea;
              border-radius: 12px;
              color: #1d1d1f;
              font-size: 15px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            " onmouseover="this.style.background='#e5e5ea'" onmouseout="this.style.background='#f5f5f7'">
              稍后再说
            </button>
            <button onclick="openSponsorPage()" style="
              flex: 1.2;
              padding: 14px 24px;
              background: linear-gradient(135deg, #ff9500, #ff3b30);
              border: none;
              border-radius: 12px;
              color: white;
              font-size: 15px;
              font-weight: 700;
              cursor: pointer;
              box-shadow: 0 6px 20px rgba(255, 59, 48, 0.35);
              transition: all 0.3s;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
            " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 28px rgba(255, 59, 48, 0.45)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 20px rgba(255, 59, 48, 0.35)'">
              <i data-lucide="heart" style="width: 18px; height: 18px;"></i>
              <span>赞助支持</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <style>
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUp {
        from { 
          opacity: 0;
          transform: translateY(40px) scale(0.95);
        }
        to { 
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes heartbeat {
        0%, 100% { transform: scale(1); }
        10% { transform: scale(1.1); }
        20% { transform: scale(1); }
      }
      @keyframes pulse {
        0%, 100% { 
          transform: scale(1);
          opacity: 0.3;
        }
        50% { 
          transform: scale(1.3);
          opacity: 0;
        }
      }
      @keyframes gradientMove {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
    </style>
  `;
  
  document.body.insertAdjacentHTML('beforeend', popupHTML);
  
  // 初始化图标
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/**
 * 关闭赞助弹窗
 */
function closeSponsorPopup() {
  const overlay = document.getElementById('sponsorPopupOverlay');
  if (overlay) {
    overlay.style.animation = 'fadeOut 0.2s ease';
    setTimeout(() => {
      overlay.remove();
    }, 200);
  }
}

/**
 * 打开赞助页面
 */
function openSponsorPage() {
  closeSponsorPopup();
  if (typeof switchView === 'function') {
    switchView('sponsor');
  }
}

/**
 * 启动赞助弹窗定时器
 */
function startSponsorPopupTimer() {
  // 首次启动时立即显示
  setTimeout(() => {
    showSponsorPopup();
  }, 5000); // 5秒后首次弹出
  
  // 之后每10分钟弹一次
  sponsorPopupTimer = setInterval(() => {
    showSponsorPopup();
  }, SPONSOR_POPUP_INTERVAL);
}

/**
 * 停止赞助弹窗定时器
 */
function stopSponsorPopupTimer() {
  if (sponsorPopupTimer) {
    clearInterval(sponsorPopupTimer);
    sponsorPopupTimer = null;
  }
}

// 添加 fadeOut 动画
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;
document.head.appendChild(style);

// 全局错误捕获
window.addEventListener('error', (event) => {
  console.error('全局错误:', event.error);
  alert(t('errorOccurred') + ': ' + event.error.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的Promise拒绝:', event.reason);
  alert(t('asyncOperationFailed') + ': ' + event.reason);
});

// 监听版本更新通知
window.ipcRenderer.on('version-update-available', (event, updateInfo) => {
  console.log('收到版本更新通知:', updateInfo);
  showVersionUpdateModal(updateInfo);
});

// 监听维护模式通知
window.ipcRenderer.on('maintenance-mode-active', (event, maintenanceInfo) => {
  console.log('收到维护模式通知:', maintenanceInfo);
  activateMaintenanceMode(maintenanceInfo);
});

// 监听维护模式结束通知
window.ipcRenderer.on('maintenance-mode-ended', () => {
  console.log('收到维护模式结束通知');
  deactivateMaintenanceMode();
});

// 监听 API 无法访问通知
window.ipcRenderer.on('api-unavailable', (event, errorInfo) => {
  console.error('收到 API 无法访问通知:', errorInfo);
  showApiUnavailableModal(errorInfo);
});

// 注意：维护模式检查由 main.js 中的 versionManager 统一管理
// 此处不再重复检查，只监听 main.js 的通知

// 激活维护模式
function activateMaintenanceMode(maintenanceInfo) {
  if (isMaintenanceModeActive) {
    return; // 已经在维护模式中
  }
  
  isMaintenanceModeActive = true;
  showMaintenanceModal(maintenanceInfo);
  
  // 注意：维护模式的恢夏检查由 versionManager 统一管理
  // 不再在此处设置定时器
}

// 退出维护模式
function deactivateMaintenanceMode() {
  if (!isMaintenanceModeActive) {
    return;
  }
  
  isMaintenanceModeActive = false;
  
  // 关闭维护模式弹窗
  const modal = document.getElementById('maintenanceModal');
  if (modal) {
    modal.remove();
  }
  
  // 恢复所有功能
  document.body.style.pointerEvents = 'auto';
  enableAllFunctions();
  
  alert('✅ 服务器维护已结束，应用已恢复正常！');
}

// 显示 API 无法访问弹窗
function showApiUnavailableModal(errorInfo) {
  const modalHTML = `
    <div id="apiUnavailableModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;">
      <div style="background: white; border-radius: 16px; padding: 32px; max-width: 500px; text-align: center; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);">
        <div style="margin-bottom: 16px;"><i data-lucide="wifi-off" style="width: 64px; height: 64px; color: #ff3b30;"></i></div>
        <h2 style="margin: 0 0 16px 0; font-size: 24px; color: #ff3b30;">无法连接到服务器</h2>
        <p style="color: #86868b; margin: 0 0 24px 0; line-height: 1.6;">
          ${errorInfo.message || '无法连接到服务器，请检查网络连接后重启软件'}
        </p>
        <div style="background: #fff3e0; border: 1px solid #ff9800; border-radius: 8px; padding: 16px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
          <i data-lucide="alert-triangle" style="width: 20px; height: 20px; color: #ff9800; flex-shrink: 0;"></i>
          <p style="margin: 0; color: #e65100; font-size: 14px; text-align: left;">
            软件需要连接到服务器才能使用<br>
            请检查您的网络连接后重新启动软件
          </p>
        </div>
        <button onclick="window.close()" style="background: linear-gradient(180deg, #ff3b30 0%, #d32f2f 100%); color: white; border: none; padding: 12px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(255, 59, 48, 0.3);">
          退出软件
        </button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // 初始化图标
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  // 阻止所有交互
  document.body.style.pointerEvents = 'none';
  document.getElementById('apiUnavailableModal').style.pointerEvents = 'auto';
  
  // 设置强制更新状态
  isForceUpdateActive = true;
  setupForceUpdateProtection();
}

// 带维护模式检测的IPC调用包装器
async function safeIpcInvoke(channel, ...args) {
  // 如果已经在维护模式，阻止大部分操作
  if (isMaintenanceModeActive && !isMaintenanceAllowedOperation(channel)) {
    alert('⚠️ 服务器维护中，该功能暂时不可用');
    return { success: false, error: '服务器维护中' };
  }
  
  try {
    const result = await window.ipcRenderer.invoke(channel, ...args);
    
    // 检查返回结果中是否包含维护模式信息
    if (result && result.error && result.error.includes('维护')) {
      console.log('🔧 API调用检测到维护模式');
      // 立即检查维护状态
      setTimeout(async () => {
        try {
          const maintenanceResult = await window.ipcRenderer.invoke('check-maintenance-mode');
          if (maintenanceResult.success && maintenanceResult.inMaintenance) {
            activateMaintenanceMode({
              enabled: maintenanceResult.maintenanceInfo.enabled,
              message: maintenanceResult.maintenanceInfo.message || '服务器正在维护中，请稍后再试',
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error('维护模式检查失败:', error);
        }
      }, 100);
    }
    
    return result;
  } catch (error) {
    console.error(`IPC调用失败 (${channel}):`, error);
    throw error;
  }
}

// 判断是否是维护模式下允许的操作
function isMaintenanceAllowedOperation(channel) {
  const allowedOperations = [
    'check-maintenance-mode',
    'exit-maintenance-mode',
    'get-language',
    'save-language'
  ];
  return allowedOperations.includes(channel);
}

// 设置维护模式拦截器
function setupMaintenanceInterceptors() {
  // 拦截所有按钮点击
  document.addEventListener('click', (event) => {
    if (isMaintenanceModeActive) {
      const target = event.target;
      
      // 允许维护模式弹窗内的按钮
      if (target.closest('#maintenanceModal')) {
        return;
      }
      
      // 阻止其他所有按钮点击
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        event.preventDefault();
        event.stopPropagation();
        alert('⚠️ 服务器维护中，该功能暂时不可用');
        return false;
      }
    }
  }, true);
  
  // 拦截表单提交
  document.addEventListener('submit', (event) => {
    if (isMaintenanceModeActive) {
      event.preventDefault();
      event.stopPropagation();
      alert('⚠️ 服务器维护中，无法提交表单');
      return false;
    }
  }, true);
  
  // 拦截链接点击
  document.addEventListener('click', (event) => {
    if (isMaintenanceModeActive) {
      const target = event.target;
      if (target.tagName === 'A' || target.closest('a')) {
        // 允许维护模式弹窗内的链接
        if (!target.closest('#maintenanceModal')) {
          event.preventDefault();
          event.stopPropagation();
          alert('⚠️ 服务器维护中，链接暂时不可用');
          return false;
        }
      }
    }
  }, true);
}

// 手动检查版本更新
async function checkForUpdates() {
  const now = Date.now();
  
  // 检查冷却时间
  if (now - lastVersionCheckTime < versionCheckCooldown) {
    const remainingTime = Math.ceil((versionCheckCooldown - (now - lastVersionCheckTime)) / 1000);
    alert(`请等待 ${remainingTime} 秒后再次检查版本`);
    return;
  }
  
  lastVersionCheckTime = now;
  
  try {
    const result = await safeIpcInvoke('check-for-updates');
    
    if (result.success) {
      if (result.hasUpdate) {
        showVersionUpdateModal(result);
      } else {
        if (confirm(`当前版本 ${result.currentVersion} 已是最新版本\n\n是否要访问GitHub查看所有版本？`)) {
          openDownloadUrl();
        }
      }
    } else {
      alert('检查版本更新失败: ' + result.error);
    }
  } catch (error) {
    console.error('检查版本更新失败:', error);
    alert('检查版本更新失败: ' + error.message);
  }
}

// 语言切换功能
function updateUILanguage() {
  const lang = getCurrentLanguage();
  
  // 更新标签页
  const tabs = document.querySelectorAll('.tab');
  if (tabs[0]) tabs[0].textContent = t('tabRegister');
  if (tabs[1]) tabs[1].textContent = t('tabSwitch');
  if (tabs[2]) tabs[2].textContent = t('tabFreeAccounts');
  if (tabs[3]) tabs[3].textContent = t('tabTutorial');
  if (tabs[4]) tabs[4].textContent = t('tabSettings');
  
  // 更新所有带 data-i18n 属性的元素
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = t(key);
    } else {
      el.textContent = t(key);
    }
  });
  
  // 更新所有带 data-i18n-placeholder 属性的元素
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
  
  // 更新所有带 data-i18n-html 属性的元素（支持HTML内容）
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    el.innerHTML = t(key);
  });
  
  // 重新渲染账号列表（更新徽标文本）
  if (typeof loadAccounts === 'function') {
    loadAccounts();
  }
  if (typeof renderSwitchAccountsGrid === 'function') {
    renderSwitchAccountsGrid();
  }
  if (typeof renderUsedAccountsGrid === 'function') {
    renderUsedAccountsGrid();
  }
}

// 页面加载完成后更新语言
window.addEventListener('DOMContentLoaded', () => {
  updateUILanguage();
  
  // 同步语言选择器
  const currentLang = getCurrentLanguage();
  const modalSelect = document.getElementById('modalLanguageSelect');
  const settingsSelect = document.getElementById('languageSelect');
  if (modalSelect) modalSelect.value = currentLang;
  if (settingsSelect) settingsSelect.value = currentLang;
  
  // 注意：维护模式检查已由 versionManager 统一管理
  // 不再在此处单独检查
  
  // 添加全局按钮点击拦截器
  setupMaintenanceInterceptors();
  
  // 确保所有弹窗初始状态为隐藏
  const modals = ['addAccountModal', 'importAccountModal', 'exportAccountModal'];
  modals.forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  });
  
  // 监听版本更新通知
  window.ipcRenderer.on('version-update-required', (event, versionInfo) => {
    showVersionUpdateModal(versionInfo);
  });
  
  // 初始化全局防护机制（用于检测强制更新状态）
  initializeGlobalProtection();
  
  // 监听主进程发送的强制更新警告
  window.ipcRenderer.on('show-force-update-warning', () => {
    if (isForceUpdateActive) {
      alert('⚠️ 当前版本已停止支持，无法刷新页面。\n\n请点击"立即更新"按钮下载最新版本。');
      
      // 确保强制更新弹窗显示
      const modal = document.getElementById('versionUpdateModal');
      if (modal) {
        modal.style.display = 'flex';
        modal.focus();
      }
    }
  });
  
  // 页面刷新时自动检测版本更新
  setTimeout(() => {
    checkForUpdatesOnRefresh();
  }, 2000); // 延迟2秒执行，避免影响页面加载速度

  // 配置页面：为邮箱域名输入框绑定回车添加事件
  try {
    const domainInput = document.getElementById('newDomain');
    if (domainInput) {
      domainInput.addEventListener('keydown', (event) => {
        // Shift+Enter 换行，直接返回
        if (event.key === 'Enter' && event.shiftKey) {
          return;
        }

        // 单独 Enter：阻止默认换行，触发添加域名
        if (event.key === 'Enter') {
          event.preventDefault();
          addDomain();
        }
      });
    }
  } catch (e) {}
});

// 显示版本更新弹窗
function showVersionUpdateModal(versionInfo) {
  versionUpdateInfo = versionInfo;
  
  const modal = document.getElementById('versionUpdateModal');
  const title = document.getElementById('versionUpdateTitle');
  const content = document.getElementById('versionUpdateContent');
  const currentVersion = document.getElementById('currentVersionDisplay');
  const latestVersion = document.getElementById('latestVersionDisplay');
  const downloadBtn = document.getElementById('versionDownloadBtn');
  const closeBtn = document.getElementById('versionCloseBtn');
  const notice = document.getElementById('versionNotice');
  
  if (!modal) return;
  
  console.log('显示版本更新弹窗:', versionInfo);
  
  // 设置标题
  if (versionInfo.forceUpdate) {
    title.innerHTML = '<i data-lucide="alert-circle" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;"></i>强制更新';
  } else {
    title.innerHTML = '<i data-lucide="sparkles" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;"></i>发现新版本';
  }
  // 初始化图标
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  // 设置更新内容，支持换行显示
  let updateMessage = '';
  if (versionInfo.updateMessage) {
    if (typeof versionInfo.updateMessage === 'string') {
      updateMessage = versionInfo.updateMessage;
    } else if (versionInfo.updateMessage.content) {
      updateMessage = versionInfo.updateMessage.content;
    } else {
      // 如果updateMessage是对象，尝试格式化显示
      updateMessage = formatUpdateMessage(versionInfo.updateMessage);
    }
  } else {
    updateMessage = versionInfo.forceUpdate 
      ? '当前版本已不再支持，请立即下载最新版本以继续使用。'
      : '发现新版本，建议您更新以获得更好的体验和新功能。';
  }
  
  content.textContent = updateMessage;
  
  // 设置版本信息
  if (versionInfo.currentVersion) {
    currentVersion.textContent = versionInfo.currentVersion;
  }
  if (versionInfo.latestVersion) {
    latestVersion.textContent = versionInfo.latestVersion;
  }
  
  // 设置下载按钮文本和关闭按钮显示
  if (versionInfo.forceUpdate) {
    downloadBtn.innerHTML = '<i data-lucide="alert-triangle" style="width: 16px; height: 16px; margin-right: 8px;"></i>立即更新（必需）';
    // 强制更新时隐藏关闭按钮
    if (closeBtn) closeBtn.style.display = 'none';
  } else {
    downloadBtn.innerHTML = '<i data-lucide="download" style="width: 16px; height: 16px; margin-right: 8px;"></i>立即下载最新版本';
    // 非强制更新时，检查是否支持当前版本（维护模式）
    if (versionInfo.isSupported === false) {
      // 维护模式：当前版本不再支持，即使非强制更新也不能关闭
      if (closeBtn) closeBtn.style.display = 'none';
    } else {
      // 正常非强制更新：显示关闭按钮
      if (closeBtn) closeBtn.style.display = 'inline-block';
    }
  }
  
  // 设置提示信息
  if (versionInfo.forceUpdate) {
    notice.innerHTML = '<i data-lucide="alert-triangle" style="width: 16px; height: 16px; margin-right: 8px; vertical-align: middle;"></i>当前版本已停止支持，必须更新才能继续使用';
    notice.parentElement.style.background = '#ffebee';
    notice.parentElement.style.borderColor = '#f44336';
    notice.style.color = '#d32f2f';
  } else if (versionInfo.isSupported === false) {
    // 维护模式：非强制更新但版本不再支持
    notice.innerHTML = '<i data-lucide="alert-triangle" style="width: 16px; height: 16px; margin-right: 8px; vertical-align: middle;"></i>当前版本已进入维护模式，强烈建议立即更新';
    notice.parentElement.style.background = '#fff3e0';
    notice.parentElement.style.borderColor = '#ff9800';
    notice.style.color = '#e65100';
  } else {
    // 正常非强制更新
    notice.innerHTML = '<i data-lucide="lightbulb" style="width: 16px; height: 16px; margin-right: 8px; vertical-align: middle;"></i>为了确保最佳体验和安全性，强烈建议及时更新到最新版本';
    notice.parentElement.style.background = '#fff8e1';
    notice.parentElement.style.borderColor = '#ffcc02';
    notice.style.color = '#f57c00';
  }
  // 初始化图标
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  // 显示弹窗（不可关闭）
  modal.style.display = 'flex';
  
  // 确保弹窗和按钮可以接收点击事件
  modal.style.pointerEvents = 'auto';
  const modalDialog = modal.querySelector('.modal-dialog');
  if (modalDialog) {
    modalDialog.style.pointerEvents = 'auto';
  }
  
  // 如果是强制更新或维护模式，设置防护机制
  if (versionInfo.forceUpdate || versionInfo.isSupported === false) {
    isForceUpdateActive = true;
    setupForceUpdateProtection();
    
    // 通知主进程启用强制更新防护
    window.ipcRenderer.send('set-force-update-status', true);
    
    // 阻止其他区域的交互，但保持弹窗可点击
    document.body.style.pointerEvents = 'none';
    modal.style.pointerEvents = 'auto';
  }
  
  // 初始化图标
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// 格式化更新消息
function formatUpdateMessage(updateMessage) {
  if (typeof updateMessage === 'string') {
    return updateMessage;
  }
  
  let formatted = '';
  
  if (updateMessage.title) {
    formatted += `${updateMessage.title}\n\n`;
  }
  
  if (updateMessage.features && updateMessage.features.length > 0) {
    formatted += '✨ 新功能:\n';
    updateMessage.features.forEach(feature => {
      formatted += `• ${feature}\n`;
    });
    formatted += '\n';
  }
  
  if (updateMessage.fixes && updateMessage.fixes.length > 0) {
    formatted += '🐛 修复:\n';
    updateMessage.fixes.forEach(fix => {
      formatted += `• ${fix}\n`;
    });
    formatted += '\n';
  }
  
  if (updateMessage.improvements && updateMessage.improvements.length > 0) {
    formatted += '⚡ 改进:\n';
    updateMessage.improvements.forEach(improvement => {
      formatted += `• ${improvement}\n`;
    });
    formatted += '\n';
  }
  
  if (updateMessage.notes) {
    formatted += `📝 说明:\n${updateMessage.notes}`;
  }
  
  return formatted.trim() || '发现新版本，建议您更新以获得更好的体验。';
}

// 显示维护模式弹窗
function showMaintenanceModal(maintenanceInfo) {
  console.log('显示维护模式弹窗:', maintenanceInfo);
  
  // 创建维护模式模态框
  const existingModal = document.getElementById('maintenanceModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  const modalHTML = `
    <div id="maintenanceModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="background: white; border-radius: 16px; padding: 40px; max-width: 500px; text-align: center; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);">
        <div style="margin-bottom: 24px;">
          <i data-lucide="wrench" style="width: 64px; height: 64px; color: #ff9500; animation: pulse 2s infinite;"></i>
        </div>
        <h2 style="margin: 0 0 16px 0; font-size: 24px; color: #1d1d1f; font-weight: 600;">服务器维护中</h2>
        <p style="color: #86868b; margin: 0 0 24px 0; font-size: 16px; line-height: 1.6;">
          ${maintenanceInfo.message || '服务器正在维护中，请稍后再试'}
        </p>
        <div style="background: #fff3e0; border: 1px solid #ff9800; border-radius: 8px; padding: 16px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
          <i data-lucide="clock" style="width: 20px; height: 20px; color: #ff9800; flex-shrink: 0;"></i>
          <p style="margin: 0; color: #e65100; font-size: 14px; text-align: left;">
            检测时间: ${new Date(maintenanceInfo.timestamp || Date.now()).toLocaleString('zh-CN')}
          </p>
        </div>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button id="maintenanceRetryBtn" style="background: linear-gradient(180deg, #34c759 0%, #2ea44f 100%); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 8px rgba(52, 199, 89, 0.3); display: flex; align-items: center; gap: 8px;">
            <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
            <span>重新检查</span>
          </button>
          <button id="maintenanceExitBtn" style="background: linear-gradient(180deg, #ff3b30 0%, #d32f2f 100%); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 8px rgba(255, 59, 48, 0.3); display: flex; align-items: center; gap: 8px;">
            <i data-lucide="x-circle" style="width: 16px; height: 16px;"></i>
            <span>退出应用</span>
          </button>
        </div>
      </div>
    </div>
    <style>
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.1); opacity: 0.8; }
      }
    </style>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // 初始化图标
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  // 绑定重新检查按钮
  const retryButton = document.getElementById('maintenanceRetryBtn');
  if (retryButton) {
    retryButton.addEventListener('click', async () => {
      retryButton.disabled = true;
      retryButton.innerHTML = '<i data-lucide="loader-2" style="width: 16px; height: 16px; animation: spin 1s linear infinite;"></i><span>检查中...</span>';
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      
      // 注意：维护模式检查已由 versionManager 统一管理
      // 这里暂时不做检查，等待 versionManager 的通知
      setTimeout(() => {
        retryButton.disabled = false;
        retryButton.innerHTML = '<i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i><span>重新检查</span>';
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
        alert('请等待系统自动检测维护模式恢复');
      }, 2000);
    });
  }
  
  // 绑定退出按钮
  const exitButton = document.getElementById('maintenanceExitBtn');
  if (exitButton) {
    exitButton.addEventListener('click', () => {
      if (confirm('确定要退出应用吗？')) {
        window.close();
      }
    });
  }
  
  // 阻止所有其他交互
  document.body.style.pointerEvents = 'none';
  document.getElementById('maintenanceModal').style.pointerEvents = 'auto';
  
  // 禁用所有功能按钮
  disableAllFunctions();
}

// 禁用所有功能按钮
function disableAllFunctions() {
  // 禁用所有按钮
  const buttons = document.querySelectorAll('button:not(#maintenanceModal button)');
  buttons.forEach(button => {
    button.disabled = true;
    button.style.opacity = '0.5';
    button.style.cursor = 'not-allowed';
  });
  
  // 禁用所有输入框
  const inputs = document.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    input.disabled = true;
    input.style.opacity = '0.5';
  });
  
  // 禁用所有链接
  const links = document.querySelectorAll('a');
  links.forEach(link => {
    link.style.pointerEvents = 'none';
    link.style.opacity = '0.5';
  });
  
  // 阻止键盘快捷键（如F5刷新）
  document.addEventListener('keydown', preventMaintenanceKeyEvents, true);
  
  // 阻止右键菜单
  document.addEventListener('contextmenu', preventMaintenanceEvents, true);
  
  // 添加维护模式遮罩到主要内容区域
  const mainContent = document.querySelector('.container') || document.body;
  if (mainContent && !document.getElementById('maintenanceOverlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'maintenanceOverlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.9);
      z-index: 9998;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 18px;
      color: #666;
      pointer-events: none;
    `;
    overlay.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 48px; margin-bottom: 10px;">🔧</div>
        <div>服务器维护中，功能暂时不可用</div>
      </div>
    `;
    
    document.body.appendChild(overlay);
  }
}

// 阻止维护模式下的键盘事件
function preventMaintenanceKeyEvents(event) {
  // 阻止刷新快捷键
  if (event.key === 'F5' || (event.ctrlKey && event.key === 'r') || (event.metaKey && event.key === 'r')) {
    event.preventDefault();
    event.stopPropagation();
    alert('⚠️ 服务器维护中，无法刷新页面');
    return false;
  }
  
  // 阻止开发者工具
  if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && event.key === 'I')) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
}

// 阻止维护模式下的其他事件
function preventMaintenanceEvents(event) {
  event.preventDefault();
  event.stopPropagation();
  return false;
}

// 恢复所有功能按钮
function enableAllFunctions() {
  // 恢复所有按钮
  const buttons = document.querySelectorAll('button');
  buttons.forEach(button => {
    button.disabled = false;
    button.style.opacity = '1';
    button.style.cursor = 'pointer';
  });
  
  // 恢复所有输入框
  const inputs = document.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    input.disabled = false;
    input.style.opacity = '1';
  });
  
  // 恢复所有链接
  const links = document.querySelectorAll('a');
  links.forEach(link => {
    link.style.pointerEvents = 'auto';
    link.style.opacity = '1';
  });
  
  // 移除事件监听器
  document.removeEventListener('keydown', preventMaintenanceKeyEvents, true);
  document.removeEventListener('contextmenu', preventMaintenanceEvents, true);
  
  // 移除维护模式遮罩
  const overlay = document.getElementById('maintenanceOverlay');
  if (overlay) {
    overlay.remove();
  }
}

// 打开下载链接 - 显示选择对话框
async function openDownloadUrl() {
  
  // 创建选择对话框
  const modalHTML = `
    <div id="downloadChoiceModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; z-index: 10001; pointer-events: auto;">
      <div style="background: white; border-radius: 16px; padding: 32px; max-width: 450px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); pointer-events: auto;">
        <h2 style="margin: 0 0 24px 0; font-size: 20px; text-align: center;">选择下载方式</h2>
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <button onclick="openGithubReleases()" style="background: linear-gradient(180deg, #24292e 0%, #1a1e22 100%); color: white; border: none; padding: 16px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px; transition: all 0.2s; pointer-events: auto;">
            <i data-lucide="github" style="width: 24px; height: 24px;"></i>
            <div style="text-align: left;">
              <div>GitHub Releases</div>
              <div style="font-size: 12px; opacity: 0.8; font-weight: normal;">https://github.com/crispvibe/Windsurf-Tool/releases</div>
            </div>
          </button>
          <button onclick="openQQGroup()" style="background: linear-gradient(180deg, #12b7f5 0%, #0099e5 100%); color: white; border: none; padding: 16px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px; transition: all 0.2s; pointer-events: auto;">
            <i data-lucide="message-circle" style="width: 24px; height: 24px;"></i>
            <div style="text-align: left;">
              <div>加入 QQ 群获取</div>
              <div style="font-size: 12px; opacity: 0.8; font-weight: normal;">群号：469028100</div>
            </div>
          </button>
        </div>
        <button onclick="closeDownloadChoice()" style="margin-top: 16px; width: 100%; background: #f5f5f7; color: #1d1d1f; border: none; padding: 12px; border-radius: 8px; font-size: 14px; cursor: pointer; pointer-events: auto;">
          取消
        </button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // 确保弹窗可以接收点击事件
  const modal = document.getElementById('downloadChoiceModal');
  if (modal) {
    modal.style.pointerEvents = 'auto';
  }
  
  // 初始化图标
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// 打开 GitHub Releases
function openGithubReleases() {
  shell.openExternal('https://github.com/crispvibe/Windsurf-Tool/releases');
  closeDownloadChoice();
}

// 打开 QQ 群（已在 index.html 中定义）
// function openQQGroup() 已存在

// 关闭下载选择对话框
function closeDownloadChoice() {
  const modal = document.getElementById('downloadChoiceModal');
  if (modal) {
    modal.remove();
  }
}

// 初始化全局防护机制
function initializeGlobalProtection() {
  console.log('🛡️ 初始化全局防护机制');
  
  // 监听页面可见性变化，确保强制更新弹窗始终显示
  document.addEventListener('visibilitychange', () => {
    if (isForceUpdateActive && !document.hidden) {
      // 页面重新可见时，确保强制更新弹窗显示
      setTimeout(() => {
        const modal = document.getElementById('versionUpdateModal');
        if (modal && modal.style.display !== 'flex') {
          modal.style.display = 'flex';
          console.log('🔄 强制更新弹窗已重新显示');
        }
      }, 100);
    }
  });
  
  // 监听窗口焦点变化
  window.addEventListener('focus', () => {
    if (isForceUpdateActive) {
      const modal = document.getElementById('versionUpdateModal');
      if (modal && modal.style.display !== 'flex') {
        modal.style.display = 'flex';
        console.log('🔄 强制更新弹窗已重新显示（焦点恢复）');
      }
    }
  });
}

// 设置强制更新防护机制
function setupForceUpdateProtection() {
  console.log('🔒 启用强制更新防护机制');
  
  // 防止页面刷新
  window.addEventListener('beforeunload', preventRefreshDuringForceUpdate);
  
  // 防止快捷键刷新
  document.addEventListener('keydown', preventRefreshKeysDuringForceUpdate);
}

// 移除强制更新防护机制
function removeForceUpdateProtection() {
  console.log('🔓 移除强制更新防护机制');
  
  isForceUpdateActive = false;
  
  window.removeEventListener('beforeunload', preventRefreshDuringForceUpdate);
  document.removeEventListener('keydown', preventRefreshKeysDuringForceUpdate);
  
  // 通知主进程关闭强制更新防护
  window.ipcRenderer.send('set-force-update-status', false);
}

// 防止页面刷新的事件处理器
function preventRefreshDuringForceUpdate(event) {
  if (isForceUpdateActive) {
    event.preventDefault();
    event.returnValue = '当前版本已停止支持，必须更新才能继续使用。请点击"立即更新"按钮下载最新版本。';
    
    // 显示提示
    setTimeout(() => {
      alert('⚠️ 当前版本已停止支持，无法刷新页面。\n\n请点击"立即更新"按钮下载最新版本。');
    }, 100);
    
    return '当前版本已停止支持，必须更新才能继续使用。';
  }
}

// 防止快捷键刷新的事件处理器
function preventRefreshKeysDuringForceUpdate(event) {
  if (isForceUpdateActive) {
    // 只检测刷新快捷键：Cmd+R (macOS) 和 Ctrl+R (Windows/Linux)
    const isRefreshKey = (
      // macOS: Cmd+R
      (event.metaKey && event.key === 'r') ||
      // Windows/Linux: Ctrl+R
      (event.ctrlKey && event.key === 'r')
    );
    
    if (isRefreshKey) {
      event.preventDefault();
      event.stopPropagation();
      
      // 显示提示
      alert('⚠️ 当前版本已停止支持，无法刷新页面。\n\n请点击"立即更新"按钮下载最新版本。');
      
      // 确保弹窗仍然显示
      const modal = document.getElementById('versionUpdateModal');
      if (modal) {
        modal.style.display = 'flex';
        modal.focus();
      }
      
      return false;
    }
  }
}

// 关闭版本更新弹窗（仅正常非强制更新时可用）
function closeVersionUpdateModal() {
  if (versionUpdateInfo && versionUpdateInfo.forceUpdate) {
    // 强制更新时不允许关闭
    alert('⚠️ 当前版本已停止支持，必须更新才能继续使用。\n\n请点击"立即更新"按钮下载最新版本。');
    return;
  }
  
  if (versionUpdateInfo && versionUpdateInfo.isSupported === false) {
    // 维护模式时不允许关闭
    alert('⚠️ 当前版本已进入维护模式，为了您的使用安全，强烈建议立即更新。\n\n请点击"立即下载最新版本"按钮。');
    return;
  }
  
  const modal = document.getElementById('versionUpdateModal');
  if (modal) {
    modal.style.display = 'none';
    
    // 恢复页面交互
    document.body.style.pointerEvents = 'auto';
    
    console.log('✕ 用户关闭了版本更新弹窗');
  }
  
  // 清理版本更新信息
  versionUpdateInfo = null;
}

// 页面刷新时检测版本更新（静默检测）
async function checkForUpdatesOnRefresh() {
  // 检查是否在冷却时间内
  const now = Date.now();
  if (now - lastVersionCheckTime < versionCheckCooldown) {
    console.log('⏳ 版本检测在冷却时间内，跳过页面刷新检测');
    return;
  }
  
  try {
    console.log('🔄 页面刷新，执行版本检测...');
    
    // 更新最后检测时间
    lastVersionCheckTime = now;
    
    const result = await window.ipcRenderer.invoke('check-for-updates');
    
    if (result.success && result.hasUpdate) {
      console.log('🆕 检测到版本更新:', result.latestVersion);
      
      // 直接显示更新弹窗，不显示"已是最新版本"的提示
      showVersionUpdateModal(result);
    } else {
      console.log('✅ 当前版本已是最新版本');
    }
  } catch (error) {
    console.error('页面刷新版本检测失败:', error);
    // 静默失败，不显示错误提示
  }
}


let currentConfig = {
  emailDomains: ['example.com'],
  emailConfig: null
};

// 切换账号UI的状态
let switchAccountsCache = [];
let selectedSwitchAccountId = '';
let usedAccountIds = new Set(); // 已使用账号ID集合（持久化到localStorage）
let deleteMode = false; // 账号管理-删除账号模式
let isRegistering = false; // 批量注册进行中标志，防止重复点击

function loadUsedAccountsFromStorage() {
  try {
    const raw = localStorage.getItem('usedAccounts');
    if (raw) {
      const arr = JSON.parse(raw);
      usedAccountIds = new Set(Array.isArray(arr) ? arr : []);
    }
  } catch {}
}

function saveUsedAccountsToStorage() {
  try {
    localStorage.setItem('usedAccounts', JSON.stringify(Array.from(usedAccountIds)));
  } catch {}
}

// 标签页逻辑（页面特定的初始化）
window.switchTabLogic = function(tabName) {
  if (tabName === 'register') {
    // 合并后：在“批量注册 / 账号管理”页刷新账号列表
    loadAccounts();
  } else if (tabName === 'switch') {
    loadAccountsForSwitch();
    loadCurrentMachineId();
  } else if (tabName === 'freeAccounts') {
    // 免费账号页面，确保 iframe 加载
    const iframe = document.getElementById('freeAccountsFrame');
    if (iframe && !iframe.src) {
      iframe.src = 'https://www.crispvibe.cn/windsurf';
    }
  } else if (tabName === 'token') {
    // Token获取工具页面，加载JS模块
    try {
      // 如果模块还没有加载，则加载它
      if (!window.TokenGetter) {
        console.log('加载Token获取模块...');
        window.TokenGetter = require('./js/tokenGetter');
        // 初始化模块
        window.TokenGetter.initialize('tokenGetterContainer');
      }
    } catch (error) {
      console.error('Token获取模块加载失败:', error);
      const container = document.getElementById('tokenGetterContainer');
      if (container) {
        container.innerHTML = `
          <div class="status-message status-error" style="padding:20px;">
            <h3>加载失败</h3>
            <p>无法加载Token获取模块: ${error.message}</p>
          </div>
        `;
      }
    }
  } else if (tabName === 'settings') {
    loadSettings();
  }
};

// 切换标签页（兼容旧UI）
function switchTab(tabName) {
  // 检查是否是新UI
  const isNewUI = document.querySelector('.app-container');
  
  if (!isNewUI) {
    // 旧UI逻辑
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    if (event && event.target) {
      event.target.classList.add('active');
    }
    const content = document.getElementById(tabName);
    if (content) {
      content.classList.add('active');
    }
  }
  
  // 执行页面特定的逻辑
  window.switchTabLogic(tabName);
}

// 渲染“切换账号”网格（无搜索，直接展示）
function renderSwitchAccountsGrid() {
  const grid = document.getElementById('switchAccountsGrid');
  if (!grid) return;

  // 过滤掉已使用账号
  const list = (switchAccountsCache || []).filter(acc => !usedAccountIds.has(acc.id));

  if (!list || list.length === 0) {
    grid.innerHTML = `<div style="color:#999; padding:10px;">${t('noAccounts')}</div>`;
    return;
  }

  grid.innerHTML = list.map(acc => {
    const expiry = calculateExpiry(acc.createdAt);
    const selected = acc.id === selectedSwitchAccountId;
    const borderColor = selected ? '#0071e3' : 'rgba(0,0,0,0.06)';
    const bg = selected ? '#eaf3ff' : '#f5f5f7';
    const statusBadge = expiry.isExpired 
      ? `<span class="badge" style="background:#e74c3c;">${t('expired')}</span>`
      : `<span class="badge" style="background:${expiry.expiryColor};">${expiry.expiryText}</span>`;

    return `
      <div class="switch-account-card" data-id="${acc.id}" style="background:${bg}; border-color:${borderColor};">
        ${statusBadge}
        <div class="email">${acc.email}</div>
        <div class="meta">${t('expiryDate')}: ${expiry.expiryDate.toLocaleDateString()}</div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.switch-account-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      selectedSwitchAccountId = id;
      const selectedEl = document.getElementById('selectedSwitchAccount');
      const acc = switchAccountsCache.find(a => a.id === id);
      if (selectedEl && acc) {
        selectedEl.textContent = `${t('selectedAccount')}：${acc.email}`;
        selectedEl.removeAttribute('data-i18n');
      }
      renderSwitchAccountsGrid();
    });
  });
}

// 渲染“已使用账号”网格
function renderUsedAccountsGrid() {
  const grid = document.getElementById('usedAccountsGrid');
  if (!grid) return;
  const list = (switchAccountsCache || []).filter(acc => usedAccountIds.has(acc.id));
  if (list.length === 0) {
    grid.innerHTML = `<div style="color:#999; padding:10px;">${t('noUsedAccounts')}</div>`;
    return;
  }
  grid.innerHTML = list.map(acc => {
    const expiry = calculateExpiry(acc.createdAt);
    const statusBadge = expiry.isExpired 
      ? `<span class="badge" style="background:#e74c3c;">${t('expired')}</span>`
      : `<span class="badge" style="background:${expiry.expiryColor};">${expiry.expiryText}</span>`;
    return `
      <div class="used-account-card" data-id="${acc.id}">
        ${statusBadge}
        <div class="email">${acc.email}</div>
        <div class="meta" style="display:flex; justify-content:space-between; align-items:center;">
          <span>${t('expiryDate')}: ${expiry.expiryDate.toLocaleDateString()}</span>
          <button class="btn" data-action="restore" style="padding:4px 8px; font-size:11px; margin:0;">${t('restore')}</button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.used-account-card button[data-action="restore"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.used-account-card');
      const id = card && card.getAttribute('data-id');
      if (!id) return;
      restoreUsedAccount(id);
    });
  });
}

function markAccountUsed(id) {
  if (!id) return;
  usedAccountIds.add(id);
  saveUsedAccountsToStorage();
  // 清除已选提示（避免选中的是已使用的账号）
  if (selectedSwitchAccountId === id) {
    selectedSwitchAccountId = '';
    const selectedEl = document.getElementById('selectedSwitchAccount');
    if (selectedEl) selectedEl.textContent = '未选择账号';
  }
  renderSwitchAccountsGrid();
  renderUsedAccountsGrid();
}

function restoreUsedAccount(id) {
  if (!id) return;
  usedAccountIds.delete(id);
  saveUsedAccountsToStorage();
  renderSwitchAccountsGrid();
  renderUsedAccountsGrid();
}

// ==================== 批量注册 ====================

async function startBatchRegister() {
  // 防止重复点击
  if (isRegistering) {
    addRegisterLog('批量注册正在进行中，请勿重复点击', 'warning');
    return;
  }
  
  const count = parseInt(document.getElementById('registerCount').value);
  const threads = parseInt(document.getElementById('registerThreads').value);
  
  if (!count || count < 1) {
    addRegisterLog('请输入有效的注册数量', 'error');
    return;
  }
  
  if (!threads || threads < 1) {
    addRegisterLog('请输入有效的并发数', 'error');
    return;
  }
  
  if (!currentConfig.emailConfig) {
    addRegisterLog('请先配置IMAP邮箱', 'error');
    return;
  }
  
  // 设置注册状态
  isRegistering = true;
  
  // 初始化统计
  updateRegisterStats(count, 0, 0, 0);
  addRegisterLog(`开始批量注册，总数量: ${count}, 并发数: ${threads}`, 'info');
  
  try {
    const result = await window.ipcRenderer.invoke('batch-register', {
      count,
      threads,
      ...currentConfig
    });
    
    const successCount = result.filter(r => r.success).length;
    const failedCount = result.filter(r => !r.success).length;
    const failedResults = result.filter(r => !r.success);
    
    // 更新统计
    updateRegisterStats(count, successCount, failedCount, 100);
    
    // 输出结果日志
    result.forEach((r, index) => {
      if (r.success) {
        addRegisterLog(`✓ [${index + 1}/${count}] 注册成功: ${r.email}`, 'success');
      } else {
        addRegisterLog(`✗ [${index + 1}/${count}] 注册失败: ${r.error || '未知错误'}`, 'error');
      }
    });
    
    addRegisterLog(`批量注册完成！成功: ${successCount}, 失败: ${failedCount}`, successCount > 0 ? 'success' : 'error');
    
    // 刷新账号列表
    loadAccounts();
  } catch (error) {
    console.error('批量注册错误:', error);
    addRegisterLog(`批量注册失败: ${error.message || '未知错误'}`, 'error');
  } finally {
    // 恢复状态
    isRegistering = false;
  }
}

// 取消批量注册
async function cancelBatchRegister() {
  if (!isRegistering) {
    return;
  }
  
  addRegisterLog('正在取消批量注册...', 'warning');
  
  try {
    const result = await window.ipcRenderer.invoke('cancel-batch-register');
    if (result.success) {
      addRegisterLog('批量注册已取消', 'info');
      isRegistering = false;
    } else {
      addRegisterLog(`取消失败: ${result.message || '未知错误'}`, 'error');
    }
  } catch (error) {
    console.error('取消注册错误:', error);
    addRegisterLog(`取消失败: ${error.message}`, 'error');
  }
}

// 监听注册进度
window.ipcRenderer.on('registration-progress', (event, progress) => {
  const percent = Math.round((progress.current / progress.total) * 100);
  updateRegisterStats(progress.total, progress.success || 0, progress.failed || 0, percent);
  addRegisterLog(`进度: ${progress.current}/${progress.total} (${percent}%)`, 'info');
});

// 监听实时日志
window.ipcRenderer.on('registration-log', (event, log) => {
  if (log && log.message) {
    addRegisterLog(log.message, log.type || 'info');
  } else if (typeof log === 'string') {
    addRegisterLog(log, 'info');
  }
});

// ==================== 账号管理 ====================

/**
 * 计算账号到期信息
 * Pro试用期为13天
 */
function calculateExpiry(createdAt) {
  if (!createdAt) {
    return {
      expiryDate: null,
      daysLeft: null,
      isExpired: true,
      expiryText: '未知',
      expiryColor: '#999999'
    };
  }
  
  const created = new Date(createdAt);
  const now = new Date();
  const expiryDate = new Date(created);
  expiryDate.setDate(expiryDate.getDate() + 13); // 13天后到期
  
  const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
  const isExpired = daysLeft <= 0;
  
  return {
    expiryDate,
    daysLeft,
    isExpired,
    expiryText: isExpired ? t('expired') : `${t('daysLeft')}${daysLeft}${t('days')}`,
    expiryColor: isExpired ? '#e74c3c' : (daysLeft <= 3 ? '#ff9500' : '#007aff')
  };
}

// ==================== 账号管理功能 ====================
// 注意：以下函数已迁移到 js/accountManager.js
// - loadAccounts()
// - showAddAccountForm()
// - hideAddAccountForm()
// - addManualAccount()
// - deleteAccount()
// - deleteAllAccounts()
// - exportAccounts()
// - exportSingleAccount()
// - switchAccount()
// - viewAccountDetails()
// - refreshAccountInfo()
// - togglePassword()
// - copyEmailText()
// - copyPasswordText()
//
// 全局包装器在 accountManager.js 末尾定义，HTML 中的 onclick 调用会自动使用新实现
// 以下代码保留作为备份参考，实际不再使用
/*
async function loadAccounts() {
  // 此函数已迁移到 js/accountManager.js
  // 保留代码作为备份
  
  // 构造表头
  let html = `
    <div class="account-item header">
      <div class="acc-col acc-col-index">#</div>
      <div class="acc-col acc-col-email">邮箱</div>
      <div class="acc-col acc-col-password">密码</div>
      <div class="acc-col acc-col-type">类型</div>
      <div class="acc-col acc-col-credits">积分</div>
      <div class="acc-col acc-col-usage">使用率</div>
      <div class="acc-col acc-col-expiry">到期时间</div>
      <div class="acc-col acc-col-status">Token</div>
      <div class="acc-col acc-col-actions">操作</div>
    </div>
  `;
  
  html += accounts.map((acc, index) => {
    const expiry = calculateExpiry(acc.createdAt);
    
    // 获取 Token 状态
    const tokenStatus = getTokenStatus(acc);

    // 统计分类（沿用原有基于到期时间的统计逻辑）
    if (expiry.isExpired) {
      expiredCount++;
    } else if (expiry.daysLeft <= 3) {
      warningCount++;
      activeCount++;
    } else {
      activeCount++;
    }

    const expiryText = expiry.expiryDate
      ? expiry.expiryDate.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
      : '-';

    // 使用新的 Token 状态
    const tokenStatusText = tokenStatus.text;
    const tokenStatusColor = tokenStatus.color;

    const safePassword = acc.password || '';
    
    // 类型和积分（预留字段，默认为空）
    const accountType = acc.type || 'PRO';
    const accountCredits = acc.credits !== undefined ? acc.credits : '-';
    const accountUsage = acc.usage !== undefined ? acc.usage + '%' : '-';
    
    // 密码显示（默认隐藏）
    const maskedPassword = '••••••';

    return `
      <div class="account-item" data-id="${acc.id}" data-email="${acc.email}" data-password="${safePassword}">
        <div class="acc-col acc-col-index">${index + 1}</div>
        <div class="acc-col acc-col-email" onclick="copyEmailText(event)" title="点击复制: ${acc.email}">${acc.email || ''}</div>
        <div class="acc-col acc-col-password" data-password="${safePassword}">
          <span class="password-display password-masked">${maskedPassword}</span>
          <span class="password-display password-text" style="display:none;" onclick="copyPasswordText(event)" title="点击复制密码">${safePassword}</span>
          <button class="password-toggle" onclick="togglePassword(event)" title="显示/隐藏密码">
            <i data-lucide="eye" style="width: 12px; height: 12px;"></i>
          </button>
        </div>
        <div class="acc-col acc-col-type">${accountType || '-'}</div>
        <div class="acc-col acc-col-credits">${accountCredits}</div>
        <div class="acc-col acc-col-usage">${accountUsage}</div>
        <div class="acc-col acc-col-expiry">${expiryText}</div>
        <div class="acc-col acc-col-status" style="color:${tokenStatusColor};">${tokenStatusText}</div>
        <div class="acc-col acc-col-actions">
          <button class="acc-btn-icon" data-tooltip="切换账号" data-id="${acc.id}" data-email="${acc.email}" data-password="${safePassword}" onclick="switchAccount(event)">
            <i data-lucide="user" style="width: 13px; height: 13px; color: #6e6e73;"></i>
          </button>
          <button class="acc-btn-icon" data-tooltip="查看完整信息" data-account='${JSON.stringify(acc).replace(/'/g, "&apos;")}' onclick="viewAccountDetails(event)">
            <i data-lucide="eye" style="width: 13px; height: 13px; color: #6e6e73;"></i>
          </button>
          <button class="acc-btn-icon" data-tooltip="刷新积分" data-account='${JSON.stringify(acc).replace(/'/g, "&apos;")}' onclick="refreshAccountInfo(event)">
            <i data-lucide="refresh-cw" style="width: 13px; height: 13px; color: #6e6e73;"></i>
          </button>
          <button class="acc-btn-icon" data-tooltip="导出账号" data-account='${JSON.stringify(acc).replace(/'/g, "&apos;")}' onclick="exportSingleAccount(event)">
            <i data-lucide="download" style="width: 13px; height: 13px; color: #6e6e73;"></i>
          </button>
          <button class="acc-btn-icon acc-btn-danger" data-tooltip="删除账号" data-id="${acc.id}" data-email="${acc.email}" onclick="deleteAccount(event)">
            <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  listEl.innerHTML = html;
  
  // 初始化Lucide图标
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  // 更新统计信息
  document.getElementById('accountStats').style.display = 'block';
  document.getElementById('totalCount').textContent = totalCount;
  document.getElementById('activeCount').textContent = activeCount;
  document.getElementById('warningCount').textContent = warningCount;
  document.getElementById('expiredCount').textContent = expiredCount;

  // 绑定刷新按钮点击事件（保留旧的以防兼容性问题）
  Array.from(listEl.querySelectorAll('.refresh-account-btn')).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const accountData = btn.getAttribute('data-account');
      
      try {
        const account = JSON.parse(accountData.replace(/&apos;/g, "'"));
        
        // 检查是否有 refreshToken
        if (!account.refreshToken) {
          showToast('该账号缺少 Refresh Token，无法刷新', 'error');
          return;
        }
        
        // 显示加载状态
        const icon = btn.querySelector('i');
        const originalClass = icon.getAttribute('data-lucide');
        icon.setAttribute('data-lucide', 'loader-2');
        icon.style.animation = 'spin 1s linear infinite';
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
        btn.disabled = true;
        
        // 查询积分信息
        if (typeof window.AccountQuery !== 'undefined') {
          const result = await window.AccountQuery.queryAccount(account);
          
          if (result.success) {
            // 更新 UI
            const row = btn.closest('.account-item');
            const email = row.querySelector('.acc-col-email')?.textContent;
            
            // 更新订阅类型
            const typeElement = row.querySelector('.acc-col-type');
            if (typeElement) {
              typeElement.textContent = result.planName || '-';
            }
            
            // 更新积分
            const creditsElement = row.querySelector('.account-col-credits');
            if (creditsElement) {
              creditsElement.textContent = `${result.usedCredits}/${result.totalCredits}`;
              if (result.usagePercentage >= 80) {
                creditsElement.style.color = '#ff3b30';
              } else if (result.usagePercentage >= 50) {
                creditsElement.style.color = '#ff9500';
              } else {
                creditsElement.style.color = '#34c759';
              }
            }
            
            // 更新使用率
            const usageElement = row.querySelector('.account-col-usage');
            if (usageElement) {
              usageElement.textContent = `${result.usagePercentage}%`;
              if (result.usagePercentage >= 80) {
                usageElement.style.color = '#ff3b30';
              } else if (result.usagePercentage >= 50) {
                usageElement.style.color = '#ff9500';
              } else {
                usageElement.style.color = '#34c759';
              }
            }
            
            showToast('刷新成功！', 'success');
          } else {
            showToast('刷新失败：' + (result.error || '未知错误'), 'error');
          }
        } else {
          showToast('查询模块未加载', 'error');
        }
        
        // 恢复按钮状态
        icon.setAttribute('data-lucide', originalClass);
        icon.style.animation = '';
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
        btn.disabled = false;
        
      } catch (error) {
        console.error('刷新账号失败:', error);
        showToast('刷新失败：' + error.message, 'error');
        
        // 恢复按钮状态
        const icon = btn.querySelector('i');
        icon.setAttribute('data-lucide', 'refresh-cw');
        icon.style.animation = '';
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
        btn.disabled = false;
      }
    });
  });

  // 绑定右键菜单
  Array.from(listEl.querySelectorAll('.account-item:not(.header)')).forEach(row => {
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const email = row.querySelector('.acc-col-email')?.textContent;
      const account = accounts.find(acc => acc.email === email);
      if (account) {
        showAccountContextMenu(e, account);
      }
    });
  });

  // 事件处理已移至 onclick 属性，不需要额外绑定

  // 移除行点击事件（不再需要复制功能）
}
*/
// 以上 loadAccounts 函数已注释，实际使用 js/accountManager.js 中的实现

// ==================== 全局账号操作函数 ====================

// Toast 提示函数
window.showToast = function(message, type = 'info') {
  const existingToast = document.getElementById('toast');
  if (existingToast) existingToast.remove();
  
  const colors = {
    success: '#34c759',
    error: '#ff3b30',
    info: '#007aff',
    warning: '#ff9500'
  };
  
  const toastHTML = `
    <div id="toast" style="position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: ${colors[type]}; color: white; padding: 12px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10001; font-size: 14px; font-weight: 500; animation: slideDown 0.3s ease;">
      ${message}
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', toastHTML);
  
  setTimeout(() => {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.style.animation = 'slideUp 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }
  }, 2000);
};

// 账号详情弹窗函数
window.showAccountDetailsModal = async function(account) {
  // 查询最新的积分信息
  let usageInfo = null;
  if (account.refreshToken && typeof window.AccountQuery !== 'undefined') {
    try {
      usageInfo = await window.AccountQuery.queryAccount(account);
    } catch (error) {
      console.error('查询积分失败:', error);
    }
  }
  
  const modalHTML = `
    <div class="modal-overlay" id="accountDetailsModal" onclick="if(event.target===this) this.remove()">
      <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
        <div class="modal-header">
          <h2 style="margin: 0; font-size: 20px;">账号详情</h2>
          <button class="modal-close" onclick="document.getElementById('accountDetailsModal').remove()">
            <i data-lucide="x" style="width: 20px; height: 20px;"></i>
          </button>
        </div>
        <div class="modal-body" style="padding: 24px;">
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div class="detail-section">
              <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #1d1d1f;">基本信息</h3>
              <div class="detail-grid">
                <div class="detail-item"><span class="detail-label">邮箱:</span><span class="detail-value">${account.email || '-'}</span></div>
                <div class="detail-item"><span class="detail-label">密码:</span><span class="detail-value">${account.password || '-'}</span></div>
                <div class="detail-item"><span class="detail-label">姓名:</span><span class="detail-value">${account.name || account.firstName + ' ' + account.lastName || '-'}</span></div>
                <div class="detail-item"><span class="detail-label">创建时间:</span><span class="detail-value">${account.createdAt ? new Date(account.createdAt).toLocaleString('zh-CN') : '-'}</span></div>
              </div>
            </div>
            
            ${usageInfo && usageInfo.success ? `
            <div class="detail-section">
              <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #1d1d1f;">订阅信息</h3>
              <div class="detail-grid">
                <div class="detail-item"><span class="detail-label">订阅类型:</span><span class="detail-value" style="color: ${usageInfo.planName === 'Pro' ? '#007aff' : '#86868b'};">${usageInfo.planName}</span></div>
                <div class="detail-item"><span class="detail-label">已用积分:</span><span class="detail-value">${usageInfo.usedCredits}</span></div>
                <div class="detail-item"><span class="detail-label">总积分:</span><span class="detail-value">${usageInfo.totalCredits}</span></div>
                <div class="detail-item"><span class="detail-label">使用率:</span><span class="detail-value" style="color: ${usageInfo.usagePercentage >= 80 ? '#ff3b30' : usageInfo.usagePercentage >= 50 ? '#ff9500' : '#34c759'};">${usageInfo.usagePercentage}%</span></div>
              </div>
            </div>
            ` : ''}
            
            ${account.apiKey ? `
            <div class="detail-section">
              <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #1d1d1f;">API 信息</h3>
              <div class="detail-grid">
                <div class="detail-item" style="grid-column: 1 / -1;"><span class="detail-label">API Key:</span><span class="detail-value" style="font-family: monospace; font-size: 12px; word-break: break-all;">${account.apiKey}</span></div>
                <div class="detail-item" style="grid-column: 1 / -1;"><span class="detail-label">API Server:</span><span class="detail-value" style="font-size: 12px;">${account.apiServerUrl || '-'}</span></div>
                <div class="detail-item" style="grid-column: 1 / -1;"><span class="detail-label">Refresh Token:</span><span class="detail-value" style="font-family: monospace; font-size: 12px; word-break: break-all;">${account.refreshToken || '-'}</span></div>
              </div>
            </div>
            ` : ''}
            
            <div class="detail-section">
              <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #1d1d1f;">完整 JSON 数据</h3>
              <pre style="background: #f5f5f7; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; margin: 0;">${JSON.stringify(account, null, 2)}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
};

// 查看账号详情
window.viewAccountDetails = function(event) {
  event.stopPropagation();
  const accountData = event.currentTarget.getAttribute('data-account');
  console.log('查看详情被点击，账号数据:', accountData);
  
  if (!accountData) {
    console.error('无法获取账号数据');
    showCustomAlert('无法获取账号信息', 'error');
    return;
  }
  
  try {
    const account = JSON.parse(accountData.replace(/&apos;/g, "'"));
    console.log('解析后的账号:', account);
    
    if (typeof showAccountDetailsModal === 'function') {
      showAccountDetailsModal(account);
    } else {
      console.error('showAccountDetailsModal 函数未定义');
      showCustomAlert('查看详情功能未加载', 'error');
    }
  } catch (error) {
    console.error('解析账号数据失败:', error);
    showCustomAlert('解析账号数据失败: ' + error.message, 'error');
  }
};

// 刷新账号信息
window.refreshAccountInfo = async function(event) {
  event.stopPropagation();
  const btn = event.currentTarget;
  const accountData = btn.getAttribute('data-account');
  if (!accountData) return;
  
  const account = JSON.parse(accountData);
  
  // 显示加载状态
  btn.disabled = true;
  const icon = btn.querySelector('i');
  if (icon) {
    icon.style.animation = 'spin 1s linear infinite';
  }
  
  try {
    const result = await window.ipcRenderer.invoke('refresh-account-credits', account);
    if (result.success) {
      // 更新 UI
      const row = btn.closest('.account-item');
      const email = row.querySelector('.acc-col-email')?.textContent;
      
      // 更新订阅类型
      const typeEl = row.querySelector('.acc-col-type');
      if (typeEl && result.subscriptionType) {
        typeEl.textContent = result.subscriptionType;
      }
      
      // 更新积分
      const creditsEl = row.querySelector('.acc-col-credits');
      if (creditsEl && result.credits !== undefined) {
        creditsEl.textContent = result.credits;
      }
      
      // 更新使用率
      const usageEl = row.querySelector('.acc-col-usage');
      if (usageEl && result.usage !== undefined) {
        usageEl.textContent = result.usage + '%';
      }
      
      showCustomAlert(`账号信息刷新成功！\n\n订阅类型: ${result.subscriptionType || '-'}\n积分: ${result.credits || '-'}\n使用率: ${result.usage || '-'}%`, 'success');
    } else {
      showCustomAlert('刷新失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('刷新账号信息失败:', error);
    showCustomAlert('刷新失败: ' + error.message, 'error');
  } finally {
    if (icon) {
      icon.style.animation = '';
    }
    btn.disabled = false;
  }
};

// 切换账号
window.switchAccount = async function(event) {
  event.stopPropagation();
  const btn = event.currentTarget;
  const email = btn.getAttribute('data-email');
  const password = btn.getAttribute('data-password');
  
  const shouldContinue = await showCustomConfirm(
    `确定切换到账号：${email} 吗？\n\n这将自动登录到 Windsurf 并使用该账号。`,
    '切换账号'
  );
  
  if (!shouldContinue) return;
  
  try {
    const result = await window.ipcRenderer.invoke('switch-account', { email, password });
    if (result.success) {
      showCustomAlert(`切换成功！\n已切换到账号：${email}`, 'success');
    } else {
      showCustomAlert(`切换失败：${result.error || '未知错误'}`, 'error');
    }
  } catch (error) {
    console.error('切换账号失败:', error);
    showCustomAlert(`切换失败：${error.message}`, 'error');
  }
};

// 导出单个账号 - JSON 格式，包含完整信息
window.exportSingleAccount = async function(event) {
  event.stopPropagation();
  const btn = event.currentTarget;
  const accountData = btn.getAttribute('data-account');
  
  if (!accountData) {
    showCustomAlert('无法获取账号信息', 'error');
    return;
  }
  
  try {
    // 解析账号数据
    const account = JSON.parse(accountData.replace(/&apos;/g, "'"));
    
    // 准备导出数据（JSON 格式，包含所有信息）
    const exportData = {
      id: account.id,
      email: account.email,
      password: account.password,
      apiKey: account.apiKey || '',
      type: account.type || '',
      credits: account.credits,
      usage: account.usage,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      tokenUpdatedAt: account.tokenUpdatedAt,
      refreshToken: account.refreshToken || '',
      accessToken: account.accessToken || ''
    };
    
    // 转换为 JSON 字符串
    const content = JSON.stringify(exportData, null, 2);
    
    // 生成安全的文件名（移除所有不安全字符，兼容 Windows 和 macOS）
    const safeEmail = account.email
      .replace(/[<>:"\/\\|?*]/g, '_')  // 移除 Windows 不允许的字符
      .replace(/@/g, '_at_')            // 替换 @ 符号
      .replace(/\./g, '_');             // 替换点号
    
    const filename = `${safeEmail}.json`;
    
    console.log(`📤 导出单个账号 (JSON): ${account.email}, 文件名: ${filename}`);
    
    const result = await window.ipcRenderer.invoke('save-file', {
      content: content,
      filename: filename,
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    
    if (result.success) {
      console.log(`✅ 账号导出成功: ${result.filePath}`);
      showCustomAlert(`账号导出成功！\n\n文件已保存到：\n${result.filePath}`, 'success');
    } else if (result.error !== '用户取消了保存操作') {
      console.error('导出失败:', result.error);
      showCustomAlert('导出失败: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('导出账号失败:', error);
    showCustomAlert('导出失败: ' + error.message, 'error');
  }
};

// 删除账号
window.deleteAccount = async function(event) {
  event.stopPropagation();
  const btn = event.currentTarget;
  const id = btn.getAttribute('data-id');
  const email = btn.getAttribute('data-email');
  
  const shouldContinue = await showCustomConfirm(
    `确定删除账号：${email} 吗？`,
    '删除账号'
  );
  
  if (!shouldContinue) return;
  
  const result = await window.ipcRenderer.invoke('delete-account', id);
  if (result.success) {
    loadAccounts();
    showCustomAlert('账号删除成功！', 'success');
  } else {
    showCustomAlert(t('deleteFailed') + ': ' + result.error, 'error');
  }
}

/* 以下函数已迁移到 js/accountManager.js
function showAddAccountForm() {
  const modal = document.getElementById('addAccountModal');
  if (modal) {
    modal.classList.add('active');
    // 初始化Lucide图标
    setTimeout(() => {
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }, 0);
  }
}

function hideAddAccountForm() {
  const modal = document.getElementById('addAccountModal');
  if (modal) modal.classList.remove('active');
  
  // 清空输入框（安全检查）
  const emailInput = document.getElementById('manualEmail');
  const passwordInput = document.getElementById('manualPassword');
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
}

async function addManualAccount() {
  const email = document.getElementById('manualEmail').value;
  const password = document.getElementById('manualPassword').value;
  
  if (!email || !password) {
    alert(t('pleaseCompleteInfo'));
    return;
  }
  
  const result = await window.ipcRenderer.invoke('add-account', { email, password });
  
  if (result.success) {
    alert(t('addSuccess'));
    hideAddAccountForm();
    loadAccounts();
  } else {
    alert(t('addFailed') + ': ' + result.error);
  }
}
*/

// ==================== 导入账号 ====================

async function showImportAccountForm() {
  // 创建自定义弹窗显示格式说明
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog modern-modal';
  dialog.style.maxWidth = '600px';
  
  dialog.innerHTML = `
    <div class="modern-modal-header">
      <div class="modal-title-row">
        <i data-lucide="upload" style="width: 24px; height: 24px; color: #007aff;"></i>
        <h3 class="modal-title">导入账号</h3>
      </div>
      <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()">
        <i data-lucide="x" style="width: 20px; height: 20px;"></i>
      </button>
    </div>
    <div class="modern-modal-body">
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 14px; font-weight: 600; color: #1d1d1f; margin-bottom: 12px;">导入账号格式说明：</h4>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #1d1d1f; line-height: 1.8;">
          <li style="display: flex; align-items: flex-start; margin-bottom: 8px;">
            <span style="color: #007aff; margin-right: 8px;">•</span>
            <span>仅支持 JSON 格式文件 (.json)</span>
          </li>
          <li style="display: flex; align-items: flex-start; margin-bottom: 8px;">
            <span style="color: #007aff; margin-right: 8px;">•</span>
            <span>JSON 根节点必须为数组</span>
          </li>
          <li style="display: flex; align-items: flex-start; margin-bottom: 8px;">
            <span style="color: #007aff; margin-right: 8px;">•</span>
            <span>每个账号对象需包含以下字段：</span>
          </li>
          <li style="padding-left: 24px; margin-bottom: 4px; font-size: 12px; color: #6e6e73;">
            - email: 邮箱地址（必填）
          </li>
          <li style="padding-left: 24px; margin-bottom: 4px; font-size: 12px; color: #6e6e73;">
            - password: 密码（必填）
          </li>
          <li style="padding-left: 24px; margin-bottom: 4px; font-size: 12px; color: #6e6e73;">
            - apiKey: Token（可选）
          </li>
        </ul>
      </div>
      
      <div style="background: #f5f5f7; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <div style="font-size: 12px; font-weight: 600; color: #6e6e73; margin-bottom: 8px;">示例格式：</div>
        <pre style="background: #ffffff; border: 1px solid #e5e5ea; border-radius: 6px; padding: 12px; margin: 0; font-size: 12px; color: #1d1d1f; overflow-x: auto; font-family: 'Monaco', 'Menlo', monospace;">[
  {
    "email": "user@example.com",
    "password": "password123",
    "apiKey": "token_here"
  }
]</pre>
      </div>
      
      <div class="form-tip" style="background: #e3f2fd; border-color: #90caf9; color: #1976d2;">
        <i data-lucide="info" style="width: 16px; height: 16px; flex-shrink: 0;"></i>
        <span>点击确定后将打开文件选择器，请选择要导入的 JSON 文件</span>
      </div>
    </div>
    <div class="modern-modal-footer">
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
        <i data-lucide="x" style="width: 16px; height: 16px;"></i>
        取消
      </button>
      <button class="btn btn-primary" id="confirmImportBtn">
        <i data-lucide="check" style="width: 16px; height: 16px;"></i>
        确定
      </button>
    </div>
  `;
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  // 初始化图标
  if (window.lucide) {
    lucide.createIcons();
  }
  
  // 确定按钮事件
  document.getElementById('confirmImportBtn').onclick = () => {
    overlay.remove();
    selectImportFile();
  };
  
  // 点击遮罩关闭
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  };
}

function selectImportFile() {
  // 创建隐藏的文件选择input（跨平台兼容）
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  
  fileInput.onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // 验证文件类型
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.json')) {
      showCustomAlert('请选择 JSON 格式文件（.json）', 'error');
      return;
    }
    
    // 验证文件大小（限制为 10MB）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      showCustomAlert('文件过大，请选择小于 10MB 的文件', 'error');
      return;
    }
    
    // 读取文件内容（使用 UTF-8 编码，兼容 Windows 和 macOS）
    const reader = new FileReader();
    
    reader.onerror = function() {
      showCustomAlert('文件读取失败，请检查文件是否损坏或权限是否正确', 'error');
    };
    
    reader.onload = async function(e) {
      try {
        const content = e.target.result;
        await processImportFile(content, file.name);
      } catch (error) {
        console.error('处理文件失败:', error);
        showCustomAlert(`处理文件失败: ${error.message}`, 'error');
      }
    };
    
    // 使用 UTF-8 编码读取（跨平台兼容）
    reader.readAsText(file, 'utf-8');
  };
  
  document.body.appendChild(fileInput);
  fileInput.click();
  document.body.removeChild(fileInput);
}

async function processImportFile(content, filename = 'unknown') {
  
  if (!content || content.trim() === '') {
    showCustomAlert('文件内容为空，请选择有效的 JSON 文件！', 'error');
    return;
  }
  
  console.log(`📥 开始处理导入文件: ${filename}`);
  
  // 解析 JSON 格式账号
  const accounts = [];
  const errors = [];
  let parsed;
  
  try {
    // 移除 BOM 标记（如果存在，兼容 Windows 记事本保存的文件）
    const cleanContent = content.replace(/^\uFEFF/, '');
    parsed = JSON.parse(cleanContent);
  } catch (e) {
    console.error('JSON 解析错误:', e);
    showCustomAlert(`JSON 格式错误，无法解析账号数据！\n\n错误详情: ${e.message}`, 'error');
    return;
  }
  
  if (!Array.isArray(parsed)) {
    showCustomAlert('JSON 格式不正确，根节点必须是数组！\n\n请确保文件格式为: [{ "email": "...", "password": "..." }]', 'error');
    return;
  }
  
  parsed.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`第 ${index + 1} 条记录格式错误：不是对象`);
      return;
    }
    
    const email = (item.email || '').trim();
    const password = (item.password || '').toString();
    const apiKey = item.apiKey || item.token || item.accessToken || '';
    
    if (!email) {
      errors.push(`第 ${index + 1} 条记录缺少邮箱字段`);
      return;
    }
    
    if (!email.includes('@')) {
      errors.push(`第 ${index + 1} 条记录邮箱格式错误：${email}`);
      return;
    }
    
    accounts.push({ email, password, apiKey });
  });
  
  if (accounts.length === 0) {
    showCustomAlert('没有有效的账号数据！', 'error');
    return;
  }
  
  // 获取现有账号列表进行重复检测
  const existingAccountsResult = await window.ipcRenderer.invoke('get-accounts');
  const existingEmails = new Set();
  
  if (existingAccountsResult.success && existingAccountsResult.accounts) {
    existingAccountsResult.accounts.forEach(acc => {
      existingEmails.add(acc.email.toLowerCase());
    });
  }
  
  // 检测重复账号
  const duplicateAccounts = [];
  const newAccounts = [];
  
  accounts.forEach(account => {
    if (existingEmails.has(account.email.toLowerCase())) {
      duplicateAccounts.push(account.email);
    } else {
      newAccounts.push(account);
    }
  });
  
  // 显示确认信息
  let confirmMsg = '';
  if (newAccounts.length > 0) {
    confirmMsg += `准备导入 ${newAccounts.length} 个新账号`;
  }
  
  if (duplicateAccounts.length > 0) {
    confirmMsg += `\n跳过 ${duplicateAccounts.length} 个重复账号：\n`;
    confirmMsg += duplicateAccounts.slice(0, 5).join('\n');
    if (duplicateAccounts.length > 5) {
      confirmMsg += `\n... 还有 ${duplicateAccounts.length - 5} 个`;
    }
  }
  
  if (errors.length > 0) {
    confirmMsg += `\n跳过 ${errors.length} 个格式错误行`;
  }
  
  if (newAccounts.length === 0) {
    showCustomAlert('没有新账号需要导入！所有账号都已存在。', 'warning');
    return;
  }
  
  confirmMsg += '\n\n确定要导入吗？';
  
  const shouldContinue = await showCustomConfirm(confirmMsg, '确认导入');
  if (!shouldContinue) return;
  
  // 更新要导入的账号列表（只导入新账号）
  const accountsToImport = newAccounts;
  
  // 批量导入
  let successCount = 0;
  let failCount = 0;
  const failDetails = [];
  
  for (const account of accountsToImport) {
    const result = await window.ipcRenderer.invoke('add-account', account);
    if (result.success) {
      successCount++;
    } else {
      failCount++;
      failDetails.push(`${account.email}: ${result.error}`);
    }
  }
  
  // 显示结果
  let resultMsg = `导入完成！\n\n`;
  resultMsg += `✓ 成功导入: ${successCount} 个\n`;
  
  if (failCount > 0) {
    resultMsg += `✗ 导入失败: ${failCount} 个\n`;
  }
  
  if (duplicateAccounts.length > 0) {
    resultMsg += `⊘ 跳过重复: ${duplicateAccounts.length} 个\n`;
  }
  
  if (errors.length > 0) {
    resultMsg += `⚠ 格式错误: ${errors.length} 行\n`;
  }
  
  if (failDetails.length > 0 && failDetails.length <= 5) {
    resultMsg += `\n失败详情:\n`;
    failDetails.forEach(detail => {
      resultMsg += `• ${detail}\n`;
    });
  }
  
  showImportResultDialog(resultMsg, successCount, failCount, duplicateAccounts.length, errors.length);
  
  // 刷新账号列表
  if (successCount > 0) {
    loadAccounts();
  }
}

function showImportResultDialog(message, successCount, failCount, duplicateCount, errorCount) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog modern-modal';
  dialog.style.maxWidth = '500px';
  
  let iconHtml = '';
  let iconColor = '';
  let titleText = '';
  
  if (failCount === 0 && errorCount === 0 && duplicateCount === 0) {
    iconHtml = '<i data-lucide="check-circle" style="width: 48px; height: 48px; color: #34c759;"></i>';
    titleText = '导入成功';
  } else if (successCount > 0) {
    iconHtml = '<i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #ff9500;"></i>';
    titleText = '导入完成（部分成功）';
  } else {
    iconHtml = '<i data-lucide="x-circle" style="width: 48px; height: 48px; color: #ff3b30;"></i>';
    titleText = '导入失败';
  }
  
  dialog.innerHTML = `
    <div class="modern-modal-header">
      <div class="modal-title-row">
        ${iconHtml}
        <h3 class="modal-title">${titleText}</h3>
      </div>
      <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()">
        <i data-lucide="x" style="width: 20px; height: 20px;"></i>
      </button>
    </div>
    <div class="modern-modal-body">
      <div style="white-space: pre-line; font-size: 13px; line-height: 1.8; color: #1d1d1f;">${message}</div>
    </div>
    <div class="modern-modal-footer">
      <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">
        <i data-lucide="check" style="width: 16px; height: 16px;"></i>
        确定
      </button>
    </div>
  `;
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  // 初始化图标
  if (window.lucide) {
    lucide.createIcons();
  }
  
  // 点击遮罩关闭
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  };
}

function showCustomAlert(message, type = 'info') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog modern-modal';
  dialog.style.maxWidth = '400px';
  
  let iconHtml = '';
  let titleText = '';
  
  switch(type) {
    case 'success':
      iconHtml = '<i data-lucide="check-circle" style="width: 24px; height: 24px; color: #34c759;"></i>';
      titleText = '成功';
      break;
    case 'error':
      iconHtml = '<i data-lucide="x-circle" style="width: 24px; height: 24px; color: #ff3b30;"></i>';
      titleText = '错误';
      break;
    case 'warning':
      iconHtml = '<i data-lucide="alert-triangle" style="width: 24px; height: 24px; color: #ff9500;"></i>';
      titleText = '警告';
      break;
    default:
      iconHtml = '<i data-lucide="info" style="width: 24px; height: 24px; color: #007aff;"></i>';
      titleText = '提示';
  }
  
  dialog.innerHTML = `
    <div class="modern-modal-header">
      <div class="modal-title-row">
        ${iconHtml}
        <h3 class="modal-title">${titleText}</h3>
      </div>
      <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()">
        <i data-lucide="x" style="width: 20px; height: 20px;"></i>
      </button>
    </div>
    <div class="modern-modal-body">
      <div style="font-size: 13px; line-height: 1.6; color: #1d1d1f;">${message}</div>
    </div>
    <div class="modern-modal-footer">
      <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">
        <i data-lucide="check" style="width: 16px; height: 16px;"></i>
        确定
      </button>
    </div>
  `;
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  // 初始化图标
  if (window.lucide) {
    lucide.createIcons();
  }
  
  // 点击遮罩关闭
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  };
}

function showCustomConfirm(message, title = '确认') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog modern-modal';
    dialog.style.maxWidth = '450px';
    
    dialog.innerHTML = `
      <div class="modern-modal-header">
        <div class="modal-title-row">
          <i data-lucide="help-circle" style="width: 24px; height: 24px; color: #007aff;"></i>
          <h3 class="modal-title">${title}</h3>
        </div>
        <button class="modal-close-btn" id="confirmCloseBtn">
          <i data-lucide="x" style="width: 20px; height: 20px;"></i>
        </button>
      </div>
      <div class="modern-modal-body">
        <div style="white-space: pre-line; font-size: 13px; line-height: 1.6; color: #1d1d1f;">${message}</div>
      </div>
      <div class="modern-modal-footer">
        <button class="btn btn-secondary" id="confirmCancelBtn">
          <i data-lucide="x" style="width: 16px; height: 16px;"></i>
          取消
        </button>
        <button class="btn btn-primary" id="confirmOkBtn">
          <i data-lucide="check" style="width: 16px; height: 16px;"></i>
          确定
        </button>
      </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // 初始化图标
    if (window.lucide) {
      lucide.createIcons();
    }
    
    const cleanup = () => {
      overlay.remove();
    };
    
    // 确定按钮
    document.getElementById('confirmOkBtn').onclick = () => {
      cleanup();
      resolve(true);
    };
    
    // 取消按钮
    document.getElementById('confirmCancelBtn').onclick = () => {
      cleanup();
      resolve(false);
    };
    
    // 关闭按钮
    document.getElementById('confirmCloseBtn').onclick = () => {
      cleanup();
      resolve(false);
    };
    
    // 点击遮罩关闭
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    };
  });
}

// ==================== 账号选择功能 ====================

function updateSelectedAccounts() {
  // 选中框功能已移除，此函数保留为空以避免错误
}

function selectAllAccounts() {
  // 选中框功能已移除，此函数保留为空以避免错误
}

function deselectAllAccounts() {
  // 选中框功能已移除，此函数保留为空以避免错误
}

// ==================== 导出账号 ====================
// 注意：exportAccounts 和 exportSingleAccount 已迁移到 js/accountManager.js
// 以下代码保留作为备份，实际使用新实现（导出为 JSON 格式）

/* 旧的导出实现（已废弃）
async function exportAccounts() {
  try {
    // 获取所有账号
    const result = await window.ipcRenderer.invoke('get-accounts');
    if (!result.success) {
      showCustomAlert('获取账号列表失败！', 'error');
      return;
    }
    
    const accounts = result.accounts || [];
    
    if (accounts.length === 0) {
      showCustomAlert('没有可导出的账号！', 'warning');
      return;
    }
    
    // 准备导出数据（包含所有完整信息）
    const exportData = accounts.map(account => ({
      id: account.id,
      email: account.email,
      password: account.password,
      apiKey: account.apiKey || '',
      type: account.type || '',
      credits: account.credits,
      usage: account.usage,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      tokenUpdatedAt: account.tokenUpdatedAt,
      refreshToken: account.refreshToken || '',
      accessToken: account.accessToken || ''
    }));
    
    // 使用标准 JSON 格式（跨平台兼容）
    const content = JSON.stringify(exportData, null, 2);
    
    // 生成文件名（移除特殊字符，兼容 Windows 和 macOS）
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    
    // 文件名格式: Windsurf_Accounts_YYYYMMDD_HHMMSS.json（避免使用中文和特殊字符）
    const filename = `Windsurf_Accounts_${year}${month}${day}_${hour}${minute}${second}.json`;
    
    console.log(`📤 准备导出 ${accounts.length} 个账号，文件名: ${filename}`);
    
    // 使用Electron的dialog保存文件（跨平台兼容）
    const saveResult = await window.ipcRenderer.invoke('save-file', {
      content: content,
      filename: filename,
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    
    if (saveResult.success) {
      console.log(`✅ 导出成功: ${saveResult.filePath}`);
      showCustomAlert(
        `导出成功！\n\n共导出 ${accounts.length} 个账号\n文件已保存到：\n${saveResult.filePath}`,
        'success'
      );
    } else {
      if (saveResult.error !== '用户取消了保存操作') {
        console.error('导出失败:', saveResult.error);
        showCustomAlert(`导出失败：${saveResult.error}`, 'error');
      }
    }
  } catch (error) {
    console.error('导出账号失败:', error);
    showCustomAlert(`导出失败：${error.message}`, 'error');
  }
}

async function deleteAccount(id) {
  if (!confirm('确定要删除这个账号吗？')) return;
  
  const result = await window.ipcRenderer.invoke('delete-account', id);
  
  if (result.success) {
    loadAccounts();
  } else {
    alert(t('deleteFailed') + ': ' + result.error);
  }
}

async function deleteAllAccounts() {
  // 首先获取所有账号数量
  const result = await window.ipcRenderer.invoke('load-accounts');
  
  if (!result.success || !result.accounts || result.accounts.length === 0) {
    alert('没有账号可删除');
    return;
  }
  
  const accountCount = result.accounts.length;
  
  // 二次确认
  const confirmMessage = `⚠️ 警告：即将删除全部 ${accountCount} 个账号！\n\n此操作不可撤销，确定要继续吗？`;
  if (!confirm(confirmMessage)) {
    return;
  }
  
  // 三次确认（安全措施）
  const finalConfirm = confirm(`最后确认：真的要删除全部 ${accountCount} 个账号吗？\n\n点击"确定"将永久删除所有账号数据。`);
  if (!finalConfirm) {
    return;
  }
  
  try {
    // 调用删除全部账号的 IPC
    const deleteResult = await window.ipcRenderer.invoke('delete-all-accounts');
    
    if (deleteResult.success) {
      alert(`✅ 成功删除了 ${accountCount} 个账号`);
      loadAccounts(); // 刷新列表
    } else {
      alert('删除失败：' + deleteResult.error);
    }
  } catch (error) {
    alert('删除失败：' + error.message);
  }
}
*/
// 以上 exportAccounts 和 deleteAllAccounts 已注释，实际使用 js/accountManager.js 中的实现

function toggleDeleteMode() {
  deleteMode = !deleteMode;
  const btn = document.getElementById('deleteModeBtn');
  if (btn) {
    btn.textContent = deleteMode ? t('deleteModeOn') : t('deleteModeOff');
    btn.className = deleteMode ? 'btn btn-danger' : 'btn btn-warning';
    btn.setAttribute('data-i18n', deleteMode ? 'deleteModeOn' : 'deleteModeOff');
  }
}

function copyAccount(email, password) {
  const text = `${t('email')}: ${email}\n${t('password')}: ${password}`;
  
  // 尝试多种复制方法以确保跨平台兼容性
  if (navigator.clipboard && navigator.clipboard.writeText) {
    // 现代浏览器方法
    navigator.clipboard.writeText(text).then(() => {
      alert(t('accountCopied'));
    }).catch(() => {
      // 如果现代方法失败，使用备用方法
      fallbackCopyToClipboard(text);
    });
  } else {
    // 备用方法
    fallbackCopyToClipboard(text);
  }
}

function fallbackCopyToClipboard(text) {
  try {
    // 创建临时文本区域
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    
    // 选择并复制
    textArea.focus();
    textArea.select();
    
    // 尝试使用execCommand (兼容老版本)
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (successful) {
      alert(t('accountCopied'));
    } else {
      // 如果都失败了，使用Electron的clipboard API
      copyWithElectron(text);
    }
  } catch (err) {
    console.error('复制失败:', err);
    copyWithElectron(text);
  }
}

async function copyWithElectron(text) {
  try {
    // 使用Electron的clipboard API
    const result = await window.ipcRenderer.invoke('copy-to-clipboard', text);
    if (result.success) {
      alert(t('accountCopied'));
    } else {
      // 最后的备用方案：显示文本让用户手动复制
      showManualCopyDialog(text);
    }
  } catch (err) {
    console.error('Electron复制失败:', err);
    showManualCopyDialog(text);
  }
}

function showManualCopyDialog(text) {
  // 创建一个模态框显示文本，让用户手动复制
  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">复制账号信息</div>
      <div style="margin: 16px 0;">
        <p style="margin-bottom: 12px; color: #86868b; font-size: 12px;">
          自动复制失败，请手动选择并复制以下内容：
        </p>
        <textarea readonly style="width: 100%; height: 80px; font-family: monospace; font-size: 12px; padding: 8px; border: 1px solid #d2d2d7; border-radius: 6px; resize: none;">${text}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">确定</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 自动选择文本
  const textarea = modal.querySelector('textarea');
  setTimeout(() => {
    textarea.focus();
    textarea.select();
  }, 100);
}

// ==================== 切换账号 ====================

async function loadAccountsForSwitch() {
  const result = await window.ipcRenderer.invoke('get-accounts');
  const accounts = result.success ? (result.accounts || []) : [];
  switchAccountsCache = accounts;

  // 初始不选择
  selectedSwitchAccountId = '';
  const selectedEl = document.getElementById('selectedSwitchAccount');
  if (selectedEl) selectedEl.textContent = '未选择账号';

  // 渲染网格
  renderSwitchAccountsGrid();
  renderUsedAccountsGrid();

  // 检测Windsurf配置路径
  await detectWindsurfPaths();
}

// 检测Windsurf配置路径
async function detectWindsurfPaths() {
  const paths = await window.ipcRenderer.invoke('detect-windsurf-paths');
  
  let html = '<div style="margin-top:20px; padding:15px; background:#f9f9f9; border-radius:6px;">';
  html += '<h4>Windsurf配置路径检测</h4>';
  html += '<div style="font-size:12px; margin-top:10px;">';
  
  for (const key in paths) {
    const item = paths[key];
    const status = item.exists ? '✓' : '✗';
    const color = item.exists ? '#27ae60' : '#999';
    html += `<div style="margin:5px 0; color:${color};">${status} ${key}: ${item.path}</div>`;
  }
  
  html += '</div></div>';
  
  const statusEl = document.getElementById('switchStatus');
  if (statusEl.innerHTML === '') {
    statusEl.innerHTML = html;
  }
}

// 监听切换进度
window.ipcRenderer.on('switch-progress', (event, progress) => {
  const statusEl = document.getElementById('switchStatus');
  const logDiv = statusEl.querySelector('.log-container');
  
  if (logDiv) {
    // 如果已有日志容器，只更新进度
    const progressDiv = statusEl.querySelector('.progress-info');
    if (progressDiv) {
      progressDiv.innerHTML = `<strong>步骤 ${progress.step}/5:</strong> ${progress.message}`;
    }
  } else {
    // 首次显示，创建完整结构
    statusEl.innerHTML = `
      <div class="status-message status-info">
        <div class="progress-info">
          <strong>步骤 ${progress.step}/5:</strong> ${progress.message}
        </div>
        <div class="log-container" style="margin-top:15px; max-height:600px; overflow-y:auto; background:#f5f5f5; padding:10px; border-radius:4px; font-family:monospace; font-size:12px; line-height:1.6;">
          <div class="log-content"></div>
        </div>
      </div>
    `;
  }
});

// 监听实时日志
window.ipcRenderer.on('switch-log', (event, log) => {
  const statusEl = document.getElementById('switchStatus');
  let logContent = statusEl.querySelector('.log-content');
  
  if (!logContent) {
    // 如果没有日志容器，创建一个
    statusEl.innerHTML = `
      <div class="status-message status-info">
        <div class="log-container" style="max-height:600px; overflow-y:auto; background:#f5f5f5; padding:10px; border-radius:4px; font-family:monospace; font-size:12px; line-height:1.6;">
          <div class="log-content"></div>
        </div>
      </div>
    `;
    logContent = statusEl.querySelector('.log-content');
  }
  
  // 添加日志
  const logLine = document.createElement('div');
  logLine.textContent = log;
  logLine.style.marginBottom = '2px';
  
  // 根据日志内容设置颜色
  if (log.includes('✓') || log.includes('✅') || log.includes('成功')) {
    logLine.style.color = '#27ae60';
  } else if (log.includes('✗') || log.includes('❌') || log.includes('失败') || log.includes('错误')) {
    logLine.style.color = '#e74c3c';
  } else if (log.includes('⚠️') || log.includes('警告')) {
    logLine.style.color = '#f39c12';
  } else if (log.includes('步骤') || log.includes('【') || log.includes('=====')) {
    logLine.style.color = '#3498db';
    logLine.style.fontWeight = 'bold';
  } else if (log.includes('💡')) {
    logLine.style.color = '#f39c12';
  }
  
  logContent.appendChild(logLine);
  
  // 自动滚动到底部
  const logContainer = logContent.parentElement;
  if (logContainer) {
    logContainer.scrollTop = logContainer.scrollHeight;
  }
});

// 监听错误
window.ipcRenderer.on('switch-error', (event, error) => {
  console.error('收到切换错误:', error);
  const statusEl = document.getElementById('switchStatus');
  if (statusEl) {
    statusEl.innerHTML = `
      <div class="status-message status-error">
        <strong>切换失败：</strong>${error.message}<br><br>
        <details>
          <summary>查看详细错误信息</summary>
          <pre style="margin-top:10px; padding:10px; background:#f5f5f5; border-radius:4px; overflow-x:auto;">${error.stack || error.message}</pre>
        </details>
      </div>
    `;
  }
});

async function switchAccount() {
  const accountId = selectedSwitchAccountId;
  
  if (!accountId) {
    alert(t('pleaseSelectAccount'));
    return;
  }
  
  if (!confirm(t('confirmSwitch'))) return;
  
  const accountsResult = await window.ipcRenderer.invoke('get-accounts');
  const accounts = accountsResult.success ? (accountsResult.accounts || []) : [];
  const account = accounts.find(acc => acc.id === accountId);
  
  const result = await window.ipcRenderer.invoke('switch-account', account);
  
  const statusEl = document.getElementById('switchStatus');
  if (result.success) {
    // 标记为已使用
    markAccountUsed(accountId);
    // 刷新当前登录账号显示
    await getCurrentAccount();
    statusEl.innerHTML = `
      <div class="status-message status-success">
        <strong>切换成功！</strong><br>
        ${result.message}<br><br>
        <strong>账号信息：</strong><br>
        邮箱: ${result.account.email}<br>
        密码: ${result.account.password}
      </div>
    `;
  } else {
    statusEl.innerHTML = `
      <div class="status-message status-error">
        <strong>切换失败：</strong>${result.error}
      </div>
    `;
  }
}


// 加载当前机器ID
async function loadCurrentMachineId() {
  const machineIdEl = document.getElementById('currentMachineId');
  
  if (!machineIdEl) return;
  
  try {
    const result = await window.ipcRenderer.invoke('get-machine-id');
    
    if (result.success) {
      machineIdEl.innerHTML = `
        <div style="margin-bottom:8px;">
          <strong style="color:#6e6e73;">Device ID:</strong> 
          <span style="color:#007aff;">${result.devDeviceId}</span>
        </div>
        <div style="margin-bottom:8px;">
          <strong style="color:#6e6e73;">SQM ID:</strong> 
          <span style="color:#007aff;">${result.sqmId}</span>
        </div>
        <div>
          <strong style="color:#6e6e73;">Machine ID:</strong> 
          <span style="color:#007aff; word-break:break-all;">${result.machineId}</span>
        </div>
      `;
    } else {
      machineIdEl.textContent = result.machineId || '未安装或未配置';
      machineIdEl.style.color = '#86868b';
    }
  } catch (error) {
    machineIdEl.textContent = '请重启应用以加载此功能';
    machineIdEl.style.color = '#ff9500';
    console.error('获取机器ID失败:', error);
  }
}

async function clearWindsurf() {
  if (!confirm('确定要重置Windsurf机器ID吗？\n\n这将生成新的机器标识，但保留其他配置。')) return;
  
  const result = await window.ipcRenderer.invoke('reset-machine-id');
  
  const statusEl = document.getElementById('switchStatus');
  if (result.success) {
    statusEl.innerHTML = `
      <div class="status-message status-success">
        ${result.message}
      </div>
    `;
    // 重新加载机器ID
    loadCurrentMachineId();
  } else {
    statusEl.innerHTML = `
      <div class="status-message status-error">
        清除失败: ${result.error}
      </div>
    `;
  }
}

// ==================== 配置 ====================

// 仅负责根据 currentConfig 渲染设置界面，不重新从存储加载配置
function renderSettingsFromCurrentConfig() {
  // 加载域名列表
  const domainListEl = document.getElementById('domainList');
  if (domainListEl) {
    const domains = Array.isArray(currentConfig.emailDomains) ? currentConfig.emailDomains : [];
    domainListEl.innerHTML = domains.map(domain => `
      <div class="domain-tag">
        ${domain}
        <button onclick="removeDomain('${domain}')">×</button>
      </div>
    `).join('');
  }
  
  // 加载IMAP配置
  const imapHost = document.getElementById('imapHost');
  const imapPort = document.getElementById('imapPort');
  const imapUser = document.getElementById('imapUser');
  const imapPassword = document.getElementById('imapPassword');

  if (currentConfig.emailConfig) {
    // 强制使用 QQ 邮箱 IMAP 配置
    if (imapHost) imapHost.value = 'imap.qq.com';
    if (imapPort) imapPort.value = 993;
    if (imapUser) imapUser.value = currentConfig.emailConfig.user || '';
    if (imapPassword) imapPassword.value = currentConfig.emailConfig.password || '';
  } else {
    // 清空IMAP配置输入框
    if (imapHost) imapHost.value = 'imap.qq.com';
    if (imapPort) imapPort.value = '993';
    if (imapUser) imapUser.value = '';
    if (imapPassword) imapPassword.value = '';
  }
  
  // 加载语言设置
  const languageSelect = document.getElementById('languageSelect');
  if (languageSelect) {
    languageSelect.value = getCurrentLanguage();
  }
  
  // 加载密码配置
  const passwordMode = document.getElementById('passwordMode');
  if (passwordMode) {
    passwordMode.value = currentConfig.passwordMode || 'email';
  }
  
  // 加载查询间隔配置
  const queryInterval = document.getElementById('queryInterval');
  if (queryInterval) {
    queryInterval.value = currentConfig.queryInterval || 5;
  }

  // 无论配置如何，IMAP 服务器和端口统一使用 QQ 邮箱并设为只读
  try {
    if (imapHost) {
      imapHost.value = 'imap.qq.com';
      imapHost.readOnly = true;
    }
    if (imapPort) {
      imapPort.value = '993';
      imapPort.readOnly = true;
    }
  } catch (e) {}
}

// 从 localStorage 读取配置到 currentConfig，然后渲染界面
function loadSettings() {
  console.log('🔄 开始加载设置...');
  // 重新从localStorage加载配置，确保获取最新数据
  const saved = localStorage.getItem('windsurfConfig');
  console.log('📦 localStorage 中的配置:', saved ? '存在' : '不存在');
  if (saved) {
    try {
      currentConfig = JSON.parse(saved);
      console.log('✅ 配置解析成功:', currentConfig);
    } catch (error) {
      console.error('❌ 解析配置数据失败:', error);
      // 使用默认配置
      currentConfig = {
        emailDomains: ['example.com'],
        emailConfig: null
      };
    }
  } else {
    console.log('⚠️ localStorage 中没有配置，使用当前配置:', currentConfig);
  }

  console.log('🎨 开始渲染设置界面...');
  renderSettingsFromCurrentConfig();
  console.log('✅ 设置界面渲染完成');
}

// 切换语言（从设置页面）
async function changeLanguage() {
  const settingsSelect = document.getElementById('languageSelect');
  
  if (!settingsSelect) {
    console.error('找不到语言选择器');
    return;
  }
  
  const newLang = settingsSelect.value;
  
  // 保存到 localStorage
  setLanguage(newLang);
  
  // 同步弹窗选择器的值
  const modalSelect = document.getElementById('modalLanguageSelect');
  if (modalSelect) modalSelect.value = newLang;
  
  // 通过 IPC 保存到文件
  try {
    await window.ipcRenderer.invoke('save-language', newLang);
  } catch (err) {
    console.error('保存语言设置失败:', err);
  }
  
  // 更新UI
  updateUILanguage();
}

// 重置语言选择
function resetLanguageSelection() {
  if (confirm(t('resetLanguageTip') + '\n\n' + (getCurrentLanguage() === 'zh-CN' ? '确定要重新选择语言吗？' : 'Are you sure you want to reset language selection?'))) {
    // 清除 localStorage
    localStorage.removeItem('app_language');
    
    // 重新加载到语言选择页面
    window.location.href = 'language-selector.html';
  }
}

function addDomain() {
  const input = document.getElementById('newDomain').value.trim();
  
  if (!input) {
    alert(t('pleaseEnterDomain'));
    return;
  }
  
  // 按行分割,支持批量添加
  const domains = input.split('\n')
    .map(d => d.trim())
    .filter(d => d.length > 0);
  
  let addedCount = 0;
  let skippedCount = 0;
  
  domains.forEach(domain => {
    if (!currentConfig.emailDomains.includes(domain)) {
      currentConfig.emailDomains.push(domain);
      addedCount++;
    } else {
      skippedCount++;
    }
  });
  
  if (addedCount > 0) {
    document.getElementById('newDomain').value = '';
    renderSettingsFromCurrentConfig();
    alert(`成功添加 ${addedCount} 个域名${skippedCount > 0 ? `，跳过 ${skippedCount} 个重复域名` : ''}`);
  } else {
    alert('所有域名都已存在');
  }
}

function removeDomain(domain) {
  currentConfig.emailDomains = currentConfig.emailDomains.filter(d => d !== domain);
  renderSettingsFromCurrentConfig();
}

// 快速填充IMAP配置
function fillImapConfig() {
  const provider = document.getElementById('emailProvider').value;
  const imapConfigs = {
    gmail: {
      host: 'imap.gmail.com',
      port: 993,
      note: '需要开启两步验证并使用应用专用密码'
    },
    outlook: {
      host: 'outlook.office365.com',
      port: 993,
      note: '支持 Outlook、Hotmail、Live 邮箱'
    },
    qq: {
      host: 'imap.qq.com',
      port: 993,
      note: '需要在QQ邮箱设置中开启IMAP服务并生成授权码'
    },
    '163': {
      host: 'imap.163.com',
      port: 993,
      note: '需要在163邮箱设置中开启IMAP服务并生成授权码。工具已优化支持163邮箱的特殊情况（自动标记已读、邮件转发等）'
    },
    '126': {
      host: 'imap.126.com',
      port: 993,
      note: '需要在126邮箱设置中开启IMAP服务并生成授权码'
    },
    yahoo: {
      host: 'imap.mail.yahoo.com',
      port: 993,
      note: '需要使用应用专用密码'
    },
    icloud: {
      host: 'imap.mail.me.com',
      port: 993,
      note: '需要使用应用专用密码'
    }
  };
  
  if (provider && provider !== 'custom' && imapConfigs[provider]) {
    const config = imapConfigs[provider];
    const imapHost = document.getElementById('imapHost');
    const imapPort = document.getElementById('imapPort');

    // 无论选择哪个预设服务商，实际强制使用 QQ IMAP 配置
    if (imapHost) {
      imapHost.value = 'imap.qq.com';
      imapHost.readOnly = true;
    }
    if (imapPort) {
      imapPort.value = '993';
      imapPort.readOnly = true;
    }
    
    // 显示提示信息
    document.getElementById('settingsStatus').innerHTML = `
      <div class="status-message status-info">
        <strong>${provider.toUpperCase()} 配置已填充</strong><br>
        ${config.note}
      </div>
    `;
  } else if (provider === 'custom') {
    const imapHost = document.getElementById('imapHost');
    const imapPort = document.getElementById('imapPort');
    if (imapHost) {
      imapHost.value = 'imap.qq.com';
      imapHost.readOnly = true;
    }
    if (imapPort) {
      imapPort.value = '993';
      imapPort.readOnly = true;
    }
    document.getElementById('settingsStatus').innerHTML = '';
  } else {
    document.getElementById('settingsStatus').innerHTML = '';
  }
}

// 显示居中提示消息
function showCenterMessage(message, type = 'info', duration = 3000) {
  // 移除已存在的提示
  const existing = document.querySelector('.center-message-overlay');
  if (existing) {
    existing.remove();
  }
  
  // 创建遮罩层
  const overlay = document.createElement('div');
  overlay.className = 'center-message-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease;
  `;
  
  // 创建消息框
  const messageBox = document.createElement('div');
  messageBox.className = 'center-message-box';
  
  // 根据类型设置样式
  let bgColor, iconColor, icon;
  switch(type) {
    case 'success':
      bgColor = '#d1f2dd';
      iconColor = '#34c759';
      icon = '✓';
      break;
    case 'error':
      bgColor = '#ffd9d6';
      iconColor = '#ff3b30';
      icon = '✗';
      break;
    case 'warning':
      bgColor = '#fff3cd';
      iconColor = '#ff9500';
      icon = '⚠';
      break;
    default: // info
      bgColor = '#d1e7ff';
      iconColor = '#007aff';
      icon = 'ℹ';
  }
  
  messageBox.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 32px 40px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    max-width: 400px;
    text-align: center;
    animation: slideUp 0.3s ease;
  `;
  
  messageBox.innerHTML = `
    <div style="
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${bgColor};
      color: ${iconColor};
      font-size: 32px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
    ">${icon}</div>
    <div style="
      font-size: 16px;
      color: #1d1d1f;
      line-height: 1.5;
      word-break: break-word;
    ">${message}</div>
  `;
  
  overlay.appendChild(messageBox);
  document.body.appendChild(overlay);
  
  // 点击遮罩层关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
  
  // 自动关闭
  if (duration > 0) {
    setTimeout(() => {
      overlay.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => overlay.remove(), 200);
    }, duration);
  }
}

async function testImap() {
  // QQ 邮箱固定配置
  const config = {
    host: 'imap.qq.com',
    port: 993,
    user: document.getElementById('imapUser').value,
    password: document.getElementById('imapPassword').value
  };
  
  if (!config.user || !config.password) {
    showCenterMessage(t('pleaseCompleteIMAPConfig'), 'warning');
    return;
  }
  
  // 显示测试中提示
  showCenterMessage('正在测试IMAP连接...', 'info', 0);
  
  const result = await window.ipcRenderer.invoke('test-imap', config);
  
  // 移除测试中提示
  const existing = document.querySelector('.center-message-overlay');
  if (existing) {
    existing.remove();
  }
  
  // 显示结果
  if (result.success) {
    showCenterMessage(result.message, 'success');
  } else {
    showCenterMessage(result.message, 'error', 5000);
  }
}

async function saveSettings() {
  // 从当前界面上的域名标签收集 emailDomains
  // 批量添加仍然通过“添加域名”按钮处理 textarea 内容
  try {
    const domainTags = document.querySelectorAll('#domainList .domain-tag');
    if (domainTags && domainTags.length > 0) {
      currentConfig.emailDomains = Array.from(domainTags)
        .map(tag => {
          const text = tag.textContent || '';
          // 去掉右侧删除按钮的“×”字符
          return text.replace('×', '').trim();
        })
        .filter(d => d.length > 0);
    } else {
      currentConfig.emailDomains = [];
    }
  } catch (e) {
    console.warn('从界面收集域名列表失败，将使用内存中的 emailDomains:', e);
  }

  // QQ 邮箱固定配置
  currentConfig.emailConfig = {
    host: 'imap.qq.com',
    port: 993,
    user: document.getElementById('imapUser').value,
    password: document.getElementById('imapPassword').value
  };
  
  // 保存密码配置
  const passwordMode = document.getElementById('passwordMode');
  if (passwordMode) {
    currentConfig.passwordMode = passwordMode.value;
  }
  
  // 保存查询间隔配置
  const queryInterval = document.getElementById('queryInterval');
  if (queryInterval) {
    let interval = parseInt(queryInterval.value);
    // 验证范围：最低1分钟，最高1440分钟（24小时）
    if (isNaN(interval) || interval < 1) {
      interval = 1;
      queryInterval.value = 1;
    } else if (interval > 1440) {
      interval = 1440;
      queryInterval.value = 1440;
    }
    currentConfig.queryInterval = interval;
    
    // 重启自动查询
    if (typeof window.restartAutoQuery === 'function') {
      window.restartAutoQuery(interval);
    }
  }
  
  // 保存到本地存储
  localStorage.setItem('windsurfConfig', JSON.stringify(currentConfig));
  
  // 通过IPC保存配置到文件
  try {
    const result = await window.ipcRenderer.invoke('save-windsurf-config', currentConfig);
    if (!result.success) {
      console.warn('保存配置到文件失败:', result.error);
    }
  } catch (error) {
    console.warn('调用IPC保存配置失败:', error);
  }
  
  document.getElementById('settingsStatus').innerHTML = `
    <div class="status-message status-success">
      配置已保存！
    </div>
  `;
  
  // 隐藏悬浮保存按钮
  const saveBtn = document.querySelector('.save-btn');
  if (saveBtn) {
    saveBtn.style.display = 'none';
  }
  
  setTimeout(() => {
    document.getElementById('settingsStatus').innerHTML = '';
  }, 3000);
}

// 监听设置页面的输入变化，显示悬浮保存按钮
function initSettingsChangeListener() {
  const settingsView = document.getElementById('settingsView');
  if (!settingsView) return;
  
  const saveBtn = document.querySelector('.save-btn');
  if (!saveBtn) return;
  
  // 监听所有输入框、选择框的变化
  const inputs = settingsView.querySelectorAll('input, select, textarea');
  
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      saveBtn.style.display = 'flex';
    });
    
    input.addEventListener('change', () => {
      saveBtn.style.display = 'flex';
    });
  });
}

// 页面加载完成后初始化
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initSettingsChangeListener();
    // 启动赞助弹窗定时器
    startSponsorPopupTimer();
  });
}

// 获取当前登录账号
async function getCurrentAccount() {
  try {
    const result = await window.ipcRenderer.invoke('get-current-login');
    const currentAccountInfo = document.getElementById('currentAccountInfo');
    const currentAccountEmail = document.getElementById('currentAccountEmail');
    
    if (result.success && result.email) {
      if (currentAccountEmail) {
        currentAccountEmail.textContent = result.email;
      }
      if (currentAccountInfo) {
        currentAccountInfo.style.display = 'block';
      }
    } else {
      if (currentAccountEmail) {
        currentAccountEmail.textContent = '未登录';
      }
      // 如果没有登录信息，隐藏整个区域
      if (currentAccountInfo) {
        currentAccountInfo.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('获取当前登录账号失败:', error);
    const currentAccountEmail = document.getElementById('currentAccountEmail');
    if (currentAccountEmail) {
      currentAccountEmail.textContent = '获取失败';
    }
  }
}

// 刷新当前登录账号
async function refreshCurrentAccount() {
  await getCurrentAccount();
  // 重新初始化图标
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// 初始化加载配置
window.addEventListener('DOMContentLoaded', async () => {
  // 显示当前平台信息（同时更新侧边栏和系统设置页面）
  const platform = process.platform;
  const platformMap = {
    'win32': 'Windows',
    'darwin': 'macOS',
    'linux': 'Linux'
  };
  const platformText = platformMap[platform] || platform;
  
  // 更新侧边栏平台信息
  const sidebarPlatformInfo = document.getElementById('sidebarPlatformInfo');
  if (sidebarPlatformInfo) {
    sidebarPlatformInfo.textContent = platformText;
  }
  
  // 更新系统设置页面平台信息
  const platformInfo = document.getElementById('platformInfo');
  if (platformInfo) {
    platformInfo.textContent = platformText;
  }
  
  // 获取当前登录账号
  await getCurrentAccount();
  
  // 加载"已使用账号"持久化记录
  loadUsedAccountsFromStorage();
  
  // 先尝试从IPC读取配置文件
  console.log('🔄 初始化：开始加载配置...');
  try {
    const result = await window.ipcRenderer.invoke('load-windsurf-config');
    console.log('📦 IPC 配置加载结果:', result);
    if (result.success && result.config) {
      currentConfig = result.config;
      console.log('✅ 从 IPC 加载配置成功:', currentConfig);
      // 同步到localStorage
      localStorage.setItem('windsurfConfig', JSON.stringify(currentConfig));
      console.log('💾 配置已同步到 localStorage');
    } else {
      console.log('⚠️ IPC 配置加载失败，尝试从 localStorage 读取');
      // 如果文件读取失败，尝试从localStorage读取
      const saved = localStorage.getItem('windsurfConfig');
      if (saved) {
        currentConfig = JSON.parse(saved);
        console.log('✅ 从 localStorage 加载配置成功:', currentConfig);
      } else {
        console.log('⚠️ localStorage 中也没有配置，使用默认配置');
      }
    }
  } catch (error) {
    console.error('❌ 从IPC读取配置失败:', error);
    // 降级到localStorage
    const saved = localStorage.getItem('windsurfConfig');
    if (saved) {
      currentConfig = JSON.parse(saved);
      console.log('✅ 降级到 localStorage 配置成功');
    } else {
      console.log('⚠️ 所有配置源都失败，使用默认配置');
    }
  }
  
  console.log('📋 当前配置状态:', currentConfig);
  console.log('🔄 开始加载账号列表...');
  loadAccounts();
});

// ==================== 右键菜单辅助函数（全局）====================

window.refreshSingleAccount = async function(email) {
  const result = await window.ipcRenderer.invoke('get-accounts');
  if (!result.success) return;
  
  const account = result.accounts.find(acc => acc.email === email);
  if (account && account.refreshToken && typeof window.AccountQuery !== 'undefined') {
    showToast('正在刷新...', 'info');
    const queryResult = await window.AccountQuery.queryAccount(account);
    if (queryResult.success) {
      loadAccounts(); // 重新加载列表
      showToast('刷新成功！', 'success');
    } else {
      showToast('刷新失败：' + (queryResult.error || '未知错误'), 'error');
    }
  }
};

window.switchAccountFromMenu = async function(email, password) {
  const shouldContinue = await showCustomConfirm(
    `确定切换到账号：${email} 吗？\n\n这将自动登录到 Windsurf 并使用该账号。`,
    '切换账号'
  );
  if (!shouldContinue) return;
  
  try {
    const result = await window.ipcRenderer.invoke('switch-account', { email, password });
    if (result.success) {
      showToast(`切换成功！已切换到：${email}`, 'success');
    } else {
      showToast(`切换失败：${result.error || '未知错误'}`, 'error');
    }
  } catch (error) {
    showToast(`切换失败：${error.message}`, 'error');
  }
};

window.exportSingleAccountFromMenu = async function(email, password) {
  try {
    const exportData = `邮箱: ${email}\n密码: ${password}\n`;
    const result = await window.ipcRenderer.invoke('save-file', {
      content: exportData,
      filename: `${email.replace('@', '_')}.txt`,
      filters: [
        { name: '文本文件', extensions: ['txt'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (result.success) {
      showToast('导出成功！', 'success');
    } else if (result.error !== '用户取消了保存操作') {
      showToast('导出失败: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('导出失败: ' + error.message, 'error');
  }
};

window.deleteAccountFromMenu = async function(id, email) {
  const shouldContinue = await showCustomConfirm(
    `确定删除账号：${email} 吗？`,
    '删除账号'
  );
  if (!shouldContinue) return;
  
  const result = await window.ipcRenderer.invoke('delete-account', id);
  if (result.success) {
    loadAccounts();
    showToast('删除成功！', 'success');
  } else {
    showToast('删除失败: ' + result.error, 'error');
  }
};

// ==================== 右键菜单函数（全局）====================
// 注意：以下右键菜单功能已迁移到 js/accountManager.js
// - showAccountContextMenu() 方法
// - 右键菜单事件绑定（在 loadAccounts 中）
// 保留此代码作为备份参考，实际不再使用

/* 已迁移到 accountManager.js
window.showAccountContextMenu = function(event, account) {
    // 移除已存在的菜单
    const existingMenu = document.getElementById('accountContextMenu');
    if (existingMenu) existingMenu.remove();
    
    const accountJson = JSON.stringify(account).replace(/"/g, '&quot;').replace(/'/g, "\\'");
    
    const menuHTML = `
      <div id="accountContextMenu" style="position: fixed; left: ${event.clientX}px; top: ${event.clientY}px; background: white; border: 1px solid #e5e5ea; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; min-width: 180px;">
        <div class="context-menu-item" onclick="showAccountDetailsModal(${accountJson}); document.getElementById('accountContextMenu').remove();">
          <i data-lucide="eye" style="width: 16px; height: 16px;"></i>
          <span>查看详情</span>
        </div>
        ${account.refreshToken ? `
        <div class="context-menu-item" onclick="window.refreshSingleAccount('${account.email}'); document.getElementById('accountContextMenu').remove();">
          <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
          <span>刷新积分</span>
        </div>
        ` : ''}
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="window.switchAccountFromMenu('${account.email}', '${account.password}'); document.getElementById('accountContextMenu').remove();">
          <i data-lucide="repeat" style="width: 16px; height: 16px;"></i>
          <span>切换账号</span>
        </div>
        <div class="context-menu-item" onclick="window.exportSingleAccountFromMenu('${account.email}', '${account.password}'); document.getElementById('accountContextMenu').remove();">
          <i data-lucide="download" style="width: 16px; height: 16px;"></i>
          <span>导出账号</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="navigator.clipboard.writeText('${account.email}'); showToast('邮箱已复制', 'success'); document.getElementById('accountContextMenu').remove();">
          <i data-lucide="mail" style="width: 16px; height: 16px;"></i>
          <span>复制邮箱</span>
        </div>
        <div class="context-menu-item" onclick="navigator.clipboard.writeText('${account.password}'); showToast('密码已复制', 'success'); document.getElementById('accountContextMenu').remove();">
          <i data-lucide="key" style="width: 16px; height: 16px;"></i>
          <span>复制密码</span>
        </div>
        ${account.apiKey ? `
        <div class="context-menu-item" onclick="navigator.clipboard.writeText('${account.apiKey}'); showToast('API Key 已复制', 'success'); document.getElementById('accountContextMenu').remove();">
          <i data-lucide="code" style="width: 16px; height: 16px;"></i>
          <span>复制 API Key</span>
        </div>
        ` : ''}
        ${account.refreshToken ? `
        <div class="context-menu-item" onclick="navigator.clipboard.writeText('${account.refreshToken}'); showToast('Refresh Token 已复制', 'success'); document.getElementById('accountContextMenu').remove();">
          <i data-lucide="shield" style="width: 16px; height: 16px;"></i>
          <span>复制 Refresh Token</span>
        </div>
        ` : ''}
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" style="color: #ff3b30;" onclick="window.deleteAccountFromMenu('${account.id}', '${account.email}'); document.getElementById('accountContextMenu').remove();">
          <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
          <span>删除账号</span>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', menuHTML);
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    // 点击其他地方关闭菜单
    setTimeout(() => {
      document.addEventListener('click', function closeMenu() {
        const menu = document.getElementById('accountContextMenu');
        if (menu) menu.remove();
        document.removeEventListener('click', closeMenu);
      });
    }, 100);
  };
*/
// 以上右键菜单功能已注释，实际使用 js/accountManager.js 中的实现

// ==================== 外部链接处理（全局）====================

// 处理外部链接，在系统默认浏览器中打开
// shell 已在文件顶部声明
document.addEventListener('click', (e) => {
  const target = e.target.closest('a[target="_blank"]');
  if (target && target.href) {
    e.preventDefault();
    shell.openExternal(target.href);
  }
});

