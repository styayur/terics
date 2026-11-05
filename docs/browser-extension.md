# Browser Extension

The extension is a Manifest V3 Chromium extension for Chrome and Microsoft Edge. It is intentionally narrow:

- `activeTab` access only when the user opens the popup and presses extract;
- `scripting` to inject the bundled local Connector runtime;
- `storage` for the last local extraction;
- no fixed `host_permissions`;
- no `<all_urls>`;
- no remote JavaScript;
- no Cookie database access;
- no background polling.

## Build

```powershell
npm ci
npm run build:connectors
npm run build:extension
npm run package:extension
npm run verify:extension
```

Artifact:

```text
release/terics-extension-v0.5.0-rc.1.zip
```

Unpacked development directory: `extension-dist/`.

## Install unpacked

### Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `extension-dist/`.

### Microsoft Edge

1. Open `edge://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `extension-dist/`.

## Use

1. Log in manually to the school SIS in the current tab.
2. Open the terics extension.
3. Confirm the first teaching Monday, term name, and week count.
4. Select auto detection or a preferred adapter.
5. Click **检测并提取当前课表**.
6. Review courses, meetings, conflicts and validation warnings.
7. Download `.terics.json`, download ICS, or open the Web app via a URL fragment.

Opening the Web app through a fragment transfers data within the browser URL. Fragments are not sent to GitHub Pages in HTTP requests. Very large schedules should use the JSON download instead.

## Verification

The v0.5.0-rc.1 package was loaded as an unpacked extension in Microsoft Edge with Playwright. The service worker registered, the popup loaded, and the effective permissions were:

```text
activeTab, scripting, storage
```

Reproduce on Windows with:

```powershell
npm run build:connectors
npm run build:extension
npm run test:extension-install:edge
```

The package verifier checks that the ZIP contains `manifest.json`, popup, content runtime and service worker, and rejects fixed host permissions, `all_urls`, dynamic code evaluation, and remote script loading.

## Limitations

- Chrome Web Store publication is not part of this release.
- Extraction is only as complete as the active school variant.
- Student account acceptance remains outstanding.
- The extension cannot bypass login, MFA or CAPTCHA.
