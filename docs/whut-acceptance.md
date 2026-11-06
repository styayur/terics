# WHUT Live Acceptance — 2026-11-06

> v0.6 status: the browser session available during v0.6 construction was on the unified logout page. The evidence below is the accepted v0.5.0-rc.2 baseline and was not re-run for `v0.6.0-rc.1`. The Verified label remains limited to the exact term/layout described here.

## Scope

- Institution: Wuhan University of Technology
- Term: `2026-2027-1`
- Student role: current “学生组（在校）” context
- Browser: user-controlled authenticated in-app browser session
- Method: read-only same-origin requests and visible timetable comparison
- Adapter: `whut-wisedu-jwapp`

No student name, student ID, cookie, token, CSRF value or real timetable was committed. Raw authenticated response copies remain local-only under the ignored `docs/jounal/` directory.

## Request evidence

| Operation | Method | URL | Parameters |
|---|---|---|---|
| Current user / term | GET | `/jwapp/sys/homeapp/api/home/currentUser.do` | none |
| Period schedule | GET | `/jwapp/sys/homeapp/api/home/student/getSections.do` | `termCode=2026-2027-1`, `campusCode=` |
| Timetable detail | POST form | `/jwapp/sys/homeapp/api/home/student/getMyScheduleDetail.do` | `termCode=2026-2027-1`, `campusCode=`, `type=week`, `week=9` |

The form request uses `application/x-www-form-urlencoded; charset=UTF-8`. No `changeAppRole.do` request is made.

## Sanitized response shape

```text
currentUser.datas
├── userName / userId                  [discarded by normalizer]
├── userGroups
└── welcomeInfo
    ├── xnxqdm                         "2026-2027-1"
    ├── xnxqmc
    ├── classWeek                      9
    └── date                           registrar date text

getSections.datas[]
└── { enable, sort, code, name, startTime, endTime, campus, ... }

getMyScheduleDetail.datas
├── arrangedList[]
│   ├── courseName / courseCode / credit / courseSerialNo
│   ├── teachClassName / teachingTarget / teachClassId
│   ├── weeksAndTeachers / titleDetail / cellDetail
│   ├── placeName / dayOfWeek
│   ├── beginSection / endSection / beginTime / endTime
│   └── week                          variable-length 0/1 bitmap
├── notArrangeList[]
├── practiceList[]
└── code / name                        [not persisted as identity]
```

## Live extraction result

- `arrangedList`: 42
- `notArrangeList`: 0
- `practiceList`: 0
- Normalized courses: 15
- Normalized meetings: 42
- Weekly instances: 242
- Maximum observed teaching week: 18
- Conflicts: 0
- Skipped records: 0
- Generated ICS events: 242
- Unique ICS UIDs: 242
- ICS independent parse: `ical.js` and Python `icalendar`
- Timezone: `Asia/Shanghai`

## Date and period verification

- `currentUser.do` reported class week 9 and Friday, 2026-11-06.
- Derived first teaching Monday: **2026-09-07**.
- Week 9 Monday: **2026-11-02**.
- Week 9 Friday: **2026-11-06**.
- `getSections.do` returned 13 enabled period records.
- 13/13 displayed times matched the returned data exactly, from `08:00–08:45` through `20:40–21:25`.

## Course comparison

The current week view showed 16 course blocks. All 16 matched the normalized week-9 records.

The full semester timetable view showed 42 course blocks. All 42 matched on:

- course name;
- course code;
- weekday;
- teaching-week set parsed from the visible week rule;
- start and end section;
- teacher;
- room.

Result: **42/42 exact matches, 0 missing, 0 extra, 0 parse errors**.

## Validation

- All 42 source records produced a meeting.
- All meetings referenced valid section codes from `getSections.do`.
- No teacher or room was missing in the accepted dataset.
- All week bitmaps were valid binary strings.
- The generated schema 2.0 exchange file validated successfully.
- No authentication or identity field appeared in the normalized exchange output.

## Limitations

- Acceptance is specific to the observed WHUT 2026-2027-1 student layout.
- Non-empty `notArrangeList` and `practiceList` payloads were not available for semantic verification.
- No dedicated adjustment endpoint was observed; adjustment support remains limited to explicit records.
- Future WHUT frontend/API releases require a new live comparison before keeping the `Verified` label.
