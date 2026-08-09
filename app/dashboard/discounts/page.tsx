"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import {
    PageShell,
    PageHeader,
    LocationIndicator,
    Panel,
    StatRow,
    StatTile,
} from "@/components/dashboard/shell";
import { discountStatus } from "@/lib/constants/discount-status";
import { useLocations } from "@/app/dashboard/hooks/useLocations";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useSelectedLocation, useIsAllLocations, useIsSingleLocation } from "@/stores/location-store";

export default function DiscountsPage() {
    const router = useRouter();
    const [filters, setFilters] = useState<DiscountListFilters>({
        search: "",
        isActive: "all",
        sortBy: "display_order",
        sortDir: "asc",
        hideExpired: false,
    });

    const { data, isLoading } = useDiscounts(filters);
    const toggleStatus = useToggleDiscount();
    const bulkStatus = useBulkStatusUpdate();
    const bulkDelete = useBulkDelete();
    const deleteOne = useDeleteDiscount();

    const clerkOrgId = useClerkOrgId() || "";
    const { data: userInfo } = useUserInfo();
    const { data: locations = [] } = useLocations(clerkOrgId, userInfo?.id || "");
    const selectedLocation = useSelectedLocation();
    const isAllLocations = useIsAllLocations();
    const isSingleLocation = useIsSingleLocation();

    const locationNameById = useMemo(() => {
        const map: Record<string, string> = {};
        locations.forEach((loc) => {
            if (loc.id) map[loc.id] = loc.name;
        });
        return map;
    }, [locations]);

    const discounts = useMemo(
        () => (data?.success && Array.isArray(data.data) ? data.data : []),
        [data?.data, data?.success]
    );

    const stats = useMemo(() => {
        let active = 0;
        let scheduled = 0;
        let expired = 0;
        discounts.forEach((discount) => {
            const status = discountStatus(discount);
            if (status === "active") active += 1;
            else if (status === "scheduled") scheduled += 1;
            else if (status === "expired") expired += 1;
        });
        return { total: discounts.length, active, scheduled, expired };
    }, [discounts]);

    const handleCreate = () => router.push("/dashboard/discounts/new");
    const handleView = (id: string) => router.push(`/dashboard/discounts/${id}`);
    const handleEdit = (id: string) => router.push(`/dashboard/discounts/${id}/edit`);
    const filtersAreDirty =
        !!filters.search ||
        (filters.isActive !== "all" && filters.isActive !== undefined) ||
        (filters.sortBy ?? "display_order") !== "display_order" ||
        (filters.sortDir ?? "asc") !== "asc" ||
        !!filters.hideExpired;
    const resetFilters = () =>
        setFilters({
            search: "",
            isActive: "all",
            sortBy: "display_order",
            sortDir: "asc",
            hideExpired: false,
        });

    return (
        <PageShell>
            <PageHeader
                title="Discounts"
                subtitle="Manage POS discounts, activation, and targeting."
                indicator={
                    !isSingleLocation ? (
                        <LocationIndicator
                            isAllLocations={isAllLocations}
                            locationName={selectedLocation?.name}
                        />
                    ) : undefined
                }
                actions={
                    <Button
                        onClick={handleCreate}
                        className="h-9 gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                    >
                        <Plus className="h-4 w-4" />
                        New discount
                    </Button>
                }
            />

            <Panel>
                <div className="px-6 py-6">
                    <StatRow columns={4}>
                        <StatTile
                            label="Total discounts"
                            value={stats.total}
                            meta={
                                !isSingleLocation && !isAllLocations && selectedLocation
                                    ? `${selectedLocation.name} + global`
                                    : "All discounts"
                            }
                            isLoading={isLoading}
                        />
                        <StatTile
                            label="Active"
                            value={stats.active}
                            meta="Available on POS now"
                            isLoading={isLoading}
                        />
                        <StatTile
                            label="Scheduled"
                            value={stats.scheduled}
                            meta="Starts on a future date"
                            isLoading={isLoading}
                        />
                        <StatTile
                            label="Expired"
                            value={stats.expired}
                            meta="Past their end date"
                            isLoading={isLoading}
                        />
                    </StatRow>
                </div>
            </Panel>

            <Panel padded>
                <DiscountFilters value={filters} onChange={setFilters} onCreate={handleCreate} />

                <div className="mt-6">
                    <DiscountTable
                        discounts={discounts}
                        isLoading={isLoading}
                        locationNameById={locationNameById}
                        isSingleLocation={isSingleLocation}
                        onCreate={handleCreate}
                        onToggleStatus={(id, isActive) => toggleStatus.mutate({ id, isActive })}
                        onBulkStatus={(ids, isActive) => bulkStatus.mutate({ ids, isActive })}
                        onBulkDelete={(ids, mode) => bulkDelete.mutate({ ids, mode })}
                        onDelete={(id, mode) => deleteOne.mutate({ id, mode })}
                        onView={handleView}
                        onEdit={handleEdit}
                        showMobileReset={filtersAreDirty}
                        onResetFilters={resetFilters}
                    />
                </div>
            </Panel>
        </PageShell>
    );
}
