"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_REPORTING_TIMEZONE } from "@/lib/reporting/date-range";
import { getOrderBreakdown } from "@/lib/orders/order-breakdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingBag,
  Coffee,
  Utensils,
  Truck,
  Globe,
  UtensilsCrossed,
  X,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CreditCard,
  Banknote,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrderResponse } from "@/types/order-management";
import { getPaymentStatusLabel } from "@/lib/constants/payment-status";

// ============================================================================
// Types & Constants
// ============================================================================

interface TransactionsListProps {
  transactions: OrderResponse[];
  isLoading?: boolean;
  onTransactionClick?: (transaction: OrderResponse) => void;
  /** Store IANA timezone for date display; falls back to America/New_York. */
  timeZone?: string | null;
}

type SortField = "date" | "amount" | "status";
type SortDirection = "asc" | "desc";

/**
 * One neutral badge shell for both status columns.
 *
 * Status is not colour-coded (D-12): the word carries the meaning. Colour-coding
 * put five competing hues in every row, which made the amounts — the figures a
 * merchant actually scans for — the least prominent thing on the line.
 */
const BADGE_SHELL =
  "inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground";

const STATUS_OPTIONS = [
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "refunded", label: "Refunded" },
  { value: "void", label: "Void" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const ORDER_TYPE_OPTIONS = [
  { value: "dine_in", label: "Dine In", icon: Utensils },
  { value: "takeout", label: "Takeout", icon: Coffee },
  { value: "delivery", label: "Delivery", icon: Truck },
  { value: "online", label: "Online", icon: Globe },
  { value: "catering", label: "Catering", icon: UtensilsCrossed },
] as const;

// ============================================================================
// Helpers
// ============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Store-local date for the table, consistent with the receipt (never browser-local).
// Falls back to America/New_York to match the reporting / receipt convention.
function formatTxDate(dateStr: string, timeZone?: string | null): string {
  const tz = timeZone || DEFAULT_REPORTING_TIMEZONE;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";

  // Calendar day in the store tz (YYYY-MM-DD) for Today/Yesterday comparison.
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  if (dayKey(date) === dayKey(now)) return `Today, ${time}`;
  if (dayKey(date) === dayKey(yesterday)) return `Yesterday, ${time}`;

  const md = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
  }).format(date);
  return `${md}, ${time}`;
}

// The receipt-consistent total: collected amount for split tenders, else the
// charged lane's total (+ tip). Uses the shared breakdown so the table matches
// what the receipt foots to — never the bare card/list total for cash orders.
function getDisplayTotal(tx: OrderResponse): number {
  const b = getOrderBreakdown(tx, tx.order_payments);
  return b.isMixed && b.primary.amountPaid > 0
    ? b.primary.amountPaid
    : b.primary.total + b.primary.tip;
}

function getOrderTypeConfig(orderType: string) {
  switch (orderType) {
    case "dine_in":
      return { icon: Utensils, label: "Dine In" };
    case "takeout":
      return { icon: Coffee, label: "Takeout" };
    case "delivery":
      return { icon: Truck, label: "Delivery" };
    case "online":
      return { icon: Globe, label: "Online" };
    case "catering":
      return { icon: UtensilsCrossed, label: "Catering" };
    default:
      return { icon: ShoppingBag, label: orderType.replace("_", " ") };
  }
}

function getStatusLabel(status: string): string {
  if (status === "sent_to_kitchen") return "Preparing";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function getPaymentLabel(tx: OrderResponse): { label: string; icon: typeof CreditCard } {
  const payments = tx.order_payments || [];
  if (payments.length === 0) return { label: "—", icon: CreditCard };

  const methods = [...new Set(payments.map((p) => p.payment_method))];
  const first = methods[0];

  if (typeof first === "string" && first.startsWith("card_")) {
    const cardPayment = payments.find((p) => p.payment_method === first);
    const brand = cardPayment?.card_type
      ? cardPayment.card_type.charAt(0).toUpperCase() + cardPayment.card_type.slice(1).toLowerCase()
      : null;
    const last4 = cardPayment?.card_last_four;
    if (brand && last4) return { label: `${brand} •••• ${last4}`, icon: CreditCard };
    if (last4) return { label: `Card •••• ${last4}`, icon: CreditCard };
    if (brand) return { label: brand, icon: CreditCard };
    return { label: "Card", icon: CreditCard };
  }

  switch (first) {
    case "cash":
      return { label: "Cash", icon: Banknote };
    case "gift_card":
      return { label: "Gift Card", icon: CreditCard };
    case "house_account":
      return { label: "House Account", icon: CreditCard };
    default:
      return { label: first ? first.charAt(0).toUpperCase() + first.slice(1).replace("_", " ") : "—", icon: CreditCard };
  }
}

function getStaffName(tx: OrderResponse): string | null {
  return (
    tx.created_by_staff?.display_name ||
    (tx.created_by_staff?.first_name
      ? `${tx.created_by_staff.first_name} ${tx.created_by_staff.last_name || ""}`.trim()
      : tx.created_by_user
      ? `${tx.created_by_user.first_name || ""} ${tx.created_by_user.last_name || ""}`.trim()
      : null) ||
    null
  );
}

// ============================================================================
// Filter Pill Component
// ============================================================================

function FilterPill({
  label,
  values,
  options,
  onChange,
  renderOption,
}: {
  label: string;
  values: string[];
  options: readonly { value: string; label: string }[];
  onChange: (values: string[]) => void;
  renderOption?: (option: { value: string; label: string }) => React.ReactNode;
}) {
  const isActive = values.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Filter chip: tinted and borderless (DS-CTL-03), never outlined —
            an outlined chip adds a second competing box next to the panel. */}
        <button
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border-0 px-3 text-xs font-medium shadow-none transition-colors",
            "data-[state=open]:bg-muted data-[state=open]:text-foreground",
            isActive
              ? "bg-muted text-foreground"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {label}
          {isActive && (
            <span className="rounded-full bg-foreground/10 px-1.5 py-px text-[10px] font-semibold leading-tight tabular-nums">
              {values.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 rounded-2xl p-2">
        <div className="space-y-0.5">
          {options.map((opt) => {
            const isSelected = values.includes(opt.value);
            return (
              <button
                key={opt.value}
                className={cn(
                  "flex w-full items-center gap-2 rounded-full px-2.5 py-2 text-left text-sm transition-colors",
                  isSelected
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
                onClick={() => {
                  if (isSelected) {
                    onChange(values.filter((v) => v !== opt.value));
                  } else {
                    onChange([...values, opt.value]);
                  }
                }}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded",
                    isSelected ? "bg-primary" : "bg-muted-foreground/20"
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                {renderOption ? renderOption(opt) : <span>{opt.label}</span>}
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// Sortable column header
// ============================================================================

function SortIcon({
  field,
  sortField,
  sortDir,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDirection;
}) {
  if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
  return sortDir === "desc" ? (
    <ArrowDown className="h-3 w-3" />
  ) : (
    <ArrowUp className="h-3 w-3" />
  );
}

function SortHeader({
  field,
  sortField,
  sortDir,
  onSort,
  children,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDirection;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
    >
      {children} <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
    </button>
  );
}

// ============================================================================
// Component
// ============================================================================

export function TransactionsList({
  transactions,
  isLoading,
  onTransactionClick,
  timeZone,
}: TransactionsListProps) {
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const hasFilters = statusFilter.length > 0 || typeFilter.length > 0;

  // Filter and sort
  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];

    let result = [...transactions];

    if (statusFilter.length > 0) {
      result = result.filter((tx) => statusFilter.includes(tx.status));
    }
    if (typeFilter.length > 0) {
      result = result.filter((tx) => typeFilter.includes(tx.order_type));
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "amount":
          cmp = getDisplayTotal(a) - getDisplayTotal(b);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [transactions, statusFilter, typeFilter, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  // ---- Loading -------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
        <div className="rounded-2xl bg-muted/20 p-3">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- Empty ---------------------------------------------------------------
  if (!transactions || transactions.length === 0) {
    return (
      <div className="rounded-2xl bg-muted/20 py-16">
        <div className="text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">
            No transactions found for this period
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter toolbar — outside the table well, so the table stays one clean
          surface rather than a box with a ruled header strip. */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <FilterPill
          label="Status"
          values={statusFilter}
          options={STATUS_OPTIONS}
          onChange={setStatusFilter}
        />
        <FilterPill
          label="Order type"
          values={typeFilter}
          options={ORDER_TYPE_OPTIONS}
          onChange={setTypeFilter}
          renderOption={(opt) => {
            const t = ORDER_TYPE_OPTIONS.find((o) => o.value === opt.value);
            const Icon = t?.icon || ShoppingBag;
            return (
              <span className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                {opt.label}
              </span>
            );
          }}
        />
        {hasFilters && (
          <button
            onClick={() => {
              setStatusFilter([]);
              setTypeFilter([]);
            }}
            className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear filters
            <X className="h-3 w-3" />
          </button>
        )}
        <div className="flex-1" />
        <span className="text-xs tabular-nums text-muted-foreground">
          {filteredTransactions.length} result
          {filteredTransactions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="rounded-2xl bg-muted/20 py-12 text-center text-sm text-muted-foreground">
          No transactions match the selected filters
        </div>
      ) : (
        <>
          {/* Wide-screen table */}
          <Table
            variant="data"
            containerClassName="hidden xl:block"
            className="min-w-[860px]"
          >
            <TableHeader className="[&_tr]:border-0">
              <TableRow>
                <TableHead>
                  <SortHeader
                    field="amount"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Amount
                  </SortHeader>
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Payment
                </TableHead>
                <TableHead>
                  <SortHeader
                    field="status"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Order Status
                  </SortHeader>
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Payment Status
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Type
                </TableHead>
                <TableHead>
                  <SortHeader
                    field="date"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Date
                  </SortHeader>
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Staff
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((tx) => {
                const type = getOrderTypeConfig(tx.order_type);
                const payment = getPaymentLabel(tx);
                const PayIcon = payment.icon;
                const TypeIcon = type.icon;
                const isRefund = tx.status === "refunded";
                const isVoid = tx.status === "void";
                const staffName = getStaffName(tx);

                return (
                  <TableRow
                    key={tx.id}
                    onClick={() => onTransactionClick?.(tx)}
                    className={cn(
                      "cursor-pointer border-0 bg-card/70 hover:bg-muted/40",
                      // Reversed orders are de-emphasised by opacity, not by a
                      // red tint — colour is not carrying status here (D-12).
                      (isRefund || isVoid) && "opacity-70"
                    )}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold tabular-nums">
                          {isRefund ? "−" : ""}
                          {formatCurrency(getDisplayTotal(tx))}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground/60">
                          {tx.display_number || tx.order_number || tx.id.slice(0, 8)}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <PayIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{payment.label}</span>
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className={BADGE_SHELL}>{getStatusLabel(tx.status)}</span>
                    </TableCell>

                    {/* Payment status — independent of order status (payment_status enum) */}
                    <TableCell>
                      <span className={BADGE_SHELL}>
                        {getPaymentStatusLabel(tx.payment_status)}
                      </span>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <TypeIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{type.label}</span>
                      </span>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {formatTxDate(tx.created_at, timeZone)}
                    </TableCell>

                    <TableCell className="text-right text-sm text-muted-foreground">
                      <span className="truncate">{staffName || "—"}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Phones and tablets use cards instead of a horizontally scrolling
              table (§5.3) — the old 730px min-width forced a sideways drag. */}
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
            {filteredTransactions.map((tx) => {
              const type = getOrderTypeConfig(tx.order_type);
              const payment = getPaymentLabel(tx);
              const PayIcon = payment.icon;
              const TypeIcon = type.icon;
              const isRefund = tx.status === "refunded";
              const isVoid = tx.status === "void";
              const staffName = getStaffName(tx);

              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => onTransactionClick?.(tx)}
                  className={cn(
                    "min-w-0 rounded-2xl bg-muted/45 p-4 text-left transition-colors hover:bg-muted",
                    (isRefund || isVoid) && "opacity-70"
                  )}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block text-lg font-semibold tabular-nums">
                        {isRefund ? "−" : ""}
                        {formatCurrency(getDisplayTotal(tx))}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground/60">
                        {tx.display_number || tx.order_number || tx.id.slice(0, 8)}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatTxDate(tx.created_at, timeZone)}
                    </span>
                  </div>

                  <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className={BADGE_SHELL}>{getStatusLabel(tx.status)}</span>
                    <span className={BADGE_SHELL}>
                      {getPaymentStatusLabel(tx.payment_status)}
                    </span>
                  </div>

                  <div className="mt-4 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Payment</p>
                      <p className="mt-0.5 flex items-center gap-1.5">
                        <PayIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{payment.label}</span>
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="mt-0.5 flex items-center gap-1.5">
                        <TypeIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{type.label}</span>
                      </p>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <p className="text-xs text-muted-foreground">Staff</p>
                      <p className="mt-0.5 truncate">{staffName || "—"}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
