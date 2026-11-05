# Contributing

## Before contributing

- Do not submit real student timetables, names, student IDs, cookies, tokens, passwords or authenticated screenshots.
- Use fictional or fully de-identified fixtures that may legally be redistributed.
- Do not copy code or fixtures from an unlicensed or GPL repository into this MIT project.
- Do not add background extraction, broad host permissions, analytics or remote logging.

## Setup

```powershell
npm ci
npm run build:connectors
npm run check
npm test
npm run build:extension
npm run package:extension
npm run verify:extension

py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
$env:PYTHONPATH = "python"
ruff check python main.pyw
python -m pytest python/tests
python main.pyw --smoke-test

npm run test:consistency
```

## Adding a connector

Follow [docs/adapter-development.md](docs/adapter-development.md). Requirements:

- vendor adapter separated from school profile;
- content/host/protocol evidence-based detection;
- read-only extraction only;
- de-identified fixture;
- schema 2.0 normalization;
- stable source IDs where available;
- automated tests in both TypeScript/Python where the shared core changes;
- support-level downgrade if only fixture-tested;
- documentation and license update.

## Generated connector runtime

The committed Python runtime is produced from TypeScript source:

```powershell
npm run build:connectors
git diff --exit-code -- python/terics/assets/connector-runtime.js python/terics/assets/connector-manifest.json
```

Do not edit generated files by hand.

## Pull requests

Include:

- supported platform/school/variant;
- sanitized fixture provenance;
- test commands and real output;
- security/privacy impact;
- license confirmation;
- known limitations;
- whether real-environment acceptance occurred.

By contributing, you agree that your contribution is licensed under the project MIT license.
