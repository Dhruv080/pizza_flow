-- PizzaFlow — menu seed. Same items and prices as the Stage 2 .txt files.
-- Adding a new pizza tomorrow = one INSERT here (or a row in the dashboard);
-- the ordering page reflects it on the next load. No code change, no deploy.

-- Outlet identity defaults — 'do nothing' on conflict so re-running the seed
-- never overwrites what the admin set in the console.
insert into settings (key, value) values
  ('outlet_name', 'SliceMatic'),
  ('outlet_location', 'New Ashok Nagar, Delhi')
on conflict (key) do nothing;

insert into menu_items (category, name, price, is_veg) values
  -- bases (Types_of_Base.txt)
  ('base', 'Thin Crust', 149, true),
  ('base', 'Thick Crust', 179, true),
  ('base', 'Cheese Burst', 229, true),
  ('base', 'Whole Wheat', 159, true),
  ('base', 'Multigrain', 169, true),
  -- pizzas (Types_of_Pizza.txt)
  ('pizza', 'Margherita', 299, true),
  ('pizza', 'Chicago Deep Dish', 349, true),
  ('pizza', 'Greek Mediterranean', 329, true),
  ('pizza', 'California Veggie', 339, true),
  ('pizza', 'Farm House', 319, true),
  ('pizza', 'Pepperoni Classic', 369, false),
  ('pizza', 'BBQ Chicken', 379, false),
  ('pizza', 'Paneer Tikka', 349, true),
  -- toppings (Types_of_Toppings.txt)
  ('topping', 'Black Olives', 49, true),
  ('topping', 'Extra Cheese', 69, true),
  ('topping', 'Button Mushrooms', 49, true),
  ('topping', 'Green Peppers', 39, true),
  ('topping', 'Jalapenos', 39, true),
  ('topping', 'Sun-Dried Tomatoes', 59, true),
  ('topping', 'Caramelised Onions', 49, true),
  ('topping', 'Sweet Corn', 39, true),
  ('topping', 'Roasted Garlic', 49, true),
  ('topping', 'Peri-Peri Drizzle', 59, true)
on conflict (category, name) do update set price = excluded.price, is_active = true, is_veg = excluded.is_veg;

-- Freshly seeded pizzas start with every base/topping allowed (NULL-only
-- backfill, so re-running this file never undoes an admin's later narrowing
-- of a pizza's allowed combinations).
update menu_items set allowed_base_ids = (
  select coalesce(array_agg(id), '{}') from menu_items where category = 'base'
) where category = 'pizza' and allowed_base_ids is null;

update menu_items set allowed_topping_ids = (
  select coalesce(array_agg(id), '{}') from menu_items where category = 'topping'
) where category = 'pizza' and allowed_topping_ids is null;
