"use client";

// Shared shell for every /admin/* route: session gate, sub-navigation, and
// the floating Insights chat widget. Sub-pages (dashboard, menu management,
// settings/*) assume they are already authenticated — this layout is the
// only place that checks.

import { useEffect, useState } from "react";
import AdminNav from "@/components/AdminNav";
import InsightsChatWidget from "@/components/InsightsChatWidget";
import { adminSignIn, adminSignOut, getAdminSession, getEffectiveAiFeatures } from "@/lib/data";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [insightsEnabled, setInsightsEnabled] = useState(true);
  const [digestEnabled, setDigestEnabled] = useState(true);

  useEffect(() => {
    getAdminSession().then((ok) => {
      setSignedIn(ok);
      setChecked(true);
    });
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    getEffectiveAiFeatures().then((features) => {
      setInsightsEnabled(features.insights);
      setDigestEnabled(features.digest);
    });
  }, [signedIn]);

  if (!checked) return <p className="page-sub">Checking session…</p>;
  if (!signedIn) return <Login onSignedIn={() => setSignedIn(true)} />;

  return (
    <>
      <AdminNav
        onSignOut={async () => {
          await adminSignOut();
          setSignedIn(false);
        }}
      />
      {children}
      {(insightsEnabled || digestEnabled) && (
        <InsightsChatWidget insightsEnabled={insightsEnabled} digestEnabled={digestEnabled} />
      )}
    </>
  );
}

function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const message = await adminSignIn(email, password);
    setBusy(false);
    if (message) setError(message);
    else onSignedIn();
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <div className="card">
        <h1>Admin login</h1>
        <p className="page-sub">Authorised staff only.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email or username</label>
            <input
              id="email"
              type="text"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" style={{ width: "100%" }} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
