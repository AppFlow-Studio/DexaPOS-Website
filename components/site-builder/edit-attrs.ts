/**
 * The builder-overlay protocol.
 *
 * This is what lets the drag-and-drop canvas reuse the *server* render instead
 * of re-implementing every section as a client component. Renderers stay server
 * components and stamp `data-sb-*` attributes; a single client overlay reads
 * those attributes to draw selection rings, floating controls and drop targets.
 *
 * There is therefore exactly ONE implementation of every section's markup, and
 * the public page and the builder cannot drift — because they are the same
 * render. Copied from the pattern already working in
 * `components/cms/SectionRenderer.tsx` + `InlineCmsPreview.tsx`.
 *
 * The attributes are inert outside builder mode: `attrs()` returns an empty
 * object for `public` and `preview`, so nothing leaks onto the live site.
 */

import type { RenderMode } from "@/lib/site-builder/render-context";
import type { SectionKind, Zone } from "@/lib/site-builder/sections/kinds";

/**
 * Both carry an index signature so they spread cleanly onto JSX elements and
 * into helpers that take `Record<string, string | undefined>` — without it every
 * call site needs a cast, which is how stray `any`s creep into a renderer.
 */
export interface SectionEditAttrs {
  [key: string]: string | undefined;
  "data-sb-section-id"?: string;
  "data-sb-kind"?: SectionKind;
  "data-sb-zone"?: Zone;
  "data-sb-locked"?: "true";
  "data-sb-hidden"?: "true";
}

export interface FieldEditAttrs {
  [key: string]: string | undefined;
  "data-sb-section-id"?: string;
  "data-sb-field"?: string;
  "data-sb-field-kind"?: FieldKind;
}

/** How the overlay should edit a field when the merchant clicks it. */
export type FieldKind = "text" | "richtext" | "image" | "link" | "list";

/** Attributes for a section's outermost element. */
export function sectionAttrs(
  mode: RenderMode,
  input: {
    id: string;
    kind: SectionKind;
    zone: Zone;
    locked: boolean;
    hidden?: boolean;
  },
): SectionEditAttrs {
  if (mode !== "builder") return {};
  return {
    "data-sb-section-id": input.id,
    "data-sb-kind": input.kind,
    "data-sb-zone": input.zone,
    ...(input.locked ? { "data-sb-locked": "true" as const } : {}),
    ...(input.hidden ? { "data-sb-hidden": "true" as const } : {}),
  };
}

/**
 * Attributes for an individually editable field.
 *
 * `path` is dot-notation into the section's props (`props.heading`,
 * `props.items.0.question`), which is what the settings panel and the
 * fast-path text patcher both key off.
 */
export function fieldAttrs(
  mode: RenderMode,
  sectionId: string,
  path: string,
  kind: FieldKind = "text",
): FieldEditAttrs {
  if (mode !== "builder") return {};
  return {
    "data-sb-section-id": sectionId,
    "data-sb-field": path,
    "data-sb-field-kind": kind,
  };
}

/**
 * Curried helper so a renderer can write `f("props.heading")` instead of
 * repeating mode and section id at every call site.
 */
export function fieldAttrsFor(mode: RenderMode, sectionId: string) {
  return (path: string, kind: FieldKind = "text") => fieldAttrs(mode, sectionId, path, kind);
}
