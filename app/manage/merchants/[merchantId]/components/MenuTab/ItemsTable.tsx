'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  CheckCircle2,
  XCircle,
  Filter,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// Admin hooks
import {
  useAdminMenuItems,
  useAdminCategories,
  type AdminMenuItem,
  type PriceSource,
} from '@/lib/queries/use-admin-merchant'
import { adminKeys } from '@/lib/queries/admin-keys'

// Server actions
import { deleteAdminMenuItem } from '@/app/manage/actions/admin-merchant/menus'

// Form Sheets
import { ItemFormSheet } from './sheets/ItemFormSheet'
import { ItemDetailSheet } from './sheets/ItemDetailSheet'

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

const PRICE_SOURCE_CONFIG: Record<
  PriceSource,
  { label: string; shortLabel: string; className: string }
> = {
  base: {
    label: 'Base Price',
    shortLabel: 'L1',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  location_item: {
    label: 'Location Override',
    shortLabel: 'L2',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  },
  category: {
    label: 'Category Price',
    shortLabel: 'L3',
    className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  },
  location_category: {
    label: 'Location + Category',
    shortLabel: 'L4',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  },
  location_menu: {
    label: 'Location + Menu',
    shortLabel: 'L5',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  },
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ItemsTableProps {
  merchantId: string
  locationId: string | null
  isAllLocations: boolean
}

export function ItemsTable({ merchantId, locationId, isAllLocations }: ItemsTableProps) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Sheet states
  const [itemSheetOpen, setItemSheetOpen] = useState(false)
  const [itemSheetMode, setItemSheetMode] = useState<'create' | 'edit'>('create')
  const [editingItem, setEditingItem] = useState<AdminMenuItem | null>(null)
  const [itemDetailOpen, setItemDetailOpen] = useState(false)
  const [viewingItemId, setViewingItemId] = useState<string | null>(null)
  const [deleteItemConfirm, setDeleteItemConfirm] = useState<AdminMenuItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const queryClient = useQueryClient()

  // Fetch items
  const {
    data: itemsData,
    isLoading,
    refetch,
    isFetching,
  } = useAdminMenuItems(merchantId, locationId, {
    search: search || undefined,
    categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
    page,
    pageSize,
  })

  // Fetch categories for filter
  const { data: categories } = useAdminCategories(merchantId, locationId)

  const items = itemsData?.items ?? []
  const total = itemsData?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const invalidateItems = () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenuItems(merchantId, locationId) })
    queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenus(merchantId, locationId) })
    queryClient.invalidateQueries({ queryKey: adminKeys.merchantCategories(merchantId, locationId) })
  }

  // Item actions
  const handleCreateItem = () => {
    setItemSheetMode('create')
    setEditingItem(null)
    setItemSheetOpen(true)
  }

  const handleEditItem = (item: AdminMenuItem) => {
    setItemSheetMode('edit')
    setEditingItem(item)
    setItemSheetOpen(true)
  }

  const handleViewItem = (itemId: string) => {
    setViewingItemId(itemId)
    setItemDetailOpen(true)
  }

  const handleDeleteItem = async () => {
    if (!deleteItemConfirm) return

    setIsDeleting(true)
    try {
      const result = await deleteAdminMenuItem(merchantId, deleteItemConfirm.id)

      if (!result.success) {
        toast.error('Failed to delete item', { description: result.error })
        return
      }

      toast.success('Item deleted')
      invalidateItems()
    } catch (error) {
      toast.error('An unexpected error occurred')
      console.error(error)
    } finally {
      setIsDeleting(false)
      setDeleteItemConfirm(null)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Menu Items</CardTitle>
              <CardDescription>
                {total} items {!isAllLocations && '(with effective prices)'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  className="pl-9 w-[200px]"
                />
              </div>

              {/* Category Filter */}
              {categories && categories.length > 0 && (
                <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1) }}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                        {!cat.is_global && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Local
                          </Badge>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Create Item */}
              <Button size="sm" onClick={handleCreateItem}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>

              {/* Refresh */}
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ImageOff className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No items found</p>
              <p className="text-sm">
                {search || categoryFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'No menu items have been created yet'}
              </p>
              {!search && categoryFilter === 'all' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={handleCreateItem}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Item
                </Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Base Price</TableHead>
                    {!isAllLocations && <TableHead>Effective Price</TableHead>}
                    <TableHead>Categories</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      isAllLocations={isAllLocations}
                      onView={() => handleViewItem(item.id)}
                      onEdit={() => handleEditItem(item)}
                      onDelete={() => setDeleteItemConfirm(item)}
                    />
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} of {total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Item Form Sheet */}
      <ItemFormSheet
        open={itemSheetOpen}
        onClose={() => setItemSheetOpen(false)}
        merchantId={merchantId}
        locationId={locationId}
        mode={itemSheetMode}
        item={editingItem}
        onSuccess={invalidateItems}
      />

      {/* Item Detail Sheet */}
      <ItemDetailSheet
        open={itemDetailOpen}
        onClose={() => setItemDetailOpen(false)}
        merchantId={merchantId}
        locationId={locationId}
        itemId={viewingItemId}
        onEdit={(item) => {
          setItemDetailOpen(false)
          handleEditItem(item)
        }}
        onSuccess={invalidateItems}
      />

      {/* Delete Item Confirmation */}
      <AlertDialog open={!!deleteItemConfirm} onOpenChange={() => setDeleteItemConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Item
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteItemConfirm?.name}&quot;?
              This will remove the item from all categories and menus.
              {deleteItemConfirm?.categories && deleteItemConfirm.categories.length > 0 && (
                <span className="block mt-2 font-medium text-amber-600">
                  Warning: This item is in {deleteItemConfirm.categories.length} category(ies).
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteItem}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ============================================================================
// ITEM ROW COMPONENT
// ============================================================================

interface ItemRowProps {
  item: AdminMenuItem
  isAllLocations: boolean
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}

function ItemRow({ item, isAllLocations, onView, onEdit, onDelete }: ItemRowProps) {
  const priceSource = (item.price_source || 'base') as PriceSource
  const sourceConfig = PRICE_SOURCE_CONFIG[priceSource] || PRICE_SOURCE_CONFIG.base
  const hasOverride = item.effective_price !== item.base_price

  return (
    <TableRow className="hover:bg-muted/30">
      {/* Image */}
      <TableCell>
        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center overflow-hidden">
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageOff className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </TableCell>

      {/* Name & Description */}
      <TableCell>
        <div className="space-y-1">
          <p className="font-medium">{item.name}</p>
          {item.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {item.description}
            </p>
          )}
        </div>
      </TableCell>

      {/* Base Price (L1) */}
      <TableCell>
        <div className="space-y-1">
          <span className={hasOverride && !isAllLocations ? 'text-muted-foreground line-through' : 'font-medium'}>
            {formatCurrency(item.base_price)}
          </span>
          {item.base_cash_price && item.base_cash_price !== item.base_price && (
            <p className="text-xs text-muted-foreground">
              Cash: {formatCurrency(item.base_cash_price)}
            </p>
          )}
        </div>
      </TableCell>

      {/* Effective Price (when location selected) */}
      {!isAllLocations && (
        <TableCell>
          <div className="space-y-1">
            <span className="font-medium">{formatCurrency(item.effective_price)}</span>
            {item.effective_cash_price && item.effective_cash_price !== item.effective_price && (
              <p className="text-xs text-muted-foreground">
                Cash: {formatCurrency(item.effective_cash_price)}
              </p>
            )}
            {/* Price Source Badge */}
            <div>
              <Badge variant="outline" className={`text-xs border-0 ${sourceConfig.className}`}>
                {sourceConfig.shortLabel}
              </Badge>
            </div>
          </div>
        </TableCell>
      )}

      {/* Categories */}
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {item.categories.slice(0, 2).map((cat) => (
            <Badge
              key={cat.id}
              variant="outline"
              className={`text-xs ${
                cat.is_global
                  ? 'bg-slate-50 dark:bg-slate-900'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
              }`}
            >
              {cat.name}
            </Badge>
          ))}
          {item.categories.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{item.categories.length - 2}
            </Badge>
          )}
          {item.categories.length === 0 && (
            <span className="text-xs text-muted-foreground">No categories</span>
          )}
        </div>
      </TableCell>

      {/* Availability Status */}
      <TableCell>
        <div className="flex items-center gap-2">
          {item.effective_availability ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300 border-0">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Available
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300 border-0">
              <XCircle className="h-3 w-3 mr-1" />
              Unavailable
            </Badge>
          )}
          {item.has_location_override && !isAllLocations && (
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 dark:bg-blue-900 dark:text-blue-300 border-0">
              Override
            </Badge>
          )}
        </div>
      </TableCell>

      {/* Actions */}
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onView}
            title="View Details"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Item
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Item
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}
