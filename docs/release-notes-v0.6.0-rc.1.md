# terics v0.6.0-rc.1

Release Candidate — 2026-11-06

## Highlights

- **URL-first Web intake**: drop or paste a university portal URL, identify the school/vendor/connector locally, then authenticate and extract through the extension.
- **Opaque extension handoff**: the URL contains no timetable payload. A one-time nonce, request ID, TTL, size limit, SHA-256 and Schema 2.0 validation protect the transfer.
- **Whole-course removal**: remove an entire semester course by exact `courseId` from JSON, ICS or a selected Google Calendar. Same-title courses, shared teachers, related overrides and non-terics events are protected.
- **UID migration**: dry-run legacy v0.1 UID mappings and apply only one-to-one matches after explicit confirmation.
- **XLSX hardening**: ZIP bomb, ZIP Slip, duplicate entry, encryption, sheet/row/column and XML-depth protections in both TypeScript and Python.
- **Google Calendar planning**: Create / Update / Skip / Conflict / Delete, target calendar display, legacy property compatibility, duplicate detection and manual-edit protection.

## Download

- `terics-web-v0.6.0-rc.1.zip` — static Web build
- `terics-extension-v0.6.0-rc.1.zip` — unpacked Chrome/Edge Manifest V3 extension
- `terics-python-v0.6.0-rc.1.zip` — Python 3.12+ Tkinter/Playwright source package
- `SHA256SUMS.txt` — SHA-256 checksums

## Web

<https://styayur.github.io/terics/>

The Web app remains local-first: no timetable upload and no backend proxy. Google direct sync is disabled unless `VITE_GOOGLE_CLIENT_ID` is configured.

## Verified input formats

Automated fixtures verify content-based detection and parsing for:

- CSV / TSV course-list layouts
- HTML grid/list exports, including HTML `.xls` exports
- XLSX structured-column and week-grid layouts
- `.terics.json` Schema 2.0
- legacy ICS UID migration preview

Binary OLE `.xls` is not supported; save it as XLSX/CSV/HTML first.

## WHUT evidence

The WHUT Connector remains Verified only for the observed `2026-2027-1 student timetable layout`:

- 42/42 visible semester course blocks matched
- 13/13 period times matched
- 15 courses, 42 meetings, 242 weekly events
- first teaching Monday 2026-09-07
- Asia/Shanghai

v0.6 did not receive a new real WHUT login session in this environment, so this is carried forward baseline evidence, not a new v0.6 live acceptance.

## Known limitations / blocked gates

This is **not Stable**:

- Real Google OAuth authorization was unavailable.
- A dedicated Google test calendar was unavailable.
- Real full-semester Calendar write, repeat sync, Update/Skip, Calendar UI verification and whole-course Calendar deletion were unavailable.
- Real WHUT v0.6 login regression was unavailable.
- Non-empty real `notArrangeList` / `practiceList` semantics remain unverified beyond synthetic fixtures.
- No dedicated WHUT adjustment endpoint is known.
- No signed Windows EXE and no extension-store listing are provided.

Do not treat mocks, synthetic fixtures or API HTTP 200 as real Calendar acceptance.
See `docs/v0.6.0-calendar-acceptance.md` and `docs/v0.6.0-legacy-debt.md` for the blocked gate record.

## Install extension

1. Download and extract `terics-extension-v0.6.0-rc.1.zip`.
2. Open `edge://extensions` or `chrome://extensions`.
3. Enable Developer mode.
4. Load the extracted directory.
5. Confirm permissions are only `activeTab`, `scripting`, `storage`.

## Python

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m playwright install chromium
python main.pyw
```

## License and notices

MIT. Third-party code, public fixtures and license evidence are listed in `THIRD_PARTY_NOTICES.md`.
