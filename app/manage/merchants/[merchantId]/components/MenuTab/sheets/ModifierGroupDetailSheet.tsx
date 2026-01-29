'use client'

import * as React from 'react'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Sliders,
  Globe,
  MapPin,
  CheckCircle2,
  XCircle,
  Asterisk,
  ListOrdered,
  Calendar,
  Pencil,
  ChevronRight,
  ChevronDown,
  User,
  FileText,
  Loader2,
} from 'lucide-react'
import { format } from 'date-fns'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

import { formatCurrency } from '@/lib/utils'
import { 
    type AdminModifierGroup, 
    type AdminModifierItem,
    type AuditInfo,
    getModifierGroupAuditInfo,
    updateAdminNotes
} from '@/app/manage/actions/admin-merchant/menus'
import { ModifierRecipeManager } from '@/app/dashboard/menu/components/ModifierRecipeManager'

interface ModifierGroupDetailSheetProps {
  open: boolean
  onClose: () => void
  merchantId: string
  locationId: string | null
  group: AdminModifierGroup | null
  details: {
    items: AdminModifierItem[]
  } | null
  onEdit: (group: AdminModifierGroup) => void
}

export function ModifierGroupDetailSheet({
  open,
  onClose,
  merchantId,
  locationId,
  group,
  details,
  onEdit,
}: ModifierGroupDetailSheetProps) {
  const [expandedOptionId, setExpandedOptionId] = React.useState<string | null>(null)
  
  // Audit info state
  const [auditInfo, setAuditInfo] = React.useState<AuditInfo | null>(null)
  const [isLoadingAudit, setIsLoadingAudit] = React.useState(false)
  const [adminNotes, setAdminNotes] = React.useState('')
  const [originalNotes, setOriginalNotes] = React.useState('')
  const [isSavingNotes, setIsSavingNotes] = React.useState(false)

  const hasNotesChanged = adminNotes !== originalNotes

  // Fetch audit info when group is loaded
  React.useEffect(() => {
    async function fetchAuditInfo() {
      if (!group || !open) return
      setIsLoadingAudit(true)
      try {
        const info = await getModifierGroupAuditInfo(merchantId, group.id)
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
  }, [group, merchantId, open])

  // Reset state when sheet closes
  React.useEffect(() => {
    if (!open) {
      setAuditInfo(null)
      setAdminNotes('')
      setOriginalNotes('')
    }
  }, [open])

  const handleSaveNotes = async () => {
    if (!group) return

    setIsSavingNotes(true)
    try {
      const result = await updateAdminNotes(merchantId, 'modifier_group', group.id, adminNotes || null)

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

  if (!group) return null

  const isLocationView = locationId && locationId !== 'all'
  const canEditStructure = !group.is_global || !isLocationView

  return (
    <BottomSheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <BottomSheetContent className="!h-[95vh]">
        <BottomSheetHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center">
              <Sliders className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <BottomSheetTitle className="text-xl">{group.name}</BottomSheetTitle>
              <div className="flex gap-2 items-center mt-1">
                {group.is_global ? (
                  <Badge variant="outline" className="text-[10px] bg-slate-50">
                    <Globe className="h-3 w-3 mr-1" />
                    Global
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700">
                    <MapPin className="h-3 w-3 mr-1" />
                    Location
                  </Badge>
                )}
                {group.is_active ? (
                  <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-0">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-0">
                    <XCircle className="h-3 w-3 mr-1" />
                    Inactive
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <BottomSheetDescription>
            {group.description || 'No description provided.'}
          </BottomSheetDescription>
        </BottomSheetHeader>

        <BottomSheetBody>
          <div className="space-y-6 pb-20 px-1">
            {/* Stats / Selection Rules */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border bg-muted/20 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 px-1">Options</p>
                <p className="text-xl font-bold">{details?.items?.length || 0}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 px-1">Selection</p>
                <p className="text-sm font-bold truncate">
                  {group.is_required ? 'Required' : 'Optional'}
                </p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 px-1">Range</p>
                <p className="text-xl font-bold">
                    {group.min_selections}-{group.max_selections ?? '∞'}
                </p>
              </div>
            </div>

            <Separator />

            {/* Modifier Options */}
            <BottomSheetSection title={`Modifier Options`}>
              <div className="space-y-3">
                {details?.items?.map((item) => (
                  <Collapsible
                    key={item.id}
                    open={expandedOptionId === item.id}
                    onOpenChange={(open) => setExpandedOptionId(open ? item.id : null)}
                    className="border rounded-xl overflow-hidden shadow-sm transition-all"
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-4 bg-card cursor-pointer hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="text-muted-foreground">
                            {expandedOptionId === item.id ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{item.name}</span>
                              {item.is_default && (
                                <Badge variant="outline" className="text-[10px] bg-slate-50 border-slate-200">Default</Badge>
                              )}
                              {!item.is_active && (
                                <Badge variant="destructive" className="text-[10px]">Inactive</Badge>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={item.price_modifier > 0 ? 'text-green-600 font-bold' : item.price_modifier < 0 ? 'text-red-600 font-bold' : 'text-muted-foreground font-medium'}>
                            {item.price_modifier > 0 ? '+' : ''}
                            {formatCurrency(item.price_modifier)}
                          </span>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 bg-muted/20 border-t space-y-4 animate-in slide-in-from-top-1">
                        {/* Recipe Manager for this Option */}
                        <ModifierRecipeManager
                          modifierItemId={item.id}
                          modifierItemName={item.name}
                          merchantId={merchantId}
                          locationId={locationId}
                          isEditable={canEditStructure}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}

                {(!details?.items || details.items.length === 0) && (
                  <div className="text-center py-6 bg-muted/20 rounded-xl border border-dashed">
                    <p className="text-sm text-muted-foreground">No options added to this group yet.</p>
                  </div>
                )}
              </div>
            </BottomSheetSection>

            <Separator />

            {/* Audit & Notes */}
            <BottomSheetSection title="Internal Context">
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30 border border-transparent">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Created</span>
                  </div>
                  <span className="text-xs font-medium">
                    {group.created_at ? format(new Date(group.created_at), 'PPP') : 'N/A'}
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
                    <Label htmlFor="admin-notes-modgroup" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Admin Notes
                    </Label>
                  </div>
                  <Textarea
                    id="admin-notes-modgroup"
                    placeholder="Internal notes for this group..."
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

        <BottomSheetFooter className="flex-col md:flex-row gap-2 pt-4 border-t">
          <Button variant="outline" className="w-full" onClick={onClose}>
            Back to List
          </Button>
          <Button className="w-full gap-2" onClick={() => onEdit(group)}>
            <Pencil className="h-4 w-4" />
            Edit Modifier Group
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  )
}
