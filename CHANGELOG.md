# Changelog

## v0.1.0 — 2026-11-05

Initial public release.

### Added

- Static TypeScript/Vite web app with local content sniffing and ICS export.
- Python 3.12+ Tkinter GUI launched by `main.pyw`.
- CSV/TSV, HTML list/grid, and XLSX parser adapters.
- Odd/even, sparse, and range weeks; multi-period classes; custom period times.
- Stable SHA-256 event UIDs and internal deduplication.
- Conflict detection and explicit conflict acknowledgement.
- RFC 5545 ICS with `Asia/Shanghai`, `VTIMEZONE`, CRLF, escaping, and UTF-8 safe
  line folding.
- Shared JSON Schema, business rules, fixtures, and cross-language parity test.
- Automated Web, Python, Playwright, and independent ICS parser verification.
- GitHub Actions CI and GitHub Pages deployment.

### Known limitations

- Google Calendar real-account import was not verified.
- No OAuth or Calendar API writes.
- No old binary OLE `.xls`, PDF/image OCR, encrypted workbooks, or macros.
- One period-time table per export; no mid-semester schedule switching.
- School-specific variant coverage is format-level, not nationwide certification.
