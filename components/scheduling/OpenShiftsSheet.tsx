"use client";

import { useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { useUnifiedStaff } from "@/app/dashboard/hooks/useStaff";
import { Shift } from "@/types/schedule";
import { format, parseISO } from "date-fns";
import {
  Calendar,
  ArrowDownCircle,
  ArrowRightLeft,
  Clock,
  Plus,
  Edit2,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { DenyRequestModal } from "./DenyRequestModal";
import { PTORequestCard } from "./requests/PTORequestCard";
import { DropRequestCard } from "./requests/DropRequestCard";
import { SwapRequestCard } from "./requests/SwapRequestCard";

interface OpenShiftsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;
  scheduleType: "period" | "weekly";
  onAddOpenShift?: () => void;
  onEditShift?: (shift: Shift) => void;
}

export function OpenShiftsSheet({
  open,
  onOpenChange,
  scheduleId,
  scheduleType,
  onAddOpenShift,
  onEditShift,
}: OpenShiftsSheetProps) {
  const [activeTab, setActiveTab] = useState("open-shifts");
  const [isDenyModalOpen, setDenyModalOpen] = useState(false);
  const [requestToDeny, setRequestToDeny] = useState<any>(null);

  const { data: staffMembers = [] } = useUnifiedStaff();

  const {
    dropRequests,
    swapRequests,
    ptoRequests,
    weeklySchedules,
    schedulePeriods,
    approveDropRequest,
    denyDropRequest,
    revertDropRequestApproval,
    approveSwap,
    denySwap,
    revertSwapApproval,
    approvePTORequest,
    denyPTORequest,
    revertPTORequestApproval,
    getOpenShifts,
    assignOpenShift,
    deleteShift,
  } = useScheduleStore();

  // Get current schedule
  const currentSchedule = useMemo(() => {
    if (scheduleType === "weekly") {
      return weeklySchedules.find((s) => s.id === scheduleId);
    }
    return schedulePeriods.find((s) => s.id === scheduleId);
  }, [scheduleId, scheduleType, weeklySchedules, schedulePeriods]);

  // Filter requests
  const pendingPTO = useMemo(
    () => ptoRequests.filter((r) => r.status === "pending"),
    [ptoRequests]
  );
  const pendingDrops = useMemo(
    () => dropRequests.filter((r) => r.status === "pending"),
    [dropRequests]
  );
  const pendingSwaps = useMemo(
    () => swapRequests.filter((r) => r.status === "pending-manager"),
    [swapRequests]
  );

  const openShifts = useMemo(() => {
    return getOpenShifts(scheduleId);
  }, [scheduleId, getOpenShifts, currentSchedule]);

  // Counts for badges
  const openShiftsCount = openShifts.length;
  const dropCount = pendingDrops.length;
  const swapCount = pendingSwaps.length;
  const ptoCount = pendingPTO.length;

  const getEmployeeName = (employeeId: string) => {
    const emp = staffMembers.find((s) => s.member_id === employeeId);
    return emp?.display_name || "Unknown";
  };

  const handleDenyClick = (request: any, type: "drop" | "swap" | "pto") => {
    setRequestToDeny({ ...request, type });
    setDenyModalOpen(true);
  };

  const handleConfirmDeny = (reason: string) => {
    if (!requestToDeny) return;

    if (requestToDeny.type === "drop") {
      denyDropRequest(requestToDeny.id, "manager", reason);
    } else if (requestToDeny.type === "pto") {
      denyPTORequest(requestToDeny.id, "manager", reason);
    } else if (requestToDeny.type === "swap") {
      denySwap(requestToDeny.id);
    }

    toast.success("Request Denied", {
      description: "The request has been denied.",
    });
    setRequestToDeny(null);
  };

  const handleApproveDropRequest = (requestId: string) => {
    approveDropRequest(requestId, "manager");
    toast.success("Drop Request Approved", {
      description: "The shift has been marked as open.",
    });
  };

  const handleApproveSwap = (requestId: string) => {
    approveSwap(requestId);
    toast.success("Swap Approved", {
      description: "The shifts have been swapped.",
    });
  };

  const handleApprovePTO = (requestId: string) => {
    approvePTORequest(requestId, "manager");
    toast.success("PTO Approved", {
      description: "The time off request has been approved.",
    });
  };

  const handleAssignShift = (shift: Shift) => {
    // For now, just assign to first available staff member (in real app, show picker)
    if (staffMembers.length > 0) {
      const firstStaff = staffMembers[0];
      assignOpenShift(
        scheduleId,
        shift.id,
        firstStaff.member_id,
        firstStaff.display_name
      );
      toast.success("Shift Assigned", {
        description: `Shift assigned to ${firstStaff.display_name}`,
      });
    }
  };

  const handleDeleteOpenShift = (shiftId: string) => {
    deleteShift(scheduleId, shiftId);
    toast.success("Shift Deleted", {
      description: "The open shift has been removed.",
    });
  };

  const TabBadge = ({ count }: { count: number }) =>
    count > 0 ? (
      <Badge
        variant="destructive"
        className="ml-1 h-5 w-5 p-0 justify-center text-[10px]"
      >
        {count}
      </Badge>
    ) : null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Open Shifts & Requests
            </SheetTitle>
            <SheetDescription>
              Manage open shifts, drop requests, swaps, and PTO.
            </SheetDescription>
          </SheetHeader>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1"
          >
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-6 h-12">
              <TabsTrigger
                value="open-shifts"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
              >
                Open Shifts <TabBadge count={openShiftsCount} />
              </TabsTrigger>
              <TabsTrigger
                value="drops"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
              >
                Drops <TabBadge count={dropCount} />
              </TabsTrigger>
              <TabsTrigger
                value="swaps"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
              >
                Swaps <TabBadge count={swapCount} />
              </TabsTrigger>
              <TabsTrigger
                value="pto"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
              >
                PTO <TabBadge count={ptoCount} />
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[calc(100vh-180px)]">
              {/* Open Shifts Tab */}
              <TabsContent value="open-shifts" className="p-6 space-y-4 m-0">
                <Button onClick={onAddOpenShift} className="w-full gap-2">
                  <Plus className="h-4 w-4" />
                  Add Open Shift
                </Button>

                {openShifts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Calendar className="h-12 w-12 mb-3 opacity-30" />
                    <p>No open shifts</p>
                  </div>
                ) : (
                  openShifts.map((shift) => (
                    <Card key={shift.id} className="bg-card border">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="font-semibold text-lg">
                              {shift.role}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {format(parseISO(shift.start_time), "EEE, MMM d")}
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              {format(
                                parseISO(shift.start_time),
                                "h:mm a"
                              )} - {format(parseISO(shift.end_time), "h:mm a")}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {onEditShift && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => onEditShift(shift)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteOpenShift(shift.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full gap-2"
                          onClick={() => handleAssignShift(shift)}
                        >
                          <UserPlus className="h-4 w-4" />
                          Assign Employee
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Drop Requests Tab */}
              <TabsContent value="drops" className="p-6 space-y-4 m-0">
                {pendingDrops.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <ArrowDownCircle className="h-12 w-12 mb-3 opacity-30" />
                    <p>No pending drop requests</p>
                  </div>
                ) : (
                  pendingDrops.map((req) => (
                    <DropRequestCard
                      key={req.id}
                      employeeName={getEmployeeName(req.employeeId)}
                      shift={req.shift}
                      reason={req.reason}
                      submittedAt={req.submittedAt}
                      onApprove={() => handleApproveDropRequest(req.id)}
                      onDeny={() => handleDenyClick(req, "drop")}
                    />
                  ))
                )}
              </TabsContent>

              {/* Swaps Tab */}
              <TabsContent value="swaps" className="p-6 space-y-4 m-0">
                {pendingSwaps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <ArrowRightLeft className="h-12 w-12 mb-3 opacity-30" />
                    <p>No pending swap requests</p>
                  </div>
                ) : (
                  pendingSwaps.map((req) => {
                    // For demo, we'll create mock shifts
                    const mockMyShift: Shift = {
                      id: req.myShiftId,
                      employee_id: req.ownerId,
                      employee_name: getEmployeeName(req.ownerId),
                      start_time: new Date().toISOString(),
                      end_time: new Date().toISOString(),
                      role: "server",
                      location_id: "loc-1",
                    };
                    const mockPeerShift: Shift = {
                      id: req.peerShiftId || "",
                      employee_id: req.peerId || "",
                      employee_name: getEmployeeName(req.peerId || ""),
                      start_time: new Date().toISOString(),
                      end_time: new Date().toISOString(),
                      role: "cashier",
                      location_id: "loc-1",
                    };

                    return (
                      <SwapRequestCard
                        key={req.id}
                        ownerName={getEmployeeName(req.ownerId)}
                        peerName={getEmployeeName(req.peerId || "")}
                        myShift={mockMyShift}
                        peerShift={mockPeerShift}
                        submittedAt={req.submittedAt}
                        onApprove={() => handleApproveSwap(req.id)}
                        onDeny={() => handleDenyClick(req, "swap")}
                      />
                    );
                  })
                )}
              </TabsContent>

              {/* PTO Tab */}
              <TabsContent value="pto" className="p-6 space-y-4 m-0">
                {pendingPTO.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Calendar className="h-12 w-12 mb-3 opacity-30" />
                    <p>No pending PTO requests</p>
                  </div>
                ) : (
                  pendingPTO.map((req) => (
                    <PTORequestCard
                      key={req.id}
                      employee={getEmployeeName(req.employeeId)}
                      startDate={format(parseISO(req.startDate), "MMM d, yyyy")}
                      endDate={format(parseISO(req.endDate), "MMM d, yyyy")}
                      reason={req.note}
                      onApprove={() => handleApprovePTO(req.id)}
                      onDeny={() => handleDenyClick(req, "pto")}
                    />
                  ))
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </SheetContent>
      </Sheet>

      <DenyRequestModal
        open={isDenyModalOpen}
        onOpenChange={setDenyModalOpen}
        onConfirm={handleConfirmDeny}
        title="Deny Request"
        description="Are you sure you want to deny this request? You can provide an optional reason below."
      />
    </>
  );
}

export default OpenShiftsSheet;
