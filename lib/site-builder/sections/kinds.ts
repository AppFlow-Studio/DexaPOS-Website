/**
 * The closed set of section kinds a merchant page can contain, and the zones
 * that constrain where each one may sit.
 *
 * v1 ships 9 of the 17 kinds in the MockBuilder spec. `reviews` and
 * `reservations` are deliberately absent — neither has a data source in this
 * repo yet (no reviews table; `lib/reservations/` is a single file). The rest
 * (`cards`, `form`, `pdf`, `video`, `events`, `scrolling-banner`) are additive:
 * a schema file plus a registry entry each, with no migration.
 *
 * See docs/features/website-builder/PLAN-01-INFRA-SECTION-CONTRACT.md
 */

export const SECTION_KINDS = [
  "header",
  "hero",
  "content",
  "gallery",
  "popular-items",
  "features",
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

export function isSectionKind(value: unknown): value is SectionKind {
  return (
    typeof value === "string" &&
    (SECTION_KINDS as readonly string[]).includes(value)
  );
}

export function isZone(value: unknown): value is Zone {
  return typeof value === "string" && (ZONES as readonly string[]).includes(value);
}
