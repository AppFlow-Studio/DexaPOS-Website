"use client";

import * as React from "react";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
} from "@/components/ui/bottom-sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { normalizePhone, formatPhoneForDisplay } from "@/lib/phone";
import { UnifiedStaffMember, EmploymentType } from "@/types/staff";
import { RolesModel } from "@/types/db-modles";
import { cn } from "@/lib/utils";
import {
  Eye,
  EyeOff,
  Mail,
  Phone,
  MapPin,
  Lock,
  CheckCircle2,
  UserX,
  UserCheck,
  KeyRound,
  Activity,
  Edit,
  Save,
  X,
  DollarSign,
  ArrowUpCircle,
  Loader2,
  ChevronRight,
  Shield,
  Star,
} from "lucide-react";
import { CredentialToast } from "@/components/ui/credential-toast";
import { LocationAssignmentSheet } from "./LocationAssignmentSheet";
import {
  useDeactivateStaff,
  useReactivateStaff,
  useResetStaffPIN,
  useResetStaffPassword,
  useUpdateStaffAssignment,
  useUpgradePOSToClerk,
  useDemoteClerkToPOS,
  useStaffMember,
  useUpdateStaffProfile,
  useAddStaffToLocation,
  useRemoveStaffFromLocation,
  useSetPrimaryLocation,
} from "@/app/dashboard/hooks/useStaff";
import { toast } from "sonner";
import { GetMerchantRoles } from "@/app/dashboard/actions/staff-invite";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { StaffActivityLog } from "./StaffActivityLog";
import { StaffPinField } from "./StaffPinField";
import { useLocationStore } from "@/stores/location-store";

interface StaffDetailSheetProps {
  staff: UnifiedStaffMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StaffDetailSheet({
  staff,
  open,
  onOpenChange,
}: StaffDetailSheetProps) {
  // Ã¢â€â‚¬Ã¢â€â‚¬ All hooks MUST be called before any conditional return Ã¢â€â‚¬Ã¢â€â‚¬
  const deactivateStaff = useDeactivateStaff();
  const reactivateStaff = useReactivateStaff();
  const resetPIN = useResetStaffPIN();
  const resetPassword = useResetStaffPassword();
  const updateAssignment = useUpdateStaffAssignment();
  const upgradePOSToClerk = useUpgradePOSToClerk();
  const demoteClerkToPOS = useDemoteClerkToPOS();
  const updateProfile = useUpdateStaffProfile();
  const addToLocation = useAddStaffToLocation();
  const removeFromLocation = useRemoveStaffFromLocation();
  const setPrimary = useSetPrimaryLocation();
  const { data: userInfo } = useUserInfo();
  const { locations: allLocations } = useLocationStore();

  // Fetch fresh staff data
  const { data: freshStaff } = useStaffMember(staff?.member_id);

  // Edit mode state
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [editedRole, setEditedRole] = React.useState<string>("");
  const [editedEmploymentType, setEditedEmploymentType] =
    React.useState<EmploymentType | null>(null);
  const [editedHourlyRate, setEditedHourlyRate] = React.useState<string>("");
  const [roles, setRoles] = React.useState<RolesModel[]>([]);

  // Profile edit state
  const [isProfileEditMode, setIsProfileEditMode] = React.useState(false);
  const [editedFirstName, setEditedFirstName] = React.useState("");
  const [editedLastName, setEditedLastName] = React.useState("");
  const [editedEmail, setEditedEmail] = React.useState("");
  const [editedPhone, setEditedPhone] = React.useState("");

  // Location management state
  const [showAddLocation, setShowAddLocation] = React.useState(false);
  const [addLocationId, setAddLocationId] = React.useState<string>("");
  const [addLocationRole, setAddLocationRole] = React.useState<string>("");

  // Upgrade mode state
  const [showUpgradeDialog, setShowUpgradeDialog] = React.useState(false);
  const [upgradeEmail, setUpgradeEmail] = React.useState<string>("");

  // Custom PIN state
  const [customPinInput, setCustomPinInput] = React.useState("");
  const [showCustomPin, setShowCustomPin] = React.useState(false);

  // Password reset state (Clerk users only)
  const [generatedPassword, setGeneratedPassword] = React.useState<string | null>(null);
  const [customPasswordInput, setCustomPasswordInput] = React.useState("");
  const [showCustomPassword, setShowCustomPassword] = React.useState(false);
  const [showPasswordValue, setShowPasswordValue] = React.useState(false);

  // Location assignment sheet state
  const [selectedAssignmentLocationId, setSelectedAssignmentLocationId] =
    React.useState<string | null>(null);
  const [isLocationSheetOpen, setIsLocationSheetOpen] = React.useState(false);

  // Use fresh data if available, otherwise fallback to prop
  const displayStaff = freshStaff || staff;

  // Derived selected assignment - SINGLE SOURCE OF TRUTH
  const selectedAssignment = React.useMemo(
    () =>
      displayStaff?.location_assignments?.find(
        (a) => a.location_id === selectedAssignmentLocationId
      ) || null,
    [displayStaff?.location_assignments, selectedAssignmentLocationId]
  );

  const initials = `${displayStaff?.first_name?.[0] || ""}${
    displayStaff?.last_name?.[0] || ""
  }`.toUpperCase();

  const activeLocations = displayStaff?.location_assignments?.filter(
    (a) => a.is_active
  ) ?? [];
  const primaryLocation = displayStaff?.location_assignments?.find(
    (a) => a.is_primary
  );
  const hasPin = displayStaff?.location_assignments?.some((a) => a.has_pin) ?? false;
  const primaryPin = primaryLocation?.pin_code || null;

  // Get current user's role level for filtering assignable roles
  const currentUserLevel = React.useMemo(() => {
    if (!userInfo?.members?.[0]) return 100;
    const member = userInfo.members[0];
    const roleCode = member.role_code || member.role;
    const role = roles.find((r) => r.code === roleCode);
    return role?.level || 100;
  }, [userInfo, roles]);

  // Load roles when edit mode is enabled
  React.useEffect(() => {
    if (open && (isEditMode || showAddLocation)) {
      GetMerchantRoles().then((rolesData) => {
        setRoles(rolesData);
      });
    }
  }, [open, isEditMode, showAddLocation]);

  // Reset edit state when staff changes
  React.useEffect(() => {
    if (staff && primaryLocation) {
      setEditedRole(primaryLocation.role_code);
      setEditedEmploymentType(
        primaryLocation.employment_type as EmploymentType | null
      );
      setEditedHourlyRate(primaryLocation.hourly_rate?.toString() || "");
    }
    setIsEditMode(false);
    // Reset profile edit state
    if (staff) {
      setEditedFirstName(staff.first_name);
      setEditedLastName(staff.last_name);
      setEditedEmail(staff.email || "");
      setEditedPhone(staff.phone || "");
    }
    setIsProfileEditMode(false);
    setShowAddLocation(false);
  }, [staff?.member_id]);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Location management derived values Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const assignedLocationIds = (displayStaff?.location_assignments ?? [])
    .filter((a) => a.is_active)
    .map((a) => a.location_id);

  const availableLocationsToAdd = allLocations.filter(
    (loc) => !assignedLocationIds.includes(loc.id)
  );

  // Early return AFTER all hooks (React Rules of Hooks)
  if (!staff || !displayStaff) return null;

  // Ã¢â€â‚¬Ã¢â€â‚¬ Handler functions (safe to use after early return) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  const handleStatusToggle = () => {
    if (!primaryLocation) {
      toast.error("No primary location found");
      return;
    }

    if (staff.overall_is_active) {
      deactivateStaff.mutate({
        memberId: staff.member_id,
        locationId: primaryLocation.location_id,
      });
    } else {
      reactivateStaff.mutate({
        memberId: staff.member_id,
        locationId: primaryLocation.location_id,
      });
    }
  };

  const handleResetPIN = () => {
    if (!primaryLocation) {
      toast.error("No primary location found");
      return;
    }
    if (!hasPin) {
      toast.info("This staff member does not have POS access yet");
      return;
    }

    resetPIN.mutate({
      memberId: staff.member_id,
      locationId: primaryLocation.location_id,
    });
  };

  const handleSetCustomPin = () => {
    if (!primaryLocation) {
      toast.error("No primary location found");
      return;
    }
    if (!/^\d{4,6}$/.test(customPinInput)) {
      toast.error("PIN must be 4–6 digits");
      return;
    }
    resetPIN.mutate(
      { memberId: staff.member_id, locationId: primaryLocation.location_id, newPin: customPinInput },
      {
        onSuccess: (result) => {
          if (result.error) { toast.error(result.error); return; }
          setShowCustomPin(false);
          setCustomPinInput("");
          const pin = result.data?.pin;
          if (pin) {
            toast.custom(
              (t) => React.createElement(CredentialToast, { pin, duration: 15, onDismiss: () => toast.dismiss(t) }),
              { duration: 15000, position: "top-center" }
            );
          }
        },
      }
    );
  };

  const handleResetPassword = (custom?: string) => {
    resetPassword.mutate(
      { memberId: staff.member_id, customPassword: custom || undefined },
      {
        onSuccess: (result) => {
          if (result.error) { toast.error(result.error); return; }
          const pw = result.data?.password;
          if (pw) {
            setGeneratedPassword(pw);
            setShowCustomPassword(false);
            setCustomPasswordInput("");
            toast.custom(
              (t) => React.createElement(CredentialToast, { password: pw, duration: 15, onDismiss: () => toast.dismiss(t) }),
              { duration: 15000, position: "top-center" }
            );
          }
        },
      }
    );
  };

  const handleSaveChanges = () => {
    if (!primaryLocation) {
      toast.error("No primary location found");
      return;
    }

    const updates: any = {};

    if (editedRole !== primaryLocation.role_code) {
      updates.role_code = editedRole;
    }
    if (editedEmploymentType !== primaryLocation.employment_type) {
      updates.employment_type = editedEmploymentType;
    }
    const newRate = editedHourlyRate ? parseFloat(editedHourlyRate) : null;
    if (newRate !== primaryLocation.hourly_rate) {
      updates.hourly_rate = newRate;
    }

    if (Object.keys(updates).length === 0) {
      setIsEditMode(false);
      toast.info("No changes to save");
      return;
    }

    updateAssignment.mutate(
      {
        memberId: staff.member_id,
        locationId: primaryLocation.location_id,
        updates,
      },
      {
        onSuccess: () => {
          setIsEditMode(false);
          toast.success("Assignment updated successfully");
        },
      }
    );
  };

  const handleCancelEdit = () => {
    if (primaryLocation) {
      setEditedRole(primaryLocation.role_code);
      setEditedEmploymentType(
        primaryLocation.employment_type as EmploymentType | null
      );
      setEditedHourlyRate(primaryLocation.hourly_rate?.toString() || "");
    }
    setIsEditMode(false);
  };

  const handleUpgradeToClerk = () => {
    if (!primaryLocation) {
      toast.error("No primary location found");
      return;
    }

    if (!upgradeEmail || !upgradeEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    upgradePOSToClerk.mutate(
      {
        memberId: staff.member_id,
        locationId: primaryLocation.location_id,
        email: upgradeEmail,
      },
      {
        onSuccess: () => {
          setShowUpgradeDialog(false);
          setUpgradeEmail("");
        },
      }
    );
  };

  const handleCancelUpgrade = () => {
    setShowUpgradeDialog(false);
    setUpgradeEmail("");
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬ Profile edit handlers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const handleSaveProfile = () => {
    const updates: Record<string, string | null> = {};
    if (editedFirstName !== staff.first_name)
      updates.first_name = editedFirstName;
    if (editedLastName !== staff.last_name) updates.last_name = editedLastName;
    if ((editedEmail || null) !== (staff.email || null))
      updates.email = editedEmail || null;
    if ((editedPhone || null) !== (staff.phone || null))
      updates.phone = normalizePhone(editedPhone) ?? editedPhone || null;

    if (Object.keys(updates).length === 0) {
      setIsProfileEditMode(false);
      toast.info("No changes to save");
      return;
    }

    updateProfile.mutate(
      { memberId: staff.member_id, updates },
      {
        onSuccess: (result) => {
          if (!result.error) setIsProfileEditMode(false);
        },
      }
    );
  };

  const handleCancelProfileEdit = () => {
    setEditedFirstName(staff.first_name);
    setEditedLastName(staff.last_name);
    setEditedEmail(staff.email || "");
    setEditedPhone(staff.phone || "");
    setIsProfileEditMode(false);
  };

  const handleAddToLocation = () => {
    if (!addLocationId || !addLocationRole) {
      toast.error("Select a location and role");
      return;
    }
    addToLocation.mutate(
      {
        memberId: staff.member_id,
        locationId: addLocationId,
        roleCode: addLocationRole,
      },
      {
        onSuccess: (result) => {
          if (!result.error) {
            setShowAddLocation(false);
            setAddLocationId("");
            setAddLocationRole("");
          }
        },
      }
    );
  };

  const handleRemoveFromLocation = (locationId: string) => {
    removeFromLocation.mutate({
      memberId: staff.member_id,
      locationId,
    });
  };

  const handleSetPrimary = (locationId: string) => {
    setPrimary.mutate({
      memberId: staff.member_id,
      locationId,
    });
  };


  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="mx-auto w-full max-w-6xl" height="95">
        <BottomSheetHeader className="flex flex-col gap-2">
          <BottomSheetTitle>Staff details</BottomSheetTitle>
          <BottomSheetDescription>
            View and manage this team member's access, locations, and POS
            settings.
          </BottomSheetDescription>
        </BottomSheetHeader>
        <BottomSheetBody className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-1">
            <section className="rounded-2xl border bg-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage
                      src={displayStaff.avatar_url || undefined}
                      alt={displayStaff.display_name}
                    />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">
                        {displayStaff.first_name} {displayStaff.last_name}
                      </h2>
                      {staff.is_clerk_user ? (
                        <Badge variant="secondary" className="gap-1">
                          <Shield className="h-3 w-3" />
                          Dashboard User
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <Lock className="h-3 w-3" />
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
                        <span>{displayStaff.email || "No email"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span>{displayStaff.phone ? formatPhoneForDisplay(displayStaff.phone) : "No phone"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span>{displayStaff.total_locations} assigned location(s)</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant={isProfileEditMode ? "secondary" : "outline"}
                    className="gap-2"
                    onClick={() =>
                      isProfileEditMode
                        ? handleCancelProfileEdit()
                        : setIsProfileEditMode(true)
                    }
                  >
                    {isProfileEditMode ? (
                      <>
                        <X className="h-4 w-4" />
                        Cancel Editing
                      </>
                    ) : (
                      <>
                        <Edit className="h-4 w-4" />
                        Edit Profile
                      </>
                    )}
                  </Button>

                  <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Status</p>
                      <p className="text-xs text-muted-foreground">
                        Toggle staff access for the primary location.
                      </p>
                    </div>
                    <Switch
                      checked={staff.overall_is_active}
                      onCheckedChange={handleStatusToggle}
                      disabled={
                        !primaryLocation ||
                        deactivateStaff.isPending ||
                        reactivateStaff.isPending
                      }
                    />
                  </div>
                </div>
              </div>

              {isProfileEditMode && (
                <div className="mt-5 rounded-2xl border bg-background/60 p-4">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Edit Profile
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Update profile information without changing assignment or
                      access details.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        First Name
                      </Label>
                      <Input
                        value={editedFirstName}
                        onChange={(e) => setEditedFirstName(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        Last Name
                      </Label>
                      <Input
                        value={editedLastName}
                        onChange={(e) => setEditedLastName(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        Email
                      </Label>
                      <Input
                        type="email"
                        value={editedEmail}
                        onChange={(e) => setEditedEmail(e.target.value)}
                        className="h-10"
                        placeholder="user@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        Phone
                      </Label>
                      <PhoneInput
                        value={editedPhone}
                        onChange={setEditedPhone}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      className="gap-2"
                      onClick={handleSaveProfile}
                      disabled={updateProfile.isPending}
                    >
                      {updateProfile.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save Profile
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCancelProfileEdit}
                      disabled={updateProfile.isPending}
                    >
                      Cancel
                    </Button>
                  </div>

                  {staff.is_clerk_user && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Name changes will sync to the authentication provider.
                    </p>
                  )}
                </div>
              )}
            </section>
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <section className="rounded-2xl border bg-card p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Primary Assignment
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Merchant role, employment, and primary-location settings.
                    </p>
                  </div>
                  {primaryLocation && !isEditMode && (
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => setIsEditMode(true)}
                    >
                      <Edit className="h-4 w-4" />
                      Edit Assignment
                    </Button>
                  )}
                </div>

                {primaryLocation ? (
                  <div className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                          Role
                        </Label>
                        {isEditMode ? (
                          <Select value={editedRole} onValueChange={setEditedRole}>
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roles
                                .filter((r) => r.level <= currentUserLevel)
                                .map((role) => (
                                  <SelectItem key={role.code} value={role.code}>
                                    <div className="flex items-center gap-2">
                                      <span>{role.name}</span>
                                      <Badge variant="outline" className="text-[10px]">
                                        {role.code}
                                      </Badge>
                                    </div>
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="rounded-xl border bg-background/50 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono">{primaryLocation.role_code}</Badge>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                          Primary Location
                        </Label>
                        <div className="rounded-xl border bg-background/50 px-4 py-3">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            {primaryLocation.location_name}
                          </div>
                        </div>
                      </div>

                      {!staff.is_clerk_user && (
                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                            Employment Type
                          </Label>
                          {isEditMode ? (
                            <Select
                              value={editedEmploymentType || undefined}
                              onValueChange={(value) =>
                                setEditedEmploymentType(value as EmploymentType)
                              }
                            >
                              <SelectTrigger className="h-10">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="full-time">Full-time</SelectItem>
                                <SelectItem value="part-time">Part-time</SelectItem>
                                <SelectItem value="contractor">Contractor</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="rounded-xl border bg-background/50 px-4 py-3 text-sm">
                              {primaryLocation.employment_type ? (
                                <Badge variant="outline" className="capitalize">
                                  {primaryLocation.employment_type.replace("-", " ")}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">Not set</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {!staff.is_clerk_user && (
                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                            Hourly Rate
                          </Label>
                          {isEditMode ? (
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={editedHourlyRate}
                                onChange={(e) => setEditedHourlyRate(e.target.value)}
                                className="h-10 pl-9"
                              />
                            </div>
                          ) : (
                            <div className="rounded-xl border bg-background/50 px-4 py-3 text-sm">
                              {primaryLocation.hourly_rate !== null &&
                              primaryLocation.hourly_rate !== undefined ? (
                                `$${primaryLocation.hourly_rate.toFixed(2)}/hour`
                              ) : (
                                <span className="text-muted-foreground">Not set</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {isEditMode && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="gap-2"
                          onClick={handleSaveChanges}
                          disabled={updateAssignment.isPending}
                        >
                          {updateAssignment.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Save Changes
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleCancelEdit}
                          disabled={updateAssignment.isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}

                    <Separator />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoRow label="Member ID" value={displayStaff.member_id} mono />
                      <InfoRow
                        label="Staff Profile ID"
                        value={displayStaff.staff_profile_id || "-"}
                        mono
                      />
                      <InfoRow
                        label="Account Type"
                        value={staff.is_clerk_user ? "Dashboard user" : "POS only"}
                      />
                      <InfoRow
                        label="Primary Assignment Status"
                        value={primaryLocation.is_active ? "Active" : "Inactive"}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    No primary location is assigned to this staff member yet.
                  </div>
                )}
              </section>

              <div className="space-y-6">
                <section className="rounded-2xl border bg-card p-5">
                  <div className="mb-4 flex items-start gap-2">
                    <KeyRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        POS Access
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        PIN-based login at assigned locations.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <StaffPinField
                      pin={primaryPin}
                      hasPin={Boolean(primaryLocation?.has_pin)}
                      onGenerate={handleResetPIN}
                      isGenerating={resetPIN.isPending}
                      disabled={!primaryLocation}
                      buttonLabel={
                        primaryLocation?.has_pin ? "Generate New PIN" : "Generate PIN"
                      }
                      visibleDescription={
                        primaryLocation
                          ? `Primary location: ${primaryLocation.location_name}`
                          : undefined
                      }
                    />

                    {/* Custom PIN input */}
                    {primaryLocation && (
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
                              disabled={resetPIN.isPending || customPinInput.length < 4}
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
                        active={hasPin}
                        activeLabel="PIN set"
                        inactiveLabel="No PIN"
                      />
                      <StatusPill
                        label="Overall Status"
                        active={staff.overall_is_active}
                        activeLabel="Active"
                        inactiveLabel="Inactive"
                      />
                    </div>
                  </div>
                </section>

                {/* Dashboard Password — Clerk users only */}
                {staff.is_clerk_user && (
                  <section className="rounded-2xl border bg-card p-5">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Dashboard Password
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Reset the password used to log in to the web dashboard.
                      </p>
                    </div>
                    <div className="space-y-4">
                      {generatedPassword && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">New Password</Label>
                          <div className="relative">
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
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResetPassword()}
                          disabled={resetPassword.isPending}
                        >
                          <Lock className="h-3.5 w-3.5 mr-1.5" />
                          {resetPassword.isPending ? "Resetting…" : "Reset Password"}
                        </Button>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => { setShowCustomPassword((v) => !v); setCustomPasswordInput(""); }}
                        >
                          {showCustomPassword ? "Cancel" : "Set custom password"}
                        </button>
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
                            disabled={resetPassword.isPending || customPasswordInput.length < 8}
                          >
                            Set
                          </Button>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {!staff.is_clerk_user && (
                  <section className="rounded-2xl border bg-card p-5">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Upgrade To Dashboard User
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Grant this staff member access to the web dashboard.
                      </p>
                    </div>

                    {!showUpgradeDialog ? (
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => setShowUpgradeDialog(true)}
                        disabled={!primaryLocation}
                      >
                        <ArrowUpCircle className="h-4 w-4" />
                        Upgrade Account
                      </Button>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label
                            htmlFor="upgrade-email"
                            className="text-xs uppercase tracking-[0.14em] text-muted-foreground"
                          >
                            Email Address
                          </Label>
                          <Input
                            id="upgrade-email"
                            type="email"
                            placeholder="user@example.com"
                            value={upgradeEmail}
                            onChange={(e) => setUpgradeEmail(e.target.value)}
                            className="h-10"
                          />
                          <p className="text-xs text-muted-foreground">
                            A temporary password will be generated and displayed.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            className="gap-2"
                            onClick={handleUpgradeToClerk}
                            disabled={upgradePOSToClerk.isPending || !upgradeEmail}
                          >
                            {upgradePOSToClerk.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowUpCircle className="h-4 w-4" />
                            )}
                            Confirm Upgrade
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleCancelUpgrade}
                            disabled={upgradePOSToClerk.isPending}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {staff.is_clerk_user && staff.user_id && (
                  <section className="rounded-2xl border border-orange-200 bg-orange-50/40 p-5 dark:bg-orange-950/10">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-700 dark:text-orange-300">
                        Demote To POS-Only
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Revoke dashboard access while keeping POS PIN access.
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full gap-2 border-orange-300 text-orange-700 hover:bg-orange-100 dark:hover:bg-orange-950/20"
                      onClick={() => {
                        if (
                          confirm(
                            `Demote ${displayStaff.display_name} to POS-only? This will revoke their dashboard access.`
                          )
                        ) {
                          demoteClerkToPOS.mutate(staff.member_id);
                        }
                      }}
                      disabled={demoteClerkToPOS.isPending}
                    >
                      {demoteClerkToPOS.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Shield className="h-4 w-4" />
                      )}
                      Demote Account
                    </Button>
                  </section>
                )}
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <section className="rounded-2xl border bg-card p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Location Assignments
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Click a location to manage role, status, and PIN.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{activeLocations.length} active</Badge>
                    {availableLocationsToAdd.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          setShowAddLocation(!showAddLocation);
                          if (primaryLocation) {
                            setAddLocationRole(primaryLocation.role_code);
                          }
                        }}
                      >
                        {showAddLocation ? "Hide Add Form" : "Add Location"}
                      </Button>
                    )}
                  </div>
                </div>

                {showAddLocation && (
                  <div className="mb-4 rounded-2xl border bg-background/60 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                          Location
                        </Label>
                        <Select value={addLocationId} onValueChange={setAddLocationId}>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableLocationsToAdd.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id}>
                                {loc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                          Role
                        </Label>
                        <Select value={addLocationRole} onValueChange={setAddLocationRole}>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {roles
                              .filter((r) => r.level <= currentUserLevel)
                              .map((r) => (
                                <SelectItem key={r.code} value={r.code}>
                                  {r.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        onClick={handleAddToLocation}
                        disabled={
                          addToLocation.isPending || !addLocationId || !addLocationRole
                        }
                      >
                        {addToLocation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Add To Location
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowAddLocation(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {displayStaff.location_assignments.map((assignment) => (
                    <button
                      key={assignment.location_id + assignment.role_code}
                      type="button"
                      className={cn(
                        "w-full rounded-xl border bg-background/60 p-4 text-left transition-colors hover:bg-muted/40",
                        !assignment.is_active && "opacity-70"
                      )}
                      onClick={() => {
                        setSelectedAssignmentLocationId(assignment.location_id);
                        setIsLocationSheetOpen(true);
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{assignment.location_name}</p>
                            {assignment.is_primary && <Badge>Primary</Badge>}
                            {!assignment.is_active && (
                              <Badge variant="outline">Inactive</Badge>
                            )}
                            {assignment.has_pin && (
                              <Badge variant="secondary" className="gap-1">
                                <Lock className="h-3 w-3" />
                                PIN
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-sm font-mono text-muted-foreground">
                            {assignment.role_code}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {assignment.is_active && !assignment.is_primary && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetPrimary(assignment.location_id);
                              }}
                              disabled={setPrimary.isPending}
                              title="Set as primary location"
                            >
                              {setPrimary.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Star className="h-4 w-4" />
                              )}
                              <span className="hidden sm:inline">Set primary</span>
                            </Button>
                          )}
                          {assignment.is_active && !assignment.is_primary && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFromLocation(assignment.location_id);
                              }}
                              disabled={removeFromLocation.isPending}
                              title="Remove from location"
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          )}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <InfoRow label="Role Code" value={assignment.role_code} mono />
                        <InfoRow
                          label="Employment Type"
                          value={assignment.employment_type || "-"}
                        />
                        <InfoRow
                          label="Hourly Rate"
                          value={
                            assignment.hourly_rate !== null &&
                            assignment.hourly_rate !== undefined
                              ? `$${Number(assignment.hourly_rate).toFixed(2)}`
                              : "-"
                          }
                        />
                        <InfoRow
                          label="Assigned At"
                          value={
                            assignment.assigned_at
                              ? new Date(assignment.assigned_at).toLocaleString(
                                  "en-US",
                                  {
                                    month: "long",
                                    day: "numeric",
                                    year: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                    hour12: true,
                                  }
                                )
                              : "-"
                          }
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border bg-card">
                <div className="border-b p-5">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Activity Log
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Recent actions for this staff member.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="min-h-[420px] bg-muted/5">
                  <StaffActivityLog
                    staffProfileId={displayStaff.staff_profile_id}
                    userId={displayStaff.user_id}
                  />
                </div>
              </section>
            </div>

            {selectedAssignment && (
              <LocationAssignmentSheet
                open={isLocationSheetOpen}
                onOpenChange={setIsLocationSheetOpen}
                memberId={displayStaff.member_id}
                memberName={`${displayStaff.first_name} ${displayStaff.last_name}`}
                isClerkUser={displayStaff.is_clerk_user}
                assignment={selectedAssignment}
                currentUserRoleLevel={currentUserLevel}
              />
            )}
          </div>
        </BottomSheetBody>
        <BottomSheetFooter>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Member ID: {displayStaff.member_id}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {staff.overall_is_active ? (
                <Button
                  variant="destructive"
                  className="gap-2"
                  onClick={handleStatusToggle}
                  disabled={!primaryLocation}
                >
                  <UserX className="h-4 w-4" />
                  Deactivate
                </Button>
              ) : (
                <Button
                  className="gap-2"
                  onClick={handleStatusToggle}
                  disabled={!primaryLocation}
                >
                  <UserCheck className="h-4 w-4" />
                  Reactivate
                </Button>
              )}
            </div>
          </div>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
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
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-medium break-words", mono && "font-mono text-xs")}>
        {value}
      </p>
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
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-sm font-medium">
          {active ? activeLabel : inactiveLabel}
        </p>
      </div>
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full",
          active
            ? "bg-green-100 text-green-700"
            : "bg-muted text-muted-foreground"
        )}
      >
        {active ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Activity className="h-4 w-4" />
        )}
      </div>
    </div>
  );
}
