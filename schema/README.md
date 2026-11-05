# Schemas

- `timetable.schema.json` — normalized v1 timetable retained for backward compatibility.
- `timetable-v2.schema.json` — `.terics.json` exchange schema 2.0 for courses, meetings, overrides, effective-dated period schedules, extraction metadata and validation reports.

Web and Python both validate against the v2 rules. Credential-like fields are forbidden recursively.

Schema 2.0 validates teaching weeks as positive integers without a fixed bitmap-length cap. Connector adapters remain responsible for rejecting malformed week strings and reporting partial records.
