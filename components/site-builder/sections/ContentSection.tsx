import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import type { SectionStyle } from "@/lib/site-builder/sections/primitives";
import { fieldAttrsFor } from "../edit-attrs";
import SiteImage from "../SiteImage";
import { Container, CtaButton, sectionClassName, sectionStyleProps } from "../section-shell";

/**
 * The workhorse block: a title, a sentence, optionally a photo beside them and
 * one call to action.
 *
 * **No `dangerouslySetInnerHTML` anywhere.** The previous version rendered a
 * TipTap `body` and sanitized it on the way out; the reshape (decision W3) left
 * this section with two plain-text fields, so the whole class of stored-XSS
 * question simply does not arise here any more. The FAQ answer is now the only
 * merchant-authored markup on a built page.
 *
 * Background and media are independent: a block may carry a photographic
 * background *and* a foreground photo, which is a layout Owner's own home page
 * uses and one a single "image" field could not express.
 */
export default function ContentSection({ section, ctx }: SectionRenderProps<"content">) {
  const {
    background,
    backgroundTone,
    backgroundImage,
    media,
    mediaImage,
    alignment,
    title,
    subtitle,
    button,
  } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  const photoBackground = background === "photo" ? backgroundImage : undefined;
  const backgroundUrl = photoBackground
    ? (ctx.resolveAsset(photoBackground.assetId)?.url ?? null)
    : null;

  /**
   * A photographic background darkens itself and switches to light type.
   *
   * Not a merchant choice: white-on-photo is legible and dark-on-photo is a
   * coin toss, and the whole point of deriving every colour is that no
   * combination of controls can produce unreadable copy.
   */
  const onPhoto = !!backgroundUrl;

  const toneStyle = sectionStyleProps(
    background === "color"
      ? ({ ...section.style, background: backgroundTone ?? "muted" } as SectionStyle)
      : ({ ...section.style, background: "default" } as SectionStyle),
  );

  const prose = (
    <div className="max-w-2xl">
      {title && (
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl" {...f("props.title")}>
          {title}
        </h2>
      )}
      {subtitle && (
        <p className="mt-4 text-base leading-relaxed opacity-80" {...f("props.subtitle")}>
          {subtitle}
        </p>
      )}
      {button && (
        <div className="mt-8">
          <CtaButton
            label={button.label}
            target={button.target}
            ctx={ctx}
            attrs={f("props.button.label")}
          />
        </div>
      )}
    </div>
  );

  const picture =
    media === "photo" && mediaImage ? (
      <SiteImage
        asset={mediaImage}
        ctx={ctx}
        className="aspect-[4/3] w-full rounded-[var(--site-radius)] object-cover"
      />
    ) : null;

  return (
    <section
      className={sectionClassName(section.style, onPhoto ? "relative isolate" : "")}
      style={{
        ...toneStyle,
        ...(onPhoto
          ? {
              backgroundImage: `linear-gradient(rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.55)), url(${cssUrl(backgroundUrl)})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              color: "var(--site-text-on-dark)",
            }
          : {}),
      }}
      id={title ? slugId(title) : undefined}
    >
      <Container>
        {picture ? (
          <div className="grid items-center gap-10 md:grid-cols-2">
            {alignment === "left" ? (
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

/**
 * Escapes a resolved asset URL for a CSS `url()`.
 *
 * The value comes from our own asset table rather than from a merchant's
 * keyboard, but it lands in a style attribute, and a URL carrying a quote or a
 * paren would break out of the declaration. Cheap insurance at the one place a
 * section builds CSS from data.
 */
function cssUrl(url: string): string {
  return `"${url.replace(/["\\\n]/g, "")}"`;
}

/** Stable anchor so a nav link or a "contact" CTA can target this section. */
function slugId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
