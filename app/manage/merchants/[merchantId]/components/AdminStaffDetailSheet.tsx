"use client";

import * as React from "react";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { StaffPinField } from "@/components/dashboard/staff/StaffPinField";
import { cn } from "@/lib/utils";
import {
  useAdminResetStaffPin,
  useAdminToggleStaffStatus,
  useAdminResetStaffPassword,
  useAdminUpdateStaffRole,
  useMerchantStaffRoles,
} from "@/lib/queries/use-admin-staff";
import type { AdminStaffMember } from "@/types/staff";
import {
  Activity,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  Phone,
  Shield,
  Tablet,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditStaffProfileDialog } from "./EditStaffProfileDialog";
import { EditStaffLocationsDialog } from "./EditStaffLocationsDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CredentialToast } from "@/components/ui/credential-toast";
import { toast } from "sonner";

interface AdminStaffDetailSheetProps {
  merchantId: string;
  staff: AdminStaffMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString();
}

export function AdminStaffDetailSheet({
  merchantId,
  staff,
  open,
  onOpenChange,
  canManage,
}: AdminStaffDetailSheetProps) {
  const resetPinMutation = useAdminResetStaffPin();
  const toggleStatusMutation = useAdminToggleStaffStatus();
  const resetPasswordMutation = useAdminResetStaffPassword();
  const updateRoleMutation = useAdminUpdateStaffRole();
  const { data: availableRoles = [] } = useMerchantStaffRoles();

  const [editProfileOpen, setEditProfileOpen] = React.useState(false);
  const [editLocationsOpen, setEditLocationsOpen] = React.useState(false);
  const [pendingRoleLocationId, setPendingRoleLocationId] = React.useState<string | null>(null);

  const [generatedPin, setGeneratedPin] = React.useState<string | null>(null);
  const [customPinInput, setCustomPinInput] = React.useState("");
  const [showCustomPin, setShowCustomPin] = React.useState(false);

  const [generatedPassword, setGeneratedPassword] = React.useState<string | null>(null);
  const [customPasswordInput, setCustomPasswordInput] = React.useState("");
  const [showCustomPassword, setShowCustomPassword] = React.useState(false);
  const [showPasswordValue, setShowPasswordValue] = React.useState(false);

  React.useEffect(() => {
    setGeneratedPin(null);
    setCustomPinInput("");
    setShowCustomPin(false);
    setGeneratedPassword(null);
    setCustomPasswordInput("");
    setShowCustomPassword(false);
  }, [staff?.member_id, staff?.last_updated_at]);

  if (!staff) return null;

  const initials = `${staff.first_name?.[0] || ""}${staff.last_name?.[0] || ""}`.toUpperCase();
  const primaryLocation =
    staff.location_assignments.find((assignment) => assignment.is_primary) ||
    staff.location_assignments[0] ||
    null;
  const pinAssignment =
    staff.location_assignments.find(
      (assignment) => assignment.location_id === primaryLocation?.location_id && assignment.has_pin
    ) ||
    staff.location_assignments.find((assignment) => assignment.has_pin) ||
    primaryLocation;
  const hasPin = staff.location_assignments.some((assignment) => assignment.has_pin);
  const effectivePin = generatedPin ?? pinAssignment?.pin_code ?? null;

  const handleGeneratePin = () => {
    if (!canManage) return;
    if (!primaryLocation || !staff.staff_profile_id) {
      toast.error("Cannot reset PIN: missing required info");
      return;
    }

    resetPinMutation.mutate(
      {
        merchantId,
        staffProfileId: staff.staff_profile_id,
        locationId: primaryLocation.location_id,
      },
      {
        onSuccess: (result) => {
          if (!result.success || !result.pin) {
            toast.error(result.error || "Failed to reset PIN");
            return;
          }

          setGeneratedPin(result.pin);
          toast.success("PIN updated");
        },
      }
    );
  };

  const handleToggleStatus = () => {
    if (!canManage) return;
    if (!primaryLocation || !staff.staff_profile_id) {
      toast.error("Cannot update status: missing required info");
      return;
    }

    toggleStatusMutation.mutate(
      {
        merchantId,
        staffProfileId: staff.staff_profile_id,
        locationId: primaryLocation.location_id,
        newStatus: !staff.overall_is_active,
      },
      {
        onSuccess: (result) => {
          if (!result.success) {
            toast.error(result.error || "Failed to update status");
            return;
          }

          toast.success(staff.overall_is_active ? "Staff deactivated" : "Staff reactivated");
        },
      }
    );
  };

  const handleSetCustomPin = () => {
    if (!canManage) return;
    if (!/^\d{4,6}$/.test(customPinInput)) {
      toast.error("PIN must be 4–6 digits");
      return;
    }
    if (!primaryLocation || !staff.staff_profile_id) {
      toast.error("Cannot reset PIN: missing required info");
      return;
    }
    resetPinMutation.mutate(
      { merchantId, staffProfileId: staff.staff_profile_id, locationId: primaryLocation.location_id, customPin: customPinInput },
      {
        onSuccess: (result) => {
          if (!result.success || !result.pin) {
            toast.error(result.error || "Failed to set PIN");
            return;
          }
          setGeneratedPin(result.pin);
          setShowCustomPin(false);
          setCustomPinInput("");
          toast.custom(
            (t) => React.createElement(CredentialToast, { pin: result.pin, duration: 15, onDismiss: () => toast.dismiss(t) }),
            { duration: 15000, position: "top-center" }
          );
        },
      }
    );
  };

  const handleRoleChange = (locationId: string, newRoleCode: string) => {
    if (!canManage || !staff?.staff_profile_id) return;
    setPendingRoleLocationId(locationId);
    updateRoleMutation.mutate(
      { merchantId, staffProfileId: staff.staff_profile_id, locationId, newRoleCode },
      {
        onSuccess: (result) => {
          if (!result.success) {
            toast.error(result.error || "Failed to update role");
            return;
          }
          toast.success("Role updated");
        },
        onSettled: () => setPendingRoleLocationId(null),
      },
    );
  };

  const handleResetPassword = (custom?: string) => {
    if (!canManage || !staff.clerk_user_id) return;
    resetPasswordMutation.mutate(
      { merchantId, clerkUserId: staff.clerk_user_id, customPassword: custom || undefined },
      {
        onSuccess: (result) => {
          if (!result.success || !result.password) {
            toast.error(result.error || "Failed to reset password");
            return;
          }
          setGeneratedPassword(result.password);
          setShowCustomPassword(false);
          setCustomPasswordInput("");
          toast.custom(
            (t) => React.createElement(CredentialToast, { password: result.password, duration: 15, onDismiss: () => toast.dismiss(t) }),
            { duration: 15000, position: "top-center" }
          );
        },
      }
    );
  };

  return (
    <>
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="mx-auto w-full max-w-6xl" height="95">
        <BottomSheetHeader className="flex flex-col gap-2">
          <BottomSheetTitle>Staff details</BottomSheetTitle>
          <BottomSheetDescription>
            View staff profile, location assignments, status, and POS PIN from HQ.
          </BottomSheetDescription>
        </BottomSheetHeader>

        <BottomSheetBody className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-1">
            <section className="rounded-2xl border bg-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={staff.avatar_url || undefined} alt={staff.display_name} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">
                        {staff.first_name} {staff.last_name}
                      </h2>
                      {staff.account_type === "clerk" ? (
                        <Badge variant="secondary" className="gap-1">
                          <Shield className="h-3 w-3" />
                          Dashboard User
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <Tablet className="h-3 w-3" />
                          POS Only
                        </Badge>
                      )}
                      <Badge
                        variant={staff.overall_is_active ? "default" : "secondary"}
                        className={cn(
                          staff.overall_is_active
                            ? "bg-green-600 text-white hover:bg-green-600"
                            : ""
                        )}
                      >
                        {staff.overall_is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        <span>{staff.email || "No email"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span>{staff.phone || "No phone"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span>{staff.total_locations} assigned location(s)</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-stretch gap-2 md:items-end">
                  <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Status</p>
                      <p className="text-xs text-muted-foreground">
                        Toggle staff access for the primary location.
                      </p>
                    </div>
                    <Switch
                      checked={staff.overall_is_active}
                      onCheckedChange={handleToggleStatus}
                      disabled={!canManage || !primaryLocation || toggleStatusMutation.isPending}
                    />
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditProfileOpen(true)}
                      >
                        <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                        Edit Profile
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditLocationsOpen(true)}
                      >
                        <MapPin className="h-3.5 w-3.5 mr-1.5" />
                        Edit Locations
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <section className="rounded-2xl border bg-card p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Profile
                  </h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="Member ID" value={staff.member_id} mono />
                  <InfoRow label="Staff Profile ID" value={staff.staff_profile_id || "-"} mono />
                  <InfoRow label="Created" value={formatDate(staff.member_created_at)} />
                  <InfoRow label="Last Updated" value={formatDate(staff.last_updated_at)} />
                  <InfoRow label="Primary Location" value={staff.primary_location_name || "-"} />
                  <InfoRow label="Account Type" value={staff.account_type === "clerk" ? "Dashboard user" : "POS only"} />
                </div>
              </section>

              <section className="rounded-2xl border bg-card p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    POS Access
                  </h3>
                </div>
                <div className="space-y-4">
                  <StaffPinField
                    pin={effectivePin}
                    hasPin={hasPin || !!generatedPin}
                    onGenerate={handleGeneratePin}
                    isGenerating={resetPinMutation.isPending}
                    disabled={!canManage || !primaryLocation || !staff.staff_profile_id}
                    visibleDescription={
                      pinAssignment?.location_name
                        ? `Use the eye icon to reveal the PIN for ${pinAssignment.location_name}.`
                        : undefined
                    }
                  />

                  {/* Custom PIN input */}
                  {canManage && primaryLocation && staff.staff_profile_id && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => { setShowCustomPin((v) => !v); setCustomPinInput(""); }}
                      >
                        <KeyRound className="h-3 w-3" />
                        {showCustomPin ? "Cancel custom PIN" : "Set custom PIN"}
                      </button>
                      {showCustomPin && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="\d{4,6}"
                            maxLength={6}
                            placeholder="4–6 digit PIN"
                            value={customPinInput}
                            onChange={(e) => setCustomPinInput(e.target.value.replace(/\D/g, ""))}
                            className="h-8 w-36 font-mono text-sm"
                          />
                          <Button
                            size="sm"
                            onClick={handleSetCustomPin}
                            disabled={resetPinMutation.isPending || customPinInput.length < 4}
                          >
                            Set PIN
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  <Separator />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatusPill
                      label="PIN Status"
                      active={hasPin || !!generatedPin}
                      activeLabel="PIN set"
                      inactiveLabel="No PIN"
                    />
                    <StatusPill
                      label="Primary Assignment"
                      active={!!primaryLocation?.is_active}
                      activeLabel="Active"
                      inactiveLabel="Inactive"
                    />
                  </div>
                </div>
              </section>
            </div>

            {/* Dashboard Access — only for Clerk users */}
            {staff.account_type === "clerk" && staff.clerk_user_id && (
              <section className="rounded-2xl border bg-card p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Dashboard Access
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Reset the password this staff member uses to log in to the web dashboard.
                  </p>
                </div>
                <div className="space-y-4">
                  {/* Generated password display */}
                  {generatedPassword && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">New Password</Label>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Input
                            readOnly
                            value={showPasswordValue ? generatedPassword : "•".repeat(generatedPassword.length)}
                            className="font-mono text-sm pr-10"
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowPasswordValue((v) => !v)}
                          >
                            {showPasswordValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResetPassword()}
                      disabled={!canManage || resetPasswordMutation.isPending}
                    >
                      <Lock className="h-3.5 w-3.5 mr-1.5" />
                      {resetPasswordMutation.isPending ? "Resetting…" : "Reset Password"}
                    </Button>
                    {canManage && (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => { setShowCustomPassword((v) => !v); setCustomPasswordInput(""); }}
                      >
                        {showCustomPassword ? "Cancel" : "Set custom password"}
                      </button>
                    )}
                  </div>

                  {showCustomPassword && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        placeholder="Min 8 characters"
                        value={customPasswordInput}
                        onChange={(e) => setCustomPasswordInput(e.target.value)}
                        className="h-8 font-mono text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleResetPassword(customPasswordInput)}
                        disabled={resetPasswordMutation.isPending || customPasswordInput.length < 8}
                      >
                        Set
                      </Button>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Location Assignments
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The same staff details visible to merchant owners are now available from HQ.
                  </p>
                </div>
                <Badge variant="outline">{staff.location_assignments.length} total</Badge>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {staff.location_assignments.map((assignment) => (
                  <div
                    key={`${assignment.location_id}-${assignment.role_code}`}
                    className="rounded-xl border bg-background/60 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{assignment.location_name}</p>
                          {assignment.is_primary && <Badge>Primary</Badge>}
                        </div>
                        {canManage ? (
                          <div className="mt-2 max-w-xs">
                            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                              Role
                            </Label>
                            <Select
                              value={assignment.role_code}
                              onValueChange={(v) => handleRoleChange(assignment.location_id, v)}
                              disabled={
                                updateRoleMutation.isPending &&
                                pendingRoleLocationId === assignment.location_id
                              }
                            >
                              <SelectTrigger className="h-8 text-sm mt-1">
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableRoles.map((r) => (
                                  <SelectItem key={r.code} value={r.code}>
                                    {r.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {assignment.role_name}
                          </p>
                        )}
                      </div>
                      <Badge variant={assignment.is_active ? "default" : "secondary"}>
                        {assignment.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <InfoRow label="Role Code" value={assignment.role_code} mono />
                      <InfoRow
                        label="POS PIN"
                        value={assignment.has_pin ? "Available" : "Not set"}
                      />
                      <InfoRow
                        label="Employment Type"
                        value={assignment.employment_type || "-"}
                      />
                      <InfoRow
                        label="Hourly Rate"
                        value={
                          assignment.hourly_rate !== null && assignment.hourly_rate !== undefined
                            ? `$${Number(assignment.hourly_rate).toFixed(2)}`
                            : "-"
                        }
                      />
                      <InfoRow label="Assigned At" value={formatDate(assignment.assigned_at)} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </BottomSheetBody>

        <BottomSheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>

    </BottomSheet>

    <EditStaffProfileDialog
      open={editProfileOpen}
      onOpenChange={setEditProfileOpen}
      merchantId={merchantId}
      staff={staff}
    />
    <EditStaffLocationsDialog
      open={editLocationsOpen}
      onOpenChange={setEditLocationsOpen}
      merchantId={merchantId}
      staff={staff}
    />
    </>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-background/50 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-sm font-medium", mono && "font-mono text-xs")}>{value}</p>
    </div>
  );
}

function StatusPill({
  label,
  active,
  activeLabel,
  inactiveLabel,
}: {
  label: string;
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-background/50 px-4 py-3">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm font-medium">{active ? activeLabel : inactiveLabel}</p>
      </div>
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>
        {active ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
      </div>
    </div>
  );
}
