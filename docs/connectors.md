# SIS Connectors

terics v0.5.0 uses a Connector SDK plus vendor adapters and school profiles. A vendor adapter implements protocol behavior; a school profile supplies the domain, entry URL, platform variant, status and capabilities. They are deliberately separate.

## Adapter inventory

| Adapter ID | Vendor | Method | Current status | Capabilities |
|---|---|---|---|---|
| `whut-wisedu-jwapp` | Wisedu / 金智 jwapp | Read-only API | Experimental | timetable, semester, periods, classroom, adjustments declaration |
| `zf-jwglxt` | Zhengfang V8/V9 compatible | API + DOM fallback | Experimental | timetable, semester, periods, classroom |
| `qiangzhi-dom` | Qiangzhi | DOM | Experimental | timetable, classroom |
| `qingguo-dom` | Qingguo | DOM + export | Experimental | timetable, classroom |
| `wisedu-jwapp` | Generic Wisedu | Read-only API | Experimental | timetable, semester, periods, classroom |
| `generic-dom` | Generic HTML | DOM | Experimental | timetable |

No adapter is marked `Verified` in v0.5.0-rc.1 because no real student login end-to-end validation was performed in this release environment.

## Wisedu / WHUT

- Entry: `https://jwxt.whut.edu.cn/jwapp/sys/homeapp/index.do?forceCas=1`
- Login redirects to the university unified authentication service.
- The connector makes only read-only, same-session requests after the user manually logs in.
- API chain: current user/term, section map, student timetable; legacy endpoint fallback.
- `SKZC` is interpreted as a 30-bit week bitmap.
- WHUT section DM values are mapped to physical periods using the known 2026 fallback table; unknown values pass through rather than being dropped.
- The connector does not read the browser cookie database or persist CSRF parameters.
- Status: **Experimental**; the implementation and fixtures are automated, but real-account acceptance is outstanding.

## Zhengfang

- Supports Wisedu/JWGLXT-style `kbList`/`sjkList` responses.
- Tries known read-only timetable endpoints and falls back to DOM extraction.
- Field support: course name/code, teaching class, teacher, room, campus, weekday, section range and week rule.
- Semester values are read from `#xnm`/`#xqm` or supplied by the caller.
- Status: **Experimental**.

## Qiangzhi

- Uses the rendered timetable DOM only in v0.5.0.
- Detection is based on URL/path features and rendered table structure.
- Missing adjustment data is reported as a warning, not silently dropped.
- Status: **Experimental**.

## Qingguo

- Reuses the deterministic HTML list/grid parser.
- Supports the existing Qingguo-style `上课时间地点` list and rendered grid fixtures.
- Status: **Experimental**.

## Determinism rules

- Adapter output is normalized before event generation.
- Course IDs and meeting IDs come from source identifiers when available.
- UIDs do not depend on course display name, teacher or room.
- DOM extraction never claims to provide absent adjustment data.
- Unknown rows are counted/skipped with warnings and never replaced by guessed times.
