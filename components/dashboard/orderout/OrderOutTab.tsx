"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import Image from "next/image";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Plug,
  Plus,
  UtensilsCrossed,
  ShoppingBag,
  RefreshCw,
  Package,
} from "lucide-react";
import {
  useOrderOutSyncedMenus,
  useRecentOrderOutOrders,
  useOnboardOrderOut,
} from "@/app/dashboard/online-ordering/hooks/useOrderOutStatus";
import { OrderOutOnboardingForm, type OnboardingFormData } from "./OrderOutOnboardingForm";
import type { OrderOutLocationStatus } from "@/app/dashboard/actions/orderout";
import {
  extractConnectedPlatforms,
  formatRelativeTime,
} from "@/lib/orderout/helpers";
import { PushChannelsRowAction } from "./PushChannelsRowAction";
import { PushChannelsCard } from "./PushChannelsCard";
import { PushChannelsHistoryCard } from "./PushChannelsHistoryCard";
import { ChannelSelfConfirmCard } from "./ChannelSelfConfirmCard";

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

const PLATFORM_LOGOS: Record<string, string> = {
  ubereats: "/uber-eats.png",
  doordash: "/doordash.png",
  grubhub: "/grubhub.png",
};

function PlatformLogo({ platform, className = "h-6 w-6" }: { platform: string; className?: string }) {
  const src = PLATFORM_LOGOS[platform.toLowerCase()];
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

function getSyncStatusBadge(status: string | null) {
  switch (status) {
    case "success":
      return <Badge variant="default" className="bg-green-600">In Sync</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "pending":
    case "syncing":
      return <Badge variant="secondary">Syncing...</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
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
  const { data: syncedMenusData } = useOrderOutSyncedMenus(clerkOrgId, locationId);
  const { data: recentOrdersData } = useRecentOrderOutOrders(clerkOrgId, locationId);
  console.log(orderOutStatus)
  const syncedMenus = syncedMenusData?.data || [];
  const recentOrders = recentOrdersData?.data || [];

  // Union: webhook-verified ∪ merchant self-confirmed.
  // This one derivation unlocks every downstream gate — Setup Progress, the
  // Connected Channels grid, PushChannelsRowAction, and PushChannelsCard all
  // receive the union and treat it as "connected".
  const verified = extractConnectedPlatforms(orderOutStatus?.data?.connectedChannels);
  const confirmed = (orderOutStatus?.data?.channelsConfirmedByMerchant ?? []).map(
    (c) => c.toUpperCase()
  );
  const channels = Array.from(new Set([...verified, ...confirmed]));

  const isOnboarded = !!orderOutStatus?.data?.hasRestaurant;
  console.log(isOnboarded)
  const dashboardUrl = orderOutStatus?.data?.dashboardUrl || "https://dashboard.orderout.co";

  // Determine setup progress
  const hasAccount = !!orderOutStatus?.data?.hasAccount;
  const hasRestaurant = !!orderOutStatus?.data?.hasRestaurant;
  const hasChannels = channels.length > 0;
  const hasSyncedMenus = syncedMenus.length > 0;
  const allSetupDone = hasAccount && hasRestaurant && hasChannels && hasSyncedMenus;

  // ── Not onboarded: show CTA or form ──
  if (!isOnboarded) {
    if (showOnboardingForm) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              Connect to OrderOut
            </CardTitle>
            <CardDescription>
              Fill in your restaurant details to get started with delivery platforms
            </CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardContent className="flex flex-col items-center py-12">
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
        </CardContent>
      </Card>
    );
  }

  // ── Onboarded: show full tab with 4 sections ──
  return (
    <div className="space-y-6">
      {/* A. Setup Progress */}
      {allSetupDone ? (
        <Card className="border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                All set! Your location is connected to delivery platforms.
              </span>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
                Open Dashboard
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Setup Progress</CardTitle>
            <CardDescription>Complete these steps to start receiving delivery orders</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Connected Channels</CardTitle>
              <CardDescription>Delivery platforms linked to this location</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
                Manage
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    isActive ? style.bg : "bg-muted/30"
                  }`}
                >
                  <PlatformLogo platform={platform} className={`h-6 w-6 ${!isActive ? "opacity-40 grayscale" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isActive ? "" : "text-muted-foreground"}`}>
                      {platform}
                    </p>
                  </div>
                  {isVerified ? (
                    <Badge variant="default" className="bg-green-600 text-xs">Connected</Badge>
                  ) : isSelfConfirmed ? (
                    <Badge
                      variant="outline"
                      className="text-xs border-amber-500 text-amber-700 dark:text-amber-400"
                    >
                      Self-confirmed
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not Connected</span>
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
                  className="flex items-center gap-3 rounded-lg border p-3 mt-3 bg-blue-50 dark:bg-blue-950/20"
                >
                  <Plug className="h-5 w-5 text-blue-600" />
                  <p className="text-sm font-medium flex-1">{channel}</p>
                  {isVerified ? (
                    <Badge variant="default" className="bg-green-600 text-xs">Connected</Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-xs border-amber-500 text-amber-700 dark:text-amber-400"
                    >
                      Self-confirmed
                    </Badge>
                  )}
                </div>
              );
            })}
        </CardContent>
      </Card>

      {/* C. Synced Menus */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Synced Menus
              </CardTitle>
              <CardDescription>Menus pushed to OrderOut for delivery platforms</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {syncedMenus.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <Package className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No menus synced yet. Go to a menu&apos;s OrderOut tab to push it.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Menu Name</TableHead>
                  <TableHead>OrderOut Menu ID</TableHead>
                  <TableHead>Last Synced</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncedMenus.map((menu) => (
                  <TableRow key={menu.menuId}>
                    <TableCell className="font-medium">{menu.menuName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {menu.ooMenuId}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {menu.lastPushedAt ? formatRelativeTime(menu.lastPushedAt) : "Never"}
                    </TableCell>
                    <TableCell className="text-right">{menu.itemsSynced}</TableCell>
                    <TableCell>{getSyncStatusBadge(menu.lastSyncStatus)}</TableCell>
                    <TableCell className="text-right">
                      <PushChannelsRowAction
                        clerkOrgId={clerkOrgId}
                        locationId={locationId}
                        menuId={menu.menuId}
                        menuName={menu.menuName}
                        ooMenuId={menu.ooMenuId}
                        connectedChannels={channels}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* C2. Push to Channels + History */}
      <PushChannelsCard
        clerkOrgId={clerkOrgId}
        locationId={locationId}
        syncedMenus={syncedMenus}
        connectedChannels={channels}
        isOnboarded={isOnboarded}
      />

      <PushChannelsHistoryCard clerkOrgId={clerkOrgId} locationId={locationId} />

      {/* D. Recent Orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Recent Delivery Orders
          </CardTitle>
          <CardDescription>Last 10 orders from delivery platforms</CardDescription>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No orders received yet from delivery platforms.
              </p>
            </div>
          ) : (
            <Table>
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
          )}
        </CardContent>
      </Card>
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
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
        <div>
          <span className={completed ? "text-foreground" : "text-muted-foreground"}>
            {label}
          </span>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actionUrl && !completed && (
        <Button variant="ghost" size="sm" asChild>
          <a href={actionUrl} target="_blank" rel="noopener noreferrer">
            {actionLabel || "Open"}
            <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        </Button>
      )}
    </div>
  );
}
