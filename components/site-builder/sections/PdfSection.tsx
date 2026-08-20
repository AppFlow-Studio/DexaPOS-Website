import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import { Container, SectionHeading, sectionClassName, sectionStyleProps } from "../section-shell";

/**
 * A document a guest can open — the printed menu, a catering pack, a wine list.
 *
 * Opens in a new tab rather than downloading. A phone that downloads a PDF has
 * put it in a folder the guest will not go looking for; a phone that opens it
 * shows them the menu. `rel="noopener noreferrer"` because the target is a CDN
 * URL and the tab it opens has no business reaching back into this one.
 */
export default function PdfSection({ section, ctx }: SectionRenderProps<"pdf">) {
  const { title, subtitle, file, linkLabel } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);
  const url = file ? ctx.resolveAsset(file.assetId)?.url : null;

  return (
    <section className={sectionClassName(section.style)} style={sectionStyleProps(section.style)}>
      <Container>
        <SectionHeading
          heading={title}
          subheading={subtitle}
          align={section.style?.align}
          headingAttrs={f("props.title")}
          subheadingAttrs={f("props.subtitle")}
        />

        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-[var(--site-radius)] px-5 py-3 text-sm font-semibold"
            style={{ background: "var(--site-brand)", color: "var(--site-brand-contrast)" }}
            {...f("props.linkLabel")}
          >
            {linkLabel}
          </a>
        ) : (
          ctx.mode === "builder" && (
            <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm opacity-60">
              Upload a document to link to it here.
            </p>
          )
        )}
      </Container>
    </section>
  );
}
