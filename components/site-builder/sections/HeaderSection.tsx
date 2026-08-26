import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import { trackAttrs } from "@/lib/site-builder/tracking";
import { Container, CtaButton, sectionStyleProps } from "../section-shell";

/** Site header. Nav and logo come from the site, not the page. */
export default function HeaderSection({ section, ctx }: SectionRenderProps<"header">) {
  const { logoAlign, sticky, showOrderButton, orderButtonLabel, showPhone, transparentOverHero } =
    section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  /**
   * Links beyond the fifth fall into a "More" menu.
   *
   * Owner's hint text under the nav editor promises exactly this — *"links that
   * don't fit will fall into a 'More' menu"* — and it is what lets the editor
   * offer eight slots without a merchant having to reason about how wide their
   * own labels are.
   *
   * A fixed count rather than real measurement, deliberately. Measuring means a
   * client component, and a section that ships JavaScript to every visitor to
   * decide where a link goes is a bad trade for a nav that is at most eight
   * items long. Five clears a 1024px header even with long labels.
   */
  const reserveUrl =
    ctx.site.features.reservations && ctx.site.brand.reservationUrl
      ? ctx.site.brand.reservationUrl
      : null;

  const INLINE_LIMIT = 5;
  const inline = ctx.site.nav.slice(0, INLINE_LIMIT);
  const overflow = ctx.site.nav.slice(INLINE_LIMIT);

  // `sticky` is dropped in builder mode: a header that follows the canvas scroll
  // fights the overlay's drop targets and makes reordering feel broken.
  const positioning =
    sticky && ctx.mode !== "builder" ? "sticky top-0 z-40" : "relative";

  return (
    <header
      className={`${positioning} w-full border-b`}
      style={{
        ...sectionStyleProps(section.style, ctx.theme),
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
          <>
            <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
              {inline.map((link) => (
                <a
                  key={`${link.href}-${link.label}`}
                  href={link.href}
                  className="text-sm font-medium opacity-80 transition-opacity hover:opacity-100"
                >
                  {link.label}
                </a>
              ))}
              {overflow.length > 0 && <NavMenu label="More" links={overflow} />}
            </nav>

            {/* Below `md` the whole navigation collapses into one menu. It used
                to simply not render, which meant a phone visitor — most of them
                — could reach nothing but the home page however carefully the
                merchant had arranged their links. */}
            <nav className="md:hidden" aria-label="Primary">
              <NavMenu label="Menu" links={ctx.site.nav} />
            </nav>
          </>
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
          {/*
            Booking is a link, not a button, and it sits BEFORE the order button.
            A restaurant's header may carry at most one filled call to action
            without the visitor having to choose between two equally loud
            things — and ordering is the one that takes money, so it keeps the
            emphasis. This appears only when the merchant has turned
            Reservations on AND given somewhere to send people; either alone is
            a button that goes nowhere.
          */}
          {reserveUrl && (
            <a
              href={reserveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-sm font-medium opacity-80 transition-opacity hover:opacity-100 sm:inline"
              {...trackAttrs("reservation_start")}
            >
              Book a table
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

/**
 * A disclosure menu of links.
 *
 * `<details>`/`<summary>` rather than a popover: sections render on the server
 * and stay server-only, so this has to work with no JavaScript at all. The
 * browser gives us the toggle, the keyboard behaviour and the accessible name
 * for free.
 */
function NavMenu({ label, links }: { label: string; links: { label: string; href: string }[] }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium opacity-80 transition-opacity hover:opacity-100 [&::-webkit-details-marker]:hidden">
        {label}
        <span aria-hidden className="transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ul
        className="absolute right-0 z-50 mt-2 min-w-40 rounded-md border p-1 shadow-lg"
        style={{ background: "var(--site-surface)", borderColor: "var(--site-border)" }}
      >
        {links.map((link) => (
          <li key={`${link.href}-${link.label}`}>
            <a
              href={link.href}
              className="block rounded px-3 py-2 text-sm opacity-80 transition-opacity hover:opacity-100"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
