"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Check, X } from "lucide-react";

interface PTORequestCardProps {
  employee: string;
  startDate: string;
  endDate: string;
  reason?: string;
  onApprove: () => void;
  onDeny: () => void;
}

export function PTORequestCard({
  employee,
  startDate,
  endDate,
  reason,
  onApprove,
  onDeny,
}: PTORequestCardProps) {
  return (
    <Card className="bg-card border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="font-semibold text-foreground">{employee}</div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {startDate} - {endDate}
              </span>
            </div>
          </div>
          <Badge
            variant="outline"
            className="bg-purple-500/10 text-purple-600 border-purple-500/30"
          >
            PTO
          </Badge>
        </div>

        {reason && (
          <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
            "{reason}"
          </p>
        )}

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

export default PTORequestCard;
