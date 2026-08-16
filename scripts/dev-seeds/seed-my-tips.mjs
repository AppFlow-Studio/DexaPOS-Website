#!/usr/bin/env node
// Dev-only: seeds 3 approved tip_distribution_sessions + details rows so the
// "My Tip History" page (Shift Breakdown) has something to render.
// Run:  node scripts/dev-seeds/seed-my-tips.mjs
//
// Picks the first staff_profiles row it finds (or STAFF_PROFILE_ID env var to
// target a specific one) and seeds shifts against their merchant/location.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const raw = readFileSync(new URL("../../.env", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  let staffQuery = supabase.from("staff_profiles").select("id, merchant_id").limit(1);
  if (process.env.STAFF_PROFILE_ID) {
    staffQuery = supabase.from("staff_profiles").select("id, merchant_id").eq("id", process.env.STAFF_PROFILE_ID);
  }
  const { data: staffRows, error: staffErr } = await staffQuery;
  if (staffErr) throw staffErr;
  const staff = staffRows?.[0];
  if (!staff) throw new Error("No staff_profiles row found. Set STAFF_PROFILE_ID env var explicitly.");

  const { data: locations, error: locErr } = await supabase
    .from("locations")
    .select("id")
    .eq("merchant_id", staff.merchant_id)
    .limit(1);
  if (locErr) throw locErr;
  const location = locations?.[0];
  if (!location) throw new Error(`No locations row for merchant_id=${staff.merchant_id}`);

  console.log(`Seeding tips for staff_profile_id=${staff.id} merchant_id=${staff.merchant_id} location_id=${location.id}`);

  const today = new Date();
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };

  const shifts = [
    {
      session_date: daysAgo(3),
      shift_period: "dinner",
      total_tips_collected: 420,
      total_distributed: 185,
      detail: {
        role_code: "server",
        hours_worked: 6.5,
        individual_tips_earned: 180,
        tip_pool_contributed: 40,
        tip_pool_received: 55,
        tip_out_given: 15,
        tip_out_received: 5,
        manual_adjustment: 0,
        net_tips: 185,
      },
    },
    {
      session_date: daysAgo(5),
      shift_period: "lunch",
      total_tips_collected: 210,
      total_distributed: 106.5,
      detail: {
        role_code: "server",
        hours_worked: 4.0,
        individual_tips_earned: 95,
        tip_pool_contributed: 20,
        tip_pool_received: 30,
        tip_out_given: 10,
        tip_out_received: 3.5,
        manual_adjustment: 8.5,
        net_tips: 106.5,
      },
    },
    {
      session_date: daysAgo(9),
      shift_period: "full_day",
      total_tips_collected: 540,
      total_distributed: 237,
      detail: {
        role_code: "bartender",
        hours_worked: 8.0,
        individual_tips_earned: 260,
        tip_pool_contributed: 60,
        tip_pool_received: 45,
        tip_out_given: 20,
        tip_out_received: 12,
        manual_adjustment: 0,
        net_tips: 237,
      },
    },
  ];

  for (const shift of shifts) {
    const { data: session, error: sessionErr } = await supabase
      .from("tip_distribution_sessions")
      .insert({
        merchant_id: staff.merchant_id,
        location_id: location.id,
        session_date: shift.session_date,
        shift_period: shift.shift_period,
        status: "approved",
        approved_at: new Date().toISOString(),
        total_tips_collected: shift.total_tips_collected,
        total_distributed: shift.total_distributed,
      })
      .select("id")
      .single();
    if (sessionErr) throw sessionErr;

    const { error: detailErr } = await supabase.from("tip_distribution_details").insert({
      session_id: session.id,
      staff_profile_id: staff.id,
      ...shift.detail,
    });
    if (detailErr) throw detailErr;

    console.log(`  + ${shift.session_date} (${shift.shift_period}) session=${session.id}`);
  }

  console.log("Done. Refresh /dashboard/tips/my-tips to see the seeded shifts.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
