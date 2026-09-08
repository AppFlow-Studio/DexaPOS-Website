"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel, PanelSection, StatRow, StatTile } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Image from "next/image";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Plug,
  Plus,
  Star,
  UtensilsCrossed,
  ShoppingBag,
} from "lucide-react";
import {
  useRecentOrderOutOrders,
  useOnboardOrderOut,
  useOrderOutWebhookHealth,
  useLocationOnlineMenu,
  usePublishOnlineMenu,
  usePushMenuToChannels,
  usePushChannelsLiveStatus,
} from "@/app/dashboard/online-ordering/hooks/useOrderOutStatus";
import {
  useOrderOutMenuSync,
  useMenuPayloadDiff,
} from "@/app/dashboard/hooks/useOrderOutMenuSync";
import { OrderOutOnboardingForm, type OnboardingFormData } from "./OrderOutOnboardingForm";
import type {
  OrderOutLocationStatus,
  OrderOutWebhookHealth,
} from "@/app/dashboard/actions/orderout";
import {
  extractConnectedPlatforms,
  formatRelativeTime,
} from "@/lib/orderout/helpers";
import { getChannelLabel, getChannelLogo } from "@/lib/orderout/platform";
import { PushChannelsHistoryCard } from "./PushChannelsHistoryCard";
import { ChannelSelfConfirmCard } from "./ChannelSelfConfirmCard";
import { TestOrderCard } from "./TestOrderCard";
import { MenuChannelsCard } from "./MenuChannelsCard";
import {
  MenuSyncHistoryTable,
  MenuSyncPayloadPreview,
} from "./MenuSyncHistory";
import { OnlineMenuControlCard } from "@/components/dashboard/menu/menuId/MenuOrderOutTab";
import { OrderOutLiveMenuCheck } from "@/components/dashboard/menu/menuId/OrderOutLiveMenuCheck";
import {
  SyncStatusBadge,
  formatTimeAgo,
} from "@/components/dashboard/menu/menuId/OrderOutMenuStatus";

/** The location's designated online menu, as returned by useLocationOnlineMenu. */
type LocationOnlineMenu = {
  primaryMenuId: string | null;
  primaryMenuName: string | null;
  linkedMenuIds: string[];
};

// ============================================================================
// Types
// ============================================================================

interface OrderOutTabProps {
  clerkOrgId: string;
  locationId: string;
  orderOutStatus: OrderOutLocationStatus | null;
  showOnboardingForm: boolean;
  onShowOnboardingForm: (show: boolean) => void;
  onboardMutation: ReturnType<typeof useOnboardOrderOut>;
  merchantName: string;
  locationName: string;
  locationDefaults: Partial<OnboardingFormData>;
}

// ============================================================================
// Helpers
// ============================================================================

const KNOWN_PLATFORMS = ["UberEats", "DoorDash", "GrubHub"] as const;

// Compact status of the push_menu webhook: is OrderOut delivering results,
// when was the last one, and are any callbacks dead-lettering.
function WebhookHealthIndicator({ health }: { health: OrderOutWebhookHealth }) {
  const receiving = !!health.lastResultReceivedAt;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={`inline-block h-2 w-2 rounded-full ${
            receiving ? "bg-green-500" : "bg-yellow-400"
          }`}
        />
        <span className="text-muted-foreground">
          {receiving
            ? `Receiving results — last ${formatRelativeTime(
                health.lastResultReceivedAt as string
              )}`
            : "No results received yet"}
        </span>
      </span>
      {health.dlqCount > 0 && (
        <Badge variant="destructive" className="text-[10px]">
          {health.dlqCount} failed callback{health.dlqCount === 1 ? "" : "s"}
        </Badge>
      )}
    </div>
  );
}

// Logo comes from the single platform vocabulary (lib/orderout/platform.ts).
function PlatformLogo({ platform, className = "h-6 w-6" }: { platform: string; className?: string }) {
  const src = getChannelLogo(platform);
  if (!src) return <UtensilsCrossed className={`${className} text-muted-foreground`} />;
  return <Image src={src} alt={platform} width={24} height={24} className={`${className} object-contain`} />;
}

function getPlatformStyle(platform: string): { color: string; bg: string } {
  switch (platform.toLowerCase()) {
    case "ubereats":
      return { color: "text-green-700 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30" };
    case "doordash":
      return { color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" };
    case "grubhub":
      return { color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30" };
    default:
      return { color: "text-gray-700 dark:text-gray-400", bg: "bg-gray-100 dark:bg-gray-900/30" };
  }
}

function getAcceptStatusBadge(status: string) {
  switch (status) {
    case "accepted":
      return <Badge variant="default" className="bg-green-600">Accepted</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ============================================================================
// Component
// ============================================================================

export function OrderOutTab({
  clerkOrgId,
  locationId,
  orderOutStatus,
  showOnboardingForm,
  onShowOnboardingForm,
  onboardMutation,
  merchantName,
  locationName,
  locationDefaults,
}: OrderOutTabProps) {
  const { data: onlineMenu } = useLocationOnlineMenu(clerkOrgId, locationId);
  const { data: recentOrdersData } = useRecentOrderOutOrders(clerkOrgId, locationId);
  const { data: webhookHealthData } = useOrderOutWebhookHealth(clerkOrgId, locationId);
  const recentOrders = recentOrdersData?.data || [];
  const webhookHealth = webhookHealthData?.data ?? null;

  // Union: webhook-verified ∪ merchant self-confirmed.
  // This one derivation unlocks every downstream gate — Setup Progress and the
  // Connected Channels grid both receive the union and treat it as "connected".
  const verified = extractConnectedPlatforms(orderOutStatus?.connectedChannels);
  const confirmed = (orderOutStatus?.channelsConfirmedByMerchant ?? []).map(
    (c) => c.toUpperCase()
  );
  const channels = Array.from(new Set([...verified, ...confirmed]));

  const isOnboarded = !!orderOutStatus?.hasRestaurant;
  const dashboardUrl = orderOutStatus?.dashboardUrl || "https://dashboard.orderout.co";

  // Determine setup progress
  const hasAccount = !!orderOutStatus?.hasAccount;
  const hasRestaurant = !!orderOutStatus?.hasRestaurant;
  const hasChannels = channels.length > 0;
  // A linked menu IS a synced menu — the online-menu link is created on push.
  const hasSyncedMenus = (onlineMenu?.linkedMenuIds.length ?? 0) > 0;
  const allSetupDone = hasAccount && hasRestaurant && hasChannels && hasSyncedMenus;

  // ── Not onboarded: show CTA or form ──
  if (!isOnboarded) {
    if (showOnboardingForm) {
      return (
        <Panel>
          <PanelSection
            icon={Plug}
            label="Connect to OrderOut"
            caption="Fill in your restaurant details to get started with delivery platforms."
          >
            <OrderOutOnboardingForm
              defaultValues={{
                accountName: merchantName || "",
                restaurantName: locationName || "",
                ...locationDefaults,
              }}
              isSubmitting={onboardMutation.isPending}
              onSubmit={(data: OnboardingFormData) => {
                if (!clerkOrgId) return;
                onboardMutation.mutate(
                  {
                    clerkOrgId,
                    locationId,
                    accountName: data.accountName,
                    restaurantName: data.restaurantName,
                    streetAddress: data.streetAddress,
                    city: data.city,
                    state: data.state,
                    zipcode: data.zipcode,
                    country: data.country,
                    restaurantManagerEmail: data.restaurantManagerEmail,
                    restaurantManagerFirstname: data.restaurantManagerFirstname,
                    restaurantManagerLastname: data.restaurantManagerLastname,
                    restaurantManagerPhone: data.restaurantManagerPhone,
                  },
                  {
                    onSuccess: (result) => {
                      if (result.success) onShowOnboardingForm(false);
                    },
                  }
                );
              }}
              onCancel={() => onShowOnboardingForm(false)}
            />
          </PanelSection>
        </Panel>
      );
    }

    return (
      <Panel>
        <PanelSection
          icon={Plug}
          label="Delivery integrations"
          caption="Connect this location to Uber Eats, DoorDash, and Grubhub through OrderOut."
        >
        <div className="flex flex-col items-start py-2 sm:items-center sm:py-6 sm:text-center">
          <Plug className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Connect to Delivery Platforms</h3>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-md">
            Connect this location to delivery platforms like UberEats,
            DoorDash, and Grubhub through OrderOut. Manage all your delivery
            orders from one place.
          </p>
          <div className="flex items-center gap-2 mb-6">
            <Badge variant="outline">$79.99/mo</Badge>
          </div>
          <Button onClick={() => onShowOnboardingForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Connect to OrderOut
          </Button>
        </div>
        </PanelSection>
      </Panel>
    );
  }

  // ── Onboarded: show full tab with 4 sections ──
  return (
    <div className="space-y-6">
      {/* A. Setup Progress */}
      {allSetupDone ? (
        <Panel className="border-green-200 bg-green-50/40 dark:border-green-900 dark:bg-green-950/20">
          <PanelSection
            icon={CheckCircle2}
            label="Delivery channels connected"
            caption="This location is ready to receive orders from its connected platforms."
            action={
              <Button variant="outline" size="sm" asChild>
                <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
                  Open Dashboard
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </Button>
            }
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                All set! Your location is connected to delivery platforms.
              </span>
            </div>
          </PanelSection>
        </Panel>
      ) : (
        <Panel>
          <PanelSection
            icon={Plug}
            label="Setup progress"
            caption="Complete these steps to start receiving delivery orders."
          >
            <div className="space-y-4">
            <SetupStep completed={hasAccount} label="Account Created" />
            <SetupStep completed={hasRestaurant} label="Restaurant Created" />
            <SetupStep
              completed={hasChannels}
              label="Connect Delivery Platforms"
              actionLabel="Open Dashboard"
              actionUrl={dashboardUrl}
            />
            <SetupStep
              completed={hasSyncedMenus}
              label="Sync a Menu"
              description={!hasSyncedMenus ? "Go to a menu's OrderOut tab to push it" : undefined}
            />
            </div>
          </PanelSection>
        </Panel>
      )}

      {/* A2. Merchant self-confirmation (tick what you've connected in OrderOut) */}
      <ChannelSelfConfirmCard
        clerkOrgId={clerkOrgId}
        locationId={locationId}
        dashboardUrl={dashboardUrl}
        confirmedChannels={orderOutStatus?.channelsConfirmedByMerchant ?? []}
        verifiedChannels={verified}
        confirmedAt={orderOutStatus?.channelsConfirmedAt ?? null}
      />

      {/* B. Connected Channels */}
      <Panel>
        <PanelSection
          icon={Plug}
          label="Connected channels"
          caption="Delivery platforms linked to this location."
          action={
            <Button variant="outline" size="sm" asChild>
              <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
                Manage
                <ExternalLink className="ml-1 h-3 w-3" />
              </a>
            </Button>
          }
        >
          {isOnboarded && webhookHealth && (
            <WebhookHealthIndicator health={webhookHealth} />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {KNOWN_PLATFORMS.map((platform) => {
              const platformUpper = platform.toUpperCase();
              const isVerified = verified.some(
                (c) => c.toUpperCase() === platformUpper
              );
              const isSelfConfirmed =
                !isVerified &&
                confirmed.some((c) => c.toUpperCase() === platformUpper);
              const isActive = isVerified || isSelfConfirmed;
              const style = getPlatformStyle(platform);
              return (
                <div
                  key={platform}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl p-3 ${
                    isActive ? style.bg : "bg-muted/30"
                  }`}
                >
                  <PlatformLogo platform={platform} className={`h-6 w-6 shrink-0 ${!isActive ? "opacity-40 grayscale" : ""}`} />
                  <p className={`text-sm font-medium shrink-0 ${isActive ? "" : "text-muted-foreground"}`}>
                    {getChannelLabel(platform)}
                  </p>
                  {/* Spacer keeps status right-aligned, lets it wrap below on ≤320px. */}
                  <span className="flex-1" />
                  {isVerified ? (
                    <Badge variant="default" className="bg-green-600 text-xs shrink-0">Connected</Badge>
                  ) : isSelfConfirmed ? (
                    <Badge
                      variant="outline"
                      className="text-xs border-amber-500 text-amber-700 dark:text-amber-400 shrink-0"
                    >
                      Self-confirmed
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground shrink-0">Not Connected</span>
                  )}
                </div>
              );
            })}
          </div>
          {/* Show any extra connected channels not in KNOWN_PLATFORMS */}
          {channels
            .filter((c) => !KNOWN_PLATFORMS.some((p) => p.toUpperCase() === c.toUpperCase()))
            .map((channel) => {
              const isVerified = verified.some(
                (v) => v.toUpperCase() === channel.toUpperCase()
              );
              return (
                <div
                  key={channel}
                  className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-blue-50 p-3 dark:bg-blue-950/20"
                >
                  <Plug className="h-5 w-5 text-blue-600 shrink-0" />
                  <p className="text-sm font-medium shrink-0">{channel}</p>
                  <span className="flex-1" />
                  {isVerified ? (
                    <Badge variant="default" className="bg-green-600 text-xs shrink-0">Connected</Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-xs border-amber-500 text-amber-700 dark:text-amber-400 shrink-0"
                    >
                      Self-confirmed
                    </Badge>
                  )}
                </div>
              );
            })}
        </PanelSection>
      </Panel>

      {/* C. The single online menu — publish control + full insights, scoped to
          the ONE designated online menu. Replaces the old multi-menu synced-menus
          table + "Push All Menus" controls: OrderOut serves one menu per store. */}
      <OnlineMenuSection
        clerkOrgId={clerkOrgId}
        locationId={locationId}
        onlineMenu={onlineMenu ?? null}
      />

      {/* D. Recent Orders */}
      <Panel>
        <PanelSection
          icon={ShoppingBag}
          label="Recent delivery orders"
          caption="The last 10 orders received from delivery platforms."
        >
          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No orders received yet from delivery platforms.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order) => {
                  const style = getPlatformStyle(order.deliveryPlatform);
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">{order.ooOrderNumber}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${style.bg} ${style.color}`}>
                          <PlatformLogo platform={order.deliveryPlatform} className="h-4 w-4" />
                          {order.deliveryPlatform}
                        </span>
                      </TableCell>
                      <TableCell>{order.customerName || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {order.orderType === "DELIVERY" ? "Delivery" : "Pickup"}
                        </Badge>
                      </TableCell>
                      <TableCell>{getAcceptStatusBadge(order.acceptStatus)}</TableCell>
                      <TableCell className="text-right">
                        {order.platformTotal != null
                          ? `$${Number(order.platformTotal).toFixed(2)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelativeTime(order.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </PanelSection>
      </Panel>

      {/* E. DEV-only: synthetic OrderOut webhook tester */}
      {process.env.NODE_ENV === "development" && (
        <TestOrderCard locationId={locationId} hasRestaurant={hasRestaurant} />
      )}
    </div>
  );
}

// ============================================================================
// Setup Step (internal)
// ============================================================================

function SetupStep({
  completed,
  label,
  description,
  actionLabel,
  actionUrl,
}: {
  completed: boolean;
  label: string;
  description?: string;
  actionLabel?: string;
  actionUrl?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        {completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
        <div className="min-w-0">
          <span className={completed ? "text-foreground" : "text-muted-foreground"}>
            {label}
          </span>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actionUrl && !completed && (
        <Button variant="ghost" size="sm" asChild className="shrink-0">
          <a href={actionUrl} target="_blank" rel="noopener noreferrer">
            {actionLabel || "Open"}
            <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Online Menu Section (internal)
// ----------------------------------------------------------------------------
// The location tab's single, focused view of the ONE designated online menu.
// All insight surfaces (control card, verify-sync widget, channel push, sync
// stats/history, payload preview) are scoped to `primaryMenuId`, reusing the
// same components the per-menu editor tab renders. There is deliberately no
// menu picker or "push all menus" here — OrderOut serves one menu per store.
// ============================================================================

function OnlineMenuSection({
  clerkOrgId,
  locationId,
  onlineMenu,
}: {
  clerkOrgId: string;
  locationId: string;
  onlineMenu: LocationOnlineMenu | null;
}) {
  const primaryMenuId = onlineMenu?.primaryMenuId ?? null;
  const primaryMenuName = onlineMenu?.primaryMenuName ?? null;
  const linkedMenuIds = onlineMenu?.linkedMenuIds ?? [];

  const { data: syncResult, refetch } = useOrderOutMenuSync(
    clerkOrgId,
    locationId,
    primaryMenuId ?? undefined,
  );
  const { data: diffResult } = useMenuPayloadDiff(
    clerkOrgId,
    locationId,
    primaryMenuId ?? "",
  );
  const publishMutation = usePublishOnlineMenu(clerkOrgId);
  const pushChannelsMutation = usePushMenuToChannels(clerkOrgId);
  const [activeSyncId, setActiveSyncId] = useState<string | null>(null);
  const channelsLive = usePushChannelsLiveStatus(clerkOrgId, activeSyncId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const syncStatus = syncResult?.data ?? null;
  const lastSync = syncStatus?.lastSync;
  const ooMenuId = syncStatus?.ooMenuId ?? null;
  const syncHistory = syncStatus?.syncHistory ?? [];
  const platformStatuses = syncStatus?.platformStatuses ?? [];
  const connectedChannels = syncStatus?.connectedChannels ?? [];

  const diffData = diffResult?.data ?? null;
  const hasChanges = diffData?.hasChanges ?? false;
  const isNewMenu = diffData?.isNewMenu ?? false;
  const itemCount = diffData?.currentItemCount ?? lastSync?.itemsSynced ?? 0;

  const handlePushChannels = () => {
    if (!primaryMenuId) return;
    pushChannelsMutation.mutate(
      { clerkOrgId, menuId: primaryMenuId, locationId },
      {
        onSuccess: (res) => {
          if (res.success && res.data?.syncId) setActiveSyncId(res.data.syncId);
        },
      },
    );
  };

  // No designateMenuId: publishOnlineMenu always resolves to the location's ONE
  // online menu server-side, so a non-online menu can never be pushed here.
  const runPublish = () => {
    publishMutation.mutate({ locationId }, { onSuccess: () => refetch() });
    setConfirmOpen(false);
  };

  // No menu linked yet — publishing is a per-menu choice, so send them there.
  if (!primaryMenuId && linkedMenuIds.length === 0) {
    return (
      <Panel>
        <PanelSection
          icon={UtensilsCrossed}
          label="Online menu"
          caption="OrderOut serves one menu per store. Choose which menu handles online orders to manage it and see its insights here."
        >
          <div className="flex flex-col items-start gap-3 py-1">
            <p className="text-sm text-muted-foreground">
              No menu has been published to OrderOut yet. Open a menu&apos;s
              OrderOut tab to make it your online menu.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/menu">Go to Menus</Link>
            </Button>
          </div>
        </PanelSection>
      </Panel>
    );
  }

  // Menus are linked but none is flagged as THE online menu yet. One button
  // converges the state (the server flags the resolved menu primary) — no picker.
  if (!primaryMenuId) {
    return (
      <Panel className="border-0 bg-blue-50/60 dark:bg-blue-950/20">
        <PanelSection
          icon={Star}
          label="Choose your online menu"
          caption="OrderOut serves one menu per store. Publish now to lock in your online menu, then manage it and view insights here."
        >
          <Button onClick={runPublish} disabled={publishMutation.isPending}>
            {publishMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Star className="mr-2 h-4 w-4" />
            )}
            Publish my online menu
          </Button>
        </PanelSection>
      </Panel>
    );
  }

  // Happy path: the ONE online menu, with full insights.
  return (
    <div className="space-y-6">
      <OnlineMenuControlCard
        state="this"
        thisMenuName={primaryMenuName ?? "Your online menu"}
        onlineMenuHref={primaryMenuId ? `/dashboard/menu/${primaryMenuId}` : null}
        primaryMenuName={primaryMenuName}
        itemCount={itemCount}
        hasChanges={hasChanges}
        isNewMenu={isNewMenu}
        isPublishing={publishMutation.isPending}
        onPublish={() => setConfirmOpen(true)}
        onMakeOnline={() => setConfirmOpen(true)}
      />

      <OrderOutLiveMenuCheck clerkOrgId={clerkOrgId} locationId={locationId} />

      <MenuChannelsCard
        ooMenuId={ooMenuId}
        platformStatuses={platformStatuses}
        connectedChannels={connectedChannels}
        onPush={handlePushChannels}
        isPushing={pushChannelsMutation.isPending}
        live={channelsLive.data?.data ?? null}
      />

      <Panel>
        <PanelSection
          label={
            primaryMenuName
              ? `Sync status · ${primaryMenuName}`
              : "Sync status"
          }
          action={<SyncStatusBadge lastSync={lastSync ?? null} />}
        >
          <StatRow columns={3}>
            <StatTile
              label="Last Synced"
              value={
                lastSync?.completedAt
                  ? formatTimeAgo(lastSync.completedAt)
                  : "Never"
              }
            />
            <StatTile
              label="Items Synced"
              value={lastSync?.itemsSynced ?? 0}
              meta={
                (lastSync?.itemsFailed ?? 0) > 0 ? (
                  <span className="text-destructive">
                    {lastSync?.itemsFailed} failed
                  </span>
                ) : undefined
              }
            />
            <StatTile label="Total Syncs" value={syncStatus?.totalSyncs ?? 0} />
          </StatRow>

          <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">OrderOut Menu ID</span>
            {ooMenuId ? (
              <code className="rounded-full bg-muted/60 px-2.5 py-0.5 font-mono text-xs">
                {ooMenuId}
              </code>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </PanelSection>
      </Panel>

      <MenuSyncHistoryTable syncHistory={syncHistory} />

      <PushChannelsHistoryCard
        clerkOrgId={clerkOrgId}
        locationId={locationId}
        menuId={primaryMenuId}
      />

      <MenuSyncPayloadPreview
        syncHistory={syncHistory}
        menuName={primaryMenuName ?? "Online menu"}
      />

      {/* Publish confirmation — names the exact menu + item count so the
          merchant sees precisely what customers will get. */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => !open && setConfirmOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish your online menu?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Publishing your online menu:{" "}
                  <span className="font-semibold text-foreground">
                    {primaryMenuName ?? "your online menu"}
                  </span>{" "}
                  — <span className="font-semibold text-foreground">{itemCount} items</span>.
                </p>
                <p>
                  This is exactly what customers see on your online store and
                  connected delivery apps (Uber Eats, DoorDash, Grubhub).
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={publishMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={runPublish} disabled={publishMutation.isPending}>
              {publishMutation.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
