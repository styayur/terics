# terics v0.5.0-rc.1

**Release candidate** — real student-account SIS extraction and real Google Calendar OAuth/sync acceptance were not available in the release environment.

## Access

- Web: <https://styayur.github.io/terics/>
- Repository: <https://github.com/styayur/terics>
- Changelog: [CHANGELOG.md](https://github.com/styayur/terics/blob/main/CHANGELOG.md)

## Assets

- `terics-web-v0.5.0-rc.1.zip` — static Web build.
- `terics-extension-v0.5.0-rc.1.zip` — unpacked Chrome/Edge Manifest V3 extension.
- `terics-python-v0.5.0-rc.1.zip` — Python/Tkinter/Playwright source, connector runtime, schema, fixtures and docs.
- `SHA256SUMS.txt` — SHA-256 for all three assets.

## Highlights

- Connector SDK with stable course/meeting IDs.
- Experimental WHUT Wisedu jwapp, Zhengfang, Qiangzhi, Qingguo and generic DOM adapters.
- Manifest V3 extension using only `activeTab`, `scripting`, `storage`.
- Shared `.terics.json` schema 2.0.
- Cancellation, reschedule, makeup, room/teacher/period overrides.
- Effective-dated multiple period schedules.
- Python dedicated Playwright profile and explicit clear-login action.
- Google Calendar incremental sync planning with managed-event filtering and deletion confirmation.
- Existing HTML/CSV/XLSX import and RFC 5545 ICS export preserved.

## Verification completed

- TypeScript checks and Vitest.
- Playwright Web E2E, including v2 JSON and URL-fragment handoff.
- Extension build/package verification with exact minimal permissions.
- Unpacked extension load in Microsoft Edge; MV3 service worker and popup rendered.
- Python Ruff, compileall and pytest.
- Playwright runtime injection and persistent profile lifecycle tests.
- Cross-language v1/v2 fixture comparison.
- Google Calendar mock tests for create/update/skip/delete and empty-data deletion guard.
- Independent `ical.js` and `icalendar` parsing.
- Dependency and license allow-list audits.

## Not verified

- Real WHUT student login and live timetable comparison.
- Real Zhengfang/Qiangzhi/Qingguo school acceptance.
- Real Google OAuth consent and Calendar create/update/delete.
- Web Google sync with an actual GitHub Pages OAuth client ID.
- Chrome Web Store / Edge Add-ons publication.
- Tested/signed PyInstaller executable.

## Manual acceptance still required

1. Use a user-controlled test account in the independent Playwright browser.
2. Compare every extracted course, week range, period, teacher and room with the live SIS page.
3. Review any adjustment/cancellation data.
4. Configure an OAuth client and a dedicated test Google Calendar.
5. Exercise insert, update, duplicate detection and explicit delete confirmation.
6. Record evidence without committing personal timetable data.

The project must not be labeled stable/Verified until these checks pass.

## Python

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m playwright install chromium
python main.pyw
```

## Checksums

Download all assets and run:

```bash
sha256sum -c SHA256SUMS.txt
```
