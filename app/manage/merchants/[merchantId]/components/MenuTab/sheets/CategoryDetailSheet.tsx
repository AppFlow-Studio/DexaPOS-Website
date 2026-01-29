'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
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
  ImageOff,
  Pencil,
  Trash2,
  Globe,
  MapPin,
  CheckCircle2,
  XCircle,
  Folder,
  Package,
  Loader2,
  User,
  Calendar,
  FileText,
  Clock,
  ChevronRight,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

import {
  deleteAdminCategory,
  updateAdminNotes,
  getCategoryAuditInfo,
  type AdminCategory,
  type AuditInfo,
} from '@/app/manage/actions/admin-merchant/menus'

import { 
    useAdminCategorySchedules,
    type AdminSchedule
} from '@/lib/queries/use-admin-merchant'

// ============================================================================
// PROPS
// ============================================================================

interface CategoryDetailSheetProps {
  open: boolean
  onClose: () => void
  merchantId: string
  locationId: string | null
  category: AdminCategory | null
  onEdit: (category: AdminCategory) => void
  onSuccess: () => void
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ============================================================================
// COMPONENT
// ============================================================================

export function CategoryDetailSheet({
  open,
  onClose,
  merchantId,
  locationId,
  category,
  onEdit,
  onSuccess,
}: CategoryDetailSheetProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Audit info state
  const [auditInfo, setAuditInfo] = useState<AuditInfo | null>(null)
  const [isLoadingAudit, setIsLoadingAudit] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [originalNotes, setOriginalNotes] = useState('')
  const [isSavingNotes, setIsSavingNotes] = useState(false)

  // Schedules state
  const { data: schedules = [], isLoading: isLoadingSchedules } = useAdminCategorySchedules(
    merchantId,
    category?.id || null
  )

  const hasNotesChanged = adminNotes !== originalNotes
  const isLocationView = locationId && locationId !== 'all'

  // Fetch audit info when category is loaded
  useEffect(() => {
    async function fetchAuditInfo() {
      if (!category || !open) return
      setIsLoadingAudit(true)
      try {
        const info = await getCategoryAuditInfo(merchantId, category.id)
        setAuditInfo(info)
        setAdminNotes(info?.admin_notes || '')
        setOriginalNotes(info?.admin_notes || '')
      } catch (error) {
        console.error('Failed to fetch audit info:', error)
      } finally {
        setIsLoadingAudit(false)
      }
    }
    fetchAuditInfo()
  }, [category, merchantId, open])

  // Reset notes state when sheet closes
  useEffect(() => {
    if (!open) {
      setAuditInfo(null)
      setAdminNotes('')
      setOriginalNotes('')
    }
  }, [open])

  const handleSaveNotes = async () => {
    if (!category) return

    setIsSavingNotes(true)
    try {
      const result = await updateAdminNotes(merchantId, 'category', category.id, adminNotes || null)

      if (!result.success) {
        toast.error('Failed to save notes', { description: result.error || undefined })
        return
      }

      setOriginalNotes(adminNotes)
      toast.success('Notes saved')
    } catch (error) {
      toast.error('An unexpected error occurred')
      console.error(error)
    } finally {
      setIsSavingNotes(false)
    }
  }

  const handleDelete = async () => {
    if (!category) return

    setIsDeleting(true)
    try {
      const result = await deleteAdminCategory(merchantId, category.id)

      if (!result.success) {
        toast.error('Failed to delete category', { description: result.error || undefined })
        return
      }

      toast.success('Category deleted')
      onSuccess()
      onClose()
    } catch (error) {
      toast.error('An unexpected error occurred')
      console.error(error)
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  // Live Availability Check
  const getAvailabilityStatus = () => {
    if (!category?.is_active) return { label: 'Inactive', color: 'text-red-500', bg: 'bg-red-50' }
    if (schedules.length === 0) return { label: 'Always Available', color: 'text-green-600', bg: 'bg-green-50' }

    const now = new Date()
    const currentDay = now.getDay()
    const currentTimeStr = format(now, 'HH:mm')

    let isCurrentlyActive = false

    for (const schedule of schedules) {
      if (!schedule.is_active) continue
      for (const slot of schedule.schedule_time_slots) {
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

  return (
    <>
      <BottomSheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <BottomSheetContent className="!h-[95vh]">
          <BottomSheetHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center overflow-hidden">
                {category?.image ? (
                   // eslint-disable-next-line @next/next/no-img-element
                   <img src={category.image} alt={category.name} className="h-full w-full object-cover" />
                ) : (
                  <Folder className="h-5 w-5 text-orange-600" />
                )}
              </div>
              <div>
                <BottomSheetTitle className="text-xl">{category?.name}</BottomSheetTitle>
                <div className="flex gap-2 items-center mt-1">
                  <Badge variant="outline" className={`text-[10px] ${availability.bg} ${availability.color} border-0`}>
                    {availability.icon}
                    {availability.label}
                  </Badge>
                  {category?.is_global ? (
                    <Badge variant="outline" className="text-[10px] bg-slate-50">
                      <Globe className="h-3 w-3 mr-1" />
                      Global
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700">
                      <MapPin className="h-3 w-3 mr-1" />
                      {category?.location_name || 'Location'}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <BottomSheetDescription>
              {category?.description || 'No description provided.'}
            </BottomSheetDescription>
          </BottomSheetHeader>

          <BottomSheetBody>
             <div className="space-y-6 pb-20 px-1">
                {/* Stats Bar */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border bg-muted/20 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Items linked</p>
                    <p className="text-xl font-bold">{category?.items_count}</p>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Display Rank</p>
                    <p className="text-xl font-bold">#{category?.display_order}</p>
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
                      <p className="text-sm text-muted-foreground">This category is always available while active.</p>
                      <Button variant="link" size="sm" className="mt-1">
                         Assign Schedule <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
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
                            {schedule.schedule_time_slots.map((slot) => (
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

                {/* Audit & Info */}
                <BottomSheetSection title="Internal Context">
                   <div className="space-y-3">
                       <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30 border border-transparent">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Created</span>
                        </div>
                        <span className="text-xs font-medium">
                            {category?.created_at ? format(new Date(category.created_at), 'PPP') : 'N/A'}
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
                                <Label htmlFor="admin-notes-category" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Admin Notes
                                </Label>
                            </div>
                            <Textarea
                                id="admin-notes-category"
                                placeholder="Internal notes for this category..."
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

          {category && (
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
              <Button className="flex-1" onClick={() => category && onEdit(category)}>
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
              Delete Category
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{category?.name}&quot;? This will remove it from all
              menus and disassociate all items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Category'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
