/**
 * Stage 2 acceptance test — cross-tenant isolation for the website builder.
 *
 * This script is the *artifact* behind the ticket's "two merchants can each
 * build, save, and publish a distinct site with zero data bleed" criterion. It
 * proves isolation by attempting operations that MUST fail, rather than by
 * reading policy SQL and believing it. Every future edit to those policies
 * should be followed by a run of this script.
 *
 * It needs a real database, so it does not run in CI alongside the unit tests.
 * Run it against staging after applying
 * supabase/migrations/20260813120000_website_builder_foundation.sql.
 *
 * Usage:
 *   npx tsx scripts/verify-site-tenancy.ts --a <merchantIdA> --b <merchantIdB>
 *   npx tsx scripts/verify-site-tenancy.ts --list        # show candidate merchants
 *
 * Requires in .env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   (the anon key — used for the anon lane)
 *   SUPABASE_SERVICE_ROLE_KEY              (setup/teardown only, never for assertions)
 *
 * The authenticated lanes need a Clerk-issued Supabase token per merchant. Pass
 * them as SITE_TENANCY_TOKEN_A / SITE_TENANCY_TOKEN_B; without them the script
 * runs the anon lane and the service-role fixtures, and clearly reports the
 * authenticated lanes as SKIPPED rather than passing them by default.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── env (same manual .env parse the other scripts use) ──────────────────────
const envPath = resolve(__dirname, "..", ".env");
try {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch (e) {
  console.error(`[tenancy] could not read ${envPath}:`, (e as Error).message);
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error("[tenancy] missing NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY / SERVICE_ROLE_KEY");
  process.exit(1);
}

const service = createClient(URL, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

function tokenClient(token: string): SupabaseClient {
  return createClient(URL!, ANON!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// ── reporting ───────────────────────────────────────────────────────────────
let failures = 0;
let skipped = 0;

/**
 * Supabase query builders are thenables, not Promises, so the assertion helpers
 * take `PromiseLike` — otherwise every call site would need a stray `await`.
 */
type QueryResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Asserts an operation was DENIED. A denial can surface either as a Postgres
 * error or as an empty result set — RLS filters rather than throwing on SELECT —
 * so both count, and anything that returns a row is a leak.
 */
async function expectDenied(label: string, op: () => QueryResult) {
  try {
    const { data, error } = await op();
    const rows = Array.isArray(data) ? data.length : data ? 1 : 0;
    if (error || rows === 0) {
      console.log(`  ✓ DENIED  ${label}${error ? ` (${error.message.slice(0, 60)})` : " (0 rows)"}`);
    } else {
      failures += 1;
      console.log(`  ✗ LEAKED  ${label} — returned ${rows} row(s)`);
    }
  } catch (e) {
    console.log(`  ✓ DENIED  ${label} (threw: ${(e as Error).message.slice(0, 60)})`);
  }
}

async function expectAllowed(label: string, op: () => QueryResult) {
  const { data, error } = await op();
  const rows = Array.isArray(data) ? data.length : data ? 1 : 0;
  if (!error && rows > 0) {
    console.log(`  ✓ ALLOWED ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ BLOCKED ${label} — ${error?.message ?? "0 rows"} (this should have worked)`);
  }
}

function skip(label: string, why: string) {
  skipped += 1;
  console.log(`  – SKIP    ${label} — ${why}`);
}

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};

async function listCandidates() {
  const { data } = await service
    .from("online_store_config")
    .select("merchant_id, location_id, store_name, slug")
    .limit(20);
  console.log("Merchants with a storefront (usable as --a / --b):\n");
  for (const row of (data ?? []) as Record<string, string>[]) {
    console.log(`  ${row.merchant_id}  ${row.slug.padEnd(24)} ${row.store_name}`);
  }
}

/** Ensures each merchant has a site + home page, using service role. */
async function fixture(merchantId: string) {
  const { data: config } = await service
    .from("online_store_config")
    .select("id, location_id")
    .eq("merchant_id", merchantId)
    .limit(1)
    .maybeSingle();

  if (!config) throw new Error(`merchant ${merchantId} has no online_store_config`);

  const cfg = config as { id: string; location_id: string };

  let { data: site } = await service
    .from("merchant_sites")
    .select("id")
    .eq("store_config_id", cfg.id)
    .maybeSingle();

  if (!site) {
    const { data: created, error } = await service
      .from("merchant_sites")
      .insert({
        merchant_id: merchantId,
        location_id: cfg.location_id,
        store_config_id: cfg.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(`could not create site: ${error.message}`);
    site = created;
  }

  const siteId = (site as { id: string }).id;

  let { data: page } = await service
    .from("site_pages")
    .select("id, revision")
    .eq("site_id", siteId)
    .eq("is_home", true)
    .maybeSingle();

  if (!page) {
    const { data: created, error } = await service
      .from("site_pages")
      .insert({
        site_id: siteId,
        merchant_id: merchantId,
        path: "",
        title: "Home",
        is_home: true,
      })
      .select("id, revision")
      .single();
    if (error) throw new Error(`could not create home page: ${error.message}`);
    page = created;
  }

  return { siteId, page: page as { id: string; revision: number } };
}

async function main() {
  if (args.includes("--list")) {
    await listCandidates();
    return;
  }

  const merchantA = argOf("--a");
  const merchantB = argOf("--b");
  if (!merchantA || !merchantB) {
    console.error("Usage: npx tsx scripts/verify-site-tenancy.ts --a <merchantIdA> --b <merchantIdB>");
    console.error("       npx tsx scripts/verify-site-tenancy.ts --list");
    process.exit(1);
  }

  console.log("\nFixtures (service role)");
  const a = await fixture(merchantA);
  const b = await fixture(merchantB);
  console.log(`  A site=${a.siteId} page=${a.page.id}`);
  console.log(`  B site=${b.siteId} page=${b.page.id}`);

  // ── Lane 1: merchant A must not touch merchant B ─────────────────────────
  console.log("\nLane 1 — merchant A against merchant B's data");
  const tokenA = process.env.SITE_TENANCY_TOKEN_A;
  if (!tokenA) {
    for (const label of [
      "select B's site",
      "select B's draft",
      "update B's draft",
      "reparent A's page into B's site",
      "insert a page into B's site",
      "select B's versions",
    ]) {
      skip(label, "set SITE_TENANCY_TOKEN_A to a Clerk-issued Supabase token for merchant A");
    }
  } else {
    const clientA = tokenClient(tokenA);

    await expectAllowed("A can read its own site", () =>
      clientA.from("merchant_sites").select("id").eq("id", a.siteId),
    );
    await expectAllowed("A can read its own draft", () =>
      clientA.from("site_pages").select("id").eq("id", a.page.id),
    );

    await expectDenied("A selects B's site", () =>
      clientA.from("merchant_sites").select("id").eq("id", b.siteId),
    );
    await expectDenied("A selects B's draft", () =>
      clientA.from("site_pages").select("id").eq("id", b.page.id),
    );
    await expectDenied("A updates B's draft", () =>
      clientA
        .from("site_pages")
        .update({ title: "pwned" })
        .eq("id", b.page.id)
        .select("id"),
    );
    // The one WITH CHECK exists to stop: moving your own row into another tenant.
    await expectDenied("A reparents its own page into B's site", () =>
      clientA
        .from("site_pages")
        .update({ site_id: b.siteId })
        .eq("id", a.page.id)
        .select("id"),
    );
    await expectDenied("A inserts a page into B's site", () =>
      clientA
        .from("site_pages")
        .insert({ site_id: b.siteId, merchant_id: merchantA, path: "intruder", title: "x" })
        .select("id"),
    );
    await expectDenied("A selects B's versions", () =>
      clientA.from("site_page_versions").select("id").eq("site_id", b.siteId),
    );
  }

  // ── Lane 2: anon must see nothing at all (until Stage 4 adds public reads) ─
  console.log("\nLane 2 — anonymous visitor");
  await expectDenied("anon selects any site", () => anon.from("merchant_sites").select("id").limit(1));
  await expectDenied("anon selects any page", () => anon.from("site_pages").select("id").limit(1));
  await expectDenied("anon selects any draft content", () =>
    anon.from("site_pages").select("draft_content").limit(1),
  );
  await expectDenied("anon selects any version", () =>
    anon.from("site_page_versions").select("id").limit(1),
  );
  await expectDenied("anon inserts a page", () =>
    anon
      .from("site_pages")
      .insert({ site_id: a.siteId, merchant_id: merchantA, path: "anon", title: "x" })
      .select("id"),
  );

  // ── Lane 3: invariants that do not depend on a token ──────────────────────
  console.log("\nLane 3 — schema invariants (service role)");

  // Tenancy is derived by trigger, so a lying client cannot misfile a row.
  const { data: lied } = await service
    .from("site_pages")
    .insert({
      site_id: a.siteId,
      merchant_id: merchantB, // deliberately wrong
      path: "trigger-test",
      title: "Trigger test",
    })
    .select("id, merchant_id")
    .single();

  if (lied && (lied as { merchant_id: string }).merchant_id === merchantA) {
    console.log("  ✓ trigger overrode a falsified merchant_id");
  } else {
    failures += 1;
    console.log("  ✗ trigger did NOT override a falsified merchant_id");
  }
  if (lied) await service.from("site_pages").delete().eq("id", (lied as { id: string }).id);

  // revision must advance on a content change (autosave concurrency depends on it).
  const { data: bumped } = await service
    .from("site_pages")
    .update({ draft_content: { schemaVersion: 1, sections: [], seo: {}, settings: {} } })
    .eq("id", a.page.id)
    .select("revision")
    .single();

  if (bumped && (bumped as { revision: number }).revision > a.page.revision) {
    console.log("  ✓ revision advances when draft_content changes");
  } else {
    failures += 1;
    console.log("  ✗ revision did NOT advance on a content change");
  }

  // Versions are append-only.
  const { data: version } = await service
    .from("site_page_versions")
    .insert({
      page_id: a.page.id,
      site_id: a.siteId,
      merchant_id: merchantA,
      version_number: 999999,
      content: { schemaVersion: 1, sections: [], seo: {}, settings: {} },
      content_hash: "verify-tenancy-fixture",
    })
    .select("id")
    .single();

  if (version) {
    const versionId = (version as { id: string }).id;
    const { error: mutateError } = await service
      .from("site_page_versions")
      .update({ content: { tampered: true } })
      .eq("id", versionId);

    if (mutateError) {
      console.log("  ✓ published version content is immutable");
    } else {
      failures += 1;
      console.log("  ✗ published version content was MUTABLE");
    }
    await service.from("site_page_versions").delete().eq("id", versionId);
  }

  // ── result ────────────────────────────────────────────────────────────────
  console.log(
    failures === 0
      ? `\n✅ tenancy verification passed${skipped ? ` (${skipped} skipped)` : ""}\n`
      : `\n❌ ${failures} isolation failure(s)${skipped ? `, ${skipped} skipped` : ""}\n`,
  );
  if (skipped > 0 && failures === 0) {
    console.log(
      "Skipped lanes are NOT passes. Supply SITE_TENANCY_TOKEN_A to complete the acceptance test.\n",
    );
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\n[tenancy] fatal:", (e as Error).message);
  process.exit(1);
});
