'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageLoader } from '@/components/ui/page-loader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
    LifeBuoy,
    Monitor,
    MapPin,
    Globe,
    type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAdminMerchantDetails } from '@/lib/queries/use-admin-merchant'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'
import { OverviewTab } from './components/OverviewTab'
import { BusinessInfoTab } from './components/BusinessInfoTab'
import { NotesTab } from './components/NotesTab'
import { AuditLogsTab } from './components/AuditLogsTab'
import { DevicesTab } from './components/DevicesTab'
import { BillingTab } from './components/BillingTab'
import { OnlineStoreTab } from './components/OnlineStoreTab'
import { OnboardingStatusCard } from './components/OnboardingStatusCard'
import { MerchantHeaderBar } from './components/MerchantHeaderBar'
import { RiskStrip } from './components/RiskStrip'
import { MidsSection } from './components/sections/MidsSection'
import { NmiAccountsSection } from './components/sections/NmiAccountsSection'
import { SettlementsSection } from './components/sections/SettlementsSection'
import { DisputesSection } from './components/sections/DisputesSection'
import { SupportTicketsSection } from './components/sections/SupportTicketsSection'
import { LocationsSection } from './components/sections/LocationsSection'
import { MerchantInfoModel } from '@/types/db-modles'

type SectionKey =
    | 'overview'
    | 'business-info'
    | 'notes'
    | 'audit'
    | 'mids'
    | 'nmi-accounts'
    | 'settlements'
    | 'disputes'
    | 'billing'
    | 'online-store'
    | 'support'
    | 'devices'
    | 'locations'

const VALID_SECTIONS: SectionKey[] = [
    'overview',
    'business-info',
    'notes',
    'audit',
    'mids',
    'nmi-accounts',
    'settlements',
    'disputes',
    'billing',
    'online-store',
    'support',
    'devices',
    'locations',
]

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-0.5">
            <p className="px-3 pb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                {label}
            </p>
            {children}
        </div>
    )
}

function NavItem({
    value,
    icon: Icon,
    active,
    onClick,
    children,
}: {
    value: SectionKey
    icon: LucideIcon
    active: boolean
    onClick: (v: SectionKey) => void
    children: React.ReactNode
}) {
    return (
        <button
            onClick={() => onClick(value)}
            className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-[12.5px] transition-colors',
                active
                    ? 'bg-foreground font-medium text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
        >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {children}
        </button>
    )
}

export default function MerchantDetailsPage() {
    const { merchantId } = useParams()
    const searchParams = useSearchParams()
    const { hasPermission } = useAdminPermissions()
    const { data: merchantDetails, isLoading, isError } = useAdminMerchantDetails(merchantId as string)

    const canManageDevices = hasPermission('users.manage')
    const canManageMerchantStatus = hasPermission('hq.merchant.update')

    const requestedTab = searchParams.get('tab') as SectionKey | null
    const initial: SectionKey =
        requestedTab && VALID_SECTIONS.includes(requestedTab) ? requestedTab : 'overview'
    const [activeTab, setActiveTab] = useState<SectionKey>(initial)

    useEffect(() => {
        if (requestedTab && VALID_SECTIONS.includes(requestedTab)) {
            setActiveTab(requestedTab)
        }
    }, [requestedTab])

    if (isLoading) return <PageLoader message="Loading merchant details..." />

    if (isError || !merchantDetails) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <AlertTriangle className="mb-2 h-8 w-8 text-destructive" />
                <div className="mb-1 font-semibold text-destructive">Unable to load merchant</div>
                <Button variant="outline" asChild className="mt-4">
                    <Link href="/manage/merchants">Back to Merchants</Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <Link href="/manage/merchants" className="hover:underline">
                    Merchants
                </Link>
                <span>/</span>
                <span className="text-foreground">{merchantDetails.name}</span>
            </div>

            <MerchantHeaderBar merchant={merchantDetails} />
            <RiskStrip merchant={merchantDetails} />

            <Card>
                <CardContent className="pt-6">
                    <div className="flex gap-6">
                        <nav className="w-[200px] shrink-0 space-y-5 sticky top-7 self-start">
                            <NavGroup label="Account">
                                <NavItem value="overview" icon={LayoutDashboard} active={activeTab === 'overview'} onClick={setActiveTab}>
                                    Overview
                                </NavItem>
                                <NavItem value="business-info" icon={Building2} active={activeTab === 'business-info'} onClick={setActiveTab}>
                                    Business
                                </NavItem>
                                <NavItem value="notes" icon={StickyNote} active={activeTab === 'notes'} onClick={setActiveTab}>
                                    Notes
                                </NavItem>
                                <NavItem value="audit" icon={History} active={activeTab === 'audit'} onClick={setActiveTab}>
                                    Audit
                                </NavItem>
                            </NavGroup>

                            <NavGroup label="Processing">
                                <NavItem value="mids" icon={CreditCard} active={activeTab === 'mids'} onClick={setActiveTab}>
                                    MIDs
                                </NavItem>
                                <NavItem value="nmi-accounts" icon={CreditCard} active={activeTab === 'nmi-accounts'} onClick={setActiveTab}>
                                    NMI Accounts
                                </NavItem>
                                <NavItem value="settlements" icon={Banknote} active={activeTab === 'settlements'} onClick={setActiveTab}>
                                    Settlements
                                </NavItem>
                                <NavItem value="disputes" icon={ShieldCheck} active={activeTab === 'disputes'} onClick={setActiveTab}>
                                    Disputes
                                </NavItem>
                                <NavItem value="billing" icon={Receipt} active={activeTab === 'billing'} onClick={setActiveTab}>
                                    Billing
                                </NavItem>
                            </NavGroup>

                            <NavGroup label="Operations">
                                <NavItem value="online-store" icon={Globe} active={activeTab === 'online-store'} onClick={setActiveTab}>
                                    Online Store
                                </NavItem>
                                <NavItem value="support" icon={LifeBuoy} active={activeTab === 'support'} onClick={setActiveTab}>
                                    Support
                                </NavItem>
                                {canManageDevices && (
                                    <NavItem value="devices" icon={Monitor} active={activeTab === 'devices'} onClick={setActiveTab}>
                                        Devices
                                    </NavItem>
                                )}
                                <NavItem value="locations" icon={MapPin} active={activeTab === 'locations'} onClick={setActiveTab}>
                                    Locations
                                </NavItem>
                            </NavGroup>
                        </nav>

                        <div className="min-w-0 flex-1 border-l pl-6">
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

                            {activeTab === 'nmi-accounts' && <NmiAccountsSection merchantId={merchantDetails.id} />}

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
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
