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
    RefreshCw,
} from 'lucide-react'
import { useMerchantInfo } from '../../hooks/useMerchantInfo'
import { useMerchantDetails } from '@/lib/queries/use-merchants'
import { MerchantInfoModel, UsersModel } from '@/types/db-modles'
import { RemoveUserPopup } from '../../organizations/[organizationId]/componenets/RemoveUserPopup'
import { OverviewTab } from './components/OverviewTab'
import { AnalyticsTab } from './components/AnalyticsTab'
import { TransactionsTab } from './components/TransactionsTab'
import { AuditLogsTab } from './components/AuditLogsTab'
import { StaffTab } from './components/StaffTab'
import { CustomersTab } from './components/CustomersTab'
import { MenuTab } from './components/MenuTab'
import { SettingsTab } from './components/SettingsTab'
import { BusinessInfoTab } from './components/BusinessInfoTab'
import { DevicesTab } from './components/DevicesTab'

export default function MerchantInfoPage() {
    const { merchantId } = useParams()
    const { data: merchantInfo, isLoading, isError, refetch: refetchMerchantInfo } = useMerchantInfo(merchantId as string)
    const [removeUserPopup, setRemoveUserPopup] = useState<UsersModel | null>(null)
    const [openRemoveUserPopup, setOpenRemoveUserPopup] = useState(false)

    // Get merchant UUID from merchantInfo (clerk_org_id -> merchant id)
    const merchantUUID = merchantInfo && !(merchantInfo instanceof Error) ? merchantInfo.id : undefined

    // Fetch real metrics using the merchant UUID
    const {
        data: merchantDetails,
        isLoading: isLoadingDetails,
        refetch: refetchDetails,
    } = useMerchantDetails(merchantUUID ?? '')

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
                <span className="text-muted-foreground text-sm font-medium">Loading merchant details...</span>
            </div>
        )
    }

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
                <div className="text-destructive font-semibold mb-1">Unable to load merchant</div>
                <div className="text-muted-foreground text-sm">{String(isError)}</div>
            </div>
        )
    }

    if (merchantInfo instanceof Error) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
                <div className="text-destructive font-semibold mb-1">Something went wrong</div>
                <div className="text-muted-foreground text-sm">{merchantInfo.message}</div>
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
                                {merchantInfo?.organizations?.imageURL ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={merchantInfo?.organizations?.imageURL} alt={merchantInfo?.name} className="h-full w-full object-cover" />
                                ) : (
                                    <Store className="h-6 w-6 text-primary" />
                                )}
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-semibold">{merchantInfo?.name}</CardTitle>
                                {/* Carrier indicator -- Coming soon  */}
                                {/* {merchantInfo?.carriers && (
                                    <div className="mt-1 flex items-center gap-2 text-sm">
                                        <div className="flex items-center gap-2 rounded-md border px-2 py-1">
                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-muted-foreground">Carrier:</span>
                                            <span className="font-medium text-foreground">{merchantInfo?.carriers?.name || 'Carrier'}</span>
                                            <Link href={`/manage/organizations/${merchantInfo?.carriers?.clerk_org_id || ''}`} className="text-primary hover:underline ml-2">View</Link>
                                        </div>
                                    </div>
                                )} */}
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline">ID: {merchantInfo?.clerk_org_id}</Badge>
                                    <Badge className={
                                        merchantDetails?.derived_status === 'active'
                                            ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400'
                                            : merchantDetails?.derived_status === 'inactive'
                                            ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'
                                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400'
                                    }>
                                        {merchantDetails?.derived_status || merchantInfo?.public_metadata?.status || 'unknown'}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        Created {merchantInfo?.created_at ? new Date(merchantInfo?.created_at).toLocaleDateString() : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    refetchMerchantInfo()
                                    refetchDetails()
                                }}
                                disabled={isLoadingDetails}
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingDetails ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                            <Button variant="outline" size="sm">
                                <Settings className="h-4 w-4 mr-2" /> Settings
                            </Button>
                            <Button variant="outline" size="sm">
                                <Download className="h-4 w-4 mr-2" /> Export Data
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Tabs */}
                    <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="flex flex-wrap gap-x-3">
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="analytics">Analytics</TabsTrigger>
                            <TabsTrigger value="transactions">Transactions</TabsTrigger>
                            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
                            <TabsTrigger value="staff">Staff</TabsTrigger>
                            <TabsTrigger value="customers">Customers</TabsTrigger>
                            <TabsTrigger value="menu">Menu</TabsTrigger>
                            <TabsTrigger value="devices">Devices</TabsTrigger>
                            <TabsTrigger value="settings">Settings</TabsTrigger>
                            <TabsTrigger value="business-info">Business Info</TabsTrigger>
                        </TabsList>

                        {/* Tab Contents */}
                        {merchantInfo && (
                            <>
                                <TabsContent value="overview" className="mt-6">
                                    <OverviewTab
                                        merchantInfo={merchantInfo}
                                        merchantDetails={merchantDetails}
                                        isLoadingDetails={isLoadingDetails}
                                    />
                                </TabsContent>

                                <TabsContent value="analytics" className="mt-6">
                                    <AnalyticsTab merchantDetails={merchantDetails} />
                                </TabsContent>

                                <TabsContent value="transactions" className="mt-6">
                                    <TransactionsTab merchantDetails={merchantDetails} />
                                </TabsContent>

                                <TabsContent value="audit" className="mt-6">
                                    <AuditLogsTab />
                                </TabsContent>

                                <TabsContent value="staff" className="mt-6">
                                    <StaffTab
                                        merchantInfo={merchantInfo}
                                        merchantDetails={merchantDetails}
                                        refetchMerchantInfo={refetchMerchantInfo}
                                    />
                                </TabsContent>

                                <TabsContent value="customers" className="mt-6">
                                    <CustomersTab />
                                </TabsContent>

                                <TabsContent value="menu" className="mt-6">
                                    <MenuTab merchantDetails={merchantDetails} />
                                </TabsContent>

                                <TabsContent value="devices" className="mt-6">
                                    <DevicesTab merchantInfo={merchantInfo} />
                                </TabsContent>

                                <TabsContent value="settings" className="mt-6">
                                    <SettingsTab merchantInfo={merchantInfo} refetchMerchantInfo={refetchMerchantInfo} />
                                </TabsContent>
                                <TabsContent value="business-info" className="mt-6">
                                    <BusinessInfoTab merchantInfo={merchantInfo} />
                                </TabsContent>
                            </>
                        )}
                    </Tabs>
                </CardContent>
            </Card>

            {/* Popups */}
            <RemoveUserPopup
                user={removeUserPopup!}
                open={openRemoveUserPopup}
                setOpen={setOpenRemoveUserPopup}
                refetch={refetchMerchantInfo}
            />
        </div>
    )
}