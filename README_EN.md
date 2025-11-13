# Windsurf-Tool 2.0

<div align="center">

**Batch Registration, Auto Switch, Account Pool Management**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-27.1.0-blue.svg)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-lightgrey.svg)](https://github.com/crispvibe/Windsurf-Tool)
[![Release](https://img.shields.io/github/v/release/crispvibe/Windsurf-Tool)](https://github.com/crispvibe/Windsurf-Tool/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/crispvibe/Windsurf-Tool/total)](https://github.com/crispvibe/Windsurf-Tool/releases)
[![Windows](https://img.shields.io/badge/Windows-✅%20Supported-green.svg)](https://github.com/crispvibe/Windsurf-Tool)

[English](README_EN.md) | [简体中文](README.md)

### 📥 Download

| Platform | Architecture | Download |
|----------|--------------|----------|
| macOS | Intel (x64) | [Windsurf-Tool.dmg](https://github.com/crispvibe/Windsurf-Tool/releases/latest) |
| macOS | Apple Silicon (arm64) | [Windsurf-Tool-arm64.dmg](https://github.com/crispvibe/Windsurf-Tool/releases/latest) |
| Windows | x64 | [Windsurf-Tool.exe](https://github.com/crispvibe/Windsurf-Tool/releases/latest) |

[Features](#features) • [Quick Start](#quick-start) • [User Guide](#user-guide) • [Build Instructions](#build-instructions) • [How It Works](#how-it-works)

</div>

---

## Features

✅ **Batch Auto Registration** - Automatically register Windsurf accounts with custom domain emails  
✅ **Smart Verification Bypass** - Auto bypass Cloudflare verification using puppeteer-real-browser  
✅ **Local Email Reception** - Receive verification codes locally via IMAP protocol, no backend server needed  
✅ **Account Pool Management** - Manage accounts locally (CRUD), with expiration reminders  
✅ **One-Click Account Switch** - Auto reset config, clear machine ID, complete account switching  
✅ **Multi-language Support** - Supports Simplified Chinese and English  

---

## 📸 Screenshots

<div align="center">

### Account Management
<img src="./screenshot1.png" alt="Account Management Interface" width="800"/>

### Batch Registration
<img src="./screenshot2.png" alt="Batch Registration Interface" width="800"/>

### Account Switching
<img src="./screenshot3.png" alt="Account Switching Interface" width="800"/>

</div>

---

## Quick Start

### Requirements

- **Node.js**: v16.0.0 or higher
- **npm**: v7.0.0 or higher
- **OS**: macOS 10.15+ / Windows 10+

### 📦 Direct Download Installation

#### macOS Installation

1. Download the corresponding architecture DMG file
2. Double-click to open the DMG file
3. Drag the app to Applications folder
4. **First run**: Right-click the app → Select "Open" → Click "Open" button
5. Can run normally by double-clicking afterwards

> ⚠️ **Security Notice**: Since the app is unsigned, macOS will block it. You can bypass this with:
> 
> **Method 1: Right-click Open (Recommended)**
> - Right-click the app → Select "Open" → Click "Open" button
> 
> **Method 2: One-click Solution Command**
> ```bash
> # 🚀 One-click solution (copy and paste to run)
> sudo xattr -rd com.apple.quarantine /Applications/Windsurf-Tool.app && echo "✅ Security restrictions removed, app can now run normally!"
> ```
> 

#### Windows Installation

1. Download `Windsurf-Tool.exe`
2. Double-click to run the installer
3. Follow the wizard to complete installation
4. Launch from Start menu or desktop shortcut

### Development Environment Installation

```bash
# 1. Clone repository
git clone https://github.com/crispvibe/Windsurf-Tool.git
cd Windsurf-Tool

# 2. Install dependencies
npm install

# 3. Start application
npm start

# Development mode (with dev tools)
npm run dev
```

---

## User Guide

### 1. Email Configuration

#### Step 1: Setup Cloudflare Email Routing

This tool uses Cloudflare Email Routing for email forwarding - completely free and no need to purchase enterprise email.

**Prerequisites:**
- Own a domain (can purchase from Cloudflare, Namecheap, GoDaddy, etc.)
- Domain hosted on Cloudflare (free)

**Configuration Steps:**

1. **Login to Cloudflare Dashboard**
   - Visit https://dash.cloudflare.com
   - Select your domain

2. **Enable Email Routing**
   - Go to `Email` → `Email Routing`
   - Click `Enable Email Routing`
   - Cloudflare will automatically configure required DNS records (MX, TXT)

3. **Setup Catch-all Address**
   - In `Routing Rules`, click `Catch-all address`
   - Select `Action`: `Send to an email`
   - Enter your receiving email (e.g., `your@gmail.com` or `your@qq.com`)
   - Click `Save`

4. **Verify Receiving Email**
   - Cloudflare will send a verification email to your receiving address
   - Click the verification link in the email to complete setup

**How It Works:**
- Emails sent to `any-username@yourdomain.com`
- Will automatically forward to your configured receiving email
- No need to configure each email individually

#### Step 2: Configure Domain and IMAP

Go to the tool's "Settings" page and configure:

**Email Domain Configuration:**
Add your domain configured in Cloudflare, for example:
- `example.com`
- `yourdomain.com`

Registration will auto-generate emails in format `user_xxxxx@yourdomain.com`, and all emails will forward to your receiving address.

**IMAP Email Configuration:**

Configure IMAP settings for your receiving email (the target email in Cloudflare forwarding):

**QQ Mail Example:**
```
IMAP Server: imap.qq.com
Port: 993
Email: your@qq.com
Password: Authorization code (not QQ password, generate in QQ Mail settings)
```

**Gmail Example:**
```
IMAP Server: imap.gmail.com
Port: 993
Email: your@gmail.com
Password: App-specific password (generate in Google Account settings)
```

**Outlook Example:**
```
IMAP Server: outlook.office365.com
Port: 993
Email: your@outlook.com
Password: Account password or app password
```

**163 Mail Example:**
```
IMAP Server: imap.163.com
Port: 993
Email: your@163.com
Password: Authorization code (generate in 163 Mail settings)
```

**126 Mail Example:**
```
IMAP Server: imap.126.com
Port: 993
Email: your@126.com
Password: Authorization code (generate in 126 Mail settings)
```

**Yahoo Mail Example:**
```
IMAP Server: imap.mail.yahoo.com
Port: 993
Email: your@yahoo.com
Password: App-specific password (generate in Yahoo account settings)
```

**iCloud Mail Example:**
```
IMAP Server: imap.mail.me.com
Port: 993
Email: your@icloud.com
Password: App-specific password (generate in Apple ID settings)
```

💡 **Quick Config Tip:** The tool has built-in quick configuration for common email providers. Select your email provider in the "Settings" page to auto-fill IMAP configuration.

Click "Test Connection" to verify configuration.

**FAQ:**
- ❓ **Why authorization code?** For security, email providers require special authorization codes instead of login passwords
- ❓ **How to get authorization code?** Search for "IMAP" or "authorization code" in email settings and follow instructions
- ❓ **Forwarding delay?** Cloudflare Email Routing typically completes forwarding within seconds

### 2. Batch Registration

1. Go to "Batch Registration" page
2. Set registration count (recommend 1-10)
3. Click "Start Batch Registration"
4. System automatically completes:
   - Fill basic information (name, email)
   - Set password
   - Bypass Cloudflare verification
   - Receive and input verification code
   - Save account locally

### 3. Account Management

Go to "Account Management" page to:
- View all registered accounts
- View account statistics (total, available, expiring soon, expired)
- View each account's Pro status and remaining days
- Copy account info or delete accounts
- Manually add existing accounts

**Expiration Rules:**
- Pro trial period: 13 days
- Remaining days > 3: Green badge
- Remaining days ≤ 3: Orange badge (warning)
- Expired: Red badge

### 4. Switch Account (Fully Automatic)

1. Go to "Switch Account" page
2. Select account from dropdown
3. Click "Auto Switch Account"
4. System automatically:
   - Fully reset Windsurf config and machine ID
   - Auto launch Windsurf app
   - Auto fill login info using Puppeteer
   - Complete account switch

---

## Build Instructions

### macOS Build

**Requirements:**
- macOS 10.15+ system
- Node.js 16.0+
- npm 7.0+
- Xcode Command Line Tools: `xcode-select --install`

```bash
# Build macOS version (Intel + Apple Silicon)
npm run build:mac
```

**Generated files:**
- `Windsurf-Tool.dmg` - Intel Mac
- `Windsurf-Tool-arm64.dmg` - Apple Silicon Mac

### Windows Build

**Requirements:**
- Windows 10/11 system
- Node.js 16.0+
- npm 7.0+
- Visual Studio Build Tools 2019/2022
- Python 3.7+ (for native module compilation)

**Install build tools:**
```powershell
# Method 1: Use Visual Studio Installer to install "C++ build tools"
# Method 2: Use chocolatey
choco install visualstudio2022buildtools --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools"

# Install Python (if not available)
choco install python
```

```bash
# Build Windows version
npm run build:win
```

**Generated files:**
- `Windsurf-Tool.exe` - Windows installer

---

## How It Works

### Core Tech Stack

- **Frontend Framework**: Electron 27.1.0
- **Browser Automation**: puppeteer-real-browser (bypass Cloudflare)
- **Email Reception**: Node.js IMAP (local implementation)
- **System Automation**: AppleScript (macOS)
- **Data Storage**: JSON files (local storage)

### Key Technical Implementations

#### 1. Cloudflare Verification Bypass

Using `puppeteer-real-browser` library's turnstile feature:
```javascript
const { connect } = require('puppeteer-real-browser');
const { page } = await connect({
  turnstile: true,  // Auto handle Cloudflare Turnstile
  headless: false
});
```

#### 2. Local IMAP Email Reception

Implement IMAP protocol in Electron main process:
```javascript
const Imap = require('imap');
const { simpleParser } = require('mailparser');

// Connect to IMAP server
const imap = new Imap({
  host: config.host,
  port: config.port,
  tls: true,
  user: config.user,
  password: config.password
});

// Search and parse verification code emails
```

#### 3. Complete Reset Mechanism

When switching accounts, perform:

**Delete config and cache:**
```bash
rm -rf ~/Library/Application Support/Windsurf
rm -rf ~/Library/Caches/Windsurf
```

**Reset machine identifiers:**
- `machineId` - Machine unique identifier
- `sqmId` - Telemetry identifier
- `devDeviceId` - Device identifier
- `machineid` file - Hardware fingerprint

#### 4. Auto Login Process

Using AppleScript to simulate keyboard input:
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

#### 5. Account Expiration Management

- Record creation time on registration
- Pro trial period fixed at 13 days
- Real-time calculation of remaining days
- Display different status badges based on remaining days

### Data Storage Structure

**accounts.json** - Account data
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

**current_login.json** - Current logged-in account
```json
{
  "email": "user_xxxxx@example.com",
  "password": "user_xxxxx@example.com"
}
```

---

## Developer Info

This tool runs completely locally, no backend server required.  
All data stored locally, protecting privacy and security.

### Project Structure

```
windsurf-tool/
├── main.js                      # Electron main process
├── renderer.js                  # Renderer process logic
├── index.html                   # Main interface
├── language-selector.html       # Language selection interface
├── build.sh                     # Build script
├── src/
│   ├── browserAutomation.js     # Puppeteer browser automation
│   ├── clickLogin.applescript   # AppleScript automation script
│   ├── emailReceiver.js         # IMAP email reception
│   ├── i18n.js                  # Internationalization support
│   ├── registrationBot.js       # Batch registration bot
│   └── windsurfManager.js       # Windsurf manager
├── package.json                 # Project config
└── .gitignore                   # Git ignore file
```

### Tech Stack

- **Electron** - Cross-platform desktop app framework
- **Puppeteer** - Browser automation
- **Node.js IMAP** - Email reception
- **AppleScript** - macOS system automation

---

## License

This project is licensed under [MIT License](LICENSE).

---

## Community

### QQ Group

Welcome to join QQ group for discussion:

<div align="center">
  <img src="./IMG_4627.jpeg" alt="QQ Group QR Code" width="300"/>
  <p>Scan to join QQ group</p>
</div>

---

## Contributing

Welcome to submit Issues and Pull Requests!

If you want to contribute to Windows adaptation, please refer to [Windows Adaptation](#windows-adaptation) section.

---

<div align="center">

**Made with ❤️ for Windsurf Users**

</div>
