import { lookupLocation } from "@/lib/site-builder/bindings/resolved";
import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import { Container, resolveHref } from "../section-shell";
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

  const year = new Date().getFullYear();

  return (
    <footer
      className="w-full border-t"
      style={{
        background: "var(--site-surface-muted)",
        color: "var(--site-text)",
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
              <a
                href={`tel:${location.phone.replace(/[^\d+]/g, "")}`}
                className="mt-2 inline-block text-sm font-medium"
                style={{ color: "var(--site-brand)" }}
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
            Social links live on the site, not the page — `showSocial` only
            controls whether the footer renders them. The site-level social
            config arrives with the settings surface; until then this is inert
            rather than fabricating placeholder icons.
          */}
          {showSocial && ctx.site.nav.length === 0 && null}
        </div>
      </Container>
    </footer>
  );
}
