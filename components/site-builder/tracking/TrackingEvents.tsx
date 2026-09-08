"use client";

import { useEffect } from "react";

import {
  EVENT_NAMES,
  TRACKING_EVENTS,
  TRACK_ATTRIBUTE,
  TRACK_VIEW_ATTRIBUTE,
  type TrackingEvent,
} from "@/lib/site-builder/tracking";

/**
 * One delegated listener for every tracked element on the page.
 *
 * **This is the whole client-side footprint of tracking**, and it exists so
 * that nothing else has to be. Sections are server components and that
 * discipline is load-bearing: it is what keeps the builder canvas and the
 * public site a single render rather than two implementations that drift. A
 * tracked button would otherwise have to become a client component, and then so
 * would its section, and then the discipline is gone — traded away for an
 * `onClick`.
 *
 * So a server-rendered element carries `data-sb-track="order_click"`, this
 * listener reads it off the nearest ancestor of whatever was clicked, and fans
 * the event out to the pixels that are actually installed. Adding tracking to a
 * new button is one attribute in a server component. Phases 7–10 add call
 * sites; they do not add JavaScript.
 *
 * Mounted only when at least one pixel is configured, so a merchant who tracks
 * nothing ships no listener.
 */
export default function TrackingEvents({
  providers,
}: {
  providers: { ga: boolean; gtm: boolean; meta: boolean; tiktok: boolean };
}) {
  useEffect(() => {
    // A successful native form POST comes back as a fresh server render. Report
    // that rendered success exactly once for this URL; the route adds a random
    // event token so a later genuine submission is still a distinct conversion.
    document.querySelectorAll(`[${TRACK_VIEW_ATTRIBUTE}]`).forEach((tracked) => {
      const name = tracked.getAttribute(TRACK_VIEW_ATTRIBUTE);
      if (!name || !isTrackingEvent(name)) return;

      const key = `sb-track-view:${name}:${window.location.href}`;
      try {
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, "1");
      } catch {
        // Storage may be blocked. Reporting once per page load is still better
        // than dropping the conversion entirely.
      }
      report(name, providers);
    });

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      // `closest` rather than checking the target itself: a click lands on
      // whatever is innermost, and a tracked button usually wraps a label or an
      // icon that would otherwise swallow it.
      const tracked = target.closest(`[${TRACK_ATTRIBUTE}]`);
      const name = tracked?.getAttribute(TRACK_ATTRIBUTE);
      if (!name || !isTrackingEvent(name)) return;

      report(name, providers);
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
    // `providers` is a fresh object literal each render but its *values* come
    // from server props that cannot change without a full navigation, so the
    // listener is attached exactly once per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers.ga, providers.gtm, providers.meta, providers.tiktok]);

  return null;
}

/**
 * Fans one event out to whichever pixels are present.
 *
 * Everything is optional-chained and wrapped: a blocked script, an ad blocker,
 * or a provider that has not finished loading must never throw inside a click
 * handler on a restaurant's website. The worst outcome of tracking failing is
 * that tracking fails.
 */
function report(event: TrackingEvent, providers: TrackingEventProviders): void {
  const names = EVENT_NAMES[event];
  const w = window as unknown as TrackingWindow;

  try {
    if (providers.ga) w.gtag?.("event", names.ga);

    // GTM gets the raw vocabulary name so a merchant's agency can build a
    // trigger on it without knowing anything about our GA mapping.
    if (providers.gtm) w.dataLayer?.push({ event: event });

    if (providers.meta) {
      w.fbq?.(names.meta.standard ? "track" : "trackCustom", names.meta.name);
    }

    if (providers.tiktok && names.tiktok) w.ttq?.track(names.tiktok);
  } catch {
    // Deliberately silent. There is nothing a visitor can do about it and
    // nothing useful to log from someone else's browser.
  }
}

interface TrackingEventProviders {
  ga: boolean;
  gtm: boolean;
  meta: boolean;
  tiktok: boolean;
}

interface TrackingWindow {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: { push: (payload: Record<string, unknown>) => void };
  fbq?: (action: string, name: string) => void;
  ttq?: { track: (name: string) => void };
}

function isTrackingEvent(value: string): value is TrackingEvent {
  return (TRACKING_EVENTS as readonly string[]).includes(value);
}
