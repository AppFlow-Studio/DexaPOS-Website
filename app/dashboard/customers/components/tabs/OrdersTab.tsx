"use client";

import { useState, useMemo } from "react";
import { useCustomerOrders } from "../../hooks/useCustomerOrders";
import { useLocationStore } from "@/stores/location-store";
import type { CustomerListItem } from "@/types/customer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Receipt,
  Calendar,
  Banknote,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OrderDetailSheet } from "@/components/dashboard/orders/OrderDetailSheet";
import type { OrderResponse } from "@/types/order-management";

interface OrdersTabProps {
  customer: CustomerListItem;
}

type DateRangeFilter = "30d" | "90d" | "6mo" | "1yr" | "all";
type StatusFilter = "all" | "completed" | "void" | "refund";
type SortField = "date" | "total" | "items" | "status";

export function OrdersTab({ customer }: OrdersTabProps) {
  const { selectedLocationId } = useLocationStore();
  const { data: orders = [], isLoading } = useCustomerOrders(customer.id, selectedLocationId);
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Filter by date range
  const dateFilteredOrders = useMemo(() => {
    if (dateRange === "all") return orders;

    const now = new Date();
    const daysMap: Record<Exclude<DateRangeFilter, "all">, number> = {
      "30d": 30,
      "90d": 90,
      "6mo": 180,
      "1yr": 365,
    };
    const days = daysMap[dateRange];
    const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    return orders.filter((order) => new Date(order.created_at) >= cutoffDate);
  }, [orders, dateRange]);

  // Filter by status
  const statusFilteredOrders = useMemo(() => {
    if (statusFilter === "all") return dateFilteredOrders;
    return dateFilteredOrders.filter((order) => String(order.status) === statusFilter);
  }, [dateFilteredOrders, statusFilter]);

  // Sort
  const sortedOrders = useMemo(() => {
    const sorted = [...statusFilteredOrders];
    sorted.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case "date":
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case "total":
          aVal = a.total_amount || 0;
          bVal = b.total_amount || 0;
          break;
        case "items":
          aVal = a.order_items?.length || 0;
          bVal = b.order_items?.length || 0;
          break;
        case "status":
          aVal = a.status || "";
          bVal = b.status || "";
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [statusFilteredOrders, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  // Calculate stats
  const stats = useMemo(() => {
    const total = orders.length;
    const completed = orders.filter((o) => String(o.status) === "completed").length;
    const voided = orders.filter((o) => String(o.status) === "void").length;
    const refunded = orders.filter((o) => String(o.status) === "refund").length;

    return {
      total,
      completed,
      completedPct: total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0",
      voided,
      voidedPct: total > 0 ? ((voided / total) * 100).toFixed(1) : "0.0",
      refunded,
      refundedPct: total > 0 ? ((refunded / total) * 100).toFixed(1) : "0.0",
    };
  }, [orders]);

  const handleViewOrder = (order: OrderResponse) => {
    setSelectedOrder(order);
    setIsDetailOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "void":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "refund":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const getPaymentIcon = (method: string) => {
    if (method === "cash") return <Banknote className="h-4 w-4 text-green-600" />;
    return <CreditCard className="h-4 w-4 text-blue-600" />;
  };

  return (
    <div className="space-y-6 py-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Total Orders
                </p>
                <p className="text-2xl font-bold mt-2">{stats.total}</p>
              </div>
              <Receipt className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Completed
                </p>
                <p className="text-2xl font-bold mt-2">{stats.completed}</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.completedPct}%</p>
              </div>
              <div className="h-5 w-5 rounded-full bg-green-100 dark:bg-green-900/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Voided
                </p>
                <p className="text-2xl font-bold mt-2">{stats.voided}</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.voidedPct}%</p>
              </div>
              <div className="h-5 w-5 rounded-full bg-red-100 dark:bg-red-900/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Refunded
                </p>
                <p className="text-2xl font-bold mt-2">{stats.refunded}</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.refundedPct}%</p>
              </div>
              <div className="h-5 w-5 rounded-full bg-amber-100 dark:bg-amber-900/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={dateRange} onValueChange={(val) => setDateRange(val as DateRangeFilter)}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="6mo">Last 6 months</SelectItem>
            <SelectItem value="1yr">Last year</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as StatusFilter)}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="void">Voided</SelectItem>
            <SelectItem value="refund">Refunded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <div className="border rounded-lg bg-white dark:bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sortedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Receipt className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No orders found</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/30 border-b">
              <TableRow>
                <TableHead className="w-24">
                  <button
                    className="flex items-center gap-1 hover:text-foreground"
                    onClick={() => handleSort("date")}
                  >
                    Date
                    {sortField === "date" &&
                      (sortDir === "asc" ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      ))}
                  </button>
                </TableHead>
                <TableHead className="w-20">Order #</TableHead>
                <TableHead className="w-24">Type</TableHead>
                <TableHead className="w-20 text-right">
                  <button
                    className="flex items-center justify-end gap-1 w-full hover:text-foreground"
                    onClick={() => handleSort("items")}
                  >
                    Items
                    {sortField === "items" &&
                      (sortDir === "asc" ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      ))}
                  </button>
                </TableHead>
                <TableHead className="w-24 text-right">
                  <button
                    className="flex items-center justify-end gap-1 w-full hover:text-foreground"
                    onClick={() => handleSort("total")}
                  >
                    Total
                    {sortField === "total" &&
                      (sortDir === "asc" ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      ))}
                  </button>
                </TableHead>
                <TableHead className="w-16">Tip</TableHead>
                <TableHead className="w-16">Payment</TableHead>
                <TableHead className="w-24">
                  <button
                    className="flex items-center gap-1 hover:text-foreground"
                    onClick={() => handleSort("status")}
                  >
                    Status
                    {sortField === "status" &&
                      (sortDir === "asc" ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      ))}
                  </button>
                </TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedOrders.map((order) => (
                <TableRow key={order.id} className="hover:bg-muted/50">
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {new Date(order.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm font-medium">
                    {order.display_number}
                  </TableCell>
                  <TableCell className="text-sm">
                    <Badge variant="outline" className="text-xs">
                      {order.order_type || "-"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {order.order_items?.length || 0} item{order.order_items?.length !== 1 ? "s" : ""}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${(order.total_amount || 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {order.tip_amount ? `$${order.tip_amount.toFixed(2)}` : "-"}
                  </TableCell>
                  <TableCell className="text-center flex justify-center">
                    {getPaymentIcon(order.payment_pricing_mode || "")}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("text-xs", getStatusColor(order.status))}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewOrder(order)}
                      className="h-8 w-8 p-0"
                    >
                      {"->"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Order Detail Sheet */}
      {selectedOrder && (
        <OrderDetailSheet
          order={selectedOrder}
          open={isDetailOpen}
          onOpenChange={setIsDetailOpen}
        />
      )}
    </div>
  );
}
