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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function NewDiscountPage() {
    const router = useRouter();
    const createDiscount = useCreateDiscount();
    const { data: categoryData, isLoading: categoriesLoading } = useDiscountCategories();
    const { data: menuItemData, isLoading: menuItemsLoading } = useDiscountMenuItems();

    const categories = useMemo(
        () => (categoryData?.success ? categoryData.data : []),
        [categoryData]
    );
    const menuItems = useMemo(
        () => (menuItemData?.success ? menuItemData.data : []),
        [menuItemData]
    );

    const handleSubmit = async (values: DiscountFormInput) => {
        const result = await createDiscount.mutateAsync(values);
        if (result.success) {
            router.push("/dashboard/discounts");
        }
    };

    const loading = categoriesLoading || menuItemsLoading;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                </Button>
                <div>
                    <h1 className="text-2xl font-semibold">Create discount</h1>
                    <p className="text-sm text-muted-foreground">Set up discount details and targeting.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Discount configuration</CardTitle>
                    <CardDescription>Define how the discount behaves on POS.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 4 }).map((_, idx) => (
                                <Skeleton key={idx} className="h-10 w-full" />
                            ))}
                        </div>
                    ) : (
                        <DiscountForm
                            onSubmit={handleSubmit}
                            submitting={createDiscount.isPending}
                            categories={categories}
                            menuItems={menuItems}
                            onCancel={() => router.push("/dashboard/discounts")}
                            submitLabel="Create discount"
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

