"use client";

// Sub-navigation for the authenticated admin area: Dashboard, Menu
// management, and a Settings menu grouping Account / Outlet / AI — plus
// sign out. Rendered by app/admin/layout.tsx once a session is confirmed.

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminNav({ onSignOut }: { onSignOut: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;

  return (
    <div className="admin-subnav">
      <div className="admin-subnav-links">
        <Link href="/admin" className={isActive("/admin") ? "active" : ""}>
          Dashboard
        </Link>
        <Link href="/admin/menu" className={isActive("/admin/menu") ? "active" : ""}>
          Menu management
        </Link>
        <details className="dd admin-settings-dd">
          <summary>⚙ Settings</summary>
          <div className="dd-panel">
            <Link href="/admin/settings/account" className="dd-item">
              Account settings
            </Link>
            <Link href="/admin/settings/outlet" className="dd-item">
              Outlet settings
            </Link>
            <Link href="/admin/settings/ai" className="dd-item">
              AI settings
            </Link>
          </div>
        </details>
      </div>
      <button className="btn btn-small btn-secondary" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}
