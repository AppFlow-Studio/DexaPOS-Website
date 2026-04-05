"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, X } from "lucide-react";
import {
  getPlatformMerchants,
  getPlatformLocations,
  type PlatformMerchant,
  type PlatformLocation,
} from "@/app/manage/actions/hq-platform/transactions";
import type { HQCashDrawerFilters } from "@/app/manage/actions/hq-platform/cash-drawer-analytics";

interface CashDrawerFilterBarProps {
  filters: HQCashDrawerFilters;
  onFiltersChange: (next: HQCashDrawerFilters) => void;
}

export function CashDrawerFilterBar({ filters, onFiltersChange }: CashDrawerFilterBarProps) {
  const [merchants, setMerchants] = useState<PlatformMerchant[]>([]);
  const [locations, setLocations] = useState<PlatformLocation[]>([]);

  useEffect(() => {
    getPlatformMerchants().then(setMerchants);
  }, []);

  useEffect(() => {
    if (!filters.merchantIds || filters.merchantIds.length === 0) {
      getPlatformLocations().then(setLocations);
    } else {
      getPlatformLocations(filters.merchantIds).then(setLocations);
    }
  }, [filters.merchantIds]);

  function toggleMerchant(id: string) {
    const current = filters.merchantIds ?? [];
    const next = current.includes(id) ? current.filter((m) => m !== id) : [...current, id];
    // Reset location selection when merchants change
    onFiltersChange({ ...filters, merchantIds: next, locationIds: [] });
  }

  function toggleLocation(id: string) {
    const current = filters.locationIds ?? [];
    const next = current.includes(id) ? current.filter((l) => l !== id) : [...current, id];
    onFiltersChange({ ...filters, locationIds: next });
  }

  function clearAll() {
    onFiltersChange({});
  }

  const selectedMerchantCount = filters.merchantIds?.length ?? 0;
  const selectedLocationCount = filters.locationIds?.length ?? 0;
  const hasFilters = selectedMerchantCount > 0 || selectedLocationCount > 0;

  const merchantLabel =
    selectedMerchantCount === 0
      ? "All Merchants"
      : selectedMerchantCount === 1
      ? (merchants.find((m) => m.id === filters.merchantIds![0])?.name ?? "1 Merchant")
      : `${selectedMerchantCount} Merchants`;

  const locationLabel =
    selectedLocationCount === 0
      ? "All Locations"
      : selectedLocationCount === 1
      ? (locations.find((l) => l.id === filters.locationIds![0])?.name ?? "1 Location")
      : `${selectedLocationCount} Locations`;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Merchant filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            {merchantLabel}
            {selectedMerchantCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-xs">
                {selectedMerchantCount}
              </Badge>
            )}
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
          <DropdownMenuLabel>Merchants</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {merchants.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading...</div>
          )}
          {merchants.map((m) => (
            <DropdownMenuCheckboxItem
              key={m.id}
              checked={(filters.merchantIds ?? []).includes(m.id)}
              onCheckedChange={() => toggleMerchant(m.id)}
            >
              {m.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Location filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            {locationLabel}
            {selectedLocationCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-xs">
                {selectedLocationCount}
              </Badge>
            )}
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
          <DropdownMenuLabel>Locations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {locations.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              {selectedMerchantCount > 0 ? "No locations found" : "Loading..."}
            </div>
          )}
          {locations.map((l) => (
            <DropdownMenuCheckboxItem
              key={l.id}
              checked={(filters.locationIds ?? []).includes(l.id)}
              onCheckedChange={() => toggleLocation(l.id)}
            >
              {l.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear button */}
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={clearAll}>
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
