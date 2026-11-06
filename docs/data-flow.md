# Data Flow

## Web file import

```text
Local file
  -> browser File API
  -> content sniffing
  -> parser adapter
  -> normalized course/meeting model
  -> preview
  -> ICS Blob download
```

No file bytes leave the browser.

## Extension extraction

```text
User opens extension popup
  -> activeTab grants temporary access
  -> bundled content runtime injected
  -> adapter detection
  -> same-origin read-only request or DOM read
  -> normalized .terics.json object
  -> popup preview
  -> chrome.storage.local
  -> JSON / ICS / URL-fragment handoff
```

Credentials and CSRF values are not included in storage or export.

## Extension to Web handoff

```text
Normalized timetable
  -> SHA-256 + JSON byte size
  -> chrome.storage.local pending record (max 2 MiB)
  -> opaque URL fragment (requestId + nonce + extId + target + expiry)
  -> Web chrome.runtime.sendMessage(extensionId)
  -> sender origin/path + request/nonce + TTL + hash + Schema checks
  -> consumed=true / replay protection
  -> Web preview
  -> fragment removed with history.replaceState
```

URL fragments are not part of HTTP requests to the static host. The timetable payload itself is never placed in the URL. Large payloads force a `.terics.json` download fallback.

## Python Playwright extraction

```text
GUI selects school
  -> Playwright private profile
  -> user logs in manually
  -> local Connector runtime injected into page
  -> same-origin read-only request / DOM
  -> normalized schema 2.0 result
  -> Python v2 preview
  -> ICS or optional Google sync
```

## Google Calendar sync

```text
Normalized events
  -> managed-event query (camelCase + legacy snake_case)
  -> create / update / skip / conflict / delete-candidate plan
  -> user preview
  -> explicit execution confirmation
  -> delete-candidate confirmation if present
  -> Google Calendar API
```

The user must select or explicitly enter the target calendarId. The planner writes stable event identity and rendered-field hashes, and skips updates when a managed event was manually edited. Empty data cannot generate delete actions. No background sync is scheduled.

## Imported `.terics.json`

```text
JSON parse
  -> schema/credential-field validation
  -> v2 event expansion with overrides and effective period schedules
  -> preview
  -> ICS or optional Google sync
```

Unknown unconfirmed overrides are ignored with warnings; they are never silently applied.
