"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Pencil, Trash2, Settings2, SlidersHorizontal, ShieldCheck } from "lucide-react";
import { DiscountCard } from "@/components/discounts/discount-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  PageShell,
  PageHeader,
  Panel,
  PanelSection,
  StatRow,
  StatTile,
} from "@/components/dashboard/shell";
import {
  useDeleteDiscount,
  useDiscount,
  useDiscountUsage,
  useDiscountCategories,
  useDiscountMenuItems,
  useUpdateDiscount,
} from "@/hooks/use-discounts";
import { Discount } from "@/types/discount";
import { DiscountFormValues } from "@/lib/validations/discount";
import { TargetingSheet } from "@/components/discounts/targeting-sheet";
import { useLocations } from "@/app/dashboard/hooks/useLocations";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useIsSingleLocation } from "@/stores/location-store";
import { cn } from "@/lib/utils";

/** DS-CTL-01 — the canonical pill control. */
const PILL_CONTROL = "h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm";

/** A label/value row inside a detail panel — spacing alone separates rows. */
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-medium tabular-nums">
        {value}
      </span>
    </div>
  );
}

export default function DiscountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const discountId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
      ? params.id[0]
      : null;

  const { data, isLoading } = useDiscount(discountId);
  const { data: usageData, isLoading: usageLoading } =
    useDiscountUsage(discountId);
  const { data: categoryData } = useDiscountCategories();
  const { data: menuItemData } = useDiscountMenuItems();
  const deleteMutation = useDeleteDiscount();
  const updateMutation = useUpdateDiscount(discountId || "");

  const [deleteMode, setDeleteMode] = useState<"soft" | "hard">("soft");
  const [targetingSheetOpen, setTargetingSheetOpen] = useState(false);

  const categories = useMemo(
    () =>
      categoryData?.success && categoryData.data
        ? categoryData.data.map((c) => ({ id: c.id, name: c.name }))
        : [],
    [categoryData]
  );
  const menuItems = useMemo(
    () =>
      menuItemData?.success && menuItemData.data
        ? menuItemData.data.map((m) => ({ id: m.id, name: m.name }))
        : [],
    [menuItemData]
  );

  const discount: Discount | null = useMemo(
    () => (data?.success && data.data ? (data.data as Discount) : null),
    [data?.data, data?.success]
  );

  const clerkOrgId = useClerkOrgId() || "";
  const { data: userInfo } = useUserInfo();
  const { data: locationsData = [] } = useLocations(clerkOrgId, userInfo?.id || "");
  const isSingleLocation = useIsSingleLocation();
  const locationName = useMemo(() => {
    if (!discount?.location_id) return null;
    return locationsData.find((l) => l.id === discount.location_id)?.name ?? null;
  }, [discount?.location_id, locationsData]);

  const usageCount = usageData?.success ? usageData.data?.usage_count ?? 0 : 0;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const formattedDays = discount?.applicable_days?.length
    ? discount.applicable_days.length === 7
      ? "Every day"
      : discount.applicable_days.map((d) => dayNames[d] ?? String(d)).join(", ")
    : "None";
  const formatTime = (value?: string | null) => (value ? value.slice(0, 5) : "");

  if (isLoading) {
    return (
      <PageShell>
        <div className="animate-in fade-in duration-500">
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="mt-3 h-9 w-64" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <Skeleton className="h-48 w-full rounded-3xl" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </PageShell>
    );
  }

  if (!discountId || !discount) {
    return (
      <PageShell>
        <PageHeader
          title="Discount not found"
          subtitle="This discount may have been deleted, or you may not have access to it."
          backHref="/dashboard/discounts"
          backLabel="Back to Discounts"
        />
      </PageShell>
    );
  }

  const handleDelete = async () => {
    const result = await deleteMutation.mutateAsync({
      id: discountId,
      mode: deleteMode,
    });
    if (result.success) {
      router.push("/dashboard/discounts");
    }
  };

  return (
    <PageShell>
      <PageHeader
        title={discount.name}
        subtitle="View discount configuration and usage."
        backHref="/dashboard/discounts"
        backLabel="Back to Discounts"
        actions={
          <>
            <Button
              variant="outline"
              className={cn(PILL_CONTROL, "gap-1.5")}
              onClick={() => router.push(`/dashboard/discounts/${discountId}/edit`)}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    PILL_CONTROL,
                    "gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              {/* The primitive ships `sm:rounded-lg`; the `sm:` prefix outranks a
                  bare `rounded-*`, so the override needs the breakpoint too. */}
              <AlertDialogContent className="rounded-3xl sm:rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {discount.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Deleting may impact active orders. Choose soft delete to
                    simply disable the discount, or hard delete to remove it
                    entirely.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <RadioGroup
                  value={deleteMode}
                  onValueChange={(val) => setDeleteMode(val as "soft" | "hard")}
                  className="gap-0 rounded-3xl border-0 bg-muted/60 p-1 shadow-none"
                >
                  <Label
                    htmlFor="delete-soft"
                    className="flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-background/60"
                  >
                    <RadioGroupItem value="soft" id="delete-soft" className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        Soft delete
                      </span>
                      <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">
                        Sets the discount inactive. It stays on past orders and
                        can be re-enabled later.
                      </span>
                    </span>
                  </Label>
                  <Label
                    htmlFor="delete-hard"
                    className="flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-background/60"
                  >
                    <RadioGroupItem value="hard" id="delete-hard" className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        Hard delete
                      </span>
                      <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">
                        Removes the record permanently. This cannot be undone.
                      </span>
                    </span>
                  </Label>
                </RadioGroup>

                <AlertDialogFooter>
                  <AlertDialogCancel className="h-9 rounded-full px-4 text-[0.8125rem] font-medium">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className={cn(
                      PILL_CONTROL,
                      "bg-destructive text-white hover:bg-destructive/90"
                    )}
                  >
                    {deleteMutation.isPending ? "Deleting…" : "Confirm"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <DiscountCard
        discount={discount}
        locationName={locationName}
        isSingleLocation={isSingleLocation}
      />

      <div className="grid min-w-0 gap-6 md:grid-cols-2">
        <Panel nested>
          <PanelSection
            icon={SlidersHorizontal}
            label="Constraints"
            caption="Usage limits and thresholds"
          >
            <div className="min-w-0">
              <DetailRow
                label="Min purchase"
                value={
                  discount.min_purchase_amount
                    ? `$${discount.min_purchase_amount}`
                    : "None"
                }
              />
              <DetailRow
                label="Max discount amount"
                value={
                  discount.max_discount_amount
                    ? `$${discount.max_discount_amount}`
                    : "Not limited"
                }
              />
              <DetailRow
                label="Max uses per day"
                value={discount.max_uses_per_day ?? "Unlimited"}
              />
              <DetailRow
                label="Max uses per order"
                value={discount.max_uses_per_order}
              />
              <DetailRow
                label="Stackable"
                value={discount.stackable ? "Yes" : "No"}
              />
            </div>
          </PanelSection>
        </Panel>

        <Panel nested>
          <PanelSection
            icon={Settings2}
            label="Targeting"
            caption="Scope, categories, and items"
            action={
              <Button
                variant="outline"
                onClick={() => setTargetingSheetOpen(true)}
                className={cn(PILL_CONTROL, "gap-1.5")}
              >
                <Settings2 className="h-4 w-4" />
                Edit
              </Button>
            }
          >
            <div className="min-w-0">
              <DetailRow
                label="Order type"
                value={
                  <span className="capitalize">
                    {discount.scope.replace("_", " ")}
                  </span>
                }
              />
              <DetailRow label="Applicable days" value={formattedDays} />
              <DetailRow
                label="Time window"
                value={
                  discount.applicable_hours_start && discount.applicable_hours_end
                    ? `${formatTime(discount.applicable_hours_start)} – ${formatTime(
                        discount.applicable_hours_end
                      )}`
                    : "All day"
                }
              />
              <DetailRow
                label="Exclude alcohol"
                value={discount.exclude_alcohol ? "Yes" : "No"}
              />
              <DetailRow
                label="Applies to categories"
                value={
                  discount.applies_to_categories?.length
                    ? `${discount.applies_to_categories.length} selected`
                    : "All"
                }
              />
              <DetailRow
                label="Exclude categories"
                value={
                  discount.exclude_categories?.length
                    ? `${discount.exclude_categories.length} selected`
                    : "None"
                }
              />
              <DetailRow
                label="Menu items"
                value={
                  discount.menu_item_ids?.length
                    ? `${discount.menu_item_ids.length} selected`
                    : "All"
                }
              />
            </div>
          </PanelSection>
        </Panel>
      </div>

      <Panel>
        <PanelSection
          icon={ShieldCheck}
          label="Approval & usage"
          caption="Manager approval and usage data"
        >
          <StatRow columns={3}>
            <StatTile
              label="Times used"
              value={usageCount}
              meta="Across all orders"
              isLoading={usageLoading}
            />
            <StatTile
              label="Manager approval"
              value={
                <span className="text-base">
                  {discount.requires_manager_approval ? "Required" : "Not required"}
                </span>
              }
              meta={
                discount.requires_manager_approval
                  ? "Staff need a manager PIN"
                  : "Any staff member can apply"
              }
            />
            <StatTile
              label="Display order"
              value={discount.display_order}
              meta="Lower numbers appear first on POS"
            />
          </StatRow>
        </PanelSection>
      </Panel>

      {/* Targeting Bottom Sheet */}
      {discount && (
        <TargetingSheet
          open={targetingSheetOpen}
          onOpenChange={setTargetingSheetOpen}
          categories={categories}
          menuItems={menuItems}
          values={{
            scope: discount.scope,
            applies_to_categories: discount.applies_to_categories || [],
            exclude_categories: discount.exclude_categories || [],
            exclude_alcohol: discount.exclude_alcohol || false,
            menu_item_ids: discount.menu_item_ids || [],
          }}
          onChange={async (updates) => {
            if (!discountId) return;

            // Build update payload - transform Discount to DiscountFormValues
            const updatePayload: DiscountFormValues = {
              name: discount.name,
              description: discount.description,
              discount_type: discount.discount_type,
              discount_value: discount.discount_value,
              min_purchase_amount: discount.min_purchase_amount,
              max_discount_amount: discount.max_discount_amount,
              start_date: discount.start_date
                ? new Date(discount.start_date)
                : null,
              end_date: discount.end_date ? new Date(discount.end_date) : null,
              is_active: discount.is_active,
              scope: discount.scope,
              location_id: discount.location_id,
              requires_manager_approval: discount.requires_manager_approval,
              max_uses_per_day: discount.max_uses_per_day,
              max_uses_per_order: discount.max_uses_per_order,
              applicable_days: discount.applicable_days,
              applicable_hours_start: discount.applicable_hours_start,
              applicable_hours_end: discount.applicable_hours_end,
              exclude_alcohol: discount.exclude_alcohol,
              exclude_categories: discount.exclude_categories,
              applies_to_categories: discount.applies_to_categories,
              stackable: discount.stackable,
              display_order: discount.display_order,
              menu_item_ids: discount.menu_item_ids,
              ...updates,
            };

            const result = await updateMutation.mutateAsync(updatePayload);
            if (result.success) {
              setTargetingSheetOpen(false);
            }
          }}
        />
      )}
    </PageShell>
  );
}
