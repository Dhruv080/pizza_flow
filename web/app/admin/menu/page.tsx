"use client";

// Menu management: add items, edit name/price, and activate/deactivate —
// without touching a text file or writing SQL. Items are never hard-deleted
// (they may be referenced by historical orders); "Deactivate" just removes
// them from the customer-facing menu via is_active.

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
        load. No text file, no SQL, no redeploy.
      </p>

      {CATEGORIES.map(({ key, label }) => (
        <CategorySection
          key={key}
          category={key}
          label={label}
          items={items.filter((i) => i.category === key)}
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
  onChanged,
}: {
  category: MenuCategory;
  label: string;
  items: AdminMenuItem[];
  onChanged: () => void;
}) {
  const activeCount = items.filter((i) => i.isActive).length;

  return (
    <details className="card expander" open style={{ marginBottom: 16 }}>
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
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: "var(--muted)" }}>
                  No items yet.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <MenuItemRow key={item.id} item={item} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
        <AddItemForm category={category} onAdded={onChanged} />
      </div>
    </details>
  );
}

function MenuItemRow({ item, onChanged }: { item: AdminMenuItem; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(paiseToRupees(item.pricePaise)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const message = await updateMenuItem(item.id, { name, priceRupees: parseFloat(price) });
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
        <td colSpan={2}>
          {error && <span className="error-text">{error}</span>}
          <button className="btn btn-small" onClick={save} disabled={busy}>
            Save
          </button>{" "}
          <button
            className="btn btn-small btn-secondary"
            onClick={() => {
              setEditing(false);
              setName(item.name);
              setPrice(String(paiseToRupees(item.pricePaise)));
              setError("");
            }}
            disabled={busy}
          >
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr style={!item.isActive ? { opacity: 0.55 } : undefined}>
      <td>{item.name}</td>
      <td>{formatPaise(item.pricePaise)}</td>
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

function AddItemForm({ category, onAdded }: { category: MenuCategory; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const message = await createMenuItem({ category, name, priceRupees: parseFloat(price) });
    setBusy(false);
    if (message) setError(message);
    else {
      setName("");
      setPrice("");
      onAdded();
    }
  }

  return (
    <form onSubmit={add} className="add-item-row">
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
      <button className="btn btn-small" disabled={busy}>
        {busy ? "Adding…" : "Add"}
      </button>
      {error && <span className="error-text">{error}</span>}
    </form>
  );
}
