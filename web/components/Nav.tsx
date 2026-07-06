"use client";

// Header navigation. The customer-facing pages deliberately do NOT link to
// /admin — Rajan reaches his dashboard by direct URL (bookmarked), and it is
// protected by Supabase Auth regardless. Only the admin side gets a link back
// to the ordering page.

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();
  if (!pathname?.startsWith("/admin")) return null;
  return (
    <nav>
      <Link href="/">Order page</Link>
    </nav>
  );
}
