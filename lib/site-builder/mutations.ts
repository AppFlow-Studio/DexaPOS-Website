/**
 * Pure document mutations — `(doc, args) => doc`.
 *
 * Deliberately React-free, side-effect free, and network-free. These are the
 * API that the builder canvas, a future conversational editor ("move reviews
 * above the menu"), an import tool, and an AI generator all drive. Keeping them
 * pure is what makes undo/redo a two-line operation and what lets zone and
 * singleton rules be enforced *before* the server ever sees an illegal
 * document.
 *
 * Every function returns a new document; none mutate their input.
 */

import {
  createSection,
  findSection,
  sortSectionsByZone,
  type PageDocument,
} from "./page-document";
import type { SectionKind } from "./sections/kinds";
import { SECTION_KINDS, ZONE_ORDER } from "./sections/kinds";
import { isKindAvailable, SECTION_REGISTRY, type SectionDefaultsContext } from "./sections/registry";
import { FEATURE_LABELS, type SiteFeatures } from "./site-settings";
import type { Section } from "./sections/types";

export type MutationResult =
  | { ok: true; doc: PageDocument }
  | { ok: false; reason: MutationRefusal; message: string };

export type MutationRefusal =
  | "unknown_section"
  | "not_addable"
  | "not_deletable"
  | "not_movable"
  | "not_editable"
  | "feature_off"
  | "singleton_exists"
  | "cross_zone_move"
  | "out_of_range"
  | "invalid_props";

const refuse = (reason: MutationRefusal, message: string): MutationResult => ({
  ok: false,
  reason,
  message,
});

function withSections(doc: PageDocument, sections: Section[]): PageDocument {
  return { ...doc, sections };
}

/**
 * Inserts a new section of `kind`.
 *
 * `atIndex` is an index into the whole section list; the result is re-sorted by
 * zone, so a body section dropped "above the header" lands at the top of the
 * body rather than being rejected outright. That is friendlier than refusing,
 * and it is impossible to end up with an illegal order.
 *
 * `features` is optional, and its absence means "do not check". Every caller
 * that has the merchant's toggles to hand should pass them — the editor and the
 * server both do — but this module is also driven by fixtures, templates and
 * tests that legitimately have no merchant behind them, and making them invent
 * one would be worse than the narrow rule that an omitted argument checks
 * nothing.
 */
export function addSection(
  doc: PageDocument,
  kind: SectionKind,
  options: { atIndex?: number; ctx?: SectionDefaultsContext; features?: SiteFeatures } = {},
): MutationResult {
  const def = SECTION_REGISTRY[kind];
  if (!def) return refuse("unknown_section", `Unknown section type "${kind}".`);
  if (!def.addable) {
    return refuse("not_addable", `${def.label} sections cannot be added manually.`);
  }
  // The same invariant the Add Section catalogue enforces by omission. The
  // catalogue is the affordance; this is the rule, so a stale open tab or a
  // direct call cannot add a section the merchant's settings do not allow.
  if (options.features && !isKindAvailable(kind, options.features)) {
    const required = def.requiresFeature!;
    return refuse(
      "feature_off",
      `Turn on ${FEATURE_LABELS[required]} in your website settings to add a ${def.label} section.`,
    );
  }
  if (def.singleton && doc.sections.some((s) => s.kind === kind)) {
    return refuse("singleton_exists", `This page already has a ${def.label} section.`);
  }

  const section = createSection(kind, options.ctx);
  const next = [...doc.sections];
  const index =
    options.atIndex === undefined
      ? next.length
      : Math.max(0, Math.min(options.atIndex, next.length));
  next.splice(index, 0, section);

  return { ok: true, doc: withSections(doc, sortSectionsByZone(next)) };
}

/**
 * Puts back a structurally required section that is missing.
 *
 * The header, hero and footer are `addable: false` — the merchant never chooses
 * to add one, because every page is created with them. But a document written by
 * an older build, an import, or a direct database edit can arrive without one,
 * and then `validatePage` reports a blocking error that the editor offers no way
 * to resolve: the Add Section gallery deliberately does not list these kinds, and
 * `addSection` refuses them. That is an unpublishable page with no path forward.
 *
 * This is the path forward, and it is narrow on purpose. It only ever restores a
 * kind that *cannot be deleted* (so it is required by definition) and is *not
 * currently present*, which makes it useless for anything except repair.
 */
export function restoreRequiredSection(
  doc: PageDocument,
  kind: SectionKind,
  options: { ctx?: SectionDefaultsContext } = {},
): MutationResult {
  const def = SECTION_REGISTRY[kind];
  if (!def) return refuse("unknown_section", `Unknown section type "${kind}".`);
  if (def.deletable) {
    return refuse("not_addable", `${def.label} sections are not required, so they cannot be restored.`);
  }
  if (doc.sections.some((s) => s.kind === kind)) {
    return refuse("singleton_exists", `This page already has a ${def.label} section.`);
  }

  // Zone sorting is not enough on its own: header and hero share the masthead,
  // so appending and re-sorting puts a restored header *below* the hero. Within
  // the zone, fall back to the canonical kind order — which is the only ordering
  // rule that exists for the sections the merchant cannot rearrange anyway.
  const order = SECTION_KINDS.indexOf(kind);
  const insertAt = doc.sections.findIndex((s) => {
    const other = SECTION_REGISTRY[s.kind];
    if (other.zone !== def.zone) return false;
    return SECTION_KINDS.indexOf(s.kind) > order;
  });

  const next = [...doc.sections];
  next.splice(insertAt === -1 ? next.length : insertAt, 0, createSection(kind, options.ctx));

  return { ok: true, doc: withSections(doc, sortSectionsByZone(next)) };
}

export function removeSection(doc: PageDocument, sectionId: string): MutationResult {
  const section = findSection(doc, sectionId);
  if (!section) return refuse("unknown_section", "That section is no longer on the page.");

  const def = SECTION_REGISTRY[section.kind];
  if (!def.deletable) {
    return refuse("not_deletable", `${def.label} sections cannot be deleted.`);
  }

  return {
    ok: true,
    doc: withSections(
      doc,
      doc.sections.filter((s) => s.id !== sectionId),
    ),
  };
}

export function duplicateSection(doc: PageDocument, sectionId: string): MutationResult {
  const section = findSection(doc, sectionId);
  if (!section) return refuse("unknown_section", "That section is no longer on the page.");

  const def = SECTION_REGISTRY[section.kind];
  if (def.singleton) {
    return refuse("singleton_exists", `A page can only have one ${def.label} section.`);
  }

  // Deep clone so the copy shares no nested arrays or objects with the original.
  const copy = {
    ...(structuredCloneDoc(section) as Section),
    id: createSection(section.kind).id,
  };

  const index = doc.sections.findIndex((s) => s.id === sectionId);
  const next = [...doc.sections];
  next.splice(index + 1, 0, copy);

  return { ok: true, doc: withSections(doc, sortSectionsByZone(next)) };
}

/**
 * Moves a section to `toIndex`.
 *
 * Refuses moves that would cross a zone boundary — this is where the locked
 * header/hero/footer rule is actually enforced, from registry data rather than
 * from canvas logic, so every writer of a document obeys it.
 */
export function moveSection(
  doc: PageDocument,
  sectionId: string,
  toIndex: number,
): MutationResult {
  const fromIndex = doc.sections.findIndex((s) => s.id === sectionId);
  if (fromIndex === -1) {
    return refuse("unknown_section", "That section is no longer on the page.");
  }
  if (toIndex < 0 || toIndex >= doc.sections.length) {
    return refuse("out_of_range", "That position is outside the page.");
  }
  if (toIndex === fromIndex) return { ok: true, doc };

  const moving = doc.sections[fromIndex];
  const movingDef = SECTION_REGISTRY[moving.kind];

  /**
   * Structural sections do not move.
   *
   * The zone rules below only ever refused a move *between* zones, which left
   * the masthead — header and hero together — internally reorderable. A
   * merchant could therefore swap the two and publish a page whose navigation
   * sat underneath its own hero image. Nothing in the canvas offered that
   * deliberately; it was simply the one arrangement the rules did not cover.
   *
   * Checked here rather than only in the gutters so that every writer of a
   * document is bound by it — the canvas, a future conversational editor, an
   * import tool.
   */
  if (!movingDef.movable) {
    return refuse("not_movable", `${movingDef.label} sections stay where they are.`);
  }

  const movingZone = movingDef.zone;

  const next = [...doc.sections];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moving);

  // Legal only if the section still sits inside its own zone's run.
  const before = next[toIndex - 1];
  const after = next[toIndex + 1];
  const rank = ZONE_ORDER[movingZone];
  if (before && ZONE_ORDER[SECTION_REGISTRY[before.kind].zone] > rank) {
    return refuse("cross_zone_move", `${movingDef.label} cannot move there.`);
  }
  if (after && ZONE_ORDER[SECTION_REGISTRY[after.kind].zone] < rank) {
    return refuse("cross_zone_move", `${movingDef.label} cannot move there.`);
  }

  return { ok: true, doc: withSections(doc, next) };
}

export function moveSectionBy(
  doc: PageDocument,
  sectionId: string,
  delta: number,
): MutationResult {
  const index = doc.sections.findIndex((s) => s.id === sectionId);
  if (index === -1) return refuse("unknown_section", "That section is no longer on the page.");
  return moveSection(doc, sectionId, index + delta);
}

/**
 * Applies a partial props patch, validated against the section's schema.
 *
 * Rejects rather than repairs: an edit arriving from the editor with invalid
 * values is a bug worth surfacing, unlike a stored document from an older
 * build, which `normalize` repairs silently.
 */
export function updateSectionProps(
  doc: PageDocument,
  sectionId: string,
  patch: Record<string, unknown>,
): MutationResult {
  const section = findSection(doc, sectionId);
  if (!section) return refuse("unknown_section", "That section is no longer on the page.");

  const def = SECTION_REGISTRY[section.kind];

  // A kind with no editor has nothing a merchant could legitimately be sending.
  // The drawer never opens for one, so an edit arriving here is a bug or a
  // forged request rather than a merchant typing.
  if (!def.editable) {
    return refuse("not_editable", `${def.label} sections are not edited here.`);
  }

  const candidate = { ...(section.props as Record<string, unknown>), ...patch };
  const parsed = def.schema.safeParse(candidate);
  if (!parsed.success) {
    return refuse(
      "invalid_props",
      `${def.label}: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
        .join("; ")}`,
    );
  }

  return {
    ok: true,
    doc: withSections(
      doc,
      doc.sections.map((s) =>
        s.id === sectionId ? ({ ...s, props: parsed.data } as Section) : s,
      ),
    ),
  };
}

export function setSectionHidden(
  doc: PageDocument,
  sectionId: string,
  hidden: boolean,
): MutationResult {
  if (!findSection(doc, sectionId)) {
    return refuse("unknown_section", "That section is no longer on the page.");
  }
  return {
    ok: true,
    doc: withSections(
      doc,
      doc.sections.map((s) => (s.id === sectionId ? { ...s, hidden } : s)),
    ),
  };
}

export function updateSeo(doc: PageDocument, patch: Partial<PageDocument["seo"]>): PageDocument {
  return { ...doc, seo: { ...doc.seo, ...patch } };
}

function structuredCloneDoc<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}
