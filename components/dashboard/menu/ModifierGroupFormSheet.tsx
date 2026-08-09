"use client";

import * as React from "react";
import { AffectsTag } from "./AffectsTag";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Layers,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  GripVertical,
  Settings2,
  DollarSign,
  Trash2,
  Edit3,
  Sparkles,
  MapPin,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  CreateModifierGroup,
  UpdateModifierGroup,
  CreateModifierGroupItem,
  UpdateModifierGroupItem,
  DeleteModifierGroupItem,
  ReorderModifierGroupItems,
} from "@/app/dashboard/actions/modifier-groups";
import { UpsertLocationModifierGroupOverride } from "@/app/dashboard/actions/location-modifier-overrides";
import {
  ModifierGroupsModel,
  ModifierGroupItemsModel,
  LocationModifierGroupOverridesModel,
} from "@/types/db-modles";
import {
  useIsAllLocations,
  useSelectedLocation,
} from "@/app/dashboard/hooks/useLocationScopedModifiers";
import { ModifierItemOverrideDialog } from "./ModifierItemOverrideDialog";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { ModifierRecipeManager } from "@/app/dashboard/menu/components/ModifierRecipeManager";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";

// Form schema for modifier group
const modifierGroupSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters"),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  is_required: z.boolean().default(false),
  min_selections: z.number().min(0).default(0),
  max_selections: z.number().min(0).optional().nullable(),
  display_order: z.number().min(0).optional().nullable(),
});

type ModifierGroupFormValues = z.infer<typeof modifierGroupSchema>;

// Schema for option form (nested)
const optionSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  description: z.string().max(500).optional(),
  price_modifier: z.number().default(0),
  display_order: z.number().min(0).optional().nullable(),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

type OptionFormValues = z.infer<typeof optionSchema>;

interface TempOption {
  id: string;
  name: string;
  description?: string;
  price_modifier: number;
  display_order?: number | null;
  is_active: boolean;
  is_default: boolean;
  isNew: boolean;
}

function normalizeOptionOrder(options: TempOption[]) {
  return options.map((option, index) => ({
    ...option,
    display_order: index,
  }));
}

function sortTempOptions(options: TempOption[]) {
  return [...options].sort((a, b) => {
    const aOrder =
      typeof a.display_order === "number"
        ? a.display_order
        : Number.MAX_SAFE_INTEGER;
    const bOrder =
      typeof b.display_order === "number"
        ? b.display_order
        : Number.MAX_SAFE_INTEGER;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return a.name.localeCompare(b.name);
  });
}

interface ModifierGroupFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string | undefined;
  onSuccess?: () => void;
  editGroup?: ModifierGroupsModel & {
    modifier_group_items?: ModifierGroupItemsModel[];
    location_override?: LocationModifierGroupOverridesModel | null;
  };
}

export function ModifierGroupFormSheet({
  open,
  onOpenChange,
  clerkOrgId,
  onSuccess,
  editGroup,
}: ModifierGroupFormSheetProps) {
  const queryClient = useQueryClient();
  const { data: userInfo } = useUserInfo();
  const merchantId = userInfo?.members?.[0]?.organizations?.merchants?.id || "";
  const [options, setOptions] = React.useState<TempOption[]>([]);
  const [isAddOptionSheetOpen, setIsAddOptionSheetOpen] = React.useState(false);
  const [editingOption, setEditingOption] = React.useState<TempOption | null>(
    null,
  );
  const [expandedSections, setExpandedSections] = React.useState({
    selection: true,
    advanced: false,
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = React.useState(false);
  const [selectedItemForOverride, setSelectedItemForOverride] =
    React.useState<TempOption | null>(null);
  const [locationIsActive, setLocationIsActive] = React.useState<boolean>(true);
  const [isUpdatingLocationStatus, setIsUpdatingLocationStatus] =
    React.useState(false);

  // Location context
  const isAllLocations = useIsAllLocations();
  const selectedLocation = useSelectedLocation();

  // Determine editing permissions
  const isGlobalGroup = editGroup && !editGroup.location_id;
  const isLocationView = !isAllLocations;
  const canEditStructure = !isGlobalGroup || !isLocationView;
  const canSaveOptionOrder = canEditStructure || (!!editGroup && isLocationView);
  const canReorderOptions = canSaveOptionOrder;

  const form = useForm<ModifierGroupFormValues>({
    resolver: zodResolver(modifierGroupSchema),
    defaultValues: {
      name: "",
      description: "",
      is_required: false,
      min_selections: 0,
      max_selections: null,
      display_order: null,
    },
  });

  const optionForm = useForm<OptionFormValues>({
    resolver: zodResolver(optionSchema),
    defaultValues: {
      name: "",
      description: "",
      price_modifier: 0,
      display_order: null,
      is_active: true,
      is_default: false,
    },
  });

  // Reset form and options when editGroup changes
  React.useEffect(() => {
    if (editGroup) {
      form.reset({
        name: editGroup.name || "",
        description: editGroup.description || "",
        is_required: editGroup.is_required ?? false,
        min_selections: editGroup.min_selections ?? 0,
        max_selections: editGroup.max_selections ?? null,
        display_order: editGroup.display_order ?? null,
      });
      // Initialize options from editGroup
      if (editGroup.modifier_group_items) {
        setOptions(
          normalizeOptionOrder(
            sortTempOptions(
              editGroup.modifier_group_items.map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description || undefined,
                price_modifier: item.price_modifier,
                display_order: item.display_order ?? undefined,
                is_active: item.is_active ?? true,
                is_default: (item as any).is_default ?? false,
                isNew: false,
              })),
            ),
          ),
        );
      }
      // Initialize location status
      if (!isAllLocations) {
        const isActive =
          editGroup.location_override?.is_active ??
          (editGroup as any).is_active ??
          true;
        setLocationIsActive(isActive);
      }
    } else {
      form.reset({
        name: "",
        description: "",
        is_required: false,
        min_selections: 0,
        max_selections: null,
        display_order: null,
      });
      setOptions([]);
    }
  }, [editGroup, form]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleAddOption = (values: OptionFormValues) => {
    // If setting as default and max_selections is 1 (or null for single-select), unset other defaults
    const maxSel = form.getValues("max_selections");
    if (values.is_default && maxSel !== null && maxSel !== undefined && maxSel <= 1) {
      setOptions((prev) => prev.map((opt) => ({ ...opt, is_default: false })));
    }

    if (editingOption) {
      setOptions((prev) =>
        normalizeOptionOrder(
          prev.map((opt) =>
            opt.id === editingOption.id
              ? {
                  ...opt,
                  name: values.name,
                  description: values.description,
                  price_modifier: values.price_modifier,
                  display_order: values.display_order ?? opt.display_order ?? null,
                  is_active: values.is_active,
                  is_default: values.is_default,
                }
              : opt,
          ),
        ),
      );
      setEditingOption(null);
    } else {
      const newOption: TempOption = {
        id: `temp-${Date.now()}`,
        name: values.name,
        description: values.description,
        price_modifier: values.price_modifier,
        display_order: values.display_order ?? options.length,
        is_active: values.is_active,
        is_default: values.is_default,
        isNew: true,
      };
      setOptions((prev) => normalizeOptionOrder([...prev, newOption]));
    }
    optionForm.reset();
    setIsAddOptionSheetOpen(false);
  };

  const handleEditOption = (option: TempOption) => {
    setEditingOption(option);
    optionForm.reset({
      name: option.name,
      description: option.description || "",
      price_modifier: option.price_modifier,
      display_order: option.display_order ?? null,
      is_active: option.is_active,
      is_default: option.is_default,
    });
    setIsAddOptionSheetOpen(true);
  };

  const moveOption = (optionId: string, direction: "up" | "down") => {
    if (!canReorderOptions) return;

    setOptions((prev) => {
      const currentIndex = prev.findIndex((opt) => opt.id === optionId);
      if (currentIndex === -1) return prev;

      const targetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }

      const next = [...prev];
      [next[currentIndex], next[targetIndex]] = [
        next[targetIndex],
        next[currentIndex],
      ];
      return normalizeOptionOrder(next);
    });
  };

  const handleToggleDefault = (optionId: string) => {
    if (!canEditStructure) return;

    const maxSel = form.getValues("max_selections");
    const isSingleSelect = maxSel !== null && maxSel !== undefined && maxSel <= 1;

    setOptions((prev) => {
      const option = prev.find((o) => o.id === optionId);
      if (!option) return prev;

      if (!option.is_default) {
        // Setting as default
        if (isSingleSelect) {
          // Single-select: only one default allowed
          return prev.map((opt) => ({
            ...opt,
            is_default: opt.id === optionId,
          }));
        }
        // Multi-select: check if we'd exceed max_selections
        const currentDefaults = prev.filter((o) => o.is_default).length;
        if (maxSel && currentDefaults >= maxSel) {
          toast.error("Max defaults reached", {
            description: `You can only set up to ${maxSel} default options (matching max selections).`,
          });
          return prev;
        }
        return prev.map((opt) => ({
          ...opt,
          is_default: opt.id === optionId ? true : opt.is_default,
        }));
      } else {
        // Unsetting this default
        return prev.map((opt) => ({
          ...opt,
          is_default: opt.id === optionId ? false : opt.is_default,
        }));
      }
    });
  };

  const handleDeleteOption = (optionId: string) => {
    setOptions((prev) =>
      normalizeOptionOrder(prev.filter((opt) => opt.id !== optionId)),
    );
  };

  const onSubmit = async (values: ModifierGroupFormValues) => {
    if (!clerkOrgId) {
      toast.error("Organization Not Found", {
        description: "Please ensure you are logged into an organization.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const orderedOptions = normalizeOptionOrder(options);

      if (editGroup) {
        // Update existing group (only if allowed to edit structure)
        if (canEditStructure) {
          const updateResult = await UpdateModifierGroup(
            editGroup.id,
            {
              name: values.name,
              description: values.description,
              is_required: values.is_required,
              min_selections: values.min_selections,
              max_selections: values.max_selections,
              display_order: values.display_order ?? undefined,
            },
            selectedLocation?.id,
          );

          if (updateResult.error) {
            toast.error("Update Failed", {
              description: updateResult.error,
            });
            return;
          }

          // Handle options updates (only if allowed)
          for (const option of orderedOptions) {
            if (option.isNew) {
              // Create new option
              await CreateModifierGroupItem(
                editGroup.id,
                {
                  name: option.name,
                  description: option.description,
                  price_modifier: option.price_modifier,
                  display_order: option.display_order ?? undefined,
                  is_active: option.is_active,
                  is_default: option.is_default,
                  merchant_id: merchantId,
                },
                selectedLocation?.id,
              );
            } else {
              // Update existing option
              await UpdateModifierGroupItem(
                option.id,
                {
                  name: option.name,
                  description: option.description,
                  price_modifier: option.price_modifier,
                  display_order: option.display_order ?? undefined,
                  is_active: option.is_active,
                  is_default: option.is_default,
                },
                selectedLocation?.id,
              );
            }
          }

          // Delete removed options
          const currentOptionIds = orderedOptions
            .filter((o) => !o.isNew)
            .map((o) => o.id);
          const originalOptionIds =
            editGroup.modifier_group_items?.map((o) => o.id) || [];
          const deletedOptionIds = originalOptionIds.filter(
            (id) => !currentOptionIds.includes(id),
          );

          for (const id of deletedOptionIds) {
            await DeleteModifierGroupItem(id, selectedLocation?.id);
          }

          toast.success("Modifier Group Updated", {
            description: `"${values.name}" has been updated with ${
              orderedOptions.length
            } option${orderedOptions.length !== 1 ? "s" : ""}.`,
          });
        } else {
          if (!selectedLocation?.id) {
            toast.error("Location not found", {
              description: "Select a location before saving option order overrides.",
            });
            return;
          }

          const reorderResult = await ReorderModifierGroupItems(
            editGroup.id,
            orderedOptions.map((option, index) => ({
              modifierGroupItemId: option.id,
              displayOrder: option.display_order ?? index,
            })),
            selectedLocation.id,
          );

          if (reorderResult.error) {
            toast.error("Save Failed", {
              description: reorderResult.error,
            });
            return;
          }

          toast.success("Location option order updated", {
            description: `Saved ${orderedOptions.length} option${
              orderedOptions.length !== 1 ? "s" : ""
            } for ${selectedLocation.name}.`,
          });
        }
      } else {
        // Create new group with options
        const result = await CreateModifierGroup(clerkOrgId, {
          name: values.name,
          description: values.description,
          is_required: values.is_required,
          min_selections: values.min_selections,
          max_selections: values.max_selections ?? undefined,
          display_order: values.display_order ?? undefined,
          location_id:
            selectedLocation?.id == "all" ? null : selectedLocation?.id,
          options: orderedOptions.map((opt, index) => ({
            name: opt.name,
            description: opt.description,
            price_modifier: opt.price_modifier,
            display_order: opt.display_order ?? index,
            is_default: opt.is_default,
            merchant_id: merchantId,
          })),
        });

        if (result.error) {
          toast.error("Creation Failed", {
            description: result.error,
          });
          return;
        }

        toast.success("Modifier Group Created", {
          description: `"${values.name}" has been created with ${
            orderedOptions.length
          } option${orderedOptions.length !== 1 ? "s" : ""}.`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
      form.reset();
      setOptions([]);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error("Save Failed", {
        description: "Unable to save the modifier group. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setOptions([]);
    setEditingOption(null);
    onOpenChange(false);
  };

  const watchedValues = form.watch();

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent
          overlayClassName="bg-slate-950/40 backdrop-blur-md"
          className="w-full max-w-none gap-0 overflow-hidden max-h-[92vh] rounded-3xl border bg-card p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-5xl xl:max-w-6xl"
        >
          <div className="flex max-h-[92vh] min-h-0 min-w-0 flex-col">
          <DialogHeader className="shrink-0 min-w-0 bg-card px-4 sm:px-6 pt-6 pb-4 pr-14 sm:pr-14 text-left sm:text-left">
            <DialogTitle className="flex min-w-0 items-center gap-2 text-xl font-semibold tracking-tight sm:text-[1.625rem]">
              <Layers className="h-5 w-5 shrink-0 text-purple-500" />
              {!canEditStructure ? (
                <>Customize Global Group at Location</>
              ) : editGroup ? (
                "Edit Modifier Group"
              ) : (
                "Create Modifier Group"
              )}
            </DialogTitle>
            <DialogDescription className="max-w-full text-sm leading-6 text-pretty sm:max-w-[60ch]">
              {!canEditStructure ? (
                <>
                  Customize pricing, visibility, ordering, and stock for options
                  at{" "}
                  <Badge variant="secondary" className="ml-1">
                    {selectedLocation?.name}
                  </Badge>
                </>
              ) : (
                "Modifier groups let customers customize their orders (e.g., size, toppings, sauces)."
              )}
            </DialogDescription>
          </DialogHeader>

            <div className="min-h-0 flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-5 sm:px-6 lg:flex-row lg:items-start">
              {/* Form Section */}
              <div className="w-full min-w-0 flex-1 space-y-4">
                {editGroup && !canEditStructure && (
                  <div className="rounded-2xl border bg-card text-card-foreground p-4 animate-in fade-in slide-in-from-left-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-blue-500" />
                          Location Availability
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Toggle this group's availability for{" "}
                          {selectedLocation?.name}
                        </p>
                      </div>
                      <Switch
                        checked={locationIsActive}
                        disabled={isUpdatingLocationStatus}
                        onCheckedChange={async (checked) => {
                          if (!selectedLocation?.id || !merchantId) return;
                          setIsUpdatingLocationStatus(true);
                          try {
                            setLocationIsActive(checked);
                            await UpsertLocationModifierGroupOverride(
                              selectedLocation.id,
                              editGroup.id,
                              merchantId,
                              { is_active: checked },
                            );
                            toast.success(
                              checked ? "Group Enabled" : "Group Disabled",
                              {
                                description: `Modifier group is now ${
                                  checked ? "active" : "inactive"
                                } at this location.`,
                              },
                            );
                            queryClient.invalidateQueries({
                              queryKey: ["modifier-groups"],
                            });
                            queryClient.invalidateQueries({ queryKey: ["menu-items"] });
                            queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
                            invalidateOrderOutSync(queryClient);
                          } catch (error) {
                            setLocationIsActive(!checked); // Revert on error
                            toast.error("Update Failed");
                          } finally {
                            setIsUpdatingLocationStatus(false);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}

                <Form {...form}>
                  <form
                    id="modifier-group-form"
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                  >
                    {/* Basic Info */}
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        Basic Information
                      </h3>

                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }: { field: any }) => (
                          <FormItem>
                            <FormLabel>Group Name *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., Size, Toppings, Sauce"
                                className="h-12 text-lg"
                                disabled={!canEditStructure}
                                {...field}
                              />
                            </FormControl>
                            {!canEditStructure && (
                              <FormDescription className="text-xs text-muted-foreground">
                                Global group settings cannot be edited at
                                location level
                              </FormDescription>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }: { field: any }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <textarea
                                className="flex min-h-[80px] w-full resize-none rounded-2xl border-0 bg-muted/60 px-4 py-3 text-sm shadow-none ring-offset-background placeholder:text-muted-foreground focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="Optional description for this modifier group..."
                                disabled={!canEditStructure}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Selection Rules */}
                    <Collapsible
                      open={expandedSections.selection}
                      onOpenChange={() => toggleSection("selection")}
                    >
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center justify-between w-full p-3 rounded-2xl bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <span className="text-sm font-semibold flex items-center gap-2">
                            <Settings2 className="h-4 w-4 text-blue-500" />
                            Selection Rules
                          </span>
                          {expandedSections.selection ? (
                            <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                          ) : (
                            <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                          )}
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <FormField
                          control={form.control}
                          name="is_required"
                          render={({ field }: { field: any }) => (
                            <FormItem className="flex items-center justify-between rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">
                                  Required
                                </FormLabel>
                                <FormDescription>
                                  Customer must select an option from this group
                                </FormDescription>
                              </div>
                              <FormControl>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={field.value}
                                  onClick={() => {
                                    if (!canEditStructure) return;
                                    const next = !field.value;
                                    field.onChange(next);
                                    if (!next) form.setValue("min_selections", 0);
                                  }}
                                  disabled={!canEditStructure}
                                  className={cn(
                                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                    field.value ? "bg-primary" : "bg-muted",
                                    !canEditStructure &&
                                      "opacity-50 cursor-not-allowed",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                      field.value
                                        ? "translate-x-6"
                                        : "translate-x-1",
                                    )}
                                  />
                                </button>
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="min_selections"
                            render={({ field }: { field: any }) => (
                              <FormItem>
                                <FormLabel>Min Selections</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="0"
                                    disabled={!canEditStructure || !watchedValues.is_required}
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(
                                        parseInt(e.target.value) || 0,
                                      )
                                    }
                                  />
                                </FormControl>
                                <FormDescription>
                                  0 = no minimum
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="max_selections"
                            render={({ field }: { field: any }) => (
                              <FormItem>
                                <FormLabel>Max Selections</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="Unlimited"
                                    disabled={!canEditStructure}
                                    {...field}
                                    value={field.value ?? ""}
                                    onChange={(e) =>
                                      field.onChange(
                                        e.target.value
                                          ? parseInt(e.target.value)
                                          : null,
                                      )
                                    }
                                  />
                                </FormControl>
                                <FormDescription>
                                  Empty = unlimited
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Options Section */}
                    <div
                      className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300"
                      style={{ animationDelay: "200ms" }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                          <DollarSign className="h-4 w-4 shrink-0 text-green-500" />
                          Options ({options.length})
                        </h3>
                        {canEditStructure && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingOption(null);
                              optionForm.reset();
                              setIsAddOptionSheetOpen(true);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Option
                          </Button>
                        )}
                      </div>

                      {!canEditStructure && (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            <strong>Location View:</strong> You can customize
                            pricing, visibility, ordering, and stock for this
                            global group's options at this location, but cannot
                            add or remove options.
                          </p>
                        </div>
                      )}

                      {options.length === 0 ? (
                        <div className="rounded-2xl border border-dashed py-8 text-center">
                          <Layers className="h-12 w-12 mx-auto text-muted-foreground/30 mb-2" />
                          <p className="text-muted-foreground text-sm">
                            No options yet
                          </p>
                          <p className="text-muted-foreground text-xs mt-1">
                            Add options for customers to choose from
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {options.map((option, index) => (
                            <div
                              key={option.id}
                              className={cn(
                                "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-2xl border transition-colors duration-200",
                                "group animate-in fade-in slide-in-from-left-4 hover:bg-muted/50",
                                option.is_active
                                  ? "bg-card"
                                  : "bg-muted/50 opacity-60",
                              )}
                              style={{ animationDelay: `${index * 50}ms` }}
                            >
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="w-5 text-center text-xs font-medium text-muted-foreground tabular-nums">
                                  {index + 1}
                                </span>
                                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                              </div>

                              <div className="min-w-0 flex-1 basis-40">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="min-w-0 break-words font-medium">
                                    {option.name}
                                  </span>
                                  {option.isNew && (
                                    <Badge
                                      variant="secondary"
                                      className="shrink-0 text-xs"
                                    >
                                      New
                                    </Badge>
                                  )}
                                  {option.is_default && (
                                    <Badge
                                      variant="default"
                                      className="shrink-0 bg-yellow-500 text-xs text-white"
                                    >
                                      Default
                                    </Badge>
                                  )}
                                  {!option.is_active && (
                                    <Badge
                                      variant="outline"
                                      className="shrink-0 text-xs"
                                    >
                                      Inactive
                                    </Badge>
                                  )}
                                </div>
                                {option.description && (
                                  <p className="break-words text-sm text-muted-foreground">
                                    {option.description}
                                  </p>
                                )}
                              </div>

                              <div className="shrink-0 text-right tabular-nums">
                                <span
                                  className={cn(
                                    "font-semibold",
                                    option.price_modifier > 0
                                      ? "text-green-600"
                                      : option.price_modifier < 0
                                        ? "text-red-500"
                                        : "text-muted-foreground",
                                  )}
                                >
                                  {option.price_modifier > 0 ? "+" : ""}$
                                  {option.price_modifier.toFixed(2)}
                                </span>
                              </div>

                              {canEditStructure ? (
                                <div className="flex shrink-0 flex-wrap items-center gap-1 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => moveOption(option.id, "up")}
                                    disabled={index === 0}
                                    aria-label={`Move ${option.name} up`}
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => moveOption(option.id, "down")}
                                    disabled={index === options.length - 1}
                                    aria-label={`Move ${option.name} down`}
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                  {/* Set Default Toggle */}
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          type="button"
                                          variant={
                                            option.is_default
                                              ? "default"
                                              : "ghost"
                                          }
                                          size="sm"
                                          onClick={() =>
                                            handleToggleDefault(option.id)
                                          }
                                          className={cn(
                                            option.is_default &&
                                              "bg-yellow-500 hover:bg-yellow-600",
                                          )}
                                        >
                                          <Sparkles className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>
                                          {option.is_default
                                            ? "Remove default"
                                            : (watchedValues.max_selections && watchedValues.max_selections > 1)
                                              ? "Add as default"
                                              : "Set as default"}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditOption(option)}
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleDeleteOption(option.id)
                                    }
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex shrink-0 flex-wrap items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => moveOption(option.id, "up")}
                                    disabled={index === 0}
                                    aria-label={`Move ${option.name} up`}
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => moveOption(option.id, "down")}
                                    disabled={index === options.length - 1}
                                    aria-label={`Move ${option.name} down`}
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedItemForOverride(option);
                                      setOverrideDialogOpen(true);
                                    }}
                                  >
                                    <Settings2 className="h-4 w-4 mr-1" />
                                    Edit State
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </form>
                </Form>
              </div>

              {/* Preview Section */}
              <div className="w-full shrink-0 rounded-2xl bg-muted/40 p-6 lg:w-[340px] xl:w-[380px]">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Preview
                </h3>

                {/* Modifier Group Preview Card */}
                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4
                        className={cn(
                          "text-lg font-semibold transition-colors duration-200",
                          watchedValues.name
                            ? "text-foreground"
                            : "text-muted-foreground/50",
                        )}
                      >
                        {watchedValues.name || "Group Name"}
                      </h4>
                      {watchedValues.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {watchedValues.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {watchedValues.is_required ? (
                        <Badge variant="destructive">Required</Badge>
                      ) : (
                        <Badge variant="secondary">Optional</Badge>
                      )}
                    </div>
                  </div>

                  {/* Selection info */}
                  <div className="text-xs text-muted-foreground mb-3">
                    Select{" "}
                    {watchedValues.min_selections > 0
                      ? `${watchedValues.min_selections}`
                      : "any"}
                    {watchedValues.max_selections
                      ? ` to ${watchedValues.max_selections}`
                      : watchedValues.min_selections > 0
                        ? " or more"
                        : ""}
                  </div>

                  {/* Options preview */}
                  {options.length > 0 && (
                    <div className="space-y-2 border-t border-border/60 pt-3">
                      {options.slice(0, 5).map((option) => (
                        <div
                          key={option.id}
                          className={cn(
                            "flex items-center justify-between py-1",
                            !option.is_active && "opacity-50",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{option.name}</span>
                            {option.is_default && (
                              <Badge
                                variant="default"
                                className="text-xs bg-yellow-500 text-white px-1.5 py-0"
                              >
                                Default
                              </Badge>
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-sm font-medium",
                              option.price_modifier > 0
                                ? "text-green-600"
                                : option.price_modifier < 0
                                  ? "text-red-500"
                                  : "text-muted-foreground",
                            )}
                          >
                            {option.price_modifier !== 0 && (
                              <>
                                {option.price_modifier > 0 ? "+" : ""}$
                                {option.price_modifier.toFixed(2)}
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                      {options.length > 5 && (
                        <p className="text-xs text-muted-foreground text-center pt-2">
                          +{options.length - 5} more options
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          <DialogFooter className="shrink-0 bg-card px-4 sm:px-6 pt-4 pb-6">
            <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="rounded-full sm:min-w-[140px]"
              >
                Cancel
              </Button>
              {canSaveOptionOrder && (
                <Button
                  type="submit"
                  form="modifier-group-form"
                  disabled={isSubmitting}
                  className="rounded-full sm:min-w-[180px]"
                >
                  {isSubmitting ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      {editGroup
                        ? canEditStructure
                          ? "Save Changes"
                          : "Save Option Order"
                        : "Create Group"}
                      <AffectsTag ctx={{ level: 1 }} variant="save-button" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nested Sheet for Adding/Editing Options */}
      <Dialog
        open={isAddOptionSheetOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditingOption(null);
            optionForm.reset();
          }
          setIsAddOptionSheetOpen(open);
        }}
      >
        <DialogContent
          elevation="high"
          overlayClassName="bg-slate-950/30 backdrop-blur-sm"
          className="w-full max-w-none gap-0 overflow-hidden rounded-3xl border bg-card p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-2xl"
        >
          <div className="flex max-h-[min(88vh,860px)] min-h-0 min-w-0 flex-col">
          <DialogHeader className="shrink-0 bg-card px-4 pt-6 pb-4 pr-14 text-left sm:px-6 sm:pr-14 sm:text-left">
            <DialogTitle className="flex min-w-0 items-center gap-2 text-xl font-semibold tracking-tight sm:text-[1.625rem]">
              <Plus className="h-5 w-5 shrink-0 text-green-500" />
              {editingOption ? "Edit Option" : "Add Option"}
            </DialogTitle>
            <DialogDescription className="max-w-full text-sm leading-6 text-pretty sm:max-w-[60ch]">
              {editingOption
                ? "Update this modifier option"
                : "Add a new option to this modifier group"}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <Form {...optionForm}>
              <form
                id="option-form"
                onSubmit={optionForm.handleSubmit(handleAddOption)}
                className="space-y-4"
              >
                <FormField
                  control={optionForm.control}
                  name="name"
                  render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel>Option Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Small, Medium, Large"
                          className="h-12"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={optionForm.control}
                  name="description"
                  render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Optional description"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={optionForm.control}
                  name="price_modifier"
                  render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel>Price Adjustment</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground font-medium">
                            $
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            className="pl-7"
                            placeholder="0.00"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseFloat(e.target.value) || 0)
                            }
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Enter 0 for no change, positive for upcharge, negative
                        for discount
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={optionForm.control}
                  name="is_active"
                  render={({ field }: { field: any }) => (
                    <FormItem className="flex items-center justify-between rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>
                          Inactive options won't appear in the POS
                        </FormDescription>
                      </div>
                      <FormControl>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={field.value}
                          onClick={() => field.onChange(!field.value)}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                            field.value ? "bg-primary" : "bg-muted",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                              field.value ? "translate-x-6" : "translate-x-1",
                            )}
                          />
                        </button>
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Set Default */}
                <FormField
                  control={optionForm.control}
                  name="is_default"
                  render={({ field }: { field: any }) => (
                    <FormItem className="flex items-center justify-between rounded-2xl border-0 bg-yellow-50 p-4 shadow-none dark:bg-yellow-950/40">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-yellow-600" />
                          Set as Default
                        </FormLabel>
                        <FormDescription>
                          This option will be pre-selected automatically when ordering
                        </FormDescription>
                      </div>
                      <FormControl>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={field.value}
                          onClick={() => {
                            const maxSel = form.getValues("max_selections");
                            const isSingleSelect = maxSel !== null && maxSel !== undefined && maxSel <= 1;
                            if (!field.value && isSingleSelect) {
                              // Single-select: unset other defaults first
                              setOptions((prev) =>
                                prev.map((opt) => ({
                                  ...opt,
                                  is_default: false,
                                })),
                              );
                            }
                            field.onChange(!field.value);
                          }}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                            field.value ? "bg-yellow-500" : "bg-muted",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                              field.value ? "translate-x-6" : "translate-x-1",
                            )}
                          />
                        </button>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </form>
            </Form>

            {/* Recipe Manager Section */}
            <div className="mt-2 border-t border-border/60 pt-4">
              {editingOption && !editingOption.isNew ? (
                <ModifierRecipeManager
                  modifierItemId={editingOption.id}
                  modifierItemName={editingOption.name}
                  clerkOrgId={clerkOrgId || ""}
                  merchantId={merchantId}
                  locationId={selectedLocation?.id}
                  isEditable={canEditStructure}
                />
              ) : (
                <div className="rounded-2xl border border-dashed bg-muted/40 p-4 text-center">
                  <p className="text-sm font-medium">Recipe Management</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Please save the option first to add recipe ingredients.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 bg-card px-4 sm:px-6 pt-4 pb-6">
            <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddOptionSheetOpen(false);
                  setEditingOption(null);
                  optionForm.reset();
                }}
                className="rounded-full sm:min-w-[140px]"
              >
                Cancel
              </Button>
              <Button type="submit" form="option-form" className="rounded-full sm:min-w-[180px]">
                {editingOption ? "Update Option" : "Add Option"}
              </Button>
            </div>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Override Dialog for Location-Level Customization */}
      {selectedItemForOverride && selectedLocation && (
        <ModifierItemOverrideDialog
          open={overrideDialogOpen}
          onOpenChange={setOverrideDialogOpen}
          item={{
            id: selectedItemForOverride.id,
            name: selectedItemForOverride.name,
            price_modifier: selectedItemForOverride.price_modifier,
            display_order: selectedItemForOverride.display_order ?? null,
            is_active: selectedItemForOverride.is_active,
          }}
          locationName={selectedLocation.name}
        />
      )}
    </>
  );
}
