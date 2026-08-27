"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  KdsMirrorControls,
  MirrorBlindSpotNotice,
} from "./components/KdsMirrorControls";
import { KdsStationBoard } from "./components/KdsStationBoard";
import {
  KdsMirrorTimeline,
  TIMELINE_WINDOWS,
  type TimelineWindowKey,
} from "./components/KdsMirrorTimeline";
import {
  kdsMirrorKeys,
  useKdsBoardSnapshot,
  useKdsDisplays,
  useKdsMirror,
  useKdsMirrorSnapshots,
  useKdsRoutingHealth,
  useSupportLocations,
} from "./hooks/useKdsMirror";
import { useKdsMirrorRealtime } from "./hooks/useKdsMirrorRealtime";

/**
 * Anchor the replay window to a 30-second grid.
 *
 * The window bounds are part of the snapshot query key. Deriving them from a
 * raw Date.now() on every render would mint a new key each time and refetch
 * forever; rounding gives a key that is stable for 30s and then advances on
 * its own, which is close enough to "now" for a support timeline.
 */
const ANCHOR_GRID_MS = 30_000;

function useWindowAnchor(paused: boolean) {
  const [anchor, setAnchor] = React.useState(
    () => Math.floor(Date.now() / ANCHOR_GRID_MS) * ANCHOR_GRID_MS
  );

  // While scrubbing history the window is frozen: advancing it would shift the
  // snapshot query key, refetch the list under the user, and the empty-data
  // blip would clamp the scrubber back to live -- "undoing where I was". Only
  // advance when following the board, and snap back to "now" on resume.
  React.useEffect(() => {
    if (paused) return;
    setAnchor(Math.floor(Date.now() / ANCHOR_GRID_MS) * ANCHOR_GRID_MS);
    const id = window.setInterval(() => {
      setAnchor(Math.floor(Date.now() / ANCHOR_GRID_MS) * ANCHOR_GRID_MS);
    }, ANCHOR_GRID_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  return anchor;
}

function KdsMirrorPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const merchantId = searchParams.get("merchant");
  const locationId = searchParams.get("location");
  const displayParam = searchParams.get("display");
  const highlightOrderId = searchParams.get("order");

  // "all" and absent both mean location-wide; normalise to null.
  const displayId =
    displayParam && displayParam !== "all" ? displayParam : null;

  const [windowKey, setWindowKey] = React.useState<TimelineWindowKey>("1h");
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const isLive = selectedIndex === null;
  // Freeze the timeline window while scrubbing history; only advance it when
  // following the board live. Otherwise the 30s anchor tick refetches the
  // snapshot list mid-replay and kicks the scrubber back to live.
  const anchor = useWindowAnchor(!isLive);

  const setParams = React.useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const locations = useSupportLocations(merchantId);
  const displays = useKdsDisplays(locationId);
  const health = useKdsRoutingHealth(locationId);

  const realtime = useKdsMirrorRealtime(locationId);
  const liveBoard = useKdsMirror(locationId, displayId);

  const windowMs =
    TIMELINE_WINDOWS.find((w) => w.key === windowKey)?.ms ??
    TIMELINE_WINDOWS[0].ms;
  const fromIso = React.useMemo(
    () => new Date(anchor - windowMs).toISOString(),
    [anchor, windowMs]
  );
  const toIso = React.useMemo(() => new Date(anchor).toISOString(), [anchor]);

  const snapshots = useKdsMirrorSnapshots(displayId, fromIso, toIso);
  const snapshotList = snapshots.data ?? [];

  // Clamp the scrubber whenever the window shrinks or a refetch returns fewer
  // ticks than the current position.
  React.useEffect(() => {
    if (selectedIndex === null) return;
    if (snapshotList.length === 0) {
      setSelectedIndex(null);
    } else if (selectedIndex > snapshotList.length - 1) {
      setSelectedIndex(snapshotList.length - 1);
    }
  }, [selectedIndex, snapshotList.length]);

  const selectedSnapshotId = isLive
    ? null
    : (snapshotList[selectedIndex]?.id ?? null);
  const snapshotDetail = useKdsBoardSnapshot(selectedSnapshotId);

  const boardTickets = isLive
    ? (liveBoard.data ?? [])
    : (snapshotDetail.data?.board ?? []);
  const boardLoading = isLive
    ? liveBoard.isLoading
    : snapshotDetail.isLoading;

  const selectedDisplay =
    (displays.data ?? []).find((d) => d.id === displayId) ?? null;

  const handleRefresh = React.useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: kdsMirrorKeys.board(locationId ?? "", displayId),
    });
    void snapshots.refetch();
  }, [queryClient, locationId, displayId, snapshots]);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Monitor className="h-5 w-5" />
        <div>
          <h1 className="text-lg font-semibold">KDS station mirror</h1>
          <p className="text-xs text-muted-foreground">
            Reconstructs a kitchen display from server state, through the same
            RPC the tablet calls.
          </p>
        </div>
      </div>

      <MirrorBlindSpotNotice />

      {/* No merchant-list gate: the picker searches on demand and labels its
          own selection, so the controls render immediately. */}
      <KdsMirrorControls
        locations={locations.data ?? []}
        displays={displays.data ?? []}
        merchantId={merchantId}
        locationId={locationId}
        displayId={displayId}
        onMerchantChange={(value) => {
          setSelectedIndex(null);
          setParams({
            merchant: value,
            location: null,
            display: null,
            order: null,
          });
        }}
        onLocationChange={(value) => {
          setSelectedIndex(null);
          setParams({ location: value, display: null, order: null });
        }}
        onDisplayChange={(value) => {
          setSelectedIndex(null);
          setParams({ display: value === "all" ? null : value });
        }}
        realtimeStatus={realtime.status}
        isFetching={liveBoard.isFetching}
        onRefresh={handleRefresh}
        health={health.data ?? null}
      />

      {liveBoard.isError && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          Could not load the board:{" "}
          {liveBoard.error instanceof Error
            ? liveBoard.error.message
            : "unknown error"}
        </p>
      )}

      {locationId && displayId && (
        <KdsMirrorTimeline
          snapshots={snapshotList}
          isLoading={snapshots.isLoading}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
          windowKey={windowKey}
          onWindowChange={(key) => {
            setWindowKey(key);
            setSelectedIndex(null);
          }}
          isLive={isLive}
          onReturnToLive={() => setSelectedIndex(null)}
        />
      )}

      {locationId && !displayId && (
        <p className="text-xs text-muted-foreground">
          Replay is per-station. Pick a specific KDS display to scrub its
          history.
        </p>
      )}

      {!locationId ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Monitor className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Pick a merchant and location</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Then choose the KDS display the kitchen is complaining about.
          </p>
        </div>
      ) : (
        <KdsStationBoard
          tickets={boardTickets}
          display={selectedDisplay}
          isLoading={boardLoading}
          highlightOrderId={highlightOrderId}
        />
      )}

      {!isLive && (
        <p className="text-xs text-muted-foreground">
          Viewing a stored snapshot, not the live board. Snapshots are written
          when items arrive, are marked ready, or are served, and are kept for
          14 days.
        </p>
      )}
    </div>
  );
}

export default function KdsMirrorPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6">
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <KdsMirrorPageInner />
    </React.Suspense>
  );
}
