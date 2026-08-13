"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, ArrowRightLeft, Check, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Shift } from "@/types/schedule";

interface SwapRequestCardProps {
  ownerName: string;
  peerName: string;
  myShift: Shift;
  peerShift: Shift;
  submittedAt: string;
  onApprove: () => void;
  onDeny: () => void;
}

export function SwapRequestCard({
  ownerName,
  peerName,
  myShift,
  peerShift,
  submittedAt,
  onApprove,
  onDeny,
}: SwapRequestCardProps) {
  const ShiftInfo = ({ shift, name }: { shift: Shift; name: string }) => (
    <div className="flex-1 p-3 rounded-lg bg-muted/50 border space-y-1">
      <div className="font-medium text-sm">{name}</div>
      <div className="text-xs text-muted-foreground">{shift.role}</div>
      <div className="text-xs text-muted-foreground">
        {format(parseISO(shift.start_time), "EEE, MMM d")}
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        {format(parseISO(shift.start_time), "h:mm a")} -{" "}
        {format(parseISO(shift.end_time), "h:mm a")}
      </div>
    </div>
  );

  return (
    <Card className="bg-card border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="font-semibold text-foreground">
              Shift Swap Request
            </div>
            <div className="text-sm text-muted-foreground">
              {ownerName} wants to swap with {peerName}
            </div>
          </div>
          <Badge
            variant="outline"
            className="bg-blue-500/10 text-blue-600 border-blue-500/30"
          >
            Swap
          </Badge>
        </div>

        {/* Shift Comparison */}
        <div className="flex items-center gap-2">
          <ShiftInfo shift={myShift} name={ownerName} />
          <div className="flex-shrink-0">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
          </div>
          <ShiftInfo shift={peerShift} name={peerName} />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Submitted {format(parseISO(submittedAt), "MMM d, h:mm a")}
          </span>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDeny}
          >
            <X className="h-4 w-4 mr-1" />
            Deny
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={onApprove}
          >
            <Check className="h-4 w-4 mr-1" />
            Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SwapRequestCard;
