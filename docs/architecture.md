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
    resolver/           URL validator, school registry, connector registry, drop parser
  extension/            Message contract and opaque extension-to-Web handoff
  v2/                   Schema 2.0 model, event engine, exchange, ICS, removal, UID migration
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

- Scopes: `calendar.events` + `calendar.app.created` + `calendar.calendarlist.readonly`.
- Managed events are identified by private extended properties.
- Other applications’ events are never bulk-cleared.
- Empty or incomplete data blocks deletion.
- Two-step UI: preview, then execute; deletion candidates require an additional explicit confirmation.
- Sync preview supports Create / Update / Skip / Conflict / Delete.
- camelCase private properties are written alongside legacy snake_case compatibility fields.
- `tericsRenderedHash` detects manual edits in managed event fields and blocks automatic PATCH.
- Empty data cannot generate a delete plan.
- No background sync.

## Offline guarantee

ICS generation never requires Google OAuth. Web/Python file parsing and `.terics.json` import remain fully local and available when Google integration is disabled or unconfigured.


## v0.5.0-rc.2 closeout additions

### WHUT 2026 live adapter

- School adapter is separate from the generic Wisedu vendor adapter.
- `currentUser.do` supplies term code, current teaching week and registrar date.
- The date resolver derives and validates the first teaching Monday with date-only arithmetic.
- `getSections.do` supplies the actual 13-period schedule; fallback defaults are not silently substituted for a successful WHUT response.
- `getMyScheduleDetail.do` is a form POST with `termCode`, `campusCode`, `type=week` and `week`.
- Variable-length bitmaps preserve sparse, alternating and non-contiguous weeks without a fixed upper truncation.
- `arrangedList`, `notArrangeList` and `practiceList` are counted separately; unsupported/partial records become explicit warnings.

### Timetable-first interface

- Web uses a teaching-week ruler and seven-day grid as the primary preview.
- Extension uses a compact week ruler and agenda.
- Python Tkinter uses week buttons and a Canvas timetable preview.
- Source adapter, term, extraction time and validation are presented as a provenance ledger rather than generic metric cards.
- Cancellation, reschedule, makeup and conflict states use geometry/text in addition to color.

The shared schema remains 2.0. WHUT verification is school- and term-specific; the generic Wisedu adapter remains Experimental.

## v0.6 URL-first additions

### Resolver pipeline

```text
Dropped/pasted URL
  → validatePortalUrl
  → URL normalization and safety warnings
  → exact school registry match
  → Connector Registry vendor fingerprint fallback
  → confidence/status/evidence/nextAction
  → user opens authenticated portal
```

The resolver never fetches the input URL. Unknown systems fall back to explicit Generic DOM or file guidance.

### Extension handoff

```text
Extension extraction
  → Chrome storage pending record
  → opaque URL: requestId + nonce + extensionId + targetOrigin + expiresAt
  → chrome.runtime.sendMessage(extensionId, ...)
  → external sender origin/path check
  → request/nonce identity check
  → TTL + SHA-256 + Schema validation
  → consumed=true
  → Web preview
```

Only `https://styayur.github.io/terics/*` is externally connectable. The URL never carries timetable payload, Cookie or token. Payloads over 2 MiB force JSON download fallback.

### Whole-course removal

- Course identity is exact `courseId`; titles are never deletion identity.
- JSON removal copies, removes course/overrides, updates validation, and writes a new file.
- ICS removal matches only `X-TERICS-COURSE-ID`, preserves VTIMEZONE/other UIDs, and rejects empty output.
- Calendar removal filters by target calendar, term, managed marker and exact courseId.
- Local and Calendar results are independent and may be partial success.

### XLSX security layer

The ZIP central directory is validated before workbook parsing. TypeScript and Python apply equivalent entry, size, ratio, path, encryption, sheet/row/column and XML-depth quotas.
