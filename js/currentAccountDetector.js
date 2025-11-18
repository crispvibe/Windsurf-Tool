// currentAccountDetector.js - 检测当前 Windsurf 登录账号
// 独立模块，支持 Windows/Mac/Linux

(function() {
  'use strict';
  
  // 在 Node.js 环境中使用
  let app, path, fs;
  if (typeof require !== 'undefined') {
    try {
      const electron = require('electron');
      app = electron.app;
      path = require('path');
      fs = require('fs').promises;
    } catch (e) {
      // 浏览器环境，忽略
    }
  }

  /**
   * 当前账号检测器
   */
  class CurrentAccountDetector {
  /**
   * 获取 Windsurf 数据库路径
   */
  static getDBPath() {
    // 这个方法只在 Node.js 环境（main.js）中调用
    if (!app || !path) {
      throw new Error('此方法只能在 Node.js 环境中使用');
    }
    
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
   * 从数据库读取当前登录的账号
   */
  static async getCurrentAccount() {
    try {
      // 检查是否已安装
      const isInstalled = await this.isInstalled();
      if (!isInstalled) {
        console.log('[账号检测] Windsurf 未安装');
        return null;
      }
      
      const initSqlJs = require('sql.js');
      const dbPath = this.getDBPath();
      
      // 读取数据库文件
      const dbBuffer = await fs.readFile(dbPath);
      
      // 初始化 sql.js
      const SQL = await initSqlJs();
      const db = new SQL.Database(dbBuffer);
      
      // 查询 windsurfAuthStatus
      const result = db.exec('SELECT value FROM ItemTable WHERE key = ?', ['windsurfAuthStatus']);
      db.close();
      
      if (result.length > 0 && result[0].values.length > 0) {
        const value = result[0].values[0][0];
        const accountData = JSON.parse(value);
        
        console.log('[账号检测] 当前登录账号:', accountData.email);
        
        return {
          email: accountData.email,
          name: accountData.name,
          apiKey: accountData.apiKey,
          planName: accountData.planName
        };
      }
      
      console.log('[账号检测] 未检测到登录账号');
      return null;
      
    } catch (error) {
      console.error('[账号检测] 检测失败:', error.message);
      return null;
    }
  }
  
  /**
   * 检查指定邮箱是否是当前登录账号
   */
  static async isCurrentAccount(email) {
    try {
      const currentAccount = await this.getCurrentAccount();
      
      if (!currentAccount) {
        return false;
      }
      
      // 邮箱匹配（不区分大小写）
      return currentAccount.email.toLowerCase() === email.toLowerCase();
      
    } catch (error) {
      console.error('[账号检测] 检查失败:', error);
      return false;
    }
  }
}

// 导出模块
module.exports = CurrentAccountDetector;

// 全局函数（供 HTML 调用）
if (typeof window !== 'undefined') {
  window.CurrentAccountDetector = CurrentAccountDetector;
}

/**
 * 更新账号列表，标记当前使用的账号
 */
async function updateAccountListWithCurrent() {
  try {
    console.log('[账号列表] 开始更新当前账号标记...');
    
    // 获取当前登录的账号
    const currentAccount = await window.ipcRenderer.invoke('get-current-windsurf-account');
    
    if (!currentAccount) {
      console.log('[账号列表] 未检测到当前登录账号');
      return;
    }
    
    console.log('[账号列表] 当前登录:', currentAccount.email);
    
    // 查找所有账号行（使用新的选择器）
    const accountItems = document.querySelectorAll('.account-item:not(.header)');
    
    if (accountItems.length === 0) {
      console.warn('[账号列表] 未找到任何账号行');
      return;
    }
    
    accountItems.forEach(item => {
      // 使用data-email属性获取邮箱
      const email = item.getAttribute('data-email');
      const emailElement = item.querySelector('.acc-col-email');
      const indexElement = item.querySelector('.acc-col-index');
      
      if (!email || !emailElement) return;
      
      // 检查是否是当前账号（邮箱匹配，不区分大小写）
      if (email.toLowerCase() === currentAccount.email.toLowerCase()) {
        // 添加高亮样式（不使用左边框,避免偏移）
        item.classList.add('current-account');
        item.style.background = 'linear-gradient(90deg, #f0f9ff 0%, #ffffff 100%)';
        
        // 在序号列添加"当前"标记（覆盖在序号上方）
        if (indexElement && !indexElement.querySelector('.current-badge')) {
          indexElement.style.position = 'relative';
          
          const badge = document.createElement('div');
          badge.className = 'current-badge';
          badge.textContent = '当前';
          badge.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2px 6px;
            background: #007aff;
            color: white;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            white-space: nowrap;
            z-index: 10;
          `;
          indexElement.appendChild(badge);
        }
        
        console.log('[账号列表] ✅ 已标记当前账号:', email);
      } else {
        // 移除高亮样式
        item.classList.remove('current-account');
        item.style.background = '';
        
        // 移除"当前"标记
        if (indexElement) {
          const badge = indexElement.querySelector('.current-badge');
          if (badge) {
            badge.remove();
            indexElement.style.position = '';
          }
        }
      }
    });
    
    console.log('[账号列表] ✅ 当前账号标记更新完成');
    
  } catch (error) {
    console.error('[账号列表] 更新失败:', error);
  }
}

/**
 * 定时检测当前账号（可选）
 */
function startCurrentAccountMonitor(interval = 10000) {
  // 立即执行一次
  updateAccountListWithCurrent();
  
  // 定时检测
  setInterval(() => {
    updateAccountListWithCurrent();
  }, interval);
  
  console.log(`[账号监控] 已启动，间隔: ${interval / 1000} 秒`);
}

// 页面加载时自动检测
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    // 延迟 1 秒执行，确保账号列表已加载
    setTimeout(() => {
      updateAccountListWithCurrent();
    }, 1000);
  });
}

})(); // 闭合 IIFE
