/**
 * 账号登录获取 Token 模块
 * 使用 Cloudflare Workers 中转访问 Firebase API，国内可直接使用
 * 用于为已有账号（只有邮箱密码）获取完整的 Token 信息
 */

const axios = require('axios');

class AccountLogin {
  constructor() {
    this.logCallback = null;
  }

  /**
   * 输出日志
   */
  log(message) {
    console.log(message);
    if (this.logCallback) {
      this.logCallback(message);
    }
  }

  /**
   * 直接使用邮箱密码登录获取 Firebase Token（无需浏览器）
   * 使用 Cloudflare Workers 中转，国内可访问
   * @param {string} email - 邮箱
   * @param {string} password - 密码
   * @returns {Promise<Object>} - 返回 { idToken, refreshToken, email, expiresIn }
   */
  async loginWithEmailPassword(email, password) {
    try {
      const FIREBASE_API_KEY = 'AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY';
      const WORKER_URL = 'https://jolly-leaf-328a.92xh6jhdym.workers.dev/login';
      
      const response = await axios.post(
        WORKER_URL,
        {
          email: email,
          password: password,
          api_key: FIREBASE_API_KEY
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 30000
        }
      );
      
      return {
        idToken: response.data.idToken,
        refreshToken: response.data.refreshToken,
        email: response.data.email,
        expiresIn: parseInt(response.data.expiresIn || 3600),
        localId: response.data.localId
      };
    } catch (error) {
      // 判断是否为网络连接问题
      if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        this.log('❌ 无法连接到中转服务器');
        this.log('   错误: 网络连接失败');
        this.log('   建议: 请检查网络连接是否正常');
        throw new Error('无法连接到中转服务器，请检查网络连接');
      }
      
      // 其他错误（如密码错误、账号不存在等）
      const errorMessage = error.response?.data?.error?.message || error.message;
      
      // 友好的错误提示
      let friendlyMessage = errorMessage;
      if (errorMessage.includes('EMAIL_NOT_FOUND')) {
        friendlyMessage = '邮箱不存在，请检查邮箱地址是否正确';
      } else if (errorMessage.includes('INVALID_PASSWORD')) {
        friendlyMessage = '密码错误，请检查密码是否正确';
      } else if (errorMessage.includes('INVALID_LOGIN_CREDENTIALS')) {
        friendlyMessage = '邮箱或密码错误，请检查登录凭据是否正确';
      } else if (errorMessage.includes('USER_DISABLED')) {
        friendlyMessage = '账号已被禁用';
      } else if (errorMessage.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
        friendlyMessage = '尝试次数过多，请稍后再试';
      } else if (errorMessage.includes('INVALID_EMAIL')) {
        friendlyMessage = '邮箱格式不正确';
      }
      
      this.log(`❌ Firebase 登录失败: ${friendlyMessage}`);
      throw new Error(friendlyMessage);
    }
  }

  /**
   * 使用邮箱密码直接获取完整的账号信息（无需浏览器）
   * @param {string} email - 邮箱
   * @param {string} password - 密码
   * @returns {Promise<Object>} - 返回完整的账号信息
   */
  async getAccountInfoByPassword(email, password) {
    try {
      const firebaseTokens = await this.loginWithEmailPassword(email, password);
      const apiKeyInfo = await this.getApiKey(firebaseTokens.idToken);
      
      const accountInfo = {
        email: email,
        password: password,
        refreshToken: firebaseTokens.refreshToken,
        idToken: firebaseTokens.idToken,
        idTokenExpiresAt: Date.now() + (firebaseTokens.expiresIn * 1000),
        apiKey: apiKeyInfo.apiKey,
        name: apiKeyInfo.name,
        apiServerUrl: apiKeyInfo.apiServerUrl,
        createdAt: new Date().toISOString()
      };
      
      return accountInfo;
    } catch (error) {
      this.log(`❌ 获取账号信息失败`);
      this.log(`   错误: ${error.message}`);
      throw error;
    }
  }

  /**
   * 使用 access_token 获取 API Key
   */
  async getApiKey(accessToken) {
    try {
      const response = await axios.post(
        'https://register.windsurf.com/exa.seat_management_pb.SeatManagementService/RegisterUser',
        {
          firebase_id_token: accessToken
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      
      return {
        apiKey: response.data.api_key,
        name: response.data.name,
        apiServerUrl: response.data.api_server_url
      };
    } catch (error) {
      // 判断是否为网络连接问题
      if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        this.log('❌ 无法连接到服务器');
        this.log('   错误: 网络连接失败');
        this.log('   建议: 请检查网络连接');
        throw new Error('无法连接到 Windsurf 服务器，请检查网络连接');
      }
      
      const errorMessage = error.response?.data?.error?.message || error.message;
      this.log(`❌ 获取 API Key 失败: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }

  /**
   * 登录账号并获取完整 Token（兼容旧接口）
   * @param {Object} account - 账号信息 { email, password }
   * @param {Function} logCallback - 日志回调函数
   * @returns {Object} - 包含完整 Token 信息的账号对象
   */
  async loginAndGetTokens(account, logCallback) {
    this.logCallback = logCallback;
    
    try {
      this.log('========== 开始登录获取 Token ==========');
      this.log(`账号: ${account.email}`);
      this.log('');
      
      // 使用中转服务登录
      const accountInfo = await this.getAccountInfoByPassword(account.email, account.password);
      
      this.log('');
      this.log('========== 登录完成 ==========');
      this.log('');
      
      // 返回更新后的账号信息
      return {
        success: true,
        account: {
          ...account,
          name: accountInfo.name,
          apiKey: accountInfo.apiKey,
          apiServerUrl: accountInfo.apiServerUrl,
          refreshToken: accountInfo.refreshToken,
          idToken: accountInfo.idToken,
          idTokenExpiresAt: accountInfo.idTokenExpiresAt,
          updatedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      this.log('');
      this.log('========== 登录失败 ==========');
      this.log(`错误: ${error.message}`);
      this.log('');
      
      return {
        success: false,
        error: error.message,
        account: account
      };
    }
  }
}

module.exports = AccountLogin;
