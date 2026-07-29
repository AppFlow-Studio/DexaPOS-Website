import type { PaymentMethod } from "@/types/order-management";

/**
 * Single source of truth for how a payment method is presented in the dashboard.
 *
 * Colors are fixed per method — never chart-library defaults and never assigned by
 * index — so a method keeps the same hue across date ranges, merchants, reloads and
 * surfaces. Hues live here (not in `--chart-*`) because those tokens are a
 * monochrome blue ramp meant for ordered series; payment methods are categorical
 * and need distinguishable hues.
 *
 * Colors are theme-independent on purpose: the swatch must match the donut segment
 * in both light and dark mode, and the label always travels with the color so the
 * chart never relies on hue alone to convey meaning.
 *
 * Adding a `payment_method` enum member? Add it here too — design assigns the hue.
 * Anything missing falls back to a neutral gray with a humanized label rather than
 * silently colliding with an existing method's color.
 */
export interface PaymentMethodDisplay {
  label: string;
  color: string;
}

/** Neutral fallback for enum members not yet given a design-assigned hue. */
export const UNKNOWN_METHOD_COLOR = "#64748B";

/**
 * Keyed by the `payment_method` Postgres enum. Kept in sync with
 * `Database["public"]["Enums"]["payment_method"]`, which includes `card` and
 * `card_online` in addition to the members named in `types/order-management.ts`.
 */
export const PAYMENT_METHOD_DISPLAY: Record<string, PaymentMethodDisplay> = {
  // Card family — brand blue is the primary series; variants stay in the blue/violet
  // range so they read as "card" at a glance while remaining distinguishable.
  card: { label: "Card", color: "#0C4FD1" },
  card_spinapi: { label: "Card (SpinAPI)", color: "#3B82F6" },
  card_dvpaylite: { label: "Card (DvPayLite)", color: "#7C3AED" },
  card_manual: { label: "Card (Manual)", color: "#0EA5E9" },
  card_online: { label: "Card (Online)", color: "#2563EB" },

  cash: { label: "Cash", color: "#16A34A" },
  external: { label: "External", color: "#F59E0B" },
  gift_card: { label: "Gift Card", color: "#DB2777" },
  house_account: { label: "House Account", color: "#0D9488" },
};

/**
 * Canonical display names for card brands, keyed by normalized brand.
 *
 * Processors disagree on casing and spacing for the same brand — Dejavoo returns
 * `"Visa"` while the Castles payload returns `"VISA"` — so aggregating on the raw
 * string splits one brand into several series. Normalize before grouping, then
 * render the canonical label here.
 */
const CARD_BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  mc: "Mastercard",
  amex: "Amex",
  americanexpress: "Amex",
  discover: "Discover",
  dinersclub: "Diners Club",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
};

/**
 * Grouping key for a card brand.
 *
 * Lowercases and strips spaces/dashes/underscores — matching the normalization in
 * `CardBrandIcon` — then resolves known aliases to a single canonical key, so
 * "Mastercard" and "MC" group together rather than merely rendering the same
 * label. Unrecognized brands fall back to their normalized form.
 */
export function normalizeCardBrand(brand: string): string {
  const normalized = brand.toLowerCase().replace(/[\s\-_]/g, "");
  const canonical = CARD_BRAND_LABELS[normalized];
  return canonical ? canonical.toLowerCase().replace(/[\s\-_]/g, "") : normalized;
}

/** Canonical label for a card brand, falling back to the processor's own string. */
export function getCardBrandLabel(brand: string): string {
  const normalized = brand.toLowerCase().replace(/[\s\-_]/g, "");
  return CARD_BRAND_LABELS[normalized] ?? brand;
}

/**
 * Canonical display names for card entry modes, keyed by normalized mode.
 *
 * As with card brands, the value can arrive from three different places that use
 * different vocabularies for the same thing — `emvcl` and `contactless` are one
 * mode, as are `emv` and `chip` — so normalize before grouping or filtering.
 */
const ENTRY_MODE_LABELS: Record<string, string> = {
  contactless: "Contactless",
  emvcl: "Contactless",
  nfc: "Contactless",
  chip: "Chip",
  emv: "Chip",
  swipe: "Swipe",
  msr: "Swipe",
  manual: "Manual",
  keyed: "Manual",
};

/** Grouping key for an entry mode, resolving aliases to one canonical key. */
export function normalizeEntryMode(mode: string): string {
  const normalized = mode.toLowerCase().replace(/[\s\-_]/g, "");
  const canonical = ENTRY_MODE_LABELS[normalized];
  return canonical ? canonical.toLowerCase().replace(/[\s\-_]/g, "") : normalized;
}

/** Canonical label for an entry mode, falling back to the processor's string. */
export function getEntryModeLabel(mode: string): string {
  const normalized = mode.toLowerCase().replace(/[\s\-_]/g, "");
  return ENTRY_MODE_LABELS[normalized] ?? mode;
}

/**
 * The card brand for a payment. Processors report it in different places, so
 * prefer the dedicated column and fall back to the Castles payload.
 */
export function resolveCardBrand(payment: {
  card_type?: string | null;
  processor_response?: Record<string, unknown> | null;
}): string | undefined {
  const castles = (
    payment.processor_response as
      | { castles_transaction?: { cardType?: string } }
      | null
      | undefined
  )?.castles_transaction?.cardType;
  return payment.card_type || castles || undefined;
}

/** The entry mode for a payment, across the three places processors report it. */
export function resolveEntryMode(payment: {
  card_entry_mode?: string | null;
  processor_response?: Record<string, unknown> | null;
}): string | undefined {
  const pr = payment.processor_response as
    | {
        entry_type?: string;
        castles_transaction?: { entryMode?: string };
      }
    | null
    | undefined;
  return (
    payment.card_entry_mode ||
    pr?.entry_type ||
    pr?.castles_transaction?.entryMode ||
    undefined
  );
}

/** Humanize an unmapped enum value: `some_new_method` -> `Some New Method`. */
function humanize(method: string): string {
  return method
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getPaymentMethodDisplay(
  method: PaymentMethod | string
): PaymentMethodDisplay {
  return (
    PAYMENT_METHOD_DISPLAY[method] ?? {
      label: humanize(method),
      color: UNKNOWN_METHOD_COLOR,
    }
  );
}

export function getPaymentMethodLabel(method: PaymentMethod | string): string {
  return getPaymentMethodDisplay(method).label;
}

export function getPaymentMethodColor(method: PaymentMethod | string): string {
  return getPaymentMethodDisplay(method).color;
}
