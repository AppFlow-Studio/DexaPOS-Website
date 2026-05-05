"use client";

import * as React from "react";
import { Mail, User, DollarSign, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { UseOrderActionsResult } from "@/app/dashboard/hooks/useOrderActions";

export interface OrderActionBarProps {
  actions: UseOrderActionsResult;
  onSendReceipt: () => void;
  onAssignCustomer: () => void;
  onAdjustTip: () => void;
  /** Optional custom wrapper class for desktop bar */
  className?: string;
}

export function OrderActionBar({
  actions,
  onSendReceipt,
  onAssignCustomer,
  onAdjustTip,
  className,
}: OrderActionBarProps) {
  const isMobile = useIsMobile();
  const [fabOpen, setFabOpen] = React.useState(false);

  const { canSendReceipt, canAssignCustomer, canAdjustTip } = actions;

  const hasAnyAction = canSendReceipt || canAssignCustomer || canAdjustTip;

  const desktopBar = (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        className
      )}
    >
      {canSendReceipt && (
        <Button variant="default" size="sm" onClick={onSendReceipt}>
          <Mail className="h-4 w-4 mr-1.5" />
          Send Receipt
        </Button>
      )}
      {canAssignCustomer && (
        <Button variant="outline" size="sm" onClick={onAssignCustomer}>
          <User className="h-4 w-4 mr-1.5" />
          Customer
        </Button>
      )}
      {canAdjustTip && (
        <Button variant="outline" size="sm" onClick={onAdjustTip}>
          <DollarSign className="h-4 w-4 mr-1.5" />
          Tip Adjust
        </Button>
      )}
    </div>
  );

  const mobileFab = (
    <div className="fixed top-20 right-5 z-40 md:hidden">
      <DropdownMenu open={fabOpen} onOpenChange={setFabOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-lg"
            className="h-14 w-14 rounded-full shadow-lg"
            aria-label="Order actions"
          >
            <MoreVertical className="h-6 w-6" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          sideOffset={8}
          className="w-56"
        >
          {canSendReceipt && (
            <DropdownMenuItem
              onSelect={() => {
                setFabOpen(false);
                onSendReceipt();
              }}
            >
              <Mail className="h-4 w-4 mr-2" />
              Send Receipt
            </DropdownMenuItem>
          )}
          {canAssignCustomer && (
            <DropdownMenuItem
              onSelect={() => {
                setFabOpen(false);
                onAssignCustomer();
              }}
            >
              <User className="h-4 w-4 mr-2" />
              Customer
            </DropdownMenuItem>
          )}
          {canAdjustTip && (
            <DropdownMenuItem
              onSelect={() => {
                setFabOpen(false);
                onAdjustTip();
              }}
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Tip Adjust
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="hidden md:block">{desktopBar}</div>
      <div className="flex flex-wrap items-center gap-2 md:hidden">
        {desktopBar}
      </div>
      {isMobile && hasAnyAction && mobileFab}
    </TooltipProvider>
  );
}
