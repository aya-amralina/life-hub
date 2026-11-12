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



class UpdateTest(unittest.TestCase):
    """Three-way update: old Excel ↔ new Excel ↔ base."""

    def setUp(self):
        import update as upd
        self.upd = upd
        self.ctx = {"week_id": {}, "week_start": {}, "key_of": {}, "id_of": {}}

    def tx(self, **kw):
        base = {"source_id": "budget:N8", "date": "2026-11-20", "amount_eur": 100.0, "title": "Miete", "note": None, "account": None, "grp": "Обязательное", "kind": "expense", "entry_kind": "one_off", "week_no": None, "envelope_key": None, "debt_key": None, "is_planned": True, "confirmed_at": None, "cancelled_at": None}
        return {**base, **kw}

    def run_diff(self, old_row, new_row, base_row, wins=()):
        old = self.upd.baseline_records("transactions", [old_row], self.ctx)
        base = {base_row["source_id"]: {**base_row, "id": "db1"}} if base_row else {}
        return self.upd.diff("transactions", [new_row] if new_row else [], old, base, self.ctx, set(wins), D(2026, 11, 11), frozenset({"budget"}))

    def test_changed_only_in_excel_updates(self):
        [c] = self.run_diff(self.tx(), self.tx(amount_eur=120.0), self.tx())
        self.assertEqual((c.kind, c.patch), ("update", {"amount_eur": 120.0}))

    def test_changed_in_both_is_a_conflict_unless_excel_wins(self):
        confirmed = self.tx(confirmed_at="2026-11-10T12:00:00+01:00")
        [c] = self.run_diff(self.tx(), self.tx(amount_eur=120.0), confirmed)
        self.assertEqual((c.kind, c.fields, c.app_fields), ("conflict", ["amount_eur"], ["confirmed"]))
        [c] = self.run_diff(self.tx(), self.tx(amount_eur=120.0), confirmed, wins=["N8"])
        self.assertEqual(c.kind, "update")

    def test_app_change_alone_is_kept(self):
        self.assertEqual(self.run_diff(self.tx(), self.tx(), self.tx(amount_eur=90.0)), [])

    def test_base_already_equal_to_new_excel_is_nothing(self):
        self.assertEqual(self.run_diff(self.tx(), self.tx(amount_eur=120.0), self.tx(amount_eur=120.0)), [])

    def test_gone_from_excel_is_cancelled_not_deleted(self):
        [c] = self.run_diff(self.tx(), None, self.tx())
        self.assertEqual(c.kind, "remove")
        self.assertIn("cancelled_at", c.patch)

    def test_new_key_is_inserted(self):
        old = {}
        [c] = self.upd.diff("transactions", [self.tx(source_id="budget:N30")], old, {}, self.ctx, set(), D(2026, 11, 11))
        self.assertEqual(c.kind, "insert")

    def test_week_kind_follows_excel_without_conflict(self):
        fact = self.tx(title="Неделя 4 (факт)", grp="Жизнь", entry_kind="week_total", week_no=4, is_planned=False, confirmed_at="2026-11-08T12:00:00+01:00")
        [c] = self.run_diff(fact, fact, {**fact, "entry_kind": "one_off", "week_no": None})
        self.assertEqual(c.kind, "always")
        self.assertEqual(c.patch, {"entry_kind": "week_total", "week_no": 4})

    def test_status_plan_to_fact_in_excel_confirms(self):
        [c] = self.run_diff(self.tx(), self.tx(is_planned=False, confirmed_at="2026-11-20T12:00:00+01:00"), self.tx())
        self.assertEqual(c.kind, "update")
        self.assertEqual(c.patch["is_planned"], False)
        self.assertTrue(c.patch["confirmed_at"])

    def test_old_kind_family_is_not_removed(self):
        """A run that makes no money tasks leaves the old ones (another family) alone."""
        upd = self.upd
        old = {"budget:todo:abc": {"fields": {}, "state": {}}}
        base = {"budget:todo:abc": {"id": "i1", "status": "открыто", "done_at": None, "sphere": "money"}}
        new = [{"source_id": "glow:task:x", "sphere": "body", "title": "X", "status": "Не начато"}]
        changes = upd.diff("items", new, old, base, self.ctx, set(), D(2026, 11, 11))
        self.assertEqual([c.kind for c in changes], ["insert"])

    def test_links_compare_by_key(self):
        upd = self.upd
        ctx = {"week_id": {}, "week_start": {}, "key_of": {"u-e2": "budget:env:E2"}, "id_of": {"budget:env:E2": "u-e2", "budget:env:E3": "u-e3"}}
        row = self.tx(envelope_key="budget:env:E2")
        old = upd.baseline_records("transactions", [row], ctx)
        base = {"budget:N8": {**row, "id": "db1", "envelope_id": "u-e2"}}
        self.assertEqual(upd.diff("transactions", [row], old, base, ctx, set(), D(2026, 11, 11)), [])
        [c] = upd.diff("transactions", [self.tx(envelope_key="budget:env:E3")], old, base, ctx, set(), D(2026, 11, 11))
        self.assertEqual(c.patch, {"envelope_id": "u-e3"})

    def test_stage_targets_replace_excel_keys_keep_app_keys(self):
        upd = self.upd
        old_row = {"source_id": "glow:stage:1", "start_date": "2026-11-09", "end_date": "2026-11-15", "targets": {"retinoid_per_week": 3}, "habits": ["water"], "care_items": ["Крем"]}
        new_row = {**old_row, "targets": {"niacinamide_per_week": 7}, "care_items": ["Крем", "Ниацинамид"]}
        base_row = {**old_row, "id": "s1", "targets": {"retinoid_per_week": 3, "activity_points_week": 60}, "care_items": ["Крем", "Ниацинамид"]}
        old = upd.baseline_records("plan_stages", [old_row], self.ctx)
        [c] = upd.diff("plan_stages", [new_row], old, {"glow:stage:1": base_row}, self.ctx, set(), D(2026, 11, 11))
        self.assertEqual(c.kind, "update")
        self.assertEqual(c.patch, {"targets": {"activity_points_week": 60, "niacinamide_per_week": 7}})
