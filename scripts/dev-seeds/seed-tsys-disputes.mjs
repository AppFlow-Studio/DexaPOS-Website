#!/usr/bin/env node
// Dev-only: seeds 4 chargebacks rows against real order_payments so the
// "TSYS Disputes" page (app/dashboard/payments/disputes) has something to render.
// Run:  node scripts/dev-seeds/seed-tsys-disputes.mjs
//
// Uses the same merchant as scripts/dev-seeds/seed-my-tips.mjs (first
// staff_profiles row), or set MERCHANT_ID env var to target a specific one.

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
  let merchantId = process.env.MERCHANT_ID;
  if (!merchantId) {
    const { data: staffRows, error } = await supabase.from("staff_profiles").select("merchant_id").limit(1);
    if (error) throw error;
    merchantId = staffRows?.[0]?.merchant_id;
  }
  if (!merchantId) throw new Error("No merchant found. Set MERCHANT_ID env var explicitly.");

  const { data: merchant, error: merchantErr } = await supabase
    .from("merchants")
    .select("id, name")
    .eq("id", merchantId)
    .single();
  if (merchantErr) throw merchantErr;

  const { data: locations, error: locErr } = await supabase
    .from("locations")
    .select("id")
    .eq("merchant_id", merchantId)
    .limit(1);
  if (locErr) throw locErr;
  const location = locations?.[0];
  if (!location) throw new Error(`No locations row for merchant_id=${merchantId}`);

  console.log(`Seeding disputes for merchant="${merchant.name}" (${merchantId}) location_id=${location.id}`);

  // Find real captured payments for this merchant to attach disputes to, so
  // the "Source Transaction" panel and Order # link render with real data.
  let { data: payments, error: paymentsErr } = await supabase
    .from("order_payments")
    .select("id, order_id, card_last_four")
    .eq("merchant_id", merchantId)
    .eq("status", "captured")
    .order("captured_at", { ascending: false })
    .limit(4);
  if (paymentsErr) throw paymentsErr;

  if (!payments || payments.length === 0) {
    console.log("  No captured order_payments found — creating 4 minimal test orders + payments first.");
    payments = [];
    for (let i = 0; i < 4; i++) {
      const subtotal = 50 + i * 20;
      const tax = Math.round(subtotal * 0.089 * 100) / 100;
      const total = subtotal + tax;
      const orderNumber = `ORD-DISPUTE-SEED-${Date.now()}-${i}`;
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          order_number: orderNumber,
          display_number: `#${9000 + i}`,
          merchant_id: merchantId,
          location_id: location.id,
          order_type: "takeout",
          status: "completed",
          subtotal,
          tax_amount: tax,
          total_amount: total,
          payment_status: "paid",
          amount_paid: total,
          amount_due: 0,
          completed_at: new Date().toISOString(),
        })
        .select("id, order_number")
        .single();
      if (orderErr) throw orderErr;

      const { data: payment, error: paymentErr } = await supabase
        .from("order_payments")
        .insert({
          order_id: order.id,
          merchant_id: merchantId,
          location_id: location.id,
          payment_method: "card",
          amount: subtotal,
          tax_amount: tax,
          total_amount: total,
          status: "captured",
          terminal_type: "dejavoo",
          card_type: "visa",
          card_last_four: String(1000 + i * 111).slice(-4),
          authorization_code: `AUTH${1000 + i}`,
          captured_at: new Date().toISOString(),
        })
        .select("id, order_id, card_last_four")
        .single();
      if (paymentErr) throw paymentErr;

      console.log(`    + order ${order.order_number} / payment ${payment.id}`);
      payments.push(payment);
    }
  }
  // Reuse payments if fewer than 4 exist.
  const pick = (i) => payments[i % payments.length].id;

  const now = Date.now();
  const daysFromNow = (n) => new Date(now + n * 86400000).toISOString();

  const disputes = [
    {
      original_payment_id: pick(0),
      merchant_id: merchantId,
      location_id: location.id,
      amount: 84.5,
      reason_code: "4853",
      reason_description: "Cardholder disputes quality of goods or services",
      card_network: "visa",
      status: "notified",
      defendable: true,
      defense_deadline: daysFromNow(3),
      received_at: daysFromNow(-4),
    },
    {
      original_payment_id: pick(1),
      merchant_id: merchantId,
      location_id: location.id,
      amount: 132.0,
      reason_code: "10.4",
      reason_description: "Other fraud - card-absent environment",
      card_network: "mastercard",
      status: "under_review",
      defendable: true,
      defense_deadline: daysFromNow(14),
      defense_documents: [
        { name: "receipt.pdf", url: "https://example.com/receipt.pdf", uploaded_at: new Date(now - 5 * 86400000).toISOString() },
      ],
      received_at: daysFromNow(-9),
    },
    {
      original_payment_id: pick(2),
      merchant_id: merchantId,
      location_id: location.id,
      amount: 45.25,
      reason_code: "13.1",
      reason_description: "Merchandise/services not received",
      card_network: "visa",
      status: "notified",
      defendable: true,
      defense_deadline: daysFromNow(-2), // overdue
      received_at: daysFromNow(-20),
    },
    {
      original_payment_id: pick(3),
      merchant_id: merchantId,
      location_id: location.id,
      amount: 220.0,
      reason_code: "4863",
      reason_description: "Cardholder does not recognize transaction",
      card_network: "amex",
      status: "won",
      defendable: true,
      defense_deadline: daysFromNow(-25),
      defense_submitted_at: daysFromNow(-28),
      defense_documents: [
        { name: "signed_receipt.pdf", url: "https://example.com/signed_receipt.pdf", uploaded_at: new Date(now - 28 * 86400000).toISOString() },
      ],
      resolved_at: daysFromNow(-15),
      resolution: "merchant_favor",
      resolution_amount: 0,
      received_at: daysFromNow(-30),
    },
  ];

  for (const dispute of disputes) {
    const { data, error } = await supabase.from("chargebacks").insert(dispute).select("id, status").single();
    if (error) throw error;
    console.log(`  + ${dispute.reason_code} (${data.status}) chargeback=${data.id}`);
  }

  console.log("Done. Refresh /dashboard/payments/disputes to see the seeded disputes.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
