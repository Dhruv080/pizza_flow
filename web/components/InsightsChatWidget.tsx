"use client";

// Floating "Ask your business anything" widget — the Owner Insights Copilot,
// available from any admin screen (dashboard, menu management, settings) as
// a pizza-slice bubble in the corner. It fetches and aggregates orders
// itself on first open, so it doesn't depend on which page it's mounted on.

import { useEffect, useState } from "react";
import { computeAggregates, type OrderAggregates } from "@/lib/analytics";
import { getOrders } from "@/lib/data";

type ChatEntry = { role: "q" | "a"; text: string };

export default function InsightsChatWidget() {
  const [open, setOpen] = useState(false);
  const [aggregates, setAggregates] = useState<OrderAggregates | null>(null);
  const [loadError, setLoadError] = useState("");
  const [question, setQuestion] = useState("");
  const [log, setLog] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || aggregates || loadError) return;
    getOrders()
      .then((orders) => setAggregates(computeAggregates(orders)))
      .catch((error: Error) => setLoadError(error.message));
  }, [open, aggregates, loadError]);

  async function ask(text?: string) {
    const q = (text ?? question).trim();
    if (!q || busy || !aggregates) return;
    setBusy(true);
    setQuestion("");
    setLog((prev) => [...prev, { role: "q", text: q }]);
    try {
      const response = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, aggregates }),
      });
      const payload = await response.json();
      setLog((prev) => [
        ...prev,
        { role: "a", text: response.ok ? payload.answer : payload.error ?? "Unavailable right now." },
      ]);
    } catch {
      setLog((prev) => [...prev, { role: "a", text: "The copilot is unavailable right now." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="chat-fab"
        aria-label={open ? "Close business copilot" : "Ask your business anything"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "✕" : "🍕"}
      </button>

      {open && (
        <div className="chat-popup card">
          <div className="chat-popup-head">
            <h3>
              Ask your business anything <span className="ai-tag">AI</span>
            </h3>
            <button className="cart-remove" onClick={() => setOpen(false)}>
              close
            </button>
          </div>

          {loadError && <div className="banner banner-error">Could not load orders: {loadError}</div>}
          {!loadError && !aggregates && <p className="page-sub">Loading your sales data…</p>}

          {aggregates && (
            <>
              <div className="chat-log">
                {log.length === 0 && (
                  <p className="ai-note">
                    Try:{" "}
                    <button className="cart-remove" onClick={() => ask("Which pizza sells most?")}>
                      Which pizza sells most?
                    </button>{" "}
                    ·{" "}
                    <button className="cart-remove" onClick={() => ask("What did discounts cost me?")}>
                      What did discounts cost me?
                    </button>{" "}
                    ·{" "}
                    <button className="cart-remove" onClick={() => ask("Which table orders the most?")}>
                      Busiest table?
                    </button>
                  </p>
                )}
                {log.map((entry, index) => (
                  <div key={index} className={`chat-msg ${entry.role === "q" ? "chat-q" : "chat-a"}`}>
                    {entry.text}
                  </div>
                ))}
                {busy && <div className="chat-msg chat-a spinner">thinking…</div>}
              </div>
              <div className="ai-input-row">
                <input
                  type="text"
                  placeholder='e.g. "Which pizza sells most on weekends?"'
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ask()}
                  disabled={busy}
                />
                <button className="btn btn-small" onClick={() => ask()} disabled={busy || !question.trim()}>
                  Ask
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
