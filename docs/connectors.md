# SIS Connectors

terics v0.5.0-rc.2 uses a Connector SDK plus vendor adapters and school profiles. A vendor adapter implements protocol behavior; a school profile supplies the domain, entry URL, platform variant, status and capabilities.

## Adapter inventory

| Adapter ID | Vendor | Method | Current status | Capabilities |
|---|---|---|---|---|
| `whut-wisedu-jwapp` | Wisedu jwapp / WHUT | Read-only API | **Verified** (2026-11-06) | timetable, semester, periods, classroom |
| `zf-jwglxt` | Zhengfang V8/V9 compatible | API + DOM fallback | Experimental | timetable, semester, periods, classroom |
| `qiangzhi-dom` | Qiangzhi | DOM | Experimental | timetable, classroom |
| `qingguo-dom` | Qingguo | DOM + export | Experimental | timetable, classroom |
| `wisedu-jwapp` | Generic Wisedu | Read-only API | Experimental | timetable, semester, periods, classroom |
| `generic-dom` | Generic HTML | DOM | Experimental | timetable |

WHUT verification does **not** certify the generic Wisedu adapter or another Wisedu school.

## Wuhan University of Technology

- Entry: `https://jwxt.whut.edu.cn/jwapp/sys/homeapp/index.do?forceCas=1`
- The user manually authenticates in a browser session; the connector performs same-origin read-only requests.
- Status: **Verified** by a real 2026-2027-1 student-account comparison on 2026-11-06.

### Request chain

1. `GET /jwapp/sys/homeapp/api/home/currentUser.do`
2. `GET /jwapp/sys/homeapp/api/home/student/getSections.do?termCode=2026-2027-1&campusCode=`
3. `POST /jwapp/sys/homeapp/api/home/student/getMyScheduleDetail.do`
   - Content type: `application/x-www-form-urlencoded; charset=UTF-8`
   - Form fields: `termCode`, `campusCode`, `type=week`, `week=<current teaching week>`

`changeAppRole.do` is not called by the connector. The current student role must already be selected.

### Term context

- Semester code: `2026-2027-1`
- Observed current teaching week: `9`
- Observed registrar date: Friday, 2026-11-06
- Derived first teaching Monday: **2026-09-07**
- Timezone: `Asia/Shanghai`
- The resolver validates the Chinese weekday and uses date-only arithmetic.
- If a configured first Monday differs, extraction reports the mismatch and uses the registrar-derived value.

### Week bitmap

- `week` is a variable-length bitmap; first character is week 1.
- `1` means scheduled and `0` means unscheduled.
- Empty, malformed or all-zero bitmaps become explicit row warnings rather than silent drops.
- Sparse, alternate and non-contiguous weeks are preserved.
- No fixed 30-week truncation is applied.

### Period schedule

- `getSections.do` returned 13 enabled periods for the accepted term.
- Course `beginSection` / `endSection` values map directly to those returned section codes.
- The accepted times are recorded in `fixtures/connectors/whut/sections.json`.
- A course referencing a missing section is skipped with a warning; default periods are not substituted for a successful real WHUT section response.

### Collections

- `arrangedList`: scheduled course meetings; normalized into schema 2.0.
- `notArrangeList`: accepted response was empty. Non-empty records are preserved as explicit warnings and never silently discarded.
- `practiceList`: accepted response was empty. Records with complete scheduling fields are normalized; incomplete records produce warnings.

## Zhengfang

- Supports Wisedu/JWGLXT-style `kbList`/`sjkList` responses.
- Tries known read-only timetable endpoints and falls back to DOM extraction.
- Field support: course name/code, teaching class, teacher, room, campus, weekday, section range and week rule.
- Status: **Experimental**.

## Qiangzhi

- Uses the rendered timetable DOM only.
- Detection is based on URL/path features and rendered table structure.
- Missing adjustment data is reported as a warning, not silently dropped.
- Status: **Experimental**.

## Qingguo

- Reuses the deterministic HTML list/grid parser.
- Supports the existing Qingguo-style `上课时间地点` list and rendered grid fixtures.
- Status: **Experimental**.

## Determinism rules

- Adapter output is normalized before event generation.
- Course IDs and meeting IDs use source identifiers; display name, teacher and room are not identity inputs.
- UIDs do not depend on course display name, teacher or room.
- Unknown rows are counted and warned, never replaced by guessed times.
- A `Verified` label requires a real institution/account comparison, not only HTTP 200 or fixtures.
