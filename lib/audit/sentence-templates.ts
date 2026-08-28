// ============================================================================
// Audit Sentence Engine
// Transforms raw audit log rows into human-readable sentences for display.
// Handles both the new { field: { old, new } } changes format and the
// legacy { before: {...}, after: {...} } format used in existing logs.
// ============================================================================

import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import type { AuditLogWithLocation } from "@/types/audit-log";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditTemplate {
  /** Pattern uses {actor}, {resource}, {detail}, {amount} placeholders */
  sentence: string;
  /** Extract the single most important change to highlight */
  changeHighlight?: (
    changes: Record<string, { old: unknown; new: unknown }>
  ) => string | null;
}

// ─── Template Map ─────────────────────────────────────────────────────────────

const AUDIT_TEMPLATES: Record<string, Record<string, AuditTemplate>> = {
  // ── Menu & Items ────────────────────────────────────────────────────────────
  menu_item: {
    created: { sentence: '{actor} added a new menu item: "{resource}"' },
    updated: {
      sentence: '{actor} updated the menu item "{resource}"',
      changeHighlight: (c) => {
        if (c.price)
          return `Price changed from $${c.price.old} to $${c.price.new}`;
        if (c.is_available !== undefined)
          return (c.is_available as { new: boolean }).new
            ? "Marked as available"
            : "Marked as unavailable";
        if (c.item_name)
          return `Renamed from "${c.item_name.old}" to "${c.item_name.new}"`;
        return null;
      },
    },
    deleted: { sentence: '{actor} removed the menu item "{resource}"' },
    archived: { sentence: '{actor} archived the menu item "{resource}"' },
  },

  category: {
    created: { sentence: '{actor} created a new category: "{resource}"' },
    updated: { sentence: '{actor} updated the category "{resource}"' },
    deleted: { sentence: '{actor} deleted the category "{resource}"' },
  },

  menu: {
    created: { sentence: '{actor} created a new menu: "{resource}"' },
    updated: { sentence: '{actor} updated the menu "{resource}"' },
    deleted: { sentence: '{actor} deleted the menu "{resource}"' },
    published: {
      sentence: '{actor} published the menu "{resource}" to the POS',
    },
  },

  modifier_group: {
    created: { sentence: '{actor} added a new modifier group: "{resource}"' },
    updated: { sentence: '{actor} updated modifier group "{resource}"' },
    deleted: { sentence: '{actor} removed modifier group "{resource}"' },
  },

  discount: {
    created: { sentence: '{actor} created a new discount: "{resource}"' },
    updated: { sentence: '{actor} updated the discount "{resource}"' },
    deleted: { sentence: '{actor} removed the discount "{resource}"' },
    applied: {
      sentence: '{actor} applied discount "{resource}" to an order',
    },
  },

  // ── KDS & Kitchen ───────────────────────────────────────────────────────────
  kds_display: {
    created: {
      sentence: '{actor} set up a new kitchen display: "{resource}"',
    },
    updated: {
      sentence: '{actor} changed kitchen display settings for "{resource}"',
      changeHighlight: (c) => {
        if (c.alert_minutes)
          return `Alert time changed from ${c.alert_minutes.old} min to ${c.alert_minutes.new} min`;
        if (c.auto_bump_minutes)
          return `Auto-bump changed from ${c.auto_bump_minutes.old} min to ${c.auto_bump_minutes.new} min`;
        if (c.routing_mode) return `Routing changed to ${c.routing_mode.new}`;
        return null;
      },
    },
    deleted: { sentence: '{actor} removed the kitchen display "{resource}"' },
  },

  prep_station: {
    created: { sentence: '{actor} created a new prep station: "{resource}"' },
    updated: { sentence: '{actor} updated prep station "{resource}"' },
    deleted: { sentence: '{actor} removed prep station "{resource}"' },
  },

  kds_routing_rule: {
    created: {
      sentence: '{actor} set a routing rule for the {resource} station',
    },
    updated: {
      sentence: '{actor} updated a routing rule for the {resource} station',
    },
    deleted: {
      sentence: '{actor} removed a routing rule from the {resource} station',
    },
  },

  // ── Staff & Access ──────────────────────────────────────────────────────────
  staff_profile: {
    created: { sentence: "{actor} added a new staff member: {resource}" },
    updated: {
      sentence: "{actor} updated staff member {resource}",
      changeHighlight: (c) => {
        if (c.role)
          return `Role changed from ${c.role.old} to ${c.role.new}`;
        if (c.is_active !== undefined)
          return (c.is_active as { new: boolean }).new
            ? "Account re-activated"
            : "Account deactivated";
        return null;
      },
    },
    deleted: { sentence: "{actor} removed staff member {resource}" },
    pin_reset: { sentence: "{actor} reset the POS PIN for {resource}" },
    deactivated: { sentence: "{actor} deactivated staff member {resource}" },
    activated: { sentence: "{actor} re-activated staff member {resource}" },
  },

  staff_member: {
    created: { sentence: "{actor} added a new staff member: {resource}" },
    updated: {
      sentence: "{actor} updated staff member {resource}",
      changeHighlight: (c) => {
        if (c.role)
          return `Role changed from ${c.role.old} to ${c.role.new}`;
        return null;
      },
    },
    deleted: { sentence: "{actor} removed staff member {resource}" },
    pin_reset: { sentence: "{actor} reset the POS PIN for {resource}" },
  },

  location_member: {
    created: { sentence: "{actor} assigned {resource} to a new location" },
    updated: {
      sentence: "{actor} updated location assignment for {resource}",
    },
    deleted: { sentence: "{actor} removed {resource} from a location" },
  },

  // ── Orders & Payments ───────────────────────────────────────────────────────
  order: {
    created: { sentence: "{actor} created order #{resource}" },
    completed: { sentence: "{actor} completed order #{resource}" },
    cancelled: { sentence: "{actor} cancelled order #{resource}" },
    voided: {
      sentence: "{actor} voided order #{resource}",
      changeHighlight: (c) =>
        (c as unknown as { void_reason?: { new: string } }).void_reason
          ? `Reason: ${(c as unknown as { void_reason: { new: string } }).void_reason.new}`
          : null,
    },
    refunded: {
      sentence: "{actor} refunded order #{resource}",
      changeHighlight: (c) =>
        (c as unknown as { amount?: { new: number } }).amount
          ? `Amount: $${(c as unknown as { amount: { new: number } }).amount.new}`
          : null,
    },
  },

  order_item: {
    voided: {
      sentence: "{actor} voided an item on order #{resource}",
      changeHighlight: (c) =>
        (c as unknown as { void_reason?: { new: string } }).void_reason
          ? `Reason: ${(c as unknown as { void_reason: { new: string } }).void_reason.new}`
          : null,
    },
    refunded: {
      sentence: "{actor} refunded an item on order #{resource}",
    },
  },

  payment: {
    processed: {
      sentence: "{actor} processed a payment on order #{resource}",
    },
    failed: { sentence: "Payment failed on order #{resource}" },
    refunded: { sentence: "{actor} issued a refund on order #{resource}" },
    tip_adjusted: {
      sentence: "{actor} adjusted the tip on order #{resource}",
    },
  },

  // ── Location & Settings ─────────────────────────────────────────────────────
  location: {
    created: { sentence: '{actor} added a new location: "{resource}"' },
    updated: {
      sentence: '{actor} updated location settings for "{resource}"',
      changeHighlight: (c) => {
        if (c.tax_rate)
          return `Tax rate changed from ${c.tax_rate.old}% to ${c.tax_rate.new}%`;
        if (c.name)
          return `Renamed from "${c.name.old}" to "${c.name.new}"`;
        return null;
      },
    },
  },

  tax_rate: {
    created: { sentence: '{actor} added a new tax rate: "{resource}"' },
    updated: { sentence: '{actor} changed tax rate "{resource}"' },
    deleted: { sentence: '{actor} removed tax rate "{resource}"' },
  },

  // ── Floor Plan & Tables ─────────────────────────────────────────────────────
  floor_plan: {
    created: { sentence: '{actor} created a new floor plan: "{resource}"' },
    updated: { sentence: '{actor} updated the floor plan "{resource}"' },
    deleted: { sentence: '{actor} deleted the floor plan "{resource}"' },
  },

  floor_plan_object: {
    created: {
      sentence: '{actor} added table "{resource}" to the floor plan',
    },
    updated: { sentence: '{actor} moved or resized table "{resource}"' },
    deleted: {
      sentence: '{actor} removed table "{resource}" from the floor plan',
    },
  },

  // ── Device & Terminal ───────────────────────────────────────────────────────
  station: {
    created: {
      sentence: '{actor} registered a new POS station: "{resource}"',
    },
    updated: {
      sentence: '{actor} updated POS station settings for "{resource}"',
    },
    deleted: { sentence: '{actor} removed POS station "{resource}"' },
  },

  payment_terminal: {
    created: {
      sentence: '{actor} added a new payment terminal: "{resource}"',
    },
    updated: { sentence: '{actor} updated payment terminal "{resource}"' },
    deleted: { sentence: '{actor} removed payment terminal "{resource}"' },
  },

  // ── Inventory ───────────────────────────────────────────────────────────────
  inventory_item: {
    created: { sentence: '{actor} added inventory item: "{resource}"' },
    updated: { sentence: '{actor} updated inventory for "{resource}"' },
    restocked: { sentence: '{actor} restocked "{resource}"' },
    low_stock: {
      sentence: 'Low stock alert: "{resource}" is below threshold',
    },
  },

  // ── Schedules ───────────────────────────────────────────────────────────────
  schedule: {
    created: { sentence: "{actor} published a new schedule" },
    updated: { sentence: "{actor} updated the schedule" },
    deleted: { sentence: "{actor} deleted the schedule" },
  },

  shift: {
    created: { sentence: "{actor} assigned a shift to {resource}" },
    updated: { sentence: "{actor} updated a shift for {resource}" },
    deleted: { sentence: "{actor} removed a shift from {resource}" },
    swap: { sentence: "{actor} swapped shifts for {resource}" },
  },

  // ── Customer ────────────────────────────────────────────────────────────────
  customer: {
    created: { sentence: "{actor} added a new customer: {resource}" },
    updated: {
      sentence: "{actor} updated customer profile for {resource}",
    },
    deleted: { sentence: "{actor} removed customer {resource}" },
  },

  // ── Cash Drawer ─────────────────────────────────────────────────────────────
  cash_drawer: {
    "Cash Drawer: Opened for sale": {
      sentence: "{actor} opened the cash drawer for a sale",
    },
    "Cash Drawer: Opened without sale (no-sale)": {
      sentence: "{actor} opened the cash drawer with no linked sale",
    },
    "Cash Drawer: Cash paid out": {
      sentence: '{actor} made a cash payout from "{resource}"',
      changeHighlight: (c) =>
        c.amount_dollars
          ? `Amount: $${(c.amount_dollars as { new: unknown }).new ?? c.amount_dollars}`
          : null,
    },
    "Cash Drawer: Manual adjustment": {
      sentence: '{actor} made a manual adjustment to "{resource}"',
    },
    "Cash Drawer: Cash drop": {
      sentence: '{actor} performed a cash drop on "{resource}"',
    },
    "Cash Drawer: Session closed": {
      sentence: '{actor} closed the cash drawer session for "{resource}"',
    },
    opened:   { sentence: '{actor} opened the cash drawer "{resource}"' },
    closed:   { sentence: '{actor} closed the cash drawer "{resource}"' },
    paid_out: {
      sentence: '{actor} made a cash payout from "{resource}"',
    },
    adjustment: {
      sentence: '{actor} made a manual adjustment to "{resource}"',
    },
  },

  // ── Session Management ───────────────────────────────────────────────────────
  station_session: {
    kicked: {
      sentence: '{actor} force-ended the active session on "{resource}"',
      changeHighlight: (c) =>
        c.reason ? `Reason: ${(c.reason as { new: unknown }).new ?? c.reason}` : null,
    },
  },
};

// ─── Action Normalization ─────────────────────────────────────────────────────

const KNOWN_VERBS = [
  "created",
  "updated",
  "deleted",
  "archived",
  "published",
  "applied",
  "completed",
  "cancelled",
  "voided",
  "refunded",
  "processed",
  "failed",
  "deactivated",
  "activated",
  "pin_reset",
  "swap",
  "restocked",
  "low_stock",
  "tip_adjusted",
  "kicked",
  "paid_out",
  "adjustment",
  "opened",
  "closed",
];

/**
 * Extracts a normalized action verb from various input formats:
 * - "created"                  → "created"
 * - "Created Category: X"      → "created"
 * - "staff.pin_reset"          → "pin_reset"
 * - "inventory.item_updated"   → "updated"
 */
function normalizeAction(action: string): string {
  if (!action) return "";
  const lower = action.toLowerCase().trim();

  // Direct match
  if (KNOWN_VERBS.includes(lower)) return lower;

  // Dotted notation: "staff.pin_reset", "inventory.item_created"
  const dotParts = lower.split(".");
  if (dotParts.length > 1) {
    const lastPart = dotParts[dotParts.length - 1];
    if (KNOWN_VERBS.includes(lastPart)) return lastPart;
    // "item_updated" → "updated"
    for (const verb of KNOWN_VERBS) {
      if (
        lastPart.endsWith(`_${verb}`) ||
        lastPart.startsWith(`${verb}_`) ||
        lastPart === verb
      ) {
        return verb;
      }
    }
  }

  // "Created Category: X" starts with a known verb
  for (const verb of KNOWN_VERBS) {
    if (lower.startsWith(verb)) return verb;
    // "pin reset" → "pin_reset"
    if (lower.replace(/ /g, "_").startsWith(verb)) return verb;
  }

  return lower;
}

// ─── Changes Normalization ────────────────────────────────────────────────────

type ChangesInput = AuditLogWithLocation["changes"];

/**
 * Converts either changes format to { field: { old, new } } so
 * changeHighlight functions have a consistent shape to work with.
 *
 * Handles:
 *   New:    { field: { old: x, new: y } }
 *   Legacy: { before: { field: x }, after: { field: y } }
 */
function normalizeChangesForHighlight(
  changes: ChangesInput
): Record<string, { old: unknown; new: unknown }> | null {
  if (!changes) return null;
  const c = changes as Record<string, unknown>;

  // New format detection: any key (besides before/after/reason) with { old, new }
  const hasFieldDiffs = Object.keys(c).some(
    (k) =>
      k !== "before" &&
      k !== "after" &&
      k !== "reason" &&
      typeof c[k] === "object" &&
      c[k] !== null &&
      ("old" in (c[k] as object) || "new" in (c[k] as object))
  );

  if (hasFieldDiffs) {
    return c as Record<string, { old: unknown; new: unknown }>;
  }

  // Legacy format: { before: {...}, after: {...} }
  const changes_ = changes as {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  if (changes_.before !== undefined || changes_.after !== undefined) {
    const before = changes_.before || {};
    const after = changes_.after || {};
    const result: Record<string, { old: unknown; new: unknown }> = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        result[key] = { old: before[key], new: after[key] };
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  return null;
}

// ─── Icon Mappings ────────────────────────────────────────────────────────────

/** Maps resource_type to a lucide-react icon name */
export const RESOURCE_TYPE_ICON_NAMES: Record<string, string> = {
  menu_item: "Utensils",
  category: "FolderOpen",
  menu: "BookOpen",
  modifier_group: "ListPlus",
  discount: "Tag",
  kds_display: "Monitor",
  prep_station: "Flame",
  kds_routing_rule: "GitBranch",
  staff_profile: "UserCircle",
  staff_member: "UserCircle",
  location_member: "Users",
  order: "Receipt",
  order_item: "ShoppingBag",
  payment: "CreditCard",
  location: "MapPin",
  tax_rate: "Percent",
  floor_plan: "LayoutGrid",
  floor_plan_object: "Square",
  station: "Tablet",
  payment_terminal: "CreditCard",
  inventory_item: "Package",
  schedule: "CalendarDays",
  shift: "Clock",
  customer: "User",
  cash_drawer: "DollarSign",
  station_session: "LogOut",
  role: "Shield",
};

/** Maps action_category to a lucide-react icon name (fallback) */
export const CATEGORY_ICON_NAMES: Record<string, string> = {
  menu: "Utensils",
  staff: "Users",
  user_management: "Users",
  order: "Receipt",
  inventory: "Package",
  settings: "Settings",
  authentication: "Shield",
  device: "Tablet",
  purchase_order: "FileText",
  expense: "DollarSign",
  merchant: "Building2",
  notes: "StickyNote",
};

// ─── Severity Styling ─────────────────────────────────────────────────────────
// Moved to lib/constants/audit-severity.ts — a BadgeStyle {dot,text,bg} triple
// matching the rest of the app's status badges (see UI-DESIGN-SYSTEM.md §4.6b).

// ─── Relative Time ────────────────────────────────────────────────────────────

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMinutes = (Date.now() - date.getTime()) / 60_000;

  if (diffMinutes < 60) {
    return formatDistanceToNow(date, { addSuffix: true });
  }
  if (isToday(date)) {
    return `Today at ${format(date, "h:mm a")}`;
  }
  if (isYesterday(date)) {
    return `Yesterday at ${format(date, "h:mm a")}`;
  }
  if (date.getFullYear() === new Date().getFullYear()) {
    return `${format(date, "MMM d")} at ${format(date, "h:mm a")}`;
  }
  return `${format(date, "MMM d, yyyy")} at ${format(date, "h:mm a")}`;
}

// ─── Sentence Builder ─────────────────────────────────────────────────────────

export interface AuditSentenceResult {
  sentence: string;
  highlight: string | null;
  iconName: string;
}

/** Builds a human-readable sentence from an audit log entry. */
export function buildAuditSentence(
  log: AuditLogWithLocation
): AuditSentenceResult {
  const action = normalizeAction(log.action ?? "");
  const resourceType = log.resource_type ?? "";
  const template = AUDIT_TEMPLATES[resourceType]?.[action];

  const iconName =
    RESOURCE_TYPE_ICON_NAMES[resourceType] ||
    CATEGORY_ICON_NAMES[log.action_category] ||
    "Activity";

  if (!template) {
    return {
      sentence: buildFallbackSentence(log),
      highlight: null,
      iconName,
    };
  }

  const sentence = template.sentence
    .replace("{actor}", log.actor_name ?? "System")
    .replace("{resource}", log.resource_name ?? "unknown");

  const normalizedChanges = normalizeChangesForHighlight(log.changes);
  const highlight =
    template.changeHighlight && normalizedChanges
      ? template.changeHighlight(normalizedChanges)
      : null;

  return { sentence, highlight, iconName };
}

function buildFallbackSentence(log: AuditLogWithLocation): string {
  const actor = log.actor_name ?? "System";
  const action = log.action ?? "performed an action";

  // If the action is already a reasonable human string (e.g. "Created Category: X"),
  // return it with actor prepended — but avoid doubling the resource name.
  if (log.resource_name && action.toLowerCase().includes(log.resource_name.toLowerCase())) {
    // Capitalize first letter, lowercase the rest for readability
    const cleaned = action.charAt(0).toUpperCase() + action.slice(1);
    return `${actor}: ${cleaned}`;
  }

  const resource = log.resource_name ? ` on "${log.resource_name}"` : "";
  // Clean dotted/underscored actions: "inventory.item_created" → "inventory item created"
  const cleaned = action
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .toLowerCase();

  return `${actor} ${cleaned}${resource}`;
}

// ─── Changes Display (English) ────────────────────────────────────────────────

export interface ChangeDisplayRow {
  field: string;
  from: string | null;
  to: string | null;
}

/**
 * Converts the changes JSON into an array of plain-English key/value rows
 * for display in the detail panel. Never exposes raw JSON to the merchant.
 */
export function formatChangesForDisplay(
  changes: ChangesInput
): ChangeDisplayRow[] {
  if (!changes) return [];

  const c = changes as Record<string, unknown>;
  const result: ChangeDisplayRow[] = [];

  // New format: { field: { old, new } }
  const hasFieldDiffs = Object.keys(c).some(
    (k) =>
      k !== "before" &&
      k !== "after" &&
      k !== "reason" &&
      typeof c[k] === "object" &&
      c[k] !== null &&
      ("old" in (c[k] as object) || "new" in (c[k] as object))
  );

  if (hasFieldDiffs) {
    for (const [key, value] of Object.entries(c)) {
      if (key === "reason") continue;
      const v = value as { old?: unknown; new?: unknown };
      if (v && typeof v === "object") {
        result.push({
          field: humanizeFieldName(key),
          from: v.old != null ? formatFieldValue(v.old) : null,
          to: v.new != null ? formatFieldValue(v.new) : null,
        });
      }
    }
    return result;
  }

  // Legacy format: { before: {...}, after: {...} }
  const legacyChanges = changes as {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reason?: string;
  };
  if (legacyChanges.before !== undefined || legacyChanges.after !== undefined) {
    const before = legacyChanges.before || {};
    const after = legacyChanges.after || {};
    const hasBoth =
      Object.keys(before).length > 0 && Object.keys(after).length > 0;
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      const fromVal = before[key];
      const toVal = after[key];
      // If we have both sides, only show what changed
      if (hasBoth && JSON.stringify(fromVal) === JSON.stringify(toVal))
        continue;

      result.push({
        field: humanizeFieldName(key),
        from: fromVal != null ? formatFieldValue(fromVal) : null,
        to: toVal != null ? formatFieldValue(toVal) : null,
      });
    }

    if (legacyChanges.reason) {
      result.push({ field: "Reason", from: null, to: legacyChanges.reason });
    }

    return result;
  }

  // Flat object (create/delete — just "after" data as new values)
  for (const [key, value] of Object.entries(c)) {
    if (key === "reason") continue;
    result.push({
      field: humanizeFieldName(key),
      from: null,
      to: value != null ? formatFieldValue(value) : null,
    });
  }

  return result;
}

function humanizeFieldName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
