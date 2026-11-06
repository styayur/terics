# Testing

## 原则

terics 不通过删除失败用例、跳过测试或伪造外部验收来通过发布门禁。外部账号不可用时，测试报告明确区分：

- 自动化单元/集成测试
- 本地真实浏览器测试
- 真实学校登录提取
- 真实 Google OAuth / Calendar 写入
- Google Calendar 网页端人工核验

## 自动化命令

```powershell
npm ci
npm run build:connectors
npm run generate:whut-fixture
npm run check
npm test
npm run build:extension
npm run package:extension
npm run verify:extension
npm run audit:licenses
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:extension-install:edge
npm run test:consistency

.\.venv\Scripts\ruff.exe check python main.pyw
.\.venv\Scripts\python.exe -m pytest python/tests
python main.pyw --smoke-test
```

## v0.6.0-rc.1 local result — 2026-11-06

| Suite | Result |
|---|---|
| TypeScript/Vitest | **91 passed** (19 files) |
| Playwright Web E2E | **15 passed** |
| Python pytest | **33 passed** |
| Cross-language | **6 fixtures / 318 events passed** |
| Windows Edge smoke | **passed** (extension load, opaque handoff, external claim, replay rejection) |
| Python Tkinter smoke | **passed** (`main.pyw --smoke-test`) |
| TypeScript check | **passed** |
| Ruff | **passed** |
| 1440px / 390px visual audit | **passed**, no document horizontal overflow and no console errors |

These results do not include real WHUT login, Google OAuth or live Calendar UI acceptance.

## TypeScript / Web 测试范围

- CSV / HTML / XLSX 内容嗅探，不依赖扩展名
- 单双周、不连续周次、多节连堂、冲突
- 学期边界、跨月日期、Asia/Shanghai
- RFC 5545 VTIMEZONE、折行、稳定 UID、重复 UID
- Schema 2.0 JSON 校验与危险认证字段拒绝
- Resolver：HTTPS/HTTP、IDN、私网、credentials、redirect warning、lookalike 域名
- Extension handoff：非透明 URL、TTL、SHA-256 完整性、Schema、sender origin/path、nonce、replay、超限、扩展缺失
- Whole-course removal：同名课程、共享教师、多周、补课/调课、空结果、标题回退拒绝
- ICS course removal：保留 VTIMEZONE 和其他 UID
- UID migration：一对一日志、unmatched/ambiguous 防写、确认门禁
- XLSX：ZIP entry/解压总量/压缩率、ZIP Slip、重复 entry、加密、工作表/行/列、XML depth、DTD/ENTITY
- Google planner：Create/Update/Skip/Conflict、empty delete block、duplicate detection、manual-edit protection、exact course removal、partial failure

## Browser E2E

Playwright 覆盖：

- URL 输入、已知/未知/危险 URL
- `text/html` 拖拽只提取链接
- 文件导入回退
- 教学周标尺、课程详情、冲突确认
- 旧 URL fragment 兼容
- opaque extension handoff / replay
- whole-course removal 与 JSON 下载
- 移动端 body 不横向溢出

## Edge 扩展 smoke

`npm run test:extension-install:edge` 在 Windows Microsoft Edge 中加载未打包扩展，验证：

- MV3 service worker 注册
- popup 与权限
- sanitized fixture 渲染
- Web handoff URL 不含 payload
- `chrome.storage` pending record
- `externally_connectable` 外部领取成功
- 第二次领取返回 `replay`

该 smoke 使用本地 fixture，不等同于真实学校登录验收。

## Python 测试范围

- 三类文件格式与编码
- XLSX ZIP/XML 资源防护
- v2 Schema 与 ICS
- Google OAuth 未配置状态
- Google event camelCase/legacy 属性
- manual edit conflict
- exact courseId Calendar removal
- browser connector bridge、GUI smoke

## 跨语言一致性

`npm run test:consistency` 使用相同 fixture 比较 TypeScript 与 Python 的会议/事件数量、UID、日期、时间、时区和周末/跨月边界。任何不一致都视为失败。

## 外部验收状态

| 项目 | 状态 | 说明 |
|---|---|---|
| WHUT 2026-2027-1 历史验收 | Passed（基线） | 42/42 页面课程块，13/13 节次，242 事件；见 `docs/whut-acceptance.md` |
| v0.6.0 新 WHUT 真实登录回归 | Blocked | 当前施工环境没有可用的 WHUT 登录会话 |
| Google OAuth 真实授权 | Blocked | 未配置 OAuth Client，未获得测试账户授权 |
| Google Calendar 完整学期写入 | Blocked | 需要独立测试日历 |
| Calendar 重复同步 / Update / Skip | Blocked | 需要真实 Calendar 环境 |
| 整门课程 Calendar 删除 | Blocked | 需要真实测试日历与网页核验 |
| Google Calendar 网页端核验 | Blocked | 不得以 API 200 或 mock 代替 |
| ICS 导入 Google Calendar 网页端 | Not verified | 需要用户账号环境 |

## CI

`.github/workflows/ci.yml` 在 Linux 上运行 TypeScript、Python、跨语言一致性与 Chromium E2E。Windows Edge smoke 需在 Windows 本地/自托管环境运行，不作为 Linux CI 的替代证据。

最终 CI 链接与提交 SHA 记录在 Release Notes 和交付报告中。
