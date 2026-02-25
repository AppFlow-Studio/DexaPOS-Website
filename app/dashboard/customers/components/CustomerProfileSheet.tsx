"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Phone,
  Mail,
  FileText,
  Plus,
  ChevronRight,
  Receipt,
  RotateCcw,
  MapPin,
  Gift,
  MessageSquare,
  X,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Tag,
  StickyNote,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  useCustomerProfile,
  useAddCustomerTag,
  useUpdateCustomerNotes,
  useCustomerSpendTrend,
  useCustomerVisitPattern,
  useCustomerTopItems,
  useCustomerChannelTrend,
  useCustomerActivityTimeline,
  useCustomerPercentileWithClerkOrgId,
  useCustomerVisitTrend,
} from "../hooks/useCustomers";
import type {
  CustomerListItem,
  CustomerActivity,
  CustomerActivityType,
} from "@/types/customer";
import {
  getCustomerDisplayName,
  transformOrderChannelsForChart,
  formatActivityTime,
  formatRelativeDate,
  ACTIVITY_DISPLAY_MAP,
} from "@/types/customer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";

interface CustomerProfileSheetProps {
  customer: CustomerListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// =============================================================================
// Activity Icon Component (legacy - for CustomerActivity type)
// =============================================================================

function ActivityIcon({ type }: { type: CustomerActivityType }) {
  const config = ACTIVITY_DISPLAY_MAP[type];
  const iconClass = "h-5 w-5";

  const icons: Record<CustomerActivityType, React.ReactNode> = {
    order: <Receipt className={iconClass} />,
    refund: <RotateCcw className={iconClass} />,
    visit: <MapPin className={iconClass} />,
    loyalty: <Gift className={iconClass} />,
    feedback: <MessageSquare className={iconClass} />,
  };

  return (
    <div
      className={cn(
        "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
        config.bgColor,
        config.color
      )}
    >
      {icons[type]}
    </div>
  );
}

// =============================================================================
// Enhanced Timeline Activity Icon (for unified timeline from RPC)
// =============================================================================

function TimelineActivityIcon({ type }: { type: string }) {
  const iconClass = "h-5 w-5";

  const config: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
    order:       { icon: <Receipt className={iconClass} />,       bg: "bg-blue-100 dark:bg-blue-900/30",   color: "text-blue-600 dark:text-blue-400" },
    refund:      { icon: <RotateCcw className={iconClass} />,     bg: "bg-red-100 dark:bg-red-900/30",     color: "text-red-600 dark:text-red-400" },
    tag_added:   { icon: <Tag className={iconClass} />,           bg: "bg-purple-100 dark:bg-purple-900/30", color: "text-purple-600 dark:text-purple-400" },
    tag_removed: { icon: <Tag className={iconClass} />,           bg: "bg-gray-100 dark:bg-gray-900/30",   color: "text-gray-500 dark:text-gray-400" },
    note_added:  { icon: <StickyNote className={iconClass} />,    bg: "bg-yellow-100 dark:bg-yellow-900/30", color: "text-yellow-600 dark:text-yellow-400" },
    loyalty:     { icon: <Gift className={iconClass} />,          bg: "bg-green-100 dark:bg-green-900/30", color: "text-green-600 dark:text-green-400" },
    feedback:    { icon: <MessageSquare className={iconClass} />, bg: "bg-orange-100 dark:bg-orange-900/30", color: "text-orange-600 dark:text-orange-400" },
    visit:       { icon: <MapPin className={iconClass} />,        bg: "bg-teal-100 dark:bg-teal-900/30",   color: "text-teal-600 dark:text-teal-400" },
  };

  const entry = config[type] ?? {
    icon: <Receipt className={iconClass} />,
    bg: "bg-muted",
    color: "text-muted-foreground",
  };

  return (
    <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", entry.bg, entry.color)}>
      {entry.icon}
    </div>
  );
}

// =============================================================================
// Activity Item Component (legacy)
// =============================================================================

function ActivityItem({ activity }: { activity: CustomerActivity }) {
  const config = ACTIVITY_DISPLAY_MAP[activity.activity_type];
  const { time, date } = formatActivityTime(activity.created_at);
  const metadata = activity.metadata;

  const renderActivityContent = () => {
    switch (activity.activity_type) {
      case "order":
        return (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("font-semibold text-base", config.color)}>Order</span>
              {metadata?.order_total && (
                <>
                  <span className="text-muted-foreground">for</span>
                  <span className="font-medium text-foreground">${metadata.order_total.toFixed(2)}</span>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Completed{metadata?.order_type && ` • ${metadata.order_type}`}{metadata?.item_count && ` • ${metadata.item_count} items`}
            </p>
          </>
        );
      case "refund":
        return (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("font-semibold text-base", config.color)}>Refund</span>
              {metadata?.refund_amount && (
                <>
                  <span className="text-muted-foreground">for</span>
                  <span className="font-medium text-foreground line-through">${metadata.refund_amount.toFixed(2)}</span>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{metadata?.refund_reason || "Refunded to card"}</p>
          </>
        );
      case "loyalty":
        return (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("font-semibold text-base", config.color)}>Loyalty</span>
              {metadata?.points_earned && <span className="font-medium text-foreground">+{metadata.points_earned} pts</span>}
              {metadata?.points_redeemed && <span className="font-medium text-foreground">-{metadata.points_redeemed} pts</span>}
            </div>
            <p className="text-sm text-muted-foreground">{metadata?.reward_name || "Points updated"}</p>
          </>
        );
      case "feedback":
        return (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("font-semibold text-base", config.color)}>Feedback</span>
              {metadata?.rating && <span className="font-medium text-foreground">{metadata.rating}/5 ⭐</span>}
            </div>
            <p className="text-sm text-muted-foreground">{metadata?.comment || "Feedback submitted"}</p>
          </>
        );
      default:
        return (
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-base text-muted-foreground">Activity</span>
          </div>
        );
    }
  };

  return (
    <div className="flex items-start gap-4 group">
      <ActivityIcon type={activity.activity_type} />
      <div className="flex-1 min-w-0">{renderActivityContent()}</div>
      <div className="text-right flex items-center gap-3 text-sm text-muted-foreground">
        <span>{time}</span>
        <span>{date}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Enhanced Timeline Item (from RPC unified timeline)
// =============================================================================

function TimelineItem({
  item,
}: {
  item: {
    activity_id: string;
    activity_type: string;
    activity_label: string;
    description: string;
    amount_value: number | null;
    currency: string | null;
    created_at: string;
    is_clickable: boolean;
    related_entity_id: string | null;
    related_entity_type: string | null;
  };
}) {
  const { time, date } = formatActivityTime(item.created_at);

  return (
    <div className={cn("flex items-start gap-4 group", item.is_clickable && "cursor-pointer hover:opacity-80 transition-opacity")}>
      <TimelineActivityIcon type={item.activity_type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-base">{item.activity_label}</span>
          {item.amount_value !== null && (
            <span className="font-medium text-foreground text-sm">
              ${item.amount_value.toFixed(2)}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{item.description}</p>
      </div>
      <div className="text-right flex items-center gap-3 text-sm text-muted-foreground shrink-0">
        <span>{time}</span>
        <span>{date}</span>
        {item.is_clickable && (
          <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Metric Card Component (Enhanced with subtitle)
// =============================================================================

function MetricCard({
  title,
  value,
  subtitle,
  badge,
  trend,
  className,
  isLoading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  badge?: string;
  trend?: { direction: "up" | "down" | "flat"; label: string };
  className?: string;
  isLoading?: boolean;
}) {
  return (
    <Card className={cn("flex flex-col justify-center p-5 h-[120px]", className)}>
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </span>
      {isLoading ? (
        <div className="space-y-1.5">
          <div className="h-7 w-24 bg-muted animate-pulse rounded" />
          <div className="h-3 w-16 bg-muted animate-pulse rounded" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground tracking-tight">{value}</span>
            {badge && (
              <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 px-1.5 py-0">
                {badge}
              </Badge>
            )}
            {trend && (
              <span className={cn(
                "flex items-center gap-0.5 text-xs font-medium",
                trend.direction === "up" && "text-green-600 dark:text-green-400",
                trend.direction === "down" && "text-red-600 dark:text-red-400",
                trend.direction === "flat" && "text-muted-foreground",
              )}>
                {trend.direction === "up" && <TrendingUp className="h-3 w-3" />}
                {trend.direction === "down" && <TrendingDown className="h-3 w-3" />}
                {trend.direction === "flat" && <Minus className="h-3 w-3" />}
                {trend.label}
              </span>
            )}
          </div>
          {subtitle && (
            <span className="text-xs text-muted-foreground mt-0.5">{subtitle}</span>
          )}
        </>
      )}
    </Card>
  );
}

// =============================================================================
// Add Tag Dialog
// =============================================================================

function AddTagDialog({
  open,
  onOpenChange,
  onAdd,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (tag: string) => void;
  isLoading: boolean;
}) {
  const [tag, setTag] = useState("");

  const handleSubmit = () => {
    if (tag.trim()) {
      onAdd(tag.trim());
      setTag("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Add Tag</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Input
            placeholder="Enter tag name..."
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!tag.trim() || isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Tag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Add Note Dialog
// =============================================================================

function AddNoteDialog({
  open,
  onOpenChange,
  onSave,
  isLoading,
  currentNotes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (notes: string) => void;
  isLoading: boolean;
  currentNotes: string | null;
}) {
  const [notes, setNotes] = useState(currentNotes || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Customer Notes</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            placeholder="Add notes about this customer..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(notes)} disabled={isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function CustomerProfileSheet({
  customer,
  open,
  onOpenChange,
}: CustomerProfileSheetProps) {
  const [showAddTag, setShowAddTag] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);

  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id || null;

  // Existing profile data
  const { data: profile, isLoading: isLoadingProfile } = useCustomerProfile(
    open && customer ? customer.id : null
  );

  // New enhanced analytics
  const customerId = open && customer ? customer.id : null;
  const { data: spendTrend, isLoading: isLoadingSpend } = useCustomerSpendTrend(customerId);
  const { data: visitPattern } = useCustomerVisitPattern(customerId);
  const { data: topItems, isLoading: isLoadingItems } = useCustomerTopItems(customerId);
  const { data: channelTrend, isLoading: isLoadingChannels } = useCustomerChannelTrend(customerId);
  const { data: activityTimeline, isLoading: isLoadingTimeline } = useCustomerActivityTimeline(customerId);
  const { data: percentile } = useCustomerPercentileWithClerkOrgId(customerId, clerkOrgId);
  const { data: visitTrend } = useCustomerVisitTrend(customerId);

  // Mutations
  const addTagMutation = useAddCustomerTag();
  const updateNotesMutation = useUpdateCustomerNotes();

  if (!customer) return null;

  const customerData = profile?.customer || customer;
  const orderChannels = transformOrderChannelsForChart(profile?.order_channels || null);
  const totalVisits = profile?.customer?.visits ?? customer.visits ?? 0;

  // Calculate lifetime spend from actual order data (spend trend RPC)
  // This ensures it's always accurate, not relying on the denormalized field
  const lifetimeSpend = spendTrend && spendTrend.length > 0
    ? spendTrend.reduce((sum, month) => sum + (month.total_spend || 0), 0)
    : (profile?.customer?.lifetime_spend ?? customer.lifetime_spend ?? 0);

  const avgSpend = profile?.customer?.avg_spend ?? customer.avg_spend ?? 0;
  const avgTip = profile?.customer?.avg_tip_percent ?? 0;

  // Last visit relative + absolute
  const lastVisitRaw = profile?.customer?.last_visit ?? customer.last_visit ?? null;
  const lastVisitRelative = formatRelativeDate(lastVisitRaw);
  const lastVisitAbsolute = lastVisitRaw
    ? new Date(lastVisitRaw).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  // Customer since
  const createdAt = profile?.customer?.created_at ?? null;
  const customerSince = createdAt
    ? (() => {
        const months = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30));
        if (months < 1) return "Less than a month";
        if (months === 1) return "1 month";
        if (months < 12) return `${months} months`;
        const years = Math.floor(months / 12);
        return `${years} year${years > 1 ? "s" : ""}`;
      })()
    : null;

  // Visit trend
  const visitTrendDir =
    visitTrend?.trend_direction === "↑" ? "up" :
    visitTrend?.trend_direction === "↓" ? "down" : "flat";
  const visitTrendLabel = visitTrend?.trend_percentage
    ? `${Math.abs(visitTrend.trend_percentage)}%`
    : "";

  // Percentile badge
  const percentileBadge = percentile?.is_top_tier
    ? `Top ${Math.round(100 - percentile.percentile)}%`
    : null;

  // Visit pattern summary: "Usually visits on Saturdays around 11 AM"
  const peakPattern = visitPattern?.[0];
  const visitPatternSummary = peakPattern
    ? `Usually visits on ${peakPattern.day_of_week}s around ${
        peakPattern.hour_of_day === 0
          ? "12 AM"
          : peakPattern.hour_of_day < 12
          ? `${peakPattern.hour_of_day} AM`
          : peakPattern.hour_of_day === 12
          ? "12 PM"
          : `${peakPattern.hour_of_day - 12} PM`
      }`
    : null;

  // Channel trend label: detect main shifting channel
  const dominantChannelTrend = channelTrend?.find(
    (c) => Math.abs((c.percentage_recent ?? 0) - (c.percentage_previous ?? 0)) > 10
  );
  const channelTrendText = dominantChannelTrend
    ? `${dominantChannelTrend.trend_label} ${dominantChannelTrend.channel}`
    : null;

  const handleAddTag = (tag: string) => {
    addTagMutation.mutate({ customerId: customer.id, tag }, { onSuccess: () => setShowAddTag(false) });
  };

  const handleSaveNotes = (notes: string) => {
    updateNotesMutation.mutate({ customerId: customer.id, notes }, { onSuccess: () => setShowAddNote(false) });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-[900px] w-full overflow-y-auto px-0 bg-[#F8F9FB] dark:bg-background">
          <div className="px-6 py-6 border-b bg-background">
            <SheetHeader className="space-y-4">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <SheetTitle className="text-3xl font-bold tracking-tight text-left">
                    {getCustomerDisplayName(customerData as any)}
                  </SheetTitle>
                  <div className="flex gap-2 flex-wrap">
                    {profile?.customer?.tags?.map((tag) => (
                      <Badge key={tag} variant="secondary" className="h-7 text-xs rounded-full">
                        {tag}
                      </Badge>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs rounded-full bg-muted/50 border-muted-foreground/20 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setShowAddTag(true)}
                    >
                      <Plus className="w-3 h-3 mr-1" /> ADD TAG
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
                      onClick={() => setShowAddNote(true)}
                    >
                      <FileText className="w-3 h-3 mr-2" /> add note
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 text-sm">
                  <div className="flex items-center gap-2 text-foreground/80 font-medium">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    {customerData.phone || "No phone"}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    {customerData.email || "No email address"}
                  </div>
                </div>
              </div>
            </SheetHeader>

            <Tabs defaultValue="overview" className="mt-8">
              <TabsList className="bg-transparent h-auto p-0 space-x-6 border-b rounded-none w-full justify-start">
                {[
                  { name: "Overview", count: null },
                  { name: "Orders", count: profile?.customer?.total_orders ?? customer.total_orders ?? 0 },
                  { name: "Bookings", count: 0 },
                  { name: "Feedback", count: 0 },
                  { name: "Loyalty", count: null },
                  { name: "Marketing", count: null },
                  { name: "Details", count: null },
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.name}
                    value={tab.name.toLowerCase()}
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 text-muted-foreground data-[state=active]:text-foreground font-medium bg-transparent shadow-none border-b-2 border-transparent transition-none"
                  >
                    {tab.name}
                    {tab.count !== null && (
                      <span className="ml-1.5 text-xs text-muted-foreground font-normal">{tab.count}</span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="mt-6">
                <TabsContent value="overview" className="space-y-6 animate-in fade-in-50 duration-300">

                  {/* 6 KPI Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <MetricCard
                      title="LAST VISIT"
                      value={lastVisitRelative}
                      subtitle={lastVisitAbsolute ?? undefined}
                      className="bg-white dark:bg-card border-none shadow-sm"
                      isLoading={isLoadingProfile}
                    />
                    <MetricCard
                      title="TOTAL VISITS"
                      value={String(totalVisits)}
                      trend={visitTrendLabel ? { direction: visitTrendDir, label: visitTrendLabel } : undefined}
                      className="bg-white dark:bg-card border-none shadow-sm"
                      isLoading={isLoadingProfile}
                    />
                    <MetricCard
                      title="LIFETIME SPEND"
                      value={`$${lifetimeSpend.toLocaleString()}`}
                      badge={percentileBadge ?? undefined}
                      className="bg-white dark:bg-card border-none shadow-sm"
                      isLoading={isLoadingProfile || isLoadingSpend}
                    />
                    <MetricCard
                      title="AVG. SPEND"
                      value={`$${avgSpend.toFixed(2)}`}
                      className="bg-white dark:bg-card border-none shadow-sm"
                      isLoading={isLoadingProfile}
                    />
                    <MetricCard
                      title="AVG. TIP"
                      value={`${avgTip.toFixed(1)}%`}
                      className="bg-white dark:bg-card border-none shadow-sm"
                      isLoading={isLoadingProfile}
                    />
                    <MetricCard
                      title="CUSTOMER SINCE"
                      value={customerSince ?? "—"}
                      className="bg-white dark:bg-card border-none shadow-sm"
                      isLoading={isLoadingProfile}
                    />
                  </div>

                  {/* Spend Over Time + Visit Pattern */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Spend Over Time */}
                    <Card className="border-none shadow-sm bg-white dark:bg-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          SPEND OVER TIME
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {isLoadingSpend ? (
                          <div className="h-[140px] flex items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : spendTrend && spendTrend.length > 0 ? (
                          <ResponsiveContainer width="100%" height={140}>
                            <AreaChart data={spendTrend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                              <defs>
                                <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                              <YAxis hide />
                              <Tooltip
                                formatter={(val: number) => [`$${val.toFixed(2)}`, "Spend"]}
                                contentStyle={{ fontSize: 12, border: "none", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
                              />
                              <Area type="monotone" dataKey="total_spend" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#spendGradient)" />
                            </AreaChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[140px] flex items-center justify-center text-muted-foreground text-sm">
                            No spend data yet
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Visit Pattern */}
                    <Card className="border-none shadow-sm bg-white dark:bg-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          VISIT PATTERN
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col justify-center h-[140px]">
                        {visitPatternSummary ? (
                          <div className="space-y-3">
                            <p className="text-sm text-foreground">{visitPatternSummary}</p>
                            {visitPattern && visitPattern.slice(0, 3).map((p, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                                <div className="w-2 h-2 rounded-full bg-primary opacity-80" />
                                <span>{p.day_of_week} — {p.hour_of_day}:00 · {p.visit_count} visits</span>
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
                  <div className="grid grid-cols-2 gap-4">
                    {/* Order Channels */}
                    <Card className="border-none shadow-sm bg-white dark:bg-card h-full">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            ORDER CHANNELS
                          </CardTitle>
                          {channelTrendText && (
                            <span className="text-[10px] text-muted-foreground italic">{channelTrendText}</span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between pl-0">
                        {isLoadingChannels ? (
                          <div className="w-full h-[140px] flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
                            <div className="h-[140px] w-[140px] relative">
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="text-xl font-bold">{totalVisits}</span>
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
                          <div className="w-full h-[140px] flex items-center justify-center text-muted-foreground text-sm">
                            No order data yet
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Most Ordered Items (last 90 days) */}
                    <Card className="border-none shadow-sm bg-white dark:bg-card h-full">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            MOST ORDERED (90 DAYS)
                          </CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-2 px-6">
                        {isLoadingItems ? (
                          <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="h-6 bg-muted animate-pulse rounded" />
                            ))}
                          </div>
                        ) : topItems && topItems.length > 0 ? (
                          <div className="space-y-3">
                            {topItems.map((item, i) => (
                              <div key={item.item_id || i} className="flex items-center justify-between text-sm py-1 border-b last:border-0 border-muted/40">
                                <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                                  <span className="font-medium text-foreground/90 truncate">
                                    {item.item_name}
                                  </span>
                                  {item.is_new_favorite && (
                                    <Badge className="text-[9px] px-1 py-0 h-4 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 shrink-0">
                                      NEW
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-mono text-muted-foreground">{item.order_count}x</span>
                                  <span className="text-muted-foreground text-xs ml-1.5">({item.frequency_label})</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="h-[120px] flex items-center justify-center text-muted-foreground text-sm">
                            No orders in last 90 days
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Activity Timeline */}
                  <div className="bg-white dark:bg-card rounded-lg p-6 shadow-sm">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-6">
                      ACTIVITY
                    </h3>
                    {isLoadingTimeline ? (
                      <div className="space-y-6">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="flex items-start gap-4">
                            <div className="h-10 w-10 bg-muted animate-pulse rounded-lg" />
                            <div className="flex-1 space-y-2">
                              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                              <div className="h-3 w-48 bg-muted animate-pulse rounded" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : activityTimeline && activityTimeline.length > 0 ? (
                      <div className="space-y-6">
                        {activityTimeline.map((item) => (
                          <TimelineItem key={item.activity_id} item={item} />
                        ))}
                      </div>
                    ) : (
                      <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                        No activity recorded yet
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Placeholder tabs */}
                {["orders", "bookings", "feedback", "loyalty", "marketing", "details"].map((tab) => (
                  <TabsContent
                    key={tab}
                    value={tab}
                    className="h-64 flex items-center justify-center text-muted-foreground bg-white dark:bg-card rounded-lg border-2 border-dashed"
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)} view coming soon
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      <AddTagDialog open={showAddTag} onOpenChange={setShowAddTag} onAdd={handleAddTag} isLoading={addTagMutation.isPending} />
      <AddNoteDialog open={showAddNote} onOpenChange={setShowAddNote} onSave={handleSaveNotes} isLoading={updateNotesMutation.isPending} currentNotes={profile?.customer?.notes || null} />
    </>
  );
}
