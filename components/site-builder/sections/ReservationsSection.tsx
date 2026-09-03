import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { resolveBookingTarget } from "@/lib/site-builder/reservations/resolve-branch";
import { resolveReservationMode } from "@/lib/site-builder/site-settings";

import { fieldAttrsFor } from "../edit-attrs";
import { Container, SectionHeading, sectionClassName, sectionStyleProps } from "../section-shell";

/**
 * The booking widget's place on the page.
 *
 * **A server component that renders no widget.** It emits an empty mount point
 * carrying its configuration in a data attribute, and `ReservationRuntime` —
 * mounted once by the public route, beside the page rather than inside it —
 * portals the real widget into it.
 *
 * (That module is deliberately named here without its path: `render.test.tsx`
 * greps the render graph for references to the excluded directories, and it
 * cannot tell a doc comment from an import.)
 *
 * That indirection is not architecture for its own sake. The builder canvas
 * re-renders through `renderToStaticMarkup`, and Next refuses
 * `react-dom/server` in any module graph reaching a client component, so a
 * section that imported the widget directly would break the canvas for every
 * merchant on every page. `tracking/SiteAnalyticsScripts` solves the same
 * problem the same way, and `render.test.tsx` enforces both halves: no client
 * component in the render graph, and no import from the excluded directories.
 *
 * In the builder and in preview this renders a STATIC MOCK instead — plain
 * server-rendered HTML, no mount point, nothing to hydrate. That is not just a
 * performance choice: the canvas and the preview both render against a *real*
 * restaurant, so a live widget would let a merchant laying out their page place
 * genuine five-minute holds on genuine tables during service.
 */

/** Example times for the editor. Never fetched, never bookable. */
const MOCK_TIMES = [
  "5:00 PM", "5:15 PM", "5:30 PM", "5:45 PM",
  "6:00 PM", "6:15 PM", "6:30 PM", "6:45 PM",
];

export default function ReservationsSection({
  section,
  ctx,
}: SectionRenderProps<"reservations">) {
  const { title, subtitle, locationId, showDetails, showOtherDates } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  const mode = resolveReservationMode({ features: ctx.site.features, brand: ctx.site.brand });

  // Reservations is off, or set to link out to a provider. Either way this
  // section has nothing to render, and a guest must never see a booking form
  // that cannot book. The merchant is told why; a visitor gets a shorter page.
  if (mode !== "native") {
    if (ctx.mode !== "builder") return null;

    return (
      <section
        className={sectionClassName(section.style)}
        style={sectionStyleProps(section.style, ctx.theme)}
      >
        <Container>
          {/*
            `off` is the only value left that reaches here — `link` mode was
            removed and `RESERVATION_MODES` is now an enum of one, so the branch
            that named a booking provider was unreachable and tsc said so.
          */}
          <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm opacity-60">
            Turn Reservations on in Website settings to take bookings here.
          </p>
        </Container>
      </section>
    );
  }

  /*
   * Precedence: the section's own choice, then the PAGE's own branch, then null
   * — which makes the widget ask. Both are deliberate merchant acts: pinning the
   * section beats the page, and a page about one restaurant books that
   * restaurant. A brand page with neither has to ask.
   *
   * `ctx.site.pageLocationId`, NOT `ctx.site.locationId`. The latter is the
   * *pricing* scope and falls back to the brand's default branch, so reading it
   * here meant a merchant choosing which prices to show on a brand page also,
   * silently, chose which restaurant every guest ate at — and the flow never
   * named it.
   */
  const preferredLocationId = locationId || ctx.site.pageLocationId || null;

  const isLive = ctx.mode === "public";

  /**
   * Which branches can actually be booked, from the render context.
   *
   * **A preferred branch is only honoured if it is genuinely bookable.** A
   * section pinned to a branch that has since switched bookings off, or lost its
   * last service period, used to render a widget that queried forever and
   * reported "No tables available" — the false zero this section exists to
   * avoid. Falling through to the picker (or the phone number) is the honest
   * answer.
   *
   * Shared with `HeaderSection` through `resolveBookingTarget`, so the section
   * and the header's dialog can never disagree about which branch is being
   * booked — they did, and the dialog opened onto an empty picker.
   *
   * `missing` is "this merchant has no branch taking bookings", not "no branch
   * was named" — the picker handles the latter. With nothing bookable the widget
   * cannot query, so it must not render: it would tell a guest the restaurant is
   * full when nothing was ever asked. A phone number is a worse booking
   * experience and an honest one.
   */
  const {
    resolved,
    offered,
    missing: missingLocation,
  } = resolveBookingTarget(ctx.site.reservations.locations, preferredLocationId);

  return (
    <section
      className={sectionClassName(section.style)}
      style={sectionStyleProps(section.style, ctx.theme)}
    >
      <Container>
        <SectionHeading
          heading={title}
          subheading={subtitle}
          align={section.style?.align}
          headingAttrs={f("props.title")}
          subheadingAttrs={f("props.subtitle")}
        />

        {isLive && missingLocation ? (
          <p className="mx-auto max-w-xl rounded-[var(--site-radius)] border p-6 text-center text-sm">
            {ctx.site.phone
              ? `To book a table, please call us on ${ctx.site.phone}.`
              : "To book a table, please contact the restaurant directly."}
          </p>
        ) : isLive ? (
          <div
            className="mx-auto max-w-3xl"
            // The runtime finds this by attribute and portals a widget into it.
            // Serialising the config here rather than fetching it client-side
            // keeps the widget's first paint free of a configuration round trip.
            data-dexa-reservations={JSON.stringify({
              siteId: ctx.site.siteId,
              // The branch to book, when one is settled. Null hands the widget
              // the list below and makes it ask — which is the whole picker.
              locationId: resolved?.id ?? null,
              // Only what the guest may need to choose between. When a branch is
              // already resolved this is the single entry, so the widget always
              // has that branch's policy, party bounds and timezone to hand
              // without a second lookup.
              locations: offered,
              // Whether this MERCHANT has more than one bookable branch, which
              // `locations.length` cannot answer once a pin has narrowed it to
              // one — and that is precisely the case where naming the branch
              // matters most, because the guest was never asked. Drives whether
              // the widget names the restaurant at all.
              multiBranch: ctx.site.reservations.locations.length > 1,
              // Whether a submission books a table or asks for one. Site-wide,
              // so it is read off the config rather than the resolved branch.
              // The widget needs it before the guest commits — it decides what
              // the button says.
              approvalMode: ctx.site.reservations.approvalMode,
              basePath: ctx.site.basePath,
              // Serialised rather than fetched: the confirmation screen names
              // the restaurant, and the widget has no other way to know it.
              venueName: ctx.site.name ?? null,
              // Same reason as `venueName`: the confirmation screen shows the
              // merchant's mark, and the widget has no other way to reach it.
              logoUrl: ctx.site.logoUrl ?? null,
              showDetails,
              showOtherDates,
            })}
          >
            {/*
              What a visitor sees with JavaScript disabled or still loading.
              Replaced wholesale when the runtime portals in, so it is never
              shown alongside the real widget.
            */}
            <noscript>
              <p className="rounded-[var(--site-radius)] border p-6 text-center text-sm">
                Booking a table needs JavaScript. Please call us instead
                {ctx.site.phone ? ` on ${ctx.site.phone}` : ""}.
              </p>
            </noscript>
          </div>
        ) : (
          <>
            {/*
              Said in the editor, where it can be acted on. The public page shows
              a phone number instead; a merchant who never opens this section
              would otherwise find out from a guest.
            */}
            {missingLocation && ctx.mode === "builder" && (
              <p className="mx-auto mb-4 max-w-xl rounded-[var(--site-radius)] border border-dashed p-4 text-center text-xs opacity-70">
                No branch is taking bookings yet, so visitors are shown your phone number
                instead. Turn bookings on for at least one branch, and give it a service
                period, under Reservations.
              </p>
            )}
            <StaticMockGrid />
          </>
        )}
      </Container>
    </section>
  );
}

/**
 * The editor's stand-in: the real layout, none of the behaviour.
 *
 * Shaped like the live widget so a merchant can judge spacing and colour, but
 * server-rendered and inert — there is nothing here to click and nothing to
 * fetch.
 */
function StaticMockGrid() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-stretch gap-px overflow-hidden rounded-full border">
        {[
          ["Guests", "2 Guests"],
          ["Date", "Today"],
          ["Time", "All times"],
        ].map(([label, value]) => (
          <div key={label} className="min-w-[8rem] flex-1 px-5 py-3">
            <span className="block text-[0.7rem] uppercase tracking-wide opacity-60">{label}</span>
            <span className="text-base font-medium">{value}</span>
          </div>
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MOCK_TIMES.map((time) => (
          <li key={time}>
            <span
              className="flex flex-col items-center justify-center rounded-[var(--site-radius)] px-4 py-3 font-semibold text-[var(--site-brand-contrast)]"
              style={{ background: "var(--site-brand)" }}
            >
              {time}
              <span className="text-[0.65rem] uppercase tracking-wide opacity-80">Dinner</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-center text-xs opacity-60">
        Example times. Your real availability appears on your published site.
      </p>
    </div>
  );
}
