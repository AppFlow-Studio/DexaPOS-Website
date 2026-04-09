"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  User,
  Mail,
  Shield,
  MapPin,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Users,
  Building2,
  Lock,
  DollarSign,
  UserCheck,
  Briefcase,
  Info,
} from "lucide-react";
import { GetMerchantRoles } from "@/app/dashboard/actions/staff-invite";
import { RolesModel, LocationsModel } from "@/types/db-modles";
import { useLocations } from "@/app/dashboard/hooks/useLocations";
import {
  useCreatePOSStaff,
  useInviteClerkStaff,
  useCreateClerkUserDirectly,
} from "@/app/dashboard/hooks/useStaff";
import { InviteStaffFormData, StaffType, EmploymentType } from "@/types/staff";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";

interface InviteUserWizardProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
  children?: React.ReactNode;
}

type Step = "type" | "details" | "role" | "locations" | "pos_config" | "review";

const CLERK_STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "type", label: "Staff type", icon: <UserCheck className="h-4 w-4" /> },
  { key: "details", label: "Details", icon: <User className="h-4 w-4" /> },
  { key: "role", label: "Role", icon: <Shield className="h-4 w-4" /> },
  {
    key: "locations",
    label: "Locations",
    icon: <MapPin className="h-4 w-4" />,
  },
  { key: "pos_config", label: "POS Setup", icon: <Lock className="h-4 w-4" /> },
  {
    key: "review",
    label: "Review",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
];

const POS_STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "type", label: "Staff type", icon: <UserCheck className="h-4 w-4" /> },
  { key: "details", label: "Details", icon: <User className="h-4 w-4" /> },
  { key: "role", label: "Role", icon: <Shield className="h-4 w-4" /> },
  {
    key: "locations",
    label: "Locations",
    icon: <MapPin className="h-4 w-4" />,
  },
  { key: "pos_config", label: "POS Setup", icon: <Lock className="h-4 w-4" /> },
  {
    key: "review",
    label: "Review",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
];

export function InviteUserWizard({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onSuccess,
  children,
}: InviteUserWizardProps) {
  const clerkOrgId = useClerkOrgId();
  const { data: userInfo } = useUserInfo();
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const onOpenChange = controlledOnOpenChange || setInternalOpen;

  const [currentStep, setCurrentStep] = React.useState<Step>("type");
  const [isLoading, setIsLoading] = React.useState(false);
  const [roles, setRoles] = React.useState<RolesModel[]>([]);
  const { data: locationsData } = useLocations(clerkOrgId, userInfo?.id || "");
  const locations = locationsData || [];

  // Get current user's role and level for filtering
  const currentUserRole = React.useMemo(() => {
    if (!userInfo?.members?.[0]) return null;
    const member = userInfo.members[0];
    // Find the role code from the member's organization
    const roleCode = member.role_code || member.role;
    return roles.find((r) => r.code === roleCode);
  }, [userInfo, roles]);

  const currentUserLevel = currentUserRole?.level || 0;

  // Mutations
  const createPOSStaff = useCreatePOSStaff();
  const inviteClerkStaff = useInviteClerkStaff();
  const createClerkUserDirectly = useCreateClerkUserDirectly();

  // Form state - matching InviteStaffFormData interface
  const [staffType, setStaffType] = React.useState<StaffType>("clerk");
  const [creationMethod, setCreationMethod] = React.useState<
    "direct" | "invitation"
  >("direct");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [phoneError, setPhoneError] = React.useState("");
  const [selectedRoleCode, setSelectedRoleCode] = React.useState<string>("");
  const [selectedLocationIds, setSelectedLocationIds] = React.useState<
    Set<string>
  >(new Set());
  const [primaryLocationId, setPrimaryLocationId] = React.useState<
    string | null
  >(null);

  // POS-specific state (for both Clerk and POS staff)
  const [enablePosAccess, setEnablePosAccess] = React.useState(false); // For Clerk accounts
  const [autoGeneratePin, setAutoGeneratePin] = React.useState(true);
  const [pinCode, setPinCode] = React.useState("");
  const [hourlyRate, setHourlyRate] = React.useState<string>("");
  const [employmentType, setEmploymentType] =
    React.useState<EmploymentType | null>(null);

  // Load data
  React.useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const rolesData = await GetMerchantRoles();
      setRoles(rolesData);

      // Auto-select first role if available
      if (rolesData.length > 0 && !selectedRoleCode) {
        setSelectedRoleCode(rolesData[0].code);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load roles");
    } finally {
      setIsLoading(false);
    }
  };

  // Reset form when closing
  React.useEffect(() => {
    if (!open) {
      setCurrentStep("type");
      setStaffType("clerk");
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setPhoneError("");
      setSelectedRoleCode("");
      setSelectedLocationIds(new Set());
      setPrimaryLocationId(null);
      setEnablePosAccess(false);
      setAutoGeneratePin(true);
      setPinCode("");
      setHourlyRate("");
      setEmploymentType(null);
    }
  }, [open]);

  // Determine which steps to show based on staff type
  const STEPS = staffType === "clerk" ? CLERK_STEPS : POS_STEPS;

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  const canGoNext = () => {
    switch (currentStep) {
      case "type":
        return !!staffType;
      case "details":
        // Name is always required
        if (!firstName.trim() || !lastName.trim()) return false;
        // Block if phone has a format error
        if (phoneError) return false;
        // Email is required for Clerk, optional for POS
        if (staffType === "clerk") {
          return email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }
        return true; // POS staff can proceed without email
      case "role":
        return !!selectedRoleCode;
      case "locations":
        return selectedLocationIds.size > 0;
      case "pos_config":
        // For POS staff, PIN is required
        if (staffType === "pos") {
          if (!autoGeneratePin && !pinCode.trim()) return false;
          if (!autoGeneratePin && !/^\d{4}$/.test(pinCode)) return false;
        }
        // For Clerk staff, POS access is optional, but if enabled, PIN validation applies
        if (staffType === "clerk" && enablePosAccess) {
          if (!autoGeneratePin && !pinCode.trim()) return false;
          if (!autoGeneratePin && !/^\d{4}$/.test(pinCode)) return false;
        }
        return true;
      case "review":
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (!canGoNext()) return;

    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentStepIndex + 1].key);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(STEPS[currentStepIndex - 1].key);
    }
  };

  const handleSubmit = async () => {
    const formData: InviteStaffFormData = {
      staff_type: staffType,
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      phone: phone || null,
      role_code: selectedRoleCode,
      location_ids: Array.from(selectedLocationIds),
      primary_location_id: primaryLocationId,
      // For Clerk accounts, only include PIN if POS access is enabled
      auto_generate_pin:
        staffType === "pos"
          ? autoGeneratePin
          : enablePosAccess
            ? autoGeneratePin
            : false,
      pin_code:
        staffType === "pos"
          ? autoGeneratePin
            ? null
            : pinCode
          : enablePosAccess
            ? autoGeneratePin
              ? null
              : pinCode
            : null,
      hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null,
      employment_type: employmentType,
    };

    try {
      if (staffType === "pos") {
        // POS staff - always create directly
        await createPOSStaff.mutateAsync(formData);
      } else {
        // Clerk user - check creation method
        if (creationMethod === "direct") {
          await createClerkUserDirectly.mutateAsync(formData);
        } else {
          await inviteClerkStaff.mutateAsync(formData);
        }
      }

      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      // Error handling is done in the mutation hooks
      console.error("Submit error:", error);
    }
  };

  // Filter roles based on staff type and current user's level
  const filteredRoles = React.useMemo(() => {
    let baseFilteredRoles = [];

    if (staffType === "clerk") {
      // Dashboard users: admin and manager level roles
      baseFilteredRoles = roles.filter(
        (r) => r.level_type === "admin" || r.level_type === "manager",
      );
    } else {
      // POS staff: member level roles
      baseFilteredRoles = roles.filter((r) => r.level_type === "member");
    }

    // Filter by current user's level - can only assign roles with level <= their own
    if (currentUserLevel > 0) {
      baseFilteredRoles = baseFilteredRoles.filter(
        (r) => r.level <= currentUserLevel,
      );
    }

    return baseFilteredRoles;
  }, [roles, staffType, currentUserLevel]);

  // Auto-select first role when staffType changes or filtered roles change
  React.useEffect(() => {
    if (filteredRoles.length > 0) {
      // Only auto-select if current selection is not in filtered list
      const currentRoleInFiltered = filteredRoles.some(
        (r) => r.code === selectedRoleCode,
      );
      if (!currentRoleInFiltered) {
        setSelectedRoleCode(filteredRoles[0].code);
      }
    }
  }, [filteredRoles, staffType]);

  const selectedRole = filteredRoles.find((r) => r.code === selectedRoleCode);
  const isAdminRole = (selectedRole?.level ?? 0) >= 9;

  // Auto-select all locations when an owner/admin role is chosen
  React.useEffect(() => {
    if (isAdminRole && locations.length > 0) {
      setSelectedLocationIds(new Set(locations.map((l) => l.id)));
      if (!primaryLocationId) {
        setPrimaryLocationId(locations[0].id);
      }
    }
  }, [isAdminRole, locations]);

  const selectedLocations = locations.filter((loc) =>
    selectedLocationIds.has(loc.id),
  );

  const toggleLocation = (locationId: string) => {
    setSelectedLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) {
        next.delete(locationId);
        // If removing primary location, clear primary
        if (primaryLocationId === locationId) {
          setPrimaryLocationId(null);
        }
      } else {
        next.add(locationId);
        // If this is the first location, make it primary
        if (next.size === 1) {
          setPrimaryLocationId(locationId);
        }
      }
      return next;
    });
  };

  const setPrimary = (locationId: string) => {
    if (selectedLocationIds.has(locationId)) {
      setPrimaryLocationId(locationId);
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      {children && <BottomSheetTrigger asChild>{children}</BottomSheetTrigger>}
      <BottomSheetContent className="w-full" height="95">
        <div className="flex h-full">
          {/* Left Sidebar - Steps */}
          <div className="w-64 border-r bg-muted/30 p-6 flex flex-col">
            <div className="space-y-1">
              {STEPS.map((step, index) => {
                const isActive = step.key === currentStep;
                const isCompleted = index < currentStepIndex;
                const isAccessible = index <= currentStepIndex;

                return (
                  <div
                    key={step.key}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                      isActive && "bg-primary text-primary-foreground",
                      isCompleted && !isActive && "bg-primary/10 text-primary",
                      !isAccessible && "opacity-50 cursor-not-allowed",
                      isAccessible &&
                      !isActive &&
                      "hover:bg-muted cursor-pointer",
                    )}
                    onClick={() => isAccessible && setCurrentStep(step.key)}
                  >
                    <div
                      className={cn(
                        "flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors",
                        isActive &&
                        "border-primary-foreground bg-primary-foreground text-primary",
                        isCompleted &&
                        !isActive &&
                        "border-primary bg-primary text-primary-foreground",
                        !isActive &&
                        !isCompleted &&
                        "border-muted-foreground/30",
                      )}
                    >
                      {isCompleted && !isActive ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <span className="text-xs font-medium">{index + 1}</span>
                      )}
                    </div>
                    <span className="text-sm font-medium">{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <BottomSheetHeader className="border-b">
              <BottomSheetTitle>
                {currentStep === "type" && "Choose staff type"}
                {currentStep === "details" &&
                  `Add ${staffType === "clerk" ? "dashboard user" : "POS staff"}`}
                {currentStep === "role" &&
                  `Assign ${firstName || "user"} a role`}
                {currentStep === "locations" && "Assign to locations"}
                {currentStep === "pos_config" && "POS configuration"}
                {currentStep === "review" &&
                  `Review and ${staffType === "clerk" ? "send invite" : "create staff"}`}
              </BottomSheetTitle>
              <BottomSheetDescription>
                {currentStep === "type" &&
                  "Select whether this person needs dashboard access or POS-only access."}
                {currentStep === "details" &&
                  "Enter the basic information for the new staff member."}
                {currentStep === "role" &&
                  "A team member's role determines what they can see and do."}
                {currentStep === "locations" &&
                  "Select the locations where this team member will have access."}
                {currentStep === "pos_config" &&
                  "Configure PIN and employment details for POS access."}
                {currentStep === "review" &&
                  "Review all details before proceeding."}
              </BottomSheetDescription>
            </BottomSheetHeader>

            <BottomSheetBody className="flex-1 overflow-y-auto max-h-[calc(98vh-200px)]">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  </div>
                </div>
              ) : (
                <div className="py-6 space-y-6">
                  {/* Step 0: Staff Type Selection */}
                  {currentStep === "type" && (
                    <div className="space-y-4">
                      <div className="text-sm text-muted-foreground">
                        Choose the type of access this person needs.
                      </div>
                      <RadioGroup
                        value={staffType}
                        onValueChange={(value) =>
                          setStaffType(value as StaffType)
                        }
                      >
                        <div className="space-y-3">
                          {/* Clerk Staff Option */}
                          <div
                            className={cn(
                              "flex items-start gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer",
                              staffType === "clerk"
                                ? "border-primary bg-primary/5"
                                : "border-muted hover:border-primary/50",
                            )}
                            onClick={() => setStaffType("clerk")}
                          >
                            <RadioGroupItem
                              value="clerk"
                              id="type-clerk"
                              className="mt-1"
                            />
                            <label
                              htmlFor="type-clerk"
                              className="flex-1 cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                <span className="font-medium">
                                  Dashboard User
                                </span>
                                {/* <Badge variant="outline" className="text-xs">Recommended</Badge> */}
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                Full access to dashboard with email invitation.
                                Can manage settings, view reports, and use POS.
                              </div>
                            </label>
                          </div>

                          {/* POS Staff Option */}
                          <div
                            className={cn(
                              "flex items-start gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer",
                              staffType === "pos"
                                ? "border-primary bg-primary/5"
                                : "border-muted hover:border-primary/50",
                            )}
                            onClick={() => setStaffType("pos")}
                          >
                            <RadioGroupItem
                              value="pos"
                              id="type-pos"
                              className="mt-1"
                            />
                            <label
                              htmlFor="type-pos"
                              className="flex-1 cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <Lock className="h-4 w-4" />
                                <span className="font-medium">
                                  POS Staff Only
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                PIN-based access to POS only. No email or
                                dashboard access. Perfect for cashiers and shift
                                workers.
                              </div>
                            </label>
                          </div>
                        </div>
                      </RadioGroup>
                    </div>
                  )}

                  {/* Step 1: Details */}
                  {currentStep === "details" && (
                    <div className="space-y-6">
                      {/* Creation Method Selection - Only for Clerk users */}
                      {staffType === "clerk" && (
                        <>
                          <div className="space-y-4">
                            <Label>Account Creation Method</Label>
                            <RadioGroup
                              value={creationMethod}
                              onValueChange={(value) =>
                                setCreationMethod(
                                  value as "direct" | "invitation",
                                )
                              }
                            >
                              <div className="space-y-3">
                                {/* Direct Creation Option */}
                                <div
                                  className={cn(
                                    "flex items-start gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer",
                                    creationMethod === "direct"
                                      ? "border-primary bg-primary/5"
                                      : "border-muted hover:border-primary/50",
                                  )}
                                  onClick={() => setCreationMethod("direct")}
                                >
                                  <RadioGroupItem
                                    value="direct"
                                    id="method-direct"
                                    className="mt-1"
                                  />
                                  <label
                                    htmlFor="method-direct"
                                    className="flex-1 cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2">
                                      <UserCheck className="h-4 w-4" />
                                      <span className="font-medium">
                                        Create Account Immediately
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        Recommended
                                      </Badge>
                                    </div>
                                    <div className="text-sm text-muted-foreground mt-1">
                                      Create account with password now. User can
                                      login immediately and access dashboard
                                      right away.
                                    </div>
                                  </label>
                                </div>

                                {/* Invitation Option */}
                                <div
                                  className={cn(
                                    "flex items-start gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer",
                                    creationMethod === "invitation"
                                      ? "border-primary bg-primary/5"
                                      : "border-muted hover:border-primary/50",
                                  )}
                                  onClick={() =>
                                    setCreationMethod("invitation")
                                  }
                                >
                                  <RadioGroupItem
                                    value="invitation"
                                    id="method-invitation"
                                    className="mt-1"
                                  />
                                  <label
                                    htmlFor="method-invitation"
                                    className="flex-1 cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Mail className="h-4 w-4" />
                                      <span className="font-medium">
                                        Send Email Invitation
                                      </span>
                                    </div>
                                    <div className="text-sm text-muted-foreground mt-1">
                                      Send invitation email. User must accept
                                      and set their own password before
                                      accessing dashboard.
                                    </div>
                                  </label>
                                </div>
                              </div>
                            </RadioGroup>
                          </div>

                          <Separator />
                        </>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First name *</Label>
                          <Input
                            id="firstName"
                            placeholder="John"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last name *</Label>
                          <Input
                            id="lastName"
                            placeholder="Doe"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">
                          Email {staffType === "clerk" && "*"}
                          {staffType === "pos" && (
                            <span className="text-muted-foreground">
                              (optional)
                            </span>
                          )}
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="john.doe@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                        {staffType === "clerk" && (
                          <p className="text-xs text-muted-foreground">
                            An invitation will be sent to this email address.
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">
                          Phone{" "}
                          <span className="text-muted-foreground">
                            (optional)
                          </span>
                        </Label>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="+15551234567"
                          value={phone}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPhone(val);
                            if (val && !/^\+[1-9]\d{7,14}$/.test(val)) {
                              setPhoneError(
                                "Must be E.164 format — start with + and country code, e.g. +15551234567",
                              );
                            } else {
                              setPhoneError("");
                            }
                          }}
                          className={phoneError ? "border-destructive" : ""}
                        />
                        {phoneError ? (
                          <p className="text-xs text-destructive">{phoneError}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Include country code, e.g. +1 for US, +44 for UK
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Step 2: Assign Role */}
                  {/* TODO: Might drop some roles here and keep only 5 Main Ones  */}
                  {currentStep === "role" && (
                    <div className="space-y-4">
                      <div className="text-sm text-muted-foreground">
                        Select a role that matches the permissions this user
                        needs.
                      </div>

                      {/* Role restriction information */}
                      {currentUserLevel > 0 && currentUserRole && (
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <p className="text-xs text-muted-foreground">
                              You can only assign roles up to your permission
                              level{" "}
                              <strong>
                                (Level {currentUserLevel}:{" "}
                                {currentUserRole.name})
                              </strong>
                              . Higher-level roles are filtered from this list.
                            </p>
                          </div>
                        </div>
                      )}

                      <RadioGroup
                        value={selectedRoleCode}
                        onValueChange={setSelectedRoleCode}
                      >
                        <div className="space-y-3">
                          {filteredRoles.map((role) => (
                            <div
                              key={role.code}
                              className={cn(
                                "flex items-start gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer",
                                selectedRoleCode === role.code
                                  ? "border-primary bg-primary/5"
                                  : "border-muted hover:border-primary/50",
                              )}
                              onClick={() => setSelectedRoleCode(role.code)}
                            >
                              <RadioGroupItem
                                value={role.code}
                                id={role.code}
                                className="mt-1"
                              />
                              <label
                                htmlFor={role.code}
                                className="flex-1 cursor-pointer"
                              >
                                <div className="font-medium">
                                  {role.name}{" "}
                                  <Badge variant="outline" className="text-xs">
                                    {role.code}
                                  </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {role.description ||
                                    "No description available"}
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge variant="outline" className="text-xs">
                                    Level {role.level}
                                  </Badge>
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {role.level_type}
                                  </Badge>
                                </div>
                              </label>
                            </div>
                          ))}
                        </div>
                      </RadioGroup>
                    </div>
                  )}

                  {/* Step 3: Assign Locations */}
                  {currentStep === "locations" && (
                    <div className="space-y-4">
                      {isAdminRole ? (
                        /* ── Admin / Owner: auto-assigned, show info banner ── */
                        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                          <div>
                            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                              Auto-assigned to all locations
                            </p>
                            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                              Owners and Admins automatically receive access to
                              all {locations.length} location
                              {locations.length !== 1 ? "s" : ""}. Any new
                              locations added in the future will also be
                              provisioned automatically.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Select one or more locations where this team member
                          will have access.
                        </div>
                      )}
                      <div className="space-y-2">
                        {locations.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            <p>No locations available</p>
                          </div>
                        ) : (
                          locations.map((location) => {
                            const isSelected = selectedLocationIds.has(
                              location.id,
                            );
                            return (
                              <div
                                key={location.id}
                                className={cn(
                                  "flex items-center gap-4 p-4 rounded-lg border-2 transition-all",
                                  isAdminRole
                                    ? "cursor-default border-primary/40 bg-primary/5 opacity-80"
                                    : isSelected
                                      ? "cursor-pointer border-primary bg-primary/5"
                                      : "cursor-pointer border-muted hover:border-primary/50",
                                )}
                                onClick={() =>
                                  !isAdminRole && toggleLocation(location.id)
                                }
                              >
                                <Checkbox
                                  checked={isSelected}
                                  disabled={isAdminRole}
                                  onCheckedChange={() =>
                                    !isAdminRole && toggleLocation(location.id)
                                  }
                                />
                                <div className="flex-1">
                                  <div className="font-medium">
                                    {location.name}
                                  </div>
                                  <div className="text-sm text-muted-foreground mt-1">
                                    {location.address_line1}
                                    {location.address_line2 &&
                                      `, ${location.address_line2}`}
                                    {location.city && `, ${location.city}`}
                                    {location.state && `, ${location.state}`}
                                    {location.postal_code &&
                                      ` ${location.postal_code}`}
                                  </div>
                                </div>
                                {isSelected && (
                                  <div className="flex items-center gap-2">
                                    {primaryLocationId === location.id ? (
                                      <Badge
                                        variant="default"
                                        className="text-xs"
                                      >
                                        Primary
                                      </Badge>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPrimary(location.id);
                                        }}
                                      >
                                        Set Primary
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Step 4: POS Configuration */}
                  {currentStep === "pos_config" && (
                    <div className="space-y-6">
                      {staffType === "clerk" && (
                        <>
                          {/* Enable POS Access Toggle for Clerk */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                              <div className="flex-1">
                                <Label
                                  htmlFor="enablePos"
                                  className="text-base font-medium"
                                >
                                  Enable POS Access
                                </Label>
                                <p className="text-sm text-muted-foreground mt-1">
                                  Allow this manager to access the POS system
                                  with a PIN
                                </p>
                              </div>
                              <Switch
                                id="enablePos"
                                checked={enablePosAccess}
                                onCheckedChange={setEnablePosAccess}
                              />
                            </div>
                          </div>

                          {enablePosAccess && <Separator />}
                        </>
                      )}

                      {/* PIN Setup - shown for POS staff or Clerk with POS enabled */}
                      {(staffType === "pos" ||
                        (staffType === "clerk" && enablePosAccess)) && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label>PIN Code</Label>
                                <p className="text-sm text-muted-foreground">
                                  Used for POS login at assigned locations
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Label htmlFor="autoPin">Auto-generate</Label>
                                <Switch
                                  id="autoPin"
                                  checked={autoGeneratePin}
                                  onCheckedChange={setAutoGeneratePin}
                                />
                              </div>
                            </div>

                            {!autoGeneratePin && (
                              <div className="space-y-2">
                                <Label htmlFor="pinCode">
                                  Enter PIN (4 digits)
                                </Label>
                                <Input
                                  id="pinCode"
                                  type="text"
                                  placeholder="1234"
                                  maxLength={4}
                                  value={pinCode}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (/^\d*$/.test(value)) {
                                      setPinCode(value);
                                    }
                                  }}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Must be 4 digits
                                </p>
                              </div>
                            )}

                            {autoGeneratePin && (
                              <div className="rounded-lg border bg-muted/30 p-3">
                                <p className="text-sm text-muted-foreground">
                                  A 4-digit PIN will be automatically generated
                                  and shown after creation
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                      {/* Employment Details - only for POS staff */}
                      {staffType === "pos" && (
                        <>
                          <Separator />
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="employmentType">
                                Employment Type (optional)
                              </Label>
                              <Select
                                value={employmentType || undefined}
                                onValueChange={(value) =>
                                  setEmploymentType(value as EmploymentType)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select employment type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="full-time">
                                    Full-time
                                  </SelectItem>
                                  <SelectItem value="part-time">
                                    Part-time
                                  </SelectItem>
                                  <SelectItem value="contractor">
                                    Contractor
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="posHourlyRate">
                                Hourly Rate (optional)
                              </Label>
                              <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  id="posHourlyRate"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  value={hourlyRate}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (
                                      value === "" ||
                                      /^\d*\.?\d*$/.test(value)
                                    ) {
                                      setHourlyRate(value);
                                    }
                                  }}
                                  className="pl-9"
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Enter the hourly rate for this employee
                              </p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Step 5: Review */}
                  {currentStep === "review" && (
                    <div className="space-y-6">
                      {/* Staff Type Badge */}
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            staffType === "clerk" ? "default" : "secondary"
                          }
                          className="gap-1"
                        >
                          {staffType === "clerk" ? (
                            <Mail className="h-3 w-3" />
                          ) : (
                            <Lock className="h-3 w-3" />
                          )}
                          {staffType === "clerk"
                            ? "Dashboard User"
                            : "POS Staff Only"}
                        </Badge>
                      </div>

                      {/* User Info */}
                      <div className="p-4 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-lg font-semibold text-primary">
                              {firstName.charAt(0)}
                              {lastName.charAt(0)}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="font-medium">
                              {firstName} {lastName}
                            </div>
                            {email && (
                              <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {email}
                              </div>
                            )}
                            {phone && (
                              <div className="text-sm text-muted-foreground mt-0.5">
                                {phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Role */}
                      <div>
                        <div className="text-sm font-medium mb-2">
                          {staffType === "clerk" ? "Inviting" : "Creating"} as{" "}
                          {selectedRole?.name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {selectedRole?.description ||
                            "No description available"}
                        </div>
                      </div>

                      {/* POS-specific details */}
                      {(staffType === "pos" ||
                        (staffType === "clerk" && enablePosAccess)) && (
                          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                            <div className="font-medium text-sm flex items-center gap-2">
                              <Lock className="h-4 w-4" />
                              POS Configuration
                              {staffType === "clerk" && (
                                <Badge variant="outline" className="text-xs">
                                  Optional
                                </Badge>
                              )}
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">
                                  PIN Code:
                                </span>
                                <span>
                                  {autoGeneratePin
                                    ? "Auto-generated"
                                    : "Custom PIN set"}
                                </span>
                              </div>
                              {staffType === "pos" && employmentType && (
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">
                                    Employment:
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-xs capitalize"
                                  >
                                    {employmentType.replace("-", " ")}
                                  </Badge>
                                </div>
                              )}
                              {hourlyRate && (
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">
                                    Hourly Rate:
                                  </span>
                                  <span>
                                    ${parseFloat(hourlyRate).toFixed(2)}/hour
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                      {/* Locations */}
                      <div>
                        <div className="text-sm font-medium mb-3">
                          Assigning to {selectedLocations.length} location
                          {selectedLocations.length !== 1 ? "s" : ""}
                        </div>
                        <div className="space-y-2">
                          {selectedLocations.map((location) => {
                            const isPrimary = primaryLocationId === location.id;
                            return (
                              <div
                                key={location.id}
                                className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                              >
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <div className="flex-1">
                                  <div className="font-medium text-sm flex items-center gap-2">
                                    {location.name}
                                    {isPrimary && (
                                      <Badge
                                        variant="default"
                                        className="text-xs"
                                      >
                                        Primary
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {location.address_line1}
                                    {location.address_line2 &&
                                      `, ${location.address_line2}`}
                                    {location.city && `, ${location.city}`}
                                    {location.state && `, ${location.state}`}
                                    {location.postal_code &&
                                      ` ${location.postal_code}`}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </BottomSheetBody>

            <BottomSheetFooter className="border-t flex flex-col items-center justify-between">
              <div className="flex items-center justify-between w-full">
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  disabled={currentStepIndex === 0}
                  className="gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={
                    !canGoNext() ||
                    createPOSStaff.isPending ||
                    inviteClerkStaff.isPending ||
                    createClerkUserDirectly.isPending
                  }
                  className="gap-2"
                >
                  {currentStepIndex === STEPS.length - 1 ? (
                    <>
                      {createPOSStaff.isPending || inviteClerkStaff.isPending || createClerkUserDirectly.isPending
                        ? "Processing..."
                        : staffType === "clerk"
                          ? creationMethod === "direct" ? "Create Account" : "Send Invite"
                          : "Create Staff"}
                      <ChevronRight className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </BottomSheetFooter>
          </div>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
