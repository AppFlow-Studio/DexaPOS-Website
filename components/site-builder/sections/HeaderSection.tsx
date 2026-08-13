import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import { Container, CtaButton, sectionStyleProps } from "../section-shell";

/** Site header. Nav and logo come from the site, not the page. */
export default function HeaderSection({ section, ctx }: SectionRenderProps<"header">) {
  const { logoAlign, sticky, showOrderButton, orderButtonLabel, showPhone, transparentOverHero } =
    section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  // `sticky` is dropped in builder mode: a header that follows the canvas scroll
  // fights the overlay's drop targets and makes reordering feel broken.
  const positioning =
    sticky && ctx.mode !== "builder" ? "sticky top-0 z-40" : "relative";

  return (
    <header
      className={`${positioning} w-full border-b`}
      style={{
        ...sectionStyleProps(section.style),
        borderColor: "var(--site-border)",
        ...(transparentOverHero ? { background: "transparent", borderColor: "transparent" } : {}),
      }}
    >
      <Container className="flex items-center gap-6 py-4">
        <div className={logoAlign === "center" ? "flex-1 text-center" : "flex-1"}>
          <a href={ctx.site.basePath || "/"} className="inline-flex items-center gap-3">
            {ctx.site.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- merchant CDN host
              <img
                src={ctx.site.logoUrl}
                alt={ctx.site.name}
                className="h-9 w-auto object-contain"
              />
            ) : (
              <span className="text-lg font-semibold tracking-tight">{ctx.site.name}</span>
            )}
          </a>
        </div>

        {ctx.site.nav.length > 0 && (
          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
            {ctx.site.nav.map((link) => (
              <a
                key={`${link.href}-${link.label}`}
                href={link.href}
                className="text-sm font-medium opacity-80 transition-opacity hover:opacity-100"
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-4">
          {showPhone && ctx.site.phone && (
            <a
              href={`tel:${ctx.site.phone.replace(/[^\d+]/g, "")}`}
              className="hidden text-sm font-medium opacity-80 hover:opacity-100 sm:inline"
            >
              {ctx.site.phone}
            </a>
          )}
          {showOrderButton && (
            <CtaButton
              label={orderButtonLabel || "Order Now"}
              target={{ kind: "order" }}
              ctx={ctx}
              attrs={f("props.orderButtonLabel")}
            />
          )}
        </div>
      </Container>
    </header>
  );
}
