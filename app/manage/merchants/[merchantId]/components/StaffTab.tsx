'use client'

import * as React from 'react'
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  useAdminMerchantStaff,
  useAdminResetStaffPin,
  useAdminToggleStaffStatus,
  useAdminBulkDeactivateStaff,
} from '@/lib/queries/use-admin-staff'
import { useAdminAuth } from '@/lib/hooks/useAdminAuth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Users,
  Shield,
  Tablet,
  Key,
  UserPlus,
  RefreshCw,
  CheckCircle,
  Search,
  MapPin,
  Mail,
  Lock,
  CheckCircle2,
  ArrowUpDown,
  MoreHorizontal,
  KeyRound,
  UserX,
  UserCheck,
  X,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { CredentialToast } from '@/components/ui/credential-toast'
import type { AdminStaffMember } from '@/types/staff'
import type { MerchantInfoModel } from '@/types/db-modles'
import type { MerchantDetails } from '@/types/merchant'
import { AdminCreateStaffWizard } from './AdminCreateStaffWizard'
import { BulkPinResetDialog } from './BulkPinResetDialog'
import { BulkPasswordResetDialog } from './BulkPasswordResetDialog'
import { AdminStaffDetailSheet } from './AdminStaffDetailSheet'

interface StaffTabProps {
  merchantInfo: MerchantInfoModel
  merchantDetails?: MerchantDetails | null
  refetchMerchantInfo: () => void
}

export function StaffTab({ merchantInfo, merchantDetails, refetchMerchantInfo }: StaffTabProps) {
  const { canManageMerchantTeam } = useAdminAuth()
  const merchantId = merchantInfo?.id
  const locations = merchantDetails?.locations || []

  // Table state
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({})
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [locationFilter, setLocationFilter] = React.useState<string>('all')

  // Dialog state
  const [showCreateDialog, setShowCreateDialog] = React.useState(false)
  const [showBulkPinDialog, setShowBulkPinDialog] = React.useState(false)
  const [showBulkPasswordDialog, setShowBulkPasswordDialog] = React.useState(false)
  const [bulkConfirmOpen, setBulkConfirmOpen] = React.useState(false)
  const [selectedStaffId, setSelectedStaffId] = React.useState<string | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  // Data
  const {
    data: staff,
    isLoading,
    refetch,
    isFetching,
  } = useAdminMerchantStaff(merchantId, locationFilter !== 'all' ? locationFilter : undefined)

  const staffList = staff || []

  // Mutations
  const resetPinMutation = useAdminResetStaffPin()
  const toggleStatusMutation = useAdminToggleStaffStatus()
  const bulkDeactivateMutation = useAdminBulkDeactivateStaff()

  // Stats
  const stats = React.useMemo(() => ({
    total: staffList.length,
    active: staffList.filter((s) => s.overall_is_active).length,
    clerk: staffList.filter((s) => s.account_type === 'clerk').length,
    posOnly: staffList.filter((s) => s.account_type !== 'clerk').length,
  }), [staffList])

  // Bulk selection
  const selectedMemberIds = React.useMemo(
    () => Object.keys(rowSelection).filter((k) => rowSelection[k]),
    [rowSelection]
  )
  const selectedCount = selectedMemberIds.length

  // Map member_id → AdminStaffMember for bulk ops
  const staffByMemberId = React.useMemo(() => {
    const map: Record<string, AdminStaffMember> = {}
    staffList.forEach((s) => { map[s.member_id] = s })
    return map
  }, [staffList])

  const selectedStaff = React.useMemo(
    () => (selectedStaffId ? staffByMemberId[selectedStaffId] || null : null),
    [selectedStaffId, staffByMemberId]
  )

  // Handlers
  const showCredentialToast = React.useCallback((pin?: string, password?: string) => {
    toast.custom(
      (t) => React.createElement(
        'div',
        { className: 'rounded-lg border bg-background shadow-lg' },
        React.createElement(CredentialToast, {
          pin,
          password,
          duration: 20,
          onDismiss: () => toast.dismiss(t),
        })
      ),
      { duration: 20000, position: 'top-center' }
    )
  }, [])

  const handleResetPin = React.useCallback((member: AdminStaffMember) => {
    const primary = member.location_assignments.find((a) => a.is_primary) || member.location_assignments[0]
    if (!primary || !member.staff_profile_id) {
      toast.error('Cannot reset PIN: missing required info')
      return
    }
    resetPinMutation.mutate(
      { merchantId, staffProfileId: member.staff_profile_id, locationId: primary.location_id },
      {
        onSuccess: (result) => {
          if (result.success && result.pin) {
            showCredentialToast(result.pin)
          } else {
            toast.error(result.error || 'Failed to reset PIN')
          }
        },
      }
    )
  }, [merchantId, resetPinMutation, showCredentialToast])

  const handleToggleStatus = React.useCallback((member: AdminStaffMember) => {
    const primary = member.location_assignments.find((a) => a.is_primary) || member.location_assignments[0]
    if (!primary || !member.staff_profile_id) {
      toast.error('Cannot update status: missing required info')
      return
    }
    toggleStatusMutation.mutate(
      {
        merchantId,
        staffProfileId: member.staff_profile_id,
        locationId: primary.location_id,
        newStatus: !primary.is_active,
      },
      {
        onSuccess: (result) => {
          if (!result.success) {
            toast.error(result.error || 'Failed to update status')
          } else {
            refetch()
          }
        },
      }
    )
  }, [merchantId, toggleStatusMutation, refetch])

  const handleBulkDeactivate = () => {
    const staffProfileIds = selectedMemberIds
      .map((id) => staffByMemberId[id]?.staff_profile_id)
      .filter(Boolean) as string[]

    bulkDeactivateMutation.mutate(
      { merchantId, staffProfileIds },
      {
        onSuccess: (result) => {
          if (result.errors.length > 0) {
            toast.warning(`Deactivated ${result.deactivated}, ${result.errors.length} failed`)
          } else {
            toast.success(`Deactivated ${result.deactivated} staff member(s)`)
          }
          setRowSelection({})
          setBulkConfirmOpen(false)
          refetch()
        },
        onError: () => {
          toast.error('Bulk deactivation failed')
        },
      }
    )
  }

  const handleCreateSuccess = (pin?: string, tempPassword?: string) => {
    if (tempPassword || pin) {
      showCredentialToast(pin, tempPassword)
    }
    refetch()
  }

  const handleRowClick = React.useCallback((member: AdminStaffMember) => {
    setSelectedStaffId(member.member_id)
    setDetailOpen(true)
  }, [])

  // Table columns
  const columns: ColumnDef<AdminStaffMember>[] = React.useMemo(() => [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="translate-y-[2px]"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'display_name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-8 px-2"
        >
          Employee
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const member = row.original
        const initials = `${member.first_name?.[0] || ''}${member.last_name?.[0] || ''}`.toUpperCase()
        return (
          <div
            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1 -mx-2 hover:bg-muted/60"
            onClick={() => handleRowClick(member)}
          >
            <Avatar className="h-9 w-9">
              <AvatarImage src={member.avatar_url || undefined} alt={member.display_name} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium text-sm">
                {member.first_name} {member.last_name}
              </span>
              {member.email ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {member.email}
                </span>
              ) : (
                <Badge variant="outline" className="text-xs w-fit">
                  <Lock className="h-2.5 w-2.5 mr-1" />
                  POS Only
                </Badge>
              )}
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'primary_role',
      header: 'Primary Role',
      cell: ({ row }) => {
        const member = row.original
        const primary = member.location_assignments.find((a) => a.is_primary) || member.location_assignments[0]
        if (!primary) return <span className="text-muted-foreground text-sm">—</span>
        return (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-sm">{primary.role_name}</span>
            <Badge variant="outline" className="text-xs w-fit">{primary.role_code}</Badge>
          </div>
        )
      },
    },
    {
      accessorKey: 'locations',
      header: 'Locations',
      cell: ({ row }) => {
        const member = row.original
        const active = member.location_assignments.filter((a) => a.is_active)
        if (active.length === 0) return <span className="text-muted-foreground text-sm">None</span>
        const primary = active.find((a) => a.is_primary)
        const others = active.filter((a) => !a.is_primary)
        return (
          <div className="flex flex-wrap gap-1">
            {primary && (
              <Badge variant="default" className="text-xs gap-1">
                <MapPin className="h-2.5 w-2.5" />
                {primary.location_name}
              </Badge>
            )}
            {others.slice(0, 2).map((loc) => (
              <Badge key={loc.location_id} variant="secondary" className="text-xs">
                {loc.location_name}
              </Badge>
            ))}
            {others.length > 2 && (
              <Badge variant="outline" className="text-xs">+{others.length - 2} more</Badge>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'overall_is_active',
      header: 'Status',
      cell: ({ row }) => {
        const member = row.original
        const primary = member.location_assignments.find((a) => a.is_primary) || member.location_assignments[0]
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={member.overall_is_active}
              onCheckedChange={() => handleToggleStatus(member)}
              disabled={!primary || !canManageMerchantTeam || toggleStatusMutation.isPending}
            />
            <span className={cn('text-sm font-medium', member.overall_is_active ? 'text-green-600' : 'text-muted-foreground')}>
              {member.overall_is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'pos_access',
      header: 'POS Access',
      cell: ({ row }) => {
        const member = row.original
        const hasPin = member.location_assignments.some((a) => a.has_pin)
        return hasPin ? (
          <div className="flex items-center gap-1.5 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">PIN Set</span>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">No PIN</span>
        )
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const member = row.original
        const primary = member.location_assignments.find((a) => a.is_primary) || member.location_assignments[0]
        if (!canManageMerchantTeam) return null
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleRowClick(member)}>
                <Users className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {member.account_type !== 'clerk' && primary && (
                <>
                  <DropdownMenuItem
                    onClick={() => handleResetPin(member)}
                    disabled={resetPinMutation.isPending}
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    Reset PIN
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={() => handleToggleStatus(member)}
                disabled={!primary || toggleStatusMutation.isPending}
                className={member.overall_is_active ? 'text-destructive' : 'text-green-600'}
              >
                {member.overall_is_active ? (
                  <><UserX className="mr-2 h-4 w-4" />Deactivate</>
                ) : (
                  <><UserCheck className="mr-2 h-4 w-4" />Reactivate</>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [canManageMerchantTeam, handleResetPin, handleRowClick, handleToggleStatus, resetPinMutation.isPending, toggleStatusMutation.isPending])

  const table = useReactTable({
    data: staffList,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    enableRowSelection: canManageMerchantTeam,
    getRowId: (row) => row.member_id,
    state: { sorting, columnFilters, rowSelection, globalFilter },
  })

  return (
    <div className="space-y-4">

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatsCard title="Total Staff" value={stats.total} icon={<Users className="h-4 w-4" />} />
        <StatsCard title="Active" value={stats.active} icon={<CheckCircle className="h-4 w-4 text-green-500" />} valueClass="text-green-600" />
        <StatsCard title="Dashboard Users" value={stats.clerk} icon={<Shield className="h-4 w-4 text-blue-500" />} valueClass="text-blue-600" />
        <StatsCard title="POS Only" value={stats.posOnly} icon={<Tablet className="h-4 w-4 text-orange-500" />} valueClass="text-orange-600" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search staff..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Select value={locationFilter} onValueChange={(v) => { setLocationFilter(v); setRowSelection({}) }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </div>

        {canManageMerchantTeam && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowBulkPinDialog(true)}>
              <Key className="h-4 w-4 mr-2" />
              Bulk Reset PINs
            </Button>
            <Button variant="outline" onClick={() => setShowBulkPasswordDialog(true)}>
              <Lock className="h-4 w-4 mr-2" />
              Bulk Reset Passwords
            </Button>
            <Button onClick={() => setShowCreateDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Staff
            </Button>
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3">
          <span className="text-sm font-medium mr-2">{selectedCount} selected</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkConfirmOpen(true)}
            disabled={bulkDeactivateMutation.isPending}
          >
            <UserX className="mr-2 h-4 w-4" />
            Bulk Deactivate
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setRowSelection({})}>
            <X className="mr-2 h-4 w-4" />
            Clear Selection
          </Button>
        </div>
      )}

      {/* Staff Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <UserX className="h-8 w-8" />
                    <p>No staff members found</p>
                    {canManageMerchantTeam && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCreateDialog(true)}
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        Add Staff
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {selectedCount > 0
          ? `${selectedCount} of ${table.getFilteredRowModel().rows.length} row(s) selected`
          : `Showing ${table.getFilteredRowModel().rows.length} of ${staffList.length} staff member(s)`}
      </div>

      {/* Create Staff Wizard */}
      {showCreateDialog && (
        <AdminCreateStaffWizard
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          merchantId={merchantId}
          locations={locations}
          onSuccess={handleCreateSuccess}
        />
      )}

      {/* Bulk PIN Reset Dialog */}
      <BulkPinResetDialog
        open={showBulkPinDialog}
        onOpenChange={setShowBulkPinDialog}
        merchantId={merchantId}
        merchantName={merchantInfo?.name || 'Merchant'}
        locations={locations}
      />

      {/* Bulk Password Reset Dialog */}
      <BulkPasswordResetDialog
        open={showBulkPasswordDialog}
        onOpenChange={setShowBulkPasswordDialog}
        merchantId={merchantId}
        merchantName={merchantInfo?.name || 'Merchant'}
        locations={locations}
      />

      <AdminStaffDetailSheet
        merchantId={merchantId}
        staff={selectedStaff}
        open={detailOpen && !!selectedStaff}
        onOpenChange={(open) => {
          setDetailOpen(open)
          if (!open) setSelectedStaffId(null)
        }}
        canManage={canManageMerchantTeam}
      />

      {/* Bulk Deactivate Confirm */}
      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Bulk Deactivate Staff</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate{' '}
              <span className="font-semibold">{selectedCount}</span> staff member(s)? They will
              lose access to all assigned locations.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkConfirmOpen(false)}
              disabled={bulkDeactivateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDeactivate}
              disabled={bulkDeactivateMutation.isPending}
            >
              {bulkDeactivateMutation.isPending
                ? 'Deactivating...'
                : `Deactivate ${selectedCount} Staff`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Stats Card ──────────────────────────────────────────────────────────────

function StatsCard({
  title,
  value,
  icon,
  valueClass,
}: {
  title: string
  value: number
  icon: React.ReactNode
  valueClass?: string
}) {
  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="text-muted-foreground">{icon}</div>
        </div>
        <p className={cn('text-2xl font-bold', valueClass)}>{value}</p>
      </CardContent>
    </Card>
  )
}
