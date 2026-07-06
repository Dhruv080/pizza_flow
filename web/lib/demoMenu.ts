// Demo-mode menu: identical to the three Stage 2 .txt files.
// Used ONLY when Supabase env vars are absent (local development).
// In production the menu always comes from the menu_items table.

import type { Menu } from "./types";

const ALL_BASE_IDS = ["B1", "B2", "B3", "B4", "B5"];
const ALL_TOPPING_IDS = [
  "T1",
  "T2",
  "T3",
  "T4",
  "T5",
  "T6",
  "T7",
  "T8",
  "T9",
  "T10",
];

export const DEMO_MENU: Menu = {
  bases: [
    { id: "B1", category: "base", name: "Thin Crust", pricePaise: 14900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
    { id: "B2", category: "base", name: "Thick Crust", pricePaise: 17900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
    { id: "B3", category: "base", name: "Cheese Burst", pricePaise: 22900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
    { id: "B4", category: "base", name: "Whole Wheat", pricePaise: 15900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
    { id: "B5", category: "base", name: "Multigrain", pricePaise: 16900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
  ],
  pizzas: [
    { id: "P1", category: "pizza", name: "Margherita", pricePaise: 29900, isVeg: true, allowedBaseIds: ALL_BASE_IDS, allowedToppingIds: ALL_TOPPING_IDS },
    { id: "P2", category: "pizza", name: "Chicago Deep Dish", pricePaise: 34900, isVeg: true, allowedBaseIds: ALL_BASE_IDS, allowedToppingIds: ALL_TOPPING_IDS },
    { id: "P3", category: "pizza", name: "Greek Mediterranean", pricePaise: 32900, isVeg: true, allowedBaseIds: ALL_BASE_IDS, allowedToppingIds: ALL_TOPPING_IDS },
    { id: "P4", category: "pizza", name: "California Veggie", pricePaise: 33900, isVeg: true, allowedBaseIds: ALL_BASE_IDS, allowedToppingIds: ALL_TOPPING_IDS },
    { id: "P5", category: "pizza", name: "Farm House", pricePaise: 31900, isVeg: true, allowedBaseIds: ALL_BASE_IDS, allowedToppingIds: ALL_TOPPING_IDS },
    { id: "P6", category: "pizza", name: "Pepperoni Classic", pricePaise: 36900, isVeg: false, allowedBaseIds: ALL_BASE_IDS, allowedToppingIds: ALL_TOPPING_IDS },
    { id: "P7", category: "pizza", name: "BBQ Chicken", pricePaise: 37900, isVeg: false, allowedBaseIds: ALL_BASE_IDS, allowedToppingIds: ALL_TOPPING_IDS },
    { id: "P8", category: "pizza", name: "Paneer Tikka", pricePaise: 34900, isVeg: true, allowedBaseIds: ALL_BASE_IDS, allowedToppingIds: ALL_TOPPING_IDS },
  ],
  toppings: [
    { id: "T1", category: "topping", name: "Black Olives", pricePaise: 4900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
    { id: "T2", category: "topping", name: "Extra Cheese", pricePaise: 6900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
    { id: "T3", category: "topping", name: "Button Mushrooms", pricePaise: 4900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
    { id: "T4", category: "topping", name: "Green Peppers", pricePaise: 3900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
    { id: "T5", category: "topping", name: "Jalapenos", pricePaise: 3900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
    { id: "T6", category: "topping", name: "Sun-Dried Tomatoes", pricePaise: 5900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
    { id: "T7", category: "topping", name: "Caramelised Onions", pricePaise: 4900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
    { id: "T8", category: "topping", name: "Sweet Corn", pricePaise: 3900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
    { id: "T9", category: "topping", name: "Roasted Garlic", pricePaise: 4900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
    { id: "T10", category: "topping", name: "Peri-Peri Drizzle", pricePaise: 5900, isVeg: true, allowedBaseIds: [], allowedToppingIds: [] },
  ],
};
