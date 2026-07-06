"use client";

// Header brand block. The outlet name/location live in the settings table
// and are editable from the admin console — defaults render immediately so
// the header never blocks on the network.

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_OUTLET, getOutletSettings, type OutletSettings } from "@/lib/data";

export default function Brand() {
  const [outlet, setOutlet] = useState<OutletSettings>(DEFAULT_OUTLET);

  useEffect(() => {
    getOutletSettings()
      .then(setOutlet)
      .catch(() => {});
  }, []);

  return (
    <Link href="/" className="brand">
      <span className="brand-mark">🍕</span>
      <span>
        <strong>{outlet.name}</strong>
        <small>{outlet.location}</small>
      </span>
    </Link>
  );
}
