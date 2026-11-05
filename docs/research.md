# 前期调研与技术评估

审计时间：2026-11-05（Asia/Shanghai）

审计账户：`styayur`

GitHub Star 总数：408（通过 GitHub API 分页读取）

## 1. Star 收藏中的相关项目

使用“课表 / 课程表 / 教务 / 上课 / 排课 / timetable / course schedule / class schedule / WakeUp / 课程格子 / ICS / iCalendar”等关键词过滤后，强相关项目为：

| 仓库 | 相关性 | 是否可直接复用 |
|---|---|---|
| `g10guang/WHUT_Courses_System` | 武汉理工大学抢课系统，涉及高校教务系统 | 否；与文件解析/ICS 目标不同，且未在本项目中复用 |
| `zichen0116/wakeup-versions` | WakeUp 软件历史版本存档 | 否；仅二进制与版本存档 |

用户指定的五个参考仓库在本次审计时均未出现在 Star 收藏中，因此另行通过公开仓库 API 与浅克隆进行调研。

## 2. 指定仓库评估

| 仓库 | 技术/适用系统 | 解析能力 | 工程质量观察 | 许可证 | 本项目处理 |
|---|---|---|---|---|---|
| `lingion/sleepy` | Kotlin + Jetpack Compose Android 课表；正方、强智、URP、WakeUp/CSV/HTML/ICS 等导入路线 | 学校适配器很多，含图格式课表与教务直连；第三方 `shiguang` 解析资产规模较大 | 测试和文档非常完整，但 Android/Compose 运行时与本项目差异大 | GPL-3.0 | 仅研究产品流与格式边界；未复制任何代码或资源 |
| `zaochih/zf-to-ics` | JavaScript Chrome 扩展；正方教务 V9 实时 API | 周次、节次、双套作息、理论/实验合并、ICS 折行和稳定 UID | 逻辑集中，测试覆盖关键解析与 ICS 边界；在线 API 依赖登录页 | 仓库未声明许可证 | 不复制、不改编；只对 RFC 5545/UID 思路做独立实现 |
| `hc-ui/kebiao2ics` | 原生 JavaScript 浏览器工具 | 周次、单双周、节次、冲突、ICS、预览 | 轻量、浏览器本地处理、自带 Node 测试 | MIT | 研究交互和测试思路；未复制代码 |
| `Ricraft/wakeup-schedule` | Python + PyQt6 Windows 课表应用；正方/强智 HTML、Excel、文本导入 | 强智 HTML、标准 Excel、WebView 导入、节次/周次模型 | 文档与测试较多；依赖较重，含 WebView/网络导入 | MIT | 作为 HTML/XLSX 公共 fixture 来源；未复制运行时代码 |
| `LingNc/stnet_syllabus` | Go；青果教务导出的 `.xls`（实为 HTML） | 青果列表式表格、周次/节次/地点、ICS、批量处理；部分格式依赖 AI 接口 | 业务拆分清晰，但含外部 AI 服务与密钥配置 | MIT | 研究青果列表结构的字段/时间地点表达式；样本由本项目自行构造 |

## 3. 可复用结论

1. 不直接复制任何参考项目代码。项目从零实现 TypeScript 与 Python 两套核心，避免 GPL 传染、无许可证风险和不一致运行时。
2. 学习到的可靠规则包括：
   - 扩展名不可信，`.xls` 经常实际是 HTML；
   - 周次必须按段解析单双周，并保留不连续周次；
   - 多节连堂用首节开始、末节结束；
   - ICS 必须做 UTF-8 安全折行、CRLF、文本转义和稳定 UID；
   - 导入前必须让用户确认学期第一周周一与学校作息。
3. 仅引入 MIT 参考仓库中的公共测试样本，并在 `THIRD_PARTY_NOTICES.md` 保留来源与许可证：
   - `fixtures/html/wakeup_usc_sample.html`
   - `fixtures/xlsx/wakeup_schedule_template.xlsx`
4. 青果列表 fixture 的字段结构参考 `LingNc/stnet_syllabus`，但课程、教师、教室、学号均为虚构数据，不包含任何真实学生课表。
5. `zf-to-ics` 无许可证，Sleepy 为 GPL-3.0，二者均未进入本仓库源码或资产。

## 4. 调研对应的支持范围

v0.1.0 支持三类 Adapter：

- **CSV**：长表课程清单，适合从任意教务系统整理后导入。
- **HTML**：青果列表式表格与通用“节次 × 星期”网格；支持 HTML 内容伪装为 `.xls`。
- **XLSX**：周网格与课程长表两种布局；不支持 OLE 二进制 `.xls`。

这只是格式级适配，不代表已验证全国所有教务系统变体。使用方法与已知边界见 `docs/formats.md`。
