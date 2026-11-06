# Supported Schools and Platforms

The support level describes **evidence**, not ambition.

v0.6 adds URL-first resolution. A URL match only identifies a school/vendor candidate; it does not prove that extraction will succeed. The Web app keeps `VERIFIED`, `EXPERIMENTAL` and `UNKNOWN` separate from the later extraction result.

## Wuhan University of Technology (WHUT) — Verified

- **Platform**: Wisedu jwapp / WHUT student timetable layout
- **Entry**: `https://jwxt.whut.edu.cn/jwapp/sys/homeapp/index.do?forceCas=1`
- **Adapter**: `whut-wisedu-jwapp`
- **Methods**: read-only same-origin API using the user’s authenticated browser session
- **Verified scope**: 2026-2027-1 student context, checked on 2026-11-06
- **Requests**:
  - `GET currentUser.do`
  - `GET getSections.do?termCode=…&campusCode=`
  - `POST getMyScheduleDetail.do` with `termCode`, `campusCode`, `type=week`, `week`
- **Live result**:
  - 42 arranged records, 15 courses, 42 meetings, 242 weekly instances
  - current week 9; first teaching Monday 2026-09-07; max teaching week 18
  - 13/13 period times matched
  - 42/42 live semester timetable cards matched
  - 242-event ICS independently parsed with unique UIDs
- **Remaining WHUT limits**:
  - Future school-side API changes require revalidation.
  - The accepted response contained empty `notArrangeList` and `practiceList`; their non-empty semantics remain unverified.
  - No dedicated adjustment endpoint was identified, so cancellations/rescheduling are only represented when explicit records are present.

The accepted evidence contained no committed student identity, cookie, token, CSRF value or real timetable fixture.

## Zhengfang

Zhengfang V8/V9-style API and DOM fallbacks are implemented as `zf-jwglxt`. Tested with fictional fixtures. No real school is certified. Status: **Experimental**.

## Qiangzhi

Rendered timetable DOM parsing is implemented as `qiangzhi-dom`. Tested with a public grid fixture. No real school is certified. Status: **Experimental**.

## Qingguo

List/grid DOM parsing is implemented as `qingguo-dom`; the existing file parser remains available for official HTML exports. No real school is certified. Status: **Experimental**.

## Generic Wisedu

The generic Wisedu adapter is intentionally separate from the WHUT school adapter. WHUT verification does not extend to other Wisedu deployments. Status: **Experimental**.

## Generic DOM

`generic-dom` can attempt a rendered HTML timetable only after explicit user action. It is intentionally low-confidence and cannot claim adjustment completeness. Status: **Experimental**.

## URL-only recognition

The Resolver can identify a vendor path such as `/jwglxt/`, `/jwapp/` or `/jsxsd/`, but this remains Experimental until a specific school has real environment evidence. Unknown domains never receive guessed API calls.
