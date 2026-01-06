"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  useOnlineOrderingSettings,
  OnlineOrderingSettings,
  formatTimeDisplay,
  dayOrder,
  getDayLabel,
} from "./hooks/useOnlineOrderingSettings";
import { HoursConfigModal } from "./components/HoursConfigModal";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  Globe,
  Store,
  Clock,
  Palette,
  Truck,
  CreditCard,
  Bell,
  Phone,
  Mail,
  Upload,
  Image,
  Trash2,
  ExternalLink,
  DollarSign,
  Percent,
  Zap,
  Plus,
  Edit,
  Check,
  X,
  Building2,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useLocationStore, useSelectedLocation } from "@/stores/location-store";

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
  const [hoursModalType, setHoursModalType] = useState<
    "operating" | "delivery"
  >("operating");

  // Global location state
  const { selectedLocationId } = useLocationStore();
  const selectedLocation = useSelectedLocation();
  const isAllLocations = selectedLocationId === "all";

  // File input refs
  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch settings when location changes
  useEffect(() => {
    if (selectedLocationId && selectedLocationId !== "all") {
      loadSettings(selectedLocationId);
    }
  }, [selectedLocationId, loadSettings]);

  // Get settings for the currently selected location
  const currentSettings = !isAllLocations
    ? settings.find((s) => s.locationId === selectedLocationId)
    : null;

  const handleUpdate = (updates: Partial<OnlineOrderingSettings>) => {
    if (!selectedLocationId || isAllLocations) return;
    updateSettings(selectedLocationId, updates);
  };

  // Setup online ordering for a location
  const handleSetupOnlineOrdering = () => {
    if (!selectedLocation || isAllLocations) return;
    createSettings(selectedLocationId, selectedLocation.name);
    toast.success("Online ordering settings created!");
  };

  // File upload handler
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "logo" | "hero" | "favicon"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    // Create object URL for preview
    const url = URL.createObjectURL(file);

    switch (type) {
      case "logo":
        handleUpdate({ logoUrl: url });
        break;
      case "hero":
        handleUpdate({ heroImageUrl: url });
        break;
      case "favicon":
        handleUpdate({ faviconUrl: url });
        break;
    }

    toast.success(
      `${type.charAt(0).toUpperCase() + type.slice(1)} uploaded successfully`
    );
  };

  const removeImage = (type: "logo" | "hero" | "favicon") => {
    switch (type) {
      case "logo":
        handleUpdate({ logoUrl: null });
        break;
      case "hero":
        handleUpdate({ heroImageUrl: null });
        break;
      case "favicon":
        handleUpdate({ faviconUrl: null });
        break;
    }
    toast.success("Image removed");
  };

  // Open hours modal
  const openHoursModal = (type: "operating" | "delivery") => {
    setHoursModalType(type);
    setIsHoursModalOpen(true);
  };

  if (!mounted || (isLoading && !isAllLocations)) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Show message when "All Locations" is selected
  if (isAllLocations) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Online Ordering</h2>
          <p className="text-muted-foreground">
            Configure your online ordering storefront and settings
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
              select a specific location from the header dropdown to configure
              its online ordering storefront.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show setup button when no settings exist for this location
  if (!currentSettings) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Online Ordering</h2>
          <p className="text-muted-foreground">
            Configure your online ordering storefront and settings
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
              . Set it up to start accepting online orders.
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
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </>
          )}
          {currentSettings.enabled && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/sites/${currentSettings.locationId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Preview Store
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Enable/Disable Toggle */}
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
              </div>
            </div>
            <Switch
              checked={currentSettings.enabled}
              onCheckedChange={(enabled) => handleUpdate({ enabled })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Main Settings Tabs */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="general" className="gap-2">
            <Store className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="hours" className="gap-2">
            <Clock className="h-4 w-4" />
            Hours
          </TabsTrigger>
          <TabsTrigger value="branding" className="gap-2">
            <Palette className="h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="ordering" className="gap-2">
            <Truck className="h-4 w-4" />
            Pickup & Delivery
          </TabsTrigger>
          <TabsTrigger value="payment" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Payment & Tips
          </TabsTrigger>
          <TabsTrigger value="automation" className="gap-2">
            <Zap className="h-4 w-4" />
            Automation
          </TabsTrigger>
        </TabsList>

        {/* General Settings Tab */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Store Information</CardTitle>
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
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">
                      /sites/
                    </span>
                    <Input
                      id="storeSlug"
                      value={currentSettings.storeSlug}
                      onChange={(e) =>
                        handleUpdate({
                          storeSlug: e.target.value
                            .toLowerCase()
                            .replace(/\s+/g, "-"),
                        })
                      }
                      className="rounded-l-none"
                      placeholder="your-store"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={currentSettings.address}
                  onChange={(e) => handleUpdate({ address: e.target.value })}
                  placeholder="123 Main Street, City, State ZIP"
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Visibility Settings</CardTitle>
              <CardDescription>
                Control how your store appears to customers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Hide from location picker</Label>
                  <p className="text-sm text-muted-foreground">
                    Don't show this store in the multi-location picker
                  </p>
                </div>
                <Switch
                  checked={currentSettings.hideFromLocationPicker}
                  onCheckedChange={(hideFromLocationPicker) =>
                    handleUpdate({ hideFromLocationPicker })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Don't mark as "Closed" outside hours</Label>
                  <p className="text-sm text-muted-foreground">
                    Recommended for catering or pre-order only stores
                  </p>
                </div>
                <Switch
                  checked={currentSettings.dontMarkClosedOutsideHours}
                  onCheckedChange={(dontMarkClosedOutsideHours) =>
                    handleUpdate({ dontMarkClosedOutsideHours })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hours Tab */}
        <TabsContent value="hours" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Operating Hours</CardTitle>
                  <CardDescription>
                    Set when customers can place orders
                  </CardDescription>
                </div>
                <Button onClick={() => openHoursModal("operating")}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Hours
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
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
                          "font-medium w-24",
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
                            {formatTimeDisplay(schedule.from)} -{" "}
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

          {currentSettings.deliveryEnabled && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Delivery Hours</CardTitle>
                    <CardDescription>
                      Set separate hours for delivery orders
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={currentSettings.useCustomDeliveryHours}
                        onCheckedChange={(useCustomDeliveryHours) =>
                          handleUpdate({ useCustomDeliveryHours })
                        }
                      />
                      <Label className="text-sm">Custom hours</Label>
                    </div>
                    {currentSettings.useCustomDeliveryHours && (
                      <Button
                        variant="outline"
                        onClick={() => openHoursModal("delivery")}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              {currentSettings.useCustomDeliveryHours && (
                <CardContent>
                  <div className="space-y-2">
                    {dayOrder.map((day) => {
                      const schedule = currentSettings.deliveryHours[day];
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
                              "font-medium w-24",
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
                                {formatTimeDisplay(schedule.from)} -{" "}
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
              )}
            </Card>
          )}
        </TabsContent>

        {/* Branding Tab */}
        <TabsContent value="branding" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Store Images</CardTitle>
              <CardDescription>
                Upload your logo and banner images
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Logo Upload */}
              <div className="space-y-3">
                <Label>Store Logo</Label>
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "relative h-20 w-20 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors",
                      currentSettings.logoUrl
                        ? "border-transparent"
                        : "border-muted-foreground/25 hover:border-primary/50 cursor-pointer"
                    )}
                    onClick={() =>
                      !currentSettings.logoUrl && logoInputRef.current?.click()
                    }
                  >
                    {currentSettings.logoUrl ? (
                      <img
                        src={currentSettings.logoUrl}
                        alt="Store logo"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, "logo")}
                  />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      Recommended: 200x200px, PNG or JPG
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {currentSettings.logoUrl ? "Change" : "Upload"}
                      </Button>
                      {currentSettings.logoUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => removeImage("logo")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Hero Image Upload */}
              <div className="space-y-3">
                <Label>Hero Banner Image</Label>
                <div
                  className={cn(
                    "relative h-40 w-full rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors",
                    currentSettings.heroImageUrl
                      ? "border-transparent"
                      : "border-muted-foreground/25 hover:border-primary/50 cursor-pointer"
                  )}
                  onClick={() =>
                    !currentSettings.heroImageUrl &&
                    heroInputRef.current?.click()
                  }
                >
                  {currentSettings.heroImageUrl ? (
                    <img
                      src={currentSettings.heroImageUrl}
                      alt="Hero banner"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-center">
                      <Image className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Click to upload hero image
                      </p>
                    </div>
                  )}
                </div>
                <input
                  ref={heroInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, "hero")}
                />
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Recommended: 1200x400px, PNG or JPG
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => heroInputRef.current?.click()}
                    >
                      {currentSettings.heroImageUrl ? "Change" : "Upload"}
                    </Button>
                    {currentSettings.heroImageUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removeImage("hero")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brand Colors</CardTitle>
              <CardDescription>
                Customize your store's color scheme
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <DebouncedColorInput
                  label="Primary Color"
                  value={currentSettings.primaryColor}
                  onChange={(val) => handleUpdate({ primaryColor: val })}
                  placeholder="#3b82f6"
                />
                <DebouncedColorInput
                  label="Secondary Color"
                  value={currentSettings.secondaryColor}
                  onChange={(val) => handleUpdate({ secondaryColor: val })}
                  placeholder="#10b981"
                />
              </div>

              {/* Color Preview */}
              <div className="mt-6 p-4 rounded-lg border bg-background">
                <p className="text-sm text-muted-foreground mb-3">Preview</p>
                <div className="flex items-center gap-3">
                  <Button
                    style={{ backgroundColor: currentSettings.primaryColor }}
                    className="text-white"
                  >
                    Primary Button
                  </Button>
                  <Button
                    variant="outline"
                    style={{
                      borderColor: currentSettings.secondaryColor,
                      color: currentSettings.secondaryColor,
                    }}
                  >
                    Secondary Button
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pickup & Delivery Tab */}
        <TabsContent value="ordering" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Pickup Card */}
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
                      <CardTitle className="text-base">Pickup Orders</CardTitle>
                      <CardDescription>
                        Allow customers to pick up orders
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

            {/* Delivery Card */}
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
                      <CardTitle className="text-base">
                        Delivery Orders
                      </CardTitle>
                      <CardDescription>
                        Offer delivery to customers
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
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Base Delivery Fee</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          step="0.01"
                          value={currentSettings.baseDeliveryFee}
                          onChange={(e) =>
                            handleUpdate({
                              baseDeliveryFee: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Free Delivery Threshold</Label>
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
                          placeholder="0 = no free delivery"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Set to 0 to disable free delivery
                      </p>
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
                Configure order timing and requirements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Preparation Lead Time (minutes)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[currentSettings.preparationLeadTime]}
                      onValueChange={(values: number[]) =>
                        handleUpdate({ preparationLeadTime: values[0] })
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
                      className="w-20"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Minimum time needed to prepare an order
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Minimum Order Amount</Label>
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
                    Set to 0 for no minimum
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>Accept Future Orders Only</Label>
                  <p className="text-sm text-muted-foreground">
                    Don't allow "ASAP" orders, only scheduled
                  </p>
                </div>
                <Switch
                  checked={currentSettings.acceptFutureOrdersOnly}
                  onCheckedChange={(acceptFutureOrdersOnly) =>
                    handleUpdate({ acceptFutureOrdersOnly })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment & Tips Tab */}
        <TabsContent value="payment" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Methods</CardTitle>
              <CardDescription>
                Choose which payment methods to accept
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label>Accept Online Card Payments</Label>
                    <p className="text-sm text-muted-foreground">
                      Process payments via integrated payment processor
                    </p>
                  </div>
                </div>
                <Switch
                  checked={currentSettings.acceptOnlinePayments}
                  onCheckedChange={(acceptOnlinePayments) =>
                    handleUpdate({ acceptOnlinePayments })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label>Accept Cash on Delivery</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow customers to pay cash at the door
                    </p>
                  </div>
                </div>
                <Switch
                  checked={currentSettings.acceptCashOnDelivery}
                  onCheckedChange={(acceptCashOnDelivery) =>
                    handleUpdate({ acceptCashOnDelivery })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label>Accept Card on Delivery</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow customers to pay by card at the door
                    </p>
                  </div>
                </div>
                <Switch
                  checked={currentSettings.acceptCardOnDelivery}
                  onCheckedChange={(acceptCardOnDelivery) =>
                    handleUpdate({ acceptCardOnDelivery })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tipping</CardTitle>
                  <CardDescription>
                    Configure tipping options for customers
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
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Tip Calculation Method</Label>
                  <div className="flex gap-4">
                    <Button
                      variant={
                        currentSettings.tipConfig.calculationMethod ===
                        "subtotal"
                          ? "default"
                          : "outline"
                      }
                      onClick={() =>
                        handleUpdate({
                          tipConfig: {
                            ...currentSettings.tipConfig,
                            calculationMethod: "subtotal",
                          },
                        })
                      }
                    >
                      Pre-Tax (Subtotal)
                    </Button>
                    <Button
                      variant={
                        currentSettings.tipConfig.calculationMethod === "total"
                          ? "default"
                          : "outline"
                      }
                      onClick={() =>
                        handleUpdate({
                          tipConfig: {
                            ...currentSettings.tipConfig,
                            calculationMethod: "total",
                          },
                        })
                      }
                    >
                      Post-Tax (Total)
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Preset Tip Percentages</Label>
                  <div className="flex gap-2">
                    {currentSettings.tipConfig.presetPercentages.map(
                      (percent, index) => (
                        <div key={index} className="relative">
                          <Input
                            type="number"
                            value={percent}
                            onChange={(e) => {
                              const newPercentages = [
                                ...currentSettings.tipConfig.presetPercentages,
                              ];
                              newPercentages[index] =
                                parseInt(e.target.value) || 0;
                              handleUpdate({
                                tipConfig: {
                                  ...currentSettings.tipConfig,
                                  presetPercentages: newPercentages,
                                },
                              });
                            }}
                            className="w-20 pr-6"
                          />
                          <Percent className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        </div>
                      )
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Allow Custom Tips</Label>
                    <p className="text-sm text-muted-foreground">
                      Let customers enter a custom tip amount
                    </p>
                  </div>
                  <Switch
                    checked={currentSettings.tipConfig.allowCustomTip}
                    onCheckedChange={(allowCustomTip) =>
                      handleUpdate({
                        tipConfig: {
                          ...currentSettings.tipConfig,
                          allowCustomTip,
                        },
                      })
                    }
                  />
                </div>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Convenience Fee</CardTitle>
                  <CardDescription>
                    Add a fee for online ordering
                  </CardDescription>
                </div>
                <Switch
                  checked={currentSettings.convenienceFeeEnabled}
                  onCheckedChange={(convenienceFeeEnabled) =>
                    handleUpdate({ convenienceFeeEnabled })
                  }
                />
              </div>
            </CardHeader>
            {currentSettings.convenienceFeeEnabled && (
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Percentage Fee</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.1"
                        value={currentSettings.convenienceFeePercent}
                        onChange={(e) =>
                          handleUpdate({
                            convenienceFeePercent:
                              parseFloat(e.target.value) || 0,
                          })
                        }
                        className="pr-8"
                      />
                      <Percent className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Flat Fee</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.01"
                        value={currentSettings.convenienceFeeFlat}
                        onChange={(e) =>
                          handleUpdate({
                            convenienceFeeFlat: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        </TabsContent>

        {/* Automation Tab */}
        <TabsContent value="automation" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Order Automation</CardTitle>
              <CardDescription>
                Automate order handling to save time
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  <div>
                    <Label>Automatically Accept All Orders</Label>
                    <p className="text-sm text-muted-foreground">
                      New orders will be accepted without manual confirmation
                    </p>
                  </div>
                </div>
                <Switch
                  checked={currentSettings.autoAcceptOrders}
                  onCheckedChange={(autoAcceptOrders) =>
                    handleUpdate({ autoAcceptOrders })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-green-500" />
                  <div>
                    <Label>Auto-Close Paid Orders</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically close orders that are paid upon acceptance
                    </p>
                  </div>
                </div>
                <Switch
                  checked={currentSettings.autoClosePaidOrders}
                  onCheckedChange={(autoClosePaidOrders) =>
                    handleUpdate({ autoClosePaidOrders })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Get notified about new orders</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label>Email on New Order</Label>
                    <p className="text-sm text-muted-foreground">
                      Send an email notification for every new order
                    </p>
                  </div>
                </div>
                <Switch
                  checked={currentSettings.sendEmailOnNewOrder}
                  onCheckedChange={(sendEmailOnNewOrder) =>
                    handleUpdate({ sendEmailOnNewOrder })
                  }
                />
              </div>
              {currentSettings.sendEmailOnNewOrder && (
                <div className="ml-8 space-y-2">
                  <Label>Notification Email</Label>
                  <Input
                    type="email"
                    value={currentSettings.notificationEmail}
                    onChange={(e) =>
                      handleUpdate({ notificationEmail: e.target.value })
                    }
                    placeholder="manager@yourstore.com"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Hours Modal */}
      <HoursConfigModal
        open={isHoursModalOpen}
        onOpenChange={setIsHoursModalOpen}
        title={
          hoursModalType === "operating" ? "Operating Hours" : "Delivery Hours"
        }
        description={
          hoursModalType === "operating"
            ? "Set when your store is open for orders"
            : "Set specific hours for delivery orders"
        }
        schedule={
          hoursModalType === "operating"
            ? currentSettings.operatingHours
            : currentSettings.deliveryHours
        }
        onSave={(schedule) => {
          if (hoursModalType === "operating") {
            handleUpdate({ operatingHours: schedule });
          } else {
            handleUpdate({ deliveryHours: schedule });
          }
        }}
      />
    </div>
  );
}

function DebouncedColorInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [localValue, setLocalValue] = useState(value);

  // Sync local state when external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounce updates
  useEffect(() => {
    const handler = setTimeout(() => {
      // Only fire update if the local value is different from the prop value
      // This prevents loop if the prop update eventually triggers this effect
      if (localValue !== value) {
        onChange(localValue);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(handler);
  }, [localValue, onChange, value]);

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          className="h-10 w-16 rounded-lg border cursor-pointer"
        />
        <Input
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          className="w-28 font-mono text-sm"
          placeholder={placeholder}
        />
        <div
          className="h-10 flex-1 rounded-lg border"
          style={{ backgroundColor: localValue }}
        />
      </div>
    </div>
  );
}
