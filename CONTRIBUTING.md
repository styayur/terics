# Contributing

## Before you start

- Do not submit real student timetables, names, student IDs, account cookies,
  passwords, or screenshots containing personal data.
- Use fictional or fully anonymized fixtures.
- Do not copy code from a repository without a clear compatible license.
- For parser proposals, include the source format structure and at least one
  anonymized fixture that legally may be redistributed.

## Development setup

Web:

```powershell
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

Python:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
$env:PYTHONPATH = "python"
python -m pytest python/tests
python -m compileall -q python main.pyw
ruff check python main.pyw
```

Cross-language parity:

```powershell
npm run test:consistency
```

## Adding a parser adapter

1. Read [spec/business-rules.md](spec/business-rules.md).
2. Add a fixture under `fixtures/` using fictional data.
3. Implement a small adapter returning the normalized `RawCourse` shape.
4. Keep format detection content-based in `src/core/parsers/index.ts` and
   `python/terics/parsers/detect.py`.
5. Add tests in both `tests/` and `python/tests/`.
6. Add the fixture to the cross-language snapshot.
7. Update `docs/formats.md` and third-party notices if needed.

## UI and security

- Never render untrusted course text with `innerHTML` or Tk rich text.
- Do not add analytics, remote logging, or file uploads.
- Keep the web app fully static.
- Reject unsupported formats explicitly instead of guessing.

## Pull requests

Include:

- What format/school variant is supported.
- Sanitized fixture provenance.
- Test commands and results.
- Known limitations.
- License compatibility confirmation for any copied asset.

By contributing, you agree your contribution is licensed under the project MIT
license.
