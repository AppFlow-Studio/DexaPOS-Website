import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real server actions against an in-memory receipt_templates table
// that enforces the same unique key as the database:
// (merchant_id, location_id, template_type).

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  seq: 0,
  audit: vi.fn(),
}));

vi.mock("@/app/dashboard/actions/audit-logs", () => ({
  LogAuditEvent: state.audit,
}));

vi.mock("@/lib/supabase/server", () => {
  class TemplatesQuery {
    private filters: ((r: Row) => boolean)[] = [];
    private written: Row[] | null = null;

    select() {
      return this;
    }
    order() {
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((r) => r[column] === value);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.filters.push((r) => values.includes(r[column]));
      return this;
    }
    upsert(input: Row | Row[], options?: { ignoreDuplicates?: boolean }) {
      this.written = [];
      for (const row of Array.isArray(input) ? input : [input]) {
        const existing = state.rows.find(
          (r) =>
            r.merchant_id === row.merchant_id &&
            r.location_id === row.location_id &&
            r.template_type === row.template_type,
        );
        if (existing) {
          if (options?.ignoreDuplicates) continue;
          Object.assign(existing, row);
          this.written.push(existing);
        } else {
          const created = {
            id: `row-${++state.seq}`,
            is_active: true,
            print_signature_line: false,
            signature_line_disclaimer: null,
            ...row,
          };
          state.rows.push(created);
          this.written.push(created);
        }
      }
      return this;
    }
    private result() {
      return (
        this.written ??
        state.rows.filter((r) => this.filters.every((f) => f(r)))
      );
    }
    single() {
      const rows = this.result();
      return Promise.resolve(
        rows.length === 1
          ? { data: rows[0], error: null }
          : { data: null, error: { code: "PGRST116", message: "no rows" } },
      );
    }
    then<T>(resolve: (v: { data: Row[]; error: null }) => T) {
      return Promise.resolve({ data: this.result(), error: null }).then(resolve);
    }
  }

  const lookup = (data: Row) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      single: () => Promise.resolve({ data, error: null }),
    };
    return chain;
  };

  return {
    createServerSupabaseClient: () => ({
      from: (table: string) => {
        if (table === "receipt_templates") return new TemplatesQuery();
        if (table === "merchants") return lookup({ id: "merchant-1" });
        return lookup({ name: "Test Location" });
      },
    }),
  };
});

import {
  getReceiptTemplate,
  getReceiptTemplates,
  initializeDefaultTemplates,
  upsertReceiptTemplate,
} from "@/app/dashboard/actions/receipt-templates";

const LOCATION = "location-1";

function seed(template_type: string, extra: Row = {}) {
  const row = {
    id: `seed-${template_type}`,
    merchant_id: "merchant-1",
    location_id: LOCATION,
    template_type,
    template_name: "Default",
    is_active: true,
    print_signature_line: false,
    signature_line_disclaimer: null,
    ...extra,
  };
  state.rows.push(row);
  return row;
}

const typesAt = (location: string) =>
  state.rows
    .filter((r) => r.location_id === location)
    .map((r) => r.template_type)
    .sort();

beforeEach(() => {
  state.rows.length = 0;
  state.seq = 0;
  state.audit.mockReset();
});

describe("saving the Sale Receipt tab", () => {
  it("updates the row the POS made instead of creating a 'sale' row", async () => {
    seed("receipt", {
      header_text: "Welcome",
      logo_url: "https://cdn.example/logo.png",
      modifier_style: "inverted",
      show_customer_phone: true,
    });

    const result = await upsertReceiptTemplate("org-1", {
      location_id: LOCATION,
      template_type: "sale",
      header_text: "Now open for brunch",
      footer_text: "Thank you!",
      print_signature_line: true,
      signature_line_disclaimer: "All sales final.",
    });

    expect(result.success).toBe(true);
    expect(typesAt(LOCATION)).toEqual(["receipt"]);

    const row = state.rows[0];
    expect(row.id).toBe("seed-receipt");
    expect(row.header_text).toBe("Now open for brunch");
    expect(row.print_signature_line).toBe(true);
    expect(row.signature_line_disclaimer).toBe("All sales final.");
    // Columns only the POS manages are left alone.
    expect(row.logo_url).toBe("https://cdn.example/logo.png");
    expect(row.modifier_style).toBe("inverted");
    expect(row.show_customer_phone).toBe(true);
  });

  it("hands the row back to the UI as 'sale'", async () => {
    const result = await upsertReceiptTemplate("org-1", {
      location_id: LOCATION,
      template_type: "sale",
    });
    expect(result.data?.template_type).toBe("sale");
  });

  it("creates a 'receipt' row when the location has none", async () => {
    await upsertReceiptTemplate("org-1", {
      location_id: LOCATION,
      template_type: "sale",
      print_signature_line: true,
    });
    expect(typesAt(LOCATION)).toEqual(["receipt"]);
  });

  it("stores a blank disclaimer as NULL so the POS default prints", async () => {
    await upsertReceiptTemplate("org-1", {
      location_id: LOCATION,
      template_type: "sale",
      print_signature_line: true,
      signature_line_disclaimer: "   \n ",
    });
    expect(state.rows[0].signature_line_disclaimer).toBeNull();
  });

  it("leaves the signature setting alone when a save doesn't mention it", async () => {
    seed("receipt", {
      print_signature_line: true,
      signature_line_disclaimer: "All sales final.",
    });

    await upsertReceiptTemplate("org-1", {
      location_id: LOCATION,
      template_type: "sale",
      footer_text: "Thank you!",
    });

    expect(state.rows[0].print_signature_line).toBe(true);
    expect(state.rows[0].signature_line_disclaimer).toBe("All sales final.");
  });

  it("records both names in the audit log", async () => {
    await upsertReceiptTemplate("org-1", {
      location_id: LOCATION,
      template_type: "sale",
    });
    expect(state.audit).toHaveBeenCalledTimes(1);
    expect(state.audit.mock.calls[0][0].metadata).toMatchObject({
      template_type: "sale",
      db_template_type: "receipt",
    });
  });

  it("saves every other tab under its own name", async () => {
    await upsertReceiptTemplate("org-1", {
      location_id: LOCATION,
      template_type: "kitchen",
    });
    expect(typesAt(LOCATION)).toEqual(["kitchen"]);
  });
});

describe("reading templates", () => {
  beforeEach(() => {
    seed("receipt", { footer_text: "from the POS row" });
    seed("sale", { footer_text: "leftover" });
    seed("sale_retired", { is_active: false, footer_text: "retired" });
    seed("refund");
    seed("kitchen");
  });

  it("lists the 'receipt' row as the Sale Receipt and skips rows the Website doesn't manage", async () => {
    const result = await getReceiptTemplates(LOCATION);
    const types = result.data?.map((t) => t.template_type).sort();
    expect(types).toEqual(["kitchen", "sale"]);

    const sale = result.data?.find((t) => t.template_type === "sale");
    expect(sale?.id).toBe("seed-receipt");
    expect(sale?.footer_text).toBe("from the POS row");
  });

  it("fetches the 'receipt' row when asked for the sale template", async () => {
    const result = await getReceiptTemplate(LOCATION, "sale");
    expect(result.data?.id).toBe("seed-receipt");
    expect(result.data?.template_type).toBe("sale");
  });

  it("returns nothing, without an error, when the template doesn't exist", async () => {
    const result = await getReceiptTemplate(LOCATION, "no_sale");
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });
});

describe("creating default templates", () => {
  it("never overwrites a row that already exists", async () => {
    seed("receipt", { footer_text: "set on the tablet", show_tip_line: false });

    const result = await initializeDefaultTemplates("org-1", LOCATION, ["sale"]);

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].footer_text).toBe("set on the tablet");
    expect(state.rows[0].show_tip_line).toBe(false);
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("creates the Sale Receipt as a 'receipt' row with what the POS prints", async () => {
    const result = await initializeDefaultTemplates("org-1", LOCATION, ["sale"]);

    expect(result.data?.map((t) => t.template_type)).toEqual(["sale"]);
    expect(typesAt(LOCATION)).toEqual(["receipt"]);
    expect(state.rows[0]).toMatchObject({
      show_logo: false,
      show_barcode: false,
      show_qr_code: false,
      show_tip_line: true,
      print_signature_line: false,
      footer_text: "Thank you for your purchase!",
    });
    expect(state.audit).toHaveBeenCalledTimes(1);
  });

  it("fills in only the missing types when asked for all of them", async () => {
    seed("receipt", { footer_text: "set on the tablet" });
    seed("kitchen", { large_item_text: false });

    const result = await initializeDefaultTemplates("org-1", LOCATION);

    expect(result.data?.map((t) => t.template_type).sort()).toEqual([
      "cash_drawer",
      "end_of_day",
      "no_sale",
      "online_order",
      "void_refund",
    ]);
    expect(typesAt(LOCATION)).toEqual([
      "cash_drawer",
      "end_of_day",
      "kitchen",
      "no_sale",
      "online_order",
      "receipt",
      "void_refund",
    ]);
    expect(state.rows.find((r) => r.id === "seed-receipt")?.footer_text).toBe(
      "set on the tablet",
    );
    expect(state.rows.find((r) => r.id === "seed-kitchen")?.large_item_text).toBe(
      false,
    );
  });
});
