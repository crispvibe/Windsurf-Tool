# Windows 适配说明

## 概述

本项目已完成 Windows 平台适配，实现了与 macOS 版本相同的功能，包括：
- ✅ 批量自动注册
- ✅ 账号池管理
- ✅ 一键切换账号
- ✅ 自动重置配置和机器码

## 架构设计

### 1. 平台分离架构

采用工厂模式实现平台自动检测和管理器选择：

```
src/
├── windsurfManager.js          # macOS 版本管理器
├── windsurfManagerWindows.js   # Windows 版本管理器
└── windsurfManagerFactory.js   # 工厂类（自动选择）
```

### 2. 自动平台检测

```javascript
const WindsurfManagerFactory = require('./src/windsurfManagerFactory');

// 自动检测平台并创建对应的管理器
const manager = WindsurfManagerFactory.create(logCallback);
```

工厂会根据 `process.platform` 自动选择：
- `darwin` → `WindsurfManagerMac`
- `win32` → `WindsurfManagerWindows`

## Windows 特定实现

### 1. 路径适配

| 配置项 | macOS | Windows |
|--------|-------|---------|
| 配置目录 | `~/Library/Application Support/Windsurf` | `%APPDATA%\Windsurf` |
| 缓存目录 | `~/Library/Caches/Windsurf` | `%LOCALAPPDATA%\Windsurf\Cache` |
| 应用路径 | `/Applications/Windsurf.app` | `%LOCALAPPDATA%\Programs\Windsurf\Windsurf.exe` |

### 2. 进程管理

**macOS:**
```bash
# 检测进程
pgrep -f Windsurf

# 关闭进程
killall Windsurf
killall -9 Windsurf
```

**Windows:**
```powershell
# 检测进程
tasklist /FI "IMAGENAME eq Windsurf.exe"

# 关闭进程
taskkill /IM Windsurf.exe
taskkill /F /IM Windsurf.exe
```

### 3. 窗口操作

**macOS:** 使用 AppleScript
```applescript
tell application "System Events"
  tell process "Windsurf"
    click button "Log in" of window 1
  end tell
end tell
```

**Windows:** 使用 robotjs + PowerShell
```javascript
// 使用 robotjs 模拟键盘
robot.keyTap('enter');
robot.keyTap('tab');
robot.typeString('text');

// 使用 PowerShell 激活窗口
$hwnd = [Win32]::FindWindow($null, "Windsurf")
[Win32]::SetForegroundWindow($hwnd)
```

### 4. 应用启动

**macOS:**
```bash
open -a "/Applications/Windsurf.app"
```

**Windows:**
```cmd
start "" "C:\Users\...\Windsurf.exe"
```

## 核心功能实现

### 1. 完整重置 Windsurf

```javascript
async fullReset() {
  // 1. 关闭 Windsurf
  await this.closeWindsurf();
  
  // 2. 删除缓存和数据
  await this.deleteCachesAndData();
  
  // 3. 清理用户数据
  await this.cleanUserData();
  
  // 4. 创建新配置和机器码
  await this.createPresetConfig();
}
```

### 2. 自动完成初始设置

```javascript
async completeOnboarding() {
  // 等待窗口出现
  await this.waitForWindow(30000);
  
  // 激活窗口
  await this.activateWindsurf();
  
  // 前3页：按回车键
  for (let i = 1; i <= 3; i++) {
    await this.pressEnter();
    await this.sleep(800);
  }
  
  // 第4页：Tab导航 + Enter点击
  await this.pressTab(); // 导航到按钮
  await this.pressEnter(); // 点击按钮
}
```

### 3. 账号切换流程

1. **重置配置** - 删除所有配置文件和缓存
2. **重置机器码** - 生成新的 machineId、sqmId、devDeviceId
3. **启动应用** - 自动启动 Windsurf
4. **自动登录** - 使用 Puppeteer 在浏览器中自动登录

## 依赖项

### robotjs

用于 Windows 平台的键盘和鼠标模拟：

```json
{
  "dependencies": {
    "robotjs": "^0.6.0"
  }
}
```

**安装要求（Windows）:**
- Visual Studio Build Tools
- Python 2.7 或 3.x
- Node.js 原生模块编译环境

**安装命令:**
```bash
npm install --global windows-build-tools
npm install robotjs
```

## 测试清单

### Windows 平台测试

- [ ] 应用启动和关闭
- [ ] 配置路径检测
- [ ] 完整重置功能
- [ ] 机器码生成和重置
- [ ] 窗口检测和激活
- [ ] 键盘模拟（Tab、Enter）
- [ ] 文本输入
- [ ] 批量注册流程
- [ ] 账号切换流程
- [ ] 浏览器自动登录

### 跨平台兼容性测试

- [ ] macOS 功能不受影响
- [ ] 工厂模式正确选择管理器
- [ ] 平台特定代码不冲突
- [ ] 配置文件格式一致
- [ ] 数据库文件兼容

## 已知限制

### Windows 特定限制

1. **robotjs 编译**
   - 需要 Visual Studio Build Tools
   - 首次安装可能需要较长时间
   - 某些 Windows 版本可能需要额外配置

2. **窗口操作**
   - 依赖 PowerShell 5.0+
   - 需要管理员权限（某些操作）
   - 窗口标题必须精确匹配

3. **防病毒软件**
   - 可能误报 robotjs 为恶意软件
   - 需要添加信任/白名单

## 开发指南

### 添加新的平台特定功能

1. 在对应的管理器中实现功能
2. 确保接口签名一致
3. 在工厂类中测试

```javascript
// windsurfManager.js (macOS)
async newFeature() {
  // macOS 实现
}

// windsurfManagerWindows.js (Windows)
async newFeature() {
  // Windows 实现
}
```

### 调试技巧

**启用详细日志:**
```javascript
const manager = WindsurfManagerFactory.create((msg) => {
  console.log('[DEBUG]', msg);
});
```

**测试平台检测:**
```javascript
const info = WindsurfManagerFactory.getPlatformInfo();
console.log(info);
// { platform: 'win32', platformName: 'Windows', arch: 'x64', isSupported: true }
```

## 未来计划

- [ ] Linux 平台支持
- [ ] 更智能的窗口检测
- [ ] 减少对 robotjs 的依赖
- [ ] 支持更多邮箱服务商
- [ ] 优化 Windows 性能

## 贡献指南

欢迎提交 Windows 平台的 Bug 报告和改进建议！

提交 Issue 时请包含：
- Windows 版本（Win 10/11）
- Node.js 版本
- 错误日志
- 复现步骤

## 许可证

MIT License - 与主项目保持一致
