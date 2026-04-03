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
import { Card, CardContent} from "@/components/ui/card";

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
  transformChannelTrendForChart,
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
import { useLocationStore } from "@/stores/location-store";
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
    order_linked: <Receipt className={iconClass} />,
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



// =============================================================================
// Enhanced Timeline Item (from RPC unified timeline)
// =============================================================================



// =============================================================================
// Metric Card Component (Enhanced with subtitle)
// =============================================================================



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


// =============================================================================
// Feedback Tab Content Component
// =============================================================================



// =============================================================================
// Orders Tab Content Component
// =============================================================================

type DateRangeFilter = "30d" | "90d" | "6mo" | "1yr" | "all";
type StatusFilter = "all" | "completed" | "void" | "refund";
type SortField = "date" | "total" | "items" | "status";


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
  const { selectedLocationId } = useLocationStore();
  const isLocationFiltered = selectedLocationId && selectedLocationId !== "all";

  // Existing profile data
  const { data: profile, isLoading: isLoadingProfile } = useCustomerProfile(
    open && customer ? customer.id : null
  );

  // New enhanced analytics
  const customerId = open && customer ? customer.id : null;
  const { data: spendTrend, isLoading: isLoadingSpend } = useCustomerSpendTrend(customerId);

  // Location-filtered orders for accurate KPI cards
  const { data: locationOrders = [] } = useCustomerOrders(
    isLocationFiltered ? customerId : null,
    selectedLocationId
  );
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
  const orderChannels = transformChannelTrendForChart(channelTrend || null);

  // When location is selected, compute KPIs from location-filtered orders
  // Otherwise use the merchant-wide profile/RPC data
  const locationSpend = isLocationFiltered
    ? locationOrders.reduce((sum, o: any) => sum + (Number(o.total_amount) || 0), 0)
    : null;
  const locationVisits = isLocationFiltered ? locationOrders.length : null;
  const locationLastOrder = isLocationFiltered && locationOrders.length > 0
    ? locationOrders.reduce((latest: string | null, o: any) => {
        const d = o.created_at || o.order_date;
        return d && (!latest || d > latest) ? d : latest;
      }, null as string | null)
    : null;

  const totalVisits = locationVisits ?? profile?.customer?.visits ?? customer.visits ?? 0;

  const lifetimeSpend = locationSpend ?? (
    spendTrend && spendTrend.length > 0
      ? spendTrend.reduce((sum, month) => sum + (month.total_spend || 0), 0)
      : (profile?.customer?.lifetime_spend ?? customer.lifetime_spend ?? 0)
  );

  const avgSpend = isLocationFiltered
    ? (locationOrders.length > 0 ? locationSpend! / locationOrders.length : 0)
    : (profile?.customer?.avg_spend ?? customer.avg_spend ?? 0);
  const avgTip = profile?.customer?.avg_tip_percent ?? 0;

  // Last visit relative + absolute
  const lastVisitRaw = (isLocationFiltered ? locationLastOrder : null)
    ?? profile?.customer?.last_visit ?? customer.last_visit ?? null;
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

  // Calculate total orders from channel trend data
  const totalOrdersRecent = channelTrend
    ? channelTrend.reduce((sum, channel) => sum + (channel.count_recent || 0), 0)
    : 0;

  const handleAddTag = (tag: string) => {
    addTagMutation.mutate({ customerId: customer.id, tag }, { onSuccess: () => setShowAddTag(false) });
  };

  const handleSaveNotes = (notes: string) => {
    updateNotesMutation.mutate({ customerId: customer.id, notes }, { onSuccess: () => setShowAddNote(false) });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-225 w-full overflow-y-auto px-0 bg-background">
          <div className="px-8 py-8 border-b border-border/50 bg-gradient-to-b from-muted/20 to-background">
            <SheetHeader className="space-y-5">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-4 flex-1">
                  <SheetTitle className="text-4xl font-bold tracking-tight text-left text-foreground">
                    {getCustomerDisplayName(customerData as any)}
                  </SheetTitle>
                  <div className="flex gap-2.5 flex-wrap items-center">
                    {profile?.customer?.tags?.map((tag) => (
                      <Badge key={tag} variant="secondary" className="px-3 py-1.5 text-xs font-semibold rounded-full">
                        {tag}
                      </Badge>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="px-3 py-1.5 text-xs font-medium rounded-full bg-muted/50 border-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
                      onClick={() => setShowAddTag(true)}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" /> Tag
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      onClick={() => setShowAddNote(true)}
                    >
                      <FileText className="w-3.5 h-3.5 mr-1.5" /> Note
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2.5 text-sm bg-muted/30 rounded-lg p-4 border border-muted/50">
                  <div className="flex items-center gap-2.5 text-foreground font-semibold">
                    <Phone className="h-4 w-4 text-primary" />
                    {customerData.phone || <span className="text-muted-foreground">No phone</span>}
                  </div>
                  <div className="flex items-center gap-2.5 text-foreground font-semibold">
                    <Mail className="h-4 w-4 text-primary" />
                    {customerData.email || <span className="text-muted-foreground">No email</span>}
                  </div>
                </div>
              </div>
            </SheetHeader>

            {/* Tab Configs with counts from top-level hooks */}
            <Tabs defaultValue="overview" className="mt-8">
              <TabsList className="bg-transparent h-auto p-0 space-x-8 border-b border-border/50 rounded-none w-full justify-start">
                <TabsTrigger
                  value="overview"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-3 text-muted-foreground data-[state=active]:text-foreground font-semibold bg-transparent shadow-none border-b-2 border-transparent transition-colors hover:text-foreground"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="orders"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-3 text-muted-foreground data-[state=active]:text-foreground font-semibold bg-transparent shadow-none border-b-2 border-transparent transition-colors hover:text-foreground"
                >
                  Orders
                </TabsTrigger>
                <TabsTrigger
                  value="bookings"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-3 text-muted-foreground data-[state=active]:text-foreground font-semibold bg-transparent shadow-none border-b-2 border-transparent transition-colors hover:text-foreground"
                >
                  Bookings
                </TabsTrigger>
                <TabsTrigger
                  value="feedback"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-3 text-muted-foreground data-[state=active]:text-foreground font-semibold bg-transparent shadow-none border-b-2 border-transparent transition-colors hover:text-foreground"
                >
                  Feedback
                </TabsTrigger>
                <TabsTrigger
                  value="loyalty"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-3 text-muted-foreground data-[state=active]:text-foreground font-semibold bg-transparent shadow-none border-b-2 border-transparent transition-colors hover:text-foreground"
                >
                  Loyalty
                </TabsTrigger>
                <TabsTrigger
                  value="marketing"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-3 text-muted-foreground data-[state=active]:text-foreground font-semibold bg-transparent shadow-none border-b-2 border-transparent transition-colors hover:text-foreground"
                >
                  Marketing
                </TabsTrigger>
                <TabsTrigger
                  value="details"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-3 text-muted-foreground data-[state=active]:text-foreground font-semibold bg-transparent shadow-none border-b-2 border-transparent transition-colors hover:text-foreground"
                >
                  Details
                </TabsTrigger>
              </TabsList>

              <div className="px-8 py-8">
                <TabsContent value="overview" className="space-y-8 animate-in fade-in-50 duration-300 m-0">
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
                    }}
                    totalOrdersRecent={totalOrdersRecent}
                  />
                </TabsContent>

                {/* Orders Tab */}
                <TabsContent value="orders" className="space-y-8 animate-in fade-in-50 duration-300 m-0">
                  {customer && <OrdersTab customer={customer} />}
                </TabsContent>

                {/* Bookings Tab */}
                <TabsContent value="bookings" className="space-y-8 animate-in fade-in-50 duration-300 m-0">
                  {customer && <BookingsTab customer={customer} />}
                </TabsContent>

                {/* Feedback Tab */}
                <TabsContent value="feedback" className="space-y-8 animate-in fade-in-50 duration-300 m-0">
                  {customer && <FeedbackTab customer={customer} />}
                </TabsContent>

                {/* Loyalty Tab */}
                <TabsContent value="loyalty" className="space-y-8 animate-in fade-in-50 duration-300 m-0">
                  {customer && <LoyaltyTab customer={customer} merchantId={merchantId} />}
                </TabsContent>

                {/* Marketing Tab */}
                <TabsContent value="marketing" className="space-y-8 animate-in fade-in-50 duration-300 m-0">
                  {customer && <MarketingTab customer={customer} merchantId={merchantId} />}
                </TabsContent>

                {/* Details Tab */}
                <TabsContent value="details" className="space-y-8 animate-in fade-in-50 duration-300 m-0">
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
