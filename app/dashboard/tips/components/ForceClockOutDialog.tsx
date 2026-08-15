"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { OrphanedShift } from "@/app/dashboard/actions/tips";
import { formatMoney } from "../lib/constants";

interface ForceClockOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: OrphanedShift | null;
  onConfirm: (shiftId: string, clockOutTime: string, cashTips: number) => void;
  isLoading: boolean;
}

export function ForceClockOutDialog({
  open,
  onOpenChange,
  shift,
  onConfirm,
  isLoading,
}: ForceClockOutDialogProps) {
  const [clockOutTime, setClockOutTime] = useState("");
  const [cashTips, setCashTips] = useState("");
  const [noCashTips, setNoCashTips] = useState(false);

  // Initialize when shift changes
  const defaultClockOut = useMemo(() => {
    if (!shift) return "";
    return shift.suggestedClockOut.slice(0, 16); // "YYYY-MM-DDTHH:MM" for datetime-local
  }, [shift]);

  // Reset form when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v && shift) {
      setClockOutTime(defaultClockOut);
      setCashTips("");
      setNoCashTips(false);
    }
    onOpenChange(v);
  };

  const resultingHours = useMemo(() => {
    if (!shift || !clockOutTime) return 0;
    const clockIn = new Date(shift.clockInTime);
    const clockOut = new Date(clockOutTime);
    return Math.max(0, Math.round(((clockOut.getTime() - clockIn.getTime()) / 3600000) * 10) / 10);
  }, [shift, clockOutTime]);

  const handleConfirm = () => {
    if (!shift) return;
    const tips = noCashTips ? 0 : parseFloat(cashTips) || 0;
    onConfirm(shift.id, new Date(clockOutTime).toISOString(), tips);
  };

  const isValid = clockOutTime && (noCashTips || cashTips !== "") && resultingHours > 0;

  if (!shift) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Force Clock Out</DialogTitle>
          <DialogDescription>
            {shift.staffName} has been clocked in since{" "}
            {format(new Date(shift.clockInTime), "EEE, MMM d 'at' h:mm a")} ({shift.hoursSinceClockIn}h ago)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Clock out time */}
          <div>
            <Label htmlFor="clock-out-time">Clock out at</Label>
            <Input
              id="clock-out-time"
              type="datetime-local"
              value={clockOutTime}
              min={shift.clockInTime.slice(0, 16)}
              onChange={(e) => setClockOutTime(e.target.value)}
              className="mt-1"
            />
            <div className="flex gap-2 mt-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  const d = new Date(shift.clockInTime);
                  d.setHours(d.getHours() + 8);
                  setClockOutTime(d.toISOString().slice(0, 16));
                }}
              >
                +8h
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  const d = new Date(shift.clockInTime);
                  d.setHours(d.getHours() + 10);
                  setClockOutTime(d.toISOString().slice(0, 16));
                }}
              >
                +10h
              </Button>
            </div>
          </div>

          {/* Resulting hours */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded text-sm">
            <span className="text-muted-foreground">Resulting hours</span>
            <span className="font-bold">{resultingHours}h</span>
          </div>

          {/* Cash tips */}
          <div>
            <Label htmlFor="cash-tips">Cash tips declared</Label>
            <Input
              id="cash-tips"
              type="number"
              min="0"
              step="0.01"
              value={noCashTips ? "" : cashTips}
              onChange={(e) => setCashTips(e.target.value)}
              placeholder="0.00"
              disabled={noCashTips}
              className="mt-1"
            />
            <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
              <Checkbox
                checked={noCashTips}
                onCheckedChange={(checked) => {
                  setNoCashTips(!!checked);
                  if (checked) setCashTips("");
                }}
              />
              <span className="text-sm text-muted-foreground">No cash tips</span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || isLoading}
            
          >
            {isLoading ? "Clocking out..." : "Clock Out & Declare"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
