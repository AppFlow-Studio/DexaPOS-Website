"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DiscountForm } from "@/components/discounts/discount-form";
import {
    useDiscount,
    useDiscountCategories,
    useDiscountMenuItems,
    useUpdateDiscount,
} from "@/hooks/use-discounts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DiscountFormInput } from "@/types/discount";
import { useLocations } from "@/app/dashboard/hooks/useLocations";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";

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

    return (
        <div className="space-y-6 w-full min-w-0">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                </Button>
                <div>
                    <h1 className="text-2xl font-semibold">Edit discount</h1>
                    <p className="text-sm text-muted-foreground">Update discount details.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Discount configuration</CardTitle>
                    <CardDescription>Adjust settings and save changes.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 4 }).map((_, idx) => (
                                <Skeleton key={idx} className="h-10 w-full" />
                            ))}
                        </div>
                    ) : defaultValues ? (
                        <DiscountForm
                            defaultValues={defaultValues}
                            onSubmit={handleSubmit}
                            submitting={updateDiscount.isPending}
                            categories={categories}
                            menuItems={menuItems}
                            locations={locations}
                            onCancel={() => router.push(`/dashboard/discounts/${discountId}`)}
                            submitLabel="Save changes"
                        />
                    ) : (
                        <p className="text-sm text-muted-foreground">Discount not found.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

