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

export interface TransformMenuOptions {
  // Per-day availability to fall back to when the menu has NO assigned schedule.
  // Sourced from the location's operating hours (see lib/orderout/hours.ts). When
  // omitted/empty, buildServiceAvailability keeps the legacy 24/7 default so a
  // missing hours config never hides the menu.
  fallbackAvailability?: OrderOutServiceAvailability[];
}

export function transformMenuToOrderOut(
  menu: MenuWithCategories,
  options?: TransformMenuOptions
): OrderOutMenuPayload {
  const itemMap = new Map<string, OrderOutItem>();
  const modifierGroupMap = new Map<string, OrderOutModifierGroup>();
  const modifierItemMap = new Map<string, OrderOutItem>();
  const categories: OrderOutCategory[] = [];

  // Process each category
  for (const menuCategory of menu.categories) {
    if (!menuCategory.is_active) continue;

    // Category-level 86: a snoozed category stays on the menu but marks all of its
    // (otherwise-visible) items "Sold Out" via suspension_info instead of dropping
    // them. Auto-restores at suspend_until (same as items). Deliberate hide is
    // orthogonal — is_active=false already dropped the category above.
    const catSuspendUntil = snoozeToSuspendUntil(
      (menuCategory as any).snoozed_until
    );

    const categoryEntities: OrderOutCategoryEntity[] = [];

    for (const catItem of menuCategory.items) {
      const mi = catItem.menu_item;

      // Out-of-stock (86) vs deliberately unavailable are different:
      //  - 86'd item OR item in a 86'd category -> keep it, marked "Sold Out" via
      //    suspension_info (Uber auto-restores at suspend_until).
      //  - unavailable for any OTHER reason (manager hid it / not sold here) -> drop,
      //    even under a category snooze.
      // Treat a missing/undefined effective_availability as available so a dropped
      // RPC field can never again silently zero out the entire menu (migration
      // 20260625000000_restore_effective_availability_in_get_menu_with_categories).
      const itemSuspendUntil = snoozeToSuspendUntil((mi as any).snoozed_until);
      const itemSnoozed = itemSuspendUntil !== null;
      if (mi.effective_availability === false && !itemSnoozed) continue;

      // Item's own snooze wins; otherwise the category snooze cascades down.
      const suspendUntil = itemSuspendUntil ?? catSuspendUntil;
      const isSnoozed = suspendUntil !== null;
      const suspendReason =
        (mi as any).snooze_reason ||
        (menuCategory as any).snooze_reason ||
        "Out of stock";

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
                    reason: suspendReason,
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

  // Build service availability from schedules (falling back to location hours)
  const serviceAvailability = buildServiceAvailability(
    menu,
    options?.fallbackAvailability
  );

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
    // OrderOut has NO per-modifier out-of-stock mechanism. Unlike items (which support
    // suspension_info / a suspend endpoint), a modifier option can only be made
    // unavailable by REMOVING it from the menu payload and re-uploading the whole menu
    // — which the 86 full-resync already does. get_menu_with_categories folds the snooze
    // into is_active, so an 86'd option arrives is_active=false and is dropped here
    // alongside genuinely-inactive ones. (Do NOT emit suspension_info for modifiers; it
    // is a no-op on OrderOut and leaves the option orderable.)
    if (!item.is_active) continue;

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
      });
    }

    modifierOptions.push({ type: "ITEM", id: item.id });
  }

  // Required groups must enforce at least one selection even if min_selections is 0.
  const baseMin = mg.is_required
    ? Math.max(mg.min_selections, 1)
    : mg.min_selections;
  // Removing 86'd options can push a group above its surviving option count and make
  // the re-upload invalid. Clamp both bounds to the number of options that actually
  // survive (0 when the whole group is 86'd, leaving an empty group rather than a
  // dangling reference from the parent item).
  const minPermitted = Math.min(baseMin, modifierOptions.length);
  // Null max_selections = "no limit" -> represent as "select up to all options".
  const maxPermitted = Math.min(
    mg.max_selections ?? modifierOptions.length,
    modifierOptions.length,
  );

  modifierGroupMap.set(mg.id, {
    id: mg.id,
    title: { translations: { en_us: mg.name } },
    modifier_options: modifierOptions,
    quantity_info: {
      quantity: {
        min_permitted: minPermitted,
        max_permitted: maxPermitted,
      },
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

// One day of a stored WeeklySchedule (online_store_config.operating_hours /
// locations.business_hours). Kept structural so this pure module doesn't import
// the "use client" hook that declares WeeklySchedule.
interface WeeklyScheduleDay {
  enabled?: boolean;
  from?: string;
  to?: string;
  is24Hours?: boolean;
}
type WeeklyScheduleLike = Partial<
  Record<(typeof DAY_NAMES)[number], WeeklyScheduleDay>
>;

/**
 * Convert a stored WeeklySchedule (operating hours) into OrderOut per-day
 * service availability. Disabled days are omitted (OrderOut treats a missing
 * day as closed). Returns [] when nothing usable is configured.
 */
export function weeklyScheduleToServiceAvailability(
  hours: WeeklyScheduleLike | null | undefined
): OrderOutServiceAvailability[] {
  if (!hours) return [];

  const out: OrderOutServiceAvailability[] = [];
  for (const day of DAY_NAMES) {
    const d = hours[day];
    if (!d || !d.enabled) continue; // closed / unset -> omit the day

    if (d.is24Hours) {
      out.push({
        day_of_week: day,
        time_periods: [{ start_time: "00:00", end_time: "23:59" }],
      });
      continue;
    }

    if (!d.from || !d.to) continue; // incomplete window -> skip
    out.push({
      day_of_week: day,
      time_periods: [
        { start_time: formatTime(d.from), end_time: formatTime(d.to) },
      ],
    });
  }
  return out;
}

function buildServiceAvailability(
  menu: MenuWithCategories,
  fallback?: OrderOutServiceAvailability[]
): OrderOutServiceAvailability[] {
  if (!menu.schedules || menu.schedules.length === 0) {
    // No assigned schedule: prefer the location's operating hours, else default
    // to available all day every day (never hide the menu on a missing config).
    if (fallback && fallback.length > 0) {
      return fallback;
    }
    return DAY_NAMES.map((day) => ({
      day_of_week: day,
      time_periods: [{ start_time: "00:00", end_time: "23:59" }],
    }));
  }

  // Group time slots by day across all schedules
  const daySlots = new Map<string, { start_time: string; end_time: string }[]>();

  for (const scheduleWrapper of menu.schedules) {
    const schedule = scheduleWrapper.schedule;
    // get_menu_with_categories does NOT return schedule.is_active, so only skip a
    // schedule that is EXPLICITLY inactive. Treating undefined as inactive dropped
    // every slot -> empty service_availability -> the marketplace shows all days
    // Closed and refuses to publish the menu.
    if (schedule?.is_active === false) continue;

    for (const slot of schedule?.time_slots ?? []) {
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

  const result = Array.from(daySlots.entries()).map(([day, periods]) => ({
    day_of_week: day,
    time_periods: periods,
  }));

  // An empty service_availability is unpublishable (all days Closed). If the
  // assigned schedule(s) yielded nothing usable, fall back to the location's
  // operating hours, then to 24/7 — never push an empty window.
  if (result.length === 0) {
    if (fallback && fallback.length > 0) return fallback;
    return DAY_NAMES.map((day) => ({
      day_of_week: day,
      time_periods: [{ start_time: "00:00", end_time: "23:59" }],
    }));
  }

  return result;
}
