'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
    Building2,
    MapPin,
    FileText,
    CreditCard,
    Briefcase,
    Hash,
    Calendar,
    Store,
    Edit,
    Loader2,
    Phone,
    Mail,
    Clock3,
    Globe,
    ShieldCheck
} from 'lucide-react'
import { MerchantDetails } from '@/types/merchant'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useAdminMerchantLocationDetails, useAdminUpdateMerchant } from '@/lib/queries/use-admin-merchant'
import { toast } from 'sonner'
import Link from 'next/link'

interface BusinessInfoTabProps {
    merchantInfo: MerchantDetails
}

// Business type options
const businessTypes = {
    'LLC': 'Limited Liability Company',
    'Corporation': 'Corporation',
    'Sole Proprietor': 'Sole Proprietor',
    'Partnership': 'Partnership'
}

const dayLabels = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday',
} as const

function formatDateTime(value?: string | null) {
    if (!value) return 'Not available'

    return new Date(value).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })
}

export function BusinessInfoTab({ merchantInfo }: BusinessInfoTabProps) {
    // Use locations from merchantInfo directly (since we use MerchantDetails)
    const locationsList = merchantInfo.locations || []

    const locationsLoading = false

    // Get business info from public_metadata or use defaults
    const businessInfo = (merchantInfo?.public_metadata as any) || {}
    const legalBusinessName = businessInfo.legal_business_name || 'Not provided'
    const dbaName = businessInfo.dba_name || 'Not provided'
    const einTaxId = businessInfo.ein_tax_id || 'Not provided'
    const businessType = businessInfo.business_type || 'Not specified'
    const businessLicenseNumber = businessInfo.business_license_number || 'Not provided'

    const formatAddress = (loc: any) => {
        return [loc.address_line1, loc.city, loc.state].filter(Boolean).join(', ')
    }

    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
    const [isLocationDetailsOpen, setIsLocationDetailsOpen] = useState(false)
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
    const updateMutation = useAdminUpdateMerchant()
    const {
        data: selectedLocation,
        isLoading: isLocationDetailsLoading,
        error: locationDetailsError,
    } = useAdminMerchantLocationDetails(merchantInfo.id, selectedLocationId, isLocationDetailsOpen)

    const [formData, setFormData] = useState({
        legal_business_name: '',
        dba_name: '',
        ein_tax_id: '',
        business_type: '',
        business_license_number: '',
        merchant_type: '',
        status: ''
    })

    useEffect(() => {
        if (isEditDialogOpen) {
            setFormData({
                legal_business_name: businessInfo.legal_business_name || '',
                dba_name: businessInfo.dba_name || '',
                ein_tax_id: businessInfo.ein_tax_id || '',
                business_type: businessInfo.business_type || '',
                business_license_number: businessInfo.business_license_number || '',
                merchant_type: businessInfo.merchant_type || '',
                status: businessInfo.status || ''
            })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditDialogOpen])

    const handleSave = async () => {
        try {
            const result = await updateMutation.mutateAsync({
                merchantId: merchantInfo.id,
                updates: {
                    public_metadata: {
                        ...formData
                    }
                }
            })

            if (result.success) {
                toast.success('Business info updated successfully')
                setIsEditDialogOpen(false)
            } else {
                toast.error(result.error || 'Failed to update business info')
            }
        } catch (error) {
            toast.error('An error occurred while updating business info')
        }
    }

    const handleViewLocationDetails = (locationId: string) => {
        setSelectedLocationId(locationId)
        setIsLocationDetailsOpen(true)
    }

    const renderValue = (value?: string | number | null, fallback: string = 'Not provided') => {
        if (value === null || value === undefined || value === '') return fallback
        return value
    }

    const renderBusinessHours = (hours: any) => {
        const orderedDays = Object.keys(dayLabels) as Array<keyof typeof dayLabels>

        return orderedDays.map((day) => {
            const dayHours = hours?.[day]
            const isClosed = !dayHours || dayHours.is_closed

            return (
                <div key={day} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span className="font-medium">{dayLabels[day]}</span>
                    <span className="text-muted-foreground">
                        {isClosed ? 'Closed' : `${dayHours.open} - ${dayHours.close}`}
                    </span>
                </div>
            )
        })
    }

    return (
        <Tabs defaultValue="legal" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="legal">Legal Information</TabsTrigger>
                <TabsTrigger value="locations">Locations</TabsTrigger>
            </TabsList>

            {/* Legal Information Tab */}
            <TabsContent value="legal" className="mt-6">
                <div className="space-y-6">
                    {/* Business Details Card */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">Business Details</CardTitle>
                                    <CardDescription>Legal business information and registration details</CardDescription>
                                </div>
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => setIsEditDialogOpen(true)}
                                >
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <Building2 className="h-4 w-4" />
                                        Legal Business Name
                                    </div>
                                    <div className="text-base font-medium">
                                        {legalBusinessName}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <Briefcase className="h-4 w-4" />
                                        DBA Name (Doing Business As)
                                    </div>
                                    <div className="text-base font-medium">
                                        {dbaName}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <Hash className="h-4 w-4" />
                                        EIN / Tax ID
                                    </div>
                                    <div className="text-base font-medium font-mono">
                                        {einTaxId}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <FileText className="h-4 w-4" />
                                        Business Type
                                    </div>
                                    <div>
                                        <Badge variant="outline" className="text-base px-3 py-1">
                                            {businessType}
                                        </Badge>
                                        {businessType !== 'Not specified' && businessTypes[businessType as keyof typeof businessTypes] && (
                                            <div className="text-sm text-muted-foreground mt-1">
                                                {businessTypes[businessType as keyof typeof businessTypes]}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <CreditCard className="h-4 w-4" />
                                        Business License Number
                                    </div>
                                    <div className="text-base font-medium font-mono">
                                        {businessLicenseNumber}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <Calendar className="h-4 w-4" />
                                        Registration Date
                                    </div>
                                    <div className="text-base font-medium">
                                        {merchantInfo?.created_at
                                            ? new Date(merchantInfo.created_at).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })
                                            : 'Not available'
                                        }
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Additional Information Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Additional Information</CardTitle>
                            <CardDescription>Additional business details and metadata</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                {/* <div className="space-y-2">
                                    <div className="text-sm font-medium text-muted-foreground">Merchant ID</div>
                                    <div className="text-sm font-mono">{merchantInfo?.id || 'N/A'}</div>
                                </div> */}
                                <div className="space-y-2">
                                    <div className="text-sm font-medium text-muted-foreground">Clerk Organization ID</div>
                                    <div className="text-sm font-mono">{merchantInfo?.clerk_org_id || 'N/A'}</div>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-sm font-medium text-muted-foreground">Status</div>
                                    <Badge variant={businessInfo.status === 'active' ? 'default' : 'secondary'}>
                                        {businessInfo.status || 'Unknown'}
                                    </Badge>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-sm font-medium text-muted-foreground">Business Type (Category)</div>
                                    <Badge variant="outline">
                                        {businessInfo.merchant_type || 'Not specified'}
                                    </Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            {/* Locations Tab */}
            <TabsContent value="locations" className="mt-6">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg">Business Locations</CardTitle>
                                <CardDescription>All locations associated with this merchant</CardDescription>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                                <Link href={`/manage/merchants/${merchantInfo.id}/locations/new`}>
                                    <MapPin className="h-4 w-4 mr-2" />
                                    Add Location
                                </Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {locationsLoading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <Skeleton key={i} className="h-16 w-full" />
                                ))}
                            </div>
                        ) : locationsList.length === 0 ? (
                            <Empty>
                                <EmptyHeader>
                                    <EmptyMedia variant="icon">
                                        <MapPin className="h-6 w-6" />
                                    </EmptyMedia>
                                    <EmptyTitle>No locations found</EmptyTitle>
                                    <EmptyDescription>
                                        This merchant doesn't have any locations yet. Add a location to get started.
                                    </EmptyDescription>
                                </EmptyHeader>
                                <EmptyContent>
                                    <Button asChild>
                                        <Link href={`/manage/merchants/${merchantInfo.id}/locations/new`}>
                                            <MapPin className="h-4 w-4 mr-2" />
                                            Add Location
                                        </Link>
                                    </Button>
                                </EmptyContent>
                            </Empty>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Location Name</TableHead>
                                        <TableHead>Address</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {locationsList.map((location) => (
                                        <TableRow key={location.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                                        <Store className="h-5 w-5 text-primary" />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium">{location.name}</div>
                                                        <Badge variant={location.is_active ? "outline" : "secondary"} className="mt-1">
                                                            {location.is_active ? 'Active' : 'Inactive'}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <MapPin className="h-4 w-4" />
                                                    {formatAddress(location)}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {location.is_accepting_orders ? (
                                                     <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">Online</Badge>
                                                ) : (
                                                     <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">Offline</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleViewLocationDetails(location.id)}
                                                >
                                                    View Details
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                {/* Location Statistics */}
                {locationsList.length > 0 && (
                    <div className="grid gap-4 md:grid-cols-3 mt-6">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Locations</CardTitle>
                                <Store className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{locationsList.length}</div>
                                <p className="text-xs text-muted-foreground">
                                    Registered locations
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Primary Location</CardTitle>
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm font-medium">{locationsList[0]?.name || 'N/A'}</div>
                                <p className="text-xs text-muted-foreground">
                                    {formatAddress(locationsList[0]) || 'No address'}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Active Locations</CardTitle>
                                <Store className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {locationsList.filter((l: any) => l.is_active).length}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Accepting orders
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </TabsContent>

            {/* Edit Business Info Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Edit Business Information</DialogTitle>
                        <DialogDescription>
                            Update the legal and registration details for this merchant.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="legal_business_name">Legal Business Name</Label>
                            <Input
                                id="legal_business_name"
                                value={formData.legal_business_name}
                                onChange={(e) => setFormData({ ...formData, legal_business_name: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="dba_name">DBA Name</Label>
                            <Input
                                id="dba_name"
                                value={formData.dba_name}
                                onChange={(e) => setFormData({ ...formData, dba_name: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="ein_tax_id">EIN / Tax ID</Label>
                            <Input
                                id="ein_tax_id"
                                value={formData.ein_tax_id}
                                onChange={(e) => setFormData({ ...formData, ein_tax_id: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="business_type">Business Type</Label>
                            <Select 
                                value={formData.business_type} 
                                onValueChange={(value) => setFormData({ ...formData, business_type: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select business type" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(businessTypes).map(([key, label]) => (
                                        <SelectItem key={key} value={key}>{label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="business_license_number">Business License Number</Label>
                            <Input
                                id="business_license_number"
                                value={formData.business_license_number}
                                onChange={(e) => setFormData({ ...formData, business_license_number: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="merchant_type">Merchant Category</Label>
                            <Input
                                id="merchant_type"
                                value={formData.merchant_type}
                                onChange={(e) => setFormData({ ...formData, merchant_type: e.target.value })}
                                placeholder="e.g. Restaurant, Retail"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="status">Merchant Status</Label>
                            <Select 
                                value={formData.status} 
                                onValueChange={(value) => setFormData({ ...formData, status: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                    <SelectItem value="onboarding">Onboarding</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleSave} 
                            disabled={updateMutation.isPending}
                        >
                            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={isLocationDetailsOpen}
                onOpenChange={(open) => {
                    setIsLocationDetailsOpen(open)
                    if (!open) {
                        setSelectedLocationId(null)
                    }
                }}
            >
                <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>Location Details</DialogTitle>
                        <DialogDescription>
                            Full business, contact, tax, and operating details for this merchant location.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="max-h-[68vh] overflow-y-auto pr-1">
                        {isLocationDetailsLoading ? (
                            <div className="flex min-h-[240px] items-center justify-center">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading location details...
                                </div>
                            </div>
                        ) : locationDetailsError ? (
                            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                                {locationDetailsError instanceof Error
                                    ? locationDetailsError.message
                                    : 'Failed to load location details'}
                            </div>
                        ) : selectedLocation ? (
                            <div className="space-y-6">
                                <div className="rounded-xl border bg-muted/20 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-xl font-semibold">{selectedLocation.name}</h3>
                                                {selectedLocation.code && (
                                                    <Badge variant="outline" className="font-mono">
                                                        {selectedLocation.code}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <MapPin className="h-4 w-4" />
                                                {[
                                                    selectedLocation.address_line1,
                                                    selectedLocation.city,
                                                    selectedLocation.state,
                                                    selectedLocation.postal_code,
                                                ].filter(Boolean).join(', ')}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Badge variant={selectedLocation.is_active ? 'default' : 'secondary'}>
                                                {selectedLocation.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                            <Badge
                                                variant="outline"
                                                className={selectedLocation.is_accepting_orders
                                                    ? 'border-green-200 bg-green-50 text-green-700'
                                                    : 'border-amber-200 bg-amber-50 text-amber-700'}
                                            >
                                                {selectedLocation.is_accepting_orders ? 'Accepting Orders' : 'Not Accepting Orders'}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-6 lg:grid-cols-2">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Overview</CardTitle>
                                            <CardDescription>Core business information for this location.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">Description</div>
                                                    <div className="text-sm">{renderValue(selectedLocation.description)}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                                        <Globe className="h-4 w-4" />
                                                        Timezone
                                                    </div>
                                                    <div className="text-sm">{renderValue(selectedLocation.timezone)}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">Uses Global Menu</div>
                                                    <div className="text-sm">{selectedLocation.uses_global_menu ? 'Yes' : 'No'}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">Onboarding Status</div>
                                                    <div className="text-sm">
                                                        Step {selectedLocation.onboarding_step} {selectedLocation.onboarding_completed ? '(Complete)' : '(In Progress)'}
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Contact</CardTitle>
                                            <CardDescription>Direct contact details for this location.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                                        <Phone className="h-4 w-4" />
                                                        Phone
                                                    </div>
                                                    <div className="text-sm">{renderValue(selectedLocation.phone)}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                                        <Mail className="h-4 w-4" />
                                                        Email
                                                    </div>
                                                    <div className="break-all text-sm">{renderValue(selectedLocation.email)}</div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Address & Geo</CardTitle>
                                            <CardDescription>Full address and coordinate information.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">Address Line 1</div>
                                                    <div className="text-sm">{renderValue(selectedLocation.address_line1)}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">Address Line 2</div>
                                                    <div className="text-sm">{renderValue(selectedLocation.address_line2)}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">City / State</div>
                                                    <div className="text-sm">{`${selectedLocation.city}, ${selectedLocation.state}`}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">Postal Code / Country</div>
                                                    <div className="text-sm">{`${selectedLocation.postal_code} / ${selectedLocation.country}`}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">Latitude</div>
                                                    <div className="text-sm">{renderValue(selectedLocation.latitude)}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">Longitude</div>
                                                    <div className="text-sm">{renderValue(selectedLocation.longitude)}</div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Pricing & Tax</CardTitle>
                                            <CardDescription>Pricing strategy and compliance values for this location.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">Pricing Strategy</div>
                                                    <div className="text-sm capitalize">{renderValue(selectedLocation.pricing_strategy)}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">Dual Pricing %</div>
                                                    <div className="text-sm">
                                                        {selectedLocation.dual_pricing_percentage != null
                                                            ? `${selectedLocation.dual_pricing_percentage}%`
                                                            : 'Not provided'}
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">Use Merchant Pricing Defaults</div>
                                                    <div className="text-sm">{selectedLocation.use_merchant_pricing_defaults ? 'Yes' : 'No'}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">Sales Tax Rate</div>
                                                    <div className="text-sm">
                                                        {selectedLocation.sales_tax_rate != null
                                                            ? `${selectedLocation.sales_tax_rate}%`
                                                            : 'Not provided'}
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                                        <ShieldCheck className="h-4 w-4" />
                                                        Tax Registration Status
                                                    </div>
                                                    <div className="text-sm capitalize">{renderValue(selectedLocation.tax_registration_status)}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">Tax ID</div>
                                                    <div className="font-mono text-sm">{renderValue(selectedLocation.tax_id)}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-muted-foreground">EIN</div>
                                                    <div className="font-mono text-sm">
                                                        {renderValue(selectedLocation.ein || selectedLocation.ein_last_four)}
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Business Hours</CardTitle>
                                        <CardDescription>Operating schedule for each day of the week.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="grid gap-3 md:grid-cols-2">
                                        {renderBusinessHours(selectedLocation.business_hours)}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">System Information</CardTitle>
                                        <CardDescription>Identifiers and audit timestamps for this location.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-1">
                                            <div className="text-sm font-medium text-muted-foreground">Location ID</div>
                                            <div className="break-all font-mono text-sm">{selectedLocation.id}</div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-sm font-medium text-muted-foreground">Merchant ID</div>
                                            <div className="break-all font-mono text-sm">{selectedLocation.merchant_id}</div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                                <Clock3 className="h-4 w-4" />
                                                Created At
                                            </div>
                                            <div className="text-sm">{formatDateTime(selectedLocation.created_at)}</div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                                <Clock3 className="h-4 w-4" />
                                                Updated At
                                            </div>
                                            <div className="text-sm">{formatDateTime(selectedLocation.updated_at)}</div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-border/60 p-4 text-sm text-muted-foreground">
                                No location details found.
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsLocationDetailsOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </Tabs>
    )
}
