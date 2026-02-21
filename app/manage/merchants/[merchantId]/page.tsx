'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Store,
    Settings,
    Download,
    AlertTriangle,
    Building2,
    Store as StoreIcon
} from 'lucide-react'
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

export default function MerchantDetailsPage() {
    const { merchantId } = useParams()
    const { hasPermission } = useAdminPermissions()
    const { data: merchantDetails, isLoading, isError, refetch } = useAdminMerchantDetails(merchantId as string)
    const canManageDevices = hasPermission('users.manage')
    const canViewSettings = hasPermission('users.manage')

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

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Link href="/manage/merchants" className="hover:underline">Merchants</Link>
                <span className="mx-2">/</span>
                <div className="hover:underline text-foreground">Merchant Details</div>
            </div>

            {/* Header */}
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
                                {merchantDetails.logo_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={merchantDetails.logo_url} alt={merchantDetails.name} className="h-full w-full object-cover" />
                                ) : (
                                    <Store className="h-6 w-6 text-primary" />
                                )}
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-semibold">{merchantDetails.name}</CardTitle>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline">ID: {merchantDetails.clerk_org_id}</Badge>
                                    <Badge variant={merchantDetails.derived_status === 'active' ? 'default' : 'secondary'}>
                                        {merchantDetails.derived_status}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        Created {new Date(merchantDetails.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {canViewSettings && (
                                <Button variant="outline" size="sm">
                                    <Settings className="h-4 w-4 mr-2" /> Settings
                                </Button>
                            )}
                             {/* Export Data Button */}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Tabs */}
                    <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden flex-nowrap bg-muted/50 p-1 h-auto gap-1">
                            <TabsTrigger value="overview" className="flex-none">Overview</TabsTrigger>
                            <TabsTrigger value="business-info" className="flex-none">Business Info</TabsTrigger>
                            <TabsTrigger value="staff" className="flex-none">Staff</TabsTrigger>
                            <TabsTrigger value="customers" className="flex-none">Customers</TabsTrigger>
                            <TabsTrigger value="products" className="flex-none">Products</TabsTrigger>
                            <TabsTrigger value="menu" className="flex-none">Menu</TabsTrigger>
                            <TabsTrigger value="schedules" className="flex-none">Schedules</TabsTrigger>
                            <TabsTrigger value="discounts" className="flex-none">Discounts</TabsTrigger>
                            <TabsTrigger value="online-store" className="flex-none">Online Store</TabsTrigger>
                            {canManageDevices && <TabsTrigger value="devices" className="flex-none">Devices</TabsTrigger>}
                            <TabsTrigger value="transactions" className="flex-none">Transactions</TabsTrigger>
                            <TabsTrigger value="audit" className="flex-none">Audit Logs</TabsTrigger>
                            {canViewSettings && <TabsTrigger value="settings" className="flex-none">Settings</TabsTrigger>}
                        </TabsList>

                        {/* Tab Contents */}
                        <TabsContent value="overview" className="mt-6">
                            <OverviewTab merchantInfo={merchantDetails} />
                        </TabsContent>

                        <TabsContent value="business-info" className="mt-6">
                            <BusinessInfoTab merchantInfo={merchantDetails} />
                        </TabsContent>

                        <TabsContent value="staff" className="mt-6">
                            <StaffTab 
                                merchantInfo={merchantDetails as unknown as MerchantInfoModel} 
                                merchantDetails={merchantDetails}
                                refetchMerchantInfo={refetch} 
                            />
                        </TabsContent>

                        <TabsContent value="customers" className="mt-6">
                            <CustomersTab merchantInfo={merchantDetails} />
                        </TabsContent>

                        <TabsContent value="products" className="mt-6">
                            <ProductsTab merchantInfo={merchantDetails} />
                        </TabsContent>

                        {canManageDevices && (
                            <TabsContent value="devices" className="mt-6">
                                <DevicesTab merchantId={merchantDetails.id} merchantInfo={merchantDetails} />
                            </TabsContent>
                        )}

                        <TabsContent value="transactions" className="mt-6">
                             {/* TransactionsTab likely expects MerchantInfoModel or ID */}
                            <TransactionsTab merchantInfo={merchantDetails as unknown as MerchantInfoModel} />
                        </TabsContent>

                        <TabsContent value="menu" className="mt-6">
                            <MenuTab merchantDetails={merchantDetails} clerkOrgId={merchantDetails.clerk_org_id} />
                        </TabsContent>

                        <TabsContent value="discounts" className="mt-6">
                            <DiscountsTab merchantId={merchantDetails.id} />
                        </TabsContent>

                        <TabsContent value="schedules" className="mt-6">
                            <SchedulesTab 
                                merchantId={merchantDetails.id} 
                                locations={merchantDetails.locations as any[]} 
                            />
                        </TabsContent>

                        <TabsContent value="online-store" className="mt-6">
                            <OnlineStoreTab 
                                merchantId={merchantDetails.id}
                                locations={merchantDetails.locations as any[]} 
                                locationsLoading={false}
                            />
                        </TabsContent>

                        <TabsContent value="audit" className="mt-6">
                            <AuditLogsTab merchantInfo={merchantDetails as unknown as MerchantInfoModel} />
                        </TabsContent>

                        {canViewSettings && (
                            <TabsContent value="settings" className="mt-6">
                                <SettingsTab merchantInfo={merchantDetails} refetchMerchantInfo={refetch} />
                            </TabsContent>
                        )}
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    )
}
