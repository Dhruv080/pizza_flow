"use client";

// Menu management: add items, edit name/price, and activate/deactivate —
// without touching a text file or writing SQL. Items are never hard-deleted
// (they may be referenced by historical orders); "Deactivate" just removes
// them from the customer-facing menu via is_active.
//
// Pizzas also carry allowed-base/allowed-topping lists here: an id NOT in a
// pizza's list is not orderable with it (see MenuItem in lib/types.ts). This
// is the only place those lists are edited; the customer ordering page just
// reads and enforces them.

import { useEffect, useState } from "react";
import { formatPaise, paiseToRupees } from "@/lib/format";
import {
  getAllMenuItems,
  createMenuItem,
  updateMenuItem,
  setMenuItemActive,
  type AdminMenuItem,
} from "@/lib/data";
import type { MenuCategory } from "@/lib/types";

const CATEGORIES: { key: MenuCategory; label: string }[] = [
  { key: "base", label: "Bases" },
  { key: "pizza", label: "Pizzas" },
  { key: "topping", label: "Toppings" },
];

function VegTag({ isVeg }: { isVeg: boolean }) {
  return (
    <span className="veg-tag">
      <span className={`veg-dot ${isVeg ? "" : "nonveg"}`} aria-hidden="true" />
      {isVeg ? "Veg" : "Non-veg"}
    </span>
  );
}

/** "All bases" when every base is allowed, otherwise a count — for the compact read-only summary. */
function summarizeAllowed(count: number, total: number, noun: string): string {
  if (total === 0) return `0 ${noun}`;
  return count === total ? `All ${noun}` : `${count} ${noun}`;
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

function ComboChips({
  label,
  options,
  selectedIds,
  onToggle,
}: {
  label: string;
  options: AdminMenuItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <p className="step-label" style={{ marginBottom: 4 }}>
        {label}
      </p>
      {options.length === 0 ? (
        <p className="page-sub" style={{ margin: 0 }}>
          None yet.
        </p>
      ) : (
        <div className="chip-row">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`chip ${selectedIds.includes(opt.id) ? "selected" : ""}`}
              onClick={() => onToggle(opt.id)}
            >
              {selectedIds.includes(opt.id) ? "✓ " : "+ "}
              {opt.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MenuManagementPage() {
  const [items, setItems] = useState<AdminMenuItem[] | null>(null);
  const [loadError, setLoadError] = useState("");

  function reload() {
    getAllMenuItems()
      .then(setItems)
      .catch((error: Error) => setLoadError(error.message));
  }

  useEffect(reload, []);

  if (loadError) return <div className="banner banner-error">Could not load the menu: {loadError}</div>;
  if (!items) return <p className="page-sub">Loading menu items…</p>;

  return (
    <>
      <h1>Menu management</h1>
      <p className="page-sub">
        Add, rename, reprice, or retire items — customers see the change on their next page
        load. No text file, no SQL, no redeploy. For pizzas, also pick which bases and
        toppings customers may combine it with.
      </p>

      {CATEGORIES.map(({ key, label }) => (
        <CategorySection
          key={key}
          category={key}
          label={label}
          items={items.filter((i) => i.category === key)}
          allItems={items}
          onChanged={reload}
        />
      ))}
    </>
  );
}

function CategorySection({
  category,
  label,
  items,
  allItems,
  onChanged,
}: {
  category: MenuCategory;
  label: string;
  items: AdminMenuItem[];
  allItems: AdminMenuItem[];
  onChanged: () => void;
}) {
  const activeCount = items.filter((i) => i.isActive).length;
  const bases = allItems.filter((i) => i.category === "base");
  const toppings = allItems.filter((i) => i.category === "topping");

  return (
    <details className="card expander" style={{ marginBottom: 16 }}>
      <summary className="expander-summary">
        <h2 style={{ margin: 0 }}>{label}</h2>
        <span className="expander-count">
          {activeCount} active · {items.length} total
        </span>
      </summary>
      <div className="expander-body">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Price</th>
              <th>Type</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>
                  No items yet.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <MenuItemRow key={item.id} item={item} bases={bases} toppings={toppings} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
        <AddItemForm category={category} bases={bases} toppings={toppings} onAdded={onChanged} />
      </div>
    </details>
  );
}

function MenuItemRow({
  item,
  bases,
  toppings,
  onChanged,
}: {
  item: AdminMenuItem;
  bases: AdminMenuItem[];
  toppings: AdminMenuItem[];
  onChanged: () => void;
}) {
  const isPizza = item.category === "pizza";
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(paiseToRupees(item.pricePaise)));
  const [isVeg, setIsVeg] = useState(item.isVeg);
  const [allowedBaseIds, setAllowedBaseIds] = useState<string[]>(item.allowedBaseIds);
  const [allowedToppingIds, setAllowedToppingIds] = useState<string[]>(item.allowedToppingIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function resetFields() {
    setName(item.name);
    setPrice(String(paiseToRupees(item.pricePaise)));
    setIsVeg(item.isVeg);
    setAllowedBaseIds(item.allowedBaseIds);
    setAllowedToppingIds(item.allowedToppingIds);
    setError("");
  }

  async function save() {
    setBusy(true);
    setError("");
    const message = await updateMenuItem(item.id, {
      name,
      priceRupees: parseFloat(price),
      isVeg,
      ...(isPizza ? { allowedBaseIds, allowedToppingIds } : {}),
    });
    setBusy(false);
    if (message) setError(message);
    else {
      setEditing(false);
      onChanged();
    }
  }

  async function toggleActive() {
    setBusy(true);
    setError("");
    const message = await setMenuItemActive(item.id, !item.isActive);
    setBusy(false);
    if (message) setError(message);
    else onChanged();
  }

  if (editing) {
    return (
      <>
        <tr>
          <td>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </td>
          <td>
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              style={{ width: 90 }}
            />
          </td>
          <td>
            <select
              className="select"
              value={isVeg ? "veg" : "nonveg"}
              onChange={(e) => setIsVeg(e.target.value === "veg")}
              style={{ width: 110 }}
            >
              <option value="veg">Veg</option>
              <option value="nonveg">Non-veg</option>
            </select>
          </td>
          <td colSpan={2}>
            {error && <span className="error-text">{error}</span>}
            <button className="btn btn-small" onClick={save} disabled={busy}>
              Save
            </button>{" "}
            <button
              className="btn btn-small btn-secondary"
              onClick={() => {
                setEditing(false);
                resetFields();
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </td>
        </tr>
        {isPizza && (
          <tr>
            <td colSpan={5}>
              <ComboChips
                label="Allowed bases (at least one required)"
                options={bases}
                selectedIds={allowedBaseIds}
                onToggle={(id) => setAllowedBaseIds((prev) => toggleId(prev, id))}
              />
              <ComboChips
                label="Allowed toppings"
                options={toppings}
                selectedIds={allowedToppingIds}
                onToggle={(id) => setAllowedToppingIds((prev) => toggleId(prev, id))}
              />
            </td>
          </tr>
        )}
      </>
    );
  }

  return (
    <tr style={!item.isActive ? { opacity: 0.55 } : undefined}>
      <td>
        {item.name}
        {isPizza && (
          <div className="page-sub" style={{ fontSize: 12, marginTop: 2 }}>
            {summarizeAllowed(item.allowedBaseIds.length, bases.length, "bases")} ·{" "}
            {summarizeAllowed(item.allowedToppingIds.length, toppings.length, "toppings")}
          </div>
        )}
      </td>
      <td>{formatPaise(item.pricePaise)}</td>
      <td>
        <VegTag isVeg={item.isVeg} />
      </td>
      <td>{item.isActive ? "Active" : "Deactivated"}</td>
      <td>
        {error && <span className="error-text">{error}</span>}
        <button className="btn btn-small" onClick={() => setEditing(true)}>
          Edit
        </button>{" "}
        <button className="btn btn-small btn-secondary" onClick={toggleActive} disabled={busy}>
          {item.isActive ? "Deactivate" : "Activate"}
        </button>
      </td>
    </tr>
  );
}

function AddItemForm({
  category,
  bases,
  toppings,
  onAdded,
}: {
  category: MenuCategory;
  bases: AdminMenuItem[];
  toppings: AdminMenuItem[];
  onAdded: () => void;
}) {
  const isPizza = category === "pizza";
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [isVeg, setIsVeg] = useState(true);
  const [allowedBaseIds, setAllowedBaseIds] = useState<string[]>(bases.map((b) => b.id));
  const [allowedToppingIds, setAllowedToppingIds] = useState<string[]>(toppings.map((t) => t.id));
  const [allowOnAllPizzas, setAllowOnAllPizzas] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const message = await createMenuItem({
      category,
      name,
      priceRupees: parseFloat(price),
      isVeg,
      ...(isPizza ? { allowedBaseIds, allowedToppingIds } : { allowOnAllPizzas }),
    });
    setBusy(false);
    if (message) setError(message);
    else {
      setName("");
      setPrice("");
      setIsVeg(true);
      setAllowedBaseIds(bases.map((b) => b.id));
      setAllowedToppingIds(toppings.map((t) => t.id));
      setAllowOnAllPizzas(true);
      onAdded();
    }
  }

  return (
    <form onSubmit={add} className="add-item-row" style={{ flexWrap: "wrap" }}>
      <input
        type="text"
        placeholder="New item name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        type="text"
        inputMode="decimal"
        placeholder="Price ₹"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        style={{ width: 100 }}
        required
      />
      <select
        className="select"
        value={isVeg ? "veg" : "nonveg"}
        onChange={(e) => setIsVeg(e.target.value === "veg")}
        style={{ width: 110 }}
      >
        <option value="veg">Veg</option>
        <option value="nonveg">Non-veg</option>
      </select>
      {!isPizza && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={allowOnAllPizzas}
            onChange={(e) => setAllowOnAllPizzas(e.target.checked)}
          />
          Allow on all pizzas
        </label>
      )}
      <button className="btn btn-small" disabled={busy}>
        {busy ? "Adding…" : "Add"}
      </button>
      {error && <span className="error-text">{error}</span>}
      {isPizza && (
        <div style={{ width: "100%", marginTop: 8 }}>
          <ComboChips
            label="Allowed bases (at least one required)"
            options={bases}
            selectedIds={allowedBaseIds}
            onToggle={(id) => setAllowedBaseIds((prev) => toggleId(prev, id))}
          />
          <ComboChips
            label="Allowed toppings"
            options={toppings}
            selectedIds={allowedToppingIds}
            onToggle={(id) => setAllowedToppingIds((prev) => toggleId(prev, id))}
          />
        </div>
      )}
    </form>
  );
}
