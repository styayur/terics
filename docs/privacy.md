# Privacy

## Local-first promise

- User timetable data is parsed in the browser, extension runtime or local Python process.
- No terics backend exists.
- No analytics, telemetry, crash reporting or ad service is included.
- No school username/password is collected or stored.
- No Cookie, session token or CSRF value is written to `.terics.json`, logs or analytics.
- Sample files are fictional or public MIT fixtures.

## Network activity

| Entry point | Network activity |
|---|---|
| Web file import | Same-origin sample fetch only; no user file upload |
| Web Google sync | Only official Google Identity/Calendar endpoints after explicit configuration and consent |
| Extension | Same-origin read-only requests to the active authenticated SIS tab after user action |
| Python browser | School origin after manual login; optional Google endpoints after explicit consent |

## Stored data

- Extension: `chrome.storage.local` stores only the last normalized timetable; it can be cleared from the popup.
- Python browser: dedicated `%LOCALAPPDATA%\terics\browser-profile`; can be removed from the GUI.
- Python sync log: local JSONL summary under `~/.terics`, excluding credentials and event bodies.
- Google OAuth token: OS keyring only.
- Web Google access token: memory only; revoked/cleared on page hide where possible.
- `.terics.json` intentionally excludes credentials.

## User controls

- Delete extension storage.
- Clear the Python Playwright login profile.
- Clear Google refresh credentials.
- Choose JSON/ICS instead of direct Calendar sync.
- Stop using direct SIS extraction and fall back to official file export.

## Third parties

- Google Identity Services / Calendar API when direct sync is configured.
- School SIS origin when the user explicitly triggers extraction.
- Static GitHub Pages hosting for the public app; timetable files are not sent to it.

See [data-flow.md](data-flow.md) and [threat-model.md](threat-model.md).


## Live acceptance captures

During the WHUT 2026-11-06 acceptance, raw authenticated API responses were used only from the user-controlled browser session and were kept in an ignored local journal. They were never committed, uploaded, attached to CI, or included in release assets. Repository fixtures use synthetic course names, IDs, teachers and rooms; only the factual 13-period times are retained from the school API.
