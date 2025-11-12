# Windsurf-Tool 1.0

<div align="center">

**批量注册、自动切换、账号池管理**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-27.1.0-blue.svg)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/Platform-macOS-lightgrey.svg)](https://www.apple.com/macos/)
[![Release](https://img.shields.io/github/v/release/crispvibe/Windsurf-Tool)](https://github.com/crispvibe/Windsurf-Tool/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/crispvibe/Windsurf-Tool/total)](https://github.com/crispvibe/Windsurf-Tool/releases)
[![Windows](https://img.shields.io/badge/Windows-适配中-orange.svg)](https://github.com/crispvibe/Windsurf-Tool)

[简体中文](README.md) | [English](README_EN.md)

### 📥 下载

**最新版本**: [Windsurf-Tool for Mac 1.0](https://github.com/crispvibe/Windsurf-Tool/releases/latest)

| 平台 | 架构 | 下载链接 |
|------|------|----------|
| macOS | Intel (x64) | [Windsurf-Tool-1.0.0.dmg](https://github.com/crispvibe/Windsurf-Tool/releases/download/v1.0.0/Windsurf-Tool-1.0.0.dmg) |
| macOS | Apple Silicon (arm64) | [Windsurf-Tool-1.0.0-arm64.dmg](https://github.com/crispvibe/Windsurf-Tool/releases/download/v1.0.0/Windsurf-Tool-1.0.0-arm64.dmg) |
| Windows | x64 | 🚧 适配中，预计 2 天内发布 |

[功能特性](#功能特性) • [快速开始](#快速开始) • [使用指南](#使用指南) • [打包说明](#打包说明) • [工作原理](#工作原理) • [Windows适配](#windows适配)

</div>

---

## 功能特性

✅ **批量自动注册** - 自动注册 Windsurf 账号，支持自定义域名邮箱  
✅ **智能验证绕过** - 使用 puppeteer-real-browser 自动绕过 Cloudflare 人机验证  
✅ **本地邮箱接收** - 基于 IMAP 协议本地接收验证码，无需后端服务器  
✅ **账号池管理** - 本地管理账号（增删改查），支持到期提醒  
✅ **一键切换账号** - 自动重置配置、清除机器码、完成账号切换  
✅ **多语言支持** - 支持简体中文、英文  

---

## 📸 应用截图

<div align="center">

### 账号管理
<img src="./screenshot1.png" alt="账号管理界面" width="800"/>

### 批量注册
<img src="./screenshot2.png" alt="批量注册界面" width="800"/>

### 账号切换
<img src="./screenshot3.png" alt="账号切换界面" width="800"/>

</div>

---

## 快速开始

### 环境要求

- **Node.js**: v16.0.0 或更高版本
- **npm**: v7.0.0 或更高版本
- **操作系统**: macOS (目前仅支持 macOS)

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/yourusername/windsurf-tool.git
cd windsurf-tool

# 2. 安装依赖
npm install

# 3. 启动应用
npm start

# 开发模式（带调试工具）
npm run dev
```

---

## 使用指南

### 1. 配置邮箱

进入"配置"页面，设置以下信息：

#### 邮箱域名配置
添加你的域名邮箱后缀，例如：
- `example.com`
- `yourdomain.com`

注册时会自动生成格式为 `user_xxxxx@yourdomain.com` 的邮箱

#### IMAP 邮箱配置

配置用于接收验证码的邮箱 IMAP 信息：

**QQ 邮箱示例：**
```
IMAP服务器: imap.qq.com
端口: 993
邮箱账号: your@qq.com
密码: 授权码（不是QQ密码）
```

**Gmail 示例：**
```
IMAP服务器: imap.gmail.com
端口: 993
邮箱账号: your@gmail.com
密码: 应用专用密码
```

配置完成后点击"测试连接"验证配置是否正确。

### 2. 批量注册账号

1. 进入"批量注册"页面
2. 设置注册数量（建议 1-10 个）
3. 点击"开始批量注册"
4. 系统自动完成以下步骤：
   - 填写基本信息（姓名、邮箱）
   - 设置密码
   - 绕过 Cloudflare 验证
   - 接收并输入验证码
   - 保存账号到本地

### 3. 管理账号

进入"账号管理"页面，可以：
- 查看所有已注册账号
- 查看账号统计（总数、可用数、即将到期、已到期）
- 查看每个账号的 Pro 状态和剩余天数
- 复制账号信息或删除账号
- 手动添加已有账号

**到期规则：**
- Pro 试用期：13 天
- 剩余天数 > 3 天：绿色徽章
- 剩余天数 ≤ 3 天：橙色徽章（警告）
- 已到期：红色徽章

### 4. 切换账号（全自动）

1. 进入"切换账号"页面
2. 从下拉列表选择要切换的账号
3. 点击"自动切换账号"
4. 系统自动执行：
   - 完整重置 Windsurf 配置和机器码
   - 自动启动 Windsurf 应用
   - 使用 Puppeteer 自动填写登录信息
   - 完成账号切换

---

## 打包说明

### macOS 打包

#### 方法一：使用打包脚本（推荐）

```bash
# 运行交互式打包脚本
chmod +x build.sh
./build.sh

# 选择打包选项：
# 1) macOS (DMG + ZIP)
# 2) Windows (NSIS)
# 3) Linux (AppImage + DEB)
# 4) 全平台
```

#### 方法二：使用 npm 命令

```bash
# 打包 macOS 版本（x64 + arm64）
npm run build:mac

# 仅打包 arm64 版本（Apple Silicon）
npm run build:mac-arm64

# 打包所有平台
npm run build
```

#### 打包产物

打包完成后，文件位于 `dist/` 目录：

```
dist/
├── Windsurf-Tool 1.0-1.0.0-arm64.dmg    # Apple Silicon 安装包
├── Windsurf-Tool 1.0-1.0.0-x64.dmg      # Intel 安装包
├── Windsurf-Tool 1.0-1.0.0-arm64-mac.zip
└── Windsurf-Tool 1.0-1.0.0-x64-mac.zip
```

#### 安装方式

1. 打开 `.dmg` 文件
2. 将 `Windsurf-Tool 1.0` 拖拽到 `Applications` 文件夹
3. 首次运行时，右键点击应用选择"打开"（绕过 Gatekeeper）

### Windows 打包

**注意：当前版本未完全适配 Windows，打包仅供测试。**

```bash
# 在 macOS 或 Linux 上交叉编译 Windows 版本
npm run build:win
```

打包产物：
```
dist/
└── Windsurf-Tool 1.0 Setup 1.0.0.exe
```

---

## 工作原理

### 核心技术栈

- **前端框架**: Electron 27.1.0
- **浏览器自动化**: puppeteer-real-browser（绕过 Cloudflare）
- **邮箱接收**: Node.js IMAP（本地实现）
- **系统自动化**: AppleScript（macOS）
- **数据存储**: JSON 文件（本地存储）

### 关键技术实现

#### 1. Cloudflare 验证绕过

使用 `puppeteer-real-browser` 库的 turnstile 功能：
```javascript
const { connect } = require('puppeteer-real-browser');
const { page } = await connect({
  turnstile: true,  // 自动处理 Cloudflare Turnstile
  headless: false
});
```

#### 2. 本地 IMAP 邮件接收

在 Electron 主进程中实现 IMAP 协议：
```javascript
const Imap = require('imap');
const { simpleParser } = require('mailparser');

// 连接 IMAP 服务器
const imap = new Imap({
  host: config.host,
  port: config.port,
  tls: true,
  user: config.user,
  password: config.password
});

// 搜索并解析验证码邮件
```

#### 3. 完整重置机制

切换账号时执行以下操作：

**删除配置和缓存：**
```bash
rm -rf ~/Library/Application Support/Windsurf
rm -rf ~/Library/Caches/Windsurf
```

**重置机器标识：**
- `machineId` - 机器唯一标识
- `sqmId` - 遥测标识
- `devDeviceId` - 设备标识
- `machineid` 文件 - 硬件指纹

#### 4. 自动登录流程

使用 AppleScript 模拟键盘输入：
```applescript
tell application "System Events"
  keystroke "email@example.com"
  delay 0.5
  keystroke tab
  keystroke "password"
  delay 0.5
  keystroke return
end tell
```

#### 5. 账号到期管理

- 注册时记录创建时间
- Pro 试用期固定为 13 天
- 实时计算剩余天数
- 根据剩余天数显示不同状态徽章

### 数据存储结构

**accounts.json** - 账号数据
```json
[
  {
    "id": "1234567890",
    "email": "user_xxxxx@example.com",
    "password": "user_xxxxx@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

**current_login.json** - 当前登录账号
```json
{
  "email": "user_xxxxx@example.com",
  "password": "user_xxxxx@example.com"
}
```

---

## Windows 适配

### 当前状态

⚠️ **本工具目前仅完全支持 macOS，Windows 版本需要进行以下适配工作。**

### 需要适配的功能

#### 1. 配置路径

**macOS 路径：**
```javascript
const WINDSURF_CONFIG = path.join(process.env.HOME, 'Library/Application Support/Windsurf');
const WINDSURF_CACHE = path.join(process.env.HOME, 'Library/Caches/Windsurf');
```

**Windows 路径：**
```javascript
const WINDSURF_CONFIG = path.join(process.env.APPDATA, 'Windsurf');
const WINDSURF_CACHE = path.join(process.env.LOCALAPPDATA, 'Windsurf');
```

#### 2. 清理命令

**macOS 命令：**
```javascript
await execPromise(`rm -rf "${WINDSURF_CONFIG}"`);
```

**Windows 命令：**
```javascript
await execPromise(`rmdir /s /q "${WINDSURF_CONFIG}"`);
// 或使用 Node.js fs 模块
await fs.rm(WINDSURF_CONFIG, { recursive: true, force: true });
```

#### 3. 启动应用

**macOS 命令：**
```javascript
await execPromise('open -a Windsurf');
```

**Windows 命令：**
```javascript
await execPromise('start "" "C:\\Program Files\\Windsurf\\Windsurf.exe"');
```

#### 4. 自动化脚本

**macOS 使用 AppleScript：**
```applescript
tell application "System Events"
  keystroke "text"
end tell
```

**Windows 需要使用：**
- **PowerShell** - 发送按键
- **AutoHotkey** - 自动化脚本
- **robotjs** - Node.js 键盘模拟（已包含在依赖中）

示例代码（使用 robotjs）：
```javascript
const robot = require('robotjs');
robot.typeString('email@example.com');
robot.keyTap('tab');
robot.typeString('password');
robot.keyTap('enter');
```

### 适配步骤

1. **检测操作系统**
```javascript
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
```

2. **修改 `main.js`**
   - 添加平台检测
   - 根据平台选择不同的配置路径

3. **修改 `src/windsurfManager.js`**
   - 适配 Windows 的清理命令
   - 适配 Windows 的启动命令
   - 使用 robotjs 替代 AppleScript

4. **修改 `package.json`**
   - 确保 robotjs 依赖正确安装
   - 配置 Windows 打包选项

5. **测试**
   - 在 Windows 环境测试所有功能
   - 验证路径、命令、自动化是否正常工作

### 示例代码片段

**平台检测和路径选择：**
```javascript
function getWindsurfPaths() {
  if (process.platform === 'darwin') {
    return {
      config: path.join(process.env.HOME, 'Library/Application Support/Windsurf'),
      cache: path.join(process.env.HOME, 'Library/Caches/Windsurf')
    };
  } else if (process.platform === 'win32') {
    return {
      config: path.join(process.env.APPDATA, 'Windsurf'),
      cache: path.join(process.env.LOCALAPPDATA, 'Windsurf')
    };
  }
}
```

**跨平台清理：**
```javascript
async function clearWindsurf() {
  const paths = getWindsurfPaths();
  
  for (const dir of Object.values(paths)) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      console.error(`清理失败: ${dir}`, error);
    }
  }
}
```

**跨平台启动应用：**
```javascript
async function launchWindsurf() {
  if (process.platform === 'darwin') {
    await execPromise('open -a Windsurf');
  } else if (process.platform === 'win32') {
    // 需要根据实际安装路径调整
    const windsurfPath = 'C:\\Program Files\\Windsurf\\Windsurf.exe';
    await execPromise(`start "" "${windsurfPath}"`);
  }
}
```

---

## 注意事项

⚠️ **重要提示：**

1. **数据备份** - 切换账号会清除所有 Windsurf 配置，请提前备份重要数据
2. **IMAP 密码** - 通常是授权码，不是邮箱登录密码
3. **域名邮箱** - 确保配置的域名邮箱能够接收到 Windsurf 的验证邮件
4. **批量注册** - 建议间隔 5-10 秒，避免被检测
5. **系统权限** - macOS 需要授予辅助功能权限（系统偏好设置 > 安全性与隐私 > 辅助功能）

---

## 常见问题

**Q: Cloudflare 验证失败怎么办？**  
A: puppeteer-real-browser 会自动处理，如果失败请检查网络连接。

**Q: 收不到验证码？**  
A: 检查 IMAP 配置是否正确，使用"测试连接"功能验证。

**Q: 账号数据存储在哪里？**  
A: 存储在应用数据目录的 `accounts.json` 文件中。

**Q: 如何备份账号？**  
A: 复制应用数据目录中的 `accounts.json` 文件。

**Q: 自动登录失败怎么办？**  
A: 
1. 确保 Windsurf 已完全启动并显示登录界面
2. 检查系统是否允许 AppleScript 控制（系统偏好设置 > 安全性与隐私 > 辅助功能）
3. 如果自动登录失败，会显示账号密码供手动输入

---

## 开发者信息

本工具完全本地运行，不依赖任何后端服务器。  
所有数据均存储在本地，保护隐私安全。

### 项目结构

```
windsurf-tool/
├── main.js                      # Electron 主进程
├── renderer.js                  # 渲染进程逻辑
├── index.html                   # 主界面
├── language-selector.html       # 语言选择界面
├── build.sh                     # 打包脚本
├── src/
│   ├── browserAutomation.js     # Puppeteer 浏览器自动化
│   ├── clickLogin.applescript   # AppleScript 自动化脚本
│   ├── emailReceiver.js         # IMAP 邮件接收
│   ├── i18n.js                  # 国际化支持
│   ├── registrationBot.js       # 批量注册机器人
│   └── windsurfManager.js       # Windsurf 管理器
├── package.json                 # 项目配置
└── .gitignore                   # Git 忽略文件
```

### 技术栈

- **Electron** - 跨平台桌面应用框架
- **Puppeteer** - 浏览器自动化
- **Node.js IMAP** - 邮件接收
- **AppleScript** - macOS 系统自动化

---

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

---

## 社区交流

### QQ 群

欢迎加入 QQ 群交流讨论：

<div align="center">
  <img src="./IMG_4627.jpeg" alt="QQ群二维码" width="300"/>
  <p>扫码加入 QQ 群</p>
</div>

---

## 贡献

欢迎提交 Issue 和 Pull Request！

如果你想为 Windows 适配做出贡献，请参考 [Windows 适配](#windows适配) 章节。

---

<div align="center">

**Made with ❤️ for Windsurf Users**

</div>
