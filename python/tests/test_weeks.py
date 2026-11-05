from pathlib import Path

from terics.dates import date_for_class, monday_of_iso
from terics.weeks import parse_period_range, parse_weekday, parse_weeks_detailed

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def test_week_parsing_and_cross_year_dates() -> None:
    assert parse_weeks_detailed("1-16单").weeks == [1, 3, 5, 7, 9, 11, 13, 15]
    assert parse_weeks_detailed("2-16周(双)").weeks == [2, 4, 6, 8, 10, 12, 14, 16]
    assert parse_weeks_detailed("第1-2周，4、6").weeks == [1, 2, 4, 6]
    assert parse_weeks_detailed("1-8,10-16").weeks == [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16]
    assert parse_weeks_detailed("1-31").error
    combined = parse_period_range("1-16(周)[01-02节] 星期一 教1-101")
    assert combined is not None
    assert (combined.start, combined.end) == (1, 2)
    assert parse_period_range("1-16(周)[01-02节]").start == 1
    assert parse_period_range("1-16(周)[01-02节]").end == 2
    assert parse_period_range("4").start == 4
    assert parse_weekday("星期一") == 1
    assert parse_weekday("Friday") == 5
    assert parse_weekday("日") == 7
    assert monday_of_iso("2026-09-02") == "2026-08-31"
    assert date_for_class("2026-08-31", 18, 6) == "2027-01-02"
    assert date_for_class("2026-08-31", 20, 6) == "2027-01-16"
