import type { AssetRef } from "@/lib/site-builder/bindings/types";
import type { RenderContext } from "@/lib/site-builder/render-context";
import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import SiteImage from "../SiteImage";
import { Container, CtaButton, sectionStyleProps, textToneColor } from "../section-shell";

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
  const {
    variant,
    heading,
    subheading,
    image,
    carousel,
    overlayOpacity,
    primaryCta,
    secondaryCta,
  } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  // Falls back to the storefront's existing hero so a freshly created site is
  // never blank, even before the asset pipeline exists.
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
      <section className="w-full" style={sectionStyleProps(section.style, ctx.theme)}>
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
          <HeroMedia
            sectionId={section.id}
            image={image}
            carousel={carousel}
            ctx={ctx}
            className="relative aspect-[4/3] w-full rounded-[var(--site-radius)]"
          />
        </Container>
      </section>
    );
  }

  const isSpotlight = variant === "spotlight";

  return (
    <section
      className={`relative w-full overflow-hidden ${isSpotlight ? "min-h-[70vh]" : "min-h-[52vh]"}`}
      style={{
        background: "var(--site-surface-dark)",
        // The full-bleed variants are a dark band whatever `style.background`
        // says, so the tone is resolved against `dark` rather than against a
        // backdrop this section never uses.
        color: textToneColor("dark", section.style, ctx.theme),
      }}
    >
      <HeroMedia
        sectionId={section.id}
        image={image}
        carousel={carousel}
        ctx={ctx}
        className="absolute inset-0 h-full w-full"
      />
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

/**
 * A zero-JavaScript carousel keeps the public renderer server-only while still
 * making every selected Hero photograph visible. The first resolved frame is
 * eager/LCP; later frames stay lazy. Reduced-motion visitors see only frame 1.
 *
 * **`className` owns the positioning, and must establish a containing block.**
 * The frames are `absolute inset-0`, so the wrapper has to be a positioned
 * ancestor — but it must not *decide* which position, because the variants
 * disagree: the full-bleed heroes want `absolute inset-0`, the split hero wants
 * `relative` over an aspect box.
 *
 * This appended `relative` unconditionally, which silently broke the full-bleed
 * variants: Tailwind emits `.relative` after `.absolute`, so with both classes
 * present `relative` wins no matter what order they sit in the attribute. The
 * wrapper stopped being absolutely positioned, `h-full` had no definite parent
 * height left to resolve against, the box collapsed to zero, and every frame
 * inside it went with it. Only the carousel was affected — a lone image never
 * passes through this wrapper at all.
 */
function HeroMedia({
  sectionId,
  image,
  carousel,
  ctx,
  className,
}: {
  sectionId: string;
  image?: AssetRef;
  carousel?: AssetRef[];
  ctx: RenderContext;
  className: string;
}) {
  const seenAssetIds = new Set<string>();
  if (image) seenAssetIds.add(image.assetId);
  const extras = (carousel ?? []).filter((asset) => {
    if (seenAssetIds.has(asset.assetId) || !ctx.resolveAsset(asset.assetId)) return false;
    seenAssetIds.add(asset.assetId);
    return true;
  });
  // A dead primary is not a frame. Without the resolve check it still claimed
  // a slot in the carousel's timeline and the rotation paused on nothing — the
  // same defect as the gallery's empty cells, one layer up.
  const hasPrimary = Boolean(
    (image && ctx.resolveAsset(image.assetId)) || ctx.site.heroImageUrl,
  );
  const frames: (AssetRef | null)[] = [...(hasPrimary ? [image ?? null] : []), ...extras];

  /*
    The canvas gets the first frame and no rotation.

    A carousel that cycles every five seconds while the merchant is working
    changes the section under their cursor: they select a photo, look away to
    the drawer, and the thing they were editing has been replaced by another
    image. Preview and the live page still animate, so the behaviour is still
    reviewable — it simply is not running while someone is trying to edit it.
  */
  if (frames.length <= 1 || ctx.mode === "builder") {
    return (
      <SiteImage
        asset={frames[0] ?? image ?? null}
        ctx={ctx}
        fallbackUrl={ctx.site.heroImageUrl}
        priority
        className={`${className} object-cover`}
      />
    );
  }

  const secondsPerFrame = 5;
  const duration = frames.length * secondsPerFrame;
  const holdUntil = 100 / frames.length;
  const fadeFrom = Math.max(0, holdUntil - Math.min(4, holdUntil / 4));
  const animationName = `site-hero-carousel-${frames.length}`;
  const scope = `hero-carousel-${sectionId.replace(/[^A-Za-z0-9_-]/g, "")}`;

  return (
    <div className={`${scope} ${className} overflow-hidden`} data-hero-carousel="true">
      <style>{`
        @keyframes ${animationName} {
          0%, ${fadeFrom}% { opacity: 1; }
          ${holdUntil}%, 100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .${scope} .site-hero-carousel-frame { animation: none !important; opacity: 0 !important; }
          .${scope} .site-hero-carousel-frame:first-of-type { opacity: 1 !important; }
        }
      `}</style>
      {frames.map((asset, index) => (
        <SiteImage
          key={`${asset?.assetId ?? "fallback"}-${index}`}
          asset={asset}
          ctx={ctx}
          fallbackUrl={index === 0 ? ctx.site.heroImageUrl : null}
          priority={index === 0}
          className="site-hero-carousel-frame absolute inset-0 h-full w-full object-cover opacity-0"
          style={{
            animationName,
            animationDuration: `${duration}s`,
            animationDelay: `${index * secondsPerFrame}s`,
            animationIterationCount: "infinite",
            animationTimingFunction: "ease-in-out",
          }}
        />
      ))}
    </div>
  );
}
