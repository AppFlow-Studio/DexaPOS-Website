'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
} from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { normalizePhone } from '@/lib/phone'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  User,
  Mail,
  Shield,
  MapPin,
  CheckCircle2,
  Lock,
  UserCheck,
  Users,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  useAdminCreateStaff,
  useAdminCreateClerkStaff,
  useAdminInviteClerkStaff,
  useMerchantStaffRoles,
} from '@/lib/queries/use-admin-staff'
import type { LocationSummary } from '@/types/merchant'
import type { EmploymentType } from '@/types/staff'

interface AdminCreateStaffWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  locations: LocationSummary[]
  onSuccess: (pin?: string, tempPassword?: string) => void
}

type Step = 'type' | 'details' | 'role' | 'locations' | 'pos_config' | 'review'

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: 'type', label: 'Staff type', icon: <UserCheck className="h-4 w-4" /> },
  { key: 'details', label: 'Details', icon: <User className="h-4 w-4" /> },
  { key: 'role', label: 'Role', icon: <Shield className="h-4 w-4" /> },
  { key: 'locations', label: 'Locations', icon: <MapPin className="h-4 w-4" /> },
  { key: 'pos_config', label: 'POS Setup', icon: <Lock className="h-4 w-4" /> },
  { key: 'review', label: 'Review', icon: <CheckCircle2 className="h-4 w-4" /> },
]

export function AdminCreateStaffWizard({
  open,
  onOpenChange,
  merchantId,
  locations,
  onSuccess,
}: AdminCreateStaffWizardProps) {
  const [currentStep, setCurrentStep] = React.useState<Step>('type')
  const [staffType, setStaffType] = React.useState<'pos' | 'clerk'>('pos')
  const [creationMethod, setCreationMethod] = React.useState<'direct' | 'invitation'>('direct')

  // Data fetching
  const { data: rolesData } = useMerchantStaffRoles()
  const createPOSMutation = useAdminCreateStaff()
  const createClerkMutation = useAdminCreateClerkStaff()
  const inviteClerkMutation = useAdminInviteClerkStaff()

  const isSubmitting = createPOSMutation.isPending || createClerkMutation.isPending || inviteClerkMutation.isPending

  // Filter roles based on type
  const availableRoles = React.useMemo(() => {
    if (!rolesData) return []
    if (staffType === 'clerk') {
      return rolesData.filter((r) => r.level_type === 'admin' || r.level_type === 'manager')
    }
    return rolesData.filter((r) => r.level_type === 'member')
  }, [rolesData, staffType])

  // Form State
  const [firstName, setFirstName] = React.useState('')
  const [lastName, setLastName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [selectedRoleCode, setSelectedRoleCode] = React.useState<string>('')
  const [selectedLocationIds, setSelectedLocationIds] = React.useState<Set<string>>(new Set())
  const [primaryLocationId, setPrimaryLocationId] = React.useState<string | null>(null)

  // POS Setup State
  const [autoGeneratePin, setAutoGeneratePin] = React.useState(true)
  const [pinCode, setPinCode] = React.useState('')
  const [showPin, setShowPin] = React.useState(false)
  const [hourlyRate, setHourlyRate] = React.useState('')
  const [employmentType, setEmploymentType] = React.useState<EmploymentType>('full-time')

  // Auto-select first role
  React.useEffect(() => {
    if (availableRoles.length > 0 && !selectedRoleCode) {
      setSelectedRoleCode(availableRoles[0].code)
    }
  }, [availableRoles, selectedRoleCode])

  // Reset form on open
  React.useEffect(() => {
    if (open) {
      setCurrentStep('type')
      setStaffType('pos')
      setCreationMethod('direct')
      setFirstName('')
      setLastName('')
      setEmail('')
      setPhone('')
      setSelectedRoleCode('')
      setSelectedLocationIds(new Set())
      setPrimaryLocationId(null)
      setAutoGeneratePin(true)
      setPinCode('')
      setShowPin(false)
      setHourlyRate('')
      setEmploymentType('full-time')
    }
  }, [open])

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep)

  const canGoNext = (): boolean => {
    switch (currentStep) {
      case 'type':
        return staffType === 'pos' || staffType === 'clerk'
      case 'details':
        if (!firstName.trim() || !lastName.trim()) return false
        if (staffType === 'clerk' && !email.trim()) return false
        if (staffType === 'clerk' && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false
        return true
      case 'role':
        return !!selectedRoleCode
      case 'locations':
        return true // location is optional when merchant has none yet
      case 'pos_config':
        // For Clerk users, PIN is optional — always can proceed
        if (staffType === 'clerk') return true
        // For POS users, if not auto-generating, validate custom PIN
        if (!autoGeneratePin && (!pinCode || !/^\d{4}$/.test(pinCode))) return false
        return true
      case 'review':
        return true
      default:
        return false
    }
  }

  const handleNext = () => {
    if (!canGoNext()) return
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentStepIndex + 1].key)
    } else {
      handleSubmit()
    }
  }

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(STEPS[currentStepIndex - 1].key)
    }
  }

  const toggleLocation = (id: string) => {
    const newSet = new Set(selectedLocationIds)
    if (newSet.has(id)) {
      newSet.delete(id)
      if (primaryLocationId === id) setPrimaryLocationId(null)
    } else {
      newSet.add(id)
      if (newSet.size === 1) setPrimaryLocationId(id)
    }
    setSelectedLocationIds(newSet)
  }

  const handleSubmit = async () => {
    if (staffType === 'clerk') {
      if (!email) {
        toast.error('Email is required for Dashboard Users')
        return
      }

      if (creationMethod === 'invitation') {
        // Email invite flow
        try {
          const result = await inviteClerkMutation.mutateAsync({
            merchantId,
            data: {
              firstName,
              lastName,
              email,
              phone: normalizePhone(phone) ?? phone || undefined,
              locationIds: Array.from(selectedLocationIds),
              primaryLocationId,
              roleCode: selectedRoleCode,
              hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
              employmentType,
              autoGeneratePin,
              pin: autoGeneratePin ? undefined : pinCode || undefined,
            },
          })

          if (result.success) {
            toast.success(`Invitation sent to ${email}`)
            onOpenChange(false)
            onSuccess(result.generatedPin)
          } else {
            toast.error(result.error || 'Failed to send invitation')
          }
        } catch {
          toast.error('Failed to send invitation')
        }
      } else {
        // Direct creation flow
        try {
          const result = await createClerkMutation.mutateAsync({
            merchantId,
            data: {
              firstName,
              lastName,
              email,
              phone: normalizePhone(phone) ?? phone || undefined,
              locationId: primaryLocationId ?? undefined,
              roleCode: selectedRoleCode,
              hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
              employmentType,
              autoGeneratePin,
              pin: autoGeneratePin ? undefined : pinCode || undefined,
            },
          })

          if (result.success) {
            toast.success('Dashboard user created successfully')
            onOpenChange(false)
            onSuccess(result.generatedPin, result.tempPassword)
          } else {
            toast.error(result.error || 'Failed to create dashboard user')
          }
        } catch {
          toast.error('Failed to create dashboard user')
        }
      }
    } else {
      // POS Staff creation
      try {
        const result = await createPOSMutation.mutateAsync({
          merchantId,
          data: {
            firstName,
            lastName,
            email: email || undefined,
            phone: phone || undefined,
            locationId: primaryLocationId ?? undefined,
            roleCode: selectedRoleCode,
            hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
            employmentType,
            autoGeneratePin,
            pin: autoGeneratePin ? undefined : pinCode,
          },
        })

        if (result.success) {
          toast.success('Staff member created successfully')
          onOpenChange(false)
          onSuccess(result.pin)
        } else {
          toast.error(result.error || 'Failed to create staff member')
        }
      } catch {
        toast.error('Failed to create staff member')
      }
    }
  }

  const selectedRole = availableRoles.find((r) => r.code === selectedRoleCode)
  const selectedLocationList = locations.filter((l) => selectedLocationIds.has(l.id))

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="w-full" height="95">
        <div className="flex h-full">

          {/* Sidebar Steps */}
          <div className="w-64 border-r bg-muted/30 p-6 hidden md:flex flex-col">
            <div className="space-y-1">
              {STEPS.map((step, index) => {
                const isActive = step.key === currentStep
                const isCompleted = index < currentStepIndex
                const isAccessible = index <= currentStepIndex

                return (
                  <div
                    key={step.key}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                      isActive && 'bg-primary text-primary-foreground',
                      isCompleted && !isActive && 'bg-primary/10 text-primary',
                      !isAccessible && 'opacity-50 cursor-not-allowed',
                      isAccessible && !isActive && 'hover:bg-muted cursor-pointer'
                    )}
                    onClick={() => isAccessible && setCurrentStep(step.key)}
                  >
                    <div
                      className={cn(
                        'flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors',
                        isActive && 'border-primary-foreground bg-primary-foreground text-primary',
                        isCompleted && !isActive && 'border-primary bg-primary text-primary-foreground',
                        !isActive && !isCompleted && 'border-muted-foreground/30',
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
                )
              })}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <BottomSheetHeader className="border-b px-6 py-4">
              <BottomSheetTitle>Add Staff Member</BottomSheetTitle>
              <BottomSheetDescription>
                Follow the steps to add a new staff member to this merchant.
              </BottomSheetDescription>
            </BottomSheetHeader>

            <BottomSheetBody className="flex-1 overflow-y-auto px-6 py-6">
              <div className="max-w-3xl mx-auto space-y-6">

                {/* STEP: TYPE */}
                {currentStep === 'type' && (
                  <div className="space-y-4">
                    <Label>Choose Staff Access Type</Label>
                    <RadioGroup value={staffType} onValueChange={(v) => setStaffType(v as 'pos' | 'clerk')}>
                      <div className="grid gap-4">

                        {/* Dashboard User */}
                        <div
                          className={cn(
                            'flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all',
                            staffType === 'clerk' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'
                          )}
                          onClick={() => setStaffType('clerk')}
                        >
                          <RadioGroupItem value="clerk" id="type-clerk" className="mt-1" />
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              <span className="font-medium">Dashboard User</span>
                              <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Web + POS</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Full dashboard access with email login. A temporary password will be generated for the merchant to share securely.
                            </p>
                          </div>
                        </div>

                        {/* POS Staff */}
                        <div
                          className={cn(
                            'flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all',
                            staffType === 'pos' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'
                          )}
                          onClick={() => setStaffType('pos')}
                        >
                          <RadioGroupItem value="pos" id="type-pos" className="mt-1" />
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Lock className="h-4 w-4" />
                              <span className="font-medium">POS Staff Only</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              PIN-based access to POS only. Perfect for cashiers, servers, and shift workers.
                            </p>
                          </div>
                        </div>

                      </div>
                    </RadioGroup>
                  </div>
                )}

                {/* STEP: DETAILS */}
                {currentStep === 'details' && (
                  <div className="space-y-6">

                    {/* Creation method — only for Dashboard Users */}
                    {staffType === 'clerk' && (
                      <>
                        <div className="space-y-3">
                          <Label>Account Creation Method</Label>
                          <RadioGroup value={creationMethod} onValueChange={(v) => setCreationMethod(v as 'direct' | 'invitation')}>
                            <div className="space-y-3">
                              <div
                                className={cn(
                                  'flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all',
                                  creationMethod === 'direct' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'
                                )}
                                onClick={() => setCreationMethod('direct')}
                              >
                                <RadioGroupItem value="direct" id="method-direct" className="mt-1" />
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <UserCheck className="h-4 w-4" />
                                    <span className="font-medium">Create Account Immediately</span>
                                    <Badge variant="outline" className="text-xs">Recommended</Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    Account is created now with a temp password. The merchant shares it with staff.
                                  </p>
                                </div>
                              </div>

                              <div
                                className={cn(
                                  'flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all',
                                  creationMethod === 'invitation' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'
                                )}
                                onClick={() => setCreationMethod('invitation')}
                              >
                                <RadioGroupItem value="invitation" id="method-invitation" className="mt-1" />
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4" />
                                    <span className="font-medium">Send Email Invitation</span>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    Clerk sends an invite email. Staff sets their own password when they accept.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </RadioGroup>
                        </div>
                        <Separator />
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name *</Label>
                        <Input
                          id="firstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="John"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name *</Label>
                        <Input
                          id="lastName"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Doe"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">
                        Email {staffType === 'clerk' ? '*' : '(Optional)'}
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="john.doe@example.com"
                      />
                      {staffType === 'clerk' && (
                        <p className="text-xs text-muted-foreground">
                          Required for dashboard login. A temporary password will be generated.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone (Optional)</Label>
                      <PhoneInput
                        id="phone"
                        value={phone}
                        onChange={setPhone}
                      />
                    </div>
                  </div>
                )}

                {/* STEP: ROLE */}
                {currentStep === 'role' && (
                  <div className="space-y-4">
                    <Label>Select Role</Label>
                    <RadioGroup value={selectedRoleCode} onValueChange={setSelectedRoleCode}>
                      <div className="space-y-3">
                        {availableRoles.map((role) => (
                          <div
                            key={role.code}
                            className={cn(
                              'flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all',
                              selectedRoleCode === role.code ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'
                            )}
                            onClick={() => setSelectedRoleCode(role.code)}
                          >
                            <RadioGroupItem value={role.code} id={role.code} className="mt-1" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{role.name}</span>
                                <Badge variant="outline" className="text-xs">{role.code}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                Level {role.level} — {role.level_type}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </RadioGroup>
                  </div>
                )}

                {/* STEP: LOCATIONS */}
                {currentStep === 'locations' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Location Assignments</Label>
                      <span className="text-sm text-muted-foreground">Optional</span>
                    </div>
                    {locations.length === 0 && (
                      <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4 text-center">
                        This merchant has no locations yet. You can assign the staff member to a location later.
                      </p>
                    )}
                    <div className="grid gap-3">
                      {locations.map((loc) => {
                        const isSelected = selectedLocationIds.has(loc.id)
                        const isPrimary = primaryLocationId === loc.id
                        return (
                          <div
                            key={loc.id}
                            className={cn(
                              'flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all',
                              isSelected ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/20'
                            )}
                            onClick={() => toggleLocation(loc.id)}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox checked={isSelected} />
                              <div>
                                <p className="font-medium">{loc.name}</p>
                                {loc.is_active ? (
                                  <span className="text-xs text-green-600">Active Location</span>
                                ) : (
                                  <span className="text-xs text-red-600">Inactive Location</span>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <div onClick={(e) => { e.stopPropagation(); setPrimaryLocationId(loc.id) }}>
                                {isPrimary ? (
                                  <Badge>Primary</Badge>
                                ) : (
                                  <Button variant="ghost" size="sm" className="h-6 text-xs">
                                    Make Primary
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {selectedLocationIds.size > 1 && (
                      <p className="text-xs text-amber-600">
                        Note: Staff will be created in the primary location first. Additional locations can be assigned after creation.
                      </p>
                    )}
                  </div>
                )}

                {/* STEP: POS SETUP */}
                {currentStep === 'pos_config' && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <Label>Employment</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="employmentType" className="text-xs text-muted-foreground">Type</Label>
                          <select
                            id="employmentType"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            value={employmentType}
                            onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
                          >
                            <option value="full-time">Full-time</option>
                            <option value="part-time">Part-time</option>
                            <option value="contractor">Contractor</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="hourlyRate" className="text-xs text-muted-foreground">Hourly Rate ($)</Label>
                          <Input
                            id="hourlyRate"
                            type="number"
                            min="0"
                            step="0.01"
                            value={hourlyRate}
                            onChange={(e) => setHourlyRate(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>POS PIN</Label>
                        {staffType === 'clerk' && (
                          <Badge variant="secondary" className="text-xs">Optional for Dashboard Users</Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={autoGeneratePin}
                          onCheckedChange={setAutoGeneratePin}
                          id="auto-pin"
                        />
                        <Label htmlFor="auto-pin" className="cursor-pointer">Auto-generate PIN</Label>
                      </div>

                      {!autoGeneratePin && (
                        <div className="space-y-2">
                          <Label htmlFor="pinCode">Enter 4 digit PIN</Label>
                          <div className="relative">
                            <Input
                              id="pinCode"
                              type={showPin ? 'text' : 'password'}
                              maxLength={4}
                              value={pinCode}
                              onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                              placeholder="1234"
                              className="pr-10"
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                              onClick={() => setShowPin(!showPin)}
                            >
                              {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      )}

                      {staffType === 'clerk' && !autoGeneratePin && !pinCode && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <KeyRound className="h-3 w-3" />
                          No PIN means this user can only log in via the dashboard. Skip to continue.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* STEP: REVIEW */}
                {currentStep === 'review' && (
                  <div className="space-y-6">
                    <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Name</span>
                          <p className="font-medium">{firstName} {lastName}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Type</span>
                          <p className="font-medium">
                            {staffType === 'clerk' ? 'Dashboard User' : 'POS Staff Only'}
                          </p>
                        </div>
                        {staffType === 'clerk' && (
                          <div>
                            <span className="text-muted-foreground">Email</span>
                            <p className="font-medium">{email}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">Role</span>
                          <p className="font-medium">{selectedRole?.name || '—'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Primary Location</span>
                          <p className="font-medium">
                            {primaryLocationId
                              ? locations.find((l) => l.id === primaryLocationId)?.name || '—'
                              : 'None (assign later)'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">POS PIN</span>
                          <p className="font-medium">
                            {staffType === 'clerk' && !autoGeneratePin && !pinCode
                              ? 'None (dashboard login only)'
                              : autoGeneratePin
                              ? 'Auto-generated'
                              : 'Custom PIN set'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {staffType === 'clerk' && creationMethod === 'direct' && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                        <p className="font-medium mb-1">Temporary password will be generated</p>
                        <p>Share it securely with the staff member. They should change it on first login.</p>
                      </div>
                    )}

                    {staffType === 'clerk' && creationMethod === 'invitation' && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                        <p className="font-medium mb-1 flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Invitation email will be sent
                        </p>
                        <p>Clerk will email <strong>{email}</strong>. They set their own password when they accept.</p>
                      </div>
                    )}

                    {selectedLocationList.length > 1 && (
                      <p className="text-xs text-amber-600">
                        Staff will be created in the primary location <strong>{locations.find((l) => l.id === primaryLocationId)?.name}</strong>. Additional locations can be assigned after creation.
                      </p>
                    )}
                  </div>
                )}

              </div>
            </BottomSheetBody>

            <BottomSheetFooter className="border-t p-4">
              <div className="flex justify-between w-full">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={currentStep === 'type' || isSubmitting}
                >
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={!canGoNext() || isSubmitting}
                >
                  {isSubmitting
                    ? (creationMethod === 'invitation' ? 'Sending...' : 'Creating...')
                    : currentStep === 'review'
                    ? staffType === 'clerk'
                      ? creationMethod === 'invitation' ? 'Send Invite' : 'Create Dashboard User'
                      : 'Create Staff'
                    : 'Next'}
                </Button>
              </div>
            </BottomSheetFooter>
          </div>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}
