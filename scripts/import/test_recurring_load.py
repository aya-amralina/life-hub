import copy
import unittest

from recurring_load import Db, add_months, forecast_end, occurrences, plan, preview, report, similar

TODAY = "2026-11-19"
NOW = "2026-11-19T10:00:00+00:00"


def tx(id, **kw):
    base = {"id": id, "source_id": None, "date": "2026-12-15", "title": "TK", "kind": "expense", "entry_kind": "one_off", "amount_eur": 141.16,
            "is_planned": True, "confirmed_at": None, "cancelled_at": None, "account_id": "spark", "recurring_id": None, "occurrence_date": None}
    return {**base, **kw}


def db(*txs, recurring=()):
    return Db(
        accounts=[
            {"id": "spark", "name": "Sparkasse", "grp": "balance", "archived": False},
            {"id": "main", "name": "Revolut · Основной", "grp": "balance", "archived": False},
            {"id": "cushion", "name": "Revolut · Подушка", "grp": "cushion", "archived": False},
        ],
        recurring=list(recurring),
        transactions=list(txs),
    )


def rule(**kw):
    base = {"key": "recurring:tk", "title": "TK", "kind": "expense", "amount_eur": "141.16", "grp": "Обязательное", "account": "Sparkasse",
            "freq": "monthly", "interval": 1, "anchor_date": "2026-12-14", "end_date": None, "note": None}
    return {**base, **kw}


def file(*rules, cancel=()):
    return {"format": "life-hub-recurring", "version": 1, "rules": list(rules), "cancel": list(cancel)}


def ids():
    n = iter(range(1, 100))
    return lambda: f"r{next(n)}"


class Dates(unittest.TestCase):
    def test_a_day_the_month_lacks_is_its_last_day_counted_from_the_first_date(self):
        self.assertEqual(add_months("2027-01-31", 1), "2027-02-28")
        self.assertEqual(occurrences("monthly", 1, "2027-01-31", None, "2027-05-31"), ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"])

    def test_every_three_months_and_the_end(self):
        self.assertEqual(occurrences("monthly", 3, "2027-01-15", None, "2027-12-31"), ["2027-01-15", "2027-04-15", "2027-07-15", "2027-10-15"])
        self.assertEqual(occurrences("monthly", 1, "2026-12-14", "2027-01-31", "2027-05-31"), ["2026-12-14", "2027-01-14"])

    def test_horizon_as_in_the_app(self):
        self.assertEqual(forecast_end(TODAY), "2027-05-31")

    def test_similar_titles(self):
        self.assertTrue(similar("Rundfunk повторно", "rundfunk"))
        self.assertFalse(similar("TK", "Tickets"))


class Rules(unittest.TestCase):
    def test_a_rule_with_a_link_and_a_cancel_in_order(self):
        base = db(tx("d4", source_id="budget:D4"), tx("n5", source_id="budget:N5", title="Rundfunk повторно", date="2026-12-01", amount_eur=60.08))
        p = plan(file(rule(link=[{"ref": "source:budget:D4", "occurrence": "2026-12-14"}]), cancel=["source:budget:N5"]), base, TODAY, NOW, ids())
        self.assertEqual(p.errors, [])
        self.assertEqual([(w.table, w.action, w.id) for w in p.writes], [("recurring", "insert", None), ("transactions", "patch", "d4"), ("transactions", "patch", "n5")])
        r = p.writes[0].rows[0]
        self.assertEqual((r["id"], r["source_id"], r["account_id"], r["amount_eur"], r["interval_n"], r["grp"]), ("r1", "recurring:tk", "spark", "141.16", 1, "Обязательное"))
        self.assertEqual(p.writes[1].body, {"recurring_id": "r1", "occurrence_date": "2026-12-14"})
        self.assertEqual(p.writes[2].body, {"cancelled_at": NOW})

    def test_an_unbound_row_like_an_occurrence_is_a_double_count(self):
        p = plan(file(rule()), db(tx("d4", source_id="budget:D4")), TODAY, NOW, ids())
        self.assertEqual(len(p.errors), 1)
        self.assertIn("source:budget:D4", p.errors[0])
        self.assertIn("двойной счёт", p.errors[0])

    def test_a_row_kept_separate_is_no_double_count(self):
        p = plan(file(rule(separate=["source:budget:D4"])), db(tx("d4", source_id="budget:D4")), TODAY, NOW, ids())
        self.assertEqual(p.errors, [])
        self.assertEqual([w.table for w in p.writes], ["recurring"])

    def test_first_date_only_in_the_future(self):
        p = plan(file(rule(anchor_date=TODAY)), db(), TODAY, NOW, ids())
        self.assertEqual(p.errors, ["rules[recurring:tk].anchor_date: первая дата — только будущая"])

    def test_an_expense_only_from_balance(self):
        p = plan(file(rule(account="Revolut · Подушка")), db(), TODAY, NOW, ids())
        self.assertEqual(p.errors, ["rules[recurring:tk].account: расход — только со счёта «Баланса»"])

    def test_a_link_must_be_a_date_of_the_rule(self):
        p = plan(file(rule(link=[{"ref": "source:budget:D4", "occurrence": "2026-12-15"}])), db(tx("d4", source_id="budget:D4")), TODAY, NOW, ids())
        self.assertIn("rules[recurring:tk].link[0].occurrence: не дата этого правила", p.errors)

    def test_one_row_one_action(self):
        f = file(rule(link=[{"ref": "source:budget:D4", "occurrence": "2026-12-14"}]), cancel=["source:budget:D4"])
        p = plan(f, db(tx("d4", source_id="budget:D4")), TODAY, NOW, ids())
        self.assertTrue(any("одно действие на строку" in e for e in p.errors))

    def test_a_different_sum_is_a_warning_the_row_keeps_its_own(self):
        p = plan(file(rule(link=[{"ref": "id:d4", "occurrence": "2026-12-14"}])), db(tx("d4", amount_eur=144.91)), TODAY, NOW, ids())
        self.assertEqual(p.errors, [])
        self.assertEqual(len(p.warnings), 1)

    def test_a_second_run_writes_nothing(self):
        stored = {"id": "r1", "source_id": "recurring:tk", "title": "TK", "amount_eur": 141.16, "kind": "expense", "grp": "Обязательное", "account_id": "spark",
                  "to_account_id": None, "envelope_id": None, "freq": "monthly", "interval_n": 1, "anchor_date": "2026-12-14", "end_date": None, "active": True, "note": None}
        base = db(tx("d4", source_id="budget:D4", recurring_id="r1", occurrence_date="2026-12-14"),
                  tx("n5", source_id="budget:N5", title="Rundfunk", cancelled_at=NOW), recurring=[stored])
        f = file(rule(link=[{"ref": "source:budget:D4", "occurrence": "2026-12-14"}]), cancel=["source:budget:N5"])
        p = plan(f, base, TODAY, NOW, ids())
        self.assertEqual(p.errors, [])
        self.assertEqual(p.writes, [])
        self.assertEqual((p.counts["rules_known"], p.counts["link_known"], p.counts["cancel_known"]), (1, 1, 1))

    def test_a_stored_rule_that_differs_is_not_overwritten(self):
        stored = {"id": "r1", "source_id": "recurring:tk", "title": "TK", "amount_eur": 150, "kind": "expense", "grp": "Обязательное", "account_id": "spark",
                  "to_account_id": None, "envelope_id": None, "freq": "monthly", "interval_n": 1, "anchor_date": "2026-12-14", "end_date": None, "active": True, "note": None}
        p = plan(file(rule()), db(recurring=[stored]), TODAY, NOW, ids())
        self.assertEqual(len(p.errors), 1)
        self.assertIn("amount_eur", p.errors[0])

    def test_income_gets_its_group(self):
        p = plan(file(rule(key="recurring:salary", title="Зарплата", kind="income", grp=None, anchor_date="2026-11-27")), db(), TODAY, NOW, ids())
        self.assertEqual(p.errors, [])
        self.assertEqual(p.writes[0].rows[0]["grp"], "Доход")

    def test_the_report_has_no_titles_or_sums(self):
        p = plan(file(rule(link=[{"ref": "source:budget:D4", "occurrence": "2026-12-14"}])), db(tx("d4", source_id="budget:D4")), TODAY, NOW, ids())
        text = "\n".join(report(p, applied=False))
        self.assertNotIn("TK", text)
        self.assertNotIn("141", text)

    def test_preview_applies_the_writes_to_a_copy(self):
        backup = {"tables": {"recurring": [], "transactions": [tx("d4", source_id="budget:D4")]}}
        before = copy.deepcopy(backup)
        p = plan(file(rule(link=[{"ref": "source:budget:D4", "occurrence": "2026-12-14"}])), db(tx("d4", source_id="budget:D4")), TODAY, NOW, ids())
        out = preview(backup, "u1", p.writes, NOW)
        self.assertEqual(backup, before)
        self.assertEqual(out["tables"]["recurring"][0]["amount_eur"], 141.16)
        self.assertEqual(out["tables"]["transactions"][0]["recurring_id"], "r1")


if __name__ == "__main__":
    unittest.main()
