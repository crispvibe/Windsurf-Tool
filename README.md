# Windsurf-Tool 2.0

<div align="center">

**批量注册、自动切换、账号池管理**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-27.1.0-blue.svg)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-lightgrey.svg)](https://github.com/crispvibe/Windsurf-Tool)
[![Release](https://img.shields.io/github/v/release/crispvibe/Windsurf-Tool)](https://github.com/crispvibe/Windsurf-Tool/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/crispvibe/Windsurf-Tool/total)](https://github.com/crispvibe/Windsurf-Tool/releases)
[![Windows](https://img.shields.io/badge/Windows-✅%20支持-green.svg)](https://github.com/crispvibe/Windsurf-Tool)

[简体中文](README.md) | [English](README_EN.md)

### 📥 下载

| 平台 | 架构 | 下载链接 |
|------|------|----------|
| macOS | Intel (x64) | [Windsurf-Tool.dmg](https://github.com/crispvibe/Windsurf-Tool/releases/latest) |
| macOS | Apple Silicon (arm64) | [Windsurf-Tool-arm64.dmg](https://github.com/crispvibe/Windsurf-Tool/releases/latest) |
| Windows | x64 | [Windsurf-Tool.exe](https://github.com/crispvibe/Windsurf-Tool/releases/latest) |

[功能特性](#功能特性) • [快速开始](#快速开始) • [使用指南](#使用指南) • [打包说明](#打包说明) • [工作原理](#工作原理)

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
- **操作系统**: macOS 10.15+ / Windows 10+

### 📦 直接下载安装

#### macOS 安装说明

1. 下载对应架构的 DMG 文件
2. 双击打开 DMG 文件
3. 将应用拖拽到 Applications 文件夹
4. **首次运行**：右键点击应用 → 选择"打开" → 点击"打开"按钮
5. 以后可以正常双击运行

> ⚠️ **安全提示**：由于应用未签名，macOS 会阻止运行。可以通过以下方式绕过：
> 
> **方法1：右键打开（推荐）**
> - 右键点击应用 → 选择"打开" → 点击"打开"按钮
> 
> **方法2：一键解决命令**
> ```bash
> # 🚀 一键解决方案（复制粘贴直接运行）
> sudo xattr -rd com.apple.quarantine /Applications/Windsurf-Tool.app && echo "✅ 安全限制已解除，现在可以正常运行应用了！"
> ```
> 

#### Windows 安装说明

1. 下载 `Windsurf-Tool.exe`
2. 双击运行安装程序
3. 按照向导完成安装
4. 从开始菜单或桌面快捷方式启动应用

### 开发环境安装

```bash
# 1. 克隆仓库
git clone https://github.com/crispvibe/Windsurf-Tool.git
cd Windsurf-Tool

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

#### 步骤 1：设置 Cloudflare 邮箱转发

本工具使用 Cloudflare Email Routing 实现邮箱转发功能，完全免费且无需购买企业邮箱。

**前置条件：**
- 拥有一个域名（可在 Cloudflare、阿里云、腾讯云等购买）
- 域名已托管到 Cloudflare（免费）

**配置步骤：**

1. **登录 Cloudflare 控制台**
   - 访问 https://dash.cloudflare.com
   - 选择你的域名

2. **启用 Email Routing**
   - 进入 `Email` → `Email Routing`
   - 点击 `Enable Email Routing`
   - Cloudflare 会自动配置所需的 DNS 记录（MX、TXT）

3. **设置 Catch-all 地址**
   - 在 `Routing Rules` 中点击 `Catch-all address`
   - 选择 `Action`: `Send to an email`
   - 输入你的接收邮箱（如 `your@gmail.com` 或 `your@qq.com`）
   - 点击 `Save`

4. **验证接收邮箱**
   - Cloudflare 会发送验证邮件到你的接收邮箱
   - 点击邮件中的验证链接完成验证

**工作原理：**
- 发送到 `任意用户名@yourdomain.com` 的邮件
- 会自动转发到你配置的接收邮箱
- 无需为每个邮箱单独配置

#### 步骤 2：配置域名和 IMAP

进入工具的"配置"页面，设置以下信息：

**邮箱域名配置：**
添加你在 Cloudflare 配置的域名，例如：
- `example.com`
- `yourdomain.com`

注册时会自动生成格式为 `user_xxxxx@yourdomain.com` 的邮箱，所有邮件会转发到你的接收邮箱。

**IMAP 邮箱配置：**

配置你的接收邮箱的 IMAP 信息（即 Cloudflare 转发的目标邮箱）：

**QQ 邮箱示例：**
```
IMAP服务器: imap.qq.com
端口: 993
邮箱账号: your@qq.com
密码: 授权码（不是QQ密码，需在QQ邮箱设置中生成）
```

**Gmail 示例：**
```
IMAP服务器: imap.gmail.com
端口: 993
邮箱账号: your@gmail.com
密码: 应用专用密码（需在Google账号设置中生成）
```

**163 邮箱示例：**
```
IMAP服务器: imap.163.com
端口: 993
邮箱账号: your@163.com
密码: 授权码（需在163邮箱设置中生成）
```

配置完成后点击"测试连接"验证配置是否正确。

**常见问题：**
- ❓ **为什么需要授权码？** 出于安全考虑，邮箱服务商要求使用专门的授权码而非登录密码
- ❓ **如何获取授权码？** 在邮箱设置中搜索"IMAP"或"授权码"，按照提示生成
- ❓ **转发延迟？** Cloudflare Email Routing 通常在几秒内完成转发

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

**环境要求：**
- macOS 10.15+ 系统
- Node.js 16.0+ 
- npm 7.0+
- Xcode Command Line Tools：`xcode-select --install`

```bash
# 打包 macOS 版本（Intel + Apple Silicon）
npm run build:mac
```

**生成文件：**
- `Windsurf-Tool.dmg` - Intel Mac
- `Windsurf-Tool-arm64.dmg` - Apple Silicon Mac

### Windows 打包

**环境要求：**
- Windows 10/11 系统
- Node.js 16.0+
- npm 7.0+
- Visual Studio Build Tools 2019/2022
- Python 3.7+ （用于原生模块编译）

**安装构建工具：**
```powershell
# 方法1：使用 Visual Studio Installer 安装 "C++ build tools"
# 方法2：使用 chocolatey
choco install visualstudio2022buildtools --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools"

# 安装 Python（如果没有）
choco install python
```

```bash
# 打包 Windows 版本
npm run build:win
```

**生成文件：**
- `Windsurf-Tool.exe` - Windows 安装程序

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
