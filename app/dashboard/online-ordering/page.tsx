"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  useOnlineOrderingSettings,
  OnlineOrderingSettings,
  formatTimeDisplay,
  dayOrder,
  getDayLabel,
} from "./hooks/useOnlineOrderingSettings";
import { HoursConfigModal } from "./components/HoursConfigModal";
import { uploadStoreImage, deleteStoreImage } from "@/lib/storage/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  Store,
  Clock,
  Palette,
  Truck,
  CreditCard,
  Phone,
  Mail,
  Upload,
  Image,
  Trash2,
  ExternalLink,
  DollarSign,
  Percent,
  Plus,
  Edit,
  Check,
  X,
  Building2,
  Loader2,
  Plug,
  Search,
  BarChart3,
  MapPin,
  Type,
  Layout,
  PanelTop,
  Grid3X3,
  LayoutList,
  ImageOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLocationStore, useSelectedLocation } from "@/stores/location-store";
import {
  useOrderOutStatus,
  useOnboardOrderOut,
} from "./hooks/useOrderOutStatus";
import { OrderOutTab } from "@/components/dashboard/orderout/OrderOutTab";
import { TestOrderCard } from "@/components/dashboard/orderout/TestOrderCard";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";

function getStoreUrl(slug: string): string {
  if (!slug) return "";
  const isDev = ROOT_DOMAIN.includes("localhost");
  if (isDev) return `http://${slug}.localhost:3000`;
  return `https://${slug}.dexaposai.com`;
}

const FONT_OPTIONS = [
  "DM Sans",
  "Inter",
  "Poppins",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Playfair Display",
];

const TEMPLATES: {
  id: "classic" | "bold" | "minimal";
  name: string;
  description: string;
}[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Clean layout with a traditional menu grid",
  },
  {
    id: "bold",
    name: "Bold",
    description: "Large imagery with full-bleed hero sections",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Simple, text-focused with subtle accents",
  },
];

export default function OnlineOrderingPage() {
  const {
    settings,
    updateSettings,
    saveSettings,
    discardChanges,
    isDirty,
    isSaving,
    createSettings,
    loadSettings,
    isLoading,
  } = useOnlineOrderingSettings();
  const [mounted, setMounted] = useState(false);
  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);
  const [uploadingType, setUploadingType] = useState<
    "logo" | "hero" | "favicon" | "og" | null
  >(null);

  const { selectedLocationId } = useLocationStore();
  const selectedLocation = useSelectedLocation();
  const isAllLocations = selectedLocationId === "all";
  const clerkOrgId = useClerkOrgId();
  const { data: userInfo } = useUserInfo();
  const merchantName =
    userInfo?.members?.[0]?.organizations?.merchants?.name || "";

  const [showOrderOutForm, setShowOrderOutForm] = useState(false);
  const { data: orderOutData } = useOrderOutStatus(
    clerkOrgId || "",
    selectedLocationId
  );
  const orderOutStatus = orderOutData?.data;
  const onboardOrderOut = useOnboardOrderOut(clerkOrgId || "");

  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const ogInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (selectedLocationId && selectedLocationId !== "all") {
      loadSettings(selectedLocationId);
    }
  }, [selectedLocationId, loadSettings]);

  const currentSettings = !isAllLocations
    ? settings.find((s) => s.locationId === selectedLocationId)
    : null;

  const handleUpdate = (updates: Partial<OnlineOrderingSettings>) => {
    if (!selectedLocationId || isAllLocations) return;
    updateSettings(selectedLocationId, updates);
  };

  const handleSetupOnlineOrdering = () => {
    if (!selectedLocation || isAllLocations) return;
    createSettings(selectedLocationId, selectedLocation.name);
    toast.success("Online ordering settings created!");
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "logo" | "hero" | "favicon" | "og"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedLocationId || isAllLocations || !selectedLocation?.merchant_id) {
      toast.error("Select a specific location before uploading store assets");
      e.target.value = "";
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size: 5MB");
      return;
    }

    setUploadingType(type);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const result = await uploadStoreImage(
        formData,
        {
          merchantId: selectedLocation.merchant_id,
          locationId: selectedLocationId,
          assetType: type,
        }
      );
      if (!result.success || !result.url) {
        toast.error(result.error || "Upload failed");
        return;
      }

      const keyMap = {
        logo: "logoUrl",
        hero: "heroImageUrl",
        favicon: "faviconUrl",
        og: "ogImageUrl",
      } as const;
      handleUpdate({ [keyMap[type]]: result.url });
      await saveSettings(selectedLocationId);
      toast.success("Image uploaded");
    } catch {
      toast.error("Failed to upload image");
    } finally {
      setUploadingType(null);
      e.target.value = "";
    }
  };

  const removeImage = async (type: "logo" | "hero" | "favicon" | "og") => {
    if (!selectedLocation?.merchant_id) {
      toast.error("Missing merchant context for image removal");
      return;
    }

    const keyMap = {
      logo: "logoUrl",
      hero: "heroImageUrl",
      favicon: "faviconUrl",
      og: "ogImageUrl",
    } as const;
    const currentUrl = currentSettings?.[keyMap[type]] || null;
    handleUpdate({ [keyMap[type]]: null });
    if (currentUrl) {
      deleteStoreImage(currentUrl, selectedLocation.merchant_id).catch(
        console.error
      );
    }
    await saveSettings(selectedLocationId);
    toast.success("Image removed");
  };

  if (!mounted || (isLoading && !isAllLocations)) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isAllLocations) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Online Ordering</h2>
          <p className="text-muted-foreground">
            Configure your online ordering storefront
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              Select a Specific Location
            </h3>
            <p className="text-muted-foreground text-center max-w-md">
              Online ordering settings are configured per location. Please
              select a specific location from the header dropdown.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentSettings) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Online Ordering</h2>
          <p className="text-muted-foreground">
            Configure your online ordering storefront
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              Set Up Online Ordering
            </h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Online ordering hasn't been configured for{" "}
              <span className="font-medium text-foreground">
                {selectedLocation?.name || "this location"}
              </span>
              .
            </p>
            <Button onClick={handleSetupOnlineOrdering} size="lg">
              <Plus className="h-4 w-4 mr-2" />
              Set Up Online Ordering
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const storeUrl = getStoreUrl(currentSettings.storeSlug);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Online Ordering</h2>
          <p className="text-muted-foreground">
            Configure online ordering for{" "}
            <span className="font-medium text-foreground">
              {selectedLocation?.name || "your location"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isDirty(selectedLocationId) && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => discardChanges(selectedLocationId)}
                disabled={isSaving}
              >
                <X className="h-4 w-4 mr-2" />
                Discard
              </Button>
              <Button
                size="sm"
                onClick={() => saveSettings(selectedLocationId)}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </>
          )}
          {currentSettings.enabled && storeUrl && (
            <Button variant="outline" size="sm" asChild>
              <Link href={storeUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Preview Store
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Enable toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
                  currentSettings.enabled
                    ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Globe className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold">Online Ordering</h3>
                <p className="text-sm text-muted-foreground">
                  {currentSettings.enabled
                    ? "Your store is live and accepting online orders"
                    : "Enable to start accepting online orders"}
                </p>
                {currentSettings.enabled && storeUrl && (
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {storeUrl}
                  </p>
                )}
              </div>
            </div>
            <Switch
              checked={currentSettings.enabled}
              onCheckedChange={(enabled) => handleUpdate({ enabled })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="store" className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="store" className="gap-2">
            <Store className="h-4 w-4" />
            Store Info
          </TabsTrigger>
          <TabsTrigger value="branding" className="gap-2">
            <Palette className="h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="ordering" className="gap-2">
            <Truck className="h-4 w-4" />
            Ordering
          </TabsTrigger>
          <TabsTrigger value="payment" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Payment & Tips
          </TabsTrigger>
          <TabsTrigger value="orderout" className="gap-2">
            <Plug className="h-4 w-4" />
            OrderOut
          </TabsTrigger>
        </TabsList>

        {/* â”€â”€â”€ Store Info â”€â”€â”€ */}
        <TabsContent value="store" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Store Details</CardTitle>
              <CardDescription>
                Basic information about your online store
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="storeName">Store Name</Label>
                  <Input
                    id="storeName"
                    value={currentSettings.storeName}
                    onChange={(e) =>
                      handleUpdate({ storeName: e.target.value })
                    }
                    placeholder="Your Store Name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storeSlug">Store URL Slug</Label>
                  <Input
                    id="storeSlug"
                    value={currentSettings.storeSlug}
                    onChange={(e) =>
                      handleUpdate({
                        storeSlug: e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, ""),
                      })
                    }
                    placeholder="your-store"
                  />
                  {currentSettings.storeSlug && (
                    <p className="text-xs text-muted-foreground font-mono">
                      {getStoreUrl(currentSettings.storeSlug)}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={currentSettings.description}
                  onChange={(e) =>
                    handleUpdate({ description: e.target.value })
                  }
                  placeholder="A short description of your store..."
                  rows={3}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      value={currentSettings.phone}
                      onChange={(e) => handleUpdate({ phone: e.target.value })}
                      className="pl-10"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={currentSettings.email}
                      onChange={(e) => handleUpdate({ email: e.target.value })}
                      className="pl-10"
                      placeholder="orders@yourstore.com"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="address"
                    value={currentSettings.address}
                    onChange={(e) => handleUpdate({ address: e.target.value })}
                    className="pl-10"
                    placeholder="123 Main St, City, State ZIP"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Operating Hours */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Operating Hours</CardTitle>
                  <CardDescription>
                    Set when customers can place orders
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setIsHoursModalOpen(true)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Hours
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {dayOrder.map((day) => {
                  const schedule = currentSettings.operatingHours[day];
                  return (
                    <div
                      key={day}
                      className={cn(
                        "flex items-center justify-between py-2 px-3 rounded-lg",
                        schedule.enabled ? "bg-muted/30" : ""
                      )}
                    >
                      <span
                        className={cn(
                          "font-medium w-24 text-sm",
                          !schedule.enabled && "text-muted-foreground"
                        )}
                      >
                        {getDayLabel(day)}
                      </span>
                      {schedule.enabled ? (
                        schedule.is24Hours ? (
                          <span className="text-sm">Open 24 hours</span>
                        ) : (
                          <span className="text-sm">
                            {formatTimeDisplay(schedule.from)} â€“{" "}
                            {formatTimeDisplay(schedule.to)}
                          </span>
                        )
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Closed
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* SEO & Analytics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                SEO & Analytics
              </CardTitle>
              <CardDescription>
                Improve discoverability and track performance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="metaTitle">Meta Title</Label>
                  <Input
                    id="metaTitle"
                    value={currentSettings.metaTitle}
                    onChange={(e) =>
                      handleUpdate({ metaTitle: e.target.value })
                    }
                    placeholder="Your Store â€” Order Online"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="metaDescription">Meta Description</Label>
                  <Input
                    id="metaDescription"
                    value={currentSettings.metaDescription}
                    onChange={(e) =>
                      handleUpdate({ metaDescription: e.target.value })
                    }
                    placeholder="Order food online for pickup or delivery..."
                  />
                </div>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gaId" className="flex items-center gap-2">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Google Analytics ID
                  </Label>
                  <Input
                    id="gaId"
                    value={currentSettings.googleAnalyticsId}
                    onChange={(e) =>
                      handleUpdate({ googleAnalyticsId: e.target.value })
                    }
                    placeholder="G-XXXXXXXXXX"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fbPixel" className="flex items-center gap-2">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Facebook Pixel ID
                  </Label>
                  <Input
                    id="fbPixel"
                    value={currentSettings.facebookPixelId}
                    onChange={(e) =>
                      handleUpdate({ facebookPixelId: e.target.value })
                    }
                    placeholder="123456789012345"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* â”€â”€â”€ Branding & Template â”€â”€â”€ */}
        <TabsContent value="branding" className="space-y-6">
          {/* Template Picker */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layout className="h-4 w-4" />
                Store Template
              </CardTitle>
              <CardDescription>
                Choose the layout style for your online store
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleUpdate({ templateId: tpl.id })}
                    className={cn(
                      "relative rounded-xl border-2 p-4 text-left transition-all hover:shadow-md",
                      currentSettings.templateId === tpl.id
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-muted hover:border-muted-foreground/30"
                    )}
                  >
                    {currentSettings.templateId === tpl.id && (
                      <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                    <p className="font-semibold text-sm">{tpl.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {tpl.description}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Menu Layout */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" />
                Menu Layout
              </CardTitle>
              <CardDescription>
                How menu items are displayed on the ordering page
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    {
                      id: "cards" as const,
                      name: "Cards",
                      desc: "Image on top, compact cards",
                      Icon: Grid3X3,
                    },
                    {
                      id: "sidebyside" as const,
                      name: "Side by Side",
                      desc: "Image on right, content on left",
                      Icon: LayoutList,
                    },
                    {
                      id: "no-images" as const,
                      name: "No Images",
                      desc: "List layout, text only",
                      Icon: ImageOff,
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleUpdate({ menuLayout: opt.id })}
                    className={cn(
                      "relative rounded-xl border-2 p-4 text-left transition-all hover:shadow-md",
                      (currentSettings.menuLayout ?? "cards") === opt.id
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-muted hover:border-muted-foreground/30"
                    )}
                  >
                    {(currentSettings.menuLayout ?? "cards") === opt.id && (
                      <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                    <opt.Icon className="h-5 w-5 mb-2 text-muted-foreground" />
                    <p className="font-semibold text-sm">{opt.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {opt.desc}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Header Style */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PanelTop className="h-4 w-4" />
                Header Style
              </CardTitle>
              <CardDescription>
                Choose how the navigation header appears on your store
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    {
                      id: "filled" as const,
                      name: "Filled",
                      desc: "Solid primary color background",
                    },
                    {
                      id: "transparent" as const,
                      name: "Transparent",
                      desc: "Overlays the hero banner",
                    },
                    {
                      id: "outlined" as const,
                      name: "Outlined",
                      desc: "Light background with border",
                    },
                  ] as const
                ).map((style) => {
                  const isMinimal = currentSettings.templateId === "minimal";
                  const disabledByTemplate = style.id === "transparent" && isMinimal;
                  const btn = (
                  <button
                    key={style.id}
                    type="button"
                    disabled={disabledByTemplate}
                    onClick={() => !disabledByTemplate && handleUpdate({ headerStyle: style.id })}
                    className={cn(
                      "relative w-full rounded-xl border-2 p-4 text-left transition-all",
                      disabledByTemplate
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:shadow-md",
                      currentSettings.headerStyle === style.id
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-muted hover:border-muted-foreground/30"
                    )}
                  >
                    {currentSettings.headerStyle === style.id && (
                      <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                    <div
                      className="mb-3 h-8 rounded-md border"
                      style={{
                        backgroundColor:
                          style.id === "filled"
                            ? currentSettings.primaryColor
                            : style.id === "outlined"
                              ? currentSettings.backgroundColor
                              : "transparent",
                        borderColor:
                          style.id === "outlined"
                            ? "var(--border)"
                            : "transparent",
                        borderBottomWidth:
                          style.id === "outlined" ? 2 : undefined,
                      }}
                    />
                    <p className="font-semibold text-sm">{style.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{style.desc}</p>
                  </button>
                  );
                  return disabledByTemplate ? (
                    <TooltipProvider key={style.id} delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block w-full">{btn}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          Transparent header is not supported on the Minimal template
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <React.Fragment key={style.id}>{btn}</React.Fragment>
                  );
                })}
              </div>
              <div className="space-y-2 max-w-xs">
                <Label>
                  Header Text Color Override{" "}
                  <span className="text-muted-foreground text-xs">
                    (optional)
                  </span>
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="color"
                    value={currentSettings.headerTextColor || "#FFFFFF"}
                    onChange={(e) =>
                      handleUpdate({ headerTextColor: e.target.value })
                    }
                    className="h-9 w-14 p-1 rounded cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={currentSettings.headerTextColor || ""}
                    placeholder="Auto (contrast-safe)"
                    onChange={(e) =>
                      handleUpdate({
                        headerTextColor: e.target.value || null,
                      })
                    }
                    className="flex-1"
                  />
                  {currentSettings.headerTextColor && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleUpdate({ headerTextColor: null })}
                      title="Reset to auto"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Typography */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Type className="h-4 w-4" />
                Typography
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-w-xs">
                <Label>Font Family</Label>
                <Select
                  value={currentSettings.fontFamily}
                  onValueChange={(fontFamily) => handleUpdate({ fontFamily })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((font) => (
                      <SelectItem key={font} value={font}>
                        <span style={{ fontFamily: font }}>{font}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Colors */}
          <Card>
            <CardHeader>
              <CardTitle>Brand Colors</CardTitle>
              <CardDescription>
                Customize your store&apos;s color scheme
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <ColorInput
                  label="Primary"
                  value={currentSettings.primaryColor}
                  onChange={(v) => handleUpdate({ primaryColor: v })}
                />
                <ColorInput
                  label="Secondary"
                  value={currentSettings.secondaryColor}
                  onChange={(v) => handleUpdate({ secondaryColor: v })}
                />
                <ColorInput
                  label="Accent"
                  value={currentSettings.accentColor || "#f59e0b"}
                  onChange={(v) => handleUpdate({ accentColor: v })}
                />
                <ColorInput
                  label="Background"
                  value={currentSettings.backgroundColor}
                  onChange={(v) => handleUpdate({ backgroundColor: v })}
                />
                <ColorInput
                  label="Text"
                  value={currentSettings.textColor}
                  onChange={(v) => handleUpdate({ textColor: v })}
                />
                <ColorInput
                  label="Border"
                  value={currentSettings.borderColor || ""}
                  onChange={(v) => handleUpdate({ borderColor: v || null })}
                />
                <ColorInput
                  label="Card"
                  value={currentSettings.cardColor || ""}
                  onChange={(v) => handleUpdate({ cardColor: v || null })}
                />
              </div>
              <div className="p-4 rounded-lg border bg-background">
                <p className="text-sm text-muted-foreground mb-3">Preview</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    size="sm"
                    style={{ backgroundColor: currentSettings.primaryColor }}
                    className="text-white"
                  >
                    Primary
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    style={{
                      borderColor: currentSettings.secondaryColor,
                      color: currentSettings.secondaryColor,
                    }}
                  >
                    Secondary
                  </Button>
                  <div
                    className="h-8 w-8 rounded-full border"
                    style={{
                      backgroundColor:
                        currentSettings.accentColor || "#f59e0b",
                    }}
                    title="Accent"
                  />
                  <div
                    className="h-8 px-3 rounded flex items-center text-xs font-medium border"
                    style={{
                      backgroundColor: currentSettings.backgroundColor,
                      color: currentSettings.textColor,
                    }}
                  >
                    Text
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Image Uploads */}
          <Card>
            <CardHeader>
              <CardTitle>Store Images</CardTitle>
              <CardDescription>
                Upload logo, hero banner, favicon, and social sharing image
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ImageUploadRow
                type="logo"
                label="Logo"
                hint="200x200px, PNG, JPG, WEBP, SVG, or GIF"
                url={currentSettings.logoUrl}
                inputRef={logoInputRef}
                uploadingType={uploadingType}
                onUpload={(e) => handleFileUpload(e, "logo")}
                onRemove={() => removeImage("logo")}
                previewClass="h-16 w-16 rounded-lg"
              />
              <Separator />
              <ImageUploadRow
                type="hero"
                label="Hero Banner"
                hint="1200x400px, PNG, JPG, WEBP, SVG, or GIF"
                url={currentSettings.heroImageUrl}
                inputRef={heroInputRef}
                uploadingType={uploadingType}
                onUpload={(e) => handleFileUpload(e, "hero")}
                onRemove={() => removeImage("hero")}
                previewClass="h-24 w-full rounded-lg"
                wide
              />
              <Separator />
              <div className="grid gap-6 sm:grid-cols-2">
                <ImageUploadRow
                  type="favicon"
                  label="Favicon"
                  hint="32x32px, PNG, WEBP, or SVG"
                  url={currentSettings.faviconUrl}
                  inputRef={faviconInputRef}
                  uploadingType={uploadingType}
                  onUpload={(e) => handleFileUpload(e, "favicon")}
                  onRemove={() => removeImage("favicon")}
                  previewClass="h-10 w-10 rounded"
                />
                <ImageUploadRow
                  type="og"
                  label="OG Image"
                  hint="1200x630px, social sharing image"
                  url={currentSettings.ogImageUrl}
                  inputRef={ogInputRef}
                  uploadingType={uploadingType}
                  onUpload={(e) => handleFileUpload(e, "og")}
                  onRemove={() => removeImage("og")}
                  previewClass="h-16 w-28 rounded"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* â”€â”€â”€ Ordering â”€â”€â”€ */}
        <TabsContent value="ordering" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg",
                        currentSettings.pickupEnabled
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Store className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Pickup</CardTitle>
                      <CardDescription>
                        Customers pick up at your location
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings.pickupEnabled}
                    onCheckedChange={(pickupEnabled) =>
                      handleUpdate({ pickupEnabled })
                    }
                  />
                </div>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg",
                        currentSettings.deliveryEnabled
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Truck className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Delivery</CardTitle>
                      <CardDescription>
                        Deliver to customers
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings.deliveryEnabled}
                    onCheckedChange={(deliveryEnabled) =>
                      handleUpdate({ deliveryEnabled })
                    }
                  />
                </div>
              </CardHeader>
              {currentSettings.deliveryEnabled && (
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Delivery Fee</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          step="0.01"
                          value={currentSettings.baseDeliveryFee}
                          onChange={(e) =>
                            handleUpdate({
                              baseDeliveryFee:
                                parseFloat(e.target.value) || 0,
                            })
                          }
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Free Delivery Above</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          step="0.01"
                          value={currentSettings.freeDeliveryThreshold}
                          onChange={(e) =>
                            handleUpdate({
                              freeDeliveryThreshold:
                                parseFloat(e.target.value) || 0,
                            })
                          }
                          className="pl-10"
                          placeholder="0 = never free"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Radius (miles)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={currentSettings.deliveryRadiusMiles ?? ""}
                        onChange={(e) =>
                          handleUpdate({
                            deliveryRadiusMiles: e.target.value
                              ? parseFloat(e.target.value)
                              : null,
                          })
                        }
                        placeholder="e.g. 5"
                      />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Order Settings</CardTitle>
              <CardDescription>
                Configure timing and order requirements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Prep Time (minutes)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[currentSettings.preparationLeadTime]}
                      onValueChange={(v: number[]) =>
                        handleUpdate({ preparationLeadTime: v[0] })
                      }
                      max={120}
                      step={5}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={currentSettings.preparationLeadTime}
                      onChange={(e) =>
                        handleUpdate({
                          preparationLeadTime: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-16"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Minimum Order</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      value={currentSettings.minimumOrderAmount}
                      onChange={(e) =>
                        handleUpdate({
                          minimumOrderAmount: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="pl-10"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    0 = no minimum
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Future Order Days</Label>
                  <Input
                    type="number"
                    min={0}
                    value={currentSettings.futureOrderMaxDays}
                    onChange={(e) =>
                      handleUpdate({
                        futureOrderMaxDays: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = today only
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* â”€â”€â”€ Payment & Tips â”€â”€â”€ */}
        <TabsContent value="payment" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Processing</CardTitle>
              <CardDescription>
                Configure your iPOSPays terminal for online payments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-w-md">
                <Label htmlFor="tpn">iPOSPays TPN</Label>
                <Input
                  id="tpn"
                  value={currentSettings.ipospaysTpn}
                  onChange={(e) =>
                    handleUpdate({ ipospaysTpn: e.target.value })
                  }
                  placeholder="Enter your TPN"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Terminal Processing Number for this location&apos;s online
                  card payments
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tipping</CardTitle>
                  <CardDescription>
                    Configure tip options for customers at checkout
                  </CardDescription>
                </div>
                <Switch
                  checked={currentSettings.tippingEnabled}
                  onCheckedChange={(tippingEnabled) =>
                    handleUpdate({ tippingEnabled })
                  }
                />
              </div>
            </CardHeader>
            {currentSettings.tippingEnabled && (
              <CardContent>
                <div className="space-y-3">
                  <Label>Tip Preset Percentages</Label>
                  <div className="flex gap-2 flex-wrap">
                    {currentSettings.tipPresets.map((pct, i) => (
                      <div key={i} className="relative flex items-center gap-1">
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={pct}
                            onChange={(e) => {
                              const raw = parseInt(e.target.value);
                              const clamped = isNaN(raw) ? 0 : Math.min(100, Math.max(0, raw));
                              const updated = [...currentSettings.tipPresets];
                              updated[i] = clamped;
                              handleUpdate({ tipPresets: updated });
                            }}
                            className="w-20 pr-6"
                          />
                          <Percent className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            const updated = currentSettings.tipPresets.filter((_, idx) => idx !== i);
                            handleUpdate({ tipPresets: updated });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {currentSettings.tipPresets.length < 6 && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          handleUpdate({
                            tipPresets: [...currentSettings.tipPresets, 15],
                          })
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Each value must be 0–100%. Maximum 6 presets.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        </TabsContent>

        {/* â”€â”€â”€ OrderOut â”€â”€â”€ */}
        <TabsContent value="orderout" className="space-y-6">
          <OrderOutTab
            clerkOrgId={clerkOrgId || ""}
            locationId={selectedLocationId}
            orderOutStatus={orderOutStatus || null}
            showOnboardingForm={showOrderOutForm}
            onShowOnboardingForm={setShowOrderOutForm}
            onboardMutation={onboardOrderOut}
            merchantName={merchantName}
            locationName={selectedLocation?.name || ""}
            locationDefaults={{
              streetAddress: selectedLocation?.address_line1 || "",
              city: selectedLocation?.city || "",
              state: selectedLocation?.state || "",
              zipcode: selectedLocation?.postal_code || "",
              country: selectedLocation?.country || "US",
            }}
          />
          {isAllLocations ? (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              Select a specific location to send a test order.
            </div>
          ) : (
            <TestOrderCard
              locationId={selectedLocationId}
              hasRestaurant={!!orderOutStatus?.hasRestaurant}
            />
          )}
        </TabsContent>
      </Tabs>

      <HoursConfigModal
        open={isHoursModalOpen}
        onOpenChange={setIsHoursModalOpen}
        title="Operating Hours"
        description="Set when your store is open for orders"
        schedule={currentSettings.operatingHours}
        onSave={(schedule) => handleUpdate({ operatingHours: schedule })}
      />
    </div>
  );
}

// â”€â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 400);
    return () => clearTimeout(t);
  }, [local, onChange, value]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          className="h-9 w-12 rounded border cursor-pointer"
        />
        <Input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          className="w-24 font-mono text-xs"
        />
      </div>
    </div>
  );
}

const ImageUploadRow = React.memo(function ImageUploadRow({
  type,
  label,
  hint,
  url,
  inputRef,
  uploadingType,
  onUpload,
  onRemove,
  previewClass,
  wide,
}: {
  type: "logo" | "hero" | "favicon" | "og";
  label: string;
  hint: string;
  url: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  uploadingType: "logo" | "hero" | "favicon" | "og" | null;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  previewClass: string;
  wide?: boolean;
}) {
  const isUploading = uploadingType === type;
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className={cn("flex gap-4", wide ? "flex-col" : "items-center")}>
        {url ? (
          <div className={cn("overflow-hidden border rounded", previewClass)}>
            <img
              key={url}
              src={url}
              alt={label}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div
            className={cn(
              "border-2 border-dashed flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors",
              previewClass,
              wide ? "h-24" : ""
            )}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          className="hidden"
          onChange={onUpload}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : null}
            {url ? "Change" : "Upload"}
          </Button>
          {url && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <span className="text-xs text-muted-foreground">{hint}</span>
        </div>
      </div>
    </div>
  );
});
