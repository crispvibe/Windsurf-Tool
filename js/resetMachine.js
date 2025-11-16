// resetMachine.js - 机器ID重置功能模块
// 使用全局的 ipcRenderer (通过 window.ipcRenderer 访问)

/**
 * 机器ID重置管理器
 */
const ResetMachine = {
  /**
   * 添加日志到界面
   */
  addLog(message, type = 'info') {
    const logEl = document.getElementById('resetLog');
    if (!logEl) return;
    
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    let colorClass = '';
    switch(type) {
      case 'success':
        colorClass = 'log-success';
        break;
      case 'error':
        colorClass = 'log-error';
        break;
      case 'warning':
        colorClass = 'log-warning';
        break;
      default:
        colorClass = 'log-info';
    }
    
    logEntry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span><span class="${colorClass}">${message}</span>`;
    // 存储纯文本内容用于复制
    logEntry.setAttribute('data-log-text', `[${timestamp}] ${message}`);
    logEl.appendChild(logEntry);
    
    // 自动滚动到底部
    logEl.scrollTop = logEl.scrollHeight;
  },
  
  /**
   * 显示日志卡片
   */
  showLogCard() {
    const logCard = document.getElementById('resetLogCard');
    if (logCard) {
      logCard.style.display = 'block';
      const logEl = document.getElementById('resetLog');
      if (logEl) {
        logEl.innerHTML = '';
      }
    }
    
    // 初始化图标
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },
  
  /**
   * 监听后端日志输出
   */
  setupLogListener() {
    // 监听来自主进程的日志
    window.ipcRenderer.on('reset-log', (event, log) => {
      if (log && log.message) {
        this.addLog(log.message, log.type || 'info');
      } else if (typeof log === 'string') {
        this.addLog(log, 'info');
      }
    });
  },
  
  /**
   * 重置Windsurf机器ID
   */
  async resetWindsurf() {
    this.showLogCard();
    this.addLog('开始重置 Windsurf 机器ID...', 'info');
    this.addLog('', 'info');
    
    // 检测平台
    const platform = process.platform;
    const platformName = platform === 'win32' ? 'Windows' : (platform === 'darwin' ? 'macOS' : 'Linux');
    this.addLog(`检测到当前平台: ${platformName}`, 'info');
    
    // 1. 检测 Windsurf 是否正在运行
    this.addLog('', 'info');
    this.addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
    this.addLog('检测 Windsurf 运行状态', 'info');
    this.addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
    
    try {
      const isRunning = await window.ipcRenderer.invoke('check-windsurf-running');
      
      if (isRunning) {
        this.addLog('⚠️ 检测到 Windsurf 正在运行', 'warning');
        this.addLog('正在自动关闭 Windsurf...', 'info');
        
        try {
          const closeResult = await window.ipcRenderer.invoke('close-windsurf');
          
          if (closeResult.success) {
            this.addLog('✅ Windsurf 已成功关闭', 'success');
          } else {
            this.addLog('⚠️ Windsurf 可能未完全关闭，但继续执行', 'warning');
          }
        } catch (error) {
          this.addLog(`⚠️ 关闭过程出现问题: ${error.message}`, 'warning');
          this.addLog('⚠️ 继续执行重置，如果失败请手动关闭 Windsurf 后重试', 'warning');
        }
      } else {
        this.addLog('✅ Windsurf 未运行', 'success');
      }
    } catch (error) {
      this.addLog(`⚠️ 检测运行状态失败: ${error.message}`, 'warning');
      this.addLog('继续执行重置操作...', 'info');
    }
    
    this.addLog('', 'info');
    
    // Windows 系统显示详细信息
    if (platform === 'win32') {
      this.addLog('', 'info');
      this.addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
      this.addLog('Windows 系统详细信息', 'info');
      this.addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
      
      try {
        // 检测安装路径
        this.addLog('正在检测 Windsurf 安装路径...', 'info');
        const pathResult = await window.ipcRenderer.invoke('detect-windsurf-install-path');
        
        if (pathResult.success && pathResult.installPath) {
          this.addLog(`检测到安装路径: ${pathResult.installPath}`, 'success');
        } else {
          this.addLog('未能自动检测到安装路径，将使用默认配置路径', 'warning');
        }
        
        // 显示用户数据路径（Windows Roaming 目录）
        const userDataPath = process.env.APPDATA + '\\Windsurf';
        this.addLog(`用户数据路径 (Roaming): ${userDataPath}`, 'info');
        this.addLog(`需要修改的配置文件:`, 'info');
        this.addLog(`   [1] machineid 文件:`, 'info');
        this.addLog(`      ${userDataPath}\\machineid`, 'info');
        this.addLog(`   [2] storage.json 文件:`, 'info');
        this.addLog(`      ${userDataPath}\\User\\globalStorage\\storage.json`, 'info');
        this.addLog(`   [3] state.vscdb 数据库:`, 'info');
        this.addLog(`      ${userDataPath}\\User\\globalStorage\\state.vscdb`, 'info');
        this.addLog('', 'info');
        this.addLog(`说明: 这些是配置文件路径，不是安装路径`, 'warning');
        this.addLog(`   安装路径通常在: C:\\Users\\用户名\\AppData\\Local\\Programs\\Windsurf`, 'info');
        this.addLog('', 'info');
      } catch (error) {
        this.addLog(`获取系统信息时出错: ${error.message}`, 'warning');
        this.addLog('', 'info');
      }
    }
    
    try {
      this.addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
      this.addLog('开始执行重置操作', 'info');
      this.addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
      this.addLog('', 'info');
      
      const result = await window.ipcRenderer.invoke('full-reset-windsurf');
      
      if (result.success) {
        this.addLog('', 'info');
        this.addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'success');
        this.addLog('[成功] Windsurf 机器ID重置成功！', 'success');
        this.addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'success');
        this.addLog('', 'info');
        
        if (result.machineIds) {
          this.addLog('新生成的机器ID:', 'info');
          this.addLog(`   主机器ID: ${result.machineIds.mainMachineId}`, 'info');
          this.addLog(`   遥测ID: ${result.machineIds.telemetryMachineId.substring(0, 32)}...`, 'info');
          this.addLog(`   SQM ID: ${result.machineIds.sqmId}`, 'info');
          this.addLog(`   开发设备ID: ${result.machineIds.devDeviceId}`, 'info');
          this.addLog(`   服务ID: ${result.machineIds.serviceMachineId}`, 'info');
          this.addLog('', 'info');
        }
        
        this.addLog('重要提示:', 'warning');
        this.addLog('   1. 请完全关闭 Windsurf 应用', 'warning');
        this.addLog('   2. 重新启动 Windsurf 以使更改生效', 'warning');
        this.addLog('   3. 首次启动可能需要重新登录账号', 'warning');
        
        // 显示成功提示
        setTimeout(() => {
          showCenterMessage('[成功] Windsurf 机器ID重置成功！\n\n请重新启动 Windsurf 应用以使更改生效', 'success', 5000);
        }, 500);
        
        return { success: true };
      } else {
        this.addLog('', 'info');
        this.addLog('[失败] 重置失败: ' + (result.error || '未知错误'), 'error');
        
        // Windows 系统显示额外的调试信息
        if (platform === 'win32') {
          this.addLog('', 'info');
          this.addLog('调试信息:', 'info');
          this.addLog('   - 请确保 Windsurf 已完全关闭', 'info');
          this.addLog('   - 检查是否有足够的文件访问权限', 'info');
          this.addLog('   - 尝试以管理员身份运行本工具', 'info');
        }
        
        showCenterMessage('[失败] 重置失败: ' + (result.error || '未知错误'), 'error', 5000);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('重置Windsurf失败:', error);
      this.addLog('', 'info');
      this.addLog('[异常] 重置过程中发生异常: ' + error.message, 'error');
      this.addLog('', 'info');
      this.addLog('错误详情:', 'error');
      this.addLog(`   ${error.stack || error.message}`, 'error');
      
      showCenterMessage('[失败] 重置失败: ' + error.message, 'error', 5000);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * 重置Cursor机器ID（显示正在开发提示）
   */
  async resetCursor() {
    showCenterMessage('[开发中] Cursor 重置功能正在开发中\n\n敬请期待后续版本更新', 'info', 3000);
    return { success: false, error: '功能开发中' };
  }
};

/**
 * 复制重置日志
 */
function copyResetLog() {
  const logEl = document.getElementById('resetLog');
  if (!logEl) return;
  
  // 获取所有日志条目
  const logEntries = logEl.querySelectorAll('.log-entry');
  if (logEntries.length === 0) {
    showCenterMessage('暂无日志可复制', 'warning', 2000);
    return;
  }
  
  // 提取纯文本
  const logText = Array.from(logEntries)
    .map(entry => entry.getAttribute('data-log-text') || entry.textContent)
    .join('\n');
  
  // 复制到剪贴板
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(logText)
      .then(() => {
        showCenterMessage('[成功] 日志已复制到剪贴板', 'success', 2000);
      })
      .catch(err => {
        console.error('复制失败:', err);
        fallbackCopyResetLog(logText);
      });
  } else {
    fallbackCopyResetLog(logText);
  }
}

/**
 * 备用复制方法
 */
function fallbackCopyResetLog(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  
  try {
    document.execCommand('copy');
    showCenterMessage('[成功] 日志已复制到剪贴板', 'success', 2000);
  } catch (err) {
    console.error('备用复制方法失败:', err);
    showCenterMessage('[失败] 复制失败，请手动复制', 'error', 2000);
  } finally {
    document.body.removeChild(textarea);
  }
}

// 初始化日志监听器
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    ResetMachine.setupLogListener();
  });
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResetMachine;
}

// 全局函数（用于HTML onclick调用）
function resetWindsurfMachine() {
  return ResetMachine.resetWindsurf();
}

function resetCursorMachine() {
  return ResetMachine.resetCursor();
}
