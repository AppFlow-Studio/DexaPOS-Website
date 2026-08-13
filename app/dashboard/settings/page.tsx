'use client'

// ============================================================================
// Tax Settings Page
// Description: Manage location-specific tax rates
// ============================================================================

import * as React from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { useLocationTaxRates, useUpsertTaxRate, useDeactivateTaxRate } from '../hooks/useTaxRates'
import { useGatedLocationId, useGatedLocation } from '@/stores/location-store'
import { TAX_CATEGORIES, TAX_CATEGORY_LABELS, TAX_CATEGORY_DESCRIPTIONS, TaxCategory } from '@/types/tax'
import { Plus, Edit, Trash2, AlertCircle, DollarSign, MapPin, CreditCard } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import {
    LocationIndicator,
    PageHeader,
    Panel,
    PanelSection,
} from '@/components/dashboard/shell'
import { getTaxPercentageError } from '@/lib/settings/tax-validation'

// ============================================================================
// Main Component
// ============================================================================

export default function TaxSettingsPage() {
    // Resolve to the gated location so single-location accounts (locked to 'all')
    // skip the "Select a Location" prompt. The tax hooks below resolve the same
    // way internally (see useTaxRates), so data/mutations target the one location.
    const isAllLocations = !useGatedLocationId()
    const selectedLocation = useGatedLocation()
    const { data: taxRatesData, isLoading } = useLocationTaxRates()
    const upsertMutation = useUpsertTaxRate()
    const deactivateMutation = useDeactivateTaxRate()

    const [editDialogOpen, setEditDialogOpen] = React.useState(false)
    const [editing, setEditing] = React.useState<{
        category: TaxCategory
        name: string
        percentage: string
    } | null>(null)

    const taxRates = taxRatesData?.data || []
    const percentageError = editing
        ? getTaxPercentageError(editing.percentage)
        : null

    // ========================================================================
    // Handlers
    // ========================================================================

    const handleEdit = (category: TaxCategory, name?: string, percentage?: number) => {
        setEditing({
            category,
            name: name || `${TAX_CATEGORY_LABELS[category]} Tax`,
            percentage: percentage?.toString() || '0',
        })
        setEditDialogOpen(true)
    }

    const handleSave = async () => {
        if (!editing) return

        if (percentageError) return

        const percentage = Number(editing.percentage)

        const result = await upsertMutation.mutateAsync({
            taxCategory: editing.category,
            name: editing.name,
            percentage,
        })

        if (result.success) {
            setEditDialogOpen(false)
            setEditing(null)
        }
    }

    const handleDelete = async (taxRateId: string) => {
        if (confirm('Are you sure you want to deactivate this tax rate?')) {
            await deactivateMutation.mutateAsync(taxRateId)
        }
    }

    // ========================================================================
    // Render: All Locations View (Blocked)
    // ========================================================================

    if (isAllLocations) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="General & tax"
                    subtitle="Configure location-specific tax rates and account billing."
                    indicator={<LocationIndicator isAllLocations locationName={null} />}
                    actions={
                      <Button variant="outline" asChild>
                        <Link href="/dashboard/settings/billing">
                            <CreditCard className="mr-2 h-4 w-4" />
                            Billing Method
                        </Link>
                      </Button>
                    }
                />

                <Panel padded>
                    <div className="flex min-h-64 flex-col items-center justify-center text-center">
                        <MapPin className="h-12 w-12 mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-2">Select a Location</h3>
                        <p className="text-muted-foreground max-w-md">
                            Tax rates are location-specific. Please select a location from the dropdown above to
                            configure tax settings for that location.
                        </p>
                    </div>
                </Panel>
            </div>
        )
    }

    // ========================================================================
    // Render: Location-Specific View
    // ========================================================================

    return (
        <div className="space-y-6">
            <PageHeader
                title="General & tax"
                subtitle="Configure tax categories and rates for this location."
                indicator={
                    <LocationIndicator
                        isAllLocations={false}
                        locationName={selectedLocation?.name}
                    />
                }
                actions={
                  <Button variant="outline" asChild>
                    <Link href="/dashboard/settings/billing">
                        <CreditCard className="mr-2 h-4 w-4" />
                        Billing Method
                    </Link>
                  </Button>
                }
            />

            {/* Info Alert */}
            <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>How Tax Categories Work</AlertTitle>
                <AlertDescription>
                    Items belong to tax categories (e.g., &quot;Alcohol&quot;, &quot;Food&quot;). Set the percentage rate for each
                    category at this location. Items will automatically use the rate for their category.
                </AlertDescription>
            </Alert>

            <Panel>
                <PanelSection
                    icon={DollarSign}
                    label="Tax rates by category"
                    caption="Configure the tax percentage for each category at this location."
                >
                    {isLoading ? (
                        <div className="space-y-3">
                            {[...Array(6)].map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                        <Table className="min-w-[600px]">
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
                                                    <span className="italic text-muted-foreground">Not set</span>
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
                        </div>
                    )}
                </PanelSection>
            </Panel>

            {/* Edit Dialog */}
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
                                    aria-invalid={Boolean(percentageError)}
                                    aria-describedby="rate-percentage-help"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                    %
                                </span>
                            </div>
                            <p
                                id="rate-percentage-help"
                                className={percentageError
                                    ? 'text-xs text-destructive'
                                    : 'text-xs text-muted-foreground'}
                                role={percentageError ? 'alert' : undefined}
                            >
                                {percentageError || 'Enter the tax percentage (e.g., 8.875 for 8.875%)'}
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
                                Boolean(percentageError) ||
                                upsertMutation.isPending
                            }
                        >
                            {upsertMutation.isPending ? 'Saving...' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
