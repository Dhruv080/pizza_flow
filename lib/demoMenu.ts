// Demo-mode menu: identical to the three Stage 2 .txt files.
// Used ONLY when Supabase env vars are absent (local development).
// In production the menu always comes from the menu_items table.

import type { Menu } from "./types";

export const DEMO_MENU: Menu = {
  bases: [
    { id: "B1", category: "base", name: "Thin Crust", pricePaise: 14900, isVeg: true },
    { id: "B2", category: "base", name: "Thick Crust", pricePaise: 17900, isVeg: true },
    { id: "B3", category: "base", name: "Cheese Burst", pricePaise: 22900, isVeg: true },
    { id: "B4", category: "base", name: "Whole Wheat", pricePaise: 15900, isVeg: true },
    { id: "B5", category: "base", name: "Multigrain", pricePaise: 16900, isVeg: true },
  ],
  pizzas: [
    { id: "P1", category: "pizza", name: "Margherita", pricePaise: 29900, isVeg: true },
    { id: "P2", category: "pizza", name: "Chicago Deep Dish", pricePaise: 34900, isVeg: true },
    { id: "P3", category: "pizza", name: "Greek Mediterranean", pricePaise: 32900, isVeg: true },
    { id: "P4", category: "pizza", name: "California Veggie", pricePaise: 33900, isVeg: true },
    { id: "P5", category: "pizza", name: "Farm House", pricePaise: 31900, isVeg: true },
    { id: "P6", category: "pizza", name: "Pepperoni Classic", pricePaise: 36900, isVeg: false },
    { id: "P7", category: "pizza", name: "BBQ Chicken", pricePaise: 37900, isVeg: false },
    { id: "P8", category: "pizza", name: "Paneer Tikka", pricePaise: 34900, isVeg: true },
  ],
  toppings: [
    { id: "T1", category: "topping", name: "Black Olives", pricePaise: 4900, isVeg: true },
    { id: "T2", category: "topping", name: "Extra Cheese", pricePaise: 6900, isVeg: true },
    { id: "T3", category: "topping", name: "Button Mushrooms", pricePaise: 4900, isVeg: true },
    { id: "T4", category: "topping", name: "Green Peppers", pricePaise: 3900, isVeg: true },
    { id: "T5", category: "topping", name: "Jalapenos", pricePaise: 3900, isVeg: true },
    { id: "T6", category: "topping", name: "Sun-Dried Tomatoes", pricePaise: 5900, isVeg: true },
    { id: "T7", category: "topping", name: "Caramelised Onions", pricePaise: 4900, isVeg: true },
    { id: "T8", category: "topping", name: "Sweet Corn", pricePaise: 3900, isVeg: true },
    { id: "T9", category: "topping", name: "Roasted Garlic", pricePaise: 4900, isVeg: true },
    { id: "T10", category: "topping", name: "Peri-Peri Drizzle", pricePaise: 5900, isVeg: true },
  ],
};
