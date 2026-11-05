# Architecture

## Entrances

1. **Web** — TypeScript + Vite, static GitHub Pages.
2. **Browser extension** — TypeScript + Manifest V3, Chrome/Edge.
3. **Python desktop** — Python 3.12 + Tkinter + Playwright.

All three consume the same normalized schema and event rules. SIS extraction code is TypeScript and is bundled for both the extension and Python Playwright injection.

## Layered structure

```text
src/
  core/                 Legacy file parser and v1 event engine
  connectors/
    sdk/                Connector contracts, HTTP, normalization
    vendors/            Wisedu / Zhengfang / Qiangzhi / Qingguo
    schools/            School profiles
    generic/            DOM fallback
    registry.ts         Detection and extraction orchestration
    page-runtime.ts     Runtime bundle for Python injection
  extension/            Pure extension message contract
  v2/                   Schema 2.0 model, event engine, exchange, ICS
  google/               Google OAuth, Calendar REST, sync planner
  main.ts               Web application
python/terics/
  parsers/              v0.1 file adapters
  connectors/           Playwright worker + shared runtime manifest
  google/               Desktop OAuth, keyring, Calendar API client
  timetable_v2.py       Python v2 event parity
  gui.py                Tkinter UI
extension/              MV3 manifest/popup/content/service worker source
schema/                 v1 and .terics.json v2 JSON Schema
spec/                   Shared business rules
fixtures/               Shared test data
```

## SIS Connector SDK

- School profile and vendor protocol adapter are separate.
- Adapter descriptors declare status, capabilities, methods and limitations.
- Detection returns confidence/evidence.
- Extraction returns normalized courses/meetings and source metadata.
- Validation runs again before preview/export/sync.
- `activeTab` and manual browser login replace broad host permissions.

## Normalized model 2.0

- `TermContext`: term ID, semester start, teaching weeks, IANA timezone, effective-dated period schedules.
- `CourseV2`: stable course ID, display metadata, one or more meetings.
- `CourseMeeting`: weekday, period range, explicit week array, teacher/room/campus, optional direct times.
- `ScheduleOverride`: cancel/reschedule/makeup/room/teacher/period changes.
- `ValidationReport`: schema, completeness and adjustment availability.

`.terics.json` is the shared exchange artifact for extension → Web/Python.

## Deterministic event UID

```text
SHA-256(termId | courseId | meetingId | date | startPeriod | endPeriod)
```

Display title, teacher and room are not UID inputs. Internal duplicate events are removed by UID.

## Google Calendar safety

- Minimal scopes: `calendar.app.created` + `calendar.calendarlist.readonly`.
- Managed events are identified by private extended properties.
- Other applications’ events are never bulk-cleared.
- Empty or incomplete data blocks deletion.
- Two-step UI: preview, then execute; deletion candidates require an additional explicit confirmation.
- No background sync.

## Offline guarantee

ICS generation never requires Google OAuth. Web/Python file parsing and `.terics.json` import remain fully local and available when Google integration is disabled or unconfigured.
