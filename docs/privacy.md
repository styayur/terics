# Privacy

## 本地优先

terics 没有课表后端、账号系统、数据库或遥测服务。Web 文件由浏览器 JavaScript 在当前标签页内解析。

## URL-first Resolver

- URL 只用于浏览器本地域名/路径规则匹配。
- GitHub Pages 不代理、不抓取用户输入的任意网址。
- 未知网址不会触发接口猜测。
- 若用户主动打开教务系统，后续请求发生在该学校 origin 的已登录标签页中。

## Extension

- 权限仅为 `activeTab`、`scripting`、`storage`。
- 不读取 Cookie 数据库、密码、浏览器历史或用户资料目录。
- 用户主动点击 popup 后才注入只读 Connector。
- 不绕过 MFA/CAPTCHA。
- Handoff 数据写入 `chrome.storage.local`，最多 2 MiB。
- Web URL 只含 opaque requestId/nonce/extId/target/expiry，不含课表 payload。
- 记录领取后标记 consumed；当前标签页 sessionStorage 另做短期重放保护。
- 清除扩展本地数据会删除最后提取和 pending handoff。

## Web Google

- 使用 Google Identity Services Token Model。
- Access token 仅保存在内存。
- 页面隐藏/关闭时尝试撤销。
- 不写 localStorage 的 token。
- 不请求 Gmail、通讯录或邮件。
- 日历选择只保存 calendar ID/名称到本地 localStorage；不含 token。
- Calendar API 仅发送到 `www.googleapis.com`。

## Python Desktop

- Playwright 使用独立 profile `%LOCALAPPDATA%\terics\browser-profile`。
- 不复制日常 Edge/Chrome Cookie 或 profile。
- Google refresh token 存放在系统 keyring。
- sync log 只保存时间、calendarId、termId 和计数，不保存课程正文或 token。
- 可清除浏览器 profile 和 Google 授权。

## 数据最小化

`.terics.json` 只包含转换所需信息：

- 学校/Connector/Adapter 元数据
- 学期、日期、节次、时区
- 课程、教师、地点、周次、调课记录
- 验证计数

Schema 校验会拒绝 password、cookie、token、authorization、credential、CSRF 等键名。

## 外部网络表

| 操作 | 网络目标 |
|---|---|
| Web 文件导入 | 无；样例按钮只 fetch 同源静态文件 |
| URL Resolver | 无网络请求 |
| Extension 提取 | 用户已打开的学校 origin |
| Extension → Web | 本地 Chrome extension storage；Web 不请求第三方 |
| Web Google 同步 | Google Identity + Calendar API |
| Python 文件导入 | 无 |
| Python 浏览器提取 | 用户打开并登录的学校 origin |
| Python Google 同步 | Google OAuth + Calendar API |

## 用户控制

- 选择离线 ICS/JSON，不使用 Google 同步。
- 清楚查看目标 calendarId 后再同步/删除。
- 删除 Calendar 前下载 ICS 备份。
- 清除扩展数据、Python profile、Google keyring 授权。
- 不把真实课表提交到 Issue/PR/测试 fixture。
