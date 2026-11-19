import datetime as dt
import unittest

from backup import backup_name


class Name(unittest.TestCase):
    def test_berlin_time_to_the_second_winter_and_summer(self):
        self.assertEqual(backup_name(dt.datetime(2026, 11, 19, 15, 52, 7, tzinfo=dt.timezone.utc)), "lifehub-backup-2026-11-19-165207.json")
        self.assertEqual(backup_name(dt.datetime(2027, 7, 1, 22, 0, 59, tzinfo=dt.timezone.utc)), "lifehub-backup-2027-07-02-000059.json")


if __name__ == "__main__":
    unittest.main()
