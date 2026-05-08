// =============================================================================
// Helper for TC-XCC-LOAD-002 — fires DB events while realtime-fanout.js holds.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TARGET_ROW_ID=<uuid> \
//     node load-tests/trigger-fanout-events.js
//
// Run this in a SECOND terminal during the 60s hold phase of the k6 test.
// It updates one row 10 times with 5s spacing. Each UPDATE pushes a
// postgres_changes event that should fan out to all 1000 subscribers.
// =============================================================================

import { createClient } from "@supabase/supabase-js";

const URL  = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROW  = process.env.TARGET_ROW_ID || '14bbf04d-2a8e-4944-b37d-d953e8262b14';
const TBL  = process.env.TARGET_TABLE || "orders";
const N    = parseInt(process.env.PULSE_COUNT || "10", 10);
const GAP  = parseInt(process.env.PULSE_GAP_MS || "5000", 10);

if (!URL || !KEY || !ROW) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TARGET_ROW_ID required");
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

(async () => {
  console.log(`Pulsing ${TBL}#${ROW} ${N}× every ${GAP}ms`);
  for (let i = 1; i <= N; i++) {
    const t0 = Date.now();
    const { error } = await sb.from(TBL)
      .update({ updated_at: new Date().toISOString() })
      .eq("id", ROW);
    const dt = Date.now() - t0;
    if (error) console.error(`  pulse ${i} FAILED: ${error.message}`);
    else       console.log(`  pulse ${i} ok (${dt}ms)`);
    if (i < N) await new Promise(r => setTimeout(r, GAP));
  }
  console.log("done");
})();
