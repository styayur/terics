# Testing

## Web unit tests

```powershell
npm ci
npm run generate:whut-fixture
npm run check
npm test
```

Coverage includes:

- schema v1 and v2;
- CSV/HTML/XLSX file adapters;
- week/section/date rules;
- v1 and v2 ICS;
- override/cancel/reschedule/makeup behavior;
- effective dated period schedules;
- stable UID independence from title/teacher/room;
- extension message contract and manifest permissions;
- Wisedu/WHZF/Qiangzhi/Qingguo connector fixtures;
- Google Calendar create/update/skip/delete planning and API mocking.

## Browser E2E

```powershell
npx playwright install chromium
npm run test:e2e
```

The E2E suite exercises the built static app:

- CSV, HTML, XLSX and `.terics.json` samples;
- download and independent `ical.js` parsing;
- conflict acknowledgement;
- URL-fragment handoff;
- disabled OAuth state without a client ID;
- custom period-time correction;
- teaching-week ruler and seven-day timetable grid;
- course-detail keyboard open/close;
- cancellation, reschedule and makeup presentation;
- mobile body-width containment with local timetable scrolling.

## Extension build verification

```powershell
npm run build:connectors
npm run build:extension
npm run package:extension
npm run verify:extension
```

The verifier checks MV3, the exact minimal permission set, required bundled files, absence of fixed host permissions/all_urls, no eval/new Function, and no remote script loading.

Run `npm run test:extension-install:edge` on Windows. It loads `extension-dist/` unpacked in Microsoft Edge through Playwright. The service worker registers, the popup renders with `activeTab, scripting, storage`, and a sanitized fixture is restored from extension storage to verify the teaching-week ruler and compact agenda.

```powershell
npm run test:extension-install:edge
```

## Python

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
$env:PYTHONPATH = "python"

ruff check python main.pyw
python -m compileall -q python main.pyw
python -m pytest python/tests
python main.pyw --smoke-test
```

Tests include:

- Python v1/v2 event engines;
- independent `icalendar` parsing;
- Playwright runtime injection against a local mocked SIS page;
- persistent browser-profile storage retention;
- explicit profile deletion;
- Google sync planner/deletion safeguards and OAuth configuration checks;
- GUI construction smoke test with teaching-week buttons and Canvas timetable preview.

## Cross-language consistency

```powershell
npm run test:consistency
```

Current shared fixture set includes four legacy format fixtures and two v2 exchange fixtures, including the WHUT real-shape fixture. Result: **6 fixtures / 318 events**, comparing normalized courses, meetings, dates, times, conflicts and stable UIDs between TypeScript and Python.

## Dependency and license audits

```powershell
npm audit --audit-level=high
npm run audit:licenses
python scripts/audit_python_licenses.py
```

## Current verified counts

- Vitest: **48 tests / 14 files**.
- Web Playwright E2E: **10 tests**.
- Python pytest: **26 tests**.
- Cross-language consistency: **6 fixtures / 318 events**.
- Edge unpacked extension smoke: MV3 worker, popup, 18-week ruler and 4-item week agenda.
- Python GUI smoke: creates the app, loads the sanitized WHUT fixture, renders week buttons, Canvas timetable blocks and occurrence rows.

## Real-environment testing status

Passed on 2026-11-06 for an authorized WHUT 2026-2027-1 student session:

- `currentUser.do`, `getSections.do` and `getMyScheduleDetail.do` read-only chain;
- 42 arranged records, 15 courses, 42 meetings and 242 weekly instances;
- 13/13 period-time matches;
- 42/42 visible semester timetable cards matched on course, week set, weekday, section range, teacher and room;
- 242-event ICS independently parsed with 242 unique UIDs.

Still not performed:

- live Zhengfang/Qiangzhi/Qingguo school verification;
- non-empty WHUT unscheduled/practice collection acceptance;
- real Google OAuth consent and Calendar create/update/delete sync.

Google Calendar is **not** claimed as passed. The release remains a prerelease because that account-level integration acceptance remains outstanding.
