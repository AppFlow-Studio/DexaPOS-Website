'use client'

import { useMemo, useState } from 'react'
import {
  Calendar,
  Plus,
  Search,
  MoreVertical,
  MapPin,
  Globe,
  Power,
  PowerOff,
  Edit3,
  Trash2,
  Utensils,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { AdminSchedule, AdminTimeSlot } from '@/app/manage/actions/admin-merchant/schedules'
import {
  useAdminSchedules,
  useAdminDeleteSchedule,
  useAdminToggleScheduleStatus,
} from '@/lib/queries/use-admin-schedules'
import { AdminScheduleFormSheet } from './AdminScheduleFormSheet'
import { isSingleLocationList } from '@/stores/location-store'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface AvailabilitySchedulesViewProps {
  merchantId: string
  locations: any[]
}

export function AvailabilitySchedulesView({ merchantId, locations }: AvailabilitySchedulesViewProps) {
  const isSingleLocation = isSingleLocationList(locations)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all')
  
  // Sheet states
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<AdminSchedule | null>(null)
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null)

  // Queries & Mutations
  const { data: schedules, isLoading } = useAdminSchedules(merchantId, selectedLocationId)
  const deleteMutation = useAdminDeleteSchedule(merchantId)
  const toggleMutation = useAdminToggleScheduleStatus(merchantId)

  const filteredSchedules = useMemo(() => {
    if (!schedules) return []
    return schedules.filter(
      (s) =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [schedules, searchTerm])

  const stats = useMemo(() => {
    if (!schedules) return { total: 0, active: 0, global: 0 }
    return {
      total: schedules.length,
      active: schedules.filter((s) => s.is_active).length,
      global: schedules.filter((s) => !s.location_id).length,
    }
  }, [schedules])

  const handleEdit = (schedule: AdminSchedule) => {
    setEditingSchedule(schedule)
    setIsFormOpen(true)
  }

  const handleDelete = async () => {
    if (deletingScheduleId) {
      await deleteMutation.mutateAsync(deletingScheduleId)
      setDeletingScheduleId(null)
    }
  }

  const handleToggleActive = (schedule: AdminSchedule) => {
    toggleMutation.mutate({ scheduleId: schedule.id, isActive: !schedule.is_active })
  }

  const getLocationName = (locationId: string | null) => {
    if (!locationId) return 'Global'
    const loc = locations.find((l) => l.id === locationId)
    return loc ? loc.name : 'Unknown Location'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          {/* Title removed as it acts as a sub-header now */}
          <div className="flex items-center gap-3">
           {!isSingleLocation && (
           <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
            <SelectTrigger className="w-[200px]">
              <MapPin className="h-4 w-4 mr-2" />
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
           )}
          <Button onClick={() => { setEditingSchedule(null); setIsFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            New Schedule
          </Button>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Schedules</CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {isSingleLocation
                ? 'Menu availability windows'
                : `${stats.global} global schedules`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Schedules</CardTitle>
            <Power className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            <p className="text-xs mt-1 text-green-600/80">
              Schedules currently in effect
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Location Filter</CardTitle>
            <MapPin className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {selectedLocationId === 'all' ? 'All' : '1 Specific'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedLocationId === 'all' ? 'Showing all merchant schedules' : `Showing schedules for ${getLocationName(selectedLocationId)}`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main List Card */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg">Merchant Schedules</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search schedules..."
                className="pl-9 bg-muted/40"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div className="p-12 text-center">
              <Empty
                icon={Calendar}
                title="No schedules found"
                description={searchTerm ? "Try adjusting your search terms" : "Start by creating a new availability schedule"}
                action={!searchTerm && (
                  <Button onClick={() => setIsFormOpen(true)}>Create First Schedule</Button>
                )}
              />
            </div>
          ) : (
            <div className="divide-y">
              {filteredSchedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="p-4 hover:bg-muted/30 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className={cn("h-4 w-4", schedule.is_active ? "text-primary" : "text-muted-foreground")} />
                        <h4 className="font-semibold">{schedule.name}</h4>
                        <Badge
                          variant={schedule.is_active ? 'default' : 'secondary'}
                          className={cn("text-[10px] px-1.5 h-4", schedule.is_active ? "bg-green-100 text-green-700 hover:bg-green-100" : "")}
                        >
                          {schedule.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {!isSingleLocation && (!schedule.location_id ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 h-4 bg-emerald-50 text-emerald-700 border-emerald-100 uppercase tracking-tight">
                            <Globe className="h-2.5 w-2.5 mr-1" /> Global
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 h-4 bg-purple-50 text-purple-700 border-purple-100 uppercase tracking-tight">
                            <MapPin className="h-2.5 w-2.5 mr-1" /> {getLocationName(schedule.location_id)}
                          </Badge>
                        ))}
                      </div>
                      {schedule.description && (
                        <p className="text-sm text-muted-foreground mb-3 truncate max-w-2xl">
                          {schedule.description}
                        </p>
                      )}

                      {/* Time Slots Visualization */}
                      <div className="flex flex-wrap gap-2">
                        {renderTimeSlots(schedule.schedule_time_slots)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        title={schedule.is_active ? "Deactivate" : "Activate"}
                        onClick={() => handleToggleActive(schedule)}
                      >
                         {schedule.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(schedule)}>
                            <Edit3 className="h-4 w-4 mr-2" /> Edit Schedule
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                            onClick={() => setDeletingScheduleId(schedule.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Sheet */}
      <AdminScheduleFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        merchantId={merchantId}
        mode={editingSchedule ? 'edit' : 'create'}
        editSchedule={editingSchedule}
        locationId={selectedLocationId}
      />

      {/* Delete Dialog */}
      <AlertDialog
        open={!!deletingScheduleId}
        onOpenChange={(open) => !open && setDeletingScheduleId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this schedule and remove it from any menus or categories it's assigned to. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Schedule'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function renderTimeSlots(slots: AdminTimeSlot[]) {
  if (!slots || slots.length === 0) {
    return (
      <span className="text-xs text-muted-foreground italic">No time slots configured</span>
    )
  }

  // Find unique time ranges
  const rangeMap = new Map<string, number[]>()
  slots.forEach(slot => {
    const key = `${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`
    if (!rangeMap.has(key)) rangeMap.set(key, [])
    rangeMap.get(key)!.push(slot.day_of_week)
  })

  return Array.from(rangeMap.entries()).map(([time, days], idx) => (
    <div key={idx} className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-[11px] font-medium border border-border/50">
      <span className="text-primary/70 mr-1">
        {days.sort().map(d => DAYS_OF_WEEK[d]).join(', ')}
      </span>
      <span>{time}</span>
    </div>
  ))
}
