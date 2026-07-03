// One-command database setup:  npm run db:setup
//
// Applies supabase/schema.sql then supabase/seed.sql to the Supabase Postgres
// database. Both files are idempotent — safe to run again after menu edits or
// schema changes.
//
// Why this is a separate command and not automatic at app start:
//   * The running app holds only the ANON key, which cannot (and must not)
//     alter the schema — least privilege for anything internet-facing.
//   * Serverless means many instances cold-start concurrently; boot-time
//     migrations race each other. Schema belongs to setup/deploy time.
//   * This script needs SUPABASE_DB_URL (the Postgres connection string with
//     the database password). Keep it in .env.local on a trusted machine
//     ONLY — never add it to Vercel and never prefix it NEXT_PUBLIC_.
//
// Get the connection string: Supabase Dashboard -> Connect (top bar) ->
// "Session pooler" URI (works on IPv4 networks), then put it in web/.env.local:
//   SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env.local loader (no dotenv dependency; existing env wins).
const envFile = join(webRoot, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    "\n[db:setup] SUPABASE_DB_URL is not set.\n\n" +
      "  1. Supabase Dashboard -> Connect -> copy the 'Session pooler' URI\n" +
      "  2. Add to web/.env.local:  SUPABASE_DB_URL=postgresql://...\n" +
      "     (dev machine only — never deploy this variable)\n\n" +
      "  Alternative: paste supabase/schema.sql + seed.sql into the\n" +
      "  Supabase SQL Editor by hand — same result.\n"
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  for (const file of ["supabase/schema.sql", "supabase/seed.sql"]) {
    // Strip a UTF-8 BOM if present — Postgres rejects it as a syntax error.
    const sql = readFileSync(join(webRoot, file), "utf-8").replace(/^﻿/, "");
    process.stdout.write(`[db:setup] applying ${file} ... `);
    await client.query(sql);
    console.log("ok");
  }
  const { rows } = await client.query(
    "select category, count(*)::int as items from menu_items where is_active group by category order by category"
  );
  console.log("[db:setup] menu ready:", rows.map((r) => `${r.items} ${r.category}s`).join(", "));
  console.log(
    "[db:setup] done. Next: create the admin login with\n" +
      "           npm run admin:create -- <email> <password>"
  );
} catch (error) {
  console.error(`\n[db:setup] FAILED: ${error.message}`);
  console.error(
    "           Check that SUPABASE_DB_URL is the Session pooler URI and the\n" +
      "           password in it is correct (Dashboard -> Connect)."
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
