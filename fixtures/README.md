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

- `connectors/whut/rows.json`: fictional Wisedu `cxxszhxqkb` response rows.
- `connectors/whut/api-bundle.json`: fictional current user/section-map responses.
- `connectors/zf/kb-list.json`: fictional Zhengfang `kbList` response.
- `normalized/example.json`: legacy normalized schema example.

## Schema 2.0 exchange fixtures

- `exchange/terics-example.terics.json`: WHUT-like fictitious `.terics.json` with 2 courses/11 events.
- `exchange/overrides.terics.json`: cancellation, reschedule, makeup, unconfirmed override and two effective-dated period schedules.

## Redistribution

See `THIRD_PARTY_NOTICES.md` for the two MIT WakeUp fixtures. All WHUT/ZF fixture rows are synthetic and created for terics.
