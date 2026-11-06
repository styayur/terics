# Changelog

## v0.6.0-rc.1 — 2026-11-06

URL-first integration, exact whole-course removal, UID migration and resource-hardening release candidate. Stable release is intentionally blocked pending real WHUT and Google Calendar account UI acceptance.

### Added

- URL Drop Zone with `text/uri-list`, `text/plain` and safe `text/html` link extraction.
- Local URL validator and School Resolver with IDN normalization, private-network rejection, redirect warnings and exact-domain matching.
- Connector Registry declarations for all six adapters, including WHUT priority over generic Wisedu.
- Opaque extension-to-Web handoff using local extension storage, one-time nonce, request ID, TTL, Schema 2.0, payload size and SHA-256 validation.
- `externally_connectable` restricted to `https://styayur.github.io/terics/*`.
- Exact whole-course removal for `.terics.json`, ICS and Google Calendar, with same-title/shared-teacher tests, course/override cleanup, empty-result protection and partial failure reporting.
- UID migration preview/apply module and `npm run migrate:uid` CLI with dry-run and explicit confirmation.
- XLSX ZIP/XML resource guards in TypeScript and Python: entry count, expanded size, compression ratio, ZIP Slip, duplicates, encryption, sheet/row/column and XML depth/DTD checks.
- Google Calendar camelCase identity properties with legacy snake_case compatibility, deterministic event IDs, rendered-field hashes, duplicate detection and manual-edit conflict protection.
- Target calendar display/selection for primary, existing or custom `calendarId`.
- User guide, UID migration guide and v0.6 legacy-debt gate report.

### Changed

- Web home is now URL-first while retaining all file import paths.
- Google Web scopes now include `calendar.events` for primary/existing calendar support while continuing to use GIS Token Model on the static SPA.
- Python installed-app OAuth uses the same Calendar scopes and updated managed-event property model.
- GitHub Actions moved to Node 24-era majors: checkout v7, setup-node v7, setup-python v7, configure-pages v6, upload-pages-artifact v5 and deploy-pages v5.
- Extension numeric version is `0.6.0`; `version_name` and package version are `0.6.0-rc.1`.

### Verification

- TypeScript unit/integration tests include resolver, handoff, removal, UID migration, XLSX security and Google planner cases.
- Python tests include XLSX resource guards, Google identity/legacy properties and exact course removal.
- Playwright E2E covers URL-first UI, HTML drag safety, opaque handoff, file fallback and whole-course local removal.
- Windows Edge smoke creates a pending handoff, claims it through `externally_connectable`, and rejects replay.

### Known limitations

- Real WHUT login regression for v0.6, real Google OAuth, full semester Calendar write, repeat sync, live Update/Skip, whole-course Calendar deletion and Calendar UI verification remain blocked by missing user authorization/account access.
- Non-empty `notArrangeList`/`practiceList` real-school semantics remain unverified; synthetic fixture behavior is tested.
- No dedicated WHUT adjustment endpoint is known.
- No signed EXE or extension-store package is provided.
- The release is a candidate, not Stable.

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
