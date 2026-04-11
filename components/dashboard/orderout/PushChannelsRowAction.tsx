"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Radio } from "lucide-react";
import { usePushMenuToChannels } from "@/app/dashboard/online-ordering/hooks/useOrderOutStatus";

// ============================================================================
// PushChannelsRowAction — row-level action for the Synced Menus table.
// Gated by connected channels + per-row cooldown.
// ============================================================================

interface PushChannelsRowActionProps {
  clerkOrgId: string;
  locationId: string;
  menuId: string;
  menuName: string;
  ooMenuId: string | null;
  connectedChannels: string[];
  // Optional cooldown seconds remaining, derived from latest history row by parent.
  cooldownSecondsRemaining?: number;
}

export function PushChannelsRowAction({
  clerkOrgId,
  locationId,
  menuId,
  menuName,
  ooMenuId,
  connectedChannels,
  cooldownSecondsRemaining = 0,
}: PushChannelsRowActionProps) {
  const [open, setOpen] = useState(false);
  const pushMutation = usePushMenuToChannels(clerkOrgId);

  const hasChannels = connectedChannels.length > 0;
  const hasLink = !!ooMenuId;
  const inCooldown = cooldownSecondsRemaining > 0;
  const disabled =
    !hasChannels || !hasLink || inCooldown || pushMutation.isPending;

  const tooltip = useMemo(() => {
    if (!hasLink) return "Upload the menu to OrderOut first.";
    if (!hasChannels) return "Connect a delivery platform first.";
    if (inCooldown) return `Available in ${cooldownSecondsRemaining}s.`;
    return null;
  }, [hasChannels, hasLink, inCooldown, cooldownSecondsRemaining]);

  const channelList = connectedChannels.join(", ");

  const button = (
    <Button
      size="sm"
      variant="outline"
      onClick={() => setOpen(true)}
      disabled={disabled}
    >
      {pushMutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
      ) : (
        <Radio className="h-3.5 w-3.5 mr-1" />
      )}
      Push to Channels
    </Button>
  );

  return (
    <>
      {tooltip ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{button}</span>
            </TooltipTrigger>
            <TooltipContent>
              <span className="text-xs">{tooltip}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        button
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Push menu to channels?</AlertDialogTitle>
            <AlertDialogDescription>
              This will push <strong>{menuName}</strong> to: {channelList}. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                pushMutation.mutate({ clerkOrgId, menuId, locationId });
              }}
            >
              Push to Channels
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
