/**
 * Windsurf 配置持久化模块
 * 解决配置被覆盖的问题
 */

const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class ConfigPersister {
  constructor() {
    this.isMonitoring = false;
    this.monitorInterval = null;
    this.lastWrittenData = null;
    this.writeCount = 0;
  }

  /**
   * 获取 Windsurf 路径
   */
  getWindsurfPaths() {
    const homeDir = process.env.HOME || require('os').homedir();
    const windsurfPath = path.join(homeDir, 'Library', 'Application Support', 'Windsurf');
    
    return {
      dbPath: path.join(windsurfPath, 'User', 'globalStorage', 'state.vscdb'),
      storageJsonPath: path.join(windsurfPath, 'User', 'globalStorage', 'storage.json'),
      machineIdPath: path.join(windsurfPath, 'machineid'),
      windsurfPath
    };
  }

  /**
   * 创建正确格式的 sessions 数据并加密
   */
  createEncryptedSessions(account) {
    try {
      // 确保 userData 路径正确
      const paths = this.getWindsurfPaths();
      const originalUserData = app.getPath('userData');
      
      // 临时切换到 Windsurf 的 userData
      app.setPath('userData', paths.windsurfPath);
      
      try {
        // 创建 sessions 数据
        // 重要：accessToken 应该是 Firebase 的 idToken 或 accessToken，而不是 API Key！
        // 如果账号有 idToken 或 accessToken，使用它；否则使用 apiKey 作为备用
        let tokenToUse = account.apiKey; // 默认使用 apiKey
        
        if (account.idToken) {
          tokenToUse = account.idToken;
          console.log('[加密] 使用 idToken 作为 accessToken');
        } else if (account.accessToken) {
          tokenToUse = account.accessToken;
          console.log('[加密] 使用 accessToken');
        } else {
          console.log('[加密] ⚠️ 未找到 Firebase token，使用 API Key 作为备用');
        }
        
        const sessionsData = [{
          id: uuidv4(),
          accessToken: tokenToUse,
          account: {
            label: account.name,
            id: account.name
          },
          scopes: []
        }];
        
        // 使用 Windsurf 的加密上下文进行加密
        const jsonString = JSON.stringify(sessionsData);
        const encrypted = safeStorage.encryptString(jsonString);
        
        console.log('[加密] ✅ Sessions 数据加密成功');
        console.log(`[加密] Buffer 长度: ${encrypted.length} 字节`);
        console.log(`[加密] 使用的 token: ${tokenToUse.substring(0, 20)}...`);
        
        return encrypted;
      } finally {
        // 恢复原始 userData
        app.setPath('userData', originalUserData);
      }
    } catch (error) {
      console.error('[加密] ❌ 加密失败:', error);
      throw error;
    }
  }

  /**
   * 直接写入 SQLite 数据库（使用 sql.js）
   */
  async writeToDatabase(key, value) {
    const initSqlJs = require('sql.js');
    const paths = this.getWindsurfPaths();
    
    try {
      // 读取数据库
      const dbBuffer = await fs.readFile(paths.dbPath);
      const SQL = await initSqlJs();
      const db = new SQL.Database(dbBuffer);
      
      try {
        let finalValue;
        
        // 处理不同类型的值
        if (Buffer.isBuffer(value)) {
          // Buffer 转为 JSON 格式
          finalValue = JSON.stringify({
            type: 'Buffer',
            data: Array.from(value)
          });
        } else if (typeof value === 'object') {
          finalValue = JSON.stringify(value);
        } else {
          finalValue = value;
        }
        
        // 执行更新
        db.run('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)', [key, finalValue]);
        
        // 导出并写回
        const data = db.export();
        await fs.writeFile(paths.dbPath, data);
        
        console.log(`[数据库] ✅ 写入成功: ${key}`);
        return true;
      } finally {
        db.close();
      }
    } catch (error) {
      console.error(`[数据库] ❌ 写入失败 ${key}:`, error);
      return false;
    }
  }

  /**
   * 获取 Firebase token
   */
  async getFirebaseTokens(refreshToken) {
    const axios = require('axios');
    const FIREBASE_API_KEY = 'AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY';
    const WORKER_URL = 'https://jolly-leaf-328a.92xh6jhdym.workers.dev';
    
    try {
      console.log('[Firebase] 正在获取 Firebase tokens...');
      
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      );
      
      console.log('[Firebase] ✅ 成功获取 Firebase tokens');
      return {
        idToken: response.data.id_token,
        accessToken: response.data.access_token || response.data.id_token,
        refreshToken: response.data.refresh_token,
        expiresIn: parseInt(response.data.expires_in)
      };
    } catch (error) {
      console.error('[Firebase] ❌ 获取失败:', error.message);
      throw error;
    }
  }

  /**
   * 写入完整的账号数据
   */
  async writeAccountData(account) {
    try {
      console.log('\n[持久化] ========== 开始写入账号数据 ==========');
      
      // 如果账号没有 idToken 或 accessToken，但有 refreshToken，先获取它们
      if (!account.idToken && !account.accessToken && account.refreshToken) {
        console.log('[持久化] 账号缺少 Firebase token，正在获取...');
        try {
          const firebaseTokens = await this.getFirebaseTokens(account.refreshToken);
          account.idToken = firebaseTokens.idToken;
          account.accessToken = firebaseTokens.accessToken;
          console.log('[持久化] ✅ 成功获取 Firebase tokens');
        } catch (error) {
          console.log('[持久化] ⚠️ 获取 Firebase tokens 失败，将使用 API Key 作为备用');
        }
      }
      
      // 1. 创建并加密 sessions
      const sessionsKey = 'secret://{"extensionId":"codeium.windsurf","key":"windsurf_auth.sessions"}';
      const encryptedSessions = this.createEncryptedSessions(account);
      await this.writeToDatabase(sessionsKey, encryptedSessions);
      
      // 2. 写入 windsurfAuthStatus
      const authStatus = {
        name: account.name,
        apiKey: account.apiKey,
        email: account.email,
        teamId: uuidv4(),
        planName: "Pro"
      };
      await this.writeToDatabase('windsurfAuthStatus', authStatus);
      
      // 3. 写入 codeium.windsurf 配置
      const codeiumConfig = {
        "codeium.installationId": uuidv4(),
        "apiServerUrl": account.apiServerUrl || "https://server.self-serve.windsurf.com",
        "codeium.hasOneTimeUpdatedUnspecifiedMode": true
      };
      await this.writeToDatabase('codeium.windsurf', codeiumConfig);
      
      // 4. 写入 windsurf_auth
      await this.writeToDatabase('codeium.windsurf-windsurf_auth', account.name);
      
      this.writeCount++;
      console.log(`[持久化] ✅ 第 ${this.writeCount} 次写入完成`);
      
      // 保存最后写入的数据用于验证
      this.lastWrittenData = {
        email: account.email,
        name: account.name,
        timestamp: new Date().toISOString()
      };
      
      return true;
    } catch (error) {
      console.error('[持久化] ❌ 写入失败:', error);
      return false;
    }
  }

  /**
   * 验证当前登录状态
   */
  async verifyLoginStatus() {
    const initSqlJs = require('sql.js');
    const paths = this.getWindsurfPaths();
    
    try {
      const dbBuffer = await fs.readFile(paths.dbPath);
      const SQL = await initSqlJs();
      const db = new SQL.Database(dbBuffer);
      
      try {
        // 查询 windsurfAuthStatus
        const result = db.exec('SELECT value FROM ItemTable WHERE key = ?', ['windsurfAuthStatus']);
        
        if (result.length > 0 && result[0].values.length > 0) {
          const authStatus = JSON.parse(result[0].values[0][0]);
          console.log(`[验证] ✅ 当前登录: ${authStatus.email} (${authStatus.name})`);
          
          // 检查是否与最后写入的数据一致
          if (this.lastWrittenData) {
            if (authStatus.email === this.lastWrittenData.email) {
              console.log('[验证] ✅ 数据一致，未被覆盖');
              return { success: true, authStatus };
            } else {
              console.log('[验证] ⚠️ 数据不一致，可能被覆盖');
              return { success: false, authStatus };
            }
          }
          
          return { success: true, authStatus };
        } else {
          console.log('[验证] ❌ 未检测到登录状态');
          return { success: false };
        }
      } finally {
        db.close();
      }
    } catch (error) {
      console.error('[验证] ❌ 验证失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 开始监控并持续写入
   */
  async startMonitoring(account, options = {}) {
    const {
      interval = 5000,      // 默认 5 秒
      maxRetries = 10,      // 最大重试次数
      autoRecover = true    // 自动恢复
    } = options;
    
    if (this.isMonitoring) {
      console.log('[监控] ⚠️ 已在监控中');
      return;
    }
    
    console.log(`[监控] 🚀 开始监控模式 (间隔: ${interval}ms)`);
    this.isMonitoring = true;
    this.writeCount = 0;
    
    // 立即写入一次
    await this.writeAccountData(account);
    
    let retryCount = 0;
    
    // 设置定时器
    this.monitorInterval = setInterval(async () => {
      try {
        // 验证当前状态
        const verifyResult = await this.verifyLoginStatus();
        
        if (!verifyResult.success || 
            (verifyResult.authStatus && verifyResult.authStatus.email !== account.email)) {
          console.log('[监控] ⚠️ 检测到配置被覆盖，正在恢复...');
          
          // 重新写入
          const writeSuccess = await this.writeAccountData(account);
          
          if (writeSuccess) {
            console.log('[监控] ✅ 配置已恢复');
            retryCount = 0;
          } else {
            retryCount++;
            console.log(`[监控] ❌ 恢复失败 (${retryCount}/${maxRetries})`);
            
            if (retryCount >= maxRetries) {
              console.log('[监控] ❌ 达到最大重试次数，停止监控');
              this.stopMonitoring();
            }
          }
        } else {
          console.log('[监控] ✅ 配置正常');
          retryCount = 0;
        }
      } catch (error) {
        console.error('[监控] ❌ 监控出错:', error);
        retryCount++;
        
        if (retryCount >= maxRetries) {
          console.log('[监控] ❌ 错误过多，停止监控');
          this.stopMonitoring();
        }
      }
    }, interval);
    
    console.log('[监控] ✅ 监控已启动');
  }

  /**
   * 停止监控
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    this.isMonitoring = false;
    console.log('[监控] ⏹️ 监控已停止');
    console.log(`[监控] 📊 总共写入 ${this.writeCount} 次`);
  }

  /**
   * 强制写入模式（连续多次写入）
   */
  async forceWrite(account, times = 5, delay = 1000) {
    console.log(`[强制写入] 🔨 开始强制写入 (${times} 次)`);
    
    for (let i = 1; i <= times; i++) {
      console.log(`[强制写入] 第 ${i}/${times} 次...`);
      
      const success = await this.writeAccountData(account);
      
      if (!success) {
        console.log(`[强制写入] ❌ 第 ${i} 次失败`);
      }
      
      if (i < times) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // 最终验证
    const finalVerify = await this.verifyLoginStatus();
    if (finalVerify.success && finalVerify.authStatus.email === account.email) {
      console.log('[强制写入] ✅ 强制写入成功！');
      return true;
    } else {
      console.log('[强制写入] ❌ 强制写入失败，请检查');
      return false;
    }
  }
}

// 导出模块
module.exports = ConfigPersister;

// 如果在渲染进程中使用
if (typeof window !== 'undefined') {
  window.ConfigPersister = ConfigPersister;
}
