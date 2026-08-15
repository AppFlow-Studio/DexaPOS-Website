import type { PageDocument } from "@/lib/site-builder/page-document";

/** A text value that can be changed without replacing the server-rendered page. */
export interface TextPreviewPatch {
  sectionId: string;
  path: string;
  value: string;
}

/**
 * Works out whether a document can keep using its current server-rendered tree.
 *
 * The public renderer remains the only place that creates section markup. This
 * deliberately narrow fast path only updates non-empty text nodes which a
 * renderer explicitly marked as editable. Anything that can alter markup,
 * sanitisation, layout or live bindings returns `null` and must use the server
 * renderer instead.
 */
export function getTextPreviewPatches(
  previous: PageDocument,
  next: PageDocument,
): TextPreviewPatch[] | null {
  if (previous.schemaVersion !== next.schemaVersion) return null;
  if (!sameValue(previous.settings, next.settings)) return null;
  if (previous.sections.length !== next.sections.length) return null;

  const patches: TextPreviewPatch[] = [];

  for (let index = 0; index < previous.sections.length; index += 1) {
    const before = previous.sections[index];
    const after = next.sections[index];

    if (!before || !after || before.id !== after.id || before.kind !== after.kind) return null;
    if (before.hidden !== after.hidden || !sameValue(before.style, after.style)) return null;
    if (!collectTextChanges(before.props, after.props, "props", patches, before.id)) return null;
  }

  // SEO changes have no effect on the canvas, so an empty patch list is valid.
  return patches;
}

/**
 * Applies a set of already classified text patches to the current canvas.
 *
 * A marker may appear more than once (for example a heading can be rendered in
 * two responsive layouts), so all matching leaf nodes are updated. We refuse to
 * touch nodes that contain nested elements: replacing `textContent` there could
 * remove an icon or accessibility markup, and that is a job for the canonical
 * renderer.
 */
export function applyTextPreviewPatches(root: HTMLElement, patches: TextPreviewPatch[]): boolean {
  for (const patch of patches) {
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-sb-field]")).filter(
      (element) =>
        element.dataset.sbSectionId === patch.sectionId &&
        element.dataset.sbField === patch.path,
    );

    if (
      targets.length === 0 ||
      targets.some(
        (element) => element.dataset.sbFieldKind !== "text" || element.children.length > 0,
      )
    ) {
      return false;
    }

    for (const element of targets) element.textContent = patch.value;
  }

  return true;
}

function collectTextChanges(
  before: unknown,
  after: unknown,
  path: string,
  patches: TextPreviewPatch[],
  sectionId: string,
): boolean {
  if (Object.is(before, after)) return true;

  // Empty strings can cause a renderer to omit an element entirely, so leave
  // those transitions to the server rather than leaving a blank shell behind.
  if (typeof before === "string" && typeof after === "string") {
    if (!before || !after) return false;
    patches.push({ sectionId, path, value: after });
    return true;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) return false;
    return before.every((value, index) =>
      collectTextChanges(value, after[index], `${path}.${index}`, patches, sectionId),
    );
  }

  if (isRecord(before) && isRecord(after)) {
    const beforeKeys = Object.keys(before);
    const afterKeys = Object.keys(after);
    if (beforeKeys.length !== afterKeys.length || beforeKeys.some((key) => !(key in after))) {
      return false;
    }
    return beforeKeys.every((key) =>
      collectTextChanges(before[key], after[key], `${path}.${key}`, patches, sectionId),
    );
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => key in right && sameValue(left[key], right[key]))
    );
  }
  return false;
}
