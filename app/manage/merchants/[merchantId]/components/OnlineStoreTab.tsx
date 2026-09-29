'use client'

import { useState, useEffect, useRef } from 'react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import Link from 'next/link'
import { useMerchantValorBoardingStatus } from '@/lib/queries/use-admin-valor-boarding'

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

// The stored operatingHours may be null, empty, or missing some day keys.
// Normalize it so every weekday is guaranteed a complete DaySchedule before
// handing it to the hours modal (which indexes localSchedule[day].enabled).
function normalizeWeeklySchedule(stored: unknown) {
    const base = createDefaultWeeklySchedule()
    if (!stored || typeof stored !== 'object') return base
    const source = stored as Record<string, Partial<ReturnType<typeof createDefaultDaySchedule>>>
    const result = { ...base } as Record<string, ReturnType<typeof createDefaultDaySchedule>>
    for (const day of Object.keys(base) as Array<keyof typeof base>) {
        const day_value = source[day]
        if (day_value && typeof day_value === 'object') {
            result[day] = { ...base[day], ...day_value }
        }
    }
    return result
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
    // Valor is the online card-payment rail; per-location boarding/live status.
    const { data: valorBoardingData } = useMerchantValorBoardingStatus(merchantId)

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
    const [settingsTab, setSettingsTab] = useState('store')
    // Each location opens on its first settings tab, as the uncontrolled rail did.
    useEffect(() => {
        setSettingsTab('store')
    }, [selectedLocationId])

    // §13.2 (D-24): keep the active settings pill in view by scrolling the rail
    // itself, clamped, re-measured once the rail has a width.
    const settingsRailRef = useRef<HTMLDivElement>(null)
    const settingsRailPositioned = useRef(false)
    useEffect(() => {
        const rail = settingsRailRef.current
        if (!rail) return
        let done = false
        const align = () => {
            const max = rail.scrollWidth - rail.clientWidth
            const tab = rail.querySelector<HTMLElement>('[data-state="active"]')
            if (done || !tab || max <= 0) return
            const left = tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2
            const smooth =
                settingsRailPositioned.current &&
                !window.matchMedia('(prefers-reduced-motion: reduce)').matches
            rail.scrollTo({ left: Math.max(0, Math.min(left, max)), behavior: smooth ? 'smooth' : 'auto' })
            settingsRailPositioned.current = done = true
        }
        align()
        const observer = new ResizeObserver(align)
        observer.observe(rail)
        return () => observer.disconnect()
    }, [settingsTab])

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
                <Panel>
                    <PanelSection
                        label="Online Store Settings"
                        caption="Configure online ordering for each merchant location. Select a location to manage its storefront settings."
                    >
                        <div>
                        {locationsLoading || overviewLoading ? (
                            <div className="space-y-3">
                                {[...Array(3)].map((_, i) => (
                                    <Skeleton key={i} className="h-20 w-full rounded-2xl" />
                                ))}
                            </div>
                        ) : locations.length === 0 ? (
                            <div className="rounded-2xl bg-muted/30 px-4 py-10 text-center">
                                <p className="text-sm font-medium">No locations yet</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Online store settings appear here once this merchant has a location.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
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
                                            className="flex min-w-0 flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <div className="flex items-center gap-4 min-w-0">
                                                {/* Structural plate, neutral; the status word
                                                    carries the state (§3.5). Drops on phones (§13.4). */}
                                                <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground sm:flex">
                                                    <Globe className="h-6 w-6" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-medium truncate">
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
                                            <div className="flex items-center gap-3 flex-wrap shrink-0">
                                                <Badge variant="outline">
                                                    {getRequestStatusLabel(requestStatus)}
                                                </Badge>
                                                {requestStatus === 'setup_completed' && hasStore ? (
                                                    <Badge variant="outline">
                                                        {isEnabled ? 'Live' : 'Disabled'}
                                                    </Badge>
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
                        </div>
                    </PanelSection>
                </Panel>
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
    const valorRow = valorBoardingData?.locations.find((l) => l.locationId === selectedLocationId) ?? null
    const valorBoarded = Boolean(valorRow?.boarded)
    const valorLive = Boolean(valorRow?.isPrimary)
    const valorReady = valorBoarded && valorLive && Boolean(valorRow?.hasApiKeys)

    // Render store configuration
    return (
        <div className="space-y-6">
            <Dialog open={Boolean(w9ViewerUrl)} onOpenChange={(open) => !open && setW9ViewerUrl(null)}>
                {/* §12/§13.1: a document viewer, full-screen below `sm`. The
                    content clips; the frame fills the body. */}
                <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 max-sm:overflow-hidden sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-5xl sm:rounded-3xl">
                    <DialogHeader className="shrink-0 px-6 pb-2 pr-14 pt-6 text-left">
                        <DialogTitle>Signed W-9</DialogTitle>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 px-6 pb-6 pt-2">
                        {w9ViewerUrl ? (
                            <iframe
                                title="Signed W-9 PDF"
                                src={w9ViewerUrl}
                                className="h-full w-full rounded-2xl border sm:h-[75vh]"
                            />
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>

            <Button variant="ghost" size="sm" onClick={() => setSelectedLocationId(null)} className="-ml-2 self-start">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Locations
            </Button>

            {/* A tab's title is a PanelSection label, never another heading
                level of its own (§14.6.4). */}
            <Panel>
                <PanelSection
                    showCaptionOnMobile
                    label={selectedLocation?.name || 'Location'}
                    caption={
                        <span className="flex flex-wrap items-center gap-2">
                            <span>Online Store Configuration</span>
                            <Badge variant="outline">{getRequestStatusLabel(requestStatus)}</Badge>
                        </span>
                    }
                    action={
                            <div className="flex items-center gap-3 flex-wrap">
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
                    }
                />
            </Panel>

            {settingsLoading ? (
                <div className="space-y-6">
                    <Skeleton className="h-32 w-full rounded-3xl" />
                    <Skeleton className="h-64 w-full rounded-3xl" />
                </div>
            ) : !localSettings ? (
                <Panel padded>
                    <div className="rounded-2xl bg-muted/30 px-4 py-10 text-center">
                        <p className="text-sm font-medium">We couldn&apos;t load this location&apos;s store settings</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Try again, or go back and reopen the location.
                        </p>
                        <Button variant="outline" size="sm" className="mt-4" onClick={() => refetchSettings()}>
                            Retry
                        </Button>
                    </div>
                </Panel>
            ) : (
                <>
                    {requestStatus === 'not_requested' && (
                        <Panel>
                            <PanelSection showCaptionOnMobile
                                label="Awaiting Merchant Request"
                                caption="This location does not have an online-store setup request yet. Review details below, but branch setup should start from the merchant request flow."
                            >
                            </PanelSection>
                        </Panel>
                    )}

                    {requestStatus === 'pending_review' && (
                        <Panel>
                            <PanelSection
                                label="Review Request"
                                caption="Inspect the merchant and location packet below. Approve to unlock HQ setup, or reject and provide a reason that will be emailed to the merchant owner/admin."
                            >
                                <div className="flex flex-wrap gap-3">
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
                                </div>
                            </PanelSection>
                        </Panel>
                    )}

                    {requestStatus === 'approved' && (
                        <Panel>
                            <PanelSection showCaptionOnMobile
                                label="Request Approved"
                                caption="HQ can now complete storefront setup. The first successful save from this screen marks the request as setup completed."
                            />
                        </Panel>
                    )}

                    {requestStatus === 'rejected' && (
                        <Panel>
                            <PanelSection showCaptionOnMobile
                                label="Request Rejected"
                                caption="The merchant must resubmit the request after addressing the rejection reason below."
                            >
                                <div className="text-sm text-muted-foreground">
                                    {localSettings.setupRejectionReason || 'No rejection reason recorded.'}
                                </div>
                            </PanelSection>
                        </Panel>
                    )}

                    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
                        <Panel>
                            <PanelSection
                                label="Merchant Review Packet"
                                caption="Compliance fields collected during merchant onboarding."
                            >
                                <div className="space-y-3 text-sm">
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
                                        <a className="text-foreground underline underline-offset-4"href={localSettings.merchantReviewPacket.w9FormUrl} target="_blank" rel="noreferrer">
                                            View PDF
                                        </a>
                                    ) : (
                                        <span>Missing</span>
                                    )}
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">Government ID</span>
                                    {localSettings.merchantReviewPacket?.ownerGovernmentIdUrl ? (
                                        <a className="text-foreground underline underline-offset-4"href={localSettings.merchantReviewPacket.ownerGovernmentIdUrl} target="_blank" rel="noreferrer">
                                            View Document
                                        </a>
                                    ) : (
                                        <span>Missing</span>
                                    )}
                                </div>
                                </div>
                            </PanelSection>
                        </Panel>

                        <Panel>
                            <PanelSection
                                label="Location Review Packet"
                                caption="Banking and support documents collected for this branch."
                            >
                                <div className="space-y-3 text-sm">
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
                                        <a className="text-foreground underline underline-offset-4"href={localSettings.locationReviewPacket.bankSupportDocumentUrl} target="_blank" rel="noreferrer">
                                            View Document
                                        </a>
                                    ) : (
                                        <span>Missing</span>
                                    )}
                                </div>
                                </div>
                            </PanelSection>
                        </Panel>
                    </div>

                    <Panel>
                        <PanelSection
                            label="Review Checklist"
                            caption="Required packet items before HQ should approve setup."
                        >
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                                // Muted card: the state is plain text, and a missing item
                                // is marked by weight rather than colour (§3.5).
                                <div
                                    key={label}
                                    className={cn(
                                        'flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-muted/45 p-3 text-sm',
                                        complete ? 'text-muted-foreground' : 'font-medium text-foreground'
                                    )}
                                >
                                    <span className="min-w-0">{label}</span>
                                    <span className="shrink-0">{complete ? 'Ready' : 'Missing'}</span>
                                </div>
                            ))}
                            </div>
                        </PanelSection>
                    </Panel>

                    {requirementsData?.success && !requirementsData.complete ? (
                        <Panel>
                            <PanelSection showCaptionOnMobile
                                label="Missing Packet Items"
                                caption="These fields are required before approval. Use the editor to fill only the missing items."
                            >
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="text-sm text-muted-foreground">
                                    <span className="tabular-nums">{Object.values(requirementsData.missing).filter(Boolean).length}</span> missing fields detected.
                                </div>
                                <Button onClick={() => setMissingFormOpen(true)} variant="outline">
                                    Edit Missing Fields
                                </Button>
                                </div>
                            </PanelSection>
                        </Panel>
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
                    <Panel>
                        {/* The caption is the store's state, so it stays on phones (§13.4). */}
                        <PanelSection
                            icon={Globe}
                            label="Online Ordering"
                            showCaptionOnMobile
                            caption={
                                localSettings.enabled
                                    ? 'Store is live and accepting online orders'
                                    : 'Enable to start accepting online orders'
                            }
                            action={
                                <Switch
                                    aria-label="Online ordering"
                                    checked={localSettings.enabled}
                                    onCheckedChange={(enabled) => updateSettings({ enabled })}
                                />
                            }
                        >
                            {localSettings.enabled && storeUrl ? (
                                <p className="break-all font-mono text-xs text-muted-foreground">{storeUrl}</p>
                            ) : null}
                        </PanelSection>
                    </Panel>

                    <Panel>
                        <PanelSection
                            label="Online Card Payments"
                            caption="This location&apos;s storefront takes card payments through Valor. Board the location, then set it live to accept cards online."
                        >
                            <div className="space-y-4">
                            <div className="flex items-center justify-between gap-3 rounded-2xl border p-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium">Store Status</p>
                                    <p className="text-xs text-muted-foreground">
                                        {localSettings.enabled ? 'Store is enabled in admin' : 'Store is disabled in admin'}
                                    </p>
                                </div>
                                <Badge variant="outline" className="shrink-0">
                                    {localSettings.enabled ? 'Enabled' : 'Disabled'}
                                </Badge>
                            </div>

                            <div className="flex items-center justify-between gap-3 rounded-2xl border p-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium">Card Payment Readiness</p>
                                    <p className="text-xs text-muted-foreground">
                                        {valorReady
                                            ? 'Boarded on Valor and live — the storefront can take card payments online.'
                                            : valorBoarded
                                                ? 'Boarded on Valor, but not live yet — set it live to accept online card payments.'
                                                : 'This location is not boarded on Valor yet. Board it to enable online card payments.'}
                                    </p>
                                </div>
                                <Badge variant="outline" className="shrink-0">
                                    {valorReady ? 'Ready' : valorBoarded ? 'Not live' : 'Not boarded'}
                                </Badge>
                            </div>

                            {valorBoarded ? (
                                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/60 p-3 text-sm sm:grid-cols-4">
                                    <div className="min-w-0">
                                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Valor Merchant</p>
                                        <p className="truncate font-mono text-xs">{valorRow?.valorMerchantId ?? '—'}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Store</p>
                                        <p className="truncate font-mono text-xs">{valorRow?.valorStoreId ?? '—'}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">EPI</p>
                                        <p className="truncate font-mono text-xs">{valorRow?.valorEpi ?? '—'}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">API Keys</p>
                                        <p className="text-xs">{valorRow?.hasApiKeys ? 'Present' : 'Missing'}</p>
                                    </div>
                                </div>
                            ) : null}

                            <div className="flex flex-col gap-2 sm:flex-row">
                                {!valorBoarded ? (
                                    <Button asChild className="gap-2">
                                        <Link href={`/manage/merchants/${merchantId}?tab=valor-boarding`}>
                                            <CreditCard className="h-4 w-4" />
                                            Board on Valor
                                        </Link>
                                    </Button>
                                ) : !valorLive ? (
                                    <Button asChild className="gap-2">
                                        <Link href={`/manage/merchants/${merchantId}?tab=valor-boarding`}>
                                            <Zap className="h-4 w-4" />
                                            Set live in Valor Boarding
                                        </Link>
                                    </Button>
                                ) : (
                                    <Button asChild variant="outline" className="gap-2">
                                        <Link href={`/manage/merchants/${merchantId}?tab=valor-boarding`}>
                                            <CreditCard className="h-4 w-4" />
                                            Manage Valor Boarding
                                        </Link>
                                    </Button>
                                )}
                            </div>
                            </div>
                        </PanelSection>
                    </Panel>

                    {/* Settings Tabs */}
                    <Tabs value={settingsTab} onValueChange={setSettingsTab} className="space-y-6">
                        {/* DS-CTL-05 pill rail; classes literal (C7). */}
                        <div ref={settingsRailRef} className="thin-scrollbar relative w-full min-w-0 overflow-x-auto pb-1">
                            <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                                <TabsTrigger value="store" className="shrink-0 gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border">
                                    <Store className="h-4 w-4" />
                                    Store Info
                                </TabsTrigger>
                                <TabsTrigger value="branding" className="shrink-0 gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border">
                                    <Palette className="h-4 w-4" />
                                    Branding
                                </TabsTrigger>
                                <TabsTrigger value="ordering" className="shrink-0 gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border">
                                    <Truck className="h-4 w-4" />
                                    Ordering
                                </TabsTrigger>
                                <TabsTrigger value="payment" className="shrink-0 gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border">
                                    <CreditCard className="h-4 w-4" />
                                    Payment & Tips
                                </TabsTrigger>
                                <TabsTrigger value="orderout" className="shrink-0 gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border">
                                    <Plug className="h-4 w-4" />
                                    OrderOut
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {/* Store Info */}
                        <TabsContent value="store" className="space-y-6">
                            <Panel>
                                <PanelSection
                                    label="Store Information"
                                    caption="Basic information about the online store"
                                >
                                    <div className="space-y-6">
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
                                                {/* Affix pairing: `rounded-l-full` here, `rounded-l-none` on the
                                                    input (§4 "Base control radius"). Borderless, like the field. */}
                                                <span className="inline-flex items-center rounded-l-full bg-muted pl-4 pr-3 text-sm text-muted-foreground">
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

                                    <div className="rounded-2xl bg-muted/60 p-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0">
                                                <p className="font-medium">Operating Hours</p>
                                                <p className="text-sm text-muted-foreground">
                                                    Storefront ordering hours (defaults to location business hours if unchanged).
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="shrink-0 self-start"
                                                onClick={() => setHoursModalOpen(true)}
                                            >
                                                Edit Hours
                                            </Button>
                                        </div>
                                    </div>
                                    </div>
                                </PanelSection>
                            </Panel>
                        </TabsContent>

                        {/* Branding Settings */}
                        <TabsContent value="branding" className="space-y-6">
                            <Panel>
                                <PanelSection
                                    label="Brand Colors"
                                    caption="Customize the store's color scheme"
                                >
                                    <div className="space-y-6">
                                    <div className="grid gap-6 sm:grid-cols-2">
                                        <div className="space-y-3">
                                            <Label>Template</Label>
                                            <Select
                                                value={(localSettings.templateId as any) || 'classic'}
                                                onValueChange={(value) => updateSettings({ templateId: value as any })}
                                            >
                                                <SelectTrigger className="h-10 w-full min-w-0" aria-label="Template">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="classic">Classic</SelectItem>
                                                    <SelectItem value="hero">Hero</SelectItem>
                                                    <SelectItem value="market">Market</SelectItem>
                                                    <SelectItem value="boutique">Boutique</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-3">
                                            <Label>Font</Label>
                                            <Select
                                                value={(localSettings.fontFamily as any) || 'DM Sans'}
                                                onValueChange={(value) => updateSettings({ fontFamily: value })}
                                            >
                                                <SelectTrigger className="h-10 w-full min-w-0" aria-label="Font">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {Object.keys(FONT_GOOGLE_URLS).map((font) => (
                                                        <SelectItem key={font} value={font}>
                                                            {font}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground">
                                                Font options are sourced from storefront supported Google Fonts.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid gap-6 sm:grid-cols-2">
                                        <div className="space-y-3">
                                            <Label>Header Style</Label>
                                            <Select
                                                value={(localSettings.headerStyle as any) || 'filled'}
                                                onValueChange={(value) => updateSettings({ headerStyle: value as any })}
                                            >
                                                <SelectTrigger className="h-10 w-full min-w-0" aria-label="Header style">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="filled">Filled</SelectItem>
                                                    <SelectItem value="transparent">Transparent</SelectItem>
                                                    <SelectItem value="outlined">Outlined</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-3">
                                            <Label>Menu Layout</Label>
                                            <Select
                                                value={(localSettings.menuLayout as any) || 'cards'}
                                                onValueChange={(value) => updateSettings({ menuLayout: value as any })}
                                            >
                                                <SelectTrigger className="h-10 w-full min-w-0" aria-label="Menu layout">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="cards">Cards</SelectItem>
                                                    <SelectItem value="sidebyside">Side-by-side</SelectItem>
                                                    <SelectItem value="no-images">No images</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="grid gap-6 sm:grid-cols-2">
                                        <div className="space-y-3">
                                            <Label>Primary Color</Label>
                                            <div className="flex items-center gap-3 min-w-0">
                                                <input
                                                    type="color"
                                                    value={localSettings.primaryColor || '#3b82f6'}
                                                    onChange={(e) => updateSettings({ primaryColor: e.target.value })}
                                                    className="h-10 w-16 shrink-0 cursor-pointer rounded-full border-0 bg-muted/60 p-1"
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
                                            <div className="flex items-center gap-3 min-w-0">
                                                <input
                                                    type="color"
                                                    value={localSettings.secondaryColor || '#10b981'}
                                                    onChange={(e) => updateSettings({ secondaryColor: e.target.value })}
                                                    className="h-10 w-16 shrink-0 cursor-pointer rounded-full border-0 bg-muted/60 p-1"
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
                                            <div className="flex items-center gap-3 min-w-0">
                                                <input
                                                    type="color"
                                                    value={(localSettings.accentColor as any) || localSettings.primaryColor || '#3b82f6'}
                                                    onChange={(e) => updateSettings({ accentColor: e.target.value })}
                                                    className="h-10 w-16 shrink-0 cursor-pointer rounded-full border-0 bg-muted/60 p-1"
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
                                            <div className="flex items-center gap-3 min-w-0">
                                                <input
                                                    type="color"
                                                    value={(localSettings.backgroundColor as any) || '#FFFFFF'}
                                                    onChange={(e) => updateSettings({ backgroundColor: e.target.value })}
                                                    className="h-10 w-16 shrink-0 cursor-pointer rounded-full border-0 bg-muted/60 p-1"
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
                                            <div className="flex items-center gap-3 min-w-0">
                                                <input
                                                    type="color"
                                                    value={(localSettings.textColor as any) || '#111827'}
                                                    onChange={(e) => updateSettings({ textColor: e.target.value })}
                                                    className="h-10 w-16 shrink-0 cursor-pointer rounded-full border-0 bg-muted/60 p-1"
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
                                            <div className="flex items-center gap-3 min-w-0">
                                                <input
                                                    type="color"
                                                    value={(localSettings.borderColor as any) || '#E5E7EB'}
                                                    onChange={(e) => updateSettings({ borderColor: e.target.value })}
                                                    className="h-10 w-16 shrink-0 cursor-pointer rounded-full border-0 bg-muted/60 p-1"
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
                                            <div className="flex items-center gap-3 min-w-0">
                                                <input
                                                    type="color"
                                                    value={(localSettings.cardColor as any) || '#FFFFFF'}
                                                    onChange={(e) => updateSettings({ cardColor: e.target.value })}
                                                    className="h-10 w-16 shrink-0 cursor-pointer rounded-full border-0 bg-muted/60 p-1"
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
                                            <div className="flex items-center gap-3 min-w-0">
                                                <input
                                                    type="color"
                                                    value={(localSettings.headerTextColor as any) || (localSettings.textColor as any) || '#111827'}
                                                    onChange={(e) => updateSettings({ headerTextColor: e.target.value })}
                                                    className="h-10 w-16 shrink-0 cursor-pointer rounded-full border-0 bg-muted/60 p-1"
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
                                    </div>
                                </PanelSection>
                            </Panel>
                        </TabsContent>

                        <HoursConfigModal
                            open={hoursModalOpen}
                            onOpenChange={setHoursModalOpen}
                            title="Operating Hours"
                            description="These hours are used to determine when the storefront accepts new orders."
                            schedule={normalizeWeeklySchedule(localSettings?.operatingHours) as any}
                            onSave={(schedule) => updateSettings({ operatingHours: schedule as any })}
                        />

                        {/* Pickup & Delivery */}
                        <TabsContent value="ordering" className="space-y-6">
                            <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
                                <Panel>
                                    <PanelSection
                                        icon={Store}
                                        label="Pickup Orders"
                                        caption="Allow customers to pick up orders"
                                        action={
                                            <Switch
                                                aria-label="Pickup orders"
                                                checked={localSettings.pickupEnabled ?? true}
                                                onCheckedChange={(pickupEnabled) => updateSettings({ pickupEnabled })}
                                            />
                                        }
                                    />
                                </Panel>

                                <Panel>
                                    <PanelSection
                                        icon={Truck}
                                        label="Delivery Orders"
                                        caption="Offer delivery to customers"
                                        action={
                                            <Switch
                                                aria-label="Delivery orders"
                                                checked={localSettings.deliveryEnabled ?? false}
                                                onCheckedChange={(deliveryEnabled) => updateSettings({ deliveryEnabled })}
                                            />
                                        }
                                    >
                                    {localSettings.deliveryEnabled && (
                                        <div className="space-y-4">
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
                                        </div>
                                    )}
                                    </PanelSection>
                                </Panel>
                            </div>

                            <Panel>
                                <PanelSection
                                    label="Order Settings"
                                    caption="Configure order timing and requirements"
                                >
                                    <div className="space-y-6">
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
                                    </div>
                                </PanelSection>
                            </Panel>

                            <Panel>
                                <PanelSection
                                    label="Order Automation"
                                    caption="Automate order handling to match the merchant dashboard flow"
                                >
                                    <div className="space-y-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Zap className="h-5 w-5 text-muted-foreground shrink-0" />
                                            <div className="min-w-0">
                                                <Label>Automatically Accept All Orders</Label>
                                                <p className="text-sm text-muted-foreground">
                                                    New orders will be accepted without manual confirmation
                                                </p>
                                            </div>
                                        </div>
                                        <Switch className="shrink-0"
                                            checked={localSettings.autoAcceptOrders ?? false}
                                            onCheckedChange={(autoAcceptOrders) => updateSettings({ autoAcceptOrders })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Check className="h-5 w-5 text-muted-foreground shrink-0" />
                                            <div className="min-w-0">
                                                <Label>Auto-Close Paid Orders</Label>
                                                <p className="text-sm text-muted-foreground">
                                                    Automatically close orders that are paid upon acceptance
                                                </p>
                                            </div>
                                        </div>
                                        <Switch className="shrink-0"
                                            checked={localSettings.autoClosePaidOrders ?? false}
                                            onCheckedChange={(autoClosePaidOrders) =>
                                                updateSettings({ autoClosePaidOrders })
                                            }
                                        />
                                    </div>
                                    </div>
                                </PanelSection>
                            </Panel>

                            <Panel>
                                <PanelSection
                                    label="Notifications"
                                    caption="Get notified about new orders"
                                >
                                    <div className="space-y-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Bell className="h-5 w-5 text-muted-foreground shrink-0" />
                                            <div className="min-w-0">
                                                <Label>Email on New Order</Label>
                                                <p className="text-sm text-muted-foreground">
                                                    Send an email notification for every new order
                                                </p>
                                            </div>
                                        </div>
                                        <Switch className="shrink-0"
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
                                    </div>
                                </PanelSection>
                            </Panel>
                        </TabsContent>

                        {/* Payment & Tips */}
                        <TabsContent value="payment" className="space-y-6">
                            <Panel>
                                <PanelSection
                                    label="Payment Methods"
                                    caption="Choose which payment methods to accept"
                                >
                                    <div className="space-y-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <CreditCard className="h-5 w-5 text-muted-foreground shrink-0" />
                                            <div className="min-w-0">
                                                <Label>Accept Online Card Payments</Label>
                                                <p className="text-sm text-muted-foreground">
                                                    Process payments via integrated payment processor
                                                </p>
                                            </div>
                                        </div>
                                        <Switch className="shrink-0"
                                            checked={localSettings.acceptOnlinePayments ?? true}
                                            onCheckedChange={(acceptOnlinePayments) =>
                                                updateSettings({ acceptOnlinePayments })
                                            }
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <DollarSign className="h-5 w-5 text-muted-foreground shrink-0" />
                                            <div className="min-w-0">
                                                <Label>Accept Cash on Delivery</Label>
                                                <p className="text-sm text-muted-foreground">
                                                    Allow customers to pay cash at the door
                                                </p>
                                            </div>
                                        </div>
                                        <Switch className="shrink-0"
                                            checked={localSettings.acceptCashOnDelivery ?? false}
                                            onCheckedChange={(acceptCashOnDelivery) =>
                                                updateSettings({ acceptCashOnDelivery })
                                            }
                                        />
                                    </div>
                                    </div>
                                </PanelSection>
                            </Panel>

                            <Panel>
                                <PanelSection
                                    label="Tipping"
                                    caption="Configure tipping options for customers"
                                    action={
                                        <Switch
                                            aria-label="Tipping"
                                            checked={localSettings.tippingEnabled ?? true}
                                            onCheckedChange={(tippingEnabled) => updateSettings({ tippingEnabled })}
                                        />
                                    }
                                >
                                {localSettings.tippingEnabled && (
                                    <div className="space-y-6">
                                        <div className="space-y-3">
                                            <Label>Preset Tip Percentages</Label>
                                            <div className="flex gap-2 flex-wrap">
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
                                    </div>
                                )}
                                </PanelSection>
                            </Panel>

                            <Panel>
                                <PanelSection
                                    label="Convenience Fee"
                                    caption="Add a fee for online ordering"
                                    action={
                                        <Switch
                                            aria-label="Convenience fee"
                                            checked={localSettings.convenienceFeeEnabled ?? false}
                                            onCheckedChange={(convenienceFeeEnabled) =>
                                                updateSettings({ convenienceFeeEnabled })
                                            }
                                        />
                                    }
                                >
                                {localSettings.convenienceFeeEnabled && (
                                    <div>
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
                                    </div>
                                )}
                                </PanelSection>
                            </Panel>
                        </TabsContent>

                        <TabsContent value="orderout" className="space-y-6">
                            <Panel>
                                <PanelSection
                                    icon={Plug}
                                    label="OrderOut Delivery Integration"
                                    caption="Connect this location to UberEats, DoorDash, Grubhub, and other delivery marketplaces."
                                    action={<Badge variant="outline" className="tabular-nums">$79.99/mo</Badge>}
                                >
                                <div>
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
                                </div>
                                </PanelSection>
                            </Panel>
                        </TabsContent>
                    </Tabs>
                        </>
                    ) : null}
                </>
            )}
        </div>
    )
}
