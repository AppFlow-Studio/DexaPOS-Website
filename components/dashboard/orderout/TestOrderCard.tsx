"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel, PanelSection } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Beaker,
  Loader2,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Plug,
} from "lucide-react";
import {
  useSendOrderOutTestOrder,
  useRecentOrderOutTestOrders,
} from "@/app/dashboard/online-ordering/hooks/useOrderOutTestOrder";
import type {
  OrderOutTestOrderType,
  OrderOutTestDeliveryCompany,
} from "@/lib/orderout/build-test-payload";

interface TestOrderCardProps {
  locationId: string;
  hasRestaurant: boolean;
}

type ItemCountOption = "random" | "1" | "2" | "3" | "5";

const DELIVERY_COMPANIES: OrderOutTestDeliveryCompany[] = [
  "OrderOut",
  "UBEREATS",
  "grubhub",
  "DOORDASH",
];

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function TestOrderCard({ locationId, hasRestaurant }: TestOrderCardProps) {
  const [orderType, setOrderType] = useState<OrderOutTestOrderType>("PICKUP");
  const [deliveryCompany, setDeliveryCompany] =
    useState<OrderOutTestDeliveryCompany>("OrderOut");
  const [itemCount, setItemCount] = useState<ItemCountOption>("random");
  const [forceSend, setForceSend] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [lastResult, setLastResult] = useState<{
    ok: boolean;
    testOrderNumber?: string;
    orderId?: string;
    message?: string;
    storedInDlq?: boolean;
  } | null>(null);

  const sendMutation = useSendOrderOutTestOrder(locationId);
  const { data: historyResult, isLoading: historyLoading } =
    useRecentOrderOutTestOrders(locationId, { limit: 10 });

  const history = historyResult?.data ?? [];

  if (!hasRestaurant) {
    return (
      <Panel>
        <PanelSection
          icon={Beaker}
          label="Send test order"
          caption="Connect this location to OrderOut before sending synthetic webhooks to verify the POS order flow."
        >
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Plug className="h-4 w-4" />
            OrderOut restaurant not yet connected for this location
          </div>
        </PanelSection>
      </Panel>
    );
  }

  const handleSend = () => {
    setLastResult(null);
    const resolvedItemCount =
      itemCount === "random" ? ("random" as const) : Number(itemCount);
    sendMutation.mutate(
      {
        orderType,
        deliveryCompany,
        itemCount: resolvedItemCount,
        forceSend,
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            setLastResult({
              ok: true,
              testOrderNumber: result.testOrderNumber,
              orderId: result.data?.order_id,
              message: result.message,
              storedInDlq: result.stored_in_dlq,
            });
          } else {
            setLastResult({ ok: false, message: result.error });
          }
        },
      }
    );
  };

  const isPending = sendMutation.isPending;

  return (
    <Panel>
      <PanelSection
        icon={Beaker}
        label="Send test order"
        caption="Fire a synthetic OrderOut webhook with real menu items to verify orders flow into the POS."
      >
        <div className="space-y-6">
        {/* Controls */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Order Type</Label>
            <Select
              value={orderType}
              onValueChange={(v) => setOrderType(v as OrderOutTestOrderType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PICKUP">Pickup</SelectItem>
                <SelectItem value="DELIVERY">Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Delivery Company</Label>
            <Select
              value={deliveryCompany}
              onValueChange={(v) =>
                setDeliveryCompany(v as OrderOutTestDeliveryCompany)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_COMPANIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Item Count</Label>
            <Select
              value={itemCount}
              onValueChange={(v) => setItemCount(v as ItemCountOption)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="random">Random (1–4)</SelectItem>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="5">5</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Advanced */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground"
            >
              <ChevronDown
                className={`mr-1 h-3 w-3 transition-transform ${
                  advancedOpen ? "rotate-180" : ""
                }`}
              />
              Advanced
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={forceSend}
                onCheckedChange={(v) => setForceSend(v === true)}
                className="mt-0.5"
              />
              <div>
                <p className="font-medium leading-none">Force Send</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bypass the &ldquo;accepting orders&rdquo; guard. The webhook
                  will still run — if the restaurant isn&apos;t accepting,
                  the payload will be stored in the DLQ.
                </p>
              </div>
            </label>
          </CollapsibleContent>
        </Collapsible>

        {/* Send button */}
        <div>
          <Button onClick={handleSend} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Beaker className="mr-2 h-4 w-4" />
                Send Test Order
              </>
            )}
          </Button>
        </div>

        {/* Result banner */}
        {lastResult &&
          (lastResult.ok ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950/30">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-green-800 dark:text-green-300">
                    {lastResult.storedInDlq
                      ? "Test payload stored in DLQ"
                      : "Test order created"}
                  </p>
                  <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">
                    {lastResult.testOrderNumber}
                    {lastResult.message ? ` — ${lastResult.message}` : ""}
                  </p>
                </div>
                {lastResult.orderId && !lastResult.storedInDlq && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/orders/${lastResult.orderId}`}>
                      View order
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-red-800 dark:text-red-300">
                    Test send failed
                  </p>
                  <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">
                    {lastResult.message || "Unknown error"}
                  </p>
                </div>
              </div>
            </div>
          ))}

        {/* Recent test orders */}
        <div>
          <h4 className="mb-2 text-sm font-medium">Recent test orders</h4>
          {historyLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
              No test orders sent yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Sent at</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatRelativeTime(row.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.testOrderNumber}
                    </TableCell>
                    <TableCell className="text-right">{row.itemCount}</TableCell>
                    <TableCell className="text-right">
                      ${row.total.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/dashboard/orders/${row.orderId}`}>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </div>
        </div>
      </PanelSection>
    </Panel>
  );
}
