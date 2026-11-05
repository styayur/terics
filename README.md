# terics

**Local-first University Timetable Bridge**

高校课表获取、解析、ICS 导出与可选 Google Calendar 增量同步工具。

[![CI](https://github.com/styayur/terics/actions/workflows/ci.yml/badge.svg)](https://github.com/styayur/terics/actions/workflows/ci.yml)
[![Pages](https://github.com/styayur/terics/actions/workflows/pages.yml/badge.svg)](https://github.com/styayur/terics/actions/workflows/pages.yml)
[![Release](https://img.shields.io/github/v/release/styayur/terics?include_prereleases)](https://github.com/styayur/terics/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

- **Web**：<https://styayur.github.io/terics/>
- **Repository**：<https://github.com/styayur/terics>
- **v0.5.0-rc.1 Release**：<https://github.com/styayur/terics/releases/tag/v0.5.0-rc.1>
- **v0.1.0 历史版本保持不变**

> v0.5.0-rc.1 已实现 SIS Connector、MV3 扩展、Python Playwright 提取和 Google Calendar 同步代码路径，但真实学生账号与真实 Google OAuth 验收尚未完成。因此本版本使用 RC 标签，不冒充稳定版。

## 三种入口

### 1. Web

静态 HTML/CSS/TypeScript，部署到 GitHub Pages，无后端。

- HTML / CSV / TSV / XLSX 文件导入
- `.terics.json` schema 2.0 导入
- 扩展 URL fragment 交接
- 课程/调课预览、冲突确认
- RFC 5545 ICS
- 可选 Google Calendar 增量同步 UI（仅在配置 `VITE_GOOGLE_CLIENT_ID` 时启用）

Web 的 URL fragment 数据不会作为 HTTP 请求发送给 GitHub Pages。

### 2. Chrome / Edge 扩展

Manifest V3，最小权限：`activeTab`、`scripting`、`storage`。

- 用户点击扩展后，在已登录教务页执行只读 Connector
- 不使用 `<all_urls>` 或固定 host permissions
- 不读取浏览器 Cookie 数据库
- 预览并导出 `.terics.json` / ICS
- 通过 URL fragment 打开 Web preview

安装与构建见 [docs/browser-extension.md](docs/browser-extension.md)。

### 3. Python Windows Desktop

- Python 3.12+
- Tkinter
- Playwright 独立浏览器与独立 profile
- 原有文件导入完整保留
- `.terics.json` 导入
- 手动登录后只读提取
- ICS 导出
- Google Desktop OAuth + 系统 keyring 存储

```powershell
git clone https://github.com/styayur/terics.git
cd terics
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m playwright install chromium
python main.pyw
```

安装依赖后也可直接双击 `main.pyw`。

详见 [docs/desktop.md](docs/desktop.md)。

## Connector 支持状态

| Adapter | 平台 | 方法 | 状态 |
|---|---|---|---|
| `whut-wisedu-jwapp` | 武汉理工大学 · 金智 jwapp / wdkbby | 只读 API | Experimental |
| `zf-jwglxt` | 正方 V8/V9 兼容 | API + DOM | Experimental |
| `qiangzhi-dom` | 强智 | DOM | Experimental |
| `qingguo-dom` | 青果 | DOM / export | Experimental |
| `wisedu-jwapp` | 通用金智 | 只读 API | Experimental |
| `generic-dom` | 通用 HTML 表格 | DOM | Experimental |

支持等级定义和每个学校的证据见 [docs/support-matrix.md](docs/support-matrix.md)。

**没有学校被标记为 Verified。** 真实 WHUT 学生账号登录、实时课表对照及 Google Calendar 实际写入需要用户手动授权环境，本次未完成。

## schema 2.0

`.terics.json` 包含：

- source adapter / school / extraction metadata
- term context、第一周周一、教学周数、IANA 时区
- 有效日期范围内的多套节次时间
- stable course ID / meeting ID
- 单双周、不连续周次、多节连堂
- cancel / reschedule / makeup / room / teacher / period overrides
- validation report 和 completeness counters

禁止包含密码、Cookie、Token、Session、CSRF 等认证字段。Schema：`schema/timetable-v2.schema.json`。

事件 UID 只依赖 term ID、course ID、meeting ID、日期和节次，不依赖课程显示名、教师或教室。

## Google Calendar

- 离线 ICS 始终可用。
- Web 和 Python 的可选同步使用官方 Google Identity / OAuth 和 Calendar API。
- 推荐创建独立 `terics / …` 日历。
- 只管理带 `terics_source=terics` 私有扩展属性的事件。
- 空数据或验证失败时禁止删除。
- 删除候选必须再次明确确认。
- 不进行后台自动同步。

当前状态：**代码与 mock 测试通过；真实 OAuth/账号同步未验证**。配置方式见 [docs/google-calendar.md](docs/google-calendar.md)。

## 安全与隐私

- 不收集教务账号密码。
- 不绕过验证码、MFA 或访问控制。
- 不使用分析、遥测或课表服务器。
- HTML/XLSX 在本地安全解析，文件大小上限 10 MiB。
- Extension 无固定 Host Permissions。
- Python Playwright 不复制日常浏览器 profile。
- Web access token 仅保存在内存。
- Python refresh token 保存在系统 keyring。
- 可清除 extension storage、Python 登录 profile 和 Google 授权。

更多：[docs/privacy.md](docs/privacy.md) · [docs/threat-model.md](docs/threat-model.md) · [docs/data-flow.md](docs/data-flow.md)

## 测试

```powershell
npm ci
npm run check
npm test
npm run build:connectors
npm run build:extension
npm run package:extension
npm run verify:extension
npm run audit:licenses
npm run build
npx playwright install chromium
npm run test:e2e

py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
$env:PYTHONPATH = "python"
ruff check python main.pyw
python -m pytest python/tests
python main.pyw --smoke-test

npm run test:consistency
```

详细测试矩阵与真实环境阻塞见 [docs/testing.md](docs/testing.md)。

## 文档

- [Connector 清单](docs/connectors.md)
- [Connector SDK](docs/connector-sdk.md)
- [适配器开发](docs/adapter-development.md)
- [支持学校](docs/supported-schools.md)
- [支持等级矩阵](docs/support-matrix.md)
- [浏览器扩展](docs/browser-extension.md)
- [Python Desktop](docs/desktop.md)
- [Google Calendar](docs/google-calendar.md)
- [架构](docs/architecture.md)
- [数据流](docs/data-flow.md)
- [隐私](docs/privacy.md)
- [威胁模型](docs/threat-model.md)
- [测试](docs/testing.md)
- [v0.1 调研](docs/research.md)
- [业务规则](spec/business-rules.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)

## English

**terics** is a local-first bridge from Chinese university timetable sources to standard ICS and optional Google Calendar sync. It provides a static TypeScript/Vite web app, a Manifest V3 Chrome/Edge extension, and a Python 3.12+ Tkinter desktop app with a dedicated Playwright login profile.

The v0.5.0-rc.1 release ships experimental Wisedu/WHUT, Zhengfang, Qiangzhi and Qingguo connectors, stable schema 2.0, schedule overrides, effective-dated period tables, MV3 extraction, ICS export and a guarded Google Calendar sync planner. No real school account or Google OAuth account was available for final acceptance, so this release is explicitly a release candidate.

## License

MIT. See [LICENSE](LICENSE). Third-party sources and fixtures are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
