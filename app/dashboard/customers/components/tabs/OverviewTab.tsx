"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { MetricCard, TimelineItem } from "../OverviewHelpers";
import { CHANNEL_DISPLAY_MAP } from "@/types/customer";

interface OverviewTabProps {
  lastVisitRelative: string;
  lastVisitAbsolute: string | null;
  totalVisits: number;
  visitTrendLabel: string | null;
  visitTrendDir: "up" | "down" | "flat";
  lifetimeSpend: number;
  percentileBadge: string | null;
  avgSpend: number;
  avgTip: number;
  customerSince: string | null;
  isLoadingProfile: boolean;
  isLoadingSpend: boolean;
  spendTrend: any[];
  visitPattern: any[];
  visitPatternSummary: string | null;
  isLoadingItems: boolean;
  topItems: any[];
  isLoadingChannels: boolean;
  orderChannels: any[];
  channelTrendText: string | null;
  totalOrdersRecent: number;
  activityTimeline: any[];
  isLoadingTimeline: boolean;
  onOrderClick: (orderId: string) => void;
}

export function OverviewTab({
  lastVisitRelative,
  lastVisitAbsolute,
  totalVisits,
  visitTrendLabel,
  visitTrendDir,
  lifetimeSpend,
  percentileBadge,
  avgSpend,
  avgTip,
  customerSince,
  isLoadingProfile,
  isLoadingSpend,
  spendTrend,
  visitPattern,
  visitPatternSummary,
  isLoadingItems,
  topItems,
  isLoadingChannels,
  orderChannels,
  channelTrendText,
  totalOrdersRecent,
  activityTimeline,
  isLoadingTimeline,
  onOrderClick,
}: OverviewTabProps) {
  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* 6 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="LAST VISIT"
          value={lastVisitRelative}
          subtitle={lastVisitAbsolute ?? undefined}
          className="rounded-2xl border-0 bg-muted/60 shadow-none"
          isLoading={isLoadingProfile}
        />
        <MetricCard
          title="TOTAL VISITS"
          value={String(totalVisits)}
          trend={visitTrendLabel ? { direction: visitTrendDir, label: visitTrendLabel } : undefined}
          className="rounded-2xl border-0 bg-muted/60 shadow-none"
          isLoading={isLoadingProfile}
        />
        <MetricCard
          title="LIFETIME SPEND"
          value={`$${lifetimeSpend.toLocaleString()}`}
          badge={percentileBadge ?? undefined}
          className="rounded-2xl border-0 bg-muted/60 shadow-none"
          isLoading={isLoadingProfile || isLoadingSpend}
        />
        <MetricCard
          title="AVG. SPEND"
          value={`$${avgSpend.toFixed(2)}`}
          className="rounded-2xl border-0 bg-muted/60 shadow-none"
          isLoading={isLoadingProfile}
        />
        <MetricCard
          title="AVG. TIP"
          value={`${avgTip.toFixed(1)}%`}
          className="rounded-2xl border-0 bg-muted/60 shadow-none"
          isLoading={isLoadingProfile}
        />
        <MetricCard
          title="CUSTOMER SINCE"
          value={customerSince ?? "—"}
          className="rounded-2xl border-0 bg-muted/60 shadow-none"
          isLoading={isLoadingProfile}
        />
      </div>

      {/* Spend Over Time + Visit Pattern */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spend Over Time */}
        <Card className="overflow-hidden rounded-2xl border-0 bg-muted/35 shadow-none">
          <CardHeader className="pb-4 pt-6 px-6">
            <CardTitle className="text-sm font-bold text-foreground tracking-normal">
              Spend Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSpend ? (
              // Chart-shaped: the area chart below is 140px tall.
              <Skeleton className="h-35 w-full rounded-lg motion-reduce:animate-none" />
            ) : spendTrend && spendTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={spendTrend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(val: number) => [`$${val.toFixed(2)}`, "Spend"]}
                    contentStyle={{ fontSize: 12, border: "none", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
                  />
                  <Area type="monotone" dataKey="total_spend" stroke="#10b981" strokeWidth={2} fill="url(#spendGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-35 flex items-center justify-center text-muted-foreground text-sm">
                No spend data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Visit Pattern */}
        <Card className="overflow-hidden rounded-2xl border-0 bg-muted/35 shadow-none">
          <CardHeader className="pb-4 pt-6 px-6">
            <CardTitle className="text-sm font-bold text-foreground tracking-normal">
              Visit Pattern
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col justify-center h-35">
            {visitPatternSummary ? (
              <div className="space-y-3">
                <p className="text-sm text-foreground">{visitPatternSummary}</p>
                {visitPattern &&
                  visitPattern.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-2 h-2 rounded-full bg-primary opacity-80" />
                      <span>
                        {p.day_of_week} — {p.hour_of_day}:00 · {p.visit_count} visits
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="flex items-center justify-center text-muted-foreground text-sm">
                Not enough data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order Channels + Most Ordered Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order Channels */}
        <Card className="h-full overflow-hidden rounded-2xl border-0 bg-muted/35 shadow-none">
          <CardHeader className="pb-4 pt-6 px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-foreground tracking-normal">
                Order Channels
              </CardTitle>
              {channelTrendText && <span className="text-[10px] text-muted-foreground italic">{channelTrendText}</span>}
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between pl-0">
            {isLoadingChannels ? (
              // Mirrors the populated layout: a legend column beside the
              // donut, rather than a spinner floating in an empty box.
              <div className="flex w-full min-w-0 items-center justify-between gap-4">
                <div className="min-w-0 space-y-3 pl-6">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full motion-reduce:animate-none" />
                      <Skeleton className="h-3.5 w-20 rounded-full motion-reduce:animate-none" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-28 w-28 shrink-0 rounded-full motion-reduce:animate-none" />
              </div>
            ) : orderChannels.length > 0 ? (
              <>
                <div className="space-y-3 pl-6 text-sm">
                  {orderChannels.map((channel, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: channel.color }} />
                      <span className="font-medium text-foreground">{channel.name}</span>
                      <span className="text-muted-foreground ml-auto">{channel.value}%</span>
                    </div>
                  ))}
                </div>
                <div className="h-35 w-35 relative">
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold">{totalOrdersRecent}</span>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={orderChannels} cx="50%" cy="50%" innerRadius={45} outerRadius={60} paddingAngle={0} dataKey="value" stroke="none">
                        {orderChannels.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <div className="w-full h-35 flex items-center justify-center text-muted-foreground text-sm">
                No order data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Most Ordered Items (last 90 days) */}
        <Card className="h-full overflow-hidden rounded-2xl border-0 bg-muted/35 shadow-none">
          <CardHeader className="pb-4 pt-6 px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-foreground tracking-normal">
                Most Ordered Items (90 Days)
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6 px-6 pb-6">
            {isLoadingItems ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-6 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : topItems && topItems.length > 0 ? (
              <div className="space-y-2">
                {topItems.map((item, i) => (
                  <div key={item.item_id || i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                      <span className="font-semibold text-sm text-foreground truncate">
                        {item.item_name}
                      </span>
                      {item.is_new_favorite && (
                        <Badge className="text-xs px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 shrink-0 font-semibold">
                          NEW
                        </Badge>
                      )}
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <span className="font-bold text-foreground">{item.order_count}</span>
                      <span className="text-xs text-muted-foreground">({item.frequency_label})</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                No orders in last 90 days
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Timeline */}
      <div className="rounded-2xl border-0 bg-muted/35 p-4 shadow-none sm:p-6">
        <h3 className="text-sm font-bold text-foreground tracking-normal mb-6">
          Recent Activity
        </h3>
        {isLoadingTimeline ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-4 p-4 bg-muted/20 rounded-lg">
                <div className="h-10 w-10 bg-muted animate-pulse rounded-lg shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-56 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : activityTimeline && activityTimeline.length > 0 ? (
          <div className="space-y-3">
            {activityTimeline.map((item) => (
              <TimelineItem
                key={item.activity_id}
                item={item}
                onOrderClick={onOrderClick}
              />
            ))}
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm rounded-lg bg-muted/20">
            No activity recorded yet
          </div>
        )}
      </div>
    </div>
  );
}
