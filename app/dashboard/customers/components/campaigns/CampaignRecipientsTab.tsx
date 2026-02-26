"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CampaignRecipientsTabProps {
  recipients: any[];
}

export function CampaignRecipientsTab({ recipients }: CampaignRecipientsTabProps) {
  if (recipients.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        <p>No recipients yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Recipients ({recipients.length})</h3>
      <Card className="border-none shadow-sm">
        <CardContent className="pt-4">
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {recipients.map((recipient: any) => (
              <div
                key={recipient.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-medium text-sm">{recipient.customer?.name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{recipient.destination}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {recipient.channel.toUpperCase()}
                  </Badge>
                  <Badge
                    className={`text-xs ${
                      recipient.status === "delivered"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : recipient.status === "sent"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : recipient.status === "pending"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}
                  >
                    {recipient.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
