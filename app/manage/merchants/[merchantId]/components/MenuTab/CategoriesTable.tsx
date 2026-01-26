'use client'

import { useState } from 'react'
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
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// Admin hooks
import { useAdminCategories, type AdminCategory } from '@/lib/queries/use-admin-merchant'
import { adminKeys } from '@/lib/queries/admin-keys'

// Server actions
import { deleteAdminCategory } from '@/app/manage/actions/admin-merchant/menus'

// Form Sheets
import { CategoryFormSheet } from './sheets/CategoryFormSheet'
import { CategoryDetailSheet } from './sheets/CategoryDetailSheet'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface CategoriesTableProps {
  merchantId: string
  locationId: string | null
  isAllLocations: boolean
}

export function CategoriesTable({
  merchantId,
  locationId,
  isAllLocations,
}: CategoriesTableProps) {
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Sheet states
  const [categorySheetOpen, setCategorySheetOpen] = useState(false)
  const [categorySheetMode, setCategorySheetMode] = useState<'create' | 'edit'>('create')
  const [editingCategory, setEditingCategory] = useState<AdminCategory | null>(null)
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState<AdminCategory | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Detail sheet state
  const [detailSheetOpen, setDetailSheetOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<AdminCategory | null>(null)

  const queryClient = useQueryClient()

  // Fetch categories
  const {
    data: categories,
    isLoading,
    refetch,
    isFetching,
  } = useAdminCategories(merchantId, locationId)
 console.log(categories)
  // Filter categories by search
  const filteredCategories = (categories ?? []).filter(
    (cat) =>
      cat.name.toLowerCase().includes(search.toLowerCase()) ||
      cat.description?.toLowerCase().includes(search.toLowerCase())
  )

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
    setExpandedIds(new Set(filteredCategories.map((c) => c.id)))
  }

  const collapseAll = () => {
    setExpandedIds(new Set())
  }

  const invalidateCategories = () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.merchantCategories(merchantId, locationId) })
    queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenus(merchantId, locationId) })
  }

  // Category actions
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

  const handleEditFromDetail = (category: AdminCategory) => {
    setDetailSheetOpen(false)
    setSelectedCategory(null)
    handleEditCategory(category)
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
                {filteredCategories.length} categories
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
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No categories found</p>
              <p className="text-sm">
                {search ? 'Try adjusting your search' : 'No categories have been created yet'}
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
              {filteredCategories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  isAllLocations={isAllLocations}
                  isExpanded={expandedIds.has(category.id)}
                  onToggle={() => toggleExpanded(category.id)}
                  onViewDetails={() => handleViewDetails(category)}
                  onEdit={() => handleEditCategory(category)}
                  onDelete={() => setDeleteCategoryConfirm(category)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Form Sheet */}
      <CategoryFormSheet
        open={categorySheetOpen}
        onClose={() => setCategorySheetOpen(false)}
        merchantId={merchantId}
        locationId={locationId}
        mode={categorySheetMode}
        category={editingCategory}
        onSuccess={invalidateCategories}
      />

      {/* Category Detail Sheet */}
      <CategoryDetailSheet
        open={detailSheetOpen}
        onClose={() => {
          setDetailSheetOpen(false)
          setSelectedCategory(null)
        }}
        merchantId={merchantId}
        locationId={locationId}
        category={selectedCategory}
        onEdit={handleEditFromDetail}
        onSuccess={invalidateCategories}
      />

      {/* Delete Category Confirmation */}
      <AlertDialog open={!!deleteCategoryConfirm} onOpenChange={() => setDeleteCategoryConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Category
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteCategoryConfirm?.name}&quot;?
              This will remove the category and all item associations.
              {deleteCategoryConfirm?.items_count && deleteCategoryConfirm.items_count > 0 && (
                <span className="block mt-2 font-medium text-amber-600">
                  Warning: This category has {deleteCategoryConfirm.items_count} item(s) associated with it.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteCategory}
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
// CATEGORY ROW COMPONENT
// ============================================================================

interface CategoryRowProps {
  category: AdminCategory
  isAllLocations: boolean
  isExpanded: boolean
  onToggle: () => void
  onViewDetails: () => void
  onEdit: () => void
  onDelete: () => void
}

function CategoryRow({
  category,
  isAllLocations,
  isExpanded,
  onToggle,
  onViewDetails,
  onEdit,
  onDelete,
}: CategoryRowProps) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className="border rounded-lg">
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50 transition-colors">
            {/* Expand Icon */}
            <div className="text-muted-foreground">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>

            {/* Image */}
            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
              {category.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={category.image}
                  alt={category.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            {/* Name & Description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{category.name}</p>
                {category.is_global ? (
                  <Badge variant="outline" className="text-xs bg-slate-50 dark:bg-slate-900">
                    <Globe className="h-3 w-3 mr-1" />
                    Global
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    <MapPin className="h-3 w-3 mr-1" />
                    {category.location_name || 'Location'}
                  </Badge>
                )}
              </div>
              {category.description && (
                <p className="text-xs text-muted-foreground truncate">{category.description}</p>
              )}
            </div>

            {/* Items Count */}
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                <Package className="h-3 w-3 mr-1" />
                {category.items_count} items
              </Badge>
            </div>

            {/* Status */}
            <div>
              {category.is_active ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300 border-0">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300 border-0">
                  <XCircle className="h-3 w-3 mr-1" />
                  Inactive
                </Badge>
              )}
            </div>

            {/* Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewDetails(); }}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Category
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Category
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 py-3 bg-muted/30">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                <span className="font-medium">Display Order:</span> {category.display_order || 'Not set'}
              </p>
              <p>
                <span className="font-medium">Created:</span>{' '}
                {new Date(category.created_at).toLocaleDateString()}
              </p>
              {!isAllLocations && category.is_global && (
                <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                  This is a global category. Editing will create a location-specific override.
                </p>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
