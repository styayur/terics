# Changelog

## v0.5.0-rc.2 — 2026-11-06

Second release candidate. WHUT 2026-2027-1 live acceptance passed; Google Calendar account-level acceptance remains outstanding.

### Added

- WHUT-specific `currentUser.do` → `getSections.do` → `getMyScheduleDetail.do` read-only connector chain.
- Reusable WHUT term-context resolver deriving the first teaching Monday from semester code, current teaching week and registrar date.
- Strict variable-length week bitmap parser with sparse/alternate-week tests and no fixed 30-week truncation.
- Sanitized WHUT current-user, timetable, section, partial, empty and login-expired fixtures.
- Timetable-first Web teaching-week ruler, seven-day period grid, course detail and normal/cancelled/rescheduled/makeup/conflict states.
- Extension teaching-week rail and compact course agenda.
- Python Tkinter teaching-week buttons and Canvas timetable preview.
- Cross-language WHUT fixture covering 3 courses, 4 meetings and 37 events.

### Changed

- WHUT status upgraded to `Verified` for the 2026-2027-1 student context after a 42/42 live timetable comparison on 2026-11-06.
- Removed automatic `changeAppRole.do` from the production extraction path.
- WHUT now uses the actual 13-period `getSections.do` response instead of a generic or fallback period table.
- Form POST body confirmed as `termCode`, `campusCode`, `type=week`, `week`.
- Generic Wisedu remains Experimental and does not inherit WHUT verification.
- Schema 2.0 no longer imposes a fixed maximum teaching-week count.
- Release version moved to `v0.5.0-rc.2` to preserve SemVer prerelease ordering after `v0.5.0-rc.1`.

### Verification

- Live WHUT extraction: 42 arranged records, 0 unscheduled, 0 practice, 15 courses, 42 meetings, 242 weekly instances, weeks 1–18.
- Live page comparison: 42/42 course blocks matched on course name, code, weekday, week set, section range, teacher and room.
- Period comparison: 13/13 exact matches.
- Independent ICS parsing: 242 events, 242 unique UIDs, `Asia/Shanghai`.
- Web/Extension/Python regression and cross-language consistency passed.

### Known limitations

- Google OAuth consent and Calendar create/update/delete still require a real authorized test account and calendar.
- Non-empty `notArrangeList` and `practiceList` semantics were not observable in the accepted WHUT term.
- No dedicated WHUT adjustment endpoint was identified; cancellation/reschedule data is only used when explicitly present.
- Other schools and generic Wisedu/DOM adapters remain Experimental.

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
