# terics v0.1.0

首个公开版本：本地优先的高校课表 → Google Calendar 兼容 `.ics` 转换器。

## 访问

- **Web 版**：<https://styayur.github.io/terics/>
- **源代码**：<https://github.com/styayur/terics>
- **完整变更**：[CHANGELOG.md](https://github.com/styayur/terics/blob/main/CHANGELOG.md)

## Release 资产

- `terics-web-v0.1.0.zip`：已验证的静态站点构建产物。
- `terics-python-v0.1.0.zip`：Python 源码、Tkinter GUI、共享 Schema、规则、样本和文档。
- `SHA256SUMS.txt`：上述两个 ZIP 的 SHA-256。

## Python 启动

要求 Python 3.12+（含 Tkinter）：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python main.pyw
```

安装依赖后也可以直接双击 `main.pyw`。

## 已验证的输入格式

| 格式 | 验证依据 |
|---|---|
| CSV / TSV 长表 | UTF-8、GB18030、单双周、不连续周次、跨年边界自动化测试 |
| HTML 列表 | 青果风格脱敏虚构样本，HTML 内容伪装 `.xls` |
| HTML 周网格 | MIT 公共 WakeUp 样本 |
| XLSX | MIT 公共 WakeUp 模板与跨语言一致性测试 |

样本均为虚构/公共测试资源，不含真实学生课表。格式支持不等于全国所有学校变体的完整兼容。

## 测试状态

- TypeScript 检查、Vitest **20 项**、Playwright **4 项**、生产构建通过。
- Python Ruff、compileall、pytest **17 项**与 Windows Tkinter GUI 冒烟通过。
- 4 个共享 fixture、**269 个展开事件**的课程、日期、时间与 UID 跨语言逐项一致。
- RFC 5545 由 `ical.js` 与 Python `icalendar` 独立解析验证。
- `npm audit --audit-level=high`：0 vulnerabilities。
- **Google Calendar 真实账号网页端导入未验证**；本版本未宣称该项通过。
- v0.1.0 不包含 OAuth、Calendar API 写入、在线订阅、云同步、数据库或 AI。

## 已知限制

- 不支持旧版 OLE 二进制 `.xls`、扫描图片/PDF、加密工作簿、宏。
- 学期第 1 周周一需手动确认。
- 每次导出一套节次时间，不支持学期中途切换作息。
- 学校教务系统变体可能需要新增 Parser Adapter。

## 校验

下载资产后执行：

```bash
sha256sum -c SHA256SUMS.txt
```
