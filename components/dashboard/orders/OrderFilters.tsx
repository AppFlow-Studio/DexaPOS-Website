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
import { Badge } from "@/components/ui/badge";
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
import { useSelectedLocation } from "@/stores/location-store";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface OrderFiltersProps {
  className?: string;
}

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

  const activeFilterCount = Array.from(searchParams.keys()).filter((k) =>
    [
      "from",
      "to",
      "status",
      "type",
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
              Status
              {searchParams.get("status") && (
                <Badge
                  variant="secondary"
                  className="ml-2 rounded-sm px-1 font-normal"
                >
                  {searchParams.get("status")?.split(",").length}
                </Badge>
              )}
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
              Type
              {searchParams.get("type") && (
                <Badge
                  variant="secondary"
                  className="ml-2 rounded-sm px-1 font-normal"
                >
                  {searchParams.get("type")?.split(",").length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {["dine_in", "qr_dine_in", "takeout", "delivery", "online", "catering"].map(
              (type) => {
                const isSelected = searchParams
                  .get("type")
                  ?.split(",")
                  .includes(type);
                return (
                  <DropdownMenuCheckboxItem
                    key={type}
                    checked={isSelected}
                    onCheckedChange={() => handleTypeToggle(type as OrderType)}
                    className="capitalize"
                  >
                    {type === "qr_dine_in" ? "qr dine in" : type.replace("_", " ")}
                  </DropdownMenuCheckboxItem>
                );
              }
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Payment Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-dashed">
              <CreditCard className="mr-2 h-4 w-4" />
              Payment
              {searchParams.get("payment") && (
                <Badge
                  variant="secondary"
                  className="ml-2 rounded-sm px-1 font-normal"
                >
                  {searchParams.get("payment")?.split(",").length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            <DropdownMenuLabel>Filter by Payment</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {[
              "cash",
              "card_spinapi",
              "card_dvpaylite",
              "card_manual",
              "gift_card",
              "house_account",
              "external",
            ].map((method) => {
              const isSelected = searchParams
                .get("payment")
                ?.split(",")
                .includes(method);
              return (
                <DropdownMenuCheckboxItem
                  key={method}
                  checked={isSelected}
                  onCheckedChange={() =>
                    handlePaymentToggle(method as PaymentMethod)
                  }
                  className="capitalize"
                >
                  {method.replace(/_/g, " ").replace("card ", "")}
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
              Amount
              {(searchParams.get("minAmount") ||
                searchParams.get("maxAmount")) && (
                <Badge
                  variant="secondary"
                  className="ml-2 rounded-sm px-1 font-normal"
                >
                  Filtered
                </Badge>
              )}
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
