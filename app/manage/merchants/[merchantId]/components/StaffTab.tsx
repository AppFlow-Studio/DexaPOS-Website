'use client'

import { useState } from 'react'
import {
  useAdminMerchantStaff,
  useAdminResetStaffPin,
  useAdminToggleStaffStatus,
} from '@/lib/queries/use-admin-staff'
import { useAdminAuth } from '@/lib/hooks/useAdminAuth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Users,
  Shield,
  Tablet,
  Key,
  Power,
  MoreHorizontal,
  Search,
  UserPlus,
  RefreshCw,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import type { AdminStaffMember, LocationAssignment } from '@/types/staff'
import type { MerchantInfoModel } from '@/types/db-modles'
import type { MerchantDetails } from '@/types/merchant'
import { CreateStaffDialog } from './CreateStaffDialog'
import { BulkPinResetDialog } from './BulkPinResetDialog'
import { PinResultDialog } from './PinResultDialog'

interface StaffTabProps {
  merchantInfo: MerchantInfoModel
  merchantDetails?: MerchantDetails | null
  refetchMerchantInfo: () => void
}

export function StaffTab({ merchantInfo, merchantDetails, refetchMerchantInfo }: StaffTabProps) {
  const { canManageMerchantTeam } = useAdminAuth()
  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showBulkPinDialog, setShowBulkPinDialog] = useState(false)
  const [pinResult, setPinResult] = useState<{ name: string; pin: string } | null>(null)

  // Get merchant ID from merchantInfo
  const merchantId = merchantInfo?.id

  // Use the locations from merchantDetails if available
  const locations = merchantDetails?.locations || []

  const {
    data: staff,
    isLoading,
    refetch,
    isFetching,
  } = useAdminMerchantStaff(
    merchantId,
    locationFilter !== 'all' ? locationFilter : undefined
  )

  const resetPinMutation = useAdminResetStaffPin()
  const toggleStatusMutation = useAdminToggleStaffStatus()

  // Filter staff by search
  const filteredStaff = staff?.filter((member) => {
    if (!search) return true
    const searchLower = search.toLowerCase()
    return (
      member.first_name.toLowerCase().includes(searchLower) ||
      member.last_name.toLowerCase().includes(searchLower) ||
      member.email?.toLowerCase().includes(searchLower)
    )
  })

  // Stats
  const totalStaff = staff?.length ?? 0
  const activeStaff = staff?.filter((s) => s.overall_is_active).length ?? 0
  const clerkUsers = staff?.filter((s) => s.account_type === 'clerk').length ?? 0
  const posOnlyUsers = staff?.filter((s) => s.account_type === 'pos_only').length ?? 0

  const handleResetPin = async (member: AdminStaffMember, locationId: string) => {
    try {
      const result = await resetPinMutation.mutateAsync({
        merchantId,
        staffProfileId: member.staff_profile_id!,
        locationId,
      })

      if (result.success && result.pin) {
        setPinResult({
          name: `${member.first_name} ${member.last_name}`,
          pin: result.pin,
        })
        toast.success('PIN reset successfully')
      } else {
        toast.error(result.error || 'Failed to reset PIN')
      }
    } catch {
      toast.error('Failed to reset PIN')
    }
  }

  const handleToggleStatus = async (
    member: AdminStaffMember,
    locationId: string,
    currentStatus: boolean
  ) => {
    const action = currentStatus ? 'deactivate' : 'activate'

    try {
      const result = await toggleStatusMutation.mutateAsync({
        merchantId,
        staffProfileId: member.staff_profile_id!,
        locationId,
        newStatus: !currentStatus,
      })

      if (result.success) {
        toast.success(`Staff ${action}d successfully`)
        refetch()
      } else {
        toast.error(result.error || `Failed to ${action} staff`)
      }
    } catch {
      toast.error(`Failed to ${action} staff`)
    }
  }

  const handleCreateSuccess = (pin?: string) => {
    if (pin) {
      setPinResult({ name: 'New Staff', pin })
    }
    refetch()
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatsCard
          title="Total Staff"
          value={totalStaff}
          icon={<Users className="h-4 w-4" />}
        />
        <StatsCard
          title="Active"
          value={activeStaff}
          icon={<CheckCircle className="h-4 w-4 text-green-500" />}
        />
        <StatsCard
          title="Dashboard Users"
          value={clerkUsers}
          icon={<Shield className="h-4 w-4 text-blue-500" />}
        />
        <StatsCard
          title="POS Only"
          value={posOnlyUsers}
          icon={<Tablet className="h-4 w-4 text-orange-500" />}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search staff..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-64"
            />
          </div>

          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {canManageMerchantTeam && (
            <Button variant="outline" onClick={() => setShowBulkPinDialog(true)}>
              <Key className="h-4 w-4 mr-2" />
              Bulk Reset PINs
            </Button>
          )}
          {canManageMerchantTeam && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Staff
            </Button>
          )}
        </div>
      </div>

      {/* Staff Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff Member</TableHead>
              <TableHead>Account Type</TableHead>
              <TableHead>Location(s)</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>PIN</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading staff...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredStaff?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-8 w-8 text-muted-foreground" />
                    <p>No staff members found</p>
                    {canManageMerchantTeam && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCreateDialog(true)}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Staff
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredStaff?.map((member) => (
                <StaffRow
                  key={member.staff_profile_id || member.member_id}
                  member={member}
                  canManage={canManageMerchantTeam}
                  onResetPin={handleResetPin}
                  onToggleStatus={handleToggleStatus}
                  isResettingPin={resetPinMutation.isPending}
                  isTogglingStatus={toggleStatusMutation.isPending}
                />
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Staff Dialog */}
      <CreateStaffDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        merchantId={merchantId}
        locations={locations}
        onSuccess={handleCreateSuccess}
      />

      {/* Bulk PIN Reset Dialog */}
      <BulkPinResetDialog
        open={showBulkPinDialog}
        onOpenChange={setShowBulkPinDialog}
        merchantId={merchantId}
        merchantName={merchantInfo?.name || 'Merchant'}
        locations={locations}
      />

      {/* PIN Result Dialog */}
      <PinResultDialog
        open={!!pinResult}
        onOpenChange={() => setPinResult(null)}
        staffName={pinResult?.name || ''}
        pin={pinResult?.pin || ''}
      />
    </div>
  )
}

// ============================================================================
// Stats Card Component
// ============================================================================

function StatsCard({
  title,
  value,
  icon,
}: {
  title: string
  value: number
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
          <div className="text-gray-400">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Staff Row Component
// ============================================================================

interface StaffRowProps {
  member: AdminStaffMember
  canManage: boolean
  onResetPin: (member: AdminStaffMember, locationId: string) => void
  onToggleStatus: (member: AdminStaffMember, locationId: string, currentStatus: boolean) => void
  isResettingPin: boolean
  isTogglingStatus: boolean
}

function StaffRow({
  member,
  canManage,
  onResetPin,
  onToggleStatus,
  isResettingPin,
  isTogglingStatus,
}: StaffRowProps) {
  const primaryAssignment =
    member.location_assignments.find((a) => a.is_primary) ||
    member.location_assignments[0]

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={member.avatar_url || undefined} />
            <AvatarFallback>
              {member.first_name?.[0]}
              {member.last_name?.[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">
              {member.first_name} {member.last_name}
            </p>
            <p className="text-sm text-gray-500">{member.email || '—'}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={member.account_type === 'clerk' ? 'default' : 'secondary'}>
          {member.account_type === 'clerk' ? 'Dashboard' : 'POS Only'}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {member.location_assignments.slice(0, 3).map((loc) => (
            <Badge
              key={loc.location_id}
              variant={loc.is_primary ? 'default' : 'outline'}
              className="text-xs"
            >
              {loc.location_name}
            </Badge>
          ))}
          {member.location_assignments.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{member.location_assignments.length - 3} more
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>{primaryAssignment?.role_name || '—'}</TableCell>
      <TableCell>
        {primaryAssignment?.has_pin ? (
          <Badge variant="outline" className="text-green-600">
            <Key className="mr-1 h-3 w-3" />
            Set
          </Badge>
        ) : (
          <Badge variant="outline" className="text-amber-600">
            No PIN
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={member.overall_is_active ? 'default' : 'secondary'}>
          {member.overall_is_active ? 'Active' : 'Inactive'}
        </Badge>
      </TableCell>
      <TableCell>
        {canManage && primaryAssignment && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onResetPin(member, primaryAssignment.location_id)}
                disabled={isResettingPin}
              >
                <Key className="h-4 w-4 mr-2" />
                Reset PIN
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  onToggleStatus(
                    member,
                    primaryAssignment.location_id,
                    primaryAssignment.is_active
                  )
                }
                disabled={isTogglingStatus}
                className={primaryAssignment.is_active ? 'text-red-600' : 'text-green-600'}
              >
                <Power className="h-4 w-4 mr-2" />
                {primaryAssignment.is_active ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  )
}
