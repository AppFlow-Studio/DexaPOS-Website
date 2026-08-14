"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, Check, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Shift } from "@/types/schedule";

interface DropRequestCardProps {
  employeeName: string;
  shift: Shift;
  reason: string;
  submittedAt: string;
  onApprove: () => void;
  onDeny: () => void;
}

export function DropRequestCard({
  employeeName,
  shift,
  reason,
  submittedAt,
  onApprove,
  onDeny,
}: DropRequestCardProps) {
  return (
    <Card className="rounded-2xl border bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="font-semibold text-foreground">{employeeName}</div>
            <div className="text-sm text-muted-foreground">
              wants to drop their shift
            </div>
          </div>
          <Badge
            variant="outline"
            className="bg-orange-500/10 text-orange-600 border-orange-500/30"
          >
            Drop
          </Badge>
        </div>

        {/* Shift Details */}
        <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{shift.role}</span>
            <span className="text-xs text-muted-foreground">
              {format(parseISO(shift.start_time), "EEE, MMM d")}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(parseISO(shift.start_time), "h:mm a")} -{" "}
              {format(parseISO(shift.end_time), "h:mm a")}
            </div>
          </div>
        </div>

        {reason && (
          <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded italic">
            "{reason}"
          </p>
        )}

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

export default DropRequestCard;
