"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { DiscountForm } from "@/components/discounts/discount-form";
import {
    useCreateDiscount,
    useDiscountCategories,
    useDiscountMenuItems,
} from "@/hooks/use-discounts";
import { DiscountFormInput } from "@/types/discount";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocations } from "@/app/dashboard/hooks/useLocations";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";

export default function NewDiscountPage() {
    const router = useRouter();
    const createDiscount = useCreateDiscount();
    const { data: categoryData, isLoading: categoriesLoading } = useDiscountCategories();
    const { data: menuItemData, isLoading: menuItemsLoading } = useDiscountMenuItems();

    const clerkOrgId = useClerkOrgId() || "";
    const { data: userInfo } = useUserInfo();
    const { data: locationsData = [] } = useLocations(clerkOrgId, userInfo?.id || "");
    const { selectedLocationId } = useLocationStore();
    const isAllLocations = useIsAllLocations();

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
    const defaultLocationId = isAllLocations ? null : selectedLocationId;

    const handleSubmit = async (values: DiscountFormInput) => {
        const result = await createDiscount.mutateAsync(values);
        if (result.success) {
            router.push("/dashboard/discounts");
        }
    };

    const loading = categoriesLoading || menuItemsLoading;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Back</span>
                </Button>
                <div>
                    <h1 className="text-xl font-semibold">New discount</h1>
                    <p className="text-sm text-muted-foreground">Configure a discount for your POS.</p>
                </div>
            </div>

            {loading ? (
                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="space-y-6 lg:col-span-2">
                        <div className="rounded-xl border p-6 space-y-4">
                            {Array.from({ length: 5 }).map((_, idx) => (
                                <Skeleton key={idx} className="h-10 w-full" />
                            ))}
                        </div>
                        <div className="rounded-xl border p-6 space-y-4">
                            {Array.from({ length: 3 }).map((_, idx) => (
                                <Skeleton key={idx} className="h-10 w-full" />
                            ))}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="rounded-xl border p-6 space-y-4">
                            {Array.from({ length: 3 }).map((_, idx) => (
                                <Skeleton key={idx} className="h-10 w-full" />
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <DiscountForm
                    defaultValues={{ location_id: defaultLocationId }}
                    onSubmit={handleSubmit}
                    submitting={createDiscount.isPending}
                    categories={categories}
                    menuItems={menuItems}
                    locations={locations}
                    onCancel={() => router.push("/dashboard/discounts")}
                    submitLabel="Create discount"
                />
            )}
        </div>
    );
}

