"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Plug,
  UtensilsCrossed,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface OrderOutStatusCardProps {
  hasAccount: boolean;
  hasRestaurant: boolean;
  isAcceptingOrders: boolean;
  prepTimeMinutes: number;
  connectedChannels: unknown;
  autoAcceptOrders: boolean;
  dashboardUrl: string;
}

// ============================================================================
// Component
// ============================================================================

export function OrderOutStatusCard({
  hasAccount,
  hasRestaurant,
  isAcceptingOrders,
  prepTimeMinutes,
  connectedChannels,
  autoAcceptOrders,
  dashboardUrl,
}: OrderOutStatusCardProps) {
  const channels = Array.isArray(connectedChannels) ? connectedChannels : [];

  return (
    <div className="space-y-4">
      {/* Status Checklist */}
      <div className="space-y-3">
        <ChecklistItem
          completed={hasAccount}
          label="Account Created"
        />
        <ChecklistItem
          completed={hasRestaurant}
          label="Restaurant Created"
        />
        <ChecklistItem
          completed={channels.length > 0}
          label="Connect Delivery Platforms"
          pending
          actionLabel="Open Dashboard"
          actionUrl={dashboardUrl}
        />
        <ChecklistItem
          completed={false}
          label="Menu Synced"
          pending
          description="Coming soon"
        />
      </div>

      {/* Status Badges */}
      {hasRestaurant && (
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge variant={isAcceptingOrders ? "default" : "secondary"}>
            <UtensilsCrossed className="h-3 w-3 mr-1" />
            {isAcceptingOrders ? "Accepting Orders" : "Not Accepting"}
          </Badge>
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            {prepTimeMinutes} min prep
          </Badge>
          {autoAcceptOrders && (
            <Badge variant="outline">
              Auto-Accept ON
            </Badge>
          )}
          {channels.length > 0 && (
            <Badge variant="outline">
              <Plug className="h-3 w-3 mr-1" />
              {channels.length} channel{channels.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Checklist Item
// ============================================================================

function ChecklistItem({
  completed,
  label,
  pending,
  description,
  actionLabel,
  actionUrl,
}: {
  completed: boolean;
  label: string;
  pending?: boolean;
  description?: string;
  actionLabel?: string;
  actionUrl?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
        <div>
          <span
            className={
              completed ? "text-foreground" : "text-muted-foreground"
            }
          >
            {label}
          </span>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actionUrl && !completed && (
        <Button variant="ghost" size="sm" asChild>
          <a href={actionUrl} target="_blank" rel="noopener noreferrer">
            {actionLabel || "Open"}
            <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        </Button>
      )}
    </div>
  );
}
