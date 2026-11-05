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

v0.1.0 文件导入支持三类 Adapter；v0.5.0 在此基础上增加 SIS Connector、schema 2.0 和扩展入口：

- **CSV**：长表课程清单，适合从任意教务系统整理后导入。
- **HTML**：青果列表式表格与通用“节次 × 星期”网格；支持 HTML 内容伪装为 `.xls`。
- **XLSX**：周网格与课程长表两种布局；不支持 OLE 二进制 `.xls`。

这只是格式级适配，不代表已验证全国所有教务系统变体。使用方法与已知边界见 `docs/formats.md`。


## 5. v0.5.0 追加协议与官方文档审计（2026-11-05）

### 新增参考结论

- 武汉理工大学入口在审计时返回 302 到 `zhlgd.whut.edu.cn` 统一认证。入口使用 `jwapp/sys/homeapp/index.do?forceCas=1`，不在未登录状态下探测个人课表接口。
- 早期公开行为研究曾指向 `wdkbby` 与 `cxxszhxqkb.do`；最终真实页面确认当前主链路为 `currentUser.do`、`student/getSections.do`、`student/getMyScheduleDetail.do`。旧假设仅保留为研究背景。
- 当前真实响应使用变长 `week` bitmap 与直接节次 code；解析器不再依赖固定 30 位或 WHUT DM 重映射。
- 上述接口只在用户手动登录后由页面上下文执行，且全部为只读请求。
- 2026-11-06 最终在用户授权的真实 WHUT 2026-2027-1 会话中完成页面请求核对与 42/42 课程块比对，因此将 WHUT 学校级适配器升级为 Verified；通用 Wisedu 仍为 Experimental。

### 官方技术文档

- Chrome `scripting` API：<https://developer.chrome.com/docs/extensions/reference/api/scripting>
- Chrome 权限声明：<https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions>
- Chrome activeTab：<https://developer.chrome.com/docs/extensions/develop/concepts/activeTab>
- Google Identity Services token model：<https://developers.google.com/identity/oauth2/web/guides/use-token-model>
- Google Calendar OAuth scopes：<https://developers.google.com/workspace/calendar/api/auth>
- Google Calendar extended properties：<https://developers.google.com/workspace/calendar/api/guides/extended-properties>
- Google Calendar events.list：<https://developers.google.com/workspace/calendar/api/v3/reference/events/list>
- Google OAuth for desktop apps：<https://developers.google.com/identity/protocols/oauth2/native-app>
- Playwright Python persistent context：<https://playwright.dev/python/docs/api/class-browsertype>

### v0.5.0 设计选择

- Extension 使用 `activeTab` + 用户点击时 `scripting.executeScript`，不申请固定 host permissions 或 `<all_urls>`。
- Python 使用独立 Playwright persistent profile，不复制日常浏览器目录；清除按钮删除专用 profile。
- Web token 模型只在内存保存 access token；无 client ID 时直接禁用同步 UI。
- Desktop 使用 installed-app loopback OAuth 与自动 PKCE；refresh token 存储到 OS keyring。
- Calendar sync 使用 `calendar.app.created` + 只读 calendar list scope，事件以 private extended properties 标记并限制删除。

### 真实环境阻塞

- WHUT 真实登录与课表对照已于 2026-11-06 由用户现场授权完成；Agent 未收集密码、MFA、Cookie 或真实课表到仓库。
- 正方、强智、青果的参考协议学校仍缺少真实登录验收。
- Google Calendar 真实同步仍需用户授权的 OAuth Desktop/Web client 与独立测试日历。
- 由于 Google Calendar 账户级验收仍未完成，发布等级保持 `v0.5.0-rc.2`。


## Live WHUT closeout (2026-11-06)

The final WHUT implementation was derived from the current authenticated frontend request chain, not from the earlier `cxxszhxqkb.do`/`jcjcx.do` fallback assumptions. The observed current endpoints are `currentUser.do`, `student/getSections.do` and `student/getMyScheduleDetail.do`. The old public research remained useful only as background; the accepted behavior and field mapping now come from the live 2026-2027-1 response and a 42/42 visible timetable comparison.

No GPL or unlicensed source code was copied during this closeout.
