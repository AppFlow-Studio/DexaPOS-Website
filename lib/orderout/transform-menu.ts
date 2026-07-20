// ============================================================================
// Menu Transformer: Dexa POS → OrderOut Format
// Pure function, no side effects, fully testable
// ============================================================================

import type { MenuWithCategories, ModifierGroup } from "@/types/menu";
import type {
  OrderOutMenuPayload,
  OrderOutItem,
  OrderOutCategory,
  OrderOutCategoryEntity,
  OrderOutMenu,
  OrderOutModifierGroup,
  OrderOutModifierOption,
  OrderOutServiceAvailability,
} from "./types";

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function formatTime(timeStr: string): string {
  // Convert "HH:MM:SS" to "HH:MM"
  const parts = timeStr.split(":");
  return `${parts[0]}:${parts[1]}`;
}

function priceToCents(price: number): number {
  return Math.round(price * 100);
}

// "Until manually restored" (snoozed_until = 'infinity') has no representable
// timestamp — use a far-future one so Uber keeps it Sold Out until we clear it.
export const INDEFINITE_SUSPEND_UNTIL = 4102444800; // 2100-01-01 UTC, seconds

// Map a snooze (location_item_overrides.snoozed_until) to Uber Eats suspend_until
// (unix SECONDS). Returns null when not currently snoozed (available). Shared with
// the surgical per-item suspension push (app/dashboard/actions/orderout.ts) so the
// full-menu transform and the single-item toggle agree on one mapping.
export function snoozeToSuspendUntil(
  snoozedUntil: string | null | undefined,
): number | null {
  if (!snoozedUntil) return null;
  if (snoozedUntil === "infinity") return INDEFINITE_SUSPEND_UNTIL;
  const ms = new Date(snoozedUntil).getTime();
  if (!Number.isFinite(ms)) return INDEFINITE_SUSPEND_UNTIL;
  const sec = Math.floor(ms / 1000);
  // Past timestamps mean the snooze has expired -> available.
  return sec > Math.floor(Date.now() / 1000) ? sec : null;
}

export function transformMenuToOrderOut(
  menu: MenuWithCategories
): OrderOutMenuPayload {
  const itemMap = new Map<string, OrderOutItem>();
  const modifierGroupMap = new Map<string, OrderOutModifierGroup>();
  const modifierItemMap = new Map<string, OrderOutItem>();
  const categories: OrderOutCategory[] = [];

  // Process each category
  for (const menuCategory of menu.categories) {
    if (!menuCategory.is_active) continue;

    const categoryEntities: OrderOutCategoryEntity[] = [];

    for (const catItem of menuCategory.items) {
      const mi = catItem.menu_item;

      // Out-of-stock (86) vs deliberately unavailable are different:
      //  - 86'd item -> keep it on the menu, marked "Sold Out" via suspension_info
      //    (Uber auto-restores at suspend_until).
      //  - unavailable for any OTHER reason (manager hid it / not sold here) -> drop.
      // Treat a missing/undefined effective_availability as available so a dropped
      // RPC field can never again silently zero out the entire menu (migration
      // 20260625000000_restore_effective_availability_in_get_menu_with_categories).
      const suspendUntil = snoozeToSuspendUntil((mi as any).snoozed_until);
      const isSnoozed = suspendUntil !== null;
      if (mi.effective_availability === false && !isSnoozed) continue;

      // Deduplicate regular items by menu_item.id
      if (!itemMap.has(mi.id)) {
        const price =
          (mi as any).effective_delivery_price ??
          mi.effective_price;

        const modGroupIds = mi.modifier_groups
          .filter((mg) => mg.is_active)
          .map((mg) => mg.id);

        itemMap.set(mi.id, {
          id: mi.id,
          title: { translations: { en_us: mi.name } },
          description: {
            translations: { en_us: mi.description || "" },
          },
          price_info: { price: priceToCents(price) },
          modifier_group_ids: { ids: modGroupIds },
          ...(isSnoozed
            ? {
                suspension_info: {
                  suspension: {
                    suspend_until: suspendUntil,
                    reason: (mi as any).snooze_reason || "Out of stock",
                  },
                },
              }
            : {}),
        });

        // Collect modifier groups and their items
        for (const mg of mi.modifier_groups) {
          if (!mg.is_active) continue;
          collectModifierGroup(mg, modifierGroupMap, modifierItemMap);
        }
      }

      categoryEntities.push({ type: "ITEM", id: mi.id });
    }

    if (categoryEntities.length > 0) {
      categories.push({
        id: menuCategory.category_id,
        title: {
          translations: {
            en_us: menuCategory.category?.name || "Untitled",
          },
        },
        entities: categoryEntities,
      });
    }
  }

  // Build service availability from schedules
  const serviceAvailability = buildServiceAvailability(menu);

  // Build the single menu entry
  const orderOutMenus: OrderOutMenu[] = [
    {
      id: menu.id,
      title: { translations: { en_us: menu.name } },
      category_ids: categories.map((c) => c.id),
      service_availability: serviceAvailability,
    },
  ];

  // Combine regular items + modifier items
  const allItems = [
    ...Array.from(itemMap.values()),
    ...Array.from(modifierItemMap.values()),
  ];

  return {
    name: menu.name,
    items: allItems,
    categories,
    menus: orderOutMenus,
    modifier_groups: Array.from(modifierGroupMap.values()),
    display_options: { disable_item_instructions: false },
  };
}

function collectModifierGroup(
  mg: ModifierGroup,
  modifierGroupMap: Map<string, OrderOutModifierGroup>,
  modifierItemMap: Map<string, OrderOutItem>
): void {
  if (modifierGroupMap.has(mg.id)) return;

  const modifierOptions: OrderOutModifierOption[] = [];

  for (const item of mg.items) {
    // A 86'd modifier option arrives with is_active=false (get_menu_with_categories
    // folds the snooze into is_active) but keeps its raw snoozed_until. Mirror the
    // regular-item path above: keep it on the menu marked "Sold Out" via
    // suspension_info rather than dropping it — Uber auto-restores at suspend_until,
    // and dropping/re-adding options churns the menu and can break a required
    // group's min_selections. Only a genuinely-inactive (non-snoozed) option is dropped.
    const suspendUntil = snoozeToSuspendUntil(item.snoozed_until);
    const isSnoozed = suspendUntil !== null;
    if (!item.is_active && !isSnoozed) continue;

    // Add modifier item (deduplicated)
    if (!modifierItemMap.has(item.id)) {
      modifierItemMap.set(item.id, {
        id: item.id,
        title: { translations: { en_us: item.name } },
        description: {
          translations: { en_us: item.description || "" },
        },
        price_info: { price: priceToCents(item.price_modifier) },
        modifier_group_ids: { ids: [] },
        ...(isSnoozed
          ? {
              suspension_info: {
                suspension: {
                  suspend_until: suspendUntil,
                  reason: item.snooze_reason || "Out of stock",
                },
              },
            }
          : {}),
      });
    }

    modifierOptions.push({ type: "ITEM", id: item.id });
  }

  modifierGroupMap.set(mg.id, {
    id: mg.id,
    title: { translations: { en_us: mg.name } },
    modifier_options: modifierOptions,
    quantity_info: {
      min_permitted: mg.min_selections,
      max_permitted: mg.max_selections,
    },
  });
}

/**
 * Deterministic JSON serializer for reliable JSONB comparison.
 * Postgres JSONB may reorder keys alphabetically, so we sort keys before stringifying.
 */
export function canonicalStringify(obj: unknown): string {
  return JSON.stringify(obj, (_, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce((s: Record<string, unknown>, k) => {
          s[k] = value[k];
          return s;
        }, {});
    }
    return value;
  });
}

function buildServiceAvailability(
  menu: MenuWithCategories
): OrderOutServiceAvailability[] {
  if (!menu.schedules || menu.schedules.length === 0) {
    // No schedules = available all day every day
    return DAY_NAMES.map((day) => ({
      day_of_week: day,
      time_periods: [{ start_time: "00:00", end_time: "23:59" }],
    }));
  }

  // Group time slots by day across all schedules
  const daySlots = new Map<string, { start_time: string; end_time: string }[]>();

  for (const scheduleWrapper of menu.schedules) {
    const schedule = scheduleWrapper.schedule;
    if (!schedule?.is_active) continue;

    for (const slot of schedule.time_slots) {
      const dayName = DAY_NAMES[slot.day_of_week];
      if (!dayName) continue;

      const existing = daySlots.get(dayName) || [];
      existing.push({
        start_time: formatTime(slot.start_time),
        end_time: formatTime(slot.end_time),
      });
      daySlots.set(dayName, existing);
    }
  }

  return Array.from(daySlots.entries()).map(([day, periods]) => ({
    day_of_week: day,
    time_periods: periods,
  }));
}
