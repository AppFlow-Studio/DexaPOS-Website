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
  DollarSign,
  CheckCircle2,
  XCircle,
  Tag,
  Monitor,
  Smartphone,
  Package,
  RotateCcw,
  ArrowRight,
  Layers,
  Copy,
  Loader2,
  User,
  Calendar,
  FileText,
  ChevronRight,
  Sliders,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useMerchantDetails } from '@/lib/queries/use-merchants'

import { RecipeManager } from '@/app/dashboard/menu/components/RecipeManager'
import { ItemPreviewCard } from '@/components/dashboard/menu/ItemPreviewCard'

import {
  useAdminMenuItemDetails,
  useAdminItemModifierGroups,
  type AdminMenuItem,
} from '@/lib/queries/use-admin-merchant'
import {
  deleteAdminMenuItem,
  deleteAdminLocationItemOverride,
  updateAdminNotes,
  getMenuItemAuditInfo,
  type AuditInfo,
} from '@/app/manage/actions/admin-merchant/menus'

// ============================================================================
// PRICE LEVEL COLORS
// ============================================================================

const PRICE_LEVEL_CONFIG = {
  base: {
    label: 'Base Price (L1)',
    shortLabel: 'L1',
    description: 'Default price for all locations',
    color: 'text-slate-700 dark:text-slate-300',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    borderColor: 'border-slate-200 dark:border-slate-700',
  },
  location_item: {
    label: 'Location Override (L2)',
    shortLabel: 'L2',
    description: 'Location-specific price override',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900',
    borderColor: 'border-blue-200 dark:border-blue-800',
  },
  category: {
    label: 'Category Price (L3)',
    shortLabel: 'L3',
    description: 'Price when sold in specific category',
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-900',
    borderColor: 'border-green-200 dark:border-green-800',
  },
  location_category: {
    label: 'Location + Category (L4)',
    shortLabel: 'L4',
    description: 'Location override for category price',
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-100 dark:bg-purple-900',
    borderColor: 'border-purple-200 dark:border-purple-800',
  },
  location_menu: {
    label: 'Location + Menu (L5)',
    shortLabel: 'L5',
    description: 'Most specific price override',
    color: 'text-orange-700 dark:text-orange-300',
    bgColor: 'bg-orange-100 dark:bg-orange-900',
    borderColor: 'border-orange-200 dark:border-orange-800',
  },
}

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

// ============================================================================
// PROPS
// ============================================================================

interface ItemDetailSheetProps {
  open: boolean
  onClose: () => void
  merchantId: string
  locationId: string | null
  itemId: string | null
  onEdit: (item: AdminMenuItem) => void
  onSuccess: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ItemDetailSheet({
  open,
  onClose,
  merchantId,
  locationId,
  itemId,
  onEdit,
  onSuccess,
}: ItemDetailSheetProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  // Audit info state
  const [auditInfo, setAuditInfo] = useState<AuditInfo | null>(null)
  const [isLoadingAudit, setIsLoadingAudit] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [originalNotes, setOriginalNotes] = useState('')
  const [isSavingNotes, setIsSavingNotes] = useState(false)

  const { data: merchantDetails } = useMerchantDetails(merchantId)

  const hasNotesChanged = adminNotes !== originalNotes

  const isLocationView = locationId && locationId !== 'all'

  const { data: item, isLoading } = useAdminMenuItemDetails(
    merchantId,
    open ? itemId : null,
    locationId
  )

  // Fetch modifier groups for this item
  const { data: modifierGroups, isLoading: isLoadingModifiers } = useAdminItemModifierGroups(
    merchantId,
    open ? itemId : null
  )

  // Fetch audit info when item is loaded
  useEffect(() => {
    async function fetchAuditInfo() {
      if (!item || !open) return
      setIsLoadingAudit(true)
      try {
        const info = await getMenuItemAuditInfo(merchantId, item.id)
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
  }, [item, merchantId, open])

  // Reset notes state when sheet closes
  useEffect(() => {
    if (!open) {
      setAuditInfo(null)
      setAdminNotes('')
      setOriginalNotes('')
    }
  }, [open])

  const priceSource = item?.price_source || 'base'
  const priceConfig = PRICE_LEVEL_CONFIG[priceSource]

  const handleSaveNotes = async () => {
    if (!item) return

    setIsSavingNotes(true)
    try {
      const result = await updateAdminNotes(merchantId, 'menu_item', item.id, adminNotes || null)

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
    if (!item) return

    setIsDeleting(true)
    try {
      const result = await deleteAdminMenuItem(merchantId, item.id)

      if (!result.success) {
        toast.error('Failed to delete item', { description: result.error })
        return
      }

      toast.success('Item deleted')
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

  const handleResetOverride = async () => {
    if (!item || !isLocationView || !locationId) return

    setIsResetting(true)
    try {
      const result = await deleteAdminLocationItemOverride(merchantId, locationId, item.id)

      if (!result.success) {
        toast.error('Failed to reset override', { description: result.error })
        return
      }

      toast.success('Reset to global pricing')
      onSuccess()
    } catch (error) {
      toast.error('An unexpected error occurred')
      console.error(error)
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <>
      <BottomSheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <BottomSheetContent height="95">
          <BottomSheetHeader>
            <BottomSheetTitle>Item Details</BottomSheetTitle>
            <BottomSheetDescription>
              {isLocationView
                ? 'Viewing item with location-specific pricing'
                : 'Viewing global item details'}
            </BottomSheetDescription>
          </BottomSheetHeader>

          <BottomSheetBody className="space-y-6">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : item ? (
              <>
                {/* Item Header */}
                <div className="flex gap-4">
                  <div className="h-24 w-24 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageOff className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-semibold">{item.name}</h3>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {item.effective_availability ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-0">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Available
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-0">
                          <XCircle className="h-3 w-3 mr-1" />
                          Unavailable
                        </Badge>
                      )}
                      {item.has_location_override && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-0">
                          <MapPin className="h-3 w-3 mr-1" />
                          Has Override
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* POS Preview */}
                <BottomSheetSection title="POS Preview">
                  <div className="flex justify-center p-4 bg-muted/20 rounded-xl border border-dashed">
                    <div className="max-w-[300px] w-full">
                      <ItemPreviewCard
                        name={item.name}
                        description={item.description || undefined}
                        price={item.effective_price}
                        cashPrice={item.effective_cash_price || undefined}
                        image={item.image || undefined}
                        categories={item.categories?.map((c) => c.name)}
                        allergens={item.allergens ?? []}
                        availability={item.effective_availability}
                      />
                    </div>
                  </div>
                </BottomSheetSection>

                <Separator />

                {/* Price Breakdown */}
                <BottomSheetSection title="Price Information">
                  {/* Effective Price */}
                  <div className={`rounded-lg border-2 p-4 ${priceConfig.borderColor} ${priceConfig.bgColor}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Effective Price</p>
                        <p className={`text-3xl font-bold ${priceConfig.color}`}>
                          {formatCurrency(item.effective_price)}
                        </p>
                        {item.effective_cash_price && item.effective_cash_price !== item.effective_price && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Cash: {formatCurrency(item.effective_cash_price)}
                          </p>
                        )}
                      </div>
                      <Badge className={`${priceConfig.bgColor} ${priceConfig.color} border-0`}>
                        {priceConfig.shortLabel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Source: {priceConfig.label}
                    </p>
                  </div>

                  {/* Price Cascade Visualization */}
                  <div className="space-y-2 mt-4">
                    <p className="text-sm font-medium text-muted-foreground">Price Cascade</p>
                    <div className="space-y-2">
                      {/* L1 - Base */}
                      <PriceLevelRow
                        level="L1"
                        label="Base Price"
                        price={item.base_price}
                        cashPrice={item.base_cash_price}
                        isActive={priceSource === 'base'}
                        config={PRICE_LEVEL_CONFIG.base}
                      />

                      {/* L2 - Location Override */}
                      {item.location_override && (
                        <PriceLevelRow
                          level="L2"
                          label="Location Override"
                          price={item.location_override.custom_price}
                          cashPrice={item.location_override.custom_cash_price}
                          isActive={priceSource === 'location_item'}
                          config={PRICE_LEVEL_CONFIG.location_item}
                          showArrow
                        />
                      )}

                      {/* Show placeholder for higher levels if not active */}
                      {isLocationView && !item.location_override && priceSource === 'base' && (
                        <div className="flex items-center gap-2 py-2 px-3 rounded-lg border border-dashed text-muted-foreground">
                          <ArrowRight className="h-4 w-4" />
                          <span className="text-sm">No location override set</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reset Override Button */}
                  {isLocationView && item.has_location_override && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={handleResetOverride}
                      disabled={isResetting}
                    >
                      <RotateCcw className={`h-4 w-4 mr-2 ${isResetting ? 'animate-spin' : ''}`} />
                      Reset to Global
                    </Button>
                  )}
                </BottomSheetSection>

                {/* Categories */}
                {item.categories && item.categories.length > 0 && (
                  <BottomSheetSection title="Categories">
                    <div className="flex flex-wrap gap-2">
                      {item.categories.map((cat) => (
                        <Badge
                          key={cat.id}
                          variant="outline"
                          className={cat.is_global ? 'bg-slate-50' : 'bg-blue-50 text-blue-700'}
                        >
                          {cat.is_global ? (
                            <Globe className="h-3 w-3 mr-1" />
                          ) : (
                            <MapPin className="h-3 w-3 mr-1" />
                          )}
                          {cat.name}
                        </Badge>
                      ))}
                    </div>
                  </BottomSheetSection>
                )}

                {/* Modifier Groups */}
                <BottomSheetSection title="Modifier Groups">
                  {isLoadingModifiers ? (
                    <div className="flex items-center gap-2 py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Loading modifiers...</span>
                    </div>
                  ) : modifierGroups && modifierGroups.length > 0 ? (
                    <div className="space-y-2">
                      {modifierGroups.map((group) => (
                        <Collapsible key={group.id}>
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                              <div className="flex items-center gap-2">
                                <ChevronRight className="h-4 w-4 transition-transform duration-200 [&[data-state=open]>svg]:rotate-90" />
                                <Sliders className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{group.name}</span>
                                {group.is_required && (
                                  <Badge variant="outline" className="text-xs">
                                    Required
                                  </Badge>
                                )}
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {group.items_count} option{group.items_count !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="ml-6 mt-2 space-y-1">
                              {group.items?.map((modItem) => (
                                <div
                                  key={modItem.id}
                                  className="flex justify-between text-sm p-2 bg-muted/30 rounded"
                                >
                                  <span className={!modItem.is_active ? 'text-muted-foreground line-through' : ''}>
                                    {modItem.name}
                                  </span>
                                  {modItem.price_modifier !== 0 && (
                                    <span
                                      className={
                                        modItem.price_modifier > 0
                                          ? 'text-green-600 dark:text-green-400'
                                          : 'text-red-600 dark:text-red-400'
                                      }
                                    >
                                      {modItem.price_modifier > 0 ? '+' : ''}
                                      {formatCurrency(modItem.price_modifier)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No modifier groups attached to this item.
                    </p>
                  )}
                </BottomSheetSection>

                {/* Recipe / Ingredients Section */}
                <RecipeManager
                  menuItemId={item.id}
                  menuItemName={item.name}
                  clerkOrgId={merchantDetails?.clerk_org_id}
                  merchantId={merchantId}
                  locationId={locationId}
                  isEditable={
                    !isLocationView || (!!item.location_id && item.location_id === locationId)
                  }
                />

                {/* Settings */}
                <BottomSheetSection title="Settings">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Tax Category</p>
                      <p className="font-medium capitalize">
                        {item.effective_tax_category || 'Standard'}
                      </p>
                      {item.effective_is_tax_exempt && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          Tax Exempt
                        </Badge>
                      )}
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Stock Mode</p>
                      <p className="font-medium capitalize">
                        {item.stock_tracking_mode?.replace('_', ' ') || 'No Tracking'}
                      </p>
                      {item.current_stock !== null && (
                        <p className="text-sm text-muted-foreground">
                          Stock: {item.current_stock}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Channels */}
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground mb-2">Sales Channels</p>
                    <div className="flex gap-2">
                      {(item.effective_available_channels || []).map((channel) => (
                        <Badge key={channel} variant="secondary" className="capitalize">
                          {channel === 'pos' && <Monitor className="h-3 w-3 mr-1" />}
                          {channel === 'online' && <Globe className="h-3 w-3 mr-1" />}
                          {channel === 'kiosk' && <Smartphone className="h-3 w-3 mr-1" />}
                          {channel}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </BottomSheetSection>

                {/* Quick Stats */}
                <BottomSheetSection title="Quick Stats">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg border p-3 text-center bg-muted/20">
                      <p className="text-xs text-muted-foreground mb-1">Categories</p>
                      <p className="text-lg font-bold">{item.categories?.length || 0}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center bg-muted/20">
                      <p className="text-xs text-muted-foreground mb-1">Modifiers</p>
                      <p className="text-lg font-bold">{item.modifier_groups_count || 0}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center bg-muted/20">
                      <p className="text-xs text-muted-foreground mb-1">Menus</p>
                      <p className="text-lg font-bold">{item.menu_count || 0}</p>
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
                        {item.updated_at
                          ? formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })
                          : 'Never'}
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
                        {item.created_at ? format(new Date(item.created_at), 'MMM d, yyyy') : 'Unknown'}
                      </span>
                    </div>

                    <Separator />

                    {/* Admin Notes */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="admin-notes" className="text-sm font-medium">
                          Admin Notes
                        </Label>
                      </div>
                      <Textarea
                        id="admin-notes"
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
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Item not found</p>
              </div>
            )}
          </BottomSheetBody>

          {item && (
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
              <Button onClick={() => item && onEdit(item)}>
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
              Delete Item
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{item?.name}&quot;? This will remove it from all
              categories and locations. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Item'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ============================================================================
// PRICE LEVEL ROW
// ============================================================================

interface PriceLevelRowProps {
  level: string
  label: string
  price: number | null | undefined
  cashPrice?: number | null
  isActive: boolean
  config: typeof PRICE_LEVEL_CONFIG.base
  showArrow?: boolean
}

function PriceLevelRow({
  level,
  label,
  price,
  cashPrice,
  isActive,
  config,
  showArrow,
}: PriceLevelRowProps) {
  if (price === null || price === undefined) return null

  return (
    <div
      className={`
        flex items-center justify-between py-2 px-3 rounded-lg border
        ${isActive ? `${config.bgColor} ${config.borderColor}` : 'bg-muted/30'}
      `}
    >
      <div className="flex items-center gap-2">
        {showArrow && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        <Badge
          variant="outline"
          className={isActive ? `${config.bgColor} ${config.color} border-0` : ''}
        >
          {level}
        </Badge>
        <span className={`text-sm ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
          {label}
        </span>
      </div>
      <div className="text-right">
        <span className={`font-medium ${isActive ? config.color : ''}`}>
          {formatCurrency(price)}
        </span>
        {cashPrice && cashPrice !== price && (
          <span className="text-xs text-muted-foreground ml-2">
            (Cash: {formatCurrency(cashPrice)})
          </span>
        )}
      </div>
    </div>
  )
}
