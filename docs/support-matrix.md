# Support Matrix

## Status Definitions

| Status | Meaning |
|---|---|
| `Verified` | Real institution/account end-to-end extraction checked against the live timetable. |
| `Fixture-tested` | Real-source de-identified fixture plus full automated tests. |
| `Experimental` | Code exists but real-environment acceptance is absent or incomplete. |
| `Community` | Community supplied; maintainer has not verified. |
| `Unsupported` | Explicitly unsupported. |

## School Matrix

| School | Platform | Variant | Domain | Adapter | Status | Last verified | Capabilities | Known limits |
|---|---|---|---|---|---|---|---|---|
| 武汉理工大学 | Wisedu jwapp | student timetable API, 2026 layout | `jwxt.whut.edu.cn` | `whut-wisedu-jwapp` | **Verified** | 2026-11-06 / 2026-2027-1 | timetable, term, periods, classroom | Future API changes need revalidation; non-empty unscheduled/practice collections not observed; no dedicated adjustment endpoint identified |
| Generic Wisedu deployment | Wisedu jwapp | generic API | caller domain | `wisedu-jwapp` | Experimental | Not verified | timetable, term, periods, classroom* | Not a school certification; does not inherit WHUT status |
| Generic Zhengfang | ZF JWGLXT | V8/V9-compatible | caller domain | `zf-jwglxt` | Experimental | Not verified | timetable, term, periods, classroom* | Variant field/term differences |
| Generic Qiangzhi | Qiangzhi | DOM | caller domain | `qiangzhi-dom` | Experimental | Not verified | timetable, classroom* | No guaranteed adjustments |
| Generic Qingguo | Qingguo | DOM/list/export | caller domain | `qingguo-dom` | Experimental | Not verified | timetable, classroom* | No guaranteed adjustments |
| Other HTML tables | Generic | DOM | current tab | `generic-dom` | Experimental | Not verified | timetable | Low confidence; user should verify |

## Verified Evidence

The WHUT status is based on a real authenticated 2026-2027-1 student session:

- 42 `arrangedList` records, 0 `notArrangeList`, 0 `practiceList`.
- 15 courses, 42 meetings, 242 weekly instances, weeks 1–18.
- Current week 9; first teaching Monday 2026-09-07.
- 13/13 actual section times matched.
- 42/42 visible term timetable cards matched on course name, code, weekday, week set, section range, teacher and room.
- Generated ICS parsed independently with 242 events, 242 unique UIDs and `Asia/Shanghai`.

## Capability Notes

- A missing teacher or room is a validation warning; the extractor does not fabricate data.
- All connectors require the user to trigger extraction from an already-authenticated page.
- No connector performs course changes, enrollment, withdrawal or other write operations.
- WHUT verification is term- and variant-specific. A future WHUT response change must be treated as an unverified variant until compared again.
- Generic Wisedu is intentionally separate and remains Experimental.
