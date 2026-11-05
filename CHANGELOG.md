# Changelog

## v0.5.0-rc.1 — 2026-11-05

Release candidate status: real student-account SIS extraction and real Google OAuth/Calendar sync are not verified.

### Added

- Connector SDK, vendor adapters and school profile registry.
- Experimental Wisedu/WHUT, Zhengfang, Qiangzhi, Qingguo and generic DOM adapters.
- Manifest V3 Chrome/Edge extension with `activeTab`-only extraction.
- Shared `.terics.json` schema 2.0 import/export.
- Python Playwright worker with dedicated persistent browser profile and clear-login action.
- Stable course/meeting/event identities independent of display title, teacher and room.
- Schedule overrides: cancellation, reschedule, makeup, room/teacher/period changes.
- Effective-dated multiple period schedules.
- Google Calendar incremental sync planner, REST/API clients, extended properties and delete confirmation.
- Web Google Identity Services configuration and Python Desktop OAuth/keyring support.
- Threat model, privacy, data-flow, support matrix, connector and extension documentation.
- GitHub Actions coverage for Web, Extension build, Playwright, Python, consistency, dependency audit and license audit.

### Changed

- App and release channel updated to v0.5.0-rc.1.
- Existing HTML/CSV/XLSX import remains supported.
- Web/Python event consistency fixtures extended with schema 2.0 and override cases.
- Legacy file-import UIDs now use source anchors and section/date rather than mutable display fields. Re-importing a v0.1-generated ICS into the same calendar may create duplicates; review before importing.

### Known limitations

- Real WHUT/other school login verification was unavailable.
- Real Google Calendar OAuth and write acceptance was unavailable.
- Adapters are Experimental, not Verified.
- No PyInstaller executable is included without a tested/signed build.
- No Chrome Web Store publication is included.
- One XLSX size cap is enforced, but no separate decompression-bomb quota is implemented.

## v0.1.0 — 2026-11-05

Initial public release with static Web, Python Tkinter, CSV/HTML/XLSX file import, stable UIDs, conflicts and RFC 5545 ICS.
