# terics v0.5.0-rc.2

Second release candidate. This release completes live WHUT jwapp acceptance and a timetable-first UI closeout. Google Calendar account-level acceptance remains outstanding.

## Access

- Web: <https://styayur.github.io/terics/>
- Repository: <https://github.com/styayur/terics>
- Changelog: [CHANGELOG.md](https://github.com/styayur/terics/blob/main/CHANGELOG.md)

## Assets

- `terics-web-v0.5.0-rc.2.zip` — static Web build.
- `terics-extension-v0.5.0-rc.2.zip` — unpacked Chrome/Edge Manifest V3 extension.
- `terics-python-v0.5.0-rc.2.zip` — Python/Tkinter/Playwright source, connector runtime, schema, fixtures and docs.
- `SHA256SUMS.txt` — SHA-256 for all three assets.

## WHUT live acceptance

Accepted on 2026-11-06 in a real `2026-2027-1` student session:

- `GET currentUser.do`
- `GET getSections.do?termCode=2026-2027-1&campusCode=`
- `POST getMyScheduleDetail.do` form fields: `termCode`, `campusCode`, `type=week`, `week=9`
- 42 arranged records, 0 unscheduled, 0 practice
- 15 courses / 42 meetings / 242 weekly instances
- 13/13 actual period times matched
- first teaching Monday `2026-09-07`; current week 9 Friday `2026-11-06`
- 42/42 visible semester timetable cards matched course name, code, weekday, week set, section range, teacher and room
- 242 generated events; 242 unique UIDs; ICS parsed independently by `ical.js` and Python `icalendar`

WHUT is therefore **Verified for the observed 2026-2027-1 layout**. Generic Wisedu and all other schools remain **Experimental**.

## UI closeout

- Web: teaching-week ruler, seven-day period grid, course detail, provenance ledger and cancellation/reschedule/makeup/conflict states.
- Extension: compact teaching-week rail and course agenda.
- Python: teaching-week buttons and Canvas timetable preview.
- Responsive desktop/mobile layouts and reduced-motion handling.

## Verification completed

- TypeScript checks and Vitest.
- Playwright Web E2E, including timetable grid, week navigation, detail panel, override states and mobile overflow.
- Extension build/package verification and Edge unpacked install with stored-fixture agenda rendering.
- Python Ruff, compileall, pytest and GUI smoke.
- Cross-language consistency: 6 fixtures / 318 events.
- Independent ICS parsing in TypeScript and Python.
- Dependency/license audits.

## Not verified

- Real Google OAuth consent and Calendar create/update/delete.
- Web Google sync with a deployed OAuth client ID.
- Non-empty WHUT `notArrangeList` / `practiceList` semantics.
- A dedicated WHUT adjustment endpoint.
- Real Zhengfang/Qiangzhi/Qingguo school acceptance.
- Chrome Web Store / Edge Add-ons publication.
- Tested/signed Windows executable.

## Security and privacy

No student identity, cookie, token, CSRF value or real timetable is committed. Raw authenticated acceptance captures remain local-only and are ignored by Git. Release fixtures use synthetic courses, identities, teachers and rooms; only factual WHUT period times are retained.

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
