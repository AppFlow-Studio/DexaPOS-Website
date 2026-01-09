"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { useUnifiedStaff } from "@/app/dashboard/hooks/useStaff";
import { Shift } from "@/types/schedule";
import { format, parseISO } from "date-fns";
import {
  ArrowRightLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
} from "lucide-react";
import { toast } from "sonner";

interface SwapProposalWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;
  myShift: Shift;
  onComplete?: () => void;
}

type Step = 1 | 2 | 3;

export function SwapProposalWizard({
  open,
  onOpenChange,
  scheduleId,
  myShift,
  onComplete,
}: SwapProposalWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [selectedPeerShiftId, setSelectedPeerShiftId] = useState<string | null>(
    null
  );

  const { data: staffMembers = [] } = useUnifiedStaff();
  const { weeklySchedules, schedulePeriods } = useScheduleStore();

  // Get current schedule
  const schedule = useMemo(() => {
    return (
      weeklySchedules.find((s) => s.id === scheduleId) ||
      schedulePeriods.find((s) => s.id === scheduleId)
    );
  }, [scheduleId, weeklySchedules, schedulePeriods]);

  // Filter peers (exclude current shift owner)
  const availablePeers = useMemo(() => {
    return staffMembers.filter((s) => s.member_id !== myShift.employee_id);
  }, [staffMembers, myShift]);

  // Get selected peer's shifts
  const peerShifts = useMemo(() => {
    if (!selectedPeerId || !schedule) return [];
    return (schedule.shifts || []).filter(
      (s) => s.employee_id === selectedPeerId
    );
  }, [selectedPeerId, schedule]);

  const selectedPeer = availablePeers.find(
    (p) => p.member_id === selectedPeerId
  );
  const selectedPeerShift = peerShifts.find(
    (s) => s.id === selectedPeerShiftId
  );

  const handleNext = () => {
    if (step === 1 && selectedPeerId) {
      setStep(2);
    } else if (step === 2 && selectedPeerShiftId) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setSelectedPeerShiftId(null);
    } else if (step === 3) {
      setStep(2);
    }
  };

  const handleSubmit = () => {
    // In a real implementation, this would call the store action
    toast.success("Swap Request Sent", {
      description: `Request sent to ${
        selectedPeer?.display_name || "peer"
      } for approval.`,
    });
    onOpenChange(false);
    onComplete?.();
    // Reset state
    setStep(1);
    setSelectedPeerId(null);
    setSelectedPeerShiftId(null);
  };

  const handleClose = () => {
    onOpenChange(false);
    setStep(1);
    setSelectedPeerId(null);
    setSelectedPeerShiftId(null);
  };

  const ShiftPreview = ({ shift, label }: { shift: Shift; label: string }) => (
    <div className="p-3 rounded-lg bg-muted/50 border space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{shift.employee_name}</div>
      <div className="text-sm text-muted-foreground capitalize">
        {shift.role}
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        {format(parseISO(shift.start_time), "EEE, MMM d")} •{" "}
        {format(parseISO(shift.start_time), "h:mm a")} -{" "}
        {format(parseISO(shift.end_time), "h:mm a")}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Propose Shift Swap
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Step 1: Select a coworker to swap with."}
            {step === 2 && "Step 2: Select which of their shifts you want."}
            {step === 3 && "Step 3: Review and confirm the swap request."}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : step > s
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step > s ? <Check className="h-4 w-4" /> : s}
            </div>
          ))}
        </div>

        <ScrollArea className="max-h-[400px]">
          {/* Step 1: Select Peer */}
          {step === 1 && (
            <div className="space-y-3 p-1">
              <div className="text-sm font-medium mb-2">Your Shift:</div>
              <ShiftPreview shift={myShift} label="You're offering" />

              <div className="text-sm font-medium mt-4 mb-2">
                Select Coworker:
              </div>
              <RadioGroup
                value={selectedPeerId || ""}
                onValueChange={setSelectedPeerId}
              >
                {availablePeers.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    No other employees available
                  </div>
                ) : (
                  availablePeers.map((peer) => (
                    <div
                      key={peer.member_id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelectedPeerId(peer.member_id)}
                    >
                      <RadioGroupItem
                        value={peer.member_id}
                        id={peer.member_id}
                      />
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <Label
                        htmlFor={peer.member_id}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="font-medium">{peer.display_name}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          Staff
                        </div>
                      </Label>
                    </div>
                  ))
                )}
              </RadioGroup>
            </div>
          )}

          {/* Step 2: Select Peer's Shift */}
          {step === 2 && (
            <div className="space-y-3 p-1">
              <div className="text-sm font-medium mb-2">
                {selectedPeer?.display_name}'s Shifts:
              </div>

              {peerShifts.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  This coworker has no scheduled shifts
                </div>
              ) : (
                <RadioGroup
                  value={selectedPeerShiftId || ""}
                  onValueChange={setSelectedPeerShiftId}
                >
                  {peerShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelectedPeerShiftId(shift.id)}
                    >
                      <RadioGroupItem
                        value={shift.id}
                        id={shift.id}
                        className="mt-1"
                      />
                      <Label
                        htmlFor={shift.id}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">
                            {shift.role}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {format(parseISO(shift.start_time), "EEE")}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                          <Clock className="h-3 w-3" />
                          {format(
                            parseISO(shift.start_time),
                            "MMM d, h:mm a"
                          )}{" "}
                          - {format(parseISO(shift.end_time), "h:mm a")}
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 3 && selectedPeerShift && (
            <div className="space-y-4 p-1">
              <div className="text-sm font-medium text-center mb-4">
                Review Swap Request
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <ShiftPreview shift={myShift} label="You give" />
                </div>
                <ArrowRightLeft className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1">
                  <ShiftPreview shift={selectedPeerShift} label="You get" />
                </div>
              </div>

              <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30 text-sm">
                <span className="font-medium text-yellow-700 dark:text-yellow-400">
                  Note:
                </span>{" "}
                <span className="text-yellow-600 dark:text-yellow-300">
                  {selectedPeer?.display_name} will need to approve this swap
                  before it goes to your manager for final approval.
                </span>
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={step === 1 ? handleClose : handleBack}
            className="gap-1"
          >
            {step === 1 ? (
              "Cancel"
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                Back
              </>
            )}
          </Button>

          {step < 3 ? (
            <Button
              onClick={handleNext}
              disabled={
                (step === 1 && !selectedPeerId) ||
                (step === 2 && !selectedPeerShiftId)
              }
              className="gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} className="gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Send Swap Request
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SwapProposalWizard;
