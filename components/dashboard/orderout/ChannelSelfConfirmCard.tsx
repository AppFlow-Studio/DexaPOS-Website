"use client";

// ============================================================================
// ChannelSelfConfirmCard
//
// Lets a merchant self-attest which delivery platforms (UberEats / DoorDash /
// GrubHub) they've connected inside OrderOut's own dashboard. Without this
// step the Push-to-Channels flow is a chicken-and-egg: we can't push a menu
// until connected_channels is populated, and connected_channels is only
// populated by the push-menu webhook after a successful push.
//
// The self-confirmed list is unioned with webhook-verified channels by the
// server-side push guard and by the UI, so:
//   - "Self-confirmed" = merchant ticked the box → amber "Awaiting verification"
//   - "Verified"       = a real webhook reported success → green "Verified"
// Once a webhook arrives it takes visual precedence for that platform.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import Image from "next/image";
import { CheckCircle2, ExternalLink, Loader2, UtensilsCrossed } from "lucide-react";
import {
  KNOWN_DELIVERY_CHANNELS,
  formatRelativeTime,
  normalizeDeliveryChannels,
} from "@/lib/orderout/helpers";
import { getChannelLabel, getChannelLogo } from "@/lib/orderout/platform";
import { useSetOrderOutChannelsConfirmed } from "@/app/dashboard/online-ordering/hooks/useOrderOutStatus";

interface ChannelSelfConfirmCardProps {
  clerkOrgId: string;
  locationId: string;
  dashboardUrl: string;
  confirmedChannels: string[]; // server-side orderOutStatus.channelsConfirmedByMerchant
  verifiedChannels: string[]; // extractConnectedPlatforms(connected_channels)
  confirmedAt: string | null;
}

// Label + logo come from the single platform vocabulary in
// lib/orderout/platform.ts (shared with the Online Ordering report). Only the
// Tailwind color styling below stays local to this config card.
function PlatformLogo({ channel, active }: { channel: string; active: boolean }) {
  const src = getChannelLogo(channel);
  if (!src) return <UtensilsCrossed className={`h-5 w-5 ${active ? "" : "text-muted-foreground"}`} />;
  return (
    <Image
      src={src}
      alt={channel}
      width={20}
      height={20}
      className={`object-contain ${active ? "" : "opacity-40 grayscale"}`}
    />
  );
}

function platformLabel(channel: string): string {
  return getChannelLabel(channel);
}

function platformStyle(channel: string): { color: string; bg: string } {
  switch (channel) {
    case "UBEREATS":
      return {
        color: "text-green-700 dark:text-green-400",
        bg: "bg-green-100 dark:bg-green-900/30",
      };
    case "DOORDASH":
      return {
        color: "text-red-700 dark:text-red-400",
        bg: "bg-red-100 dark:bg-red-900/30",
      };
    case "GRUBHUB":
      return {
        color: "text-orange-700 dark:text-orange-400",
        bg: "bg-orange-100 dark:bg-orange-900/30",
      };
    default:
      return {
        color: "text-gray-700 dark:text-gray-400",
        bg: "bg-gray-100 dark:bg-gray-900/30",
      };
  }
}

export function ChannelSelfConfirmCard({
  clerkOrgId,
  locationId,
  dashboardUrl,
  confirmedChannels,
  verifiedChannels,
  confirmedAt,
}: ChannelSelfConfirmCardProps) {
  const mutation = useSetOrderOutChannelsConfirmed(clerkOrgId);

  // Canonicalize server state once
  const serverSet = useMemo(
    () => new Set(normalizeDeliveryChannels(confirmedChannels)),
    [confirmedChannels]
  );
  const verifiedSet = useMemo(
    () => new Set(verifiedChannels.map((c) => c.toUpperCase())),
    [verifiedChannels]
  );

  // Local draft state (what the user has ticked but not yet saved)
  const [draft, setDraft] = useState<Set<string>>(() => new Set(serverSet));

  // Re-sync local state whenever the server list changes (e.g. after a save)
  useEffect(() => {
    setDraft(new Set(serverSet));
  }, [serverSet]);

  const isDirty = useMemo(() => {
    if (draft.size !== serverSet.size) return true;
    for (const c of draft) if (!serverSet.has(c)) return true;
    return false;
  }, [draft, serverSet]);

  const toggle = (channel: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  };

  const handleSave = () => {
    mutation.mutate({
      clerkOrgId,
      locationId,
      confirmedChannels: Array.from(draft),
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Confirm your delivery channels
            </CardTitle>
            <CardDescription>
              After connecting UberEats, DoorDash, or GrubHub inside the
              OrderOut dashboard, tick the ones you&apos;ve connected so we can
              push menus to them.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild className="shrink-0 self-start">
            <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
              Open OrderOut
              <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {KNOWN_DELIVERY_CHANNELS.map((channel) => {
            const checked = draft.has(channel);
            const isVerified = verifiedSet.has(channel);
            const isServerConfirmed = serverSet.has(channel);
            const style = platformStyle(channel);
            const inputId = `self-confirm-${channel}`;

            return (
              <label
                key={channel}
                htmlFor={inputId}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                  checked ? style.bg : "bg-muted/20 hover:bg-muted/30"
                }`}
              >
                <Checkbox
                  id={inputId}
                  checked={checked}
                  onCheckedChange={() => toggle(channel)}
                  disabled={mutation.isPending}
                  className="shrink-0"
                />
                <PlatformLogo channel={channel} active={checked} />
                <span className="text-sm font-medium shrink-0">
                  {platformLabel(channel)}
                </span>
                {/* Spacer: keeps the badge right-aligned on wide rows, and lets
                    it wrap below the name on narrow (≤320px) rows. */}
                <span className="flex-1" />
                {isVerified ? (
                  <Badge
                    variant="default"
                    className="bg-green-600 text-xs shrink-0"
                  >
                    Verified
                  </Badge>
                ) : isServerConfirmed ? (
                  <Badge
                    variant="outline"
                    className="text-xs border-amber-500 text-amber-700 dark:text-amber-400 shrink-0"
                  >
                    Awaiting verification
                  </Badge>
                ) : null}
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {confirmedAt
              ? `Last confirmed ${formatRelativeTime(confirmedAt)}.`
              : "Not yet confirmed."}
          </p>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
