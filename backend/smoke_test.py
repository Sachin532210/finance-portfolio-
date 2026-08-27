"""
End-to-end smoke test against a running backend.

    python smoke_test.py            # defaults to http://127.0.0.1:8010

Exercises every major user flow: signup, onboarding, demo data, dashboard,
expenses, budgets, salary planner, savings, goals, investments, debt,
purchase decisions, the AI coach, notifications and reports.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timedelta

import httpx

BASE = os.getenv("API_BASE", "http://127.0.0.1:8010")
API = f"{BASE}/api/v1"

passed, failed = 0, []


def check(label: str, condition: bool, detail: str = "") -> None:
    global passed
    if condition:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed.append(f"{label} :: {detail}")
        print(f"  FAIL  {label}  {detail}")


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def main() -> int:
    client = httpx.Client(base_url=API, timeout=60.0, follow_redirects=True)
    email = f"smoke-{uuid.uuid4().hex[:10]}@example.com"
    password = "TestPass123!"
    now = datetime.utcnow()

    # ---------------------------------------------------------------- health
    section("Health")
    r = httpx.get(f"{BASE}/health", timeout=20)
    check("health endpoint", r.status_code == 200, r.text[:200])
    check("database connected", r.json()["database"]["connected"], r.text[:200])

    # ------------------------------------------------------------------ auth
    section("Authentication")
    r = client.post("/auth/signup", json={"name": "Smoke Test", "email": email, "password": password})
    check("signup", r.status_code == 201, r.text[:300])
    if r.status_code != 201:
        return 1
    user_id = r.json()["user"]["id"]

    r = client.post("/auth/signup", json={"name": "Dup", "email": email, "password": password})
    check("duplicate email rejected", r.status_code == 409, r.text[:200])

    r = client.post("/auth/signup", json={"name": "Weak", "email": f"w{email}", "password": "short"})
    check("weak password rejected", r.status_code == 422, r.text[:200])

    r = client.get("/auth/me")
    check("session cookie authenticates", r.status_code == 200, r.text[:200])

    r = client.post("/auth/login", json={"email": email, "password": "WrongPass123"})
    check("wrong password rejected", r.status_code == 401, r.text[:200])

    r = client.post("/auth/login", json={"email": email, "password": password})
    check("login", r.status_code == 200, r.text[:200])

    # Another user must not see this user's data.
    other = httpx.Client(base_url=API, timeout=60.0)
    other_email = f"other-{uuid.uuid4().hex[:8]}@example.com"
    other.post("/auth/signup", json={"name": "Other", "email": other_email, "password": password})

    r = httpx.get(f"{API}/dashboard", timeout=20)  # no cookie at all
    check("unauthenticated request blocked", r.status_code == 401, r.text[:200])

    # ------------------------------------------------------------ onboarding
    section("Onboarding")
    r = client.post(
        "/profile/onboarding",
        json={
            "monthly_salary": 25000,
            "salary_day": 1,
            "other_monthly_income": 1500,
            "employment_type": "SALARIED",
            "fixed_expenses": [
                {"category": "RENT", "description": "Room rent", "amount": 6000},
                {"category": "BILLS", "description": "WiFi", "amount": 800},
                {"category": "FAMILY", "description": "Family support", "amount": 2000},
            ],
            "bank_balance": 30000,
            "cash_balance": 2000,
            "emergency_fund": 25000,
            "debts": [
                {
                    "name": "Education loan",
                    "type": "EDUCATION_LOAN",
                    "principal": 120000,
                    "outstanding": 78000,
                    "emi": 1800,
                    "interest_rate": 9.5,
                    "remaining_months": 48,
                    "due_day": 5,
                }
            ],
            "emergency_fund_months": 6,
            "target_savings_rate": 20,
        },
    )
    check("onboarding saved", r.status_code == 200, r.text[:300])
    check("fixed expenses created", r.json().get("created_expenses") == 3, r.text[:200])

    # ------------------------------------------------------------- demo data
    section("Demo data")
    r = client.post("/demo/seed")
    check("demo seed", r.status_code == 200, r.text[:300])
    counts = r.json().get("counts", {})
    check("demo expenses created", counts.get("expenses", 0) > 20, str(counts))
    check("demo investments created", counts.get("investments", 0) == 6, str(counts))

    # ------------------------------------------------------------- dashboard
    section("Dashboard")
    r = client.get("/dashboard")
    check("dashboard loads", r.status_code == 200, r.text[:300])
    d = r.json()
    check("health score in range", 0 <= d["health_score"]["score"] <= 100, str(d["health_score"]["score"]))
    check("income present", d["income"]["monthly"] > 0, str(d["income"]))
    check("expenses present", d["spend"]["month_to_date"] > 0, str(d["spend"]["month_to_date"]))
    check("net worth computed", "net_worth" in d["net_worth"], "")
    check(
        "net worth = assets - liabilities",
        abs(d["net_worth"]["net_worth"] - (d["net_worth"]["total_assets"] - d["net_worth"]["total_liabilities"])) < 0.02,
        str(d["net_worth"]),
    )
    check("emergency fund sized", d["emergency"]["monthly_essentials"] > 0, str(d["emergency"]))
    check("history has 6 months", len(d["history"]) == 6, str(len(d["history"])))
    check("buying guide generated", len(d["buying_guide"]) > 0, "")
    check("insights generated", len(d["insights"]) > 0, "")

    # Savings rate must match savings / income.
    expected_rate = (
        round(max(d["savings"]["monthly_savings"], 0) / d["income"]["monthly"] * 100, 2)
        if d["income"]["monthly"]
        else 0
    )
    check(
        "savings rate matches formula",
        abs(d["savings"]["savings_rate"] - expected_rate) < 0.05,
        f"{d['savings']['savings_rate']} vs {expected_rate}",
    )

    # ---------------------------------------------------------------- expenses
    section("Expenses")
    r = client.post(
        "/expenses",
        json={
            "amount": 450,
            "category": "FOOD",
            "description": "Smoke test lunch",
            "payment_method": "UPI",
            "spent_at": now.isoformat(),
        },
    )
    check("create expense", r.status_code == 201, r.text[:300])
    expense_id = r.json()["id"]

    r = client.patch(f"/expenses/{expense_id}", json={"amount": 500, "notes": "updated"})
    check("update expense", r.status_code == 200 and r.json()["amount"] == 500, r.text[:200])

    r = client.get("/expenses", params={"month": now.month, "year": now.year, "page_size": 5})
    check("list expenses paginated", r.status_code == 200 and len(r.json()["items"]) == 5, r.text[:200])

    r = client.get("/expenses", params={"category": "FOOD"})
    check("filter by category", all(i["category"] == "FOOD" for i in r.json()["items"]), "")

    r = client.get("/expenses-stats/summary")
    stats = r.json()
    check("expense stats", r.status_code == 200 and stats["total"] > 0, r.text[:200])
    check("daily series length", len(stats["daily_series"]) >= 28, str(len(stats["daily_series"])))

    r = client.post("/expenses", json={"amount": -5, "category": "FOOD", "description": "bad", "spent_at": now.isoformat()})
    check("negative amount rejected", r.status_code == 422, r.text[:200])

    r = client.post("/expenses", json={"amount": 10, "category": "NOPE", "description": "bad", "spent_at": now.isoformat()})
    check("invalid category rejected", r.status_code == 422, r.text[:200])

    # Cross-user isolation
    r = other.get(f"/expenses/{expense_id}")
    check("other user cannot read expense", r.status_code == 404, r.text[:200])
    r = other.delete(f"/expenses/{expense_id}")
    check("other user cannot delete expense", r.status_code == 404, r.text[:200])

    r = client.delete(f"/expenses/{expense_id}")
    check("delete expense", r.status_code == 200, r.text[:200])

    # ---------------------------------------------------------------- budgets
    section("Budgets")
    r = client.put("/budgets", json={"category": "FOOD", "amount": 3500, "month": now.month, "year": now.year})
    check("upsert budget", r.status_code == 200 and r.json()["amount"] == 3500, r.text[:200])

    r = client.get("/budgets", params={"month": now.month, "year": now.year})
    b = r.json()
    check("budget list", r.status_code == 200 and len(b["budgets"]) > 0, r.text[:200])
    food = next((x for x in b["budgets"] if x["category"] == "FOOD"), None)
    check("budget has spend attached", food is not None and food["spent"] > 0, str(food))
    check(
        "remaining = budget - spent",
        food is not None and abs(food["remaining"] - (food["amount"] - food["spent"])) < 0.02,
        str(food),
    )
    check("status computed", food is not None and food["status"] in ("SAFE", "WARNING", "OVER"), str(food))

    # ---------------------------------------------------------- salary planner
    section("Salary planner")
    r = client.get("/salary-planner")
    check("planner loads", r.status_code == 200, r.text[:300])
    plan = r.json()["generated"]
    check("plan has income", plan["income"] > 0, str(plan["income"]))
    total = (
        plan["essentials"] + plan["family"] + plan["debt_payments"] + plan["emergency"]
        + plan["savings"] + plan["investments"] + plan["lifestyle"] + plan["buffer"]
    )
    check("allocation never exceeds income", total <= plan["income"] + 0.05, f"{total} vs {plan['income']}")
    check("plan explains itself", len(plan["rationale"]) >= 3, str(len(plan["rationale"])))

    r = client.put("/salary-planner", json={"lifestyle": 2500, "investments": 3500})
    check("save manual plan", r.status_code == 200, r.text[:200])
    r = client.get("/salary-planner")
    check("saved plan returned", r.json()["saved"] is not None and r.json()["saved"]["lifestyle"] == 2500, "")

    # ---------------------------------------------------------------- savings
    section("Savings")
    r = client.post(
        "/savings/goals",
        json={
            "name": "Smoke Goal",
            "category": "GADGET",
            "target_amount": 20000,
            "current_amount": 5000,
            "target_date": (now + timedelta(days=300)).isoformat(),
            "monthly_contribution": 1500,
        },
    )
    check("create savings goal", r.status_code == 201, r.text[:300])
    goal_id = r.json()["id"]

    r = client.post(f"/savings/goals/{goal_id}/contribute", json={"amount": 2000})
    check("contribute", r.status_code == 200 and r.json()["goal"]["current_amount"] == 7000, r.text[:200])

    r = client.post(f"/savings/goals/{goal_id}/withdraw", json={"amount": 99999})
    check("over-withdrawal rejected", r.status_code == 400, r.text[:200])

    r = client.get("/savings/goals")
    sg = r.json()
    check("savings list", r.status_code == 200 and len(sg["goals"]) > 0, r.text[:200])
    g = next(x for x in sg["goals"] if x["id"] == goal_id)
    check("progress pct correct", abs(g["progress_pct"] - 35.0) < 0.1, str(g["progress_pct"]))
    check("required monthly computed", g["required_monthly"] > 0, str(g["required_monthly"]))

    r = client.get("/savings/emergency-fund")
    ef = r.json()
    check("emergency fund endpoint", r.status_code == 200, r.text[:200])
    check("3-month figure", ef["min_recommended"] == round(ef["monthly_essentials"] * 3, 2), str(ef))
    check("6-month figure", ef["max_recommended"] == round(ef["monthly_essentials"] * 6, 2), str(ef))
    check("explanation present", len(ef["explanation"]) > 40, "")

    r = other.get(f"/savings/goals/{goal_id}/contributions")
    check("other user cannot read goal", r.status_code == 404, r.text[:200])

    # ------------------------------------------------------------------ goals
    section("Goals & future planner")
    r = client.get("/goals")
    gl = r.json()
    check("goals load", r.status_code == 200 and len(gl["goals"]) > 0, r.text[:200])
    check("grouped by horizon", set(gl["by_horizon"].keys()) == {"SHORT", "MEDIUM", "LONG"}, "")
    check(
        "status values valid",
        all(x["status"] in ("ON_TRACK", "SLIGHTLY_BEHIND", "BEHIND", "COMPLETE") for x in gl["goals"]),
        "",
    )

    r = client.post(
        "/future-plans/simulate",
        json={"name": "Test", "current_cost": 100000, "years_away": 5, "inflation_pct": 6, "expected_return_pct": 10},
    )
    proj = r.json()
    check("future projection", r.status_code == 200, r.text[:200])
    expected_future = round(100000 * (1.06 ** 5), 2)
    check(
        "inflation compounding correct",
        abs(proj["future_cost"] - expected_future) < 1,
        f"{proj['future_cost']} vs {expected_future}",
    )
    check(
        "return assumption lowers required saving",
        proj["required_monthly_with_returns"] < proj["required_monthly_flat"],
        str(proj),
    )

    r = client.get("/future-plans")
    check("future plans list", r.status_code == 200 and len(r.json()["plans"]) > 0, r.text[:200])

    # ------------------------------------------------------------ investments
    section("Investments")
    r = client.get("/investments")
    pf = r.json()
    check("portfolio loads", r.status_code == 200, r.text[:300])
    check("holdings present", len(pf["holdings"]) == 6, str(len(pf["holdings"])))
    check(
        "P/L = value - invested",
        abs(pf["profit_loss"] - (pf["current_value"] - pf["total_invested"])) < 0.05,
        str(pf["profit_loss"]),
    )
    check("prices labelled as source", all(h["price_source"] in ("USER_ENTERED", "LIVE_MARKET") for h in pf["holdings"]), "")
    check("best/worst identified", pf["best_performer"] is not None, "")
    check("allocation sums to ~100%", abs(sum(a["share"] for a in pf["allocation"]) - 100) < 1.0, str(pf["allocation"]))

    r = client.post(
        "/investments",
        json={"name": "Test Fund", "type": "MUTUAL_FUND", "quantity": 10, "avg_buy_price": 100},
    )
    check("create investment", r.status_code == 201, r.text[:300])
    inv_id = r.json()["id"]
    check("no price supplied values at cost", r.json()["current_price"] == 100, r.text[:200])

    r = client.post(
        f"/investments/{inv_id}/transactions",
        json={"type": "BUY", "quantity": 10, "price": 120, "occurred_at": now.isoformat()},
    )
    check("add buy transaction", r.status_code == 201, r.text[:300])
    r = client.get("/investments")
    updated = next(h for h in r.json()["holdings"] if h["id"] == inv_id)
    check("quantity updated to 20", updated["quantity"] == 20, str(updated["quantity"]))
    check("avg cost recalculated to 110", abs(updated["avg_buy_price"] - 110) < 0.01, str(updated["avg_buy_price"]))

    r = client.post(
        f"/investments/{inv_id}/transactions",
        json={"type": "SELL", "quantity": 999, "price": 120, "occurred_at": now.isoformat()},
    )
    check("oversell rejected", r.status_code == 400, r.text[:200])

    r = client.post("/investments/refresh-prices")
    check("refresh prices responds", r.status_code == 200, r.text[:300])

    r = client.get("/investments/performance/history", params={"period": "1M"})
    check("performance history", r.status_code == 200, r.text[:200])

    r = client.delete(f"/investments/{inv_id}")
    check("delete investment", r.status_code == 200, r.text[:200])

    # ------------------------------------------------------------------- debt
    section("Debt")
    r = client.get("/debts")
    dbt = r.json()
    check("debt dashboard", r.status_code == 200 and len(dbt["items"]) > 0, r.text[:300])
    check("DTI computed", dbt["summary"]["debt_to_income_ratio"] > 0, str(dbt["summary"]))
    check("health classified", dbt["summary"]["health"] in ("NONE", "HEALTHY", "MANAGEABLE", "STRESSED"), "")

    r = client.get("/debts/strategies", params={"extra_payment": 1000})
    st = r.json()
    check("strategies", r.status_code == 200 and st["has_debt"], r.text[:300])
    check("avalanche computed", st["avalanche"]["total_months"] > 0, str(st["avalanche"]))
    check("snowball computed", st["snowball"]["total_months"] > 0, str(st["snowball"]))
    check(
        "avalanche costs no more interest than snowball",
        st["avalanche"]["total_interest"] <= st["snowball"]["total_interest"] + 0.01,
        f"{st['avalanche']['total_interest']} vs {st['snowball']['total_interest']}",
    )
    check("extra payment saves time", st["extra_payment_impact"]["months_saved"] >= 0, str(st["extra_payment_impact"]))

    r = client.get("/debts/emi-calculator", params={"principal": 100000, "interest_rate": 10, "months": 12})
    emi = r.json()
    check("EMI calculator", r.status_code == 200 and 8700 < emi["emi"] < 8850, str(emi["emi"]))

    # -------------------------------------------------------------- decisions
    section("Purchase decisions")
    r = client.post(
        "/decisions/analyse",
        json={"item_name": "Headphones", "price": 5000, "necessity": "WANT", "explain_with_ai": False},
    )
    dec = r.json()
    check("analyse purchase", r.status_code == 201, r.text[:300])
    check("score in range", 0 <= dec["score"] <= 100, str(dec["score"]))
    check(
        "verdict valid",
        dec["verdict"] in ("BUY_NOW", "PLAN_AND_BUY", "WAIT", "SAVE_FIRST", "AVOID"),
        dec["verdict"],
    )
    check("factors returned", len(dec["factors"]) == 5, str(len(dec["factors"])))
    check("reasoning present", len(dec["reasoning"]) >= 3, str(len(dec["reasoning"])))

    r = client.post(
        "/decisions/analyse",
        json={"item_name": "Luxury watch", "price": 500000, "necessity": "WANT", "explain_with_ai": False},
    )
    big = r.json()
    check("unaffordable purchase not approved", big["verdict"] in ("SAVE_FIRST", "AVOID", "WAIT"), big["verdict"])
    check("large purchase scores lower", big["score"] < dec["score"], f"{big['score']} vs {dec['score']}")

    r = client.post("/decisions/quick-ask", json={"question": "Can I buy a 7,000 headphone?"})
    qa = r.json()
    check("quick ask parses price", qa.get("parsed") and qa.get("detected_price") == 7000, r.text[:300])

    r = client.post("/decisions/quick-ask", json={"question": "what about a thing"})
    check("quick ask handles no price", r.json().get("parsed") is False, r.text[:200])

    r = client.get("/decisions/buying-guide")
    bg = r.json()
    check("buying guide", r.status_code == 200 and len(bg["items"]) > 0, r.text[:200])
    check("buckets present", set(bg["buckets"].keys()) >= {"BUY_NOW", "WAIT", "AVOID"}, "")

    r = client.get("/decisions/history")
    check("decision history", r.status_code == 200 and len(r.json()) >= 2, r.text[:200])

    # --------------------------------------------------------------- AI coach
    section("AI coach")
    r = client.get("/ai/status")
    check("ai status", r.status_code == 200, r.text[:200])
    mode = r.json()["mode"]
    print(f"        (coach mode: {mode})")

    r = client.get("/ai/suggestions")
    check("suggestions", r.status_code == 200 and len(r.json()["suggestions"]) > 0, r.text[:200])

    r = client.post("/ai/chat", json={"message": "How should I manage my salary this month?"})
    check("chat replies", r.status_code == 200, r.text[:400])
    if r.status_code == 200:
        chat = r.json()
        conv_id = chat["conversation_id"]
        check("reply has content", len(chat["message"]["content"]) > 50, chat["message"]["content"][:120])
        check("engine labelled", chat["generated_by"] in ("AI", "RULE_BASED"), chat["generated_by"])

        r = client.post("/ai/chat", json={"message": "Can I buy a 8,000 phone?", "conversation_id": conv_id})
        check("purchase question answered", r.status_code == 200, r.text[:300])

        r = client.get(f"/ai/conversations/{conv_id}/messages")
        check("conversation history", r.status_code == 200 and len(r.json()) >= 4, r.text[:200])

        r = other.get(f"/ai/conversations/{conv_id}/messages")
        check("other user cannot read conversation", r.status_code == 404, r.text[:200])

    # ---------------------------------------------------------- notifications
    section("Notifications")
    r = client.post("/notifications/refresh")
    check("rules engine runs", r.status_code == 200, r.text[:300])

    r = client.get("/notifications")
    notes = r.json()
    check("notifications listed", r.status_code == 200 and len(notes) > 0, r.text[:200])
    check("severity valid", all(n["severity"] in ("INFO", "WARNING", "CRITICAL", "SUCCESS") for n in notes), "")

    if notes:
        r = client.post(f"/notifications/{notes[0]['id']}/read")
        check("mark read", r.status_code == 200, r.text[:200])

    r = client.get("/notifications/unread-count")
    check("unread count", r.status_code == 200, r.text[:200])

    r = client.patch("/notifications/preferences", json={"investment_updates": False})
    check("update preferences", r.status_code == 200 and r.json()["investment_updates"] is False, r.text[:200])

    # ---------------------------------------------------------------- reports
    section("Reports")
    r = client.get("/reports/monthly")
    rep = r.json()
    check("monthly report", r.status_code == 200, r.text[:300])
    check("top categories", len(rep["top_categories"]) > 0, "")
    check("3-5 recommendations", 3 <= len(rep["next_month_plan"]) <= 5, str(len(rep["next_month_plan"])))
    check("good decisions listed", len(rep["good_decisions"]) > 0, "")
    check("problems listed", len(rep["problems"]) > 0, "")

    r = client.get("/reports/yearly")
    yr = r.json()
    check("yearly report", r.status_code == 200 and len(yr["months"]) == 12, r.text[:200])

    r = client.get("/reports/summary")
    check("reports summary", r.status_code == 200, r.text[:200])

    r = client.get("/reports/export/expenses.csv")
    check("csv export", r.status_code == 200 and "Date,Description" in r.text, r.text[:120])

    r = client.get("/reports/export/monthly.csv")
    check("report csv export", r.status_code == 200 and "Monthly Report" in r.text, r.text[:120])

    # -------------------------------------------------------------- net worth
    section("Net worth & calendar")
    r = client.post("/net-worth/snapshot")
    check("snapshot saved", r.status_code == 200, r.text[:200])

    r = client.get("/net-worth/history")
    nh = r.json()
    check("net worth history", r.status_code == 200 and len(nh["series"]) > 0, r.text[:200])

    r = client.get("/calendar")
    cal = r.json()
    check("calendar", r.status_code == 200 and len(cal["events"]) > 0, r.text[:200])
    check("salary event present", any(e["type"] == "SALARY" for e in cal["events"]), "")
    check("EMI event present", any(e["type"] == "EMI" for e in cal["events"]), "")

    # ------------------------------------------------------------- demo clear
    section("Demo cleanup & data reset")
    r = client.delete("/demo")
    check("demo cleared", r.status_code == 200, r.text[:300])
    r = client.get("/investments")
    check("demo investments removed", len(r.json()["holdings"]) == 0, str(len(r.json()["holdings"])))

    # ---------------------------------------------------------------- logout
    section("Session lifecycle")
    r = client.post("/auth/forgot-password", json={"email": email})
    token = r.json().get("reset_token")
    check("forgot password", r.status_code == 200, r.text[:200])
    check("dev reset token issued", bool(token), r.text[:200])

    if token:
        r = client.post("/auth/reset-password", json={"token": token, "password": "NewPass456!"})
        check("reset password", r.status_code == 200, r.text[:200])
        r = client.post("/auth/reset-password", json={"token": token, "password": "Another789!"})
        check("token single use", r.status_code == 400, r.text[:200])

        r = client.post("/auth/login", json={"email": email, "password": "NewPass456!"})
        check("login with new password", r.status_code == 200, r.text[:200])

    r = client.post("/auth/logout")
    check("logout", r.status_code == 200, r.text[:200])
    r = client.get("/auth/me")
    check("session revoked after logout", r.status_code == 401, r.text[:200])

    client.close()
    other.close()

    print("\n" + "=" * 60)
    print(f"  {passed} passed, {len(failed)} failed")
    if failed:
        print("\nFailures:")
        for f in failed:
            print(f"  - {f}")
    print("=" * 60)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
