# PizzaFlow — SliceMatic Ordering System

**FDE Programme · Batch C2 · Applied Project** — an AI consulting project for Rajan Sharma's
SliceMatic pizza outlet (New Ashok Nagar, Delhi), replacing a Google Form + manual-billing
workflow with a validated ordering system, a real database, and six AI features.

| Stage | What | Where |
|---|---|---|
| 1 — Discovery & Scope | Pain points, AI opportunity map, scope, user-flow diagram | [`docs/stage1/`](docs/stage1/) (PDF + HTML) |
| 2 — Working MVP | Crash-proof CLI ordering system, file-driven menu, order log | [`stage2/`](stage2/) |
| 3 — Full-stack app | Next.js on Vercel + Supabase + 6 AI features via OpenRouter | [`web/`](web/) |
| Submission bundle | Everything packaged per the brief | [`submissions/`](submissions/) |

---

## Architecture overview

```
                       ┌────────────────────────────────────────────┐
                       │              Vercel (Next.js)              │
  Customer / staff ───▶│  /        ordering UI (single page, live   │
                       │           bill, AI assistant, AI upsell,   │
                       │           owner-published promo banner)    │
  Admin ──────────────▶│  /admin        dashboard + End-of-day AI   │
                       │  /admin/menu   menu management (CRUD)      │
                       │  /admin/promos festival promo planner (AI) │
                       │  /admin/ratings feedback + AI analyst      │
                       │  /admin/settings/{account,outlet,ai}       │
                       │  floating 🍕  Insights Copilot (all pages) │
                       │  /api/ai/* 6 server routes — the ONLY      │
                       │           place the OpenRouter key exists  │
                       └───────┬───────────────────────┬────────────┘
                               │ supabase-js (RLS)      │ HTTPS
                               ▼                        ▼
                    ┌─────────────────────┐   ┌──────────────────┐
                    │ Supabase PostgreSQL │   │    OpenRouter    │
                    │ menu_items, orders, │   │  (openai/gpt-4o- │
                    │ order_items,        │   │      mini)       │
                    │ order_item_toppings,│   └──────────────────┘
                    │ settings            │
                    └─────────────────────┘
```

Principles we can defend line by line:

- **Rules compute, AI narrates.** Validation, pricing, discount, and GST are deterministic
  code ([`web/lib/validation.ts`](web/lib/validation.ts), [`web/lib/billing.ts`](web/lib/billing.ts)) —
  a 1:1 port of the Stage 2 Python. The LLM never invents an item, a price, or a number:
  it only maps language onto the menu and narrates aggregates we computed in code.
- **Money is integer paise** in application code (₹517.00 = 51700). No float arithmetic can
  corrupt a bill — the web app gives the same guarantee `Decimal` gives the Python CLI.
- **AI is an enhancement, never a dependency.** If OpenRouter is down, every AI panel shows a
  friendly unavailable state and ordering/billing/admin continue untouched (20 s timeout,
  graceful 503s).
- **Defense in depth.** The same rules exist three times: in the UI (helpful messages), in
  the app logic, and as PostgreSQL `CHECK` constraints + RLS in
  [`web/supabase/schema.sql`](web/supabase/schema.sql) — bad data can't enter even via the
  REST API directly.
- **Orders snapshot names and prices** at purchase time, so menu edits never rewrite
  historical bills.
- **The customer UI never links to `/admin`.** Rajan reaches the dashboard by direct URL
  (bookmarked); it is protected by Supabase Auth either way, but customers are given no
  reason to go looking.
- **Dine-in table gate.** The ordering page opens on a staff screen where the waiter picks
  the table number and hands the tablet over; the customer sees the table as a fixed badge
  and cannot change it. Every order stores its `table_number`, so the admin table and the
  insights copilot can slice by table.
- **White-label branding.** The outlet name and location live in the `settings` table and
  are editable from Admin → Settings → Outlet — header, welcome screen, and invoices update
  without a code change or redeploy. Admin accounts are generic (`admin@…`), not tied to a
  person, and the login screen never hints at a valid username or password.
- **One-switch AI kill switch.** Admin → Settings → AI turns off all six AI features at
  once. It is enforced twice: the UI hides the AI panels, and every `/api/ai/*` route
  independently re-checks the same `settings.ai_enabled` flag server-side before calling
  OpenRouter — so the switch can't be bypassed by calling the API directly.
- **Menu management is a UI, not a SQL script.** Admin → Menu management lets staff add
  items, edit name/price, and activate/deactivate — all through `getAllMenuItems` /
  `createMenuItem` / `updateMenuItem` / `setMenuItemActive` in `lib/data.ts`. Items are
  never hard-deleted (a historical order may reference one); deactivating just removes it
  from the customer-facing menu via `is_active`.

## Business rules (identical in Stage 2 and Stage 3)

- Name: letters and spaces only, 2–40 chars. Phone: exactly 10 digits, starts 6/7/8/9.
- Quantity: whole numbers 1–10 per order; floats, words, 0, negatives rejected with
  specific messages.
- **10% discount** applies automatically at **5+ pizzas** (threshold is one constant:
  `DISCOUNT_THRESHOLD` in [`web/lib/billing.ts`](web/lib/billing.ts) /
  [`stage2/pizzaflow/billing.py`](stage2/pizzaflow/billing.py)).
- **GST 18%** on the **post-discount** amount. Payment modes: Cash, Card, UPI only.

---

## Stage 2 — run the CLI

```bash
cd stage2
python main.py          # stdlib only, Python 3.10+
python -m pytest tests/ # 28 tests, one per graded edge case and billing rule
```

Menu files (`Types_of_Base.txt`, `Types_of_Pizza.txt`, `Types_of_Toppings.txt`) are loaded
at runtime with defensive parsing — swap them freely; malformed lines produce a clear
error with file + line number and a graceful exit. Completed orders append to
`orders_log.txt` (one block per order, blank-line separated, trivially parseable).

## Stage 3 — run the web app

```bash
cd web
npm install
cp .env.example .env.local   # fill in the three keys below
npm run dev                  # http://localhost:3000
```

| Env var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project (Settings → API). **Absent → demo mode**: bundled menu, orders in localStorage — the full flow still works. |
| `OPENROUTER_API_KEY` | Server-side only. Absent → AI panels show "unavailable", everything else works. |
| `OPENROUTER_MODEL` | Defaults to `openai/gpt-4o-mini`. |

**Supabase setup — do this in order (the app will tell you if you skip it):**

1. Create a project at supabase.com, copy URL + anon key into `.env.local`.
2. Dashboard → **Connect** → copy the **Session pooler** URI into `.env.local` as
   `SUPABASE_DB_URL` (dev machine only — never deploy this variable).
3. `npm run db:setup` — applies [`schema.sql`](web/supabase/schema.sql) (4 tables + RLS)
   and [`seed.sql`](web/supabase/seed.sql) (the menu). Idempotent: safe to re-run anytime.
4. `npm run admin:create -- <email> <password>` — creates (or password-resets) the admin
   login. No public signup exists; user creation is deliberately a privileged CLI act.
   At `/admin`, sign in with the full email or just its username part
   (`rajan` → `rajan@slicematic.in`).
5. Restart `npm run dev` if it was running when you edited `.env.local`.

*No connection string handy?* Pasting `schema.sql` then `seed.sql` into the dashboard's
SQL Editor does the same thing.

> **Why isn't this automatic at app start?** The running app holds only the anon key,
> which cannot — and must not — alter the schema: an internet-facing runtime with DDL
> rights is an attack surface, and concurrent serverless cold-starts would race the same
> migration. Schema changes are a setup/deploy-time action performed with a privileged
> credential, hence a deliberate one-command script instead.

**Vercel setup:** import the repo, set the project **Root Directory to `web/`**, add the
four env vars, deploy.

### Troubleshooting

| Symptom | Cause → fix |
|---|---|
| *"Could not find the table 'public.menu_items' in the schema cache"* (or any "tables have not been created yet" banner) | Supabase keys are set but the schema was never applied — run `npm run db:setup` (or paste `schema.sql` + `seed.sql` into the SQL Editor), then refresh. |
| Demo-mode banner even though keys are set | `.env.local` was edited while the dev server was running — restart `npm run dev`. Env vars are read at startup. |
| Admin login fails with valid-looking credentials | The user was never created — run `npm run admin:create -- <email> <password>` (also resets a forgotten password). |
| AI panels say "unavailable" | `OPENROUTER_API_KEY` missing/invalid, out of credit, or the chosen `OPENROUTER_MODEL` id doesn't exist on OpenRouter. Ordering keeps working regardless. |

---

## The AI features (all six, via OpenRouter)

System prompts are documented verbatim in [`web/lib/prompts.ts`](web/lib/prompts.ts) —
one file, six prompts, each stating what data the model may use and what to do when a
request is out of scope.

1. **Owner Insights Copilot** (floating 🍕 widget on every admin page) — the admin asks
   plain-English questions ("Which pizza sells most on weekends?"). The app computes
   aggregates from the orders table ([`web/lib/analytics.ts`](web/lib/analytics.ts)) and the
   LLM answers *only* from those numbers. Attacks the #1 discovery finding: two years of
   data, never queried. The widget fetches and aggregates orders itself on first open, so
   it works from the dashboard, menu management, or any settings page.
2. **AI Order Assistant** (`/`) — "two spicy paneer pizzas on thin crust" → strict-JSON
   draft order using only menu ids injected into the prompt. The client re-validates every
   id and quantity against the live menu before anything enters the cart: **the AI
   proposes, the rules dispose.**
3. **Smart Upsell Suggester** (`/`) — one topping suggestion per cart with an honest
   one-line reason. A hallucinated topping id is silently dropped; any failure just means
   "no suggestion". Measurable by acceptance rate and incremental topping revenue.
4. **End-of-Day Digest** (`/admin`) — one click, one ~150-word manager's report on today's
   trading, written by the LLM from today's aggregates only.
5. **Festival Promo Planner** (`/admin/promos`) — the rules pick every input: an Indian
   occasion calendar ([`web/lib/occasions.ts`](web/lib/occasions.ts)) suggests what's
   coming up (Shravan and Navratri are flagged veg-leaning — the veg/non-veg menu tags
   feed straight in), `computePromoFacts` extracts best sellers, slow movers, veg share
   and quiet days from the orders table, and the owner picks the offer from a fixed list.
   The LLM only writes the WhatsApp broadcast copy, in strict JSON; featured items are
   re-validated against the menu and it may not mention any offer except the one selected.
   One click publishes the approved text as a banner on the ordering page (a `settings`
   row — no redeploy) — billing rules are never touched.
6. **Feedback Analyst** (`/admin/ratings`) — clusters recent customer feedback into
   actionable themes ("pizzas arriving cold on weekend evenings"), each with a root-cause
   hypothesis, one low-cost fix, and a draft WhatsApp reply. The LLM cites feedback
   entries by *index*; the route validates the indexes and the UI recomputes every count
   and quote from the actual entries — a theme cannot claim evidence that isn't there,
   and an unsubstantiated theme is dropped server-side.

**Model: `openai/gpt-4o-mini` — why.** All six features are small, structured tasks
(JSON mapping and short narration over injected data), not deep reasoning. GPT-4o-mini has
reliable JSON-mode output, low latency (a counter queue can't wait on a slow model), and
costs a fraction of a paisa per order — the AI cost of an order is ~1000× smaller than its
margin. The model id is one env var: if it ever underperforms we swap models without
touching code, which is also our OpenRouter fallback story.

**When the AI is wrong:** the customer sees a draft cart they can edit (never an auto-placed
order); Rajan sees numbers sourced from SQL, with the raw orders table on the same screen.
**When OpenRouter is down:** 503 → friendly message → the deterministic flow carries on.

---

## Repo map

```
docs/stage1/     Stage 1 Discovery & Scope (PDF + HTML source)
docs/prep/       Decision defense & demo-day Q&A preparation
stage2/          CLI MVP: main.py, pizzaflow/ package, tests/, menu files, orders_log.txt
web/             Next.js app: app/ (pages + API routes), lib/ (rules, prompts, data), supabase/ (SQL)
submissions/     Everything bundled per the submission checklist
```
