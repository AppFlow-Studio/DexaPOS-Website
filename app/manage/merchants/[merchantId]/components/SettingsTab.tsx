'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Settings,
    AlertTriangle,
    Trash2,
    DollarSign,
    MapPin,
    AlertCircle,
    Edit,
    Plus,
    Globe,
} from 'lucide-react'
import { DeleteOrganizationDialog } from '../../../organizations/[organizationId]/components/DeleteOrganizationDialog'
import { useState } from 'react'
import { MerchantInfoModel } from '@/types/db-modles'
import { useQuery } from '@tanstack/react-query'
import { GetLocations } from '../../../../dashboard/actions/locations'
import {
    useAdminMerchantTaxRates,
    useAdminUpsertTaxRate,
    useAdminDeactivateTaxRate,
} from '@/lib/queries/use-admin-tax-rates'
import {
    TAX_CATEGORIES,
    TAX_CATEGORY_LABELS,
    TAX_CATEGORY_DESCRIPTIONS,
    type TaxCategory,
} from '@/types/tax'
import { toast } from 'sonner'
import type { Location } from '@/types/merchant_locations'
import { OnlineStoreTab } from './OnlineStoreTab'

interface SettingsTabProps {
    merchantInfo: MerchantInfoModel
    refetchMerchantInfo: () => void
}

export function SettingsTab({ merchantInfo, refetchMerchantInfo }: SettingsTabProps) {
    const [openDeleteOrganizationDialog, setOpenDeleteOrganizationDialog] = useState(false)
    const [selectedLocationId, setSelectedLocationId] = useState<string>('all')
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [editing, setEditing] = useState<{
        category: TaxCategory
        name: string
        percentage: string
    } | null>(null)

    // Fetch locations for this merchant
    const { data: locationsData, isLoading: locationsLoading } = useQuery({
        queryKey: ['admin', 'merchant-locations', merchantInfo?.clerk_org_id],
        queryFn: () => GetLocations(merchantInfo?.clerk_org_id as string),
        enabled: !!merchantInfo?.clerk_org_id,
    })

    const locations: Location[] = locationsData || []

    // Fetch tax rates for the merchant (or specific location)
    const { data: taxRatesData, isLoading: taxRatesLoading } = useAdminMerchantTaxRates(
        merchantInfo?.id as string,
        selectedLocationId === 'all' ? null : selectedLocationId
    )

    const taxRates = taxRatesData?.data || []

    // Mutations
    const upsertMutation = useAdminUpsertTaxRate()
    const deactivateMutation = useAdminDeactivateTaxRate()

    // ========================================================================
    // Handlers
    // ========================================================================

    const handleEdit = (category: TaxCategory, name?: string, percentage?: number) => {
        if (selectedLocationId === 'all') {
            toast.error('Please select a specific location to edit tax rates')
            return
        }
        setEditing({
            category,
            name: name || `${TAX_CATEGORY_LABELS[category]} Tax`,
            percentage: percentage?.toString() || '0',
        })
        setEditDialogOpen(true)
    }

    const handleSave = async () => {
        if (!editing || selectedLocationId === 'all') return

        const percentage = parseFloat(editing.percentage)
        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
            toast.error('Percentage must be between 0 and 100')
            return
        }

        try {
            const result = await upsertMutation.mutateAsync({
                merchantId: merchantInfo?.id as string,
                locationId: selectedLocationId,
                taxCategory: editing.category,
                name: editing.name,
                percentage,
            })

            if (result.success) {
                toast.success('Tax rate saved successfully')
                setEditDialogOpen(false)
                setEditing(null)
            } else {
                toast.error(result.error || 'Failed to save tax rate')
            }
        } catch (error) {
            toast.error('Failed to save tax rate')
        }
    }

    const handleDelete = async (taxRateId: string) => {
        if (confirm('Are you sure you want to deactivate this tax rate?')) {
            try {
                const result = await deactivateMutation.mutateAsync({
                    merchantId: merchantInfo?.id as string,
                    taxRateId,
                })
                if (result.success) {
                    toast.success('Tax rate deactivated')
                } else {
                    toast.error(result.error || 'Failed to deactivate tax rate')
                }
            } catch (error) {
                toast.error('Failed to deactivate tax rate')
            }
        }
    }

    // Get current location info
    const currentLocation = locations.find((l: Location) => l.id === selectedLocationId)

    // Group tax rates by location for "all" view
    const taxRatesByLocation = React.useMemo(() => {
        if (selectedLocationId !== 'all') return null
        const grouped = new Map<string, typeof taxRates>()
        taxRates.forEach((rate) => {
            const locationRates = grouped.get(rate.location_id) || []
            locationRates.push(rate)
            grouped.set(rate.location_id, locationRates)
        })
        return grouped
    }, [taxRates, selectedLocationId])

    return (
        <>
            <Tabs defaultValue="taxes" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="taxes" className="gap-2">
                        <DollarSign className="h-4 w-4" />
                        Tax Settings
                    </TabsTrigger>
                    <TabsTrigger value="online" className="gap-2">
                        <Globe className="h-4 w-4" />
                        Online Store
                    </TabsTrigger>
                    <TabsTrigger value="general" className="gap-2">
                        <Settings className="h-4 w-4" />
                        General
                    </TabsTrigger>
                </TabsList>

                {/* Tax Settings Tab */}
                <TabsContent value="taxes" className="space-y-6">
                    {/* Location Filter */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Tax Settings</CardTitle>
                                    <CardDescription>
                                        Configure location-specific tax rates for this merchant
                                    </CardDescription>
                                </div>
                                <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                                    <SelectTrigger className="w-[250px]">
                                        <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                                        <SelectValue placeholder="Select location" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Locations</SelectItem>
                                        {locations.map((loc: Location) => (
                                            <SelectItem key={loc.id} value={loc.id}>
                                                {loc.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                    </Card>

                    {/* Info Alert */}
                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>How Tax Categories Work</AlertTitle>
                        <AlertDescription>
                            Items belong to tax categories (e.g., "Alcohol", "Food"). Set the percentage rate for each
                            category at each location. Items will automatically use the rate for their category.
                        </AlertDescription>
                    </Alert>

                    {/* Tax Rates Display */}
                    {selectedLocationId === 'all' ? (
                        // All Locations View - Show summary per location
                        <Card>
                            <CardHeader>
                                <CardTitle>Tax Rates by Location</CardTitle>
                                <CardDescription>
                                    Overview of tax rates across all locations. Select a specific location to edit.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {taxRatesLoading || locationsLoading ? (
                                    <div className="space-y-3">
                                        {[...Array(3)].map((_, i) => (
                                            <Skeleton key={i} className="h-16 w-full" />
                                        ))}
                                    </div>
                                ) : locations.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        No locations found for this merchant
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {locations.map((location: Location) => {
                                            const locationRates = taxRates.filter((r) => r.location_id === location.id)
                                            const hasRates = locationRates.length > 0
                                            return (
                                                <div
                                                    key={location.id}
                                                    className="flex items-center justify-between p-4 border rounded-lg"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                                            <MapPin className="h-5 w-5 text-primary" />
                                                        </div>
                                                        <div>
                                                            <h4 className="font-medium">{location.name}</h4>
                                                            <p className="text-sm text-muted-foreground">
                                                                {hasRates
                                                                    ? `${locationRates.length} tax rate${locationRates.length > 1 ? 's' : ''} configured`
                                                                    : 'No tax rates configured'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {hasRates && (
                                                            <div className="flex gap-1 mr-4">
                                                                {locationRates.slice(0, 3).map((rate) => (
                                                                    <Badge key={rate.id} variant="secondary">
                                                                        {TAX_CATEGORY_LABELS[rate.tax_category as TaxCategory]}: {rate.percentage}%
                                                                    </Badge>
                                                                ))}
                                                                {locationRates.length > 3 && (
                                                                    <Badge variant="outline">
                                                                        +{locationRates.length - 3} more
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        )}
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => setSelectedLocationId(location.id)}
                                                        >
                                                            <Edit className="h-4 w-4 mr-2" />
                                                            {hasRates ? 'Edit' : 'Configure'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        // Specific Location View - Show full tax rate table
                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    Tax Rates for {currentLocation?.name || 'Selected Location'}
                                </CardTitle>
                                <CardDescription>
                                    Configure the tax percentage for each category at this location
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {taxRatesLoading ? (
                                    <div className="space-y-3">
                                        {[...Array(6)].map((_, i) => (
                                            <Skeleton key={i} className="h-12 w-full" />
                                        ))}
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Category</TableHead>
                                                <TableHead>Description</TableHead>
                                                <TableHead>Rate Name</TableHead>
                                                <TableHead className="text-right">Percentage</TableHead>
                                                <TableHead className="text-center">Status</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {TAX_CATEGORIES.map((category) => {
                                                const rate = taxRates.find((r) => r.tax_category === category)
                                                return (
                                                    <TableRow key={category}>
                                                        <TableCell className="font-medium">
                                                            <div className="flex items-center gap-2">
                                                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                                                                {TAX_CATEGORY_LABELS[category]}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-sm text-muted-foreground">
                                                            {TAX_CATEGORY_DESCRIPTIONS[category]}
                                                        </TableCell>
                                                        <TableCell>
                                                            {rate ? (
                                                                rate.name
                                                            ) : (
                                                                <span className="italic text-muted-foreground">
                                                                    Not set
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {rate ? (
                                                                <span className="font-mono font-medium">
                                                                    {rate.percentage}%
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted-foreground">—</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {rate ? (
                                                                <Badge variant="default" className="bg-green-600">
                                                                    Active
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="secondary">Not Set</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex gap-2 justify-end">
                                                                {rate ? (
                                                                    <>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() =>
                                                                                handleEdit(
                                                                                    category,
                                                                                    rate.name,
                                                                                    rate.percentage
                                                                                )
                                                                            }
                                                                        >
                                                                            <Edit className="h-4 w-4" />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => handleDelete(rate.id)}
                                                                        >
                                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                                        </Button>
                                                                    </>
                                                                ) : (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => handleEdit(category)}
                                                                    >
                                                                        <Plus className="h-4 w-4 mr-2" />
                                                                        Add Rate
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* Online Store Tab */}
                <TabsContent value="online" className="space-y-6">
                    <OnlineStoreTab
                        merchantId={merchantInfo?.id as string}
                        locations={locations}
                        locationsLoading={locationsLoading}
                    />
                </TabsContent>

                {/* General Settings Tab */}
                <TabsContent value="general" className="space-y-6">
                    {/* General Settings */}
                    <Card>
                        <CardHeader>
                            <CardTitle>General Settings</CardTitle>
                            <CardDescription>Configure merchant account and preferences</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-12">
                                <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                <h3 className="text-lg font-semibold mb-2">General Settings</h3>
                                <p className="text-sm text-muted-foreground">
                                    Merchant configuration and settings panel coming soon.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Danger Zone */}
                    <Card className="border-destructive">
                        <CardHeader>
                            <CardTitle className="text-destructive flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5" />
                                Danger Zone
                            </CardTitle>
                            <CardDescription>
                                Irreversible and destructive actions. Please proceed with caution.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-destructive/5">
                                    <div className="space-y-1">
                                        <h4 className="font-medium text-destructive">Delete Organization</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Permanently delete this merchant organization and all associated data.
                                            This action cannot be undone.
                                        </p>
                                    </div>
                                    <Button
                                        variant="destructive"
                                        onClick={() => setOpenDeleteOrganizationDialog(true)}
                                        className="ml-4"
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete Organization
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Edit Tax Rate Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editing ? TAX_CATEGORY_LABELS[editing.category] : ''} Tax Rate
                        </DialogTitle>
                        <DialogDescription>
                            {editing ? TAX_CATEGORY_DESCRIPTIONS[editing.category] : ''}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="rate-name">Rate Name</Label>
                            <Input
                                id="rate-name"
                                value={editing?.name || ''}
                                onChange={(e) =>
                                    setEditing((prev) =>
                                        prev ? { ...prev, name: e.target.value } : null
                                    )
                                }
                                placeholder="e.g., NYC Liquor Tax, CA Sales Tax"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="rate-percentage">Percentage</Label>
                            <div className="relative">
                                <Input
                                    id="rate-percentage"
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    max="100"
                                    value={editing?.percentage || ''}
                                    onChange={(e) =>
                                        setEditing((prev) =>
                                            prev ? { ...prev, percentage: e.target.value } : null
                                        )
                                    }
                                    placeholder="8.875"
                                    className="pr-8"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                    %
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Enter the tax percentage (e.g., 8.875 for 8.875%)
                            </p>
                        </div>

                        {editing && parseFloat(editing.percentage) > 0 && (
                            <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Example Calculation</AlertTitle>
                                <AlertDescription>
                                    On a $10.00 item, the tax would be $
                                    {((10 * parseFloat(editing.percentage)) / 100).toFixed(2)}
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setEditDialogOpen(false)
                                setEditing(null)
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={
                                !editing ||
                                !editing.name.trim() ||
                                isNaN(parseFloat(editing.percentage)) ||
                                upsertMutation.isPending
                            }
                        >
                            {upsertMutation.isPending ? 'Saving...' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <DeleteOrganizationDialog
                organizationId={merchantInfo?.clerk_org_id as string}
                organizationName={merchantInfo?.name || 'Merchant'}
                open={openDeleteOrganizationDialog}
                setOpen={setOpenDeleteOrganizationDialog}
                onSuccess={() => refetchMerchantInfo()}
            />
        </>
    )
}
