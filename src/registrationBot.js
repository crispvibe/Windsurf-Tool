const { connect } = require('puppeteer-real-browser');
const { app } = require('electron'); // 导入electron的app模块
const os = require('os'); // 导入os模块

class RegistrationBot {
  constructor(config) {
    this.config = config;
    // 自定义域名邮箱列表
    this.emailDomains = config.emailDomains || ['example.com'];
    // 邮箱编号计数器(1-999)
    this.emailCounter = 1;
    // 取消标志
    this.isCancelled = false;
    // Chrome 路径缓存
    this.chromePathCache = null;
  }

  /**
   * 生成域名邮箱
   * 格式: 编号(1-999) + 随机字母数字组合
   */
  async generateTempEmail() {
    // 获取当前编号
    const number = this.emailCounter;
    
    // 生成随机字母数字组合(8位)
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let randomStr = '';
    for (let i = 0; i < 8; i++) {
      randomStr += chars[Math.floor(Math.random() * chars.length)];
    }
    
    // 组合用户名: 编号 + 随机字符串
    const username = `${number}${randomStr}`;
    
    // 随机选择配置的域名
    const randomIndex = Math.floor(Math.random() * this.emailDomains.length);
    const domain = this.emailDomains[randomIndex];
    
    // 递增计数器(1-999循环)
    this.emailCounter++;
    if (this.emailCounter > 999) {
      this.emailCounter = 1;
    }
    
    return `${username}@${domain}`;
  }

  /**
   * 获取邮箱验证码（使用本地EmailReceiver）
   * 支持重试机制：最多重试2次，每次间隔20秒
   */
  async getVerificationCode(email, maxWaitTime = 90000) {
    // 检查取消标志
    if (this.isCancelled) {
      throw new Error('注册已取消');
    }
    
    const emailConfig = this.config.emailConfig;
    
    if (!emailConfig) {
      throw new Error('未配置邮箱 IMAP 信息，请先在"配置"页面正确填写 QQ 邮箱账号和授权码');
    }
    
    const EmailReceiver = require('./emailReceiver');
    // 将批量注册的日志回调传入 EmailReceiver，便于在前端实时看到详细 IMAP 日志
    const receiver = new EmailReceiver(emailConfig, this.logCallback);
    
    const MAX_RETRIES = 2;
    const RETRY_DELAY = 20000; // 20秒
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // 每次重试前检查取消标志
      if (this.isCancelled) {
        throw new Error('注册已取消');
      }
      
      try {
        if (this.logCallback) {
          this.logCallback(`第 ${attempt} 次尝试获取验证码（QQ 邮箱 IMAP）...`);
        }
        console.log(`[尝试 ${attempt}/${MAX_RETRIES}] 等待 ${email} 的验证码邮件...`);
        
        const code = await receiver.getVerificationCode(email, maxWaitTime);
        
        if (code) {
          if (this.logCallback) {
            this.logCallback(`成功获取验证码: ${code}`);
          }
          return code;
        }
      } catch (error) {
        console.error(`[尝试 ${attempt}/${MAX_RETRIES}] 获取验证码失败:`, error.message);
        if (this.logCallback) {
          this.logCallback(`获取验证码失败（第 ${attempt}/${MAX_RETRIES} 次）：${error.message}`);
        }
        
        if (attempt < MAX_RETRIES) {
          if (this.logCallback) {
            this.logCallback(`第 ${attempt} 次获取失败，${RETRY_DELAY/1000} 秒后将重试...`);
          }
          console.log(`等待 ${RETRY_DELAY/1000} 秒后重试...`);
          await this.sleep(RETRY_DELAY);
        } else {
          if (this.logCallback) {
            this.logCallback(`已重试 ${MAX_RETRIES} 次，仍未获取到验证码，请检查 QQ 邮箱 IMAP 配置、授权码和邮件是否正常发送`);
          }
          throw new Error(`获取验证码失败，已重试 ${MAX_RETRIES} 次: ${error.message}`);
        }
      }
    }
    
    throw new Error('获取验证码失败，已达到最大重试次数');
  }


  /**
   * 生成随机密码
   * 包含大小写字母、数字和符号，长度12-16位
   */
  generateRandomPassword() {
    const length = Math.floor(Math.random() * 5) + 12; // 12-16位
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const allChars = uppercase + lowercase + numbers + symbols;
    
    let password = '';
    
    // 确保至少包含一个大写字母
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    // 确保至少包含一个小写字母
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    // 确保至少包含一个数字
    password += numbers[Math.floor(Math.random() * numbers.length)];
    // 确保至少包含一个符号
    password += symbols[Math.floor(Math.random() * symbols.length)];
    
    // 填充剩余长度
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // 打乱密码字符顺序
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * 生成随机英文名
   */
  generateRandomName() {
    const firstNames = [
      'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles',
      'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen',
      'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth',
      'Emily', 'Ashley', 'Kimberly', 'Melissa', 'Donna', 'Michelle', 'Dorothy', 'Carol', 'Amanda', 'Betty'
    ];
    
    const lastNames = [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
      'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White',
      'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott',
      'Green', 'Baker', 'Adams', 'Nelson', 'Hill', 'Carter', 'Mitchell', 'Roberts', 'Turner', 'Phillips'
    ];
    
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    
    return { firstName, lastName };
  }

  /**
   * 输出日志(同时发送到前端)
   */
  log(message) {
    console.log(message);
    if (this.logCallback) {
      this.logCallback(message);
    }
  }

  /**
   * 检测Chrome浏览器路径（跨平台，带缓存）
   */
  detectChromePath() {
    // 使用缓存，避免重复检测
    if (this.chromePathCache !== null) {
      return this.chromePathCache;
    }
    
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');
    const platform = os.platform();
    
    let detectedPath = null;
    
    if (platform === 'win32') {
      detectedPath = this.detectChromePathWindows(fs, path, execSync);
    } else if (platform === 'darwin') {
      detectedPath = this.detectChromePathMac(fs, path);
    }
    
    // 缓存结果
    this.chromePathCache = detectedPath;
    
    if (!detectedPath) {
      this.log('未找到 Chrome 浏览器，将使用系统默认路径');
    }
    
    return detectedPath;
  }

  /**
   * Windows Chrome 检测（优化版：快速 + 全面）
   */
  detectChromePathWindows(fs, path, execSync) {
    const checkedPaths = new Set(); // 全局去重，避免重复检测
    
    // 辅助函数：验证 Chrome 路径
    const validateChrome = (chromePath) => {
      try {
        if (!chromePath || checkedPaths.has(chromePath)) {
          return false;
        }
        checkedPaths.add(chromePath);
        
        if (fs.existsSync(chromePath)) {
          const stats = fs.statSync(chromePath);
          if (stats.isFile() && stats.size > 0) {
            this.log(`✓ 找到 Chrome: ${chromePath}`);
            return true;
          }
        }
      } catch (e) {
        // 忽略错误
      }
      return false;
    };

    // ========== 方法1: WHERE 命令（最快） ==========
    try {
      const whereResult = execSync('where chrome', { 
        encoding: 'utf8', 
        timeout: 2000,
        stdio: ['pipe', 'pipe', 'ignore']
      });
      
      // 遍历所有返回的路径
      const chromePaths = whereResult.split('\n').map(p => p.trim()).filter(p => p);
      for (const chromePath of chromePaths) {
        if (validateChrome(chromePath)) {
          return chromePath;
        }
      }
    } catch (e) {
      // WHERE 命令失败，继续其他方法
    }

    // ========== 方法2: 注册表检测（最可靠） ==========
    const registryPaths = [
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
      'HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe'
    ];
    
    for (const regPath of registryPaths) {
      try {
        const result = execSync(`reg query "${regPath}" /ve`, { 
          encoding: 'utf8', 
          timeout: 2000,
          stdio: ['pipe', 'pipe', 'ignore']
        });
        
        const match = result.match(/REG_SZ\s+(.+)/);
        if (match && match[1]) {
          const chromePath = match[1].trim();
          if (validateChrome(chromePath)) {
            return chromePath;
          }
        }
      } catch (e) {
        // 继续下一个注册表路径
      }
    }

    // ========== 方法3: 常见路径快速检测 ==========
    const quickPaths = [];
    
    // 用户级安装（最常见）
    if (process.env.LOCALAPPDATA) {
      quickPaths.push(path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
    
    // 系统级安装
    if (process.env.PROGRAMFILES) {
      quickPaths.push(path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
    if (process.env['PROGRAMFILES(X86)']) {
      quickPaths.push(path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
    
    // 快速检测常见路径
    for (const chromePath of quickPaths) {
      if (validateChrome(chromePath)) {
        return chromePath;
      }
    }

    // ========== 方法4: 多盘符扫描（兜底） ==========
    // 只扫描 C-H 盘（跳过 A/B 软盘）
    const driveLetters = ['C', 'D', 'E', 'F', 'G', 'H'];
    let needsScan = false;
    
    for (const drive of driveLetters) {
      const drivePath = `${drive}:\\`;
      
      // 快速检查盘符是否存在
      try {
        if (!fs.existsSync(drivePath)) continue;
      } catch (e) {
        continue;
      }
      
      if (!needsScan) {
        this.log('常见路径未找到，开始扫描其他磁盘...');
        needsScan = true;
      }
      
      // 常见自定义安装位置（包含 Program Files）
      const customPaths = [
        // 标准位置
        path.join(drivePath, 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(drivePath, 'Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        // 自定义位置
        path.join(drivePath, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(drivePath, 'Programs', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(drivePath, 'Program', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(drivePath, 'Software', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(drivePath, 'Apps', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(drivePath, 'Chrome', 'Application', 'chrome.exe'),
        path.join(drivePath, 'Tools', 'Chrome', 'Application', 'chrome.exe'),
        // Chromium 变体
        path.join(drivePath, 'Chromium', 'Application', 'chrome.exe')
      ];
      
      // 检测自定义路径
      for (const chromePath of customPaths) {
        if (validateChrome(chromePath)) {
          return chromePath;
        }
      }
    }
    
    this.log('⚠ 未找到 Chrome，将使用系统默认路径');
    return null;
  }

  /**
   * Mac Chrome 检测（优化版）
   */
  detectChromePathMac(fs, path) {
    const { execSync } = require('child_process');
    const checkedPaths = new Set();
    
    // 辅助函数：验证 Chrome 路径
    const validateChrome = (chromePath) => {
      try {
        if (!chromePath || checkedPaths.has(chromePath)) {
          return false;
        }
        checkedPaths.add(chromePath);
        
        if (fs.existsSync(chromePath)) {
          const stats = fs.statSync(chromePath);
          if (stats.isFile() && stats.size > 0) {
            this.log(`✓ 找到 Chrome: ${chromePath}`);
            return true;
          }
        }
      } catch (e) {
        // 忽略错误
      }
      return false;
    };

    // ========== 方法1: which 命令（最快） ==========
    try {
      const whichResult = execSync('which chrome', { 
        encoding: 'utf8', 
        timeout: 2000,
        stdio: ['pipe', 'pipe', 'ignore']
      });
      
      const chromePath = whichResult.trim();
      if (validateChrome(chromePath)) {
        return chromePath;
      }
    } catch (e) {
      // which 命令失败，继续其他方法
    }

    // ========== 方法2: mdfind 命令（Spotlight 搜索） ==========
    try {
      const mdfindResult = execSync(
        'mdfind "kMDItemKind == Application && kMDItemDisplayName == \'Google Chrome\'"',
        { 
          encoding: 'utf8', 
          timeout: 3000,
          stdio: ['pipe', 'pipe', 'ignore']
        }
      );
      
      const appPaths = mdfindResult.split('\n').map(p => p.trim()).filter(p => p.endsWith('.app'));
      for (const appPath of appPaths) {
        const chromePath = path.join(appPath, 'Contents', 'MacOS', 'Google Chrome');
        if (validateChrome(chromePath)) {
          return chromePath;
        }
      }
    } catch (e) {
      // mdfind 失败，继续其他方法
    }

    // ========== 方法3: 常见路径检测 ==========
    const possiblePaths = [
      // 系统级安装（最常见）
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      // 用户级安装
      path.join(process.env.HOME || '', 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      // Chromium 变体
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      path.join(process.env.HOME || '', 'Applications', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      // Chrome Canary
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      // Chrome Beta
      '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
      // Chrome Dev
      '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev'
    ];
    
    for (const chromePath of possiblePaths) {
      if (validateChrome(chromePath)) {
        return chromePath;
      }
    }

    // ========== 方法4: 扫描常见安装目录 ==========
    const searchDirs = [
      '/Applications',
      path.join(process.env.HOME || '', 'Applications'),
      '/opt/homebrew-cask/Caskroom',
      '/usr/local/Caskroom'
    ];
    
    for (const dir of searchDirs) {
      try {
        if (!fs.existsSync(dir)) continue;
        
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (item.toLowerCase().includes('chrome') && item.endsWith('.app')) {
            const chromePath = path.join(dir, item, 'Contents', 'MacOS', 'Google Chrome');
            if (validateChrome(chromePath)) {
              return chromePath;
            }
            
            // 尝试其他可能的可执行文件名
            const altPath = path.join(dir, item, 'Contents', 'MacOS', item.replace('.app', ''));
            if (validateChrome(altPath)) {
              return altPath;
            }
          }
        }
      } catch (e) {
        // 继续下一个目录
      }
    }
    
    this.log('⚠ 未找到 Chrome，将使用系统默认路径');
    return null;
  }

  /**
   * 注册单个账号
   */
  async registerAccount(logCallback) {
    this.logCallback = logCallback;
    let browser, page;
    let cdpClient = null;
    
    try {
      // 检查取消标志
      if (this.isCancelled) {
        throw new Error('注册已取消');
      }
      
      this.log('开始连接浏览器...');
      
      // 检测操作系统
      const platform = os.platform();
      const isWindows = platform === 'win32';
      const isMac = platform === 'darwin';
      
      if (!isWindows && !isMac) {
        throw new Error('不支持的操作系统，仅支持 Windows 和 Mac 系统');
      }
      
      // 检测 Chrome 浏览器路径
      this.log(`检测到 ${isWindows ? 'Windows' : 'macOS'} 系统，正在查找 Chrome 浏览器...`);
      const chromePath = this.detectChromePath();
      
      // 配置浏览器连接参数
      const connectOptions = {
        headless: false,
        fingerprint: true,
        turnstile: true,
        tf: true,
        timeout: 120000, // 增加超时时间到 120 秒
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu', // Windows 上禁用 GPU 加速
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-sync',
          '--metrics-recording-only',
          '--disable-default-apps',
          '--mute-audio',
          '--no-first-run',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-background-timer-throttling',
          '--disable-ipc-flooding-protection',
          '--password-store=basic',
          '--use-mock-keychain'
        ]
      };
      
      // 如果找到了 Chrome 路径，使用指定路径
      if (chromePath) {
        connectOptions.executablePath = chromePath;
        this.log('使用检测到的 Chrome 路径');
      } else {
        this.log('使用系统默认 Chrome 路径');
      }
      
      this.log('正在启动 Chrome 浏览器...');
      this.log('提示: 如果长时间无响应，请检查:');
      this.log('  1. Chrome 浏览器是否正常安装');
      this.log('  2. 防火墙/杀毒软件是否拦截');
      this.log('  3. 是否有其他 Chrome 进程占用');
      
      let response;
      try {
        response = await connect(connectOptions);
      } catch (error) {
        this.log(`❌ 浏览器连接失败: ${error.message}`);
        if (error.message.includes('ECONNREFUSED')) {
          this.log('提示: Chrome 进程启动失败，可能原因:');
          this.log('  1. 端口被占用，请关闭其他 Chrome 实例');
          this.log('  2. Windows 防火墙拦截，请添加程序到白名单');
          this.log('  3. 杀毒软件拦截，请暂时关闭或添加信任');
          this.log('  4. Chrome 版本过旧，请更新到最新版本');
        }
        throw error;
      }
      
      this.log('Chrome 浏览器连接成功');
      
      browser = response.browser;
      page = response.page;
      
      if (!browser || !page) {
        throw new Error('浏览器或页面对象未创建');
      }
      
      this.log('浏览器已启动');
      
      // 检查取消标志
      if (this.isCancelled) {
        throw new Error('注册已取消');
      }
      
      // 生成临时邮箱和密码
      const email = await this.generateTempEmail();
      
      // 根据配置选择密码生成方式
      const passwordMode = this.config.passwordMode || 'email'; // 默认使用邮箱作为密码
      let password;
      
      if (passwordMode === 'random') {
        // 使用随机密码
        password = this.generateRandomPassword();
        this.log(`密码模式: 随机密码`);
      } else {
        // 使用邮箱作为密码（默认）
        password = email;
        this.log(`密码模式: 邮箱作为密码`);
      }
      
      const { firstName, lastName } = this.generateRandomName();
      
      this.log(`邮箱: ${email}`);
      this.log(`密码: ${password}`);
      this.log(`姓名: ${firstName} ${lastName}`);
      
      // 访问注册页面（带重试机制）
      this.log('正在访问注册页面...');
      let navigationSuccess = false;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (!navigationSuccess && retryCount < maxRetries) {
        try {
          retryCount++;
          this.log(`尝试访问注册页面 (${retryCount}/${maxRetries})`);
          
          await page.goto('https://windsurf.com/account/register?referral_code=aav1unksbafw1c1e', {
            waitUntil: 'domcontentloaded', // 改为更宽松的等待条件
            timeout: 60000 // 增加到60秒
          });
          
          // 等待页面基本元素加载
          await page.waitForSelector('body', { timeout: 30000 });
          navigationSuccess = true;
          this.log('注册页面访问成功');
          
        } catch (error) {
          this.log(`第${retryCount}次访问失败: ${error.message}`);
          
          if (retryCount < maxRetries) {
            this.log(`等待5秒后重试...`);
            await this.sleep(5000);
          } else {
            throw new Error(`导航失败，已重试${maxRetries}次: ${error.message}`);
          }
        }
      }
      
      await this.sleep(2000);
      
      // 检查取消标志
      if (this.isCancelled) {
        throw new Error('注册已取消');
      }
      
      // ========== 启动网络监听（优化版） ==========
      this.log('启动网络监听，准备捕获 Token...');
      
      let capturedTokens = {
        accessToken: null,
        refreshToken: null,
        idToken: null
      };
      
      let tokenCaptured = false; // 标记是否已捕获
      const pendingRequests = new Map(); // 跟踪待处理的请求
      
      // 在外部作用域定义 handler，以便在 finally 中访问
      let loadingFinishedHandler = null;
      let responseReceivedHandler = null;
      
      cdpClient = await page.target().createCDPSession();
      await cdpClient.send('Network.enable');
      
      // 监听网络加载完成事件（更可靠）
      loadingFinishedHandler = async (params) => {
        const requestId = params.requestId;
        
        // 检查是否是我们关注的请求
        if (!pendingRequests.has(requestId)) return;
        
        const url = pendingRequests.get(requestId);
        pendingRequests.delete(requestId);
        
        // 如果已经捕获到 token，跳过
        if (tokenCaptured) return;
        
        try {
          // 添加超时保护
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('获取响应体超时')), 3000)
          );
          
          const responsePromise = cdpClient.send('Network.getResponseBody', {
            requestId: requestId
          });
          
          const response = await Promise.race([responsePromise, timeoutPromise]);
          
          // 验证响应体是否为空
          if (!response.body) {
            return;
          }
          
          // 尝试解析 JSON
          let body;
          try {
            body = JSON.parse(response.body);
          } catch (parseError) {
            // 不是 JSON 格式，跳过
            return;
          }
          
          // 捕获 token（只捕获一次）
          if (!tokenCaptured) {
            if (body.idToken || body.id_token) {
              capturedTokens.idToken = body.idToken || body.id_token;
              capturedTokens.accessToken = body.idToken || body.id_token;
              console.log('[Token捕获] ✅ 捕获到 access_token');
            }
            
            if (body.refreshToken || body.refresh_token) {
              capturedTokens.refreshToken = body.refreshToken || body.refresh_token;
              console.log('[Token捕获] ✅ 捕获到 refresh_token');
            }
            
            // 如果两个 token 都捕获到了，标记完成并移除监听器
            if (capturedTokens.accessToken && capturedTokens.refreshToken) {
              tokenCaptured = true;
              this.log('✅ Token 捕获完成，停止网络监听');
              
              // 移除监听器，释放资源
              cdpClient.off('Network.loadingFinished', loadingFinishedHandler);
              cdpClient.off('Network.responseReceived', responseReceivedHandler);
            }
          }
        } catch (error) {
          // 记录详细错误信息
          console.error(`[Token捕获] 获取响应体失败: ${error.message}`);
        }
      };
      
      // 监听网络响应（标记感兴趣的请求）
      responseReceivedHandler = (params) => {
        const url = params.response.url;
        
        // 只关注 Firebase token 请求
        if (url.includes('securetoken.googleapis.com') || url.includes('identitytoolkit.googleapis.com')) {
          pendingRequests.set(params.requestId, url);
        }
      };
      
      cdpClient.on('Network.loadingFinished', loadingFinishedHandler);
      cdpClient.on('Network.responseReceived', responseReceivedHandler);
      
      // ========== 第一步: 填写基本信息 ==========
      this.log('步骤1: 填写基本信息');
      
      // 等待表单加载
      await page.waitForSelector('input', { timeout: 30000 });
      await this.sleep(2000);
      
      // 填写所有输入框
      const allInputs = await page.$$('input');
      
      for (const input of allInputs) {
        const type = await page.evaluate(el => el.type, input);
        const name = await page.evaluate(el => el.name, input);
        const placeholder = await page.evaluate(el => el.placeholder || '', input);
        
        // 填写邮箱
        if (type === 'email' || name === 'email' || placeholder.toLowerCase().includes('email')) {
          await input.click({ clickCount: 3 });
          await input.type(email, { delay: 50 });
          this.log(`已填写邮箱: ${email}`);
        }
        // 填写名字
        else if (name === 'firstName' || placeholder.toLowerCase().includes('first')) {
          await input.click();
          await input.type(firstName, { delay: 50 });
          this.log(`已填写名字: ${firstName}`);
        }
        // 填写姓氏
        else if (name === 'lastName' || placeholder.toLowerCase().includes('last')) {
          await input.click();
          await input.type(lastName, { delay: 50 });
          this.log(`已填写姓氏: ${lastName}`);
        }
      }
      
      // 同意条款复选框
      const checkbox = await page.$('input[type="checkbox"]');
      if (checkbox) {
        const isChecked = await page.evaluate(el => el.checked, checkbox);
        if (!isChecked) {
          await checkbox.click();
          this.log('已勾选同意条款');
        }
      }
      
      await this.sleep(1000);
      
      // 点击Continue按钮
      this.log('点击Continue按钮...');
      const clicked = await this.clickButton(page, ['Continue', '继续', 'Next']);
      
      if (!clicked) {
        throw new Error('无法找到Continue按钮');
      }
      
      await this.sleep(3000);
      
      // 检查取消标志
      if (this.isCancelled) {
        throw new Error('注册已取消');
      }
      
      // ========== 第二步: 填写密码 ==========
      this.log('步骤2: 填写密码信息');
      
      // 等待密码页面加载
      await page.waitForSelector('input[type="password"]', { timeout: 30000 });
      await this.sleep(2000);
      
      // 查找所有密码输入框
      const passwordInputs = await page.$$('input[type="password"]');
      this.log(`找到 ${passwordInputs.length} 个密码输入框`);
      
      if (passwordInputs.length === 0) {
        throw new Error('未找到密码输入框');
      }
      
      // 填写第一个密码输入框
      this.log('填写密码...');
      await passwordInputs[0].click();
      await passwordInputs[0].type(password, { delay: 50 });
      
      // 填写确认密码（如果有）
      if (passwordInputs.length >= 2) {
        this.log('填写确认密码...');
        await passwordInputs[1].click();
        await passwordInputs[1].type(password, { delay: 50 });
      }
      
      await this.sleep(1000);
      
      // 点击第二个Continue按钮
      this.log('点击第二个Continue按钮...');
      const clicked2 = await this.clickButton(page, ['Continue', '继续', 'Next']);
      
      if (!clicked2) {
        throw new Error('无法找到第二个Continue按钮');
      }
      
      await this.sleep(3000);
      
      // 检查取消标志
      if (this.isCancelled) {
        throw new Error('注册已取消');
      }
      
      // ========== 第三步: Cloudflare人机验证 ==========
      this.log('步骤3: 等待Cloudflare验证...');
      
      // puppeteer-real-browser会自动处理Cloudflare Turnstile验证
      await this.sleep(10000);
      
      // 点击验证后的Continue按钮
      this.log('查找验证后的Continue按钮...');
      const clicked3 = await this.clickButton(page, ['Continue', '继续', 'Next'], 3);
      
      if (!clicked3) {
        this.log('未找到Continue按钮,可能已自动跳转');
      }
      
      await this.sleep(3000);
      
      // ========== 第四步: 输入验证码 ==========
      this.log('步骤4: 等待邮箱验证码...');
      
      // 等待验证码输入框
      await page.waitForSelector('input[type="text"], input[name="code"]', { timeout: 30000 });
      
      // 检查取消标志
      if (this.isCancelled) {
        throw new Error('注册已取消');
      }
      
      // 延迟10秒后再获取验证码，避免批量注册时验证码混淆
      this.log('延迟 10 秒后获取验证码，避免混淆...');
      await this.sleep(10000);
      
      // 再次检查取消标志
      if (this.isCancelled) {
        throw new Error('注册已取消');
      }
      
      // 获取验证码
      this.log('正在接收验证码...');
      const verificationCode = await this.getVerificationCode(email);
      this.log(`获取到验证码: ${verificationCode}`);
      
      // 输入6位验证码
      const codeInputs = await page.$$('input[type="text"], input[name="code"]');
      
      if (codeInputs.length === 6) {
        // 如果是6个独立输入框
        for (let i = 0; i < 6; i++) {
          await codeInputs[i].click();
          await codeInputs[i].type(verificationCode[i], { delay: 100 });
        }
      } else if (codeInputs.length === 1) {
        // 如果是单个输入框
        await codeInputs[0].click();
        await codeInputs[0].type(verificationCode, { delay: 100 });
      }
      
      await this.sleep(1000);
      
      // 点击Create account按钮
      console.log('点击Create account按钮...');
      const createBtn = await page.$('button[type="submit"]');
      if (createBtn) {
        await createBtn.click();
      }
      await this.sleep(5000);
      
      // ========== 检查注册是否成功 ==========
      const currentUrl = page.url();
      const isSuccess = !currentUrl.includes('/login') && !currentUrl.includes('/signup');
      
      if (isSuccess) {
        console.log('注册成功!');
        this.log('注册成功!');
        
        // ========== 获取 Token（优化版） ==========
        this.log('步骤6: 获取账号 Token...');
        
        let tokenInfo = null;
        
        try {
          // 方法1: 等待网络监听捕获（最多 15 秒）
          this.log('等待网络监听捕获 Token...');
          const maxWaitTime = 15000;
          const startTime = Date.now();
          
          while (Date.now() - startTime < maxWaitTime) {
            if (capturedTokens.accessToken && capturedTokens.refreshToken) {
              this.log('✅ 网络监听已捕获完整 Token');
              break;
            }
            await this.sleep(500);
          }
          
          // 方法2: 如果网络监听失败，从 localStorage 读取（带重试）
          if (!capturedTokens.accessToken || !capturedTokens.refreshToken) {
            this.log('⚠️ 网络监听未完全捕获，尝试从浏览器读取...');
            
            const MAX_RETRIES = 3;
            let tokens = null;
            
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
              tokens = await page.evaluate(() => {
                const keys = Object.keys(localStorage);
                for (const key of keys) {
                  if (key.includes('firebase:authUser')) {
                    try {
                      const data = JSON.parse(localStorage.getItem(key));
                      if (data && data.stsTokenManager) {
                        const accessToken = data.stsTokenManager.accessToken;
                        const refreshToken = data.stsTokenManager.refreshToken;
                        
                        // 验证 token 格式（JWT 格式）
                        if (accessToken && refreshToken && 
                            accessToken.split('.').length === 3 &&
                            refreshToken.length > 20) {
                          return {
                            accessToken: accessToken,
                            refreshToken: refreshToken
                          };
                        }
                      }
                    } catch (e) {
                      continue;
                    }
                  }
                }
                return null;
              });
              
              if (tokens) {
                capturedTokens.accessToken = tokens.accessToken;
                capturedTokens.refreshToken = tokens.refreshToken;
                this.log(`✅ 从浏览器读取到 token（第 ${attempt} 次尝试）`);
                break;
              }
              
              if (attempt < MAX_RETRIES) {
                this.log(`第 ${attempt} 次读取失败，等待 2 秒后重试...`);
                await this.sleep(2000);
              }
            }
            
            if (!tokens) {
              throw new Error('无法从网络监听或浏览器获取 token');
            }
          }
          
          // 验证 token 完整性
          if (!capturedTokens.accessToken || !capturedTokens.refreshToken) {
            throw new Error('Token 不完整：缺少 accessToken 或 refreshToken');
          }
          
          // 验证 token 格式
          if (capturedTokens.accessToken.split('.').length !== 3) {
            throw new Error('accessToken 格式无效（非 JWT 格式）');
          }
          
          // 使用 access_token 获取 API Key（带重试）
          this.log('正在获取 API Key...');
          let apiKeyInfo = null;
          const API_KEY_RETRIES = 2;
          
          for (let attempt = 1; attempt <= API_KEY_RETRIES; attempt++) {
            try {
              apiKeyInfo = await this.getApiKey(capturedTokens.accessToken);
              break;
            } catch (apiError) {
              if (attempt < API_KEY_RETRIES) {
                this.log(`获取 API Key 失败（第 ${attempt} 次），重试中...`);
                await this.sleep(2000);
              } else {
                throw apiError;
              }
            }
          }
          
          tokenInfo = {
            name: apiKeyInfo.name,
            apiKey: apiKeyInfo.apiKey,
            apiServerUrl: apiKeyInfo.apiServerUrl,
            refreshToken: capturedTokens.refreshToken,
            idToken: capturedTokens.idToken  // ✅ 添加 idToken
          };
          
          this.log('✅ Token 获取成功');
          this.log(`  - API Key: ${apiKeyInfo.apiKey.substring(0, 20)}...`);
          this.log(`  - 用户名: ${apiKeyInfo.name}`);
          
        } catch (tokenError) {
          this.log(`⚠️ 获取 Token 失败: ${tokenError.message}`);
          console.error('获取 Token 失败:', tokenError);
          // 不抛出错误，允许保存不完整的账号信息
        } finally {
          // 清理网络监听器
          if (cdpClient) {
            try {
              cdpClient.off('Network.loadingFinished', loadingFinishedHandler);
              cdpClient.off('Network.responseReceived', responseReceivedHandler);
              await cdpClient.detach();
              cdpClient = null;
            } catch (e) {
              console.error('关闭 CDP 会话失败:', e);
            }
          }
        }
        
        // 保存账号到本地（使用文件锁确保线程安全）
        const fs = require('fs').promises;
        const path = require('path');
        const { app } = require('electron');
        
        // 使用全局的 accountsFileLock
        const { accountsFileLock } = require('../main.js');
        const ACCOUNTS_FILE = path.join(app.getPath('userData'), 'accounts.json');
        
        const account = {
          id: Date.now().toString(),
          email,
          password,
          firstName,
          lastName,
          name: tokenInfo ? tokenInfo.name : `${firstName} ${lastName}`,
          apiKey: tokenInfo ? tokenInfo.apiKey : null,
          apiServerUrl: tokenInfo ? tokenInfo.apiServerUrl : null,
          refreshToken: tokenInfo ? tokenInfo.refreshToken : null,
          idToken: tokenInfo ? tokenInfo.idToken : null,
          idTokenExpiresAt: tokenInfo ? (Date.now() + 3600 * 1000) : null,
          createdAt: new Date().toISOString()
        };
        
        // 使用文件锁添加账号
        await accountsFileLock.acquire(async () => {
          let accounts = [];
          try {
            const data = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
            accounts = JSON.parse(data);
          } catch (error) {
            // 文件不存在，使用空数组
          }
          
          // 检查是否已存在
          const existingIndex = accounts.findIndex(a => a.email === email);
          if (existingIndex >= 0) {
            // 更新现有账号
            accounts[existingIndex] = { ...accounts[existingIndex], ...account };
          } else {
            // 添加新账号
            accounts.push(account);
          }
          
          await fs.writeFile(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        });
        
        console.log('账号已保存到本地');
        this.log('账号已保存到本地');
        
        return {
          success: true,
          email,
          password,
          firstName,
          lastName,
          name: account.name,
          apiKey: account.apiKey,
          createdAt: account.createdAt
        };
      } else {
        throw new Error('注册失败，请检查页面');
      }
      
    } catch (error) {
      console.error('注册过程出错:', error);
      console.error('错误堆栈:', error.stack);
      
      // 如果是取消操作，返回特殊标记
      if (error.message === '注册已取消' || this.isCancelled) {
        return {
          success: false,
          cancelled: true,
          error: '注册已取消'
        };
      }
      
      return {
        success: false,
        error: error.message || '未知错误',
        errorStack: error.stack
      };
    } finally {
      // 清理 CDP 会话
      if (cdpClient) {
        try {
          await cdpClient.detach();
        } catch (e) {
          // 忽略错误
        }
      }
      
      // 关闭浏览器
      if (browser) {
        try {
          // 检查浏览器是否还在运行
          const isConnected = browser.isConnected();
          if (isConnected) {
            await browser.close();
            console.log('浏览器已关闭');
          } else {
            console.log('浏览器已被外部关闭');
          }
        } catch (e) {
          console.error('关闭浏览器失败:', e.message);
        }
      }
    }
  }

  /**
   * 批量注册(控制并发数量)
   * 支持自定义并发数量，支持平台特定优化
   */
  async batchRegister(count, maxConcurrent = 4, progressCallback, logCallback) {
    // 重置取消标志
    this.isCancelled = false;
    
    // 直接使用用户设置的并发数，不超过总注册数
    const MAX_CONCURRENT = Math.min(maxConcurrent || 4, count);
    
    // 平台特定的延迟参数
    const platform = os.platform();
    const isWindows = platform === 'win32';
    const windowStartDelay = isWindows ? 5000 : 3000; // Windows需要更长的窗口启动延迟
    const batchInterval = isWindows ? 15000 : 10000; // Windows需要更长的批次间隔
    
    if (logCallback) {
      logCallback(`开始批量注册 ${count} 个账号`);
      logCallback(`最大并发数: ${MAX_CONCURRENT} 个窗口`);
      logCallback(`验证码延迟: 10 秒`);
      logCallback(`平台: ${platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux'}`);
    }
    
    const results = [];
    let completed = 0;
    
    // 分批执行，每批最多 MAX_CONCURRENT 个
    for (let i = 0; i < count; i += MAX_CONCURRENT) {
      // 检查取消标志
      if (this.isCancelled) {
        if (logCallback) {
          logCallback('\n批量注册已取消');
        }
        break;
      }
      const batchSize = Math.min(MAX_CONCURRENT, count - i);
      const batchTasks = [];
      
      if (logCallback) {
        logCallback(`\n========== 第 ${Math.floor(i/MAX_CONCURRENT) + 1} 批次，注册 ${batchSize} 个账号 ==========`);
      }
      
      // 创建当前批次的任务
      for (let j = 0; j < batchSize; j++) {
        const taskIndex = i + j + 1;
        
        // 为每个任务创建独立的日志回调
        const taskLogCallback = (log) => {
          if (logCallback) {
            logCallback(`[窗口${taskIndex}] ${log}`);
          }
        };
        
        // 每个窗口间隔启动，避免验证码混淆
        const startDelay = j * 3000; // 每个窗口延迟3秒启动
        
        const task = (async () => {
          await this.sleep(startDelay);
          
          // 检查取消标志
          if (this.isCancelled) {
            return {
              success: false,
              cancelled: true,
              error: '注册已取消'
            };
          }
          
          if (logCallback) {
            logCallback(`\n[窗口${taskIndex}] 开始注册...`);
          }
          
          const result = await this.registerAccount(taskLogCallback);
          
          completed++;
          if (progressCallback) {
            progressCallback({ current: completed, total: count });
          }
          
          if (logCallback) {
            if (result.success) {
              logCallback(`[窗口${taskIndex}] 注册成功! 邮箱: ${result.email}`);
            } else if (result.cancelled) {
              logCallback(`[窗口${taskIndex}] 已取消`);
            } else {
              logCallback(`[窗口${taskIndex}] 注册失败: ${result.error}`);
            }
          }
          
          return result;
        })();
        
        batchTasks.push(task);
      }
      
      // 等待当前批次完成
      const batchResults = await Promise.all(batchTasks);
      results.push(...batchResults);
      
      // 检查取消标志
      if (this.isCancelled) {
        if (logCallback) {
          logCallback('\n批量注册已取消，停止后续批次');
        }
        break;
      }
      
      // 如果还有下一批，等待一段时间再开始
      if (i + MAX_CONCURRENT < count) {
        if (logCallback) {
          logCallback(`\n等待5秒后开始下一批次...`);
        }
        
        // 分段等待，以便快速响应取消操作
        for (let wait = 0; wait < 5000; wait += 500) {
          if (this.isCancelled) break;
          await this.sleep(500);
        }
      }
    }
    
    if (logCallback) {
      const successCount = results.filter(r => r.success).length;
      const cancelledCount = results.filter(r => r.cancelled).length;
      const failedCount = results.filter(r => !r.success && !r.cancelled).length;
      
      if (this.isCancelled) {
        logCallback(`\n========== 批量注册已取消 ==========`);
      } else {
        logCallback(`\n========== 批量注册完成 ==========`);
      }
      
      logCallback(`成功: ${successCount} 个`);
      logCallback(`失败: ${failedCount} 个`);
      if (cancelledCount > 0) {
        logCallback(`取消: ${cancelledCount} 个`);
      }
    }
    
    return results;
  }

  /**
   * 取消批量注册（跨平台支持）
   */
  async cancel(logCallback = null) {
    const BrowserKiller = require('./registrationBotCancel');
    await BrowserKiller.cancelBatchRegistration(this, logCallback);
  }

  /**
   * 从浏览器提取 Firebase refresh_token
   */
  async extractRefreshToken(page) {
    try {
      this.log('正在从浏览器提取 refresh_token...');
      
      const refreshToken = await page.evaluate(() => {
        // Firebase 存储格式: firebase:authUser:{API_KEY}:{APP_NAME}
        const keys = Object.keys(localStorage);
        
        // 方法1: 查找包含 firebase:authUser 的 key
        for (const key of keys) {
          if (key.includes('firebase:authUser')) {
            try {
              const data = JSON.parse(localStorage.getItem(key));
              // 路径: data.stsTokenManager.refreshToken
              if (data && data.stsTokenManager && data.stsTokenManager.refreshToken) {
                return data.stsTokenManager.refreshToken;
              }
            } catch (e) {
              continue;
            }
          }
        }
        
        // 方法2: 直接构造 key
        const authKey = 'firebase:authUser:AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY:[DEFAULT]';
        if (localStorage.getItem(authKey)) {
          try {
            const data = JSON.parse(localStorage.getItem(authKey));
            if (data && data.stsTokenManager && data.stsTokenManager.refreshToken) {
              return data.stsTokenManager.refreshToken;
            }
          } catch (e) {
            // 继续尝试其他方法
          }
        }
        
        return null;
      });
      
      if (refreshToken) {
        this.log('✅ 成功提取 refresh_token');
        return refreshToken;
      } else {
        throw new Error('未找到 refresh_token');
      }
    } catch (error) {
      this.log(`提取 refresh_token 失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 使用 refresh_token 获取 access_token
   */
  async getAccessToken(refreshToken) {
    const axios = require('axios');
    const FIREBASE_API_KEY = 'AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY';
    
    try {
      this.log('正在获取 access_token...');
      
      const formData = new URLSearchParams();
      formData.append('grant_type', 'refresh_token');
      formData.append('refresh_token', refreshToken);
      
      // 使用 Cloudflare Workers 中转（国内可访问）
      const WORKER_URL = 'https://jolly-leaf-328a.92xh6jhdym.workers.dev';
      
      this.log('使用 Cloudflare Workers 中转请求...');
      
      const response = await axios.post(
        WORKER_URL,
        {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          api_key: FIREBASE_API_KEY
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
          }
        }
      );
      
      this.log('✅ 成功获取 access_token');
      
      return {
        accessToken: response.data.id_token,
        refreshToken: response.data.refresh_token,
        expiresIn: parseInt(response.data.expires_in)
      };
    } catch (error) {
      this.log(`获取 access_token 失败: ${error.response?.data?.error?.message || error.message}`);
      throw error;
    }
  }

  /**
   * 使用 access_token 获取 API Key
   */
  async getApiKey(accessToken) {
    const axios = require('axios');
    
    try {
      this.log('正在获取 API Key...');
      
      const response = await axios.post(
        'https://register.windsurf.com/exa.seat_management_pb.SeatManagementService/RegisterUser',
        {
          firebase_id_token: accessToken
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
            'x-client-version': 'Chrome/JsCore/11.0.0/FirebaseCore-web'
          }
        }
      );
      
      this.log('✅ 成功获取 API Key');
      
      return {
        apiKey: response.data.api_key,
        name: response.data.name,
        apiServerUrl: response.data.api_server_url
      };
    } catch (error) {
      this.log(`获取 API Key 失败: ${error.response?.data?.message || error.message}`);
      throw error;
    }
  }

  /**
   * 点击按钮的辅助方法
   * @param {Page} page - Puppeteer页面对象
   * @param {Array} textList - 按钮文本列表
   * @param {Number} retries - 重试次数
   */
  async clickButton(page, textList = ['Continue'], retries = 1) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // 方式1: 通过 type=submit
        const submitBtn = await page.$('button[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          this.log('按钮点击成功 (submit)');
          return true;
        }
      } catch (e) {
        // 继续尝试其他方式
      }
      
      try {
        // 方式2: 通过文本内容查找
        const buttons = await page.$$('button');
        for (const btn of buttons) {
          const text = await page.evaluate(el => el.textContent, btn);
          if (text) {
            for (const searchText of textList) {
              if (text.includes(searchText)) {
                await btn.click();
                this.log(`按钮点击成功 (${searchText})`);
                return true;
              }
            }
          }
        }
      } catch (e) {
        // 继续重试
      }
      
      if (attempt < retries - 1) {
        this.log(`第${attempt + 1}次未找到按钮,等待后重试...`);
        await this.sleep(2000);
      }
    }
    
    return false;
  }

  /**
   * 延迟函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = RegistrationBot;
