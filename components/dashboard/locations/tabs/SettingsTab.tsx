'use client'
import { useState, useEffect } from 'react'
import { Location } from '@/types/merchant_locations'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
    Settings,
    Power,
    ShoppingCart,
    AlertTriangle,
    Loader2,
    CheckCircle,
    XCircle,
    Globe,
    Layers,
    DollarSign,
    Building2,
    Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { UpdateLocation, ToggleLocationActive, ToggleLocationOrders } from '@/app/dashboard/actions/locations'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useLocationStore } from '@/stores/location-store'
import { useEffectivePricing } from '@/app/dashboard/hooks/useEffectivePricing'
import { LocationTaxComplianceCard } from '@/components/dashboard/locations/LocationTaxComplianceCard'

interface SettingsTabProps {
    location: Location
    onUpdate?: () => void
    onClose: () => void
}

export function SettingsTab({ location, onUpdate, onClose }: SettingsTabProps) {
    const queryClient = useQueryClient()
    const { setSelectedLocation } = useLocationStore()
    const { pricingStrategy: merchantStrategy, dualPricingPercentage: merchantPercentage } = useEffectivePricing()

    const [isTogglingOrders, setIsTogglingOrders] = useState(false)
    const [isTogglingDefaults, setIsTogglingDefaults] = useState(false)
    const [isDeactivating, setIsDeactivating] = useState(false)
    const [showDeactivateDialog, setShowDeactivateDialog] = useState(false)
    const [confirmName, setConfirmName] = useState('')

    // Local state for immediate UI feedback
    const [isAcceptingOrders, setIsAcceptingOrders] = useState(location.is_accepting_orders)
    const [isActive, setIsActive] = useState(location.is_active)
    const [useMerchantDefaults, setUseMerchantDefaults] = useState(location.use_merchant_pricing_defaults)

    // Sync when location prop changes
    useEffect(() => {
        setUseMerchantDefaults(location.use_merchant_pricing_defaults)
    }, [location])

    const handleToggleOrders = async () => {
        setIsTogglingOrders(true)

        // Optimistic update
        setIsAcceptingOrders(!isAcceptingOrders)

        try {
            const result = await ToggleLocationOrders(location.id)

            if (result.error) {
                // Revert on error
                setIsAcceptingOrders(isAcceptingOrders)
                toast.error('Update Failed', { description: result.error })
                return
            }

            const newStatus = result.data?.is_accepting_orders
            setIsAcceptingOrders(newStatus ?? !isAcceptingOrders)

            toast.success(newStatus ? 'Now Accepting Orders' : 'Stopped Accepting Orders', {
                description: newStatus
                    ? 'Customers can now place orders at this location.'
                    : 'This location is no longer accepting new orders.',
                icon: newStatus ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4" />,
            })

            queryClient.invalidateQueries({ queryKey: ['locations'] })
            onUpdate?.()
        } catch (error) {
            setIsAcceptingOrders(isAcceptingOrders)
            toast.error('Update Failed', { description: 'An unexpected error occurred' })
        } finally {
            setIsTogglingOrders(false)
        }
    }

    const handleToggleMerchantDefaults = async (checked: boolean) => {
        setUseMerchantDefaults(checked)
        setIsTogglingDefaults(true)
        try {
            const result = await UpdateLocation(location.id, {
                use_merchant_pricing_defaults: checked,
            })
            if (result.error) {
                setUseMerchantDefaults(!checked)
                toast.error('Update Failed', { description: result.error })
                return
            }
            toast.success(checked ? 'Using Organization Defaults' : 'Using Custom Pricing')
            void Promise.all([
                queryClient.invalidateQueries({ queryKey: ['locations'] }),
                queryClient.invalidateQueries({ queryKey: ['merchant-pricing-defaults'] }),
            ])
            onUpdate?.()
        } catch (error) {
            setUseMerchantDefaults(!checked)
            toast.error('Update Failed', { description: 'An unexpected error occurred' })
        } finally {
            setIsTogglingDefaults(false)
        }
    }

    const handleDeactivate = async () => {
        if (confirmName.toLowerCase() !== location.name.toLowerCase()) {
            toast.error('Confirmation Failed', {
                description: 'Location name does not match. Please type the exact name.'
            })
            return
        }

        setIsDeactivating(true)

        try {
            const result = await ToggleLocationActive(location.id)

            if (result.error) {
                toast.error('Deactivation Failed', { description: result.error })
                return
            }

            const newStatus = result.data?.is_active
            setIsActive(newStatus ?? !isActive)

            toast.success(newStatus ? 'Location Activated' : 'Location Deactivated', {
                description: newStatus
                    ? 'This location is now active and visible.'
                    : 'This location has been deactivated.',
                icon: newStatus ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />,
            })

            queryClient.invalidateQueries({ queryKey: ['locations'] })
            onUpdate?.()
            setShowDeactivateDialog(false)
            setConfirmName('')

            // If deactivating, reset location selection to 'all'
            if (!newStatus) {
                setSelectedLocation('all')
            }
        } catch (error) {
            toast.error('Update Failed', { description: 'An unexpected error occurred' })
        } finally {
            setIsDeactivating(false)
        }
    }

    return (
        <div className="space-y-4">
            {/* Accepting Orders Toggle */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        Order Settings
                    </CardTitle>
                    <CardDescription>Control whether this location accepts orders</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="font-medium">Accept Orders</p>
                            <p className="text-sm text-muted-foreground">
                                {isAcceptingOrders
                                    ? 'Customers can currently place orders here'
                                    : 'Orders are currently disabled for this location'
                                }
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {isTogglingOrders && (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                            <Switch
                                checked={isAcceptingOrders}
                                onCheckedChange={handleToggleOrders}
                                disabled={isTogglingOrders || !isActive}
                            />
                        </div>
                    </div>
                    {!isActive && (
                        <p className="text-sm text-amber-600 mt-3 flex items-center gap-1">
                            <AlertTriangle className="h-4 w-4" />
                            Location must be active to accept orders
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Menu Configuration (Read-only) */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        {location.uses_global_menu ? (
                            <Globe className="h-4 w-4" />
                        ) : (
                            <Layers className="h-4 w-4" />
                        )}
                        Menu Configuration
                    </CardTitle>
                    <CardDescription>How this location manages its menu</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="font-medium">
                                {location.uses_global_menu ? 'Using Global Menu' : 'Custom Menu'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {location.uses_global_menu
                                    ? 'This location uses the merchant\'s main menu'
                                    : 'This location has its own custom menu setup'
                                }
                            </p>
                        </div>
                        <Badge variant="outline">
                            {location.uses_global_menu ? 'Global' : 'Custom'}
                        </Badge>
                    </div>
                </CardContent>
            </Card>

            {/* Pricing Strategy Settings */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Pricing Strategy
                    </CardTitle>
                    <CardDescription>Configure how item prices are calculated</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Use Organization Defaults Toggle */}
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                            <div className="flex items-center gap-3">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                <div>
                                    <p className="text-sm font-medium">Use Organization Defaults</p>
                                    <p className="text-xs text-muted-foreground">
                                        Inherit pricing strategy from your organization settings
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {isTogglingDefaults && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                                <Switch
                                    checked={useMerchantDefaults}
                                    onCheckedChange={handleToggleMerchantDefaults}
                                    disabled={isTogglingDefaults}
                                />
                            </div>
                        </div>

                        {useMerchantDefaults ? (
                            <Alert className="border-blue-200 bg-blue-50/50">
                                <Info className="h-4 w-4 text-blue-600" />
                                <AlertDescription className="text-sm">
                                    <span className="font-medium">Inherited from Organization:</span>{' '}
                                    {merchantStrategy === 'dual'
                                        ? `Dual Pricing at ${merchantPercentage}%`
                                        : 'Manual Pricing'
                                    }
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <>
                                <div className="grid gap-2">
                                    <Label>Pricing Mode</Label>
                                    <Select
                                        defaultValue={location.pricing_strategy || 'manual'}
                                        onValueChange={async (value) => {
                                            try {
                                                const result = await UpdateLocation(location.id, {
                                                    pricing_strategy: value as 'manual' | 'dual'
                                                });
                                                if (result.error) {
                                                    toast.error('Update Failed', { description: result.error });
                                                } else {
                                                    toast.success('Strategy Updated');
                                                    queryClient.invalidateQueries({ queryKey: ['locations'] });
                                                    onUpdate?.();
                                                }
                                            } catch (e) {
                                                toast.error('Update Failed');
                                            }
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select strategy" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="manual">Manual Pricing</SelectItem>
                                            <SelectItem value="dual">Dual Pricing</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-sm text-muted-foreground">
                                        {location.pricing_strategy === 'dual'
                                            ? 'Card prices are automatically calculated based on a percentage markup over cash prices.'
                                            : 'Cash and Card prices are set independently.'}
                                    </p>
                                </div>

                                {location.pricing_strategy === 'dual' && (
                                    <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
                                        <Label>Dual Pricing Percentage (%)</Label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max="100"
                                                defaultValue={location.dual_pricing_percentage ?? 4.0}
                                                onBlur={async (e) => {
                                                    const val = parseFloat(e.target.value);
                                                    if (isNaN(val)) return;
                                                    if (val === location.dual_pricing_percentage) return;

                                                    try {
                                                        const result = await UpdateLocation(location.id, {
                                                            dual_pricing_percentage: val
                                                        });
                                                        if (result.error) {
                                                            toast.error('Update Failed', { description: result.error });
                                                        } else {
                                                            toast.success('Percentage Updated');
                                                            queryClient.invalidateQueries({ queryKey: ['locations'] });
                                                            onUpdate?.();
                                                        }
                                                    } catch (e) {
                                                        toast.error('Update Failed');
                                                    }
                                                }}
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Typical values range from 3.5% to 4.0%
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>

            <LocationTaxComplianceCard location={location} onUpdated={onUpdate} />

            {/* Location Status */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Power className="h-4 w-4" />
                        Location Status
                    </CardTitle>
                    <CardDescription>Active locations are visible to staff and customers</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="font-medium flex items-center gap-2">
                                {isActive ? 'Active' : 'Inactive'}
                                <Badge variant={isActive ? "default" : "secondary"}>
                                    {isActive ? 'Live' : 'Offline'}
                                </Badge>
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {isActive
                                    ? 'This location is currently active and operational'
                                    : 'This location is deactivated and not visible'
                                }
                            </p>
                        </div>
                        <Button
                            variant={isActive ? "outline" : "default"}
                            onClick={() => isActive ? setShowDeactivateDialog(true) : handleDeactivate()}
                            disabled={isDeactivating}
                        >
                            {isDeactivating ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : isActive ? (
                                <Power className="h-4 w-4 mr-1" />
                            ) : (
                                <CheckCircle className="h-4 w-4 mr-1" />
                            )}
                            {isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive/50">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        Danger Zone
                    </CardTitle>
                    <CardDescription>Irreversible actions that affect this location</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="font-medium">Delete Location</p>
                            <p className="text-sm text-muted-foreground">
                                Permanently remove this location and all associated data
                            </p>
                        </div>
                        <Button variant="destructive" size="sm" disabled>
                            Delete Location
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                        * Deletion is only available from the main locations page
                    </p>
                </CardContent>
            </Card>

            {/* Deactivate Confirmation Dialog */}
            <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Deactivate Location
                        </DialogTitle>
                        <DialogDescription>
                            Deactivating this location will make it invisible to customers and prevent
                            new orders. Staff assigned to this location will lose access until it's
                            reactivated.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="confirm-name">
                                Type <span className="font-semibold">"{location.name}"</span> to confirm
                            </Label>
                            <Input
                                id="confirm-name"
                                value={confirmName}
                                onChange={(e) => setConfirmName(e.target.value)}
                                placeholder={location.name}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowDeactivateDialog(false)
                                setConfirmName('')
                            }}
                            disabled={isDeactivating}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeactivate}
                            disabled={isDeactivating || confirmName.toLowerCase() !== location.name.toLowerCase()}
                        >
                            {isDeactivating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    Deactivating...
                                </>
                            ) : (
                                <>
                                    <Power className="h-4 w-4 mr-1" />
                                    Deactivate Location
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    )
}
