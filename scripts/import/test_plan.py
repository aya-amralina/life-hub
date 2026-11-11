import datetime as dt
import unittest

from plan import balance_end, capacity, rollover_preview
from src_study import data_status

D = dt.date


def item(sid, week, hours=2, **kw):
    return {"source_id": sid, "sphere": "study", "week": week, "hours_est": hours, "done_at": None, "status": "открыто", "due_date": None, "is_fixed": None, **kw}


class RolloverPreviewTest(unittest.TestCase):
    def test_moves_until_maximum_rest_waits(self):
        prev, cur = D(2026, 11, 2), D(2026, 11, 9)
        weeks = {prev: {"study_week": "Н03"}, cur: {"study_week": "Н04", "capacity_base_h": 27, "capacity_max_h": 36}}
        items = [
            item("full", cur, 33),
            item("big", prev, 4),
            item("small", prev, 2),
            item("fixed", prev, 1, due_date="2026-11-06"),
            item("done", prev, 1, done_at="x", status="готово"),
        ]
        stats, s = rollover_preview(items, weeks, D(2026, 11, 11))
        h03 = next(x for x in stats if x.label == "Н03")
        self.assertEqual((h03.total, h03.done, h03.flexible_open, h03.moves, h03.waiting), (4, 1, 2, 1, 1))
        self.assertEqual((s["load_before"], s["load_after"]), (33, 35))

    def test_half_mode_capacity(self):
        self.assertEqual(capacity({"study_mode": "каникулы (½)"}), (13.5, 18.0))
        self.assertEqual(capacity(None), (27.0, 36.0))


class MiscTest(unittest.TestCase):
    def test_data_status(self):
        self.assertEqual(data_status("подтверждено (ISIS)")[0], "confirmed")
        self.assertEqual(data_status("допущение")[0], "assumption")
        self.assertEqual(data_status("по ритму ISIS: …")[0], "assumption")
        self.assertEqual(data_status("проверить")[0], "check")
        self.assertEqual(data_status(None), (None, None))

    def test_balance(self):
        txs = [{"kind": "opening", "amount_eur": 100.0, "date": "2026-10-13"}, {"kind": "expense", "amount_eur": 40.0, "date": "2026-11-01"}, {"kind": "transfer", "amount_eur": 9.0, "date": "2026-11-02"}]
        self.assertEqual(balance_end(txs), 60.0)



class MoneyTasksTest(unittest.TestCase):
    def test_future_actions(self):
        from src_budget import future_actions
        today = D(2026, 11, 11)
        todo = "120 € → «Конверты» (ушли на Франкфурт). Отмени Uber One до 13.11."
        self.assertEqual(future_actions(todo, D(2026, 10, 17), today, "Разложить"), [("Отмени Uber One до 13.11", D(2026, 11, 13))])
        self.assertEqual(future_actions("Не трогать — это подушка.", D(2026, 11, 14), today, "Папа"), [])
        self.assertEqual(future_actions("До 11.12 — ничего не списывается.", D(2026, 11, 12), today, "USC"), [])
        self.assertEqual(future_actions("100 € жильцу из «Депозита» — копилку можно закрыть.", D(2026, 11, 30), today, "Депозит жильцу")[0][1], D(2026, 11, 30))
        self.assertEqual(future_actions("Отмени X до 01.11.", D(2026, 10, 1), today, None), [])


if __name__ == "__main__":
    unittest.main()
