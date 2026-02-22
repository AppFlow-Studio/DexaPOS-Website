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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  User,
  Mail,
  Shield,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Building2,
  Store,
  Loader2,
  Search,
  AlertCircle,
} from "lucide-react";
import { RolesModel, MerchantsModel } from "@/types/db-modles";
import { useUser } from "@clerk/nextjs";
import { 
  MerchantAccessAssignment, 
  CreateAdminInviteParams,
  HQ_ROLES,
  HQRoleCode,
} from "@/types/admin";
import { createInvitationAdmin } from "../../actions/clerk-create-invitation-admin";
import { createBulkInvitationAdmin } from "../../actions/clerk-create-bulk-invitiation-admin";
import { GetMerchants } from "@/app/manage/actions/get-merchants";

interface AdminInviteWizardProps {
  organizationId: string;
  orgType?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
  children?: React.ReactNode;
}

type Step = "details" | "role" | "merchants" | "review";
type InviteMode = "single" | "bulk";

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "details", label: "Details", icon: <User className="h-4 w-4" /> },
  { key: "role", label: "Role", icon: <Shield className="h-4 w-4" /> },
  { key: "merchants", label: "Merchants", icon: <Store className="h-4 w-4" /> },
  { key: "review", label: "Review", icon: <CheckCircle2 className="h-4 w-4" /> },
];

// Get simplified roles from the HQ_ROLES config
const AVAILABLE_ROLES = Object.values(HQ_ROLES);

export function AdminInviteWizard({
  organizationId,
  orgType = "hq",
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onSuccess,
  children,
}: AdminInviteWizardProps) {
  const { user } = useUser();
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const onOpenChange = controlledOnOpenChange || setInternalOpen;

  const [currentStep, setCurrentStep] = React.useState<Step>("details");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [inviteMode, setInviteMode] = React.useState<InviteMode>("single");

  // Data loading
  const [merchants, setMerchants] = React.useState<MerchantsModel[]>([]);
  const [isLoadingMerchants, setIsLoadingMerchants] = React.useState(false);

  // Form state
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [bulkEmails, setBulkEmails] = React.useState("");
  const [selectedRoleCode, setSelectedRoleCode] = React.useState<HQRoleCode>("hq.manager");
  const [selectedMerchants, setSelectedMerchants] = React.useState<Set<string>>(new Set());
  const [merchantSearchQuery, setMerchantSearchQuery] = React.useState("");

  // Get current user's role level (default to highest if super admin or not set)
  const currentUserRoleLevel = React.useMemo(() => {
    const userRoles = user?.publicMetadata?.roles as string[] | undefined;
    if (!userRoles || userRoles.length === 0) return 10; // Default to super admin level
    
    // Find the highest level role the user has
    let maxLevel = 0;
    for (const roleCode of userRoles) {
      const role = HQ_ROLES[roleCode as HQRoleCode];
      if (role && role.level > maxLevel) {
        maxLevel = role.level;
      }
    }
    return maxLevel || 10;
  }, [user]);

  // Filter roles based on current user's level (can only invite same or lower level)
  const invitableRoles = React.useMemo(() => {
    return AVAILABLE_ROLES.filter(role => role.level <= currentUserRoleLevel);
  }, [currentUserRoleLevel]);

  // Load merchants when component opens
  React.useEffect(() => {
    if (open) {
      loadMerchants();
    }
  }, [open]);

  const loadMerchants = async () => {
    setIsLoadingMerchants(true);
    try {
      const result = await GetMerchants();
      if (Array.isArray(result)) {
        setMerchants(result);
      }
    } catch (error) {
      console.error("Error loading merchants:", error);
      toast.error("Failed to load merchants");
    } finally {
      setIsLoadingMerchants(false);
    }
  };

  // Reset form when closing
  React.useEffect(() => {
    if (!open) {
      setCurrentStep("details");
      setInviteMode("single");
      setFirstName("");
      setLastName("");
      setEmail("");
      setBulkEmails("");
      setSelectedRoleCode("hq.manager");
      setSelectedMerchants(new Set());
      setMerchantSearchQuery("");
    }
  }, [open]);

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  const selectedRole = HQ_ROLES[selectedRoleCode];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const parsedBulkEmails = React.useMemo(() => {
    const tokens = bulkEmails
      .split(/[\n,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    const unique = new Set<string>();
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const token of tokens) {
      const normalized = token.toLowerCase();
      if (unique.has(normalized)) continue;
      unique.add(normalized);

      if (emailRegex.test(token)) {
        valid.push(token);
      } else {
        invalid.push(token);
      }
    }

    return { valid, invalid };
  }, [bulkEmails]);

  const filteredMerchants = React.useMemo(() => {
    if (!merchantSearchQuery.trim()) return merchants;
    const query = merchantSearchQuery.toLowerCase();
    return merchants.filter(
      (m) =>
        m.name?.toLowerCase().includes(query) ||
        m.type?.toLowerCase().includes(query)
    );
  }, [merchants, merchantSearchQuery]);

  const selectedMerchantCount = selectedMerchants.size;
  
  // Build merchant access array for submission
  const merchantAccessArray: MerchantAccessAssignment[] = React.useMemo(() => {
    return Array.from(selectedMerchants).map(merchantId => {
      const merchant = merchants.find(m => m.id === merchantId);
      return {
        merchantId,
        merchantName: merchant?.name,
      };
    });
  }, [selectedMerchants, merchants]);

  const canGoNext = () => {
    switch (currentStep) {
      case "details":
        if (inviteMode === "bulk") {
          return parsedBulkEmails.valid.length > 0 && parsedBulkEmails.invalid.length === 0;
        }
        return (
          firstName.trim() &&
          lastName.trim() &&
          email.trim() &&
          emailRegex.test(email)
        );
      case "role":
        return !!selectedRoleCode;
      case "merchants":
        // Merchant access is optional - admins can be given access later
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

  const toggleMerchant = (merchantId: string) => {
    setSelectedMerchants((prev) => {
      const next = new Set(prev);
      if (next.has(merchantId)) {
        next.delete(merchantId);
      } else {
        next.add(merchantId);
      }
      return next;
    });
  };

  const selectAllMerchants = () => {
    setSelectedMerchants(new Set(filteredMerchants.map(m => m.id)));
  };

  const deselectAllMerchants = () => {
    setSelectedMerchants(new Set());
  };

  const handleSubmit = async () => {
    if (!selectedRole) {
      toast.error("Please select a role");
      return;
    }

    setIsSubmitting(true);
    try {
      if (inviteMode === "bulk") {
        const invitations = parsedBulkEmails.valid.map((bulkEmail) => ({
          email: bulkEmail,
          role: selectedRoleCode,
          level_type: orgType,
        }));
        const result = await createBulkInvitationAdmin(organizationId, invitations, {
          merchantAccess: merchantAccessArray,
          invitedBy: user?.id,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          orgType,
        });

        if (result?.success) {
          toast.success("Bulk invitations sent", {
            description: `${parsedBulkEmails.valid.length} invite${parsedBulkEmails.valid.length > 1 ? "s" : ""} queued.`,
          });
          onOpenChange(false);
          if (onSuccess) {
            onSuccess();
          }
        } else {
          toast.error("Bulk invitation failed", {
            description: result?.message || "Unable to send bulk invitations. Please try again.",
          });
        }
      } else {
        const params: CreateAdminInviteParams = {
          organizationId,
          firstName,
          lastName,
          email: email.trim(),
          roleCode: selectedRoleCode,
          levelType: "hq",
          orgType,
          merchantAccess: merchantAccessArray,
          invitedBy: user?.id,
        };

        const result = await createInvitationAdmin(params);

        if (result?.success) {
          toast.success("Admin Invitation Sent", {
            description: `Invitation sent to ${email}`,
          });
          onOpenChange(false);
          if (onSuccess) {
            onSuccess();
          }
        } else {
          toast.error("Invitation Failed", {
            description: result?.message || "Unable to send the invitation. Please try again.",
          });
        }
      }
    } catch (error: any) {
      console.error("Submit error:", error);
      toast.error(inviteMode === "bulk" ? "Bulk invitation failed" : "Invitation Failed", {
        description: error?.message || "An unexpected error occurred.",
      });
    } finally {
      setIsSubmitting(false);
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
                      isAccessible && !isActive && "hover:bg-muted cursor-pointer"
                    )}
                    onClick={() => isAccessible && setCurrentStep(step.key)}
                  >
                    <div
                      className={cn(
                        "flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors",
                        isActive && "border-primary-foreground bg-primary-foreground text-primary",
                        isCompleted && !isActive && "border-primary bg-primary text-primary-foreground",
                        !isActive && !isCompleted && "border-muted-foreground/30"
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

            {/* Summary in sidebar */}
            <div className="mt-auto pt-4 border-t space-y-2">
              {selectedRole && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Role</div>
                  <Badge variant="outline">{selectedRole.name}</Badge>
                </div>
              )}
              {selectedMerchantCount > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Merchants</div>
                  <Badge variant="secondary">{selectedMerchantCount} selected</Badge>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <BottomSheetHeader className="border-b">
              <BottomSheetTitle>
                {currentStep === "details" && "Admin Details"}
                {currentStep === "role" && "Select Role"}
                {currentStep === "merchants" && "Assign Merchants"}
                {currentStep === "review" && "Review & Send Invite"}
              </BottomSheetTitle>
              <BottomSheetDescription>
                {currentStep === "details" && "Enter the basic information for the new admin."}
                {currentStep === "role" && "Choose the role for this admin. The role determines their permissions."}
                {currentStep === "merchants" && "Select which merchants this admin can access (optional)."}
                {currentStep === "review" && "Review all details before sending the invitation."}
              </BottomSheetDescription>
            </BottomSheetHeader>

            <BottomSheetBody className="flex-1 overflow-y-auto max-h-[calc(98vh-200px)]">
              {isLoadingMerchants && currentStep === "merchants" ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">Loading merchants...</p>
                  </div>
                </div>
              ) : (
                <div className="py-6 space-y-6">
                  {/* Step 1: Details */}
                  {currentStep === "details" && (
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <Label>Invite mode</Label>
                        <RadioGroup
                          value={inviteMode}
                          onValueChange={(value) => setInviteMode(value as InviteMode)}
                          className="grid grid-cols-2 gap-3"
                        >
                          <label
                            htmlFor="invite-mode-single"
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                              inviteMode === "single" ? "border-primary bg-primary/5" : "border-muted"
                            )}
                          >
                            <RadioGroupItem id="invite-mode-single" value="single" className="mt-1" />
                            <div>
                              <div className="text-sm font-medium">Single invite</div>
                              <p className="text-xs text-muted-foreground">Invite one admin with full profile fields.</p>
                            </div>
                          </label>
                          <label
                            htmlFor="invite-mode-bulk"
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                              inviteMode === "bulk" ? "border-primary bg-primary/5" : "border-muted"
                            )}
                          >
                            <RadioGroupItem id="invite-mode-bulk" value="bulk" className="mt-1" />
                            <div>
                              <div className="text-sm font-medium">Bulk invite</div>
                              <p className="text-xs text-muted-foreground">Paste multiple emails (comma or newline separated).</p>
                            </div>
                          </label>
                        </RadioGroup>
                      </div>

                      {inviteMode === "single" ? (
                        <>
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
                            <Label htmlFor="email">Email address *</Label>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                id="email"
                                type="email"
                                placeholder="admin@company.com"
                                className="pl-10"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              An invitation email will be sent to this address.
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <Label htmlFor="bulkEmails">Email addresses *</Label>
                          <Textarea
                            id="bulkEmails"
                            placeholder={"ali@example.com\nmanager@example.com"}
                            rows={8}
                            value={bulkEmails}
                            onChange={(e) => setBulkEmails(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Separate with commas or new lines. Duplicates are removed automatically.
                          </p>
                          {parsedBulkEmails.invalid.length > 0 && (
                            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                              Invalid emails: {parsedBulkEmails.invalid.join(", ")}
                            </div>
                          )}
                          {parsedBulkEmails.valid.length > 0 && (
                            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                              {parsedBulkEmails.valid.length} valid email{parsedBulkEmails.valid.length > 1 ? "s" : ""} ready.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 2: Role Selection */}
                  {currentStep === "role" && (
                    <div className="space-y-4">
                      <div className="text-sm text-muted-foreground">
                        Select a role for this admin. Each role has predefined permissions.
                      </div>

                      {invitableRoles.length === 0 ? (
                        <div className="rounded-lg border bg-yellow-50 dark:bg-yellow-950/20 p-4">
                          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-sm font-medium">No roles available</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            You don't have permission to invite any roles.
                          </p>
                        </div>
                      ) : (
                        <RadioGroup value={selectedRoleCode} onValueChange={(value) => setSelectedRoleCode(value as HQRoleCode)}>
                          <div className="space-y-3">
                            {invitableRoles.map((role) => (
                              <div
                                key={role.code}
                                className={cn(
                                  "flex items-start gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer",
                                  selectedRoleCode === role.code
                                    ? "border-primary bg-primary/5"
                                    : "border-muted hover:border-primary/50"
                                )}
                                onClick={() => setSelectedRoleCode(role.code)}
                              >
                                <RadioGroupItem value={role.code} id={role.code} className="mt-1" />
                                <label htmlFor={role.code} className="flex-1 cursor-pointer">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{role.name}</span>
                                    <Badge variant="secondary" className="text-xs">
                                      Level {role.level}
                                    </Badge>
                                  </div>
                                  <div className="text-sm text-muted-foreground mt-1">
                                    {role.description}
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {role.permissions.slice(0, 4).map((perm) => (
                                      <Badge key={perm} variant="outline" className="text-xs">
                                        {perm.split('.').slice(-1)[0].replace(/_/g, ' ')}
                                      </Badge>
                                    ))}
                                    {role.permissions.length > 4 && (
                                      <Badge variant="outline" className="text-xs">
                                        +{role.permissions.length - 4} more
                                      </Badge>
                                    )}
                                  </div>
                                </label>
                              </div>
                            ))}
                          </div>
                        </RadioGroup>
                      )}
                    </div>
                  )}

                  {/* Step 3: Merchant Selection */}
                  {currentStep === "merchants" && (
                    <div className="space-y-4">
                      <div className="text-sm text-muted-foreground">
                        Select which merchants this admin can access. Their role determines what they can do.
                      </div>

                      {/* Search and bulk actions */}
                      <div className="flex items-center gap-4">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search merchants..."
                            className="pl-10"
                            value={merchantSearchQuery}
                            onChange={(e) => setMerchantSearchQuery(e.target.value)}
                          />
                        </div>
                        <Button variant="outline" size="sm" onClick={selectAllMerchants}>
                          Select All
                        </Button>
                        <Button variant="outline" size="sm" onClick={deselectAllMerchants}>
                          Clear
                        </Button>
                      </div>

                      {/* Role-based access notice */}
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">
                          <strong>Note:</strong> {selectedRole?.code === 'hq.super_admin' 
                            ? "Super Admins have access to all merchants regardless of selection."
                            : "Merchant selection is optional. You can grant access later. The admin's role determines their permissions within each merchant."}
                        </p>
                      </div>

                      {/* Merchant list */}
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {filteredMerchants.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            <p>No merchants found</p>
                          </div>
                        ) : (
                          filteredMerchants.map((merchant) => {
                            const isSelected = selectedMerchants.has(merchant.id);

                            return (
                              <div
                                key={merchant.id}
                                className={cn(
                                  "flex items-center gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer",
                                  isSelected
                                    ? "border-primary bg-primary/5"
                                    : "border-muted hover:border-primary/50"
                                )}
                                onClick={() => toggleMerchant(merchant.id)}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleMerchant(merchant.id)}
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <Store className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">{merchant.name}</span>
                                  </div>
                                  {merchant.type && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Type: {merchant.type}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Step 4: Review */}
                  {currentStep === "review" && (
                    <div className="space-y-6">
                      {/* Admin Info */}
                      {inviteMode === "single" ? (
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
                              <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {email}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-lg border bg-muted/30">
                          <div className="font-medium mb-2">Bulk invite recipients</div>
                          <div className="text-sm text-muted-foreground mb-3">
                            {parsedBulkEmails.valid.length} email{parsedBulkEmails.valid.length > 1 ? "s" : ""} will receive invites.
                          </div>
                          <div className="max-h-[160px] overflow-y-auto space-y-2">
                            {parsedBulkEmails.valid.map((bulkEmail) => (
                              <div key={bulkEmail} className="flex items-center gap-2 text-sm">
                                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{bulkEmail}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Role */}
                      <div>
                        <div className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          Role
                        </div>
                        <div className="p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{selectedRole?.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              Level {selectedRole?.level}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {selectedRole?.description}
                          </div>
                        </div>
                      </div>

                      {/* Merchant Access */}
                      <div>
                        <div className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Store className="h-4 w-4" />
                          Merchant Access ({selectedMerchantCount})
                        </div>
                        {selectedMerchantCount === 0 ? (
                          <div className="p-3 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                            {selectedRole?.code === 'hq.super_admin'
                              ? "Super Admins have access to all merchants automatically."
                              : "No specific merchants assigned. Access can be granted later."}
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[200px] overflow-y-auto">
                            {merchantAccessArray.map((access) => (
                              <div
                                key={access.merchantId}
                                className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                              >
                                <div className="flex items-center gap-2">
                                  <Store className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-sm">{access.merchantName}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Summary */}
                      <div className="text-sm text-muted-foreground">
                        {inviteMode === "bulk" ? (
                          <>
                            Invitations will be sent to <strong>{parsedBulkEmails.valid.length}</strong> recipients with <strong>{selectedRole?.name}</strong> access
                            {selectedMerchantCount > 0
                              ? ` to ${selectedMerchantCount} merchant(s).`
                              : selectedRole?.code === 'hq.super_admin'
                                ? " to all merchants."
                                : "."}
                          </>
                        ) : (
                          <>
                            An invitation email will be sent to <strong>{email}</strong>. Once accepted, they will have <strong>{selectedRole?.name}</strong> access
                            {selectedMerchantCount > 0
                              ? ` to ${selectedMerchantCount} merchant(s).`
                              : selectedRole?.code === 'hq.super_admin'
                                ? " to all merchants."
                                : "."}
                          </>
                        )}
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
                  disabled={!canGoNext() || isSubmitting}
                  className="gap-2"
                >
                  {currentStepIndex === STEPS.length - 1 ? (
                    <>
                      {isSubmitting ? "Sending..." : inviteMode === "bulk" ? "Send Invitations" : "Send Invitation"}
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
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
