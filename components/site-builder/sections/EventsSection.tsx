import { formatOccurrence, upcomingEvents } from "@/lib/site-builder/events/event";
import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import SiteImage from "../SiteImage";
import { fieldAttrsFor } from "../edit-attrs";
import { Container, SectionHeading, sectionClassName, sectionStyleProps } from "../section-shell";

/**
 * Upcoming events.
 *
 * **The only section with no stored content of its own.** Everything it draws
 * is read live from the events table, which is why it has almost no controls
 * and why an event added today shows up on every page carrying this section
 * without republishing any of them.
 *
 * The empty state is the interesting part. A published Events page with nothing
 * on it must not look broken — that is precisely what makes it safe for a
 * merchant to publish the page before they have their first event, which is the
 * whole reason per-page publishing exists. So an empty list says so in the
 * merchant's own voice rather than rendering an empty grid or, worse, nothing
 * at all.
 */
export default function EventsSection({ section, ctx }: SectionRenderProps<"events">) {
  const { title, subtitle, limit } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  // Upcoming is decided against the viewer's own clock: a repeating event's next
  // occurrence depends on today's date, so it cannot be filtered in SQL.
  const upcoming = upcomingEvents(ctx.events ?? []).slice(0, limit);

  return (
    <section className={sectionClassName(section.style)} style={sectionStyleProps(section.style)}>
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
                  {/*
                    Event photos are not part of the page document, so they are
                    not in the asset map `resolveAsset` reads — the events RPC
                    resolves the URL instead, which arrives here as the
                    fallback. Still routed through `SiteImage` so lazy loading
                    and the no-broken-image rule apply to these too.
                  */}
                  <SiteImage
                    asset={{ assetId: event.photoAssetId, alt: event.photoAlt ?? event.name }}
                    ctx={ctx}
                    fallbackUrl={event.photoUrl}
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
                    {event.description && (
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
