# Security Policy

terics processes potentially untrusted timetable files. The intended security
boundary is:

- all parsing happens locally;
- no timetable bytes are uploaded;
- HTML scripts and event handlers are never executed;
- exported ICS text is escaped and folded according to RFC 5545;
- file size is limited to 10 MiB;
- no account credentials, cookies, or browser storage from exam systems are read.

## Reporting

Please use GitHub's private security advisory flow:

<https://github.com/styayur/terics/security/advisories/new>

Do not include a real timetable, student identifier, cookie, token, or other
personal data in a public issue.

## Supported version

Security fixes are provided for the latest tagged release. v0.1.0 is the
initial release.
