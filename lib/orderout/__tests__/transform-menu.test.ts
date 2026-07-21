import { describe, it, expect } from "vitest";
import {
  transformMenuToOrderOut,
  weeklyScheduleToServiceAvailability,
} from "../transform-menu";
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

// A bare menu (no items needed) with the given schedules array. service_availability
// is derived independently of items/categories.
function menuWithSchedules(schedules: unknown[]): MenuWithCategories {
  return {
    id: "menu-1",
    name: "Test Menu",
    schedules,
    categories: [],
  } as unknown as MenuWithCategories;
}

function scheduleWith(
  slots: { day_of_week: number; start_time: string; end_time: string }[],
  is_active = true
) {
  return { id: "ms-1", schedule: { id: "s-1", name: "S", is_active, time_slots: slots } };
}

describe("weeklyScheduleToServiceAvailability", () => {
  it("omits disabled days and maps enabled from/to windows", () => {
    const result = weeklyScheduleToServiceAvailability({
      monday: { enabled: true, from: "09:00", to: "21:00", is24Hours: false },
      sunday: { enabled: false, from: "09:00", to: "21:00", is24Hours: false },
    });
    expect(result).toEqual([
      { day_of_week: "monday", time_periods: [{ start_time: "09:00", end_time: "21:00" }] },
    ]);
  });

  it("is24Hours -> full-day 00:00-23:59 window", () => {
    const result = weeklyScheduleToServiceAvailability({
      tuesday: { enabled: true, is24Hours: true },
    });
    expect(result).toEqual([
      { day_of_week: "tuesday", time_periods: [{ start_time: "00:00", end_time: "23:59" }] },
    ]);
  });

  it("skips enabled days with an incomplete window, and normalizes HH:MM:SS", () => {
    const result = weeklyScheduleToServiceAvailability({
      monday: { enabled: true, from: "08:30:00", to: "17:00:00" },
      wednesday: { enabled: true, from: "", to: "17:00" }, // incomplete -> skipped
    });
    expect(result).toEqual([
      { day_of_week: "monday", time_periods: [{ start_time: "08:30", end_time: "17:00" }] },
    ]);
  });

  it("returns [] for null/empty input", () => {
    expect(weeklyScheduleToServiceAvailability(null)).toEqual([]);
    expect(weeklyScheduleToServiceAvailability({})).toEqual([]);
  });

  it("maps an end-of-day close (00:00 / 24:00) to 23:59 (uniform with schedules)", () => {
    expect(
      weeklyScheduleToServiceAvailability({
        monday: { enabled: true, from: "12:00", to: "00:00" },
        tuesday: { enabled: true, from: "12:00", to: "24:00" },
      })
    ).toEqual([
      { day_of_week: "monday", time_periods: [{ start_time: "12:00", end_time: "23:59" }] },
      { day_of_week: "tuesday", time_periods: [{ start_time: "12:00", end_time: "23:59" }] },
    ]);
  });
});

describe("transformMenuToOrderOut service_availability fallback", () => {
  const fallback = [
    { day_of_week: "monday", time_periods: [{ start_time: "09:00", end_time: "21:00" }] },
  ];

  it("no schedule + no fallback -> 24/7 every day (unchanged default)", () => {
    const payload = transformMenuToOrderOut(menuWithSchedules([]));
    const avail = payload.menus[0].service_availability;
    expect(avail).toHaveLength(7);
    expect(avail.every((d) => d.time_periods[0].start_time === "00:00" && d.time_periods[0].end_time === "23:59")).toBe(true);
  });

  it("no schedule + fallback -> uses the fallback (store hours)", () => {
    const payload = transformMenuToOrderOut(menuWithSchedules([]), {
      fallbackAvailability: fallback,
    });
    expect(payload.menus[0].service_availability).toEqual(fallback);
  });

  it("assigned schedule wins over the fallback", () => {
    const payload = transformMenuToOrderOut(
      menuWithSchedules([
        scheduleWith([{ day_of_week: 5, start_time: "10:00:00", end_time: "14:00:00" }]),
      ]),
      { fallbackAvailability: fallback }
    );
    expect(payload.menus[0].service_availability).toEqual([
      { day_of_week: "friday", time_periods: [{ start_time: "10:00", end_time: "14:00" }] },
    ]);
  });

  it("processes a schedule whose is_active is absent (RPC omits it)", () => {
    // get_menu_with_categories returns { id, name, time_slots } with no is_active.
    const wrapper = {
      id: "ms-1",
      schedule: {
        id: "s-1",
        name: "Online Ordering Menu",
        time_slots: [
          { day_of_week: 1, start_time: "12:00:00", end_time: "23:59:59" },
        ],
      },
    };
    const payload = transformMenuToOrderOut(menuWithSchedules([wrapper]));
    expect(payload.menus[0].service_availability).toEqual([
      { day_of_week: "monday", time_periods: [{ start_time: "12:00", end_time: "23:59" }] },
    ]);
  });

  it("explicitly inactive schedule falls back instead of pushing empty []", () => {
    const payload = transformMenuToOrderOut(
      menuWithSchedules([
        scheduleWith([{ day_of_week: 1, start_time: "12:00:00", end_time: "23:59:59" }], false),
      ]),
      { fallbackAvailability: fallback }
    );
    // Schedule inactive -> no windows -> never emit [], use the fallback.
    expect(payload.menus[0].service_availability).toEqual(fallback);
  });
});
