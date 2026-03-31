"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CdnImageUploadField } from "@/components/ui/cdn-image-upload-field";
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
  Tag,
  ChevronDown,
  ChevronRight,
  Calendar,
  Sparkles,
  Palette,
  Settings2,
  MapPin,
  Flame,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMerchantCdnImageUpload } from "@/lib/cdn/use-merchant-cdn-image-upload";
import {
  CreateCategory,
  UpdateCategory,
} from "@/app/dashboard/actions/categories";
import { MenusModel, SchedulesModel } from "@/types/db-modles";
import {
  useSelectedLocation,
  useIsAllLocations,
} from "@/stores/location-store";
import {
  useCategorySchedules,
  useAssignScheduleToCategoryMutation,
  useRemoveScheduleFromCategoryMutation,
  useLocationScopedSchedules,
} from "@/app/dashboard/hooks/useLocationScopedSchedules";
import { ScheduleOverrideDialog } from "./ScheduleOverrideDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  usePrepStations,
  useCategoryPrepDefaults,
  useSetCategoryPrepDefault,
  useRemoveCategoryPrepDefault,
} from "@/app/dashboard/hooks/usePrepStations";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";

// Form schema
const categorySchema = z.object({
  name: z
    .string()
    .min(2, "Category name must be at least 2 characters")
    .max(100, "Category name must be less than 100 characters"),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  image: z.string().optional(),
  display_order: z.number().min(0).optional().nullable(),
  is_active: z.boolean().default(true),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface CategoryFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string | undefined;
  menus?: MenusModel[];
  schedules?: SchedulesModel[];
  onSuccess?: () => void;
  editCategory?: any;
}

export function CategoryFormSheet({
  open,
  onOpenChange,
  clerkOrgId,
  menus = [],
  schedules = [],
  onSuccess,
  editCategory,
}: CategoryFormSheetProps) {
  const queryClient = useQueryClient();
  const { data: userInfo } = useUserInfo();
  const merchantId =
    userInfo?.members?.[0]?.organizations?.merchants?.id || "";
  const [selectedMenu, setSelectedMenu] = React.useState<string | null>(null);
  const [selectedSchedules, setSelectedSchedules] = React.useState<string[]>(
    [],
  );
  const selectedLocation = useSelectedLocation();
  const isAllLocations = useIsAllLocations();

  // Prep stations for current location
  const { data: prepStations = [] } = usePrepStations(
    isAllLocations ? null : selectedLocation?.id,
  );
  const { data: categoryPrepDefaults = [] } = useCategoryPrepDefaults(
    isAllLocations ? null : selectedLocation?.id,
  );
  const setCategoryPrepDefaultMutation = useSetCategoryPrepDefault();
  const removeCategoryPrepDefaultMutation = useRemoveCategoryPrepDefault();

  const [expandedSections, setExpandedSections] = React.useState({
    appearance: false,
    scheduling: false,
    advanced: false,
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [scheduleOverrideDialog, setScheduleOverrideDialog] =
    React.useState<any>(null);
  const imageUpload = useMerchantCdnImageUpload({
    merchantId,
    category: "menu-categories",
    fileNamePrefix: "category",
  });

  // Fetch location-scoped schedules
  const { data: locationSchedules } = useLocationScopedSchedules();
  const { data: categorySchedules } = useCategorySchedules(
    editCategory?.id || "",
  );
  const assignScheduleMutation = useAssignScheduleToCategoryMutation();
  const removeScheduleMutation = useRemoveScheduleFromCategoryMutation();

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      description: "",
      image: "",
      display_order: null,
      is_active: true,
    },
  });

  // Reset form when editCategory changes
  React.useEffect(() => {
    if (editCategory) {
      form.reset({
        name: editCategory.name || "",
        description: editCategory.description || "",
        image: editCategory.image || "",
        display_order: editCategory.display_order || null,
        is_active: editCategory.is_active ?? true,
      });
      imageUpload.reset(editCategory.image || null);
      // Set selected menu from editCategory
      if (editCategory.menu_id) {
        setSelectedMenu(editCategory.menu_id);
      } else {
        setSelectedMenu(null);
      }
    } else {
      form.reset({
        name: "",
        description: "",
        image: "",
        display_order: null,
        is_active: true,
      });
      imageUpload.reset(null);
      setSelectedMenu(null);
      setSelectedSchedules([]);
    }
  }, [editCategory, form, imageUpload.reset]);

  // Load category schedules when editing
  React.useEffect(() => {
    if (editCategory && categorySchedules) {
      setSelectedSchedules(categorySchedules.map((s: any) => s.id));
    }
  }, [editCategory, categorySchedules]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleToggleSchedule = (scheduleId: string) => {
    if (!editCategory) {
      // If creating new category, just toggle in state
      setSelectedSchedules((prev) =>
        prev.includes(scheduleId)
          ? prev.filter((id) => id !== scheduleId)
          : [...prev, scheduleId],
      );
      return;
    }

    // If editing, call the mutation
    if (selectedSchedules.includes(scheduleId)) {
      removeScheduleMutation.mutate(
        {
          categoryId: editCategory.id,
          scheduleId,
        },
        {
          onSuccess: () => {
            setSelectedSchedules((prev) =>
              prev.filter((id) => id !== scheduleId),
            );
          },
        },
      );
    } else {
      assignScheduleMutation.mutate(
        {
          categoryId: editCategory.id,
          scheduleId,
        },
        {
          onSuccess: () => {
            setSelectedSchedules((prev) => [...prev, scheduleId]);
          },
        },
      );
    }
  };

  const onSubmit = async (values: CategoryFormValues) => {
    let uploadedAsset: { cdnUrl: string; storagePath: string } | undefined;

    if (!clerkOrgId) {
      toast.error("Organization Not Found", {
        description: "Please ensure you are logged into an organization.",
      });
      return;
    }

    if (imageUpload.hasPendingChange && !merchantId) {
      toast.error("Merchant Not Found", {
        description: "Please reload and try the upload again.",
      });
      return;
    }

    console.log("values NEW CATEGORY FORM SHEET", values);

    setIsSubmitting(true);
    try {
      const resolvedImage = await imageUpload.resolveImageValue();
      uploadedAsset = resolvedImage.uploadedAsset;
      let result;

      if (editCategory) {
        // Update existing category
        result = await UpdateCategory(
          editCategory.id,
          {
            name: values.name,
            description: values.description,
            image: resolvedImage.value ?? undefined,
            display_order: values.display_order ?? undefined,
            is_active: values.is_active,
          },
          selectedLocation?.id ?? null,
        );
      } else {
        // Create new category
        result = await CreateCategory(
          clerkOrgId,
          selectedLocation?.id ?? null,
          {
            name: values.name,
            description: values.description,
            image: resolvedImage.value ?? undefined,
            display_order: values.display_order ?? undefined,
            is_active: values.is_active,
            menu_id: selectedMenu || undefined,
          },
        );
      }

      if (result.error) {
        if (uploadedAsset) {
          await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error);
        }
        toast.error("Operation Failed", {
          description: result.error,
        });
        return;
      }

      toast.success(editCategory ? "Category Updated" : "Category Created", {
        description: editCategory
          ? `"${values.name}" has been updated successfully.`
          : `"${values.name}" has been added to your menu.`,
      });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      form.reset();
      setSelectedMenu(null);
      setSelectedSchedules([]);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      if (uploadedAsset) {
        await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error);
      }
      toast.error(editCategory ? "Update Failed" : "Creation Failed", {
        description: editCategory
          ? "Unable to update the category. Please try again."
          : "Unable to create the category. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setSelectedMenu(null);
    setSelectedSchedules([]);
    onOpenChange(false);
  };

  const watchedValues = form.watch();

  return (
    <BottomSheet open={open} onOpenChange={handleClose}>
      <BottomSheetContent className="!h-[95vh]">
        <BottomSheetHeader>
          <BottomSheetTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            {editCategory ? "Edit Category" : "Create New Category"}
          </BottomSheetTitle>
          <BottomSheetDescription>
            Categories help organize your menu items for easy navigation.
          </BottomSheetDescription>
        </BottomSheetHeader>

        <BottomSheetBody>
          <div className="flex flex-col lg:flex-row h-full gap-6">
            {/* Form Section */}
            <div className="flex-1 overflow-y-auto space-y-4 px-2">
              <Form {...form}>
                <form
                  id="category-form"
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  {/* Basic Info Section */}
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Basic Information
                    </h3>

                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category Name *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., Appetizers, Main Course, Desserts"
                              className="h-12 text-lg"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <textarea
                              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                              placeholder="Optional description for this category..."
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Menu Assignment */}
                  {/* <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300" style={{ animationDelay: '100ms' }}>
                                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                            Menu Assignment
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            Leave empty to make this category available across all menus (merchant global).
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedMenu(null)}
                                                className={cn(
                                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                                                    "border hover:scale-105 active:scale-95",
                                                    selectedMenu === null
                                                        ? "bg-primary text-primary-foreground border-primary shadow-md"
                                                        : "bg-background border-border hover:border-primary/50"
                                                )}
                                            >
                                                <Sparkles className="h-4 w-4 inline-block mr-2" />
                                                Global (All Menus)
                                            </button>
                                            {menus.map((menu) => (
                                                <button
                                                    key={menu.id}
                                                    type="button"
                                                    onClick={() => setSelectedMenu(menu.id)}
                                                    className={cn(
                                                        "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                                                        "border hover:scale-105 active:scale-95",
                                                        selectedMenu === menu.id
                                                            ? "bg-primary text-primary-foreground border-primary shadow-md"
                                                            : "bg-background border-border hover:border-primary/50"
                                                    )}
                                                >
                                                    {menu.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div> */}

                  {/* Appearance Section */}
                  <Collapsible
                    open={expandedSections.appearance}
                    onOpenChange={() => toggleSection("appearance")}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <span className="text-sm font-semibold flex items-center gap-2">
                          <Palette className="h-4 w-4 text-pink-500" />
                          Appearance
                        </span>
                        {expandedSections.appearance ? (
                          <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                        ) : (
                          <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <FormField
                        control={form.control}
                        name="image"
                        render={() => (
                          <FormItem>
                            <FormLabel>Category Image</FormLabel>
                            <FormControl>
                              <CdnImageUploadField
                                disabled={isSubmitting}
                                helperText="Uploads to Bunny CDN when you save the category."
                                onClear={imageUpload.clear}
                                onFileSelect={imageUpload.selectFile}
                                previewUrl={imageUpload.previewUrl}
                                selectedFileName={imageUpload.selectedFileName}
                                uploadLabel="Upload category image"
                                uploading={imageUpload.isUploading}
                              />
                            </FormControl>
                            <FormDescription>
                              Optional image to represent this category
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Scheduling Section */}
                  <Collapsible
                    open={expandedSections.scheduling}
                    onOpenChange={() => toggleSection("scheduling")}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <span className="text-sm font-semibold flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-blue-500" />
                          Availability Schedule
                          {selectedSchedules.length > 0 && (
                            <Badge variant="secondary" className="ml-2">
                              {selectedSchedules.length}
                            </Badge>
                          )}
                        </span>
                        {expandedSections.scheduling ? (
                          <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                        ) : (
                          <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      {!locationSchedules || locationSchedules.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          No schedules available. Create schedules first to
                          control when this category is available.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {locationSchedules.map((schedule: any) => (
                            <div
                              key={schedule.id}
                              className="flex items-center gap-2"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleSchedule(schedule.id)
                                }
                                className={cn(
                                  "flex-1 p-3 rounded-lg border text-left transition-all duration-200",
                                  "hover:shadow-md",
                                  selectedSchedules.includes(schedule.id)
                                    ? "border-primary bg-primary/5 shadow-sm"
                                    : "border-border hover:border-primary/50",
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <div className="font-medium">
                                        {schedule.name}
                                      </div>
                                      {schedule.is_location_specific && (
                                        <Badge
                                          variant="outline"
                                          className="text-xs"
                                        >
                                          <MapPin className="h-3 w-3 mr-1" />
                                          Location
                                        </Badge>
                                      )}
                                      {schedule.has_location_override && (
                                        <Badge
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          Override
                                        </Badge>
                                      )}
                                    </div>
                                    {schedule.description && (
                                      <div className="text-sm text-muted-foreground mt-1">
                                        {schedule.description}
                                      </div>
                                    )}
                                  </div>
                                  <div
                                    className={cn(
                                      "w-5 h-5 rounded-full border-2 transition-all duration-200 flex items-center justify-center ml-2",
                                      selectedSchedules.includes(schedule.id)
                                        ? "border-primary bg-primary"
                                        : "border-muted-foreground",
                                    )}
                                  >
                                    {selectedSchedules.includes(
                                      schedule.id,
                                    ) && (
                                      <svg
                                        className="w-3 h-3 text-primary-foreground"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={3}
                                          d="M5 13l4 4L19 7"
                                        />
                                      </svg>
                                    )}
                                  </div>
                                </div>
                              </button>
                              {!isAllLocations &&
                                !schedule.is_location_specific && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setScheduleOverrideDialog(schedule);
                                    }}
                                  >
                                    <Settings2 className="h-4 w-4" />
                                  </Button>
                                )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Kitchen Routing (Prep Station Default) */}
                  {editCategory && !isAllLocations && selectedLocation && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Flame className="h-4 w-4 text-orange-500" />
                        Kitchen Routing
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Set a default prep station for all items in this
                        category. Items can override this at the item level.
                      </p>
                      {prepStations.filter((ps) => ps.is_active).length ===
                      0 ? (
                        <div className="flex items-start gap-2 p-3 bg-muted/50 border rounded-lg text-sm">
                          <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <p className="text-muted-foreground">
                            No prep stations configured for this location. Create
                            prep stations in Settings to enable kitchen routing.
                          </p>
                        </div>
                      ) : (
                        <Select
                          value={
                            categoryPrepDefaults.find(
                              (d) => d.category_id === editCategory.id,
                            )?.prep_station_id || "__none__"
                          }
                          onValueChange={async (val) => {
                            if (!clerkOrgId || !selectedLocation) return;
                            // Get merchant_id from the prep station data or from defaults
                            const merchantIdFromStation =
                              prepStations[0]?.merchant_id;
                            if (val === "__none__") {
                              removeCategoryPrepDefaultMutation.mutate({
                                locationId: selectedLocation.id,
                                categoryId: editCategory.id,
                              });
                            } else {
                              setCategoryPrepDefaultMutation.mutate({
                                locationId: selectedLocation.id,
                                categoryId: editCategory.id,
                                prepStationId: val,
                                merchantId:
                                  merchantIdFromStation || editCategory.merchant_id,
                              });
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="No default (routes to Expo)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              None (routes to Expo)
                            </SelectItem>
                            {prepStations
                              .filter((ps) => ps.is_active)
                              .map((ps) => (
                                <SelectItem key={ps.id} value={ps.id}>
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="h-3 w-3 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: ps.color }}
                                    />
                                    {ps.name}
                                  </div>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                  {editCategory && isAllLocations && (
                    <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm dark:bg-blue-950/30 dark:border-blue-900">
                      <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0 dark:text-blue-400" />
                      <p className="text-blue-800 dark:text-blue-300">
                        Prep station routing is location-specific. Select a
                        location to set a default prep station for this category.
                      </p>
                    </div>
                  )}

                  {/* Advanced Settings */}
                  <Collapsible
                    open={expandedSections.advanced}
                    onOpenChange={() => toggleSection("advanced")}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <span className="text-sm font-semibold flex items-center gap-2">
                          <Settings2 className="h-4 w-4 text-gray-500" />
                          Advanced Settings
                        </span>
                        {expandedSections.advanced ? (
                          <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                        ) : (
                          <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <FormField
                        control={form.control}
                        name="display_order"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Display Order</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                placeholder="Auto"
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
                              Lower numbers appear first. Leave empty for
                              automatic ordering.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="is_active"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">
                                Active
                              </FormLabel>
                              <FormDescription>
                                Inactive categories won't appear in the POS
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
                    </CollapsibleContent>
                  </Collapsible>
                </form>
              </Form>
            </div>

            {/* Preview Section */}
            <div className="w-full lg:w-1/3 bg-muted/30 rounded-lg p-6 flex flex-col">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Preview
              </h3>

              {/* Category Preview Card */}
              <div className="bg-card rounded-xl border-2 border-border/50 p-4 shadow-lg transition-all duration-300 hover:shadow-xl">
                {imageUpload.previewUrl ? (
                  <div className="aspect-video rounded-lg bg-muted mb-3 overflow-hidden">
                    <img
                      src={imageUpload.previewUrl}
                      alt="Category preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                ) : (
                  <div className="aspect-video rounded-lg bg-muted/50 mb-3 flex items-center justify-center">
                    <Tag className="h-12 w-12 text-muted-foreground/30" />
                  </div>
                )}

                <h4
                  className={cn(
                    "text-lg font-semibold transition-colors duration-200",
                    watchedValues.name
                      ? "text-foreground"
                      : "text-muted-foreground/50",
                  )}
                >
                  {watchedValues.name || "Category Name"}
                </h4>

                {watchedValues.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {watchedValues.description}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <Badge
                    variant={watchedValues.is_active ? "default" : "secondary"}
                  >
                    {watchedValues.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>

              {/* Info Summary */}
              <div className="mt-6 space-y-2 text-sm">
                {selectedSchedules.length > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    {selectedSchedules.length} schedule
                    {selectedSchedules.length !== 1 ? "s" : ""} assigned
                  </div>
                )}
              </div>
            </div>
          </div>
        </BottomSheetBody>

        <BottomSheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            className="flex-1 lg:flex-none"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="category-form"
            disabled={isSubmitting}
            className="flex-1 lg:flex-none lg:min-w-[150px]"
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
                {editCategory ? "Saving..." : "Creating..."}
              </>
            ) : editCategory ? (
              "Save Changes"
            ) : (
              "Create Category"
            )}
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>

      {/* Schedule Override Dialog */}
      {scheduleOverrideDialog && selectedLocation && (
        <ScheduleOverrideDialog
          open={!!scheduleOverrideDialog}
          onOpenChange={(open) => !open && setScheduleOverrideDialog(null)}
          schedule={scheduleOverrideDialog}
          locationName={selectedLocation.name}
        />
      )}
    </BottomSheet>
  );
}
