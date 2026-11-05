# Google Calendar 导入说明

terics v0.1.0 只生成标准 `.ics`，不连接 Google OAuth，也不调用 Calendar API。

## 手动导入

1. 打开 [Google Calendar](https://calendar.google.com/)。
2. 点击右上角齿轮 → **设置**。
3. 左侧选择 **导入和导出**。
4. 在“导入”区域上传 terics 生成的 `.ics`。
5. 选择目标日历。
6. 点击 **导入**。

## 去重与重复导入

- 同一课程、日期、节次的事件使用稳定 UID。
- 使用相同日历与相同 UID 再次导入时，多数日历客户端会更新而不是重复创建。
- 如果修改了课程名、教师或地点，UID 会变化，可能产生新事件；请先在预览中核对。
- Google Calendar 的导入行为也取决于目标日历与客户端版本；导入后请抽查首周、最后一周与单双周课程。

## 时区

ICS 使用 `TZID=Asia/Shanghai` 并包含 `VTIMEZONE`。事件时间是本地墙钟时间，不做 UTC 换算。请确认 Google Calendar 的目标日历时区为上海/中国标准时间。

## 验证状态

- 已通过自动化：CRLF、75 字节折行、文本转义、VTIMEZONE、UID 稳定性、独立 `ical.js` / `icalendar` 解析。
- **未验证**：在真实 Google Calendar 账号中完成网页端导入。项目不宣称该项已实测通过。
- v0.1.0 不提供 Google OAuth、Calendar API 写入或在线订阅。
