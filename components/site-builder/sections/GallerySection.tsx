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

  if (images.length === 0 && ctx.mode !== "builder") return null;

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

        {images.length === 0 ? (
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
            {images.map((image, index) => (
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
            {images.map((image, index) => (
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
