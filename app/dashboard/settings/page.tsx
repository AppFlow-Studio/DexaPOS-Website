'use client'

// ============================================================================
// Tax Settings Page
// Description: Manage location-specific tax rates
// ============================================================================

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { useLocationTaxRates, useUpsertTaxRate, useDeactivateTaxRate } from '../hooks/useTaxRates'
import { useLocationStore, useIsAllLocations, useSelectedLocation } from '@/stores/location-store'
import { TAX_CATEGORIES, TAX_CATEGORY_LABELS, TAX_CATEGORY_DESCRIPTIONS, TaxCategory } from '@/types/tax'
import { Plus, Edit, Trash2, AlertCircle, DollarSign, MapPin, CreditCard, Monitor, Flame, MonitorPlay, Receipt, Gift, ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'

const SETTINGS_SECTIONS = [
    { title: 'Stations', description: 'POS stations, printers & terminals', href: '/dashboard/settings/stations', icon: Monitor },
    { title: 'Prep Stations', description: 'Kitchen & prep station config', href: '/dashboard/settings/prep-stations', icon: Flame },
    { title: 'Customer Display', description: 'Customer-facing display settings', href: '/dashboard/settings/customer-display', icon: MonitorPlay },
    { title: 'Receipt Templates', description: 'Receipt and ticket design', href: '/dashboard/settings/receipt-templates', icon: Receipt },
    { title: 'Tip Configuration', description: 'Tip pools and distribution rules', href: '/dashboard/settings/tips', icon: DollarSign },
    { title: 'Loyalty', description: 'Loyalty programs and promotions', href: '/dashboard/settings/loyalty', icon: Gift },
    { title: 'Billing', description: 'Payment methods and billing setup', href: '/dashboard/settings/billing', icon: CreditCard },
] as const

// ============================================================================
// Main Component
// ============================================================================

export default function TaxSettingsPage() {
    const isAllLocations = useIsAllLocations()
    const selectedLocation = useSelectedLocation()
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

        const percentage = parseFloat(editing.percentage)
        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
            return
        }

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

    const settingsNav = (
        <div className="space-y-3">
            <div>
                <h2 className="text-xl font-semibold">Settings</h2>
                <p className="text-sm text-muted-foreground">Manage your POS configuration</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {SETTINGS_SECTIONS.map(({ title, description, href, icon: Icon }) => (
                    <Link key={href} href={href}>
                        <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
                            <CardContent className="flex items-center gap-3 p-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                    <Icon className="h-5 w-5 text-primary" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-sm truncate">{title}</p>
                                    <p className="text-xs text-muted-foreground truncate">{description}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    )

    if (isAllLocations) {
        return (
            <div className="space-y-6">
                {settingsNav}
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-2xl font-bold">Tax Settings</h2>
                        <p className="text-muted-foreground">Configure location-specific tax rates</p>
                    </div>
                    <Button variant="outline" asChild>
                        <Link href="/dashboard/settings/billing">
                            <CreditCard className="mr-2 h-4 w-4" />
                            Billing Method
                        </Link>
                    </Button>
                </div>

                <Card>
                    <CardContent className="py-12 flex flex-col items-center justify-center text-center">
                        <MapPin className="h-12 w-12 mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-2">Select a Location</h3>
                        <p className="text-muted-foreground max-w-md">
                            Tax rates are location-specific. Please select a location from the dropdown above to
                            configure tax settings for that location.
                        </p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // ========================================================================
    // Render: Location-Specific View
    // ========================================================================

    return (
        <div className="space-y-6">
            {settingsNav}

            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold">Tax Settings</h2>
                    <p className="text-muted-foreground">
                        Configure tax rates for <span className="font-medium">{selectedLocation?.name}</span>
                    </p>
                </div>
                <Button variant="outline" asChild>
                    <Link href="/dashboard/settings/billing">
                        <CreditCard className="mr-2 h-4 w-4" />
                        Billing Method
                    </Link>
                </Button>
            </div>

            {/* Info Alert */}
            <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>How Tax Categories Work</AlertTitle>
                <AlertDescription>
                    Items belong to tax categories (e.g., "Alcohol", "Food"). Set the percentage rate for each
                    category at this location. Items will automatically use the rate for their category.
                </AlertDescription>
            </Alert>

            {/* Tax Rates Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Tax Rates by Category</CardTitle>
                    <CardDescription>
                        Configure the tax percentage for each category at this location
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[...Array(6)].map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : (
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
                    )}
                </CardContent>
            </Card>

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
        </div>
    )
}
