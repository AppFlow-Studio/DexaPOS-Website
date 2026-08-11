"use client";

import * as React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Bell,
  CreditCard,
  Loader2,
  MapPin,
  Monitor,
  Receipt,
  RotateCcw,
  Save,
  Settings2,
  Volume2,
} from "lucide-react";
import {
  useGatedLocation,
  useGatedLocationId,
} from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  useLocationPosSettings,
  useSaveLocationPosConfig,
  useSaveStationPosConfigOverrides,
} from "./hooks/usePosSettings";
import {
  DEFAULT_POS_CONFIG,
  getEffectivePosConfig,
  normalizePosConfig,
  normalizeStationOverrides,
  type PosAppTheme,
  type PosConfig,
  type PosUiScale,
  type StationPosConfigOverrides,
} from "@/lib/pos/pos-config";
import {
  LocationIndicator,
  PageHeader,
} from "@/components/dashboard/shell";

const INHERIT = "__inherit";

function SettingSwitch({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/35 p-4">
      <div className="space-y-1">
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function updateStationOverride<K extends keyof StationPosConfigOverrides>(
  current: StationPosConfigOverrides,
  section: K,
  key: string,
  value: unknown,
): StationPosConfigOverrides {
  const sectionValue = {
    ...((current[section] as Record<string, unknown> | undefined) ?? {}),
  };

  if (value === undefined) {
    delete sectionValue[key];
  } else {
    sectionValue[key] = value;
  }

  const next: StationPosConfigOverrides = { ...current };
  if (Object.keys(sectionValue).length === 0) {
    delete next[section];
  } else {
    (next as Record<string, unknown>)[section] = sectionValue;
  }

  return normalizeStationOverrides(next);
}

function formatStationType(type: string) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function PosSettingsPage() {
  const gatedLocationId = useGatedLocationId();
  const selectedLocationId = gatedLocationId ?? "all";
  const isAllLocations = !gatedLocationId;
  const selectedLocation = useGatedLocation();
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;

  const {
    data,
    isLoading,
    isError,
    error,
  } = useLocationPosSettings(clerkOrgId, selectedLocationId);
  const saveLocationMutation = useSaveLocationPosConfig();
  const saveStationMutation = useSaveStationPosConfigOverrides();

  const [locationConfig, setLocationConfig] = React.useState<PosConfig>(
    DEFAULT_POS_CONFIG,
  );
  const [savedLocationSnapshot, setSavedLocationSnapshot] =
    React.useState<string>("");
  const [selectedStationId, setSelectedStationId] = React.useState<string>("");
  const [stationOverrides, setStationOverrides] =
    React.useState<StationPosConfigOverrides>({});
  const [savedStationSnapshot, setSavedStationSnapshot] =
    React.useState<string>("");

  React.useEffect(() => {
    if (!data) return;

    const nextConfig = normalizePosConfig(data.location.pos_config);
    setLocationConfig(nextConfig);
    setSavedLocationSnapshot(JSON.stringify(nextConfig));

    const firstStationId = data.stations[0]?.id ?? "";
    setSelectedStationId((current) =>
      current && data.stations.some((station) => station.id === current)
        ? current
        : firstStationId,
    );
  }, [data]);

  const selectedStation = React.useMemo(
    () => data?.stations.find((station) => station.id === selectedStationId),
    [data?.stations, selectedStationId],
  );

  React.useEffect(() => {
    const nextOverrides = normalizeStationOverrides(
      selectedStation?.pos_config_overrides ?? {},
    );
    setStationOverrides(nextOverrides);
    setSavedStationSnapshot(JSON.stringify(nextOverrides));
  }, [selectedStation?.id, selectedStation?.pos_config_overrides]);

  const effectiveStationConfig = React.useMemo(
    () => getEffectivePosConfig(locationConfig, stationOverrides),
    [locationConfig, stationOverrides],
  );

  const locationIsDirty =
    JSON.stringify(locationConfig) !== savedLocationSnapshot;
  const stationIsDirty =
    JSON.stringify(stationOverrides) !== savedStationSnapshot;

  const handleSaveLocation = async () => {
    if (!clerkOrgId || !gatedLocationId) return;

    const saved = await saveLocationMutation.mutateAsync({
      clerkOrgId,
      locationId: gatedLocationId,
      posConfig: locationConfig,
    });
    setLocationConfig(saved);
    setSavedLocationSnapshot(JSON.stringify(saved));
  };

  const handleSaveStation = async () => {
    if (!clerkOrgId || !gatedLocationId || !selectedStationId) return;

    const saved = await saveStationMutation.mutateAsync({
      clerkOrgId,
      locationId: gatedLocationId,
      stationId: selectedStationId,
      overrides: stationOverrides,
    });
    setStationOverrides(saved);
    setSavedStationSnapshot(JSON.stringify(saved));
  };

  if (isAllLocations) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="POS defaults"
          subtitle="Configure location-level POS behavior and station overrides."
          indicator={<LocationIndicator isAllLocations locationName={null} />}
        />

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MapPin className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">Select a Location</h3>
            <p className="max-w-md text-muted-foreground">
              POS runtime settings are location-specific. Select a location from
              the dashboard location picker to configure its defaults.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="POS defaults"
          subtitle="Loading location behavior and station overrides."
          indicator={
            <LocationIndicator
              isAllLocations={false}
              locationName={selectedLocation?.name}
            />
          }
        />
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Skeleton className="h-[520px] w-full" />
          <Skeleton className="h-[520px] w-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="POS defaults"
          subtitle="Configure location-level POS behavior and station overrides."
          indicator={
            <LocationIndicator
              isAllLocations={false}
              locationName={selectedLocation?.name}
            />
          }
        />
        <Alert variant="destructive">
          <Settings2 className="h-4 w-4" />
          <AlertTitle>Failed to load POS settings</AlertTitle>
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "An error occurred while loading POS settings."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="POS defaults"
        subtitle="Set location behavior, then override display and sound only where a station needs it."
        indicator={
          <LocationIndicator
            isAllLocations={false}
            locationName={selectedLocation?.name}
          />
        }
        actions={
          <>
            <Badge variant="secondary">Location defaults</Badge>
            <Button variant="outline" asChild>
              <Link href="/dashboard/settings/stations">
                <Monitor className="mr-2 h-4 w-4" />
                Manage Stations
              </Link>
            </Button>
          </>
        }
      />

      <Alert>
        <Settings2 className="h-4 w-4" />
        <AlertTitle>How this resolves on POS</AlertTitle>
        <AlertDescription>
          Effective POS config is resolved as hard defaults, then{" "}
          <code>locations.pos_config</code>, then{" "}
          <code>stations.pos_config_overrides</code>. V1 station overrides are
          intentionally limited to UI scale, theme, and notification settings.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    Receipt & Kitchen Ticket Content
                  </CardTitle>
                  <CardDescription>
                    Runtime content switches shared by every POS station at this
                    location.
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  v{locationConfig._version ?? 0}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <SettingSwitch
                  id="show-tax-breakdown"
                  label="Show tax breakdown"
                  description="Print taxes as separate totals on receipts."
                  checked={locationConfig.printing.showTaxBreakdown}
                  onCheckedChange={(checked) =>
                    setLocationConfig((prev) => ({
                      ...prev,
                      printing: {
                        ...prev.printing,
                        showTaxBreakdown: checked,
                      },
                    }))
                  }
                />
                <SettingSwitch
                  id="show-itemized-list"
                  label="Show itemized list"
                  description="Include line items on customer receipts."
                  checked={locationConfig.printing.showItemizedList}
                  onCheckedChange={(checked) =>
                    setLocationConfig((prev) => ({
                      ...prev,
                      printing: {
                        ...prev.printing,
                        showItemizedList: checked,
                      },
                    }))
                  }
                />
                <SettingSwitch
                  id="show-tip-options"
                  label="Show tip options"
                  description="Show tip prompts/options on printed receipts."
                  checked={locationConfig.printing.showTipOptions}
                  onCheckedChange={(checked) =>
                    setLocationConfig((prev) => ({
                      ...prev,
                      printing: {
                        ...prev.printing,
                        showTipOptions: checked,
                      },
                    }))
                  }
                />
                <SettingSwitch
                  id="show-guest-count"
                  label="Show guest count"
                  description="Include guest count on kitchen tickets."
                  checked={locationConfig.printing.showGuestCount}
                  onCheckedChange={(checked) =>
                    setLocationConfig((prev) => ({
                      ...prev,
                      printing: {
                        ...prev.printing,
                        showGuestCount: checked,
                      },
                    }))
                  }
                />
                <SettingSwitch
                  id="show-course-number"
                  label="Show course number"
                  description="Include course number on kitchen tickets."
                  checked={locationConfig.printing.showCourseNumber}
                  onCheckedChange={(checked) =>
                    setLocationConfig((prev) => ({
                      ...prev,
                      printing: {
                        ...prev.printing,
                        showCourseNumber: checked,
                      },
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="receipt-footer">Receipt footer message</Label>
                <Textarea
                  id="receipt-footer"
                  value={locationConfig.printing.footerMessage}
                  onChange={(event) =>
                    setLocationConfig((prev) => ({
                      ...prev,
                      printing: {
                        ...prev.printing,
                        footerMessage: event.target.value,
                      },
                    }))
                  }
                  placeholder="Thank you for your business."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Behavior
              </CardTitle>
              <CardDescription>
                Shared POS payment and split-payment controls for this location.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                <SettingSwitch
                  id="cash-enabled"
                  label="Accept cash"
                  description="Allow cash as a payment method on POS."
                  checked={locationConfig.payment.cashEnabled}
                  onCheckedChange={(checked) =>
                    setLocationConfig((prev) => ({
                      ...prev,
                      payment: { ...prev.payment, cashEnabled: checked },
                    }))
                  }
                />
                <SettingSwitch
                  id="split-by-item"
                  label="Split by item"
                  description="Let staff split checks by selected line items."
                  checked={locationConfig.payment.splitByItem}
                  onCheckedChange={(checked) =>
                    setLocationConfig((prev) => ({
                      ...prev,
                      payment: { ...prev.payment, splitByItem: checked },
                    }))
                  }
                />
                <SettingSwitch
                  id="split-evenly"
                  label="Split evenly"
                  description="Let staff split checks evenly across guests."
                  checked={locationConfig.payment.splitEvenly}
                  onCheckedChange={(checked) =>
                    setLocationConfig((prev) => ({
                      ...prev,
                      payment: { ...prev.payment, splitEvenly: checked },
                    }))
                  }
                />
                <SettingSwitch
                  id="split-by-amount"
                  label="Split by amount"
                  description="Let staff split checks by custom dollar amounts."
                  checked={locationConfig.payment.splitByAmount}
                  onCheckedChange={(checked) =>
                    setLocationConfig((prev) => ({
                      ...prev,
                      payment: { ...prev.payment, splitByAmount: checked },
                    }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Location Display & Notifications
              </CardTitle>
              <CardDescription>
                Defaults inherited by every station unless overridden below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>UI scale</Label>
                  <Select
                    value={locationConfig.display.uiScale}
                    onValueChange={(value) =>
                      setLocationConfig((prev) => ({
                        ...prev,
                        display: {
                          ...prev.display,
                          uiScale: value as PosUiScale,
                        },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">Compact</SelectItem>
                      <SelectItem value="comfortable">Comfortable</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>App theme</Label>
                  <Select
                    value={locationConfig.display.appTheme}
                    onValueChange={(value) =>
                      setLocationConfig((prev) => ({
                        ...prev,
                        display: {
                          ...prev.display,
                          appTheme: value as PosAppTheme,
                        },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <SettingSwitch
                id="notification-sounds"
                label="Notification sounds"
                description="Play POS notification sounds at this location."
                checked={locationConfig.notifications.soundEnabled}
                onCheckedChange={(checked) =>
                  setLocationConfig((prev) => ({
                    ...prev,
                    notifications: {
                      ...prev.notifications,
                      soundEnabled: checked,
                    },
                  }))
                }
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="location-volume">Notification volume</Label>
                  <span className="text-sm text-muted-foreground">
                    {locationConfig.notifications.volume}%
                  </span>
                </div>
                <Input
                  id="location-volume"
                  type="range"
                  min={0}
                  max={100}
                  value={locationConfig.notifications.volume}
                  onChange={(event) =>
                    setLocationConfig((prev) => ({
                      ...prev,
                      notifications: {
                        ...prev.notifications,
                        volume: Number(event.target.value),
                      },
                    }))
                  }
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={!locationIsDirty || saveLocationMutation.isPending}
                  onClick={() => {
                    if (data?.location.pos_config) {
                      const next = normalizePosConfig(data.location.pos_config);
                      setLocationConfig(next);
                      setSavedLocationSnapshot(JSON.stringify(next));
                    }
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset
                </Button>
                <Button
                  disabled={!locationIsDirty || saveLocationMutation.isPending}
                  onClick={handleSaveLocation}
                >
                  {saveLocationMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Location Defaults
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Station Overrides
              </CardTitle>
              <CardDescription>
                Override only UI scale, theme, and notification settings for a
                single station.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {data?.stations.length ? (
                <>
                  <div className="space-y-2">
                    <Label>Station</Label>
                    <Select
                      value={selectedStationId}
                      onValueChange={setSelectedStationId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select station" />
                      </SelectTrigger>
                      <SelectContent>
                        {data.stations.map((station) => (
                          <SelectItem key={station.id} value={station.id}>
                            {station.station_number
                              ? `#${station.station_number} `
                              : ""}
                            {station.station_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedStation && (
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {selectedStation.station_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatStationType(selectedStation.station_type)}
                            {selectedStation.station_code
                              ? ` · ${selectedStation.station_code}`
                              : ""}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {Object.keys(stationOverrides).length
                            ? "Custom"
                            : "Inherits"}
                        </Badge>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>UI scale override</Label>
                        <Select
                          value={stationOverrides.display?.uiScale ?? INHERIT}
                          onValueChange={(value) =>
                            setStationOverrides((prev) =>
                              updateStationOverride(
                                prev,
                                "display",
                                "uiScale",
                                value === INHERIT ? undefined : value,
                              ),
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={INHERIT}>
                              Inherit location
                            </SelectItem>
                            <SelectItem value="compact">Compact</SelectItem>
                            <SelectItem value="comfortable">
                              Comfortable
                            </SelectItem>
                            <SelectItem value="large">Large</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Theme override</Label>
                        <Select
                          value={stationOverrides.display?.appTheme ?? INHERIT}
                          onValueChange={(value) =>
                            setStationOverrides((prev) =>
                              updateStationOverride(
                                prev,
                                "display",
                                "appTheme",
                                value === INHERIT ? undefined : value,
                              ),
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={INHERIT}>
                              Inherit location
                            </SelectItem>
                            <SelectItem value="system">System</SelectItem>
                            <SelectItem value="light">Light</SelectItem>
                            <SelectItem value="dark">Dark</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Sound override</Label>
                      <Select
                        value={
                          typeof stationOverrides.notifications
                            ?.soundEnabled === "boolean"
                            ? stationOverrides.notifications.soundEnabled
                              ? "on"
                              : "off"
                            : INHERIT
                        }
                        onValueChange={(value) =>
                          setStationOverrides((prev) =>
                            updateStationOverride(
                              prev,
                              "notifications",
                              "soundEnabled",
                              value === INHERIT ? undefined : value === "on",
                            ),
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT}>
                            Inherit location
                          </SelectItem>
                          <SelectItem value="on">On</SelectItem>
                          <SelectItem value="off">Off</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="station-volume">
                          Volume override
                        </Label>
                        {typeof stationOverrides.notifications?.volume ===
                        "number" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setStationOverrides((prev) =>
                                updateStationOverride(
                                  prev,
                                  "notifications",
                                  "volume",
                                  undefined,
                                ),
                              )
                            }
                          >
                            Inherit
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setStationOverrides((prev) =>
                                updateStationOverride(
                                  prev,
                                  "notifications",
                                  "volume",
                                  locationConfig.notifications.volume,
                                ),
                              )
                            }
                          >
                            Override
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <Input
                          id="station-volume"
                          type="range"
                          min={0}
                          max={100}
                          disabled={
                            typeof stationOverrides.notifications?.volume !==
                            "number"
                          }
                          value={
                            stationOverrides.notifications?.volume ??
                            effectiveStationConfig.notifications.volume
                          }
                          onChange={(event) =>
                            setStationOverrides((prev) =>
                              updateStationOverride(
                                prev,
                                "notifications",
                                "volume",
                                Number(event.target.value),
                              ),
                            )
                          }
                        />
                        <span className="w-12 text-right text-sm text-muted-foreground">
                          {effectiveStationConfig.notifications.volume}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3 rounded-xl border bg-background p-4">
                    <div className="flex items-center gap-2 font-medium">
                      <Bell className="h-4 w-4" />
                      Effective station config
                    </div>
                    <div className="grid gap-2 text-sm text-muted-foreground">
                      <div className="flex justify-between">
                        <span>UI scale</span>
                        <span className="font-medium text-foreground">
                          {effectiveStationConfig.display.uiScale}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Theme</span>
                        <span className="font-medium text-foreground">
                          {effectiveStationConfig.display.appTheme}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sounds</span>
                        <span className="font-medium text-foreground">
                          {effectiveStationConfig.notifications.soundEnabled
                            ? "On"
                            : "Off"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Volume</span>
                        <span className="font-medium text-foreground">
                          {effectiveStationConfig.notifications.volume}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      disabled={!stationIsDirty || saveStationMutation.isPending}
                      onClick={() => {
                        const next = normalizeStationOverrides(
                          selectedStation?.pos_config_overrides ?? {},
                        );
                        setStationOverrides(next);
                        setSavedStationSnapshot(JSON.stringify(next));
                      }}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reset
                    </Button>
                    <Button
                      disabled={!stationIsDirty || saveStationMutation.isPending}
                      onClick={handleSaveStation}
                    >
                      {saveStationMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save Station Overrides
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
                  <Monitor className="mb-3 h-10 w-10 text-muted-foreground" />
                  <h3 className="font-semibold">No stations configured</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create stations first, then return here to add per-station
                    display and sound overrides.
                  </p>
                  <Button className="mt-4" asChild>
                    <Link href="/dashboard/settings/stations">
                      Create Station
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="h-5 w-5" />
                V1 Scope
              </CardTitle>
              <CardDescription>
                These are the controls implemented in the web part of this
                ticket.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Location-wide: receipt/ticket content, payment methods, split
                payments, UI defaults, and notification defaults.
              </p>
              <p>
                Station override: UI scale, app theme, notification sounds, and
                notification volume.
              </p>
              <p>
                Hardware assignment, terminal pairing, drawer assignment, and
                printer routing remain in the existing station settings screens.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
