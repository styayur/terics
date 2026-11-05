# terics 业务规则规范 v1.0

本文件是 Web TypeScript 实现与 Python 实现的共享行为规范。两端必须对同一输入、同一学期日期和同一节次表生成相同的事件集合与 UID。JSON Schema 见 `schema/timetable.schema.json`。

## 1. 处理流程

1. 读取文件字节，先检查大小、空文件和已知二进制签名。
2. 通过内容嗅探选择 Adapter，扩展名不参与格式判定。
3. Adapter 输出标准化课程：名称、教师、地点、星期、周次、起止节次、备注。
4. 用户确认第 1 周周一与全校节次时间。
5. 按“周次 × 星期”展开为具体日期事件。
6. 检测同一日期内的时间冲突。
7. 生成 RFC 5545 `.ics`。

## 2. 文件识别顺序

| 条件 | 判定 |
|---|---|
| 字节以 `D0 CF 11 E0 A1 B1 1A E1` 开头 | 旧版 OLE `.xls`，v0.1.0 明确拒绝 |
| 字节以 `PK 03 04` 开头 | 按 XLSX 解析；损坏 ZIP 报错 |
| 文本包含完整 HTML 表格结构 | 按 HTML 解析 |
| 其他可解码文本 | 按 CSV/TSV 解析 |
| 文件 > 10 MiB | 拒绝 |
| 空文件 | 拒绝 |

文本解码顺序：

1. UTF-16 BOM；
2. HTML `<meta charset>` 声明的 GBK/GB2312/GB18030 → 按 GB18030 解码；
3. UTF-8 严格解码；
4. GB18030 严格解码；
5. 均失败则拒绝，不静默替换乱码。

## 3. 周次规则

传统文件适配器的周次范围为 1–30；SIS schema 2.0 的 WHUT 位图解析不受固定周数截断。传统文件导入支持：

- `1-16`
- `第1-16周`
- `1-16周(单)` / `1-16单`
- `2-16周(双)` / `2-16双`
- `1-8,10-16`
- `1,3,5,7`
- `第1-2周，4、6`

规则：

- 逗号、中文逗号、顿号均可作为分隔符。
- 单双周过滤在每段范围上执行。
- 输出周次去重并升序排列。
- 传统文件导入中，非法、倒序或超过 30 的周次产生错误。
- WHUT `week` 位图按完整字符串解析，稀疏周与大于 30 的尾随周不得被截断。
- 一个课程包含多个不相邻周次时，不得压缩为单一连续范围。

## 4. 星期与节次

星期映射：

- 周一/星期一/礼拜一/`1`/Monday/Mon → 1
- 周二…周日依次为 2…7
- `周日`、`周天`、`7`、Sunday/Sun → 7

节次支持：

- `1-2`
- `第3-4节`
- `[05-06节]`
- `五[3-4节]`（其中星期和节次同时出现）
- 单节 `第5节`

`startPeriod` 与 `endPeriod` 为闭区间，必须满足：

```text
1 <= startPeriod <= endPeriod <= 30
```

多节连堂的结束时间取 `endPeriod` 对应节次的结束时间。

## 5. 日期计算

`semesterStart` 必须为第 1 周周一。

```text
classDate = semesterStart + (week - 1) × 7 + (weekday - 1) 天
```

日期计算使用“日历日期”语义，不使用浏览器本地时区换算。事件时间统一为 `Asia/Shanghai`。

示例：`semesterStart = 2026-08-31`，第 18 周周六为 `2027-01-02`；第 20 周周六为 `2027-01-16`。

## 6. 课程去重

标准化课程键：

```text
课程名 + 教师 + 地点 + 星期 + 起节 + 止节 + 排序后周次 + 备注
```

完全相同的重复记录只保留一次，并给出 warning。

生成事件后，以稳定 UID 再次去重，避免同一事件被内部重复写入。

## 7. 稳定 UID

旧版 v1 文件管线的 UID 使用稳定来源锚点（优先 `sourceRef`），再加上日期和节次；不得使用课程显示名、教师或教室。v0.5 的 Connector / `.terics.json` 管线使用第 11 节的 courseId + meetingId 算法。

```text
sourceRef-or-structural-anchor U+001F
event.date U+001F
course.startPeriod U+001F
course.endPeriod
```

算法：

```text
uid = "terics-" + first32(hex(SHA-256(UTF-8(key)))) + "@terics"
```

规则：

- 同一课程、日期、节次在重复生成时 UID 相同。
- 修改节次钟点时间不改变 UID，因此重新导入时可更新同一事件。
- 课程顺序变化不改变 UID。
- 不同教师或地点视为不同事件身份。
- UID 不含中文原文，避免部分日历客户端转义差异。

## 8. 冲突检测

若同一日期内两个事件满足：

```text
left.start < right.end && right.start < left.end
```

则视为冲突。

- 首尾相接不算冲突。
- 冲突仅阻止 Web/Python 直接导出，用户显式勾选“已检查冲突”后可导出。
- 冲突不删除课程，也不自动改变时间。

## 9. ICS 生成

- `BEGIN:VCALENDAR` /`VERSION:2.0` /`PRODID` /`CALSCALE:GREGORIAN`。
- 时区固定为 `Asia/Shanghai`，包含 `VTIMEZONE`，偏移 `+0800`。
- 每个教学周实例生成一个 `VEVENT`。
- `DTSTART`、`DTEND` 使用 `TZID=Asia/Shanghai` 的本地时间。
- `DTSTAMP` 使用 UTC 基本格式。
- 文本属性转义反斜杠、换行、分号、逗号。
- 禁止控制字符；换行不得形成新的 ICS 属性或组件。
- 所有行按 RFC 5545 折行为 UTF-8 字节不超过 75；续行以一个空格开头。
- 文件以 CRLF 结尾。

## 10. 错误处理原则

- 文件损坏、空数据、无有效课程、非法日期/节次/周次必须失败并给出可操作提示。
- 单行错误不应伪造默认时间。
- 解析警告必须保留在预览界面。
- 不使用网络请求处理用户文件。
- 不执行 HTML 中的脚本、事件处理器或外部资源。


## 11. Schema 2.0 与调课

`.terics.json` 使用 schema 2.0，并把课程（Course）与上课实例（CourseMeeting）分离。一个课程不得仅因名称相同而与其他课程合并；有源课程 ID、教学班 ID 或稳定 source ref 时必须优先使用。

### 有效日期节次表

`term.periodSchedules[]` 中每套作息包含：

- `effectiveFrom`
- optional `effectiveTo`
- `periods[]`

对每个事件日期，选择生效区间包含该日期且 `effectiveFrom` 最晚的一套作息。不得假设整个学期只有一套节次时间。

### Schedule Override

V2 事件展开必须应用：

- `cancel`：取消指定原日期实例；
- `reschedule`：取消原日期并生成新日期实例；
- `makeup`：生成额外补课实例；
- `room_change` / `teacher_change` / `period_change`：修改指定原日期实例；
- 只有 `confirmed: true` 的 override 才可自动应用；未确认的 override 必须忽略并给出 warning。

空数据或完整性验证失败时，不得把“缺失事件”解释为取消。

### V2 UID

```text
sha256(termId U+001F courseId U+001F meetingId U+001F date U+001F startPeriod U+001F endPeriod)
```

UID 不得包含课程显示名、教师或教室。

### `.terics.json` 安全约束

递归禁止密码、Cookie、Access Token、Refresh Token、Session Token、CSRF/XSRF、Authorization 和 Credentials 字段。解析后仍需检查 schemaVersion、课程 ID、meeting ID、日期、周次和节次。

### Google Calendar 同步

- 只考虑私有扩展属性 `terics_source=terics` 且 `terics_term_id` 匹配的事件。
- 同步计划必须先展示 create/update/skip/delete candidates。
- 空课表不得产生删除候选。
- 删除候选需要用户再次确认。
- 不得删除其他应用事件。
- 不进行后台自动同步。
