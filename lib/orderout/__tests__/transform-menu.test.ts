import { describe, it, expect } from "vitest";
import { transformMenuToOrderOut } from "../transform-menu";
import type { MenuWithCategories, ModifierGroup } from "@/types/menu";

// Build a minimal MenuWithCategories with one item carrying one modifier group.
// Only the fields transformMenuToOrderOut actually reads are populated.
function menuWithModifierGroup(mg: ModifierGroup): MenuWithCategories {
  return {
    id: "menu-1",
    name: "Test Menu",
    schedules: [],
    categories: [
      {
        category_id: "cat-1",
        is_active: true,
        category: { name: "Desserts" },
        items: [
          {
            menu_item: {
              id: "item-1",
              name: "Sundae",
              description: "",
              effective_price: 5,
              effective_availability: true,
              modifier_groups: [mg],
            },
          },
        ],
      },
    ],
  } as unknown as MenuWithCategories;
}

function makeGroup(overrides: Partial<ModifierGroup>): ModifierGroup {
  return {
    id: "mg-1",
    name: "Toppings",
    description: null,
    min_selections: 0,
    max_selections: null,
    is_required: false,
    is_active: true,
    items: [
      { id: "opt-1", name: "A", description: null, price_modifier: 0, is_active: true, stock_tracking_mode: "in_stock", current_stock: null },
      { id: "opt-2", name: "B", description: null, price_modifier: 0, is_active: true, stock_tracking_mode: "in_stock", current_stock: null },
      { id: "opt-3", name: "C", description: null, price_modifier: 0, is_active: true, stock_tracking_mode: "in_stock", current_stock: null },
    ],
    ...overrides,
  };
}

function firstGroupQuantity(payload: ReturnType<typeof transformMenuToOrderOut>) {
  return payload.modifier_groups[0].quantity_info.quantity;
}

describe("transformMenuToOrderOut modifier group quantity_info", () => {
  it("nests min/max_permitted under a `quantity` key (OrderOut/Uber shape)", () => {
    const payload = transformMenuToOrderOut(
      menuWithModifierGroup(makeGroup({ is_required: true, min_selections: 1, max_selections: 1 }))
    );
    const group = payload.modifier_groups[0];
    // The bug we fixed: these must be nested, not flat on quantity_info.
    expect(group.quantity_info).toEqual({ quantity: { min_permitted: 1, max_permitted: 1 } });
    expect((group.quantity_info as Record<string, unknown>).min_permitted).toBeUndefined();
  });

  it("required single-select (min 1 / max 1) -> min_permitted 1, max_permitted 1", () => {
    const payload = transformMenuToOrderOut(
      menuWithModifierGroup(makeGroup({ is_required: true, min_selections: 1, max_selections: 1 }))
    );
    expect(firstGroupQuantity(payload)).toEqual({ min_permitted: 1, max_permitted: 1 });
  });

  it("required with min_selections 0 floors min_permitted to 1", () => {
    const payload = transformMenuToOrderOut(
      menuWithModifierGroup(makeGroup({ is_required: true, min_selections: 0, max_selections: 2 }))
    );
    expect(firstGroupQuantity(payload)).toEqual({ min_permitted: 1, max_permitted: 2 });
  });

  it("optional unlimited (max null) -> max_permitted = option count", () => {
    const payload = transformMenuToOrderOut(
      menuWithModifierGroup(makeGroup({ is_required: false, min_selections: 0, max_selections: null }))
    );
    // 3 active options.
    expect(firstGroupQuantity(payload)).toEqual({ min_permitted: 0, max_permitted: 3 });
  });

  it("clamps min and max to surviving options when some are 86'd (inactive)", () => {
    const group = makeGroup({ is_required: true, min_selections: 2, max_selections: 3 });
    group.items[1].is_active = false;
    group.items[2].is_active = false;
    const payload = transformMenuToOrderOut(menuWithModifierGroup(group));
    // Only 1 option survives -> both bounds clamp to 1.
    expect(firstGroupQuantity(payload)).toEqual({ min_permitted: 1, max_permitted: 1 });
  });

  it("whole group 86'd (no active options) -> min/max 0", () => {
    const group = makeGroup({ is_required: true, min_selections: 1, max_selections: 2 });
    group.items.forEach((i) => (i.is_active = false));
    const payload = transformMenuToOrderOut(menuWithModifierGroup(group));
    expect(firstGroupQuantity(payload)).toEqual({ min_permitted: 0, max_permitted: 0 });
  });
});
