"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
} from "@/components/dashboard/shell";
import {
  CardGridEmpty,
  LoadError,
} from "@/app/manage/transactions/components/ledger-primitives";
import {
  KdsMirrorControls,
  MirrorBlindSpotInfo,
  MirrorBlindSpotNotice,
  RealtimeStatus,
} from "./components/KdsMirrorControls";
import { KdsSendLedger, SendLedgerInfo } from "./components/KdsSendLedger";
import {
  KdsUnsentItems,
} from "./components/KdsUnsentItems";
import { KdsStationBoard } from "./components/KdsStationBoard";
import { KdsDisplayHealth } from "./components/KdsDisplayHealth";
import { KdsDeviceTruthTimeline } from "./components/KdsDeviceTruthTimeline";
import { KdsDivergenceList } from "./components/KdsDivergenceList";
import { KdsMirrorSkeleton } from "./components/KdsMirrorSkeleton";
import {
  KdsNotice,
  NoticeInfoButton,
  NoticeLead,
  WindowSelect,
} from "./components/kds-primitives";
import {
  TIMELINE_WINDOWS,
  type TimelineWindowKey,
} from "./components/timelineWindows";
import {
  useKdsDisplays,
  useKdsMirror,
  useKdsRoutingHealth,
  useSupportLocations,
} from "./hooks/useKdsMirror";
import { useKdsMirrorRealtime } from "./hooks/useKdsMirrorRealtime";
import {
  useKdsDeviceTruthHealth,
  useKdsDeviceTruthWindow,
} from "./hooks/useKdsDeviceTruth";

type KdsTab = "board" | "ledger" | "unsent" | "device-truth";

const TABS: { value: KdsTab; label: string }[] = [
  { value: "board", label: "Board" },
  { value: "ledger", label: "Send ledger" },
  { value: "unsent", label: "Unsent items" },
  { value: "device-truth", label: "Device truth" },
];

/**
 * The device-truth tab's own honesty notice: a display that has never reported
 * is not a broken display. NO_DEVICE_DATA is the answer until the POS emitter
 * ships to it, and the UI must keep saying that instead of implying a fault.
 */
const DEVICE_TRUTH_LEAD = "This is device-attested, reported on the heartbeat.";

/** The notice after its lead; each `<span>` is a paragraph in the phone drop-down. */
function DeviceTruthBody() {
  return (
    <>
      <span>
        It shows what each tablet says it received and painted, diffed against
        the server routing log.
      </span>{" "}
      <span>
        A display with no device data at all means the emitter has not shipped
        to it yet:{" "}
        <NoticeLead>
          absence of device evidence is not evidence of a fault.
        </NoticeLead>
      </span>
    </>
  );
}

function DeviceTruthBlindSpotNotice() {
  return (
    <KdsNotice icon={Eye} className="max-sm:hidden">
      <p>
        <NoticeLead>{DEVICE_TRUTH_LEAD}</NoticeLead> <DeviceTruthBody />
      </p>
    </KdsNotice>
  );
}

const TIMELINE_LEAD =
  "Device events are reported on the POS heartbeat (60s) and kept for 30 days.";
const TIMELINE_LAG =
  "A device lane entry can lag the server lane by up to one heartbeat.";

/** A section title with its phone ⓘ beside it (§13.4 "move, don't delete"). */
function TitleWithInfo({
  title,
  info,
}: {
  title: string;
  info: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {title}
      {info}
    </span>
  );
}

/** Every tab needs a merchant and a location first; each says why in words. */
function PickScope({ hint }: { hint: string }) {
  return <CardGridEmpty title="Pick a merchant and location" hint={hint} />;
}

function KdsMirrorPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const merchantId = searchParams.get("merchant");
  const locationId = searchParams.get("location");
  const displayParam = searchParams.get("display");
  const highlightOrderId = searchParams.get("order");

  // A deep link to a specific order opens on the send ledger (the order row is
  // the reason they came); a ?tab= param (e.g. the old /kds-truth redirect)
  // opens that tab; everything else opens on the board.
  const [activeTab, setActiveTab] = React.useState<KdsTab>(() => {
    const tab = searchParams.get("tab");
    if (tab === "ledger" || tab === "unsent" || tab === "device-truth") {
      return tab;
    }
    return highlightOrderId ? "ledger" : "board";
  });

  // Keep the active pill in view on a narrow rail (UI-DESIGN-SYSTEM §13.2):
  // scroll the rail itself, clamped, and re-measure once it has a width.
  const tabRailRef = React.useRef<HTMLDivElement>(null);
  const tabRailPositioned = React.useRef(false);
  React.useEffect(() => {
    const rail = tabRailRef.current;
    if (!rail) return;
    let done = false;
    const align = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      const tab = rail.querySelector<HTMLElement>('[data-state="active"]');
      if (done || !tab || max <= 0) return;
      const left = tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2;
      const smooth =
        tabRailPositioned.current &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches;
      rail.scrollTo({
        left: Math.max(0, Math.min(left, max)),
        behavior: smooth ? "smooth" : "auto",
      });
      tabRailPositioned.current = done = true;
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [activeTab]);

  // "all" and absent both mean location-wide; normalise to null.
  const displayId =
    displayParam && displayParam !== "all" ? displayParam : null;

  // Device-truth tab: its own window selector, anchored on mount / selection
  // only — the bounds are part of the truth-window query key, so deriving
  // them from Date.now() during render would refetch forever.
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
  const liveBoard = useKdsMirror(locationId, displayId, {
    pushLive: realtime.status === "live",
  });

  const selectedDisplay =
    (displays.data ?? []).find((d) => d.id === displayId) ?? null;

  // "Unknown is not zero" (§4.9): a query that failed before it ever returned
  // has no data to show, so its view says the load failed and nothing else.
  // A later refetch failure keeps the last good data on screen under the error.
  const boardFailed = liveBoard.isError && liveBoard.data === undefined;
  const truthFailed = deviceTruth.isError && deviceTruth.data === undefined;
  const healthFailed =
    deviceHealth.isError && deviceHealth.data === undefined;

  // The first failed scope query, said once under the pickers.
  const scopeError = locations.isError
    ? { title: "We couldn't load this merchant's locations", query: locations }
    : displays.isError
      ? { title: "We couldn't load this location's KDS displays", query: displays }
      : health.isError
        ? { title: "We couldn't load routing health", query: health }
        : null;

  return (
    <PageShell as="div">
      <PageHeader
        title="KDS"
        subtitle="Kitchen display support — server reconstruction, send history, and device-attested truth."
        actions={
          <>
            <RealtimeStatus
              status={realtime.status}
              isFetching={liveBoard.isFetching}
            />
          </>
        }
      />

      {/* No merchant-list gate: the picker searches on demand and labels its
          own selection, so the controls render immediately. */}
      <KdsMirrorControls
        locations={locations.data ?? []}
        displays={displays.data ?? []}
        merchantId={merchantId}
        locationId={locationId}
        displayId={displayId}
        onMerchantChange={(value) => {
          setParams({
            merchant: value,
            location: null,
            display: null,
            order: null,
          });
        }}
        onLocationChange={(value) => {
          setParams({ location: value, display: null, order: null });
        }}
        onDisplayChange={(value) => {
          setParams({ display: value === "all" ? null : value });
        }}
        health={health.data ?? null}
        locationsLoaded={locations.isSuccess}
        loadError={
          scopeError && (
            <LoadError
              title={scopeError.title}
              detail={
                scopeError.query.error instanceof Error
                  ? scopeError.query.error.message
                  : undefined
              }
              onRetry={() => void scopeError.query.refetch()}
            />
          )
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const next: KdsTab =
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
      >
        {/* Pill rail (§4.5). Classes are literal, not tokens (C7). */}
        <div
          ref={tabRailRef}
          className="no-scrollbar relative w-full min-w-0 overflow-x-auto pb-1"
        >
          <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="board" className="mt-4">
          <Panel>
            <PanelSection
              label={
                <TitleWithInfo
                  title="Station board"
                  info={<MirrorBlindSpotInfo />}
                />
              }
              caption={
                selectedDisplay
                  ? `What the server says ${selectedDisplay.display_name} should be displaying, in the order the tablet shows it.`
                  : "What the server says this location's displays should be showing."
              }
            >
              <div className="space-y-5">
                <MirrorBlindSpotNotice />

                {!locationId ? (
                  <PickScope hint="Then choose the KDS display the kitchen is complaining about." />
                ) : (
                  <>
                    {liveBoard.isError && (
                      <LoadError
                        title="We couldn't load the board"
                        detail={
                          liveBoard.error instanceof Error
                            ? liveBoard.error.message
                            : undefined
                        }
                        onRetry={() => void liveBoard.refetch()}
                      />
                    )}
                    {!boardFailed && (
                      <KdsStationBoard
                        tickets={liveBoard.data ?? []}
                        display={selectedDisplay}
                        isLoading={liveBoard.isLoading}
                        highlightOrderId={highlightOrderId}
                      />
                    )}
                  </>
                )}
              </div>
            </PanelSection>
          </Panel>
        </TabsContent>

        <TabsContent value="ledger" className="mt-4">
          <Panel>
            <PanelSection
              label={
                <TitleWithInfo title="Send ledger" info={<SendLedgerInfo />} />
              }
              caption="Every order-to-kitchen send attempt the server received from the POS at this location."
            >
              {locationId ? (
                <KdsSendLedger
                  locationId={locationId}
                  orderId={highlightOrderId}
                  onShowOnBoard={(orderId) => {
                    setParams({ order: orderId });
                    setActiveTab("board");
                  }}
                  onClearOrder={() => setParams({ order: null })}
                />
              ) : (
                <PickScope hint="The send ledger shows every order-to-kitchen send attempt received from the POS at a location." />
              )}
            </PanelSection>
          </Panel>
        </TabsContent>

        <TabsContent value="unsent" className="mt-4">
          <Panel>
            <PanelSection
              label="Unsent items"
              caption="Items still sitting in orders that never fired to the kitchen."
            >
              {locationId ? (
                <KdsUnsentItems
                  locationId={locationId}
                  orderId={highlightOrderId}
                  onClearOrder={() => setParams({ order: null })}
                />
              ) : (
                <PickScope hint="The unsent-items view shows every item still sitting in an order that never fired to the kitchen." />
              )}
            </PanelSection>
          </Panel>
        </TabsContent>

        <TabsContent value="device-truth" className="mt-4">
          <Panel>
            <PanelSection
              label={
                <TitleWithInfo
                  title="Display health"
                  info={
                    <NoticeInfoButton
                      title="About device truth"
                      description={DEVICE_TRUTH_LEAD}
                      size="inline"
                      className="sm:hidden"
                    >
                      <DeviceTruthBody />
                    </NoticeInfoButton>
                  }
                />
              }
              caption="Last 7 days, per display. Pick a display to open its timeline."
            >
              <div className="space-y-5">
                <DeviceTruthBlindSpotNotice />
                {!locationId ? (
                  <PickScope hint="Display health covers every KDS display at the location; the timeline and divergences are per display." />
                ) : (
                  <>
                    {deviceHealth.isError && (
                      <LoadError
                        title="We couldn't load display health"
                        detail={
                          deviceHealth.error instanceof Error
                            ? deviceHealth.error.message
                            : undefined
                        }
                        onRetry={() => void deviceHealth.refetch()}
                      />
                    )}
                    {!healthFailed && (
                      <KdsDisplayHealth
                        rows={deviceHealth.data ?? []}
                        selectedDisplayId={displayId}
                        onSelectDisplay={(id) =>
                          setParams({ display: id === null ? null : id })
                        }
                        isLoading={deviceHealth.isLoading}
                      />
                    )}
                  </>
                )}
              </div>
            </PanelSection>

            {locationId &&
              (displayId ? (
                <>
                  <PanelSection
                    // The display is named once: in the caption from `sm`,
                    // and by the display picker above on phones.
                    label={
                      <TitleWithInfo
                        title="Routed vs seen"
                        info={
                          <NoticeInfoButton
                            title="About the timeline"
                            description={TIMELINE_LEAD}
                            size="inline"
                            className="sm:hidden"
                          >
                            <span>{TIMELINE_LAG}</span>
                          </NoticeInfoButton>
                        }
                      />
                    }
                    caption={`${selectedDisplay?.display_name ?? "This display"}. ${TIMELINE_LEAD} ${TIMELINE_LAG}`}
                    action={
                      <WindowSelect
                        value={truthWindowKey}
                        onValueChange={(value) => {
                          setTruthWindowKey(value);
                          // Re-anchor the window to now so a wider/narrower
                          // selection shows the most recent data instead of
                          // re-windowing the old anchor.
                          setTruthWindowEndMs(Date.now());
                        }}
                        options={TIMELINE_WINDOWS}
                      />
                    }
                  >
                    <div className="space-y-5">
                      {deviceTruth.isError && (
                        <LoadError
                          title="We couldn't load the truth window"
                          detail={
                            deviceTruth.error instanceof Error
                              ? deviceTruth.error.message
                              : undefined
                          }
                          onRetry={() => void deviceTruth.refetch()}
                        />
                      )}
                      {!truthFailed && (
                        <KdsDeviceTruthTimeline
                          window={deviceTruthWindow}
                          isLoading={deviceTruth.isLoading}
                        />
                      )}
                    </div>
                  </PanelSection>

                  <PanelSection label="Divergences">
                    {truthFailed ? (
                      <p className="text-[0.8125rem] text-muted-foreground">
                        Divergences come from the same truth window, so they
                        will show once it loads.
                      </p>
                    ) : (
                      <KdsDivergenceList
                        items={deviceTruthWindow?.items ?? []}
                        isLoading={deviceTruth.isLoading}
                      />
                    )}
                  </PanelSection>
                </>
              ) : (
                <PanelSection label="Routed vs seen">
                  <CardGridEmpty
                    title="Pick a KDS display"
                    hint="The timeline and divergences are per display. Choose one above, or pick a row in Display health."
                  />
                </PanelSection>
              ))}
          </Panel>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

export default function KdsMirrorPage() {
  return (
    <React.Suspense fallback={<KdsMirrorSkeleton />}>
      <KdsMirrorPageInner />
    </React.Suspense>
  );
}
