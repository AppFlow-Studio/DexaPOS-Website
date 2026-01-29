'use client'

import { useState, useMemo } from 'react'
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  parseISO,
  differenceInHours,
  differenceInMinutes,
} from 'date-fns'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  MoreVertical,
  Trash2,
  Edit2,
  Search,
  CheckSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  useAdminTimesheets,
  useAdminTimesheetResources,
  useAdminUpdateShiftStatus,
  useAdminDeleteShift,
  useAdminBulkApproveShifts,
} from '@/lib/queries/use-admin-timesheets'
import { StaffShift } from '@/types/staff'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input' // Correct import for Input if needed, though Select is used for filters.

interface TimesheetsViewProps {
  merchantId: string
}

export function TimesheetsView({ merchantId }: TimesheetsViewProps) {
  // Date State
  const [currentDate, setCurrentDate] = useState(new Date())
  const [dateRange, setDateRange] = useState(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday start
    const end = endOfWeek(new Date(), { weekStartsOn: 1 })
    return {
      from: format(start, 'yyyy-MM-dd'),
      to: format(end, 'yyyy-MM-dd'),
    }
  })

  // Filters
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all')

  // Selection
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(new Set())

  // Dialogs
  const [deleteShiftId, setDeleteShiftId] = useState<string | null>(null)

  // Queries
  const { data: resources } = useAdminTimesheetResources(merchantId)
  const filters = useMemo(
    () => ({
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      locationIds: selectedLocation !== 'all' ? [selectedLocation] : undefined,
      employeeIds: selectedEmployee !== 'all' ? [selectedEmployee] : undefined,
    }),
    [dateRange, selectedLocation, selectedEmployee]
  )

  const { data: shiftsData, isLoading } = useAdminTimesheets(merchantId, filters)
  const shifts = shiftsData || []

  // Mutations
  const updateStatusMutation = useAdminUpdateShiftStatus(merchantId)
  const deleteMutation = useAdminDeleteShift(merchantId)
  const bulkApproveMutation = useAdminBulkApproveShifts(merchantId)

  // Handlers
  const handlePrevWeek = () => {
    const newDate = subWeeks(currentDate, 1)
    setCurrentDate(newDate)
    updateDateRange(newDate)
  }

  const handleNextWeek = () => {
    const newDate = addWeeks(currentDate, 1)
    setCurrentDate(newDate)
    updateDateRange(newDate)
  }

  const updateDateRange = (date: Date) => {
    const start = startOfWeek(date, { weekStartsOn: 1 })
    const end = endOfWeek(date, { weekStartsOn: 1 })
    setDateRange({
      from: format(start, 'yyyy-MM-dd'),
      to: format(end, 'yyyy-MM-dd'),
    })
  }

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedShiftIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedShiftIds(newSet)
  }

  const handleSelectAll = () => {
    if (selectedShiftIds.size === (shifts?.length || 0) && shifts?.length > 0) {
      setSelectedShiftIds(new Set())
    } else {
      setSelectedShiftIds(new Set(shifts?.map((s) => s.id) || []))
    }
  }

  const handleBulkApprove = async () => {
    await bulkApproveMutation.mutateAsync(Array.from(selectedShiftIds))
    setSelectedShiftIds(new Set())
  }

  const handleDelete = async () => {
    if (deleteShiftId) {
      await deleteMutation.mutateAsync(deleteShiftId)
      setDeleteShiftId(null)
    }
  }

  // Calculations
  const stats = useMemo(() => {
    if (!shifts) return { totalHours: 0, totalCost: 0, pendingCount: 0 }
    let totalMinutes = 0
    let totalCost = 0
    let pendingCount = 0

    shifts.forEach((shift) => {
      if (shift.clock_out_time) {
        const duration = differenceInMinutes(
          parseISO(shift.clock_out_time),
          parseISO(shift.clock_in_time)
        )
        totalMinutes += duration
        if (shift.hourly_rate_snapshot) {
          totalCost += (duration / 60) * shift.hourly_rate_snapshot
        }
      }
      if (shift.status !== 'approved' && shift.status !== 'rejected') {
        pendingCount++
      }
    })

    return {
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      totalCost: Math.round(totalCost * 100) / 100,
      pendingCount,
    }
  }, [shifts])

  return (
    <div className="space-y-6">
      {/* Filters & Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-md border font-medium min-w-[240px] justify-center">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {format(parseISO(dateRange.from), 'MMM d')} -{' '}
              {format(parseISO(dateRange.to), 'MMM d, yyyy')}
            </div>
            <Button variant="outline" size="icon" onClick={handleNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {resources?.locations && (
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {resources.locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {resources?.staff && (
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {resources.staff.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.first_name} {staff.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Stats & Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Total Hours</span>
              <span className="text-2xl font-bold">{stats.totalHours} hrs</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Est. Labor Cost</span>
              <span className="text-2xl font-bold">${stats.totalCost.toFixed(2)}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Pending Review</span>
              <span className="text-2xl font-bold text-amber-500">{stats.pendingCount}</span>
            </CardContent>
          </Card>
          <Card className="flex items-center justify-center p-4">
            {selectedShiftIds.size > 0 ? (
              <Button
                className="w-full"
                onClick={handleBulkApprove}
                disabled={bulkApproveMutation.isPending}
              >
                <CheckSquare className="h-4 w-4 mr-2" />
                Approve {selectedShiftIds.size} Selected
              </Button>
            ) : (
              <div className="text-sm text-muted-foreground text-center">
                Select shifts to perform bulk actions
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Shifts List */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-medium">Recorded Shifts</CardTitle>
            <Button variant="ghost" size="sm" onClick={handleSelectAll} className="text-xs">
              {shifts?.length && selectedShiftIds.size === shifts.length
                ? 'Deselect All'
                : 'Select All'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : !shifts?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mb-4 opacity-20" />
                <p>No shifts found for this period</p>
              </div>
            ) : (
              <div className="divide-y">
                {shifts.map((shift) => (
                  <div
                    key={shift.id}
                    className={cn(
                      'p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors',
                      selectedShiftIds.has(shift.id) && 'bg-muted/40'
                    )}
                  >
                    <Checkbox
                      checked={selectedShiftIds.has(shift.id)}
                      onCheckedChange={() => handleToggleSelect(shift.id)}
                    />
                    
                    {/* Employee Info */}
                    <div className="flex items-center gap-3 w-[200px]">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={shift.staff_profile?.avatar_url || ''} />
                        <AvatarFallback>
                          {shift.staff_profile?.first_name?.[0]}
                          {shift.staff_profile?.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {shift.staff_profile?.first_name} {shift.staff_profile?.last_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {shift.location?.name}
                        </span>
                      </div>
                    </div>

                    {/* Time Info */}
                    <div className="flex-1 grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground">Date</div>
                        <div className="text-sm font-medium">
                          {format(parseISO(shift.clock_in_time), 'MMM d, yyyy')}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Clock In</div>
                        <div className="text-sm font-medium">
                          {format(parseISO(shift.clock_in_time), 'h:mm a')}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Clock Out</div>
                        <div className={cn("text-sm font-medium", !shift.clock_out_time && "text-amber-600 italic")}>
                          {shift.clock_out_time
                            ? format(parseISO(shift.clock_out_time), 'h:mm a')
                            : 'Active'}
                        </div>
                      </div>
                    </div>

                    {/* Hours */}
                    <div className="w-[100px] text-right">
                      <div className="text-xs text-muted-foreground">Hours</div>
                      <div className="text-sm font-bold">
                        {shift.clock_out_time
                          ? (
                              differenceInMinutes(
                                parseISO(shift.clock_out_time),
                                parseISO(shift.clock_in_time)
                              ) / 60
                            ).toFixed(2)
                          : '-'}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="w-[100px] flex justify-center">
                      <ShiftStatusBadge status={shift.status as any} />
                    </div>

                    {/* Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                         {shift.status !== 'approved' && (
                           <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ shiftId: shift.id, status: 'approved' })}>
                             <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                             Approve
                           </DropdownMenuItem>
                         )}
                         {shift.status !== 'rejected' && (
                           <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ shiftId: shift.id, status: 'rejected' })}>
                             <XCircle className="h-4 w-4 mr-2 text-red-600" />
                             Reject
                           </DropdownMenuItem>
                         )}
                         <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                          onClick={() => setDeleteShiftId(shift.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteShiftId} onOpenChange={() => setDeleteShiftId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shift Record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this shift record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ShiftStatusBadge({ status }: { status: 'active' | 'completed' | 'approved' | 'rejected' }) {
  switch (status) {
    case 'approved':
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">Approved</Badge>
    case 'rejected':
      return <Badge variant="destructive">Rejected</Badge>
    case 'active':
      return <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 animate-pulse">Active Now</Badge>
    default:
      return <Badge variant="secondary">Completed</Badge>
  }
}
