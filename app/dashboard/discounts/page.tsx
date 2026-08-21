"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { DiscountFilters } from "@/components/discounts/discount-filters";
import { DiscountTable } from "@/components/discounts/discount-table";
import {
    useBulkDelete,
    useBulkStatusUpdate,
    useDeleteDiscount,
    useDiscounts,
    useDiscountStats,
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
import { useLocations } from "@/app/dashboard/hooks/useLocations";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useSelectedLocation, useIsAllLocations, useIsSingleLocation } from "@/stores/location-store";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { buildPaginationMeta } from "@/lib/pagination";
import { useDebounce } from "@/lib/hooks/useDebounce";

export default function DiscountsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [filters, setFilters] = useState<DiscountListFilters>({
        search: "",
        isActive: "all",
        sortBy: "display_order",
        sortDir: "asc",
        hideExpired: false,
    });
    const debouncedSearch = useDebounce(filters.search ?? "", 300);
    const requestedPage = Number(searchParams.get("page"));
    const page = Number.isFinite(requestedPage)
        ? Math.max(1, Math.floor(requestedPage))
        : 1;
    const pageSize = 25;

    const {
        data,
        isLoading,
        isFetching,
    } = useDiscounts(
        { ...filters, search: debouncedSearch },
        { page, pageSize },
    );
    const { data: statsResult, isLoading: isLoadingStats } = useDiscountStats();
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

    const discounts =
        data?.success && Array.isArray(data.data) ? data.data : [];
    const pagination =
        data?.pagination ?? buildPaginationMeta(0, { page, pageSize });

    const stats = statsResult?.data ?? {
        total: 0,
        active: 0,
        scheduled: 0,
        expired: 0,
    };

    const setPage = useCallback((nextPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        if (nextPage <= 1) params.delete("page");
        else params.set("page", String(nextPage));
        const query = params.toString();
        router.replace(query ? `/dashboard/discounts?${query}` : "/dashboard/discounts", {
            scroll: false,
        });
    }, [router, searchParams]);

    useEffect(() => {
        if (data?.pagination && page > data.pagination.totalPages) {
            setPage(data.pagination.totalPages);
        }
    }, [data, page, setPage]);

    const handleFiltersChange = useCallback((nextFilters: DiscountListFilters) => {
        setFilters(nextFilters);
        if (page !== 1) setPage(1);
    }, [page, setPage]);

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
        handleFiltersChange({
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
                            isLoading={isLoadingStats}
                        />
                        <StatTile
                            label="Active"
                            value={stats.active}
                            meta="Available on POS now"
                            isLoading={isLoadingStats}
                        />
                        <StatTile
                            label="Scheduled"
                            value={stats.scheduled}
                            meta="Starts on a future date"
                            isLoading={isLoadingStats}
                        />
                        <StatTile
                            label="Expired"
                            value={stats.expired}
                            meta="Past their end date"
                            isLoading={isLoadingStats}
                        />
                    </StatRow>
                </div>
            </Panel>

            <Panel padded>
                <DiscountFilters
                    value={filters}
                    onChange={handleFiltersChange}
                    onCreate={handleCreate}
                />

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
                    <PaginationBar
                        pagination={pagination}
                        onPageChange={setPage}
                        isLoading={isFetching}
                        itemLabel="discounts"
                    />
                </div>
            </Panel>
        </PageShell>
    );
}
