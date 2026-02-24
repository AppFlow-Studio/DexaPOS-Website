"use client";

import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { CustomerListItem } from "@/types/customer";
import { getCustomerStatus } from "@/types/customer";

export interface CustomerFiltersState {
  status: string | null;
  tags: string[];
  spendMin: number | null;
  spendMax: number | null;
  lastVisit: string | null;
  hasEmail: boolean | null;
}

interface CustomerFiltersProps {
  customers: CustomerListItem[];
  filters: CustomerFiltersState;
  onFiltersChange: (filters: CustomerFiltersState) => void;
}

const SPEND_PRESETS = [
  { label: "$0 - $50", min: 0, max: 50 },
  { label: "$50 - $200", min: 50, max: 200 },
  { label: "$200+", min: 200, max: Infinity },
];

const LAST_VISIT_OPTIONS = [
  { label: "Today", days: 0 },
  { label: "This Week", days: 7 },
  { label: "This Month", days: 30 },
  { label: "30+ Days", days: 30 },
  { label: "90+ Days", days: 90 },
];

export function CustomerFilters({
  customers,
  filters,
  onFiltersChange,
}: CustomerFiltersProps) {
  // Derive available tags from customers
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    customers.forEach((c) => {
      c.tags?.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [customers]);

  const hasActiveFilters =
    filters.status ||
    filters.tags.length > 0 ||
    filters.spendMin !== null ||
    filters.spendMax !== null ||
    filters.lastVisit ||
    filters.hasEmail !== null;

  const handleClearAll = () => {
    onFiltersChange({
      status: null,
      tags: [],
      spendMin: null,
      spendMax: null,
      lastVisit: null,
      hasEmail: null,
    });
  };

  const handleRemoveFilter = (filterKey: keyof CustomerFiltersState) => {
    if (filterKey === "tags") {
      onFiltersChange({ ...filters, tags: [] });
    } else {
      onFiltersChange({ ...filters, [filterKey]: null });
    }
  };

  const handleStatusChange = (status: string) => {
    onFiltersChange({
      ...filters,
      status: status === "all" ? null : status,
    });
  };

  const handleSpendPreset = (min: number, max: number) => {
    onFiltersChange({
      ...filters,
      spendMin: min,
      spendMax: max === Infinity ? null : max,
    });
  };

  const handleTagToggle = (tag: string) => {
    const newTags = filters.tags.includes(tag)
      ? filters.tags.filter((t) => t !== tag)
      : [...filters.tags, tag];
    onFiltersChange({ ...filters, tags: newTags });
  };

  const handleLastVisitChange = (days: number) => {
    onFiltersChange({
      ...filters,
      lastVisit: days === 0 ? null : days.toString(),
    });
  };

  const handleHasEmailChange = (hasEmail: boolean | null) => {
    onFiltersChange({
      ...filters,
      hasEmail,
    });
  };

  return (
    <div className="space-y-4">
      {/* Filter Controls Row */}
      <div className="flex flex-wrap gap-2 items-end">
        {/* Status Filter */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <Select value={filters.status || "all"} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="At Risk">At Risk</SelectItem>
              <SelectItem value="Lapsed">Lapsed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tags Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-1">
              Tags
              {filters.tags.length > 0 && (
                <span className="text-xs bg-primary/20 text-primary rounded px-1.5 py-0.5">
                  {filters.tags.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-3" align="start">
            <div className="space-y-2">
              {availableTags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tags available</p>
              ) : (
                availableTags.map((tag) => (
                  <div key={tag} className="flex items-center gap-2">
                    <Checkbox
                      id={`tag-${tag}`}
                      checked={filters.tags.includes(tag)}
                      onCheckedChange={() => handleTagToggle(tag)}
                    />
                    <Label
                      htmlFor={`tag-${tag}`}
                      className="text-sm font-normal cursor-pointer flex-1"
                    >
                      {tag}
                    </Label>
                  </div>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Spend Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Spend</Button>
          </PopoverTrigger>
          <PopoverContent className="w-[180px] p-3" align="start">
            <div className="space-y-2">
              {SPEND_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant={
                    filters.spendMin === preset.min &&
                    (filters.spendMax === preset.max ||
                      (preset.max === Infinity && filters.spendMax === null))
                      ? "default"
                      : "outline"
                  }
                  className="w-full justify-start"
                  onClick={() => handleSpendPreset(preset.min, preset.max)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Last Visit Filter */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Last Visit
          </label>
          <Select
            value={filters.lastVisit || "all"}
            onValueChange={(val) => {
              handleLastVisitChange(val === "all" ? 0 : parseInt(val, 10));
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Time</SelectItem>
              <SelectItem value="0">Today</SelectItem>
              <SelectItem value="7">This Week</SelectItem>
              <SelectItem value="30">This Month</SelectItem>
              <SelectItem value="90">90+ Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Email Filter */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Has Email
          </label>
          <Select
            value={
              filters.hasEmail === null ? "all" : filters.hasEmail ? "yes" : "no"
            }
            onValueChange={(val) => {
              if (val === "all") handleHasEmailChange(null);
              else handleHasEmailChange(val === "yes");
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active Filters Pill Row */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/30 rounded-md">
          <span className="text-xs font-medium text-muted-foreground">
            Active filters:
          </span>

          {filters.status && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Status: {filters.status}
              <button
                onClick={() => handleRemoveFilter("status")}
                className="hover:opacity-70"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filters.tags.length > 0 && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Tags: {filters.tags.join(", ")}
              <button
                onClick={() => handleRemoveFilter("tags")}
                className="hover:opacity-70"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {(filters.spendMin !== null || filters.spendMax !== null) && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Spend: ${filters.spendMin ?? 0} - $
              {filters.spendMax ?? "∞"}
              <button
                onClick={() => {
                  onFiltersChange({
                    ...filters,
                    spendMin: null,
                    spendMax: null,
                  });
                }}
                className="hover:opacity-70"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filters.lastVisit && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Last Visit: {filters.lastVisit} days ago
              <button
                onClick={() => handleRemoveFilter("lastVisit")}
                className="hover:opacity-70"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filters.hasEmail !== null && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Email: {filters.hasEmail ? "Yes" : "No"}
              <button
                onClick={() => handleRemoveFilter("hasEmail")}
                className="hover:opacity-70"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="text-xs"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}