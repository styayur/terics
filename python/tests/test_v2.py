from pathlib import Path

from icalendar import Calendar

from terics.ics import generate_ics_v2
from terics.timetable_v2 import build_v2_events, parse_terics_json

ROOT = Path(__file__).resolve().parents[2]


def load_example(name: str) -> dict[str, object]:
    return parse_terics_json((ROOT / "fixtures" / "exchange" / name).read_text(encoding="utf-8"))


def test_v2_exchange_fixture_and_overrides() -> None:
    timetable = load_example("overrides.terics.json")
    result = build_v2_events(timetable)
    dates = [event.date for event in result.events]
    assert "2026-09-07" not in dates
    assert "2026-09-14" not in dates
    assert "2026-09-19" in dates
    assert "2026-09-25" in dates
    late = next(event for event in result.events if event.date == "2026-11-02")
    assert (late.start, late.end) == ("08:30", "10:10")
    assert len({event.uid for event in result.events}) == len(result.events)
    assert any(issue.code == "unconfirmed_override_ignored" for issue in result.issues)


def test_v2_ics_parses_independently() -> None:
    timetable = load_example("terics-example.terics.json")
    output = generate_ics_v2(timetable, alarm_minutes=0)
    calendar = Calendar.from_ical(output.ics)
    events = calendar.walk("VEVENT")
    assert len(events) == 11
    assert all(str(event["UID"]).startswith("terics-") for event in events)
    assert all(event["DTSTART"].params["TZID"] == "Asia/Shanghai" for event in events)


def test_rejects_credentials_in_exchange_json() -> None:
    import pytest

    from terics.errors import TericsParseError

    text = (ROOT / "fixtures" / "exchange" / "terics-example.terics.json").read_text(encoding="utf-8")
    with pytest.raises(TericsParseError):
        parse_terics_json(text.replace('"schemaVersion": "2.0"', '"schemaVersion": "2.0", "access_token": "secret"'))


def test_v2_ics_line_folding() -> None:
    timetable = parse_terics_json((ROOT / "fixtures" / "exchange" / "overrides.terics.json").read_text(encoding="utf-8"))
    output = generate_ics_v2(timetable)
    assert output.ics.endswith("\r\n")
    assert "\n" not in output.ics.replace("\r\n", "")
    assert all(len(line.encode("utf-8")) <= 75 for line in output.ics.split("\r\n") if line)
    assert len(output.events) == 12
