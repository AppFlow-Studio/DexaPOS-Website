'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    ArrowLeft,
    Globe,
    Store,
    Palette,
    Truck,
    CreditCard,
    Zap,
    Phone,
    Mail,
    Plus,
    Edit,
    Check,
    X,
    DollarSign,
    Percent,
    Bell,
    ExternalLink,
    Loader2,
    Plug,
    AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Location } from '@/types/merchant_locations'
import {
    useAdminOnlineOrderingOverview,
    useAdminOnlineOrderingSettings,
    useAdminSaveOnlineOrderingSettings,
    useAdminToggleOnlineStore,
    useAdminCreateOnlineStore,
    useAdminRetriggerDomainWhitelist,
    type OnlineOrderingSettings,
    type LocationOnlineStoreOverview,
} from '@/lib/queries/use-admin-online-ordering'
import { useAdminOrderOutStatus, useAdminOnboardOrderOut } from '@/lib/queries/use-admin-orderout'
import { OrderOutOnboardingForm, type OnboardingFormData } from '@/components/dashboard/orderout/OrderOutOnboardingForm'
import { OrderOutStatusCard } from '@/components/dashboard/orderout/OrderOutStatusCard'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000'

function getStoreUrl(slug: string): string {
    if (!slug) return ''

    const isDev = ROOT_DOMAIN.includes('localhost')
    if (isDev) return `http://${slug}.localhost:3000`
    return `https://${slug}.dexaposai.com`
}

interface OnlineStoreTabProps {
    merchantId: string
    merchantName: string
    locations: Location[]
    locationsLoading: boolean
}

export function OnlineStoreTab({ merchantId, merchantName, locations, locationsLoading }: OnlineStoreTabProps) {
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)

    // Fetch overview of all locations
    const { data: overviewData, isLoading: overviewLoading } = useAdminOnlineOrderingOverview(merchantId)
    const overview = overviewData?.data || []

    // Fetch settings for selected location
    const { data: settingsData, isLoading: settingsLoading, refetch: refetchSettings } = useAdminOnlineOrderingSettings(
        merchantId,
        selectedLocationId || ''
    )

    // Local state for editing
    const [localSettings, setLocalSettings] = useState<Partial<OnlineOrderingSettings> | null>(null)
    const [isDirty, setIsDirty] = useState(false)

    // Mutations
    const saveMutation = useAdminSaveOnlineOrderingSettings()
    const toggleMutation = useAdminToggleOnlineStore()
    const createMutation = useAdminCreateOnlineStore()
    const whitelistMutation = useAdminRetriggerDomainWhitelist()

    // OrderOut
    const { data: orderOutData } = useAdminOrderOutStatus(merchantId)
    const orderOutStatus = orderOutData?.data
    const onboardOrderOut = useAdminOnboardOrderOut()
    const [showOrderOutForm, setShowOrderOutForm] = useState(false)

    const handleWhitelistDomain = async () => {
        if (!selectedLocationId) return
        try {
            const result = await whitelistMutation.mutateAsync({ merchantId, locationId: selectedLocationId })
            if (result.skipped) {
                toast.info('Dejavoo whitelist API key is not configured, request was skipped')
                return
            }
            if (result.success) {
                toast.success('Store domain was whitelisted successfully')
                return
            }
            toast.error(result.error || 'Domain whitelist failed')
        } catch {
            toast.error('Failed to call domain whitelist')
        }
    }

    // Sync local settings when server data changes
    useEffect(() => {
        if (settingsData?.data) {
            setLocalSettings(settingsData.data)
            setIsDirty(false)
        }
    }, [settingsData])

    // Update local settings
    const updateSettings = (updates: Partial<OnlineOrderingSettings>) => {
        setLocalSettings((prev) => (prev ? { ...prev, ...updates } : updates))
        setIsDirty(true)
    }

    // Save settings
    const handleSave = async () => {
        if (!selectedLocationId || !localSettings) return

        try {
            const result = await saveMutation.mutateAsync({
                merchantId,
                locationId: selectedLocationId,
                settings: localSettings,
            })

            if (result.success) {
                toast.success('Settings saved successfully')
                if (result.domainWhitelistError) {
                    toast.error(`Settings saved, but domain whitelist failed: ${result.domainWhitelistError}`)
                }
                setIsDirty(false)
                refetchSettings()
            } else {
                toast.error(result.error || 'Failed to save settings')
            }
        } catch (error) {
            toast.error('Failed to save settings')
        }
    }

    // Discard changes
    const handleDiscard = () => {
        if (settingsData?.data) {
            setLocalSettings(settingsData.data)
            setIsDirty(false)
        }
    }

    // Create online store for a location
    const handleCreateStore = async (locationId: string, locationName: string) => {
        try {
            const result = await createMutation.mutateAsync({
                merchantId,
                locationId,
                locationName,
            })

            if (result.success) {
                toast.success('Online store created')
                setSelectedLocationId(locationId)
            } else {
                toast.error(result.error || 'Failed to create online store')
            }
        } catch (error) {
            toast.error('Failed to create online store')
        }
    }

    // Toggle store enabled/disabled
    const handleToggleStore = async (locationId: string, enabled: boolean) => {
        try {
            const result = await toggleMutation.mutateAsync({
                merchantId,
                locationId,
                enabled,
            })

            if (result.success) {
                toast.success(`Online store ${enabled ? 'enabled' : 'disabled'}`)
                if (result.domainWhitelistError) {
                    toast.error(`Store updated, but domain whitelist failed: ${result.domainWhitelistError}`)
                }
            } else {
                toast.error(result.error || 'Failed to toggle store')
            }
        } catch (error) {
            toast.error('Failed to toggle store')
        }
    }

    // Render location overview (no location selected)
    if (!selectedLocationId) {
        return (
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Online Store Settings</CardTitle>
                        <CardDescription>
                            Configure online ordering for each merchant location. Select a location to manage its
                            storefront settings.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {locationsLoading || overviewLoading ? (
                            <div className="space-y-3">
                                {[...Array(3)].map((_, i) => (
                                    <Skeleton key={i} className="h-20 w-full" />
                                ))}
                            </div>
                        ) : locations.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No locations found for this merchant
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {locations.map((location) => {
                                    const storeInfo = overview.find(
                                        (o: LocationOnlineStoreOverview) => o.locationId === location.id
                                    )
                                    const hasStore = storeInfo?.hasOnlineStore ?? false
                                    const isEnabled = storeInfo?.isEnabled ?? false

                                    const ooRest = orderOutStatus?.restaurants.find(
                                        (r) => r.locationId === location.id
                                    )

                                    return (
                                        <div
                                            key={location.id}
                                            className="flex items-center justify-between p-4 border rounded-lg"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div
                                                    className={cn(
                                                        'h-12 w-12 rounded-lg flex items-center justify-center',
                                                        hasStore && isEnabled
                                                            ? 'bg-green-100 text-green-600 dark:bg-green-900/30'
                                                            : hasStore
                                                              ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30'
                                                              : 'bg-muted text-muted-foreground'
                                                    )}
                                                >
                                                    <Globe className="h-6 w-6" />
                                                </div>
                                                <div>
                                                    <h4 className="font-medium">
                                                        {location.name}
                                                        {ooRest?.hasRestaurant && (
                                                            <Badge variant="outline" className="ml-2 text-xs">
                                                                <Plug className="h-3 w-3 mr-1" />
                                                                OrderOut
                                                            </Badge>
                                                        )}
                                                    </h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        {hasStore
                                                            ? isEnabled
                                                                ? 'Online ordering active'
                                                                : 'Online store configured (disabled)'
                                                            : 'No online store configured'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {hasStore && (
                                                    <>
                                                        <Badge
                                                            variant={isEnabled ? 'default' : 'secondary'}
                                                            className={isEnabled ? 'bg-green-600' : ''}
                                                        >
                                                            {isEnabled ? 'Live' : 'Disabled'}
                                                        </Badge>
                                                        <Switch
                                                            checked={isEnabled}
                                                            onCheckedChange={(enabled) =>
                                                                handleToggleStore(location.id, enabled)
                                                            }
                                                            disabled={toggleMutation.isPending}
                                                        />
                                                    </>
                                                )}
                                                <Button
                                                    variant={hasStore ? 'outline' : 'default'}
                                                    size="sm"
                                                    onClick={() =>
                                                        hasStore
                                                            ? setSelectedLocationId(location.id)
                                                            : handleCreateStore(location.id, location.name)
                                                    }
                                                    disabled={createMutation.isPending}
                                                >
                                                    {hasStore ? (
                                                        <>
                                                            <Edit className="h-4 w-4 mr-2" />
                                                            Configure
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Plus className="h-4 w-4 mr-2" />
                                                            Set Up Store
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        )
    }

    // Find location name
    const selectedLocation = locations.find((l) => l.id === selectedLocationId)
    const storeUrl = localSettings?.storeSlug ? getStoreUrl(localSettings.storeSlug) : ''
    const hasTpn = Boolean(localSettings?.ipospaysTpn?.trim())
    const canRunWhitelist = Boolean(localSettings?.storeSlug && hasTpn)

    // Render store configuration
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedLocationId(null)}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Locations
                    </Button>
                    <Separator orientation="vertical" className="h-6" />
                    <div>
                        <h3 className="font-semibold">{selectedLocation?.name || 'Location'}</h3>
                        <p className="text-sm text-muted-foreground">Online Store Configuration</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {isDirty && (
                        <>
                            <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={saveMutation.isPending}>
                                <X className="h-4 w-4 mr-2" />
                                Discard
                            </Button>
                            <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                                {saveMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Check className="h-4 w-4 mr-2" />
                                )}
                                Save Changes
                            </Button>
                        </>
                    )}
                    {localSettings?.enabled && localSettings?.storeSlug && (
                        <Button variant="outline" size="sm" asChild>
                            <a href={storeUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Preview Store
                            </a>
                        </Button>
                    )}
                </div>
            </div>

            {settingsLoading ? (
                <div className="space-y-4">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            ) : !localSettings ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground">Failed to load settings</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Enable/Disable Toggle */}
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div
                                        className={cn(
                                            'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                                            localSettings.enabled
                                                ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                                : 'bg-muted text-muted-foreground'
                                        )}
                                    >
                                        <Globe className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">Online Ordering</h3>
                                        <p className="text-sm text-muted-foreground">
                                            {localSettings.enabled
                                                ? 'Store is live and accepting online orders'
                                                : 'Enable to start accepting online orders'}
                                        </p>
                                        {localSettings.enabled && storeUrl && (
                                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                                {storeUrl}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <Switch
                                    checked={localSettings.enabled}
                                    onCheckedChange={(enabled) => updateSettings({ enabled })}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Storefront Readiness</CardTitle>
                            <CardDescription>
                                Operational checks are managed here in admin (store status, TPN presence, and domain whitelist).
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between rounded-md border p-3">
                                <div>
                                    <p className="text-sm font-medium">Store Status</p>
                                    <p className="text-xs text-muted-foreground">
                                        {localSettings.enabled ? 'Store is enabled in admin' : 'Store is disabled in admin'}
                                    </p>
                                </div>
                                <Badge variant={localSettings.enabled ? 'default' : 'secondary'}>
                                    {localSettings.enabled ? 'Enabled' : 'Disabled'}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between rounded-md border p-3">
                                <div>
                                    <p className="text-sm font-medium">Card Payment Readiness</p>
                                    <p className="text-xs text-muted-foreground">
                                        {hasTpn
                                            ? 'TPN is configured. You can whitelist the storefront domain.'
                                            : 'TPN is missing. Card payments cannot run until a TPN is configured.'}
                                    </p>
                                </div>
                                <Badge variant={hasTpn ? 'default' : 'destructive'}>{hasTpn ? 'Ready' : 'Missing TPN'}</Badge>
                            </div>
                            {!hasTpn && (
                                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <p className="text-xs">
                                        Add the merchant&apos;s iPOS TPN in the Payment &amp; Tips tab before enabling card checkout.
                                    </p>
                                </div>
                            )}
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleWhitelistDomain}
                                    disabled={!canRunWhitelist || whitelistMutation.isPending}
                                >
                                    {whitelistMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Plug className="mr-2 h-4 w-4" />
                                    )}
                                    Re-Whitelist Domain
                                </Button>
                                <p className="text-xs text-muted-foreground">
                                    {canRunWhitelist
                                        ? 'Call Dejavoo Management API for this location slug + TPN.'
                                        : 'Requires both store slug and TPN.'}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Settings Tabs */}
                    <Tabs defaultValue="store" className="space-y-6">
                        <TabsList className="w-full justify-start overflow-x-auto">
                            <TabsTrigger value="store" className="gap-2">
                                <Store className="h-4 w-4" />
                                Store Info
                            </TabsTrigger>
                            <TabsTrigger value="branding" className="gap-2">
                                <Palette className="h-4 w-4" />
                                Branding
                            </TabsTrigger>
                            <TabsTrigger value="ordering" className="gap-2">
                                <Truck className="h-4 w-4" />
                                Ordering
                            </TabsTrigger>
                            <TabsTrigger value="payment" className="gap-2">
                                <CreditCard className="h-4 w-4" />
                                Payment & Tips
                            </TabsTrigger>
                            <TabsTrigger value="orderout" className="gap-2">
                                <Plug className="h-4 w-4" />
                                OrderOut
                            </TabsTrigger>
                        </TabsList>

                        {/* Store Info */}
                        <TabsContent value="store" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Store Information</CardTitle>
                                    <CardDescription>Basic information about the online store</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="storeName">Store Name</Label>
                                            <Input
                                                id="storeName"
                                                value={localSettings.storeName || ''}
                                                onChange={(e) => updateSettings({ storeName: e.target.value })}
                                                placeholder="Your Store Name"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="storeSlug">Store URL Slug</Label>
                                            <div className="flex">
                                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">
                                                    /sites/
                                                </span>
                                                <Input
                                                    id="storeSlug"
                                                    value={localSettings.storeSlug || ''}
                                                    onChange={(e) =>
                                                        updateSettings({
                                                            storeSlug: e.target.value
                                                                .toLowerCase()
                                                                .replace(/\s+/g, '-'),
                                                        })
                                                    }
                                                    className="rounded-l-none"
                                                    placeholder="your-store"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="address">Address</Label>
                                        <Input
                                            id="address"
                                            value={localSettings.address || ''}
                                            onChange={(e) => updateSettings({ address: e.target.value })}
                                            placeholder="123 Main Street, City, State ZIP"
                                        />
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="phone">Phone Number</Label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="phone"
                                                    value={localSettings.phone || ''}
                                                    onChange={(e) => updateSettings({ phone: e.target.value })}
                                                    className="pl-10"
                                                    placeholder="(555) 123-4567"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Email</Label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="email"
                                                    type="email"
                                                    value={localSettings.email || ''}
                                                    onChange={(e) => updateSettings({ email: e.target.value })}
                                                    className="pl-10"
                                                    placeholder="orders@yourstore.com"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Branding Settings */}
                        <TabsContent value="branding" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Brand Colors</CardTitle>
                                    <CardDescription>Customize the store's color scheme</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid gap-6 sm:grid-cols-2">
                                        <div className="space-y-3">
                                            <Label>Primary Color</Label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="color"
                                                    value={localSettings.primaryColor || '#3b82f6'}
                                                    onChange={(e) => updateSettings({ primaryColor: e.target.value })}
                                                    className="h-10 w-16 rounded-lg border cursor-pointer"
                                                />
                                                <Input
                                                    value={localSettings.primaryColor || '#3b82f6'}
                                                    onChange={(e) => updateSettings({ primaryColor: e.target.value })}
                                                    className="w-28 font-mono text-sm"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <Label>Secondary Color</Label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="color"
                                                    value={localSettings.secondaryColor || '#10b981'}
                                                    onChange={(e) => updateSettings({ secondaryColor: e.target.value })}
                                                    className="h-10 w-16 rounded-lg border cursor-pointer"
                                                />
                                                <Input
                                                    value={localSettings.secondaryColor || '#10b981'}
                                                    onChange={(e) => updateSettings({ secondaryColor: e.target.value })}
                                                    className="w-28 font-mono text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <Separator />

                                    <div className="space-y-3">
                                        <Label htmlFor="bannerText">Banner Promotional Text</Label>
                                        <Input
                                            id="bannerText"
                                            value={localSettings.bannerText || ''}
                                            onChange={(e) => updateSettings({ bannerText: e.target.value || null })}
                                            placeholder="Say what you want in this banner!"
                                        />
                                        <p className="text-sm text-muted-foreground">
                                            This text appears above the store name on the hero banner
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Pickup & Delivery */}
                        <TabsContent value="ordering" className="space-y-6">
                            <div className="grid gap-6 lg:grid-cols-2">
                                <Card>
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={cn(
                                                        'flex h-10 w-10 items-center justify-center rounded-lg',
                                                        localSettings.pickupEnabled
                                                            ? 'bg-primary/10 text-primary'
                                                            : 'bg-muted text-muted-foreground'
                                                    )}
                                                >
                                                    <Store className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <CardTitle className="text-base">Pickup Orders</CardTitle>
                                                    <CardDescription>Allow customers to pick up orders</CardDescription>
                                                </div>
                                            </div>
                                            <Switch
                                                checked={localSettings.pickupEnabled ?? true}
                                                onCheckedChange={(pickupEnabled) => updateSettings({ pickupEnabled })}
                                            />
                                        </div>
                                    </CardHeader>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={cn(
                                                        'flex h-10 w-10 items-center justify-center rounded-lg',
                                                        localSettings.deliveryEnabled
                                                            ? 'bg-primary/10 text-primary'
                                                            : 'bg-muted text-muted-foreground'
                                                    )}
                                                >
                                                    <Truck className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <CardTitle className="text-base">Delivery Orders</CardTitle>
                                                    <CardDescription>Offer delivery to customers</CardDescription>
                                                </div>
                                            </div>
                                            <Switch
                                                checked={localSettings.deliveryEnabled ?? false}
                                                onCheckedChange={(deliveryEnabled) => updateSettings({ deliveryEnabled })}
                                            />
                                        </div>
                                    </CardHeader>
                                    {localSettings.deliveryEnabled && (
                                        <CardContent className="space-y-4">
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div className="space-y-2">
                                                    <Label>Base Delivery Fee</Label>
                                                    <div className="relative">
                                                        <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            value={localSettings.baseDeliveryFee ?? 5}
                                                            onChange={(e) =>
                                                                updateSettings({
                                                                    baseDeliveryFee: parseFloat(e.target.value) || 0,
                                                                })
                                                            }
                                                            className="pl-10"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Free Delivery Threshold</Label>
                                                    <div className="relative">
                                                        <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            value={localSettings.freeDeliveryThreshold ?? 0}
                                                            onChange={(e) =>
                                                                updateSettings({
                                                                    freeDeliveryThreshold: parseFloat(e.target.value) || 0,
                                                                })
                                                            }
                                                            className="pl-10"
                                                            placeholder="0 = no free delivery"
                                                        />
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        Set to 0 to disable free delivery
                                                    </p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    )}
                                </Card>
                            </div>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Order Settings</CardTitle>
                                    <CardDescription>Configure order timing and requirements</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid gap-6 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Preparation Lead Time (minutes)</Label>
                                            <div className="flex items-center gap-4">
                                                <Slider
                                                    value={[localSettings.preparationLeadTime ?? 15]}
                                                    onValueChange={(values) =>
                                                        updateSettings({ preparationLeadTime: values[0] })
                                                    }
                                                    max={120}
                                                    step={5}
                                                    className="flex-1"
                                                />
                                                <Input
                                                    type="number"
                                                    value={localSettings.preparationLeadTime ?? 15}
                                                    onChange={(e) =>
                                                        updateSettings({
                                                            preparationLeadTime: parseInt(e.target.value) || 0,
                                                        })
                                                    }
                                                    className="w-20"
                                                />
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Minimum time needed to prepare an order
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Minimum Order Amount</Label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={localSettings.minimumOrderAmount ?? 0}
                                                    onChange={(e) =>
                                                        updateSettings({
                                                            minimumOrderAmount: parseFloat(e.target.value) || 0,
                                                        })
                                                    }
                                                    className="pl-10"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            <p className="text-xs text-muted-foreground">Set to 0 for no minimum</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Order Automation</CardTitle>
                                    <CardDescription>Automate order handling to match the merchant dashboard flow</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Zap className="h-5 w-5 text-yellow-500" />
                                            <div>
                                                <Label>Automatically Accept All Orders</Label>
                                                <p className="text-sm text-muted-foreground">
                                                    New orders will be accepted without manual confirmation
                                                </p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={localSettings.autoAcceptOrders ?? false}
                                            onCheckedChange={(autoAcceptOrders) => updateSettings({ autoAcceptOrders })}
                                        />
                                    </div>
                                    <Separator />
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Check className="h-5 w-5 text-green-500" />
                                            <div>
                                                <Label>Auto-Close Paid Orders</Label>
                                                <p className="text-sm text-muted-foreground">
                                                    Automatically close orders that are paid upon acceptance
                                                </p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={localSettings.autoClosePaidOrders ?? false}
                                            onCheckedChange={(autoClosePaidOrders) =>
                                                updateSettings({ autoClosePaidOrders })
                                            }
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Notifications</CardTitle>
                                    <CardDescription>Get notified about new orders</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Bell className="h-5 w-5 text-muted-foreground" />
                                            <div>
                                                <Label>Email on New Order</Label>
                                                <p className="text-sm text-muted-foreground">
                                                    Send an email notification for every new order
                                                </p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={localSettings.sendEmailOnNewOrder ?? true}
                                            onCheckedChange={(sendEmailOnNewOrder) =>
                                                updateSettings({ sendEmailOnNewOrder })
                                            }
                                        />
                                    </div>
                                    {localSettings.sendEmailOnNewOrder && (
                                        <div className="ml-8 space-y-2">
                                            <Label>Notification Email</Label>
                                            <Input
                                                type="email"
                                                value={localSettings.notificationEmail || ''}
                                                onChange={(e) => updateSettings({ notificationEmail: e.target.value })}
                                                placeholder="manager@yourstore.com"
                                            />
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Payment & Tips */}
                        <TabsContent value="payment" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Payment Methods</CardTitle>
                                    <CardDescription>Choose which payment methods to accept</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <CreditCard className="h-5 w-5 text-muted-foreground" />
                                            <div>
                                                <Label>Accept Online Card Payments</Label>
                                                <p className="text-sm text-muted-foreground">
                                                    Process payments via integrated payment processor
                                                </p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={localSettings.acceptOnlinePayments ?? true}
                                            onCheckedChange={(acceptOnlinePayments) =>
                                                updateSettings({ acceptOnlinePayments })
                                            }
                                        />
                                    </div>
                                    {localSettings.acceptOnlinePayments !== false && (
                                        <div className="ml-8 space-y-2">
                                            <Label>iPOS TPN</Label>
                                            <Input
                                                value={localSettings.ipospaysTpn || ''}
                                                onChange={(e) => updateSettings({ ipospaysTpn: e.target.value })}
                                                placeholder="Enter merchant TPN for Dejavoo"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                This TPN is used for domain whitelist and card processing on this store.
                                            </p>
                                        </div>
                                    )}
                                    <Separator />
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <DollarSign className="h-5 w-5 text-muted-foreground" />
                                            <div>
                                                <Label>Accept Cash on Delivery</Label>
                                                <p className="text-sm text-muted-foreground">
                                                    Allow customers to pay cash at the door
                                                </p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={localSettings.acceptCashOnDelivery ?? false}
                                            onCheckedChange={(acceptCashOnDelivery) =>
                                                updateSettings({ acceptCashOnDelivery })
                                            }
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>Tipping</CardTitle>
                                            <CardDescription>Configure tipping options for customers</CardDescription>
                                        </div>
                                        <Switch
                                            checked={localSettings.tippingEnabled ?? true}
                                            onCheckedChange={(tippingEnabled) => updateSettings({ tippingEnabled })}
                                        />
                                    </div>
                                </CardHeader>
                                {localSettings.tippingEnabled && (
                                    <CardContent className="space-y-6">
                                        <div className="space-y-3">
                                            <Label>Preset Tip Percentages</Label>
                                            <div className="flex gap-2">
                                                {(localSettings.tipConfig?.presetPercentages || [15, 18, 20]).map(
                                                    (percent, index) => (
                                                        <div key={index} className="relative">
                                                            <Input
                                                                type="number"
                                                                value={percent}
                                                                onChange={(e) => {
                                                                    const newPercentages = [
                                                                        ...(localSettings.tipConfig?.presetPercentages || [
                                                                            15, 18, 20,
                                                                        ]),
                                                                    ]
                                                                    newPercentages[index] = parseInt(e.target.value) || 0
                                                                    updateSettings({
                                                                        tipConfig: {
                                                                            ...(localSettings.tipConfig || {
                                                                                calculationMethod: 'subtotal',
                                                                                presetPercentages: [15, 18, 20],
                                                                                smartTipEnabled: false,
                                                                                smartTipThreshold: 10,
                                                                                smartTipAmounts: [1, 2, 3],
                                                                                allowCustomTip: true,
                                                                            }),
                                                                            presetPercentages: newPercentages,
                                                                        },
                                                                    })
                                                                }}
                                                                className="w-20 pr-6"
                                                            />
                                                            <Percent className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                )}
                            </Card>

                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>Convenience Fee</CardTitle>
                                            <CardDescription>Add a fee for online ordering</CardDescription>
                                        </div>
                                        <Switch
                                            checked={localSettings.convenienceFeeEnabled ?? false}
                                            onCheckedChange={(convenienceFeeEnabled) =>
                                                updateSettings({ convenienceFeeEnabled })
                                            }
                                        />
                                    </div>
                                </CardHeader>
                                {localSettings.convenienceFeeEnabled && (
                                    <CardContent>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label>Percentage Fee</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="number"
                                                        step="0.1"
                                                        value={localSettings.convenienceFeePercent ?? 0}
                                                        onChange={(e) =>
                                                            updateSettings({
                                                                convenienceFeePercent: parseFloat(e.target.value) || 0,
                                                            })
                                                        }
                                                        className="pr-8"
                                                    />
                                                    <Percent className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Flat Fee</Label>
                                                <div className="relative">
                                                    <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={localSettings.convenienceFeeFlat ?? 0}
                                                        onChange={(e) =>
                                                            updateSettings({
                                                                convenienceFeeFlat: parseFloat(e.target.value) || 0,
                                                            })
                                                        }
                                                        className="pl-10"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                        </TabsContent>

                        <TabsContent value="orderout" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="flex items-center gap-2">
                                                <Plug className="h-5 w-5" />
                                                OrderOut Delivery Integration
                                            </CardTitle>
                                            <CardDescription>
                                                Connect this location to UberEats, DoorDash, Grubhub, and other delivery marketplaces.
                                            </CardDescription>
                                        </div>
                                        <Badge variant="outline">$79.99/mo</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {(() => {
                                        const locOO = orderOutStatus?.restaurants.find(
                                            (restaurant) => restaurant.locationId === selectedLocationId
                                        )

                                        if (locOO?.hasRestaurant) {
                                            return (
                                                <OrderOutStatusCard
                                                    hasAccount={orderOutStatus?.account.hasAccount ?? false}
                                                    hasRestaurant={true}
                                                    isAcceptingOrders={locOO.isAcceptingOrders}
                                                    prepTimeMinutes={locOO.prepTimeMinutes}
                                                    connectedChannels={locOO.connectedChannels}
                                                    autoAcceptOrders={locOO.autoAcceptOrders}
                                                    dashboardUrl="https://dashboard.orderout.co"
                                                />
                                            )
                                        }

                                        if (showOrderOutForm) {
                                            return (
                                                <OrderOutOnboardingForm
                                                    defaultValues={{
                                                        accountName: merchantName || '',
                                                        restaurantName: selectedLocation?.name || '',
                                                        streetAddress: selectedLocation?.address_line1 || '',
                                                        city: selectedLocation?.city || '',
                                                        state: selectedLocation?.state || '',
                                                        zipcode: selectedLocation?.postal_code || '',
                                                        country: selectedLocation?.country || 'US',
                                                    }}
                                                    isSubmitting={onboardOrderOut.isPending}
                                                    onSubmit={(data: OnboardingFormData) => {
                                                        onboardOrderOut.mutate({
                                                            merchantId,
                                                            locationId: selectedLocationId!,
                                                            accountName: data.accountName,
                                                            restaurantName: data.restaurantName,
                                                            streetAddress: data.streetAddress,
                                                            city: data.city,
                                                            state: data.state,
                                                            zipcode: data.zipcode,
                                                            country: data.country,
                                                            restaurantManagerEmail: data.restaurantManagerEmail,
                                                            restaurantManagerFirstname: data.restaurantManagerFirstname,
                                                            restaurantManagerLastname: data.restaurantManagerLastname,
                                                            restaurantManagerPhone: data.restaurantManagerPhone,
                                                        }, {
                                                            onSuccess: (result) => {
                                                                if (result.success) setShowOrderOutForm(false)
                                                            },
                                                        })
                                                    }}
                                                    onCancel={() => setShowOrderOutForm(false)}
                                                />
                                            )
                                        }

                                        return (
                                            <div className="flex flex-col items-center py-6">
                                                <Plug className="h-10 w-10 text-muted-foreground mb-3" />
                                                <p className="text-sm text-muted-foreground text-center mb-4 max-w-sm">
                                                    Connect this location to delivery platforms like UberEats, DoorDash, and Grubhub through OrderOut.
                                                </p>
                                                <Button onClick={() => setShowOrderOutForm(true)}>
                                                    <Plus className="h-4 w-4 mr-2" />
                                                    Connect to OrderOut
                                                </Button>
                                            </div>
                                        )
                                    })()}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </>
            )}
        </div>
    )
}
