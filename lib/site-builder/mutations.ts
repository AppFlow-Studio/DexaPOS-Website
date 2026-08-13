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
import { ZONE_ORDER } from "./sections/kinds";
import { SECTION_REGISTRY, type SectionDefaultsContext } from "./sections/registry";
import type { Section } from "./sections/types";

export type MutationResult =
  | { ok: true; doc: PageDocument }
  | { ok: false; reason: MutationRefusal; message: string };

export type MutationRefusal =
  | "unknown_section"
  | "not_addable"
  | "not_deletable"
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
 */
export function addSection(
  doc: PageDocument,
  kind: SectionKind,
  options: { atIndex?: number; ctx?: SectionDefaultsContext } = {},
): MutationResult {
  const def = SECTION_REGISTRY[kind];
  if (!def) return refuse("unknown_section", `Unknown section type "${kind}".`);
  if (!def.addable) {
    return refuse("not_addable", `${def.label} sections cannot be added manually.`);
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
  const movingZone = SECTION_REGISTRY[moving.kind].zone;

  const next = [...doc.sections];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moving);

  // Legal only if the section still sits inside its own zone's run.
  const before = next[toIndex - 1];
  const after = next[toIndex + 1];
  const rank = ZONE_ORDER[movingZone];
  if (before && ZONE_ORDER[SECTION_REGISTRY[before.kind].zone] > rank) {
    return refuse("cross_zone_move", `${SECTION_REGISTRY[moving.kind].label} cannot move there.`);
  }
  if (after && ZONE_ORDER[SECTION_REGISTRY[after.kind].zone] < rank) {
    return refuse("cross_zone_move", `${SECTION_REGISTRY[moving.kind].label} cannot move there.`);
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
