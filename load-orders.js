import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

// =============================================================================
// CONFIG — fill in STORE_CONFIG_ID and MENU_ITEM_ID from your DB before running
// SQL to get them:
//   SELECT id FROM online_store_config WHERE is_active = true LIMIT 1;
//   SELECT mi.id FROM menu_items mi JOIN menus m ON mi.menu_id = m.id
//     WHERE m.location_id = '<location_id>' AND mi.is_available = true LIMIT 1;
// =============================================================================
const SUPABASE_URL     = "https://dfwqakoyittmrwbqvxgw.supabase.co";
const ANON_KEY         = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmd3Fha295aXR0bXJ3YnF2eGd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDk2MjYsImV4cCI6MjA5MDg4NTYyNn0.QEHjVDajR1Q_yrh8v2KAzIHaBVYD5UpTJiH42I3_3fo";
const STORE_CONFIG_ID  = "d46226d5-30c1-4c3f-a79c-47e812edac09";   // ← from SQL above
const MENU_ITEM_ID     = "8ec036b3-085c-4b6c-8cd9-a2189b913a02";      // ← from SQL above
const MENU_ITEM_NAME   = "Test Audit Item";
const MENU_ITEM_PRICE  = 10.00;
// =============================================================================

export const options = {
  scenarios: {
    concurrent_orders: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 200 }, // ramp up  → 200 users
        { duration: "30s", target: 200 }, // hold     → 200 users
        { duration: "10s", target: 0   }, // ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"], // TC-XCC-LOAD-001 requirement
    http_req_failed:   ["rate<0.05"], // less than 5% HTTP errors
    order_e2e_time:    ["p(95)<500"], // same threshold on our custom timer
  },
};

// Custom metrics
const orderE2eTime  = new Trend("order_e2e_time", true);
const errorRate     = new Rate("errors");
const ordersCreated = new Counter("orders_created");

const HEADERS = {
  "Content-Type":  "application/json",
  "apikey":        ANON_KEY,
  "Authorization": `Bearer ${ANON_KEY}`,
};

export default function () {
  // Each VU is one customer placing one order through the real pipeline:
  // session create → stock check → price recalc → process_online_order RPC → payment record
  const start = Date.now();

  const res = http.post(
    `${SUPABASE_URL}/functions/v1/create-online-order`,
    JSON.stringify({
      store_config_id:  STORE_CONFIG_ID,
      order_type:       "pickup",
      items: [{
        id:       MENU_ITEM_ID,
        name:     MENU_ITEM_NAME,
        price:    MENU_ITEM_PRICE,
        quantity: 1,
      }],
      tip:              0,
      pay_cash_in_store: true,         // skip live payment, test order creation only
      customer_name:    `Load Test ${__VU}`,
      customer_phone:   `+1555${String(__VU).padStart(7, "0")}`,
      customer_email:   `loadtest+${__VU}@test.com`,
    }),
    { headers: HEADERS }
  );

  orderE2eTime.add(Date.now() - start);

  const ok = check(res, {
    "status 200":    (r) => r.status === 200,
    "order created": (r) => {
      try { return JSON.parse(r.body).success === true; }
      catch { return false; }
    },
  });

  if (!ok) {
    errorRate.add(1);
    console.error(`[VU ${__VU}] FAILED [HTTP ${res.status}]: ${res.body}`);
  } else {
    errorRate.add(0);
    ordersCreated.add(1);
  }

  sleep(0.1); // 100ms think-time
}

// =============================================================================
// Summary printed after the run
// =============================================================================
export function handleSummary(data) {
  const get = (metric, stat) =>
    data.metrics[metric]?.values?.[stat] ?? null;

  const p95overall  = get("http_req_duration", "p(95)");
  const p99overall  = get("http_req_duration", "p(99)");
  const medOverall  = get("http_req_duration", "med");
  const p95e2e      = get("order_e2e_time",    "p(95)");
  const errorPct    = (get("http_req_failed",  "rate") ?? 0) * 100;
  const totalOrders = get("orders_created",    "count") ?? 0;
  const rps         = get("http_reqs",         "rate") ?? 0;
  const passed      = p95overall !== null && p95overall < 500 && errorPct < 5;

  const line = "═".repeat(46);
  const dash = "─".repeat(46);

  console.log(`\n${line}`);
  console.log("   TC-XCC-LOAD-001  —  200 Concurrent Orders");
  console.log(line);
  console.log(`   Orders created       : ${totalOrders}`);
  console.log(`   Throughput           : ${rps.toFixed(1)} req/s`);
  console.log(dash);
  console.log("   LATENCY  (full edge-function pipeline)");
  console.log(`   Median               : ${medOverall?.toFixed(1) ?? "—"} ms`);
  console.log(`   P95                  : ${p95overall?.toFixed(1) ?? "—"} ms   ← must be < 500 ms`);
  console.log(`   P99                  : ${p99overall?.toFixed(1) ?? "—"} ms`);
  console.log(`   Order E2E P95        : ${p95e2e?.toFixed(1) ?? "—"} ms`);
  console.log(dash);
  console.log(`   Error rate           : ${errorPct.toFixed(2)} %`);
  console.log(dash);
  console.log(`   RESULT : ${passed ? "PASS" : "FAIL"}`);
  if (!passed) {
    if (p95overall !== null && p95overall >= 500)
      console.log(`   P95 is ${p95overall.toFixed(0)}ms — exceeds 500ms threshold`);
    if (errorPct >= 5)
      console.log(`   Error rate ${errorPct.toFixed(2)}% — exceeds 5% threshold`);
  }
  console.log(`${line}\n`);

  return {
    "load-test-results.json": JSON.stringify(data, null, 2),
  };
}
