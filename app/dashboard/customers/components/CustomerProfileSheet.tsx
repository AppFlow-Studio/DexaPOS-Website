"use client";

import { useState, useMemo } from "react";
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
  ChevronUp,
  ChevronDown,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useCustomerOrders } from "../hooks/useCustomerOrders";
import { OrderDetailSheet } from "@/components/dashboard/orders/OrderDetailSheet";
import { useCustomerReservations, useCustomerWaitlist, useCustomerDineSessions } from "../hooks/useCustomerBookings";
import { DetailsTab } from "./tabs/DetailsTab";
import { LoyaltyTab } from "./tabs/LoyaltyTab";
import { MarketingTab } from "./tabs/MarketingTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { BookingsTab } from "./tabs/BookingsTab";
import { FeedbackTab } from "./tabs/FeedbackTab";
import { OrdersTab } from "./tabs/OrdersTab";
import { useAddFeedbackResponse, useCustomerFeedback, useUpdateFeedbackFlag } from "../hooks/useCustomerFeedback";

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
    <Card className={cn("flex flex-col justify-center p-5 h-30", className)}>
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

const SUGGESTED_TAGS = [
  "VIP",
  "REGULAR",
  "NEW",
  "CORPORATE",
  "FRIEND_OF_OWNER",
  "INFLUENCER",
  "COMPLAINT_HISTORY",
  "CATERING_CLIENT",
];

const formatTagForDisplay = (tag: string): string => {
  return tag
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
};

function AddTagDialog({
  open,
  onOpenChange,
  onAdd,
  isLoading,
  existingTags = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (tag: string) => void;
  isLoading: boolean;
  existingTags?: string[];
}) {
  const [customTag, setCustomTag] = useState("");

  const suggestedNewTags = SUGGESTED_TAGS.filter(
    (tag) => !existingTags.includes(tag.toUpperCase())
  );

  const handleAddSuggestedTag = (tag: string) => {
    onAdd(tag);
    onOpenChange(false);
  };

  const handleAddCustomTag = () => {
    if (customTag.trim()) {
      onAdd(customTag.trim().toUpperCase());
      setCustomTag("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-125">
        <DialogHeader>
          <DialogTitle>Add Tag</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Suggested Tags Dropdown */}
          <div>
            <label className="text-sm font-medium mb-2 block">Suggested Tags</label>
            <Select onValueChange={handleAddSuggestedTag}>
              <SelectTrigger>
                <SelectValue placeholder="Select from suggested tags..." />
              </SelectTrigger>
              <SelectContent>
                {suggestedNewTags.length > 0 ? (
                  suggestedNewTags.map(tag => (
                    <SelectItem key={tag} value={tag}>
                      {formatTagForDisplay(tag)}
                    </SelectItem>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground p-2">
                    All suggested tags already added
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Tag Input */}
          <div>
            <label className="text-sm font-medium mb-2 block">Custom Tag</label>
            <div className="flex gap-2">
              <Input
                placeholder="Or create a custom tag..."
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCustomTag()}
                autoFocus
              />
              <Button
                onClick={handleAddCustomTag}
                disabled={!customTag.trim() || isLoading}
                size="sm"
              >
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
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
      <DialogContent className="sm:max-w-125">
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
// Bookings Tab Content Component
// =============================================================================

function BookingsTabContent({ customer }: { customer: CustomerListItem | null }) {
  const [activeSubTab, setActiveSubTab] = useState<"reservations" | "waitlist" | "dine">("reservations");
  const customerId = customer?.id || null;

  const { data: reservations = [], isLoading: loadingRes } = useCustomerReservations(customerId);
  const { data: waitlist = [], isLoading: loadingWait } = useCustomerWaitlist(customerId);
  const { data: dineSessions = [], isLoading: loadingDine } = useCustomerDineSessions(customerId);

  const stats = useMemo(() => {
    const totalBookings = reservations.length;
    const completedBookings = reservations.filter((r: any) => r.status === "completed").length;
    const noShows = reservations.filter((r: any) => r.status === "no_show").length;
    const avgPartySize = totalBookings > 0
      ? (reservations.reduce((sum, r: any) => sum + (r.party_size || 0), 0) / totalBookings).toFixed(1)
      : 0;
    const noShowRate = totalBookings > 0 ? ((noShows / totalBookings) * 100).toFixed(1) : 0;

    return {
      totalBookings,
      completedBookings,
      completedPct: totalBookings > 0 ? ((completedBookings / totalBookings) * 100).toFixed(1) : 0,
      noShows,
      noShowRate,
      avgPartySize,
    };
  }, [reservations]);

  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Bookings</p>
            <p className="text-2xl font-bold mt-2">{stats.totalBookings}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Completed</p>
            <p className="text-2xl font-bold mt-2">{stats.completedBookings}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.completedPct}%</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">No-Shows</p>
            <p className="text-2xl font-bold mt-2">{stats.noShows}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.noShowRate}%</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Avg Party Size</p>
            <p className="text-2xl font-bold mt-2">{stats.avgPartySize}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sub-tabs */}
      <Tabs value={activeSubTab} onValueChange={(val) => setActiveSubTab(val as any)}>
        <TabsList className="bg-muted">
          <TabsTrigger value="reservations">Reservations ({reservations.length})</TabsTrigger>
          <TabsTrigger value="waitlist">Waitlist ({waitlist.length})</TabsTrigger>
          <TabsTrigger value="dine">Dine-In ({dineSessions.length})</TabsTrigger>
        </TabsList>

        {/* Reservations */}
        <TabsContent value="reservations" className="mt-6">
          {loadingRes ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : reservations.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">No reservations</div>
          ) : (
            <div className="border rounded-lg overflow-x-auto bg-white dark:bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Date & Time</th>
                    <th className="px-4 py-3 text-left font-medium">Party Size</th>
                    <th className="px-4 py-3 text-left font-medium">Location</th>
                    <th className="px-4 py-3 text-left font-medium">Table</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {(reservations as any[]).map((res) => (
                    <tr key={res.id} className="border-t hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm">{res.reservation_date} {res.reservation_time}</td>
                      <td className="px-4 py-3 text-sm">{res.party_size}</td>
                      <td className="px-4 py-3 text-sm">{res.location?.name}</td>
                      <td className="px-4 py-3 text-sm">{res.assigned_table_ids?.join(", ") || "—"}</td>
                      <td className="px-4 py-3"><Badge variant="outline">{res.status || "—"}</Badge></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">{res.special_requests || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Waitlist */}
        <TabsContent value="waitlist" className="mt-6">
          {loadingWait ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : waitlist.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">No waitlist entries</div>
          ) : (
            <div className="border rounded-lg overflow-x-auto bg-white dark:bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Party</th>
                    <th className="px-4 py-3 text-left font-medium">Quoted Wait</th>
                    <th className="px-4 py-3 text-left font-medium">Actual Wait</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {(waitlist as any[]).map((entry) => (
                    <tr key={entry.id} className="border-t hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm">{new Date(entry.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-sm">{entry.party_size}</td>
                      <td className="px-4 py-3 text-sm">{entry.quoted_wait_minutes} min</td>
                      <td className="px-4 py-3 text-sm">{entry.actual_wait_minutes ? `${entry.actual_wait_minutes} min` : "—"}</td>
                      <td className="px-4 py-3"><Badge variant="outline">{entry.status || "—"}</Badge></td>
                      <td className="px-4 py-3 text-sm">{entry.location?.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Dine-In Sessions */}
        <TabsContent value="dine" className="mt-6">
          {loadingDine ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : dineSessions.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">No dine-in sessions</div>
          ) : (
            <div className="border rounded-lg overflow-x-auto bg-white dark:bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Table(s)</th>
                    <th className="px-4 py-3 text-left font-medium">Party</th>
                    <th className="px-4 py-3 text-left font-medium">Duration</th>
                    <th className="px-4 py-3 text-left font-medium">Server</th>
                    <th className="px-4 py-3 text-left font-medium">Order</th>
                    <th className="px-4 py-3 text-left font-medium">Complaint</th>
                  </tr>
                </thead>
                <tbody>
                  {(dineSessions as any[]).map((session) => {
                    const duration = session.closed_at
                      ? Math.round((new Date(session.closed_at).getTime() - new Date(session.seated_at).getTime()) / 60000)
                      : null;
                    return (
                      <tr key={session.id} className="border-t hover:bg-muted/50">
                        <td className="px-4 py-3 text-sm">{new Date(session.seated_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-sm">{session.table_numbers?.join(", ") || "—"}</td>
                        <td className="px-4 py-3 text-sm">{session.party_size}</td>
                        <td className="px-4 py-3 text-sm">{duration ? `${duration} min` : "—"}</td>
                        <td className="px-4 py-3 text-sm">{session.server?.display_name || "—"}</td>
                        <td className="px-4 py-3 text-sm">{session.order?.display_number || "—"}</td>
                        <td className="px-4 py-3">
                          {session.is_complaint ? <Badge variant="destructive">Yes</Badge> : "No"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

// =============================================================================
// Feedback Tab Content Component
// =============================================================================

function FeedbackTabContent({ customer }: { customer: CustomerListItem | null }) {
  const customerId = customer?.id || null;
  const { data: feedback = [], isLoading } = useCustomerFeedback(customerId);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");

  const respondMutation = useAddFeedbackResponse();
  const flagMutation = useUpdateFeedbackFlag();

  const stats = useMemo(() => {
    if (feedback.length === 0) {
      return {
        avgRating: 0,
        totalReviews: 0,
        foodAvg: 0,
        serviceAvg: 0,
      };
    }

    const overallSum = feedback.reduce((sum, f: any) => sum + (f.overall_rating || 0), 0);
    const foodSum = feedback.reduce((sum, f: any) => sum + (f.food_rating || 0), 0);
    const serviceSum = feedback.reduce((sum, f: any) => sum + (f.service_rating || 0), 0);
    const foodCount = feedback.filter((f: any) => f.food_rating).length;
    const serviceCount = feedback.filter((f: any) => f.service_rating).length;

    return {
      avgRating: (overallSum / feedback.length).toFixed(1),
      totalReviews: feedback.length,
      foodAvg: foodCount > 0 ? (foodSum / foodCount).toFixed(1) : 0,
      serviceAvg: serviceCount > 0 ? (serviceSum / serviceCount).toFixed(1) : 0,
    };
  }, [feedback]);

  const handleRespond = async () => {
    if (!respondingTo || !responseText.trim()) return;
    await respondMutation.mutateAsync({ feedbackId: respondingTo, response: responseText });
    setRespondingTo(null);
    setResponseText("");
  };

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Avg Rating</p>
            <p className="text-2xl font-bold mt-2">⭐ {stats.avgRating}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Reviews</p>
            <p className="text-2xl font-bold mt-2">{stats.totalReviews}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Food Avg</p>
            <p className="text-2xl font-bold mt-2">⭐ {stats.foodAvg}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Service Avg</p>
            <p className="text-2xl font-bold mt-2">⭐ {stats.serviceAvg}</p>
          </CardContent>
        </Card>
      </div>

      {/* Feedback List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : feedback.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground">No feedback yet</div>
        ) : (
          (feedback as any[]).map((item) => (
            <Card key={item.id} className="border shadow-sm">
              <CardContent className="pt-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{"⭐".repeat(item.overall_rating)}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                      {item.is_flagged && (
                        <Badge variant="destructive" className="text-xs">Flagged</Badge>
                      )}
                    </div>
                    {item.comment && (
                      <p className="text-sm text-foreground mb-2">{item.comment}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={item.is_flagged ? "default" : "outline"}
                      onClick={() => flagMutation.mutate({ feedbackId: item.id, isFlagged: !item.is_flagged })}
                      className="h-8"
                    >
                      {item.is_flagged ? "Unflag" : "Flag"}
                    </Button>
                    {!item.response && (
                      <Button
                        size="sm"
                        onClick={() => setRespondingTo(item.id)}
                        className="h-8"
                      >
                        Respond
                      </Button>
                    )}
                  </div>
                </div>

                {/* Response */}
                {item.response && (
                  <div className="bg-muted/30 p-3 rounded-md text-sm mb-3">
                    <p className="font-medium text-xs text-muted-foreground mb-1">Your response:</p>
                    <p>{item.response}</p>
                  </div>
                )}

                {/* Respond Input */}
                {respondingTo === item.id && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      placeholder="Type your response..."
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleRespond}
                        disabled={!responseText.trim() || respondMutation.isPending}
                      >
                        Send
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setRespondingTo(null); setResponseText(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  );
}

// =============================================================================
// Orders Tab Content Component
// =============================================================================

type DateRangeFilter = "30d" | "90d" | "6mo" | "1yr" | "all";
type StatusFilter = "all" | "completed" | "void" | "refund";
type SortField = "date" | "total" | "items" | "status";

function OrdersTabContent({ customer }: { customer: CustomerListItem | null }) {
  const { data: orders = [], isLoading } = useCustomerOrders(customer?.id || null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
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
    return dateFilteredOrders.filter((order) => order.status === statusFilter);
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
    const completed = orders.filter((o) => o.status === "completed").length;
    const voided = orders.filter((o) => o.status === "void").length;
    const refunded = orders.filter((o) => o.status === "refunded").length;

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

  const handleViewOrder = (order: any) => {
    setSelectedOrder(order);
    setIsDetailOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "void":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "refunded":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const getPaymentIcon = (method: string) => {
    return method === "cash" ? "💵" : "💳";
  };

  return (
    <>
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
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <div className="border rounded-lg bg-white dark:bg-card overflow-hidden">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
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
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Order #</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
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
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
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
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tip</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Payment</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
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
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {sortedOrders.map((order) => (
                  <tr key={order.id} className="border-t hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <div className="font-medium">
                          {new Date(order.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(order.created_at).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm font-medium">{order.display_number}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {order.order_type || "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      {order.order_items?.length || 0} item{order.order_items?.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      ${(order.total_amount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {order.tip_amount ? `$${order.tip_amount.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">{getPaymentIcon(order.payment_pricing_mode || "")}</td>
                    <td className="px-4 py-3">
                      <Badge className={cn("text-xs", getStatusColor(order.status))}>
                        {order.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewOrder(order)}
                        className="h-8 px-2"
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </>
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
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);

  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id || null;
  const merchantId = userInfo?.members?.[0]?.organizations?.merchants?.id || null;

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

  // Tab badge counts
  const { data: reservations = [] } = useCustomerReservations(customerId);
  const { data: feedback = [] } = useCustomerFeedback(customerId);

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
        <SheetContent className="sm:max-w-225 w-full overflow-y-auto px-0 bg-[#F8F9FB] dark:bg-background">
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

            {/* Tab Configs with counts from top-level hooks */}
            <Tabs defaultValue="overview" className="mt-8">
              <TabsList className="bg-transparent h-auto p-0 space-x-6 border-b rounded-none w-full justify-start">
                {(() => {
                  const tabConfigs = [
                    { name: "Overview", count: null },
                    { name: "Orders", count: profile?.customer?.total_orders ?? customer.total_orders ?? 0 },
                    { name: "Bookings", count: reservations.length },
                    { name: "Feedback", count: feedback.length },
                    { name: "Loyalty", count: null },
                    { name: "Marketing", count: null },
                    { name: "Details", count: null },
                  ];
                  return tabConfigs.map((tab) => (
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
                  ));
                })()}
              </TabsList>

              <div className="mt-6">
                <TabsContent value="overview" className="space-y-6 animate-in fade-in-50 duration-300">
                  <OverviewTab
                    lastVisitRelative={lastVisitRelative}
                    lastVisitAbsolute={lastVisitAbsolute}
                    totalVisits={totalVisits}
                    visitTrendLabel={visitTrendLabel}
                    visitTrendDir={visitTrendDir}
                    lifetimeSpend={lifetimeSpend}
                    percentileBadge={percentileBadge}
                    avgSpend={avgSpend}
                    avgTip={avgTip}
                    customerSince={customerSince}
                    isLoadingProfile={isLoadingProfile}
                    isLoadingSpend={isLoadingSpend}
                    spendTrend={spendTrend || []}
                    visitPattern={visitPattern || []}
                    visitPatternSummary={visitPatternSummary}
                    isLoadingItems={isLoadingItems}
                    topItems={topItems || []}
                    isLoadingChannels={isLoadingChannels}
                    orderChannels={orderChannels}
                    channelTrendText={channelTrendText}
                    activityTimeline={activityTimeline || []}
                    isLoadingTimeline={isLoadingTimeline}
                    onOrderClick={(orderId) => {
                      setSelectedOrderId(orderId);
                      setIsOrderDetailOpen(true);
                    } } totalOrdersRecent={0}                  />
                </TabsContent>

                {/* Orders Tab */}
                <TabsContent value="orders" className="space-y-6 py-6 animate-in fade-in-50 duration-300">
                  {customer && <OrdersTab customer={customer} />}
                </TabsContent>

                {/* Bookings Tab */}
                <TabsContent value="bookings" className="space-y-6 py-6 animate-in fade-in-50 duration-300">
                  {customer && <BookingsTab customer={customer} />}
                </TabsContent>

                {/* Feedback Tab */}
                <TabsContent value="feedback" className="space-y-6 py-6 animate-in fade-in-50 duration-300">
                  {customer && <FeedbackTab customer={customer} />}
                </TabsContent>

                {/* Loyalty Tab */}
                <TabsContent value="loyalty" className="space-y-6 py-6 animate-in fade-in-50 duration-300">
                  {customer && <LoyaltyTab customer={customer} merchantId={merchantId} />}
                </TabsContent>

                {/* Marketing Tab */}
                <TabsContent value="marketing" className="space-y-6 py-6 animate-in fade-in-50 duration-300">
                  {customer && <MarketingTab customer={customer} merchantId={merchantId} />}
                </TabsContent>

                {/* Details Tab */}
                <TabsContent value="details" className="space-y-6 py-6 animate-in fade-in-50 duration-300">
                  {customer && <DetailsTab customer={customer} merchantId={merchantId} />}
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      <AddTagDialog open={showAddTag} onOpenChange={setShowAddTag} onAdd={handleAddTag} isLoading={addTagMutation.isPending} existingTags={profile?.customer?.tags || []} />
      <AddNoteDialog open={showAddNote} onOpenChange={setShowAddNote} onSave={handleSaveNotes} isLoading={updateNotesMutation.isPending} currentNotes={profile?.customer?.notes || null} />
    </>
  );
}
