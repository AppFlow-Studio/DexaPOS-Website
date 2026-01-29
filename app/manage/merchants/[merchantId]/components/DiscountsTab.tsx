'use client'

import { useMemo, useState } from 'react'
import { Banknote, Plus, ArrowLeft, Eye, Pencil, Trash2, Tag } from 'lucide-react'
import { DiscountFilters } from '@/components/discounts/discount-filters'
import { DiscountTable } from '@/components/discounts/discount-table'
import {
  useAdminDiscounts,
  useAdminCreateDiscount,
  useAdminUpdateDiscount,
  useAdminToggleDiscount,
  useAdminDeleteDiscount,
  useAdminBulkStatusUpdate,
  useAdminBulkDelete,
  useAdminDiscountCategories,
  useAdminDiscountMenuItems,
  useAdminDiscount,
  useAdminDiscountUsage,
} from '@/lib/queries/use-admin-discounts'
import {
  listCategoriesForMerchant,
  listMenuItemsForMerchant,
} from '@/app/dashboard/actions/discounts'
import { Discount, DiscountFormInput, DiscountListFilters } from '@/types/discount'
import { CategoryOption } from '@/components/discounts/category-picker'
import { MenuItemOption } from '@/components/discounts/menu-item-picker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { DiscountForm } from '@/components/discounts/discount-form'
import { DiscountCard } from '@/components/discounts/discount-card'
import { Badge } from '@/components/ui/badge'
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
import { toast } from 'sonner'

interface DiscountsTabProps {
  merchantId: string
}

export function DiscountsTab({ merchantId }: DiscountsTabProps) {
  const [filters, setFilters] = useState<DiscountListFilters>({
    search: '',
    isActive: 'all',
    sortBy: 'display_order',
    sortDir: 'asc',
  })

  // State for sheets/dialogs
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null)
  const [viewingDiscountId, setViewingDiscountId] = useState<string | null>(null)
  const [deletingDiscountId, setDeletingDiscountId] = useState<string | null>(null)

  // Queries
  const { data, isLoading } = useAdminDiscounts(merchantId, filters)
  const { data: categoryData } = useAdminDiscountCategories(merchantId)
  const { data: menuItemData } = useAdminDiscountMenuItems(merchantId)
  
  // Mutations
  const createMutation = useAdminCreateDiscount(merchantId)
  const toggleMutation = useAdminToggleDiscount(merchantId)
  const bulkStatusMutation = useAdminBulkStatusUpdate(merchantId)
  const bulkDeleteMutation = useAdminBulkDelete(merchantId)
  const deleteMutation = useAdminDeleteDiscount(merchantId)

  const discounts = useMemo(
    () => (data?.success && Array.isArray(data.data) ? data.data : []),
    [data?.data, data?.success]
  )

  const categories: CategoryOption[] = useMemo(
    () => (categoryData?.success && categoryData.data ? categoryData.data : []),
    [categoryData]
  )
  const menuItems: MenuItemOption[] = useMemo(
    () => (menuItemData?.success && menuItemData.data ? menuItemData.data : []),
    [menuItemData]
  )

  const handleCreate = async (values: any) => {
    const result = await createMutation.mutateAsync(values)
    if (result.success) {
      setIsCreateSheetOpen(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingDiscountId) return
    const result = await deleteMutation.mutateAsync({ id: deletingDiscountId, mode: 'hard' })
    if (result.success) {
      setDeletingDiscountId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Tag className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Discounts</h2>
            <p className="text-sm text-muted-foreground">
              Manage POS discounts and promotional offers for this merchant.
            </p>
          </div>
        </div>
        <Button onClick={() => setIsCreateSheetOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Discount
        </Button>
      </div>

      <Card className="border-none shadow-sm bg-muted/30">
        <CardContent className="p-4">
          <DiscountFilters value={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      <DiscountTable
        discounts={discounts}
        isLoading={isLoading}
        onToggleStatus={(id, isActive) => toggleMutation.mutate({ id, isActive })}
        onBulkStatus={(ids, isActive) => bulkStatusMutation.mutate({ ids, isActive })}
        onBulkDelete={(ids) => bulkDeleteMutation.mutate({ ids })}
        onDelete={(id) => setDeletingDiscountId(id)}
        onView={(id) => setViewingDiscountId(id)}
        onEdit={(id) => setEditingDiscountId(id)}
      />

      {/* Create Sheet */}
      <Sheet open={isCreateSheetOpen} onOpenChange={setIsCreateSheetOpen}>
        <SheetContent className="sm:max-w-[700px] overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Create Discount</SheetTitle>
            <SheetDescription>
              Set up a new discount for this merchant's point of sale.
            </SheetDescription>
          </SheetHeader>
          <DiscountForm
            onSubmit={handleCreate}
            submitting={createMutation.isPending}
            categories={categories}
            menuItems={menuItems}
            onCancel={() => setIsCreateSheetOpen(false)}
            submitLabel="Create Discount"
          />
        </SheetContent>
      </Sheet>

      {/* Edit Component Wrapper */}
      {editingDiscountId && (
        <EditDiscountSheet
          merchantId={merchantId}
          discountId={editingDiscountId}
          onClose={() => setEditingDiscountId(null)}
          categories={categories}
          menuItems={menuItems}
        />
      )}

      {/* View Component Wrapper */}
      {viewingDiscountId && (
        <ViewDiscountSheet
          merchantId={merchantId}
          discountId={viewingDiscountId}
          onClose={() => setViewingDiscountId(null)}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingDiscountId} onOpenChange={(open) => !open && setDeletingDiscountId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the discount from all locations.
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

// ----------------------------------------------------------------------------
// Helper Components for Edit/View to handle their own data fetching
// ----------------------------------------------------------------------------

function EditDiscountSheet({
  merchantId,
  discountId,
  onClose,
  categories,
  menuItems,
}: {
  merchantId: string
  discountId: string
  onClose: () => void
  categories: CategoryOption[]
  menuItems: MenuItemOption[]
}) {
  const { data, isLoading } = useAdminDiscount(merchantId, discountId)
  const updateMutation = useAdminUpdateDiscount(merchantId, discountId)

  const discount = data?.success ? data.data : null

  const handleUpdate = async (values: any) => {
    const result = await updateMutation.mutateAsync(values)
    if (result.success) {
      onClose()
    }
  }

  return (
    <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-[700px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Edit Discount</SheetTitle>
          <SheetDescription>Update the configuration for this discount.</SheetDescription>
        </SheetHeader>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : discount ? (
          <DiscountForm
            defaultValues={discount as any}
            onSubmit={handleUpdate}
            submitting={updateMutation.isPending}
            categories={categories}
            menuItems={menuItems}
            onCancel={onClose}
            submitLabel="Update Discount"
          />
        ) : (
          <div className="py-8 text-center text-muted-foreground">Discount not found.</div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function ViewDiscountSheet({
  merchantId,
  discountId,
  onClose,
}: {
  merchantId: string
  discountId: string
  onClose: () => void
}) {
  const { data, isLoading } = useAdminDiscount(merchantId, discountId)
  const { data: usageData, isLoading: usageLoading } = useAdminDiscountUsage(merchantId, discountId)

  const discount = data?.success ? data.data : null
  const usageCount = usageData?.success ? usageData.data?.usage_count ?? 0 : 0

  return (
    <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-[600px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Discount Details</SheetTitle>
          <SheetDescription>View configuration and usage statistics.</SheetDescription>
        </SheetHeader>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : discount ? (
          <div className="space-y-6">
            <DiscountCard discount={discount as Discount} />
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Usage Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Redemption Count</span>
                  {usageLoading ? (
                    <Skeleton className="h-6 w-12" />
                  ) : (
                    <Badge variant="secondary" className="text-lg px-3 py-1">
                      {usageCount}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
               <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Constraints</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Min Purchase</span>
                    <span className="font-medium">{discount.min_purchase_amount ? `$${discount.min_purchase_amount}` : 'None'}</span>
                  </div>
                   <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Max Uses/Order</span>
                    <span className="font-medium">{discount.max_uses_per_order}</span>
                  </div>
                </CardContent>
               </Card>

               <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Targeting</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Scope</span>
                    <span className="font-medium capitalize">{discount.scope.replace('_', ' ')}</span>
                  </div>
                   <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Categories</span>
                    <span className="font-medium">{discount.applies_to_categories?.length ?? 0}</span>
                  </div>
                </CardContent>
               </Card>
            </div>

            <Button variant="outline" className="w-full" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">Discount not found.</div>
        )}
      </SheetContent>
    </Sheet>
  )
}
