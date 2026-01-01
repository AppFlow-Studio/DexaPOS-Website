import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Customer } from "../hooks/useCustomers";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone,
  Mail,
  FileText,
  Plus,
  Clock,
  ChevronRight,
  Receipt,
  RotateCcw,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";

interface CustomerProfileSheetProps {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerProfileSheet({
  customer,
  open,
  onOpenChange,
}: CustomerProfileSheetProps) {
  if (!customer) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[900px] w-full overflow-y-auto px-0 bg-[#F8F9FB] dark:bg-background">
        <div className="px-6 py-6 border-b bg-background">
          <SheetHeader className="space-y-4">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <SheetTitle className="text-3xl font-bold tracking-tight text-left">
                  {customer.name}
                </SheetTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs rounded-full bg-muted/50 border-muted-foreground/20 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="w-3 h-3 mr-1" /> ADD TAG
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
                  >
                    <FileText className="w-3 h-3 mr-2" /> add note
                  </Button>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5 text-sm">
                <div className="flex items-center gap-2 text-foreground/80 font-medium">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {customer.phone}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  {customer.email || "No email address"}
                </div>
              </div>
            </div>
          </SheetHeader>

          <Tabs defaultValue="overview" className="mt-8">
            <TabsList className="bg-transparent h-auto p-0 space-x-6 border-b rounded-none w-full justify-start">
              {[
                "Overview",
                "Orders",
                "Bookings",
                "Feedback",
                "Loyalty",
                "Marketing",
                "Details",
              ].map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab.toLowerCase()}
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 text-muted-foreground data-[state=active]:text-foreground font-medium bg-transparent shadow-none border-b-2 border-transparent transition-none"
                >
                  {tab}
                  {tab === "Orders" && (
                    <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                      1
                    </span>
                  )}
                  {["Bookings", "Feedback"].includes(tab) && (
                    <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                      0
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="mt-6">
              <TabsContent
                value="overview"
                className="space-y-6 animate-in fade-in-50 duration-300"
              >
                {/* Metrics Grid */}
                <div className="grid grid-cols-4 gap-4">
                  <MetricCard
                    title="LAST ORDER"
                    value={customer.lastOrderDate || "N/A"}
                    className="bg-white dark:bg-card border-none shadow-sm"
                  />
                  <MetricCard
                    title="LIFETIME SPEND"
                    value={`$${
                      customer.lifetimeSpend?.toLocaleString() ||
                      customer.totalSpent.toLocaleString()
                    }`}
                    className="bg-white dark:bg-card border-none shadow-sm"
                  />
                  <MetricCard
                    title="AVERAGE SPEND"
                    value={`$${(
                      customer.lifetimeSpend! / customer.visitCount || 0
                    ).toFixed(2)}`}
                    className="bg-white dark:bg-card border-none shadow-sm"
                  />
                  <MetricCard
                    title="AVERAGE TIP"
                    value={`${customer.averageTip || 0}%`}
                    className="bg-white dark:bg-card border-none shadow-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Order Channels Chart */}
                  <Card className="border-none shadow-sm bg-white dark:bg-card h-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        ORDER CHANNELS
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between pl-0">
                      <div className="space-y-3 pl-6 text-sm">
                        {customer.orderChannels?.map((channel, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: channel.color }}
                            />
                            <span className="font-medium text-foreground">
                              {channel.name}
                            </span>
                            <span className="text-muted-foreground ml-auto">
                              {channel.value}%
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="h-[140px] w-[140px] relative">
                        {/* Centered Total Visits count */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-xl font-bold">
                            {customer.visitCount}
                          </span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={customer.orderChannels}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={60}
                              paddingAngle={0}
                              dataKey="value"
                              stroke="none"
                            >
                              {customer.orderChannels?.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={entry.color}
                                />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Most Ordered Items */}
                  <Card className="border-none shadow-sm bg-white dark:bg-card h-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        MOST ORDERED ITEMS
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2 px-6">
                      <div className="space-y-4">
                        {customer.mostOrderedItems?.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-sm py-1 border-b last:border-0 border-muted/40"
                          >
                            <span className="font-medium text-foreground/90 truncate pr-4">
                              {item.name}
                            </span>
                            <span className="text-muted-foreground font-mono">
                              {item.count}x
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Activity Feed */}
                <div className="bg-white dark:bg-card rounded-lg p-6 shadow-sm">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-6">
                    ACTIVITY
                  </h3>
                  <div className="space-y-6">
                    <div className="flex items-start gap-4 group cursor-pointer">
                      <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Receipt className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-base text-blue-600 dark:text-blue-400">
                            Order
                          </span>
                          <span className="text-muted-foreground">for</span>
                          <span className="font-medium text-foreground">
                            $19.02
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Completed • Pickup • 2 items
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-3 text-sm text-muted-foreground">
                        <span>4:46 PM</span>
                        <span>Dec 29, 2025</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                      </div>
                    </div>

                    {/* Fake older activities */}
                    <div className="flex items-start gap-4 group cursor-pointer opacity-60 hover:opacity-100 transition-opacity">
                      <div className="h-10 w-10 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                        <RotateCcw className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-base text-orange-600 dark:text-orange-400">
                            Refund
                          </span>
                          <span className="text-muted-foreground">for</span>
                          <span className="font-medium text-foreground line-through decoration-muted-foreground/60">
                            $4.50
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Item unavailable • Refunded to card
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-3 text-sm text-muted-foreground">
                        <span>1:15 PM</span>
                        <span>Dec 10, 2025</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {[
                "orders",
                "bookings",
                "feedback",
                "loyalty",
                "marketing",
                "details",
              ].map((tab) => (
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
  );
}

function MetricCard({
  title,
  value,
  className,
}: {
  title: string;
  value: string;
  className?: string;
}) {
  return (
    <Card
      className={cn("flex flex-col justify-center p-5 h-[110px]", className)}
    >
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </span>
      <span className="text-2xl font-bold text-foreground tracking-tight">
        {value}
      </span>
    </Card>
  );
}
