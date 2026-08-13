import { sanitizeHtml } from "@/lib/cms/sanitize";
import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import SiteImage from "../SiteImage";
import {
  Container,
  CtaButton,
  sectionClassName,
  sectionStyleProps,
} from "../section-shell";

/**
 * Free-form merchant copy — the "Our Story" block this whole feature exists for.
 *
 * `body` is the only merchant-authored markup on a built page, so it is
 * sanitized **on render** as well as on write. Sanitizing twice is deliberate:
 * content can reach the database through a migration, a support fix, or a future
 * import path that skips the write-side check, and this is the last gate before
 * it reaches a public browser. The allowlist is shared with the marketing CMS
 * rather than forked, so there is one set of rules to audit.
 */
export default function ContentSection({ section, ctx }: SectionRenderProps<"content">) {
  const { heading, body, image, imagePosition, cta } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  const prose = (
    <div className="max-w-2xl">
      {heading && (
        <h2
          className="text-2xl font-semibold tracking-tight md:text-3xl"
          {...f("props.heading")}
        >
          {heading}
        </h2>
      )}
      <div
        className="site-prose mt-4 text-base leading-relaxed opacity-80"
        {...f("props.body", "richtext")}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }}
      />
      {cta && (
        <div className="mt-8">
          <CtaButton
            label={cta.label}
            target={cta.target}
            ctx={ctx}
            attrs={f("props.cta.label")}
          />
        </div>
      )}
    </div>
  );

  const picture = image ? (
    <SiteImage
      asset={image}
      ctx={ctx}
      className="aspect-[4/3] w-full rounded-[var(--site-radius)] object-cover"
    />
  ) : null;

  const sideBySide = picture && (imagePosition === "left" || imagePosition === "right");

  return (
    <section
      className={sectionClassName(section.style)}
      style={sectionStyleProps(section.style)}
      id={heading ? slugId(heading) : undefined}
    >
      <Container>
        {imagePosition === "above" && picture && <div className="mb-10">{picture}</div>}

        {sideBySide ? (
          <div className="grid items-center gap-10 md:grid-cols-2">
            {imagePosition === "left" ? (
              <>
                {picture}
                {prose}
              </>
            ) : (
              <>
                {prose}
                {picture}
              </>
            )}
          </div>
        ) : (
          prose
        )}
      </Container>
    </section>
  );
}

/** Stable anchor so a nav link or a "contact" CTA can target this section. */
function slugId(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
