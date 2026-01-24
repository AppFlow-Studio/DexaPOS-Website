'use client'

import { useState } from 'react'
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
} from 'lucide-react'
import { toast } from 'sonner'

import {
  useAdminMenuItemDetails,
  type AdminMenuItem,
} from '@/lib/queries/use-admin-merchant'
import {
  deleteAdminMenuItem,
  deleteAdminLocationItemOverride,
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

  const isLocationView = locationId && locationId !== 'all'

  const { data: item, isLoading } = useAdminMenuItemDetails(
    merchantId,
    open ? itemId : null,
    locationId
  )

  const priceSource = item?.price_source || 'base'
  const priceConfig = PRICE_LEVEL_CONFIG[priceSource]

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

                {/* Metadata */}
                <BottomSheetSection title="Metadata">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Created</p>
                      <p className="font-medium">
                        {new Date(item.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last Updated</p>
                      <p className="font-medium">
                        {new Date(item.updated_at).toLocaleDateString()}
                      </p>
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
