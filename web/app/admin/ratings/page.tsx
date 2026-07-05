"use client";

// Ratings: aggregates of the star ratings/feedback customers leave on the
// bill page after paying (see the "Rate your order" section in app/page.tsx).
// Read-only — no admin actions here, just the numbers.

import { useEffect, useState } from "react";
import { computePizzaRatingSummary } from "@/lib/analytics";
import { getOrderFeedback, isDemoMode, type OrderFeedbackRecord } from "@/lib/data";

export default function RatingsPage() {
  const [feedback, setFeedback] = useState<OrderFeedbackRecord[] | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    getOrderFeedback()
      .then(setFeedback)
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  if (loadError) return <div className="banner banner-error">Could not load ratings: {loadError}</div>;
  if (!feedback) return <p className="page-sub">Loading ratings…</p>;

  const summary = computePizzaRatingSummary(feedback);

  return (
    <>
      <h1>Ratings</h1>
      <p className="page-sub">What customers thought, straight from the bill-page feedback form.</p>
      {isDemoMode && (
        <div className="banner banner-demo">
          <strong>Demo mode:</strong> feedback comes from this browser&apos;s storage.
        </div>
      )}

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Feedback received</div>
          <div className="stat-value">{summary.feedbackCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Overall avg rating</div>
          <div className="stat-value">
            {summary.overallAvgRating != null ? `★ ${summary.overallAvgRating}` : "—"}
          </div>
          <div className="stat-sub">
            {summary.overallRatingCount > 0
              ? `from ${summary.overallRatingCount} rating${summary.overallRatingCount > 1 ? "s" : ""}`
              : "no overall ratings yet"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Pizzas rated</div>
          <div className="stat-value">{summary.pizzas.length}</div>
        </div>
      </div>

      <div className="card">
        <h2>Top rated pizzas</h2>
        <div className="table-scroll">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Pizza</th>
                <th>Avg rating</th>
                <th>Number of ratings</th>
              </tr>
            </thead>
            <tbody>
              {summary.pizzas.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: "var(--muted)" }}>
                    No ratings yet.
                  </td>
                </tr>
              )}
              {summary.pizzas.map((p) => (
                <tr key={p.pizzaName}>
                  <td>{p.pizzaName}</td>
                  <td>★ {p.avgRating}</td>
                  <td>{p.ratingCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
