-- PizzaFlow — Supabase schema.
-- Preferred: `npm run db:setup` applies this file + seed.sql in one command
-- (needs SUPABASE_DB_URL in .env.local — see .env.example). Alternative:
-- paste into the Supabase SQL editor (Dashboard > SQL Editor > New query),
-- then run seed.sql. Either way, create the admin login afterwards under
-- Authentication > Users > "Add user" — no signup flow is exposed.
-- Idempotent: safe to re-run after edits.
--
-- Design notes:
--  * 5 tables: menu_items, orders, order_items, order_item_toppings, settings.
--  * Orders snapshot item NAMES and PRICES at purchase time, so editing the
--    menu tomorrow never rewrites yesterday's bills.
--  * CHECK constraints mirror the app's validation rules — bad data cannot
--    enter even through the REST API directly.
--  * RLS: anyone may read the menu and place an order; only the
--    authenticated admin may read orders.

-- ---------------------------------------------------------------- menu
create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('base', 'pizza', 'topping')),
  name text not null,
  price numeric(10, 2) not null check (price > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category, name)
);

-- ---------------------------------------------------------------- orders
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_started_at timestamptz not null,
  customer_name text not null check (customer_name ~ '^[A-Za-z][A-Za-z ]{0,38}[A-Za-z]$'),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  discount numeric(10, 2) not null default 0 check (discount >= 0),
  gst numeric(10, 2) not null check (gst >= 0),
  total numeric(10, 2) not null check (total >= 0),
  payment_mode text not null check (payment_mode in ('Cash', 'Card', 'UPI')),
  table_number int check (table_number between 1 and 50)
);

-- Upgrade path for databases created before dine-in table tracking existed.
alter table orders add column if not exists table_number int check (table_number between 1 and 50);

create index if not exists orders_created_at_idx on orders (created_at desc);

-- ------------------------------------------------------------ line items
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  base_id uuid references menu_items (id),
  pizza_id uuid references menu_items (id),
  base_name text not null,   -- snapshot at purchase time
  pizza_name text not null,  -- snapshot at purchase time
  quantity int not null check (quantity between 1 and 10),
  unit_price numeric(10, 2) not null check (unit_price > 0)
);

create index if not exists order_items_order_id_idx on order_items (order_id);

create table if not exists order_item_toppings (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items (id) on delete cascade,
  topping_id uuid references menu_items (id),
  topping_name text not null, -- snapshot at purchase time
  price numeric(10, 2) not null check (price >= 0)
);

create index if not exists order_item_toppings_item_idx on order_item_toppings (order_item_id);

-- ---------------------------------------------------------------- settings
-- Outlet-level configuration editable from the admin console (e.g. the
-- outlet's display name). Key/value keeps it schema-stable as settings grow.
create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
alter table menu_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_item_toppings enable row level security;
alter table settings enable row level security;

-- Settings: everyone can read the public settings (the ordering page shows the
-- outlet name), EXCEPT `secret_`-prefixed rows (e.g. the OpenRouter API key),
-- which are hidden from anon clients and never returned by the public REST API.
-- The signed-in admin (authenticated) can read and change everything; the
-- server's service-role client bypasses RLS to read secrets in the AI routes.
drop policy if exists "settings readable by all" on settings;
create policy "settings readable by all" on settings
  for select using (key not like 'secret\_%');
drop policy if exists "settings editable by admin" on settings;
create policy "settings editable by admin" on settings
  for all to authenticated using (true) with check (true);

-- Menu: readable by everyone (the ordering page is public).
drop policy if exists "menu readable by all" on menu_items;
create policy "menu readable by all" on menu_items
  for select using (true);

-- Menu edits: admin only.
drop policy if exists "menu editable by admin" on menu_items;
create policy "menu editable by admin" on menu_items
  for all to authenticated using (true) with check (true);

-- Orders: the public counter flow may INSERT; only the signed-in admin may SELECT.
-- NOTE: because anon has no SELECT policy, inserts from the app must NOT use
-- RETURNING (PostgREST .select() after .insert()) — Postgres checks returned
-- rows against SELECT policies and rejects the whole insert. The app therefore
-- generates ids client-side and inserts with no read-back.
drop policy if exists "orders insertable by anyone" on orders;
create policy "orders insertable by anyone" on orders
  for insert with check (true);
drop policy if exists "orders readable by admin" on orders;
create policy "orders readable by admin" on orders
  for select to authenticated using (true);

drop policy if exists "order items insertable by anyone" on order_items;
create policy "order items insertable by anyone" on order_items
  for insert with check (true);
drop policy if exists "order items readable by admin" on order_items;
create policy "order items readable by admin" on order_items
  for select to authenticated using (true);

drop policy if exists "toppings insertable by anyone" on order_item_toppings;
create policy "toppings insertable by anyone" on order_item_toppings
  for insert with check (true);
drop policy if exists "toppings readable by admin" on order_item_toppings;
create policy "toppings readable by admin" on order_item_toppings
  for select to authenticated using (true);

-- ---------------------------------------------------------- best sellers
-- Units sold per pizza, all-time. order_items is admin-only (see policy
-- above), but this view exposes nothing beyond a pizza id/name and a summed
-- quantity — no customer data, no individual orders — so it is safe for the
-- public ordering page to read. Views run with the owner's privileges by
-- default (not the querying role's), so this bypasses the order_items RLS
-- restriction without loosening it.
create or replace view best_seller_pizzas as
  select pizza_id, pizza_name, sum(quantity)::int as total_quantity
  from order_items
  where pizza_id is not null
  group by pizza_id, pizza_name
  order by total_quantity desc;

grant select on best_seller_pizzas to anon, authenticated;
