# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

PizzaFlow — an ordering system for the SliceMatic pizza outlet. Active development happens in `web/`: a Next.js 15 / React 19 app deployed on Vercel, backed by Supabase PostgreSQL, with six AI features via OpenRouter. `tests/` is a **separate** Playwright (Python) end-to-end suite that drives the `web/` UI in a browser — it is not the web app's unit tests. Other top-level directories (`docs/`, `stage2/`, `submissions/`, `problem_statement/`) are earlier project stages and submission material — leave them alone unless asked.

## Commands

### Web app (`web/`)

```bash
cd web
npm run dev        # http://localhost:3000
npm run build
npm run lint
npm run db:setup                              # apply supabase/schema.sql + seed.sql (idempotent; needs SUPABASE_DB_URL in .env.local)
npm run admin:create -- <email> <password>    # create or password-reset the admin login (no public signup exists)
```

Env vars (`web/.env.local`, copied from `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL` (default `openai/gpt-4o-mini`). **Missing Supabase keys → demo mode** (bundled menu, orders in localStorage); missing OpenRouter key → AI panels show "unavailable" but everything else works. Env vars are read at dev-server startup — restart `npm run dev` after editing `.env.local`.

### Playwright E2E suite (`tests/`)

```bash
cd tests
uv venv .venv
uv pip install -r requirements.txt --python .venv
.venv/Scripts/python -m pytest -v
.venv/Scripts/python -m pytest test_required_edge_cases.py::test_case2_phone_starting_with_1 -v   # single test
```

- Defaults to system Microsoft Edge (`channel="msedge"`); `--headed` to watch.
- `conftest.py` starts its **own** disposable `next dev` on port 3100 with Supabase/OpenRouter env vars forced blank, so the suite runs in demo mode and **can never write to the real database or spend OpenRouter tokens**. Don't "fix" the tests by pointing them at a real server or real keys. `PIZZAFLOW_TEST_PORT` overrides the port.
- An autouse fixture fails any test whose page throws an unhandled JS exception — that's the real pass/fail bar.
- Self-contained HTML report written to `tests/report/report.html` each run.

## Architecture

Read the README's architecture section for the full picture. The load-bearing invariants:

- **Rules compute, AI narrates.** All validation, pricing, discounts, and GST are deterministic code in `web/lib/validation.ts` and `web/lib/billing.ts`. The LLM never invents an item, price, or number — it maps language onto injected menu ids (AI assistant) or narrates aggregates computed in `web/lib/analytics.ts`. Every AI output is re-validated in code (unknown ids dropped, feedback-theme citations checked by index server-side).
- **Money is integer paise** (₹517.00 = 51700) everywhere in app code — never floats.
- **Billing order is fixed:** promo code discount on the original subtotal first, then the 5+ pizza 10% discount (`DISCOUNT_THRESHOLD` in `web/lib/billing.ts`) on the remainder, then 18% GST on the post-discount amount. Payment modes: Cash, Card, UPI only.
- **Defense in depth.** The billing/validation rules exist a second time as PostgreSQL `CHECK` constraints + RLS in `web/supabase/schema.sql`. Schema changes go in that file and must stay **additive/idempotent** (`create table if not exists`, `add column if not exists`) — `npm run db:setup` re-runs it against live projects with real orders.
- **AI is an enhancement, never a dependency.** Every `/api/ai/*` route (six: `assistant`, `upsell`, `digest`, `insights`, `promo`, `feedback`) degrades to a friendly 503; ordering/billing/admin continue untouched. These routes are the **only** place `OPENROUTER_API_KEY` may appear — never in client code. Each route also independently re-checks the `settings.ai_enabled` kill switch server-side before calling OpenRouter (the UI hiding panels is not the enforcement).
- **All six system prompts live in one file**, `web/lib/prompts.ts` — each states what data the model may use and how to refuse out-of-scope requests. Keep new/changed prompts there.
- **Orders snapshot names and prices** at purchase time — menu edits must never rewrite historical bills. Consequently menu items are never hard-deleted; deactivate via `is_active` (see `getAllMenuItems`/`createMenuItem`/`updateMenuItem`/`setMenuItemActive` in `web/lib/data.ts`).
- **Each pizza carries its own allowed-base/allowed-topping lists** (`allowedBaseIds`/`allowedToppingIds` on `MenuItem`/`AdminMenuItem`, `allowed_base_ids`/`allowed_topping_ids` on `menu_items`) — an id NOT in a pizza's list is not orderable with it; there is no "untagged means anything goes" fallback. Edited only from Admin → Menu management; enforced in code on the customer ordering page (`web/app/page.tsx`) and by the AI assistant's re-validation, not by a DB constraint (arrays aren't CHECK-able) — UI + code validation is the enforcement layer here.
- **The customer UI never links to `/admin`**, and the login screen must not hint at valid credentials. White-label branding (outlet name/location) lives in the `settings` table, not in code.
- Promo codes go live purely by their date-time window — there is no publish step or cron; don't add one.

## Environment notes

- Windows machine; PowerShell is the primary shell. Python tooling uses `uv`.
- The Playwright suite uses headless Edge by default (no Chromium download needed).
