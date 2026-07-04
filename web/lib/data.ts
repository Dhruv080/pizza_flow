// Data layer. One interface, two backends:
//   - Supabase (production): menu_items / orders / order_items / order_item_toppings
//   - Demo mode (no env vars): bundled menu + localStorage orders
// Pages call these functions and never know which backend is live.

import { computeBill } from "./billing";
import { DEFAULT_MODEL, isValidModelSlug } from "./aiCatalog";
import { DEMO_MENU } from "./demoMenu";
import { rupeesToPaise, paiseToRupees } from "./format";
import {
  AI_FEATURES,
  MAX_CUSTOM_INSTRUCTIONS,
  composeSystemPrompt,
  sanitizeCustomInstructions,
  type AiFeature,
} from "./prompts";
import { getSupabase, getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { generateUUID } from "./uuid";
import type { CartLine, CompletedOrder, Menu, MenuCategory, MenuItem, PaymentMode } from "./types";

const DEMO_ORDERS_KEY = "pizzaflow_demo_orders";

export const isDemoMode = !isSupabaseConfigured;

/** Turn raw PostgREST errors into messages staff can act on. */
function dbError(context: string, error: { code?: string; message: string }): Error {
  // PGRST2xx = table missing from the schema cache: the Supabase project
  // exists but schema.sql / seed.sql were never run in it.
  if (error.code?.startsWith("PGRST2") || error.message.includes("schema cache")) {
    return new Error(
      `${context}: the Supabase project is connected but its database tables have not been ` +
        "created yet. Run supabase/schema.sql and then supabase/seed.sql in the Supabase " +
        "dashboard (SQL Editor > New query), then refresh this page."
    );
  }
  return new Error(`${context}: ${error.message}`);
}

// ---------------------------------------------------------------- menu

function menuFromItems(items: AdminMenuItem[]): Menu {
  const active = items.filter((i) => i.isActive);
  return {
    bases: active.filter((i) => i.category === "base"),
    pizzas: active.filter((i) => i.category === "pizza"),
    toppings: active.filter((i) => i.category === "topping"),
  };
}

export async function getMenu(): Promise<Menu> {
  if (isDemoMode) return menuFromItems(loadDemoMenuItems());

  const { data, error } = await getSupabase()
    .from("menu_items")
    .select("id, category, name, price")
    .eq("is_active", true)
    .order("category")
    .order("name");
  if (error) throw dbError("Could not load the menu", error);

  const toItem = (row: { id: string; category: string; name: string; price: number }): MenuItem => ({
    id: row.id,
    category: row.category as MenuItem["category"],
    name: row.name,
    pricePaise: rupeesToPaise(row.price),
  });

  const items = (data ?? []).map(toItem);
  const menu: Menu = {
    bases: items.filter((i) => i.category === "base"),
    pizzas: items.filter((i) => i.category === "pizza"),
    toppings: items.filter((i) => i.category === "topping"),
  };
  if (!menu.bases.length || !menu.pizzas.length || !menu.toppings.length) {
    throw new Error("The menu is incomplete — bases, pizzas and toppings must all exist.");
  }
  return menu;
}

// ------------------------------------------------------- menu management
// Full CRUD for the admin "Menu management" screen. Unlike getMenu() (active
// items only, grouped for ordering), this returns every item — active or not
// — for editing. Soft-delete only (is_active toggle): menu items are
// referenced by historical order_items, and hard-deleting one that has ever
// been ordered would violate the foreign key.

export interface AdminMenuItem {
  id: string;
  category: MenuCategory;
  name: string;
  pricePaise: number;
  isActive: boolean;
}

const DEMO_MENU_ITEMS_KEY = "pizzaflow_demo_menu_items";

function seedDemoMenuItems(): AdminMenuItem[] {
  return [...DEMO_MENU.bases, ...DEMO_MENU.pizzas, ...DEMO_MENU.toppings].map((item) => ({
    ...item,
    isActive: true,
  }));
}

function loadDemoMenuItems(): AdminMenuItem[] {
  if (typeof localStorage === "undefined") return seedDemoMenuItems();
  try {
    const raw = localStorage.getItem(DEMO_MENU_ITEMS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through to reseed */
  }
  const seeded = seedDemoMenuItems();
  localStorage.setItem(DEMO_MENU_ITEMS_KEY, JSON.stringify(seeded));
  return seeded;
}

function saveDemoMenuItems(items: AdminMenuItem[]): void {
  localStorage.setItem(DEMO_MENU_ITEMS_KEY, JSON.stringify(items));
}

function validateMenuItemInput(name: string, price: number): string | null {
  if (!name.trim()) return "Name cannot be empty.";
  if (name.trim().length > 40) return "Name must be at most 40 characters.";
  if (!Number.isFinite(price) || price <= 0) return "Price must be a positive number.";
  return null;
}

export async function getAllMenuItems(): Promise<AdminMenuItem[]> {
  if (isDemoMode) return loadDemoMenuItems();

  const { data, error } = await getSupabase()
    .from("menu_items")
    .select("id, category, name, price, is_active")
    .order("category")
    .order("name");
  if (error) throw dbError("Could not load menu items", error);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    pricePaise: rupeesToPaise(row.price),
    isActive: row.is_active,
  }));
}

export async function createMenuItem(input: {
  category: MenuCategory;
  name: string;
  priceRupees: number;
}): Promise<string | null> {
  const validationError = validateMenuItemInput(input.name, input.priceRupees);
  if (validationError) return validationError;
  const name = input.name.trim();

  if (isDemoMode) {
    const items = loadDemoMenuItems();
    if (items.some((i) => i.category === input.category && i.name.toLowerCase() === name.toLowerCase())) {
      return "An item with this name already exists in this category.";
    }
    items.push({
      id: generateUUID(),
      category: input.category,
      name,
      pricePaise: rupeesToPaise(input.priceRupees),
      isActive: true,
    });
    saveDemoMenuItems(items);
    return null;
  }

  const { error } = await getSupabase()
    .from("menu_items")
    .insert({ category: input.category, name, price: input.priceRupees });
  if (!error) return null;
  if (error.code === "23505") return "An item with this name already exists in this category.";
  return error.message;
}

export async function updateMenuItem(
  id: string,
  input: { name: string; priceRupees: number }
): Promise<string | null> {
  const validationError = validateMenuItemInput(input.name, input.priceRupees);
  if (validationError) return validationError;
  const name = input.name.trim();

  if (isDemoMode) {
    const items = loadDemoMenuItems();
    const item = items.find((i) => i.id === id);
    if (!item) return "Item not found.";
    item.name = name;
    item.pricePaise = rupeesToPaise(input.priceRupees);
    saveDemoMenuItems(items);
    return null;
  }

  const { error } = await getSupabase()
    .from("menu_items")
    .update({ name, price: input.priceRupees })
    .eq("id", id);
  if (!error) return null;
  if (error.code === "23505") return "An item with this name already exists in this category.";
  return error.message;
}

export async function setMenuItemActive(id: string, isActive: boolean): Promise<string | null> {
  if (isDemoMode) {
    const items = loadDemoMenuItems();
    const item = items.find((i) => i.id === id);
    if (!item) return "Item not found.";
    item.isActive = isActive;
    saveDemoMenuItems(items);
    return null;
  }
  const { error } = await getSupabase().from("menu_items").update({ is_active: isActive }).eq("id", id);
  return error ? error.message : null;
}

// ---------------------------------------------------------------- orders

export async function createOrder(params: {
  customerName: string;
  phone: string;
  tableNumber: number;
  lines: CartLine[];
  paymentMode: PaymentMode;
  sessionStartedAt: string;
}): Promise<CompletedOrder> {
  const bill = computeBill(params.lines);
  const order: CompletedOrder = {
    id: generateUUID(),
    createdAt: new Date().toISOString(),
    sessionStartedAt: params.sessionStartedAt,
    customerName: params.customerName,
    phone: params.phone,
    tableNumber: params.tableNumber,
    lines: params.lines.map((line) => ({
      baseName: line.base.name,
      pizzaName: line.pizza.name,
      toppingNames: line.toppings.map((t) => t.name),
      quantity: line.quantity,
      unitPricePaise:
        line.base.pricePaise +
        line.pizza.pricePaise +
        line.toppings.reduce((s, t) => s + t.pricePaise, 0),
      lineTotalPaise:
        (line.base.pricePaise +
          line.pizza.pricePaise +
          line.toppings.reduce((s, t) => s + t.pricePaise, 0)) *
        line.quantity,
    })),
    subtotalPaise: bill.subtotalPaise,
    discountPaise: bill.discountPaise,
    gstPaise: bill.gstPaise,
    totalPaise: bill.totalPaise,
    paymentMode: params.paymentMode,
  };

  if (isDemoMode) {
    const existing = loadDemoOrders();
    existing.unshift(order);
    localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(existing));
    return order;
  }

  // RLS note: the anon role may INSERT orders but can never SELECT them, so
  // these inserts must not use `.select()` (RETURNING would be checked against
  // the SELECT policy and rejected). All ids are generated client-side instead.
  const supabase = getSupabase();
  const { error: orderError } = await supabase.from("orders").insert({
    id: order.id,
    created_at: order.createdAt,
    customer_name: order.customerName,
    phone: order.phone,
    table_number: order.tableNumber,
    session_started_at: order.sessionStartedAt,
    subtotal: paiseToRupees(order.subtotalPaise),
    discount: paiseToRupees(order.discountPaise),
    gst: paiseToRupees(order.gstPaise),
    total: paiseToRupees(order.totalPaise),
    payment_mode: order.paymentMode,
  });
  if (orderError) throw dbError("Could not save the order", orderError);

  const itemRows = params.lines.map((line) => ({
    id: generateUUID(),
    order_id: order.id,
    base_id: line.base.id,
    pizza_id: line.pizza.id,
    base_name: line.base.name,
    pizza_name: line.pizza.name,
    quantity: line.quantity,
    unit_price: paiseToRupees(
      line.base.pricePaise +
        line.pizza.pricePaise +
        line.toppings.reduce((s, t) => s + t.pricePaise, 0)
    ),
  }));
  const { error: itemError } = await supabase.from("order_items").insert(itemRows);
  if (itemError) throw dbError("Could not save an order line", itemError);

  const toppingRows = params.lines.flatMap((line, index) =>
    line.toppings.map((t) => ({
      order_item_id: itemRows[index].id,
      topping_id: t.id,
      topping_name: t.name,
      price: paiseToRupees(t.pricePaise),
    }))
  );
  if (toppingRows.length) {
    const { error: topError } = await supabase.from("order_item_toppings").insert(toppingRows);
    if (topError) throw dbError("Could not save toppings", topError);
  }

  return order;
}

export async function getOrders(): Promise<CompletedOrder[]> {
  if (isDemoMode) return loadDemoOrders();

  const { data, error } = await getSupabase()
    .from("orders")
    .select(
      `id, created_at, session_started_at, customer_name, phone, table_number,
       subtotal, discount, gst, total, payment_mode,
       order_items ( base_name, pizza_name, quantity, unit_price,
         order_item_toppings ( topping_name ) )`
    )
    .order("created_at", { ascending: false });
  if (error) throw dbError("Could not load orders", error);

  return (data ?? []).map((row: any): CompletedOrder => ({
    id: row.id,
    createdAt: row.created_at,
    sessionStartedAt: row.session_started_at,
    customerName: row.customer_name,
    phone: row.phone,
    tableNumber: row.table_number ?? null,
    lines: (row.order_items ?? []).map((item: any) => ({
      baseName: item.base_name,
      pizzaName: item.pizza_name,
      toppingNames: (item.order_item_toppings ?? []).map((t: any) => t.topping_name),
      quantity: item.quantity,
      unitPricePaise: rupeesToPaise(item.unit_price),
      lineTotalPaise: rupeesToPaise(item.unit_price) * item.quantity,
    })),
    subtotalPaise: rupeesToPaise(row.subtotal),
    discountPaise: rupeesToPaise(row.discount),
    gstPaise: rupeesToPaise(row.gst),
    totalPaise: rupeesToPaise(row.total),
    paymentMode: row.payment_mode,
  }));
}

function loadDemoOrders(): CompletedOrder[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DEMO_ORDERS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- settings

export interface OutletSettings {
  name: string;
  location: string;
  phone: string;
}

export const DEFAULT_OUTLET: OutletSettings = {
  name: "SliceMatic",
  location: "New Ashok Nagar, Delhi",
  phone: "",
};

const DEMO_SETTINGS_KEY = "pizzaflow_demo_settings";

export async function getOutletSettings(): Promise<OutletSettings> {
  if (isDemoMode) {
    try {
      return { ...DEFAULT_OUTLET, ...JSON.parse(localStorage.getItem(DEMO_SETTINGS_KEY) ?? "{}") };
    } catch {
      return DEFAULT_OUTLET;
    }
  }
  // Branding must never take the ordering page down: fall back to defaults.
  const { data, error } = await getSupabase().from("settings").select("key, value");
  if (error || !data) return DEFAULT_OUTLET;
  const map = Object.fromEntries(data.map((row: { key: string; value: string }) => [row.key, row.value]));
  return {
    name: map.outlet_name?.trim() || DEFAULT_OUTLET.name,
    location: map.outlet_location?.trim() || DEFAULT_OUTLET.location,
    phone: map.outlet_phone?.trim() || DEFAULT_OUTLET.phone,
  };
}

export async function saveOutletSettings(settings: OutletSettings): Promise<string | null> {
  const name = settings.name.trim();
  const location = settings.location.trim();
  const phone = settings.phone.trim();
  if (!name) return "The outlet name cannot be empty.";
  if (name.length > 40) return "The outlet name must be at most 40 characters.";
  if (location.length > 200) return "The address must be at most 200 characters.";
  if (phone.length > 20) return "The phone number must be at most 20 characters.";

  if (isDemoMode) {
    localStorage.setItem(DEMO_SETTINGS_KEY, JSON.stringify({ name, location, phone }));
    return null;
  }
  const { error } = await getSupabase()
    .from("settings")
    .upsert([
      { key: "outlet_name", value: name },
      { key: "outlet_location", value: location },
      { key: "outlet_phone", value: phone },
    ]);
  return error ? error.message : null;
}

// ------------------------------------------------------------- AI kill switch
// A single toggle that turns off all four AI features at once — the answer
// to "what if this misbehaves, or you just want it off for a while". It is
// enforced in TWO places: the UI hides the AI panels (this module, read by
// the pages), and every /api/ai/* route re-checks it server-side before
// calling OpenRouter, so it cannot be bypassed by calling the API directly.

const DEMO_AI_ENABLED_KEY = "pizzaflow_demo_ai_enabled";

export async function isAiEnabled(): Promise<boolean> {
  if (isDemoMode) {
    // API routes run server-side even in demo mode and have no localStorage;
    // default to enabled there. The browser-side toggle still hides the UI.
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(DEMO_AI_ENABLED_KEY) !== "false";
  }
  const { data, error } = await getSupabase()
    .from("settings")
    .select("value")
    .eq("key", "ai_enabled")
    .maybeSingle();
  if (error || !data) return true; // absent row = enabled (default-on)
  return data.value !== "false";
}

export async function setAiEnabled(enabled: boolean): Promise<string | null> {
  if (isDemoMode) {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DEMO_AI_ENABLED_KEY, String(enabled));
    }
    return null;
  }
  const { error } = await getSupabase()
    .from("settings")
    .upsert({ key: "ai_enabled", value: String(enabled) });
  return error ? error.message : null;
}

// --------------------------------------------------- per-feature AI controls
// Three finer-grained AI settings layered on top of the master kill switch,
// all stored as key/value rows in the same `settings` table (demo mode keeps
// them in localStorage):
//   * ai_feature_<name>  — a per-feature on/off flag (default on)
//   * ai_model           — the OpenRouter model id (default: env / DEFAULT_MODEL)
//   * ai_custom_<name>   — optional owner "custom instructions" for a feature.
//                          NOT the full prompt: the base prompts stay hidden in
//                          lib/prompts.ts and this text is folded into them,
//                          fenced and lower-priority, at request time.
// Everything is enforced server-side in the /api/ai/* routes, never trusted
// from the client. A feature is live only when the master switch AND its own
// flag are on.

const DEMO_AI_FEATURES_KEY = "pizzaflow_demo_ai_features";
const DEMO_AI_MODEL_KEY = "pizzaflow_demo_ai_model";
const DEMO_AI_CUSTOM_KEY = "pizzaflow_demo_ai_custom";

const featureFlagKey = (feature: AiFeature) => `ai_feature_${feature}`;
const customKey = (feature: AiFeature) => `ai_custom_${feature}`;

/** Read several settings rows at once, keyed by their `key`. */
async function getSettingsMap(keys: string[]): Promise<Record<string, string>> {
  const { data, error } = await getSupabase().from("settings").select("key, value").in("key", keys);
  if (error || !data) return {};
  return Object.fromEntries(data.map((row: { key: string; value: string }) => [row.key, row.value]));
}

function allFeaturesEnabled(): Record<AiFeature, boolean> {
  return Object.fromEntries(AI_FEATURES.map((f) => [f, true])) as Record<AiFeature, boolean>;
}

export async function getAiFeatureFlags(): Promise<Record<AiFeature, boolean>> {
  const flags = allFeaturesEnabled();
  if (isDemoMode) {
    if (typeof localStorage === "undefined") return flags;
    try {
      const raw = localStorage.getItem(DEMO_AI_FEATURES_KEY);
      if (raw) return { ...flags, ...JSON.parse(raw) };
    } catch {
      /* fall through to defaults */
    }
    return flags;
  }
  const map = await getSettingsMap(AI_FEATURES.map(featureFlagKey));
  for (const feature of AI_FEATURES) {
    const value = map[featureFlagKey(feature)];
    if (value !== undefined) flags[feature] = value !== "false";
  }
  return flags;
}

export async function setAiFeatureFlag(feature: AiFeature, enabled: boolean): Promise<string | null> {
  if (isDemoMode) {
    if (typeof localStorage !== "undefined") {
      const flags = await getAiFeatureFlags();
      flags[feature] = enabled;
      localStorage.setItem(DEMO_AI_FEATURES_KEY, JSON.stringify(flags));
    }
    return null;
  }
  const { error } = await getSupabase()
    .from("settings")
    .upsert({ key: featureFlagKey(feature), value: String(enabled) });
  return error ? error.message : null;
}

/** Server-side gate for the routes: master switch AND the feature's own flag. */
export async function isAiFeatureEnabled(feature: AiFeature): Promise<boolean> {
  if (!(await isAiEnabled())) return false;
  return (await getAiFeatureFlags())[feature];
}

/**
 * Each feature's *effective* state (master switch AND its own flag), for
 * client UIs that decide whether to render a panel. The master switch off
 * forces every feature off.
 */
export async function getEffectiveAiFeatures(): Promise<Record<AiFeature, boolean>> {
  const [master, flags] = await Promise.all([isAiEnabled(), getAiFeatureFlags()]);
  if (!master) return Object.fromEntries(AI_FEATURES.map((f) => [f, false])) as Record<AiFeature, boolean>;
  return flags;
}

export async function getAiModel(): Promise<string> {
  // OPENROUTER_MODEL is a server-only env var (undefined in the browser, where
  // it simply resolves to DEFAULT_MODEL for display).
  const envDefault = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  if (isDemoMode) {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(DEMO_AI_MODEL_KEY) || envDefault;
    }
    return envDefault;
  }
  const map = await getSettingsMap(["ai_model"]);
  return map.ai_model?.trim() || envDefault;
}

export async function setAiModel(model: string): Promise<string | null> {
  const slug = model.trim();
  if (!isValidModelSlug(slug)) {
    return 'Enter a valid OpenRouter model id, e.g. "openai/gpt-4o-mini".';
  }
  if (isDemoMode) {
    if (typeof localStorage !== "undefined") localStorage.setItem(DEMO_AI_MODEL_KEY, slug);
    return null;
  }
  const { error } = await getSupabase().from("settings").upsert({ key: "ai_model", value: slug });
  return error ? error.message : null;
}

/**
 * Every feature's saved custom instructions (absent key = none). This is the
 * short owner-supplied text only — never the base prompt, which is never
 * stored and never leaves the server-side prompts module.
 */
export async function getAiCustomInstructions(): Promise<Partial<Record<AiFeature, string>>> {
  if (isDemoMode) {
    if (typeof localStorage === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(DEMO_AI_CUSTOM_KEY) ?? "{}");
    } catch {
      return {};
    }
  }
  const map = await getSettingsMap(AI_FEATURES.map(customKey));
  const custom: Partial<Record<AiFeature, string>> = {};
  for (const feature of AI_FEATURES) {
    const value = map[customKey(feature)];
    if (value != null && value !== "") custom[feature] = value;
  }
  return custom;
}

/**
 * The system prompt a route should actually use: the hidden base for the
 * feature with the owner's sanitised custom instructions folded in (fenced and
 * lower-priority). Data placeholders are left for the route to substitute.
 */
export async function getAiPrompt(feature: AiFeature): Promise<string> {
  const custom = (await getAiCustomInstructions())[feature];
  return composeSystemPrompt(feature, custom);
}

/**
 * Save the owner's custom instructions for a feature. The text is a *tweak*
 * layered onto the hidden base prompt — validated only for length, then
 * sanitised (fence/control-char stripping) before storage and again when
 * composed at request time.
 */
export async function setAiCustomInstructions(feature: AiFeature, text: string): Promise<string | null> {
  const notes = sanitizeCustomInstructions(text);
  if (!notes) return "Enter some instructions, or use Clear to remove them.";
  if (text.trim().length > MAX_CUSTOM_INSTRUCTIONS) {
    return `Keep custom instructions to at most ${MAX_CUSTOM_INSTRUCTIONS} characters.`;
  }
  if (isDemoMode) {
    if (typeof localStorage !== "undefined") {
      const all = await getAiCustomInstructions();
      all[feature] = notes;
      localStorage.setItem(DEMO_AI_CUSTOM_KEY, JSON.stringify(all));
    }
    return null;
  }
  const { error } = await getSupabase()
    .from("settings")
    .upsert({ key: customKey(feature), value: notes });
  return error ? error.message : null;
}

/** Clear the owner's custom instructions so the feature uses the base prompt as-is. */
export async function clearAiCustomInstructions(feature: AiFeature): Promise<string | null> {
  if (isDemoMode) {
    if (typeof localStorage !== "undefined") {
      const all = await getAiCustomInstructions();
      delete all[feature];
      localStorage.setItem(DEMO_AI_CUSTOM_KEY, JSON.stringify(all));
    }
    return null;
  }
  const { error } = await getSupabase().from("settings").delete().eq("key", customKey(feature));
  return error ? error.message : null;
}

// ------------------------------------------------------- OpenRouter API key
// The admin can set the OpenRouter API key from the UI instead of a Vercel env
// var. It is stored in a `secret_`-prefixed settings row that RLS hides from
// anon clients (see supabase/schema.sql), so it is NEVER returned by the public
// REST API. The customer-facing AI routes read it server-side with the
// service-role client, which bypasses RLS. If no key is stored (or the service
// role isn't configured yet), everything falls back to OPENROUTER_API_KEY.

const SECRET_OPENROUTER_KEY = "secret_openrouter_api_key";
const DEMO_AI_KEY_KEY = "pizzaflow_demo_openrouter_key";

/** Show only the last four characters — enough to confirm which key is saved. */
function maskKey(key: string): string {
  return key.length <= 4 ? "••••" : `••••••••${key.slice(-4)}`;
}

/** For the admin UI: the masked stored key, or null if none is saved. */
export async function getStoredOpenRouterKeyMasked(): Promise<string | null> {
  if (isDemoMode) {
    if (typeof localStorage === "undefined") return null;
    const key = localStorage.getItem(DEMO_AI_KEY_KEY);
    return key ? maskKey(key) : null;
  }
  // The signed-in admin is authenticated, so RLS lets this read the secret row.
  const { data } = await getSupabase()
    .from("settings")
    .select("value")
    .eq("key", SECRET_OPENROUTER_KEY)
    .maybeSingle();
  return data?.value ? maskKey(data.value) : null;
}

export async function setOpenRouterKey(key: string): Promise<string | null> {
  const trimmed = key.trim();
  if (trimmed.length < 20) return "That does not look like a valid OpenRouter API key.";
  if (trimmed.length > 200) return "The API key is too long.";
  if (isDemoMode) {
    if (typeof localStorage !== "undefined") localStorage.setItem(DEMO_AI_KEY_KEY, trimmed);
    return null;
  }
  const { error } = await getSupabase()
    .from("settings")
    .upsert({ key: SECRET_OPENROUTER_KEY, value: trimmed });
  return error ? error.message : null;
}

/** Remove the stored key so the routes fall back to OPENROUTER_API_KEY. */
export async function clearOpenRouterKey(): Promise<string | null> {
  if (isDemoMode) {
    if (typeof localStorage !== "undefined") localStorage.removeItem(DEMO_AI_KEY_KEY);
    return null;
  }
  const { error } = await getSupabase().from("settings").delete().eq("key", SECRET_OPENROUTER_KEY);
  return error ? error.message : null;
}

/**
 * Server-side only (AI routes): the OpenRouter key to use — the admin's stored
 * key if present, otherwise OPENROUTER_API_KEY. Reading the secret row needs the
 * service-role client (anon RLS hides it); without it we fall back to env.
 */
export async function getOpenRouterApiKey(): Promise<string | null> {
  const envKey = process.env.OPENROUTER_API_KEY ?? null;
  if (isDemoMode) return envKey;
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data } = await admin
      .from("settings")
      .select("value")
      .eq("key", SECRET_OPENROUTER_KEY)
      .maybeSingle();
    if (data?.value) return data.value;
  }
  return envKey;
}

// ---------------------------------------------------------------- account

export async function adminChangePassword(newPassword: string): Promise<string | null> {
  if (isDemoMode) return "Account settings require a configured Supabase project.";
  if (newPassword.length < 8) return "Password must be at least 8 characters.";
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  return error ? error.message : null;
}

export async function getAdminEmail(): Promise<string | null> {
  if (isDemoMode) return null;
  const { data } = await getSupabase().auth.getUser();
  return data.user?.email ?? null;
}

// ---------------------------------------------------------------- admin auth

// Supabase Auth is email-based; admins may also sign in with just the
// username part ("rajan" -> "rajan@slicematic.in").
const ADMIN_EMAIL_DOMAIN = "slicematic.in";

export async function adminSignIn(identifier: string, password: string): Promise<string | null> {
  if (isDemoMode) return null; // demo mode: dashboard is open, with a banner
  const trimmed = identifier.trim();
  const email = trimmed.includes("@") ? trimmed : `${trimmed}@${ADMIN_EMAIL_DOMAIN}`;
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

export async function adminSignOut(): Promise<void> {
  if (!isDemoMode) await getSupabase().auth.signOut();
}

export async function getAdminSession(): Promise<boolean> {
  if (isDemoMode) return true;
  const { data } = await getSupabase().auth.getSession();
  return Boolean(data.session);
}
