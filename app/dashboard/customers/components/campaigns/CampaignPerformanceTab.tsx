"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { Database } from "@/database.types";

type Campaign = Database["public"]["Tables"]["marketing_campaigns"]["Row"];

interface CampaignPerformanceTabProps {
  campaign: Campaign;
}

export function CampaignPerformanceTab({ campaign }: CampaignPerformanceTabProps) {
  const stats = {
    totalRecipients: campaign.total_recipients || 0,
    delivered: campaign.total_delivered || 0,
    bounced: campaign.total_bounced || 0,
    opened: campaign.total_opened || 0,
    clicked: campaign.total_clicked || 0,
    unsubscribed: campaign.total_unsubscribed || 0,
  };

  const deliveryRate =
    stats.totalRecipients > 0
      ? ((stats.delivered / stats.totalRecipients) * 100).toFixed(1)
      : "0";
  const bounceRate =
    stats.totalRecipients > 0
      ? ((stats.bounced / stats.totalRecipients) * 100).toFixed(1)
      : "0";
  const openRate =
    stats.delivered > 0 ? ((stats.opened / stats.delivered) * 100).toFixed(1) : "0";
  const clickRate =
    stats.opened > 0 ? ((stats.clicked / stats.opened) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Performance Metrics</h3>
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Recipients</p>
            <p className="text-2xl font-bold mt-2">{stats.totalRecipients}</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Delivery Rate</p>
            <p className="text-2xl font-bold mt-2">{deliveryRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.delivered} delivered</p>
          </CardContent>
        </Card>

        {campaign.campaign_type === "email" && (
          <>
            <Card className="border-none shadow-sm">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Open Rate</p>
                <p className="text-2xl font-bold mt-2">{openRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.opened} opened</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Click Rate</p>
                <p className="text-2xl font-bold mt-2">{clickRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.clicked} clicked</p>
              </CardContent>
            </Card>
          </>
        )}

        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Bounce Rate</p>
            <p className="text-2xl font-bold mt-2">{bounceRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.bounced} bounced</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Unsubscribed</p>
            <p className="text-2xl font-bold mt-2">{stats.unsubscribed}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
