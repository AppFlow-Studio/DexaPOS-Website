'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Globe,
  MapPin,
  CheckCircle2,
  XCircle,
  Package,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Utensils,
  Save,
  RotateCcw,
  GripVertical,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CategoryItemRow } from './CategoryItemRow'

// DND Kit
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Admin hooks
import { useAdminCategories, type AdminCategory } from '@/lib/queries/use-admin-merchant'
import { adminKeys } from '@/lib/queries/admin-keys'

// Server actions
import { deleteAdminCategory, updateAdminCategoryItemsOrder, updateAdminCategoriesOrder } from '@/app/manage/actions/admin-merchant/menus'

// Sheets and Wizards
import { CategoryFormSheet } from './sheets/CategoryFormSheet'
import { CategoryDetailSheet } from './sheets/CategoryDetailSheet'
import { AddItemToCategoryWizard } from '@/components/dashboard/menu/categories/AddItemToCategoryWizard'

interface CategoriesTableProps {
  merchantId: string
  locationId?: string
  isAllLocations: boolean
  clerkOrgId: string
}

export function CategoriesTable({
  merchantId,
  locationId,
  isAllLocations,
  clerkOrgId,
}: CategoriesTableProps) {
  // State
  const [categoriesOrder, setCategoriesOrder] = useState<AdminCategory[]>([])
  const [isOrdering, setIsOrdering] = useState(false)
  const [isSavingOrder, setIsSavingOrder] = useState(false)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  
  // Sheet states
  const [categorySheetOpen, setCategorySheetOpen] = useState(false)
  const [categorySheetMode, setCategorySheetMode] = useState<'create' | 'edit'>('create')
  const [editingCategory, setEditingCategory] = useState<AdminCategory | null>(null)
  
  const [detailSheetOpen, setDetailSheetOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<AdminCategory | null>(null)
  
  const [addItemWizardOpen, setAddItemWizardOpen] = useState(false)
  const [addItemWizardCategory, setAddItemWizardCategory] = useState<AdminCategory | null>(null)
  
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState<AdminCategory | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const queryClient = useQueryClient()

  // Fetch categories
  const {
    data: categories,
    isLoading,
    refetch,
    isFetching,
  } = useAdminCategories(merchantId, locationId)

  // Sync categories to local order state
  useEffect(() => {
    if (categories) {
      setCategoriesOrder(categories)
    }
  }, [categories])

  // DND Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)

    if (over && active.id !== over.id) {
      setCategoriesOrder((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id)
        const newIndex = items.findIndex((i) => i.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
      setIsOrdering(true)
    }
  }

  const handleSaveCategoriesOrder = async () => {
    setIsSavingOrder(true)
    try {
      const orders = categoriesOrder.map((c, i) => ({
        categoryId: c.id,
        displayOrder: i + 1,
      }))

      const result = await updateAdminCategoriesOrder(merchantId, orders)
      if (!result.success) throw new Error(result.error)

      toast.success('Category order updated')
      setIsOrdering(false)
      invalidateCategories()
    } catch (err) {
      toast.error('Failed to update order')
      console.error(err)
    } finally {
      setIsSavingOrder(false)
    }
  }

  // Filter logic
  const isFiltered = search.length > 0
  const displayCategories = isFiltered
    ? (categoriesOrder ?? []).filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.description?.toLowerCase().includes(search.toLowerCase())
      )
    : categoriesOrder

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedIds(new Set(displayCategories.map((c) => c.id)))
  }

  const collapseAll = () => {
    setExpandedIds(new Set())
  }

  const invalidateCategories = () => {
    queryClient.invalidateQueries({
      queryKey: adminKeys.merchantCategories(merchantId, locationId),
    })
  }

  // Actions
  const handleCreateCategory = () => {
    setCategorySheetMode('create')
    setEditingCategory(null)
    setCategorySheetOpen(true)
  }

  const handleEditCategory = (category: AdminCategory) => {
    setCategorySheetMode('edit')
    setEditingCategory(category)
    setCategorySheetOpen(true)
  }

  const handleViewDetails = (category: AdminCategory) => {
    setSelectedCategory(category)
    setDetailSheetOpen(true)
  }

  const handleAddItem = (category: AdminCategory) => {
    setAddItemWizardCategory(category)
    setAddItemWizardOpen(true)
  }
  
  const handleDeleteCategory = async () => {
    if (!deleteCategoryConfirm) return

    setIsDeleting(true)
    try {
      const result = await deleteAdminCategory(merchantId, deleteCategoryConfirm.id)

      if (!result.success) {
        toast.error('Failed to delete category', { description: result.error })
        return
      }

      toast.success('Category deleted')
      invalidateCategories()
    } catch (error) {
      toast.error('An unexpected error occurred')
      console.error(error)
    } finally {
      setIsDeleting(false)
      setDeleteCategoryConfirm(null)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Categories</CardTitle>
              <CardDescription>
                {displayCategories.length} categories
                {!isAllLocations && ' (including location-specific)'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search categories..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-[200px]"
                />
              </div>

              {/* Expand/Collapse All */}
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={expandAll}>
                  Expand All
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAll}>
                  Collapse All
                </Button>
              </div>

              {/* Create Category */}
              <Button size="sm" onClick={handleCreateCategory}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>

              {/* Refresh */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>
            </div>
          </div>

          {/* Save Order Banner */}
          {isOrdering && !isFiltered && (
            <div className="mt-4 w-full bg-primary/5 border border-primary/20 rounded-md p-2 flex justify-between items-center animate-in fade-in slide-in-from-top-2">
              <span className="text-sm text-primary font-medium ml-2">
                Category order changed
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCategoriesOrder(categories || [])
                    setIsOrdering(false)
                  }}
                >
                  Reset
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveCategoriesOrder}
                  disabled={isSavingOrder}
                >
                  {isSavingOrder ? 'Saving...' : 'Save Order'}
                </Button>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : displayCategories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No categories found</p>
              <p className="text-sm">
                {search
                  ? 'Try adjusting your search'
                  : 'No categories have been created yet'}
              </p>
              {!search && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={handleCreateCategory}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Category
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={displayCategories.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                  disabled={isFiltered}
                >
                  {displayCategories.map((category) => (
                    <SortableCategoryRow
                      key={category.id}
                      category={category}
                      merchantId={merchantId}
                      isAllLocations={isAllLocations}
                      isExpanded={expandedIds.has(category.id)}
                      onToggle={() => toggleExpanded(category.id)}
                      onViewDetails={() => handleViewDetails(category)}
                      onEdit={() => handleEditCategory(category)}
                      onDelete={() => setDeleteCategoryConfirm(category)}
                      onUpdate={invalidateCategories}
                      onAddItem={() => handleAddItem(category)}
                      isDragEnabled={!isFiltered}
                    />
                  ))}
                </SortableContext>
                <DragOverlay>
                  {activeDragId ? (
                    <div className="opacity-80">
                      <div className="p-4 border rounded-lg bg-background shadow-lg flex items-center gap-3">
                         <GripVertical className="h-4 w-4 text-muted-foreground" />
                         <span className="font-medium">{categoriesOrder.find(c => c.id === activeDragId)?.name}</span>
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sheets & Dialogs */}
      <CategoryFormSheet
        open={categorySheetOpen}
        onClose={() => setCategorySheetOpen(false)}
        merchantId={merchantId}
        locationId={locationId || null}
        mode={categorySheetMode}
        category={editingCategory}
        onSuccess={invalidateCategories}
      />

      <CategoryDetailSheet
        open={detailSheetOpen}
        onClose={() => setDetailSheetOpen(false)}
        category={selectedCategory}
        merchantId={merchantId}
        locationId={locationId || null}
        onEdit={handleEditCategory}
        onSuccess={invalidateCategories}
      />

      {addItemWizardCategory && (
        <AddItemToCategoryWizard
          open={addItemWizardOpen}
          onOpenChange={setAddItemWizardOpen}
          categoryId={addItemWizardCategory.id}
          categoryName={addItemWizardCategory.name}
          clerkOrgId={clerkOrgId}
          merchantId={merchantId}
          locationId={locationId || null}
          isAllLocations={isAllLocations}
          existingItemIds={(addItemWizardCategory.items || [])
            .map((i: any) => i.menu_item_id || i.menu_item?.id || i.id)
            .filter((id: any): id is string => typeof id === 'string')}
          onSuccess={invalidateCategories}
        />
      )}

      <AlertDialog
        open={!!deleteCategoryConfirm}
        onOpenChange={() => setDeleteCategoryConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              category "{deleteCategoryConfirm?.name}" and remove its associations.
              Items inside it will remain in the library but will be unassigned from this category.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDeleteCategory()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Category'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ----------------------------------------------------------------------------
// Sortable Wrapper
// ----------------------------------------------------------------------------
function SortableCategoryRow({
  isDragEnabled,
  ...props
}: CategoryRowProps & { isDragEnabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.category.id, disabled: !isDragEnabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: 'relative' as const,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <CategoryRow
        {...props}
        dragHandleProps={isDragEnabled ? { ...attributes, ...listeners } : undefined}
      />
    </div>
  )
}

// ----------------------------------------------------------------------------
// Category Row Component
// ----------------------------------------------------------------------------

interface CategoryRowProps {
  merchantId: string
  category: AdminCategory
  isAllLocations: boolean
  isExpanded: boolean
  onToggle: () => void
  onViewDetails: () => void
  onEdit: () => void
  onDelete: () => void
  onUpdate: () => void
  onAddItem: () => void
  dragHandleProps?: any
}

function CategoryRow({
  merchantId,
  category,
  isAllLocations,
  isExpanded,
  onToggle,
  onViewDetails,
  onEdit,
  onDelete,
  onUpdate,
  onAddItem,
  dragHandleProps,
}: CategoryRowProps) {
  // We'll reimplement Item DND here or use existing
  // For simplicity, let's keep it simple first
  const itemCount = category.items ? category.items.length : category.items_count

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={onToggle}
      className="border rounded-lg bg-card"
    >
      <div className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors group">
         {/* Drag Handle */}
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            className="cursor-grab text-muted-foreground/30 hover:text-foreground mr-1"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
               // Prevent collapsible toggle when clicking handle
               // e.stopPropagation() is handled by parent div logic usually?
            }}
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}

        {/* Expand/Collapse Trigger Icon */}
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="sr-only">Toggle</span>
          </Button>
        </CollapsibleTrigger>

        {/* Category Info */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">{category.name}</span>
              {!category.is_active && (
                <Badge variant="secondary" className="text-xs">
                  Inactive
                </Badge>
              )}
              {category.is_global && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Globe className="h-3 w-3" />
                  Global
                </Badge>
              )}
              {category.location_name && (
                <Badge variant="outline" className="text-xs gap-1">
                  <MapPin className="h-3 w-3" />
                  {category.location_name}
                </Badge>
              )}
            </div>
            {category.description && (
              <p className="text-sm text-muted-foreground truncate">
                {category.description}
              </p>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Package className="h-4 w-4" />
              {itemCount} items
            </div>
          </div>

          <div className="flex justify-end items-center gap-1">
             {/* Read-only view doesn't have edit buttons if we wanted, but this is Admin */}
            <Button variant="ghost" size="sm" onClick={onAddItem}>
                <Plus className="h-4 w-4 mr-1"/> Item
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onViewDetails}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Category
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <CollapsibleContent>
        {isExpanded && (
          <div className="p-4 pt-0 border-t bg-muted/20">
             {/* We can show items here. For step 1254, we integrated AddItem wizard. 
                 The CategoryItemRow list should be here. 
                 Note: nested DND might be complex. For now just render items list. 
              */}
              {(category.items && category.items.length > 0) ? (
                 <div className="space-y-1 mt-2">
                    {category.items.map((item: any, index: number) => (
                       <CategoryItemRow 
                          key={item.id || item.menu_item_id} 
                          item={item} 
                          index={index}
                          onEdit={() => {}}
                          onRemove={() => {}}
                       />
                    ))}
                 </div>
              ) : (
                  <div className="py-6 text-center text-muted-foreground">
                      <Utensils className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No items in this category</p>
                      <Button variant="link" size="sm" onClick={onAddItem} className="mt-1">
                          Add Items
                      </Button>
                  </div>
              )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
