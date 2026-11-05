# Adapter Development

## 1. Decide the layer

- A **vendor adapter** handles one protocol family.
- A **school profile** records the institution, domains, entry URL and deployment variant.
- A **generic fallback** should not claim vendor-level capabilities.

## 2. Add the manifest

Every adapter descriptor includes:

```json
{
  "id": "vendor-protocol",
  "version": "0.5.0",
  "vendor": "vendor-id",
  "vendorLabel": "平台名称",
  "schoolId": "school-id",
  "schoolName": "学校名称",
  "status": "experimental",
  "capabilities": ["timetable"],
  "verifiedDomains": ["jw.example.edu.cn"],
  "methods": ["api", "dom"],
  "limitations": ["未完成真实账号验收"]
}
```

## 3. Implement detection

Detection must be evidence-based:

- host/path;
- known read-only endpoint;
- rendered DOM markers;
- response schema.

Do not detect only by the word “教务” on a page.

## 4. Implement extraction

Prefer, in order:

1. officially documented structured API;
2. officially supported export endpoint;
3. documented read-only same-origin request;
4. rendered DOM;
5. user file import.

Constraints:

- read-only only;
- no password collection;
- no CAPTCHA/MFA bypass;
- no full `Cookie` header construction;
- no CSRF persistence;
- no mass probing;
- no write or course-selection requests.

## 5. Add fixtures

- Use fictional or redistributable de-identified data.
- Never include real names, student IDs, passwords, cookies or tokens.
- Store response shape and DOM structure, not live authenticated sessions.
- Add an entry to `fixtures/README.md`.
- Update `THIRD_PARTY_NOTICES.md` if the fixture came from another repository.

## 6. Normalize

- Preserve source course/meeting IDs when available.
- Use `makeCourseId` and `makeMeetingId`.
- Do not derive an ID from the display title, teacher or room.
- Preserve unknown adjustment information as a warning.
- Do not silently drop a row with an unparsed field.

## 7. Test

Add tests for:

- detection on supported/unsupported pages;
- successful extraction;
- login expiry and empty responses;
- page structure changes;
- partial data;
- duplicate rows;
- single/even/sparse weeks;
- cancellation/reschedule overrides;
- stable IDs and UIDs;
- schema validation;
- Web/Python snapshot parity.

## 8. Update documentation

Update:

- `docs/connectors.md`
- `docs/supported-schools.md`
- `docs/support-matrix.md`
- `docs/release-notes-v0.5.0-rc.2.md` or the next release notes
- `THIRD_PARTY_NOTICES.md` when applicable

## 9. Status upgrade

Do not mark `Verified` until a real account has completed the manual-login end-to-end flow and the extracted courses were checked against the live website. Record the date, platform variant, permissions and evidence. A fixture-only implementation is at most `Fixture-tested`. WHUT is the only current school-level `Verified` adapter; generic vendor and DOM adapters remain `Experimental`.
