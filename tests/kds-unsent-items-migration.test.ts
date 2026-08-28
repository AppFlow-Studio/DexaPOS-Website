import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260827153000_hq_kds_unsent_items.sql",
  ),
  "utf8",
);

describe("HQ KDS unsent items migration", () => {
  it("defines the HQ-gated unsent-items RPC", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.hq_get_kds_unsent_items_v1(",
    );
    expect(migration).toContain("public.is_dexapos_admin()");
    expect(migration).toContain(
      "RAISE EXCEPTION 'hq_get_kds_unsent_items_v1 requires Dexa HQ access'",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.hq_get_kds_unsent_items_v1",
    );
  });

  it("defines unsent as sent_to_kitchen_at IS NULL on non-voided items", () => {
    expect(migration).toContain(
      "COALESCE(oi.is_voided, false) = false",
    );
    expect(migration).toContain("AND oi2.sent_to_kitchen_at IS NULL");
    expect(migration).toContain("sent_to_kitchen_at IS NOT NULL");
    expect(migration).toContain("AS sent_item_count");
    expect(migration).toContain("AS unsent_item_count");
  });

  it("excludes orders where unsent items are expected", () => {
    expect(migration).toContain("'cancelled', 'void', 'refunded', 'declined'");
    expect(migration).toContain("AND o2.status NOT IN (");
    // '' is not a valid order_status enum label; the filter must not COALESCE
    // the enum with an empty string.
    expect(migration).not.toContain("COALESCE(o2.status, '')");
  });

  it("groups per order and reports sent/unsent counts", () => {
    expect(migration).toContain("'fully_unsent', agg.sent_item_count = 0");
    expect(migration).toContain("'unsent_item_count', agg.unsent_item_count");
    expect(migration).toContain("'sent_item_count', agg.sent_item_count");
    expect(migration).toContain("GROUP BY oi.order_id");
    expect(migration).toContain("'order_item_id', oi.id");
    expect(migration).toContain("FILTER (WHERE oi.sent_to_kitchen_at IS NULL) AS items_json");
  });

  it("supports windows, an order filter, and a bounded limit", () => {
    expect(migration).toContain("p_from timestamptz DEFAULT NULL");
    expect(migration).toContain("p_to timestamptz DEFAULT NULL");
    expect(migration).toContain("p_order_id uuid DEFAULT NULL");
    expect(migration).toContain(
      "v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))",
    );
    expect(migration).toContain(
      "AND (p_order_id IS NULL OR o2.id = p_order_id)",
    );
    expect(migration).toContain("LIMIT v_limit");
  });

  it("orders newest-first via a timezone-safe epoch sort key", () => {
    expect(migration).toContain(
      "jsonb_agg(entry ORDER BY (entry->>'order_created_ms')::bigint DESC)",
    );
    expect(migration).toContain(
      "'order_created_ms', (extract(epoch from o.created_at) * 1000)::bigint",
    );
  });
});
