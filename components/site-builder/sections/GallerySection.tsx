import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import SiteImage from "../SiteImage";
import {
  Container,
  SectionHeading,
  sectionClassName,
  sectionStyleProps,
} from "../section-shell";

const COLUMN_CLASSES = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
} as const;

/**
 * Photo grid.
 *
 * Renders nothing when it has no photos — a heading floating above empty space
 * looks like a bug on a live site. In builder mode it shows a placeholder
 * instead, so the merchant can see what they are about to fill.
 */
export default function GallerySection({ section, ctx }: SectionRenderProps<"gallery">) {
  const { heading, subheading, images, layout, columns } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  /**
   * Resolve before deciding the markup, not after.
   *
   * `SiteImage` renders nothing for a photo that has been deleted from the
   * library, which is right — but the `<li>` around it is this section's to
   * omit, and it was being emitted regardless. A merchant who tidied their
   * photo library shipped a row of empty cells to their visitors. The rule
   * generalises: if a section wraps `SiteImage` in an element, that element is
   * the section's responsibility to leave out.
   *
   * Filtered in every mode, builder included, so the canvas shows what a
   * visitor will actually get. The dead references are surfaced where they can
   * be fixed — in the photo picker in the drawer — rather than as a hole here.
   */
  const visible = images.filter((image) => ctx.resolveAsset(image.assetId));

  if (visible.length === 0 && ctx.mode !== "builder") return null;

  const layoutClasses =
    layout === "carousel"
      ? "grid-flow-col auto-cols-[minmax(240px,1fr)] overflow-x-auto"
      : COLUMN_CLASSES[columns];

  // Masonry via CSS columns keeps varied aspect ratios without cropping.
  const isMasonry = layout === "masonry";

  return (
    <section
      className={sectionClassName(section.style)}
      style={sectionStyleProps(section.style)}
    >
      <Container>
        <SectionHeading
          heading={heading}
          subheading={subheading}
          align={section.style?.align}
          headingAttrs={f("props.heading")}
          subheadingAttrs={f("props.subheading")}
        />

        {visible.length === 0 ? (
          <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm opacity-70">
            Add photos to fill this gallery.
          </p>
        ) : isMasonry ? (
          <div
            className={`columns-2 gap-4 ${columns >= 3 ? "lg:columns-3" : ""} ${
              columns === 4 ? "xl:columns-4" : ""
            }`}
            {...f("props.images", "list")}
          >
            {visible.map((image, index) => (
              <SiteImage
                key={`${image.assetId}-${index}`}
                asset={image}
                ctx={ctx}
                className="mb-4 w-full rounded-[var(--site-radius)] object-cover"
              />
            ))}
          </div>
        ) : (
          <ul className={`grid gap-4 ${layoutClasses}`} {...f("props.images", "list")}>
            {visible.map((image, index) => (
              <li key={`${image.assetId}-${index}`}>
                <SiteImage
                  asset={image}
                  ctx={ctx}
                  className="aspect-square w-full rounded-[var(--site-radius)] object-cover"
                />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}
