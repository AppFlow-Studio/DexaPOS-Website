"use client";

import * as React from "react";
import {
  Mail,
  User,
  DollarSign,
  RotateCcw,
  Ban,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReprintDropdown } from "@/components/dashboard/orders/ReprintDropdown";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { UseOrderActionsResult } from "@/app/dashboard/hooks/useOrderActions";

export interface OrderActionBarProps {
  orderId: string;
  locationId: string | null;
  actions: UseOrderActionsResult;
  onSendReceipt: () => void;
  onAssignCustomer: () => void;
  onAdjustTip: () => void;
  onRefund: () => void;
  onVoid: () => void;
  /** Optional custom wrapper class for desktop bar */
  className?: string;
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "outline",
  size = "sm",
  tooltip,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "outline" | "destructive" | "secondary";
  size?: "sm" | "default";
  tooltip?: string | null;
  className?: string;
}) {
  const btn = (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </Button>
  );
  if (tooltip && disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">{btn}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }
  return btn;
}

export function OrderActionBar({
  orderId,
  locationId,
  actions,
  onSendReceipt,
  onAssignCustomer,
  onAdjustTip,
  onRefund,
  onVoid,
  className,
}: OrderActionBarProps) {
  const isMobile = useIsMobile();
  const [fabOpen, setFabOpen] = React.useState(false);

  const {
    canReprint,
    canSendReceipt,
    canAssignCustomer,
    canAdjustTip,
    showRefund,
    showVoid,
    canRefund,
    canVoid,
    refundDisabledReason,
    voidDisabledReason,
  } = actions;

  const hasAnyAction =
    canReprint ||
    canSendReceipt ||
    canAssignCustomer ||
    canAdjustTip ||
    showRefund ||
    showVoid;

  // Desktop: responsive flex layout with two rows
  const desktopBar = (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2",
        className
      )}
    >
      {/* Row 1: Reprint, Send Receipt, Customer, Tip Adjust */}
      <div className="flex flex-wrap items-center gap-2">
        {canReprint && (
          <ReprintDropdown
            orderId={orderId}
            locationId={locationId}
            size="sm"
            variant="outline"
          />
        )}
        {canSendReceipt && (
          <Button variant="outline" size="sm" onClick={onSendReceipt}>
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
      {/* Row 2: Refund, Void — Refund amber, Void red, positioned last */}
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        {showRefund && (
          <ActionButton
            variant="outline"
            size="sm"
            onClick={onRefund}
            disabled={!canRefund}
            tooltip={refundDisabledReason}
            className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/50 dark:hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-4 w-4 mr-1.5 text-amber-700 dark:text-amber-400" />
            Refund
          </ActionButton>
        )}
        {showVoid && (
          <ActionButton
            variant="destructive"
            size="sm"
            onClick={onVoid}
            disabled={!canVoid}
            tooltip={voidDisabledReason}
          >
            <Ban className="h-4 w-4 mr-1.5" />
            Void Order
          </ActionButton>
        )}
      </div>
    </div>
  );

  // Mobile: FAB with expandable menu — positioned at top
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
          {(showRefund || showVoid) && (
            <>
              <div className="my-1 h-px bg-border" />
              {showRefund && (
                <DropdownMenuItem
                  disabled={!canRefund}
                  onSelect={() => {
                    if (!canRefund) return;
                    setFabOpen(false);
                    onRefund();
                  }}
                  className="flex flex-col items-start gap-0.5 text-amber-700 dark:text-amber-400"
                >
                  <span className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Refund
                  </span>
                  {refundDisabledReason && !canRefund && (
                    <span className="pl-6 text-xs text-muted-foreground">
                      {refundDisabledReason}
                    </span>
                  )}
                </DropdownMenuItem>
              )}
              {showVoid && (
                <DropdownMenuItem
                  disabled={!canVoid}
                  onSelect={() => {
                    if (!canVoid) return;
                    setFabOpen(false);
                    onVoid();
                  }}
                  className="flex flex-col items-start gap-0.5 text-destructive focus:text-destructive"
                >
                  <span className="flex items-center gap-2">
                    <Ban className="h-4 w-4" />
                    Void Order
                  </span>
                  {voidDisabledReason && !canVoid && (
                    <span className="pl-6 text-xs text-muted-foreground">
                      {voidDisabledReason}
                    </span>
                  )}
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      {/* Desktop: full action bar */}
      <div className="hidden md:block">{desktopBar}</div>
      {/* Mobile: action bar (wraps) + FAB */}
      <div className="flex flex-wrap items-center gap-2 md:hidden">
        {desktopBar}
      </div>
      {isMobile && hasAnyAction && mobileFab}
    </TooltipProvider>
  );
}
