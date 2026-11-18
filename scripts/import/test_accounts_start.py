import copy
import io
import json
import unittest
from contextlib import redirect_stdout

from accounts_start import START, Db, apply, plan, report

NOW = "2026-11-19T10:00:00+00:00"
NAMES = [
    ("main", "Revolut · Основной", "balance"),
    ("month", "Revolut · На месяц", "balance"),
    ("spark", "Sparkasse", "balance"),
    ("cash", "Наличные", "balance"),
    ("cushion", "Revolut · Подушка", "cushion"),
    ("kz", "Казахстанская карта", "cushion"),
    ("dep", "Revolut · Депозит", "separate"),
    ("env", "Revolut · Конверты", "separate"),
    ("trips", "Revolut · Поездки", "separate"),
]


def tx(id, **kw):
    base = {"id": id, "source_id": None, "date": "2026-11-20", "kind": "expense", "entry_kind": "one_off", "amount_eur": 10.0, "planned_amount_eur": None,
            "is_planned": False, "confirmed_at": None, "cancelled_at": None, "account_id": None, "to_account_id": None, "envelope_id": None,
            "debt_id": None, "grp": "Обязательное", "category": None}
    return {**base, **kw}


def db():
    return Db(
        accounts=[{"id": i, "name": n, "grp": g, "archived": False, "source_id": f"acct:{i}"} for i, n, g in NAMES],
        envelopes=[
            {"id": "e10", "source_id": "budget:env:E10", "name": "Подушка", "type": "goal", "archived": False, "account_id": None},
            {"id": "e11", "source_id": "budget:env:E11", "name": "Казахстан", "type": "goal", "archived": False, "account_id": None},
            {"id": "e12", "source_id": "budget:env:E12", "name": "Январь", "type": "goal", "archived": False, "account_id": None},
            {"id": "e7", "source_id": "budget:env:E7", "name": "Поездка", "type": "envelope", "archived": False, "account_id": None},
            {"id": "e1", "source_id": "budget:env:E1", "name": "Подарки", "type": "envelope", "archived": False, "account_id": None},
            {"id": "old", "source_id": "budget:env:E0", "name": "Старый", "type": "envelope", "archived": True, "account_id": None},
        ],
        debts=[
            {"id": "l1", "source_id": "budget:debt:L1", "status": "open", "account_id": None},
            {"id": "l4", "source_id": "budget:debt:L4", "status": "open", "account_id": None},
        ],
        transactions=[
            tx("t-open", date="2026-10-13", kind="opening", amount_eur=1000.0, grp=None),
            tx("n27", source_id="budget:N27", date="2026-11-09", entry_kind="week_total", amount_eur=41.17, grp="Жизнь"),
            tx("n15", source_id="budget:N15", date="2026-11-12", entry_kind="week_budget", amount_eur=3.0, is_planned=True, confirmed_at="x", grp="Жизнь"),
            tx("n16", source_id="budget:N16", date="2026-11-16", entry_kind="week_budget", amount_eur=25.0, is_planned=True, grp="Жизнь"),
            tx("d13", source_id="budget:D13", date="2026-12-07", entry_kind="week_budget", amount_eur=90.0, is_planned=True, grp="Жизнь"),
            tx("q", date="2026-11-13", amount_eur=5.2, grp="Жизнь", category="Продукты", account_id="main"),
            tx("n12", source_id="budget:N12", date="2026-11-15", amount_eur=40.0, is_planned=True, account_id="spark"),
            tx("n24", source_id="budget:N24", date="2026-11-30", amount_eur=100.0, is_planned=True, account_id="main", debt_id="l1", grp="Долги"),
            tx("n26", source_id="budget:N26", date="2026-11-30", kind="transfer", amount_eur=55.0, is_planned=True, account_id="main", debt_id="l4", grp="Долги"),
            tx("d18", source_id="budget:D18", date="2026-12-30", kind="transfer", amount_eur=45.0, is_planned=True, account_id="main", debt_id="l4", grp="Долги"),
            tx("trip", source_id="budget:D20", date="2026-12-05", amount_eur=80.0, is_planned=True, account_id="main", envelope_id="e7", grp="Поездки и события"),
            tx("inc", source_id="budget:N30", date="2026-11-27", kind="income", amount_eur=900.0, is_planned=True, account_id="spark", grp="Доход"),
        ],
    )


def good():
    """A file that answers everything the state above asks for."""
    return {
        "format": "life-hub-accounts-start",
        "version": 1,
        "start_date": START,
        "balances": {n: "0.00" for _, n, _ in NAMES} | {"Revolut · Основной": "312.40", "Sparkasse": "-12.50", "Revolut · Подушка": "200.00", "Казахстанская карта": "60.00", "Revolut · Депозит": "100.00", "Revolut · Поездки": "165.00"},
        "goal_balances": {"budget:env:E10": "150.00", "budget:env:E12": "50.00"},
        "envelopes": {
            "budget:env:E10": {"account": "Revolut · Подушка"},
            "budget:env:E12": {"account": "Revolut · Подушка"},
            "budget:env:E11": {"account": "Казахстанская карта", "goal_eur": "155.61"},
            "budget:env:E7": {"account": "Revolut · Поездки"},
            "budget:env:E1": {"account": "Revolut · Основной", "planned_eur": "221.80"},
        },
        "debts": {"budget:debt:L1": {"account": "Revolut · Депозит"}, "budget:debt:L4": {"amount_eur": "130.00"}},
        "operations": [
            {"ref": "source:budget:N27", "action": "update", "amount_eur": "90.97"},
            {"ref": "source:budget:N15", "action": "cancel"},
            {"ref": "source:budget:N12", "action": "confirm", "amount_eur": "38.00"},
            {"ref": "source:budget:N24", "action": "update", "account": "Revolut · Основной"},
            {"key": "sverka:2026-11-18:001", "action": "insert", "date": "2026-11-30", "kind": "transfer", "amount_eur": "100.00", "title": "Депозит на основной",
             "account": "Revolut · Депозит", "to_account": "Revolut · Основной", "grp": "Долги", "status": "plan"},
            {"ref": "source:budget:N26", "action": "update", "to_account": "Revolut · Подушка"},
            {"ref": "source:budget:D18", "action": "update", "to_account": "Revolut · Подушка"},
            {"key": "sverka:2026-11-18:002", "action": "insert", "date": "2026-12-05", "kind": "transfer", "amount_eur": "80.00", "title": "Из конверта",
             "account": "Revolut · Поездки", "to_account": "Revolut · Основной", "status": "plan"},
            {"key": "sverka:2026-11-18:003", "action": "insert", "date": "2026-11-14", "kind": "expense", "amount_eur": "6.60", "title": "Кофе",
             "account": "Revolut · Основной", "grp": "Жизнь", "category": "Кофейни и перекусы", "status": "fact"},
        ],
    }


def errors(file, state=None):
    return plan(file, state or db(), NOW).errors


class GoodFileTest(unittest.TestCase):
    def setUp(self):
        self.p = plan(good(), db(), NOW)

    def test_no_errors_no_warnings(self):
        self.assertEqual(self.p.errors, [])
        self.assertEqual(self.p.warnings, [])

    def test_counts(self):
        c = self.p.counts
        self.assertEqual((c["accounts"], c["openings"], c["zero"], c["below_zero"], c["goal_shares"]), (9, 6, 3, 1, 2))
        self.assertEqual((c["envelopes"], c["debts"], c["update"], c["confirm"], c["cancel"], c["insert"], c["pending_left"]), (5, 2, 4, 1, 1, 3, 0))

    def test_order_patches_then_inserts_then_the_start(self):
        order = [(w.table, w.action) for w in self.p.writes]
        self.assertEqual(order[:7], [("envelopes", "patch")] * 5 + [("debts", "patch")] * 2)
        self.assertEqual(order[-4:], [("transactions", "insert"), ("transactions", "upsert"), ("actual_balances", "upsert"), ("actual_balances", "upsert")])

    def test_week_row_and_confirm_bodies(self):
        bodies = {w.id: w.body for w in self.p.writes if w.action == "patch" and w.table == "transactions"}
        self.assertEqual(bodies["n27"], {"amount_eur": "90.97"})
        self.assertEqual(bodies["n15"], {"cancelled_at": NOW})
        self.assertEqual(bodies["n12"], {"amount_eur": "38.00", "planned_amount_eur": 40.0, "confirmed_at": NOW})
        self.assertEqual(bodies["n26"], {"to_account_id": "cushion"})

    def test_start_rows(self):
        openings = next(w for w in self.p.writes if w.action == "upsert" and w.table == "transactions").rows
        self.assertEqual({r["account_id"]: r["amount_eur"] for r in openings}, {"main": "312.40", "spark": "-12.50", "cushion": "200.00", "kz": "60.00", "dep": "100.00", "trips": "165.00"})
        self.assertTrue(all(r["kind"] == "opening" and r["date"] == START and r["source_id"].startswith(f"start:{START}:") for r in openings))
        balances, shares = [w.rows for w in self.p.writes if w.table == "actual_balances"]
        self.assertEqual(len(balances), 9)  # zero balances too: the reconciliation starts at the start
        self.assertTrue(all(r["origin"] == "start" and r["account"] for r in balances))
        self.assertEqual({r["envelope_id"]: (r["account"], r["amount_eur"]) for r in shares}, {"e10": ("E10", "150.00"), "e12": ("E12", "50.00")})
        self.assertTrue(all("account_id" not in r for r in shares))

    def test_insert_rows_have_one_shape(self):
        rows = next(w for w in self.p.writes if w.action == "insert").rows
        self.assertEqual(len({tuple(sorted(r)) for r in rows}), 1)  # PostgREST: one set of keys per request
        coffee = rows[2]
        self.assertEqual((coffee["is_planned"], coffee["source_id"], coffee["category"]), (False, "sverka:2026-11-18:003", "Кофейни и перекусы"))

    def test_report_has_counts_but_no_titles_or_sums(self):
        text = "\n".join(report(self.p, applied=False))
        self.assertIn("ничего не записано", text)
        self.assertIn("новых 3", text)
        for secret in ("Депозит на основной", "Кофе", "90.97", "312.40", "Подарки"):
            self.assertNotIn(secret, text)


class BalancesTest(unittest.TestCase):
    def test_all_accounts_exact_names(self):
        f = good()
        del f["balances"]["Наличные"]
        f["balances"]["Revolut"] = "1.00"
        self.assertEqual(errors(f), ["balances[Revolut]: нет такого счёта (имя — точно из таблицы счетов)", "balances[Наличные]: нет остатка — нужны все счета"])

    def test_below_zero_only_on_balance(self):
        f = good()
        f["balances"]["Revolut · Подушка"] = "-1.00"
        self.assertIn("balances[Revolut · Подушка]: минус — только у счетов «Баланса»", errors(f))

    def test_amount_as_string(self):
        f = good()
        f["balances"]["Наличные"] = 12.5
        self.assertIn("balances[Наличные]: сумма — строкой с точкой, например \"12.50\"", errors(f))

    def test_format_header(self):
        self.assertEqual(errors({"format": "x"}), ["format: не «life-hub-accounts-start»"])
        f = good() | {"start_date": "2026-11-19"}
        self.assertIn("start_date: ожидается 2026-11-18", errors(f))


class GoalsAndEnvelopesTest(unittest.TestCase):
    def test_share_required_when_an_account_holds_several_goals(self):
        f = good()
        del f["goal_balances"]["budget:env:E12"]
        self.assertEqual(errors(f), ["goal_balances[budget:env:E12]: на счёте несколько целей — доля обязательна"])

    def test_no_share_for_a_goal_alone_on_its_account(self):
        f = good()
        f["goal_balances"]["budget:env:E11"] = "60.00"
        self.assertEqual(errors(f), ["goal_balances[budget:env:E11]: цель одна на своём счёте — «сейчас» = остаток счёта, долю не задаём"])

    def test_shares_not_above_the_account(self):
        f = good()
        f["goal_balances"]["budget:env:E10"] = "160.00"
        self.assertEqual(errors(f), ["goal_balances · Revolut · Подушка: доли целей больше остатка счёта"])

    def test_goal_only_on_cushion(self):
        f = good()
        f["envelopes"]["budget:env:E11"]["account"] = "Revolut · Основной"
        self.assertIn("envelopes[budget:env:E11].account: цель — только на счёте «Подушки»", errors(f))

    def test_every_active_one_has_an_account(self):
        f = good()
        del f["envelopes"]["budget:env:E1"]
        self.assertEqual(errors(f), ["envelopes[budget:env:E1]: у конверта нет счёта"])

    def test_fields_by_type(self):
        f = good()
        f["envelopes"]["budget:env:E7"]["goal_eur"] = "10.00"
        f["envelopes"]["budget:env:E11"]["planned_eur"] = "10.00"
        self.assertEqual(
            errors(f),
            ["envelopes[budget:env:E11].planned_eur: поле не из списка для цели", "envelopes[budget:env:E7].goal_eur: поле не из списка для конверта"],
        )

    def test_debts(self):
        f = good()
        f["debts"]["budget:debt:L4"] = {"amount_eur": "0.00", "who": "x"}
        f["debts"]["budget:debt:L9"] = {"status": "closed"}
        self.assertEqual(
            errors(f),
            ["debts[budget:debt:L4].amount_eur: сумма > 0", "debts[budget:debt:L4].who: поле не из списка для долга", "debts[budget:debt:L9]: не найден"],
        )


class OperationsTest(unittest.TestCase):
    def ops(self, *extra, drop=()):
        f = good()
        f["operations"] = [o for o in f["operations"] if o.get("ref") not in drop and o.get("key") not in drop] + list(extra)
        return f

    def test_transfer_after_the_start_needs_both_accounts(self):
        # N26 without «куда» (as the old data has it) is caught even when the file does not touch it
        self.assertEqual(errors(self.ops(drop=("source:budget:N26",))), ["id:n26 (budget:N26): перевод после 18.11 — нужны оба счёта, откуда и куда"])

    def test_expense_after_the_start_only_from_balance(self):
        f = self.ops({"ref": "source:budget:N30", "action": "update", "kind": "expense", "account": "Revolut · Подушка", "grp": "Обязательное"})
        self.assertEqual(errors(f), ["operations[9]: трата после 18.11 — только со счёта «Баланса» (сначала перевод)"])

    def test_week_rows_need_no_account_and_keep_their_date(self):
        # N16 (week budget of the start week, 16.11) and D13 are «Баланс» without an account; N16 is not «unanswered»
        self.assertEqual(plan(good(), db(), NOW).counts["pending_left"], 0)

    def test_week_row_changes_only_sum_date_note(self):
        f = self.ops({"ref": "source:budget:D13", "action": "update", "account": "Revolut · Основной"})
        self.assertEqual(errors(f), ["operations[9].account: у строки недели меняются только сумма, дата и заметка"])

    def test_week_budget_is_never_confirmed(self):
        self.assertEqual(errors(self.ops({"ref": "source:budget:D13", "action": "confirm"})), ["operations[9]: бюджет недели не подтверждается (правило 26)"])

    def test_unanswered_planned_up_to_the_start(self):
        self.assertEqual(errors(self.ops(drop=("source:budget:N12",))), ["id:n12 (budget:N12): неотвеченная плановая с датой ≤ 18.11 — confirm, перенос позже 18.11 или cancel"])
        moved = self.ops({"ref": "source:budget:N12", "action": "update", "date": "2026-11-21"}, drop=("source:budget:N12",))
        self.assertEqual(errors(moved), [])

    def test_one_action_per_row_and_unique_keys(self):
        f = self.ops({"ref": "source:budget:N27", "action": "cancel"}, {"key": "sverka:2026-11-18:001", "action": "insert"})
        self.assertEqual(errors(f), ["operations[9].ref: эта операция уже есть выше в файле — одно действие на строку", "operations[10].key: ключ уже есть выше в файле"])

    def test_unknown_ref_and_insert_fields(self):
        f = self.ops({"ref": "source:budget:N99", "action": "cancel"}, {"key": "sverka:x", "action": "insert", "date": "2026-12-01", "kind": "expense", "amount_eur": "5", "title": " ", "status": "plan"})
        self.assertEqual(
            errors(f),
            [
                "operations[9].ref: операция не найдена (source:<source_id> или id:<uuid>)",
                "operations[10].account: обязательно для новой операции",
                "operations[10].grp: обязательно для новой операции",
                "operations[10].title: пустое название",
            ],
        )

    def test_shape_of_a_row(self):
        f = self.ops(
            {"key": "sverka:y", "action": "insert", "date": "2026-12-01", "kind": "income", "amount_eur": "5.00", "title": "x", "account": "Sparkasse",
             "to_account": "Наличные", "envelope": "budget:env:E7", "status": "plan"},
        )
        self.assertEqual(errors(f), ["operations[9].to_account: куда — только у перевода", "operations[9].envelope: конверт — только у траты"])

    def test_envelope_spending_off_balance_warns_without_a_transfer(self):
        p = plan(self.ops(drop=("sverka:2026-11-18:002",)), db(), NOW)
        self.assertEqual(p.errors, [])
        self.assertEqual(p.warnings, ["id:trip (budget:D20): трата из конверта не на «Балансе» без планового перевода под неё (та же дата и сумма)"])

    def test_fact_never_becomes_plan_and_cancelled_is_not_confirmed(self):
        f = self.ops({"ref": "source:budget:N27", "action": "update", "status": "plan"}, drop=("source:budget:N27",))
        self.assertIn("operations[8].status: факт не может стать планом", errors(f))
        state = db()
        next(t for t in state.transactions if t["id"] == "inc")["cancelled_at"] = "x"
        self.assertEqual(errors(self.ops({"ref": "source:budget:N30", "action": "confirm"}), state), ["operations[9]: операция убрана из плана — подтвердить нельзя"])


class RerunTest(unittest.TestCase):
    def test_second_run_changes_nothing_new(self):
        state = db()
        # what the first run left: confirmed N12, cancelled N15, the inserted keys, the start rows
        for t in state.transactions:
            if t["id"] == "n12":
                t.update(confirmed_at="2026-11-19T09:00:00+00:00", planned_amount_eur=40.0, amount_eur=38.0)
            if t["id"] == "n15":
                t["cancelled_at"] = "2026-11-19T09:00:00+00:00"
        state.transactions += [tx(f"k{i}", source_id=f"sverka:2026-11-18:00{i}") for i in (1, 2, 3)]
        p = plan(good(), state, NOW)
        bodies = {w.id: w.body for w in p.writes if w.action == "patch" and w.table == "transactions"}
        self.assertNotIn("n15", bodies)  # already out of the plan
        self.assertEqual(bodies["n12"], {"amount_eur": "38.00"})  # the first confirmation and its planned sum stay
        self.assertEqual(p.counts["insert_known"], 3)

    def test_zero_on_a_rerun_takes_the_earlier_start_row_out(self):
        state = db()
        state.transactions.append(tx("o-cash", source_id=f"start:{START}:acct:cash", date=START, kind="opening", amount_eur=20.0, account_id="cash"))
        p = plan(good(), state, NOW)
        self.assertIn(("o-cash", {"cancelled_at": NOW}), [(w.id, w.body) for w in p.writes if w.action == "patch"])


class ApplyTest(unittest.TestCase):
    class FakeRest:
        def __init__(self):
            self.calls = []

        def patch(self, table, filters, body):
            self.calls.append(("patch", table, filters, body))

        def insert(self, table, rows, on_conflict, *, ignore_duplicates=True, returning=None):
            self.calls.append(("insert", table, on_conflict, ignore_duplicates, rows))
            return []

        def upsert(self, table, rows, on_conflict="user_id,source_id"):
            self.calls.append(("upsert", table, on_conflict, rows))

    def test_every_write_is_the_users_and_inserts_keep_existing_keys(self):
        rest = self.FakeRest()
        done = apply(rest, "uid", plan(good(), db(), NOW).writes)
        patches = [c for c in rest.calls if c[0] == "patch"]
        self.assertTrue(all(c[2]["user_id"] == "eq.uid" and c[2]["id"].startswith("eq.") for c in patches))
        insert = next(c for c in rest.calls if c[0] == "insert")
        self.assertEqual((insert[2], insert[3]), ("user_id,source_id", True))
        self.assertTrue(all(r["user_id"] == "uid" for c in rest.calls if c[0] in ("insert", "upsert") for r in c[-1]))
        self.assertEqual(done["transactions: старт"], 6)

    def test_dry_run_and_errors_write_nothing(self):
        from unittest import mock

        import accounts_start

        f = good()
        f["balances"]["Revolut · Подушка"] = "-1.00"
        rest = self.FakeRest()
        with mock.patch.object(accounts_start, "read_db", return_value=db()), mock.patch("supabase_rest.load_env", return_value={}), mock.patch(
            "supabase_rest.config_from_env", return_value=type("C", (), {"email": "a@b", "url": "u", "secret_key": "s"})()
        ), mock.patch("supabase_rest.SupabaseRest") as Rest:
            Rest.return_value = rest
            Rest.return_value.find_user_id = lambda e: "uid"
            for argv_file, mode in ((f, "--apply"), (good(), "--dry-run")):
                path = self._tmp(argv_file)
                with redirect_stdout(io.StringIO()):
                    code = accounts_start.main([mode, path])
                self.assertEqual(code, 1 if mode == "--apply" else 0)
        self.assertEqual(rest.calls, [])

    def _tmp(self, data):
        import tempfile

        fd = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        json.dump(copy.deepcopy(data), fd, ensure_ascii=False)
        fd.close()
        self.addCleanup(lambda: __import__("os").unlink(fd.name))
        return fd.name


if __name__ == "__main__":
    unittest.main()
