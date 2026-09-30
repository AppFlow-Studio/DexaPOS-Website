'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'
import { PageShell, TAB_PILL_ACTIVE } from '@/components/dashboard/shell'
import { Button } from '@/components/ui/button'
import {
    AlertTriangle,
    LayoutDashboard,
    Building2,
    StickyNote,
    History,
    CreditCard,
    Banknote,
    ShieldCheck,
    Receipt,
    FileText,
    LifeBuoy,
    Monitor,
    MapPin,
    Globe,
    FileSpreadsheet,
    Download,
    ChevronDown,
    CircleDollarSign,
    type LucideIcon,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useAdminMerchantDetails } from '@/lib/queries/use-admin-merchant'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'
import { useIsMobile } from '@/hooks/use-mobile'
import { OverviewTab } from './components/OverviewTab'
import { BusinessInfoTab } from './components/BusinessInfoTab'
import { NotesTab } from './components/NotesTab'
import { AuditLogsTab } from './components/AuditLogsTab'
import { DevicesTab } from './components/DevicesTab'
import { BillingTab } from './components/BillingTab'
import { PlatformBillingTab } from './components/PlatformBillingTab'
import { HqSubscriptionsWorkspace } from '@/components/billing/HqSubscriptionsWorkspace'
import { OnlineStoreTab } from './components/OnlineStoreTab'
import { OnboardingStatusCard } from './components/OnboardingStatusCard'
import { MerchantHeaderBar } from './components/MerchantHeaderBar'
import { RiskStrip } from './components/RiskStrip'
import { MidsSection } from './components/sections/MidsSection'
import { ValorBoardingSection } from './components/sections/ValorBoardingSection'
import { SettlementsSection } from './components/sections/SettlementsSection'
import { DisputesSection } from './components/sections/DisputesSection'
import { SupportTicketsSection } from './components/sections/SupportTicketsSection'
import { LocationsSection } from './components/sections/LocationsSection'
import { CloverImportDialog } from './components/CloverImportDialog'
import { MerchantInfoModel } from '@/types/db-modles'

type SectionKey =
    | 'overview'
    | 'business-info'
    | 'notes'
    | 'audit'
    | 'mids'
    | 'valor-boarding'
    | 'settlements'
    | 'disputes'
    | 'billing'
    | 'platform-billing'
    | 'subscriptions'
    | 'online-store'
    | 'support'
    | 'devices'
    | 'locations'

type SectionGroup = 'Account' | 'Processing' | 'Operations'

interface SectionDef {
    value: SectionKey
    group: SectionGroup
    icon: LucideIcon
    label: string
    /** Shorter label for phones, where the section row is narrow. */
    shortLabel?: string
    /** Gate on an HQ permission; hidden sections are never navigable. */
    requires?: 'billing' | 'devices'
}

/** One table drives both rows of the section bar, so they cannot drift. */
const SECTIONS: SectionDef[] = [
    { value: 'overview', group: 'Account', icon: LayoutDashboard, label: 'Overview' },
    { value: 'business-info', group: 'Account', icon: Building2, label: 'Business' },
    { value: 'notes', group: 'Account', icon: StickyNote, label: 'Notes' },
    { value: 'audit', group: 'Account', icon: History, label: 'Audit' },
    { value: 'mids', group: 'Processing', icon: CreditCard, label: 'MIDs' },
    { value: 'valor-boarding', group: 'Processing', icon: CreditCard, label: 'Valor Boarding', shortLabel: 'Valor' },
    { value: 'settlements', group: 'Processing', icon: Banknote, label: 'Settlements' },
    { value: 'disputes', group: 'Processing', icon: ShieldCheck, label: 'Disputes' },
    { value: 'billing', group: 'Processing', icon: Receipt, label: 'Billing' },
    { value: 'platform-billing', group: 'Processing', icon: FileText, label: 'Platform Billing' },
    { value: 'subscriptions', group: 'Processing', icon: CircleDollarSign, label: 'Subscriptions', requires: 'billing' },
    { value: 'online-store', group: 'Operations', icon: Globe, label: 'Online Store' },
    { value: 'support', group: 'Operations', icon: LifeBuoy, label: 'Support' },
    { value: 'devices', group: 'Operations', icon: Monitor, label: 'Devices', requires: 'devices' },
    { value: 'locations', group: 'Operations', icon: MapPin, label: 'Locations' },
]

const GROUPS: SectionGroup[] = ['Account', 'Processing', 'Operations']

const VALID_SECTIONS = SECTIONS.map((s) => s.value)

export default function MerchantDetailsPage() {
    const { merchantId } = useParams()
    const searchParams = useSearchParams()
    const { hasPermission } = useAdminPermissions()
    const isMobile = useIsMobile()
    const { data: merchantDetails, isLoading, isError, refetch, isRefetching } =
        useAdminMerchantDetails(merchantId as string)

    const canManageDevices = hasPermission('users.manage')
    const canManageMerchantStatus = hasPermission('hq.merchant.update')
    const canImportMenu = hasPermission('hq.merchant.menu.import')
    const canManageBilling = hasPermission('system.billing.manage')

    const [cloverImportOpen, setCloverImportOpen] = useState(false)

    const requestedTab = searchParams.get('tab') as SectionKey | null
    // Deep-links (e.g. from subscription notifications) may request the
    // subscriptions tab; fall back to overview when the viewer lacks billing
    // access so they never land on an empty pane.
    const resolveTab = (tab: SectionKey | null): SectionKey => {
        if (!tab || !VALID_SECTIONS.includes(tab)) return 'overview'
        if (tab === 'subscriptions' && !canManageBilling) return 'overview'
        return tab
    }
    const [activeTab, setActiveTab] = useState<SectionKey>(resolveTab(requestedTab))

    useEffect(() => {
        if (requestedTab && VALID_SECTIONS.includes(requestedTab)) {
            setActiveTab(resolveTab(requestedTab))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestedTab, canManageBilling])

    const sections = SECTIONS.filter(
        (s) =>
            !s.requires ||
            (s.requires === 'billing' && canManageBilling) ||
            (s.requires === 'devices' && canManageDevices)
    )

    const activeGroup = SECTIONS.find((s) => s.value === activeTab)?.group ?? 'Account'
    const groupSections = sections.filter((s) => s.group === activeGroup)

    // Switching group returns to the section last open in it, so hopping
    // Account → Processing → Account does not lose your place.
    const lastInGroup = useRef<Partial<Record<SectionGroup, SectionKey>>>({})
    const selectGroup = (group: SectionGroup) => {
        lastInGroup.current[activeGroup] = activeTab
        const remembered = lastInGroup.current[group]
        const target = sections.find((s) => s.value === remembered) ?? sections.find((s) => s.group === group)
        if (target) openTab(target.value)
    }

    // Mirror the open section into `?tab=` so leaving for a sub-page (an audit
    // entry, an order) and pressing Back returns to it instead of Overview.
    // `replaceState`, not a router push: switching sections is not a history
    // step, and Next keeps `useSearchParams` in sync with it.
    const openTab = (tab: SectionKey) => {
        setActiveTab(tab)
        const params = new URLSearchParams(window.location.search)
        params.set('tab', tab)
        window.history.replaceState(null, '', `?${params.toString()}`)
    }

    // Section row: keep the active pill centred (§13.2, D-24). Scroll the rail
    // itself rather than `scrollIntoView`, which walks every scrollable
    // ancestor. `isLoading` is a dep because the rail is not mounted while the
    // skeleton renders.
    const railRef = useRef<HTMLDivElement>(null)
    const railPositioned = useRef(false)
    useEffect(() => {
        const rail = railRef.current
        if (!rail) return
        let done = false
        const align = () => {
            const max = rail.scrollWidth - rail.clientWidth
            const tab = rail.querySelector<HTMLElement>('[data-state="active"]')
            if (done || !tab || max <= 0) return
            const left = tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2
            const smooth =
                railPositioned.current && !matchMedia('(prefers-reduced-motion: reduce)').matches
            rail.scrollTo({ left: Math.max(0, Math.min(left, max)), behavior: smooth ? 'smooth' : 'auto' })
            railPositioned.current = done = true
        }
        align()
        const observer = new ResizeObserver(align)
        observer.observe(rail)
        return () => observer.disconnect()
    }, [activeTab, isLoading])

    if (isLoading)
        return (
            <DataPageSkeleton
                variant="detail"
                shell="plain"
                label="Loading merchant details"
            />
        )

    // A failure is a sentence in a neutral well with a way forward (§4.9),
    // not red text.
    if (isError || !merchantDetails) {
        return (
            <PageShell as="div">
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-muted/30 px-4 py-20 text-center">
                    <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                    <div className="space-y-1">
                        <h2 className="text-lg font-semibold">We hit a snag loading this merchant</h2>
                        <p className="text-sm text-muted-foreground">
                            {isError
                                ? 'Try again, or head back to the merchant list.'
                                : 'This merchant may have been removed, or you may not have access to it.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        {isError && (
                            <Button onClick={() => refetch()} disabled={isRefetching}>
                                Retry
                            </Button>
                        )}
                        <Button variant="outline" asChild>
                            <Link href="/manage/merchants">Back to Merchants</Link>
                        </Button>
                    </div>
                </div>
            </PageShell>
        )
    }

    return (
        <PageShell as="div">
            <MerchantHeaderBar
                merchant={merchantDetails}
                actions={
                    canImportMenu && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="h-9 px-4 text-[0.8125rem] font-medium shadow-sm">
                                    <Download className="h-3.5 w-3.5" />
                                    Import Menu
                                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                                </Button>
                            </DropdownMenuTrigger>
                            {/* Phones: the button wraps to the left edge, so an
                                end-aligned panel would jam against it. */}
                            <DropdownMenuContent
                                align={isMobile ? 'start' : 'end'}
                                collisionPadding={16}
                                className="w-56"
                            >
                                <DropdownMenuLabel>Import menu from…</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => setCloverImportOpen(true)}>
                                    <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                                    From Clover (.xlsx)
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )
                }
            />
            <RiskStrip merchant={merchantDetails} />

            <CloverImportDialog
                merchantId={merchantDetails.id}
                open={cloverImportOpen}
                onOpenChange={setCloverImportOpen}
            />

            {/* Section bar: the groups, then the active group's sections.
                One row from md up (a divider separates the two levels), two
                stacked rows on phones. It replaced a 200px side nav so section
                content gets the full width. Each section owns its own panels,
                so there is no outer panel here (§3.1). Pinned flush to the top
                of #main-content (§13.2): sticky insets by the container's
                padding (p-4 sm:p-6), so the negative top and side margins
                cancel it and no content shows above or beside the bar. */}
            <div className="sticky -top-4 z-20 -mx-4 flex flex-col gap-2 bg-background px-4 py-2 sm:-top-6 sm:-mx-6 sm:px-6 md:flex-row md:items-center md:gap-3">
                {/* Groups are bare words — no rail, no pill — so the only
                    raised pill on the bar is the active section. The active
                    group is marked by full-strength text alone. */}
                <nav aria-label="Merchant section groups" className="flex shrink-0 items-center gap-1">
                    {GROUPS.map((group) => {
                        const active = group === activeGroup
                        return (
                            <button
                                key={group}
                                type="button"
                                aria-current={active ? 'true' : undefined}
                                onClick={() => selectGroup(group)}
                                className={cn(
                                    'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors',
                                    active
                                        ? 'font-semibold text-foreground'
                                        : 'font-normal text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {/* The invisible semibold copy reserves the
                                    bold width, so switching group does not
                                    nudge its neighbours sideways. */}
                                <span className="inline-grid justify-items-center">
                                    <span className="col-start-1 row-start-1">{group}</span>
                                    <span aria-hidden className="invisible col-start-1 row-start-1 font-semibold">
                                        {group}
                                    </span>
                                </span>
                            </button>
                        )
                    })}
                </nav>

                <div aria-hidden className="hidden h-5 w-px shrink-0 bg-border md:block" />

                {/* Ghost pills, not a second rail, so the sections read as
                    subordinate to the groups. Scrolls when the group has more
                    sections than fit, with the active pill kept in view
                    (§13.2). */}
                <div ref={railRef} className="no-scrollbar relative -mx-1 min-w-0 overflow-x-auto px-1 py-0.5 md:flex-1">
                    <nav aria-label="Merchant sections" className="flex w-max flex-nowrap gap-1">
                        {groupSections.map(({ value, icon: Icon, label, shortLabel }) => {
                            const active = activeTab === value
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    aria-current={active ? 'page' : undefined}
                                    data-state={active ? 'active' : 'inactive'}
                                    onClick={() => openTab(value)}
                                    className={cn(
                                        'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors',
                                        // Neutral active state (§4.5) — never brand text or fill.
                                        active
                                            ? cn('font-medium', TAB_PILL_ACTIVE)
                                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                    )}
                                >
                                    <Icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" />
                                    {shortLabel ? (
                                        <>
                                            <span className="sm:hidden">{shortLabel}</span>
                                            <span className="hidden sm:inline">{label}</span>
                                        </>
                                    ) : (
                                        label
                                    )}
                                </button>
                            )
                        })}
                    </nav>
                </div>
            </div>

            <div className="min-w-0">
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        <OnboardingStatusCard merchant={merchantDetails} />
                        <OverviewTab merchantInfo={merchantDetails} />
                    </div>
                )}

                {activeTab === 'business-info' && (
                    <BusinessInfoTab merchantInfo={merchantDetails} />
                )}

                {activeTab === 'notes' && <NotesTab merchantId={merchantDetails.id} />}

                {activeTab === 'audit' && (
                    <AuditLogsTab merchantInfo={merchantDetails as unknown as MerchantInfoModel} />
                )}

                {activeTab === 'mids' && <MidsSection merchantId={merchantDetails.id} />}

                {activeTab === 'valor-boarding' && <ValorBoardingSection merchantId={merchantDetails.id} />}

                {activeTab === 'settlements' && (
                    <SettlementsSection merchantId={merchantDetails.id} />
                )}

                {activeTab === 'disputes' && (
                    <DisputesSection merchantId={merchantDetails.id} />
                )}

                {activeTab === 'billing' && (
                    <BillingTab
                        merchantId={merchantDetails.id}
                        merchantName={merchantDetails.name}
                        canEdit={canManageMerchantStatus}
                        locations={merchantDetails.locations}
                    />
                )}

                {activeTab === 'platform-billing' && (
                    <PlatformBillingTab
                        merchantId={merchantDetails.id}
                        locations={merchantDetails.locations}
                    />
                )}

                {activeTab === 'subscriptions' && canManageBilling && (
                    <HqSubscriptionsWorkspace
                        merchant={merchantDetails}
                        canManageBilling={canManageBilling}
                    />
                )}

                {activeTab === 'online-store' && (
                    <OnlineStoreTab
                        merchantId={merchantDetails.id}
                        merchantName={merchantDetails.name}
                        locations={merchantDetails.locations}
                        locationsLoading={false}
                    />
                )}

                {activeTab === 'support' && (
                    <SupportTicketsSection merchantId={merchantDetails.id} />
                )}

                {canManageDevices && activeTab === 'devices' && (
                    <DevicesTab merchantId={merchantDetails.id} merchantInfo={merchantDetails} />
                )}

                {activeTab === 'locations' && (
                    <LocationsSection locations={merchantDetails.locations} />
                )}
            </div>
        </PageShell>
    )
}
