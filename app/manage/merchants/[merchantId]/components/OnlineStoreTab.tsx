'use client'

import { useState, useEffect, useRef } from 'react'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
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
    useAdminApproveOnlineStoreRequest,
    useAdminRejectOnlineStoreRequest,
    useAdminUploadMerchantW9Pdf,
    useAdminOnlineStoreRequestRequirements,
    useAdminSaveOnlineStoreRequestRequirements,
    type OnlineOrderingSettings,
    type LocationOnlineStoreOverview,
} from '@/lib/queries/use-admin-online-ordering'
import {
    useAdminOrderOutStatus,
    useAdminOnboardOrderOut,
    useAdminOrderOutSyncedMenusForLocation,
} from '@/lib/queries/use-admin-orderout'
import { OrderOutOnboardingForm, type OnboardingFormData } from '@/components/dashboard/orderout/OrderOutOnboardingForm'
import { OrderOutStatusCard } from '@/components/dashboard/orderout/OrderOutStatusCard'
import { AdminPushChannelsSection } from '@/components/dashboard/orderout/AdminPushChannelsSection'
import { extractConnectedPlatforms } from '@/lib/orderout/helpers'
import { MissingDataForm } from '@/components/online-store/MissingDataForm'
import { HoursConfigModal } from '@/app/dashboard/online-ordering/components/HoursConfigModal'
import { FONT_GOOGLE_URLS } from '@/app/sites/lib/theme-utils'
import { buildStoreUrl } from '@/app/sites/lib/store-url'
import { useAdminNmiMerchantStatus } from '@/lib/queries/use-admin-online-ordering'
import { NmiCreateMerchantDialog } from './NmiCreateMerchantDialog'

function getRequestStatusLabel(status: LocationOnlineStoreOverview['setupRequestStatus']) {
    switch (status) {
        case 'pending_review':
            return 'Pending Review'
        case 'approved':
            return 'Approved'
        case 'rejected':
            return 'Rejected'
        case 'setup_completed':
            return 'Setup Complete'
        default:
            return 'No Request'
    }
}

function getRequestStatusDescription(status: LocationOnlineStoreOverview['setupRequestStatus']) {
    switch (status) {
        case 'pending_review':
            return 'Awaiting HQ review'
        case 'approved':
            return 'Approved and waiting for HQ setup completion'
        case 'rejected':
            return 'Rejected and waiting for merchant resubmission'
        case 'setup_completed':
            return 'Storefront setup completed'
        default:
            return 'No branch request has been submitted yet'
    }
}

function getRequestStatusBadgeVariant(status: LocationOnlineStoreOverview['setupRequestStatus']) {
    switch (status) {
        case 'rejected':
            return 'destructive' as const
        case 'approved':
            return 'outline' as const
        case 'setup_completed':
            return 'default' as const
        default:
            return 'secondary' as const
    }
}

function maskSensitiveValue(value?: string | null, keep = 4) {
    if (!value) return 'Missing'
    const visible = value.slice(-keep)
    return `${'•'.repeat(Math.max(0, value.length - keep))}${visible}`
}

function createDefaultDaySchedule(enabled = false) {
    return {
        enabled,
        from: '09:00',
        to: '21:00',
        is24Hours: false,
    }
}

function createDefaultWeeklySchedule() {
    return {
        monday: createDefaultDaySchedule(true),
        tuesday: createDefaultDaySchedule(true),
        wednesday: createDefaultDaySchedule(true),
        thursday: createDefaultDaySchedule(true),
        friday: createDefaultDaySchedule(true),
        saturday: createDefaultDaySchedule(true),
        sunday: createDefaultDaySchedule(false),
    }
}

interface OnlineStoreTabProps {
    merchantId: string
    merchantName: string
    locations: Location[]
    locationsLoading: boolean
}

export function OnlineStoreTab({
    merchantId,
    merchantName,
    locations,
    locationsLoading,
}: OnlineStoreTabProps) {
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
    const [isNmiDialogOpen, setIsNmiDialogOpen] = useState(false)
    const { data: nmiStatusResult } = useAdminNmiMerchantStatus(merchantId)
    const nmiStatus = nmiStatusResult?.success ? nmiStatusResult.data : null
    const NMI_PARTNER_PORTAL_URL =
        'https://mtech.transactiongateway.com/partners/accounts?tid=0d06b140eb69b1d4ac8a02efe71ceab0'
    const nmiPortalUrl = nmiStatus?.partnerPortalUrl || NMI_PARTNER_PORTAL_URL

    // Fetch overview of all locations
    const { data: overviewData, isLoading: overviewLoading } = useAdminOnlineOrderingOverview(merchantId)
    const overview = overviewData?.data || []

    // Fetch settings for selected location
    const { data: settingsData, isLoading: settingsLoading, refetch: refetchSettings } = useAdminOnlineOrderingSettings(
        merchantId,
        selectedLocationId || ''
    )
    const { data: requirementsData, refetch: refetchRequirements } = useAdminOnlineStoreRequestRequirements(
        merchantId,
        selectedLocationId || ''
    )

    // Local state for editing
    const [localSettings, setLocalSettings] = useState<Partial<OnlineOrderingSettings> | null>(null)
    const [isDirty, setIsDirty] = useState(false)
    const [w9ViewerUrl, setW9ViewerUrl] = useState<string | null>(null)
    const w9UploadInputRef = useRef<HTMLInputElement>(null)
    const [missingFormOpen, setMissingFormOpen] = useState(false)
    const [hoursModalOpen, setHoursModalOpen] = useState(false)

    // Mutations
    const saveMutation = useAdminSaveOnlineOrderingSettings()
    const approveMutation = useAdminApproveOnlineStoreRequest()
    const rejectMutation = useAdminRejectOnlineStoreRequest()
    const uploadW9Mutation = useAdminUploadMerchantW9Pdf()
    const saveRequirementsMutation = useAdminSaveOnlineStoreRequestRequirements()

    // OrderOut
    const { data: orderOutData } = useAdminOrderOutStatus(merchantId)
    const orderOutStatus = orderOutData?.data
    const onboardOrderOut = useAdminOnboardOrderOut()
    const [showOrderOutForm, setShowOrderOutForm] = useState(false)
    const { data: adminSyncedMenusData } =
        useAdminOrderOutSyncedMenusForLocation(merchantId, selectedLocationId || '')

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
                if (result.domainWhitelistError) {
                    toast.warning(`Settings saved, but payment-domain sync needs attention: ${result.domainWhitelistError}`)
                } else if (result.domainWhitelistSkipped) {
                    toast.warning('Settings saved. Payment-domain sync was skipped because no active online-ordering payment device is ready yet.')
                } else {
                    toast.success('Settings saved successfully')
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

    const handleApproveRequest = async () => {
        if (!selectedLocationId) return

        try {
            const result = await approveMutation.mutateAsync({
                merchantId,
                locationId: selectedLocationId,
            })

            if (result.success) {
                toast.success('Request approved. HQ setup can continue now.')
                refetchSettings()
                return
            }

            toast.error(result.error || 'Failed to approve request')
        } catch (_error) {
            toast.error('Failed to approve request')
        }
    }

    const handleW9Upload = async (file: File | null) => {
        if (!file) return

        const isPdf =
            file.type === 'application/pdf' ||
            file.name.toLowerCase().endsWith('.pdf')

        if (!isPdf) {
            toast.error('Signed W-9 must be uploaded as a PDF')
            return
        }

        try {
            const result = await uploadW9Mutation.mutateAsync({
                merchantId,
                file,
            })

            if (result.success) {
                toast.success('Signed W-9 uploaded')
                refetchSettings()
                return
            }

            toast.error(result.error || 'Failed to upload signed W-9')
        } catch {
            toast.error('Failed to upload signed W-9')
        } finally {
            if (w9UploadInputRef.current) {
                w9UploadInputRef.current.value = ''
            }
        }
    }

    const handleRejectRequest = async () => {
        if (!selectedLocationId) return

        const reason = window.prompt('Enter a rejection reason for the merchant')
        if (!reason) return

        try {
            const result = await rejectMutation.mutateAsync({
                merchantId,
                locationId: selectedLocationId,
                reason,
            })

            if (result.success) {
                toast.success('Request rejected and merchant notified.')
                refetchSettings()
                return
            }

            toast.error(result.error || 'Failed to reject request')
        } catch (_error) {
            toast.error('Failed to reject request')
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
                                    const requestStatus = storeInfo?.setupRequestStatus ?? 'not_requested'

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
                                                        requestStatus === 'setup_completed' && isEnabled
                                                            ? 'bg-green-100 text-green-600 dark:bg-green-900/30'
                                                            : requestStatus === 'pending_review' || requestStatus === 'approved'
                                                              ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30'
                                                              : requestStatus === 'rejected'
                                                                ? 'bg-red-100 text-red-600 dark:bg-red-900/30'
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
                                                        {getRequestStatusDescription(requestStatus)}
                                                    </p>
                                                    {storeInfo?.setupRejectionReason && requestStatus === 'rejected' ? (
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            Reason: {storeInfo.setupRejectionReason}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Badge
                                                    variant={getRequestStatusBadgeVariant(requestStatus)}
                                                    className={
                                                        requestStatus === 'setup_completed' && isEnabled
                                                            ? 'bg-green-600'
                                                            : ''
                                                    }
                                                >
                                                    {getRequestStatusLabel(requestStatus)}
                                                </Badge>
                                                {requestStatus === 'setup_completed' && hasStore ? (
                                                    <>
                                                        <Badge variant={isEnabled ? 'default' : 'secondary'} className={isEnabled ? 'bg-green-600' : ''}>
                                                            {isEnabled ? 'Live' : 'Disabled'}
                                                        </Badge>
                                                    </>
                                                ) : null}
                                                <Button
                                                    variant={hasStore ? 'outline' : 'default'}
                                                    size="sm"
                                                    onClick={() => setSelectedLocationId(location.id)}
                                                >
                                                    {requestStatus === 'pending_review' ? (
                                                        <>
                                                            <AlertTriangle className="h-4 w-4 mr-2" />
                                                            Review Request
                                                        </>
                                                    ) : requestStatus === 'approved' ? (
                                                        <>
                                                            <Edit className="h-4 w-4 mr-2" />
                                                            Continue Setup
                                                        </>
                                                    ) : requestStatus === 'setup_completed' ? (
                                                        <>
                                                            <Edit className="h-4 w-4 mr-2" />
                                                            Open Setup
                                                        </>
                                                    ) : requestStatus === 'rejected' ? (
                                                        <>
                                                            <AlertTriangle className="h-4 w-4 mr-2" />
                                                            View Rejection
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
    const storeUrl = buildStoreUrl({
        slug: localSettings?.storeSlug,
        customDomain: localSettings?.customDomain,
    })
    const requestStatus = localSettings?.setupRequestStatus ?? 'not_requested'
    const canEditStoreSetup =
        requestStatus === 'approved' || requestStatus === 'setup_completed'
    const hasNmiTokenizationKey = Boolean(localSettings?.nmiTokenizationKey?.trim())
    const hasNmiPrivateApiKey = Boolean(localSettings?.nmiConfigured)

    // Render store configuration
    return (
        <div className="space-y-6">
            <Dialog open={Boolean(w9ViewerUrl)} onOpenChange={(open) => !open && setW9ViewerUrl(null)}>
                <DialogContent className="max-w-5xl">
                    <DialogHeader>
                        <DialogTitle>Signed W-9</DialogTitle>
                    </DialogHeader>
                    {w9ViewerUrl ? (
                        <iframe
                            title="Signed W-9 PDF"
                            src={w9ViewerUrl}
                            className="h-[75vh] w-full rounded-md border"
                        />
                    ) : null}
                </DialogContent>
            </Dialog>

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
                        <div className="flex items-center gap-2">
                            <p className="text-sm text-muted-foreground">Online Store Configuration</p>
                            <Badge variant={getRequestStatusBadgeVariant(requestStatus)}>
                                {getRequestStatusLabel(requestStatus)}
                            </Badge>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {isDirty && canEditStoreSetup && (
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
                    {localSettings?.enabled && localSettings?.storeSlug && requestStatus === 'setup_completed' && (
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
                    {requestStatus === 'not_requested' && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Awaiting Merchant Request</CardTitle>
                                <CardDescription>
                                    This location does not have an online-store setup request yet. Review details below, but branch setup should start from the merchant request flow.
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    )}

                    {requestStatus === 'pending_review' && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Review Request</CardTitle>
                                <CardDescription>
                                    Inspect the merchant and location packet below. Approve to unlock HQ setup, or reject and provide a reason that will be emailed to the merchant owner/admin.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex gap-3">
                                <Button onClick={handleApproveRequest} disabled={approveMutation.isPending || rejectMutation.isPending}>
                                    {approveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                                    Approve
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={handleRejectRequest}
                                    disabled={approveMutation.isPending || rejectMutation.isPending}
                                >
                                    {rejectMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <X className="h-4 w-4 mr-2" />}
                                    Reject
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {requestStatus === 'approved' && (
                        <Card className="border-yellow-300/60">
                            <CardHeader>
                                <CardTitle>Request Approved</CardTitle>
                                <CardDescription>
                                    HQ can now complete storefront setup. The first successful save from this screen marks the request as setup completed.
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    )}

                    {requestStatus === 'rejected' && (
                        <Card className="border-destructive/40">
                            <CardHeader>
                                <CardTitle>Request Rejected</CardTitle>
                                <CardDescription>
                                    The merchant must resubmit the request after addressing the rejection reason below.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                {localSettings.setupRejectionReason || 'No rejection reason recorded.'}
                            </CardContent>
                        </Card>
                    )}

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Merchant Review Packet</CardTitle>
                                <CardDescription>Compliance fields collected during merchant onboarding.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">Legal Business Name</span>
                                    <span>{localSettings.merchantReviewPacket?.legalBusinessName || 'Missing'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">DBA Name</span>
                                    <span>{localSettings.merchantReviewPacket?.dbaName || 'Missing'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">EIN / Tax ID</span>
                                    <span>{maskSensitiveValue(localSettings.merchantReviewPacket?.einTaxId)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">Owner</span>
                                    <span>{localSettings.merchantReviewPacket?.ownerFullName || 'Missing'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">Owner SSN</span>
                                    <span>{maskSensitiveValue(localSettings.merchantReviewPacket?.ownerSsn)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">Owner DOB</span>
                                    <span>{localSettings.merchantReviewPacket?.ownerDob || 'Missing'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">Signed W-9</span>
                                    {localSettings.merchantReviewPacket?.w9FormUrl ? (
                                        <a className="text-primary underline" href={localSettings.merchantReviewPacket.w9FormUrl} target="_blank" rel="noreferrer">
                                            View PDF
                                        </a>
                                    ) : (
                                        <span>Missing</span>
                                    )}
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">Government ID</span>
                                    {localSettings.merchantReviewPacket?.ownerGovernmentIdUrl ? (
                                        <a className="text-primary underline" href={localSettings.merchantReviewPacket.ownerGovernmentIdUrl} target="_blank" rel="noreferrer">
                                            View Document
                                        </a>
                                    ) : (
                                        <span>Missing</span>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Location Review Packet</CardTitle>
                                <CardDescription>Banking and support documents collected for this branch.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">Bank Name</span>
                                    <span>{localSettings.locationReviewPacket?.bankName || 'Missing'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">Account Holder</span>
                                    <span>{localSettings.locationReviewPacket?.accountHolderName || 'Missing'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">DDA Account</span>
                                    <span>{maskSensitiveValue(localSettings.locationReviewPacket?.ddaAccountNumber)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">Routing Number</span>
                                    <span>{maskSensitiveValue(localSettings.locationReviewPacket?.routingNumber)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">Bank Letter / Voided Check</span>
                                    {localSettings.locationReviewPacket?.bankSupportDocumentUrl ? (
                                        <a className="text-primary underline" href={localSettings.locationReviewPacket.bankSupportDocumentUrl} target="_blank" rel="noreferrer">
                                            View Document
                                        </a>
                                    ) : (
                                        <span>Missing</span>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Review Checklist</CardTitle>
                            <CardDescription>
                                Required packet items before HQ should approve setup.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {([
                                ['Legal Business Name', localSettings.reviewChecklist?.legalBusinessName],
                                ['DBA Name', localSettings.reviewChecklist?.dbaName],
                                ['EIN / Tax ID', localSettings.reviewChecklist?.einTaxId],
                                ['Signed W-9', localSettings.reviewChecklist?.w9Form],
                                ['Owner Identity', localSettings.reviewChecklist?.ownerIdentity],
                                ['Government ID', localSettings.reviewChecklist?.ownerGovernmentId],
                                ['Banking Info', localSettings.reviewChecklist?.bankingInfo],
                                ['Bank Support Doc', localSettings.reviewChecklist?.bankSupportDocument],
                            ] as Array<[string, boolean | undefined]>).map(([label, complete]) => (
                                <div key={label} className="flex items-center justify-between rounded-md border p-3">
                                    <span className="text-sm">{label}</span>
                                    <Badge variant={complete ? 'default' : 'secondary'}>
                                        {complete ? 'Ready' : 'Missing'}
                                    </Badge>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {requirementsData?.success && !requirementsData.complete ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>Missing Packet Items</CardTitle>
                                <CardDescription>
                                    These fields are required before approval. Use the editor to fill only the missing items.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex items-center justify-between gap-4">
                                <div className="text-sm text-muted-foreground">
                                    {Object.values(requirementsData.missing).filter(Boolean).length} missing fields detected.
                                </div>
                                <Button onClick={() => setMissingFormOpen(true)} variant="outline">
                                    Edit Missing Fields
                                </Button>
                            </CardContent>
                        </Card>
                    ) : null}

                    <MissingDataForm
                        mode="admin"
                        open={missingFormOpen}
                        onOpenChange={setMissingFormOpen}
                        title="Fill Missing Online Store Packet Fields"
                        description="Each missing field can be edited and saved individually."
                        locationId={selectedLocationId || ''}
                        merchantId={merchantId}
                        requirements={(requirementsData as any) ?? null}
                        onSave={async (formData) => {
                            formData.set('merchantId', merchantId)
                            formData.set('locationId', selectedLocationId || '')
                            const result = await saveRequirementsMutation.mutateAsync(formData)
                            if (!result.success) {
                                return { success: false, error: result.error || 'Failed to save' }
                            }
                            await Promise.all([refetchSettings(), refetchRequirements()])
                            return { success: true }
                        }}
                        onRefresh={async () => {
                            const refreshed = await refetchRequirements()
                            return (refreshed.data as any) ?? { success: false, complete: false, missing: {}, values: {}, error: 'Failed to refresh' }
                        }}
                        onCompleted={async () => {
                            await Promise.all([refetchSettings(), refetchRequirements()])
                        }}
                    />

                    {canEditStoreSetup ? (
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
                                Operational checks for the active NMI-based online payment flow.
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
                                        {hasNmiTokenizationKey && hasNmiPrivateApiKey
                                            ? 'NMI tokenization and private API keys are configured for this location.'
                                            : 'Online card payments require both the NMI tokenization key and private API key.'}
                                    </p>
                                </div>
                                <Badge variant={hasNmiTokenizationKey && hasNmiPrivateApiKey ? 'default' : 'destructive'}>
                                    {hasNmiTokenizationKey && hasNmiPrivateApiKey ? 'Ready' : 'Incomplete'}
                                </Badge>
                            </div>
                            {(!hasNmiTokenizationKey || !hasNmiPrivateApiKey) && (
                                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <p className="text-xs">
                                        Add the location&apos;s NMI tokenization key and private API key in the Payment &amp; Tips tab before enabling online card checkout.
                                    </p>
                                </div>
                            )}
                            <div className="rounded-md border p-3">
                                <p className="text-sm font-medium">Provider</p>
                                <p className="text-xs text-muted-foreground">
                                    Storefront card checkout now uses NMI through the active location payment device.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>NMI Merchant Account</CardTitle>
                            <CardDescription>
                                Create the merchant&apos;s NMI gateway account, then finish onboarding in the
                                partner portal.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between rounded-md border p-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium">Account Status</p>
                                    {nmiStatus ? (
                                        <p className="text-xs text-muted-foreground">
                                            Created {nmiStatus.createdAt ? new Date(nmiStatus.createdAt).toLocaleDateString() : ''} · NMI ID{' '}
                                            <span className="font-mono">{nmiStatus.nmiMerchantId}</span>
                                            {nmiStatus.status ? ` · ${nmiStatus.status}` : ''}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            No NMI account on file. Pre-fill from the merchant&apos;s review packet, then confirm to create one.
                                        </p>
                                    )}
                                </div>
                                <Badge variant={nmiStatus ? 'default' : 'secondary'}>
                                    {nmiStatus ? 'Created' : 'Not created'}
                                </Badge>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button
                                    onClick={() => setIsNmiDialogOpen(true)}
                                    disabled={Boolean(nmiStatus) || !selectedLocationId}
                                    className="gap-2"
                                >
                                    <Plus className="h-4 w-4" />
                                    {nmiStatus ? 'NMI account exists' : 'Create NMI merchant'}
                                </Button>
                                <Button variant="outline" asChild className="gap-2">
                                    <a href={nmiPortalUrl} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-4 w-4" />
                                        Open NMI partner portal
                                    </a>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {selectedLocationId ? (
                        <NmiCreateMerchantDialog
                            open={isNmiDialogOpen}
                            onOpenChange={setIsNmiDialogOpen}
                            merchantId={merchantId}
                            merchantName={merchantName}
                            locationId={selectedLocationId}
                            location={selectedLocation}
                            settings={localSettings || undefined}
                            partnerPortalUrl={nmiPortalUrl}
                        />
                    ) : null}

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

                                    <div className="space-y-2">
                                        <Label htmlFor="storeDescription">Store Description</Label>
                                        <Textarea
                                            id="storeDescription"
                                            value={(localSettings.description as string) || ''}
                                            onChange={(e) => updateSettings({ description: e.target.value })}
                                            placeholder="Short description shown on the storefront."
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

                                    <div className="rounded-lg border p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="font-medium">Operating Hours</p>
                                                <p className="text-sm text-muted-foreground">
                                                    Storefront ordering hours (defaults to location business hours if unchanged).
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setHoursModalOpen(true)}
                                            >
                                                Edit Hours
                                            </Button>
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
                                            <Label>Template</Label>
                                            <select
                                                value={(localSettings.templateId as any) || 'classic'}
                                                onChange={(e) => updateSettings({ templateId: e.target.value as any })}
                                                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                            >
                                                <option value="classic">Classic</option>
                                                <option value="hero">Hero</option>
                                                <option value="market">Market</option>
                                                <option value="boutique">Boutique</option>
                                            </select>
                                        </div>
                                        <div className="space-y-3">
                                            <Label>Font</Label>
                                            <select
                                                value={(localSettings.fontFamily as any) || 'DM Sans'}
                                                onChange={(e) => updateSettings({ fontFamily: e.target.value })}
                                                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                            >
                                                {Object.keys(FONT_GOOGLE_URLS).map((font) => (
                                                    <option key={font} value={font}>
                                                        {font}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-muted-foreground">
                                                Font options are sourced from storefront supported Google Fonts.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid gap-6 sm:grid-cols-2">
                                        <div className="space-y-3">
                                            <Label>Header Style</Label>
                                            <select
                                                value={(localSettings.headerStyle as any) || 'filled'}
                                                onChange={(e) => updateSettings({ headerStyle: e.target.value as any })}
                                                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                            >
                                                <option value="filled">Filled</option>
                                                <option value="transparent">Transparent</option>
                                                <option value="outlined">Outlined</option>
                                            </select>
                                        </div>
                                        <div className="space-y-3">
                                            <Label>Menu Layout</Label>
                                            <select
                                                value={(localSettings.menuLayout as any) || 'cards'}
                                                onChange={(e) => updateSettings({ menuLayout: e.target.value as any })}
                                                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                            >
                                                <option value="cards">Cards</option>
                                                <option value="sidebyside">Side-by-side</option>
                                                <option value="no-images">No images</option>
                                            </select>
                                        </div>
                                    </div>

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

                                    <div className="grid gap-6 sm:grid-cols-3">
                                        <div className="space-y-3">
                                            <Label>Accent Color</Label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="color"
                                                    value={(localSettings.accentColor as any) || localSettings.primaryColor || '#3b82f6'}
                                                    onChange={(e) => updateSettings({ accentColor: e.target.value })}
                                                    className="h-10 w-16 rounded-lg border cursor-pointer"
                                                />
                                                <Input
                                                    value={(localSettings.accentColor as any) || ''}
                                                    onChange={(e) => updateSettings({ accentColor: e.target.value || null })}
                                                    className="w-28 font-mono text-sm"
                                                    placeholder="Optional"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <Label>Background</Label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="color"
                                                    value={(localSettings.backgroundColor as any) || '#FFFFFF'}
                                                    onChange={(e) => updateSettings({ backgroundColor: e.target.value })}
                                                    className="h-10 w-16 rounded-lg border cursor-pointer"
                                                />
                                                <Input
                                                    value={(localSettings.backgroundColor as any) || '#FFFFFF'}
                                                    onChange={(e) => updateSettings({ backgroundColor: e.target.value })}
                                                    className="w-28 font-mono text-sm"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <Label>Text</Label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="color"
                                                    value={(localSettings.textColor as any) || '#111827'}
                                                    onChange={(e) => updateSettings({ textColor: e.target.value })}
                                                    className="h-10 w-16 rounded-lg border cursor-pointer"
                                                />
                                                <Input
                                                    value={(localSettings.textColor as any) || '#111827'}
                                                    onChange={(e) => updateSettings({ textColor: e.target.value })}
                                                    className="w-28 font-mono text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid gap-6 sm:grid-cols-3">
                                        <div className="space-y-3">
                                            <Label>Border (Optional)</Label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="color"
                                                    value={(localSettings.borderColor as any) || '#E5E7EB'}
                                                    onChange={(e) => updateSettings({ borderColor: e.target.value })}
                                                    className="h-10 w-16 rounded-lg border cursor-pointer"
                                                />
                                                <Input
                                                    value={(localSettings.borderColor as any) || ''}
                                                    onChange={(e) => updateSettings({ borderColor: e.target.value || null })}
                                                    className="w-28 font-mono text-sm"
                                                    placeholder="Optional"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <Label>Card (Optional)</Label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="color"
                                                    value={(localSettings.cardColor as any) || '#FFFFFF'}
                                                    onChange={(e) => updateSettings({ cardColor: e.target.value })}
                                                    className="h-10 w-16 rounded-lg border cursor-pointer"
                                                />
                                                <Input
                                                    value={(localSettings.cardColor as any) || ''}
                                                    onChange={(e) => updateSettings({ cardColor: e.target.value || null })}
                                                    className="w-28 font-mono text-sm"
                                                    placeholder="Optional"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <Label>Header Text (Optional)</Label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="color"
                                                    value={(localSettings.headerTextColor as any) || (localSettings.textColor as any) || '#111827'}
                                                    onChange={(e) => updateSettings({ headerTextColor: e.target.value })}
                                                    className="h-10 w-16 rounded-lg border cursor-pointer"
                                                />
                                                <Input
                                                    value={(localSettings.headerTextColor as any) || ''}
                                                    onChange={(e) => updateSettings({ headerTextColor: e.target.value || null })}
                                                    className="w-28 font-mono text-sm"
                                                    placeholder="Optional"
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

                        <HoursConfigModal
                            open={hoursModalOpen}
                            onOpenChange={setHoursModalOpen}
                            title="Operating Hours"
                            description="These hours are used to determine when the storefront accepts new orders."
                            schedule={(localSettings?.operatingHours as any) || createDefaultWeeklySchedule()}
                            onSave={(schedule) => updateSettings({ operatingHours: schedule as any })}
                        />

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
                                            <Label>NMI Tokenization Key</Label>
                                            <Input
                                                value={localSettings.nmiTokenizationKey || ''}
                                                onChange={(e) => updateSettings({ nmiTokenizationKey: e.target.value })}
                                                placeholder="Enter NMI tokenization key"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                This browser-safe key is sent to the storefront checkout to tokenize card details with NMI.
                                            </p>
                                            <Label className="pt-2">NMI Private API Key</Label>
                                            <Input
                                                type="password"
                                                value={localSettings.nmiPrivateApiKey || ''}
                                                onChange={(e) => updateSettings({ nmiPrivateApiKey: e.target.value })}
                                                placeholder={
                                                    localSettings.nmiConfigured
                                                        ? 'Stored securely. Enter a new key only to rotate it.'
                                                        : 'Enter NMI private API key'
                                                }
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                This private key is stored securely and is never shown back in plain text. Enter a new value only when rotating the key.
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
                                                <div className="space-y-6">
                                                    <OrderOutStatusCard
                                                        hasAccount={orderOutStatus?.account.hasAccount ?? false}
                                                        hasRestaurant={true}
                                                        isAcceptingOrders={locOO.isAcceptingOrders}
                                                        prepTimeMinutes={locOO.prepTimeMinutes}
                                                        connectedChannels={locOO.connectedChannels}
                                                        autoAcceptOrders={locOO.autoAcceptOrders}
                                                        dashboardUrl="https://dashboard.orderout.co"
                                                    />
                                                    <AdminPushChannelsSection
                                                        merchantId={merchantId}
                                                        locationId={selectedLocationId!}
                                                        isOnboarded={true}
                                                        verifiedChannels={extractConnectedPlatforms(
                                                            locOO.connectedChannels
                                                        )}
                                                        selfConfirmedChannels={
                                                            locOO.channelsConfirmedByMerchant ?? []
                                                        }
                                                        syncedMenus={adminSyncedMenusData?.data ?? []}
                                                    />
                                                </div>
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
                    ) : null}
                </>
            )}
        </div>
    )
}
