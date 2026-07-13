"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateRangePicker } from "./DateRangePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Filter,
  X,
  ChevronDown,
  DollarSign,
  User,
  CreditCard,
  Utensils,
  Calendar,
  Radio,
  Truck,
} from "lucide-react";
import {
  OrderStatus,
  OrderType,
  PaymentMethod,
} from "@/types/order-management";
import { useUnifiedStaff } from "@/app/dashboard/hooks/useStaff";
import {
  ORDER_STATUS_ORDER,
  ORDER_STATUS_LABELS,
} from "@/lib/constants/order-status";
import {
  ORDER_TYPE_ORDER,
  ORDER_TYPE_LABELS,
  orderTypeLabel,
} from "@/lib/constants/order-type";
import { useSelectedLocation } from "@/stores/location-store";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ORDER_SOURCE_OPTIONS,
  DELIVERY_PLATFORM_OPTIONS,
  orderSourceLabel,
  platformLabel,
} from "@/lib/orderout/platform";

interface OrderFiltersProps {
  className?: string;
}

/**
 * Payment methods shown in the Payment filter, with display labels. Kept distinct
 * per processor (unlike EnhancedPayments' label, which collapses card_* to "Card")
 * because the filter lists them as separate options. Single source for both the
 * dropdown items and the trigger label so they can't drift.
 */
const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash" as PaymentMethod, label: "Cash" },
  { value: "card_spinapi" as PaymentMethod, label: "Spinapi" },
  { value: "card_dvpaylite" as PaymentMethod, label: "Dvpaylite" },
  { value: "card_manual" as PaymentMethod, label: "Manual" },
  { value: "gift_card" as PaymentMethod, label: "Gift Card" },
  { value: "house_account" as PaymentMethod, label: "House Account" },
  { value: "external" as PaymentMethod, label: "External" },
];

const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label])
);

export function OrderFilters({ className }: OrderFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedLocation = useSelectedLocation();

  // State for filters
  const { data: staffMembers = [] } = useUnifiedStaff();

  // Helper to update URL params
  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    router.push(`?${params.toString()}`);
  };

  // Handlers
  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    updateParams({
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
    });
  };

  const handleStatusToggle = (status: OrderStatus) => {
    const current = searchParams.get("status")?.split(",") || [];
    let next = [];
    if (current.includes(status)) {
      next = current.filter((s) => s !== status);
    } else {
      next = [...current, status];
    }
    updateParams({ status: next.length ? next.join(",") : null });
  };

  const handleTypeToggle = (type: OrderType) => {
    const current = searchParams.get("type")?.split(",") || [];
    let next = [];
    if (current.includes(type)) {
      next = current.filter((t) => t !== type);
    } else {
      next = [...current, type];
    }
    updateParams({ type: next.length ? next.join(",") : null });
  };

  const handlePaymentToggle = (method: PaymentMethod) => {
    const current = searchParams.get("payment")?.split(",") || [];
    let next = [];
    if (current.includes(method)) {
      next = current.filter((m) => m !== method);
    } else {
      next = [...current, method];
    }
    updateParams({ payment: next.length ? next.join(",") : null });
  };

  const handleSourceToggle = (source: string) => {
    const current = searchParams.get("source")?.split(",").filter(Boolean) || [];
    const next = current.includes(source)
      ? current.filter((s) => s !== source)
      : [...current, source];
    // Platform only applies to OrderOut. If the resulting channel selection excludes
    // orderout (and isn't empty/unscoped), drop any platform filter so a stale
    // marketplace filter can't silently hide rows.
    const platformStillApplies =
      next.length === 0 || next.includes("orderout");
    updateParams({
      source: next.length ? next.join(",") : null,
      ...(platformStillApplies ? {} : { platform: null }),
    });
  };

  const handlePlatformToggle = (platform: string) => {
    const current =
      searchParams.get("platform")?.split(",").filter(Boolean) || [];
    const next = current.includes(platform)
      ? current.filter((p) => p !== platform)
      : [...current, platform];
    updateParams({ platform: next.length ? next.join(",") : null });
  };

  const handleStaffChange = (staffId: string) => {
    updateParams({ staff: staffId === "all" ? null : staffId });
  };

  const handleAmountChange = (min: string, max: string) => {
    updateParams({
      minAmount: min || null,
      maxAmount: max || null,
    });
  };

  const clearFilters = () => {
    router.push(window.location.pathname);
  };

  // Each multi-select filter's trigger reflects the selection: the chosen value's
  // label when exactly one is picked, a count when several are, else the base name.
  const triggerLabel = (
    param: string,
    base: string,
    labelFor: (value: string) => string
  ) => {
    const values = searchParams.get(param)?.split(",").filter(Boolean) ?? [];
    if (values.length === 0) return base;
    if (values.length === 1) return labelFor(values[0]);
    return `${values.length} selected`;
  };

  const selectedTypes =
    searchParams.get("type")?.split(",").filter(Boolean) ?? [];
  const selectedSources =
    searchParams.get("source")?.split(",").filter(Boolean) ?? [];
  // Platform (marketplace) only applies to OrderOut orders. Enable the control when
  // no channel is chosen (unscoped) or when 'orderout' is among the selected channels.
  const platformFilterEnabled =
    selectedSources.length === 0 || selectedSources.includes("orderout");
  const statusTriggerLabel = triggerLabel(
    "status",
    "Status",
    (v) => ORDER_STATUS_LABELS[v as OrderStatus] ?? v
  );
  const typeTriggerLabel = triggerLabel("type", "Type", orderTypeLabel);
  const sourceTriggerLabel = triggerLabel(
    "source",
    "Channel",
    (v) => orderSourceLabel(v) || v
  );
  const platformTriggerLabel = triggerLabel(
    "platform",
    "Platform",
    (v) => platformLabel(v) || v
  );
  const paymentTriggerLabel = triggerLabel(
    "payment",
    "Payment",
    (v) => PAYMENT_METHOD_LABELS[v] ?? v.replace(/_/g, " ")
  );

  // Amount is a range, so its trigger shows the bounds rather than a generic badge.
  const minAmount = searchParams.get("minAmount");
  const maxAmount = searchParams.get("maxAmount");
  const amountTriggerLabel =
    minAmount && maxAmount
      ? `$${minAmount}–$${maxAmount}`
      : minAmount
        ? `≥ $${minAmount}`
        : maxAmount
          ? `≤ $${maxAmount}`
          : "Amount";

  const activeFilterCount = Array.from(searchParams.keys()).filter((k) =>
    [
      "from",
      "to",
      "status",
      "type",
      "source",
      "platform",
      "payment",
      "staff",
      "minAmount",
      "maxAmount",
    ].includes(k)
  ).length;

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Date Range */}
        <DateRangePicker
          dateFrom={
            searchParams.get("from")
              ? new Date(searchParams.get("from")!)
              : null
          }
          dateTo={
            searchParams.get("to") ? new Date(searchParams.get("to")!) : null
          }
          onDateRangeChange={handleDateRangeChange}
        />

        <Separator orientation="vertical" className="h-8" />

        {/* Status Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-dashed">
              <Filter className="mr-2 h-4 w-4" />
              {statusTriggerLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ORDER_STATUS_ORDER.map((status) => {
              const isSelected = searchParams
                .get("status")
                ?.split(",")
                .includes(status);
              return (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={isSelected}
                  onCheckedChange={() => handleStatusToggle(status)}
                >
                  {ORDER_STATUS_LABELS[status]}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Type Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-dashed">
              <Utensils className="mr-2 h-4 w-4" />
              {typeTriggerLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ORDER_TYPE_ORDER.map((type) => {
              const isSelected = selectedTypes.includes(type);
              return (
                <DropdownMenuCheckboxItem
                  key={type}
                  checked={isSelected}
                  onCheckedChange={() => handleTypeToggle(type)}
                >
                  {ORDER_TYPE_LABELS[type]}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Channel (order_source) Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-dashed">
              <Radio className="mr-2 h-4 w-4" />
              {sourceTriggerLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            <DropdownMenuLabel>Filter by Channel</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ORDER_SOURCE_OPTIONS.map(({ value, label }) => {
              const isSelected = searchParams
                .get("source")
                ?.split(",")
                .includes(value);
              return (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={isSelected}
                  onCheckedChange={() => handleSourceToggle(value)}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Delivery Platform Filter — only applies to OrderOut orders */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={!platformFilterEnabled}>
            <Button
              variant="outline"
              size="sm"
              className="border-dashed disabled:opacity-50"
              disabled={!platformFilterEnabled}
              title={
                platformFilterEnabled
                  ? undefined
                  : "Select the OrderOut channel to filter by platform"
              }
            >
              <Truck className="mr-2 h-4 w-4" />
              {platformTriggerLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            <DropdownMenuLabel>Filter by Platform</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {DELIVERY_PLATFORM_OPTIONS.map(({ value, label }) => {
              const isSelected = searchParams
                .get("platform")
                ?.split(",")
                .includes(value);
              return (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={isSelected}
                  onCheckedChange={() => handlePlatformToggle(value)}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Payment Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-dashed">
              <CreditCard className="mr-2 h-4 w-4" />
              {paymentTriggerLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            <DropdownMenuLabel>Filter by Payment</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PAYMENT_METHODS.map(({ value, label }) => {
              const isSelected = searchParams
                .get("payment")
                ?.split(",")
                .includes(value);
              return (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={isSelected}
                  onCheckedChange={() => handlePaymentToggle(value)}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Staff Filter */}
        <Select
          value={searchParams.get("staff") || "all"}
          onValueChange={handleStaffChange}
        >
          <SelectTrigger className="w-[180px] h-9 border-dashed">
            <User className="mr-2 h-4 w-4 opacity-50" />
            <SelectValue placeholder="Staff Member" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            {staffMembers.filter((m) => m.member_id).map((member) => (
              <SelectItem key={member.member_id!} value={member.member_id!}>
                {member.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Amount Range */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-dashed">
              <DollarSign className="mr-2 h-4 w-4" />
              {amountTriggerLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80 p-4" align="start">
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Amount Range</h4>
                <p className="text-sm text-muted-foreground">
                  Filter orders by total amount
                </p>
              </div>
              <div className="grid gap-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minAmount">Min Amount</Label>
                    <Input
                      id="minAmount"
                      placeholder="0.00"
                      type="number"
                      value={searchParams.get("minAmount") || ""}
                      onChange={(e) =>
                        handleAmountChange(
                          e.target.value,
                          searchParams.get("maxAmount") || ""
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxAmount">Max Amount</Label>
                    <Input
                      id="maxAmount"
                      placeholder="100.00"
                      type="number"
                      value={searchParams.get("maxAmount") || ""}
                      onChange={(e) =>
                        handleAmountChange(
                          searchParams.get("minAmount") || "",
                          e.target.value
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
