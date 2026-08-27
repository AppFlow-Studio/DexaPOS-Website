import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260827170000_hq_kds_send_ledger.sql",
  ),
  "utf8",
);

describe("HQ KDS send ledger migration", () => {
  it("defines the HQ-gated send ledger RPC over kds_send_attempts", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.hq_get_kds_send_ledger_v1(",
    );
    expect(migration).toContain("FROM public.kds_send_attempts sa");
    expect(migration).toContain("p_location_id IS NULL");
    expect(migration).toContain("public.is_dexapos_admin()");
    expect(migration).toContain(
      "RAISE EXCEPTION 'hq_get_kds_send_ledger_v1 requires Dexa HQ access'",
    );
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.hq_get_kds_send_ledger_v1");
  });

  it("projects requested vs actually-updated counts so partial sends are visible", () => {
    expect(migration).toContain("'requested_count', sa.requested_count");
    expect(migration).toContain(
      "'actually_updated_count', sa.actually_updated_count",
    );
    expect(migration).toContain(
      "'partial', sa.actually_updated_count <> sa.requested_count",
    );
  });

  it("carries POS origin context and replay evidence", () => {
    expect(migration).toContain("'station_name', st.station_name");
    expect(migration).toContain("'device_id', sa.device_id");
    expect(migration).toContain("'was_replay', sa.was_replay");
    expect(migration).toContain("'idempotency_key', sa.idempotency_key");
    expect(migration).toContain("LEFT JOIN public.stations st");
    expect(migration).toContain("LEFT JOIN public.staff_profiles sp");
  });

  it("resolves per-item routing outcomes from the routing log", () => {
    expect(migration).toContain(
      "FROM unnest(sa.requested_item_ids) WITH ORDINALITY AS rid(order_item_id, ord)",
    );
    expect(migration).toContain("'routed_to', COALESCE(rt.routed_displays");
    expect(migration).toContain("'dropped', COALESCE(rt.dropped, false)");
    expect(migration).toContain(
      "FILTER (WHERE l.outcome = 'routed') AS routed_displays",
    );
    expect(migration).toContain("bool_or(l.outcome = 'dropped') AS dropped");
  });

  it("supports time windows, an order filter, and a bounded limit", () => {
    expect(migration).toContain("p_from timestamptz DEFAULT NULL");
    expect(migration).toContain("p_to timestamptz DEFAULT NULL");
    expect(migration).toContain("p_order_id uuid DEFAULT NULL");
    expect(migration).toContain("sa.created_at >= v_from");
    expect(migration).toContain("sa.created_at <= v_to");
    expect(migration).toContain(
      "AND (p_order_id IS NULL OR sa.order_id = p_order_id)",
    );
    expect(migration).toContain("LIMIT v_limit");
    expect(migration).toContain(
      "v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))",
    );
  });

  it("orders rows newest-first via a timezone-safe epoch sort key", () => {
    expect(migration).toContain(
      "jsonb_agg(entry ORDER BY (entry->>'created_at_ms')::bigint DESC)",
    );
    expect(migration).toContain(
      "'created_at_ms', (extract(epoch from sa.created_at) * 1000)::bigint",
    );
  });
});
