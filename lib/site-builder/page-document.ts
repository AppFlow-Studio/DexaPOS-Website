/**
 * The `PageDocument` — what a merchant page *is*, as data.
 *
 * One atomic JSONB document per page, not one row per section. A page's draft
 * lives in `site_pages.draft_content`; publishing copies it verbatim into an
 * immutable `site_page_versions` row. That makes publish, rollback and diff row
 * operations, and makes a render one read. See PLAN-02 §2 for the trade-off.
 *
 * Site-wide concerns — navigation, brand colours, fonts, favicon — live on
 * `merchant_sites`, not here, so that changing a brand colour does not create a
 * new version of every page.
 */

import type { SectionKind } from "./sections/kinds";
import { SECTION_KINDS, ZONE_ORDER } from "./sections/kinds";
import { SECTION_REGISTRY, type SectionDefaultsContext } from "./sections/registry";
import type { Section, SectionOf } from "./sections/types";

/**
 * Bumped whenever a stored document's shape changes in a way older code would
 * not understand. Every bump needs a migration in `./migrations`.
 */
export const CURRENT_SCHEMA_VERSION = 2;

export interface PageSeo {
  title?: string;
  description?: string;
  ogImageAssetId?: string;
  noindex?: boolean;
}

export interface PageDocument {
  schemaVersion: number;
  /** Always zone-ordered: masthead → body → colophon. `normalizePage` enforces it. */
  sections: Section[];
  seo: PageSeo;
  settings: {
    /** Page-level override of the site theme. Empty in v1. */
    theme?: Record<string, string>;
  };
}

/**
 * Section ids must be stable for the life of the section and never reused —
 * analytics-per-section, comments and A/B variants all key off them.
 * `crypto.randomUUID` is available in Node 18+ and every target browser; the
 * fallback exists only so this module stays usable in exotic runtimes.
 */
export function newSectionId(): string {
  const raw =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `s_${raw.replace(/-/g, "").slice(0, 12)}`;
}

/** Builds a valid section of `kind` with registry defaults. */
export function createSection<K extends SectionKind>(
  kind: K,
  ctx?: SectionDefaultsContext,
): SectionOf<K> {
  return {
    id: newSectionId(),
    kind,
    props: SECTION_REGISTRY[kind].defaults(ctx),
  } as SectionOf<K>;
}

/** Sorts sections into zone order, preserving relative order within a zone. */
export function sortSectionsByZone(sections: Section[]): Section[] {
  return [...sections].sort((a, b) => {
    const az = ZONE_ORDER[SECTION_REGISTRY[a.kind].zone];
    const bz = ZONE_ORDER[SECTION_REGISTRY[b.kind].zone];
    return az - bz;
  });
}

/**
 * An empty but *valid* page: the three locked sections and nothing else.
 * Used when a merchant creates a page from scratch.
 */
export function createEmptyPage(ctx?: SectionDefaultsContext): PageDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sections: [
      createSection("header", ctx),
      createSection("hero", ctx),
      createSection("footer", ctx),
    ],
    seo: {},
    settings: {},
  };
}

/**
 * The v1 starter: a complete restaurant homepage.
 *
 * Deliberately a plain fixture rather than a database concept — applying a
 * starter is `setDoc(starter)`. Hydrating it with the merchant's real name,
 * hours and best-selling items is what turns "here is a template" into "here is
 * your website" (PLAN-06 §4), and is a caller's job, not this function's.
 */
export function createStarterPage(ctx?: SectionDefaultsContext): PageDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sections: [
      createSection("header", ctx),
      createSection("hero", ctx),
      createSection("popular-items", ctx),
      createSection("content", ctx),
      createSection("features", ctx),
      createSection("gallery", ctx),
      createSection("faq", ctx),
      createSection("location", ctx),
      createSection("footer", ctx),
    ],
    seo: {},
    settings: {},
  };
}

/** Every kind currently present on the page. */
export function kindsOnPage(doc: PageDocument): SectionKind[] {
  return SECTION_KINDS.filter((k) => doc.sections.some((s) => s.kind === k));
}

export function findSection(doc: PageDocument, sectionId: string): Section | undefined {
  return doc.sections.find((s) => s.id === sectionId);
}
