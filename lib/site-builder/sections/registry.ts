/**
 * The section registry — the single source of truth every other part of the
 * feature is derived from.
 *
 * One entry per kind drives: the Add Section modal, editor form generation,
 * save-time validation, read-time repair, renderer dispatch, binding
 * collection, and reorder legality. Adding section kind #10 means adding one
 * schema file and one entry here — no switch statement to hunt down, no
 * validator to extend, no modal to update.
 *
 * Deliberately React-free and I/O-free so it can be imported by pure logic,
 * by tests, and (later) by an AI generator or an import tool. Renderers are
 * bound to kinds separately in `components/site-builder/registry.tsx` at
 * Stage 4; `icon` is a lucide *name*, not a component, for the same reason.
 */

import type { z } from "zod";

import type { BindingType } from "../bindings/types";
import type { SectionCategory, SectionKind, Zone } from "./kinds";
import { SECTION_CATEGORIES, SECTION_KINDS } from "./kinds";
import type { PropsOf } from "./schemas";
import {
  contentDefaults,
  contentSchema,
  faqDefaults,
  faqSchema,
  featuresDefaults,
  featuresSchema,
  footerDefaults,
  footerSchema,
  galleryDefaults,
  gallerySchema,
  headerDefaults,
  headerSchema,
  heroDefaults,
  heroSchema,
  locationDefaults,
  locationSchema,
  popularItemsDefaults,
  popularItemsSchema,
} from "./schemas";

/** Context a defaults factory may need. Some kinds bind to the site's location. */
export interface SectionDefaultsContext {
  locationId?: string;
}

export interface SectionDefinition<K extends SectionKind> {
  kind: K;
  /** Shown in the Add Section modal and the layers panel. */
  label: string;
  description: string;
  /** lucide-react icon name, resolved by the UI against an allowlist. */
  icon: string;
  zone: Zone;
  /** Grouping in the Add Section modal. Presentational only. */
  category: SectionCategory;
  /**
   * Which prop carries the merchant's own title for this section.
   *
   * The layers panel labels rows with it, falling back to `label` when it is
   * absent or empty — "Guest Favorites" reads better than a list of nine
   * identical nouns. Declared here rather than guessed by the UI so that adding
   * a kind whose title lives under a different key stays a one-line change.
   */
  titleField?: string;
  /** At most one per page. */
  singleton: boolean;
  /** Merchant may add it from the Add Section modal. */
  addable: boolean;
  /**
   * Why this kind cannot do its job yet, or `undefined` when it is ready.
   *
   * Distinct from `addable: false`, which means "this kind is placed by the
   * system and merchants never insert it". This means "this kind is genuinely
   * for merchants, and adding one today would produce a section that cannot do
   * what its own description promises". The gallery is the case that prompted
   * it: it is offered as "a grid or carousel of photos" while `resolveAssetUrl`
   * returns `null` for every id, so a merchant could add one, find no way to put
   * a photo in it, and reasonably conclude the product is broken.
   *
   * Lives on the registry rather than in the modal so the reason travels with
   * the kind — the same invariant that keeps the add gallery derived rather
   * than listed. Delete the field from an entry to turn the kind on.
   */
  unavailable?: string;
  /** Merchant may delete it. */
  deletable: boolean;
  /** Runtime validation. `.shape` is used by `normalize` for field-level repair. */
  schema: z.ZodObject<any>;
  defaults: (ctx?: SectionDefaultsContext) => PropsOf<K>;
  /** Which platform records this kind references. Drives PLAN-03's collector. */
  bindingTypes: readonly BindingType[];
  /**
   * Fields resolved live at render rather than stored (decision D6). Purely
   * descriptive — it drives merchant-facing copy such as "prices update
   * automatically" and the rollback warning. Enforcement is structural: these
   * fields have nowhere to live in the schema.
   */
  liveFields: readonly string[];
}

export const SECTION_REGISTRY: { [K in SectionKind]: SectionDefinition<K> } = {
  header: {
    kind: "header",
    label: "Header",
    description: "Logo, navigation and order button.",
    icon: "PanelTop",
    zone: "masthead",
    category: "frame",
    singleton: true,
    addable: false,
    deletable: false,
    schema: headerSchema,
    defaults: () => headerDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  hero: {
    kind: "hero",
    label: "Hero",
    description: "Large opening banner with a headline and a call to action.",
    icon: "Image",
    zone: "masthead",
    category: "frame",
    titleField: "heading",
    singleton: true,
    addable: false,
    deletable: false,
    schema: heroSchema,
    defaults: () => heroDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  content: {
    kind: "content",
    label: "Content",
    description: "Rich text with an optional image — your story, an announcement.",
    icon: "Text",
    zone: "body",
    category: "story",
    titleField: "heading",
    singleton: false,
    addable: true,
    deletable: true,
    schema: contentSchema,
    defaults: () => contentDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  gallery: {
    kind: "gallery",
    label: "Gallery",
    description: "A grid or carousel of photos.",
    icon: "Images",
    zone: "body",
    category: "media",
    titleField: "heading",
    singleton: false,
    addable: true,
    deletable: true,
    // Stage 7 (`site_assets`) owns the fix. Existing gallery sections keep
    // rendering and publishing; this only stops new empty ones being added.
    unavailable: "Photos need the asset library, which is not built yet.",
    schema: gallerySchema,
    defaults: () => galleryDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  "popular-items": {
    kind: "popular-items",
    label: "Popular Items",
    description: "Showcase menu items. Prices and availability stay up to date automatically.",
    icon: "UtensilsCrossed",
    zone: "body",
    category: "menu",
    titleField: "heading",
    singleton: false,
    addable: true,
    deletable: true,
    schema: popularItemsSchema,
    defaults: () => popularItemsDefaults(),
    bindingTypes: ["menu_item"],
    liveFields: ["name", "description", "price", "image", "availability", "snooze"],
  },

  features: {
    kind: "features",
    label: "Highlights",
    description: "Short selling points with icons.",
    icon: "Sparkles",
    zone: "body",
    category: "story",
    titleField: "heading",
    singleton: false,
    addable: true,
    deletable: true,
    schema: featuresSchema,
    defaults: () => featuresDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  faq: {
    kind: "faq",
    label: "FAQ",
    description: "Questions and answers in an accordion.",
    icon: "MessageCircleQuestion",
    zone: "body",
    category: "story",
    titleField: "heading",
    singleton: false,
    addable: true,
    deletable: true,
    schema: faqSchema,
    defaults: () => faqDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  location: {
    kind: "location",
    label: "Location & Hours",
    description: "Address, hours and map. Always shows your current details.",
    icon: "MapPin",
    zone: "body",
    category: "visit",
    titleField: "heading",
    singleton: false,
    addable: true,
    deletable: true,
    schema: locationSchema,
    defaults: (ctx) => locationDefaults(ctx?.locationId),
    bindingTypes: ["location", "hours"],
    liveFields: ["address", "phone", "coordinates", "hours"],
  },

  footer: {
    kind: "footer",
    label: "Footer",
    description: "Address, hours, links and social accounts.",
    icon: "PanelBottom",
    zone: "colophon",
    category: "frame",
    singleton: true,
    addable: false,
    deletable: false,
    schema: footerSchema,
    defaults: (ctx) => footerDefaults(ctx?.locationId),
    bindingTypes: ["location", "hours"],
    liveFields: ["address", "phone", "hours"],
  },
};

/** Returns the definition, or `undefined` for a kind this build does not know. */
export function getSectionDefinition(
  kind: string,
): SectionDefinition<SectionKind> | undefined {
  return (SECTION_REGISTRY as Record<string, SectionDefinition<SectionKind>>)[kind];
}

/** Kinds a merchant may insert, in Add Section modal order. */
export function addableKinds(): SectionKind[] {
  return SECTION_KINDS.filter((k) => SECTION_REGISTRY[k].addable);
}

export function zoneOf(kind: SectionKind): Zone {
  return SECTION_REGISTRY[kind].zone;
}

/**
 * Addable kinds grouped for the Add Section modal, empty groups dropped.
 *
 * Derived rather than listed, so kind #10 appears in the modal — in the right
 * group, with its icon and description — the moment its registry entry exists.
 */
export function addableKindsByCategory(): {
  id: SectionCategory;
  label: string;
  kinds: SectionKind[];
}[] {
  return SECTION_CATEGORIES.map(({ id, label }) => ({
    id,
    label,
    kinds: addableKinds().filter((kind) => SECTION_REGISTRY[kind].category === id),
  })).filter((group) => group.kinds.length > 0);
}

/**
 * What to call a section in the layers panel: the merchant's own heading if they
 * have written one, otherwise the kind's label.
 *
 * Structurally typed rather than taking a `Section` so this module stays
 * importable by anything without pulling the union in behind it.
 */
export function sectionTitle(section: { kind: SectionKind; props: unknown }): string {
  const def = getSectionDefinition(section.kind);
  if (!def) return "Unknown section";

  if (def.titleField && section.props && typeof section.props === "object") {
    const raw = (section.props as Record<string, unknown>)[def.titleField];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }

  return def.label;
}

/** Whether this kind pulls anything live from the POS — drives the ⚡ marker. */
export function isLiveBound(kind: SectionKind): boolean {
  const def = getSectionDefinition(kind);
  return !!def && def.bindingTypes.length > 0;
}
