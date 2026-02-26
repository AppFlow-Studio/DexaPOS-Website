'use client'

import { useState } from 'react'
import { Location, US_STATES, US_TIMEZONES, UpdateLocationInput } from '@/types/merchant_locations'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
                phone: contactInfo.phone.trim() || undefined,
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
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Basic Information
                        </CardTitle>
                        <CardDescription>Location name and identifier</CardDescription>
                    </div>
                    {editSection !== 'basic' && (
                        <Button variant="ghost" size="sm" onClick={() => handleStartEdit('basic')}>
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {editSection === 'basic' ? (
                        <div className="space-y-4 animate-in fade-in duration-200">
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
                            <div className="flex items-center gap-2 pt-2">
                                <Button onClick={() => handleSave('basic')} disabled={isSaving} size="sm">
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4 mr-1" />
                                    )}
                                    Save
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                                    <X className="h-4 w-4 mr-1" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div>
                                <p className="font-medium">{location.name}</p>
                                {location.code && (
                                    <p className="text-sm text-muted-foreground font-mono">{location.code}</p>
                                )}
                            </div>
                            {location.description && (
                                <p className="text-sm text-muted-foreground">{location.description}</p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Contact Information
                        </CardTitle>
                        <CardDescription>Phone and email for this location</CardDescription>
                    </div>
                    {editSection !== 'contact' && (
                        <Button variant="ghost" size="sm" onClick={() => handleStartEdit('contact')}>
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {editSection === 'contact' ? (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone Number</Label>
                                <Input
                                    id="phone"
                                    value={contactInfo.phone}
                                    onChange={(e) => setContactInfo(prev => ({ ...prev, phone: e.target.value }))}
                                    placeholder="(123) 456-7890"
                                    type="tel"
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
                            <div className="flex items-center gap-2 pt-2">
                                <Button onClick={() => handleSave('contact')} disabled={isSaving} size="sm">
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4 mr-1" />
                                    )}
                                    Save
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                                    <X className="h-4 w-4 mr-1" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {location.phone ? (
                                <div className="flex items-center gap-2 text-sm">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    <span>{location.phone}</span>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No phone number</p>
                            )}
                            {location.email ? (
                                <div className="flex items-center gap-2 text-sm">
                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                    <span>{location.email}</span>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No email address</p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Address */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            Address
                        </CardTitle>
                        <CardDescription>Physical location and timezone</CardDescription>
                    </div>
                    {editSection !== 'address' && (
                        <Button variant="ghost" size="sm" onClick={() => handleStartEdit('address')}>
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {editSection === 'address' ? (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="space-y-2">
                                <Label htmlFor="address_line1">Address Line 1 *</Label>
                                <Input
                                    id="address_line1"
                                    value={addressInfo.address_line1}
                                    onChange={(e) => setAddressInfo(prev => ({ ...prev, address_line1: e.target.value }))}
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
                            <div className="grid grid-cols-2 gap-4">
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
                                        <SelectContent>
                                            {US_STATES.map((state) => (
                                                <SelectItem key={state.code} value={state.code}>
                                                    {state.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
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
                                    <SelectContent>
                                        {US_TIMEZONES.map((tz) => (
                                            <SelectItem key={tz.value} value={tz.value}>
                                                {tz.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                                <Button onClick={() => handleSave('address')} disabled={isSaving} size="sm">
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4 mr-1" />
                                    )}
                                    Save
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                                    <X className="h-4 w-4 mr-1" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="text-sm">
                                <p>{location.address_line1}</p>
                                {location.address_line2 && <p>{location.address_line2}</p>}
                                <p>{location.city}, {getStateName(location.state)} {location.postal_code}</p>
                                {location.country && location.country !== 'US' && (
                                    <p className="text-muted-foreground">{location.country}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
                                <Globe className="h-4 w-4" />
                                <span>{getTimezoneLabel(location.timezone)}</span>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

