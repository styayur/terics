# Python Desktop

`main.pyw` remains the Windows entry point. v0.5.0 adds a Playwright-backed SIS browser and schema 2.0 support while preserving all v0.1.0 file import and ICS export paths.

## Install

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m playwright install chromium
python main.pyw
```

After installation, `main.pyw` can be double-clicked. Missing dependencies produce a GUI installation message rather than a silent exit.

## File import

The desktop app still accepts HTML, CSV/TSV, XLSX and `.terics.json`.

- Legacy HTML/CSV/XLSX conversion uses the original v0.1.0 pipeline.
- `.terics.json` and connector output use the v2 course/meeting/override engine.
- The preview includes a teaching-week ruler, Canvas timetable grid and detailed occurrence table.
- Export produces a standards-compliant ICS in both cases.

## Direct SIS extraction

1. Choose a school profile.
2. Click **打开教务浏览器**.
3. Complete login manually in the independent Playwright browser.
4. Navigate to the personal timetable.
5. Return to terics and click **从浏览器提取**.

The browser uses a dedicated persistent profile under `%LOCALAPPDATA%\terics\browser-profile`. It never copies the user’s daily Chrome/Edge profile. It does not read cookies from disk. Same-origin page requests run inside the authenticated browser context only after the user triggers extraction.

WHUT `2026-2027-1` has been accepted against a real page in the extension/browser flow. The desktop application uses the same bundled connector runtime and schema 2.0 normalization.

## Clear login state

The **清除登录状态** button asks for confirmation, closes the independent browser and removes the dedicated profile directory. Daily browser data is untouched.

## Google Calendar

The desktop Google sync button uses the official installed-app OAuth flow with a local loopback redirect. OAuth client configuration is supplied through environment variables:

```powershell
$env:TERICS_GOOGLE_CLIENT_ID = "..."
$env:TERICS_GOOGLE_CLIENT_SECRET = "..."
```

or:

```powershell
$env:TERICS_GOOGLE_CLIENT_CONFIG = "C:\path\to\desktop-oauth-client.json"
```

Refresh tokens are stored through the OS keyring, not a plaintext config file. Use **清除 Google 授权** to remove them. No OAuth client ID or token is shipped in this repository or release.

Real Google Calendar sync is not verified because no authorized client/account was available in the release environment. The sync planner and deletion confirmation logic are covered by mocks.

## CLI

```powershell
$env:PYTHONPATH = "python"
python -m terics.cli timetable.xlsx --start 2026-08-31 -o timetable.ics
```

## Packaging status

`main.pyw` and the source ZIP are the supported Python deliverables. A PyInstaller executable is not included because no signed/tested Windows binary was produced for this release.
