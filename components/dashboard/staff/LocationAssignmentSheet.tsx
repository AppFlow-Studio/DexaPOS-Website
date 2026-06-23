"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { LocationAssignment, EmploymentType } from "@/types/staff";
import { cn } from "@/lib/utils";
import {
  MapPin,
  KeyRound,
  CheckCircle2,
  DollarSign,
  Loader2,
  Save,
  X,
  ArrowLeft,
} from "lucide-react";
import { StaffPinField } from "./StaffPinField";
import {
  useResetStaffPIN,
  useUpdateStaffAssignment,
  useDeactivateStaff,
  useReactivateStaff,
  useSetPrimaryLocation,
} from "@/app/dashboard/hooks/useStaff";
import { Star } from "lucide-react";
import { toast } from "sonner";

interface LocationAssignmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  staffProfileId: string;
  memberName: string;
  isClerkUser: boolean;
  assignment: LocationAssignment;
  currentUserRoleLevel: number;
}

export function LocationAssignmentSheet({
  open,
  onOpenChange,
  memberId,
  staffProfileId,
  memberName,
  isClerkUser,
  assignment,
  currentUserRoleLevel,
}: LocationAssignmentSheetProps) {
  const resetPIN = useResetStaffPIN();
  const updateAssignment = useUpdateStaffAssignment();
  const deactivateStaff = useDeactivateStaff();
  const reactivateStaff = useReactivateStaff();
  const setPrimary = useSetPrimaryLocation();

  // Form state — role is fixed at the org/merchant level and not editable here.
  const [editedEmploymentType, setEditedEmploymentType] =
    React.useState<EmploymentType | null>(
      assignment.employment_type as EmploymentType | null
    );
  const [editedHourlyRate, setEditedHourlyRate] = React.useState<string>(
    assignment.hourly_rate?.toString() || ""
  );
  const [editedIsActive, setEditedIsActive] = React.useState<boolean>(
    assignment.is_active
  );
  const [hasChanges, setHasChanges] = React.useState(false);

  React.useEffect(() => {
    setEditedEmploymentType(
      assignment.employment_type as EmploymentType | null
    );
    setEditedHourlyRate(assignment.hourly_rate?.toString() || "");
    setEditedIsActive(assignment.is_active);
    setHasChanges(false);
  }, [assignment]);

  React.useEffect(() => {
    const employmentChanged =
      editedEmploymentType !== assignment.employment_type;
    const rateChanged =
      (editedHourlyRate ? parseFloat(editedHourlyRate) : null) !==
      assignment.hourly_rate;
    const statusChanged = editedIsActive !== assignment.is_active;

    setHasChanges(employmentChanged || rateChanged || statusChanged);
  }, [editedEmploymentType, editedHourlyRate, editedIsActive, assignment]);

  const handleResetPIN = () => {
    resetPIN.mutate({
      memberId: memberId,
      locationId: assignment.location_id,
    });
  };

  const handleSaveChanges = async () => {
    const updates: any = {};

    if (editedEmploymentType !== assignment.employment_type) {
      updates.employment_type = editedEmploymentType;
    }
    const newRate = editedHourlyRate ? parseFloat(editedHourlyRate) : null;
    if (newRate !== assignment.hourly_rate) {
      updates.hourly_rate = newRate;
    }

    // Handle status change separately
    if (editedIsActive !== assignment.is_active) {
      if (editedIsActive) {
        // Reactivate
        reactivateStaff.mutate(
          { staffProfileId, locationId: assignment.location_id },
          {
            onSuccess: () => {
              toast.success(
                `${memberName} reactivated at ${assignment.location_name}`
              );
            },
          }
        );
      } else {
        // Deactivate
        deactivateStaff.mutate(
          { staffProfileId, locationId: assignment.location_id },
          {
            onSuccess: () => {
              toast.success(
                `${memberName} deactivated at ${assignment.location_name}`
              );
            },
          }
        );
      }
    }

    if (Object.keys(updates).length > 0) {
      updateAssignment.mutate(
        {
          memberId: memberId,
          locationId: assignment.location_id,
          updates,
        },
        {
          onSuccess: () => {
            toast.success("Assignment updated successfully");
            setHasChanges(false);
          },
        }
      );
    } else if (editedIsActive === assignment.is_active) {
      // No changes at all
      toast.info("No changes to save");
    }
  };

  const handleCancel = () => {
    setEditedEmploymentType(
      assignment.employment_type as EmploymentType | null
    );
    setEditedHourlyRate(assignment.hourly_rate?.toString() || "");
    setEditedIsActive(assignment.is_active);
    setHasChanges(false);
    onOpenChange(false);
  };

  const handleSetPrimary = () => {
    setPrimary.mutate({
      memberId,
      locationId: assignment.location_id,
    });
  };

  const isPending =
    resetPIN.isPending ||
    updateAssignment.isPending ||
    deactivateStaff.isPending ||
    reactivateStaff.isPending ||
    setPrimary.isPending;

  void currentUserRoleLevel;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col px-4 z-[200]"
      >
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <SheetTitle className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {assignment.location_name}
              </SheetTitle>
              <SheetDescription>
                Manage {memberName}'s assignment at this location
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-6 space-y-6">
          {/* Status Badge */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={editedIsActive ? "default" : "secondary"}>
                {editedIsActive ? "Active" : "Inactive"}
              </Badge>
              {assignment.is_primary && (
                <Badge variant="outline" className="gap-1">
                  <Star className="h-3 w-3" />
                  Primary
                </Badge>
              )}
            </div>
            {!assignment.is_primary && assignment.is_active && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={handleSetPrimary}
                disabled={isPending}
              >
                {setPrimary.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Star className="h-3 w-3" />
                )}
                Set as primary
              </Button>
            )}
          </div>

          <Separator />

          {/* Role (read-only — set at the org level) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Role</Label>
            <Badge variant="outline" className="text-sm">
              {assignment.role_code.split(".").pop()}
            </Badge>
            <p className="text-xs text-muted-foreground">
              A user has one role across all their locations. To change it, edit
              the staff member's role from the team page.
            </p>
          </div>

          {/* Employment Details (POS staff only) */}
          {!isClerkUser && (
            <>
              <Separator />
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Employment Details</h4>

                {/* Employment Type */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Employment Type
                  </Label>
                  <Select
                    value={editedEmploymentType || undefined}
                    onValueChange={(value) =>
                      setEditedEmploymentType(value as EmploymentType)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full-time">Full-time</SelectItem>
                      <SelectItem value="part-time">Part-time</SelectItem>
                      <SelectItem value="contractor">Contractor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Hourly Rate */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Hourly Rate
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={editedHourlyRate}
                      onChange={(e) => setEditedHourlyRate(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Status Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">
                  Status at this Location
                </Label>
                <p className="text-xs text-muted-foreground">
                  {editedIsActive
                    ? "This staff member can work at this location"
                    : "This staff member cannot work at this location"}
                </p>
              </div>
              <Switch
                checked={editedIsActive}
                onCheckedChange={setEditedIsActive}
                disabled={isPending}
              />
            </div>
          </div>

          <Separator />

          {/* PIN Management */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">POS Access</span>
              </div>
              <Badge
                variant={assignment.has_pin ? "default" : "outline"}
                className={cn(
                  "text-xs gap-1",
                  assignment.has_pin ? "bg-emerald-600 text-white" : ""
                )}
              >
                {assignment.has_pin ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    PIN set
                  </>
                ) : (
                  "No PIN"
                )}
              </Badge>
            </div>

            <StaffPinField
              memberId={memberId}
              locationId={assignment.location_id}
              locationName={assignment.location_name}
              hasPin={assignment.has_pin}
              canReveal={currentUserRoleLevel <= 75}
              onGenerate={handleResetPIN}
              isGenerating={resetPIN.isPending}
              disabled={isPending}
              buttonLabel={
                assignment.has_pin ? "Generate New PIN" : "Generate PIN"
              }
            />
          </div>
        </div>

        <SheetFooter className="border-t pt-4">
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleCancel}
              disabled={isPending}
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSaveChanges}
              disabled={!hasChanges || isPending}
            >
              {updateAssignment.isPending ||
              deactivateStaff.isPending ||
              reactivateStaff.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
