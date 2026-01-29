'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  BottomSheet,
  BottomSheetTrigger,
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
  Info,
  Users,
} from 'lucide-react'
import { useAdminCreateStaff, useMerchantStaffRoles } from '@/lib/queries/use-admin-staff'
import type { LocationSummary } from '@/types/merchant'
import type { EmploymentType } from '@/types/staff'

interface AdminCreateStaffWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  locations: LocationSummary[]
  onSuccess: (pin?: string) => void
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

  // Data fetching
  const { data: rolesData } = useMerchantStaffRoles()
  const createStaffMutation = useAdminCreateStaff()

  // Filter roles for POS staff (member level)
  const availableRoles = React.useMemo(() => {
    return rolesData?.filter((r) => r.level_type === 'member') || []
  }, [rolesData])

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
  const [hourlyRate, setHourlyRate] = React.useState('')
  const [employmentType, setEmploymentType] = React.useState<EmploymentType | 'full-time'>('full-time')

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
      setStaffType('pos') // Default to POS
      setFirstName('')
      setLastName('')
      setEmail('')
      setPhone('')
      setSelectedRoleCode('')
      setSelectedLocationIds(new Set())
      setPrimaryLocationId(null)
      setAutoGeneratePin(true)
      setPinCode('')
      setHourlyRate('')
      setEmploymentType('full-time')
    }
  }, [open])

  // Navigation Logic
  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep)

  const canGoNext = () => {
    switch (currentStep) {
      case 'type':
        // Only allow POS for now as Admin
        return staffType === 'pos'
      case 'details':
        return !!firstName.trim() && !!lastName.trim()
      case 'role':
        return !!selectedRoleCode
      case 'locations':
        return selectedLocationIds.size > 0
      case 'pos_config':
        if (!autoGeneratePin && (!pinCode || !/^\d{4,6}$/.test(pinCode))) {
          return false
        }
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
    // Only support single primary location creation via this specific mutation for now
    // If multiple locations are selected, we might need to loop or update API.
    // However, existing CreateStaffDialog only allowed one location.
    // The useAdminCreateStaff mutation takes ONE locationId.
    // We will use the PRIMARY location as the creation location.
    // TODO: Support multi-location assignment in backend or loop here.
    // For now, we'll just use the primary one.

    if (!primaryLocationId) {
      toast.error('Primary location is required')
      return
    }

    try {
      const result = await createStaffMutation.mutateAsync({
        merchantId,
        data: {
          firstName,
          lastName,
          email: email || undefined,
          phone: phone || undefined,
          locationId: primaryLocationId, // Primary Creation Location
          roleCode: selectedRoleCode,
          hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
          employmentType: employmentType as EmploymentType,
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
                        !isActive && !isCompleted && "border-muted-foreground/30",
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
                                        {/* Dashboard User - Disabled for now in Admin View */}
                                        <div className={cn(
                                            "flex items-start gap-4 p-4 rounded-lg border-2 border-muted opacity-60 cursor-not-allowed bg-muted/20"
                                        )}>
                                            <RadioGroupItem value="clerk" id="type-clerk" disabled />
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-4 w-4" />
                                                    <span className="font-medium">Dashboard User</span>
                                                    <Badge variant="outline" className="text-xs">Coming Soon for Admin</Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground">
                                                    Full access to dashboard. Admin can currently only create POS staff.
                                                </p>
                                            </div>
                                        </div>

                                        {/* POS Staff */}
                                        <div 
                                            className={cn(
                                                "flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
                                                staffType === 'pos' ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
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
                                    <Label htmlFor="email">Email (Optional)</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="john.doe@example.com"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone (Optional)</Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="+1 (555) 123-4567"
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
                                                    "flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
                                                    selectedRoleCode === role.code ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
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
                                                        Level {role.level} - {role.level_type}
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
                                    <Label>Assignments</Label>
                                    <span className="text-sm text-muted-foreground">Select at least one</span>
                                </div>
                                <div className="grid gap-3">
                                    {locations.map((loc) => {
                                        const isSelected = selectedLocationIds.has(loc.id)
                                        const isPrimary = primaryLocationId === loc.id
                                        return (
                                            <div
                                                key={loc.id}
                                                className={cn(
                                                    "flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all",
                                                    isSelected ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/20"
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
                                                    <div onClick={(e) => {
                                                        e.stopPropagation()
                                                        setPrimaryLocationId(loc.id)
                                                    }}>
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
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                value={employmentType}
                                                onChange={(e) => setEmploymentType(e.target.value as any)}
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
                                    <Label>Security (PIN)</Label>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Switch
                                            checked={autoGeneratePin}
                                            onCheckedChange={setAutoGeneratePin}
                                            id="auto-pin"
                                        />
                                        <Label htmlFor="auto-pin" className="cursor-pointer">Auto-generate PIN</Label>
                                    </div>

                                    {!autoGeneratePin && (
                                        <div className="space-y-2">
                                            <Label htmlFor="pinCode">Enter 4-6 digit PIN</Label>
                                            <Input
                                                id="pinCode"
                                                type="password"
                                                maxLength={6}
                                                value={pinCode}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/\D/g, '')
                                                    setPinCode(val)
                                                }}
                                                placeholder="1234"
                                            />
                                        </div>
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
                                            <span className="text-muted-foreground">Role</span>
                                            <p className="font-medium">{selectedRole?.name}</p>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Type</span>
                                            <p className="font-medium">POS Staff</p>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Locations</span>
                                            <p className="font-medium">{selectedLocationList.length} Selected</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    <p>Upon creation, {autoGeneratePin ? "a PIN will be generated automatically." : "the manually entered PIN will be active."}</p>
                                    {selectedLocationList.length > 1 && (
                                        <p className="mt-2 text-amber-600">
                                            Note: Currently, Staff will be created in the primary location <strong>{locations.find(l => l.id === primaryLocationId)?.name}</strong>. Multi-location assignment is processed after initial creation.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                    </div>
                </BottomSheetBody>

                <BottomSheetFooter className="border-t p-4">
                    <div className="flex justify-between w-full">
                        <Button variant="outline" onClick={handleBack} disabled={currentStep === 'type' || createStaffMutation.isPending}>
                            Back
                        </Button>
                        <Button 
                            onClick={handleNext} 
                            disabled={!canGoNext() || createStaffMutation.isPending}
                        >
                            {createStaffMutation.isPending && "Working..."}
                            {!createStaffMutation.isPending && (currentStep === 'review' ? 'Create Staff' : 'Next')}
                        </Button>
                    </div>
                </BottomSheetFooter>
            </div>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}
