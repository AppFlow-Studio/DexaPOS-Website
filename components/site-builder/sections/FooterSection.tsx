import { lookupLocation } from "@/lib/site-builder/bindings/resolved";
import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { SOCIAL_LABELS } from "@/lib/site-builder/site-settings";
import { fieldAttrsFor } from "../edit-attrs";
import { Container, resolveHref, textToneColor } from "../section-shell";
import BusinessHours, { formatAddress } from "./shared/BusinessHours";

/**
 * Site footer.
 *
 * Binds to the location for the same reason the location section does — and it
 * matters more here, because the footer appears on every page, so a stale phone
 * number is wrong everywhere at once.
 */
export default function FooterSection({ section, resolved, ctx }: SectionRenderProps<"footer">) {
  const { showAddress, showHours, showPhone, showSocial, tagline, copyrightText, links } =
    section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  const result = lookupLocation(resolved, section.props.location.id);
  const location = result.status === "ok" ? result.data : null;
  const address = location && showAddress ? formatAddress(location) : null;

  const social = ctx.site.brand.social;
  const year = new Date().getFullYear();

  return (
    <footer
      id="contact"
      className="w-full border-t"
      style={{
        background: "var(--site-surface-muted)",
        color: textToneColor("muted", section.style, ctx.theme),
        borderColor: "var(--site-border)",
      }}
    >
      <Container className="py-12">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <p className="text-base font-semibold">{ctx.site.name}</p>
            {tagline && (
              <p className="mt-2 max-w-xs text-sm leading-relaxed opacity-70" {...f("props.tagline")}>
                {tagline}
              </p>
            )}
            {address && (
              <address className="mt-4 text-sm not-italic leading-relaxed opacity-70">
                {address}
              </address>
            )}
            {showPhone && location?.phone && (
              /*
                Inherits the footer's text tone. It used to set
                `color: var(--site-brand)` directly, which is the one thing a
                brand colour must not be used for: as type, on a surface, with
                no contrast check. `--site-brand` is picked to work as a BUTTON
                FILL, where it carries a derived label colour and its own
                contrast against the page is nobody's problem. A pale brand — a
                yellow, a mint — then rendered a phone number that was
                effectively invisible on the muted footer band.

                `tintOn` exists for the cases that genuinely want brand-coloured
                type and walks it to AA first. This is not one of them: the
                address directly above is the same kind of contact detail and is
                plain muted text, so the accent was making one of a pair special
                for no reason. `font-medium` still separates it.
              */
              <a
                href={`tel:${location.phone.replace(/[^\d+]/g, "")}`}
                className="mt-2 inline-block text-sm font-medium opacity-70 transition-opacity hover:opacity-100"
              >
                {location.phone}
              </a>
            )}
          </div>

          {showHours && location && (
            <BusinessHours businessHours={location.businessHours} />
          )}

          {links.length > 0 && (
            <nav aria-label="Footer">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider opacity-60">
                Links
              </h3>
              <ul className="space-y-2 text-sm">
                {links.map((link, index) => (
                  <li key={`${link.label}-${index}`}>
                    <a
                      href={resolveHref(link.target, ctx)}
                      className="opacity-70 transition-opacity hover:opacity-100"
                      {...f(`props.links.${index}.label`)}
                      {...(link.target.kind === "url"
                        ? { rel: "noopener noreferrer", target: "_blank" }
                        : {})}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>

        <div
          className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-xs opacity-60"
          style={{ borderColor: "var(--site-border)" }}
        >
          <p {...f("props.copyrightText")}>
            {copyrightText || `© ${year} ${ctx.site.name}. All rights reserved.`}
          </p>
          {/*
            Social accounts live on the site, not the page: `showSocial` decides
            *whether* this footer draws them, and brand settings decide *what*.
            That split is why a merchant types their Instagram address once
            rather than once per page — and why this was inert until the
            settings screen existed to fill it.

            Names rather than icons. Lucide carries Instagram, Facebook, X and
            YouTube but not TikTok, Yelp or Tripadvisor, and a footer that draws
            four logos and three words looks like something failed to load.
            Seven words look deliberate.
          */}
          {showSocial && social.length > 0 && (
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {social.map((link) => (
                <li key={link.platform}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer me"
                    className="font-medium transition-opacity hover:opacity-100"
                  >
                    {SOCIAL_LABELS[link.platform]}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
    </footer>
  );
}
