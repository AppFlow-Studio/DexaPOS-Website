"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MoreHorizontal,
  Mail,
  User as UserIcon,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CustomerListItem } from "@/types/customer";
import {
  getCustomerDisplayName,
  getCustomerStatus,
  formatRelativeDate,
  type CustomerStatus,
} from "@/types/customer";

type SortField = "name" | "lifetime_spend" | "visits" | "avg_spend" | "last_visit";
type SortDir = "asc" | "desc";

interface CustomerListProps {
  customers: CustomerListItem[];
  isLoading: boolean;
  onViewProfile?: (customer: CustomerListItem) => void;
  onDeleteCustomer?: (customer: CustomerListItem) => void;
  sortField?: SortField;
  sortDir?: SortDir;
  onSort?: (field: SortField) => void;
  selectedIds?: string[];
  onSelectChange?: (ids: string[]) => void;
}

/**
 * Get initials from customer name for avatar
 */
function getInitials(customer: CustomerListItem): string {
  const displayName = getCustomerDisplayName(customer);
  return displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

/**
 * Get status badge color for customer status
 */
function getStatusColor(status: CustomerStatus): string {
  switch (status) {
    case "Active":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "At Risk":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "Lapsed":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "New":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  }
}

/**
 * Sortable column header with toggle indicator
 */
function SortableColumnHead({
  field,
  label,
  sortField,
  sortDir,
  onSort,
}: {
  field: SortField;
  label: string;
  sortField?: SortField;
  sortDir?: SortDir;
  onSort?: (field: SortField) => void;
}) {
  const isActive = sortField === field;
  return (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted/50"
      onClick={() => onSort?.(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive && (
          <>
            {sortDir === "asc" && <ChevronUp className="h-4 w-4" />}
            {sortDir === "desc" && <ChevronDown className="h-4 w-4" />}
          </>
        )}
      </div>
    </TableHead>
  );
}

export function CustomerList({
  customers,
  isLoading,
  onViewProfile,
  onDeleteCustomer,
  sortField,
  sortDir,
  onSort,
  selectedIds = [],
  onSelectChange,
}: CustomerListProps) {
  const allSelected =
    customers.length > 0 && selectedIds.length === customers.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < customers.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      onSelectChange?.([]);
    } else {
      onSelectChange?.(customers.map((c) => c.id));
    }
  };

  const toggleSelectCustomer = (customerId: string) => {
    if (selectedIds.includes(customerId)) {
      onSelectChange?.(selectedIds.filter((id) => id !== customerId));
    } else {
      onSelectChange?.([...selectedIds, customerId]);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-96 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center text-muted-foreground border rounded-lg bg-card/50">
        <UserIcon className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No customers found</p>
        <p className="text-sm">Try adjusting your search terms</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleSelectAll}
                onClick={(e) => e.stopPropagation()}
              />
            </TableHead>
            <TableHead className="w-75">Customer</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Tags</TableHead>
            <SortableColumnHead
              field="lifetime_spend"
              label="Total Spend"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableColumnHead
              field="visits"
              label="Visits"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableColumnHead
              field="avg_spend"
              label="Avg. Spend"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableColumnHead
              field="last_visit"
              label="Last Visit"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            />
            <TableHead>Status</TableHead>
            <TableHead className="w-12.5"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => {
            const status = getCustomerStatus(customer);
            const isSelected = selectedIds.includes(customer.id);

            return (
              <TableRow
                key={customer.id}
                className={`group cursor-pointer ${isSelected ? "bg-muted/50" : ""}`}
                onClick={() => onViewProfile?.(customer)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelectCustomer(customer.id)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(customer)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <span className="font-medium text-sm">
                        {getCustomerDisplayName(customer)}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {customer.phone || "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {customer.email ? (
                      <>
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground truncate max-w-37.5">
                          {customer.email}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {customer.tags && customer.tags.length > 0 ? (
                    <div className="flex gap-1 flex-wrap">
                      {customer.tags.slice(0, 2).map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {customer.tags.length > 2 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          +{customer.tags.length - 2}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium">
                    ${(customer.lifetime_spend ?? 0).toFixed(2)}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-normal">
                    {customer.visits ?? 0}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    ${(customer.avg_spend ?? 0).toFixed(2)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {formatRelativeDate(customer.last_visit)}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge className={getStatusColor(status)}>{status}</Badge>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => onViewProfile?.(customer)}
                      >
                        View Profile
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDeleteCustomer?.(customer)}
                      >
                        Delete Customer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
