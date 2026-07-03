"use client";

// Outlet branding: name + location line, shown in the site header, the
// waiter's table-selection screen, and on every printed bill. White-label by
// design — nothing here is hardcoded to one owner or one outlet.

import { useEffect, useState } from "react";
import { getOutletSettings, saveOutletSettings, DEFAULT_OUTLET, type OutletSettings } from "@/lib/data";

export default function OutletSettingsPage() {
  const [outlet, setOutlet] = useState<OutletSettings>(DEFAULT_OUTLET);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    getOutletSettings()
      .then(setOutlet)
      .catch(() => {});
  }, []);

  async function save() {
    setStatus("saving");
    setError("");
    const message = await saveOutletSettings(outlet);
    if (message) {
      setError(message);
      setStatus("idle");
    } else {
      setStatus("saved");
    }
  }

  return (
    <>
      <h1>Outlet settings</h1>
      <p className="page-sub">Shown in the header, the welcome screen, and on every bill.</p>
      <div className="card" style={{ maxWidth: 480 }}>
        <div className="field">
          <label htmlFor="outlet-name">Outlet name</label>
          <input
            id="outlet-name"
            type="text"
            value={outlet.name}
            onChange={(e) => {
              setOutlet({ ...outlet, name: e.target.value });
              setStatus("idle");
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="outlet-location">Location line</label>
          <input
            id="outlet-location"
            type="text"
            value={outlet.location}
            onChange={(e) => {
              setOutlet({ ...outlet, location: e.target.value });
              setStatus("idle");
            }}
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" onClick={save} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : "Save"}
        </button>
        {status === "saved" && (
          <p className="page-sub" style={{ marginTop: 8 }}>
            Refresh any open ordering screens to show the new name.
          </p>
        )}
      </div>
    </>
  );
}
