'use client'

import * as React from 'react'
import {
    ColumnDef,
    ColumnFiltersState,
    SortingState,
    VisibilityState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import {
    MoreHorizontal,
    Search,
    Mail,
    MapPin,
    Lock,
    Edit,
    KeyRound,
    UserX,
    UserCheck,
    ArrowUpDown,
    CheckCircle2,
} from 'lucide-react'
import { UnifiedStaffMember } from '@/types/staff'
import { useUpdateStaffAssignment, useResetStaffPIN, useDeactivateStaff, useReactivateStaff } from '@/app/dashboard/hooks/useStaff'
import { StaffDetailSheet } from './StaffDetailSheet'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface StaffDataTableProps {
    data: UnifiedStaffMember[]
    isLoading?: boolean
}

export function StaffDataTable({ data, isLoading }: StaffDataTableProps) {
    const [sorting, setSorting] = React.useState<SortingState>([])
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
    const [rowSelection, setRowSelection] = React.useState({})
    const [globalFilter, setGlobalFilter] = React.useState('')

    const [selectedStaff, setSelectedStaff] = React.useState<UnifiedStaffMember | null>(null)
    const [isDetailOpen, setIsDetailOpen] = React.useState(false)

    const updateAssignment = useUpdateStaffAssignment()
    const resetPIN = useResetStaffPIN()
    const deactivateStaff = useDeactivateStaff()
    const reactivateStaff = useReactivateStaff()

    const handleRowClick = (staff: UnifiedStaffMember) => {
        setSelectedStaff(staff)
        setIsDetailOpen(true)
    }

    const columns: ColumnDef<UnifiedStaffMember>[] = [
        {
            accessorKey: 'display_name',
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        className="h-8 px-2"
                    >
                        Employee
                        <ArrowUpDown className="ml-2 h-3 w-3" />
                    </Button>
                )
            },
            cell: ({ row }) => {
                const staff = row.original
                const initials = `${staff.first_name?.[0] || ''}${staff.last_name?.[0] || ''}`.toUpperCase()

                return (
                    <div
                        className="flex items-center gap-3 cursor-pointer hover:bg-muted/60 rounded-md px-2 py-1 -mx-2"
                        onClick={() => handleRowClick(staff)}
                    >
                        <Avatar className="h-9 w-9">
                            <AvatarImage src={staff.avatar_url || undefined} alt={staff.display_name} />
                            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">
                                {staff.first_name} {staff.last_name}
                            </span>
                            {staff.email ? (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {staff.email}
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
                const staff = row.original
                const primaryAssignment = staff.location_assignments.find(a => a.is_primary)

                if (!primaryAssignment) {
                    return <span className="text-muted-foreground text-sm">—</span>
                }

                return (
                    <div className="flex flex-col gap-1">
                        <span className="font-medium text-sm">{primaryAssignment.role_name}</span>
                        <Badge variant="outline" className="text-xs w-fit">
                            {primaryAssignment.role_code}
                        </Badge>
                    </div>
                )
            },
        },
        {
            accessorKey: 'locations',
            header: 'Locations',
            cell: ({ row }) => {
                const staff = row.original
                const activeLocations = staff.location_assignments.filter(a => a.is_active)

                if (activeLocations.length === 0) {
                    return <span className="text-muted-foreground text-sm">None</span>
                }

                const primaryLocation = activeLocations.find(a => a.is_primary)
                const otherLocations = activeLocations.filter(a => !a.is_primary)

                return (
                    <div className="flex flex-wrap gap-1">
                        {primaryLocation && (
                            <Badge variant="default" className="text-xs gap-1">
                                <MapPin className="h-2.5 w-2.5" />
                                {primaryLocation.location_name}
                            </Badge>
                        )}
                        {otherLocations.slice(0, 2).map((loc) => (
                            <Badge key={loc.location_id} variant="secondary" className="text-xs">
                                {loc.location_name}
                            </Badge>
                        ))}
                        {otherLocations.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                                +{otherLocations.length - 2} more
                            </Badge>
                        )}
                    </div>
                )
            },
        },
        {
            accessorKey: 'overall_is_active',
            header: 'Status',
            cell: ({ row }) => {
                const staff = row.original
                const primaryLocation = staff.location_assignments.find(a => a.is_primary)

                const handleToggle = async () => {
                    if (!primaryLocation) return

                    if (staff.overall_is_active) {
                        deactivateStaff.mutate({
                            memberId: staff.member_id,
                            locationId: primaryLocation.location_id
                        })
                    } else {
                        reactivateStaff.mutate({
                            memberId: staff.member_id,
                            locationId: primaryLocation.location_id
                        })
                    }
                }

                return (
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={staff.overall_is_active}
                            onCheckedChange={handleToggle}
                            disabled={!primaryLocation || deactivateStaff.isPending || reactivateStaff.isPending}
                        />
                        <span className={cn(
                            "text-sm font-medium",
                            staff.overall_is_active ? "text-green-600" : "text-muted-foreground"
                        )}>
                            {staff.overall_is_active ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                )
            },
        },
        {
            accessorKey: 'pos_access',
            header: 'POS Access',
            cell: ({ row }) => {
                const staff = row.original
                const hasPin = staff.location_assignments.some(a => a.has_pin)

                return (
                    <div className="flex items-center gap-2">
                        {hasPin ? (
                            <div className="flex items-center gap-1.5 text-green-600">
                                <CheckCircle2 className="h-4 w-4" />
                                <span className="text-sm font-medium">PIN Set</span>
                            </div>
                        ) : (
                            <span className="text-muted-foreground text-sm">No PIN</span>
                        )}
                    </div>
                )
            },
        },
        {
            id: 'actions',
            cell: ({ row }) => {
                const staff = row.original
                const primaryLocation = staff.location_assignments.find(a => a.is_primary)

                const handleResetPIN = () => {
                    if (!primaryLocation) {
                        toast.error('No primary location found')
                        return
                    }

                    resetPIN.mutate({
                        memberId: staff.member_id,
                        locationId: primaryLocation.location_id
                    })
                }

                const handleDeactivate = () => {
                    if (!primaryLocation) {
                        toast.error('No primary location found')
                        return
                    }

                    if (staff.overall_is_active) {
                        deactivateStaff.mutate({
                            memberId: staff.member_id,
                            locationId: primaryLocation.location_id
                        })
                    } else {
                        reactivateStaff.mutate({
                            memberId: staff.member_id,
                            locationId: primaryLocation.location_id
                        })
                    }
                }

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
                            <DropdownMenuItem>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Details
                            </DropdownMenuItem>
                            {!staff.is_clerk_user && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={handleResetPIN} disabled={!primaryLocation}>
                                        <KeyRound className="mr-2 h-4 w-4" />
                                        Reset PIN
                                    </DropdownMenuItem>
                                </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={handleDeactivate}
                                disabled={!primaryLocation}
                                className={staff.overall_is_active ? 'text-destructive' : 'text-green-600'}
                            >
                                {staff.overall_is_active ? (
                                    <>
                                        <UserX className="mr-2 h-4 w-4" />
                                        Deactivate
                                    </>
                                ) : (
                                    <>
                                        <UserCheck className="mr-2 h-4 w-4" />
                                        Reactivate
                                    </>
                                )}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            },
        },
    ]

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        onGlobalFilterChange: setGlobalFilter,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            rowSelection,
            globalFilter,
        },
    })

    return (
        <div className="space-y-4">
            {/* Search */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search staff..."
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </TableHead>
                                    )
                                })}
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
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && 'selected'}
                                >
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
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Results count */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div>
                    Showing {table.getFilteredRowModel().rows.length} of {data.length} staff member(s)
                </div>
            </div>

            {/* Staff detail sheet */}
            <StaffDetailSheet
                staff={selectedStaff}
                open={isDetailOpen && !!selectedStaff}
                onOpenChange={(open) => {
                    setIsDetailOpen(open)
                    if (!open) {
                        setSelectedStaff(null)
                    }
                }}
            />
        </div>
    )
}
