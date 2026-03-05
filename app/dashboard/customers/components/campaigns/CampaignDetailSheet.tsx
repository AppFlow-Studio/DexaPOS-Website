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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Clock,
  CheckCircle,
  AlertCircle,
  Send,
  BarChart3,
  Users,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useMarketingCampaignRecipients, useSendCampaign } from "../../hooks/useCustomerMarketing";
import { CampaignDetailsTab } from "./CampaignDetailsTab";
import { CampaignPerformanceTab } from "./CampaignPerformanceTab";
import { CampaignChartsTab } from "./CampaignChartsTab";
import { CampaignRecipientsTab } from "./CampaignRecipientsTab";
import type { Database } from "@/database.types";

type Campaign = Database["public"]["Tables"]["marketing_campaigns"]["Row"];

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  draft: { color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400", icon: <Clock className="w-4 h-4" />, label: "Draft" },
  scheduled: { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: <Clock className="w-4 h-4" />, label: "Scheduled" },
  sending: { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: <Send className="w-4 h-4" />, label: "Sending" },
  sent: { color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: <CheckCircle className="w-4 h-4" />, label: "Sent" },
  cancelled: { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <AlertCircle className="w-4 h-4" />, label: "Cancelled" },
};

interface CampaignDetailSheetProps {
  campaign: Campaign;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CampaignDetailSheet({
  campaign,
  open,
  onOpenChange,
}: CampaignDetailSheetProps) {
  const { data: recipients = [] } = useMarketingCampaignRecipients(open ? campaign.id : null);
  const sendMutation = useSendCampaign();
  const [isSending, setIsSending] = useState(false);

  const handleSendNow = async () => {
    if (campaign.status !== "draft" && campaign.status !== "scheduled") {
      toast.error(`Cannot send campaign with status: ${campaign.status}`);
      return;
    }

    setIsSending(true);
    try {
      await sendMutation.mutateAsync(campaign.id);
      toast.success("Campaign sent successfully!");
    } catch (error: any) {
      console.error("Error sending campaign:", error);
      toast.error(error.message || "Failed to send campaign");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-3xl overflow-y-auto px-0 bg-background">
        <div className="px-8 py-8 border-b border-border/50 bg-gradient-to-b from-muted/20 to-background">
          <SheetHeader className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <SheetTitle className="text-3xl font-bold text-foreground">{campaign.name}</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {campaign.created_at ? new Date(campaign.created_at).toLocaleString() : "N/A"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-3 shrink-0">
                <Badge className={`gap-1.5 px-3 py-1.5 font-semibold text-xs ${STATUS_CONFIG[campaign.status]?.color || "bg-gray-100"}`}>
                  {STATUS_CONFIG[campaign.status]?.icon}
                  {STATUS_CONFIG[campaign.status]?.label}
                </Badge>
                {(campaign.status === "draft" || campaign.status === "scheduled") && (
                  <Button
                    onClick={handleSendNow}
                    disabled={isSending}
                    size="sm"
                    className="gap-2 h-10 font-semibold"
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Send Now
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </SheetHeader>
        </div>

        <Tabs defaultValue="details" className="mt-8 px-8 pb-8">
          <TabsList className="bg-transparent h-auto p-0 space-x-8 border-b border-border/50 rounded-none w-full justify-start">
            <TabsTrigger value="details" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-3 text-muted-foreground data-[state=active]:text-foreground font-semibold bg-transparent shadow-none border-b-2 border-transparent transition-colors hover:text-foreground gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Details</span>
            </TabsTrigger>
            <TabsTrigger value="performance" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-3 text-muted-foreground data-[state=active]:text-foreground font-semibold bg-transparent shadow-none border-b-2 border-transparent transition-colors hover:text-foreground gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Performance</span>
            </TabsTrigger>
            <TabsTrigger value="charts" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-3 text-muted-foreground data-[state=active]:text-foreground font-semibold bg-transparent shadow-none border-b-2 border-transparent transition-colors hover:text-foreground gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Charts</span>
            </TabsTrigger>
            <TabsTrigger value="recipients" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-3 text-muted-foreground data-[state=active]:text-foreground font-semibold bg-transparent shadow-none border-b-2 border-transparent transition-colors hover:text-foreground gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Recipients</span>
            </TabsTrigger>
          </TabsList>

          <div className="space-y-8">
            <TabsContent value="details">
              <CampaignDetailsTab campaign={campaign} />
            </TabsContent>

            <TabsContent value="performance">
              <CampaignPerformanceTab campaign={campaign} />
            </TabsContent>

            <TabsContent value="charts">
              <CampaignChartsTab campaign={campaign} />
            </TabsContent>

            <TabsContent value="recipients">
              <CampaignRecipientsTab recipients={recipients} />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
