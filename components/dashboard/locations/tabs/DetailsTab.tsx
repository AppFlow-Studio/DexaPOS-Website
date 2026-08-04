'use client'

import { useState } from 'react'
import { Location, US_STATES, US_TIMEZONES, UpdateLocationInput } from '@/types/merchant_locations'
import { Button } from '@/components/ui/button'
import {
    LocationPanelSection,
    roundedFields,
    roundedSelectContent,
    roundedPhoneInput,
    phoneInputFilledVars,
    pillButton,
} from '../LocationPanelSection'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { normalizePhone, formatPhoneForDisplay } from '@/lib/phone'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Edit,
    X,
    Save,
    Building2,
    Phone,
    Mail,
    MapPin,
    Globe,
    Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import { UpdateLocation } from '@/app/dashboard/actions/locations'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'

interface DetailsTabProps {
    location: Location
    onUpdate?: () => void
    setHasUnsavedChanges: (value: boolean) => void
}

type EditSection = 'basic' | 'contact' | 'address' | null

export function DetailsTab({ location, onUpdate, setHasUnsavedChanges }: DetailsTabProps) {
    const queryClient = useQueryClient()
    const [editSection, setEditSection] = useState<EditSection>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Form state
    const [basicInfo, setBasicInfo] = useState({
        name: location.name,
        code: location.code || '',
        description: location.description || '',
    })

    const [contactInfo, setContactInfo] = useState({
        phone: location.phone || '',
        email: location.email || '',
    })

    const [addressInfo, setAddressInfo] = useState({
        address_line1: location.address_line1,
        address_line2: location.address_line2 || '',
        city: location.city,
        state: location.state,
        postal_code: location.postal_code,
        country: location.country || 'US',
        timezone: location.timezone,
        latitude: location.latitude as number | null,
        longitude: location.longitude as number | null,
    })

    const handleStartEdit = (section: EditSection) => {
        // Reset form data to current location values
        if (section === 'basic') {
            setBasicInfo({
                name: location.name,
                code: location.code || '',
                description: location.description || '',
            })
        } else if (section === 'contact') {
            setContactInfo({
                phone: location.phone || '',
                email: location.email || '',
            })
        } else if (section === 'address') {
            setAddressInfo({
                address_line1: location.address_line1,
                address_line2: location.address_line2 || '',
                city: location.city,
                state: location.state,
                postal_code: location.postal_code,
                country: location.country || 'US',
                timezone: location.timezone,
                latitude: location.latitude as number | null,
                longitude: location.longitude as number | null,
            })
        }
        setEditSection(section)
        setHasUnsavedChanges(true)
    }

    const handleCancel = () => {
        setEditSection(null)
        setHasUnsavedChanges(false)
    }

    const handleSave = async (section: EditSection) => {
        if (!section) return

        setIsSaving(true)

        let updateData: UpdateLocationInput = {}

        if (section === 'basic') {
            if (!basicInfo.name.trim()) {
                toast.error('Validation Error', { description: 'Location name is required' })
                setIsSaving(false)
                return
            }
            updateData = {
                name: basicInfo.name.trim(),
                code: basicInfo.code.trim() || undefined,
                description: basicInfo.description.trim() || undefined,
            }
        } else if (section === 'contact') {
            updateData = {
                phone: (normalizePhone(contactInfo.phone) ?? contactInfo.phone.trim()) || undefined,
                email: contactInfo.email.trim() || undefined,
            }
        } else if (section === 'address') {
            if (!addressInfo.address_line1.trim() || !addressInfo.city.trim() || !addressInfo.state || !addressInfo.postal_code.trim()) {
                toast.error('Validation Error', { description: 'Address, city, state, and ZIP code are required' })
                setIsSaving(false)
                return
            }
            updateData = {
                address_line1: addressInfo.address_line1.trim(),
                address_line2: addressInfo.address_line2.trim() || undefined,
                city: addressInfo.city.trim(),
                state: addressInfo.state,
                postal_code: addressInfo.postal_code.trim(),
                country: addressInfo.country.trim() || 'US',
                latitude: addressInfo.latitude,
                longitude: addressInfo.longitude,
                timezone: addressInfo.timezone,
            }
        }

        try {
            const result = await UpdateLocation(location.id, updateData)

            if (result.error) {
                toast.error('Update Failed', { description: result.error })
                return
            }

            toast.success('Location Updated', {
                description: `${section.charAt(0).toUpperCase() + section.slice(1)} information saved successfully.`,
                icon: <Save className="h-4 w-4" />,
            })

            queryClient.invalidateQueries({ queryKey: ['locations'] })
            onUpdate?.()
            setEditSection(null)
            setHasUnsavedChanges(false)
        } catch (error) {
            toast.error('Update Failed', { description: 'An unexpected error occurred' })
        } finally {
            setIsSaving(false)
        }
    }

    const getTimezoneLabel = (tz: string) => {
        return US_TIMEZONES.find(t => t.value === tz)?.label || tz
    }

    const getStateName = (code: string) => {
        return US_STATES.find(s => s.code === code)?.name || code
    }

    return (
        <div className="space-y-4">
            {/* Basic Information */}
            <LocationPanelSection
                icon={Building2}
                title="Basic Information"
                description="Location name and identifier"
                action={
                    editSection !== 'basic' && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className={pillButton}
                            onClick={() => handleStartEdit('basic')}
                        >
                            <Edit className="h-4 w-4" />
                            Edit
                        </Button>
                    )
                }
            >
                    {editSection === 'basic' ? (
                        <div className={cn('space-y-4 animate-in fade-in duration-200', roundedFields)}>
                            <div className="space-y-2">
                                <Label htmlFor="name">Location Name *</Label>
                                <Input
                                    id="name"
                                    value={basicInfo.name}
                                    onChange={(e) => setBasicInfo(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g., Downtown Branch"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="code">Location Code</Label>
                                <Input
                                    id="code"
                                    value={basicInfo.code}
                                    onChange={(e) => setBasicInfo(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                    placeholder="e.g., NYC-01"
                                    className="font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={basicInfo.description}
                                    onChange={(e) => setBasicInfo(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="A brief description of this location..."
                                    rows={3}
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-2">
                                <Button onClick={() => handleSave('basic')} disabled={isSaving} size="sm" className={pillButton}>
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4" />
                                    )}
                                    Save
                                </Button>
                                <Button variant="ghost" size="sm" className={pillButton} onClick={handleCancel} disabled={isSaving}>
                                    <X className="h-4 w-4" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div>
                                <p className="text-[1.0625rem] font-medium leading-tight tracking-[-0.01em]">
                                    {location.name}
                                </p>
                                {location.code && (
                                    <p className="mt-1 text-[0.8125rem] text-muted-foreground font-mono">{location.code}</p>
                                )}
                            </div>
                            {location.description && (
                                <p className="text-sm text-muted-foreground">{location.description}</p>
                            )}
                        </div>
                    )}
            </LocationPanelSection>

            {/* Contact Information */}
            <LocationPanelSection
                icon={Phone}
                title="Contact Information"
                description="Phone and email for this location"
                action={
                    editSection !== 'contact' && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className={pillButton}
                            onClick={() => handleStartEdit('contact')}
                        >
                            <Edit className="h-4 w-4" />
                            Edit
                        </Button>
                    )
                }
            >
                    {editSection === 'contact' ? (
                        <div className={cn('space-y-4 animate-in fade-in duration-200', roundedFields)}>
                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone Number</Label>
                                <PhoneInput
                                    id="phone"
                                    value={contactInfo.phone}
                                    onChange={(e164) => setContactInfo(prev => ({ ...prev, phone: e164 }))}
                                    className={roundedPhoneInput}
                                    style={phoneInputFilledVars}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <Input
                                    id="email"
                                    value={contactInfo.email}
                                    onChange={(e) => setContactInfo(prev => ({ ...prev, email: e.target.value }))}
                                    placeholder="location@example.com"
                                    type="email"
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-2">
                                <Button onClick={() => handleSave('contact')} disabled={isSaving} size="sm" className={pillButton}>
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4" />
                                    )}
                                    Save
                                </Button>
                                <Button variant="ghost" size="sm" className={pillButton} onClick={handleCancel} disabled={isSaving}>
                                    <X className="h-4 w-4" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between gap-4 py-2.5">
                                <span className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
                                    <Phone className="h-4 w-4 shrink-0" />
                                    Phone
                                </span>
                                <span className={cn('text-sm tabular-nums', !location.phone && 'text-muted-foreground')}>
                                    {location.phone ? formatPhoneForDisplay(location.phone) : 'Not set'}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-4 py-2.5">
                                <span className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
                                    <Mail className="h-4 w-4 shrink-0" />
                                    Email
                                </span>
                                <span className={cn('text-sm truncate', !location.email && 'text-muted-foreground')}>
                                    {location.email || 'Not set'}
                                </span>
                            </div>
                        </div>
                    )}
            </LocationPanelSection>

            {/* Address */}
            <LocationPanelSection
                icon={MapPin}
                title="Address"
                description="Physical location and timezone"
                action={
                    editSection !== 'address' && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className={pillButton}
                            onClick={() => handleStartEdit('address')}
                        >
                            <Edit className="h-4 w-4" />
                            Edit
                        </Button>
                    )
                }
            >
                    {editSection === 'address' ? (
                        <div className={cn('space-y-4 animate-in fade-in duration-200', roundedFields)}>
                            <div className="space-y-2">
                                <Label htmlFor="address_line1">Address Line 1 *</Label>
                                <AddressAutocomplete
                                    id="address_line1"
                                    value={addressInfo.address_line1}
                                    onInputChange={(v) => setAddressInfo(prev => ({ ...prev, address_line1: v }))}
                                    onAddressSelected={(parts) => setAddressInfo(prev => ({
                                        ...prev,
                                        address_line1: parts.address_line1,
                                        city: parts.city,
                                        state: parts.state,
                                        postal_code: parts.postal_code,
                                        country: parts.country || 'US',
                                        latitude: parts.latitude,
                                        longitude: parts.longitude,
                                    }))}
                                    placeholder="123 Main St"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="address_line2">Address Line 2</Label>
                                <Input
                                    id="address_line2"
                                    value={addressInfo.address_line2}
                                    onChange={(e) => setAddressInfo(prev => ({ ...prev, address_line2: e.target.value }))}
                                    placeholder="Suite 100"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="city">City *</Label>
                                    <Input
                                        id="city"
                                        value={addressInfo.city}
                                        onChange={(e) => setAddressInfo(prev => ({ ...prev, city: e.target.value }))}
                                        placeholder="New York"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="state">State *</Label>
                                    <Select
                                        value={addressInfo.state}
                                        onValueChange={(value) => setAddressInfo(prev => ({ ...prev, state: value }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select state" />
                                        </SelectTrigger>
                                        <SelectContent className={roundedSelectContent}>
                                            {US_STATES.map((state) => (
                                                <SelectItem key={state.code} value={state.code}>
                                                    {state.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="postal_code">ZIP Code *</Label>
                                    <Input
                                        id="postal_code"
                                        value={addressInfo.postal_code}
                                        onChange={(e) => setAddressInfo(prev => ({ ...prev, postal_code: e.target.value }))}
                                        placeholder="10001"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="country">Country</Label>
                                    <Input
                                        id="country"
                                        value={addressInfo.country}
                                        onChange={(e) => setAddressInfo(prev => ({ ...prev, country: e.target.value }))}
                                        placeholder="US"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="timezone">Timezone</Label>
                                <Select
                                    value={addressInfo.timezone}
                                    onValueChange={(value) => setAddressInfo(prev => ({ ...prev, timezone: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select timezone" />
                                    </SelectTrigger>
                                    <SelectContent className={roundedSelectContent}>
                                        {US_TIMEZONES.map((tz) => (
                                            <SelectItem key={tz.value} value={tz.value}>
                                                {tz.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-2">
                                <Button onClick={() => handleSave('address')} disabled={isSaving} size="sm" className={pillButton}>
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4" />
                                    )}
                                    Save
                                </Button>
                                <Button variant="ghost" size="sm" className={pillButton} onClick={handleCancel} disabled={isSaving}>
                                    <X className="h-4 w-4" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-start justify-between gap-4 py-2.5">
                                <span className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
                                    <Building2 className="h-4 w-4 shrink-0" />
                                    Address
                                </span>
                                <div className="text-sm text-right leading-snug min-w-0">
                                    <p>{location.address_line1}</p>
                                    {location.address_line2 && <p>{location.address_line2}</p>}
                                    <p>{location.city}, {getStateName(location.state)} {location.postal_code}</p>
                                    {location.country && location.country !== 'US' && (
                                        <p className="text-muted-foreground">{location.country}</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-4 py-2.5">
                                <span className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
                                    <Globe className="h-4 w-4 shrink-0" />
                                    Timezone
                                </span>
                                <span className="text-sm">{getTimezoneLabel(location.timezone)}</span>
                            </div>
                        </div>
                    )}
            </LocationPanelSection>
        </div>
    )
}

