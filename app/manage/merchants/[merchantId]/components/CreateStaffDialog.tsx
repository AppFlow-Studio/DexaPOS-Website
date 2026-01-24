'use client'

import { useState } from 'react'
import { useAdminCreateStaff, useMerchantStaffRoles } from '@/lib/queries/use-admin-staff'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { EmploymentType } from '@/types/staff'
import type { LocationSummary } from '@/types/merchant'

interface CreateStaffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  locations: LocationSummary[]
  onSuccess: (pin?: string) => void
}

export function CreateStaffDialog({
  open,
  onOpenChange,
  merchantId,
  locations,
  onSuccess,
}: CreateStaffDialogProps) {
  const { data: roles } = useMerchantStaffRoles()
  const createStaffMutation = useAdminCreateStaff()

  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [locationId, setLocationId] = useState('')
  const [roleCode, setRoleCode] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [employmentType, setEmploymentType] = useState<EmploymentType>('full-time')
  const [autoGeneratePin, setAutoGeneratePin] = useState(true)
  const [pin, setPin] = useState('')

  // Filter to only member-level roles (POS staff)
  const posRoles = roles?.filter((r) => r.level_type === 'member') || []

  const resetForm = () => {
    setFirstName('')
    setLastName('')
    setEmail('')
    setPhone('')
    setLocationId('')
    setRoleCode('')
    setHourlyRate('')
    setEmploymentType('full-time')
    setAutoGeneratePin(true)
    setPin('')
  }

  const handleClose = () => {
    resetForm()
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    // Validation
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('First name and last name are required')
      return
    }

    if (!locationId) {
      toast.error('Please select a location')
      return
    }

    if (!roleCode) {
      toast.error('Please select a role')
      return
    }

    if (!autoGeneratePin && (!pin || !/^\d{4,6}$/.test(pin))) {
      toast.error('PIN must be 4-6 digits')
      return
    }

    try {
      const result = await createStaffMutation.mutateAsync({
        merchantId,
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          locationId,
          roleCode,
          hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
          employmentType,
          autoGeneratePin,
          pin: autoGeneratePin ? undefined : pin,
        },
      })

      if (result.success) {
        toast.success('Staff member created successfully')
        handleClose()
        onSuccess(result.pin)
      } else {
        toast.error(result.error || 'Failed to create staff member')
      }
    } catch {
      toast.error('Failed to create staff member')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Staff Member</DialogTitle>
          <DialogDescription>
            Create a new POS-only staff member for this merchant. They will be able to
            access the POS system with a PIN.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name Fields */}
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

          {/* Email (optional) */}
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

          {/* Phone (optional) */}
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

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">Location *</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations
                  .filter((l) => l.is_active)
                  .map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="role">Role *</Label>
            <Select value={roleCode} onValueChange={setRoleCode}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {posRoles.map((role) => (
                  <SelectItem key={role.code} value={role.code}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Employment Type */}
          <div className="space-y-2">
            <Label htmlFor="employmentType">Employment Type</Label>
            <Select
              value={employmentType}
              onValueChange={(value) => setEmploymentType(value as EmploymentType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full-time">Full-time</SelectItem>
                <SelectItem value="part-time">Part-time</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Hourly Rate (optional) */}
          <div className="space-y-2">
            <Label htmlFor="hourlyRate">Hourly Rate (Optional)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                $
              </span>
              <Input
                id="hourlyRate"
                type="number"
                step="0.01"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="0.00"
                className="pl-7"
              />
            </div>
          </div>

          {/* PIN Section */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Checkbox
                id="autoGeneratePin"
                checked={autoGeneratePin}
                onCheckedChange={(checked) => setAutoGeneratePin(checked === true)}
              />
              <Label htmlFor="autoGeneratePin" className="cursor-pointer">
                Auto-generate PIN
              </Label>
            </div>

            {!autoGeneratePin && (
              <div className="space-y-2">
                <Label htmlFor="pin">PIN Code (4-6 digits)</Label>
                <Input
                  id="pin"
                  type="password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => {
                    const value = e.target.value
                    if (/^\d*$/.test(value)) {
                      setPin(value)
                    }
                  }}
                  placeholder="Enter PIN"
                />
              </div>
            )}

            {autoGeneratePin && (
              <p className="text-sm text-muted-foreground">
                A 4-digit PIN will be automatically generated and displayed after
                creation.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createStaffMutation.isPending}
          >
            {createStaffMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Staff
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
