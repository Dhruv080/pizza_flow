// Create (or reset the password of) the admin login for the /admin dashboard.
//
//   npm run admin:create -- <email> <password>
//   e.g. npm run admin:create -- rajan@slicematic.in "SliceMatic2026!"
//
// Uses SUPABASE_DB_URL (see .env.example) because user creation is an
// administrative act: it must never be possible from the deployed app, which
// holds only the anon key. There is deliberately no public signup flow.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(webRoot, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const [email, password] = process.argv.slice(2);
if (!email?.includes("@") || !password || password.length < 8) {
  console.error(
    "\nUsage: npm run admin:create -- <email> <password>\n" +
      "       (password must be at least 8 characters)\n"
  );
  process.exit(1);
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("[admin:create] SUPABASE_DB_URL is not set in .env.local — see .env.example.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  const existing = await client.query("select id from auth.users where email = $1", [email]);

  if (existing.rowCount > 0) {
    await client.query(
      `update auth.users
         set encrypted_password = crypt($2, gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now()),
             updated_at = now()
       where email = $1`,
      [email, password]
    );
    await ensureIdentity(existing.rows[0].id, email);
    console.log(`[admin:create] ${email} already existed — password has been reset.`);
  } else {
    const { rows } = await client.query(
      `insert into auth.users
         (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change, email_change_token_new)
       values
         ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
          'authenticated', $1, crypt($2, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
       returning id`,
      [email, password]
    );
    const userId = rows[0].id;
    await ensureIdentity(userId, email);
    console.log(`[admin:create] admin user created: ${email}`);
  }
  console.log("[admin:create] sign in at /admin with this email (or its username part) + password.");

  async function ensureIdentity(userId, userEmail) {
    await client.query(
      `insert into auth.identities
         (id, user_id, provider_id, provider, identity_data,
          last_sign_in_at, created_at, updated_at)
       values
         (gen_random_uuid(), $1::uuid, $2::text, 'email',
          jsonb_build_object('sub', $2::text, 'email', $3::text, 'email_verified', true),
          now(), now(), now())
       on conflict (provider_id, provider) do nothing`,
      [userId, String(userId), userEmail]
    );
  }
} catch (error) {
  console.error(`[admin:create] FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
