"""docs/EXCEL_FORMAT.md, strictly: a synthetic workbook (no real data) through src_budget."""
import datetime as dt
import unittest

import openpyxl

import src_budget
from model import Batch

D = dt.date


def workbook(**override):
    sheets = {
        "Статьи": [
            ["ID", "Дата", "Группа", "Статья", "Сумма", "Знак", "Статус", "Вид", "Неделя", "Счёт", "Конверт", "Долг", "Заметка"],
            ["S0", D(2026, 10, 13), "Старт", "Старт", 1000, 1, "факт", "разовая", None, "Sparkasse", None, None, None],
            ["N8", D(2026, 11, 4), "Жизнь", "Еда в аэропорту", 33.45, -1, "факт", "разовая", None, "Revolut", "E1", None, None],
            ["N16", D(2026, 11, 16), "Жизнь", "Неделя 6", 25, -1, "план", "бюджет недели", 6, None, None, None, None],
            ["N14", D(2026, 11, 2), "Жизнь", "Неделя 4", 68, -1, "факт", "итог недели", 4, "Наличные", None, None, None],
            ["N30", D(2026, 11, 30), "Долги", "Депозит жильцу", 100, -1, "план", "разовая", None, "Revolut", None, "L1", None],
            ["N31", D(2026, 11, 5), "Жизнь", "Перевод в Подушку", 60, 0, "факт", "разовая", None, "Revolut", None, None, None],
            [None, None, None, "сноска", None, None, None, None, None, None, None, None, None],
        ],
        "Недели": [
            ["№", "Начало", "Конец", "Где", "Продукты"],
            [4, D(2026, 11, 2), D(2026, 11, 8), "у сестры", 30],
            [6, D(2026, 11, 16), D(2026, 11, 22), None, 25],
        ],
        "Конверты": [
            ["ID", "Название", "Тип", "Заложено", "Потрачено", "Осталось", "Когда", "Цель", "Срок", "Сейчас на счету", "Заметка"],
            ["E1", "Еда в аэропортах", "конверт", 50, 33.45, 16.55, None, None, None, None, None],
            ["E5", "Подушка", "цель", 0, 0, 0, None, 1000, D(2027, 3, 31), 390, None],
        ],
        "Долги": [
            ["ID", "Кто", "Направление", "Сумма", "Возвращено", "Остаток", "Срок", "Статус", "Копилка", "Заметка"],
            ["L1", "Жилец", "я должна", 100, 0, 100, D(2026, 11, 30), "открыт", None, None],
            ["L2", "Подушка", "заём из копилки", 150, 50, 100, None, "открыт", "E5", None],
        ],
        "Остатки": [["Дата", "Счёт", "Остаток"], [D(2026, 11, 15), "Revolut", 742.1], [D(2026, 11, 15), "E5", 390]],
        "Правила": [["№", "Правило", "Подробно"], [1, "На руке 50 €", "Наличные — не больше 50 €"]],
    }
    sheets.update(override)
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, data in sheets.items():
        ws = wb.create_sheet(name)
        for row in data:
            ws.append(row)
    return wb


def run(wb):
    b = Batch(today=D(2026, 11, 12))
    src_budget.build(wb, b)
    return b


class BudgetFormatTest(unittest.TestCase):
    def test_a_correct_file(self):
        wb = workbook()
        self.assertEqual(src_budget.structure(wb), [])
        b = run(wb)
        self.assertEqual(b.fatal, [])
        tx = {r["source_id"]: r for r in b.rows["transactions"]}
        self.assertEqual(tx["budget:S0"]["kind"], "opening")
        self.assertEqual((tx["budget:N8"]["account"], tx["budget:N8"]["envelope_key"]), ("Revolut", "budget:env:E1"))
        self.assertEqual((tx["budget:N16"]["entry_kind"], tx["budget:N16"]["is_planned"], tx["budget:N16"]["week_no"]), ("week_budget", True, 6))
        self.assertEqual((tx["budget:N14"]["entry_kind"], tx["budget:N14"]["is_planned"]), ("week_total", False))
        self.assertEqual(tx["budget:N30"]["debt_key"], "budget:debt:L1")
        self.assertEqual(tx["budget:N31"]["kind"], "transfer")
        envs = {r["source_id"]: r for r in b.rows["envelopes"]}
        self.assertEqual((envs["budget:env:E5"]["type"], envs["budget:env:E5"]["goal_eur"], envs["budget:env:E5"]["goal_date"]), ("goal", 1000, "2027-03-31"))
        self.assertNotIn("current", envs["budget:env:E5"])  # «Сейчас на счету» is never read
        debts = {r["source_id"]: r for r in b.rows["debts"]}
        self.assertEqual((debts["budget:debt:L2"]["direction"], debts["budget:debt:L2"]["pot_key"]), ("from_pot", "budget:env:E5"))
        bal = {r["source_id"]: r for r in b.rows["actual_balances"]}
        self.assertEqual(bal["budget:bal:2026-11-15:E5"]["envelope_key"], "budget:env:E5")
        self.assertEqual(len(b.rows["week_limits"]), 2)
        self.assertEqual(b.issues, [])  # «Потрачено» of E1 matches the operations

    def test_missing_column_stops(self):
        wb = workbook(**{"Статьи": [["ID", "Дата", "Группа", "Статья", "Сумма", "Знак", "Вид"]]})
        self.assertIn("бюджет · Статьи: нет обязательной колонки «Статус» в строке 1", src_budget.structure(wb))

    def test_values_outside_the_lists_and_rule_breaks(self):
        head = ["ID", "Дата", "Группа", "Статья", "Сумма", "Знак", "Статус", "Вид", "Неделя", "Счёт", "Конверт", "Долг"]
        bad = [
            head,
            ["A1", D(2026, 11, 1), "Жизнь", "x", 10, -1, "почти", "разовая", None, None, None, None],
            ["A2", D(2026, 11, 1), "Жизнь", "x", 10, -1, "факт", "бюджет недели", 4, None, None, None],
            ["A3", D(2026, 11, 1), "Жизнь", "x", 10, -1, "факт", "итог недели", None, None, None, None],
            ["A4", D(2026, 11, 1), "Жизнь", "x", 10, 2, "факт", "разовая", None, "Bank", "E9", "L9"],
            ["A4", D(2026, 11, 1), "Жизнь", "x", 10, -1, "факт", "разовая", None, None, None, None],
        ]
        b = run(workbook(**{"Статьи": bad}))
        text = "\n".join(b.fatal)
        self.assertIn("Статьи, строка 2, «Статус»: «почти» не из списка", text)
        self.assertIn("Статьи, строка 3, «Вид»: «бюджет недели» бывает только со статусом «план»", text)
        self.assertIn("Статьи, строка 4, «Неделя»: для «бюджет недели» и «итог недели» нужен номер недели", text)
        self.assertIn("Статьи, строка 5, «Знак»: только +1, -1 или 0", text)
        self.assertIn("Статьи, строка 5, «Счёт»: «Bank» не из списка", text)
        self.assertIn("Статьи, строка 5, «Конверт»: «E9» — нет такого ID", text)
        self.assertIn("Статьи, строка 5, «Долг»: «L9» — нет такого ID", text)
        self.assertIn("Статьи, строка 6, «ID»: «A4» уже был выше", text)

    def test_debt_from_pot_needs_a_goal_and_balances_need_known_accounts(self):
        b = run(
            workbook(
                **{
                    "Долги": [["ID", "Кто", "Направление", "Сумма", "Статус", "Копилка"], ["L2", "Подушка", "заём из копилки", 150, "открыт", "E1"]],
                    "Остатки": [["Дата", "Счёт", "Остаток"], [D(2026, 11, 15), "Bank", 1], [D(2026, 11, 15), "Revolut", 1], [D(2026, 11, 15), "Revolut", 2]],
                }
            )
        )
        text = "\n".join(b.fatal)
        self.assertIn("Долги, строка 2, «Копилка»: «E1» — нет такой цели", text)
        self.assertIn("Остатки, строка 2, «Счёт»: «Bank» — не счёт", text)
        self.assertIn("Остатки, строка 4, «Счёт»: 15.11 · Revolut уже есть выше", text)

    def test_week_must_start_on_monday_and_spent_mismatch_is_reported(self):
        b = run(
            workbook(
                **{
                    "Недели": [["№", "Начало", "Конец"], [4, D(2026, 11, 3), D(2026, 11, 9)]],
                    "Конверты": [["ID", "Название", "Тип", "Заложено", "Потрачено"], ["E1", "Еда", "конверт", 50, 10], ["E5", "Подушка", "цель", 0, 0]],
                }
            )
        )
        self.assertTrue(any("Недели, строка 2, «Начало»: 03.11 — не понедельник" in f for f in b.fatal))
        self.assertTrue(any("«Цель»: у цели нужна сумма > 0" in f for f in b.fatal))


if __name__ == "__main__":
    unittest.main()
