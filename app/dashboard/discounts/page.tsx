"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Plus } from "lucide-react";
import { DiscountFilters } from "@/components/discounts/discount-filters";
import { DiscountTable } from "@/components/discounts/discount-table";
import {
    useBulkDelete,
    useBulkStatusUpdate,
    useDeleteDiscount,
    useDiscounts,
    useToggleDiscount,
} from "@/hooks/use-discounts";
import { DiscountListFilters } from "@/types/discount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DiscountsPage() {
    const router = useRouter();
    const [filters, setFilters] = useState<DiscountListFilters>({
        search: "",
        isActive: "all",
        sortBy: "display_order",
        sortDir: "asc",
    });

    const { data, isLoading } = useDiscounts(filters);
    const toggleStatus = useToggleDiscount();
    const bulkStatus = useBulkStatusUpdate();
    const bulkDelete = useBulkDelete();
    const deleteOne = useDeleteDiscount();

    const discounts = useMemo(
        () => (data?.success && Array.isArray(data.data) ? data.data : []),
        [data?.data, data?.success]
    );

    const handleCreate = () => router.push("/dashboard/discounts/new");
    const handleView = (id: string) => router.push(`/dashboard/discounts/${id}`);
    const handleEdit = (id: string) => router.push(`/dashboard/discounts/${id}/edit`);

    const emptyState =
        !isLoading && discounts.length === 0 ? (
            <Card>
                <CardHeader>
                    <CardTitle>No discounts yet</CardTitle>
                    <CardDescription>Create your first discount to get started.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleCreate}>Create discount</Button>
                </CardContent>
            </Card>
        ) : null;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                    <Banknote className="h-6 w-6" />
                    <div>
                        <h1 className="text-2xl font-semibold">Discounts</h1>
                        <p className="text-sm text-muted-foreground">
                            Manage POS discounts, activation, and targeting.
                        </p>
                    </div>
                </div>
                <Button onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    New discount
                </Button>
            </div>

            <DiscountFilters value={filters} onChange={setFilters} onCreate={handleCreate} />

            {emptyState ? (
                emptyState
            ) : (
                <DiscountTable
                    discounts={discounts}
                    isLoading={isLoading}
                    onToggleStatus={(id, isActive) => toggleStatus.mutate({ id, isActive })}
                    onBulkStatus={(ids, isActive) => bulkStatus.mutate({ ids, isActive })}
                    onBulkDelete={(ids) => bulkDelete.mutate({ ids })}
                    onDelete={(id) => deleteOne.mutate({ id })}
                    onView={handleView}
                    onEdit={handleEdit}
                />
            )}
        </div>
    );
}

