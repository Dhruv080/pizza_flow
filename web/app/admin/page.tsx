"use client";

// Admin dashboard: stats, all orders, and the End-of-Day Digest. Auth,
// navigation and the floating Insights chat widget live in app/admin/layout.tsx
// — this page renders only once a session is confirmed.

import { useEffect, useMemo, useState } from "react";
import { computeAggregates, todaysOrders } from "@/lib/analytics";
import { formatDateTime, formatPaise } from "@/lib/format";
import { getOrders, isDemoMode } from "@/lib/data";
import type { CompletedOrder } from "@/lib/types";

export default function AdminPage() {
  const [orders, setOrders] = useState<CompletedOrder[] | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    getOrders()
      .then(setOrders)
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  const aggregates = useMemo(() => (orders ? computeAggregates(orders) : null), [orders]);
  const today = useMemo(() => (orders ? computeAggregates(todaysOrders(orders)) : null), [orders]);

  if (loadError) return <div className="banner banner-error">Could not load orders: {loadError}</div>;
  if (!orders || !aggregates || !today) return <p className="page-sub">Loading orders…</p>;

  return (
    <>
      <h1>Admin dashboard</h1>
      <p className="page-sub">Every order, every rupee — live from the database.</p>
      {isDemoMode && (
        <div className="banner banner-demo">
          <strong>Demo mode:</strong> no Supabase configured — login is bypassed and orders come
          from this browser&apos;s storage.
        </div>
      )}

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Orders (all time)</div>
          <div className="stat-value">{aggregates.orderCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Revenue (all time)</div>
          <div className="stat-value">{formatPaise(Math.round(aggregates.totalRevenue * 100))}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Orders today</div>
          <div className="stat-value">{today.orderCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Revenue today</div>
          <div className="stat-value">{formatPaise(Math.round(today.totalRevenue * 100))}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Discounts given</div>
          <div className="stat-value">{formatPaise(Math.round(aggregates.totalDiscountGiven * 100))}</div>
        </div>
      </div>

      <div className="admin-grid">
        <div className="card">
          <h2>All orders</h2>
          <div className="table-scroll">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Table</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--muted)" }}>
                      No orders yet.
                    </td>
                  </tr>
                )}
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{formatDateTime(order.createdAt)}</td>
                    <td>{order.tableNumber ?? "—"}</td>
                    <td>
                      {order.customerName}
                      <small>{order.phone}</small>
                    </td>
                    <td>
                      {order.lines.map((line, i) => (
                        <div key={i}>
                          {line.quantity}× {line.pizzaName}
                          <small>
                            {line.baseName}
                            {line.toppingNames.length > 0 && ` · ${line.toppingNames.join(", ")}`}
                          </small>
                        </div>
                      ))}
                    </td>
                    <td>
                      <strong>{formatPaise(order.totalPaise)}</strong>
                      {order.discountPaise > 0 && <small>disc -{formatPaise(order.discountPaise)}</small>}
                      <small>GST {formatPaise(order.gstPaise)}</small>
                    </td>
                    <td>{order.paymentMode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DigestCard todayAggregates={today} />
      </div>
    </>
  );
}

function DigestCard({ todayAggregates }: { todayAggregates: ReturnType<typeof computeAggregates> }) {
  const [digest, setDigest] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ai/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aggregates: todayAggregates }),
      });
      const payload = await response.json();
      if (response.ok) setDigest(payload.digest);
      else setError(payload.error ?? "Unavailable right now.");
    } catch {
      setError("The digest writer is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card ai-panel digest-sidebar">
      <h3>
        End-of-day digest <span className="ai-tag">AI</span>
      </h3>
      <p className="ai-note">
        One click, one manager&apos;s report on today&apos;s trading — revenue, top sellers,
        discounts given, GST collected, payment split, and anything unusual.
      </p>
      <button className="btn" style={{ marginTop: 10, width: "100%" }} onClick={generate} disabled={busy}>
        {busy ? <span className="spinner">writing…</span> : "Write today's report"}
      </button>
      {error && <p className="error-text">{error}</p>}
      {digest && <div className="digest-box">{digest}</div>}
    </div>
  );
}
