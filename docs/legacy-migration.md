# Legacy ICS / UID Migration

## 背景

terics v0.1 使用：

```text
terics-<SHA256(name|teacher|location|date|startPeriod|endPeriod).slice(0,32)>@terics
```

v0.5+ 使用：

```text
terics-<SHA256(termId|courseId|meetingId|date|startPeriod|endPeriod).slice(0,32)>@terics
```

两者外观类似，但锚点不同。直接导入旧 ICS 后重新导出可能产生重复事件。terics 不提供“按课程标题全删”的快捷迁移。

## 工具行为

`npm run migrate:uid`：

1. 读取当前 Schema 2.0 `.terics.json`。
2. 为每个当前事件计算 legacy UID。
3. 读取旧 ICS 的 VEVENT。
4. 生成一对一映射预览。
5. 标记 unmatched / ambiguous 事件。
6. 只有完全没有歧义且用户显式传入 `--confirm` 时才写新文件。
7. 只替换 `UID:` 行，不删除事件、不修改 SUMMARY、不删除旧 UID。
8. 拒绝覆盖输入文件；先写临时文件，再原子替换输出路径。

## Dry-run

```powershell
npm run migrate:uid -- `
  --timetable fixtures\exchange\terics-example.terics.json `
  --ics legacy.ics `
  --out migrated.ics
```

输出包括：

- `legacyEventCount`
- `alreadyMigrated`
- `matched`
- `unmatched`
- `ambiguous`
- `safeToApply`

## 应用

确认预览后：

```powershell
npm run migrate:uid -- `
  --timetable path\to\current.terics.json `
  --ics legacy.ics `
  --out migrated.ics `
  --confirm
```

## 失败保护

- 任一 unmatched → 退出码 1，不写文件。
- 任一 ambiguous → 退出码 1，不写文件。
- 缺少 `--confirm` → 只做 dry-run。
- 输出等于输入 → 拒绝。
- 写入失败 → 原始 ICS 保持存在；输出临时文件不冒充完成结果。

## 用户审核清单

- 核对学期是否与旧 ICS 一致。
- 核对课程名称、教师、教室、日期和节次。
- 检查是否有同一课程因多个教学班产生同一 legacy UID。
- 把生成的 `migrated.ics` 导入独立测试日历，再检查重复/缺失。
- 不要直接删除旧 Calendar 事件；先导出备份并人工比较。

## 限制

- 如果旧 UID 对应的课程名称、教师、教室、日期或节次已发生变化，legacy UID 可能无法重算匹配，工具会标记 unmatched。
- 旧 ICS 缺少课程身份时，无法安全执行整门课程删除；必须人工确认。
- 本工具不做 Calendar API 批量写入或删除。
