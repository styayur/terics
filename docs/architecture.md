# 架构说明

## 设计目标

- 纯静态 Web 与独立 Windows GUI 使用相同业务规则。
- 文件解析可扩展为 Adapter，不让格式判断散落在 UI 中。
- 运行时不上传、不登录、不依赖服务端。
- Web 与 Python 的输出以共享 fixtures 和事件快照校验。

## 目录

```text
src/core/                 Web 核心
  parsers/                内容嗅探与 CSV/HTML/XLSX Adapter
  weeks.ts                周次、星期、节次规则
  course.ts               课程去重、事件展开、冲突检测、稳定 UID
  ics.ts                  RFC 5545 序列化
  types.ts                统一数据模型
python/terics/            Python 核心（与 Web 对等）
  parsers/                CSV/HTML/XLSX Adapter
  course.py               事件与冲突
  ics.py                  ICS
  gui.py                  Tkinter GUI
schema/                   共享 JSON Schema
spec/                     共享业务规则
fixtures/                 共享测试样本
tests/                    Web 单元与 Playwright E2E
python/tests/             Python 单元测试
```

## Adapter 接口

概念接口：

```text
parse(input bytes + filename) -> ParseResult
```

`ParseResult` 包含：

- `format`: `csv` / `html` / `xlsx`
- `formatLabel`
- `confidence`
- `courses: RawCourse[]`
- `issues`
- `metadata`

格式探测由 `parsers/index.ts` / `parsers/detect.py` 统一负责：

1. OLE / ZIP / 空文件 / 大小限制；
2. BOM 与 `<meta charset>`；
3. UTF-8 → GB18030 严格回退；
4. HTML 结构检测；
5. 否则进入 CSV 长表解析。

因此扩展名只用于显示，不用于选择 Parser。

## 统一课程模型

`RawCourse` 保存原始周次规则与显式周次数组：

```json
{
  "name": "高等数学A",
  "teacher": "张伟",
  "location": "教1-101",
  "weekday": 1,
  "startPeriod": 1,
  "endPeriod": 2,
  "weeks": [1, 2, 3],
  "weekRule": "1-3",
  "note": ""
}
```

导出前由 `buildEvents` / `build_events` 加入学期开始时间与节次表，展开为具体日期事件。

## 稳定 UID 与重复事件

UID 只由课程身份、具体日期和节次索引决定，另加 SHA-256。节次钟点时间的修改不会改变 UID，便于重新导入时覆盖同一事件。

内部两阶段去重：

1. 标准化课程去重；
2. 展开后 UID 去重。

## 测试策略

- Vitest：周次/日期/解析/ICS/安全/Schema。
- Playwright：真实浏览器内加载本地样本、预览、下载、独立解析 ICS。
- pytest：Python 对等实现与独立 `icalendar` 解析。
- `npm run test:consistency`：对 4 个共享 fixtures 逐课程、逐事件、逐 UID 比较 Web 与 Python 输出。
- `ruff` + `tsc --noEmit`：静态检查。
- GitHub Actions 在 Node 22 与 Python 3.12 上重复执行。

## 为什么没有运行时共享

浏览器不能直接执行 Python，Web 与 GUI 也无法共享进程。强行引入 WASM/嵌入式运行时会让 GUI 安装和静态部署更重。因此共享的是：

- JSON Schema；
- 业务规则；
- fixtures；
- 错误边界；
- 跨语言快照测试。

核心逻辑保持小体积，两端都能独立测试、独立发布。
