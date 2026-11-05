# Shared fixtures

These fixtures are fictional or redistributable test data. They must not contain a real student’s timetable, identity, credentials, cookies or tokens.

## File adapters

- `csv/terics_sample.csv`: canonical CSV long-table fixture.
- `csv/terics_sample_gb18030.csv`: GB18030 encoding fixture.
- `csv/conflict_sample.csv`: overlapping-course fixture.
- `html/qingguo_list_sample.xls`: fictional Qingguo-style HTML list exported with an `.xls` extension.
- `html/wakeup_usc_sample.html`: public MIT fixture from `Ricraft/wakeup-schedule`.
- `xlsx/wakeup_schedule_template.xlsx`: public MIT fixture from `Ricraft/wakeup-schedule`.

## Connector fixtures

- `connectors/whut/current-user.json`: fictional WHUT `currentUser.do` response with term, week and registrar date.
- `connectors/whut/sections.json`: 13 factual WHUT section times with synthetic metadata.
- `connectors/whut/schedule-detail.json`: fictional WHUT `getMyScheduleDetail.do` response preserving the observed field structure.
- `connectors/whut/partial-response.json`: non-empty unscheduled/practice collections and a partially mapped row.
- `connectors/whut/empty-response.json`: valid empty response.
- `connectors/whut/login-expired.json`: synthetic expired-login response.
- `connectors/zf/kb-list.json`: fictional Zhengfang `kbList` response.
- `normalized/example.json`: legacy normalized schema example.

## Schema 2.0 exchange fixtures

- `exchange/terics-example.terics.json`: WHUT-like fictitious `.terics.json` with 2 courses/11 events.
- `exchange/overrides.terics.json`: cancellation, reschedule, makeup, unconfirmed override and two effective-dated period schedules.
- `exchange/whut-real-shape.terics.json`: deterministic output generated from the sanitized WHUT fixtures: 3 courses, 4 meetings and 37 events.

## Redistribution

See `THIRD_PARTY_NOTICES.md` for the two MIT WakeUp fixtures. All WHUT/ZF course, identity, teacher and room rows are synthetic. The 13 WHUT period times are factual API data and contain no personal information. Raw authenticated acceptance responses under `docs/jounal/` are ignored and must never be committed.
