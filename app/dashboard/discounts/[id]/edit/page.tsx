"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { DiscountForm } from "@/components/discounts/discount-form";
import {
    useDiscount,
    useDiscountCategories,
    useDiscountMenuItems,
    useUpdateDiscount,
} from "@/hooks/use-discounts";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader, Panel } from "@/components/dashboard/shell";
import { DiscountFormInput } from "@/types/discount";
import { useLocations } from "@/app/dashboard/hooks/useLocations";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useIsSingleLocation } from "@/stores/location-store";

export default function EditDiscountPage() {
    const params = useParams();
    const router = useRouter();
    const discountId =
        typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : null;

    const { data, isLoading } = useDiscount(discountId);
    const { data: categoryData, isLoading: categoriesLoading } = useDiscountCategories();
    const { data: menuItemData, isLoading: menuItemsLoading } = useDiscountMenuItems();
    const updateDiscount = useUpdateDiscount(discountId || "");

    const clerkOrgId = useClerkOrgId() || "";
    const { data: userInfo } = useUserInfo();
    const { data: locationsData = [] } = useLocations(clerkOrgId, userInfo?.id || "");
    const isSingleLocation = useIsSingleLocation();

    const categories = useMemo(
        () => (categoryData?.success ? categoryData.data : []),
        [categoryData]
    );
    const menuItems = useMemo(
        () => (menuItemData?.success ? menuItemData.data : []),
        [menuItemData]
    );
    const locations = useMemo(
        () => locationsData.map((l) => ({ id: l.id, name: l.name })),
        [locationsData]
    );

    const defaultValues: Partial<DiscountFormInput> | undefined = useMemo(
        () => (data?.success ? (data.data as any) : undefined),
        [data?.data, data?.success]
    );

    const handleSubmit = async (values: DiscountFormInput) => {
        if (!discountId) return;
        const result = await updateDiscount.mutateAsync(values);
        if (result.success) {
            router.push(`/dashboard/discounts/${discountId}`);
        }
    };

    const loading = isLoading || categoriesLoading || menuItemsLoading;
    const backHref = discountId ? `/dashboard/discounts/${discountId}` : "/dashboard/discounts";

    return (
        <PageShell>
            <PageHeader
                title="Edit discount"
                subtitle={defaultValues?.name ?? "Update discount details."}
                backHref={backHref}
                backLabel="Back to Discount"
            />

            {loading ? (
                <div className="grid min-w-0 gap-6 lg:grid-cols-3">
                    <div className="space-y-6 lg:col-span-2">
                        <div className="space-y-4 rounded-3xl border bg-card px-6 py-6">
                            {Array.from({ length: 5 }).map((_, idx) => (
                                <Skeleton key={idx} className="h-10 w-full" />
                            ))}
                        </div>
                        <div className="space-y-4 rounded-3xl border bg-card px-6 py-6">
                            {Array.from({ length: 3 }).map((_, idx) => (
                                <Skeleton key={idx} className="h-10 w-full" />
                            ))}
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-4 rounded-3xl border bg-card px-6 py-6">
                            {Array.from({ length: 3 }).map((_, idx) => (
                                <Skeleton key={idx} className="h-10 w-full" />
                            ))}
                        </div>
                    </div>
                </div>
            ) : defaultValues ? (
                <DiscountForm
                    defaultValues={defaultValues}
                    onSubmit={handleSubmit}
                    submitting={updateDiscount.isPending}
                    categories={categories}
                    menuItems={menuItems}
                    locations={locations}
                    isSingleLocation={isSingleLocation}
                    onCancel={() => router.push(backHref)}
                    submitLabel="Save changes"
                />
            ) : (
                <Panel padded>
                    <p className="text-sm text-muted-foreground">Discount not found.</p>
                </Panel>
            )}
        </PageShell>
    );
}
