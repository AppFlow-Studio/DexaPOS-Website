"use client";

import { useMemo, useState } from "react";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

// ============================================================================
// Types & Constants
// ============================================================================

interface TransactionsListProps {
  transactions: OrderResponse[];
  isLoading?: boolean;
  onTransactionClick?: (transaction: OrderResponse) => void;
}

type SortField = "date" | "amount" | "status";
type SortDirection = "asc" | "desc";

const STATUS_OPTIONS = [
  { value: "completed", label: "Completed", dot: "bg-emerald-500" },
  { value: "pending", label: "Pending", dot: "bg-amber-500" },
  { value: "preparing", label: "Preparing", dot: "bg-blue-500" },
  { value: "ready", label: "Ready", dot: "bg-violet-500" },
  { value: "refunded", label: "Refunded", dot: "bg-rose-500" },
  { value: "void", label: "Void", dot: "bg-gray-400" },
  { value: "cancelled", label: "Cancelled", dot: "bg-gray-400" },
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

function formatTxDate(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return `Today, ${format(date, "h:mm a")}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, "h:mm a")}`;
  return format(date, "MMM d, h:mm a");
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

function getStatusStyle(status: string) {
  switch (status) {
    case "completed":
      return { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" };
    case "refunded":
      return { dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-900/20" };
    case "void":
    case "cancelled":
      return { dot: "bg-gray-400", text: "text-gray-600 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-800/30" };
    case "preparing":
    case "sent_to_kitchen":
      return { dot: "bg-blue-500", text: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20" };
    case "ready":
      return { dot: "bg-violet-500", text: "text-violet-700 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/20" };
    case "pending":
    case "draft":
      return { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" };
    default:
      return { dot: "bg-gray-400", text: "text-muted-foreground", bg: "bg-muted" };
  }
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
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border",
            isActive
              ? "bg-primary/10 border-primary/30 text-primary dark:bg-primary/20 dark:border-primary/40"
              : "bg-background border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
          )}
        >
          {label}
          {isActive && (
            <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-px text-[10px] font-bold leading-tight">
              {values.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 p-2">
        <div className="space-y-0.5">
          {options.map((opt) => {
            const isSelected = values.includes(opt.value);
            return (
              <button
                key={opt.value}
                className={cn(
                  "flex items-center gap-2 w-full rounded-md px-2.5 py-2 text-sm transition-colors text-left",
                  isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => {
                  if (isSelected) {
                    onChange(values.filter((v) => v !== opt.value));
                  } else {
                    onChange([...values, opt.value]);
                  }
                }}
              >
                <div className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                  isSelected ? "bg-primary border-primary" : "border-border"
                )}>
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
// Component
// ============================================================================

export function TransactionsList({
  transactions,
  isLoading,
  onTransactionClick,
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
          cmp = a.total_amount - b.total_amount;
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

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />;
  }

  // Loading
  if (isLoading) {
    return (
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-0">
          <div className="p-4 border-b border-border/40">
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-7 w-20 bg-muted animate-pulse rounded-full" />
              ))}
            </div>
          </div>
          <div className="divide-y divide-border/40">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
                <div className="flex-1" />
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-4 w-16 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <Card className="border-border/60 shadow-none">
        <CardContent className="py-16">
          <div className="text-center">
            <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">
              No transactions found for this period
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 shadow-none">
      <CardContent className="p-0">
        {/* Filter Bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 flex-wrap">
          <FilterPill
            label="Status"
            values={statusFilter}
            options={STATUS_OPTIONS}
            onChange={setStatusFilter}
            renderOption={(opt) => {
              const s = STATUS_OPTIONS.find((o) => o.value === opt.value);
              return (
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", s?.dot)} />
                  {opt.label}
                </span>
              );
            }}
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
              onClick={() => { setStatusFilter([]); setTypeFilter([]); }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              Clear filters
              <X className="h-3 w-3" />
            </button>
          )}
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {filteredTransactions.length} result{filteredTransactions.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Scrollable Table */}
        <div className="overflow-x-auto">
        <div className="min-w-[620px]">

        {/* Table Header */}
        <div className="grid grid-cols-[minmax(100px,1.2fr)_1fr_1fr_minmax(80px,0.8fr)_minmax(120px,1fr)_minmax(100px,0.8fr)] gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/30">
          <button onClick={() => handleSort("amount")} className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground text-left">
            Amount <SortIcon field="amount" />
          </button>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Payment</span>
          <button onClick={() => handleSort("status")} className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground text-left">
            Status <SortIcon field="status" />
          </button>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</span>
          <button onClick={() => handleSort("date")} className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground text-left">
            Date <SortIcon field="date" />
          </button>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Staff</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border/40">
          {filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No transactions match the selected filters
            </div>
          ) : (
            filteredTransactions.map((tx) => {
              const status = getStatusStyle(tx.status);
              const type = getOrderTypeConfig(tx.order_type);
              const payment = getPaymentLabel(tx);
              const PayIcon = payment.icon;
              const TypeIcon = type.icon;
              const isRefund = tx.status === "refunded";
              const isVoid = tx.status === "void";
              const staffName =
                tx.created_by_staff?.display_name ||
                (tx.created_by_staff?.first_name
                  ? `${tx.created_by_staff.first_name} ${tx.created_by_staff.last_name || ""}`.trim()
                  : tx.created_by_user
                  ? `${tx.created_by_user.first_name || ""} ${tx.created_by_user.last_name || ""}`.trim()
                  : null);

              return (
                <div
                  key={tx.id}
                  onClick={() => onTransactionClick?.(tx)}
                  className={cn(
                    "grid grid-cols-[minmax(100px,1.2fr)_1fr_1fr_minmax(80px,0.8fr)_minmax(120px,1fr)_minmax(100px,0.8fr)] gap-2 px-4 py-3 items-center cursor-pointer transition-colors",
                    "hover:bg-muted/40",
                    (isRefund || isVoid) && "opacity-70"
                  )}
                >
                  {/* Amount */}
                  <div className="flex flex-col">
                    <span className={cn("text-sm font-semibold tabular-nums", isRefund && "text-rose-600 dark:text-rose-400")}>
                      {isRefund ? "−" : ""}{formatCurrency(tx.total_amount)}
                    </span>
                    <span className="text-[11px] text-muted-foreground/60 font-mono">
                      {tx.display_number || tx.order_number || tx.id.slice(0, 8)}
                    </span>
                  </div>

                  {/* Payment */}
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground truncate">
                    <PayIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="truncate">{payment.label}</span>
                  </div>

                  {/* Status */}
                  <div>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", status.bg, status.text)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                      {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                    </span>
                  </div>

                  {/* Type */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TypeIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden sm:inline truncate">{type.label}</span>
                  </div>

                  {/* Date */}
                  <span className="text-sm text-muted-foreground">
                    {formatTxDate(tx.created_at)}
                  </span>

                  {/* Staff */}
                  <span className="text-sm text-muted-foreground truncate text-right">
                    {staffName || "—"}
                  </span>
                </div>
              );
            })
          )}
        </div>
        </div>
        </div>
      </CardContent>
    </Card>
  );
}
