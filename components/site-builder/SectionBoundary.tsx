import type { RenderMode } from "@/lib/site-builder/render-context";
import { SECTION_REGISTRY } from "@/lib/site-builder/sections/registry";
import type { Section } from "@/lib/site-builder/sections/types";
import { sectionAttrs } from "./edit-attrs";

/**
 * Wraps every rendered section.
 *
 * Two jobs:
 *
 *  1. **Containment.** One section throwing must not take down the page. React
 *     error boundaries are client-only, so a server render cannot catch a throw
 *     the way a client one can — the actual protection comes from the renderers
 *     never doing I/O and always receiving `Resolved<T>` rather than nullables.
 *     This wrapper adds the identity needed to *report* a bad section and keeps
 *     the seam in place for a client boundary in builder mode.
 *
 *  2. **The overlay protocol.** Stamps `data-sb-*` so the builder's client
 *     overlay can find, outline and manipulate sections without any section
 *     needing to be a client component (PLAN-03 §5).
 */
export default function SectionBoundary({
  section,
  mode,
  children,
}: {
  section: Section;
  mode: RenderMode;
  children: React.ReactNode;
}) {
  const def = SECTION_REGISTRY[section.kind];

  const attrs = sectionAttrs(mode, {
    id: section.id,
    kind: section.kind,
    zone: def.zone,
    locked: !def.deletable,
    hidden: section.hidden,
  });

  // Outside builder mode this is a transparent passthrough — no wrapper element,
  // no attributes, nothing that could alter the public page's layout or weight.
  if (mode !== "builder") return <>{children}</>;

  return (
    <div
      {...attrs}
      className={section.hidden ? "relative opacity-40" : "relative"}
      data-sb-boundary=""
    >
      {children}
    </div>
  );
}
