# terics

**高校课表文件 → Google Calendar 兼容 ICS 转换器。**

纯浏览器 Web 版 + 可双击启动的 Windows Tkinter 桌面版。课表只在本地解析，不上传、不要登录、不要账号、Cookie 或后台服务。

[![CI](https://github.com/styayur/terics/actions/workflows/ci.yml/badge.svg)](https://github.com/styayur/terics/actions/workflows/ci.yml)
[![Pages](https://github.com/styayur/terics/actions/workflows/pages.yml/badge.svg)](https://github.com/styayur/terics/actions/workflows/pages.yml)
[![Release](https://img.shields.io/github/v/release/styayur/terics)](https://github.com/styayur/terics/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

- Web 版：<https://styayur.github.io/terics/>
- GitHub 仓库：<https://github.com/styayur/terics>
- v0.1.0 Release：<https://github.com/styayur/terics/releases/tag/v0.1.0>

> v0.1.0 不提供 Google OAuth / Calendar API 写入。生成 `.ics` 后通过 Google Calendar「设置 → 导入和导出」手动导入。

## 功能

- **本地处理**：浏览器端解析与导出，不发起课表上传请求。
- **内容嗅探**：不依赖文件扩展名；扩展名为 `.xls` 的 HTML 课表也可以识别。
- **三类 Adapter**：CSV/TSV 长表、HTML 课表、XLSX 周网格/长表。
- **周次规则**：连续、单双周、不连续周次、多段周次。
- **时间规则**：多节连堂、自定义节次时间、跨月/跨年。
- **冲突检测**：展开全部教学周后按实际日期/时间检测重叠。
- **导入预览**：导出前检查课程、日期、教师、地点、冲突与事件数量。
- **标准 ICS**：`Asia/Shanghai`、`VTIMEZONE`、CRLF、UTF-8 安全折行、文本转义、稳定 UID。
- **两端一致**：Web 与 Python 共享 Schema、业务规则和 fixtures；4 个样本的 269 个展开事件逐 UID 对比一致。

## Web 版

直接访问 **<https://styayur.github.io/terics/>**。

流程：

```text
选择文件 → 自动识别 → 确认学期与节次 → 预览课程 → 导出 ICS
```

页面内置 CSV、HTML、XLSX 测试样本。样本只从同一静态站点加载，仍不会上传用户文件。

技术栈：TypeScript + Vite + 原生 DOM/CSS；无前端组件库、无后端、无数据库。

## Python / Windows 桌面版

要求：**Windows 10/11 + Python 3.12+（含 Tkinter）**。

```powershell
git clone https://github.com/styayur/terics.git
cd terics
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python main.pyw
```

也可以安装依赖后直接双击 `main.pyw`。

如果缺少运行依赖，`main.pyw` 会弹出安装提示，而不是静默退出。

### Python CLI（可选）

```powershell
$env:PYTHONPATH = "python"
py -3.12 -m terics.cli "path\to\timetable.xlsx" --start 2026-08-31 -o "课表.ics"
```

## 支持的格式

| Adapter | 验证样本 | 状态 |
|---|---|---|
| CSV / TSV 长表 | `fixtures/csv/terics_sample.csv`，含 UTF-8 与 GB18030 | 已自动化验证 |
| HTML 列表式 | 青果风格脱敏虚构样本 `fixtures/html/qingguo_list_sample.xls` | 已自动化验证 |
| HTML 周网格 | MIT 公共样本 `fixtures/html/wakeup_usc_sample.html` | 已自动化验证 |
| XLSX | MIT 公共模板 `fixtures/xlsx/wakeup_schedule_template.xlsx` | 已自动化验证 |
| 旧版 OLE 二进制 `.xls` | — | 不支持，明确报错 |

详细格式、字段写法与限制见 **[docs/formats.md](docs/formats.md)**。

样本均为虚构或公开 MIT 测试资源，不包含真实学生课表。格式级支持不等于所有学校教务系统变体均验证通过。

## Google Calendar 导入

1. 打开 Google Calendar → 设置。
2. 选择「导入和导出」。
3. 上传 terics 生成的 `.ics`。
4. 选择目标日历并导入。

详见 **[docs/google-calendar.md](docs/google-calendar.md)**。

## 验收与已知边界

- Web：TypeScript 检查、Vitest、Playwright、生产构建全部通过。
- Python：Ruff、compileall、pytest 全部通过。
- ICS：使用 `ical.js` 与 Python `icalendar` 两套独立解析器交叉验证。
- 跨语言：共享 fixtures 的课程、日期、时间和稳定 UID 完全一致。
- **Google Calendar 网页端实际导入未在真实账号环境验证**，Release Notes 中持续标注，不伪称通过。
- 不支持扫描图片/PDF、加密工作簿、宏、旧版 OLE `.xls`、实时教务登录、在线订阅、云同步、AI。
- v0.1.0 使用一组节次时间，不支持按日期中途切换作息。
- 学期第一周周一需用户手动确认。

## 开发与测试

```powershell
npm ci
npm run check
npm test
npm run test:e2e

py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
$env:PYTHONPATH = "python"
python -m pytest python/tests
python -m compileall -q python main.pyw
ruff check python main.pyw

npm run test:consistency
```

项目结构、Adapter 接口与两端共享策略见 **[docs/architecture.md](docs/architecture.md)**，完整业务规则见 **[spec/business-rules.md](spec/business-rules.md)**。

## 文档

- [格式说明](docs/formats.md)
- [Google Calendar 导入](docs/google-calendar.md)
- [开源项目调研](docs/research.md)
- [架构](docs/architecture.md)
- [业务规则规范](spec/business-rules.md)
- [共享 JSON Schema](schema/timetable.schema.json)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)

## English

**terics** is a local-first converter from Chinese university timetable files to Google Calendar-compatible `.ics`. It ships as a static TypeScript/Vite web app and a Python 3.12+ Tkinter desktop app.

Supported adapters: CSV/TSV tables, HTML timetable tables, and XLSX worksheets. Files are detected by content rather than extension. The web app performs all parsing in the browser and never uploads timetable data.

v0.1.0 focuses on standards-compliant offline export. It does **not** use Google OAuth or the Calendar API; users import the generated `.ics` manually. Google Calendar's real account import flow has not been verified in this release.

Run the web app with `npm install && npm run dev`, or start the GUI with `python main.pyw` after installing `requirements.txt`.

## License

MIT. See [LICENSE](LICENSE). Third-party sample and dependency notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
