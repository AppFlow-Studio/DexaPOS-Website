"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, Monitor, PackageX, Radio, Send } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  KdsMirrorControls,
  MirrorBlindSpotNotice,
} from "./components/KdsMirrorControls";
import { KdsSendLedger, type KdsSendLedgerHandle } from "./components/KdsSendLedger";
import {
  KdsUnsentItems,
  type KdsUnsentItemsHandle,
} from "./components/KdsUnsentItems";
import { KdsStationBoard } from "./components/KdsStationBoard";
import { KdsDisplayHealthCards } from "./components/KdsDisplayHealthCards";
import { KdsDeviceTruthTimeline } from "./components/KdsDeviceTruthTimeline";
import { KdsDivergenceList } from "./components/KdsDivergenceList";
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
import {
  useKdsDeviceTruthHealth,
  useKdsDeviceTruthWindow,
} from "./hooks/useKdsDeviceTruth";

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

/**
 * The device-truth tab's own honesty notice: a display that has never reported
 * is not a broken display. NO_DEVICE_DATA is the answer until the POS emitter
 * ships to it, and the UI must keep saying that instead of implying a fault.
 */
function DeviceTruthBlindSpotNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <Eye className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="font-semibold">
          This is device-attested, reported on the heartbeat.
        </span>{" "}
        It shows what each tablet says it received and painted, diffed against
        the server routing log. A display with no device data at all means the
        emitter has not shipped to it yet —{" "}
        <span className="font-medium">
          absence of device evidence is not evidence of a fault.
        </span>
      </p>
    </div>
  );
}

function KdsMirrorPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const merchantId = searchParams.get("merchant");
  const locationId = searchParams.get("location");
  const displayParam = searchParams.get("display");
  const highlightOrderId = searchParams.get("order");

  // The single Refresh button in the header controls drives all three views:
  // it invalidates the board, and re-anchors + refetches the send ledger and
  // the unsent-items view through these handles (neither tab may own a second
  // refresh button).
  const ledgerRef = React.useRef<KdsSendLedgerHandle>(null);
  const unsentRef = React.useRef<KdsUnsentItemsHandle>(null);

  // A deep link to a specific order opens on the send ledger (the order row is
  // the reason they came); a ?tab= param (e.g. the old /kds-truth redirect)
  // opens that tab; everything else opens on the board.
  const [activeTab, setActiveTab] = React.useState<
    "board" | "ledger" | "unsent" | "device-truth"
  >(() => {
    const tab = searchParams.get("tab");
    if (tab === "ledger" || tab === "unsent" || tab === "device-truth") {
      return tab;
    }
    return highlightOrderId ? "ledger" : "board";
  });

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

  // Device-truth tab: its own window selector (independent of the board's
  // snapshot scrubber), anchored on mount / selection only — the bounds are
  // part of the truth-window query key, so deriving them from Date.now()
  // during render would refetch forever.
  const [truthWindowKey, setTruthWindowKey] =
    React.useState<TimelineWindowKey>("6h");
  const [truthWindowEndMs, setTruthWindowEndMs] = React.useState(() =>
    Date.now()
  );
  const truthWindowMs =
    TIMELINE_WINDOWS.find((w) => w.key === truthWindowKey)?.ms ??
    TIMELINE_WINDOWS[0].ms;
  const truthToIso = React.useMemo(
    () => new Date(truthWindowEndMs).toISOString(),
    [truthWindowEndMs]
  );
  const truthFromIso = React.useMemo(
    () => new Date(truthWindowEndMs - truthWindowMs).toISOString(),
    [truthWindowEndMs, truthWindowMs]
  );

  const deviceHealth = useKdsDeviceTruthHealth(locationId);
  const deviceTruth = useKdsDeviceTruthWindow(
    displayId,
    truthFromIso,
    truthToIso
  );
  const deviceTruthWindow = deviceTruth.data ?? null;

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
    // The device-truth tab shares the same Refresh button.
    void queryClient.invalidateQueries({ queryKey: ["hq-kds-device-truth"] });
    void snapshots.refetch();
    // Re-anchor the ledger + unsent windows to now and refetch their current
    // windows. No-ops when the tab isn't mounted (ref is null).
    ledgerRef.current?.refresh();
    unsentRef.current?.refresh();
  }, [queryClient, locationId, displayId, snapshots]);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Monitor className="h-5 w-5" />
        <div>
          <h1 className="text-lg font-semibold">KDS</h1>
          <p className="text-xs text-muted-foreground">
            Kitchen display support — server reconstruction, send history, and
            device-attested truth.
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

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const next =
            value === "ledger" ||
            value === "unsent" ||
            value === "device-truth"
              ? value
              : "board";
          setActiveTab(next);
          // Keep the tab in the URL so the old /kds-truth redirect, refresh
          // and the back button all land where the user was.
          const updates: Record<string, string | null> = { tab: next };
          // Ledger and unsent-items are location-wide views. "Show on board"
          // and trace deep links write ?order=<id>, which pins them to one
          // order; drop the param when arriving via a tab so they never
          // silently show a single order. (Direct deep links still filter on
          // first load, and both views show an explicit "Show all".)
          if (next === "ledger" || next === "unsent") {
            updates.order = null;
          }
          setParams(updates);
        }}
        className="flex flex-col gap-4"
      >
        <TabsList className="w-fit">
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="ledger">Send ledger</TabsTrigger>
          <TabsTrigger value="unsent">Unsent items</TabsTrigger>
          <TabsTrigger value="device-truth">Device truth</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="flex flex-col gap-4">
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
              Viewing a stored snapshot, not the live board. Snapshots are
              written when items arrive, are marked ready, or are served, and
              are kept for 14 days.
            </p>
          )}
        </TabsContent>

        <TabsContent value="ledger" className="flex flex-col gap-4">
          {locationId ? (
            <KdsSendLedger
              ref={ledgerRef}
              locationId={locationId}
              orderId={highlightOrderId}
              onShowOnBoard={(orderId) => {
                setParams({ order: orderId });
                setActiveTab("board");
              }}
              onClearOrder={() => setParams({ order: null })}
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <Send className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Pick a merchant and location</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The send ledger shows every order-to-kitchen send attempt
                received from the POS at a location.
              </p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="unsent" className="flex flex-col gap-4">
          {locationId ? (
            <KdsUnsentItems
              ref={unsentRef}
              locationId={locationId}
              orderId={highlightOrderId}
              onClearOrder={() => setParams({ order: null })}
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <PackageX className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Pick a merchant and location</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The unsent-items view shows every item still sitting in an
                order that never fired to the kitchen.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="device-truth" className="flex flex-col gap-4">
          <DeviceTruthBlindSpotNotice />
          {!locationId ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <Radio className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Pick a merchant and location</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The health cards cover every KDS display at the location; the
                timeline and divergence list are per display.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  What each tablet reported it received and painted, diffed
                  against what the server routed.
                </p>
                <Select
                  value={truthWindowKey}
                  onValueChange={(value) => {
                    setTruthWindowKey(value as TimelineWindowKey);
                    // Re-anchor the window to now so a wider/narrower
                    // selection shows the most recent data instead of
                    // re-windowing the old anchor.
                    setTruthWindowEndMs(Date.now());
                  }}
                  disabled={!displayId}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMELINE_WINDOWS.map((w) => (
                      <SelectItem key={w.key} value={w.key}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <KdsDisplayHealthCards
                rows={deviceHealth.data ?? []}
                selectedDisplayId={displayId}
                onSelectDisplay={(id) =>
                  setParams({ display: id === null ? null : id })
                }
                isLoading={deviceHealth.isLoading}
              />

              {displayId ? (
                <>
                  <div className="flex flex-col gap-2">
                    <h2 className="text-sm font-semibold">
                      Routed vs seen —{" "}
                      {(displays.data ?? []).find((d) => d.id === displayId)
                        ?.display_name ?? "this display"}
                    </h2>
                    <KdsDeviceTruthTimeline
                      window={deviceTruthWindow}
                      isLoading={deviceTruth.isLoading}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <h2 className="text-sm font-semibold">Divergences</h2>
                    <KdsDivergenceList
                      items={deviceTruthWindow?.items ?? []}
                      isLoading={deviceTruth.isLoading}
                    />
                  </div>

                  {deviceTruth.isError && (
                    <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                      Could not load the truth window:{" "}
                      {deviceTruth.error instanceof Error
                        ? deviceTruth.error.message
                        : "unknown error"}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Device events are reported on the POS heartbeat (60s) and
                    kept for 30 days. A device lane entry can lag the server
                    lane by up to one heartbeat.
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
                  <Eye className="mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Pick a KDS display</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The timeline and divergence list are per display — choose
                    one, or click a health card above.
                  </p>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
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
