// Supabase client singleton. If the env vars are absent the app runs in
// DEMO MODE (bundled menu + localStorage orders) so the full flow can be
// exercised without any cloud account. See lib/data.ts.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  if (!client) client = createClient(url!, anonKey!);
  return client;
}

// ------------------------------------------------------------- admin client
// A service-role client that BYPASSES row-level security. SUPABASE_SERVICE_ROLE_KEY
// is a server-only env var (never NEXT_PUBLIC_*), so this is undefined in the
// browser and must only be used inside server code (API routes). It exists so
// the customer-facing AI routes can read the admin's OpenRouter API key, which
// is stored in a `secret_`-prefixed settings row that anon clients cannot read.

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let adminClient: SupabaseClient | null = null;

/** Returns the service-role client, or null if it isn't configured. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!url || !serviceRoleKey) return null;
  if (!adminClient) {
    adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
