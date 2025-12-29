const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// 修复 asar 中 ESM 模块动态导入问题
// 将解压的 node_modules 添加到模块搜索路径
const Module = require('module');

// 计算 asar.unpacked 的路径
const isPackaged = __dirname.includes('app.asar');
const unpackedNodeModules = isPackaged 
  ? path.join(__dirname, '..', 'app.asar.unpacked', 'node_modules')
  : path.join(__dirname, 'node_modules');

// 将解压的 node_modules 添加到全局模块路径（最高优先级）
if (isPackaged && !Module.globalPaths.includes(unpackedNodeModules)) {
  Module.globalPaths.unshift(unpackedNodeModules);
}

// 同时修改 NODE_PATH 环境变量，影响 ESM 导入
if (isPackaged) {
  const currentNodePath = process.env.NODE_PATH || '';
  process.env.NODE_PATH = unpackedNodeModules + path.delimiter + currentNodePath;
  Module._initPaths();
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  // 如果是 chrome-launcher 相关的导入，尝试从 asar.unpacked 加载
  if (request === 'chrome-launcher' || request.startsWith('chrome-launcher/')) {
    const unpackedPath = path.join(unpackedNodeModules, request);
    try {
      return originalResolveFilename.call(this, unpackedPath, parent, isMain, options);
    } catch (e) {
      // 如果失败，继续使用原始解析
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const accountsFileLock = require('./src/accountsFileLock');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// 处理 EPIPE 错误（管道关闭时的写入错误）
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') return;
  throw err;
});
process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') return;
  throw err;
});

let mainWindow;
// 当前批量注册的机器人实例，用于支持跨平台取消
let currentRegistrationBot = null;

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
        console.log('[初始化] 已复制 Windsurf Local State 到工具目录');
        console.log(`[初始化]    源: ${windsurfLocalState}`);
        console.log(`[初始化]    目标: ${toolLocalState}`);
      } else {
        console.log('[初始化]   Local State 已是最新，无需复制');
      }
    } else {
      console.warn('[初始化] 未找到 Windsurf Local State，加密可能失败');
      console.warn(`[初始化]    期望路径: ${windsurfLocalState}`);
      console.warn('[初始化]    请确保 Windsurf 已安装并至少运行过一次');
    }
  } catch (error) {
    console.error('[初始化] 复制 Local State 失败:', error.message);
  }
}

// 跨平台安全路径获取函数
function getSafePath(base, ...paths) {
  return path.join(base, ...paths);
}

// 应用配置路径
const userDataPath = app.getPath('userData');
const ACCOUNTS_FILE = getSafePath(userDataPath, 'accounts.json');


function createWindow() {
  console.log('开始创建主窗口...');
  console.log('平台:', process.platform);
  console.log('架构:', process.arch);
  console.log('Electron版本:', process.versions.electron);
  console.log('Node版本:', process.versions.node);
  
  const isWin = process.platform === 'win32';
  const isMacOS = process.platform === 'darwin';
  
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
    show: false, // 先不显示，等加载完成
    autoHideMenuBar: !isMacOS // Windows/Linux 自动隐藏菜单栏，按 Alt 显示
    // 注意：移除了 Windows titleBarStyle: 'hidden' 配置，恢复原生标题栏以支持拖拽
  });
  
  console.log('主窗口创建成功');

  // 加载完成后显示窗口
  mainWindow.once('ready-to-show', () => {
    console.log('窗口准备就绪，开始显示');
    mainWindow.show();
  });

  // 监听渲染进程崩溃
  mainWindow.webContents.on('crashed', () => {
    console.error('渲染进程崩溃');
    console.error('平台:', process.platform);
    console.error('时间:', new Date().toISOString());
    dialog.showErrorBox('应用崩溃', '渲染进程崩溃，请重启应用\n\n平台: ' + process.platform + '\n时间: ' + new Date().toLocaleString());
  });

  // 监听加载失败
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('页面加载失败:', errorCode, errorDescription);
    console.error('平台:', process.platform);
    console.error('时间:', new Date().toISOString());
    
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
    console.log('强制更新状态:', status ? '激活' : '关闭');
    
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
      console.log('检测到开发者工具打开，强制关闭');
      mainWindow.webContents.closeDevTools();
      
      // 发送警告到渲染进程
      mainWindow.webContents.send('devtools-blocked', {
        reason: isForceUpdateActive ? '强制更新模式' : isMaintenanceModeActive ? '维护模式' : 'API 无法访问'
      });
    }
  });
  
  // 处理快捷键
  mainWindow.webContents.on('before-input-event', (event, input) => {
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
    
    // 强制更新/维护模式下阻止操作
    if (isForceUpdateActive || isMaintenanceModeActive || isApiUnavailable) {
      if (isRefreshKey || isDevToolsKey) {
        event.preventDefault();
        console.log('已阻止操作:', isRefreshKey ? '刷新' : '开发者工具');
        mainWindow.webContents.send('show-force-update-warning');
      }
    } else {
      // 正常模式下允许刷新
      if (isRefreshKey && input.type === 'keyDown') {
        event.preventDefault();
        mainWindow.webContents.reload();
        console.log('页面已刷新 (Cmd/Ctrl+R)');
      }
    }
  });

  // 直接加载主界面
  mainWindow.loadFile('index.html').catch(err => {
    console.error('加载HTML失败:', err);
    dialog.showErrorBox('加载失败', '无法加载应用界面: ' + err.message);
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
      console.log(`Windsurf配置文件已存在: ${configFile}`);
    } catch (error) {
      // 文件不存在，创建默认配置
      console.log(` 创建默认Windsurf配置文件: ${configFile}`);
      
      // 默认配置
      const defaultConfig = {
        emailDomains: ['example.com'],
        emailConfig: null,
        lastUpdate: new Date().toISOString(),
        platform: process.platform
      };
      
      // 写入默认配置
      await fs.writeFile(configFile, JSON.stringify(defaultConfig, null, 2));
      console.log(`默认Windsurf配置文件已创建`);
    }
    
    // 初始化其他必要的文件
    const accountsFile = path.join(userDataPath, 'accounts.json');
    try {
      await fs.access(accountsFile);
      console.log(`账号文件已存在: ${accountsFile}`);
      
      // 验证文件内容是否有效
      try {
        const data = await fs.readFile(accountsFile, 'utf-8');
        const accounts = JSON.parse(data);
        if (!Array.isArray(accounts)) {
          console.warn('账号文件格式错误，修复为空数组');
          await fs.writeFile(accountsFile, JSON.stringify([], null, 2));
        } else {
          console.log(`账号文件包含 ${accounts.length} 个账号`);
        }
      } catch (parseError) {
        console.warn('账号文件解析失败，修复为空数组');
        await fs.writeFile(accountsFile, JSON.stringify([], null, 2));
      }
    } catch (error) {
      // 创建空的账号文件（仅当文件不存在时）
      console.log(` 账号文件不存在，创建空文件: ${accountsFile}`);
      await fs.mkdir(path.dirname(accountsFile), { recursive: true });
      await fs.writeFile(accountsFile, JSON.stringify([], null, 2));
      console.log(`空的账号文件已创建`);
    }
  } catch (error) {
    console.error(`❗ 初始化配置文件失败:`, error);
  }
}

// 应用准备就绪时初始化配置并创建窗口
app.whenReady().then(async () => {
  await initializeConfigFiles();
  
  // 设置中文菜单（适配 macOS 和 Windows）
  const isMac = process.platform === 'darwin';
  
  const template = [
    // macOS 应用菜单
    ...(isMac ? [{
      label: 'Windsurf Tool',
      submenu: [
        { label: '关于 Windsurf Tool', role: 'about' },
        { type: 'separator' },
        { label: '隐藏 Windsurf Tool', role: 'hide', accelerator: 'Cmd+H' },
        { label: '隐藏其他', role: 'hideOthers', accelerator: 'Cmd+Option+H' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出 Windsurf Tool', role: 'quit', accelerator: 'Cmd+Q' }
      ]
    }] : []),
    // Windows 文件菜单
    ...(!isMac ? [{
      label: '文件',
      submenu: [
        { label: '退出', role: 'quit', accelerator: 'Alt+F4' }
      ]
    }] : []),
    // 编辑菜单（支持复制、粘贴、全选等快捷键）
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo', accelerator: isMac ? 'Cmd+Z' : 'Ctrl+Z' },
        { label: '重做', role: 'redo', accelerator: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y' },
        { type: 'separator' },
        { label: '剪切', role: 'cut', accelerator: isMac ? 'Cmd+X' : 'Ctrl+X' },
        { label: '复制', role: 'copy', accelerator: isMac ? 'Cmd+C' : 'Ctrl+C' },
        { label: '粘贴', role: 'paste', accelerator: isMac ? 'Cmd+V' : 'Ctrl+V' },
        { label: '全选', role: 'selectAll', accelerator: isMac ? 'Cmd+A' : 'Ctrl+A' }
      ]
    },
    // 功能菜单
    {
      label: '功能',
      submenu: [
        {
          label: '检查更新',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('check-for-updates');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'QQ群',
          click: () => shell.openExternal('https://qm.qq.com/q/1W3jvnDoak')
        },
        {
          label: 'GitHub',
          click: () => shell.openExternal('https://github.com/crispvibe/Windsurf-Tool')
        }
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  
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
        console.log(`[批量获取Token] ${acc.email} - ${reason}`);
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
        
        // 发送取消状态，让前端可以关闭弹窗
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('batch-token-complete', {
            total: accountsNeedToken.length,
            successCount,
            failCount,
            cancelled: true,
            results
          });
        }
        
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
            // 只提取可序列化的字段，避免 V8 序列化崩溃
            const safeAccountData = {
              email: result.account.email || '',
              name: result.account.name || '',
              apiKey: result.account.apiKey || '',
              refreshToken: result.account.refreshToken || '',
              idToken: result.account.idToken || '',
              idTokenExpiresAt: result.account.idTokenExpiresAt || 0,
              apiServerUrl: result.account.apiServerUrl || ''
            };
            accounts[index] = {
              ...accounts[index],
              ...safeAccountData,
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
          
          console.log(`[批量获取Token] [${i + 1}/${accountsNeedToken.length}] 成功: ${account.email}`);
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
          
          console.log(`[批量获取Token] [${i + 1}/${accountsNeedToken.length}] 失败: ${account.email} - ${result.error}`);
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
        
        console.error(`[批量获取Token] [${i + 1}/${accountsNeedToken.length}] 异常: ${account.email}`, error);
        
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
      'check-for-updates',
      'open-download-url',
      'get-file-paths'
    ];
    
    if (!allowedOperations.includes(operation)) {
      console.log(`操作被阻止: ${operation} (状态: 强制更新=${isForceUpdateActive}, 维护=${isMaintenanceModeActive}, API不可用=${isApiUnavailable})`);
      return false;
    }
  }
  return true;
}

// ==================== 账号管理 ====================

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
      console.log(`账号目录已准备: ${accountsDir}`);
      
      let accounts = [];
      try {
        const data = await fs.readFile(accountsFilePath, 'utf-8');
        accounts = JSON.parse(data);
        if (!Array.isArray(accounts)) {
          console.warn('账号文件格式错误，尝试从备份恢复');
          // 尝试从备份恢复
          try {
            const backupData = await fs.readFile(accountsFilePath + '.backup', 'utf-8');
            accounts = JSON.parse(backupData);
            console.log('已从备份恢复账号数据');
          } catch (backupError) {
            console.error('备份文件也损坏，重置为空数组');
            accounts = [];
          }
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          // 文件不存在，使用空数组
          console.log(' 账号文件不存在，将创建新文件');
        } else {
          // JSON解析失败，尝试从备份恢复
          console.error('账号文件损坏:', error.message);
          try {
            const backupData = await fs.readFile(accountsFilePath + '.backup', 'utf-8');
            accounts = JSON.parse(backupData);
            console.log('已从备份恢复账号数据');
          } catch (backupError) {
            console.error('无法恢复，使用空数组');
            accounts = [];
          }
        }
      }
      
      // 检查是否已存在相同邮箱（不区分大小写）
      const normalizedEmail = account.email.toLowerCase().trim();
      const existingAccount = accounts.find(acc => 
        acc.email && acc.email.toLowerCase().trim() === normalizedEmail
      );
      if (existingAccount) {
        return { success: false, error: `账号 ${account.email} 已存在` };
      }
      
      // 添加ID和创建时间
      account.id = Date.now().toString();
      account.createdAt = new Date().toISOString();
      accounts.push(account);
      
      // 先创建备份
      if (accounts.length > 0) {
        try {
          await fs.writeFile(accountsFilePath + '.backup', JSON.stringify(accounts, null, 2), { encoding: 'utf-8' });
        } catch (backupError) {
          console.warn('创建备份失败:', backupError.message);
        }
      }
      
      // 保存文件（使用 UTF-8 编码）
      await fs.writeFile(accountsFilePath, JSON.stringify(accounts, null, 2), { encoding: 'utf-8' });
      console.log(`账号已添加: ${account.email} (总数: ${accounts.length})`);
      
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
        console.log(`账号已更新: ${accounts[index].email} (总数: ${accounts.length})`);
        
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

// 更新账号密码 - 仅修改本地保存的密码
ipcMain.handle('update-account-password', async (event, { accountId, newPassword }) => {
  return await accountsFileLock.acquire(async () => {
    try {
      const accountsFilePath = path.normalize(ACCOUNTS_FILE);
      const data = await fs.readFile(accountsFilePath, 'utf-8');
      let accounts = JSON.parse(data);
      
      if (!Array.isArray(accounts)) {
        return { success: false, error: '账号文件格式错误' };
      }
      
      const index = accounts.findIndex(acc => acc.id === accountId);
      if (index === -1) {
        return { success: false, error: '账号不存在' };
      }
      
      // 只更新密码字段
      accounts[index].password = newPassword;
      accounts[index].updatedAt = new Date().toISOString();
      
      await fs.writeFile(accountsFilePath, JSON.stringify(accounts, null, 2), { encoding: 'utf-8' });
      console.log(`账号密码已更新: ${accounts[index].email}`);
      
      return { success: true, message: '密码修改成功' };
    } catch (error) {
      console.error('修改密码失败:', error);
      return { success: false, error: error.message };
    }
  });
});

// 更新账号备注
ipcMain.handle('update-account-note', async (event, accountId, note) => {
  return await accountsFileLock.acquire(async () => {
    try {
      const accountsFilePath = path.normalize(ACCOUNTS_FILE);
      const data = await fs.readFile(accountsFilePath, 'utf-8');
      let accounts = JSON.parse(data);
      
      if (!Array.isArray(accounts)) {
        return { success: false, error: '账号文件格式错误' };
      }
      
      const index = accounts.findIndex(acc => acc.id === accountId);
      if (index === -1) {
        return { success: false, error: '账号不存在' };
      }
      
      // 更新备注字段
      accounts[index].note = note;
      accounts[index].updatedAt = new Date().toISOString();
      
      await fs.writeFile(accountsFilePath, JSON.stringify(accounts, null, 2), { encoding: 'utf-8' });
      console.log(`账号备注已更新: ${accounts[index].email} -> ${note || '(空)'}`);
      
      return { success: true, message: '备注保存成功' };
    } catch (error) {
      console.error('保存备注失败:', error);
      return { success: false, error: error.message };
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
        console.log(`账号已删除: ${deletedEmail} (剩余: ${accounts.length})`);
        
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
        console.log(`已删除全部账号 (共 ${oldCount} 个)`);
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
    console.log(`[刷新积分] 开始刷新账号 ${account.email} 的积分信息...`);
    
    // 使用 AccountQuery 模块获取真实的账号信息
    const AccountQuery = require(path.join(__dirname, 'js', 'accountQuery'));
    const CONSTANTS = require(path.join(__dirname, 'js', 'constants'));
    const axios = require('axios');
    
    // 检查是否有 refreshToken
    if (!account.refreshToken) {
      return {
        success: false,
        error: '账号缺少 refreshToken，无法刷新'
      };
    }
    
    let accessToken;
    let newTokenData = null;
    const now = Date.now();
    const tokenExpired = !account.idToken || !account.idTokenExpiresAt || now >= account.idTokenExpiresAt;
    
    // Step 1: 获取有效的 accessToken
    if (tokenExpired) {
      console.log(`[刷新积分] Token已过期，正在刷新...`);
      try {
        // 通过 Worker 刷新 Token
        const response = await axios.post(
          CONSTANTS.WORKER_URL,
          {
            grant_type: 'refresh_token',
            refresh_token: account.refreshToken,
            api_key: CONSTANTS.FIREBASE_API_KEY
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              // 'X-Secret-Key': CONSTANTS.WORKER_SECRET_KEY  // 已禁用密钥验证
            },
            timeout: CONSTANTS.REQUEST_TIMEOUT
          }
        );
        
        accessToken = response.data.id_token;
        newTokenData = {
          idToken: response.data.id_token,
          idTokenExpiresAt: now + (parseInt(response.data.expires_in) * 1000),
          refreshToken: response.data.refresh_token
        };
        console.log(`[刷新积分] Token刷新成功`);
      } catch (tokenError) {
        console.error(`[刷新积分] Token刷新失败:`, tokenError.message);
        
        // 尝试使用邮箱密码重新登录
        if (account.email && account.password) {
          console.log(`[刷新积分] 尝试使用邮箱密码重新登录...`);
          const AccountLogin = require(path.join(__dirname, 'js', 'accountLogin'));
          const loginBot = new AccountLogin();
          
          const loginResult = await loginBot.loginAndGetTokens({ 
            email: account.email, 
            password: account.password 
          });
          
          if (loginResult.success && loginResult.account) {
            accessToken = loginResult.account.idToken;
            newTokenData = {
              idToken: loginResult.account.idToken,
              idTokenExpiresAt: loginResult.account.idTokenExpiresAt,
              refreshToken: loginResult.account.refreshToken,
              apiKey: loginResult.account.apiKey,
              name: loginResult.account.name,
              apiServerUrl: loginResult.account.apiServerUrl
            };
            console.log(`[刷新积分] 重新登录成功`);
          } else {
            throw new Error(loginResult.error || '重新登录失败');
          }
        } else {
          throw new Error(`Token刷新失败: ${tokenError.message}`);
        }
      }
    } else {
      accessToken = account.idToken;
      console.log(`[刷新积分] 使用本地Token`);
    }
    
    // Step 2: 查询账号使用情况
    console.log(`[刷新积分] 正在查询账号使用情况...`);
    const usageResponse = await axios.post(
      'https://web-backend.windsurf.com/exa.seat_management_pb.SeatManagementService/GetPlanStatus',
      { auth_token: accessToken },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': accessToken,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'x-client-version': 'Chrome/JsCore/11.0.0/FirebaseCore-web'
        },
        timeout: CONSTANTS.REQUEST_TIMEOUT
      }
    );
    
    const planStatus = usageResponse.data.planStatus || usageResponse.data;
    const promptCredits = Math.round((planStatus.availablePromptCredits || 0) / 100);
    const flowCredits = Math.round((planStatus.availableFlowCredits || 0) / 100);
    const flexCredits = Math.round((planStatus.availableFlexCredits || 0) / 100);
    const totalCredits = promptCredits + flowCredits + flexCredits;
    // 修复：已使用积分需要计算所有4个字段
    const usedPromptCredits = Math.round((planStatus.usedPromptCredits || 0) / 100);
    // API 不直接返回 usedFlowCredits，需要通过 monthlyFlowCredits - availableFlowCredits 计算
    const monthlyFlowCredits = planStatus.planInfo?.monthlyFlowCredits || 0;
    const usedFlowCredits = Math.round(Math.max(0, monthlyFlowCredits - (planStatus.availableFlowCredits || 0)) / 100);
    const usedFlexCredits = Math.round((planStatus.usedFlexCredits || 0) / 100);
    const usedUsageCredits = Math.round((planStatus.usedUsageCredits || 0) / 100);
    const usedCredits = usedPromptCredits + usedFlowCredits + usedFlexCredits + usedUsageCredits;
    const usagePercentage = totalCredits > 0 ? Math.round((usedCredits / totalCredits) * 100) : 0;
    const planName = planStatus.planInfo?.planName || 'Free';
    const expiresAt = planStatus.planEnd || planStatus.expiresAt || null;
    
    console.log(`[刷新积分] 查询成功: ${planName}, 积分: ${totalCredits}, 使用率: ${usagePercentage}%`);
    
    // Step 3: 更新账号信息到 JSON 文件
    const updateData = {
      id: account.id,
      type: planName,
      credits: totalCredits,
      usedCredits: usedCredits,
      totalCredits: totalCredits,
      usage: usagePercentage,
      queryUpdatedAt: new Date().toISOString()
    };
    
    if (expiresAt) {
      updateData.expiresAt = expiresAt;
    }
    
    // 如果刷新了 Token，也保存
    if (newTokenData) {
      updateData.idToken = newTokenData.idToken;
      updateData.idTokenExpiresAt = newTokenData.idTokenExpiresAt;
      updateData.refreshToken = newTokenData.refreshToken;
      if (newTokenData.apiKey) updateData.apiKey = newTokenData.apiKey;
      if (newTokenData.name) updateData.name = newTokenData.name;
      if (newTokenData.apiServerUrl) updateData.apiServerUrl = newTokenData.apiServerUrl;
    }
    
    // 更新账号文件
    await accountsFileLock.acquire(async () => {
      const accountsFile = path.join(app.getPath('userData'), 'accounts.json');
      let accounts = [];
      try {
        const data = await fs.readFile(accountsFile, 'utf-8');
        accounts = JSON.parse(data);
      } catch (e) {
        console.error('[刷新积分] 读取账号文件失败:', e);
      }
      
      const index = accounts.findIndex(acc => acc.id === account.id || acc.email === account.email);
      if (index !== -1) {
        accounts[index] = { ...accounts[index], ...updateData, updatedAt: new Date().toISOString() };
        await fs.writeFile(accountsFile, JSON.stringify(accounts, null, 2), 'utf-8');
        console.log(`[刷新积分] 账号信息已保存到文件`);
      }
    });
    
    return {
      success: true,
      subscriptionType: planName,
      credits: totalCredits,
      usedCredits: usedCredits,
      usage: usagePercentage,
      expiresAt: expiresAt,
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

// 获取绑卡/支付链接
ipcMain.handle('get-payment-link', async (event, { email, password }) => {
  const axios = require('axios');
  const CONSTANTS = require('./js/constants');
  
  // 使用现有中转服务的 /login 路径
  const FIREBASE_LOGIN_URL = CONSTANTS.WORKER_URL + '/login';
  const WINDSURF_API_BASE = 'https://web-backend.windsurf.com';
  const PRICE_ID = 'price_1NuJObFKuRRGjKOFJVUbaIsJ';
  const SUCCESS_URL = 'https://windsurf.com/billing/payment-success?plan_tier=pro';
  const CANCEL_URL = 'https://windsurf.com/plan?plan_cancelled=true&plan_tier=pro';
  
  // Protobuf 编码函数
  function encodeVarint(value) {
    const result = [];
    while (value > 0x7f) {
      result.push((value & 0x7f) | 0x80);
      value = value >>> 7;
    }
    result.push(value & 0x7f);
    return Buffer.from(result);
  }
  
  function encodeStringField(fieldNumber, value) {
    const tag = (fieldNumber << 3) | 2;
    const data = Buffer.from(value, 'utf-8');
    return Buffer.concat([Buffer.from([tag]), encodeVarint(data.length), data]);
  }
  
  function encodeVarintField(fieldNumber, value) {
    const tag = (fieldNumber << 3) | 0;
    return Buffer.concat([Buffer.from([tag]), encodeVarint(value)]);
  }
  
  try {
    console.log(`[绑卡链接] 开始获取账号 ${email} 的支付链接...`);
    
    // 1. 登录获取 idToken
    const loginResponse = await axios.post(FIREBASE_LOGIN_URL, {
      email,
      password,
      api_key: CONSTANTS.FIREBASE_API_KEY,
      returnSecureToken: true
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    
    if (loginResponse.status !== 200 || !loginResponse.data.idToken) {
      return { success: false, error: '登录失败，请检查账号密码' };
    }
    
    const idToken = loginResponse.data.idToken;
    console.log(`[绑卡链接] 登录成功`);
    
    // 2. 获取用户信息
    const protobufData1 = encodeStringField(1, idToken);
    await axios.post(
      `${WINDSURF_API_BASE}/exa.seat_management_pb.SeatManagementService/GetCurrentUser`,
      protobufData1,
      {
        headers: {
          'Content-Type': 'application/proto',
          'connect-protocol-version': '1',
          'Origin': 'https://windsurf.com'
        },
        timeout: 30000
      }
    );
    
    // 3. 获取预批准
    await axios.post(
      `${WINDSURF_API_BASE}/exa.seat_management_pb.SeatManagementService/GetPreapprovalForUser`,
      protobufData1,
      {
        headers: {
          'Content-Type': 'application/proto',
          'connect-protocol-version': '1',
          'Origin': 'https://windsurf.com'
        },
        timeout: 30000
      }
    );
    
    // 4. 创建订阅，获取支付链接
    const subscribeData = Buffer.concat([
      encodeStringField(1, idToken),
      encodeStringField(2, PRICE_ID),
      encodeStringField(4, SUCCESS_URL),
      encodeStringField(5, CANCEL_URL),
      encodeVarintField(8, 2),
      encodeVarintField(9, 1)
    ]);
    
    const subscribeResponse = await axios.post(
      `${WINDSURF_API_BASE}/exa.seat_management_pb.SeatManagementService/SubscribeToPlan`,
      subscribeData,
      {
        headers: {
          'Content-Type': 'application/proto',
          'connect-protocol-version': '1',
          'Origin': 'https://windsurf.com'
        },
        timeout: 30000,
        responseType: 'arraybuffer'
      }
    );
    
    if (subscribeResponse.status !== 200) {
      return { success: false, error: '获取支付链接失败（可能已是Pro账号）' };
    }
    
    // 5. 解析响应，提取 Stripe 链接
    let responseText;
    try {
      // 尝试 base64 解码
      responseText = Buffer.from(subscribeResponse.data).toString('base64');
      responseText = Buffer.from(responseText, 'base64').toString('utf-8');
    } catch {
      responseText = Buffer.from(subscribeResponse.data).toString('utf-8');
    }
    
    // 直接从原始数据中查找链接
    const rawText = Buffer.from(subscribeResponse.data).toString('utf-8');
    
    if (rawText.includes('https://checkout.stripe.com')) {
      const start = rawText.indexOf('https://checkout.stripe.com');
      let end = start;
      while (end < rawText.length && rawText.charCodeAt(end) >= 32 && !' \n\r\t'.includes(rawText[end])) {
        end++;
      }
      const paymentLink = rawText.substring(start, end);
      console.log(`[绑卡链接] 成功获取支付链接`);
      return { success: true, paymentLink };
    }
    
    return { success: false, error: '未找到支付链接（可能已是Pro账号）' };
    
  } catch (error) {
    console.error('[绑卡链接] 获取失败:', error.message);
    
    // 网络连接错误处理
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      return { 
        success: false, 
        error: '网络连接失败，请尝试：\n1. 关闭代理/VPN 后重试\n2. 或更换代理节点\n3. 检查网络连接是否正常' 
      };
    }
    
    // 超时错误
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return { 
        success: false, 
        error: '连接超时，请尝试：\n1. 关闭代理/VPN 后重试\n2. 或更换代理节点\n3. 稍后再试' 
      };
    }
    
    if (error.response) {
      if (error.response.status === 409) {
        return { success: false, error: '该账号已开通过试用Pro，无法再次获取绑卡链接' };
      }
      if (error.response.status === 400) {
        return { success: false, error: '账号已是Pro，无需绑卡' };
      }
    }
    return { success: false, error: error.message };
  }
});

// // 自动填写支付表单
// ipcMain.handle('auto-fill-payment', async (event, { paymentLink, card, billing }) => {
//   let browser = null;
  
//   try {
//     console.log('[自动填写] 开始自动填写支付表单...');

//     // 查找 Chrome 浏览器路径
//     const os = require('os');
//     const fsSync = require('fs');

//     // 动态导入 rebrowser-puppeteer-core (项目使用的 puppeteer 版本)
//     let puppeteer;
//     try {
//       // 优先使用打包后的解压路径
//       const resourcesPath = process.resourcesPath || path.join(__dirname, '..');
//       const unpackedPath = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'rebrowser-puppeteer-core');
//       if (fsSync.existsSync(unpackedPath)) {
//         puppeteer = require(unpackedPath);
//       } else {
//         puppeteer = require('rebrowser-puppeteer-core');
//       }
//     } catch (e) {
//       // 如果没有 rebrowser-puppeteer-core，尝试使用 puppeteer-core
//       try {
//         puppeteer = require('puppeteer-core');
//       } catch (e2) {
//         return { success: false, error: '未安装 puppeteer，请检查依赖是否完整' };
//       }
//     }
//     const platform = os.platform();

//     let chromePath = null;
//     if (platform === 'darwin') {
//       // macOS
//       const possiblePaths = [
//         '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
//         '/Applications/Chromium.app/Contents/MacOS/Chromium',
//         `${os.homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
//       ];
//       chromePath = possiblePaths.find(p => fsSync.existsSync(p));
//     } else if (platform === 'win32') {
//       // Windows
//       const possiblePaths = [
//         'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
//         'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
//         `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
//       ];
//       chromePath = possiblePaths.find(p => fsSync.existsSync(p));
//     } else {
//       // Linux
//       const possiblePaths = [
//         '/usr/bin/google-chrome',
//         '/usr/bin/chromium-browser',
//         '/usr/bin/chromium'
//       ];
//       chromePath = possiblePaths.find(p => fsSync.existsSync(p));
//     }

//     if (!chromePath) {
//       return { success: false, error: '未找到 Chrome 浏览器，请确保已安装' };
//     }

//     console.log('[自动填写] Chrome 路径:', chromePath);

//     // 启动浏览器
//     browser = await puppeteer.launch({
//       executablePath: chromePath,
//       headless: false,
//       defaultViewport: null,
//       args: [
//         '--no-sandbox',
//         '--disable-setuid-sandbox',
//         '--disable-blink-features=AutomationControlled',
//         '--disable-infobars',
//         '--start-maximized'
//       ]
//     });

//     const page = await browser.newPage();

//     // 延迟函数（替代已废弃的 waitForTimeout）
//     const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

//     // 设置 User-Agent
//     await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

//     // 发送日志到渲染进程的函数
//     const sendLog = (msg) => {
//       console.log(msg);
//       if (mainWindow && !mainWindow.isDestroyed()) {
//         mainWindow.webContents.send('auto-fill-log', msg);
//       }
//     };

//     // 打开支付链接
//     sendLog('[自动填写] 打开支付页面...');
//     await page.goto(paymentLink, { waitUntil: 'domcontentloaded', timeout: 60000 });

//     // 等待页面完全加载
//     sendLog('[自动填写] 等待页面完全加载...');
//     await delay(5000);

//     // 等待关键元素出现
//     sendLog('[自动填写] 等待支付表单加载...');
//     try {
//       // 等待银行卡按钮出现
//       await page.waitForSelector('button[data-testid="card-accordion-item-button"]', { timeout: 30000, visible: true });
//       sendLog('[自动填写] 支付表单已加载');
//     } catch (e) {
//       sendLog('[自动填写] 等待超时，继续尝试...');
//     }

//     await delay(3000);

//     // 点击银行卡支付选项
//     sendLog('[自动填写] 点击银行卡选项...');
//     try {
//       // 尝试多种选择器点击银行卡选项
//       const clicked = await page.evaluate(() => {
//         // 多种可能的选择器
//         const selectors = [
//           // Accordion 按钮
//           'button[data-testid="card-accordion-item-button"]',
//           'button[aria-label*="银行卡"]',
//           'button[aria-label*="Card"]',
//           // 包含"银行卡"文字的可点击元素
//           '[class*="Accordion"] button',
//           // 单选按钮样式
//           'input[type="radio"][value*="card"]',
//           'label:has(input[type="radio"])',
//           // 通过文本内容查找
//         ];
        
//         for (const sel of selectors) {
//           try {
//             const el = document.querySelector(sel);
//             if (el) {
//               el.click();
//               return sel;
//             }
//           } catch (e) {}
//         }
        
//         // 尝试通过文本内容查找"银行卡"
//         const allElements = document.querySelectorAll('button, div[role="button"], label, [class*="Accordion"]');
//         for (const el of allElements) {
//           if (el.textContent && el.textContent.includes('银行卡')) {
//             el.click();
//             return 'text:银行卡';
//           }
//         }
        
//         return null;
//       });
      
//       if (clicked) {
//         sendLog(`[自动填写] 已点击: ${clicked}`);
//       } else {
//         sendLog('[自动填写] 未找到银行卡选项，尝试直接填写');
//       }
      
//       // 等待展开动画
//       await delay(3000);
      
//     } catch (e) {
//       sendLog('[自动填写] 点击失败: ' + e.message);
//     }

//     // 等待卡片输入区域加载
//     await delay(3000);

//     // 获取所有 iframe 并尝试在其中填写
//     sendLog('[自动填写] 填写卡片信息...');

//     const frames = page.frames();
//     sendLog(`[自动填写] 找到 ${frames.length} 个 frame`);

//     let cardFilled = false, expFilled = false, cvvFilled = false;

//     for (const frame of frames) {
//       try {
//         // 卡号
//         if (!cardFilled) {
//           for (const sel of ['input[name="cardnumber"]', 'input[autocomplete="cc-number"]', 'input[data-elements-stable-field-name="cardNumber"]']) {
//             const el = await frame.$(sel);
//             if (el) {
//               await el.click();
//               await delay(100);
//               await el.type(card.cardNumber, { delay: 20 });
//               sendLog('[自动填写] ✓ 卡号已填写');
//               cardFilled = true;
//               break;
//             }
//           }
//         }
        
//         // 有效期
//         if (!expFilled) {
//           for (const sel of ['input[name="exp-date"]', 'input[autocomplete="cc-exp"]', 'input[data-elements-stable-field-name="cardExpiry"]']) {
//             const el = await frame.$(sel);
//             if (el) {
//               await el.click();
//               await delay(100);
//               await el.type(`${card.month}${card.year}`, { delay: 20 });
//               sendLog('[自动填写] ✓ 有效期已填写');
//               expFilled = true;
//               break;
//             }
//           }
//         }
        
//         // CVV (确保3位)
//         if (!cvvFilled) {
//           const cvv3 = String(card.cvv).padStart(3, '0');
//           for (const sel of ['input[name="cvc"]', 'input[autocomplete="cc-csc"]', 'input[data-elements-stable-field-name="cardCvc"]']) {
//             const el = await frame.$(sel);
//             if (el) {
//               await el.click();
//               await delay(100);
//               await el.type(cvv3, { delay: 20 });
//               sendLog(`[自动填写] ✓ CVV已填写: ${cvv3}`);
//               cvvFilled = true;
//               break;
//             }
//           }
//         }
//       } catch (e) {}
//     }

//     sendLog(`[自动填写] 卡片: 卡号=${cardFilled}, 有效期=${expFilled}, CVV=${cvvFilled}`);

//     // 填写账单信息
//     sendLog('[自动填写] 填写账单信息...');
//     try {
//       await page.type('input[name="billingName"], input[placeholder*="Name"]', billing.name, { delay: 30 });
//       sendLog('[自动填写] ✓ 姓名已填写');
//     } catch (e) {}

//     try {
//       // 国家选择
//       await page.select('select[name="billingCountry"]', billing.country);
//     } catch (e) {}

//     // 等待国家选择后的页面更新
//     await delay(1000);

//     try {
//       // 省/州选择
//       const province = billing.province || billing.state;
//       if (province) {
//         sendLog(`[自动填写] 选择省份: ${province}`);
//         await page.select('select[id="billingAdministrativeArea"], select[name="billingAdministrativeArea"]', province);
//         sendLog('[自动填写] ✓ 省份已选择');
//       }
//     } catch (e) {
//       sendLog('[自动填写] 省份选择失败: ' + e.message);
//     }

//     try {
//       // 城市
//       if (billing.city) {
//         await page.type('input[name="billingLocality"], input[id="billingLocality"]', billing.city, { delay: 30 });
//         sendLog('[自动填写] ✓ 城市已填写');
//       }
//     } catch (e) {}

//     try {
//       // 地区
//       if (billing.district) {
//         await page.type('input[id="billingDependentLocality"], input[name="billingDependentLocality"]', billing.district, { delay: 30 });
//         sendLog('[自动填写] ✓ 地区已填写');
//       }
//     } catch (e) {}

//     try {
//       // 地址
//       if (billing.address) {
//         await page.type('input[name="billingAddressLine1"], input[id="billingAddressLine1"]', billing.address, { delay: 30 });
//         sendLog('[自动填写] ✓ 地址已填写');
//       }
//     } catch (e) {}

//     try {
//       // 地址第2行
//       if (billing.address2) {
//         await page.type('input[id="billingAddressLine2"], input[name="billingAddressLine2"]', billing.address2, { delay: 30 });
//       }
//     } catch (e) {}

//     try {
//       // 邮编
//       if (billing.postalCode) {
//         await page.type('input[name="billingPostalCode"], input[id="billingPostalCode"]', billing.postalCode, { delay: 30 });
//         sendLog('[自动填写] ✓ 邮编已填写');
//       }
//     } catch (e) {}

//     console.log('[自动填写] 填写完成，请手动确认并提交');

//     // 不关闭浏览器，让用户确认并提交
//     return { success: true };

//   } catch (error) {
//     console.error('[自动填写] 失败:', error.message);
//     if (browser) {
//       try { await browser.close(); } catch (e) {}
//     }
//     return { success: false, error: error.message };
//   }
// });


// // ==================== 批量注册 ====================

// // 批量注册账号
// ipcMain.handle('batch-register', async (event, config) => {
//   // 使用 JavaScript 版本注册机器人
//   const RegistrationBot = require(path.join(__dirname, 'src', 'registrationBot'));
//   console.log('使用 JavaScript 版本注册机器人');
  
//   // 创建保存账号的回调函数
//   const saveAccountCallback = async (account) => {
//     return await accountsFileLock.acquire(async () => {
//       try {
//         // 验证账号数据
//         if (!account || !account.email || !account.password) {
//           return { success: false, error: '账号数据不完整，缺少邮箱或密码' };
//         }
        
//         // 规范化路径（跨平台兼容）
//         const accountsFilePath = path.normalize(ACCOUNTS_FILE);
//         const accountsDir = path.dirname(accountsFilePath);
        
//         // 确保目录存在
//         await fs.mkdir(accountsDir, { recursive: true });
        
//         let accounts = [];
//         try {
//           const data = await fs.readFile(accountsFilePath, 'utf-8');
//           accounts = JSON.parse(data);
//           if (!Array.isArray(accounts)) {
//             accounts = [];
//           }
//         } catch (error) {
//           if (error.code !== 'ENOENT') {
//             console.error('读取账号文件失败:', error.message);
//           }
//           accounts = [];
//         }
        
//         // 检查是否已存在相同邮箱
//         const normalizedEmail = account.email.toLowerCase().trim();
//         const existingAccount = accounts.find(acc =>
//           acc.email && acc.email.toLowerCase().trim() === normalizedEmail
//         );
//         if (existingAccount) {
//           return { success: false, error: `账号 ${account.email} 已存在` };
//         }
        
//         // 添加ID和创建时间
//         account.id = Date.now().toString();
//         account.createdAt = new Date().toISOString();
//         accounts.push(account);
        
//         // 先创建备份
//         if (accounts.length > 0) {
//           try {
//             await fs.writeFile(accountsFilePath + '.backup', JSON.stringify(accounts, null, 2), { encoding: 'utf-8' });
//           } catch (backupError) {
//             console.warn('创建备份失败:', backupError.message);
//           }
//         }
        
//         // 保存文件
//         await fs.writeFile(accountsFilePath, JSON.stringify(accounts, null, 2), { encoding: 'utf-8' });
//         console.log(`账号已添加: ${account.email} (总数: ${accounts.length})`);
        
//         return { success: true, account };
//       } catch (error) {
//         console.error('添加账号失败:', error);
//         return { success: false, error: `添加失败: ${error.message}` };
//       }
//     });
//   };
  
//   const bot = new RegistrationBot(config, saveAccountCallback);
//   currentRegistrationBot = bot;
  
//   try {
//     return await bot.batchRegister(config.count, config.threads || 4, (progress) => {
//       if (mainWindow && !mainWindow.isDestroyed()) {
//         mainWindow.webContents.send('registration-progress', progress);
//       }
//     }, (log) => {
//       // 同时输出到控制台
//       console.log(log);
//       // 发送实时日志到前端
//       if (mainWindow && !mainWindow.isDestroyed()) {
//         mainWindow.webContents.send('registration-log', { message: log, type: 'info' });
//       }
//     });
//   } finally {
//     currentRegistrationBot = null;
//   }
// });

// // 取消批量注册（跨平台：mac / Windows / Linux）
// ipcMain.handle('cancel-batch-register', async () => {
//   try {
//     const logCallback = (log) => {
//       if (mainWindow && !mainWindow.isDestroyed()) {
//         mainWindow.webContents.send('registration-log', log);
//       }
//     };

//     // 使用统一的 BrowserKiller 工具关闭浏览器进程
//     const BrowserKiller = require('./src/registrationBotCancel');
//     await BrowserKiller.cancelBatchRegistration(currentRegistrationBot, logCallback);

//     // 清空当前注册实例
//     currentRegistrationBot = null;

//     return {
//       success: true,
//       message: '批量注册已取消'
//     };
//   } catch (error) {
//     console.error('取消批量注册失败:', error);
//     return {
//       success: false,
//       message: error.message
//     };
//   }
// });

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
    
    console.log(`Windsurf配置已保存 (${process.platform}):`, configFile);
    return { success: true, message: '配置已保存' };
  } catch (error) {
    console.error(`保存Windsurf配置失败 (${process.platform}):`, error);
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
      console.log(`Windsurf配置已读取 (${process.platform}):`, configFile);
      // 返回统一格式：{ success: true, config: ... }
      return { success: true, config };
    } catch (error) {
      // 文件不存在或解析失败，返回默认配置
      console.log(`  Windsurf配置文件不存在或无法读取 (${process.platform})，使用默认配置`);
      console.log(`   预期路径: ${configFile}`);
      return {
        success: true,
        config: {
          emailDomains: ['example.com'],
          emailConfig: null,
          passwordMode: 'email'
        }
      };
    }
  } catch (error) {
    console.error(`读取Windsurf配置失败 (${process.platform}):`, error);
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
    
    console.log(`文件已保存: ${normalizedPath}`);
    
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
    
    console.log(`文件已保存: ${normalizedPath}`);
    
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
    // 注意：只返回可序列化的纯数据，避免 V8 序列化崩溃
    if (result.success && result.account) {
      // 深拷贝并过滤非序列化字段，防止 IPC 序列化崩溃
      const safeAccount = JSON.parse(JSON.stringify({
        email: result.account.email || '',
        name: result.account.name || '',
        apiKey: result.account.apiKey || '',
        refreshToken: result.account.refreshToken || '',
        idToken: result.account.idToken || '',
        idTokenExpiresAt: result.account.idTokenExpiresAt || 0,
        apiServerUrl: result.account.apiServerUrl || ''
      }));
      
      return {
        success: true,
        token: safeAccount.apiKey,
        email: safeAccount.email,
        password: password,
        username: safeAccount.name,
        apiKey: safeAccount.apiKey,
        refreshToken: safeAccount.refreshToken,
        account: safeAccount
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
