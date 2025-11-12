/**
 * Windsurf 管理器工厂
 * 根据操作系统自动选择对应的管理器
 */

const WindsurfManagerMac = require('./windsurfManager');
const WindsurfManagerWindows = require('./windsurfManagerWindows');

class WindsurfManagerFactory {
  /**
   * 创建适合当前平台的 WindsurfManager 实例
   * @param {Function} logCallback - 日志回调函数
   * @returns {WindsurfManagerMac|WindsurfManagerWindows}
   */
  static create(logCallback = null) {
    const platform = process.platform;
    
    if (platform === 'darwin') {
      // macOS
      console.log('检测到 macOS 系统，使用 Mac 版本管理器');
      return new WindsurfManagerMac(logCallback);
    } else if (platform === 'win32') {
      // Windows
      console.log('检测到 Windows 系统，使用 Windows 版本管理器');
      return new WindsurfManagerWindows(logCallback);
    } else {
      throw new Error(`不支持的操作系统: ${platform}。目前仅支持 macOS 和 Windows`);
    }
  }

  /**
   * 获取当前平台信息
   */
  static getPlatformInfo() {
    const platform = process.platform;
    const arch = process.arch;
    
    let platformName = 'Unknown';
    if (platform === 'darwin') platformName = 'macOS';
    else if (platform === 'win32') platformName = 'Windows';
    else if (platform === 'linux') platformName = 'Linux';
    
    return {
      platform,
      platformName,
      arch,
      isSupported: platform === 'darwin' || platform === 'win32'
    };
  }
}

module.exports = WindsurfManagerFactory;
