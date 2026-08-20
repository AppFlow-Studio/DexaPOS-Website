/**
 * The closed set of section kinds a merchant page can contain, and the zones
 * that constrain where each one may sit.
 *
 * v1 shipped 9. Phase 4 of the Owner parity plan added five more — `cards`,
 * `reviews`, `scrolling-banner`, `video` and `pdf` — each a schema file, a
 * registry entry and a renderer, with no migration.
 *
 * `reviews` is the interesting one: it was cut from v1 on the assumption that
 * reviews meant a live Google feed. The Owner teardown showed theirs is
 * **manually curated** — a repeater of a quote and a name — which removed the
 * blocker entirely.
 *
 * Forms and Events landed with plan phases 7 and 8. Integrations then landed as
 * a strict provider allowlist. The target's one remaining kind, `reservations`,
 * needs a public write path into the existing reservations table.
 *
 * See docs/features/website-builder/PLAN-01-INFRA-SECTION-CONTRACT.md
 */

export const SECTION_KINDS = [
  "header",
  "hero",
  "content",
  "cards",
  "gallery",
  "popular-items",
  "features",
  "reviews",
  "scrolling-banner",
  "video",
  "pdf",
  "form",
  "events",
  "integrations",
  "faq",
  "location",
  "footer",
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

/**
 * Zones encode the mock's locked header/hero/footer rule as *data* rather than
 * as canvas logic, so the server can enforce it too. Anything that writes a
 * page — the builder, a future AI generator, an import tool — is bound by the
 * same rule without re-implementing it.
 */
export const ZONES = ["masthead", "body", "colophon"] as const;

export type Zone = (typeof ZONES)[number];

/** Sections are always stored in this order. `normalizePage` enforces it. */
export const ZONE_ORDER: Record<Zone, number> = {
  masthead: 0,
  body: 1,
  colophon: 2,
};

/**
 * Grouping for the Add Section modal, in the order the groups appear.
 *
 * Purely presentational — nothing validates against it and no document stores
 * it. It exists because a flat grid of choices stops being scannable somewhere
 * around a dozen entries, and v1's 9 kinds are on the way to the spec's 17.
 *
 * Named for what a restaurant owner is trying to do, not for what the section
 * technically is: "Your story" rather than "Rich text blocks".
 */
export const SECTION_CATEGORIES = [
  { id: "menu", label: "Menu" },
  { id: "story", label: "Your story" },
  { id: "media", label: "Photos" },
  { id: "extras", label: "Extras" },
  { id: "visit", label: "Visit us" },
  /** Header, hero and footer. Never offered in the modal; present for completeness. */
  { id: "frame", label: "Page frame" },
] as const;

export type SectionCategory = (typeof SECTION_CATEGORIES)[number]["id"];

export function isSectionKind(value: unknown): value is SectionKind {
  return (
    typeof value === "string" &&
    (SECTION_KINDS as readonly string[]).includes(value)
  );
}

export function isZone(value: unknown): value is Zone {
  return typeof value === "string" && (ZONES as readonly string[]).includes(value);
}
