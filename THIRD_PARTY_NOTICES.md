# Third-Party Notices

terics is MIT licensed. This file records third-party dependencies and redistributed fixtures. No code is copied from GPL or unlicensed repositories.

## Runtime dependencies (Web bundle)

| Package | License | Purpose |
|---|---|---|
| `papaparse` | MIT | CSV/TSV parsing |
| `read-excel-file` | MIT | XLSX parsing |

## Runtime dependencies (Python)

| Package | License | Purpose |
|---|---|---|
| `beautifulsoup4` | MIT | HTML parsing |
| `openpyxl` | MIT | XLSX parsing |
| `playwright` | Apache-2.0 | Dedicated manual-login browser |
| `google-auth-oauthlib` | Apache-2.0 | Desktop OAuth installed-app flow |
| `google-api-python-client` | Apache-2.0 | Google Calendar API |
| `keyring` | MIT | OS credential storage |

## Build and test dependencies

| Package | License | Purpose |
|---|---|---|
| `typescript` | Apache-2.0 | TypeScript compiler |
| `vite` | MIT | Static Web build |
| `vitest` | MIT | Unit tests |
| `@playwright/test` | Apache-2.0 | Web/extension E2E |
| `happy-dom` | MIT | DOM tests |
| `ical.js` | MPL-2.0 | Independent ICS verification |
| `ajv`, `ajv-formats` | MIT | JSON Schema validation |
| `esbuild` | MIT | Extension/runtime bundles |
| `adm-zip` | MIT | Extension ZIP packaging |
| `tsx` | MIT | TypeScript scripts |
| `pytest` | MIT | Python tests |
| `icalendar` | BSD-2-Clause | Independent Python ICS verification |
| `ruff` | MIT | Python lint |

Exact versions are recorded in `package-lock.json` and `python/pyproject.toml`. `npm run audit:licenses` and `scripts/audit_python_licenses.py` perform allow-list checks in CI.

## Public test fixtures from WakeUp Schedule

The following files are copied from `Ricraft/wakeup-schedule` under the MIT license reproduced below:

- `fixtures/html/wakeup_usc_sample.html`
- `fixtures/xlsx/wakeup_schedule_template.xlsx`

Source: <https://github.com/Ricraft/wakeup-schedule>

Copyright (c) 2025 WakeUp Schedule

```text
MIT License

Copyright (c) 2025 WakeUp Schedule

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Behavior and protocol research only

- `LingNc/stnet_syllabus` (MIT): Qingguo-style list fields and test scenarios.
- `hc-ui/kebiao2ics` (MIT): week/conflict/ICS test scenarios.
- `Ricraft/wakeup-schedule` (MIT): public fixtures and HTML/XLSX layout scenarios.
- `lingion/sleepy` (GPL-3.0): WHUT jwapp endpoint/field/role-mapping research only; no source or assets copied.
- `zaochih/zf-to-ics` (no repository license): Zhengfang field/protocol behavior research only; no code or assets copied.

The operational WHUT request chain and field mapping were confirmed from the user-authorized live school page on 2026-11-06. The course, identity, teacher and room test data in `fixtures/connectors/whut/` is fictional and created for terics; only factual 13-period times are retained. No GPL or unlicensed code was copied.

All trademarks belong to their respective owners.
