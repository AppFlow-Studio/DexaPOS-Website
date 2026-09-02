import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import { reservationsPagePath } from "@/lib/site-builder/reservations/paths";
import { resolveReservationMode } from "@/lib/site-builder/site-settings";
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
  /**
   * Where "Book a table" goes.
   *
   * One destination now: the merchant's own booking page. It used to be gated
   * on `brand.reservationUrl` — an outbound link to OpenTable or Resy — which
   * meant a merchant who switched to taking bookings on their own site lost the
   * header button entirely. That mode is gone; `resolveReservationMode` answers
   * `off` for any site still carrying its settings, so no site shows a button
   * for a booking system we no longer send anyone to.
   */
  const reserveHere =
    resolveReservationMode({ features: ctx.site.features, brand: ctx.site.brand }) === "native"
      ? reservationsPagePath(ctx.site.basePath)
      : null;

  /*
    Every booking entry point navigates to the reservations page. There is no
    dialog.

    The header's link used to carry `data-dexa-reservations-trigger`, which the
    reservations runtime upgraded into a modal so a visitor could book without
    leaving the page. Nothing else on a site ever carried it, so the SAME words
    behaved four different ways: the header opened a dialog, but only on a
    public page, only above `lg` (below that booking moves into the collapsed
    menu), and only when a branch resolved — while the hero button, the
    reservations section's own call to action and every nav link navigated. A
    visitor cannot learn a rule like that, and a merchant looking at their own
    site could not tell which one they would get.

    So the dialog is gone rather than extended to the other entry points: one
    destination, on every device, in every mode. The anchor already had a real
    `href` — that was always the point of building the trigger as a link rather
    than a button — so removing the attribute is the whole change here, and the
    now-unreachable dialog is removed from `ReservationRuntime`.

    `resolveBookingTarget` went with it: the header's only use of it was
    choosing the dialog's branch, and the reservations page resolves its own.
  */

  const INLINE_LIMIT = 5;
  const inline = ctx.site.nav.slice(0, INLINE_LIMIT);
  const overflow = ctx.site.nav.slice(INLINE_LIMIT);

  /**
   * Booking, as it appears below `lg`.
   *
   * The whole navigation collapses into one menu on a phone, and the "Book a
   * table" anchor beside the Order button is desktop-only — a header with a
   * logo, a menu, a phone number and two calls to action does not fit 390px.
   * So the booking link joins the collapsed menu at exactly the widths where
   * the anchor is hidden, and there is one way to book at every size: never
   * two, never none.
   *
   * Appended here rather than stored in `merchant_sites.nav`, which is what
   * provisioning used to do. A stored item would show up in the desktop row as
   * well, beside the button that already says the same thing.
   */
  const collapsedNav = reserveHere
    ? [...ctx.site.nav, { href: reserveHere, label: "Book a table" }]
    : ctx.site.nav;

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
      <Container className="flex items-center gap-3 py-4 sm:gap-6">
        <div className={logoAlign === "center" ? "min-w-0 flex-1 text-center" : "min-w-0 flex-1"}>
          <a
            href={ctx.site.basePath || "/"}
            className="inline-flex max-w-full items-center gap-3"
          >
            {ctx.site.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- merchant CDN host
              <img
                src={ctx.site.logoUrl}
                alt={ctx.site.name}
                className="h-9 max-w-32 object-contain sm:max-w-48"
              />
            ) : (
              <span className="block truncate text-lg font-semibold tracking-tight">
                {ctx.site.name}
              </span>
            )}
          </a>
        </div>

        {collapsedNav.length > 0 && (
          <>
            {/* Skipped entirely when the site has no pages but does take
                bookings: the desktop row would otherwise be an empty nav
                element, and the booking anchor beside the Order button already
                covers that case at this width. */}
            {inline.length > 0 && (
            <nav className="hidden shrink-0 items-center gap-6 lg:flex" aria-label="Primary">
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
            )}

            {/* Below `lg` the whole navigation collapses into one menu. It used
                to simply not render, which meant a phone visitor — most of them
                — could reach nothing but the home page however carefully the
                merchant had arranged their links. */}
            <nav className="shrink-0 lg:hidden" aria-label="Primary">
              <NavMenu label="Menu" links={collapsedNav} />
            </nav>
          </>
        )}

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
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
          {/* `lg`, not `sm`: below that the collapsed menu carries booking
              instead, so the two can never both be on screen. */}
          {reserveHere && (
            <a
              href={reserveHere}
              className="hidden text-sm font-medium opacity-80 transition-opacity hover:opacity-100 lg:inline"
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
