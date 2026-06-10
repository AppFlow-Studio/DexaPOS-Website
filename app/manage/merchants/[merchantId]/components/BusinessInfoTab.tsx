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
    DollarSign
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
import { useRouter, useSearchParams } from 'next/navigation'
import { AdminLocationDetailSheet } from './AdminLocationDetailSheet'

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

export function BusinessInfoTab({ merchantInfo }: BusinessInfoTabProps) {
    const searchParams = useSearchParams()
    const router = useRouter()
    // Use locations from merchantInfo directly (since we use MerchantDetails)
    const locationsList = merchantInfo.locations || []

    const locationsLoading = false

    // Read business info from merchant columns directly
    const legalBusinessName = merchantInfo?.business_legal_name || 'Not provided'
    const dbaName = merchantInfo?.dba_name || merchantInfo?.name || 'Not provided'
    const einTaxId = merchantInfo?.ein_last_four ? `****${merchantInfo.ein_last_four}` : 'Not provided'
    const businessType = merchantInfo?.business_type || 'Not specified'
    const businessLicenseNumber = (merchantInfo?.public_metadata as any)?.business_license_number || 'Not provided'
    const pricingStrategy = merchantInfo?.pricing_strategy || 'manual'
    const dualPricingPercentage = merchantInfo?.dual_pricing_percentage ?? 4
    const pricingStrategyLabel = pricingStrategy === 'dual'
        ? `Dual Pricing (${dualPricingPercentage}% cash discount)`
        : 'No Surcharge (Manual Pricing)'

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
        status: '',
        pricing_strategy: 'manual' as 'manual' | 'dual',
        dual_pricing_percentage: 4
    })

    useEffect(() => {
        if (isEditDialogOpen) {
            setFormData({
                legal_business_name: merchantInfo?.business_legal_name || '',
                dba_name: merchantInfo?.dba_name || '',
                ein_tax_id: merchantInfo?.ein_last_four || '',
                business_type: merchantInfo?.business_type || '',
                business_license_number: (merchantInfo?.public_metadata as any)?.business_license_number || '',
                merchant_type: merchantInfo?.business_type || '',
                status: merchantInfo?.onboarding_status || '',
                pricing_strategy: (merchantInfo?.pricing_strategy as 'manual' | 'dual') || 'manual',
                dual_pricing_percentage: merchantInfo?.dual_pricing_percentage ?? 4
            })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditDialogOpen])

    const handleSave = async () => {
        try {
            const result = await updateMutation.mutateAsync({
                merchantId: merchantInfo.id,
                updates: {
                    business_legal_name: formData.legal_business_name || null,
                    dba_name: formData.dba_name || null,
                    ein_last_four: formData.ein_tax_id || null,
                    business_type: formData.business_type || null,
                    pricing_strategy: formData.pricing_strategy,
                    ...(formData.pricing_strategy === 'dual'
                        ? { dual_pricing_percentage: formData.dual_pricing_percentage }
                        : {}),
                }
            })

            if (result.success) {
                toast.success('Business info updated successfully')
                setIsEditDialogOpen(false)
            } else {
                toast.error(result.error || 'Failed to update business info')
            }
        } catch {
            toast.error('An error occurred while updating business info')
        }
    }

    const handleViewLocationDetails = (locationId: string) => {
        setSelectedLocationId(locationId)
        setIsLocationDetailsOpen(true)
    }

    useEffect(() => {
        const openLocationId = searchParams.get('openLocation')
        if (!openLocationId || isLocationDetailsOpen || selectedLocationId) return

        const exists = locationsList.some((location) => location.id === openLocationId)
        if (!exists) return

        setSelectedLocationId(openLocationId)
        setIsLocationDetailsOpen(true)
    }, [isLocationDetailsOpen, locationsList, searchParams, selectedLocationId])

    const handleLocationSheetOpenChange = (open: boolean) => {
        setIsLocationDetailsOpen(open)

        if (!open) {
            setSelectedLocationId(null)

            if (searchParams.get('openLocation')) {
                const next = new URLSearchParams(searchParams.toString())
                next.delete('openLocation')
                const query = next.toString()
                router.replace(
                    query ? `/manage/merchants/${merchantInfo.id}?${query}` : `/manage/merchants/${merchantInfo.id}`,
                    { scroll: false }
                )
            }
        }
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
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle className="text-lg">Business Details</CardTitle>
                                    <CardDescription>Legal business information and registration details</CardDescription>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="self-start sm:self-auto shrink-0"
                                    onClick={() => setIsEditDialogOpen(true)}
                                >
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
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

                                <div className="space-y-2 min-w-0">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <FileText className="h-4 w-4 shrink-0" />
                                        Business Type
                                    </div>
                                    <div>
                                        <Badge variant="outline" className="text-sm px-2 py-0.5">
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

                                <div className="space-y-2 min-w-0">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <DollarSign className="h-4 w-4 shrink-0" />
                                        Default Pricing Strategy
                                    </div>
                                    <div>
                                        <Badge variant="outline" className="text-sm px-2 py-0.5 whitespace-normal break-words">
                                            {pricingStrategyLabel}
                                        </Badge>
                                        <div className="text-sm text-muted-foreground mt-1">
                                            Applies to all locations unless individually overridden.
                                        </div>
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
                            <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
                                {/* <div className="space-y-2">
                                    <div className="text-sm font-medium text-muted-foreground">Merchant ID</div>
                                    <div className="text-sm font-mono">{merchantInfo?.id || 'N/A'}</div>
                                </div> */}
                                <div className="space-y-2 min-w-0">
                                    <div className="text-sm font-medium text-muted-foreground">Clerk Organization ID</div>
                                    <div className="text-sm font-mono break-all">{merchantInfo?.clerk_org_id || 'N/A'}</div>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-sm font-medium text-muted-foreground">Status</div>
                                    <Badge variant={merchantInfo?.onboarding_status === 'active' ? 'default' : 'secondary'}>
                                        {merchantInfo?.onboarding_status || 'Unknown'}
                                    </Badge>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-sm font-medium text-muted-foreground">Business Type (Category)</div>
                                    <Badge variant="outline">
                                        {merchantInfo?.business_type || 'Not specified'}
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
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <CardTitle className="text-lg">Business Locations</CardTitle>
                                <CardDescription>All locations associated with this merchant</CardDescription>
                            </div>
                            <Button variant="outline" size="sm" className="self-start sm:self-auto shrink-0" asChild>
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
                            <div className="overflow-x-auto">
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
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Location Statistics */}
                {locationsList.length > 0 && (
                    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 mt-6">
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
                <DialogContent >
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
                            <Label htmlFor="pricing_strategy">Default Pricing Strategy</Label>
                            <Select
                                value={formData.pricing_strategy}
                                onValueChange={(value) =>
                                    setFormData({ ...formData, pricing_strategy: value as 'manual' | 'dual' })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select pricing strategy" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="manual">No Surcharge (Manual Pricing)</SelectItem>
                                    <SelectItem value="dual">Dual Pricing (Cash Discount)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {formData.pricing_strategy === 'dual' && (
                            <div className="space-y-2">
                                <Label htmlFor="dual_pricing_percentage">Cash Discount %</Label>
                                <Input
                                    id="dual_pricing_percentage"
                                    type="number"
                                    min={0}
                                    max={100}
                                    step="0.1"
                                    value={formData.dual_pricing_percentage}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            dual_pricing_percentage: Number(e.target.value),
                                        })
                                    }
                                />
                            </div>
                        )}

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

            {!isLocationDetailsLoading && !locationDetailsError ? (
                <AdminLocationDetailSheet
                    merchantId={merchantInfo.id}
                    location={selectedLocation ?? null}
                    open={isLocationDetailsOpen}
                    onOpenChange={handleLocationSheetOpenChange}
                />
            ) : null}

        </Tabs>
    )
}
