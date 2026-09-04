import { formatOccurrence, nextOccurrence, upcomingEvents } from "@/lib/site-builder/events/event";
import type { RenderEvent } from "@/lib/site-builder/events/event-map";
import type { RenderContext, SectionRenderProps } from "@/lib/site-builder/render-context";
import SiteImage from "../SiteImage";
import { fieldAttrsFor } from "../edit-attrs";
import {
  Container,
  SectionHeading,
  sectionClassName,
  sectionStyleProps,
  textToneColor,
} from "../section-shell";

/**
 * The merchant's events, in one of two shapes.
 *
 * **The only section with no stored content of its own.** Everything it draws
 * is read live from the events table, which is why an event added today shows
 * up on every page carrying this section without republishing any of them.
 *
 *   grid      — everything upcoming, as cards.
 *   spotlight — one event, large, with the photo beside or behind the copy.
 *
 * The empty states are the interesting part, and there are two of them because
 * the two layouts fail differently:
 *
 *  * **Grid with nothing upcoming** says so in the merchant's own voice. A
 *    published Events page with nothing on it must not look broken — that is
 *    precisely what makes it safe to publish the page before the first event
 *    exists, which is the whole reason per-page publishing exists.
 *  * **Spotlight whose pinned event has ended renders nothing at all.** It does
 *    not fall back to the next one. Silently promoting a different event into
 *    the slot a merchant chose for their New Year's party would put content on
 *    their homepage they never approved and would have no reason to check. The
 *    builder canvas says so plainly instead, which is where they can act on it.
 */
export default function EventsSection(props: SectionRenderProps<"events">) {
  return props.section.props.layout === "spotlight" ? <Spotlight {...props} /> : <Grid {...props} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// grid
// ─────────────────────────────────────────────────────────────────────────────

function Grid({ section, ctx }: SectionRenderProps<"events">) {
  const { title, subtitle, limit, showDescription } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  // Upcoming is decided against the viewer's own clock: a repeating event's next
  // occurrence depends on today's date, so it cannot be filtered in SQL.
  const upcoming = upcomingEvents(ctx.events ?? []).slice(0, limit);

  return (
    <section className={sectionClassName(section.style)} style={sectionStyleProps(section.style, ctx.theme)}>
      <Container>
        <SectionHeading
          heading={title}
          subheading={subtitle}
          align={section.style?.align}
          headingAttrs={f("props.title")}
          subheadingAttrs={f("props.subtitle")}
        />

        {upcoming.length === 0 ? (
          <p className="py-6 text-center text-base opacity-70">
            There are no events right now — check back later to see if we&rsquo;ve added any.
          </p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map(({ event, occursOn }) => {
              const href = ctx.eventUrl?.(event.slug);

              const card = (
                <>
                  <EventPhoto
                    event={event}
                    ctx={ctx}
                    className="aspect-[4/3] w-full rounded-[var(--site-radius)] object-cover"
                  />
                  <div className="mt-3">
                    <p className="text-xs font-medium uppercase tracking-wide opacity-60">
                      {formatOccurrence(event, occursOn, ctx.locale)}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight">{event.name}</h3>
                    {event.locationName && (
                      <p className="mt-0.5 text-sm opacity-70">{event.locationName}</p>
                    )}
                    {showDescription && event.description && (
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed opacity-75">
                        {event.description}
                      </p>
                    )}
                  </div>
                </>
              );

              return (
                <li key={event.id}>
                  {/*
                    The card is a link only when there is somewhere to send
                    people. In the builder canvas there is no public URL yet, so
                    it renders as plain content rather than as a link that would
                    take the merchant out of their own editor.
                  */}
                  {href ? (
                    <a href={href} className="group block transition-opacity hover:opacity-90">
                      {card}
                    </a>
                  ) : (
                    card
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Container>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// spotlight
// ─────────────────────────────────────────────────────────────────────────────

const PHOTO_SIZES = {
  small: "md:w-1/3",
  medium: "md:w-1/2",
  large: "md:w-3/5",
} as const;

const HEADING_SIZES = {
  small: "text-2xl md:text-3xl",
  medium: "text-3xl md:text-4xl",
  large: "text-4xl md:text-5xl",
} as const;

const BODY_SIZES = {
  small: "text-sm",
  medium: "text-base",
  large: "text-lg",
} as const;

function Spotlight({ section, ctx }: SectionRenderProps<"events">) {
  const {
    title,
    subtitle,
    eventId,
    photoPosition,
    photoSize,
    textSize,
    overlayOpacity,
    showDescription,
  } = section.props;

  const events = ctx.events ?? [];
  const inBuilder = ctx.mode === "builder";
  const f = fieldAttrsFor(ctx.mode, section.id);

  // Two different questions, deliberately answered separately. Unpinned asks
  // "what is next" and can only be empty when the merchant has no events at
  // all. Pinned asks for one specific row, which may exist but be over — and
  // those two failures need different words in the canvas.
  const chosen = eventId ? events.find((event) => event.id === eventId) : undefined;
  const occursOn = chosen ? nextOccurrence(chosen) : null;

  const featured: { event: RenderEvent; occursOn: Date } | null = eventId
    ? chosen && occursOn
      ? { event: chosen, occursOn }
      : null
    : (upcomingEvents(events)[0] ?? null);

  if (!featured) {
    if (!inBuilder) return null;

    return (
      <section className={sectionClassName(section.style)} style={sectionStyleProps(section.style, ctx.theme)}>
        <Container>
          <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm opacity-70">
            {!eventId
              ? "This will show whichever event is next. Add an event and it will appear here."
              : !chosen
                ? "The event this section was pointing at has been deleted. Choose another one — until you do, this section will not appear on your site."
                : "This event is over, so this section will not appear on your site. Choose another one, or switch it back to whichever event is next."}
          </p>
        </Container>
      </section>
    );
  }

  const { event } = featured;
  const href = ctx.eventUrl?.(event.slug);

  const heading = (
    <SectionHeading
      heading={title}
      subheading={subtitle}
      align={section.style?.align}
      headingAttrs={f("props.title")}
      subheadingAttrs={f("props.subtitle")}
    />
  );

  const copy = (
    <div {...f("props.eventId")}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">
        {formatOccurrence(event, featured.occursOn, ctx.locale)}
      </p>
      <h3 className={`mt-2 font-semibold leading-tight tracking-tight ${HEADING_SIZES[textSize]}`}>
        {event.name}
      </h3>
      {event.locationName && (
        <p className={`mt-1 opacity-75 ${BODY_SIZES[textSize]}`}>{event.locationName}</p>
      )}
      {showDescription && event.description && (
        <p className={`mt-4 leading-relaxed opacity-85 ${BODY_SIZES[textSize]}`}>
          {event.description}
        </p>
      )}
      <EventActions event={event} href={href} />
    </div>
  );

  // ── photo behind the copy ────────────────────────────────────────────────
  //
  // The band owns the positioning and the photo is `absolute inset-0`, so it
  // must establish the containing block and must carry exactly one position
  // class. Both halves matter: the hero carousel shipped with `absolute` and
  // `relative` on one element, Tailwind emitted `.relative` last and won the
  // tie, and every frame collapsed to nothing. See `HeroSection`.
  if (photoPosition === "behind") {
    const band = (
      <div
        className="relative w-full overflow-hidden"
        style={{
          background: "var(--site-surface-dark)",
          color: textToneColor("dark", section.style, ctx.theme),
        }}
      >
        <EventPhoto
          event={event}
          ctx={ctx}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ background: "#000", opacity: overlayOpacity / 100 }}
          aria-hidden="true"
        />
        <Container
          className={`relative flex min-h-[60vh] flex-col justify-center py-20 ${
            section.style?.align === "center" ? "items-center text-center" : ""
          }`}
        >
          <div className="max-w-2xl">{copy}</div>
        </Container>
      </div>
    );

    // With no heading the band *is* the section, full-bleed as it should be.
    // With one, it needs a normally-padded section above it to sit in — a
    // heading floating over the photograph would compete with the event's own
    // name for the same job.
    if (!title && !subtitle) return band;

    return (
      <section className={sectionClassName(section.style)} style={sectionStyleProps(section.style, ctx.theme)}>
        <Container>{heading}</Container>
        {band}
      </section>
    );
  }

  // ── photo beside the copy ────────────────────────────────────────────────
  return (
    <section className={sectionClassName(section.style)} style={sectionStyleProps(section.style, ctx.theme)}>
      <Container>{heading}</Container>
      <Container
        className={`flex flex-col gap-8 md:flex-row md:items-center md:gap-12 ${
          photoPosition === "right" ? "md:flex-row-reverse" : ""
        }`}
      >
        <div className={`w-full ${PHOTO_SIZES[photoSize]}`}>
          <EventPhoto
            event={event}
            ctx={ctx}
            className="aspect-[4/3] w-full rounded-[var(--site-radius)] object-cover"
          />
        </div>
        <div className="w-full md:flex-1">{copy}</div>
      </Container>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * An event's photograph.
 *
 * Event photos are not part of the page document, so they are absent from the
 * asset map `resolveAsset` reads — the events query resolves the URL, which
 * arrives here as the fallback. Routed through `SiteImage` anyway so lazy
 * loading and the no-broken-image rule still apply to these too.
 */
function EventPhoto({
  event,
  ctx,
  className,
}: {
  event: RenderEvent;
  ctx: RenderContext;
  className: string;
}) {
  return (
    <SiteImage
      asset={{ assetId: event.photoAssetId, alt: event.photoAlt ?? event.name }}
      ctx={ctx}
      fallbackUrl={event.photoUrl}
      className={className}
    />
  );
}

/**
 * The buttons under a spotlit event.
 *
 * Both are conditional on there being somewhere to go, and neither has a
 * toggle. A "show ticket button" switch would be inert for every event without
 * a ticket link — the merchant would flip it and watch nothing happen, which is
 * the defect pattern this feature has been removing (see the hero's overlay
 * slider). An event carrying a ticket link is a merchant asking people to use
 * it.
 *
 * `eventUrl` is absent in the builder canvas, where the public address does not
 * exist yet, so "Event details" simply is not offered there rather than
 * rendering a link that would throw the merchant out of their own editor.
 */
function EventActions({ event, href }: { event: RenderEvent; href: string | undefined }) {
  if (!event.ticketUrl && !href) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      {event.ticketUrl && (
        <a
          href={event.ticketUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center justify-center rounded-[var(--site-radius)] px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--site-brand)", color: "var(--site-brand-contrast)" }}
        >
          Get tickets
        </a>
      )}
      {href && (
        <a
          href={href}
          className="inline-flex items-center justify-center rounded-[var(--site-radius)] border px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ borderColor: "currentColor" }}
        >
          Event details
        </a>
      )}
    </div>
  );
}
