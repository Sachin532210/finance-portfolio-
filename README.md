# Finance Track

An AI-assisted personal finance app: salary planning, budgeting, savings goals,
investment tracking, debt payoff strategies and a financial coach that answers
from your own numbers.

Built with **FastAPI + MySQL** on the backend and **React + TypeScript** on the
frontend.

---

## What it does

| Area | Detail |
|---|---|
| **Dashboard** | Net worth, health score, safe-to-spend, category breakdown, six-month trends |
| **Salary Planner** | Personalised monthly allocation - not a fixed 50/30/20 rule |
| **Expenses** | Full CRUD, 11 categories, payment methods, daily/weekly/monthly stats |
| **Budgets** | Per-category limits with safe / approaching / over states |
| **Savings** | Goals with target dates, required monthly contribution, contribution history |
| **Emergency Fund** | Sized from your real essential costs, not a round number |
| **Investments** | Holdings, allocation, P/L, transaction history, optional live prices |
| **Debt** | Avalanche vs snowball simulation, extra-payment impact, EMI calculator |
| **Goals** | Short / medium / long term, with an honest on-track assessment |
| **Future Planner** | Inflation-adjusted cost projections |
| **Can I Buy This?** | 0-100 purchase score across five weighted factors |
| **AI Coach** | Answers grounded in your actual data |
| **Reports** | Monthly review, yearly roll-up, CSV export, print-to-PDF |

---

## Design decisions worth knowing

**One source of truth for every number.** `build_financial_context()` assembles
the complete financial picture in one place. Every page, the rules engine, the
report generator and the AI context all read from it, so two screens cannot
disagree about your savings rate.

**The AI cannot invent a verdict.** Purchase recommendations come from a
deterministic scoring engine. The language model receives that analysis and
writes the explanation - it never overrules the score. With no API key
configured the app falls back to a rule-based coach that runs the same
calculations, so it stays useful and never fabricates a figure.

**Prices are never made up.** An investment with no supplied price is valued at
cost, and every price is labelled `user-entered` or `live-market` in the UI. A
failed quote lookup leaves your entered price untouched.

**Sessions are database-backed.** The JWT carries a session id whose row must
still exist. That is what makes logout and "sign out everywhere" take effect
immediately rather than waiting for the token to expire.

**Ownership is enforced per row.** Every detail route returns 404 - not 403 -
for another user's record, so the API never confirms that someone else's data
exists.

---

## Tech stack

**Backend** - FastAPI, SQLAlchemy 2.0, MySQL (PyMySQL), Pydantic v2, JWT +
bcrypt, OpenAI SDK (optional)

**Frontend** - React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Recharts,
React Router

---

## Running locally

**Requirements:** Python 3.11+, Node 18+, and a MySQL server.

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

copy .env.example .env          # macOS/Linux: cp .env.example .env
# edit .env with your MySQL credentials and a generated SECRET_KEY:
#   python -c "import secrets; print(secrets.token_hex(48))"

python run.py
```

The API starts on <http://127.0.0.1:8010>. It creates the database and all 22
tables on first boot - there is no migration step. Interactive docs at `/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens <http://localhost:5173>. Vite proxies `/api` to the backend, so the
session cookie stays first-party.

### First run

Create an account through the UI - there is no default login. Then either
complete onboarding or pick **Explore with demo data instead**, which populates
every page. Demo rows are tagged, so removing them from Settings never touches
data you entered yourself.

---

## Configuration

Everything lives in `backend/.env`; see `.env.example` for the full list.

| Variable | Purpose |
|---|---|
| `DB_ENGINE` / `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Database connection. TLS turns on automatically for any non-local host. |
| `SECRET_KEY` | Session signing key. Rotating it signs everyone out. |
| `CORS_ORIGINS` | Allowed frontend origins. Never `*`. |
| `OPENAI_API_KEY` | Optional. Blank runs the built-in engine. |
| `MARKET_DATA_API_KEY` | Optional [Finnhub](https://finnhub.io) key for live prices. |

PostgreSQL is supported by setting `DB_ENGINE=postgresql` and adding
`psycopg[binary]` to `requirements.txt`.

---

## Testing

```bash
cd backend
python smoke_test.py        # 138 end-to-end API checks against a running server
```

Covers every major flow: auth, onboarding, demo data, dashboard maths, expenses,
budgets, planner, savings, goals, investments, debt strategies, purchase
scoring, the AI coach, notifications, reports, CSV export and cross-user
isolation.

---

## Deployment

See **[DEPLOY.md](DEPLOY.md)** for a free-tier setup: Vercel (frontend), Render
(backend), TiDB Cloud (MySQL). A `render.yaml` blueprint, `vercel.json`,
Cloudflare `_redirects` and a `Dockerfile` are all included.

---

## Disclaimer

Finance Track is a personal finance planning and educational tool, **not a
licensed financial advisor**. Projections are estimates based on the assumptions
you provide. Investment values fluctuate, and past performance does not
guarantee future results.
