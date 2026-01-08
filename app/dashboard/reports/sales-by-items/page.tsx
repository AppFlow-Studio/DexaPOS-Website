"use client";

import { useState } from "react";
import { useSalesByItemReport } from "../../hooks/useOrderAnalytics";
import {
  DateRangePicker,
  DatePreset,
} from "@/components/dashboard/orders/DateRangePicker";
import { subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SalesByItemsPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [preset, setPreset] = useState<DatePreset>("last_30_days");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: items, isLoading } = useSalesByItemReport(
    dateRange.from,
    dateRange.to
  );

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    if (from && to) {
      setDateRange({ from, to });
    }
  };

  const filteredItems =
    items?.filter(
      (item) =>
        item.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category?.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sales By Items</h2>
          <p className="text-muted-foreground">
            Detailed performance breakdown of your menu items
          </p>
        </div>
        <div>
          <DateRangePicker
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            onDateRangeChange={handleDateRangeChange}
            preset={preset}
            onPresetChange={setPreset}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
            <CardTitle>Item Performance</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search items..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Qty Sold</TableHead>
                <TableHead className="text-right">Gross Sales</TableHead>
                <TableHead className="text-right">Net Sales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-4 w-12 ml-auto" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-4 w-20 ml-auto" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-4 w-20 ml-auto" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center h-48 text-muted-foreground"
                  >
                    {items && items.length > 0
                      ? "No items match your search"
                      : "No sales data found for this period"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      {item.item_name}
                    </TableCell>
                    <TableCell>
                      {item.category ? (
                        <Badge variant="secondary" className="font-normal">
                          {item.category}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.quantity_sold}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      ${item.gross_sales.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      ${item.net_sales.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
