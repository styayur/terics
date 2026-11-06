# Browser Extension

## Purpose

The Chrome/Edge Manifest V3 extension reads a timetable from an already-authenticated school page after explicit user action. It never logs in, bypasses MFA, or reads the browser Cookie database.

## Permissions

```json
{
  "permissions": ["activeTab", "scripting", "storage"],
  "externally_connectable": {
    "matches": ["https://styayur.github.io/terics/*"]
  }
}
```

There are no `host_permissions`, no `<all_urls>`, no cookie permission and no remote code. The verifier rejects unexpected permissions and remote script loading.

## Install from Release

1. Download `terics-extension-v0.6.0-rc.1.zip`.
2. Extract it.
3. Open `edge://extensions` or `chrome://extensions`.
4. Enable Developer mode.
5. Choose **Load unpacked** and select the extracted directory.
6. Confirm the permissions above.

## User flow

1. Open the authenticated timetable page.
2. Click the terics toolbar action.
3. Review page match, adapter, term and period schedule.
4. Click **检测并提取当前课表**.
5. Review counts, validation and warnings.
6. Export ICS/JSON or open the Web preview.

The extension does not claim extraction success merely because the HTTP status is 200. Detection, schema validation, completeness checks and explicit warning counts are shown.

## Extension → Web handoff

The Web URL is opaque:

```text
#terics-handoff=1&requestId=…&nonce=…&extensionId=…&targetOrigin=…&expiresAt=…
```

It never contains timetable payload, Cookie or token.

1. Extension computes canonical payload JSON, byte size and SHA-256.
2. It creates a one-time record with protocol version, extension ID, connector ID, schema 2.0, timestamps, TTL and hash.
3. Record is stored under `tericsPendingHandoff` in `chrome.storage.local`.
4. Extension opens the Pages URL with only opaque parameters.
5. Web calls `chrome.runtime.sendMessage(extensionId, claim)`.
6. Service worker verifies sender origin/path and extension ID.
7. It checks requestId, nonce, expiry, size, hash, Schema and consumed state.
8. The record is marked consumed before returning the payload.
9. Web validates the envelope again and clears the URL fragment.

Replay protections:

- one-time nonce
- 5-minute TTL and 10-minute absolute window
- consumed flag
- in-flight request set
- Web sessionStorage replay key
- sender origin/path allow-list
- extension ID identity check
- payload SHA-256 and size
- Schema 2.0 validation

Payload limit: **2 MiB**. If the timetable is larger, the popup downloads `.terics.json` instead of producing a long URL.

## Build and verify

```powershell
npm run build:extension
npm run package:extension
npm run verify:extension
npm run test:extension-install:edge
```

The Edge smoke test loads the unpacked extension, checks the popup and permissions, creates a pending handoff, verifies that the Web URL contains no payload, claims it from a page whose origin matches `externally_connectable`, and confirms the second claim is rejected as replay.

## Current evidence

- Manifest V3 service worker registers in Edge.
- Popup renders a sanitized fixture.
- Effective permissions are exactly `activeTab`, `scripting`, `storage`.
- Handoff creation, external claim and replay rejection have local real-browser smoke coverage.
- Real WHUT extraction in the new v0.6 session remains blocked by the absence of a user-authenticated school session.

## Store distribution

Chrome Web Store/Edge Add-ons publication is not included. The release artifact is an unpacked extension ZIP, not a store-reviewed package.
