import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260814120000_kds_routing_traceability.sql",
  ),
  "utf8",
);

describe("KDS routing traceability migration", () => {
  it("creates scoped append-only routing and send ledgers", () => {
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.kds_routing_log",
    );
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.kds_send_attempts",
    );
    expect(migration).toContain("kds_routing_log_outcome_chk");
    expect(migration).toContain("kds_routing_log_reason_chk");
    expect(migration).toContain(
      "ALTER TABLE public.kds_routing_log FORCE ROW LEVEL SECURITY",
    );
    expect(migration).toContain(
      "ALTER TABLE public.kds_send_attempts FORCE ROW LEVEL SECURITY",
    );
    expect(migration).toContain(
      "BEFORE UPDATE OR DELETE ON public.kds_routing_log",
    );
    expect(migration).toContain(
      "BEFORE UPDATE OR DELETE ON public.kds_send_attempts",
    );
    expect(migration).toContain("NULLS NOT DISTINCT");
    expect(migration).toContain("public.is_dexapos_admin()");
    expect(migration).toContain("merchant_id = public.user_merchant_id()");
    expect(migration).toContain(
      "location_id = ANY(public.user_location_ids())",
    );
  });

  it("records every routing result without removing the existing fallbacks", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.route_items_to_kds()",
    );
    expect(migration).toContain("'routing_mode_all'");
    expect(migration).toContain("'show_all_items'");
    expect(migration).toContain("'fallback_expo'");
    expect(migration).toContain("'fallback_blast'");
    expect(migration).toContain("'no_active_display'");
    expect(migration).toContain(
      "FROM generate_subscripts(v_display_ids, 1) AS i",
    );
    expect(migration).toContain("NEW.category_name = v_rule.rule_value");
    expect(migration).not.toContain("btrim(NEW.category_name)");
    expect(migration).toContain("SET prep_station = v_resolved_prep_station");
  });

  it("returns requested and true updated counts", () => {
    expect(migration).toContain(
      "v_requested_count integer := COALESCE(array_length(p_order_item_ids, 1), 0)",
    );
    expect(migration).toContain("GET DIAGNOSTICS v_updated_count = ROW_COUNT");
    expect(migration).toContain("'updated_count', v_updated_count");
    expect(migration).toContain("'requested_count', v_requested_count");
    expect(migration).toContain("'kds_updated_count', v_kds_updated_count");
    expect(migration).toContain(
      "COALESCE(oi.refunded_quantity, 0) < oi.quantity",
    );
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.bulk_update_order_item_status_v2(\n  uuid[], text, uuid, uuid\n)",
    );
    expect(migration).not.toContain(
      "'updated_count',      array_length(p_order_item_ids, 1)",
    );
  });

  it("captures initial and replayed send attempts with optional POS context", () => {
    expect(migration).toContain("p_station_id uuid DEFAULT NULL");
    expect(migration).toContain("p_device_id text DEFAULT NULL");
    expect(migration).toContain("COALESCE(p_station_id, v_order_station_id)");
    expect(migration).toContain("COALESCE(p_device_id, v_order_device_id)");
    expect(migration).toContain("p_idempotency_key,\n          true");
    expect(migration).toContain("p_idempotency_key,\n    false");
    expect(migration).toContain(
      "v_caller_merchant := public.user_merchant_id()",
    );
  });

  it("exposes a tenant-scoped trace and seven-day health view", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_order_routing_trace(p_order_id uuid)",
    );
    expect(migration).toContain("'current_kds_status', kis.status");
    expect(migration).toContain("'has_divergence'");
    expect(migration).toContain("auth.role() = 'service_role'");
    expect(migration).toContain(
      "CREATE OR REPLACE VIEW public.v_kds_routing_health",
    );
    expect(migration).toContain("WITH (security_invoker = true)");
    expect(migration).toContain("items_routed_by_fallback");
    expect(migration).toContain("status_divergence_count");
  });

  it("backfills only derivable historical routes", () => {
    expect(migration).toContain("'backfill_unknown'");
    expect(migration).toContain("FROM public.kds_item_status kis");
    expect(migration).toContain("Historical\n-- non-matches are not guessed");
  });
});
