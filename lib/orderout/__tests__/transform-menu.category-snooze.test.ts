import { describe, it, expect } from "vitest";
import { transformMenuToOrderOut } from "../transform-menu";
import type { MenuWithCategories } from "@/types/menu";

// A timestamp well in the future so snoozeToSuspendUntil() treats it as active.
const FUTURE_ISO = "2099-01-01T00:00:00.000Z";
const FUTURE_SECS = Math.floor(Date.parse(FUTURE_ISO) / 1000);
const LATER_ISO = "2099-06-01T00:00:00.000Z";
const LATER_SECS = Math.floor(Date.parse(LATER_ISO) / 1000);

function item(
  overrides: Partial<Record<string, unknown>> & { id: string; name: string },
) {
  return {
    menu_item: {
      id: overrides.id,
      name: overrides.name,
      description: "",
      effective_availability: true,
      effective_price: 10,
      snoozed_until: null,
      snooze_reason: null,
      modifier_groups: [],
      ...overrides,
    },
  };
}

function menu(category: Record<string, unknown>): MenuWithCategories {
  return {
    id: "menu-1",
    name: "Test Menu",
    categories: [category],
  } as unknown as MenuWithCategories;
}

describe("transformMenuToOrderOut — category 86 (Sold Out)", () => {
  it("keeps items of a snoozed category on the menu, marked Sold Out", () => {
    const payload = transformMenuToOrderOut(
      menu({
        id: "mc-1",
        category_id: "cat-1",
        is_active: true,
        snoozed_until: FUTURE_ISO,
        snooze_reason: "Fryer down",
        category: { name: "Fried" },
        items: [item({ id: "i1", name: "Fries" })],
      }),
    );

    expect(payload.items).toHaveLength(1);
    const it0 = payload.items[0];
    expect(it0.id).toBe("i1");
    expect(it0.suspension_info?.suspension.suspend_until).toBe(FUTURE_SECS);
    expect(it0.suspension_info?.suspension.reason).toBe("Fryer down");
    // Category stays on the menu (not dropped).
    expect(payload.categories.map((c) => c.id)).toContain("cat-1");
  });

  it("still drops a deliberately-hidden item even under a category snooze", () => {
    const payload = transformMenuToOrderOut(
      menu({
        id: "mc-1",
        category_id: "cat-1",
        is_active: true,
        snoozed_until: FUTURE_ISO,
        snooze_reason: null,
        category: { name: "Fried" },
        items: [
          item({ id: "i1", name: "Fries" }),
          item({
            id: "i2",
            name: "Hidden",
            effective_availability: false, // manager deliberate hide
            snoozed_until: null,
          }),
        ],
      }),
    );

    const ids = payload.items.map((i) => i.id);
    expect(ids).toContain("i1"); // visible item -> Sold Out
    expect(ids).not.toContain("i2"); // deliberate hide -> dropped
  });

  it("lets an item's own snooze win over the category snooze", () => {
    const payload = transformMenuToOrderOut(
      menu({
        id: "mc-1",
        category_id: "cat-1",
        is_active: true,
        snoozed_until: FUTURE_ISO, // category until Jan
        snooze_reason: "Category down",
        category: { name: "Fried" },
        items: [
          item({
            id: "i1",
            name: "Fries",
            snoozed_until: LATER_ISO, // item until June (later)
            snooze_reason: "Item down",
          }),
        ],
      }),
    );

    const it0 = payload.items[0];
    expect(it0.suspension_info?.suspension.suspend_until).toBe(LATER_SECS);
    expect(it0.suspension_info?.suspension.reason).toBe("Item down");
  });

  it("leaves a normal (non-snoozed) category's items untouched", () => {
    const payload = transformMenuToOrderOut(
      menu({
        id: "mc-1",
        category_id: "cat-1",
        is_active: true,
        snoozed_until: null,
        snooze_reason: null,
        category: { name: "Fried" },
        items: [item({ id: "i1", name: "Fries" })],
      }),
    );

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].suspension_info).toBeUndefined();
  });
});
