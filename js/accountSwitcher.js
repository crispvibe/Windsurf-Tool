// accountSwitcher.js - Windsurf 账号切换模块
// 独立模块，支持跨平台（Windows/Mac/Linux）

const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

/**
 * Windsurf 路径检测器
 */
class WindsurfPathDetector {
  /**
   * 获取 Windsurf 数据库路径
   */
  static getDBPath() {
    const platform = process.platform;
    
    if (platform === 'win32') {
      return path.join(app.getPath('appData'), 'Windsurf/User/globalStorage/state.vscdb');
    } else if (platform === 'darwin') {
      return path.join(app.getPath('home'), 'Library/Application Support/Windsurf/User/globalStorage/state.vscdb');
    } else if (platform === 'linux') {
      return path.join(app.getPath('home'), '.config/Windsurf/User/globalStorage/state.vscdb');
    }
    
    throw new Error(`不支持的平台: ${platform}`);
  }
  
  /**
   * 获取 Windsurf 用户数据目录
   */
  static getUserDataPath() {
    const platform = process.platform;
    
    if (platform === 'win32') {
      return path.join(app.getPath('appData'), 'Windsurf');
    } else if (platform === 'darwin') {
      return path.join(app.getPath('home'), 'Library/Application Support/Windsurf');
    } else if (platform === 'linux') {
      return path.join(app.getPath('home'), '.config/Windsurf');
    }
  }
  
  /**
   * 检查 Windsurf 是否已安装
   */
  static async isInstalled() {
    try {
      const dbPath = this.getDBPath();
      await fs.access(dbPath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * 检查 Windsurf 是否正在运行
   */
  static async isRunning() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('tasklist');
        return stdout.toLowerCase().includes('windsurf.exe');
      } else if (process.platform === 'darwin') {
        const { stdout } = await execAsync('ps aux | grep -i windsurf | grep -v grep');
        return stdout.trim().length > 0;
      } else {
        const { stdout } = await execAsync('ps aux | grep -i windsurf | grep -v grep');
        return stdout.trim().length > 0;
      }
    } catch {
      return false;
    }
  }
  
  /**
   * 关闭 Windsurf（优雅关闭 + 强制关闭）- 兼容所有 Windows 和 macOS 版本
   */
  static async closeWindsurf() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      console.log('[关闭 Windsurf] 开始关闭流程...');
      
      if (process.platform === 'win32') {
        // Windows: 先尝试优雅关闭，再强制关闭
        console.log('[关闭 Windsurf] Windows: 尝试优雅关闭...');
        try {
          await execAsync('taskkill /IM Windsurf.exe 2>nul', { shell: 'cmd.exe' });
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          // 忽略错误
        }
        
        // 检查是否还在运行
        if (await this.isRunning()) {
          console.log('[关闭 Windsurf] Windows: 优雅关闭失败，使用强制关闭...');
          const commands = [
            'taskkill /F /T /IM Windsurf.exe 2>nul || exit 0',
            'taskkill /F /T /IM "Windsurf Helper.exe" 2>nul || exit 0'
          ];
          
          for (const cmd of commands) {
            try {
              await execAsync(cmd, { shell: 'cmd.exe' });
            } catch (error) {
              // 忽略错误
            }
          }
        }
        
      } else if (process.platform === 'darwin') {
        // macOS: 先尝试优雅关闭，再强制关闭
        console.log('[关闭 Windsurf] macOS: 尝试优雅关闭...');
        
        // 方法1: 使用 osascript 优雅退出
        try {
          await execAsync('osascript -e \'tell application "Windsurf" to quit\' 2>/dev/null');
          console.log('[关闭 Windsurf] macOS: 已发送退出信号');
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
          console.log('[关闭 Windsurf] macOS: osascript 失败，尝试其他方法');
        }
        
        // 检查是否还在运行
        if (await this.isRunning()) {
          console.log('[关闭 Windsurf] macOS: 优雅关闭失败，使用 SIGTERM...');
          // 方法2: 使用 SIGTERM (15) 信号
          try {
            await execAsync('pkill -15 -f "Windsurf.app/Contents/MacOS/Windsurf" 2>/dev/null');
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            // 忽略错误
          }
        }
        
        // 最后检查，如果还在运行才使用 SIGKILL
        if (await this.isRunning()) {
          console.log('[关闭 Windsurf] macOS: SIGTERM 失败，使用 SIGKILL...');
          const commands = [
            'pkill -9 -f "Windsurf.app/Contents/MacOS/Windsurf" 2>/dev/null || true',
            'pkill -9 -f "Windsurf Helper" 2>/dev/null || true',
            'killall -9 "Windsurf" 2>/dev/null || true'
          ];
          
          for (const cmd of commands) {
            try {
              await execAsync(cmd);
            } catch (error) {
              // 忽略错误
            }
          }
        }
        
      } else {
        // Linux: 先 SIGTERM 再 SIGKILL
        console.log('[关闭 Windsurf] Linux: 尝试优雅关闭...');
        try {
          await execAsync('pkill -15 windsurf 2>/dev/null');
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          // 忽略错误
        }
        
        if (await this.isRunning()) {
          console.log('[关闭 Windsurf] Linux: 使用强制关闭...');
          const commands = [
            'pkill -9 -f "windsurf" 2>/dev/null || true',
            'killall -9 windsurf 2>/dev/null || true'
          ];
          
          for (const cmd of commands) {
            try {
              await execAsync(cmd);
            } catch (error) {
              // 忽略错误
            }
          }
        }
      }
      
      // 等待进程完全关闭
      console.log('[关闭 Windsurf] 等待进程关闭...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 重试检测（最多3次）
      const maxRetries = 3;
      for (let i = 0; i < maxRetries; i++) {
        const stillRunning = await this.isRunning();
        if (!stillRunning) {
          console.log('[关闭 Windsurf] ✅ 确认已关闭');
          return true;
        }
        console.log(`[关闭 Windsurf] 等待中... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // 最后检查一次
      const stillRunning = await this.isRunning();
      if (stillRunning) {
        console.warn('[关闭 Windsurf] ⚠️ 进程可能仍在运行，但继续执行');
        // 不抛出错误，允许继续
      }
      
      console.log('[关闭 Windsurf] ✅ 关闭流程完成');
      return true;
    } catch (error) {
      console.error('[关闭 Windsurf] 错误:', error);
      throw error;
    }
  }
}

/**
 * 账号切换器
 */
class AccountSwitcher {
  /**
   * 使用 refresh_token 获取 access_token
   */
  static async getAccessToken(refreshToken) {
    const axios = require('axios');
    const FIREBASE_API_KEY = 'AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY';
    
    const formData = new URLSearchParams();
    formData.append('grant_type', 'refresh_token');
    formData.append('refresh_token', refreshToken);
    
    const response = await axios.post(
      `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );
    
    return response.data.id_token;
  }
  
  /**
   * 使用 access_token 获取 api_key
   */
  static async getApiKey(accessToken) {
    const axios = require('axios');
    
    const response = await axios.post(
      'https://register.windsurf.com/exa.seat_management_pb.SeatManagementService/RegisterUser',
      {
        firebase_id_token: accessToken
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );
    
    return {
      apiKey: response.data.api_key,
      name: response.data.name,
      apiServerUrl: response.data.api_server_url
    };
  }
  
  /**
   * 加密 sessions 数据
   */
  static encryptSessions(sessionsData) {
    // 设置 userData 路径与 Windsurf 一致，确保加密同源
    const windsurfUserData = WindsurfPathDetector.getUserDataPath();
    const originalUserData = app.getPath('userData');
    
    try {
      // 临时设置为 Windsurf 的 userData
      app.setPath('userData', windsurfUserData);
      
      const jsonString = JSON.stringify(sessionsData);
      const encrypted = safeStorage.encryptString(jsonString);
      
      return encrypted;
    } finally {
      // 恢复原始 userData
      app.setPath('userData', originalUserData);
    }
  }
  
  /**
   * 写入数据库
   */
  static async writeToDB(key, value) {
    const initSqlJs = require('sql.js');
    const dbPath = WindsurfPathDetector.getDBPath();
    
    // 备份数据库
    await this.backupDB();
    
    // 读取数据库文件
    const dbBuffer = await fs.readFile(dbPath);
    
    // 初始化 sql.js
    const SQL = await initSqlJs();
    const db = new SQL.Database(dbBuffer);
    
    try {
      // 如果 value 是对象，转为 JSON 字符串
      const finalValue = typeof value === 'object' && !Buffer.isBuffer(value) 
        ? JSON.stringify(value) 
        : value;
      
      // 执行插入或更新
      db.run('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)', [key, finalValue]);
      
      // 导出数据库
      const data = db.export();
      
      // 写回文件
      await fs.writeFile(dbPath, data);
    } finally {
      db.close();
    }
  }
  
  /**
   * 备份数据库
   */
  static async backupDB() {
    const dbPath = WindsurfPathDetector.getDBPath();
    const backupPath = dbPath + '.backup.' + Date.now();
    
    try {
      await fs.copyFile(dbPath, backupPath);
      console.log('数据库已备份:', backupPath);
    } catch (error) {
      console.warn('备份数据库失败:', error.message);
    }
  }
  
  /**
   * 切换账号（主函数）
   */
  static async switchAccount(account, logCallback = null) {
    const log = (msg) => {
      console.log(msg);
      if (logCallback) logCallback(msg);
    };
    
    try {
      log('[切号] ========== 开始切换账号 ==========');
      log(`[切号] 目标账号: ${account.email}`);
      
      // 1. 检查 Windsurf 是否已安装
      const isInstalled = await WindsurfPathDetector.isInstalled();
      if (!isInstalled) {
        throw new Error('未检测到 Windsurf，请确保已安装');
      }
      log('[切号] ✅ Windsurf 已安装');
      
      // 2. 检查并关闭 Windsurf
      const isRunning = await WindsurfPathDetector.isRunning();
      if (isRunning) {
        log('[切号] ⚠️ 检测到 Windsurf 正在运行');
        log('[切号] 正在自动关闭 Windsurf...');
        
        try {
          await WindsurfPathDetector.closeWindsurf();
          log('[切号] ✅ Windsurf 已关闭');
        } catch (error) {
          throw new Error(`无法自动关闭 Windsurf: ${error.message}\n请手动关闭后重试`);
        }
      } else {
        log('[切号] ✅ Windsurf 未运行');
      }
      
      // 3. 检查账号是否有 refreshToken
      if (!account.refreshToken) {
        throw new Error('账号缺少 refreshToken，无法切换');
      }
      
      // 4. 获取 access_token
      log('[切号] 正在获取 access_token...');
      const accessToken = await this.getAccessToken(account.refreshToken);
      log('[切号] ✅ 获取 access_token 成功');
      
      // 5. 获取 api_key
      log('[切号] 正在获取 api_key...');
      const { apiKey, name, apiServerUrl } = await this.getApiKey(accessToken);
      log('[切号] ✅ 获取 api_key 成功');
      
      // 6. 构建 sessions 数据
      log('[切号] 正在构建 sessions 数据...');
      const sessionsData = [{
        id: uuidv4(),
        accessToken: apiKey,
        account: {
          label: name,
          id: name
        },
        scopes: []
      }];
      
      // 7. 加密 sessions 数据
      log('[切号] 正在加密 sessions 数据...');
      const encrypted = this.encryptSessions(sessionsData);
      log('[切号] ✅ 加密成功');
      
      // 8. 写入 sessions 到数据库
      log('[切号] 正在写入 sessions 到数据库...');
      const sessionsKey = 'secret://{"extensionId":"codeium.windsurf","key":"windsurf_auth.sessions"}';
      await this.writeToDB(sessionsKey, encrypted);
      log('[切号] ✅ sessions 写入成功');
      
      // 9. 写入 windsurfAuthStatus
      log('[切号] 正在写入 windsurfAuthStatus...');
      const authStatus = {
        name: name,
        apiKey: apiKey,
        email: account.email,
        teamId: uuidv4(),
        planName: "Pro"
      };
      await this.writeToDB('windsurfAuthStatus', authStatus);
      log('[切号] ✅ windsurfAuthStatus 写入成功');
      
      // 10. (可选) 写入 api_server_url
      if (apiServerUrl) {
        log('[切号] 正在写入 api_server_url...');
        const codeiumConfig = {
          "codeium.installationId": uuidv4(),
          "apiServerUrl": apiServerUrl,
          "codeium.hasOneTimeUpdatedUnspecifiedMode": true
        };
        await this.writeToDB('codeium.windsurf', codeiumConfig);
        log('[切号] ✅ api_server_url 写入成功');
      }
      
      log('[切号] ========== 切换账号成功 ==========');
      log(`[切号] 当前账号: ${account.email}`);
      log(`[切号] 用户名: ${name}`);
      log('[切号] 请启动 Windsurf 查看效果');
      
      return {
        success: true,
        email: account.email,
        name: name,
        apiKey: apiKey
      };
      
    } catch (error) {
      log(`[切号] ❌ 切换失败: ${error.message}`);
      console.error('[切号] 错误详情:', error);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 获取当前登录的账号信息
   */
  static async getCurrentAccount() {
    const initSqlJs = require('sql.js');
    const dbPath = WindsurfPathDetector.getDBPath();
    
    try {
      // 读取数据库文件
      const dbBuffer = await fs.readFile(dbPath);
      
      // 初始化 sql.js
      const SQL = await initSqlJs();
      const db = new SQL.Database(dbBuffer);
      
      // 查询数据
      const result = db.exec('SELECT value FROM ItemTable WHERE key = ?', ['windsurfAuthStatus']);
      db.close();
      
      if (result.length > 0 && result[0].values.length > 0) {
        const value = result[0].values[0][0];
        return JSON.parse(value);
      }
      
      return null;
    } catch (error) {
      console.error('获取当前账号失败:', error);
      return null;
    }
  }
}

// 导出模块
module.exports = {
  WindsurfPathDetector,
  AccountSwitcher
};

// 全局函数（供 HTML 调用）
if (typeof window !== 'undefined') {
  window.WindsurfPathDetector = WindsurfPathDetector;
  window.AccountSwitcher = AccountSwitcher;
}

/**
 * 切换到指定账号（全局函数）- 带实时日志显示
 */
async function switchToAccount(accountId) {
  try {
    // 获取所有账号
    const accountsResult = await window.ipcRenderer.invoke('get-accounts');
    if (!accountsResult.success || !accountsResult.accounts) {
      alert('获取账号列表失败');
      return;
    }
    
    const account = accountsResult.accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      alert('账号不存在');
      return;
    }
    
    // 创建日志显示模态框
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
      <div class="modal-dialog modern-modal" style="max-width: 700px;" onclick="event.stopPropagation()">
        <div class="modern-modal-header">
          <div class="modal-title-row">
            <i data-lucide="refresh-cw" style="width: 24px; height: 24px; color: #007aff;"></i>
            <h3 class="modal-title">切换账号</h3>
          </div>
          <button class="modal-close-btn" id="closeSwitchModal" title="关闭" style="display: none;">
            <i data-lucide="x" style="width: 20px; height: 20px;"></i>
          </button>
        </div>
        
        <div class="modern-modal-body">
          <div style="background: #f5f5f7; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div style="font-size: 13px; color: #86868b; margin-bottom: 4px;">目标账号</div>
            <div style="font-size: 15px; font-weight: 600; color: #1d1d1f;">${account.email}</div>
          </div>
          
          <div style="background: #1d1d1f; border-radius: 8px; padding: 16px; height: 400px; overflow-y: auto; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; line-height: 1.6;" id="switchLogContainer">
            <div style="color: #34c759;">🚀 准备切换账号...</div>
          </div>
        </div>
        
        <div class="modern-modal-footer" id="switchFooter">
          <div style="flex: 1; text-align: left; color: #86868b; font-size: 13px;" id="switchStatus">
            正在处理...
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // 初始化图标
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    const logContainer = document.getElementById('switchLogContainer');
    const statusEl = document.getElementById('switchStatus');
    const closeBtn = document.getElementById('closeSwitchModal');
    
    // 添加日志函数
    function addLog(message, type = 'info') {
      const colors = {
        info: '#ffffff',
        success: '#34c759',
        warning: '#ff9500',
        error: '#ff3b30'
      };
      const color = colors[type] || colors.info;
      const time = new Date().toLocaleTimeString('zh-CN');
      const log = document.createElement('div');
      log.style.color = color;
      log.textContent = `[${time}] ${message}`;
      logContainer.appendChild(log);
      logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    try {
      addLog(`目标账号: ${account.email}`, 'info');
      addLog('开始切换流程...', 'info');
      
      // 执行切换
      const result = await window.ipcRenderer.invoke('switch-account', account);
      
      if (result.success) {
        addLog('✅ 切换成功！', 'success');
        addLog(`账号: ${result.email}`, 'success');
        addLog(`用户名: ${result.name}`, 'success');
        addLog('', 'info');
        addLog('⚠️ 请手动启动 Windsurf 查看效果', 'warning');
        statusEl.textContent = '✅ 切换成功';
        statusEl.style.color = '#34c759';
      } else {
        addLog(`❌ 切换失败: ${result.error}`, 'error');
        statusEl.textContent = '❌ 切换失败';
        statusEl.style.color = '#ff3b30';
      }
      
    } catch (error) {
      console.error('切换账号失败:', error);
      addLog(`❌ 发生错误: ${error.message}`, 'error');
      statusEl.textContent = '❌ 发生错误';
      statusEl.style.color = '#ff3b30';
    }
    
    // 显示关闭按钮
    closeBtn.style.display = 'block';
    closeBtn.onclick = () => modal.remove();
    
    // 点击背景关闭
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    };
    
  } catch (error) {
    console.error('切换账号失败:', error);
    alert(`切换失败: ${error.message}`);
  }
}

/**
 * 获取当前 Windsurf 登录的账号
 */
async function getCurrentWindsurfAccount() {
  try {
    const account = await window.ipcRenderer.invoke('get-current-windsurf-account');
    
    if (account) {
      console.log('当前 Windsurf 账号:', account);
      return account;
    } else {
      console.log('Windsurf 未登录');
      return null;
    }
  } catch (error) {
    console.error('获取当前账号失败:', error);
    return null;
  }
}
