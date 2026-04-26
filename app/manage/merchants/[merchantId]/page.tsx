'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    AlertTriangle,
    LayoutDashboard,
    Building2,
    ShoppingCart,
    CreditCard,
    DollarSign,
    Receipt,
    Users,
    UserRound,
    UtensilsCrossed,
    Package,
    Tag,
    Globe,
    CalendarDays,
    Monitor,
    StickyNote,
    History,
    Settings,
    Archive,
    FileText,
    type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAdminMerchantDetails } from '@/lib/queries/use-admin-merchant'
import { MerchantDetails } from '@/types/merchant'
import { MerchantInfoModel } from '@/types/db-modles'
import { OverviewTab } from './components/OverviewTab'
import { TransactionsTab } from './components/TransactionsTab'
import { StaffTab } from './components/StaffTab'
import { AuditLogsTab } from './components/AuditLogsTab'
import { CustomersTab } from './components/CustomersTab'
import { ProductsTab } from './components/ProductsTab'
import { SettingsTab } from './components/SettingsTab'
import { BusinessInfoTab } from './components/BusinessInfoTab'
import { DevicesTab } from './components/DevicesTab'
import { MenuTab } from './components/MenuTab'
import { OnlineStoreTab } from './components/OnlineStoreTab'
import { DiscountsTab } from './components/DiscountsTab'
import { SchedulesTab } from './components/SchedulesTab'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'
import { NotesTab } from './components/NotesTab'
import { OrdersTab } from './components/OrdersTab'
import { OnboardingStatusCard } from './components/OnboardingStatusCard'
import { BillingTab } from './components/BillingTab'
import { CashDrawersTab } from './components/CashDrawersTab'
import { TaxReportTab } from './components/TaxReportTab'
import { MerchantLogoUpload } from './components/MerchantLogoUpload'
import { PaymentsTab } from './components/PaymentsTab'
import { InvoicesTab } from './components/InvoicesTab'
import { TipsTab } from './components/TipsTab'

// ─── Sidebar nav primitives ──────────────────────────────────────────────────

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-0.5">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
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
    value: string
    icon: LucideIcon
    active: boolean
    onClick: (v: string) => void
    children: React.ReactNode
}) {
    return (
        <button
            onClick={() => onClick(value)}
            className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                active
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
        >
            <Icon className="h-4 w-4 shrink-0" />
            {children}
        </button>
    )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MerchantDetailsPage() {
    const { merchantId } = useParams()
    const searchParams = useSearchParams()
    const { hasPermission } = useAdminPermissions()
    const { data: merchantDetails, isLoading, isError, refetch } = useAdminMerchantDetails(merchantId as string)
    const canManageDevices = hasPermission('users.manage')
    const canViewSettings = hasPermission('users.manage')
    const canManageMerchantStatus = hasPermission('hq.merchant.update')

    const requestedTab = searchParams.get('tab')
    const [activeTab, setActiveTab] = useState(requestedTab || 'overview')

    useEffect(() => {
        if (requestedTab) {
            setActiveTab(requestedTab)
        }
    }, [requestedTab])

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
                <span className="text-muted-foreground text-sm font-medium">Loading merchant details...</span>
            </div>
        )
    }

    if (isError || !merchantDetails) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
                <div className="text-destructive font-semibold mb-1">Unable to load merchant</div>
                <Button variant="outline" asChild className="mt-4">
                    <Link href="/manage/merchants">Back to Merchants</Link>
                </Button>
            </div>
        )
    }

    const merchantLifecycleStatus = merchantDetails.onboarding_status || merchantDetails.derived_status
    const headerStatusClass: Record<string, string> = {
        created: 'bg-slate-100 text-slate-700 border-slate-300',
        onboarding: 'bg-amber-100 text-amber-700 border-amber-300',
        active: 'bg-emerald-100 text-emerald-700 border-emerald-300',
        suspended: 'bg-red-100 text-red-700 border-red-300',
        cancelled: 'bg-zinc-200 text-zinc-700 border-zinc-300',
        inactive: 'bg-red-100 text-red-700 border-red-300',
    }

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Link href="/manage/merchants" className="hover:underline">Merchants</Link>
                <span className="mx-2">/</span>
                <span className="text-foreground">Merchant Details</span>
            </div>

            {/* Header */}
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <MerchantLogoUpload
                                merchantId={merchantDetails.id}
                                merchantName={merchantDetails.name}
                                logoUrl={merchantDetails.logo_url}
                            />
                            <div>
                                <CardTitle className="text-2xl font-semibold">{merchantDetails.name}</CardTitle>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline">ID: {merchantDetails.clerk_org_id}</Badge>
                                    <Badge className={headerStatusClass[merchantLifecycleStatus] || headerStatusClass.onboarding}>
                                        {merchantLifecycleStatus.replace('_', ' ')}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        Created {new Date(merchantDetails.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="mb-6">
                        <OnboardingStatusCard merchant={merchantDetails} />
                    </div>

                    {/* Vertical nav + content */}
                    <div className="flex gap-6 border-t pt-6">

                        {/* ── Left Sidebar ── */}
                        <nav className="w-44 shrink-0 space-y-4">
                            <NavGroup label="Overview">
                                <NavItem value="overview" icon={LayoutDashboard} active={activeTab === 'overview'} onClick={setActiveTab}>Overview</NavItem>
                                <NavItem value="business-info" icon={Building2} active={activeTab === 'business-info'} onClick={setActiveTab}>Business Info</NavItem>
                            </NavGroup>

                            <NavGroup label="Operations">
                                <NavItem value="orders" icon={ShoppingCart} active={activeTab === 'orders'} onClick={setActiveTab}>Orders</NavItem>
                                <NavItem value="transactions" icon={CreditCard} active={activeTab === 'transactions'} onClick={setActiveTab}>Transactions</NavItem>
                                <NavItem value="payments" icon={CreditCard} active={activeTab === 'payments'} onClick={setActiveTab}>Payments</NavItem>
                                <NavItem value="invoices" icon={Receipt} active={activeTab === 'invoices'} onClick={setActiveTab}>Invoices</NavItem>
                                <NavItem value="tips" icon={DollarSign} active={activeTab === 'tips'} onClick={setActiveTab}>Tips</NavItem>
                                <NavItem value="billing" icon={Receipt} active={activeTab === 'billing'} onClick={setActiveTab}>Billing</NavItem>
                            </NavGroup>

                            <NavGroup label="People">
                                <NavItem value="staff" icon={Users} active={activeTab === 'staff'} onClick={setActiveTab}>Staff</NavItem>
                                <NavItem value="customers" icon={UserRound} active={activeTab === 'customers'} onClick={setActiveTab}>Customers</NavItem>
                            </NavGroup>

                            <NavGroup label="Catalog">
                                <NavItem value="menu" icon={UtensilsCrossed} active={activeTab === 'menu'} onClick={setActiveTab}>Menu</NavItem>
                                <NavItem value="products" icon={Package} active={activeTab === 'products'} onClick={setActiveTab}>Products</NavItem>
                                <NavItem value="discounts" icon={Tag} active={activeTab === 'discounts'} onClick={setActiveTab}>Discounts</NavItem>
                            </NavGroup>

                            <NavGroup label="Store">
                                <NavItem value="online-store" icon={Globe} active={activeTab === 'online-store'} onClick={setActiveTab}>Online Store</NavItem>
                                <NavItem value="schedules" icon={CalendarDays} active={activeTab === 'schedules'} onClick={setActiveTab}>Schedules</NavItem>
                                {canManageDevices && (
                                    <NavItem value="devices" icon={Monitor} active={activeTab === 'devices'} onClick={setActiveTab}>Devices</NavItem>
                                )}
                            </NavGroup>

                            <NavGroup label="Analytics">
                                <NavItem value="cash-drawers" icon={Archive} active={activeTab === 'cash-drawers'} onClick={setActiveTab}>Cash Drawers</NavItem>
                                <NavItem value="tax-report" icon={FileText} active={activeTab === 'tax-report'} onClick={setActiveTab}>Tax Report</NavItem>
                            </NavGroup>

                            <NavGroup label="Admin">
                                <NavItem value="notes" icon={StickyNote} active={activeTab === 'notes'} onClick={setActiveTab}>Notes</NavItem>
                                <NavItem value="audit" icon={History} active={activeTab === 'audit'} onClick={setActiveTab}>Audit Logs</NavItem>
                                {canViewSettings && (
                                    <NavItem value="settings" icon={Settings} active={activeTab === 'settings'} onClick={setActiveTab}>Settings</NavItem>
                                )}
                            </NavGroup>
                        </nav>

                        {/* ── Content Panes ── */}
                        <div className="flex-1 min-w-0 border-l pl-6">
                            {activeTab === 'overview' && (
                                <OverviewTab merchantInfo={merchantDetails} />
                            )}

                            {activeTab === 'business-info' && (
                                <BusinessInfoTab merchantInfo={merchantDetails} />
                            )}

                            {activeTab === 'orders' && (
                                <OrdersTab merchantInfo={merchantDetails} />
                            )}

                            {activeTab === 'transactions' && (
                                <TransactionsTab merchantInfo={merchantDetails as unknown as MerchantInfoModel} />
                            )}

                            {activeTab === 'payments' && (
                                <PaymentsTab
                                    merchantId={merchantDetails.id}
                                    locations={merchantDetails.locations}
                                />
                            )}

                            {activeTab === 'invoices' && (
                                <InvoicesTab
                                    merchantId={merchantDetails.id}
                                    locations={merchantDetails.locations}
                                />
                            )}

                            {activeTab === 'tips' && (
                                <TipsTab
                                    merchantId={merchantDetails.id}
                                    locations={merchantDetails.locations}
                                />
                            )}

                            {activeTab === 'billing' && (
                                <BillingTab
                                    merchantId={merchantDetails.id}
                                    merchantName={merchantDetails.name}
                                    canEdit={canManageMerchantStatus}
                                />
                            )}

                            {activeTab === 'staff' && (
                                <StaffTab
                                    merchantInfo={merchantDetails as unknown as MerchantInfoModel}
                                    merchantDetails={merchantDetails}
                                    refetchMerchantInfo={refetch}
                                />
                            )}

                            {activeTab === 'customers' && (
                                <CustomersTab merchantInfo={merchantDetails} />
                            )}

                            {activeTab === 'menu' && (
                                <MenuTab merchantDetails={merchantDetails} clerkOrgId={merchantDetails.clerk_org_id} />
                            )}

                            {activeTab === 'products' && (
                                <ProductsTab merchantInfo={merchantDetails} />
                            )}

                            {activeTab === 'discounts' && (
                                <DiscountsTab merchantId={merchantDetails.id} />
                            )}

                            {activeTab === 'online-store' && (
                                <OnlineStoreTab
                                    merchantId={merchantDetails.id}
                                    clerkOrgId={merchantDetails.clerk_org_id}
                                    merchantName={merchantDetails.name}
                                    externalMerchantId={merchantDetails.external_merchant_id ?? null}
                                    locations={merchantDetails.locations as any[]}
                                    locationsLoading={false}
                                />
                            )}

                            {activeTab === 'schedules' && (
                                <SchedulesTab
                                    merchantId={merchantDetails.id}
                                    locations={merchantDetails.locations as any[]}
                                />
                            )}

                            {canManageDevices && activeTab === 'devices' && (
                                <DevicesTab merchantId={merchantDetails.id} merchantInfo={merchantDetails} />
                            )}

                            {activeTab === 'cash-drawers' && (
                                <CashDrawersTab
                                    merchantId={merchantDetails.id}
                                    locations={merchantDetails.locations as any[]}
                                />
                            )}

                            {activeTab === 'tax-report' && (
                                <TaxReportTab merchantId={merchantDetails.id} />
                            )}

                            {activeTab === 'notes' && (
                                <NotesTab merchantId={merchantDetails.id} />
                            )}

                            {activeTab === 'audit' && (
                                <AuditLogsTab merchantInfo={merchantDetails as unknown as MerchantInfoModel} />
                            )}

                            {canViewSettings && activeTab === 'settings' && (
                                <SettingsTab merchantInfo={merchantDetails} refetchMerchantInfo={refetch} canManageStatus={canManageMerchantStatus} />
                            )}
                        </div>

                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
