"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Mail } from "lucide-react";
import type { Database } from "@/database.types";

type Campaign = Database["public"]["Tables"]["marketing_campaigns"]["Row"];

interface CampaignDetailsTabProps {
  campaign: Campaign;
}

export function CampaignDetailsTab({ campaign }: CampaignDetailsTabProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Campaign Details</h3>
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Type</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="gap-1">
                {campaign.campaign_type === "sms" ? (
                  <MessageSquare className="w-3 h-3" />
                ) : (
                  <Mail className="w-3 h-3" />
                )}
                {campaign.campaign_type.toUpperCase()}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Audience</p>
            <p className="text-lg font-semibold mt-2">
              {campaign.audience_type === "all" ? "All Customers" : campaign.audience_type}
            </p>
          </CardContent>
        </Card>
      </div>

      {campaign.body && (
        <Card className="border-none shadow-sm bg-muted/50">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Message</p>
            <p className="text-sm">{campaign.body}</p>
          </CardContent>
        </Card>
      )}

      {campaign.subject && (
        <Card className="border-none shadow-sm bg-muted/50">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Subject</p>
            <p className="text-sm">{campaign.subject}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
