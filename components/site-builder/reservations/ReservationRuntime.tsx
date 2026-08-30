"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { BookableLocation } from "@/lib/site-builder/reservations/protocol";

import ReservationWidget from "./ReservationWidget";

/**
 * Mounts the booking widget into whatever the page server-rendered as a mount
 * point.
 *
 * It used to do a second thing: intercept the header's "Book a table" link and
 * open the widget in a modal instead. That is gone. The header was the only
 * place that ever carried the trigger, so identical wording behaved differently
 * depending on which button you pressed, how wide the window was, and whether
 * you were on a live page or in the builder. Every booking entry point now
 * navigates to the reservations page — see the note in `HeaderSection`.
 *
 * **Why this exists at all, rather than the section simply rendering the
 * widget.** Every section in this codebase is a server component, and that is
 * not a stylistic rule: the builder canvas re-renders through
 * `renderToStaticMarkup` in a route handler, and Next refuses
 * `react-dom/server` in any module graph that reaches a client component. A
 * section importing this file would break the canvas for every merchant, on
 * every page, whether or not they use reservations.
 *
 * So the section emits an empty `<div data-dexa-reservations='{…}'>` and this
 * runs *beside* the page, portalling a widget into each one — exactly the
 * arrangement `tracking/SiteAnalyticsScripts` uses for the same reason, and the
 * reason both directories are excluded from the render-graph scan in
 * `render.test.tsx`. Nothing in the render graph may import from here, and a
 * test enforces it.
 *
 * Reservations is the first section that genuinely needs client JavaScript: a
 * grid that repopulates when you change the party size, and a countdown against
 * a real five-minute hold, cannot be done with a native form the way
 * `PublicForm` is.
 */

export const RESERVATION_MOUNT_ATTR = "data-dexa-reservations";


interface MountConfig {
  siteId: string;
  locationId: string | null;
  /**
   * Branches the guest may choose between, serialised by the section. One entry
   * when a branch is already settled, so the widget always has that branch's
   * policy, party bounds and timezone without a second lookup.
   */
  locations?: BookableLocation[];
  /**
   * Whether the merchant runs more than one bookable branch — which
   * `locations.length` cannot answer once a pin has narrowed it to one. Drives
   * whether the widget names the restaurant.
   */
  multiBranch?: boolean;
  /**
   * Whether a submission books a table or asks for one. Optional so a payload
   * cached before manual review existed still renders today's behaviour rather
   * than telling a guest their table is only a request.
   */
  approvalMode?: "auto" | "manual";
  basePath: string;
  venueName: string | null;
  showDetails: boolean;
  showOtherDates: boolean;
}

interface Mount {
  el: Element;
  config: MountConfig;
}

/**
 * Parses a config off an element, tolerating anything malformed.
 *
 * A broken attribute is a bug in the renderer, not something a visitor can fix.
 * Skipping it keeps the rest of the restaurant's page — which is still worth
 * showing — rather than taking the whole island down with a parse error.
 */
function readConfig(el: Element, attr: string): MountConfig | null {
  const raw = el.getAttribute(attr);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MountConfig;
  } catch {
    return null;
  }
}

export default function ReservationRuntime() {
  const [mounts, setMounts] = useState<Mount[]>([]);
  useEffect(() => {
    const found: Mount[] = [];
    for (const el of Array.from(document.querySelectorAll(`[${RESERVATION_MOUNT_ATTR}]`))) {
      const config = readConfig(el, RESERVATION_MOUNT_ATTR);
      if (config) found.push({ el, config });
    }
    setMounts(found);
  }, []);

  return (
    <>
      {mounts.map(({ el, config }, i) =>
        createPortal(<ReservationWidget {...config} renderMode="live" />, el, `reservation-${i}`),
      )}
    </>
  );
}
