# Threat Model

## Assets

- 学生身份和学校登录会话
- 个人课表、教师、教室、日历事件
- Google OAuth access/refresh token
- 用户 Google Calendar 的事件完整性
- GitHub 仓库、Actions、Release 和 Pages 供应链

## 威胁与控制

| 威胁 | 控制 |
|---|---|
| URL scheme 注入 | Resolver 只允许 HTTP/HTTPS，拒绝 javascript/data/file/chrome-extension |
| 私网 SSRF/代理滥用 | 静态 Web 不发请求；拒绝 localhost/私网/保留 IP；无 URL proxy |
| 域名欺骗 | 精确 host 或注册域名边界匹配；不用 substring；WHUT 专用规则优先 |
| 恶意 redirect 参数 | 识别跨主机 `next`/`redirect_uri` 等并警告，不自动跟随 |
| HTML 注入/XSS | `DOMParser` 只提取链接；UI 全部 `textContent`；CSP 禁止外部脚本执行 |
| Extension 越权 | 仅 activeTab/scripting/storage；无固定 host 和 Cookie 权限 |
| Handoff 泄露 payload | URL 不含 payload；数据留 `chrome.storage.local` |
| Handoff 重放 | requestId+nonce、TTL、consumed、in-flight、sessionStorage、sender origin/path 和 extension ID |
| Handoff 篡改 | Schema 2.0 校验、SHA-256 payloadHash、payloadSize、最大 2 MiB |
| 恶意 extension message | 严格消息类型、协议版本、targetOrigin、sender origin/path |
| XLSX ZIP Bomb | 10 MiB输入 + entry/total/ratio 三层配额 + streaming inflate limit |
| ZIP Slip / symlink | 拒绝绝对路径、`..`、反斜杠、符号链接、重复 entry |
| XML attack | 拒绝 DTD/ENTITY、限制 XML depth 和 entry size |
| 伪造课程身份 | 精确 courseId/meetingId；禁止按标题模糊删除 |
| Calendar 大规模误删 | 空数据/验证失败阻止删除；只匹配 calendarId + tericsManaged + termId + courseId |
| 覆盖用户手动 Calendar 修改 | 存 `tericsRenderedHash`；检测远程字段漂移后进入 conflict 并跳过 PATCH |
| 重复 Calendar 事件 | 稳定 event ID/UID；重复 UID 检测后禁止自动删除/更新 |
| Partial API failure | 每事件独立 error、幂等重试、分别报告本地/Calendar 结果 |
| OAuth token 泄露 | Web 内存 token；Python keyring；API error 不含 token；无 token 日志 |
| OAuth scope 过度 | Calendar only；不请求 Gmail/通讯录 |
| Remote code in extension | 本地 bundle；验证器拒绝 eval/new Function/远程 importScripts |
| 依赖/供应链 | lockfile、npm audit、license audit、Actions Node 24 majors、SHA-256 assets |

## OAuth 模型说明

Web 是纯静态 GitHub Pages SPA，没有后端。Google 官方说明 Authorization Code Flow 需要后端平台交换/保存 token。本项目因此使用官方 GIS Token Model：

- access token 只在内存
- 不使用 Client Secret
- 不保存 refresh token
- 页面隐藏时撤销
- 必须获得全部必要 scope，否则拒绝使用

Python Desktop 是 installed app，使用 loopback OAuth；OAuth 库负责 PKCE/state，refresh token 存系统 keyring。

## 残余风险

- 真实学校页面/API 变化会导致 Connector 失效。
- 恶意但结构合法的学校响应仍可能产生错误课程数据；用户必须预览。
- 未完成真实 Google OAuth/Calendar UI 验收，直接同步功能不能视为 Stable。
- 不签名源码包不能证明 Windows 二进制完整性。
- GitHub Pages 的可用性依赖外部托管和 OAuth Client 配置。

## 范围外

- 绕过 CAPTCHA/MFA/访问控制
- 窃取 Cookie、复制日常浏览器 profile
- 向学校系统写入选课/退课/成绩变更
- 后台监控、云同步、AI 处理
