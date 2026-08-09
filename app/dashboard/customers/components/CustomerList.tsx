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
import { Calendar, Mail, MoreHorizontal, Phone, UserRound } from "lucide-react";
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
import { cn } from "@/lib/utils";

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

function formatMoney(value: number | null | undefined): string {
  return `$${(value ?? 0).toFixed(2)}`;
}

function CustomerAvatar({
  customer,
  className,
}: {
  customer: CustomerListItem;
  className?: string;
}) {
  return (
    <Avatar className={cn("h-9 w-9 bg-muted", className)}>
      <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
        {getInitials(customer)}
      </AvatarFallback>
    </Avatar>
  );
}

function CustomerTags({ customer }: { customer: CustomerListItem }) {
  if (!customer.tags?.length) return null;

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {customer.tags.slice(0, 2).map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="max-w-32 truncate rounded-full border-0 px-2 py-0 text-[0.6875rem] font-normal"
        >
          {tag}
        </Badge>
      ))}
      {customer.tags.length > 2 && (
        <Badge
          variant="secondary"
          className="rounded-full border-0 px-2 py-0 text-[0.6875rem] font-normal"
        >
          +{customer.tags.length - 2}
        </Badge>
      )}
    </div>
  );
}

function CustomerActions({
  customer,
  onViewProfile,
  alwaysVisible = false,
}: {
  customer: CustomerListItem;
  onViewProfile?: (customer: CustomerListItem) => void;
  alwaysVisible?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 rounded-full transition-opacity",
            !alwaysVisible && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="sr-only">Open customer actions</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
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
  );
}

export function CustomerList({
  customers,
  isLoading,
  onViewProfile,
}: CustomerListProps) {
  if (isLoading) {
    return (
      <div className="h-64 w-full">
        <PageLoader variant="fill" />
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="flex min-h-52 w-full flex-col items-center justify-center rounded-2xl bg-muted/30 px-4 text-center text-muted-foreground">
        <UserRound className="mb-3 h-8 w-8" />
        <p className="text-sm font-medium text-foreground">No customers found</p>
        <p className="mt-1 text-sm">Try adjusting your search terms.</p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="hidden overflow-hidden rounded-2xl bg-muted/20 xl:block">
        <Table className="min-w-[860px] [&_td]:px-4 [&_td]:py-3.5 [&_th]:px-4">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[34%]">Customer</TableHead>
              <TableHead>Total Spend</TableHead>
              <TableHead>Visits</TableHead>
              <TableHead>Last Visit</TableHead>
              <TableHead>Avg. Spend</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-0">
            {customers.map((customer) => (
              <TableRow
                key={customer.id}
                className="group cursor-pointer border-0 transition-colors hover:bg-muted/45"
                onClick={() => onViewProfile?.(customer)}
              >
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <CustomerAvatar customer={customer} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {getCustomerDisplayName(customer)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatPhoneForDisplay(customer.phone) ||
                          customer.email ||
                          "No contact info"}
                      </p>
                    </div>
                    <CustomerTags customer={customer} />
                  </div>
                </TableCell>
                <TableCell className="font-medium tabular-nums">
                  {formatMoney(customer.lifetime_spend)}
                </TableCell>
                <TableCell>
                  <span className="text-sm tabular-nums">
                    {customer.visits ?? 0}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatLastVisit(customer.last_visit)}
                  </div>
                </TableCell>
                <TableCell className="text-sm tabular-nums text-muted-foreground">
                  {formatMoney(customer.avg_spend)}
                </TableCell>
                <TableCell>
                  <CustomerActions
                    customer={customer}
                    onViewProfile={onViewProfile}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
        {customers.map((customer) => {
          const phone = formatPhoneForDisplay(customer.phone);

          return (
            <article
              key={customer.id}
              className="group min-w-0 rounded-2xl border-0 bg-muted/45 p-4 transition-colors hover:bg-muted/65"
            >
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => onViewProfile?.(customer)}
                >
                  <CustomerAvatar customer={customer} className="h-10 w-10" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {getCustomerDisplayName(customer)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {phone || customer.email || "No contact info"}
                    </span>
                  </span>
                </button>
                <CustomerActions
                  customer={customer}
                  onViewProfile={onViewProfile}
                  alwaysVisible
                />
              </div>

              <button
                type="button"
                className="mt-5 block w-full text-left"
                onClick={() => onViewProfile?.(customer)}
              >
                <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-4">
                  <div className="min-w-0">
                    <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Total spend
                    </dt>
                    <dd className="mt-1 truncate text-sm font-medium tabular-nums">
                      {formatMoney(customer.lifetime_spend)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Visits
                    </dt>
                    <dd className="mt-1 truncate text-sm font-medium tabular-nums">
                      {customer.visits ?? 0}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Last visit
                    </dt>
                    <dd className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {formatLastVisit(customer.last_visit)}
                      </span>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Avg. spend
                    </dt>
                    <dd className="mt-1 truncate text-sm text-muted-foreground tabular-nums">
                      {formatMoney(customer.avg_spend)}
                    </dd>
                  </div>
                </dl>
              </button>

              {(customer.email || phone || customer.tags?.length > 0) && (
                <div className="mt-5 flex min-w-0 flex-col gap-2.5">
                  {customer.email && (
                    <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{customer.email}</span>
                    </p>
                  )}
                  {phone && (
                    <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{phone}</span>
                    </p>
                  )}
                  <CustomerTags customer={customer} />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
