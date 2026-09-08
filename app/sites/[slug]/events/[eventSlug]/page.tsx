import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { SiteChrome } from "@/components/site-builder/PageRenderer";
import SiteAnalyticsScripts from "@/components/site-builder/tracking/SiteAnalyticsScripts";
import {
  formatOccurrence,
  nextOccurrence,
  occurrenceEnd,
} from "@/lib/site-builder/events/event";
import { loadPublicEvents, type RenderEvent } from "@/lib/site-builder/events/event-map";
import { buildEventJsonLd } from "@/lib/site-builder/json-ld";
import { buildPublicRenderContext } from "@/lib/site-builder/public-context";
import { sitePublicUrl } from "@/lib/site-builder/public-url";
import { resolveRenderMode } from "@/lib/site-builder/resolve-render-mode";
import { resolveTracking, trackAttrs } from "@/lib/site-builder/tracking";
import { createAnonSupabaseClient } from "@/lib/supabase/anon";

/**
 * One event's public page.
 *
 * **A static route segment, not a merchant page.** Next resolves `events/{slug}`
 * here before the catch-all that serves built pages, which is the same
 * mechanism that already keeps `/checkout` and `/t/{token}` working — routing
 * does the reserving, not a list. The single segment `/events` is untouched and
 * remains available as an ordinary merchant page, which is where the listing
 * lives.
 */

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ slug: string; eventSlug: string }>;
}

/** Resolved at most once per request — `generateMetadata` and the page both need it. */
const getEvent = cache(
  async (slug: string, eventSlug: string): Promise<{ event: RenderEvent; siteId: string } | null> => {
    const supabase = createAnonSupabaseClient();

    // Path is irrelevant here; this only needs the site the address belongs to.
    const decision = await resolveRenderMode(supabase, slug, "", false);
    if (decision.mode !== "builder") return null;

    const events = await loadPublicEvents(supabase, decision.siteId);
    const event = events.find((candidate) => candidate.slug === eventSlug);

    return event ? { event, siteId: decision.siteId } : null;
  },
);

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug, eventSlug } = await params;
  const found = await getEvent(slug, eventSlug);
  if (!found) return {};

  const { event } = found;
  const canonical = sitePublicUrl(slug, `events/${event.slug}`);

  return {
    title: { absolute: event.name },
    description: event.description?.slice(0, 200),
    alternates: { canonical },
    openGraph: {
      title: event.name,
      description: event.description?.slice(0, 200),
      url: canonical,
      type: "website",
      ...(event.photoUrl ? { images: [event.photoUrl] } : {}),
    },
  };
}

export default async function EventDetailPage({ params }: RouteProps) {
  const { slug, eventSlug } = await params;

  const found = await getEvent(slug, eventSlug);
  if (!found) notFound();

  const { event } = found;

  const supabase = createAnonSupabaseClient();
  const decision = await resolveRenderMode(supabase, slug, "", false);
  if (decision.mode !== "builder") notFound();

  const host = (await headers()).get("host") ?? "";
  const viaSubdomain = host.split(":")[0].split(".")[0] === slug;
  const basePath = viaSubdomain ? "" : `/sites/${slug}`;

  const { ctx } = await buildPublicRenderContext(supabase, decision, basePath, []);

  /**
   * An event whose last occurrence has passed still resolves — the URL may be
   * on a poster or in somebody's inbox, and a 404 is a worse answer than the
   * page saying it has finished. `nextOccurrence` returning null is what that
   * state looks like.
   */
  const occursOn = nextOccurrence(event);
  const finished = occursOn === null;

  const jsonLd = occursOn
    ? JSON.stringify(
        buildEventJsonLd({
          name: event.name,
          description: event.description,
          url: sitePublicUrl(slug, `events/${event.slug}`),
          image: event.photoUrl,
          startDate: `${toDateValue(occursOn)}T${event.startTime}`,
          endDate: toIsoLocal(occurrenceEnd(event, occursOn), event.endTime),
          ticketUrl: event.ticketUrl,
          location: null,
          organizerName: ctx.site.name,
        }),
      )
    : null;

  return (
    <SiteChrome ctx={ctx}>
      <SiteAnalyticsScripts tracking={resolveTracking(decision.integrations)} />
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}

      <article className="mx-auto w-full max-w-3xl px-5 py-12 md:px-8">
        <a
          href={basePath || "/"}
          className="text-sm font-medium opacity-70 transition-opacity hover:opacity-100"
        >
          ← {ctx.site.name}
        </a>

        {event.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- merchant CDN host
          <img
            src={event.photoUrl}
            alt={event.photoAlt ?? ""}
            className="mt-6 aspect-[16/9] w-full rounded-[var(--site-radius)] object-cover"
          />
        )}

        <p className="mt-6 text-sm font-medium uppercase tracking-wide opacity-60">
          {occursOn ? formatOccurrence(event, occursOn, ctx.locale) : "This event has finished"}
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{event.name}</h1>

        {event.description && (
          <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed opacity-80">
            {event.description}
          </p>
        )}

        {/* A ticket link on a finished event sends people to a dead sale. */}
        {event.ticketUrl && !finished && (
          <a
            href={event.ticketUrl}
            {...trackAttrs("event_cta_click")}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center justify-center rounded-[var(--site-radius)] px-6 py-3 text-sm font-semibold"
            style={{ background: "var(--site-brand)", color: "var(--site-brand-contrast)" }}
          >
            Get tickets
          </a>
        )}
      </article>
    </SiteChrome>
  );
}

function toDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `2026-08-22T02:00` — a local datetime, matching how these are stored. */
function toIsoLocal(date: Date, time: string): string {
  return `${toDateValue(date)}T${time}`;
}
