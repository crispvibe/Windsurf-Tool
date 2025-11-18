const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const accountsFileLock = require('./src/accountsFileLock');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const VersionManager = require(path.join(__dirname, 'src', 'versionManager'));

let mainWindow;
let versionManager;
let versionCheckInterval;
// 当前批量注册的机器人实例，用于支持跨平台取消
let currentRegistrationBot = null;
// 强制更新和维护模式状态
let isForceUpdateActive = false;
let isMaintenanceModeActive = false;
let isApiUnavailable = false;

// 应用名称 - 必须设置为 'Windsurf' 以使用相同的 Keychain 密钥
app.setName('Windsurf');

// 设置独立的用户数据目录（不与 Windsurf 共享）
// 注意：必须在复制 Local State 之前设置，确保路径一致
const appDataPath = app.getPath('appData');
const toolUserData = path.join(appDataPath, 'windsurf-tool');
app.setPath('userData', toolUserData);

// Windows: 复制 Windsurf 的 Local State 文件到工具目录
// 这样 safeStorage 才能正确加密/解密数据
if (process.platform === 'win32') {
  const windsurfUserData = path.join(appDataPath, 'Windsurf');
  const windsurfLocalState = path.join(windsurfUserData, 'Local State');
  const toolLocalState = path.join(toolUserData, 'Local State');
  
  try {
    const fs = require('fs');
    // 确保工具目录存在
    if (!fs.existsSync(toolUserData)) {
      fs.mkdirSync(toolUserData, { recursive: true });
    }
    
    // 如果 Windsurf 的 Local State 存在，复制到工具目录
    if (fs.existsSync(windsurfLocalState)) {
      // 每次启动都检查并更新 Local State（确保使用最新的加密密钥）
      const shouldCopy = !fs.existsSync(toolLocalState) || 
                        fs.statSync(windsurfLocalState).mtimeMs > fs.statSync(toolLocalState).mtimeMs;
      
      if (shouldCopy) {
        fs.copyFileSync(windsurfLocalState, toolLocalState);
        console.log('[初始化] ✅ 已复制 Windsurf Local State 到工具目录');
        console.log(`[初始化]    源: ${windsurfLocalState}`);
        console.log(`[初始化]    目标: ${toolLocalState}`);
      } else {
        console.log('[初始化] ℹ️  Local State 已是最新，无需复制');
      }
    } else {
      console.warn('[初始化] ⚠️ 未找到 Windsurf Local State，加密可能失败');
      console.warn(`[初始化]    期望路径: ${windsurfLocalState}`);
      console.warn('[初始化]    请确保 Windsurf 已安装并至少运行过一次');
    }
  } catch (error) {
    console.error('[初始化] ❌ 复制 Local State 失败:', error.message);
  }
}

// 跨平台安全路径获取函数
function getSafePath(base, ...paths) {
  return path.join(base, ...paths);
}

// 应用配置路径
const userDataPath = app.getPath('userData');
const ACCOUNTS_FILE = getSafePath(userDataPath, 'accounts.json');
const LANGUAGE_FILE = getSafePath(userDataPath, 'language.json');

// 初始化版本管理器
function initVersionManager() {
  versionManager = new VersionManager();
  
  // 启动时检查版本和维护模式
  setTimeout(async () => {
    try {
      console.log('🚀 启动时版本检查...');
      const updateInfo = await versionManager.checkForUpdates();
      
      console.log('✅ 版本检查完成:', updateInfo);
      
      // 只有真正需要更新时才发送通知到渲染进程
      if (updateInfo.hasUpdate && mainWindow && !mainWindow.isDestroyed()) {
        console.log('📢 发送版本更新通知到渲染进程');
        mainWindow.webContents.send('version-update-available', {
          currentVersion: updateInfo.currentVersion,
          latestVersion: updateInfo.latestVersion,
          hasUpdate: updateInfo.hasUpdate,
          forceUpdate: updateInfo.forceUpdate,
          isSupported: updateInfo.isSupported,
          updateMessage: updateInfo.updateMessage,
          downloadUrl: versionManager.getDownloadUrl()
        });
      } else {
        console.log('ℹ️ 无需更新或版本检测异常（已安全处理）');
      }
    } catch (error) {
      // 检查是否是维护模式
      if (error.isMaintenance) {
        console.warn('🔧 检测到服务器维护模式');
        handleMaintenanceMode(error.maintenanceInfo);
      } else {
        // API 无法访问 - 不允许使用软件
        console.error('❌ 无法连接到服务器，软件无法使用');
        console.error('错误详情:', error);
        isApiUnavailable = true;
        
        // 关闭开发者工具
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
        }
        
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('api-unavailable', {
            error: error.message,
            message: '无法连接到服务器，请检查网络连接。如果开启了代理/VPN，请关闭后重试。'
          });
        }
      }
    }
  }, 3000); // 延迟3秒检查，避免影响启动速度
  
  // 启动自动定时检测（3分钟检查一次）
  versionManager.startAutoCheck(
    // 发现更新时的回调函数
    (updateInfo) => {
      // 只有真正需要更新时才发送通知
      if (updateInfo.hasUpdate && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('version-update-available', {
          currentVersion: updateInfo.currentVersion,
          latestVersion: updateInfo.latestVersion,
          hasUpdate: updateInfo.hasUpdate,
          forceUpdate: updateInfo.forceUpdate,
          isSupported: updateInfo.isSupported,
          updateMessage: updateInfo.updateMessage,
          downloadUrl: versionManager.getDownloadUrl()
        });
      }
    },
    // 维护模式回调函数
    (maintenanceInfo) => {
      console.warn('🔧 检测到服务器维护模式');
      handleMaintenanceMode(maintenanceInfo);
    },
    // 维护模式结束回调函数
    () => {
      console.log('✅ 维护模式已结束');
      isMaintenanceModeActive = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('maintenance-mode-ended');
      }
    },
    // API 无法访问回调函数
    (errorInfo) => {
      console.error('❌ 运行时检测到 API 无法访问');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('api-unavailable', errorInfo);
      }
    }
  );
}

// 处理维护模式
function handleMaintenanceMode(maintenanceInfo) {
  console.log('🔧 进入维护模式:', maintenanceInfo.message);
  
  // 设置维护模式状态
  isMaintenanceModeActive = true;
  
  // 关闭开发者工具
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isDevToolsOpened()) {
    mainWindow.webContents.closeDevTools();
  }
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    // 发送维护模式通知到渲染进程
    mainWindow.webContents.send('maintenance-mode-active', {
      enabled: maintenanceInfo.enabled,
      message: maintenanceInfo.message || '服务器正在维护中，请稍后再试',
      timestamp: new Date().toISOString()
    });
  }
}

function createWindow() {
  console.log('🚀 开始创建主窗口...');
  console.log('📍 平台:', process.platform);
  console.log('📍 架构:', process.arch);
  console.log('📍 Electron版本:', process.versions.electron);
  console.log('📍 Node版本:', process.versions.node);
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: !app.isPackaged, // 生产环境禁用开发者工具
      webviewTag: true,
      webSecurity: false, // 允许加载本地资源
      allowRunningInsecureContent: true // 允许运行不安全的内容（开发环境）
    },
    title: 'Windsurf-Tool',
    show: false // 先不显示，等加载完成
  });
  
  console.log('✅ 主窗口创建成功');

  // 加载完成后显示窗口
  mainWindow.once('ready-to-show', () => {
    console.log('🎉 窗口准备就绪，开始显示');
    mainWindow.show();
    // 初始化版本管理器
    initVersionManager();
  });

  // 监听渲染进程崩溃
  mainWindow.webContents.on('crashed', () => {
    console.error('❌ 渲染进程崩溃');
    console.error('📍 平台:', process.platform);
    console.error('📍 时间:', new Date().toISOString());
    dialog.showErrorBox('应用崩溃', '渲染进程崩溃，请重启应用\n\n平台: ' + process.platform + '\n时间: ' + new Date().toLocaleString());
  });

  // 监听加载失败
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('❌ 页面加载失败:', errorCode, errorDescription);
    console.error('📍 平台:', process.platform);
    console.error('📍 时间:', new Date().toISOString());
    
    // Windows特殊处理
    if (process.platform === 'win32') {
      console.error('🔧 Windows调试信息:');
      console.error('  - 用户数据路径:', app.getPath('userData'));
      console.error('  - 应用路径:', app.getAppPath());
      console.error('  - 是否打包:', app.isPackaged);
    }
  });
  
  // 监听来自渲染进程的强制更新状态
  ipcMain.on('set-force-update-status', (event, status) => {
    isForceUpdateActive = status;
    console.log('🔒 强制更新状态:', status ? '激活' : '关闭');
    
    // 强制更新时禁用开发者工具
    if (status && app.isPackaged) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      }
    }
  });
  
  // 监听开发者工具打开事件
  mainWindow.webContents.on('devtools-opened', () => {
    if (isForceUpdateActive || isMaintenanceModeActive || isApiUnavailable) {
      console.log('🚫 检测到开发者工具打开，强制关闭');
      mainWindow.webContents.closeDevTools();
      
      // 发送警告到渲染进程
      mainWindow.webContents.send('devtools-blocked', {
        reason: isForceUpdateActive ? '强制更新模式' : isMaintenanceModeActive ? '维护模式' : 'API 无法访问'
      });
    }
  });
  
  // 防止通过快捷键刷新页面
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isForceUpdateActive || isMaintenanceModeActive || isApiUnavailable) {
      // 检测刷新快捷键：Cmd+R (macOS) 或 Ctrl+R (Windows/Linux) 或 F5
      const isRefreshKey = (
        (input.key === 'r' && (input.meta || input.control)) ||
        input.key === 'F5'
      );
      
      // 检测开发者工具快捷键
      const isDevToolsKey = (
        (input.key === 'i' && input.meta && input.alt) || // macOS: Cmd+Option+I
        (input.key === 'i' && input.control && input.shift) || // Windows: Ctrl+Shift+I
        input.key === 'F12'
      );
      
      if (isRefreshKey || isDevToolsKey) {
        event.preventDefault();
        console.log('🚫 已阻止操作:', isRefreshKey ? '刷新' : '开发者工具');
        
        // 发送消息到渲染进程显示提示
        mainWindow.webContents.send('show-force-update-warning');
      }
    }
  });

  // 检查是否已选择语言，首次启动显示语言选择界面
  fs.access(LANGUAGE_FILE)
    .then(() => {
      // 已选择过语言，直接加载主界面
      mainWindow.loadFile('index.html').catch(err => {
        console.error('加载HTML失败:', err);
        dialog.showErrorBox('加载失败', '无法加载应用界面: ' + err.message);
      });
    })
    .catch(() => {
      // 首次启动，显示语言选择界面
      mainWindow.loadFile('language-selector.html').catch(err => {
        console.error('加载语言选择界面失败:', err);
        // 如果语言选择界面加载失败，直接加载主界面
        mainWindow.loadFile('index.html');
      });
    });
  
  // 开发模式或打包后都打开开发工具（方便调试）
  if (process.argv.includes('--dev') || !app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}


// 初始化配置文件
async function initializeConfigFiles() {
  try {
    const userDataPath = app.getPath('userData');
    const configFile = path.join(userDataPath, 'windsurf-app-config.json');
    
    // 检查配置文件是否存在
    try {
      await fs.access(configFile);
      console.log(`✅ Windsurf配置文件已存在: ${configFile}`);
    } catch (error) {
      // 文件不存在，创建默认配置
      console.log(`ℹ️ 创建默认Windsurf配置文件: ${configFile}`);
      // 打开登录页面
      console.log('打开登录页面...');
      await page.goto('https://windsurf.com/account/login', { waitUntil: 'networkidle2', timeout: 60000 });
      
      // 默认配置
      const defaultConfig = {
        emailDomains: ['example.com'],
        emailConfig: null,
        lastUpdate: new Date().toISOString(),
        platform: process.platform
      };
      
      // 写入默认配置
      await fs.writeFile(configFile, JSON.stringify(defaultConfig, null, 2));
      console.log(`✅ 默认Windsurf配置文件已创建`);
    }
    
    // 初始化其他必要的文件
    const accountsFile = path.join(userDataPath, 'accounts.json');
    try {
      await fs.access(accountsFile);
      console.log(`✅ 账号文件已存在: ${accountsFile}`);
      
      // 验证文件内容是否有效
      try {
        const data = await fs.readFile(accountsFile, 'utf-8');
        const accounts = JSON.parse(data);
        if (!Array.isArray(accounts)) {
          console.warn('⚠️ 账号文件格式错误，修复为空数组');
          await fs.writeFile(accountsFile, JSON.stringify([], null, 2));
        } else {
          console.log(`📋 账号文件包含 ${accounts.length} 个账号`);
        }
      } catch (parseError) {
        console.warn('⚠️ 账号文件解析失败，修复为空数组');
        await fs.writeFile(accountsFile, JSON.stringify([], null, 2));
      }
    } catch (error) {
      // 创建空的账号文件（仅当文件不存在时）
      console.log(`ℹ️ 账号文件不存在，创建空文件: ${accountsFile}`);
      await fs.mkdir(path.dirname(accountsFile), { recursive: true });
      await fs.writeFile(accountsFile, JSON.stringify([], null, 2));
      console.log(`✅ 空的账号文件已创建`);
    }
  } catch (error) {
    console.error(`❗ 初始化配置文件失败:`, error);
  }
}

// 应用准备就绪时初始化配置并创建窗口
app.whenReady().then(async () => {
  await initializeConfigFiles();
  
  createWindow();
});

// 批量获取Token的取消标志
let batchTokenCancelled = false;

// 批量获取所有账号Token
ipcMain.handle('batch-get-all-tokens', async (event) => {
  try {
    console.log('[批量获取Token] 开始批量获取所有账号Token...');
    
    // 重置取消标志
    batchTokenCancelled = false;
    
    // 读取所有账号
    const accountsFilePath = path.normalize(ACCOUNTS_FILE);
    const accountsData = await fs.readFile(accountsFilePath, 'utf-8');
    const accounts = JSON.parse(accountsData);
    
    // 筛选出需要获取Token的账号（有邮箱密码，且Token不存在或已过期）
    const now = Date.now();
    const accountsNeedToken = [];
    const accountsSkipped = [];
    
    accounts.forEach(acc => {
      // 必须有邮箱和密码
      if (!acc.email || !acc.password) {
        return;
      }
      
      // 检查Token是否过期
      const tokenExpired = !acc.idToken || !acc.idTokenExpiresAt || now >= acc.idTokenExpiresAt;
      
      if (tokenExpired) {
        // Token过期或不存在,需要获取
        accountsNeedToken.push(acc);
        const reason = !acc.idToken ? 'Token不存在' : !acc.idTokenExpiresAt ? '缺少过期时间' : 'Token已过期';
        console.log(`[批量获取Token] ✓ ${acc.email} - ${reason}`);
      } else {
        // Token有效,跳过
        accountsSkipped.push(acc);
        const expiresIn = Math.round((acc.idTokenExpiresAt - now) / 1000 / 60);
        console.log(`[批量获取Token] ⊘ ${acc.email} - Token有效 (${expiresIn}分钟后过期)`);
      }
    });
    
    if (accountsNeedToken.length === 0) {
      return {
        success: false,
        error: `没有需要获取Token的账号（${accountsSkipped.length}个账号Token都有效）`
      };
    }
    
    console.log(`[批量获取Token] 需要获取: ${accountsNeedToken.length}个, 跳过: ${accountsSkipped.length}个`);
    
    const AccountLogin = require(path.join(__dirname, 'js', 'accountLogin'));
    const results = [];
    let successCount = 0;
    let failCount = 0;
    
    // 顺序处理每个账号
    for (let i = 0; i < accountsNeedToken.length; i++) {
      // 检查是否被取消
      if (batchTokenCancelled) {
        console.log('[批量获取Token] 用户取消操作');
        break;
      }
      
      const account = accountsNeedToken[i];
      
      // 发送进度更新
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('batch-token-progress', {
          current: i + 1,
          total: accountsNeedToken.length,
          email: account.email,
          status: 'processing'
        });
      }
      
      try {
        console.log(`[批量获取Token] [${i + 1}/${accountsNeedToken.length}] 处理账号: ${account.email}`);
        
        const loginBot = new AccountLogin();
        
        // 日志回调
        const logCallback = (message) => {
          console.log(`[批量获取Token] [${account.email}] ${message}`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('batch-token-log', {
              email: account.email,
              message: message
            });
          }
        };
        
        // 获取Token
        const result = await loginBot.loginAndGetTokens(account, logCallback);
        
        if (result.success && result.account) {
          // 更新账号信息到文件
          const index = accounts.findIndex(acc => acc.id === account.id || acc.email === account.email);
          if (index !== -1) {
            accounts[index] = {
              ...accounts[index],
              ...result.account,
              id: accounts[index].id,
              createdAt: accounts[index].createdAt
            };
          }
          
          successCount++;
          results.push({
            email: account.email,
            success: true
          });
          
          // 发送成功状态
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('batch-token-progress', {
              current: i + 1,
              total: accountsNeedToken.length,
              email: account.email,
              status: 'success'
            });
          }
          
          console.log(`[批量获取Token] [${i + 1}/${accountsNeedToken.length}] ✅ 成功: ${account.email}`);
        } else {
          failCount++;
          results.push({
            email: account.email,
            success: false,
            error: result.error
          });
          
          // 发送失败状态
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('batch-token-progress', {
              current: i + 1,
              total: accountsNeedToken.length,
              email: account.email,
              status: 'failed',
              error: result.error
            });
          }
          
          console.log(`[批量获取Token] [${i + 1}/${accountsNeedToken.length}] ❌ 失败: ${account.email} - ${result.error}`);
        }
        
        // 每个账号之间延迟1秒，避免请求过快
        if (i < accountsNeedToken.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        failCount++;
        results.push({
          email: account.email,
          success: false,
          error: error.message
        });
        
        console.error(`[批量获取Token] [${i + 1}/${accountsNeedToken.length}] ❌ 异常: ${account.email}`, error);
        
        // 发送失败状态
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('batch-token-progress', {
            current: i + 1,
            total: accountsNeedToken.length,
            email: account.email,
            status: 'failed',
            error: error.message
          });
        }
      }
    }
    
    // 保存更新后的账号列表
    await fs.writeFile(accountsFilePath, JSON.stringify(accounts, null, 2), 'utf-8');
    console.log(`[批量获取Token] 账号列表已更新到文件`);
    
    // 发送完成状态
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('batch-token-complete', {
        total: accountsNeedToken.length,
        successCount,
        failCount,
        results
      });
    }
    
    console.log(`[批量获取Token] 完成！成功: ${successCount}, 失败: ${failCount}, 取消: ${batchTokenCancelled}`);
    
    return {
      success: true,
      cancelled: batchTokenCancelled,
      total: accountsNeedToken.length,
      successCount,
      failCount,
      results
    };
    
  } catch (error) {
    console.error('[批量获取Token] 失败:', error);
    return {
      success: false,
      cancelled: batchTokenCancelled,
      error: error.message
    };
  }
});

// 取消批量获取Token
ipcMain.handle('cancel-batch-get-tokens', async () => {
  console.log('[批量获取Token] 收到取消请求');
  batchTokenCancelled = true;
  return { success: true };
});

// 监听退出应用请求
ipcMain.on('quit-app', () => {
  console.log('📢 收到退出应用请求');
  app.quit();
});

app.on('window-all-closed', () => {
  // 清理定时器
  if (versionCheckInterval) {
    clearInterval(versionCheckInterval);
  }
  
  // 清理所有 IPC 监听器
  ipcMain.removeAllListeners('check-version');
  ipcMain.removeAllListeners('set-force-update-status');
  ipcMain.removeAllListeners('quit-app');
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ==================== IPC 安全验证 ====================

// IPC 操作验证函数
function isOperationAllowed(operation) {
  // 如果处于强制更新、维护模式或 API 无法访问状态，阻止大部分操作
  if (isForceUpdateActive || isMaintenanceModeActive || isApiUnavailable) {
    // 允许的操作白名单
    const allowedOperations = [
      'save-language',
      'get-language',
      'check-for-updates',
      'open-download-url',
      'get-file-paths'
    ];
    
    if (!allowedOperations.includes(operation)) {
      console.log(`🚫 操作被阻止: ${operation} (状态: 强制更新=${isForceUpdateActive}, 维护=${isMaintenanceModeActive}, API不可用=${isApiUnavailable})`);
      return false;
    }
  }
  return true;
}

// ==================== 账号管理 ====================

// 保存语言设置
ipcMain.handle('save-language', async (event, language) => {
  try {
    const userDataPath = app.getPath('userData');
    const languageFile = path.join(userDataPath, 'language.json');
    await fs.writeFile(languageFile, JSON.stringify({ language }));
    console.log('语言设置已保存:', language);
    return { success: true };
  } catch (error) {
    console.error('保存语言设置失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取语言设置
ipcMain.handle('get-language', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const languageFile = path.join(userDataPath, 'language.json');
    const data = await fs.readFile(languageFile, 'utf-8');
    const config = JSON.parse(data);
    return { success: true, language: config.language };
  } catch (error) {
    return { success: false, language: 'zh-CN' }; // 默认简体中文
  }
});

// 读取账号列表（使用文件锁）
ipcMain.handle('get-accounts', async () => {
  return await accountsFileLock.acquire(async () => {
    try {
      // 确保目录存在
      await fs.mkdir(path.dirname(ACCOUNTS_FILE), { recursive: true });
      
      try {
        const data = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
        const accounts = JSON.parse(data);
        console.log(`📖 读取账号列表: ${Array.isArray(accounts) ? accounts.length : 0} 个账号`);
        return { success: true, accounts: Array.isArray(accounts) ? accounts : [] };
      } catch (error) {
        console.error('读取账号文件失败:', error);
        return { success: true, accounts: [] };
      }
    } catch (error) {
      console.error('创建账号目录失败:', error);
      return { success: false, error: error.message };
    }
  });
});

// 读取账号列表（别名，用于兼容）
ipcMain.handle('load-accounts', async () => {
  try {
    // 确保目录存在
    await fs.mkdir(path.dirname(ACCOUNTS_FILE), { recursive: true });
    
    try {
      const data = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
      const accounts = JSON.parse(data);
      return { success: true, accounts: Array.isArray(accounts) ? accounts : [] };
    } catch (error) {
      console.error('读取账号文件失败:', error);
      return { success: true, accounts: [] };
    }
  } catch (error) {
    console.error('创建账号目录失败:', error);
    return { success: false, error: error.message };
  }
});

// 添加账号 - 跨平台兼容（使用文件锁）
ipcMain.handle('add-account', async (event, account) => {
  if (!isOperationAllowed('add-account')) {
    return { success: false, error: '当前状态下无法执行此操作' };
  }
  
  return await accountsFileLock.acquire(async () => {
    try {
      // 验证账号数据
      if (!account || !account.email || !account.password) {
        return { success: false, error: '账号数据不完整，缺少邮箱或密码' };
      }
      
      // 规范化路径（跨平台兼容）
      const accountsFilePath = path.normalize(ACCOUNTS_FILE);
      const accountsDir = path.dirname(accountsFilePath);
      
      // 确保目录存在
      await fs.mkdir(accountsDir, { recursive: true });
      console.log(`✅ 账号目录已准备: ${accountsDir}`);
      
      let accounts = [];
      try {
        const data = await fs.readFile(accountsFilePath, 'utf-8');
        accounts = JSON.parse(data);
        if (!Array.isArray(accounts)) {
          console.warn('⚠️ 账号文件格式错误，重置为空数组');
          accounts = [];
        }
      } catch (error) {
        // 文件不存在或无法读取，使用空数组
        console.log('ℹ️ 账号文件不存在，将创建新文件');
      }
      
      // 检查是否已存在相同邮箱
      const existingAccount = accounts.find(acc => acc.email === account.email);
      if (existingAccount) {
        return { success: false, error: `账号 ${account.email} 已存在` };
      }
      
      // 添加ID和创建时间
      account.id = Date.now().toString();
      account.createdAt = new Date().toISOString();
      accounts.push(account);
      
      // 保存文件（使用 UTF-8 编码）
      await fs.writeFile(accountsFilePath, JSON.stringify(accounts, null, 2), { encoding: 'utf-8' });
      console.log(`✅ 账号已添加: ${account.email} (总数: ${accounts.length})`);
      
      return { success: true, account };
    } catch (error) {
      console.error('添加账号失败:', error);
      return { success: false, error: `添加失败: ${error.message}` };
    }
  });
});

// 更新账号 - 跨平台兼容（使用文件锁）
ipcMain.handle('update-account', async (event, accountUpdate) => {
  return await accountsFileLock.acquire(async () => {
    try {
      // 规范化路径
      const accountsFilePath = path.normalize(ACCOUNTS_FILE);
      const accountsDir = path.dirname(accountsFilePath);
      
      // 确保目录存在
      await fs.mkdir(accountsDir, { recursive: true });
      
      try {
        const data = await fs.readFile(accountsFilePath, 'utf-8');
        let accounts = JSON.parse(data);
        
        if (!Array.isArray(accounts)) {
          return { success: false, error: '账号文件格式错误' };
        }
        
        // 检查账号是否存在
        const index = accounts.findIndex(acc => acc.id === accountUpdate.id);
        if (index === -1) {
          return { success: false, error: '账号不存在' };
        }
        
        // 更新账号属性
        accounts[index] = { ...accounts[index], ...accountUpdate, updatedAt: new Date().toISOString() };
        
        // 保存更新后的账号列表
        await fs.writeFile(accountsFilePath, JSON.stringify(accounts, null, 2), { encoding: 'utf-8' });
        console.log(`✅ 账号已更新: ${accounts[index].email} (总数: ${accounts.length})`);
        
        return { 
          success: true, 
          message: '账号更新成功',
          account: accounts[index]
        };
      } catch (error) {
        console.error('读取账号文件失败:', error);
        return { success: false, error: `更新失败: ${error.message}` };
      }
    } catch (error) {
      console.error('更新账号失败:', error);
      return { success: false, error: `更新失败: ${error.message}` };
    }
  });
});

// 删除账号 - 跨平台兼容（使用文件锁）
ipcMain.handle('delete-account', async (event, accountId) => {
  if (!isOperationAllowed('delete-account')) {
    return { success: false, error: '当前状态下无法执行此操作' };
  }
  
  return await accountsFileLock.acquire(async () => {
    try {
      // 规范化路径
      const accountsFilePath = path.normalize(ACCOUNTS_FILE);
      const accountsDir = path.dirname(accountsFilePath);
      
      // 确保目录存在
      await fs.mkdir(accountsDir, { recursive: true });
      
      try {
        const data = await fs.readFile(accountsFilePath, 'utf-8');
        let accounts = JSON.parse(data);
        
        if (!Array.isArray(accounts)) {
          return { success: false, error: '账号文件格式错误' };
        }
        
        // 检查账号是否存在
        const index = accounts.findIndex(acc => acc.id === accountId);
        if (index === -1) {
          return { success: false, error: '账号不存在' };
        }
        
        const deletedEmail = accounts[index].email;
        accounts.splice(index, 1);
        
        await fs.writeFile(accountsFilePath, JSON.stringify(accounts, null, 2), { encoding: 'utf-8' });
        console.log(`✅ 账号已删除: ${deletedEmail} (剩余: ${accounts.length})`);
        
        return { success: true };
      } catch (error) {
        console.error('读取账号文件失败:', error);
        return { success: false, error: `删除失败: ${error.message}` };
      }
    } catch (error) {
      console.error('创建账号目录失败:', error);
      return { success: false, error: `删除失败: ${error.message}` };
    }
  });
});

// 删除全部账号 - 跨平台兼容（使用文件锁）
ipcMain.handle('delete-all-accounts', async () => {
  return await accountsFileLock.acquire(async () => {
    try {
      // 规范化路径
      const accountsFilePath = path.normalize(ACCOUNTS_FILE);
      const accountsDir = path.dirname(accountsFilePath);
      
      // 确保目录存在
      await fs.mkdir(accountsDir, { recursive: true });
      
      try {
        // 先读取当前账号数量（用于日志）
        let oldCount = 0;
        try {
          const data = await fs.readFile(accountsFilePath, 'utf-8');
          const accounts = JSON.parse(data);
          oldCount = Array.isArray(accounts) ? accounts.length : 0;
        } catch (e) {
          // 忽略读取错误
        }
        
        // 写入空数组
        await fs.writeFile(accountsFilePath, JSON.stringify([], null, 2), { encoding: 'utf-8' });
        console.log(`✅ 已删除全部账号 (共 ${oldCount} 个)`);
        return { success: true };
      } catch (error) {
        console.error('写入账号文件失败:', error);
        return { success: false, error: `删除失败: ${error.message}` };
      }
    } catch (error) {
      console.error('创建账号目录失败:', error);
      return { success: false, error: `删除失败: ${error.message}` };
    }
  });
});

// 刷新账号积分信息
ipcMain.handle('refresh-account-credits', async (event, account) => {
  try {
    // 这里返回模拟数据，实际应该调用相应的API获取账号信息
    // 如果有实际的API，可以在这里调用
    
    return {
      success: true,
      subscriptionType: account.type || 'PRO',
      credits: account.credits || 0,
      usage: account.usage || 0,
      message: '账号信息已刷新'
    };
  } catch (error) {
    console.error('刷新账号信息失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 复制到剪贴板
ipcMain.handle('copy-to-clipboard', async (event, text) => {
  try {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
    return {
      success: true
    };
  } catch (error) {
    console.error('复制到剪贴板失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// ==================== 版本管理 ====================

// 手动检查版本更新
ipcMain.handle('check-for-updates', async () => {
  try {
    if (!versionManager) {
      versionManager = new VersionManager();
    }
    
    const updateInfo = await versionManager.checkForUpdates();
    return {
      success: true,
      currentVersion: updateInfo.currentVersion,
      latestVersion: updateInfo.latestVersion,
      hasUpdate: updateInfo.hasUpdate,
      forceUpdate: updateInfo.forceUpdate,
      isSupported: updateInfo.isSupported,
      updateMessage: updateInfo.updateMessage,
      downloadUrl: versionManager.getDownloadUrl()
    };
  } catch (error) {
    console.error('检查版本更新失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 打开下载链接
ipcMain.handle('open-download-url', async (event, downloadUrl) => {
  try {
    if (downloadUrl) {
      await shell.openExternal(downloadUrl);
      return { success: true };
    } else {
      // 如果没有下载链接，打开GitHub发布页面
      await shell.openExternal('https://github.com/crispvibe/Windsurf-Tool/releases/latest');
      return { success: true };
    }
  } catch (error) {
    console.error('打开下载链接失败:', error);
    return { success: false, error: error.message };
  }
});

// 打开外部URL（通用）
ipcMain.handle('open-external-url', async (event, url) => {
  try {
    if (url) {
      await shell.openExternal(url);
      return { success: true };
    } else {
      return { success: false, error: 'URL不能为空' };
    }
  } catch (error) {
    console.error('打开外部URL失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取当前版本信息
ipcMain.handle('get-version-info', async () => {
  try {
    if (!versionManager) {
      versionManager = new VersionManager();
    }
    
    return {
      success: true,
      currentVersion: versionManager.getCurrentVersion(),
      platformName: versionManager.getPlatformName()
    };
  } catch (error) {
    console.error('获取版本信息失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 获取版本检测状态
ipcMain.handle('get-version-check-status', async () => {
  try {
    if (!versionManager) {
      return {
        success: false,
        error: '版本管理器未初始化'
      };
    }
    
    const status = versionManager.getStatus();
    return {
      success: true,
      ...status
    };
  } catch (error) {
    console.error('获取版本检测状态失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 设置版本检测间隔
ipcMain.handle('set-version-check-interval', async (event, interval) => {
  try {
    if (!versionManager) {
      return {
        success: false,
        error: '版本管理器未初始化'
      };
    }
    
    // 验证间隔值（最小1分钟，最大24小时）
    const minInterval = 60 * 1000; // 1分钟
    const maxInterval = 24 * 60 * 60 * 1000; // 24小时
    
    if (interval < minInterval || interval > maxInterval) {
      return {
        success: false,
        error: `检测间隔必须在1分钟到24小时之间`
      };
    }
    
    versionManager.setCheckInterval(interval);
    
    return {
      success: true,
      message: `检测间隔已设置为${interval / 1000 / 60}分钟`
    };
  } catch (error) {
    console.error('设置版本检测间隔失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 注意：维护模式检查已由 versionManager 统一管理
// 删除了重复的 check-maintenance-mode 和 exit-maintenance-mode IPC 处理器
// 所有维护模式状态变化都通过 versionManager 的回调函数通知渲染进程

// ==================== 批量注册 ====================

// 批量注册账号
ipcMain.handle('batch-register', async (event, config) => {
  // 使用 JavaScript 版本注册机器人
  const RegistrationBot = require(path.join(__dirname, 'src', 'registrationBot'));
  console.log('✅ 使用 JavaScript 版本注册机器人');
  
  const bot = new RegistrationBot(config);
  currentRegistrationBot = bot;
  
  try {
    return await bot.batchRegister(config.count, config.threads || 4, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('registration-progress', progress);
      }
    }, (log) => {
      // 发送实时日志到前端
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('registration-log', log);
      }
    });
  } finally {
    currentRegistrationBot = null;
  }
});

// 取消批量注册（跨平台：mac / Windows / Linux）
ipcMain.handle('cancel-batch-register', async () => {
  try {
    const logCallback = (log) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('registration-log', log);
      }
    };

    // 使用统一的 BrowserKiller 工具关闭浏览器进程
    const BrowserKiller = require('./src/registrationBotCancel');
    await BrowserKiller.cancelBatchRegistration(currentRegistrationBot, logCallback);
    
    // 清空当前注册实例
    currentRegistrationBot = null;
    
    return {
      success: true,
      message: '批量注册已取消'
    };
  } catch (error) {
    console.error('取消批量注册失败:', error);
    return {
      success: false,
      message: error.message
    };
  }
});

// 获取当前登录信息（从 vscdb 读取）
ipcMain.handle('get-current-login', async () => {
  try {
    const { AccountSwitcher } = require(path.join(__dirname, 'js', 'accountSwitcher'));
    const account = await AccountSwitcher.getCurrentAccount();
    
    if (account) {
      return {
        success: true,
        email: account.email,
        name: account.name,
        apiKey: account.apiKey,
        planName: account.planName
      };
    }
    
    return { success: false };
  } catch (error) {
    console.error('获取当前登录信息失败:', error);
    return { success: false, error: error.message };
  }
});

// 测试IMAP连接
ipcMain.handle('test-imap', async (event, config) => {
  try {
    const EmailReceiver = require(path.join(__dirname, 'src', 'emailReceiver'));
    const receiver = new EmailReceiver(config);
    return await receiver.testConnection();
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ==================== 账号切换 ====================

// 切换账号
ipcMain.handle('switch-account', async (event, account) => {
  if (!isOperationAllowed('switch-account')) {
    return { success: false, error: '当前状态下无法执行此操作' };
  }
  try {
    const { AccountSwitcher } = require(path.join(__dirname, 'js', 'accountSwitcher'));
    
    const result = await AccountSwitcher.switchAccount(account, (log) => {
      // 发送日志到渲染进程
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('switch-log', log);
      }
    });
    
    return result;
  } catch (error) {
    console.error('切换账号失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 获取当前 Windsurf 登录的账号
ipcMain.handle('get-current-windsurf-account', async () => {
  try {
    const CurrentAccountDetector = require(path.join(__dirname, 'js', 'currentAccountDetector'));
    const account = await CurrentAccountDetector.getCurrentAccount();
    return account;
  } catch (error) {
    console.error('获取当前 Windsurf 账号失败:', error);
    return null;
  }
});

// 获取配置文件路径
ipcMain.handle('get-config-path', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const configFile = path.join(userDataPath, 'windsurf-app-config.json');
    return { success: true, path: configFile };
  } catch (error) {
    console.error('获取配置路径失败:', error);
    return { success: false, error: error.message };
  }
});

// 保存Windsurf配置
ipcMain.handle('save-windsurf-config', async (event, config) => {
  try {
    const userDataPath = app.getPath('userData');
    const configFile = path.join(userDataPath, 'windsurf-app-config.json');
    
    // 确保目录存在
    await fs.mkdir(path.dirname(configFile), { recursive: true });
    
    // 保存配置到文件
    await fs.writeFile(configFile, JSON.stringify(config, null, 2));
    
    console.log(`✅ Windsurf配置已保存 (${process.platform}):`, configFile);
    return { success: true, message: '配置已保存' };
  } catch (error) {
    console.error(`❌ 保存Windsurf配置失败 (${process.platform}):`, error);
    return { success: false, error: error.message };
  }
});

// 读取Windsurf配置
ipcMain.handle('load-windsurf-config', async (event) => {
  try {
    const userDataPath = app.getPath('userData');
    const configFile = path.join(userDataPath, 'windsurf-app-config.json');
    
    try {
      const data = await fs.readFile(configFile, 'utf-8');
      const config = JSON.parse(data);
      console.log(`✅ Windsurf配置已读取 (${process.platform}):`, configFile);
      return { success: true, config };
    } catch (error) {
      // 文件不存在或解析失败，返回默认配置
      console.log(`ℹ️  Windsurf配置文件不存在或无法读取 (${process.platform})，使用默认配置`);
      console.log(`   预期路径: ${configFile}`);
      return { 
        success: true, 
        config: {
          emailDomains: ['example.com'],
          emailConfig: null
        }
      };
    }
  } catch (error) {
    console.error(`❌ 读取Windsurf配置失败 (${process.platform}):`, error);
    return { success: false, error: error.message };
  }
});

// ==================== Windsurf管理器 ====================

// 检测 Windsurf 是否正在运行
ipcMain.handle('check-windsurf-running', async () => {
  try {
    const { WindsurfPathDetector } = require(path.join(__dirname, 'js', 'accountSwitcher'));
    return await WindsurfPathDetector.isRunning();
  } catch (error) {
    console.error('检测 Windsurf 运行状态失败:', error);
    return false;
  }
});

// 关闭 Windsurf
ipcMain.handle('close-windsurf', async () => {
  try {
    const { WindsurfPathDetector } = require(path.join(__dirname, 'js', 'accountSwitcher'));
    await WindsurfPathDetector.closeWindsurf();
    return { success: true };
  } catch (error) {
    console.error('关闭 Windsurf 失败:', error);
    return { success: false, error: error.message };
  }
});

// 完整重置Windsurf
ipcMain.handle('full-reset-windsurf', async (event, customInstallPath = null) => {
  try {
    const machineIdResetter = require(path.join(__dirname, 'src', 'machineIdResetter'));
    
    // 设置日志回调，将日志转发到渲染进程
    machineIdResetter.setLogCallback((log) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('reset-log', log);
      }
    });
    
    // 执行重置
    const result = await machineIdResetter.fullResetWindsurf(customInstallPath);
    
    // 清除日志回调
    machineIdResetter.setLogCallback(null);
    
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 检测 Windsurf 安装路径（Windows）
ipcMain.handle('detect-windsurf-install-path', async () => {
  try {
    const machineIdResetter = require(path.join(__dirname, 'src', 'machineIdResetter'));
    const installPath = await machineIdResetter.detectWindsurfInstallPath();
    return { success: true, installPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});



// ==================== 文件导出 ====================

// 保存文件对话框 - 用于导出功能
ipcMain.handle('save-file-dialog', async (event, options) => {
  try {
    const { content, title, defaultPath, filters } = options;
    
    // 显示保存对话框
    const result = await dialog.showSaveDialog(mainWindow, {
      title: title || '保存文件',
      defaultPath: defaultPath || path.join(app.getPath('documents'), 'export.txt'),
      filters: filters || [{ name: '所有文件', extensions: ['*'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });
    
    if (result.canceled) {
      return { success: false, cancelled: true };
    }
    
    // 写入文件
    const normalizedPath = path.normalize(result.filePath);
    const dir = path.dirname(normalizedPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(normalizedPath, content, { encoding: 'utf-8', flag: 'w' });
    
    console.log(`✅ 文件已保存: ${normalizedPath}`);
    
    return { 
      success: true, 
      filePath: normalizedPath
    };
  } catch (error) {
    console.error('保存文件失败:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// 保存文件 - 跨平台兼容
ipcMain.handle('save-file', async (event, options) => {
  try {
    const { content, filename, filters } = options;
    
    // 规范化文件名，移除不合法字符
    const sanitizedFilename = filename.replace(/[<>:"\/\\|?*]/g, '_');
    
    // 设置默认保存路径（使用用户主目录）
    const defaultPath = path.join(
      app.getPath('documents'),
      sanitizedFilename
    );
    
    // 显示保存对话框
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultPath,
      filters: filters || [
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });
    
    if (result.canceled) {
      return { success: false, error: '用户取消了保存操作' };
    }
    
    // 规范化路径（跨平台兼容）
    const normalizedPath = path.normalize(result.filePath);
    
    // 确保目录存在
    const dir = path.dirname(normalizedPath);
    await fs.mkdir(dir, { recursive: true });
    
    // 写入文件（使用 UTF-8 编码，兼容 Windows 和 macOS）
    await fs.writeFile(normalizedPath, content, { encoding: 'utf-8', flag: 'w' });
    
    console.log(`✅ 文件已保存: ${normalizedPath}`);
    
    return { 
      success: true, 
      filePath: normalizedPath,
      message: '文件保存成功'
    };
  } catch (error) {
    console.error('保存文件失败:', error);
    return { 
      success: false, 
      error: `保存失败: ${error.message}` 
    };
  }
});

// ==================== Token获取 ====================

// 获取用户数据路径
ipcMain.handle('get-user-data-path', () => {
  try {
    return {
      success: true,
      path: app.getPath('userData')
    };
  } catch (error) {
    console.error('获取用户数据路径失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 获取配置文件和账号文件路径
ipcMain.handle('get-file-paths', () => {
  try {
    const userDataPath = app.getPath('userData');
    const configFile = path.join(userDataPath, 'windsurf-app-config.json');
    const accountsFile = path.join(userDataPath, 'accounts.json');
    
    return {
      success: true,
      paths: {
        userDataPath: userDataPath,
        configFile: configFile,
        accountsFile: accountsFile,
        platform: process.platform
      }
    };
  } catch (error) {
    console.error('获取文件路径失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 登录并获取 Token（用于导入的账号）
ipcMain.handle('login-and-get-tokens', async (event, account) => {
  try {
    const { email, password, id } = account;
    
    if (!email || !password) {
      return { success: false, error: '邮箱或密码不能为空' };
    }
    
    console.log(`[登录获取Token] 开始为账号 ${email} 获取 Token...`);
    
    // 使用 AccountLogin 模块
    const AccountLogin = require(path.join(__dirname, 'js', 'accountLogin'));
    const loginBot = new AccountLogin();
    
    // 日志回调函数（发送到渲染进程）
    const logCallback = (message) => {
      console.log(`[登录获取Token] ${message}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('login-log', message);
      }
    };
    
    // 执行登录并获取 Token
    const result = await loginBot.loginAndGetTokens(account, logCallback);
    
    if (result.success && result.account) {
      // 更新账号信息到 JSON 文件
      const accountsFilePath = path.normalize(ACCOUNTS_FILE);
      const accountsData = await fs.readFile(accountsFilePath, 'utf-8');
      const accounts = JSON.parse(accountsData);
      
      // 查找并更新账号
      const index = accounts.findIndex(acc => acc.id === id || acc.email === email);
      if (index !== -1) {
        // 保留原有的 id 和 createdAt
        accounts[index] = {
          ...accounts[index],
          ...result.account,
          id: accounts[index].id,
          createdAt: accounts[index].createdAt
        };
        
        // 保存到文件
        await fs.writeFile(accountsFilePath, JSON.stringify(accounts, null, 2), 'utf-8');
        console.log(`[登录获取Token] 账号 ${email} 的 Token 已更新到文件`);
      }
    }
    
    return result;
  } catch (error) {
    console.error('[登录获取Token] 失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 获取账号Token（统一使用AccountLogin模块）
ipcMain.handle('get-account-token', async (event, credentials) => {
  try {
    const { email, password } = credentials;
    
    if (!email || !password) {
      return { success: false, error: '邮箱或密码不能为空' };
    }
    
    console.log(`开始获取账号 ${email} 的token...`);
    console.log(`当前平台: ${process.platform}`);
    
    // 使用 AccountLogin 模块（统一的Token获取方案）
    const AccountLogin = require(path.join(__dirname, 'js', 'accountLogin'));
    const loginBot = new AccountLogin();
    
    // 日志回调函数
    const logCallback = (message) => {
      console.log(`[Token获取] ${message}`);
    };
    
    // 执行登录并获取 Token
    const result = await loginBot.loginAndGetTokens({ email, password }, logCallback);
    
    // 转换返回格式以兼容旧的调用方
    if (result.success && result.account) {
      return {
        success: true,
        token: result.account.apiKey,
        email: result.account.email,
        password: password,
        username: result.account.name,
        apiKey: result.account.apiKey,
        refreshToken: result.account.refreshToken,
        account: result.account  // 添加完整的 account 对象
      };
    }
    
    return result;
  } catch (error) {
    console.error('获取token失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Windsurf 账号切换功能已移除

// 导出文件锁供其他模块使用
module.exports = {
  accountsFileLock
};
