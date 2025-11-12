const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

let mainWindow;

// Windsurf配置路径 (macOS)
const WINDSURF_CONFIG = path.join(process.env.HOME, 'Library/Application Support/Windsurf');
const WINDSURF_CACHE = path.join(process.env.HOME, 'Library/Caches/Windsurf');
const ACCOUNTS_FILE = path.join(app.getPath('userData'), 'accounts.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true,
      webviewTag: true
    },
    title: 'Windsurf-Tool',
    show: false // 先不显示，等加载完成
  });

  // 加载完成后显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 监听渲染进程崩溃
  mainWindow.webContents.on('crashed', () => {
    console.error('渲染进程崩溃');
    dialog.showErrorBox('应用崩溃', '渲染进程崩溃，请重启应用');
  });

  // 监听加载失败
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('页面加载失败:', errorCode, errorDescription);
  });

  // 检查是否已选择语言，首次启动显示语言选择界面
  const userDataPath = app.getPath('userData');
  const languageFile = path.join(userDataPath, 'language.json');
  
  fs.access(languageFile)
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


app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

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

// 读取账号列表
ipcMain.handle('get-accounts', async () => {
  try {
    const data = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
});

// 添加账号
ipcMain.handle('add-account', async (event, account) => {
  try {
    let accounts = [];
    try {
      const data = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
      accounts = JSON.parse(data);
    } catch (error) {
      // 文件不存在，使用空数组
    }
    
    account.id = Date.now().toString();
    account.createdAt = new Date().toISOString();
    accounts.push(account);
    
    await fs.writeFile(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    return { success: true, account };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 删除账号
ipcMain.handle('delete-account', async (event, accountId) => {
  try {
    const data = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
    let accounts = JSON.parse(data);
    accounts = accounts.filter(acc => acc.id !== accountId);
    await fs.writeFile(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==================== Windsurf管理 ====================

// 清除Windsurf缓存和配置
ipcMain.handle('clear-windsurf', async () => {
  try {
    const commands = [
      `rm -rf "${WINDSURF_CONFIG}"`,
      `rm -rf "${WINDSURF_CACHE}"`
    ];
    
    for (const cmd of commands) {
      try {
        await execPromise(cmd);
      } catch (error) {
        console.log(`清理命令执行: ${cmd}`);
      }
    }
    
    return { success: true, message: 'Windsurf配置已清除' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 切换账号(完整版 - 重置+自动登录)
ipcMain.handle('switch-account', async (event, account) => {
  try {
    const WindsurfManagerFactory = require('./src/windsurfManagerFactory');
    
    // 创建日志回调函数
    const logCallback = (message) => {
      mainWindow.webContents.send('switch-log', message);
    };
    
    const manager = WindsurfManagerFactory.create(logCallback);
    
    // 1. 完整重置Windsurf
    mainWindow.webContents.send('switch-progress', { step: 1, message: '正在重置Windsurf配置...' });
    const resetResult = await manager.fullReset();
    if (!resetResult.success) {
      throw new Error('重置失败: ' + resetResult.error);
    }
    
    // 2. 启动Windsurf
    mainWindow.webContents.send('switch-progress', { step: 2, message: '正在启动Windsurf...' });
    await manager.launchWindsurf();
    
    // 3. 等待Windsurf启动
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 4. 自动登录
    mainWindow.webContents.send('switch-progress', { step: 3, message: '正在自动登录...' });
    const loginResult = await manager.autoLogin(account.email, account.password);
    
    if (!loginResult.success) {
      throw new Error('自动登录失败: ' + loginResult.error);
    }
    
    // 5. 保存当前登录信息
    const loginFile = path.join(app.getPath('userData'), 'current_login.json');
    await fs.writeFile(loginFile, JSON.stringify(account, null, 2));
    
    return { 
      success: true, 
      message: '账号切换成功!',
      account: {
        email: account.email,
        password: account.password
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 批量注册账号
ipcMain.handle('batch-register', async (event, config) => {
  const RegistrationBot = require('./src/registrationBot');
  const bot = new RegistrationBot(config);
  
  return await bot.batchRegister(config.count, (progress) => {
    mainWindow.webContents.send('registration-progress', progress);
  }, (log) => {
    // 发送实时日志到前端
    mainWindow.webContents.send('registration-log', log);
  });
});

// 获取当前登录信息
ipcMain.handle('get-current-login', async () => {
  try {
    const loginFile = path.join(app.getPath('userData'), 'current_login.json');
    const data = await fs.readFile(loginFile, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
});

// 测试IMAP连接
ipcMain.handle('test-imap', async (event, config) => {
  try {
    const EmailReceiver = require('./src/emailReceiver');
    const receiver = new EmailReceiver(config);
    return await receiver.testConnection();
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ==================== Windsurf管理器 ====================

// 检测Windsurf配置路径
ipcMain.handle('detect-windsurf-paths', async () => {
  try {
    const WindsurfManagerFactory = require('./src/windsurfManagerFactory');
    const manager = WindsurfManagerFactory.create();
    return await manager.detectConfigPaths();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 完整重置Windsurf
ipcMain.handle('full-reset-windsurf', async () => {
  try {
    const WindsurfManagerFactory = require('./src/windsurfManagerFactory');
    const manager = WindsurfManagerFactory.create();
    return await manager.fullReset();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 启动Windsurf
ipcMain.handle('launch-windsurf', async () => {
  try {
    const WindsurfManagerFactory = require('./src/windsurfManagerFactory');
    const manager = WindsurfManagerFactory.create();
    const success = await manager.launchWindsurf();
    return { success };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 自动登录Windsurf
ipcMain.handle('auto-login-windsurf', async (event, credentials) => {
  try {
    const WindsurfManagerFactory = require('./src/windsurfManagerFactory');
    const manager = WindsurfManagerFactory.create();
    return await manager.autoLogin(credentials.email, credentials.password);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 浏览器自动登录
ipcMain.handle('browser-auto-login', async (event, credentials) => {
  try {
    const BrowserAutomation = require('./src/browserAutomation');
    const browser = new BrowserAutomation();
    
    const result = await browser.autoLogin(credentials.email, credentials.password);
    
    // 登录完成后延迟关闭浏览器
    setTimeout(async () => {
      await browser.close();
    }, 10000);
    
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 完整自动化切换账号(包含浏览器登录) - 改进版
ipcMain.handle('full-auto-switch', async (event, account) => {
  let browser = null;
  
  try {
    console.log('========================================');
    console.log('开始完整自动化切换');
    console.log(`账号: ${account.email}`);
    console.log('========================================');
    
    const WindsurfManagerFactory = require('./src/windsurfManagerFactory');
    const BrowserAutomation = require('./src/browserAutomation');
    
    // 创建日志回调函数
    const logCallback = (message) => {
      mainWindow.webContents.send('switch-log', message);
    };
    
    const manager = WindsurfManagerFactory.create(logCallback);
    
    // 步骤1: 完整重置Windsurf
    mainWindow.webContents.send('switch-progress', { 
      step: 1, 
      message: '正在重置Windsurf配置和机器码...' 
    });
    logCallback('\n========== 步骤1: 重置Windsurf ==========');
    const resetResult = await manager.fullReset();
    if (!resetResult.success) {
      throw new Error('重置失败: ' + resetResult.error);
    }
    logCallback('✅ Windsurf重置完成\n');
    
    // 步骤2: 准备浏览器自动化
    mainWindow.webContents.send('switch-progress', { 
      step: 2, 
      message: '准备浏览器自动化（Puppeteer）...' 
    });
    logCallback('\n========== 步骤2: 准备浏览器自动化 ==========');
    logCallback('✅ 将连接到系统默认浏览器（Puppeteer）\n');
    
    // 步骤3: 启动Windsurf并完成初始设置
    mainWindow.webContents.send('switch-progress', { 
      step: 3, 
      message: '正在启动Windsurf并完成初始设置...' 
    });
    logCallback('\n========== 步骤3: 启动Windsurf ==========');
    const loginResult = await manager.autoLogin(account.email, account.password);
    if (!loginResult.success) {
      logCallback('⚠️  Windsurf启动出现问题，但继续执行');
    } else {
      logCallback('✅ Windsurf已启动，将自动打开登录页面\n');
    }

    // 步骤4: 使用 Puppeteer 自动化浏览器登录
    mainWindow.webContents.send('switch-progress', { 
      step: 4, 
      message: '正在自动填写登录信息（Puppeteer）...' 
    });
    logCallback('\n========== 步骤4: 浏览器自动登录（Puppeteer） ==========');

    try {
      // 使用 Puppeteer 自动化浏览器操作
      const autoFillResult = await browser.autoLogin(account.email, account.password, logCallback);
      if (autoFillResult.success) {
        logCallback('✅ 登录信息已自动填写');
        logCallback('💡 等待登录完成...');
      } else {
        logCallback('⚠️  自动填写失败: ' + autoFillResult.error);
        logCallback('💡 请手动在浏览器中完成登录');
        logCallback(`📧 邮箱: ${account.email}`);
        logCallback(`🔑 密码: ${account.password}`);
      }
    } catch (error) {
      logCallback('⚠️  浏览器自动化出错: ' + error.message);
      logCallback('💡 请手动在浏览器中完成登录');
      logCallback(`📧 邮箱: ${account.email}`);
      logCallback(`🔑 密码: ${account.password}`);
    }

    // 保存当前登录信息
    const loginFile = path.join(app.getPath('userData'), 'current_login.json');
    await fs.writeFile(loginFile, JSON.stringify(account, null, 2));
    
    logCallback('\n========================================');
    logCallback('✅ 账号切换流程完成！');
    logCallback('========================================');
    
    // 不需要关闭浏览器，使用的是系统默认浏览器
    
    return { 
      success: true, 
      message: '账号切换流程完成！请检查Windsurf是否已登录。',
      account: {
        email: account.email,
        password: account.password
      }
    };
    
  } catch (error) {
    console.error('完整自动化切换失败:', error);
    console.error('错误堆栈:', error.stack);
    
    // 不需要关闭浏览器（使用系统默认浏览器）
    
    // 发送错误信息到渲染进程
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('switch-error', {
        message: error.message,
        stack: error.stack
      });
    }
    
    return { 
      success: false, 
      error: error.message,
      details: error.stack
    };
  }
});
