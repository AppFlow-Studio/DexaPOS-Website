"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ListEvents } from "@/app/dashboard/website/actions/events";
import type { RenderEvent } from "@/lib/site-builder/events/event-map";
import { formatOccurrence, nextOccurrence } from "@/lib/site-builder/events/event";
import { websiteRoutes } from "../routes";

/**
 * Choosing which event a `featured-event` section shows.
 *
 * **The blank option is the recommended one, not a null state.** Left alone the
 * section renders whichever event is next, so a merchant places it on their
 * homepage once and it stays right forever as Friday's trivia rolls over.
 * Pinning is for the case where one specific event is the entire point — the
 * New Year's party being advertised for six weeks — and it is worth the
 * merchant knowing which of those they have chosen, which is why the two are
 * labelled rather than left as an empty first entry.
 *
 * Ended events are still listed, below a separator and marked. A merchant
 * looking for last year's Christmas party to copy its wording has a reason to
 * find it, and hiding it silently would read as the event having been deleted.
 * They are not *offered* first: an ended event hides the section on the live
 * site, which the warning below the select says out loud.
 */
export default function EventPicker({
  value,
  onChange,
  locationId,
  clerkOrgId,
}: {
  value: string;
  onChange: (eventId: string) => void;
  locationId: string;
  clerkOrgId: string;
}) {
  const [events, setEvents] = useState<RenderEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    ListEvents(clerkOrgId)
      .then((result) => {
        if (!cancelled) setEvents(result.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clerkOrgId]);

  /**
   * Split on the same rule the renderer uses, so the editor cannot disagree
   * with the page about whether an event is over. `nextOccurrence` is the one
   * function that decides it, and both callers go through it.
   */
  const { upcoming, ended } = useMemo(() => {
    const now = new Date();
    const upcoming: { event: RenderEvent; occursOn: Date }[] = [];
    const ended: RenderEvent[] = [];

    for (const event of events ?? []) {
      const occursOn = nextOccurrence(event, now);
      if (occursOn) upcoming.push({ event, occursOn });
      else ended.push(event);
    }

    upcoming.sort((a, b) => a.occursOn.getTime() - b.occursOn.getTime());
    return { upcoming, ended };
  }, [events]);

  if (events === null) {
    return <p className="text-[11px] text-muted-foreground">Loading your events…</p>;
  }

  if (events.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          You have no events yet. Add one, then come back and choose it here — or leave this
          section in place and it will show your first event as soon as you create it.
        </p>
        <a
          href={websiteRoutes.events(locationId)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium underline underline-offset-2"
        >
          Go to Events
          <ExternalLink className="size-3" />
        </a>
      </div>
    );
  }

  const pinnedHasEnded = value !== "" && ended.some((event) => event.id === value);
  const pinnedIsMissing = value !== "" && !events.some((event) => event.id === value);

  return (
    <div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="">Whichever event is next</option>

        {upcoming.length > 0 && (
          <optgroup label="Pick one event">
            {upcoming.map(({ event, occursOn }) => (
              <option key={event.id} value={event.id}>
                {event.name} — {formatOccurrence(event, occursOn)}
              </option>
            ))}
          </optgroup>
        )}

        {ended.length > 0 && (
          <optgroup label="Already happened">
            {ended.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {value === "" ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          This section updates itself. When one event finishes, the next one takes its place.
        </p>
      ) : pinnedIsMissing ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-500">
          That event has been deleted, so this section will not appear on your site. Choose
          another one.
        </p>
      ) : pinnedHasEnded ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-500">
          This event is over, so this section will not appear on your site. Choose another one, or
          switch back to &ldquo;whichever event is next&rdquo;.
        </p>
      ) : null}
    </div>
  );
}
