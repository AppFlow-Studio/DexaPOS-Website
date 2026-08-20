/**
 * Only SectionBoundary owns this marker. Editable fields deliberately share a
 * section id, so selecting by id alone measures the last headline/button in a
 * section instead of the section itself and puts insertion controls mid-copy.
 */
export const SECTION_BOUNDARY_SELECTOR = "[data-sb-boundary][data-sb-section-id]";

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
