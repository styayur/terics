# Third-Party Notices

terics v0.1.0 is MIT licensed. The following third-party packages and public
test samples are used or included. No source code is copied from GPL-licensed
or unlicensed reference repositories.

## Runtime dependencies (Web bundle)

| Package | License | Purpose |
|---|---|---|
| `papaparse` | MIT | RFC 4180-style CSV/TSV parsing |
| `read-excel-file` | MIT | Browser-side XLSX reading |

## Runtime dependencies (Python, installed by user)

| Package | License | Purpose |
|---|---|---|
| `beautifulsoup4` | MIT | HTML parsing |
| `openpyxl` | MIT | XLSX reading |

## Build and test dependencies

| Package | License | Purpose |
|---|---|---|
| `typescript` | Apache-2.0 | TypeScript compiler |
| `vite` | MIT | Static build |
| `vitest` | MIT | Web unit tests |
| `@playwright/test` | Apache-2.0 | Browser E2E tests |
| `happy-dom` | MIT | DOM test environment |
| `ical.js` | MPL-2.0 | Independent ICS verification |
| `ajv`, `ajv-formats` | MIT | JSON Schema validation |
| `tsx` | MIT | TypeScript consistency script |
| `pytest` | MIT | Python tests |
| `icalendar` | BSD-2-Clause | Independent Python ICS verification |
| `ruff` | MIT | Python static checks |

Full license texts are distributed by their respective packages. Version pins
are recorded in `package-lock.json` and `python/pyproject.toml`.

## Public test fixtures from WakeUp Schedule

The following files are copied from `Ricraft/wakeup-schedule` and are covered
by the MIT license reproduced below:

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

## Structural references only

- `LingNc/stnet_syllabus` (MIT): informed the field structure of the
  Qingguo-style HTML list fixture. The fixture itself is fictional and created
  for terics.
- `hc-ui/kebiao2ics` (MIT): informed test scenarios for week parsing, conflict
  detection, and RFC 5545 output.
- `zaochih/zf-to-ics` (no repository license): read for research only; no code
  or assets were copied.
- `lingion/sleepy` (GPL-3.0): read for research only; no code or assets were
  copied.

All trademarks belong to their respective owners.
