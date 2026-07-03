"use client";

// The AI kill switch — turns off all four AI features (order assistant,
// upsell, insights copilot, end-of-day digest) with one toggle. Enforced
// server-side in every /api/ai/* route, not just hidden in the UI, so it
// cannot be bypassed by calling the API directly.

import { useEffect, useState } from "react";
import { isAiEnabled, setAiEnabled, isDemoMode } from "@/lib/data";

export default function AiSettingsPage() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    isAiEnabled().then((value) => {
      setEnabled(value);
      setLoaded(true);
    });
  }, []);

  async function toggle() {
    const next = !enabled;
    setEnabled(next); // optimistic
    setError("");
    const message = await setAiEnabled(next);
    if (message) {
      setError(message);
      setEnabled(!next); // revert
    }
  }

  return (
    <>
      <h1>AI settings</h1>
      <p className="page-sub">
        One switch for every AI feature. Ordering, billing, GST and payment are never
        affected — this only controls the AI panels.
      </p>

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="ai-toggle-row">
          <label className="switch">
            <input type="checkbox" checked={enabled} disabled={!loaded} onChange={toggle} />
            <span className="switch-track" />
          </label>
          <div>
            <strong>{enabled ? "AI features are ON" : "AI features are OFF"}</strong>
            <p className="page-sub" style={{ margin: 0 }}>
              {enabled
                ? "Customers see the chat-to-order assistant and topping suggestions; you have the insights copilot and end-of-day digest."
                : "All four AI panels are hidden from customers and admin. Every /api/ai/* call is also rejected server-side, even if called directly."}
            </p>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        {isDemoMode && (
          <p className="page-sub" style={{ marginTop: 10 }}>
            Demo mode: this toggle is stored in this browser only (no server-side enforcement
            without a configured Supabase project).
          </p>
        )}
      </div>

      <div className="card" style={{ maxWidth: 520, marginTop: 16 }}>
        <h3>What this affects</h3>
        <ul style={{ marginLeft: 18, fontSize: 13.5 }}>
          <li>Customer ordering page: &quot;Tell us what you feel like&quot; assistant and topping suggestions</li>
          <li>Admin dashboard: floating &quot;Ask your business anything&quot; copilot</li>
          <li>Admin dashboard: End-of-day digest</li>
        </ul>
      </div>
    </>
  );
}
