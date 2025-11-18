// accountQuery.js - 账号查询模块（订阅类型和积分）
// 独立模块，不依赖注册流程

const axios = require('axios');

// 常量配置
const CONFIG = {
  REQUEST_TIMEOUT: 30000,        // 请求超时30秒
  QUERY_DELAY: 500,              // 查询延迟500ms
  AUTO_QUERY_INTERVAL: 5 * 60 * 1000,  // 默认5分钟
  MIN_INTERVAL: 5,               // 最小间隔5分钟
  MAX_INTERVAL: 1440             // 最大间隔1440分钟(24小时)
};

/**
 * 账号查询管理器
 */
const AccountQuery = {
  /**
   * 使用 refresh_token 获取 access_token
   */
  async getAccessToken(refreshToken) {
    const FIREBASE_API_KEY = 'AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY';
    const WORKER_URL = 'https://jolly-leaf-328a.92xh6jhdym.workers.dev';
    
    try {
      // 使用 Cloudflare Workers 中转（国内可访问）
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
          },
          timeout: CONFIG.REQUEST_TIMEOUT
        }
      );
      
      return {
        accessToken: response.data.id_token,
        refreshToken: response.data.refresh_token,
        expiresIn: parseInt(response.data.expires_in)
      };
    } catch (error) {
      throw new Error(`获取 access_token 失败: ${error.response?.data?.error?.message || error.message}`);
    }
  },

  /**
   * 查询账号使用情况（订阅类型和积分）
   * 使用简化方式：直接用 JSON 格式请求
   */
  async getUsageInfo(accessToken) {
    try {
      const response = await axios.post(
        'https://web-backend.windsurf.com/exa.seat_management_pb.SeatManagementService/GetPlanStatus',
        {
          auth_token: accessToken
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Token': accessToken,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'x-client-version': 'Chrome/JsCore/11.0.0/FirebaseCore-web'
          },
          timeout: CONFIG.REQUEST_TIMEOUT
        }
      );
        
      // 解析响应
      const planStatus = response.data.planStatus || response.data;
      
      // 提取到期时间（Pro账号有planEnd，Free账号没有）
      const expiresAt = planStatus.planEnd || planStatus.expiresAt || null;
      
      // 计算总积分 = Prompt积分 + Flex附加积分
      const promptCredits = Math.round((planStatus.availablePromptCredits || 0) / 100);
      const flexCredits = Math.round((planStatus.availableFlexCredits || 0) / 100);
      const totalCredits = promptCredits + flexCredits;
      
      return {
        planName: planStatus.planInfo?.planName || 'Free',
        usedCredits: Math.round((planStatus.usedPromptCredits || 0) / 100),
        totalCredits: totalCredits,
        usagePercentage: 0,
        expiresAt: expiresAt,
        planStart: planStatus.planStart || null,
        planInfo: planStatus.planInfo || null
      };
    } catch (error) {
      // 查询失败，返回错误状态而不是假数据
      console.warn('查询使用情况失败:', error.message);
      throw new Error(`查询使用情况失败: ${error.message}`);
    }
  },

  /**
   * 查询单个账号的完整信息
   */
  async queryAccount(account) {
    try {
      // 检查是否有 refreshToken
      if (!account.refreshToken) {
        return {
          success: false,
          error: '账号缺少 refreshToken',
          planName: 'Unknown',
          usedCredits: 0,
          totalCredits: 0
        };
      }

      let accessToken;
      let newTokenData = null;
      
      // 优化: 如果本地有 idToken 且未过期,直接使用,避免每次都刷新
      const now = Date.now();
      const tokenExpired = !account.idToken || !account.idTokenExpiresAt || now >= account.idTokenExpiresAt;
      
      if (tokenExpired) {
        // Token 不存在或已过期,需要刷新
        try {
          const tokenData = await this.getAccessToken(account.refreshToken);
          accessToken = tokenData.accessToken;
          // 保存新 Token 信息,用于后续更新到本地
          newTokenData = {
            idToken: tokenData.accessToken,
            idTokenExpiresAt: now + (tokenData.expiresIn * 1000),
            refreshToken: tokenData.refreshToken
          };
        } catch (error) {
          // refreshToken 过期或失效
          if (error.message.includes('TOKEN_EXPIRED') || error.message.includes('INVALID_REFRESH_TOKEN')) {
            throw new Error('RefreshToken 已过期,请重新获取 Token');
          }
          throw error;
        }
      } else {
        // Token 未过期,直接使用本地的
        accessToken = account.idToken;
      }
      
      // 2. 查询使用情况
      const usageInfo = await this.getUsageInfo(accessToken);
      
      // 计算使用百分比
      if (usageInfo.totalCredits > 0) {
        usageInfo.usagePercentage = Math.round((usageInfo.usedCredits / usageInfo.totalCredits) * 100);
      }
      
      return {
        success: true,
        ...usageInfo,
        // 如果刷新了 Token,返回新的 Token 信息
        ...(newTokenData && { newTokenData })
      };
    } catch (error) {
      console.error(`查询账号 ${account.email} 失败:`, error);
      return {
        success: false,
        error: error.message,
        planName: 'Error',
        usedCredits: 0,
        totalCredits: 0,
        usagePercentage: 0
      };
    }
  },

  /**
   * 批量查询所有账号
   * @param {Array} accounts - 账号列表
   * @param {Function} progressCallback - 进度回调函数 (current, total)
   */
  async queryAllAccounts(accounts, progressCallback) {
    const results = [];
    
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      
      // 调用进度回调
      if (progressCallback) {
        progressCallback(i + 1, accounts.length);
      }
      
      try {
        const result = await this.queryAccount(account);
        results.push({
          email: account.email,
          ...result
        });
        
        if (!result.success) {
          console.error(`[账号查询] ❌ ${account.email} - ${result.error}`);
        }
      } catch (error) {
        console.error(`[账号查询] ❌ ${account.email} - ${error.message}`);
        results.push({
          email: account.email,
          success: false,
          error: error.message,
          planName: 'Error',
          usedCredits: 0,
          totalCredits: 0,
          usagePercentage: 0
        });
      }
      
      // 避免请求过快，延迟（最后一个不延迟）
      if (i < accounts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.QUERY_DELAY));
      }
    }
    
    return results;
  }
};

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AccountQuery;
}

// 全局函数（用于 HTML 调用）- 封装到命名空间
if (typeof window !== 'undefined') {
  window.AccountQuery = AccountQuery;
  
  // 查询状态管理
  const QueryState = {
    isQuerying: false,
    timer: null
  };
  
  /**
   * 查询并更新账号列表的订阅和积分信息
   */
  async function updateAccountsUsage() {
    // 防止重复查询
    if (QueryState.isQuerying) {
      console.warn('[自动查询] 查询正在进行中，跳过本次');
      return;
    }
    
    QueryState.isQuerying = true;
    
    try {
      // 获取所有账号
      const result = await window.ipcRenderer.invoke('get-accounts');
      
      if (!result || !result.success || !result.accounts) {
        return;
      }
      
      const accounts = result.accounts;
      
      // 批量查询
      const results = await AccountQuery.queryAllAccounts(accounts);
      
      // 先更新JSON文件（持久化数据）
      let updateCount = 0;
      for (const result of results) {
        if (result.success) {
          try {
            // 查找对应的账号
            const account = accounts.find(acc => acc.email === result.email);
            if (account) {
              // 准备更新数据
              const updateData = {
                id: account.id,
                type: result.planName,
                credits: result.totalCredits,
                usedCredits: result.usedCredits,
                totalCredits: result.totalCredits,
                usage: result.usagePercentage,
                queryUpdatedAt: new Date().toISOString()
              };
              
              // 如果刷新了 Token,保存新的 Token 信息
              if (result.newTokenData) {
                updateData.idToken = result.newTokenData.idToken;
                updateData.idTokenExpiresAt = result.newTokenData.idTokenExpiresAt;
                updateData.refreshToken = result.newTokenData.refreshToken;
              }
              
              // 只有当expiresAt有值时才更新
              if (result.expiresAt) {
                updateData.expiresAt = result.expiresAt;
              }
              
              // 更新账号信息到JSON文件
              await window.ipcRenderer.invoke('update-account', updateData);
              updateCount++;
            }
          } catch (error) {
            console.error(`[自动查询] ❌ 更新 ${result.email} 失败:`, error);
          }
        }
      }
      
      // 重新加载账号列表以刷新UI
      if (typeof AccountManager !== 'undefined' && AccountManager.loadAccounts) {
        await AccountManager.loadAccounts();
      }
    } catch (error) {
      console.error('[自动查询] 查询失败:', error);
    } finally {
      QueryState.isQuerying = false;
    }
  }

/**
 * 更新单个账号的 UI 显示（已废弃，现在通过重新加载列表更新）
 * 保留此函数以防其他地方调用
 * @returns {Boolean} 是否成功更新
 */
function updateAccountUI(email, usageInfo) {
  // 使用data-email属性精确查找
  const row = document.querySelector(`.account-item[data-email="${email}"]`);
  
  if (!row) {
    console.warn(`[UI更新] 未找到邮箱为 ${email} 的账号行`);
    return false;
  }
  
  try {
    // 更新订阅类型
    const typeElement = row.querySelector('.acc-col-type');
    if (typeElement) {
      typeElement.textContent = usageInfo.planName || 'Free';
      
      // 根据套餐类型设置颜色
      if (usageInfo.planName === 'Pro') {
        typeElement.style.color = '#007aff';
      } else if (usageInfo.planName === 'Free') {
        typeElement.style.color = '#86868b';
      } else {
        typeElement.style.color = '#ff3b30';
      }
    }
    
    // 更新积分信息
    const creditsElement = row.querySelector('.acc-col-credits');
    if (creditsElement) {
      if (usageInfo.success) {
        creditsElement.textContent = `${usageInfo.usedCredits}/${usageInfo.totalCredits}`;
        
        // 根据使用率设置颜色
        if (usageInfo.usagePercentage >= 80) {
          creditsElement.style.color = '#ff3b30';
        } else if (usageInfo.usagePercentage >= 50) {
          creditsElement.style.color = '#ff9500';
        } else {
          creditsElement.style.color = '#34c759';
        }
      } else {
        creditsElement.textContent = '查询失败';
        creditsElement.style.color = '#ff3b30';
      }
    }
    
    // 更新使用率
    const usageElement = row.querySelector('.acc-col-usage');
    if (usageElement) {
      if (usageInfo.success) {
        usageElement.textContent = `${usageInfo.usagePercentage}%`;
        
        // 根据使用率设置颜色
        if (usageInfo.usagePercentage >= 80) {
          usageElement.style.color = '#ff3b30';
        } else if (usageInfo.usagePercentage >= 50) {
          usageElement.style.color = '#ff9500';
        } else {
          usageElement.style.color = '#34c759';
        }
      } else {
        usageElement.textContent = '-';
        usageElement.style.color = '#86868b';
      }
    }
    
    console.log(`[UI更新] ✅ 已更新 ${email} 的显示`);
    return true;
  } catch (error) {
    console.error(`[UI更新] ❌ 更新 ${email} 失败:`, error);
    return false;
  }
}
  
  /**
   * 启动自动定时查询
   * @param {Number} interval - 查询间隔（毫秒）
   */
  function startAutoQuery(interval = CONFIG.AUTO_QUERY_INTERVAL) {
    // 先停止旧定时器，避免重复
    stopAutoQuery();
    
    // 立即执行一次
    updateAccountsUsage();
    
    // 定时执行
    QueryState.timer = setInterval(() => {
      updateAccountsUsage();
    }, interval);
    
    console.log(`[自动查询] 已启动，间隔: ${interval / 1000} 秒 (${interval / 60000} 分钟)`);
  }
  
  /**
   * 停止自动查询
   */
  function stopAutoQuery() {
    if (QueryState.timer) {
      clearInterval(QueryState.timer);
      QueryState.timer = null;
      console.log('[自动查询] 已停止');
    }
  }
  
  /**
   * 重启自动查询（用于配置更改后）
   * @param {Number} intervalMinutes - 查询间隔（分钟）
   */
  function restartAutoQuery(intervalMinutes) {
    console.log(`[自动查询] 重启查询，新间隔: ${intervalMinutes} 分钟`);
    stopAutoQuery();
    const intervalMs = intervalMinutes * 60 * 1000;
    startAutoQuery(intervalMs);
  }
  
  /**
   * 从配置中读取查询间隔
   */
  function getQueryIntervalFromConfig() {
    try {
      // 从 localStorage 读取配置
      const configStr = localStorage.getItem('windsurfConfig');
      if (configStr) {
        const config = JSON.parse(configStr);
        const interval = parseInt(config.queryInterval);
        if (!isNaN(interval) && interval >= CONFIG.MIN_INTERVAL && interval <= CONFIG.MAX_INTERVAL) {
          return interval * 60 * 1000; // 转换为毫秒
        }
      }
    } catch (error) {
      console.error('[自动查询] 读取配置失败:', error);
    }
    // 默认值
    return CONFIG.AUTO_QUERY_INTERVAL;
  }
  
  // 挂载到全局
  window.restartAutoQuery = restartAutoQuery;
  window.stopAutoQuery = stopAutoQuery;
  
  // 页面加载时启动自动查询
  window.addEventListener('DOMContentLoaded', () => {
    const interval = getQueryIntervalFromConfig();
    console.log(`[自动查询] 从配置读取间隔: ${interval / 60000} 分钟`);
    startAutoQuery(interval);
  });
  
  // 页面卸载时清理定时器
  window.addEventListener('beforeunload', () => {
    stopAutoQuery();
    console.log('[自动查询] 页面卸载，已清理定时器');
  });
}
