"use client";

import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Building2,
  MapPin,
  Info,
  Loader2,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useEffectivePricing } from "@/app/dashboard/hooks/useEffectivePricing";
import {
  useLocationStore,
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import {
  UpdateLocation,
  UpdateMerchantPricingDefaults,
} from "@/app/dashboard/actions/locations";

export default function PricingSettingsPage() {
  const queryClient = useQueryClient();
  const clerkOrgId = useClerkOrgId();
  const isAllLocations = useIsAllLocations();
  const selectedLocation = useSelectedLocation();
  const { locations } = useLocationStore();
  const {
    pricingStrategy: effectiveStrategy,
    dualPricingPercentage: effectivePercentage,
    source,
    isLoading,
  } = useEffectivePricing();

  const [isSaving, setIsSaving] = useState(false);

  const handleUpdateMerchantStrategy = async (value: "manual" | "dual") => {
    setIsSaving(true);
    try {
      const result = await UpdateMerchantPricingDefaults(clerkOrgId, {
        pricing_strategy: value,
        dual_pricing_percentage: value === "dual" ? 4.0 : undefined,
      });
      if (result.error) {
        toast.error("Update Failed", { description: result.error });
      } else {
        toast.success("Organization pricing updated");
        queryClient.invalidateQueries({
          queryKey: ["merchant-pricing-defaults"],
        });
        queryClient.invalidateQueries({ queryKey: ["locations"] });
      }
    } catch {
      toast.error("Failed to update pricing");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateMerchantPercentage = async (val: number) => {
    if (isNaN(val) || val === effectivePercentage) return;
    try {
      const result = await UpdateMerchantPricingDefaults(clerkOrgId, {
        dual_pricing_percentage: val,
      });
      if (result.error) {
        toast.error("Update Failed", { description: result.error });
      } else {
        toast.success("Percentage updated");
        queryClient.invalidateQueries({
          queryKey: ["merchant-pricing-defaults"],
        });
      }
    } catch {
      toast.error("Failed to update percentage");
    }
  };

  const handleToggleLocationDefaults = async (
    locationId: string,
    checked: boolean,
  ) => {
    try {
      const result = await UpdateLocation(locationId, {
        use_merchant_pricing_defaults: checked,
      });
      if (result.error) {
        toast.error("Update Failed", { description: result.error });
      } else {
        toast.success(
          checked ? "Using Organization Defaults" : "Using Custom Pricing",
        );
        queryClient.invalidateQueries({ queryKey: ["locations"] });
        queryClient.invalidateQueries({
          queryKey: ["merchant-pricing-defaults"],
        });
      }
    } catch {
      toast.error("Failed to update");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Pricing Settings</h2>
        <p className="text-muted-foreground">
          Configure your organization&apos;s pricing strategy and per-location
          overrides.
        </p>
      </div>

      {isAllLocations ? (
        <>
          {/* Merchant-Level Default Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Organization Default Pricing
              </CardTitle>
              <CardDescription>
                This is the default pricing strategy all locations will inherit
                unless they have custom overrides.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6 max-w-lg">
                <div className="space-y-2">
                  <Label>Default Strategy</Label>
                  <Select
                    value={effectiveStrategy}
                    onValueChange={(val) =>
                      handleUpdateMerchantStrategy(val as "manual" | "dual")
                    }
                    disabled={isSaving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual Pricing</SelectItem>
                      <SelectItem value="dual">
                        Dual Pricing (Cash Discount)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    {effectiveStrategy === "dual"
                      ? "Card prices are automatically calculated based on a percentage markup over cash prices."
                      : "Cash and Card prices are set independently for each item."}
                  </p>
                </div>

                {effectiveStrategy === "dual" && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <Label>Default Percentage (%)</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        defaultValue={effectivePercentage}
                        step="0.1"
                        min="0"
                        max="100"
                        className="pr-8"
                        onBlur={(e) =>
                          handleUpdateMerchantPercentage(
                            parseFloat(e.target.value),
                          )
                        }
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        %
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Typical values range from 3.5% to 4.0%
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Location Summary Table */}
          <Card>
            <CardHeader>
              <CardTitle>Location Pricing Summary</CardTitle>
              <CardDescription>
                See how each location resolves its pricing strategy.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {locations.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No locations configured yet.
                  </p>
                ) : (
                  locations.map((loc) => {
                    const usesDefaults =
                      (loc as any).use_merchant_pricing_defaults !== false;
                    const locStrategy = usesDefaults
                      ? effectiveStrategy
                      : (loc as any).pricing_strategy || "manual";
                    const locPercentage = usesDefaults
                      ? effectivePercentage
                      : (loc as any).dual_pricing_percentage ?? 4.0;

                    return (
                      <div
                        key={loc.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium flex items-center gap-2">
                              {loc.name}
                              {usesDefaults ? (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                                >
                                  Org Default
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-amber-50 text-amber-700 border-amber-200"
                                >
                                  Custom
                                </Badge>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {locStrategy === "dual"
                                ? `Dual Pricing (${locPercentage}%)`
                                : "Manual Pricing"}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : selectedLocation ? (
        <>
          {/* Specific Location Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Pricing for {selectedLocation.name}
              </CardTitle>
              <CardDescription>
                Configure pricing strategy for this specific location.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Use Organization Defaults Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        Use Organization Defaults
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Inherit pricing strategy from organization settings
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={
                      (selectedLocation as any).use_merchant_pricing_defaults !==
                      false
                    }
                    onCheckedChange={(checked) =>
                      handleToggleLocationDefaults(selectedLocation.id, checked)
                    }
                  />
                </div>

                {(selectedLocation as any).use_merchant_pricing_defaults !==
                false ? (
                  <Alert className="border-blue-200 bg-blue-50/50">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-sm">
                      <span className="font-medium">
                        Inherited from Organization:
                      </span>{" "}
                      {effectiveStrategy === "dual"
                        ? `Dual Pricing at ${effectivePercentage}%`
                        : "Manual Pricing"}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-4 max-w-lg">
                    <div className="space-y-2">
                      <Label>Pricing Mode</Label>
                      <Select
                        defaultValue={
                          (selectedLocation as any).pricing_strategy || "manual"
                        }
                        onValueChange={async (value) => {
                          try {
                            const result = await UpdateLocation(
                              selectedLocation.id,
                              {
                                pricing_strategy: value as "manual" | "dual",
                              },
                            );
                            if (result.error) {
                              toast.error("Update Failed", {
                                description: result.error,
                              });
                            } else {
                              toast.success("Strategy Updated");
                              queryClient.invalidateQueries({
                                queryKey: ["locations"],
                              });
                            }
                          } catch {
                            toast.error("Update Failed");
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select strategy" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual Pricing</SelectItem>
                          <SelectItem value="dual">Dual Pricing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(selectedLocation as any).pricing_strategy === "dual" && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                        <Label>Dual Pricing Percentage (%)</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            defaultValue={
                              (selectedLocation as any)
                                .dual_pricing_percentage ?? 4.0
                            }
                            onBlur={async (e) => {
                              const val = parseFloat(e.target.value);
                              if (isNaN(val)) return;
                              try {
                                const result = await UpdateLocation(
                                  selectedLocation.id,
                                  { dual_pricing_percentage: val },
                                );
                                if (result.error) {
                                  toast.error("Update Failed", {
                                    description: result.error,
                                  });
                                } else {
                                  toast.success("Percentage Updated");
                                  queryClient.invalidateQueries({
                                    queryKey: ["locations"],
                                  });
                                }
                              } catch {
                                toast.error("Update Failed");
                              }
                            }}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            %
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Typical values range from 3.5% to 4.0%
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              Select a location to configure its pricing settings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
