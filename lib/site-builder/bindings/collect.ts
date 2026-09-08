/**
 * Walks a page document and gathers every binding on it.
 *
 * Generic by design: it reads `bindingTypes` off the registry and then searches
 * props structurally, so it never switches on section kind. Adding section kind
 * #10 requires no change here.
 */

import { SECTION_REGISTRY } from "../sections/registry";
import type { PageDocument } from "../page-document";
import type { Section } from "../sections/types";
import type { BindingRequest } from "./resolved";
import { isBindingType } from "./types";

/**
 * Collects the deduplicated set of bindings a page needs.
 *
 * Hidden sections are skipped: they are stored but never rendered, so resolving
 * their bindings would be wasted queries. The builder passes
 * `includeHidden: true` so a hidden section still shows real content when the
 * merchant unhides it.
 */
export function collectBindings(
  doc: PageDocument,
  options: { includeHidden?: boolean } = {},
): BindingRequest[] {
  const seen = new Set<string>();
  const out: BindingRequest[] = [];

  for (const section of doc.sections) {
    if (section.hidden && !options.includeHidden) continue;

    const def = SECTION_REGISTRY[section.kind];
    if (!def || def.bindingTypes.length === 0) continue;

    for (const binding of extractBindings(section.props)) {
      // Trust the registry over the document: a binding whose type the section
      // does not declare is stale data from an older schema, not a request.
      if (!def.bindingTypes.includes(binding.type)) continue;

      const key = `${binding.type}:${binding.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(binding);
    }
  }

  return out;
}

/**
 * Finds `{ type, id }` shapes at any depth in a props object.
 *
 * Structural rather than path-based so that nesting a binding inside a repeater
 * or a new sub-object needs no collector change.
 */
export function extractBindings(props: unknown): BindingRequest[] {
  const out: BindingRequest[] = [];

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object" || value === null) return;

    const record = value as Record<string, unknown>;
    if (
      typeof record.type === "string" &&
      typeof record.id === "string" &&
      isBindingType(record.type)
    ) {
      // An empty id means "not linked yet" — the publish validator reports it;
      // there is nothing to fetch.
      if (record.id.length > 0) out.push({ type: record.type, id: record.id });
      return;
    }

    Object.values(record).forEach(visit);
  };

  visit(props);
  return out;
}

/** Bindings a single section needs. Used by the builder's per-section warnings. */
export function collectSectionBindings(section: Section): BindingRequest[] {
  const def = SECTION_REGISTRY[section.kind];
  if (!def || def.bindingTypes.length === 0) return [];
  return extractBindings(section.props).filter((b) => def.bindingTypes.includes(b.type));
}

/** Groups requests by type so the resolver can issue one query per type. */
export function groupByType(
  requests: BindingRequest[],
): Map<BindingRequest["type"], string[]> {
  const grouped = new Map<BindingRequest["type"], string[]>();
  for (const { type, id } of requests) {
    const ids = grouped.get(type);
    if (ids) ids.push(id);
    else grouped.set(type, [id]);
  }
  return grouped;
}

/**
 * Every asset id a document references, deduplicated.
 *
 * Structural for the same reason `extractBindings` is: the content reshape
 * added two asset slots to one section and this needed no change, and the
 * gallery's array of them works without a special case. An `AssetRef` is
 * recognised by carrying an `assetId` string, which is the shape
 * `assetRefSchema` guarantees.
 *
 * Hidden sections are included deliberately, unlike bindings. Resolving an
 * asset is one row of an `= ANY(...)` that has already been issued, whereas a
 * binding is a menu query — and a merchant unhiding a section should not watch
 * its photograph pop in a moment later.
 */
export function collectAssetIds(doc: PageDocument): string[] {
  const seen = new Set<string>();

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    if (typeof record.assetId === "string" && record.assetId) seen.add(record.assetId);

    Object.values(record).forEach(visit);
  };

  for (const section of doc.sections) visit(section.props);

  return [...seen];
}
