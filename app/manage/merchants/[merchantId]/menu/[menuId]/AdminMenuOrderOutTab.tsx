'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Code,
  Loader2,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import {
  useAdminOrderOutStatus,
  useAdminOrderOutMenuSync,
  useAdminMenuPayloadDiff,
  useAdminPushMenuToOrderOut,
  useAdminPushMenuToChannels,
  useAdminPushChannelsLiveStatus,
  useAdminOnboardOrderOut,
} from '@/lib/queries/use-admin-orderout'
import { SyncStatusBadge, formatTimeAgo } from '@/components/dashboard/menu/menuId/OrderOutMenuStatus'
import { MenuChannelsCard } from '@/components/dashboard/orderout/MenuChannelsCard'
import { OrderOutStatusCard } from '@/components/dashboard/orderout/OrderOutStatusCard'
import { OrderOutOnboardingForm, type OnboardingFormData } from '@/components/dashboard/orderout/OrderOutOnboardingForm'

// ============================================================================
// Types
// ============================================================================

interface AdminMenuOrderOutTabProps {
  merchantId: string
  locationId: string
  menuId: string
  menuName: string
  clerkOrgId: string
}

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(start: string, end: string | null): string {
  if (!end) return '-'
  const diffMs = new Date(end).getTime() - new Date(start).getTime()
  if (diffMs < 1000) return '<1s'
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

// ============================================================================
// Component
// ============================================================================

export function AdminMenuOrderOutTab({
  merchantId,
  locationId,
  menuId,
  menuName,
  clerkOrgId,
}: AdminMenuOrderOutTabProps) {
  // Fetch OrderOut status to determine if location has a restaurant
  const { data: orderOutData, isLoading: isStatusLoading } = useAdminOrderOutStatus(merchantId)
  const locationRestaurant = orderOutData?.data?.restaurants?.find((r) => r.locationId === locationId)
  const hasRestaurant = locationRestaurant?.hasRestaurant ?? false

  if (isStatusLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // If location doesn't have a restaurant, show onboarding UI
  if (!hasRestaurant) {
    return (
      <AdminOrderOutOnboarding
        merchantId={merchantId}
        locationId={locationId}
        hasAccount={orderOutData?.data?.account?.hasAccount ?? false}
      />
    )
  }

  // Location has a restaurant — show sync UI
  return (
    <AdminMenuSyncUI
      merchantId={merchantId}
      locationId={locationId}
      menuId={menuId}
      menuName={menuName}
      locationRestaurant={locationRestaurant!}
    />
  )
}

// ============================================================================
// Onboarding Sub-Component
// ============================================================================

function AdminOrderOutOnboarding({
  merchantId,
  locationId,
  hasAccount,
}: {
  merchantId: string
  locationId: string
  hasAccount: boolean
}) {
  const onboardMutation = useAdminOnboardOrderOut()
  const [showForm, setShowForm] = useState(false)

  const handleSubmit = (data: OnboardingFormData) => {
    onboardMutation.mutate({
      merchantId,
      locationId,
      ...data,
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">OrderOut Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <OrderOutStatusCard
            hasAccount={hasAccount}
            hasRestaurant={false}
            isAcceptingOrders={false}
            prepTimeMinutes={20}
            connectedChannels={null}
            autoAcceptOrders={false}
            dashboardUrl=""
          />

          {!showForm ? (
            <Button onClick={() => setShowForm(true)}>Connect Location to OrderOut</Button>
          ) : (
            <OrderOutOnboardingForm
              isSubmitting={onboardMutation.isPending}
              onSubmit={handleSubmit}
              onCancel={() => setShowForm(false)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Menu Sync Sub-Component
// ============================================================================

function AdminMenuSyncUI({
  merchantId,
  locationId,
  menuId,
  menuName,
  locationRestaurant,
}: {
  merchantId: string
  locationId: string
  menuId: string
  menuName: string
  locationRestaurant: { ooRestaurantId: string | null }
}) {
  const {
    data: syncResult,
    isLoading,
    refetch,
  } = useAdminOrderOutMenuSync(merchantId, locationId, menuId)
  const { data: diffResult, isLoading: isDiffLoading } = useAdminMenuPayloadDiff(
    merchantId,
    locationId,
    menuId
  )
  const pushMenuMutation = useAdminPushMenuToOrderOut(merchantId)
  const pushChannelsMutation = useAdminPushMenuToChannels(merchantId)
  const [activeSyncId, setActiveSyncId] = useState<string | null>(null)
  const channelsLive = useAdminPushChannelsLiveStatus(merchantId, activeSyncId)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showPayload, setShowPayload] = useState(false)

  const syncStatus = syncResult?.data ?? null
  const lastSync = syncStatus?.lastSync
  const ooMenuId = syncStatus?.ooMenuId ?? null
  const syncHistory = syncStatus?.syncHistory ?? []
  const platformStatuses = syncStatus?.platformStatuses ?? []
  const connectedChannels = syncStatus?.connectedChannels ?? []

  const handlePushChannels = () => {
    pushChannelsMutation.mutate(
      { merchantId, menuId, locationId },
      {
        onSuccess: (res) => {
          if (res.success && res.data?.syncId) setActiveSyncId(res.data.syncId)
        },
      }
    )
  }

  const diffData = diffResult?.data ?? null
  const hasChanges = diffData?.hasChanges ?? false
  const isNewMenu = diffData?.isNewMenu ?? false

  const handleSync = () => {
    pushMenuMutation.mutate(
      { merchantId, menuId, locationId },
      { onSuccess: () => refetch() }
    )
    setIsConfirmOpen(false)
  }

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const lastPayloadSnapshot = syncHistory.find((s) => s.status === 'success')

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Section 1: Sync Status Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Sync Status</CardTitle>
          <SyncStatusBadge lastSync={lastSync ?? null} />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">OrderOut Menu ID</p>
              <p className="text-sm font-medium">
                {ooMenuId ? (
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                    {ooMenuId}
                  </code>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Synced</p>
              <p className="text-sm font-medium">
                {lastSync?.completedAt
                  ? formatTimeAgo(lastSync.completedAt)
                  : 'Never'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Items Synced</p>
              <p className="text-sm font-medium">
                {lastSync?.itemsSynced ?? 0}
                {(lastSync?.itemsFailed ?? 0) > 0 && (
                  <span className="text-destructive ml-1">
                    ({lastSync?.itemsFailed} failed)
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Syncs</p>
              <p className="text-sm font-medium">
                {syncStatus?.totalSyncs ?? 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 1b: Delivery Channels — per-menu status + push */}
      <MenuChannelsCard
        ooMenuId={ooMenuId}
        platformStatuses={platformStatuses}
        connectedChannels={connectedChannels}
        onPush={handlePushChannels}
        isPushing={pushChannelsMutation.isPending}
        live={channelsLive.data?.data ?? null}
      />

      {/* Section 2: Diff-based Sync Card */}
      {isDiffLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : hasChanges ? (
        isNewMenu ? (
          <Card className="border-blue-500/50 bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="flex items-center gap-3 py-3">
              <Upload className="h-5 w-5 text-blue-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Menu hasn&apos;t been uploaded to OrderOut yet
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {diffData?.currentItemCount ?? 0} items ready to upload.
                </p>
              </div>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setIsConfirmOpen(true)}
                disabled={pushMenuMutation.isPending}
              >
                {pushMenuMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1" />
                )}
                Upload to OrderOut
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="flex items-center gap-3 py-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Menu has changed since last sync
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Local changes haven&apos;t been pushed to OrderOut yet.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950"
                onClick={() => setIsConfirmOpen(true)}
                disabled={pushMenuMutation.isPending}
              >
                {pushMenuMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                )}
                Sync to OrderOut
              </Button>
            </CardContent>
          </Card>
        )
      ) : lastSync?.status === 'success' ? (
        <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CardContent className="flex items-center gap-3 py-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Menu is in sync with OrderOut
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">
                {lastSync.itemsSynced} items synced
                {lastSync.completedAt &&
                  ` \u2022 Last synced ${formatTimeAgo(lastSync.completedAt)}`}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Section 3: Sync History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Sync History</CardTitle>
        </CardHeader>
        <CardContent>
          {syncHistory.length === 0 ? (
            <Empty
              icon={Clock}
              title="No sync history"
              description="This menu hasn't been synced to OrderOut yet."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Items Synced</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncHistory.map((sync) => (
                  <>
                    <TableRow
                      key={sync.id}
                      className={sync.errorDetails ? 'cursor-pointer hover:bg-muted/50' : ''}
                      onClick={() => sync.errorDetails && toggleRow(sync.id)}
                    >
                      <TableCell className="text-sm">
                        {new Date(sync.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {sync.status === 'success' && (
                          <Badge variant="default" className="bg-green-600 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Success
                          </Badge>
                        )}
                        {sync.status === 'failed' && (
                          <Badge variant="destructive" className="text-xs">
                            <XCircle className="h-3 w-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                        {sync.status === 'pending' && (
                          <Badge variant="secondary" className="text-xs">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Pending
                          </Badge>
                        )}
                        {!['success', 'failed', 'pending'].includes(sync.status) && (
                          <Badge variant="secondary" className="text-xs">
                            {sync.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{sync.itemsSynced}</TableCell>
                      <TableCell className="text-right">
                        {sync.itemsFailed > 0 ? (
                          <span className="text-destructive">{sync.itemsFailed}</span>
                        ) : (
                          '0'
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDuration(sync.createdAt, sync.completedAt)}
                      </TableCell>
                      <TableCell>
                        {sync.errorDetails &&
                          (expandedRows.has(sync.id) ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ))}
                      </TableCell>
                    </TableRow>
                    {sync.errorDetails && expandedRows.has(sync.id) && (
                      <TableRow key={`${sync.id}-error`}>
                        <TableCell colSpan={6}>
                          <p className="text-xs text-destructive bg-destructive/10 rounded p-2">
                            {sync.errorDetails}
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Payload Preview (collapsible) */}
      {lastPayloadSnapshot && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setShowPayload(!showPayload)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Code className="h-4 w-4" />
                Last Synced Payload
              </CardTitle>
              {showPayload ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {showPayload && (
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">
                The JSON payload that was last sent to OrderOut for this menu.
              </p>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-96 font-mono">
                Sync ID: {lastPayloadSnapshot.id}
                {'\n'}Menu Name: {lastPayloadSnapshot.menuName || menuName}
                {'\n'}Items Synced: {lastPayloadSnapshot.itemsSynced}
                {'\n'}Synced At:{' '}
                {lastPayloadSnapshot.completedAt
                  ? new Date(lastPayloadSnapshot.completedAt).toLocaleString()
                  : 'N/A'}
                {'\n'}OrderOut Menu ID:{' '}
                {lastPayloadSnapshot.ooMenuId || 'Not available'}
              </pre>
            </CardContent>
          )}
        </Card>
      )}

      {/* Sync Confirmation Dialog */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isNewMenu ? 'Upload Menu to OrderOut' : 'Sync Menu to OrderOut'}
            </DialogTitle>
            <DialogDescription>
              This will {isNewMenu ? 'upload' : 'update'} &quot;{menuName}&quot;
              to OrderOut and update delivery platforms. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={pushMenuMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSync}
              disabled={pushMenuMutation.isPending}
            >
              {pushMenuMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              {isNewMenu ? 'Upload' : 'Sync'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
