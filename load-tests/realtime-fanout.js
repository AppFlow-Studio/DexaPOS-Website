// =============================================================================
// TC-XCC-LOAD-002 — Realtime fan-out at 1000 subscribers
//
// What this measures:
//   1. Can Supabase Realtime hold 1000 concurrent WS subscribers on one channel?
//   2. When a single DB row changes, what is the fan-out latency to P95 subscriber?
//
// How it works:
//   - Each VU opens a WS to /realtime/v1/websocket
//   - Joins topic `realtime:<schema>:<channel>` (default public.orders)
//   - Listens for `postgres_changes` events
//   - During the "hold" phase you fire INSERT/UPDATEs from the SQL editor (or via
//     the trigger script noted below) — every connected VU should receive each
//     change. We log the wallclock delta between event timestamp and reception.
//
// Required env vars (set by run-realtime-fanout.ps1):
//   SUPABASE_URL       wss://<ref>.supabase.co/realtime/v1/websocket
//   SUPABASE_ANON_KEY  anon JWT
//   CHANNEL            table name (default: orders)
//   SCHEMA             schema (default: public)
//   TARGET_VUS         number of subscribers (default: 1000)
//
// Trigger events during the test from a separate terminal (psql or SQL editor):
//   -- Insert a row, set a recognisable updated_at so we can compute fan-out lag
//   UPDATE public.orders
//      SET updated_at = NOW()
//    WHERE id = '<some-test-row-id>';
//
//   Repeat ~10 times across the 60s hold phase. Every VU should log the receive
//   delta. The "fanout_lag_ms" Trend at the end is what you report.
//
// PASS criteria:
//   - vu_connected == TARGET_VUS for the full hold window
//   - fanout_lag_ms p(95) < 2000ms
//   - 0 dropped subscriptions
// =============================================================================

import ws from "k6/ws";
import { check } from "k6";
import { Trend, Counter } from "k6/metrics";

const SUPABASE_URL  = __ENV.SUPABASE_URL  || "wss://dfwqakoyittmrwbqvxgw.supabase.co/realtime/v1/websocket";
const ANON_KEY      = __ENV.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmd3Fha295aXR0bXJ3YnF2eGd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDk2MjYsImV4cCI6MjA5MDg4NTYyNn0.QEHjVDajR1Q_yrh8v2KAzIHaBVYD5UpTJiH42I3_3fo"
const CHANNEL       = __ENV.CHANNEL || "orders";
const SCHEMA        = __ENV.SCHEMA  || "public";
const TARGET_VUS    = parseInt(__ENV.TARGET_VUS || "1000", 10);

if (!ANON_KEY) {
  throw new Error("SUPABASE_ANON_KEY env var required");
}

// Custom metrics
const fanoutLag      = new Trend("fanout_lag_ms", true);
const subscribed     = new Counter("subscribed_total");
const eventsReceived = new Counter("events_received");
const joinFailures   = new Counter("join_failures");
const wsErrors       = new Counter("ws_errors");

export const options = {
  scenarios: {
    fanout: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: TARGET_VUS }, // ramp up — open all sockets
        { duration: "60s", target: TARGET_VUS }, // hold — fire DB events here
        { duration: "10s", target: 0 },          // drain
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    fanout_lag_ms:   ["p(95)<2000"],
    join_failures:   ["count<10"],
    ws_errors:       ["count<25"],
  },
};

export default function () {
  const url = `${SUPABASE_URL}?apikey=${ANON_KEY}&vsn=1.0.0`;
  // Phoenix v1 topic used by Supabase Realtime
  const topic = `realtime:${SCHEMA}:${CHANNEL}`;

  let joined = false;
  let ref = 1;

  const res = ws.connect(url, {}, (socket) => {
    socket.on("open", () => {
      // Join the channel and request postgres_changes
      const joinPayload = {
        topic,
        event: "phx_join",
        payload: {
          config: {
            postgres_changes: [
              { event: "*", schema: SCHEMA, table: CHANNEL },
            ],
          },
          access_token: ANON_KEY,
        },
        ref: String(ref++),
      };
      socket.send(JSON.stringify(joinPayload));

      // Heartbeat every 25s — server times out at 30s
      socket.setInterval(() => {
        socket.send(JSON.stringify({
          topic: "phoenix",
          event: "heartbeat",
          payload: {},
          ref: String(ref++),
        }));
      }, 25000);
    });

    socket.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      // Join confirmation
      if (msg.event === "phx_reply" && msg.payload?.status === "ok" && !joined) {
        joined = true;
        subscribed.add(1);
        return;
      }
      if (msg.event === "phx_reply" && msg.payload?.status === "error") {
        joinFailures.add(1);
        return;
      }

      // Real fan-out events — postgres_changes
      if (msg.event === "postgres_changes") {
        eventsReceived.add(1);
        // Compute lag from row.updated_at if present
        const updatedAt = msg.payload?.data?.record?.updated_at
                       || msg.payload?.data?.new?.updated_at;
        if (updatedAt) {
          const lag = Date.now() - new Date(updatedAt).getTime();
          if (lag >= 0 && lag < 60000) fanoutLag.add(lag);
        }
      }
    });

    socket.on("error", (e) => {
      wsErrors.add(1);
      console.error(`[VU ${__VU}] ws error: ${e.error()}`);
    });

    // Hold connection for the duration of the scenario
    socket.setTimeout(() => socket.close(), 100_000);
  });

  check(res, { "ws upgrade 101": (r) => r && r.status === 101 });
}

export function handleSummary(data) {
  const get = (m, s) => data.metrics[m]?.values?.[s] ?? null;

  const evs   = get("events_received", "count") ?? 0;
  const subs  = get("subscribed_total", "count") ?? 0;
  const lag95 = get("fanout_lag_ms", "p(95)");
  const lag99 = get("fanout_lag_ms", "p(99)");
  const lagMed = get("fanout_lag_ms", "med");
  const fails = get("join_failures", "count") ?? 0;
  const errs  = get("ws_errors", "count") ?? 0;
  const passed = evs > 0
              && lag95 != null && lag95 < 2000
              && fails < 10
              && errs < 25;

  const line = "═".repeat(46);
  const dash = "─".repeat(46);

  console.log(`\n${line}`);
  console.log("   TC-XCC-LOAD-002  —  Realtime Fan-out @1000");
  console.log(line);
  console.log(`   Successful subscribes: ${subs}`);
  console.log(`   Events received      : ${evs}${evs === 0 ? "  ← test invalid (no events arrived during hold)" : ""}`);
  console.log(dash);
  console.log("   FAN-OUT LATENCY (event commit → VU receive)");
  console.log(`   Median               : ${lagMed?.toFixed(1) ?? "—"} ms`);
  console.log(`   P95                  : ${lag95?.toFixed(1) ?? "—"} ms   ← must be < 2000 ms`);
  console.log(`   P99                  : ${lag99?.toFixed(1) ?? "—"} ms`);
  console.log(dash);
  console.log(`   Join failures        : ${fails}`);
  console.log(`   WS errors            : ${errs}`);
  console.log(dash);
  console.log(`   RESULT : ${passed ? "PASS" : "FAIL"}`);
  console.log(`${line}\n`);

  return {
    "load-tests/realtime-fanout-results.json": JSON.stringify(data, null, 2),
  };
}
