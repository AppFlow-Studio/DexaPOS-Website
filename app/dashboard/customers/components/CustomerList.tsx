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
      className="px-3 py-3 cursor-pointer select-none hover:bg-muted/50 font-semibold text-foreground whitespace-nowrap"
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
      <div className="w-full h-96 flex flex-col items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <UserIcon className="h-8 w-8 text-muted-foreground/60" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-lg font-semibold text-foreground">No customers found</p>
            <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto -mx-6 lg:-mx-8 px-6 lg:px-8">
      <Table>
        <TableHeader className="bg-muted/30 border-b border-border/50 sticky top-0">
          <TableRow className="hover:bg-muted/40 transition-colors">
            <TableHead className="w-10 px-3 py-3">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleSelectAll}
                onClick={(e) => e.stopPropagation()}
              />
            </TableHead>
            <TableHead className="px-3 py-3 font-semibold text-foreground">Customer</TableHead>
            <TableHead className="px-3 py-3 font-semibold text-foreground whitespace-nowrap">Phone</TableHead>
            <TableHead className="px-3 py-3 font-semibold text-foreground whitespace-nowrap">Email</TableHead>
            <TableHead className="px-3 py-3 font-semibold text-foreground">Tags</TableHead>
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
              field="last_visit"
              label="Last Visit"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            />
            <TableHead className="px-3 py-3 font-semibold text-foreground whitespace-nowrap">Status</TableHead>
            <TableHead className="w-10 px-3 py-3"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => {
            const status = getCustomerStatus(customer);
            const isSelected = selectedIds.includes(customer.id);

            return (
              <TableRow
                key={customer.id}
                className={`group cursor-pointer border-b border-border/50 hover:bg-muted/40 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                onClick={() => onViewProfile?.(customer)}
              >
                <TableCell onClick={(e) => e.stopPropagation()} className="px-3 py-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelectCustomer(customer.id)}
                  />
                </TableCell>
                <TableCell className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                        {getInitials(customer)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <span className="font-semibold text-sm text-foreground">
                        {getCustomerDisplayName(customer)}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-3 py-3 whitespace-nowrap">
                  <span className="text-sm text-muted-foreground">
                    {customer.phone || "—"}
                  </span>
                </TableCell>
                <TableCell className="px-3 py-3">
                  <div className="flex items-center gap-1">
                    {customer.email ? (
                      <>
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground truncate max-w-25">
                          {customer.email}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-3 py-3">
                  {customer.tags && customer.tags.length > 0 ? (
                    <div className="flex gap-1 flex-wrap">
                      {customer.tags.slice(0, 1).map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-xs px-2 py-0.5 font-medium"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {customer.tags.length > 1 && (
                        <Badge
                          variant="outline"
                          className="text-xs px-2 py-0.5 font-medium"
                        >
                          +{customer.tags.length - 1}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="px-3 py-3 whitespace-nowrap">
                  <div className="font-semibold text-foreground">
                    ${(customer.lifetime_spend ?? 0).toFixed(2)}
                  </div>
                </TableCell>
                <TableCell className="px-3 py-3 whitespace-nowrap">
                  <Badge variant="secondary" className="font-semibold bg-muted text-muted-foreground">
                    {customer.visits ?? 0}
                  </Badge>
                </TableCell>
                <TableCell className="px-3 py-3 whitespace-nowrap">
                  <span className="text-sm text-muted-foreground">
                    {formatRelativeDate(customer.last_visit)}
                  </span>
                </TableCell>
                <TableCell className="px-3 py-3 whitespace-nowrap">
                  <Badge className={getStatusColor(status)}>{status}</Badge>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()} className="px-3 py-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-9 w-9 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                      >
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel className="font-semibold">Actions</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => onViewProfile?.(customer)}
                        className="cursor-pointer"
                      >
                        View Profile
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive cursor-pointer"
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
