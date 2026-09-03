/**
 * Whether a section's live references will actually render.
 *
 * The renderer already knows this — it resolves every binding and quietly drops
 * the ones that fail, which is the correct behaviour for a public page and the
 * wrong behaviour for an editor. A merchant whose signature dish was 86'd this
 * morning should not discover it from a customer.
 *
 * This reaches the same verdict the resolver does, on the client, from the
 * catalog the picker has already loaded: an id absent from the catalog is
 * `not_found`; an id present but not `available` is `unavailable`. Those are the
 * only two states the platform can distinguish (see `bindings/resolved.ts`), so
 * there is no third case to invent.
 */

import { collectSectionBindings } from "./bindings/collect";
import type { UnavailableReason } from "./bindings/resolved";
import type { PageDocument } from "./page-document";
import { isLiveBound } from "./sections/registry";
import type { Section } from "./sections/types";

/** The subset of a catalog item this check needs. */
export interface HealthCatalogEntry {
  id: string;
  available: boolean;
}

export interface BrokenBinding {
  id: string;
  reason: UnavailableReason;
}

export interface SectionHealth {
  /** This kind pulls something live from the POS at render time. */
  live: boolean;
  /** References that will not render. Empty is the happy path. */
  broken: BrokenBinding[];
}

const HEALTHY: SectionHealth = { live: false, broken: [] };

/**
 * Checks one section against the loaded menu catalog.
 *
 * **Only `menu_item` bindings are checked.** A `location` or `hours` binding
 * points at the merchant's own restaurant record, which had to exist for the
 * builder to open at all, and the client has no list to check it against —
 * reporting those as healthy is a statement about what this function knows, not
 * an assumption that they are fine. Pass a null catalog before it loads and every
 * section reads healthy rather than briefly flashing warnings.
 */
export function sectionHealth(
  section: Section,
  catalog: readonly HealthCatalogEntry[] | null,
): SectionHealth {
  const live = isLiveBound(section.kind);
  if (!live || !catalog) return live ? { live, broken: [] } : HEALTHY;

  const byId = new Map(catalog.map((item) => [item.id, item]));
  const broken: BrokenBinding[] = [];

  for (const binding of collectSectionBindings(section)) {
    if (binding.type !== "menu_item") continue;

    const entry = byId.get(binding.id);
    if (!entry) broken.push({ id: binding.id, reason: "not_found" });
    else if (!entry.available) broken.push({ id: binding.id, reason: "unavailable" });
  }

  return { live, broken };
}

/** Health for every section on a page, keyed by section id. */
export function documentHealth(
  doc: PageDocument,
  catalog: readonly HealthCatalogEntry[] | null,
): Map<string, SectionHealth> {
  return new Map(doc.sections.map((s) => [s.id, sectionHealth(s, catalog)]));
}

/** Total broken references on the page. Drives the publish popover's warning. */
export function countBrokenBindings(
  doc: PageDocument,
  catalog: readonly HealthCatalogEntry[] | null,
): number {
  let total = 0;
  for (const section of doc.sections) total += sectionHealth(section, catalog).broken.length;
  return total;
}

/** Merchant-facing wording. Never shows an id — a uuid explains nothing. */
export function describeReason(reason: UnavailableReason): string {
  return reason === "not_found"
    ? "No longer on a menu here"
    : "Unavailable right now";
}
