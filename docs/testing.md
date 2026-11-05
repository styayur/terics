# Testing

## Web unit tests

```powershell
npm ci
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
- custom period-time correction.

## Extension build verification

```powershell
npm run build:connectors
npm run build:extension
npm run package:extension
npm run verify:extension
```

The verifier checks MV3, the exact minimal permission set, required bundled files, absence of fixed host permissions/all_urls, no eval/new Function, and no remote script loading.

A Windows release check additionally loaded `extension-dist/` unpacked in Microsoft Edge through Playwright. The service worker registered and the popup rendered with `activeTab, scripting, storage`.

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
- GUI construction smoke test.

## Cross-language consistency

```powershell
npm run test:consistency
```

Current shared fixture set includes four legacy format fixtures and two v2 exchange fixtures. The script compares normalized courses, meetings, dates, times, conflicts and stable UIDs between TypeScript and Python.

## Dependency and license audits

```powershell
npm audit --audit-level=high
npm run audit:licenses
python scripts/audit_python_licenses.py
```

## Real-environment testing status

Not performed because no user-authorized school credentials or Google OAuth client/account were available:

- live WHUT student timetable extraction;
- live Zhengfang/Qiangzhi/Qingguo school verification;
- actual Google Calendar create/update/delete sync.

These are **not** claimed as passed. The release therefore uses the `v0.5.0-rc.1` prerelease channel rather than pretending to meet the stable-release minimum.
