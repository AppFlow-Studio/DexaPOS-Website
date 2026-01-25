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
} from 'lucide-react'
import { toast } from 'sonner'

import {
  deleteAdminCategory,
  updateAdminNotes,
  getCategoryAuditInfo,
  type AdminCategory,
  type AuditInfo,
} from '@/app/manage/actions/admin-merchant/menus'

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

  return (
    <>
      <BottomSheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <BottomSheetContent height="auto">
          <BottomSheetHeader>
            <BottomSheetTitle>Category Details</BottomSheetTitle>
            <BottomSheetDescription>
              {isLocationView
                ? 'Viewing category with location context'
                : 'Viewing category details'}
            </BottomSheetDescription>
          </BottomSheetHeader>

          <BottomSheetBody className="space-y-6">
            {!category ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <>
                {/* Category Header */}
                <div className="flex gap-4">
                  <div className="h-20 w-20 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                    {category.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={category.image}
                        alt={category.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Folder className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-semibold">{category.name}</h3>
                    {category.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {category.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {category.is_active ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-0">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-0">
                          <XCircle className="h-3 w-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={category.is_global ? 'bg-slate-50' : 'bg-blue-50 text-blue-700'}
                      >
                        {category.is_global ? (
                          <>
                            <Globe className="h-3 w-3 mr-1" />
                            Global
                          </>
                        ) : (
                          <>
                            <MapPin className="h-3 w-3 mr-1" />
                            {category.location_name || 'Location'}
                          </>
                        )}
                      </Badge>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Stats */}
                <BottomSheetSection title="Statistics">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border p-4">
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-2xl font-bold">{category.items_count}</p>
                          <p className="text-sm text-muted-foreground">Items</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div>
                        <p className="text-2xl font-bold">{category.display_order}</p>
                        <p className="text-sm text-muted-foreground">Display Order</p>
                      </div>
                    </div>
                  </div>
                </BottomSheetSection>

                {/* Audit Information */}
                <BottomSheetSection title="Audit Information">
                  <div className="space-y-4">
                    {/* Last Modified */}
                    <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Last Modified</span>
                      </div>
                      <span className="text-sm font-medium">
                        {category.updated_at
                          ? formatDistanceToNow(new Date(category.updated_at), { addSuffix: true })
                          : category.created_at
                            ? formatDistanceToNow(new Date(category.created_at), { addSuffix: true })
                            : 'Unknown'}
                      </span>
                    </div>

                    {/* Modified By */}
                    {isLoadingAudit ? (
                      <div className="flex items-center gap-2 py-2 px-3">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Loading audit info...</span>
                      </div>
                    ) : auditInfo?.updated_by ? (
                      <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Modified By</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{auditInfo.updated_by.name}</p>
                          <p className="text-xs text-muted-foreground">{auditInfo.updated_by.email}</p>
                        </div>
                      </div>
                    ) : null}

                    {/* Created */}
                    <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Created</span>
                      </div>
                      <span className="text-sm font-medium">
                        {category.created_at
                          ? format(new Date(category.created_at), 'MMM d, yyyy')
                          : 'Unknown'}
                      </span>
                    </div>

                    <Separator />

                    {/* Admin Notes */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="admin-notes-category" className="text-sm font-medium">
                          Admin Notes
                        </Label>
                      </div>
                      <Textarea
                        id="admin-notes-category"
                        placeholder="Internal notes (only visible to admins)..."
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                      {hasNotesChanged && (
                        <Button
                          size="sm"
                          onClick={handleSaveNotes}
                          disabled={isSavingNotes}
                        >
                          {isSavingNotes ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            'Save Notes'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </BottomSheetSection>
              </>
            )}
          </BottomSheetBody>

          {category && (
            <BottomSheetFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => category && onEdit(category)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
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
