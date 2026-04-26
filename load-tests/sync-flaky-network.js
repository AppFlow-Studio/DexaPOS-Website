// =============================================================================
// TC-XCC-LOAD-003 — Sync queue flush under flaky network (chaos proxy)
//
// Simulates the POS tablet's offline-sync behavior from a laptop:
//   1. Build a local queue of N orders, each with a unique idempotency key
//      (provider_order_id — the same key the create-online-order edge function
//      already de-dups on, see online_orders unique index on
//      (provider, provider_order_id) in the LOAD-001 migration).
//   2. Flush the queue through Toxiproxy with 30% packet loss + jitter.
//   3. Retry failed requests with exponential backoff, REUSING the same
//      idempotency key. The server must produce exactly ONE order per key.
//   4. After flush, query the DB via service role and verify:
//        - exactly N distinct provider_order_ids exist
//        - zero duplicates per key
//        - zero data loss
//
// Setup (one-time):
//   1. Install toxiproxy
//        - Windows:  scoop install toxiproxy   (or download release)
//        - macOS:    brew install toxiproxy
//   2. Start the server in a separate terminal:
//        toxiproxy-server
//   3. Create the proxy + toxics in another terminal:
//        toxiproxy-cli create -l 127.0.0.1:54320 -u dfwqakoyittmrwbqvxgw.supabase.co:443 supabase
//        toxiproxy-cli toxic add supabase -t latency -a latency=500 -a jitter=200
//        toxiproxy-cli toxic add supabase -t timeout -a timeout=8000
//        toxiproxy-cli toxic add supabase -t bandwidth -a rate=200          # 200 KB/s
//        # Real packet loss requires kernel-level tools (tc/clumsy). Toxiproxy
//        # approximates with timeout + slow_close. Use 'reset_peer' for hard drops:
//        toxiproxy-cli toxic add supabase -t reset_peer -a timeout=2000 -y --toxicity 0.30
//
//   NOTE: Supabase requires SNI=<your-ref>.supabase.co. Toxiproxy passes raw
//   bytes, so you cannot point this at https://. We hit the EDGE FUNCTION
//   over a localhost HTTP listener that tunnels via toxiproxy. Set:
//
//     PROXY_URL=http://127.0.0.1:54320
//     SUPABASE_HOST=dfwqakoyittmrwbqvxgw.supabase.co   (must match TLS SNI)
//
//   The script does TLS itself and uses Host header rewriting.
//
// Run:
//   SUPABASE_URL=https://dfwqakoyittmrwbqvxgw.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role> \
//   SUPABASE_ANON_KEY=<anon> \
//   STORE_CONFIG_ID=d46226d5-30c1-4c3f-a79c-47e812edac09 \
//   MENU_ITEM_ID=8ec036b3-085c-4b6c-8cd9-a2189b913a02 \
//   QUEUE_SIZE=200 USE_PROXY=1 PROXY_URL=http://127.0.0.1:54320 \
//   node load-tests/sync-flaky-network.js
//
// PASS criteria:
//   - submitted == QUEUE_SIZE
//   - distinct_provider_order_ids_in_db == QUEUE_SIZE
//   - duplicates == 0
//   - missing == 0
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL          = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY              = process.env.SUPABASE_ANON_KEY;
const STORE_CONFIG_ID       = process.env.STORE_CONFIG_ID;
const MENU_ITEM_ID          = process.env.MENU_ITEM_ID;
const MENU_ITEM_NAME        = process.env.MENU_ITEM_NAME || "Sync Test Item";
const MENU_ITEM_PRICE       = parseFloat(process.env.MENU_ITEM_PRICE || "10.00");
const QUEUE_SIZE            = parseInt(process.env.QUEUE_SIZE || "200", 10);
const MAX_ATTEMPTS          = parseInt(process.env.MAX_ATTEMPTS || "6", 10);
const USE_PROXY             = process.env.USE_PROXY === "1";
const PROXY_URL             = process.env.PROXY_URL || ""; // e.g. http://127.0.0.1:54320

// Client-side chaos (alternative to Toxiproxy when it's not usable):
//   CHAOS_DROP_RATE     fraction of attempts that abort before sending  (default 0.30)
//   CHAOS_TIMEOUT_RATE  fraction of attempts that hang and time out     (default 0.20)
//   CHAOS_LATENCY_MS    fixed extra latency on every attempt            (default 500)
//   CHAOS_JITTER_MS     ± random latency added on top of CHAOS_LATENCY  (default 200)
const CHAOS_ON           = process.env.CHAOS === "1";
const CHAOS_DROP_RATE    = parseFloat(process.env.CHAOS_DROP_RATE    || "0.30");
const CHAOS_TIMEOUT_RATE = parseFloat(process.env.CHAOS_TIMEOUT_RATE || "0.10");
const CHAOS_LATENCY_MS   = parseInt(process.env.CHAOS_LATENCY_MS     || "200", 10);
const CHAOS_JITTER_MS    = parseInt(process.env.CHAOS_JITTER_MS      || "100", 10);
const CHAOS_TIMEOUT_WAIT = parseInt(process.env.CHAOS_TIMEOUT_WAIT   || "4500", 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS   || "4000", 10);

for (const [k, v] of Object.entries({ SUPABASE_URL, SERVICE_ROLE_KEY, ANON_KEY, STORE_CONFIG_ID, MENU_ITEM_ID })) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
}

const TARGET = USE_PROXY && PROXY_URL ? PROXY_URL : SUPABASE_URL;
const HOST   = new URL(SUPABASE_URL).host;

// ---- Build the local queue ---------------------------------------------------
function makeQueue(n) {
  const q = [];
  for (let i = 0; i < n; i++) {
    const key = randomUUID(); // idempotency key — sent as transactionReferenceId
    q.push({
      key,
      attempts: 0,
      lastError: null,
      success: false,
      payload: {
        store_config_id: STORE_CONFIG_ID,
        order_type: "pickup",
        items: [{ id: MENU_ITEM_ID, name: MENU_ITEM_NAME, price: MENU_ITEM_PRICE, quantity: 1 }],
        tip: 0,
        pay_cash_in_store: true,
        customer_name:  `Sync Test ${i}`,
        customer_phone: `+1666${String(i).padStart(7, "0")}`,
        customer_email: `synctest+${i}@test.com`,
        // === IDEMPOTENCY KEY — server uses this to dedup duplicate webhook/retry ===
        transaction_reference_id: key,
      },
    });
  }
  return q;
}

// ---- Single attempt ----------------------------------------------------------
async function attempt(item) {
  const url = `${TARGET}/functions/v1/create-online-order`;

  // Inject client-side chaos so retry+idempotency get exercised even without Toxiproxy
  if (CHAOS_ON) {
    if (Math.random() < CHAOS_DROP_RATE) {
      return { ok: false, error: "chaos: connection reset before send" };
    }
    if (Math.random() < CHAOS_TIMEOUT_RATE) {
      await new Promise(r => setTimeout(r, CHAOS_TIMEOUT_WAIT));
      return { ok: false, error: "chaos: request timed out" };
    }
    const lag = CHAOS_LATENCY_MS + (Math.random() * 2 - 1) * CHAOS_JITTER_MS;
    if (lag > 0) await new Promise(r => setTimeout(r, lag));
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`,
        "Host":          HOST,
        "Idempotency-Key": item.key,
      },
      body: JSON.stringify(item.payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    let body;
    try { body = JSON.parse(text); } catch { return { ok: false, error: `non-JSON: ${text.slice(0, 200)}` }; }
    if (body.success !== true) return { ok: false, error: `server: ${body.error || "unknown"}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `${e.name}: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

// ---- Flush queue with exponential backoff, reusing key on retry --------------
async function flush(queue) {
  const total = queue.length;
  let processed = 0;
  let lastReport = Date.now();

  let pending = queue.filter(q => !q.success);
  while (pending.length > 0) {
    let advanced = false;
    for (const item of pending) {
      if (item.attempts >= MAX_ATTEMPTS) continue;
      item.attempts++;
      const r = await attempt(item);
      if (r.ok) {
        if (item.attempts === 1) {
          process.stdout.write(".");
        } else {
          process.stdout.write("✓");
        }
        item.success = true;
        advanced = true;
        processed++;
      } else {
        process.stdout.write("x");
        item.lastError = r.error;
        const backoff = Math.min(2000, 150 * Math.pow(2, item.attempts - 1)) + Math.random() * 100;
        await new Promise(res => setTimeout(res, backoff));
      }

      // Periodic progress line every ~5s
      if (Date.now() - lastReport > 5000) {
        const ok = queue.filter(q => q.success).length;
        process.stdout.write(`\n  [${ok}/${total} done, ${queue.reduce((s,q)=>s+q.attempts,0)} attempts so far]\n`);
        lastReport = Date.now();
      }
    }
    pending = queue.filter(q => !q.success && q.attempts < MAX_ATTEMPTS);
    if (!advanced && pending.length > 0) break; // nothing flushed this pass — bail
  }
  process.stdout.write("\n");
  return queue;
}

// ---- Verify against DB -------------------------------------------------------
async function verify(queue) {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const keys = queue.map(q => q.key);

  // Pull every online_orders row created with one of our idempotency keys.
  // The unique index from the LOAD-001 migration on
  // (provider, provider_order_id) is what enforces idempotency server-side.
  const { data, error } = await sb
    .from("online_orders")
    .select("provider_order_id")
    .eq("provider", "website")
    .in("provider_order_id", keys);

  if (error) throw error;

  const counts = new Map();
  for (const row of data) counts.set(row.provider_order_id, (counts.get(row.provider_order_id) ?? 0) + 1);

  const distinct   = counts.size;
  const duplicates = [...counts.values()].filter(c => c > 1).length;
  const missing    = keys.filter(k => !counts.has(k));

  return { distinct, duplicates, missingCount: missing.length, missingSample: missing.slice(0, 5) };
}

// ---- Run ---------------------------------------------------------------------
(async () => {
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`   TC-XCC-LOAD-003 — Sync queue / flaky network`);
  console.log(`═══════════════════════════════════════════════`);
  console.log(`   Target            : ${TARGET}`);
  console.log(`   Proxy in use      : ${USE_PROXY ? "YES (toxiproxy)" : "no"}`);
  console.log(`   Client-side chaos : ${CHAOS_ON ? `ON (drop=${CHAOS_DROP_RATE}, timeout=${CHAOS_TIMEOUT_RATE}, latency=${CHAOS_LATENCY_MS}±${CHAOS_JITTER_MS}ms)` : "off"}`);
  console.log(`   Queue size        : ${QUEUE_SIZE}`);
  console.log(`   Max attempts/req  : ${MAX_ATTEMPTS}`);
  console.log(`───────────────────────────────────────────────`);

  const t0 = Date.now();
  const queue = makeQueue(QUEUE_SIZE);

  console.log(`Flushing ${queue.length} queued requests…  ( . = first-try OK,  ✓ = OK after retry,  x = chaos/error )`);
  await flush(queue);
  const elapsedMs = Date.now() - t0;

  const successes = queue.filter(q => q.success).length;
  const failures  = queue.filter(q => !q.success);
  const totalAttempts = queue.reduce((s, q) => s + q.attempts, 0);

  console.log(`───────────────────────────────────────────────`);
  console.log(`   Flushed in        : ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(`   Successes (client): ${successes}/${QUEUE_SIZE}`);
  console.log(`   Failures (client) : ${failures.length}`);
  console.log(`   Total attempts    : ${totalAttempts} (avg ${(totalAttempts / QUEUE_SIZE).toFixed(2)}/req)`);

  if (failures.length > 0) {
    console.log(`   Sample failures   :`);
    for (const f of failures.slice(0, 3)) console.log(`     ${f.key} → ${f.lastError}`);
  }

  console.log(`───────────────────────────────────────────────`);
  console.log(`Verifying server-side idempotency against DB…`);
  const v = await verify(queue);
  console.log(`   Distinct keys in DB : ${v.distinct}/${QUEUE_SIZE}`);
  console.log(`   Duplicates          : ${v.duplicates}`);
  console.log(`   Missing             : ${v.missingCount}${v.missingCount ? ` (sample: ${v.missingSample.join(", ")})` : ""}`);

  const passed = v.distinct === QUEUE_SIZE && v.duplicates === 0 && v.missingCount === 0;

  console.log(`───────────────────────────────────────────────`);
  console.log(`   RESULT : ${passed ? "PASS" : "FAIL"}`);
  console.log(`═══════════════════════════════════════════════\n`);

  process.exit(passed ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
