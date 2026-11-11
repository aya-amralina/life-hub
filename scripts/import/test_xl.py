import datetime as dt
import unittest

from xl import any_date, excel_date, is_check, monday, number, parse_range, parse_text_date, parse_time, stable_id, text, year_for_month

D = dt.date


class DatesTest(unittest.TestCase):
    def test_excel_serial(self):
        self.assertEqual(excel_date(46308), D(2026, 10, 13))
        self.assertEqual(excel_date(dt.datetime(2026, 11, 9, 0, 0)), D(2026, 11, 9))
        self.assertIsNone(excel_date("13.10"))
        self.assertIsNone(excel_date(True))

    def test_year_rule(self):
        self.assertEqual(year_for_month(10), 2026)
        self.assertEqual(year_for_month(12), 2026)
        self.assertEqual(year_for_month(1), 2027)
        self.assertEqual(year_for_month(4), 2027)
        with self.assertRaises(ValueError):
            year_for_month(7)

    def test_text_dates(self):
        self.assertEqual(parse_text_date("Fr 23.10").date, D(2026, 10, 23))
        r = parse_text_date("Mi 28.10 10:00")
        self.assertEqual((r.date, r.time, r.assumption), (D(2026, 10, 28), "10:00", False))
        r = parse_text_date("Fr 30.10 (допущ.)")
        self.assertEqual((r.date, r.assumption), (D(2026, 10, 30), True))
        self.assertEqual(parse_text_date("So 08.11 9:00").time, "09:00")
        self.assertEqual(parse_text_date("Mo 15.02").date, D(2027, 2, 15))
        self.assertEqual(parse_text_date("28.10.2026").date, D(2026, 10, 28))
        self.assertIsNone(parse_text_date("сейчас"))
        self.assertIsNone(parse_text_date("31.02"))

    def test_any_date(self):
        self.assertEqual(any_date(dt.datetime(2026, 12, 10, 14, 0)).time, "14:00")
        self.assertEqual(any_date("Do 10.12").date, D(2026, 12, 10))

    def test_ranges(self):
        self.assertEqual(parse_range("12.10–18.10"), (D(2026, 10, 12), D(2026, 10, 18)))
        self.assertEqual(parse_range("Mo 28.12–So 03.01\nKW53"), (D(2026, 12, 28), D(2027, 1, 3)))
        self.assertEqual(parse_range("21.12–8.01"), (D(2026, 12, 21), D(2027, 1, 8)))
        self.assertIsNone(parse_range("декабрь"))

    def test_time_and_week(self):
        self.assertEqual(parse_time("9:30"), "09:30")
        self.assertEqual(parse_time("10:00–12:00"), "10:00")
        self.assertIsNone(parse_time("?"))
        self.assertEqual(monday(D(2026, 11, 15)), D(2026, 11, 9))


class CellsTest(unittest.TestCase):
    def test_text_number_check(self):
        self.assertIsNone(text("—"))
        self.assertEqual(text("  Analysis II "), "Analysis II")
        self.assertEqual(number("27,5"), 27.5)
        self.assertIsNone(number("ok"))
        self.assertTrue(is_check("✓"))
        self.assertFalse(is_check(None))

    def test_stable_id(self):
        self.assertEqual(stable_id("Н04", "Analysis II", "Blatt 3"), stable_id("н04 ", "analysis ii", "Blatt 3"))
        self.assertNotEqual(stable_id("a"), stable_id("b"))


if __name__ == "__main__":
    unittest.main()
