"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageLoader } from "@/components/ui/page-loader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontal,
  Calendar,
  User as UserIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import type { CustomerListItem } from "@/types/customer";
import { getCustomerDisplayName } from "@/types/customer";
import { formatPhoneForDisplay } from "@/lib/phone";

interface CustomerListProps {
  customers: CustomerListItem[];
  isLoading: boolean;
  onViewProfile?: (customer: CustomerListItem) => void;
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
 * Format the last visit date safely
 */
function formatLastVisit(lastVisit: string | null): string {
  if (!lastVisit) return "Never";
  try {
    return format(new Date(lastVisit), "MMM d, yyyy");
  } catch {
    return "Unknown";
  }
}

export function CustomerList({
  customers,
  isLoading,
  onViewProfile,
}: CustomerListProps) {
  if (isLoading) {
    return (
      <div className="w-full h-96">
        <PageLoader variant="fill" />
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
      <Table className="min-w-[700px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Customer</TableHead>
            <TableHead>Total Spend</TableHead>
            <TableHead>Visits</TableHead>
            <TableHead>Last Visit</TableHead>
            <TableHead>Avg. Spend</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow
              key={customer.id}
              className="group cursor-pointer"
              onClick={() => onViewProfile?.(customer)}
            >
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(customer)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">
                      {getCustomerDisplayName(customer)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatPhoneForDisplay(customer.phone) || customer.email || "No contact info"}
                    </span>
                  </div>
                  {customer.tags && customer.tags.length > 0 && (
                    <div className="flex gap-1 ml-2">
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
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="font-medium">
                  ${(customer.lifetime_spend ?? 0).toFixed(2)}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-normal">
                  {customer.visits ?? 0} visits
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatLastVisit(customer.last_visit)}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  $
                  {(customer.avg_spend ?? 0).toFixed(2)}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewProfile?.(customer);
                      }}
                    >
                      View Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem>View Orders</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                      Delete Customer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
