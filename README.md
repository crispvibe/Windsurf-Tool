# Windsurf-Tool
一键切号，一键查询积分，一键导入，批量注册，获取绑卡链接，自动绑卡免费使用。
**完全开源** | 本地运行 | 无后端服务器

## 项目说明

这是一个完全开源的 Windsurf 账号管理工具，所有代码公开透明，可自行审查。

首先作者没做续杯号池，也没有账号卖，qq群可以作证，之前500-750邀请注册积分的时候只是加了自己的注册邀请，注册的同时绑卡我也得到250，注册的账号也得到250。

之前不开源是因为想用的久一点，不想像cursor一样泛滥。好了最后记得点个Star小星星，后续不会再维护和更新该项目。

如果你还是不信可以去抓包
windsurf小助手
https://github.com/yuxinle1996/windsurf-assistant-pub

**本工具不收集任何用户数据**，所有账号信息仅存储在您的本地设备上。

## Token 获取原理

很多用户担心这是"账号收集工具"，这里详细说明 Token 的获取流程：

token是有过期时间大概是一个小时
### 认证流程

```
用户输入邮箱密码
        ↓
调用 Firebase 官方认证 API（通过 Cloudflare Workers 中转，解决国内访问问题）
        ↓
获取 Firebase idToken
        ↓
调用 Windsurf 官方 API: register.windsurf.com
        ↓
获取 API Key (Token)
```

### 技术细节

1. **Firebase 登录**：使用 Windsurf 官方的 Firebase API Key 进行身份验证
2. **Cloudflare Workers 中转**：仅用于解决国内无法直接访问 Firebase 的问题，中转服务不存储任何数据
3. **获取 API Key**：使用 Firebase 返回的 idToken 调用 Windsurf 官方接口 `RegisterUser` 获取 API Key

### 核心代码位置

- `js/accountLogin.js` - Token 获取核心逻辑
- `main.js` - 主进程 IPC 通信

关键代码片段：

```javascript
// 1. 使用邮箱密码登录 Firebase
const response = await axios.post(WORKER_URL + '/login', {
  email: email,
  password: password,
  api_key: FIREBASE_API_KEY
});

// 2. 使用 idToken 获取 Windsurf API Key
const response = await axios.post(
  'https://register.windsurf.com/exa.seat_management_pb.SeatManagementService/RegisterUser',
  { firebase_id_token: accessToken }
);
```

## 关于中转服务器

代码中使用了 Cloudflare Workers 中转服务（`js/constants.js`），这是因为国内无法直接访问 Firebase API。

**中转服务器仅做以下事情**：
1. 接收登录请求（邮箱、密码、API Key）
2. 转发到 Firebase 官方 API
3. 将 Firebase 返回的 Token 原样返回给客户端

**中转服务器不会**：
- 存储任何账号信息
- 记录任何请求日志
- 将数据发送到其他地方

如果您不信任中转服务器，可以：
1. 自行部署 Cloudflare Workers（代码开源）
2. 修改 `js/constants.js` 中的 `WORKER_URL` 为您自己的地址
3. 使用 VPN 直连 Firebase（无需中转）

## 数据安全

- **本地存储**：所有账号数据存储在 `~/Library/Application Support/windsurf-tool/`（Mac）或 `%APPDATA%/windsurf-tool/`（Windows）
- **无远程服务器**：本工具没有自己的后端服务器，不会上传任何用户数据
- **开源透明**：所有代码公开，欢迎审查

## 代码审查

您可以自行审查以下关键文件，确认没有账号收集行为：

| 文件 | 说明 |
|------|------|
| `js/constants.js` | 所有外部 API 地址 |
| `js/accountLogin.js` | Token 获取逻辑 |
| `js/accountQuery.js` | 账号查询逻辑 |
| `main.js` | 主进程，搜索 `axios.post` 查看所有网络请求 |

## 免责声明

本工具仅供学习和研究使用，请遵守 Windsurf 的服务条款。

## License

MIT License
