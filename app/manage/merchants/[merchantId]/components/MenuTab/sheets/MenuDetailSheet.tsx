'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow, format, isWithinInterval, parse } from 'date-fns'
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetSection,
} from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
  Pencil,
  Trash2,
  Globe,
  MapPin,
  CheckCircle2,
  XCircle,
  Menu as MenuIcon,
  Folder,
  Package,
  Clock,
  Loader2,
  User,
  Calendar,
  FileText,
  ChevronRight,
  Zap,
} from 'lucide-react'
import Link from 'next/link'

import {
  deleteAdminMenu,
  updateAdminNotes,
  getMenuAuditInfo,
  getAdminMenuSchedules,
  type AdminMenu,
  type AdminMenuWithCategories,
  type AuditInfo,
} from '@/app/manage/actions/admin-merchant/menus'

import { formatCurrency } from '@/lib/utils'

// ============================================================================
// PROPS
// ============================================================================

interface MenuDetailSheetProps {
  open: boolean
  onClose: () => void
  clerkOrgId: string
  merchantId: string
  locationId: string | null
  menu: AdminMenu | AdminMenuWithCategories | null
  onEdit: (menu: AdminMenu | AdminMenuWithCategories) => void
  onSuccess: () => void
}

interface MenuSchedule {
  id: string
  name: string
  description: string | null
  is_active: boolean
  time_slots: Array<{
    id: string
    day_of_week: number
    start_time: string
    end_time: string
    is_active: boolean
  }>
}

// Helper to check if menu has categories details
function hasCategories(menu: AdminMenu | AdminMenuWithCategories): menu is AdminMenuWithCategories {
  return 'categories' in menu && Array.isArray((menu as AdminMenuWithCategories).categories)
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ============================================================================
// COMPONENT
// ============================================================================

export function MenuDetailSheet({
  open,
  onClose,
  clerkOrgId,
  merchantId,
  locationId,
  menu,
  onEdit,
  onSuccess,
}: MenuDetailSheetProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Audit info state
  const [auditInfo, setAuditInfo] = useState<AuditInfo | null>(null)
  const [isLoadingAudit, setIsLoadingAudit] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [originalNotes, setOriginalNotes] = useState('')
  const [isSavingNotes, setIsSavingNotes] = useState(false)

  // Schedules state
  const [schedules, setSchedules] = useState<MenuSchedule[]>([])
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false)

  const hasNotesChanged = adminNotes !== originalNotes
  const isLocationView = locationId && locationId !== 'all'

  // Fetch audit info and schedules when menu is loaded
  useEffect(() => {
    async function fetchData() {
      if (!menu || !open) return
      
      setIsLoadingAudit(true)
      setIsLoadingSchedules(true)
      
      try {
        const [info, scheduleData] = await Promise.all([
          getMenuAuditInfo(merchantId, menu.id),
          getAdminMenuSchedules(merchantId, menu.id)
        ])
        
        setAuditInfo(info)
        setAdminNotes(info?.admin_notes || '')
        setOriginalNotes(info?.admin_notes || '')
        setSchedules(scheduleData)
      } catch (error) {
        console.error('Failed to fetch menu details:', error)
      } finally {
        setIsLoadingAudit(false)
        setIsLoadingSchedules(false)
      }
    }
    fetchData()
  }, [menu, merchantId, open])

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      setAuditInfo(null)
      setAdminNotes('')
      setOriginalNotes('')
      setSchedules([])
    }
  }, [open])

  const handleSaveNotes = async () => {
    if (!menu) return

    setIsSavingNotes(true)
    try {
      const result = await updateAdminNotes(merchantId, 'menu', menu.id, adminNotes || null)

      if (!result.success) {
        return
      }

      setOriginalNotes(adminNotes)
    } catch (error) {
      console.error(error)
    } finally {
      setIsSavingNotes(false)
    }
  }

  const handleDelete = async () => {
    if (!menu) return

    setIsDeleting(true)
    try {
      const result = await deleteAdminMenu(merchantId, menu.id)

      if (!result.success) {
        return
      }

      onSuccess()
      onClose()
    } catch (error) {
      console.error(error)
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  // Live Availability Check
  const getAvailabilityStatus = () => {
    if (!menu?.is_active) return { label: 'Inactive', color: 'text-red-500', bg: 'bg-red-50' }
    if (schedules.length === 0) return { label: 'Always Available', color: 'text-green-600', bg: 'bg-green-50' }

    const now = new Date()
    const currentDay = now.getDay()
    const currentTimeStr = format(now, 'HH:mm')

    let isCurrentlyActive = false
    let nextAvailable = null

    for (const schedule of schedules) {
      if (!schedule.is_active) continue
      for (const slot of schedule.time_slots) {
        if (!slot.is_active) continue
        if (slot.day_of_week === currentDay) {
          if (currentTimeStr >= slot.start_time && currentTimeStr <= slot.end_time) {
            isCurrentlyActive = true
            break
          }
        }
      }
      if (isCurrentlyActive) break
    }

    if (isCurrentlyActive) {
      return { label: 'Currently Live', color: 'text-green-600', bg: 'bg-green-50', icon: <Zap className="h-3 w-3 mr-1" /> }
    } else {
      return { label: 'Scheduled', color: 'text-amber-600', bg: 'bg-amber-50', icon: <Clock className="h-3 w-3 mr-1" /> }
    }
  }

  const availability = getAvailabilityStatus()

  // Get categories from menu if available
  const categories = menu && hasCategories(menu) ? menu.categories : null

  return (
    <>
      <BottomSheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <BottomSheetContent className="!h-[95vh]">
          <BottomSheetHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <MenuIcon className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <BottomSheetTitle className="text-xl">{menu?.name}</BottomSheetTitle>
                <div className="flex gap-2 items-center mt-1">
                  <Badge variant="outline" className={`text-[10px] ${availability.bg} ${availability.color} border-0`}>
                    {availability.icon}
                    {availability.label}
                  </Badge>
                  {menu?.is_global ? (
                    <Badge variant="outline" className="text-[10px] bg-slate-50">
                      <Globe className="h-3 w-3 mr-1" />
                      Global
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700">
                      <MapPin className="h-3 w-3 mr-1" />
                      {menu?.location_name || 'Location'}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <BottomSheetDescription>
              {menu?.description || 'No description provided.'}
            </BottomSheetDescription>
          </BottomSheetHeader>

          <BottomSheetBody>
            <div className="space-y-6 pb-20 px-1">
              {/* Quick Actions / Link */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs" asChild>
                  <Link href={`/manage/merchants/${clerkOrgId}/menu/${menu?.id}`}>
                    <Pencil className="h-3 w-3 mr-1" />
                    Open Menu Builder
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-xs">
                  <Package className="h-3 w-3 mr-1" />
                  View as Customer
                </Button>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border bg-muted/20 p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Categories</p>
                  <p className="text-xl font-bold">{menu?.categories_count}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Total Items</p>
                  <p className="text-xl font-bold">{menu?.items_count}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Schedules</p>
                  <p className="text-xl font-bold">{menu?.schedules_count}</p>
                </div>
              </div>

              <Separator />

              {/* Schedule Summary */}
              <BottomSheetSection title="Availability Schedule">
                {isLoadingSchedules ? (
                   <div className="space-y-2">
                     <Skeleton className="h-12 w-full" />
                     <Skeleton className="h-12 w-full" />
                   </div>
                ) : schedules.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-center">
                    <p className="text-sm text-muted-foreground">This menu is always available while active.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {schedules.map((schedule) => (
                      <div key={schedule.id} className="rounded-xl border p-3 bg-card shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold">{schedule.name}</span>
                          {!schedule.is_active && <Badge variant="destructive" className="text-[10px]">Disabled</Badge>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {schedule.time_slots.map((slot) => (
                            <div key={slot.id} className="text-[10px] px-2 py-1 rounded bg-muted font-medium">
                              {dayNames[slot.day_of_week].substring(0, 3)}: {slot.start_time} - {slot.end_time}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </BottomSheetSection>

              <Separator />

              {/* Menu Structure View */}
              <BottomSheetSection title="Categories Structure">
                {!categories ? (
                  <div className="flex flex-col items-center justify-center p-8 border rounded-xl border-dashed">
                    <Folder className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">Detailed structure only available in Menu Builder</p>
                    <Button variant="link" size="sm" asChild>
                       <Link href={`/manage/merchants/${clerkOrgId}/menu/${menu?.id}`}>
                         Go to Builder <ChevronRight className="h-3 w-3 ml-1" />
                       </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {categories.map((mc) => (
                      <div key={mc.id} className="flex items-center justify-between p-3 rounded-xl border bg-card hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center">
                            <Folder className="h-4 w-4 text-orange-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{mc.custom_title || mc.category.name}</p>
                            <p className="text-[10px] text-muted-foreground">{mc.items.length} items</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {mc.category.is_global ? 'Global' : 'Location'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </BottomSheetSection>

              <Separator />

              {/* Audit Section */}
              <BottomSheetSection title="Audit & Info">
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30 border border-transparent">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Created</span>
                    </div>
                    <span className="text-xs font-medium">
                      {menu?.created_at ? format(new Date(menu.created_at), 'PPP') : 'N/A'}
                    </span>
                  </div>

                  {auditInfo?.updated_by && (
                    <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30 border border-transparent">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Last Edited By</span>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold">{auditInfo.updated_by.name}</p>
                        <p className="text-[10px] text-muted-foreground">{auditInfo.updated_by.email}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 mt-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="admin-notes-menu" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Admin Notes
                      </Label>
                    </div>
                    <Textarea
                      id="admin-notes-menu"
                      placeholder="Internal notes for this menu..."
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      rows={3}
                      className="resize-none rounded-xl bg-muted/20 border-muted-foreground/10"
                    />
                    {hasNotesChanged && (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={handleSaveNotes}
                        disabled={isSavingNotes}
                      >
                        {isSavingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Notes'}
                      </Button>
                    )}
                  </div>
                </div>
              </BottomSheetSection>
            </div>
          </BottomSheetBody>

          {menu && (
            <BottomSheetFooter className="gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive hover:bg-destructive/10 border-destructive/20"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Close
              </Button>
              <Button className="flex-1" onClick={() => menu && onEdit(menu)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Settings
              </Button>
            </BottomSheetFooter>
          )}
        </BottomSheetContent>
      </BottomSheet>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Menu
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{menu?.name}&quot;? This will remove all category
              associations and schedules. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Menu'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
