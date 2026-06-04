"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Loader2, MapPin, Receipt, Save, Settings2, Check } from "lucide-react";
import {
  useLocationStore,
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  useReceiptTemplates,
  useUpsertReceiptTemplate,
} from "./hooks/useReceiptTemplates";
import { useReceiptTemplateRealtime } from "./hooks/useReceiptTemplateRealtime";
import { TemplateTypeTabs } from "./components/TemplateTypeTabs";
import { ReceiptPreview } from "./components/ReceiptPreview";
import { ReceiptSettingsForm } from "./components/ReceiptSettingsForm";
import { DEFAULT_TEMPLATE_VALUES, TEMPLATE_TYPES } from "./constants";
import type { TemplateType, ReceiptTemplateFormData, ReceiptTemplate } from "./types";

function formDataFromTemplate(
  templateType: TemplateType,
  templates: ReceiptTemplate[] | undefined,
): ReceiptTemplateFormData {
  const defaults = DEFAULT_TEMPLATE_VALUES[templateType];
  const saved = templates?.find((t) => t.template_type === templateType);
  if (!saved) return { ...defaults };

  return {
    show_logo: saved.show_logo ?? defaults.show_logo,
    header_text: saved.header_text ?? defaults.header_text,
    footer_text: saved.footer_text ?? defaults.footer_text,
    show_item_modifiers: saved.show_item_modifiers ?? defaults.show_item_modifiers,
    show_tax_breakdown: saved.show_tax_breakdown ?? defaults.show_tax_breakdown,
    show_tip_line: saved.show_tip_line ?? defaults.show_tip_line,
    show_server_name: saved.show_server_name ?? defaults.show_server_name,
    show_order_type: saved.show_order_type ?? defaults.show_order_type,
    show_barcode: saved.show_barcode ?? defaults.show_barcode,
    show_qr_code: saved.show_qr_code ?? defaults.show_qr_code,
    large_item_text: saved.large_item_text ?? defaults.large_item_text,
    show_mods_large: saved.show_mods_large ?? defaults.show_mods_large,
    group_by_station: saved.group_by_station ?? defaults.group_by_station,
    show_allergy_alert: saved.show_allergy_alert ?? defaults.show_allergy_alert,
    show_ready_by_time: saved.show_ready_by_time ?? defaults.show_ready_by_time,
  };
}

export default function ReceiptTemplatesPage() {
  const selectedLocationId = useLocationStore(
    (state) => state.selectedLocationId,
  );
  const isAllLocations = useIsAllLocations();
  const selectedLocation = useSelectedLocation();
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;

  // Fetch templates
  const {
    data: templates,
    isLoading,
    isError,
    error,
  } = useReceiptTemplates(selectedLocationId);

  // Realtime
  useReceiptTemplateRealtime(selectedLocationId);

  // Mutations
  const upsertMutation = useUpsertReceiptTemplate();

  // State
  const [customizingTabs, setCustomizingTabs] = useState<Set<TemplateType>>(
    new Set(),
  );
  const [activeTab, setActiveTab] = useState<TemplateType>("sale");
  const [formState, setFormState] = useState<ReceiptTemplateFormData>(
    DEFAULT_TEMPLATE_VALUES.sale,
  );
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const pendingTabRef = useRef<TemplateType | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(formState) !== savedSnapshot,
    [formState, savedSnapshot],
  );

  // Load form data when templates or active tab changes
  useEffect(() => {
    const data = formDataFromTemplate(activeTab, templates ?? undefined);
    setFormState(data);
    setSavedSnapshot(JSON.stringify(data));
  }, [activeTab, templates]);

  const handleFormChange = useCallback(
    (update: Partial<ReceiptTemplateFormData>) => {
      setFormState((prev) => ({ ...prev, ...update }));
    },
    [],
  );

  const handleTabChange = useCallback(
    (tab: TemplateType) => {
      if (isDirty) {
        pendingTabRef.current = tab;
        setConfirmDialogOpen(true);
      } else {
        setActiveTab(tab);
      }
    },
    [isDirty],
  );

  const handleConfirmDiscard = useCallback(() => {
    setConfirmDialogOpen(false);
    if (pendingTabRef.current) {
      setActiveTab(pendingTabRef.current);
      pendingTabRef.current = null;
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!clerkOrgId || !selectedLocationId || selectedLocationId === "all")
      return;

    await upsertMutation.mutateAsync({
      clerkOrgId,
      input: {
        location_id: selectedLocationId,
        template_type: activeTab,
        show_logo: formState.show_logo,
        header_text: formState.header_text || null,
        footer_text: formState.footer_text || null,
        show_item_modifiers: formState.show_item_modifiers,
        show_tax_breakdown: formState.show_tax_breakdown,
        show_tip_line: formState.show_tip_line,
        show_server_name: formState.show_server_name,
        show_order_type: formState.show_order_type,
        show_barcode: formState.show_barcode,
        show_qr_code: formState.show_qr_code,
        large_item_text: formState.large_item_text,
        show_mods_large: formState.show_mods_large,
        group_by_station: formState.group_by_station,
        show_allergy_alert: formState.show_allergy_alert,
        show_ready_by_time: formState.show_ready_by_time,
      },
    });

    setSavedSnapshot(JSON.stringify(formState));
  }, [clerkOrgId, selectedLocationId, activeTab, formState, upsertMutation]);

  const handleUseDefault = useCallback(async () => {
    if (!clerkOrgId || !selectedLocationId || selectedLocationId === "all")
      return;

    const defaults = DEFAULT_TEMPLATE_VALUES[activeTab];
    await upsertMutation.mutateAsync({
      clerkOrgId,
      input: {
        location_id: selectedLocationId,
        template_type: activeTab,
        show_logo: defaults.show_logo,
        header_text: defaults.header_text || null,
        footer_text: defaults.footer_text || null,
        show_item_modifiers: defaults.show_item_modifiers,
        show_tax_breakdown: defaults.show_tax_breakdown,
        show_tip_line: defaults.show_tip_line,
        show_server_name: defaults.show_server_name,
        show_order_type: defaults.show_order_type,
        show_barcode: defaults.show_barcode,
        show_qr_code: defaults.show_qr_code,
        large_item_text: defaults.large_item_text,
        show_mods_large: defaults.show_mods_large,
        group_by_station: defaults.group_by_station,
        show_allergy_alert: defaults.show_allergy_alert,
        show_ready_by_time: defaults.show_ready_by_time,
      },
    });
  }, [clerkOrgId, selectedLocationId, activeTab, upsertMutation]);

  const handleCustomize = useCallback(() => {
    setCustomizingTabs((prev) => new Set(prev).add(activeTab));
  }, [activeTab]);

  // "All Locations" prompt
  if (isAllLocations) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Receipt Templates
          </h2>
          <p className="text-muted-foreground">
            Customize receipt layouts for your POS printers
          </p>
        </div>

        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <MapPin className="h-12 w-12 mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Select a Location</h3>
            <p className="text-muted-foreground max-w-md">
              Receipt templates are location-specific. Please select a location
              from the dropdown above to customize templates for that location.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Receipt Templates
          </h2>
          <p className="text-muted-foreground">
            Templates for{" "}
            <span className="font-medium">{selectedLocation?.name}</span>
          </p>
        </div>
        <Skeleton className="h-10 w-full max-w-[800px]" />
        <div className="flex flex-col lg:flex-row gap-6">
          <Skeleton className="h-[500px] w-full lg:w-[380px]" />
          <Skeleton className="h-[400px] flex-1" />
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Receipt Templates
          </h2>
          <p className="text-muted-foreground">
            Templates for{" "}
            <span className="font-medium">{selectedLocation?.name}</span>
          </p>
        </div>
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <AlertTriangle className="h-12 w-12 mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2">
              Failed to load templates
            </h3>
            <p className="text-muted-foreground max-w-md">
              {error instanceof Error
                ? error.message
                : "An error occurred while loading receipt templates."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Per-tab: check if the active template type has been saved
  const activeTemplateSaved = templates?.some(
    (t) => t.template_type === activeTab,
  );
  const showEditor = activeTemplateSaved || customizingTabs.has(activeTab);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Receipt Templates
        </h2>
        <p className="text-muted-foreground">
          Customize receipt layouts for{" "}
          <span className="font-medium">{selectedLocation?.name}</span>
        </p>
      </div>

      {/* Tabs */}
      <TemplateTypeTabs activeTab={activeTab} onChange={handleTabChange} />

      {/* Per-tab empty state or editor */}
      {!showEditor ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center text-center">
            <Receipt className="h-12 w-12 mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">
              Set Up{" "}
              {TEMPLATE_TYPES.find((t) => t.id === activeTab)?.label ??
                activeTab}
            </h3>
            <p className="text-muted-foreground max-w-md mb-6">
              This template type hasn&apos;t been configured yet. Use the
              recommended defaults to get started quickly, or customize the
              settings yourself.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleUseDefault}
                disabled={upsertMutation.isPending}
              >
                {upsertMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Use Default
              </Button>
              <Button variant="outline" onClick={handleCustomize}>
                <Settings2 className="h-4 w-4 mr-2" />
                Customize
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Preview */}
          <div className="lg:w-[380px] lg:shrink-0">
            <div className="lg:sticky lg:top-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Preview
              </h3>
              <ReceiptPreview
                templateType={activeTab}
                formState={formState}
                locationIdentity={selectedLocation ?? undefined}
              />
            </div>
          </div>

          {/* Right: Settings Form */}
          <div className="flex-1 min-w-0">
            <Card>
              <CardContent className="pt-6">
                <ReceiptSettingsForm
                  templateType={activeTab}
                  formState={formState}
                  onChange={handleFormChange}
                />

                {/* Save button */}
                <div className="mt-6 pt-4 border-t flex items-center justify-between">
                  {isDirty && (
                    <p className="text-sm text-muted-foreground">
                      You have unsaved changes
                    </p>
                  )}
                  <div className="ml-auto">
                    <Button
                      onClick={handleSave}
                      disabled={!isDirty || upsertMutation.isPending}
                    >
                      {upsertMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save Changes
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Unsaved changes dialog */}
      <AlertDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this template. Do you want to discard
              them and switch tabs?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
