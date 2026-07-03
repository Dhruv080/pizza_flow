"use client";

// AI settings — three tabs:
//   1. Features  — the master AI kill switch plus a per-feature sub-toggle for
//      each of the four AI features.
//   2. Model     — which OpenRouter model every AI feature uses.
//   3. Prompts   — the editable system prompt behind each AI feature.
//
// Everything here is enforced server-side in the /api/ai/* routes (the master
// switch, the per-feature flags, the chosen model and the prompt overrides),
// never trusted from the client — the UI just reflects and edits the stored
// settings. See lib/data.ts for the storage and lib/prompts.ts for defaults.

import { useEffect, useState } from "react";
import {
  isAiEnabled,
  setAiEnabled,
  getAiFeatureFlags,
  setAiFeatureFlag,
  getAiModel,
  setAiModel,
  getAiPromptOverrides,
  setAiPrompt,
  resetAiPrompt,
  isDemoMode,
} from "@/lib/data";
import { AI_FEATURES, DEFAULT_PROMPTS, FEATURE_META, type AiFeature } from "@/lib/prompts";
import { AI_MODEL_OPTIONS } from "@/lib/aiCatalog";

type Tab = "features" | "model" | "prompts";

const TABS: { id: Tab; label: string }[] = [
  { id: "features", label: "Features" },
  { id: "model", label: "Model" },
  { id: "prompts", label: "Prompts" },
];

export default function AiSettingsPage() {
  const [tab, setTab] = useState<Tab>("features");

  return (
    <>
      <h1>AI settings</h1>
      <p className="page-sub">
        Turn AI features on or off, choose the model, and edit the prompts behind each feature.
        Ordering, billing, GST and payment are never affected — this only controls the AI panels.
      </p>

      {isDemoMode && (
        <div className="banner banner-demo">
          <strong>Demo mode:</strong> Supabase is not configured, so these settings are stored in
          this browser only. The server-side AI routes fall back to their defaults (all features on,
          the default model and prompts) until a Supabase project is connected.
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "features" && <FeaturesTab />}
      {tab === "model" && <ModelTab />}
      {tab === "prompts" && <PromptsTab />}
    </>
  );
}

// ------------------------------------------------------------------ Features

function FeaturesTab() {
  const [enabled, setEnabled] = useState(true);
  const [flags, setFlags] = useState<Record<AiFeature, boolean>>(
    () => Object.fromEntries(AI_FEATURES.map((f) => [f, true])) as Record<AiFeature, boolean>
  );
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([isAiEnabled(), getAiFeatureFlags()]).then(([master, featureFlags]) => {
      setEnabled(master);
      setFlags(featureFlags);
      setLoaded(true);
    });
  }, []);

  async function toggleMaster() {
    const next = !enabled;
    setEnabled(next); // optimistic
    setError("");
    const message = await setAiEnabled(next);
    if (message) {
      setError(message);
      setEnabled(!next); // revert
    }
  }

  async function toggleFeature(feature: AiFeature) {
    const next = !flags[feature];
    setFlags((prev) => ({ ...prev, [feature]: next })); // optimistic
    setError("");
    const message = await setAiFeatureFlag(feature, next);
    if (message) {
      setError(message);
      setFlags((prev) => ({ ...prev, [feature]: !next })); // revert
    }
  }

  return (
    <>
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="ai-toggle-row">
          <label className="switch">
            <input type="checkbox" checked={enabled} disabled={!loaded} onChange={toggleMaster} />
            <span className="switch-track" />
          </label>
          <div>
            <strong>{enabled ? "AI features are ON" : "AI features are OFF"}</strong>
            <p className="page-sub" style={{ margin: 0 }}>
              {enabled
                ? "The master switch is on. Use the per-feature toggles below to fine-tune which features are live."
                : "All four AI panels are hidden from customers and admin. Every /api/ai/* call is also rejected server-side, even if called directly."}
            </p>
          </div>
        </div>

        <div className="ai-subtoggles" aria-disabled={!enabled}>
          {AI_FEATURES.map((feature) => {
            const meta = FEATURE_META[feature];
            const on = enabled && flags[feature];
            return (
              <div key={feature} className={`ai-subtoggle ${enabled ? "" : "disabled"}`}>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={flags[feature]}
                    disabled={!loaded || !enabled}
                    onChange={() => toggleFeature(feature)}
                  />
                  <span className="switch-track" />
                </label>
                <div>
                  <strong>
                    {meta.label} — {on ? "on" : "off"}
                  </strong>
                  <p className="page-sub" style={{ margin: 0 }}>
                    {meta.blurb}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="error-text">{error}</p>}
        {!enabled && (
          <p className="page-sub" style={{ marginTop: 12 }}>
            The master switch is off, so every feature is off regardless of its own toggle. Turn the
            master switch on to control features individually.
          </p>
        )}
      </div>
    </>
  );
}

// --------------------------------------------------------------------- Model

const CUSTOM = "__custom__";

function ModelTab() {
  const [selected, setSelected] = useState("");
  const [custom, setCustom] = useState("");
  const [active, setActive] = useState(""); // the model currently in effect
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAiModel().then((model) => {
      setActive(model);
      const known = AI_MODEL_OPTIONS.some((o) => o.id === model);
      setSelected(known ? model : CUSTOM);
      if (!known) setCustom(model);
      setLoaded(true);
    });
  }, []);

  const chosen = selected === CUSTOM ? custom.trim() : selected;

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    const message = await setAiModel(chosen);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setActive(chosen);
    setSaved(true);
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3>Model selection</h3>
      <p className="page-sub">
        Every AI feature uses this OpenRouter model. Currently active:{" "}
        <strong>{loaded ? active : "…"}</strong>
      </p>

      <div className="model-list">
        {AI_MODEL_OPTIONS.map((option) => (
          <label key={option.id} className={`model-option ${selected === option.id ? "selected" : ""}`}>
            <input
              type="radio"
              name="ai-model"
              value={option.id}
              checked={selected === option.id}
              onChange={() => {
                setSelected(option.id);
                setSaved(false);
              }}
            />
            <div>
              <strong>{option.label}</strong> <code className="model-slug">{option.id}</code>
              <p className="page-sub" style={{ margin: 0 }}>
                {option.note}
              </p>
            </div>
          </label>
        ))}

        <label className={`model-option ${selected === CUSTOM ? "selected" : ""}`}>
          <input
            type="radio"
            name="ai-model"
            value={CUSTOM}
            checked={selected === CUSTOM}
            onChange={() => {
              setSelected(CUSTOM);
              setSaved(false);
            }}
          />
          <div style={{ flex: 1 }}>
            <strong>Custom</strong>
            <p className="page-sub" style={{ margin: "0 0 8px" }}>
              Any OpenRouter model id, e.g. <code>openai/gpt-4o-mini</code>.
            </p>
            <input
              type="text"
              placeholder="provider/model"
              value={custom}
              disabled={selected !== CUSTOM}
              onChange={(e) => {
                setCustom(e.target.value);
                setSaved(false);
              }}
            />
          </div>
        </label>
      </div>

      {error && <p className="error-text">{error}</p>}
      {saved && <p className="banner banner-ok" style={{ marginTop: 12 }}>Model saved.</p>}

      <button
        className="btn"
        style={{ marginTop: 14 }}
        onClick={save}
        disabled={!loaded || busy || !chosen || chosen === active}
      >
        {busy ? "Saving…" : "Save model"}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------- Prompts

function PromptsTab() {
  const [feature, setFeature] = useState<AiFeature>("assistant");
  const [drafts, setDrafts] = useState<Record<AiFeature, string>>(() => ({ ...DEFAULT_PROMPTS }));
  const [overridden, setOverridden] = useState<Record<AiFeature, boolean>>(
    () => Object.fromEntries(AI_FEATURES.map((f) => [f, false])) as Record<AiFeature, boolean>
  );
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    getAiPromptOverrides().then((overrides) => {
      setDrafts({
        ...DEFAULT_PROMPTS,
        ...(overrides as Record<AiFeature, string>),
      });
      setOverridden(
        Object.fromEntries(AI_FEATURES.map((f) => [f, overrides[f] != null])) as Record<AiFeature, boolean>
      );
      setLoaded(true);
    });
  }, []);

  const meta = FEATURE_META[feature];
  const draft = drafts[feature];
  const isDefault = draft.trim() === DEFAULT_PROMPTS[feature].trim();

  function selectFeature(next: AiFeature) {
    setFeature(next);
    setError("");
    setNotice("");
  }

  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    const message = await setAiPrompt(feature, draft);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setOverridden((prev) => ({ ...prev, [feature]: true }));
    setNotice("Prompt saved.");
  }

  async function reset() {
    setBusy(true);
    setError("");
    setNotice("");
    const message = await resetAiPrompt(feature);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setDrafts((prev) => ({ ...prev, [feature]: DEFAULT_PROMPTS[feature] }));
    setOverridden((prev) => ({ ...prev, [feature]: false }));
    setNotice("Restored the default prompt.");
  }

  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <h3>Prompt editor</h3>
      <p className="page-sub">
        Edit the system prompt behind each AI feature. Keep the <code>{"{{PLACEHOLDERS}}"}</code> —
        the app fills them with live menu, cart and sales data at request time.
      </p>

      <div className="prompt-feature-tabs">
        {AI_FEATURES.map((f) => (
          <button
            key={f}
            className={`chip ${feature === f ? "active" : ""}`}
            onClick={() => selectFeature(f)}
          >
            {FEATURE_META[f].label}
            {overridden[f] && <span className="chip-dot" title="Customised" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <p className="page-sub" style={{ margin: "14px 0 6px" }}>
        {meta.blurb}{" "}
        <span className={isDefault ? "prompt-status-default" : "prompt-status-custom"}>
          {isDefault ? "Using the default prompt." : "Customised."}
        </span>
      </p>
      <p className="page-sub" style={{ margin: "0 0 6px", fontSize: 12.5 }}>
        Required placeholders:{" "}
        {meta.placeholders.map((p) => (
          <code key={p} className="model-slug" style={{ marginRight: 6 }}>
            {p}
          </code>
        ))}
      </p>

      <textarea
        value={draft}
        disabled={!loaded || busy}
        spellCheck={false}
        onChange={(e) => {
          setDrafts((prev) => ({ ...prev, [feature]: e.target.value }));
          setNotice("");
          setError("");
        }}
        style={{ minHeight: 300, fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 13 }}
      />

      {error && <p className="error-text">{error}</p>}
      {notice && <p className="banner banner-ok" style={{ marginTop: 12 }}>{notice}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn" onClick={save} disabled={!loaded || busy || isDefault}>
          {busy ? "Saving…" : "Save prompt"}
        </button>
        <button
          className="btn btn-secondary"
          onClick={reset}
          disabled={!loaded || busy || (isDefault && !overridden[feature])}
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}
