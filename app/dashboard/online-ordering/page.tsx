"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  useOnlineOrderingSettings,
  type OnlineOrderingSettings,
  type OnlineStoreSetupStatus,
} from "./hooks/useOnlineOrderingSettings";
import { useGatedLocationId, useGatedLocation } from "@/stores/location-store";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoIcon } from "@/components/ui/info-icon";
import { Loader2, Globe, Clock3, CheckCircle2, AlertTriangle, Ban, ExternalLink, Building2, Store, Palette, Truck, Plug, LayoutTemplate, Check, Bell } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { uploadStoreImage } from "@/lib/storage/actions";
import { useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { OrderOutTab } from "@/components/dashboard/orderout/OrderOutTab";
import { NotificationsTab } from "./components/NotificationsTab";
import { HoursConfigModal } from "./components/HoursConfigModal";
import { WeeklySchedule } from "./hooks/useOnlineOrderingSettings";
import { QrTableManager } from "./components/QrTableManager";
import { QrAnalyticsPanel } from "./components/QrAnalyticsPanel";
import { QrGuestAlertsPanel } from "./components/QrGuestAlertsPanel";
import { useOrderOutStatus, useOnboardOrderOut } from "./hooks/useOrderOutStatus";
import { FONT_GOOGLE_URLS } from "@/app/sites/lib/theme-utils";
import { buildStoreUrl } from "@/app/sites/lib/store-url";
import {
  LocationIndicator,
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
} from "@/components/dashboard/shell";
import {
  getOnlineStoreRequestRequirements,
  saveOnlineStoreRequestRequirements,
} from "./actions";

function SettingsToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 border-t border-border/60 py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="font-medium text-foreground">{title}</p>
        <InfoIcon tip={description} side="top" asButton />
      </div>
      <Switch
        className="mt-0.5 shrink-0"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

function getStatusTone(status: OnlineStoreSetupStatus) {
  switch (status) {
    case "pending_review":
      return "secondary";
    case "approved":
      return "outline";
    case "rejected":
      return "destructive";
    case "setup_completed":
      return "default";
    default:
      return "secondary";
  }
}

function getStatusLabel(status: OnlineStoreSetupStatus) {
  switch (status) {
    case "pending_review":
      return "Pending Review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "setup_completed":
      return "Setup Complete";
    default:
      return "Not Requested";
  }
}

function StatusCard({
  status,
  settings,
  locationName,
  onRequestSetup,
  isLoading,
}: {
  status: OnlineStoreSetupStatus;
  settings: OnlineOrderingSettings;
  locationName: string;
  onRequestSetup: () => Promise<void>;
  isLoading: boolean;
}) {
  if (status === "not_requested") {
    return (
      <Panel>
        <PanelSection
          icon={Globe}
          label="Request Online Store"
          caption="This branch does not manage storefront setup directly anymore. Send a request to HQ and they will review the branch packet before configuring the store."
        >
          <div className="space-y-5">
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            HQ will review the branch compliance and banking details first, then either approve setup, reject with a reason, or continue configuration.
            </p>
            <Button onClick={onRequestSetup} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
              Request Setup
            </Button>
          </div>
        </PanelSection>
      </Panel>
    );
  }

  if (status === "pending_review") {
    return (
      <Panel>
        <PanelSection
          icon={Clock3}
          label="Team Is Reviewing Your Request"
          caption={`HQ is reviewing the online-store request for ${locationName}. No additional branch-side setup is needed right now.`}
        >
          <div className="text-sm text-muted-foreground">
          {settings.setupRequestedAt ? (
            <p>Requested on {new Date(settings.setupRequestedAt).toLocaleString()}.</p>
          ) : (
            <p>The request is waiting for HQ review.</p>
          )}
          </div>
        </PanelSection>
      </Panel>
    );
  }

  if (status === "approved") {
    return (
      <Panel>
        <PanelSection
          icon={CheckCircle2}
          label="Request Approved"
          caption={`HQ approved the request for ${locationName}. Store setup is now in progress and branch-side controls will unlock after HQ finishes setup.`}
        >
          <div className="text-sm text-muted-foreground">
          {settings.setupApprovedAt ? (
            <p>Approved on {new Date(settings.setupApprovedAt).toLocaleString()}.</p>
          ) : (
            <p>Approved status is active.</p>
          )}
          </div>
        </PanelSection>
      </Panel>
    );
  }

  if (status === "rejected") {
    return (
      <Panel className="border-destructive/35">
        <PanelSection
          icon={Ban}
          label="Request Rejected"
          caption={`HQ rejected the online-store request for ${locationName}. Update the branch packet and submit the request again.`}
        >
          <div className="space-y-5">
            <div className="border-l-2 border-destructive/50 pl-4 text-sm">
            <p className="font-medium text-foreground">Reason</p>
            <p className="mt-1 text-muted-foreground">
              {settings.setupRejectionReason || "No rejection reason was recorded."}
            </p>
            </div>
            <Button variant="outline" onClick={onRequestSetup} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
              Resubmit Request
            </Button>
          </div>
        </PanelSection>
      </Panel>
    );
  }

  return null;
}

function CompletedSetupPanel({
  selectedLocationId,
  locationName,
  settings,
  merchantId,
  isSaving,
  isDirty,
  onDiscard,
  onSave,
  onUpdate,
}: {
  selectedLocationId: string;
  locationName: string;
  settings: OnlineOrderingSettings;
  merchantId: string;
  isSaving: boolean;
  isDirty: boolean;
  onDiscard: () => void;
  onSave: () => void;
  onUpdate: (updates: Partial<OnlineOrderingSettings>) => void;
}) {
  const storeUrl = buildStoreUrl({
    slug: settings.storeSlug,
    customDomain: settings.customDomain,
  });
  const qrGate = settings.qrBillingGate;
  const qrControlsLocked = isSaving || !qrGate.entitled;
  const qrEnableSwitchDisabled =
    isSaving || (!qrGate.entitled && !settings.acceptsDineIn);
  const { orgSlug } = useAuth();
  // Use the impersonation-aware org id, NOT Clerk's active org. During HQ
  // impersonation the Clerk active org is still the HQ org, so useAuth().orgId
  // would resolve the wrong (non-merchant) clerk_org_id — getOrderOutStatus
  // then returns "Merchant not found" and OrderOut falsely renders as "not
  // connected". useClerkOrgId() returns the impersonated merchant's org.
  const orgId = useClerkOrgId();
  const { data: orderOutStatusResult } = useOrderOutStatus(orgId || "", selectedLocationId);
  const onboardMutation = useOnboardOrderOut(orgId || "");
  const [showOrderOutForm, setShowOrderOutForm] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [hoursModalOpen, setHoursModalOpen] = useState(false);

  const locationDefaults = useMemo(() => {
    return {
      restaurantName: settings.storeName || locationName,
      address: settings.address || "",
      phone: settings.phone || "",
      email: settings.email || "",
    };
  }, [locationName, settings.address, settings.email, settings.phone, settings.storeName]);

  async function handleUpload(assetType: "logo" | "hero" | "favicon" | "og", file: File | null) {
    if (!file) return;
    setUploading((prev) => ({ ...prev, [assetType]: true }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadStoreImage(formData, {
        merchantId,
        locationId: selectedLocationId,
        assetType,
      });
      if (!result.success || !result.url) {
        toast.error(result.error || "Failed to upload image");
        return;
      }

      if (assetType === "logo") onUpdate({ logoUrl: result.url });
      if (assetType === "hero") onUpdate({ heroImageUrl: result.url });
      if (assetType === "favicon") onUpdate({ faviconUrl: result.url });
      if (assetType === "og") onUpdate({ ogImageUrl: result.url });
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploading((prev) => ({ ...prev, [assetType]: false }));
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Online Ordering"
        subtitle="Manage how customers discover, place, and receive orders from this location."
        indicator={
          <LocationIndicator isAllLocations={false} locationName={locationName} />
        }
        actions={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
          {settings.enabled && storeUrl ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={storeUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Preview Store
              </Link>
            </Button>
          ) : null}
          {isDirty ? (
            <>
              <Button variant="ghost" size="sm" onClick={onDiscard} disabled={isSaving}>
                Discard
              </Button>
              <Button size="sm" onClick={onSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Changes
              </Button>
            </>
          ) : null}
          </div>
        }
      />

      <Panel>
        <PanelSection
          icon={Store}
          label="Store status"
          caption="HQ has completed setup. Branch admins can maintain storefront operations while payment configuration remains protected."
          action={
            <div className="flex items-center gap-3">
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) => onUpdate({ enabled: checked })}
                disabled={isSaving}
                aria-label={settings.enabled ? "Disable online store" : "Enable online store"}
              />
              <Badge variant={settings.enabled ? "default" : "secondary"}>
                {settings.enabled ? "Live" : "Disabled"}
              </Badge>
            </div>
          }
        >
          <div className="grid gap-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{settings.storeName}</p>
              <p className="mt-1 break-all text-muted-foreground">
                {storeUrl || "No storefront URL configured"}
              </p>
            </div>
            {settings.setupCompletedAt ? (
              <p className="text-xs text-muted-foreground">
                Setup completed {new Date(settings.setupCompletedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        </PanelSection>
      </Panel>

      <Tabs defaultValue="store" className="space-y-6">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto w-max min-w-full justify-start gap-1 rounded-full border bg-card p-1 sm:min-w-0">
            <TabsTrigger value="store" className="gap-2 rounded-full px-4 data-[state=active]:bg-transparent data-[state=active]:text-[#0C4FD1] data-[state=active]:shadow-none dark:data-[state=active]:text-[#6CA0FF]">
              <Store className="h-4 w-4" />
              Store Info
            </TabsTrigger>
            <TabsTrigger value="branding" className="gap-2 rounded-full px-4 data-[state=active]:bg-transparent data-[state=active]:text-[#0C4FD1] data-[state=active]:shadow-none dark:data-[state=active]:text-[#6CA0FF]">
              <Palette className="h-4 w-4" />
              Branding
            </TabsTrigger>
            <TabsTrigger value="ordering" className="gap-2 rounded-full px-4 data-[state=active]:bg-transparent data-[state=active]:text-[#0C4FD1] data-[state=active]:shadow-none dark:data-[state=active]:text-[#6CA0FF]">
              <Truck className="h-4 w-4" />
              Ordering
            </TabsTrigger>
            <TabsTrigger value="orderout" className="gap-2 rounded-full px-4 data-[state=active]:bg-transparent data-[state=active]:text-[#0C4FD1] data-[state=active]:shadow-none dark:data-[state=active]:text-[#6CA0FF]">
              <Plug className="h-4 w-4" />
              OrderOut
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2 rounded-full px-4 data-[state=active]:bg-transparent data-[state=active]:text-[#0C4FD1] data-[state=active]:shadow-none dark:data-[state=active]:text-[#6CA0FF]">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="store" className="space-y-6">
          <Panel>
            <PanelSection
              icon={Globe}
              label="Store details"
              caption="Keep customer-facing contact information current. Payment credentials and tips are managed by HQ."
            >
              <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="merchant-online-store-name">Store Name</Label>
                <Input
                  id="merchant-online-store-name"
                  value={settings.storeName}
                  onChange={(event) => onUpdate({ storeName: event.target.value })}
                  placeholder="Store name shown on the storefront."
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="merchant-online-store-slug">Store URL</Label>
                  <InfoIcon
                    tip="Store URL changes are handled by HQ because they affect storefront payment configuration and reconciliation."
                    side="top"
                    asButton
                  />
                </div>
                <Input
                  id="merchant-online-store-slug"
                  value={storeUrl || ""}
                  readOnly
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="merchant-online-store-description">Store Description</Label>
                <Textarea
                  id="merchant-online-store-description"
                  value={settings.description}
                  onChange={(event) => onUpdate({ description: event.target.value })}
                  placeholder="Short description shown on your storefront."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="merchant-online-store-phone">Store Phone</Label>
                <Input
                  id="merchant-online-store-phone"
                  value={settings.phone}
                  onChange={(event) => onUpdate({ phone: event.target.value })}
                  placeholder="(555) 555-5555"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="merchant-online-store-email">Store Email</Label>
                <Input
                  id="merchant-online-store-email"
                  value={settings.email}
                  onChange={(event) => onUpdate({ email: event.target.value })}
                  placeholder="orders@merchant.com"
                />
              </div>
              <div className="border-l-2 border-[#0C4FD1]/30 pl-4 text-sm leading-6 text-muted-foreground md:col-span-2">
                Tips and payment credentials are restricted to HQ. If you need to change those values, contact HQ support.
              </div>
              </div>
            </PanelSection>
          </Panel>
        </TabsContent>

        <TabsContent value="branding" className="space-y-6">

          {/* Store Template */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle>Store Template</CardTitle>
                  <CardDescription>Choose the layout style for your online store</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {([
                  {
                    value: "classic",
                    label: "Classic",
                    description: "Traditional grid menu with hero banner and info strip",
                    preview: (
                      <svg viewBox="0 0 160 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                        {/* header bar */}
                        <rect width="160" height="12" fill="#F3F4F6"/>
                        <rect x="6" y="4" width="20" height="4" rx="2" fill="#D1D5DB"/>
                        <rect x="130" y="4" width="10" height="4" rx="2" fill="#0C4FD1" opacity="0.7"/>
                        <rect x="144" y="4" width="10" height="4" rx="2" fill="#0C4FD1" opacity="0.9"/>
                        {/* hero strip */}
                        <rect y="12" width="160" height="22" fill="#E0E7FF"/>
                        <rect x="20" y="19" width="40" height="4" rx="2" fill="#0C4FD1" opacity="0.6"/>
                        <rect x="20" y="25" width="60" height="3" rx="1.5" fill="#0C4FD1" opacity="0.3"/>
                        {/* info strip */}
                        <rect y="34" width="160" height="8" fill="#F9FAFB"/>
                        <rect x="6" y="36" width="30" height="2" rx="1" fill="#D1D5DB"/>
                        <rect x="50" y="36" width="20" height="2" rx="1" fill="#D1D5DB"/>
                        {/* item cards row 1 */}
                        <rect x="6" y="46" width="44" height="24" rx="3" fill="#F3F4F6"/>
                        <rect x="6" y="46" width="44" height="12" rx="3" fill="#E5E7EB"/>
                        <rect x="8" y="60" width="24" height="2.5" rx="1.2" fill="#6B7280"/>
                        <rect x="8" y="64" width="16" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="57" y="46" width="44" height="24" rx="3" fill="#F3F4F6"/>
                        <rect x="57" y="46" width="44" height="12" rx="3" fill="#E5E7EB"/>
                        <rect x="59" y="60" width="24" height="2.5" rx="1.2" fill="#6B7280"/>
                        <rect x="59" y="64" width="16" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="108" y="46" width="44" height="24" rx="3" fill="#F3F4F6"/>
                        <rect x="108" y="46" width="44" height="12" rx="3" fill="#E5E7EB"/>
                        <rect x="110" y="60" width="24" height="2.5" rx="1.2" fill="#6B7280"/>
                        <rect x="110" y="64" width="16" height="2" rx="1" fill="#9CA3AF"/>
                        {/* item cards row 2 */}
                        <rect x="6" y="74" width="44" height="20" rx="3" fill="#F3F4F6"/>
                        <rect x="6" y="74" width="44" height="10" rx="3" fill="#E5E7EB"/>
                        <rect x="57" y="74" width="44" height="20" rx="3" fill="#F3F4F6"/>
                        <rect x="57" y="74" width="44" height="10" rx="3" fill="#E5E7EB"/>
                        <rect x="108" y="74" width="44" height="20" rx="3" fill="#F3F4F6"/>
                        <rect x="108" y="74" width="44" height="10" rx="3" fill="#E5E7EB"/>
                      </svg>
                    ),
                  },
                  {
                    value: "hero",
                    label: "Hero",
                    description: "Large banner, sticky category tab bar, horizontal item cards",
                    preview: (
                      <svg viewBox="0 0 160 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                        {/* header */}
                        <rect width="160" height="10" fill="#F3F4F6"/>
                        <rect x="6" y="3" width="16" height="4" rx="2" fill="#D1D5DB"/>
                        <rect x="144" y="3" width="10" height="4" rx="2" fill="#0C4FD1" opacity="0.8"/>
                        {/* big hero banner */}
                        <rect y="10" width="160" height="32" fill="#0C4FD1" opacity="0.15"/>
                        <rect y="10" width="160" height="32" fill="url(#heroGrad)"/>
                        <rect x="10" y="24" width="50" height="5" rx="2.5" fill="white" opacity="0.9"/>
                        <rect x="10" y="31" width="35" height="3" rx="1.5" fill="white" opacity="0.6"/>
                        <defs>
                          <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0C4FD1" stopOpacity="0.7"/>
                            <stop offset="100%" stopColor="#0C4FD1" stopOpacity="0.4"/>
                          </linearGradient>
                        </defs>
                        {/* sticky category tab row */}
                        <rect y="42" width="160" height="10" fill="white"/>
                        <rect y="51" width="160" height="0.5" fill="#E5E7EB"/>
                        <rect x="6" y="44" width="22" height="4" rx="2" fill="#0C4FD1" opacity="0.9"/>
                        <rect x="6" y="49.5" width="22" height="1" rx="0.5" fill="#0C4FD1"/>
                        <rect x="32" y="44" width="18" height="4" rx="2" fill="#D1D5DB"/>
                        <rect x="54" y="44" width="18" height="4" rx="2" fill="#D1D5DB"/>
                        <rect x="76" y="44" width="18" height="4" rx="2" fill="#D1D5DB"/>
                        {/* horizontal cards */}
                        <rect x="6" y="55" width="69" height="18" rx="3" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="0.5"/>
                        <rect x="8" y="57" width="24" height="14" rx="2" fill="#E5E7EB"/>
                        <rect x="35" y="58" width="30" height="3" rx="1.5" fill="#374151"/>
                        <rect x="35" y="63" width="20" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="35" y="67" width="12" height="2.5" rx="1.2" fill="#0C4FD1" opacity="0.8"/>
                        <rect x="85" y="55" width="69" height="18" rx="3" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="0.5"/>
                        <rect x="87" y="57" width="24" height="14" rx="2" fill="#E5E7EB"/>
                        <rect x="114" y="58" width="30" height="3" rx="1.5" fill="#374151"/>
                        <rect x="114" y="63" width="20" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="114" y="67" width="12" height="2.5" rx="1.2" fill="#0C4FD1" opacity="0.8"/>
                        <rect x="6" y="77" width="69" height="18" rx="3" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="0.5"/>
                        <rect x="8" y="79" width="24" height="14" rx="2" fill="#E5E7EB"/>
                        <rect x="35" y="80" width="30" height="3" rx="1.5" fill="#374151"/>
                        <rect x="35" y="85" width="20" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="35" y="89" width="12" height="2.5" rx="1.2" fill="#0C4FD1" opacity="0.8"/>
                        <rect x="85" y="77" width="69" height="18" rx="3" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="0.5"/>
                        <rect x="87" y="79" width="24" height="14" rx="2" fill="#E5E7EB"/>
                        <rect x="114" y="80" width="30" height="3" rx="1.5" fill="#374151"/>
                        <rect x="114" y="85" width="20" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="114" y="89" width="12" height="2.5" rx="1.2" fill="#0C4FD1" opacity="0.8"/>
                      </svg>
                    ),
                  },
                  {
                    value: "market",
                    label: "Market",
                    description: "Left sidebar with filters and tags, sortable grid with list toggle",
                    preview: (
                      <svg viewBox="0 0 160 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                        {/* header */}
                        <rect width="160" height="10" fill="#F3F4F6"/>
                        <rect x="6" y="3" width="20" height="4" rx="2" fill="#D1D5DB"/>
                        <rect x="144" y="3" width="10" height="4" rx="2" fill="#0C4FD1" opacity="0.8"/>
                        {/* left sidebar */}
                        <rect x="0" y="10" width="38" height="90" fill="#FAFAFA"/>
                        <rect x="0" y="10" width="38" height="90" fill="none" stroke="#E5E7EB" strokeWidth="0.5"/>
                        {/* sidebar categories */}
                        <rect x="4" y="14" width="14" height="2.5" rx="1.2" fill="#374151"/>
                        <rect x="4" y="19" width="28" height="2" rx="1" fill="#E5E7EB"/>
                        <rect x="4" y="23" width="0.5" height="6" rx="0.25" fill="#0C4FD1"/>
                        <rect x="7" y="23" width="20" height="2" rx="1" fill="#0C4FD1" opacity="0.8"/>
                        <rect x="27" y="23" width="8" height="2" rx="1" fill="#0C4FD1" opacity="0.5"/>
                        <rect x="4" y="27" width="20" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="4" y="31" width="20" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="4" y="35" width="20" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="4" y="39" width="20" height="2" rx="1" fill="#9CA3AF"/>
                        {/* sidebar tags */}
                        <rect x="4" y="47" width="12" height="2.5" rx="1.2" fill="#374151"/>
                        <rect x="4" y="52" width="14" height="5" rx="2.5" fill="#0C4FD1" opacity="0.15"/>
                        <rect x="20" y="52" width="14" height="5" rx="2.5" fill="#F3F4F6"/>
                        <rect x="4" y="59" width="14" height="5" rx="2.5" fill="#F3F4F6"/>
                        <rect x="20" y="59" width="14" height="5" rx="2.5" fill="#F3F4F6"/>
                        {/* main area toolbar */}
                        <rect x="42" y="13" width="30" height="3.5" rx="1.75" fill="#D1D5DB"/>
                        <rect x="124" y="13" width="18" height="3.5" rx="1.75" fill="#E5E7EB"/>
                        <rect x="146" y="13" width="7" height="3.5" rx="1.75" fill="#E5E7EB"/>
                        <rect x="155" y="13" width="4" height="3.5" rx="1.75" fill="#E5E7EB"/>
                        {/* item cards 2x3 grid */}
                        <rect x="42" y="20" width="36" height="26" rx="3" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="0.5"/>
                        <rect x="42" y="20" width="36" height="14" rx="3" fill="#E5E7EB"/>
                        <rect x="44" y="36" width="22" height="2.5" rx="1.2" fill="#374151"/>
                        <rect x="44" y="40" width="14" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="44" y="43" width="10" height="2" rx="1" fill="#0C4FD1" opacity="0.7"/>
                        <rect x="81" y="20" width="36" height="26" rx="3" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="0.5"/>
                        <rect x="81" y="20" width="36" height="14" rx="3" fill="#E5E7EB"/>
                        <rect x="83" y="36" width="22" height="2.5" rx="1.2" fill="#374151"/>
                        <rect x="83" y="40" width="14" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="83" y="43" width="10" height="2" rx="1" fill="#0C4FD1" opacity="0.7"/>
                        <rect x="120" y="20" width="36" height="26" rx="3" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="0.5"/>
                        <rect x="120" y="20" width="36" height="14" rx="3" fill="#E5E7EB"/>
                        <rect x="122" y="36" width="22" height="2.5" rx="1.2" fill="#374151"/>
                        <rect x="122" y="40" width="14" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="122" y="43" width="10" height="2" rx="1" fill="#0C4FD1" opacity="0.7"/>
                        <rect x="42" y="50" width="36" height="26" rx="3" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="0.5"/>
                        <rect x="42" y="50" width="36" height="14" rx="3" fill="#E5E7EB"/>
                        <rect x="81" y="50" width="36" height="26" rx="3" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="0.5"/>
                        <rect x="81" y="50" width="36" height="14" rx="3" fill="#E5E7EB"/>
                        <rect x="120" y="50" width="36" height="26" rx="3" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="0.5"/>
                        <rect x="120" y="50" width="36" height="14" rx="3" fill="#E5E7EB"/>
                      </svg>
                    ),
                  },
                  {
                    value: "boutique",
                    label: "Boutique",
                    description: "Sticky editorial side-nav, full-width hero banner, image-forward cards",
                    preview: (
                      <svg viewBox="0 0 160 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                        {/* header */}
                        <rect width="160" height="10" fill="#F3F4F6"/>
                        <rect x="6" y="3" width="20" height="4" rx="2" fill="#D1D5DB"/>
                        <rect x="144" y="3" width="10" height="4" rx="2" fill="#0C4FD1" opacity="0.8"/>
                        {/* side nav */}
                        <rect x="0" y="10" width="42" height="90" fill="white"/>
                        <rect x="41.5" y="10" width="0.5" height="90" fill="#E5E7EB"/>
                        {/* brand in nav */}
                        <rect x="6" y="15" width="26" height="4" rx="2" fill="#0C4FD1" opacity="0.8"/>
                        <rect x="6" y="21" width="18" height="2" rx="1" fill="#D1D5DB"/>
                        <rect x="6" y="25" width="30" height="0.5" fill="#E5E7EB"/>
                        {/* menu label */}
                        <rect x="6" y="29" width="10" height="2" rx="1" fill="#D1D5DB"/>
                        {/* numbered nav items */}
                        <rect x="6" y="34" width="30" height="6" rx="3" fill="#EEF2FF"/>
                        <rect x="9" y="36" width="4" height="2" rx="1" fill="#0C4FD1" opacity="0.5"/>
                        <rect x="16" y="36" width="16" height="2" rx="1" fill="#0C4FD1"/>
                        <rect x="6" y="43" width="4" height="2" rx="1" fill="#D1D5DB"/>
                        <rect x="13" y="43" width="14" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="6" y="49" width="4" height="2" rx="1" fill="#D1D5DB"/>
                        <rect x="13" y="49" width="14" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="6" y="55" width="4" height="2" rx="1" fill="#D1D5DB"/>
                        <rect x="13" y="55" width="14" height="2" rx="1" fill="#9CA3AF"/>
                        {/* view cart button */}
                        <rect x="6" y="88" width="30" height="8" rx="4" fill="#0C4FD1" opacity="0.9"/>
                        <rect x="14" y="91" width="14" height="2" rx="1" fill="white" opacity="0.9"/>
                        {/* main area: hero banner */}
                        <rect x="42" y="10" width="118" height="36" fill="#0C4FD1" opacity="0.12"/>
                        <rect x="42" y="10" width="118" height="36" fill="url(#boutGrad)"/>
                        <rect x="62" y="21" width="78" height="5" rx="2.5" fill="white" opacity="0.9"/>
                        <rect x="72" y="29" width="58" height="3" rx="1.5" fill="white" opacity="0.6"/>
                        <defs>
                          <linearGradient id="boutGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0C4FD1" stopOpacity="0.55"/>
                            <stop offset="100%" stopColor="#0C4FD1" stopOpacity="0.3"/>
                          </linearGradient>
                        </defs>
                        {/* item cards 3-col */}
                        <rect x="44" y="50" width="36" height="30" rx="3" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="0.5"/>
                        <rect x="44" y="50" width="36" height="18" rx="3" fill="#E5E7EB"/>
                        <rect x="46" y="70" width="22" height="2.5" rx="1.2" fill="#374151"/>
                        <rect x="46" y="74" width="14" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="46" y="77" width="10" height="2" rx="1" fill="#0C4FD1" opacity="0.7"/>
                        <rect x="83" y="50" width="36" height="30" rx="3" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="0.5"/>
                        <rect x="83" y="50" width="36" height="18" rx="3" fill="#E5E7EB"/>
                        <rect x="85" y="70" width="22" height="2.5" rx="1.2" fill="#374151"/>
                        <rect x="85" y="74" width="14" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="85" y="77" width="10" height="2" rx="1" fill="#0C4FD1" opacity="0.7"/>
                        <rect x="122" y="50" width="36" height="30" rx="3" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="0.5"/>
                        <rect x="122" y="50" width="36" height="18" rx="3" fill="#E5E7EB"/>
                        <rect x="124" y="70" width="22" height="2.5" rx="1.2" fill="#374151"/>
                        <rect x="124" y="74" width="14" height="2" rx="1" fill="#9CA3AF"/>
                        <rect x="124" y="77" width="10" height="2" rx="1" fill="#0C4FD1" opacity="0.7"/>
                      </svg>
                    ),
                  },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onUpdate({ templateId: opt.value })}
                    className={cn(
                      "relative rounded-xl border-2 text-left transition-all hover:border-primary/50 overflow-hidden group",
                      settings.templateId === opt.value
                        ? "border-primary ring-1 ring-primary/20"
                        : "border-border bg-background"
                    )}
                  >
                    {/* thumbnail */}
                    <div
                      className={cn(
                        "w-full aspect-video flex items-center justify-center overflow-hidden transition-colors",
                        settings.templateId === opt.value ? "bg-primary/5" : "bg-muted/40 group-hover:bg-muted/60"
                      )}
                    >
                      <div className="w-full h-full">{opt.preview}</div>
                    </div>
                    {/* label row */}
                    <div className="px-3 py-2.5 relative">
                      {settings.templateId === opt.value && (
                        <div className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                      <p className="text-sm font-semibold pr-6">{opt.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Colors, Font & Images */}
          <Card>
            <CardHeader>
              <CardTitle>Branding</CardTitle>
              <CardDescription>Colors, fonts, and store images.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="merchant-online-store-font">Font</Label>
                    <InfoIcon
                      tip="Font options are sourced from the fonts supported by the storefront."
                      side="top"
                      asButton
                    />
                  </div>
                  <select
                    id="merchant-online-store-font"
                    value={settings.fontFamily || "DM Sans"}
                    onChange={(e) => onUpdate({ fontFamily: e.target.value })}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {Object.keys(FONT_GOOGLE_URLS).map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Primary Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={settings.primaryColor}
                      onChange={(e) => onUpdate({ primaryColor: e.target.value })}
                      className="h-10 w-14 rounded border"
                    />
                    <Input
                      value={settings.primaryColor}
                      onChange={(e) => onUpdate({ primaryColor: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Secondary Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={settings.secondaryColor}
                      onChange={(e) => onUpdate({ secondaryColor: e.target.value })}
                      className="h-10 w-14 rounded border"
                    />
                    <Input
                      value={settings.secondaryColor}
                      onChange={(e) => onUpdate({ secondaryColor: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Accent Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={settings.accentColor || settings.primaryColor}
                      onChange={(e) => onUpdate({ accentColor: e.target.value })}
                      className="h-10 w-14 rounded border"
                    />
                    <Input
                      value={settings.accentColor || ""}
                      onChange={(e) => onUpdate({ accentColor: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Background</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={settings.backgroundColor}
                      onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                      className="h-10 w-14 rounded border"
                    />
                    <Input
                      value={settings.backgroundColor}
                      onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Text</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={settings.textColor}
                      onChange={(e) => onUpdate({ textColor: e.target.value })}
                      className="h-10 w-14 rounded border"
                    />
                    <Input
                      value={settings.textColor}
                      onChange={(e) => onUpdate({ textColor: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Row 1: Logo, Favicon, OG Image — uniform 80×80 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(
                  [
                    { key: "logo",    label: "Logo",     url: settings.logoUrl,    assetType: "logo"    },
                    { key: "favicon", label: "Favicon",  url: settings.faviconUrl, assetType: "favicon" },
                    { key: "og",      label: "OG Image", url: settings.ogImageUrl, assetType: "og"      },
                  ] as const
                ).map(({ key, label, url, assetType }) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    {url ? (
                      <div className="flex h-20 w-full sm:w-20 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                        <img src={url} alt={`${label} preview`} className="h-full w-full object-contain" />
                      </div>
                    ) : (
                      <div className="flex h-20 w-full sm:w-20 items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">
                        None
                      </div>
                    )}
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleUpload(assetType, e.target.files?.[0] ?? null)}
                      disabled={Boolean(uploading[key])}
                      className="w-full"
                    />
                    {uploading[key] && <p className="text-xs text-muted-foreground">Uploading…</p>}
                  </div>
                ))}
              </div>

              {/* Row 2: Hero Image — full width, taller */}
              <div className="space-y-2">
                <Label>Hero Image</Label>
                {settings.heroImageUrl ? (
                  <div className="overflow-hidden rounded-lg border bg-muted">
                    <img src={settings.heroImageUrl} alt="Hero preview" className="h-48 w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-48 items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground">
                    No hero image
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload("hero", e.target.files?.[0] ?? null)}
                  disabled={Boolean(uploading.hero)}
                />
                {uploading.hero && <p className="text-xs text-muted-foreground">Uploading…</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordering" className="space-y-6">
          <Panel>
            <PanelSection
              icon={Truck}
              label="Ordering and fulfillment"
              caption="Manage fulfillment methods, operational thresholds, and QR table ordering."
            >
              <div className="space-y-6">
              <div>
                <SettingsToggleRow
                  title="Pickup"
                  description="Allow customers to place pickup orders."
                  checked={settings.pickupEnabled}
                  onCheckedChange={(checked) => onUpdate({ pickupEnabled: checked })}
                  disabled={isSaving}
                />
                <SettingsToggleRow
                  title="Delivery"
                  description="Allow customers to place delivery orders."
                  checked={settings.deliveryEnabled}
                  onCheckedChange={(checked) => onUpdate({ deliveryEnabled: checked })}
                  disabled={isSaving}
                />
              </div>

              <SettingsToggleRow
                title="Separate online and delivery pricing"
                description="Use each item's delivery price online instead of the regular menu price."
                checked={settings.deliveryPricingEnabled !== false}
                onCheckedChange={(checked) => onUpdate({ deliveryPricingEnabled: checked })}
                disabled={isSaving}
              />

              <SettingsToggleRow
                title="Auto-accept orders"
                description="Send incoming online orders directly to the kitchen. When off, the POS must accept each order first."
                checked={settings.autoAcceptOrders}
                onCheckedChange={(checked) => onUpdate({ autoAcceptOrders: checked })}
                disabled={isSaving}
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Prep Time (minutes)</Label>
                  <Input
                    type="number"
                    value={settings.preparationLeadTime}
                    min={0}
                    onChange={(e) => onUpdate({ preparationLeadTime: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Min Order ($)</Label>
                  <Input
                    type="number"
                    value={settings.minimumOrderAmount}
                    min={0}
                    step="0.01"
                    onChange={(e) => onUpdate({ minimumOrderAmount: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Future Days</Label>
                  <Input
                    type="number"
                    value={settings.futureOrderMaxDays}
                    min={0}
                    onChange={(e) => onUpdate({ futureOrderMaxDays: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Delivery Fee ($)</Label>
                  <Input
                    type="number"
                    value={settings.baseDeliveryFee}
                    min={0}
                    step="0.01"
                    onChange={(e) => onUpdate({ baseDeliveryFee: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Free Delivery Threshold ($)</Label>
                  <Input
                    type="number"
                    value={settings.freeDeliveryThreshold}
                    min={0}
                    step="0.01"
                    onChange={(e) => onUpdate({ freeDeliveryThreshold: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Delivery Radius (miles)</Label>
                  <Input
                    type="number"
                    value={settings.deliveryRadiusMiles ?? ""}
                    min={0}
                    step="0.1"
                    onChange={(e) =>
                      onUpdate({
                        deliveryRadiusMiles: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div className="border-t border-border/60 pt-6">
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">QR Table Ordering</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Scan-to-order settings for dine-in QR. These controls stay on the existing online-ordering surface; QR codes, analytics, and deeper billing gates remain separate work.
                    </p>
                  </div>

                  {!qrGate.entitled ? (
                    <div className="border-l-2 border-amber-500 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                      <p className="font-medium">QR Table Ordering is locked for this branch</p>
                      <p className="mt-1">
                        {qrGate.reason ??
                          "QR Table Ordering requires an eligible merchant tier or an HQ override."}
                      </p>
                    </div>
                  ) : qrGate.hasServiceOverride ? (
                    <div className="border-l-2 border-[#0C4FD1]/40 pl-4 text-sm leading-6 text-muted-foreground">
                      HQ override is active for this location through the QR Table Ordering service assignment.
                    </div>
                  ) : null}

                  <div>
                    <SettingsToggleRow
                      title="Enable QR table ordering"
                      description="Allow guests to scan a table QR and place pay-before-kitchen dine-in orders."
                      checked={settings.acceptsDineIn}
                      onCheckedChange={(checked) => onUpdate({ acceptsDineIn: checked })}
                      disabled={qrEnableSwitchDisabled}
                    />
                    <SettingsToggleRow
                      title="QR kill switch"
                      description="Stop new QR scans immediately without disabling the rest of online ordering."
                      checked={settings.qrKillSwitch}
                      onCheckedChange={(checked) => onUpdate({ qrKillSwitch: checked })}
                      disabled={qrControlsLocked}
                    />
                    <SettingsToggleRow
                      title="Geofence check"
                      description="Reserve on-premise location validation for QR scans when tighter verification is needed."
                      checked={settings.qrGeofenceEnabled}
                      onCheckedChange={(checked) => onUpdate({ qrGeofenceEnabled: checked })}
                      disabled={qrControlsLocked}
                    />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Fulfillment Mode</Label>
                      <Select
                        value={settings.qrFulfillmentMode}
                        onValueChange={(value) =>
                          onUpdate({
                            qrFulfillmentMode: value === "counter" ? "counter" : "runner",
                          })
                        }
                        disabled={qrControlsLocked}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="runner">Runner delivery</SelectItem>
                          <SelectItem value="counter">Counter pickup</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>QR Service Fee (%)</Label>
                      <Input
                        type="number"
                        value={settings.qrServiceFeePct}
                        min={0}
                        step="0.01"
                        onChange={(e) => onUpdate({ qrServiceFeePct: Number(e.target.value) })}
                        disabled={qrControlsLocked}
                      />
                    </div>

                  </div>

                  <p className="text-xs text-muted-foreground">
                    Required tier: <span className="font-medium text-foreground">{qrGate.requiredPlanName ?? qrGate.requiredPlanCode ?? "Not configured"}</span>
                    {qrGate.currentPlanName ? (
                      <>
                        {" "}· Current tier: <span className="font-medium text-foreground">{qrGate.currentPlanName}</span>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>

              </div>
            </PanelSection>
          </Panel>

              <QrTableManager
                locationId={selectedLocationId}
                locationName={locationName}
                storefrontEnabled={settings.enabled}
                acceptsDineIn={settings.acceptsDineIn}
                qrKillSwitch={settings.qrKillSwitch}
                qrEntitled={qrGate.entitled}
                qrGateMessage={qrGate.reason}
              />

              <QrAnalyticsPanel
                locationId={selectedLocationId}
                qrEnabled={settings.acceptsDineIn}
              />

              <QrGuestAlertsPanel locationId={selectedLocationId} />

          <Panel>
            <PanelSection
              icon={Clock3}
              label="Store hours"
              caption="Set the days and times this location accepts online orders."
              action={
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => setHoursModalOpen(true)}
                >
                  <Clock3 className="h-4 w-4" />
                  Edit Operating Hours
                </Button>
              }
            />
          </Panel>

          <HoursConfigModal
            open={hoursModalOpen}
            onOpenChange={setHoursModalOpen}
            title="Operating Hours"
            description="Set the days and times your store accepts online orders."
            schedule={settings.operatingHours}
            onSave={(schedule: WeeklySchedule) => {
              onUpdate({ operatingHours: schedule });
              setHoursModalOpen(false);
            }}
          />
        </TabsContent>

        <TabsContent value="orderout" className="space-y-6">
          <div>
              {!orgId ? (
                <Panel>
                  <PanelSection
                    icon={Plug}
                    label="OrderOut"
                    caption="Connect delivery channels such as Uber Eats, DoorDash, and Grubhub for this location."
                  >
                    <p className="text-sm text-muted-foreground">Missing Clerk organization context.</p>
                  </PanelSection>
                </Panel>
              ) : (
                <OrderOutTab
                  clerkOrgId={orgId}
                  locationId={selectedLocationId}
                  orderOutStatus={(orderOutStatusResult as any)?.data ?? null}
                  showOnboardingForm={showOrderOutForm}
                  onShowOnboardingForm={setShowOrderOutForm}
                  onboardMutation={onboardMutation}
                  merchantName={orgSlug || "Merchant"}
                  locationName={locationName}
                  locationDefaults={locationDefaults as any}
                />
              )}
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <NotificationsTab
            settings={settings}
            onUpdate={onUpdate}
            locationId={selectedLocationId}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

export default function OnlineOrderingPage() {
  const {
    settings,
    updateSettings,
    saveSettings,
    discardChanges,
    requestSetup,
    isDirty,
    isSaving,
    loadSettings,
    isLoading,
  } = useOnlineOrderingSettings();
  // Resolve to the gated location so single-location accounts (locked to 'all')
  // skip the "Select a Location" prompt. Multi-location on 'all' -> "all"/null.
  const gatedLocationId = useGatedLocationId();
  const selectedLocationId = gatedLocationId ?? "all";
  const selectedLocation = useGatedLocation();
  const isAllLocations = !gatedLocationId;

  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [requirementsMissing, setRequirementsMissing] = useState<Record<string, boolean> | null>(null);
  const [requirementsDraft, setRequirementsDraft] = useState<Record<string, string>>({});
  const [w9File, setW9File] = useState<File | null>(null);
  const [ownerGovIdFile, setOwnerGovIdFile] = useState<File | null>(null);
  const [bankSupportFile, setBankSupportFile] = useState<File | null>(null);
  const [requirementsSaving, setRequirementsSaving] = useState(false);

  useEffect(() => {
    if (selectedLocationId && selectedLocationId !== "all") {
      loadSettings(selectedLocationId);
    }
  }, [selectedLocationId, loadSettings]);

  if (isAllLocations) {
    return (
      <PageShell>
        <PageHeader
          title="Online Ordering"
          subtitle="Manage storefront setup, fulfillment, integrations, and customer notifications."
          indicator={<LocationIndicator isAllLocations locationName={null} />}
        />
        <Panel>
          <PanelSection
            icon={Building2}
            label="Select a specific location"
            caption="Online-store requests and settings are managed per location. Choose a branch from the location selector first."
          />
        </Panel>
      </PageShell>
    );
  }

  if (!selectedLocationId || !selectedLocation) {
    return (
      <PageShell>
        <PageHeader title="Online Ordering" />
        <Panel>
          <PanelSection
            icon={Building2}
            label="Location unavailable"
            caption="Select a location to manage online ordering."
          />
        </Panel>
      </PageShell>
    );
  }

  const currentSettings = settings.find((entry) => entry.locationId === selectedLocationId);

  if (isLoading && !currentSettings) {
    return (
      <PageShell>
        <PageHeader
          title="Online Ordering"
          indicator={<LocationIndicator isAllLocations={false} locationName={selectedLocation.name} />}
        />
        <Panel className="flex h-56 items-center justify-center" aria-label="Loading online ordering settings">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </Panel>
      </PageShell>
    );
  }

  if (!currentSettings) {
    return (
      <PageShell>
        <PageHeader
          title="Online Ordering"
          indicator={<LocationIndicator isAllLocations={false} locationName={selectedLocation.name} />}
        />
        <Panel>
          <PanelSection
            icon={AlertTriangle}
            label="Settings unavailable"
            caption="Failed to load online-store settings for this branch."
          />
        </Panel>
      </PageShell>
    );
  }

  const status = currentSettings.setupRequestStatus;

  async function openRequirements(locationId: string) {
    const req = await getOnlineStoreRequestRequirements(locationId);
    if (!req.success) {
      toast.error(req.error || "Failed to load required fields");
      return;
    }
    setRequirementsMissing(req.missing);
    setRequirementsDraft((req.values as any) || {});
    setW9File(null);
    setOwnerGovIdFile(null);
    setBankSupportFile(null);
    setRequirementsOpen(true);
  }

  async function handleRequestSetup(locationId: string) {
    const result = await requestSetup(locationId);
    if ((result as any)?.success) return;

    const missing = (result as any)?.missing as Record<string, boolean> | undefined;
    if (missing && Object.values(missing).some(Boolean)) {
      await openRequirements(locationId);
      return;
    }

    toast.error((result as any)?.error || "Failed to request setup");
  }

  async function handleSaveRequirements(locationId: string) {
    setRequirementsSaving(true);
    try {
      const formData = new FormData();
      formData.set("locationId", locationId);

      const textKeys = [
        "legalBusinessName",
        "dbaName",
        "einTaxId",
        "ownerFirstName",
        "ownerLastName",
        "ownerDob",
        "ownerSsn",
        "bankName",
        "accountHolderName",
        "ddaAccountNumber",
        "routingNumber",
      ] as const;

      for (const key of textKeys) {
        const val = requirementsDraft[key] ?? "";
        if (val.trim().length > 0) formData.set(key, val);
      }

      if (w9File) formData.set("w9FormFile", w9File);
      if (ownerGovIdFile) formData.set("ownerGovernmentIdFile", ownerGovIdFile);
      if (bankSupportFile) formData.set("bankSupportDocumentFile", bankSupportFile);

      const saveResult = await saveOnlineStoreRequestRequirements(formData);
      if (!saveResult.success) {
        toast.error(saveResult.error || "Failed to save required information");
        return;
      }

      const req = await getOnlineStoreRequestRequirements(locationId);
      if (!req.success) {
        toast.error(req.error || "Failed to refresh requirements");
        return;
      }

      if (req.complete) {
        setRequirementsOpen(false);
        setRequirementsMissing(null);
        toast.success("Information saved. Submitting request...");
        await handleRequestSetup(locationId);
      } else {
        setRequirementsMissing(req.missing);
        setRequirementsDraft((req.values as any) || {});
        toast.error("Some required fields are still missing.");
      }
    } finally {
      setRequirementsSaving(false);
    }
  }

  if (status !== "setup_completed") {
    return (
      <PageShell>
        <PageHeader
          title="Online Ordering"
          subtitle="Request and track storefront setup for this location."
          indicator={
            <div className="flex flex-wrap items-center gap-2">
              <LocationIndicator isAllLocations={false} locationName={selectedLocation.name} />
              <Badge variant={getStatusTone(status)}>{getStatusLabel(status)}</Badge>
            </div>
          }
        />
        <StatusCard
          status={status}
          settings={currentSettings}
          locationName={selectedLocation.name}
          onRequestSetup={() => handleRequestSetup(selectedLocationId)}
          isLoading={isSaving || requirementsSaving}
        />

        <Dialog open={requirementsOpen} onOpenChange={setRequirementsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Complete Required Info</DialogTitle>
              <DialogDescription>
                HQ requires these details before they can approve online-store setup. Only missing fields are shown.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              {requirementsMissing?.legalBusinessName ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Legal Business Name</Label>
                  <Input
                    value={requirementsDraft.legalBusinessName || ""}
                    onChange={(e) =>
                      setRequirementsDraft((prev) => ({ ...prev, legalBusinessName: e.target.value }))
                    }
                    placeholder="Legal business name"
                  />
                </div>
              ) : null}

              {requirementsMissing?.dbaName ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label>DBA Name</Label>
                  <Input
                    value={requirementsDraft.dbaName || ""}
                    onChange={(e) =>
                      setRequirementsDraft((prev) => ({ ...prev, dbaName: e.target.value }))
                    }
                    placeholder="Doing business as"
                  />
                </div>
              ) : null}

              {requirementsMissing?.einTaxId ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label>EIN / Tax ID</Label>
                  <Input
                    value={requirementsDraft.einTaxId || ""}
                    onChange={(e) =>
                      setRequirementsDraft((prev) => ({ ...prev, einTaxId: e.target.value }))
                    }
                    placeholder="9 digits"
                  />
                </div>
              ) : null}

              {requirementsMissing?.w9Form ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Signed W-9 (PDF only)</Label>
                  <Input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setW9File(e.target.files?.[0] ?? null)}
                  />
                </div>
              ) : null}

              {requirementsMissing?.ownerFirstName ? (
                <div className="space-y-2">
                  <Label>Owner First Name</Label>
                  <Input
                    value={requirementsDraft.ownerFirstName || ""}
                    onChange={(e) =>
                      setRequirementsDraft((prev) => ({ ...prev, ownerFirstName: e.target.value }))
                    }
                  />
                </div>
              ) : null}

              {requirementsMissing?.ownerLastName ? (
                <div className="space-y-2">
                  <Label>Owner Last Name</Label>
                  <Input
                    value={requirementsDraft.ownerLastName || ""}
                    onChange={(e) =>
                      setRequirementsDraft((prev) => ({ ...prev, ownerLastName: e.target.value }))
                    }
                  />
                </div>
              ) : null}

              {requirementsMissing?.ownerDob ? (
                <div className="space-y-2">
                  <Label>Owner DOB</Label>
                  <Input
                    type="date"
                    value={requirementsDraft.ownerDob || ""}
                    onChange={(e) =>
                      setRequirementsDraft((prev) => ({ ...prev, ownerDob: e.target.value }))
                    }
                  />
                </div>
              ) : null}

              {requirementsMissing?.ownerSsn ? (
                <div className="space-y-2">
                  <Label>Owner SSN</Label>
                  <Input
                    value={requirementsDraft.ownerSsn || ""}
                    onChange={(e) =>
                      setRequirementsDraft((prev) => ({ ...prev, ownerSsn: e.target.value }))
                    }
                    placeholder="9 digits"
                  />
                </div>
              ) : null}

              {requirementsMissing?.ownerGovernmentId ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Owner Government ID (PDF/PNG/JPG/WebP)</Label>
                  <Input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => setOwnerGovIdFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              ) : null}

              {requirementsMissing?.bankName ? (
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input
                    value={requirementsDraft.bankName || ""}
                    onChange={(e) =>
                      setRequirementsDraft((prev) => ({ ...prev, bankName: e.target.value }))
                    }
                  />
                </div>
              ) : null}

              {requirementsMissing?.accountHolderName ? (
                <div className="space-y-2">
                  <Label>Account Holder Name</Label>
                  <Input
                    value={requirementsDraft.accountHolderName || ""}
                    onChange={(e) =>
                      setRequirementsDraft((prev) => ({ ...prev, accountHolderName: e.target.value }))
                    }
                  />
                </div>
              ) : null}

              {requirementsMissing?.ddaAccountNumber ? (
                <div className="space-y-2">
                  <Label>DDA Account Number</Label>
                  <Input
                    value={requirementsDraft.ddaAccountNumber || ""}
                    onChange={(e) =>
                      setRequirementsDraft((prev) => ({ ...prev, ddaAccountNumber: e.target.value }))
                    }
                  />
                </div>
              ) : null}

              {requirementsMissing?.routingNumber ? (
                <div className="space-y-2">
                  <Label>Routing Number</Label>
                  <Input
                    value={requirementsDraft.routingNumber || ""}
                    onChange={(e) =>
                      setRequirementsDraft((prev) => ({ ...prev, routingNumber: e.target.value }))
                    }
                  />
                </div>
              ) : null}

              {requirementsMissing?.bankSupportDocument ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Bank Letter / Voided Check (PDF/PNG/JPG/WebP)</Label>
                  <Input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => setBankSupportFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRequirementsOpen(false)}
                disabled={requirementsSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleSaveRequirements(selectedLocationId)}
                disabled={requirementsSaving}
              >
                {requirementsSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save & Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    );
  }

  return (
    <CompletedSetupPanel
      selectedLocationId={selectedLocationId}
      locationName={selectedLocation.name}
      settings={currentSettings}
      merchantId={selectedLocation.merchant_id}
      isSaving={isSaving}
      isDirty={isDirty(selectedLocationId)}
      onDiscard={() => discardChanges(selectedLocationId)}
      onSave={() => saveSettings(selectedLocationId)}
      onUpdate={(updates) => updateSettings(selectedLocationId, updates)}
    />
  );
}
