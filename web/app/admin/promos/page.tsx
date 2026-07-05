"use client";

// Festival Promo Planner. Division of labour, same as every AI feature here:
//   rules  — the occasion calendar (lib/occasions.ts), the sales facts
//            (computePromoFacts) and the offer the owner picks are all
//            deterministic inputs;
//   the AI — only writes the WhatsApp broadcast copy from those inputs, and
//            the route re-validates every featured item against the menu.
// Publishing puts the approved text on the customer ordering page as a banner
// (settings row `promo_current`) — billing rules are never touched.

import { useEffect, useMemo, useState } from "react";
import {
  computePizzaRatingSummary,
  computePromoFacts,
  type PromoFacts,
} from "@/lib/analytics";
import {
  clearPublishedPromo,
  getAllMenuItems,
  getEffectiveAiFeatures,
  getOrderFeedback,
  getOrders,
  getPublishedPromo,
  isDemoMode,
  publishPromo,
  type AdminMenuItem,
  type PublishedPromo,
} from "@/lib/data";
import { upcomingOccasions, type UpcomingOccasion } from "@/lib/occasions";
import { formatDateTime } from "@/lib/format";

const CUSTOM_OCCASION = "__custom__";

// The only offers the AI is allowed to mention. Everything except the standing
// 5+ pizza discount is honoured manually at the counter — the planner writes
// marketing copy, it never changes billing.
const OFFERS = [
  { id: "none", label: "No offer — just a warm nudge", text: "none" },
  {
    id: "bulk",
    label: "Remind them: 10% off on 5+ pizzas (standing rule)",
    text: "10% off applies automatically on orders of 5 or more pizzas — the outlet's standing rule",
  },
  {
    id: "topping",
    label: "Free topping of choice on the featured pizza",
    text: "one free topping of choice on the featured pizza, for this occasion only",
  },
  { id: "custom", label: "Custom offer…", text: "" },
] as const;

interface DraftPromo {
  headline: string;
  message: string;
  featuredItems: string[];
  whyThisWorks: string;
}

export default function PromosPage() {
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof getOrders>> | null>(null);
  const [menuItems, setMenuItems] = useState<AdminMenuItem[]>([]);
  const [ratingsSummary, setRatingsSummary] = useState<ReturnType<typeof computePizzaRatingSummary> | null>(null);
  const [featureOn, setFeatureOn] = useState(true);
  const [published, setPublished] = useState<PublishedPromo | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    getOrders()
      .then(setOrders)
      .catch((error: Error) => setLoadError(error.message));
    getAllMenuItems()
      .then(setMenuItems)
      .catch(() => {});
    getOrderFeedback()
      .then((feedback) => setRatingsSummary(computePizzaRatingSummary(feedback)))
      .catch(() => {});
    getEffectiveAiFeatures()
      .then((features) => setFeatureOn(features.promo))
      .catch(() => {});
    getPublishedPromo()
      .then(setPublished)
      .catch(() => {});
  }, []);

  const activePizzas = useMemo(
    () => menuItems.filter((i) => i.category === "pizza" && i.isActive),
    [menuItems]
  );
  const facts: PromoFacts | null = useMemo(() => {
    if (!orders) return null;
    return computePromoFacts({ orders, menuPizzas: activePizzas, ratings: ratingsSummary });
  }, [orders, activePizzas, ratingsSummary]);

  if (loadError) return <div className="banner banner-error">Could not load orders: {loadError}</div>;

  return (
    <>
      <h1>Promos</h1>
      <p className="page-sub">
        Plan a WhatsApp broadcast around an upcoming occasion. The facts below come straight from
        your orders — the AI only writes the words.
      </p>
      {isDemoMode && (
        <div className="banner banner-demo">
          <strong>Demo mode:</strong> facts come from this browser&apos;s stored orders; a published
          promo is stored in this browser only.
        </div>
      )}

      <PublishedCard published={published} onCleared={() => setPublished(null)} />

      <FactsCard facts={facts} />

      {featureOn ? (
        facts && (
          <Composer
            facts={facts}
            pizzas={activePizzas}
            onPublished={(promo) => setPublished(promo)}
          />
        )
      ) : (
        <div className="banner banner-demo" style={{ marginTop: 16 }}>
          The promo planner is turned off in Admin → Settings → AI. The sales facts above still
          update live; turn the feature on to draft a broadcast.
        </div>
      )}
    </>
  );
}

// ----------------------------------------------------------- published promo

function PublishedCard({
  published,
  onCleared,
}: {
  published: PublishedPromo | null;
  onCleared: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!published) return null;

  async function remove() {
    setBusy(true);
    setError("");
    const message = await clearPublishedPromo();
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    onCleared();
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Live on the ordering page</h2>
      <p className="page-sub">
        Customers currently see this banner
        {published.publishedAt ? ` (published ${formatDateTime(published.publishedAt)})` : ""}. It
        stays up until you remove it.
      </p>
      <div className="banner banner-promo">
        <strong>🎉 {published.headline}</strong>
        <div className="promo-text">{published.message}</div>
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-small btn-secondary" style={{ marginTop: 10 }} onClick={remove} disabled={busy}>
        {busy ? "Removing…" : "Remove from ordering page"}
      </button>
    </div>
  );
}

// -------------------------------------------------------------- sales facts

function FactsCard({ facts }: { facts: PromoFacts | null }) {
  if (!facts) return <p className="page-sub">Loading sales facts…</p>;
  const best = facts.bestSellers[0];
  const slow = facts.slowMovers[0];
  return (
    <div className="card">
      <h2>Last {facts.windowDays} days at a glance</h2>
      <p className="page-sub">Computed from the orders table — these are the facts the AI writes from.</p>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Orders</div>
          <div className="stat-value">{facts.orderCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Best seller</div>
          <div className="stat-value">{best ? best.name : "—"}</div>
          <div className="stat-sub">{best ? `${best.units} sold` : "no sales in this window"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Needs a push</div>
          <div className="stat-value">{slow ? slow.name : "—"}</div>
          <div className="stat-sub">{slow ? `${slow.units} sold` : ""}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Veg share</div>
          <div className="stat-value">{facts.vegUnitShare != null ? `${facts.vegUnitShare}%` : "—"}</div>
          <div className="stat-sub">of pizzas sold</div>
        </div>
      </div>
      <p className="page-sub" style={{ marginTop: 10, marginBottom: 0 }}>
        {facts.quietestDay && facts.busiestDay
          ? `Quietest day: ${facts.quietestDay.day} (${facts.quietestDay.orders} orders) · busiest: ${facts.busiestDay.day} (${facts.busiestDay.orders}).`
          : "Not enough orders yet to see day-of-week patterns."}{" "}
        {facts.topRatedPizza &&
          `Top rated: ${facts.topRatedPizza.name} (★ ${facts.topRatedPizza.avgRating} from ${facts.topRatedPizza.ratingCount} ratings).`}{" "}
        {facts.repeatCustomerCount > 0 && `${facts.repeatCustomerCount} repeat customers on file.`}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------- composer

function Composer({
  facts,
  pizzas,
  onPublished,
}: {
  facts: PromoFacts;
  pizzas: AdminMenuItem[];
  onPublished: (promo: PublishedPromo) => void;
}) {
  const occasions = useMemo(() => upcomingOccasions(), []);
  const [occasionId, setOccasionId] = useState<string>(occasions[0]?.id ?? CUSTOM_OCCASION);
  const [customOccasion, setCustomOccasion] = useState("");
  const [offerId, setOfferId] = useState<(typeof OFFERS)[number]["id"]>("none");
  const [customOffer, setCustomOffer] = useState("");
  const [draft, setDraft] = useState<DraftPromo | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selected: UpcomingOccasion | null = occasions.find((o) => o.id === occasionId) ?? null;
  const occasionText =
    occasionId === CUSTOM_OCCASION
      ? customOccasion.trim()
      : selected
        ? `${selected.name} (${selected.dateLabel}${selected.approxDate ? ", date approximate — owner will confirm" : ""}) — ${
            selected.ongoing ? "happening now" : `starts in ${selected.startsInDays} day(s)`
          }. ${selected.angle}${selected.vegLean ? " Vegetarian-leaning occasion: feature only veg items." : ""}`
        : "";
  const offerText = offerId === "custom" ? customOffer.trim() : OFFERS.find((o) => o.id === offerId)!.text;

  async function generate() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/ai/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasion: occasionText,
          offer: offerText || "none",
          menu: pizzas.map((p) => ({ name: p.name, priceRupees: p.pricePaise / 100, isVeg: p.isVeg })),
          facts,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not draft the promo.");
      setDraft(payload.promo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft the promo — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyMessage() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.message);
      setNotice("Message copied — paste it into WhatsApp Business.");
    } catch {
      setError("Could not access the clipboard — select and copy the text manually.");
    }
  }

  async function publish() {
    if (!draft) return;
    setPublishing(true);
    setError("");
    setNotice("");
    const headline = draft.headline || "This week at SliceMatic";
    const message = await publishPromo({ headline, message: draft.message });
    setPublishing(false);
    if (message) {
      setError(message);
      return;
    }
    onPublished({ headline, message: draft.message, publishedAt: new Date().toISOString() });
    setNotice("Published — customers now see this banner on the ordering page.");
  }

  const canGenerate = Boolean(occasionText) && (offerId !== "custom" || Boolean(customOffer.trim()));

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2>Draft a broadcast</h2>

      <p className="page-sub" style={{ fontWeight: 600, marginBottom: 6 }}>
        1. Pick the occasion
      </p>
      <div className="chip-row">
        {occasions.map((o) => (
          <button
            key={o.id}
            className={`chip ${occasionId === o.id ? "selected" : ""}`}
            onClick={() => setOccasionId(o.id)}
            title={o.angle}
          >
            {o.name} · {o.ongoing ? "now" : `in ${o.startsInDays}d`}
            {o.approxDate ? " ~" : ""}
          </button>
        ))}
        <button
          className={`chip ${occasionId === CUSTOM_OCCASION ? "selected" : ""}`}
          onClick={() => setOccasionId(CUSTOM_OCCASION)}
        >
          Custom…
        </button>
      </div>
      {occasionId === CUSTOM_OCCASION ? (
        <input
          type="text"
          style={{ marginTop: 10, maxWidth: 480 }}
          placeholder="e.g. Local cricket final this Sunday evening"
          value={customOccasion}
          maxLength={200}
          onChange={(e) => setCustomOccasion(e.target.value)}
        />
      ) : (
        selected && (
          <p className="page-sub" style={{ marginTop: 8 }}>
            {selected.dateLabel}
            {selected.approxDate && " (approximate — confirm the exact date before sending)"} ·{" "}
            {selected.angle}
            {selected.vegLean && " · Veg-leaning: only veg items will be featured."}
          </p>
        )
      )}

      <p className="page-sub" style={{ fontWeight: 600, margin: "16px 0 6px" }}>
        2. Pick the offer (optional)
      </p>
      <select
        className="select"
        style={{ maxWidth: 480 }}
        value={offerId}
        onChange={(e) => setOfferId(e.target.value as (typeof OFFERS)[number]["id"])}
      >
        {OFFERS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {offerId === "custom" && (
        <input
          type="text"
          style={{ marginTop: 10, maxWidth: 480 }}
          placeholder="e.g. Free cold drink with every large pizza on Sunday"
          value={customOffer}
          maxLength={140}
          onChange={(e) => setCustomOffer(e.target.value)}
        />
      )}
      <p className="page-sub" style={{ marginTop: 8, fontSize: 12.5 }}>
        Offers here are marketing copy only — billing still applies just the standing 10% discount
        on 5+ pizzas. Anything else you promise, you honour at the counter.
      </p>

      <button className="btn" style={{ marginTop: 14 }} onClick={generate} disabled={busy || !canGenerate}>
        {busy ? "Writing…" : draft ? "Write it again" : "Write the broadcast"}
      </button>

      {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}

      {draft && (
        <div style={{ marginTop: 18 }}>
          <p className="page-sub" style={{ fontWeight: 600, marginBottom: 6 }}>
            3. Review, copy, publish
          </p>
          <div className="wa-preview">
            {draft.headline && <strong>{draft.headline}{"\n"}</strong>}
            {draft.message}
          </div>
          {draft.whyThisWorks && (
            <p className="page-sub" style={{ marginTop: 8, maxWidth: 520 }}>
              <strong>Why this works:</strong> {draft.whyThisWorks}
              {draft.featuredItems.length > 0 && <> · Featured: {draft.featuredItems.join(", ")}</>}
            </p>
          )}
          {notice && <p className="banner banner-ok" style={{ marginTop: 10 }}>{notice}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button className="btn btn-small" onClick={copyMessage}>
              Copy for WhatsApp
            </button>
            <button className="btn btn-small btn-secondary" onClick={publish} disabled={publishing}>
              {publishing ? "Publishing…" : "Publish on the ordering page"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
