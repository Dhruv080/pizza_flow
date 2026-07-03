-- PizzaFlow — menu seed. Same items and prices as the Stage 2 .txt files.
-- Adding a new pizza tomorrow = one INSERT here (or a row in the dashboard);
-- the ordering page reflects it on the next load. No code change, no deploy.

-- Outlet identity defaults — 'do nothing' on conflict so re-running the seed
-- never overwrites what the admin set in the console.
insert into settings (key, value) values
  ('outlet_name', 'SliceMatic'),
  ('outlet_location', 'New Ashok Nagar, Delhi')
on conflict (key) do nothing;

insert into menu_items (category, name, price) values
  -- bases (Types_of_Base.txt)
  ('base', 'Thin Crust', 149),
  ('base', 'Thick Crust', 179),
  ('base', 'Cheese Burst', 229),
  ('base', 'Whole Wheat', 159),
  ('base', 'Multigrain', 169),
  -- pizzas (Types_of_Pizza.txt)
  ('pizza', 'Margherita', 299),
  ('pizza', 'Chicago Deep Dish', 349),
  ('pizza', 'Greek Mediterranean', 329),
  ('pizza', 'California Veggie', 339),
  ('pizza', 'Farm House', 319),
  ('pizza', 'Pepperoni Classic', 369),
  ('pizza', 'BBQ Chicken', 379),
  ('pizza', 'Paneer Tikka', 349),
  -- toppings (Types_of_Toppings.txt)
  ('topping', 'Black Olives', 49),
  ('topping', 'Extra Cheese', 69),
  ('topping', 'Button Mushrooms', 49),
  ('topping', 'Green Peppers', 39),
  ('topping', 'Jalapenos', 39),
  ('topping', 'Sun-Dried Tomatoes', 59),
  ('topping', 'Caramelised Onions', 49),
  ('topping', 'Sweet Corn', 39),
  ('topping', 'Roasted Garlic', 49),
  ('topping', 'Peri-Peri Drizzle', 59)
on conflict (category, name) do update set price = excluded.price, is_active = true;
