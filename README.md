# terics

**Local-first university timetable bridge · 高校课表本地转换器**

把教务系统网址或课表文件转换为 Google Calendar 兼容的 `.ics`，并提供可选的 Google Calendar 原生同步。Web、Chrome/Edge 扩展和 Python Windows GUI 共用 Schema 2.0 与转换语义。

[![CI](https://github.com/styayur/terics/actions/workflows/ci.yml/badge.svg)](https://github.com/styayur/terics/actions/workflows/ci.yml)
[![Pages](https://github.com/styayur/terics/actions/workflows/pages.yml/badge.svg)](https://github.com/styayur/terics/actions/workflows/pages.yml)
[![Release](https://img.shields.io/github/v/release/styayur/terics?include_prereleases)](https://github.com/styayur/terics/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

- **Web**：<https://styayur.github.io/terics/>
- **Repository**：<https://github.com/styayur/terics>
- **当前候选版本**：`v0.6.0-rc.1`
- **v0.6.0-rc.1 Release**：<https://github.com/styayur/terics/releases/tag/v0.6.0-rc.1>
- **历史版本**：`v0.1.0`、`v0.5.0-rc.1`、`v0.5.0-rc.2` 保持不变

> **发布状态说明：** `v0.6.0-rc.1` 是 Release Candidate，不是 Stable。真实 WHUT 登录会话、Google OAuth Client、专用测试日历和 Calendar 网页端操作在本施工环境不可用，因此真实 Google Calendar 端到端验收仍被阻塞。自动化和本地浏览器验收已执行，但不会被冒充成真实账号验收。

## v0.6.0 重点

1. **URL-first 入口**：把教务系统网址拖入 Web 指定区域，本地识别学校、Vendor、Connector、置信度与下一步。
2. **精确 URL 安全校验**：仅 HTTP/HTTPS；拒绝凭据、localhost、私有 IP、脚本/数据/文件/扩展协议；不向任意网址发后台请求。
3. **Connector Registry**：六个 Adapter 统一声明 URL 规则、页面类型、权限、提取方法、证据与兼容范围。
4. **一次性扩展 Handoff**：扩展把课表写入本地 `chrome.storage`；Web 通过 opaque `requestId + nonce` 领取。URL 不含课表数据、Cookie 或 Token，支持 TTL、SHA-256、Schema 校验、重放与来源限制。
5. **整门课程删除**：按精确 `courseId` 删除整学期课程，覆盖 `.terics.json`、ICS 与 Google Calendar；同名课程、共享教师、补课/调课和普通 Calendar 事件不会被标题误删。
6. **Google Calendar 同步增强**：选择 primary / 已有 / 指定 `calendarId`；Create / Update / Skip / Conflict / Delete 预览；camelCase 身份属性与旧 snake_case 兼容；手动修改保护。
7. **UID 迁移工具**：检测 v0.1 legacy UID，生成一对一日志预览；必须显式 `--confirm`，不自动删除事件。
8. **XLSX 资源防护**：ZIP entry 数、单 entry/总解压上限、压缩率、ZIP Slip、重复 entry、加密、工作表数、行列数、XML 深度和 DTD/ENTITY 检查，TypeScript 与 Python 双端覆盖。
9. **Actions 升级**：工作流切换到 Node 24 代 Actions（checkout/setup-node/setup-python/pages）。

## 产品流程

```text
Drop URL
→ Identify School
→ Open Authenticated Portal
→ Extract Timetable (extension)
→ Review Courses
→ Export ICS / Sync Google Calendar
→ Manage Entire Courses
```

文件导入始终保留：

```text
CSV / HTML / XLSX / .terics.json / legacy ICS migration
```

### Web

纯静态 TypeScript + Vite，部署在 GitHub Pages，无后端、无账号系统、无文件上传。

- URL 拖拽、粘贴、手动输入和本地 Resolver
- 已知学校、实验性 Vendor、未知学校回退
- 扩展缺失、登录过期、提取失败和无 Connector 状态
- 文件拖放与内容嗅探，不依赖扩展名
- 多套节次时间、教学周标尺、冲突提示
- 课程详情和整门课程删除
- ICS / `.terics.json` 导出
- 可选 GIS Token Model Google Calendar 同步（需要部署时配置 Client ID）

视觉证据：[桌面 1440px](docs/assets/v0.6-web-desktop.png) · [整门课程删除](docs/assets/v0.6-web-course-removal.png) · [移动端 390px](docs/assets/v0.6-web-mobile.png)

### Chrome / Edge 扩展

Manifest V3，权限保持最小：

```json
["activeTab", "scripting", "storage"]
```

- 无 `<all_urls>`、固定 Host Permissions 或 Cookie 数据库读取
- 用户主动点击后才在已登录页面执行只读 Connector
- `externally_connectable` 仅允许 `https://styayur.github.io/terics/*`
- 一次性 Handoff 最大 2 MiB；超过上限自动下载 `.terics.json`
- 安装与验证见 [docs/browser-extension.md](docs/browser-extension.md)

### Python Windows Desktop

- Python 3.12+
- Tkinter
- Playwright 独立浏览器与 profile
- 文件导入、`.terics.json`、ICS 导出
- 手动登录后只读提取
- Google installed-app OAuth + 系统 keyring
- 不复制日常浏览器 Cookie/profile

```powershell
git clone https://github.com/styayur/terics.git
cd terics
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m playwright install chromium
python main.pyw
```

安装依赖后可直接双击 `main.pyw`。详见 [docs/desktop.md](docs/desktop.md)。

## 支持的输入格式

格式按内容识别，不依赖文件扩展名。

| 输入 | 状态 | 说明 |
|---|---|---|
| CSV / TSV | Verified by fixtures | 课程、教师、地点、星期、周次、节次列 |
| HTML 表格 / 列表 | Verified by fixtures | 青果、WakeUp 公共样本、通用 DOM |
| XLSX | Verified by fixtures | 周网格与结构化列；有 ZIP/XML 资源配额 |
| 二进制 `.xls` | Unsupported | 请另存为 XLSX、CSV 或 HTML |
| `.terics.json` | Schema 2.0 | Web/Python/扩展共享交换格式 |
| 旧版 terics ICS | Migration only | 使用 UID 迁移工具，不能按标题自动删课 |

## Connector 支持状态

| Adapter | 平台 | 状态 | 真实环境证据 |
|---|---|---|---|
| `whut-wisedu-jwapp` | 武汉理工大学 · Wisedu jwapp | **Verified（范围有限）** | 2026-2027-1 学生课表，42/42 页面课程块与 13/13 节次匹配 |
| `zf-jwglxt` | 正方 V8/V9 兼容 | Experimental | 合成/公共结构 fixture |
| `qiangzhi-dom` | 强智 DOM | Experimental | 公共结构 fixture |
| `qingguo-dom` | 青果 DOM/export | Experimental | 合成/公共结构 fixture |
| `wisedu-jwapp` | 通用金智 | Experimental | 合成 fixture，不继承 WHUT Verified |
| `generic-dom` | 通用 HTML 表格 | Experimental | 低置信 DOM 回退 |

WHUT 的 Verified **只代表**已验收的 `2026-2027-1 student timetable layout`，不外推到其他学校、学期、页面或 API 版本。详见 [docs/whut-acceptance.md](docs/whut-acceptance.md) 与 [docs/support-matrix.md](docs/support-matrix.md)。

## Schema 2.0 与稳定身份

`.terics.json` 包含 source、term、courses、meetings、overrides、validation 与 completeness counters。

- `courseId` 与 `meetingId` 使用教务 source 标识或确定性锚点
- 事件 UID 使用 `termId + courseId + meetingId + date + periods`
- 不依赖课程名称、教师、教室生成身份
- 支持单双周、不连续周次、多节连堂、停课、补课、调课
- 时区固定并校验为 `Asia/Shanghai`
- ICS 使用 RFC 5545 折行、CRLF、VTIMEZONE 和稳定 UID

Schema：[schema/timetable-v2.schema.json](schema/timetable-v2.schema.json)
业务规则：[spec/business-rules.md](spec/business-rules.md)

## Google Calendar

### Web

纯静态 SPA 使用官方 **Google Identity Services Token Model**。这不是“缺少 PKCE 的授权码流程”：Google 官方文档说明 Authorization Code Flow 需要后端换取/保存 token；本项目的零后端架构不保存 refresh token，access token 只在内存中，页面隐藏时撤销。

- Scopes：`calendar.events`、`calendar.app.created`、`calendar.calendarlist.readonly`
- 不请求 Gmail、通讯录或邮件
- 目标必须显式选择，可在同步前看到日历名称与 ID
- 管理属性：`tericsManaged`、`tericsSchemaVersion`、`tericsCourseId`、`tericsMeetingId`、`tericsSource`、`tericsUid`
- 兼容旧属性：`terics_source`、`terics_course_id`、`terics_meeting_id`、`terics_event_uid`
- 若检测到用户手动修改托管事件，跳过更新而不是覆盖非 terics 字段
- 空课表禁止批量删除；删除必须显式确认

### Python

Python Desktop 使用 installed-app OAuth（本地 loopback），refresh token 存放在系统 keyring。它不会把 token 上传给 terics 服务器。

配置与真实验收清单：[docs/google-calendar.md](docs/google-calendar.md)

## 整门课程删除

课程详情中提供：

- `Remove this occurrence`：显示但禁用，待后续版本
- `Remove this course for the semester`：v0.6 支持

删除严格按精确 `courseId` 执行：

- `.terics.json`：复制后删除指定 course 与关联 overrides，重新校验 Schema，原始文件不变
- ICS：只匹配 `X-TERICS-COURSE-ID`，保留 VTIMEZONE 与其他 UID；结果为空时拒绝写入
- Google Calendar：指定 `calendarId` + `tericsManaged=true` + 精确 `tericsCourseId`；兼容旧 snake_case；同名但缺少课程身份的事件会跳过
- 删除范围：仅文件 / 仅 Calendar / 两者，结果分开显示
- 部分失败保留报告并可重试；重复执行幂等
- 删除前可下载完整 ICS 备份

## UID Migration

v0.1 与 v0.5+ 的 UID 算法不同。先 dry-run：

```powershell
npm run migrate:uid -- --timetable fixtures/exchange/terics-example.terics.json --ics legacy.ics --out migrated.ics
```

确认预览完整、无歧义后：

```powershell
npm run migrate:uid -- --timetable path\to\current.terics.json --ics legacy.ics --out migrated.ics --confirm
```

工具只替换一对一匹配的 UID，不自动删除事件；原始 ICS 不被覆盖。详见 [docs/legacy-migration.md](docs/legacy-migration.md)。

## XLSX 防护

TypeScript 与 Python 均在打开工作簿前检查 ZIP 中央目录，并限制：

- 512 entries、单 entry 8 MiB、总解压 24 MiB
- 压缩率 ≤ 200、加密 ZIP 拒绝
- 路径穿越、反斜杠、绝对路径、重复 entry 拒绝
- 最多 32 个工作表、20,000 行、256 列
- XML 深度 ≤ 128，拒绝 DTD/ENTITY
- 原文件输入上限仍为 10 MiB，不通过提高总上限规避风险

实现：[`src/core/parsers/xlsx-security.ts`](src/core/parsers/xlsx-security.ts) · [`python/terics/parsers/xlsx_security.py`](python/terics/parsers/xlsx_security.py)

## 隐私与安全

- 不收集教务密码、验证码、Cookie、Token 或 CSRF
- 不绕过统一认证、MFA、CAPTCHA 或访问控制
- 不使用分析、遥测、远程课表存储或 AI
- Web 不上传文件；URL Resolver 不代理任意请求
- Extension 无固定 host permissions，不读取 Cookie 数据库
- Python Playwright 使用独立 profile，不复制日常浏览器资料
- Web access token 仅在内存；Python refresh token 在系统 keyring
- HTML 解析不执行脚本、事件处理器或外部资源
- 所有自动化测试数据为合成或脱敏 fixture

更多：[docs/privacy.md](docs/privacy.md) · [docs/threat-model.md](docs/threat-model.md) · [docs/data-flow.md](docs/data-flow.md)

## 测试

主要命令：

```powershell
npm ci
npm run check
npm test
npm run build:extension
npm run package:extension
npm run verify:extension
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:extension-install:edge
npm run test:consistency

.\.venv\Scripts\ruff.exe check python main.pyw
.\.venv\Scripts\python.exe -m pytest python/tests
python main.pyw --smoke-test
```

测试矩阵、真实环境证据和未验证项见 [docs/testing.md](docs/testing.md)。

## 已知限制

- Google OAuth 真实授权、真实 WHUT 学期写入、重复同步、Update/Skip、整门课程删除和 Calendar 网页端操作仍待外部凭据/账号环境验收。
- WHUT 仅针对已观测布局 Verified；`notArrangeList` / `practiceList` 非空语义在真实样本中未观测。
- 没有已确认的 WHUT 调课接口；不会猜测接口。
- 未提供签名 EXE 或商店上架包。
- 旧版无课程身份 ICS 不能自动按课程删除；需人工审核。
- 第三方浏览器扩展商店审核和长期维护不在本次范围。

## 文档

- [用户指南](docs/user-guide.md)
- [架构](docs/architecture.md)
- [Connector 清单](docs/connectors.md)
- [Connector SDK](docs/connector-sdk.md)
- [适配器开发](docs/adapter-development.md)
- [支持学校](docs/supported-schools.md)
- [支持矩阵](docs/support-matrix.md)
- [浏览器扩展](docs/browser-extension.md)
- [Python Desktop](docs/desktop.md)
- [Google Calendar](docs/google-calendar.md)
- [UID migration](docs/legacy-migration.md)
- [遗留债务](docs/v0.6.0-legacy-debt.md)
- [数据流](docs/data-flow.md)
- [隐私](docs/privacy.md)
- [威胁模型](docs/threat-model.md)
- [测试](docs/testing.md)
- [界面设计系统](.interface-design/system.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)

## English

**terics** is a local-first bridge from Chinese university timetable portals and exported files to RFC 5545 ICS and optional Google Calendar sync. It includes a static TypeScript/Vite Web app, a Manifest V3 Chrome/Edge extension, and a Python 3.12+ Tkinter desktop app.

The v0.6.0 line adds URL-first school resolution, a constrained extension-to-Web handoff, exact course-level removal, UID migration, XLSX ZIP resource guards, and hardened Google Calendar planning. WHUT remains verified only for the observed 2026-2027-1 student layout. Real Google OAuth and Calendar write acceptance remain outstanding; the current artifact is a release candidate, not a Stable release.

## License

MIT. See [LICENSE](LICENSE). Third-party sources and fixtures are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
