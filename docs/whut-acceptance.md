# WHUT Acceptance Record

Date: 2026-11-05  
School: 武汉理工大学  
Target: undergraduate student timetable  
Entry: `https://jwxt.whut.edu.cn/jwapp/sys/homeapp/index.do?forceCas=1`

## Completed

- Entry point returned HTTP 302 to `zhlgd.whut.edu.cn` unified authentication.
- Independent Playwright worker and dedicated profile started successfully in local Windows tests.
- Shared Connector runtime injects into a page and returns schema 2.0 output.
- Fictional Wisedu fixture covers:
  - `cxxszhxqkb` response;
  - `SKZC` bitmap weeks;
  - DM/KSJC/JSJC section mapping;
  - current-user semester;
  - jcjx section map;
  - stable course/meeting IDs.
- Extension package loaded unpacked in Microsoft Edge with `activeTab`, `scripting`, `storage`.
- Web/Python v2 event parity includes a WHUT-style exchange fixture.

## Blocked

No user-authorized WHUT account or MFA interaction was available to the agent. The agent did not request credentials, read Cookie databases, bypass authentication, or fabricate a live result.

## Required manual acceptance

1. Open the app’s independent Playwright browser.
2. Complete WHUT unified authentication manually.
3. Navigate to the personal timetable.
4. Trigger extraction.
5. Compare course count, names, teaching classes, weeks, sections, teachers, rooms and any cancellations/reschedules with the live SIS.
6. Export `.terics.json`, reopen it in the Web app and compare ICS events.
7. Record the platform variant and date in `docs/support-matrix.md`.
8. Only then consider upgrading WHUT from `Experimental` to `Verified`.

## Current status

**Experimental** — code and fixtures tested; real-account end-to-end acceptance outstanding.
