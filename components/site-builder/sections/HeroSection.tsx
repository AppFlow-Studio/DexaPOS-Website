import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import SiteImage from "../SiteImage";
import { Container, CtaButton, sectionStyleProps } from "../section-shell";

/**
 * The opening banner, in three variants:
 *
 *   classic   — full-bleed image with overlaid, centred copy
 *   bistro    — copy beside the image, split layout
 *   spotlight — tall, dark, editorial
 *
 * The hero image is the page's Largest Contentful Paint, so it is the one image
 * that renders eagerly with high fetch priority.
 */
export default function HeroSection({ section, ctx }: SectionRenderProps<"hero">) {
  const { variant, heading, subheading, image, overlayOpacity, primaryCta, secondaryCta } =
    section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  // Falls back to the storefront's existing hero so a freshly created site is
  // never blank, even before the asset pipeline exists.
  const imageProps = {
    asset: image ?? null,
    ctx,
    fallbackUrl: ctx.site.heroImageUrl,
    priority: true,
  } as const;

  const ctas = (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      {primaryCta && (
        <CtaButton
          label={primaryCta.label}
          target={primaryCta.target}
          ctx={ctx}
          attrs={f("props.primaryCta.label")}
        />
      )}
      {secondaryCta && (
        <CtaButton
          label={secondaryCta.label}
          target={secondaryCta.target}
          ctx={ctx}
          variant="secondary"
          attrs={f("props.secondaryCta.label")}
        />
      )}
    </div>
  );

  if (variant === "bistro") {
    return (
      <section className="w-full" style={sectionStyleProps(section.style)}>
        <Container className="grid items-center gap-10 py-16 md:grid-cols-2 md:py-24">
          <div>
            <h1
              className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl"
              {...f("props.heading")}
            >
              {heading}
            </h1>
            {subheading && (
              <p className="mt-5 text-lg leading-relaxed opacity-75" {...f("props.subheading")}>
                {subheading}
              </p>
            )}
            {ctas}
          </div>
          <SiteImage
            {...imageProps}
            className="aspect-[4/3] w-full rounded-[var(--site-radius)] object-cover"
          />
        </Container>
      </section>
    );
  }

  const isSpotlight = variant === "spotlight";

  return (
    <section
      className={`relative w-full overflow-hidden ${isSpotlight ? "min-h-[70vh]" : "min-h-[52vh]"}`}
      style={{ background: "var(--site-surface-dark)", color: "var(--site-text-on-dark)" }}
    >
      <SiteImage {...imageProps} className="absolute inset-0 h-full w-full object-cover" />
      <div
        className="absolute inset-0"
        style={{ background: "#000", opacity: (overlayOpacity ?? 35) / 100 }}
        aria-hidden="true"
      />
      <Container
        className={`relative flex min-h-[inherit] flex-col justify-center py-24 ${
          isSpotlight ? "items-start text-left" : "items-center text-center"
        }`}
      >
        <h1
          className={`font-semibold leading-tight tracking-tight ${
            isSpotlight ? "max-w-3xl text-5xl md:text-6xl" : "max-w-3xl text-4xl md:text-5xl"
          }`}
          {...f("props.heading")}
        >
          {heading}
        </h1>
        {subheading && (
          <p className="mt-5 max-w-xl text-lg leading-relaxed opacity-85" {...f("props.subheading")}>
            {subheading}
          </p>
        )}
        <div className={isSpotlight ? "" : "flex justify-center"}>{ctas}</div>
      </Container>
    </section>
  );
}
