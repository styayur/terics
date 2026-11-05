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
| 武汉理工大学 | Wisedu jwapp | `wdkbby/cxxszhxqkb` + legacy fallback | `jwxt.whut.edu.cn` | `whut-wisedu-jwapp` | Experimental | Not verified | timetable, term, periods, classroom*, adjustments* | Real login/calendar/adjustment data not validated; `*` capability depends on API presence |
| Generic Wisedu deployment | Wisedu jwapp | generic API | caller domain | `wisedu-jwapp` | Experimental | Not verified | timetable, term, periods, classroom* | Not a school certification |
| Generic Zhengfang | ZF JWGLXT | V8/V9-compatible | caller domain | `zf-jwglxt` | Experimental | Not verified | timetable, term, periods, classroom* | Variant field/term differences |
| Generic Qiangzhi | Qiangzhi | DOM | caller domain | `qiangzhi-dom` | Experimental | Not verified | timetable, classroom* | No guaranteed adjustments |
| Generic Qingguo | Qingguo | DOM/list/export | caller domain | `qingguo-dom` | Experimental | Not verified | timetable, classroom* | No guaranteed adjustments |
| Other HTML tables | Generic | DOM | current tab | `generic-dom` | Experimental | Not verified | timetable | Low confidence; user should verify |

## Capability Notes

- `adjustments` means the connector has a code path to consume explicit adjustment data. It does **not** mean all schools expose adjustment records.
- A missing teacher or room is a validation warning; the extractor does not fabricate data.
- All connectors require the user to trigger extraction from an already-authenticated page.
- No connector performs course changes, enrollment, withdrawal or other write operations.

## Verified School Count

- Verified: **0**
- Experimental: **1 named school + generic vendor profiles**
- Reason: no test account or user-authorized live login was available in this environment.
