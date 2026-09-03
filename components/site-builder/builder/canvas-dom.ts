import type { PageDocument } from "@/lib/site-builder/page-document";
import { SECTION_REGISTRY } from "@/lib/site-builder/sections/registry";

/**
 * Only SectionBoundary owns this marker. Editable fields deliberately share a
 * section id, so selecting by id alone measures the last headline/button in a
 * section instead of the section itself and puts insertion controls mid-copy.
 */
export const SECTION_BOUNDARY_SELECTOR = "[data-sb-boundary][data-sb-section-id]";

export interface AddSectionPoint {
  key: string;
  atIndex: number;
  y: number;
}

/** Measures one rectangle per actual section root, relative to the canvas. */
export function measureSectionRects(host: HTMLElement): Record<string, DOMRect> {
  const hostBox = host.getBoundingClientRect();
  const rects: Record<string, DOMRect> = {};

  host.querySelectorAll<HTMLElement>(SECTION_BOUNDARY_SELECTOR).forEach((element) => {
    const id = element.dataset.sbSectionId;
    if (!id) return;
    const box = element.getBoundingClientRect();
    rects[id] = new DOMRect(
      box.left - hostBox.left,
      box.top - hostBox.top,
      box.width,
      box.height,
    );
  });

  return rects;
}

/**
 * Finds every body insertion boundary, including the first one on a page whose
 * body is empty. Without the fallback, Blank pages have no body rectangle to
 * anchor a control to and therefore show no way to add their first section.
 */
export function getAddSectionPoints(
  doc: PageDocument,
  rects: Record<string, DOMRect>,
): AddSectionPoint[] {
  const points: AddSectionPoint[] = [];

  doc.sections.forEach((section, index) => {
    if (SECTION_REGISTRY[section.kind].zone !== "body") return;
    const rect = rects[section.id];
    if (!rect) return;

    points.push({ key: `before-${section.id}`, atIndex: index, y: rect.y });

    const next = doc.sections[index + 1];
    if (!next || SECTION_REGISTRY[next.kind].zone !== "body") {
      points.push({
        key: `after-${section.id}`,
        atIndex: index + 1,
        y: rect.y + rect.height,
      });
    }
  });

  if (points.length > 0) return points;

  // The first body section belongs immediately before the footer. Anchoring to
  // its top edge also works for older broken Blank pages missing their hero.
  const footerIndex = doc.sections.findIndex(
    (section) => SECTION_REGISTRY[section.kind].zone === "colophon",
  );
  const footer = footerIndex >= 0 ? doc.sections[footerIndex] : undefined;
  const footerRect = footer ? rects[footer.id] : undefined;
  if (footer && footerRect) {
    return [{ key: "empty-body", atIndex: footerIndex, y: footerRect.y }];
  }

  return points;
}
