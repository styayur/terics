# Google Calendar

## Status

terics v0.6.0-rc.1 implements:

- Web Google Identity Services Token Model
- Python installed-app OAuth with loopback
- target calendar selection
- one-way create/update/skip/conflict planning
- exact managed-event identity
- manual edit conflict protection
- exact courseId whole-course removal
- retry and partial failure reporting

**Not verified in this environment:** real OAuth authorization, real WHUT timetable write, repeat sync, Update/Skip against a live calendar, real whole-course Calendar removal, and Google Calendar web UI verification. The release remains a candidate.

Blocked acceptance record: [v0.6.0-calendar-acceptance.md](v0.6.0-calendar-acceptance.md).

## Web OAuth model

Official references:

- <https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model>
- <https://developers.google.com/identity/oauth2/web/guides/use-token-model>
- <https://developers.google.com/workspace/calendar/api/auth>

Google’s authorization guide recommends Authorization Code Flow where a backend can exchange and store tokens. terics Web is a pure static GitHub Pages SPA and has no backend. The appropriate official browser-only flow is the GIS **Token Model**:

- no Client Secret in source
- no refresh token in URL or localStorage
- access token in memory only
- token revoked on page hide/clear
- scopes checked before use

Do not replace this with a fake PKCE callback that requires a server-side secret.

## Configure Web

Create a Google Cloud OAuth **Web application** client:

- Authorized JavaScript origin: `https://styayur.github.io`
- Authorized redirect URI: not required for token model
- API: Google Calendar API enabled

Set a repository Actions variable or local `.env.local`:

```text
VITE_GOOGLE_CLIENT_ID=...
```

Never commit the value if it belongs to a restricted internal project.

## Web scopes

```text
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.app.created
https://www.googleapis.com/auth/calendar.calendarlist.readonly
```

- `calendar.events`: required to choose primary/existing calendars and manage events
- `calendar.app.created`: required by the existing “create terics calendar” action
- `calendar.calendarlist.readonly`: display calendar names

No Gmail, contacts or email scope is requested.

## Python OAuth

Use an installed-app OAuth client and either:

```text
TERICS_GOOGLE_CLIENT_CONFIG=path\to\client_secret.json
```

or:

```text
TERICS_GOOGLE_CLIENT_ID=...
TERICS_GOOGLE_CLIENT_SECRET=...
```

Python `InstalledAppFlow.run_local_server` uses a loopback browser flow. Refresh token storage is delegated to OS keyring under service `terics-google-oauth`.

The same Calendar scopes are requested. Clear authorization from the GUI to remove the refresh token.

## Target calendar selection

Before previewing, the user must explicitly see and confirm:

- calendar display name
- exact `calendarId`
- `primary` or a secondary/custom calendar
- term and event date range

No default silent write to a private primary calendar is allowed. A dedicated `terics / <term>` calendar is recommended.

## Managed event identity

New events write both camelCase and legacy snake_case properties:

```text
tericsManaged=true
tericsSchemaVersion=2.0
tericsCourseId=...
tericsMeetingId=...
tericsSource=terics
tericsUid=...
tericsTermId=...
tericsScheduleHash=...
tericsRenderedHash=...
```

Legacy compatibility:

```text
terics_source=terics
terics_course_id=...
terics_meeting_id=...
terics_event_uid=...
terics_schedule_hash=...
terics_term_id=...
```

The planner also writes a deterministic Google event `id` based on the stable UID. Course identity and occurrence identity remain separate.

## Sync planning

`planGoogleSync` produces:

- Create
- Update
- Skip
- Conflict
- Delete

Rules:

- Empty timetable → blocked, no delete plan
- Validation failed → blocked
- Duplicate managed UIDs → conflict, no automatic merge/delete
- Missing rendered hash on legacy event → update is skipped as a conflict, not forced
- Remote rendered fields changed by user → conflict, no PATCH
- Delete only if full data is present and user explicitly confirms
- PATCH does not overwrite fields outside the generated event body
- API retries HTTP 429/5xx up to three attempts
- Each failure is reported separately

## Whole-course removal

Calendar deletion requires all of:

1. exact target `calendarId`
2. exact `termId`
3. `tericsManaged=true` or legacy `terics_source=terics`
4. exact `tericsCourseId`/legacy `terics_course_id`

Nothing is matched by title. Events with the same title but no trustworthy course identity are skipped. A 404/410 during a retry counts as already missing. Each event succeeds/fails independently.

## Real acceptance checklist

Use an independent test calendar, never the daily private calendar.

1. Load unpacked extension against the real authenticated WHUT page.
2. Extract the full semester and compare counts/weeks/periods.
3. Configure GitHub Pages OAuth Client ID.
4. Authorize a dedicated test Google account.
5. Select the independent terics test calendar.
6. Preview and execute a complete semester write.
7. Verify events in Google Calendar UI.
8. Run the same sync again; expect zero duplicates and Skip/Update counts as appropriate.
9. Modify one managed event manually; verify Conflict and no overwrite.
10. Remove one whole course by exact courseId.
11. Verify all related occurrences are gone and unrelated events remain.
12. Test revoked/expired authorization.
13. Save a sanitized acceptance record.

If steps 1–13 are unavailable, do not claim Stable or real E2E verification.
