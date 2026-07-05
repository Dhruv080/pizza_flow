"use client";

// Admin dashboard: stats, all orders, and Today's Digest. Auth,
// navigation and the floating Insights chat widget live in app/admin/layout.tsx
// — this page renders only once a session is confirmed.

import { useEffect, useMemo, useState } from "react";
import { computeAggregates, computeRepeatCustomers, todaysOrders } from "@/lib/analytics";
import { formatDateTime, formatPaise, paiseToRupees } from "@/lib/format";
import { getEffectiveAiFeatures, getOrders, isDemoMode, getActiveOrders, getOutletSettings, saveOutletSettings, type ActiveOrderRecord } from "@/lib/data";
import { PAYMENT_MODES, type CompletedOrder, type PaymentMode, TABLE_COUNT } from "@/lib/types";
import { AdminDailyChart, type DailyPoint } from "@/components/AdminDailyChart";
import { requestDigestInChat } from "@/lib/insightsChatBus";

const PAGE_SIZE = 10;
const REPEAT_PAGE_SIZE = 5;
const CHART_DAYS = 14; // trailing window shown when the range is open-ended
const CHART_MAX_DAYS = 92; // guard so a huge custom range can't render 1000 bars

type StatPeriod = "today" | "7d" | "30d" | "all" | "custom";

const PERIOD_LABELS: Record<StatPeriod, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
  custom: "Custom range",
};

// Local yyyy-mm-dd for a date. The <input type="date"> fields, the table's
// "When" column (formatDateTime) and todaysOrders() all work in the browser's
// local timezone, so the range filter must too — slicing the UTC ISO string
// instead makes orders near midnight fall on the wrong calendar day.
function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Parse a "yyyy-mm-dd" key back into a local-midnight Date. `new Date(str)`
// would read it as UTC and shift a day west of Greenwich — do it by parts.
function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// yyyy-mm-dd bounds for a preset period, in local time — used to drive both the
// stat cards and the orders table's own date filter from the one dropdown.
function presetRange(period: Exclude<StatPeriod, "custom">): { from: string; to: string } {
  const today = localDateKey(new Date());
  if (period === "all") return { from: "", to: "" };
  if (period === "today") return { from: today, to: today };
  const days = period === "7d" ? 7 : 30;
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { from: localDateKey(from), to: today };
}

function ordersInRange(orders: CompletedOrder[], from: string, to: string): CompletedOrder[] {
  return orders.filter((o) => {
    const date = localDateKey(new Date(o.createdAt));
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}

interface WaitlistEntry {
  id: string;
  customerName: string;
  phone: string;
  groupSize: number;
  joinedAt: string; // ISO String
  timeOffsetMinutes: number; // for simulation
}

export default function AdminPage() {
  const [orders, setOrders] = useState<CompletedOrder[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"All" | PaymentMode>("All");
  const [statPeriod, setStatPeriod] = useState<StatPeriod>("today");
  const [dateFrom, setDateFrom] = useState(() => presetRange("today").from);
  const [dateTo, setDateTo] = useState(() => presetRange("today").to);
  const [page, setPage] = useState(0);
  const [repeatPage, setRepeatPage] = useState(0);
  const [digestEnabled, setDigestEnabled] = useState(true);

  // Dynamic role & outlet configuration
  const [role, setRole] = useState<"admin" | "manager" | null>(null);
  const [tableCount, setTableCount] = useState(TABLE_COUNT);
  const [outletLocation, setOutletLocation] = useState("New Ashok Nagar, Delhi");
  const [selectedRangeStart, setSelectedRangeStart] = useState(1);

  const tableRanges = useMemo(() => {
    const ranges = [];
    for (let i = 1; i <= tableCount; i += 10) {
      const end = Math.min(i + 9, tableCount);
      ranges.push({ start: i, end, label: `Tables ${i}-${end}` });
    }
    return ranges;
  }, [tableCount]);

  useEffect(() => {
    if (selectedRangeStart > tableCount) {
      setSelectedRangeStart(1);
    }
  }, [tableCount, selectedRangeStart]);

  // Live Table Occupancy & Waitlist Management States
  const [activeOrders, setActiveOrders] = useState<ActiveOrderRecord[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("pizzaflow_admin_waitlist");
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  
  const [manualTables, setManualTables] = useState<Record<number, { customerName: string; groupSize: number; seatedAt: string }>>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("pizzaflow_admin_manual_tables");
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  // Form & Interaction states
  const [newWaitName, setNewWaitName] = useState("");
  const [newWaitPhone, setNewWaitPhone] = useState("");
  const [newWaitSize, setNewWaitSize] = useState(2);
  const [waitFormError, setWaitFormError] = useState("");

  const [manualTableForm, setManualTableForm] = useState<number | null>(null);
  const [manualTableName, setManualTableName] = useState("");
  const [manualTableSize, setManualTableSize] = useState(2);

  const [aiOfferModal, setAiOfferModal] = useState<{
    entry: WaitlistEntry;
    loading: boolean;
    data?: { message: string; suggestedIncentive: string; waitTier: string; isAi: boolean };
    error?: string;
  } | null>(null);

  const [seatingModal, setSeatingModal] = useState<WaitlistEntry | null>(null);
  const [tick, setTick] = useState(0);
  const [copiedText, setCopiedText] = useState(false);

  const handleCopyMessage = (text: string) => {
    if (typeof window !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Local Storage Persistence
  useEffect(() => {
    localStorage.setItem("pizzaflow_admin_waitlist", JSON.stringify(waitlist));
  }, [waitlist]);

  useEffect(() => {
    localStorage.setItem("pizzaflow_admin_manual_tables", JSON.stringify(manualTables));
  }, [manualTables]);

  const reloadActiveOrders = () => {
    getActiveOrders()
      .then(setActiveOrders)
      .catch((err) => console.error("Could not load active orders", err));
  };

  useEffect(() => {
    reloadActiveOrders();
    const interval = setInterval(reloadActiveOrders, 10000);
    return () => clearInterval(reloadActiveOrders);
  }, []);

  // Tick for re-rendering elapsed minutes live
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  // Live Waitlist & Seating Helpers
  const getElapsedMinutes = (isoString: string, offset = 0) => {
    const diffMs = Date.now() - new Date(isoString).getTime();
    return Math.max(0, Math.floor(diffMs / 60000) + offset);
  };

  const handleAddWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    setWaitFormError("");
    
    const name = newWaitName.trim();
    const phone = newWaitPhone.trim();
    
    if (name.length < 2 || name.length > 40) {
      setWaitFormError("Name must be between 2 and 40 characters.");
      return;
    }
    const phoneRegex = /^[6789]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      setWaitFormError("Phone must be exactly 10 digits starting with 6, 7, 8, or 9.");
      return;
    }
    if (newWaitSize < 1 || newWaitSize > 20) {
      setWaitFormError("Group size must be between 1 and 20.");
      return;
    }

    const newEntry: WaitlistEntry = {
      id: "wait_" + Math.random().toString(36).slice(2, 9),
      customerName: name,
      phone,
      groupSize: newWaitSize,
      joinedAt: new Date().toISOString(),
      timeOffsetMinutes: 0,
    };

    setWaitlist((prev) => [...prev, newEntry]);
    setNewWaitName("");
    setNewWaitPhone("");
    setNewWaitSize(2);
  };

  const handleSimulateWaitTime = (id: string, amount: number) => {
    setWaitlist((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? { ...entry, timeOffsetMinutes: entry.timeOffsetMinutes + amount }
          : entry
      )
    );
  };

  const handleRemoveWaitlist = (id: string) => {
    setWaitlist((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleSeatFromWaitlist = (entry: WaitlistEntry, tableNo: number) => {
    setManualTables((prev) => ({
      ...prev,
      [tableNo]: {
        customerName: entry.customerName,
        groupSize: entry.groupSize,
        seatedAt: new Date().toISOString(),
      },
    }));
    setWaitlist((prev) => prev.filter((item) => item.id !== entry.id));
    setSeatingModal(null);
  };

  const handleSeatWalkInDirect = (tableNo: number) => {
    const name = manualTableName.trim();
    if (!name) return;
    
    setManualTables((prev) => ({
      ...prev,
      [tableNo]: {
        customerName: name,
        groupSize: manualTableSize,
        seatedAt: new Date().toISOString(),
      },
    }));
    setManualTableForm(null);
    setManualTableName("");
    setManualTableSize(2);
  };

  const handleReleaseTable = (tableNo: number) => {
    setManualTables((prev) => {
      const copy = { ...prev };
      delete copy[tableNo];
      return copy;
    });
  };

  const getOfferDetails = (minutes: number) => {
    if (minutes > 45) {
      return {
        tier: "VIP Elite",
        incentive: "25% OFF Bill + Free Toppings & Starter 👑",
        colorClass: "badge-vip",
      };
    } else if (minutes > 30) {
      return {
        tier: "Gold Premium",
        incentive: "15% OFF Bill + Free Welcome Drink 🥤",
        colorClass: "badge-gold",
      };
    } else if (minutes > 20) {
      return {
        tier: "Silver Plus",
        incentive: "Free Fresh Garlic Bread & Cheese Dip 🫓",
        colorClass: "badge-silver-plus",
      };
    } else if (minutes > 10) {
      return {
        tier: "Silver",
        incentive: "Free Fresh Garlic Bread 🫓",
        colorClass: "badge-silver",
      };
    }
    return {
      tier: "Bronze",
      incentive: "Complimentary Soft Drink on Seating 🥤",
      colorClass: "badge-bronze",
    };
  };

  const handleTriggerAiOffer = async (entry: WaitlistEntry) => {
    const minutes = getElapsedMinutes(entry.joinedAt, entry.timeOffsetMinutes);
    setAiOfferModal({ entry, loading: true });
    
    try {
      const response = await fetch("/api/ai/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: entry.customerName,
          waitedMinutes: minutes,
          groupSize: entry.groupSize,
          currentOccupancy: Object.keys(manualTables).length + activeOrders.length,
          totalCapacity: tableCount,
        }),
      });
      if (!response.ok) throw new Error("Could not connect to service");
      const data = await response.json();
      setAiOfferModal({ entry, loading: false, data });
    } catch (err: any) {
      setAiOfferModal({
        entry,
        loading: false,
        error: err.message || "Failed to generate AI offer details.",
      });
    }
  };

  // The period dropdown is the one control for both the stat cards and the
  // orders table below: picking a preset sets the date range; editing a date
  // field directly switches the dropdown to "Custom range" so the two stay in sync.
  function selectPeriod(next: StatPeriod) {
    setStatPeriod(next);
    if (next !== "custom") {
      const { from, to } = presetRange(next);
      setDateFrom(from);
      setDateTo(to);
    }
  }

  function editDate(which: "from" | "to", value: string) {
    if (which === "from") setDateFrom(value);
    else setDateTo(value);
    setStatPeriod("custom");
  }

  useEffect(() => {
    getOrders()
      .then(setOrders)
      .catch((error: Error) => setLoadError(error.message));
    getEffectiveAiFeatures()
      .then((features) => setDigestEnabled(features.digest))
      .catch(() => {});
    getOutletSettings()
      .then((settings) => {
        let tc = settings.tableCount;
        if (tc === 10) {
          tc = 30;
          // save and persist it
          saveOutletSettings({ ...settings, tableCount: 30 }).catch(() => {});
        }
        setTableCount(tc);
        setOutletLocation(settings.location);
      })
      .catch(() => {});

    // Sync role from localStorage
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("pizzaflow_admin_role") || "admin";
      setRole(saved as "admin" | "manager");
      
      const handleRoleUpdate = () => {
        const current = localStorage.getItem("pizzaflow_admin_role") || "admin";
        setRole(current as "admin" | "manager");
      };
      
      window.addEventListener("storage", handleRoleUpdate);
      const interval = setInterval(handleRoleUpdate, 1000);
      
      return () => {
        window.removeEventListener("storage", handleRoleUpdate);
        clearInterval(interval);
      };
    }
  }, []);

  useEffect(() => {
    setPage(0);
  }, [search, paymentFilter, dateFrom, dateTo]);

  const today = useMemo(() => (orders ? computeAggregates(todaysOrders(orders)) : null), [orders]);
  const periodStats = useMemo(
    () => (orders ? computeAggregates(ordersInRange(orders, dateFrom, dateTo)) : null),
    [orders, dateFrom, dateTo],
  );

  // The chart spans the same date range as the stats and table. When the range
  // is open-ended ("All time" / no "from"), it falls back to a trailing
  // CHART_DAYS window ending at "to" so it stays readable rather than plotting
  // the entire history.
  const dailySeries = useMemo<DailyPoint[]>(() => {
    if (!orders) return [];
    const byDate = new Map<string, { pizzas: number; revenue: number; discount: number }>();
    for (const order of orders) {
      const date = localDateKey(new Date(order.createdAt));
      const entry = byDate.get(date) ?? { pizzas: 0, revenue: 0, discount: 0 };
      entry.pizzas += order.lines.reduce((sum, line) => sum + line.quantity, 0);
      entry.revenue += paiseToRupees(order.totalPaise);
      entry.discount += paiseToRupees(order.discountPaise);
      byDate.set(date, entry);
    }

    const toDate = dateTo ? parseDateKey(dateTo) : new Date();
    let fromDate: Date;
    if (dateFrom) {
      fromDate = parseDateKey(dateFrom);
    } else {
      fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - (CHART_DAYS - 1));
    }
    const floor = new Date(toDate);
    floor.setDate(floor.getDate() - (CHART_MAX_DAYS - 1));
    if (fromDate < floor) fromDate = floor;

    const series: DailyPoint[] = [];
    for (const d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const key = localDateKey(d);
      const entry = byDate.get(key) ?? { pizzas: 0, revenue: 0, discount: 0 };
      series.push({ date: key, ...entry });
    }
    return series;
  }, [orders, dateFrom, dateTo]);

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    const q = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (paymentFilter !== "All" && order.paymentMode !== paymentFilter) return false;
      const orderDate = localDateKey(new Date(order.createdAt));
      if (dateFrom && orderDate < dateFrom) return false;
      if (dateTo && orderDate > dateTo) return false;
      if (!q) return true;
      const haystack = [
        order.customerName,
        order.phone,
        order.tableNumber != null ? `table ${order.tableNumber}` : "",
        ...order.lines.map((line) => line.pizzaName),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, search, paymentFilter, dateFrom, dateTo]);

  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const pagedOrders = filteredOrders.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const repeatCustomers = useMemo(() => (orders ? computeRepeatCustomers(orders) : []), [orders]);
  const repeatPageCount = Math.max(1, Math.ceil(repeatCustomers.length / REPEAT_PAGE_SIZE));
  const repeatPageClamped = Math.min(repeatPage, repeatPageCount - 1);
  const pagedRepeatCustomers = repeatCustomers.slice(
    repeatPageClamped * REPEAT_PAGE_SIZE,
    repeatPageClamped * REPEAT_PAGE_SIZE + REPEAT_PAGE_SIZE,
  );

  if (loadError) return <div className="banner banner-error">Could not load orders: {loadError}</div>;
  if (!orders || !today || !periodStats) return <p className="page-sub">Loading orders…</p>;

  return (
    <>
      {role === "manager" ? (
        <>
          <h1>Restaurant Manager Console – {outletLocation}</h1>
          <p className="page-sub">Coordinate weekend rush hour table allocation ({tableCount} tables), track active orders, and trigger personalized AI loyalty offers.</p>
        </>
      ) : (
        <>
          <h1>Admin dashboard – {outletLocation}</h1>
          <p className="page-sub">Every order, every rupee — live from the database.</p>
          {isDemoMode && (
            <div className="banner banner-demo">
              <strong>Demo mode:</strong> no Supabase configured — login is bypassed and orders come
              from this browser&apos;s storage.
            </div>
          )}

          <div className="stat-row-head">
            {statPeriod === "custom" && (
              <div className="stat-head-dates">
                <label className="filter-date-field">
                  From
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => editDate("from", e.target.value)}
                  />
                </label>
                <label className="filter-date-field">
                  To
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => editDate("to", e.target.value)}
                  />
                </label>
              </div>
            )}
            <select
              className="select"
              value={statPeriod}
              onChange={(e) => selectPeriod(e.target.value as StatPeriod)}
            >
              {(Object.keys(PERIOD_LABELS) as StatPeriod[]).map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div className="stat-row">
            <div className="stat">
              <div className="stat-label">Orders</div>
              <div className="stat-value">{periodStats.orderCount}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Revenue</div>
              <div className="stat-value">{formatPaise(Math.round(periodStats.totalRevenue * 100))}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Avg order value</div>
              <div className="stat-value">{formatPaise(Math.round(periodStats.averageOrderValue * 100))}</div>
            </div>
            <div className="stat stat-highlight">
              <div className="stat-label">Discounts given</div>
              <div className="stat-value">{formatPaise(Math.round(periodStats.totalDiscountGiven * 100))}</div>
              <div className="stat-sub">
                {periodStats.totalRevenue > 0
                  ? `${((periodStats.totalDiscountGiven / periodStats.totalRevenue) * 100).toFixed(1)}% of revenue`
                  : "—"}
              </div>
            </div>
          </div>

          <div className="admin-grid">
            <AdminDailyChart data={dailySeries} />

            {digestEnabled && <DigestCard todayAggregates={today} />}
          </div>
        </>
      )}

      {/* Dine-In Tables & Waitlist System */}
      <div className="card dine-in-waitlist-card" id="dine-in-waitlist-system" style={{ marginTop: 24, padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "16px", marginBottom: "20px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: "600" }}>Outlet Seating & Waitlist Manager</h2>
            <p className="page-sub" style={{ margin: "4px 0 0 0" }}>
              Coordinate weekend rush hour table allocation ({tableCount} tables), track active orders, and trigger personalized AI loyalty offers.
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <span className="badge badge-occupied" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(220, 38, 38, 0.1)", color: "#dc2626", padding: "4px 10px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "500" }}>
              ● {Object.keys(manualTables).length + activeOrders.filter(o => o.tableNumber).length} Seated / Busy
            </span>
            <span className="badge badge-vacant" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(22, 163, 74, 0.1)", color: "#16a34a", padding: "4px 10px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "500" }}>
              ● {Math.max(0, tableCount - (Object.keys(manualTables).length + activeOrders.filter(o => o.tableNumber).length))} Free
            </span>
            <span className="badge badge-waiting" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(234, 88, 12, 0.1)", color: "#ea580c", padding: "4px 10px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "500" }}>
              ● {waitlist.length} Waiting Queue
            </span>
          </div>
        </div>

        <div className="table-waitlist-grid">
          {/* Left Column: Table Map */}
          <div className="tables-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "12px", flexWrap: "wrap" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "600", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                🪑 Dine-In Layout ({tableCount} Tables)
              </h3>
              {tableCount > 10 && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: "500" }}>Select Range:</span>
                  <select
                    className="select"
                    style={{ padding: "4px 12px", fontSize: "0.85rem", width: "auto", margin: 0, height: "auto", minHeight: "32px" }}
                    value={selectedRangeStart}
                    onChange={(e) => setSelectedRangeStart(Number(e.target.value))}
                  >
                    {tableRanges.map((r) => (
                      <option key={r.start} value={r.start}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="tables-grid-30">
              {Array.from({ length: Math.min(10, tableCount - selectedRangeStart + 1) }, (_, index) => {
                const tableNo = selectedRangeStart + index;
                // Check if table is occupied by a database active order
                const activeOrder = activeOrders.find((o) => o.tableNumber === tableNo);
                // Check if table is occupied manually
                const manualSeated = manualTables[tableNo];

                const isOccupied = !!activeOrder || !!manualSeated;
                const customerName = activeOrder ? activeOrder.customerName : (manualSeated ? manualSeated.customerName : "");
                const groupSize = manualSeated ? manualSeated.groupSize : null;
                const billTotal = activeOrder ? activeOrder.totalPaise : null;
                const seatedAt = activeOrder ? activeOrder.createdAt : (manualSeated ? manualSeated.seatedAt : null);
                const elapsed = seatedAt ? getElapsedMinutes(seatedAt) : 0;

                return (
                  <div
                    key={tableNo}
                    className={`table-card ${isOccupied ? (activeOrder ? "status-order-active" : "status-manual-seated") : "status-vacant"}`}
                    style={{
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      padding: "12px",
                      borderRadius: "8px",
                      minHeight: "115px",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span className="table-number" style={{ fontWeight: "700", fontSize: "1.1rem" }}>
                        T-{tableNo}
                      </span>
                      {isOccupied && (
                        <span style={{ fontSize: "0.7rem", fontWeight: "600", textTransform: "uppercase", padding: "2px 5px", borderRadius: "4px", background: activeOrder ? "rgba(220, 38, 38, 0.1)" : "rgba(37, 99, 235, 0.1)", color: activeOrder ? "#dc2626" : "#2563eb" }}>
                          {activeOrder ? "Tablet" : "Walk-in"}
                        </span>
                      )}
                    </div>

                    {isOccupied ? (
                      <div style={{ margin: "6px 0", flexGrow: 1 }}>
                        <div style={{ fontWeight: "600", fontSize: "0.85rem", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }} title={customerName}>
                          👤 {customerName}
                        </div>
                        {groupSize && (
                          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                            👥 Group size: {groupSize}
                          </div>
                        )}
                        {billTotal !== null && (
                          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "#16a34a" }}>
                            🍕 Bill: {formatPaise(billTotal)}
                          </div>
                        )}
                        <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "2px" }}>
                          ⏱️ Seated {elapsed} min{elapsed !== 1 ? "s" : ""} ago
                        </div>
                      </div>
                    ) : (
                      <div style={{ margin: "12px 0", textAlign: "center", color: "var(--muted)", fontSize: "0.75rem" }}>
                        Vacant Table
                      </div>
                    )}

                    <div style={{ marginTop: "4px" }}>
                      {isOccupied ? (
                        <button
                          className="btn btn-small"
                          style={{
                            width: "100%",
                            padding: "4px",
                            fontSize: "0.75rem",
                            background: "rgba(220, 38, 38, 0.08)",
                            color: "#dc2626",
                            border: "1px solid rgba(220, 38, 38, 0.2)"
                          }}
                          onClick={() => handleReleaseTable(tableNo)}
                        >
                          Clear Table
                        </button>
                      ) : (
                        <button
                          className="btn btn-small btn-secondary"
                          style={{ width: "100%", padding: "4px", fontSize: "0.75rem" }}
                          onClick={() => {
                            setManualTableForm(tableNo);
                            setManualTableName("");
                            setManualTableSize(2);
                          }}
                        >
                          Seat Walk-In
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Waitlist Panel */}
          <div className="waitlist-section" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              📝 Add to Waitlist
            </h3>
            
            <form onSubmit={handleAddWaitlist} style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
              <div>
                <input
                  type="text"
                  placeholder="Customer Name"
                  className="input"
                  style={{ width: "100%" }}
                  value={newWaitName}
                  onChange={(e) => setNewWaitName(e.target.value)}
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Phone Number (10 digits)"
                  className="input"
                  style={{ width: "100%" }}
                  value={newWaitPhone}
                  onChange={(e) => setNewWaitPhone(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--muted)", whiteSpace: "nowrap" }}>Group Size:</span>
                <select
                  className="select"
                  style={{ flexGrow: 1 }}
                  value={newWaitSize}
                  onChange={(e) => setNewWaitSize(Number(e.target.value))}
                >
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} Guest{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>
              
              {waitFormError && (
                <div style={{ color: "#dc2626", fontSize: "0.75rem", fontWeight: "500" }}>
                  ⚠️ {waitFormError}
                </div>
              )}

              <button className="btn" type="submit" style={{ width: "100%", padding: "8px" }}>
                Add to Waitlist Queue
              </button>
            </form>

            <h3 style={{ fontSize: "1.1rem", fontWeight: "600", borderTop: "1px solid var(--border)", paddingTop: "16px", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>👥 Waiting Queue</span>
              <span style={{ fontSize: "0.8rem", fontWeight: "500", color: "var(--muted)" }}>{waitlist.length} Group{waitlist.length !== 1 ? "s" : ""}</span>
            </h3>

            {waitlist.length === 0 ? (
              <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
                The queue is empty. All waiting customers seated!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "400px", overflowY: "auto" }}>
                {[...waitlist]
                  .sort((a, b) => {
                    const elapsedA = getElapsedMinutes(a.joinedAt, a.timeOffsetMinutes);
                    const elapsedB = getElapsedMinutes(b.joinedAt, b.timeOffsetMinutes);
                    return elapsedB - elapsedA; // Longest wait first
                  })
                  .map((entry) => {
                    const minutes = getElapsedMinutes(entry.joinedAt, entry.timeOffsetMinutes);
                    const offer = getOfferDetails(minutes);

                    return (
                      <div
                        key={entry.id}
                        className="wait-item"
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          padding: "10px",
                          background: "var(--bg-page)",
                          position: "relative"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontWeight: "700", fontSize: "0.9rem" }}>{entry.customerName}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{entry.phone} · {entry.groupSize} Guests</div>
                          </div>
                          <span
                            className="time-badge"
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: "700",
                              color: minutes > 30 ? "#dc2626" : (minutes > 15 ? "#ea580c" : "var(--muted)")
                            }}
                          >
                            ⏱️ {minutes}m wait
                          </span>
                        </div>

                        {/* Loyalty Offer Badge & Incentive */}
                        <div style={{ margin: "8px 0", background: "rgba(0,0,0,0.02)", padding: "6px", borderRadius: "4px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span className={`offer-badge ${offer.colorClass}`} style={{ fontSize: "0.65rem", padding: "2px 6px", borderRadius: "4px", fontWeight: "700", textTransform: "uppercase" }}>
                              {offer.tier} Tier
                            </span>
                            <span style={{ fontSize: "0.75rem", fontWeight: "600" }}>Offer:</span>
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-color)", fontWeight: "500", marginTop: "2px" }}>
                            {offer.incentive}
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "8px" }}>
                          <button
                            className="btn btn-small"
                            style={{ flexGrow: 1, padding: "4px", fontSize: "0.75rem", background: "#16a34a", color: "#fff" }}
                            onClick={() => setSeatingModal(entry)}
                          >
                            Seat Customer
                          </button>
                          
                          <button
                            className="btn btn-small btn-secondary"
                            style={{ padding: "4px" }}
                            title="Generate Hospitable AI Apology Message"
                            onClick={() => handleTriggerAiOffer(entry)}
                          >
                            ✦ AI Offer
                          </button>
                        </div>

                        {/* Cancel button */}
                        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", borderTop: "1px dashed var(--border)", marginTop: "8px", paddingTop: "6px" }}>
                          <button
                            style={{ background: "transparent", border: "none", color: "#dc2626", fontSize: "0.7rem", cursor: "pointer", fontWeight: "500" }}
                            onClick={() => handleRemoveWaitlist(entry.id)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Seat Walk-In Table Direct */}
      {manualTableForm !== null && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div className="card" style={{ width: "100%", maxWidth: "360px", margin: "16px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1rem" }}>Direct Seating: Table T-{manualTableForm}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <label>
                <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Customer Name</span>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%", marginTop: "4px" }}
                  placeholder="e.g. Rahul Sharma"
                  value={manualTableName}
                  onChange={(e) => setManualTableName(e.target.value)}
                />
              </label>
              <label>
                <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Group Size</span>
                <select
                  className="select"
                  style={{ width: "100%", marginTop: "4px" }}
                  value={manualTableSize}
                  onChange={(e) => setManualTableSize(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} Guest{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                <button
                  className="btn"
                  style={{ flexGrow: 1 }}
                  onClick={() => handleSeatWalkInDirect(manualTableForm)}
                  disabled={!manualTableName.trim()}
                >
                  Confirm Seating
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setManualTableForm(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Seat Waiting Guest to a Free Table */}
      {seatingModal !== null && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div className="card" style={{ width: "100%", maxWidth: "420px", margin: "16px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 4px 0", fontSize: "1.1rem" }}>Seat {seatingModal.customerName}</h3>
            <p className="page-sub" style={{ margin: "0 0 16px 0" }}>
              Allocate one of our {tableCount} tables to this party of {seatingModal.groupSize} guest{seatingModal.groupSize !== 1 ? "s" : ""}.
            </p>
            
            <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "6px", padding: "10px", marginBottom: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px" }}>
                {Array.from({ length: tableCount }, (_, index) => {
                  const tableNo = index + 1;
                  const activeOrder = activeOrders.find((o) => o.tableNumber === tableNo);
                  const manualSeated = manualTables[tableNo];
                  const isOccupied = !!activeOrder || !!manualSeated;

                  return (
                    <button
                      key={tableNo}
                      className={`btn btn-small ${isOccupied ? "btn-secondary" : ""}`}
                      style={{
                        padding: "8px 0",
                        fontWeight: "700",
                        fontSize: "0.85rem",
                        background: isOccupied ? "rgba(0,0,0,0.05)" : "#16a34a",
                        color: isOccupied ? "var(--muted)" : "#fff",
                        cursor: isOccupied ? "not-allowed" : "pointer"
                      }}
                      disabled={isOccupied}
                      onClick={() => handleSeatFromWaitlist(seatingModal, tableNo)}
                    >
                      T-{tableNo}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setSeatingModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Hospitable AI Apology / Compensation Copilot */}
      {aiOfferModal !== null && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div className="card ai-panel" style={{ width: "100%", maxWidth: "500px", margin: "16px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
                ✦ AI Hospitality Assistant
              </h3>
              <span className="ai-sparkle" aria-hidden="true">✦</span>
            </div>

            {aiOfferModal.loading ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)" }}>
                <div className="ai-pulse" style={{ marginBottom: "10px", fontSize: "1.2rem" }}>Generating personalized apology & gesture...</div>
                <p className="ai-note" style={{ margin: 0 }}>Consulting hospitality algorithms based on {getElapsedMinutes(aiOfferModal.entry.joinedAt, aiOfferModal.entry.timeOffsetMinutes)}m wait time...</p>
              </div>
            ) : aiOfferModal.error ? (
              <div style={{ padding: "12px", background: "rgba(220, 38, 38, 0.05)", border: "1px solid rgba(220, 38, 38, 0.1)", borderRadius: "6px", color: "#dc2626", fontSize: "0.85rem" }}>
                <strong>Error:</strong> {aiOfferModal.error}
              </div>
            ) : (
              <div>
                <p className="ai-note" style={{ marginTop: 0, marginBottom: "16px" }}>
                  Below is an AI-generated, high-hospitality text message to copy and send to the customer via SMS/WhatsApp, or read out to them with absolute warmth.
                </p>

                <div style={{ border: "1px solid var(--border)", borderRadius: "8px", background: "var(--bg-page)", padding: "16px", position: "relative", marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px dashed var(--border)", paddingBottom: "8px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase" }}>
                      Wait Tier: <span className="text-accent">{aiOfferModal.data?.waitTier}</span>
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                      {aiOfferModal.data?.isAi ? "Generated by Gemini AI" : "Local Rule Match"}
                    </span>
                  </div>

                  <blockquote style={{ margin: 0, fontSize: "0.9rem", fontStyle: "italic", lineHeight: "1.5", color: "var(--text-color)" }}>
                    &ldquo;{aiOfferModal.data?.message}&rdquo;
                  </blockquote>

                  <div style={{ marginTop: "12px", background: "rgba(22, 163, 74, 0.05)", border: "1px solid rgba(22, 163, 74, 0.1)", padding: "8px", borderRadius: "6px", fontSize: "0.8rem", color: "#16a34a", fontWeight: "600" }}>
                    🎁 Incentive Locked: {aiOfferModal.data?.suggestedIncentive}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    className="btn btn-small"
                    onClick={() => handleCopyMessage(aiOfferModal.data?.message || "")}
                  >
                    {copiedText ? "✓ Copied to clipboard!" : "📋 Copy Message"}
                  </button>
                  <button className="btn btn-small btn-secondary" onClick={() => setAiOfferModal(null)}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {role !== "manager" && (
        <>
          <div className="card">
            <h2>All orders</h2>
        <div className="filter-bar">
          <input
            type="text"
            placeholder="Search name, phone, table, pizza…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="select"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as "All" | PaymentMode)}
          >
            <option value="All">All payments</option>
            {PAYMENT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
          {(search || paymentFilter !== "All") && (
            <button
              className="btn btn-small btn-secondary"
              onClick={() => {
                setSearch("");
                setPaymentFilter("All");
              }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="table-scroll">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>When</th>
                <th>Table</th>
                <th>Customer</th>
                <th>Units</th>
                <th>Items ordered</th>
                <th>GST</th>
                <th>Discount</th>
                <th>Total</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ color: "var(--muted)" }}>
                    {orders.length === 0 ? "No orders yet." : "No orders match your filters."}
                  </td>
                </tr>
              )}
              {pagedOrders.map((order) => (
                <tr key={order.id}>
                  <td title={order.id}>
                    <code>{order.id.slice(0, 8).toUpperCase()}</code>
                  </td>
                  <td>{formatDateTime(order.createdAt)}</td>
                  <td>{order.tableNumber ?? "—"}</td>
                  <td>
                    {order.customerName}
                    <small>{order.phone}</small>
                  </td>
                  <td>{order.lines.reduce((sum, line) => sum + line.quantity, 0)}</td>
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
                  <td>{formatPaise(order.gstPaise)}</td>
                  <td>{order.discountPaise > 0 ? formatPaise(order.discountPaise) : "—"}</td>
                  <td>
                    <strong>{formatPaise(order.totalPaise)}</strong>
                  </td>
                  <td>{order.paymentMode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredOrders.length > 0 && (
          <div className="pagination-bar">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredOrders.length)} of{" "}
              {filteredOrders.length}
            </span>
            <div className="pagination-controls">
              <button
                className="btn btn-small btn-secondary"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Prev
              </button>
              <span>
                Page {page + 1} of {pageCount}
              </span>
              <button
                className="btn btn-small btn-secondary"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Top repeat customers</h2>
        <p className="page-sub">Every customer, grouped by phone number and ranked by visit count.</p>
        <div className="table-scroll">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Visits</th>
                <th>Last visit</th>
              </tr>
            </thead>
            <tbody>
              {repeatCustomers.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: "var(--muted)" }}>
                    No customers yet.
                  </td>
                </tr>
              )}
              {pagedRepeatCustomers.map((customer) => (
                <tr key={customer.phone}>
                  <td>{customer.name}</td>
                  <td>{customer.phone}</td>
                  <td>
                    <strong>{customer.visitCount}</strong>
                  </td>
                  <td>{formatDateTime(customer.lastVisitAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {repeatCustomers.length > 0 && (
          <div className="pagination-bar">
            <span>
              {repeatPageClamped * REPEAT_PAGE_SIZE + 1}–
              {Math.min((repeatPageClamped + 1) * REPEAT_PAGE_SIZE, repeatCustomers.length)} of{" "}
              {repeatCustomers.length}
            </span>
            <div className="pagination-controls">
              <button
                className="btn btn-small btn-secondary"
                onClick={() => setRepeatPage((p) => Math.max(0, p - 1))}
                disabled={repeatPageClamped === 0}
              >
                Prev
              </button>
              <span>
                Page {repeatPageClamped + 1} of {repeatPageCount}
              </span>
              <button
                className="btn btn-small btn-secondary"
                onClick={() => setRepeatPage((p) => Math.min(repeatPageCount - 1, p + 1))}
                disabled={repeatPageClamped >= repeatPageCount - 1}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )}

  <style>{`
        .table-waitlist-grid {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 1024px) {
          .table-waitlist-grid {
            grid-template-columns: 1fr;
          }
        }
        .tables-grid-30 {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 12px;
        }
        .table-card {
          border-radius: 8px;
          padding: 12px;
          transition: all 0.2s ease-in-out;
        }
        .status-vacant {
          border: 1px dashed var(--border);
          background: var(--bg-card);
          color: var(--text-muted);
        }
        .status-vacant:hover {
          border-color: var(--accent);
          background: rgba(var(--accent-rgb), 0.02);
        }
        .status-order-active {
          border: 2px solid #dc2626 !important;
          background: rgba(220, 38, 38, 0.03);
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.05);
        }
        .status-manual-seated {
          border: 1.5px solid #2563eb !important;
          background: rgba(37, 99, 235, 0.03);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.05);
        }
        .badge-vip {
          background: #fef3c7 !important;
          color: #d97706 !important;
          border: 1px solid #fcd34d;
        }
        .badge-gold {
          background: #fffbeb !important;
          color: #b45309 !important;
          border: 1px solid #fef3c7;
        }
        .badge-silver-plus {
          background: #f1f5f9 !important;
          color: #475569 !important;
          border: 1px solid #cbd5e1;
        }
        .badge-silver {
          background: #fafafa !important;
          color: #666666 !important;
          border: 1px solid #e5e5e5;
        }
        .badge-bronze {
          background: #fff7ed !important;
          color: #c2410c !important;
          border: 1px solid #ffedd5;
        }
      `}</style>
    </>
  );
}

function topSellerName(aggregates: ReturnType<typeof computeAggregates>): string {
  const entries = Object.entries(aggregates.pizzasSold);
  if (entries.length === 0) return "—";
  return entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
}

function paymentSplitLabel(aggregates: ReturnType<typeof computeAggregates>): string {
  const total = aggregates.orderCount;
  if (total === 0) return "—";
  const parts = PAYMENT_MODES.map((mode) => {
    const count = aggregates.byPaymentMode[mode]?.orders ?? 0;
    return count > 0 ? `${mode} ${Math.round((count / total) * 100)}%` : null;
  }).filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function DigestCard({ todayAggregates }: { todayAggregates: ReturnType<typeof computeAggregates> }) {
  const [unavailable, setUnavailable] = useState(false);

  // The report is written into the Insights chat popup (see InsightsChatWidget)
  // rather than in a box here, so the manager reads it in the same place they
  // ask follow-up questions. requestDigestInChat returns false only if that
  // widget isn't mounted (the copilot is off) — then we say so.
  function openReport() {
    setUnavailable(!requestDigestInChat());
  }

  return (
    <div className="card ai-panel digest-sidebar">
      <h3>
        Today&apos;s digest <span className="ai-sparkle" aria-hidden="true">✦</span>
      </h3>
      <p className="ai-note">
        One click, one manager&apos;s report on today&apos;s trading — revenue, top sellers,
        discounts given, GST collected, payment split, and anything unusual. It opens in the
        Copilot chat so you can ask follow-ups.
      </p>
      <div className="digest-stats">
        <div className="digest-stat-row">
          <span>Top seller</span>
          <strong>{topSellerName(todayAggregates)}</strong>
        </div>
        <div className="digest-stat-row">
          <span>GST collected</span>
          <strong>{formatPaise(Math.round(todayAggregates.totalGstCollected * 100))}</strong>
        </div>
        <div className="digest-stat-row">
          <span>Payment split</span>
          <strong>{paymentSplitLabel(todayAggregates)}</strong>
        </div>
      </div>
      <button className="btn" style={{ marginTop: 10, width: "100%" }} onClick={openReport}>
        Write today&apos;s report
      </button>
      {unavailable && (
        <p className="error-text">Turn on the Insights copilot to read the report in chat.</p>
      )}
    </div>
  );
}
