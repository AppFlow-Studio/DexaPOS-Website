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
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Code,
  Loader2,
  XCircle,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import {
  useAdminOrderOutStatus,
  useAdminOrderOutMenuSync,
  useAdminMenuPayloadDiff,
  useAdminPushMenuToChannels,
  useAdminPushChannelsLiveStatus,
  useAdminOnboardOrderOut,
  useAdminLocationOnlineMenu,
  useAdminPublishOnlineMenu,
} from '@/lib/queries/use-admin-orderout'
import { SyncStatusBadge, formatTimeAgo } from '@/components/dashboard/menu/menuId/OrderOutMenuStatus'
import { MenuChannelsCard } from '@/components/dashboard/orderout/MenuChannelsCard'
import { OnlineMenuControlCard } from '@/components/dashboard/menu/menuId/MenuOrderOutTab'
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
  const { data: diffResult } = useAdminMenuPayloadDiff(
    merchantId,
    locationId,
    menuId
  )
  const pushChannelsMutation = useAdminPushMenuToChannels(merchantId)
  const publishMutation = useAdminPublishOnlineMenu(merchantId)
  const { data: onlineMenu } = useAdminLocationOnlineMenu(merchantId, locationId)
  const [activeSyncId, setActiveSyncId] = useState<string | null>(null)
  const channelsLive = useAdminPushChannelsLiveStatus(merchantId, activeSyncId)
  const [confirmAction, setConfirmAction] = useState<
    null | 'publish' | 'designate'
  >(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showPayload, setShowPayload] = useState(false)

  const syncStatus = syncResult?.data ?? null
  const lastSync = syncStatus?.lastSync
  const ooMenuId = syncStatus?.ooMenuId ?? null
  const syncHistory = syncStatus?.syncHistory ?? []
  const platformStatuses = syncStatus?.platformStatuses ?? []
  const connectedChannels = syncStatus?.connectedChannels ?? []

  // Which menu handles online orders for this location (the single push target).
  const primaryMenuId = onlineMenu?.primaryMenuId ?? null
  const primaryMenuName = onlineMenu?.primaryMenuName ?? null
  const hasOnlineMenu = !!primaryMenuId
  const isThisOnline =
    (syncStatus?.isPrimaryOnlineMenu ?? false) || primaryMenuId === menuId

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
  const itemCount = diffData?.currentItemCount ?? lastSync?.itemsSynced ?? 0

  // Publishing always resolves to the ONE designated online menu server-side.
  const runPublish = () => {
    publishMutation.mutate(
      {
        locationId,
        ...(confirmAction === 'designate' ? { designateMenuId: menuId } : {}),
      },
      { onSuccess: () => refetch() }
    )
    setConfirmAction(null)
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

      {/* Section 1a: THE online menu control — always publishes the ONE
          designated online menu (HQ can't push a non-online menu by accident). */}
      <OnlineMenuControlCard
        state={isThisOnline ? 'this' : hasOnlineMenu ? 'other' : 'none'}
        thisMenuName={menuName}
        onlineMenuHref={
          primaryMenuId
            ? `/manage/merchants/${merchantId}/menu/${primaryMenuId}`
            : null
        }
        primaryMenuName={primaryMenuName}
        itemCount={itemCount}
        hasChanges={hasChanges}
        isNewMenu={isNewMenu}
        isPublishing={publishMutation.isPending}
        onPublish={() => setConfirmAction('publish')}
        onMakeOnline={() => setConfirmAction('designate')}
      />

      {/* Section 1b: Delivery Channels — only the online menu fans out to channels */}
      {isThisOnline && (
        <MenuChannelsCard
          ooMenuId={ooMenuId}
          platformStatuses={platformStatuses}
          connectedChannels={connectedChannels}
          onPush={handlePushChannels}
          isPushing={pushChannelsMutation.isPending}
          live={channelsLive.data?.data ?? null}
        />
      )}

      {/* (Publish + changes-pending live in OnlineMenuControlCard above.) */}

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

      {/* Publish Confirmation — names the exact menu that will go live. */}
      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === 'designate'
                ? 'Make this the online menu?'
                : 'Publish the online menu?'}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Publishing the online menu:{' '}
                  <span className="font-semibold text-foreground">
                    {confirmAction === 'designate'
                      ? menuName
                      : primaryMenuName ?? menuName}
                  </span>{' '}
                  — <span className="font-semibold text-foreground">{itemCount} items</span>.
                </p>
                <p>
                  This is exactly what customers see on the merchant&apos;s online
                  store and connected delivery apps.
                </p>
                {confirmAction === 'designate' && hasOnlineMenu && (
                  <p className="text-amber-700">
                    This replaces{' '}
                    <span className="font-medium">{primaryMenuName}</span> as the
                    online menu. Only one menu can handle online orders.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={publishMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={runPublish} disabled={publishMutation.isPending}>
              {publishMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              {confirmAction === 'designate' ? 'Make online & publish' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
