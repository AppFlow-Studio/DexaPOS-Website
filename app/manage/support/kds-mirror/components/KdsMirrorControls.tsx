"use client";

import * as React from "react";
import { AlertTriangle, Eye, RefreshCw, Wifi, WifiOff } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  KdsDisplaySummary,
  KdsRoutingHealth,
  SupportLocationOption,
} from "@/app/manage/actions/kds-mirror";
import type { MirrorRealtimeStatus } from "../hooks/useKdsMirrorRealtime";
import { MerchantPicker } from "./MerchantPicker";
import { KdsNotice, NoticeLead } from "./kds-primitives";

/**
 * Connection status, NOT viewing status.
 *
 * Deliberately never says "Live": it reports whether the socket is up, not
 * whether the board on screen is current (the 5 s poll keeps it current
 * either way). A state, not an alarm, so it is a neutral pill whose word
 * carries the meaning (UI-DESIGN-SYSTEM §3.5, §4.6b).
 */
export function RealtimeStatus({
  status,
  isFetching,
}: {
  status: MirrorRealtimeStatus;
  isFetching: boolean;
}) {
  const meta =
    status === "live"
      ? {
          icon: <Wifi className={cn("h-3 w-3", isFetching && "animate-pulse")} />,
          label: "Connected",
          title: "Realtime subscription is up; the board updates on push.",
        }
      : status === "degraded"
        ? {
            icon: <WifiOff className="h-3 w-3" />,
            label: "Polling only",
            title:
              "The realtime subscription dropped. The board is still correct but is refreshing on a 5s poll.",
          }
        : status === "connecting"
          ? {
              icon: <RefreshCw className="h-3 w-3 animate-spin" />,
              label: "Connecting",
              title: "Opening the realtime subscription.",
            }
          : null;

  if (!meta) return null;

  return (
    <span
      title={meta.title}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

/**
 * The disclaimer is not decoration. The board reconstructs server state; if
 * the tablet's socket dropped or its cache is stale, the board is perfect and
 * the kitchen screen is blank. Support staff will draw the wrong conclusion
 * from a healthy-looking mirror unless this sits beside it.
 */
export function MirrorBlindSpotNotice() {
  return (
    <KdsNotice icon={Eye}>
      <p>
        <NoticeLead>This is server state, not the physical screen.</NoticeLead>{" "}
        It shows what the server says this station should be displaying, fetched
        through the same RPC the tablet calls. It cannot detect a dropped
        subscription, a crashed app, or a stale cache on the device — in all
        three cases this board still looks correct while the kitchen sees
        nothing. Use it to decide{" "}
        <NoticeLead>server-side or device-side</NoticeLead>, not to confirm what
        was rendered.
      </p>
    </KdsNotice>
  );
}

/**
 * Seven-day routing health for the location. Problems are marked by weight
 * and words, not colour: this is a diagnostic hint, not an HQ-2 alarm.
 */
function HealthHint({ health }: { health: KdsRoutingHealth | null }) {
  if (!health) return null;

  const problems: string[] = [];
  if (health.items_dropped > 0) {
    problems.push(
      `${health.items_dropped} item(s) dropped with no active KDS display`
    );
  }
  if (health.status_divergence_count > 0) {
    problems.push(
      `${health.status_divergence_count} item/display state divergence(s)`
    );
  }
  if (health.items_routed_by_fallback > 0) {
    problems.push(
      `${health.items_routed_by_fallback} item(s) routed only by fallback`
    );
  }

  if (problems.length === 0) {
    return (
      <p className="text-[0.8125rem] text-muted-foreground">
        Last 7 days: <span className="tabular-nums">{health.items_fired}</span>{" "}
        items fired, no drops, no divergence. Routing is healthy at this
        location — a &ldquo;missing order&rdquo; complaint here is most likely
        device-side.
      </p>
    );
  }

  return (
    <div className="flex items-start gap-2 text-[0.8125rem] font-medium text-foreground">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p>
        Last 7 days (
        <span className="tabular-nums">{health.items_fired}</span> items
        fired): {problems.join("; ")}.
      </p>
    </div>
  );
}

/**
 * The scope pickers that govern every tab: merchant, location, display. They
 * sit directly on the page (§5.2); the shared Refresh and the connection
 * status live in the page header.
 */
export function KdsMirrorControls({
  locations,
  displays,
  merchantId,
  locationId,
  displayId,
  onMerchantChange,
  onLocationChange,
  onDisplayChange,
  health,
  locationsLoaded,
  loadError,
}: {
  locations: SupportLocationOption[];
  displays: KdsDisplaySummary[];
  merchantId: string | null;
  locationId: string | null;
  displayId: string | null;
  onMerchantChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onDisplayChange: (value: string) => void;
  health: KdsRoutingHealth | null;
  /** The merchant's locations came back, so an empty list is a real "none". */
  locationsLoaded: boolean;
  /** A failed scope query, said once under the pickers (§4.9). */
  loadError?: React.ReactNode;
}) {
  const selectedDisplay = displays.find((d) => d.id === displayId) ?? null;

  return (
    <div className="min-w-0 space-y-3">
      {/* Stacked full-width on phones, a wrapping row from `sm`. */}
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <MerchantPicker
          merchantId={merchantId}
          onMerchantChange={onMerchantChange}
        />

        {/* SelectTrigger still ships a border by default (§11), so the muted
            material is spelled out. */}
        <Select
          value={locationId ?? ""}
          onValueChange={onLocationChange}
          disabled={!merchantId || locations.length === 0}
        >
          <SelectTrigger
            aria-label="Location"
            className="w-full min-w-0 border-0 bg-muted/60 px-3 text-[0.8125rem] shadow-none data-[size=default]:h-11 dark:bg-muted/60 sm:data-[size=default]:h-9 sm:w-52"
          >
            <SelectValue
              placeholder={
                merchantId && locationsLoaded && locations.length === 0
                  ? "No locations for this merchant"
                  : "Select location"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {locations.map((location) => (
              <SelectItem key={location.id} value={location.id}>
                {location.name}
                {location.is_active ? "" : " (inactive)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={displayId ?? "all"}
          onValueChange={onDisplayChange}
          disabled={!locationId}
        >
          <SelectTrigger
            aria-label="KDS display"
            className="w-full min-w-0 border-0 bg-muted/60 px-3 text-[0.8125rem] shadow-none data-[size=default]:h-11 dark:bg-muted/60 sm:data-[size=default]:h-9 sm:w-60"
          >
            <SelectValue placeholder="Select KDS display" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All displays (location-wide)</SelectItem>
            {displays.map((display) => (
              <SelectItem key={display.id} value={display.id}>
                {display.display_name}
                {display.is_active ? "" : " (inactive)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loadError}

      {displayId === null && locationId && (
        <p className="text-[0.8125rem] text-muted-foreground">
          Showing every display at this location combined. No physical screen
          looks like this — pick a specific display to mirror a real station.
        </p>
      )}

      {selectedDisplay?.show_all_items && (
        <div className="flex items-start gap-2 text-[0.8125rem] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-medium text-foreground">
              {selectedDisplay.display_name} has show_all_items enabled.
            </span>{" "}
            Every fired item lands on this screen regardless of routing rules,
            so the board will look flooded and station-specific rules will
            appear to be ignored. That is configuration, not a routing bug.
          </p>
        </div>
      )}

      <HealthHint health={health} />
    </div>
  );
}
