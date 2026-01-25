'use client'

import { useState } from 'react'
import Link from 'next/link'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
  ChevronDown,
  ChevronRight,
  UtensilsCrossed,
  FolderOpen,
  Globe,
  MapPin,
  ImageOff,
  CheckCircle2,
  XCircle,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Package,
  FolderTree,
  Eye,
  Calendar,
  Clock,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// Admin hooks
import {
  useAdminMenus,
  useAdminMenuWithCategories,
  type AdminMenu,
  type AdminMenuWithCategories,
  type AdminMenuItem,
  type AdminCategory,
} from '@/lib/queries/use-admin-merchant'
import { adminKeys } from '@/lib/queries/admin-keys'

// Server actions
import {
  deleteAdminMenu,
  toggleAdminMenuActive,
  removeCategoryFromMenu,
  removeItemFromCategory,
} from '@/app/manage/actions/admin-merchant/menus'

// Form Sheets
import { MenuFormSheet } from './sheets/MenuFormSheet'
import { CategoryFormSheet } from './sheets/CategoryFormSheet'
import { ItemFormSheet } from './sheets/ItemFormSheet'
import { ItemDetailSheet } from './sheets/ItemDetailSheet'
import { MenuSchedulesSheet } from './sheets/MenuSchedulesSheet'
import { MenuDetailSheet } from './sheets/MenuDetailSheet'

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
// MAIN COMPONENT
// ============================================================================

interface MenusTableProps {
  merchantId: string
  locationId: string | null
  isAllLocations: boolean
}

export function MenusTable({
  merchantId,
  locationId,
  isAllLocations,
}: MenusTableProps) {
  const [search, setSearch] = useState('')
  const [expandedMenuIds, setExpandedMenuIds] = useState<Set<string>>(new Set())

  // Sheet states
  const [menuSheetOpen, setMenuSheetOpen] = useState(false)
  const [menuSheetMode, setMenuSheetMode] = useState<'create' | 'edit'>('create')
  const [editingMenu, setEditingMenu] = useState<AdminMenu | null>(null)
  const [deleteMenuConfirm, setDeleteMenuConfirm] = useState<AdminMenu | null>(null)

  const [categorySheetOpen, setCategorySheetOpen] = useState(false)
  const [categorySheetMode, setCategorySheetMode] = useState<'create' | 'edit'>('create')
  const [editingCategory, setEditingCategory] = useState<AdminCategory | null>(null)
  const [categoryMenuId, setCategoryMenuId] = useState<string | null>(null)
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState<{ category: AdminCategory; menuId: string } | null>(null)

  const [itemSheetOpen, setItemSheetOpen] = useState(false)
  const [itemSheetMode, setItemSheetMode] = useState<'create' | 'edit'>('create')
  const [editingItem, setEditingItem] = useState<AdminMenuItem | null>(null)
  const [itemCategoryId, setItemCategoryId] = useState<string | null>(null)

  const [itemDetailOpen, setItemDetailOpen] = useState(false)
  const [viewingItemId, setViewingItemId] = useState<string | null>(null)
  const [deleteItemConfirm, setDeleteItemConfirm] = useState<{ itemId: string; categoryId: string } | null>(null)

  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false)
  const [selectedMenuForSchedules, setSelectedMenuForSchedules] = useState<{id: string; name: string} | null>(null)

  // Menu detail sheet state
  const [menuDetailOpen, setMenuDetailOpen] = useState(false)
  const [selectedMenuForDetails, setSelectedMenuForDetails] = useState<AdminMenu | null>(null)

  const queryClient = useQueryClient()

  // Fetch menus
  const {
    data: menus,
    isLoading,
    refetch,
    isFetching,
  } = useAdminMenus(merchantId, locationId)

  // Filter by search
  const filteredMenus = (menus ?? []).filter(
    (menu) =>
      menu.name.toLowerCase().includes(search.toLowerCase()) ||
      menu.description?.toLowerCase().includes(search.toLowerCase())
  )

  const toggleMenuExpanded = (id: string) => {
    setExpandedMenuIds((prev) => {
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
    setExpandedMenuIds(new Set(filteredMenus.map((m) => m.id)))
  }

  const collapseAll = () => {
    setExpandedMenuIds(new Set())
  }

  const invalidateMenus = () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenus(merchantId, locationId) })
    queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenuStats(merchantId, locationId) })
  }

  const invalidateAll = () => {
    invalidateMenus()
    queryClient.invalidateQueries({ queryKey: adminKeys.merchantCategories(merchantId, locationId) })
    queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenuItems(merchantId, locationId) })
  }

  // Menu actions
  const handleCreateMenu = () => {
    setMenuSheetMode('create')
    setEditingMenu(null)
    setMenuSheetOpen(true)
  }

  const handleEditMenu = (menu: AdminMenu) => {
    setMenuSheetMode('edit')
    setEditingMenu(menu)
    setMenuSheetOpen(true)
  }

  const handleToggleActive = async (menu: AdminMenu) => {
    const result = await toggleAdminMenuActive(merchantId, menu.id)
    if (result.error) {
      toast.error('Failed to update menu', { description: result.error })
    } else {
      toast.success(result.data?.is_active ? 'Menu activated' : 'Menu deactivated')
      invalidateMenus()
    }
  }

  const handleDeleteMenu = async (menu: AdminMenu) => {
    const result = await deleteAdminMenu(merchantId, menu.id)
    if (result.error) {
      toast.error('Failed to delete menu', { description: result.error })
    } else {
      toast.success('Menu deleted')
      invalidateMenus()
      setDeleteMenuConfirm(null)
    }
  }

  // Category actions
  const handleAddCategory = (menuId: string) => {
    setCategorySheetMode('create')
    setEditingCategory(null)
    setCategoryMenuId(menuId)
    setCategorySheetOpen(true)
  }

  const handleEditCategory = (category: AdminCategory, menuId: string) => {
    setCategorySheetMode('edit')
    setEditingCategory(category)
    setCategoryMenuId(menuId)
    setCategorySheetOpen(true)
  }

  const handleDeleteCategory = async () => {
    if (!deleteCategoryConfirm) return

    // First remove from menu, then optionally delete the category itself
    const result = await removeCategoryFromMenu(
      merchantId,
      deleteCategoryConfirm.menuId,
      deleteCategoryConfirm.category.id
    )

    if (result.error) {
      toast.error('Failed to remove category', { description: result.error })
    } else {
      toast.success('Category removed from menu')
      invalidateAll()
    }
    setDeleteCategoryConfirm(null)
  }

  // Item actions
  const handleAddItem = (categoryId: string) => {
    setItemSheetMode('create')
    setEditingItem(null)
    setItemCategoryId(categoryId)
    setItemSheetOpen(true)
  }

  const handleEditItem = (item: AdminMenuItem, categoryId: string) => {
    setItemSheetMode('edit')
    setEditingItem(item)
    setItemCategoryId(categoryId)
    setItemSheetOpen(true)
  }

  const handleViewItem = (itemId: string) => {
    setViewingItemId(itemId)
    setItemDetailOpen(true)
  }

  const handleDeleteItem = async () => {
    if (!deleteItemConfirm) return

    // Remove from category
    const result = await removeItemFromCategory(
      merchantId,
      deleteItemConfirm.categoryId,
      deleteItemConfirm.itemId
    )

    if (result.error) {
      toast.error('Failed to remove item', { description: result.error })
    } else {
      toast.success('Item removed from category')
      invalidateAll()
    }
    setDeleteItemConfirm(null)
  }

  const handleManageSchedules = (menu: AdminMenu) => {
    setSelectedMenuForSchedules({ id: menu.id, name: menu.name })
    setScheduleSheetOpen(true)
  }

  const handleViewMenuDetails = (menu: AdminMenu) => {
    setSelectedMenuForDetails(menu)
    setMenuDetailOpen(true)
  }

  const handleEditFromDetail = (menu: AdminMenu | AdminMenuWithCategories) => {
    setMenuDetailOpen(false)
    setSelectedMenuForDetails(null)
    // Convert AdminMenuWithCategories to AdminMenu if needed
    const adminMenu: AdminMenu = {
      id: menu.id,
      name: menu.name,
      description: menu.description,
      is_active: menu.is_active,
      is_global: menu.is_global,
      location_id: menu.location_id,
      location_name: menu.location_name,
      categories_count: menu.categories_count,
      items_count: menu.items_count,
      schedules_count: menu.schedules_count,
      created_at: menu.created_at,
      updated_at: menu.updated_at,
    }
    handleEditMenu(adminMenu)
  }

  const invalidateSchedules = () => {
    if (selectedMenuForSchedules) {
      queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenuSchedules(merchantId, selectedMenuForSchedules.id) })
    }
    queryClient.invalidateQueries({ queryKey: adminKeys.merchantSchedules(merchantId, locationId) })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Menus</CardTitle>
              <CardDescription>
                {filteredMenus.length} menus
                {!isAllLocations && ' (including location-specific)'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search menus..."
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

              {/* Create Menu */}
              <Button size="sm" onClick={handleCreateMenu}>
                <Plus className="h-4 w-4 mr-2" />
                Add Menu
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
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredMenus.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UtensilsCrossed className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No menus found</p>
              <p className="text-sm">
                {search
                  ? 'Try adjusting your search'
                  : 'Create your first menu to get started'}
              </p>
              {!search && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={handleCreateMenu}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Menu
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMenus.map((menu) => (
                <MenuRow
                  key={menu.id}
                  menu={menu}
                  merchantId={merchantId}
                  locationId={locationId}
                  isExpanded={expandedMenuIds.has(menu.id)}
                  onToggle={() => toggleMenuExpanded(menu.id)}
                  onViewDetails={() => handleViewMenuDetails(menu)}
                  onEdit={() => handleEditMenu(menu)}
                  onDelete={() => setDeleteMenuConfirm(menu)}
                  onToggleActive={() => handleToggleActive(menu)}
                  onAddCategory={() => handleAddCategory(menu.id)}
                  onEditCategory={(category) => handleEditCategory(category, menu.id)}
                  onDeleteCategory={(category) => setDeleteCategoryConfirm({ category, menuId: menu.id })}
                  onAddItem={handleAddItem}
                  onEditItem={handleEditItem}
                  onViewItem={handleViewItem}
                  onDeleteItem={(itemId, categoryId) => setDeleteItemConfirm({ itemId, categoryId })}
                  onManageSchedules={() => handleManageSchedules(menu)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Menu Form Sheet */}
      <MenuFormSheet
        open={menuSheetOpen}
        onClose={() => setMenuSheetOpen(false)}
        merchantId={merchantId}
        locationId={locationId}
        mode={menuSheetMode}
        menu={editingMenu}
        onSuccess={invalidateMenus}
      />

      {/* Category Form Sheet */}
      <CategoryFormSheet
        open={categorySheetOpen}
        onClose={() => setCategorySheetOpen(false)}
        merchantId={merchantId}
        locationId={locationId}
        mode={categorySheetMode}
        category={editingCategory}
        menuId={categoryMenuId}
        onSuccess={invalidateAll}
      />

      {/* Item Form Sheet */}
      <ItemFormSheet
        open={itemSheetOpen}
        onClose={() => setItemSheetOpen(false)}
        merchantId={merchantId}
        locationId={locationId}
        mode={itemSheetMode}
        item={editingItem}
        categoryId={itemCategoryId}
        onSuccess={invalidateAll}
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
          handleEditItem(item, itemCategoryId || '')
        }}
        onSuccess={invalidateAll}
      />

      {/* Menu Schedules Sheet */}
      <MenuSchedulesSheet
        open={scheduleSheetOpen}
        onClose={() => {
          setScheduleSheetOpen(false)
          setSelectedMenuForSchedules(null)
        }}
        merchantId={merchantId}
        locationId={locationId}
        menuId={selectedMenuForSchedules?.id || null}
        menuName={selectedMenuForSchedules?.name || ''}
        onSuccess={() => {
          invalidateSchedules()
          invalidateMenus()
        }}
      />

      {/* Menu Detail Sheet */}
      <MenuDetailSheet
        open={menuDetailOpen}
        onClose={() => {
          setMenuDetailOpen(false)
          setSelectedMenuForDetails(null)
        }}
        merchantId={merchantId}
        locationId={locationId}
        menu={selectedMenuForDetails}
        onEdit={handleEditFromDetail}
        onSuccess={invalidateMenus}
      />

      {/* Delete Menu Confirmation */}
      <AlertDialog open={!!deleteMenuConfirm} onOpenChange={() => setDeleteMenuConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Menu
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteMenuConfirm?.name}&quot;?
              This will remove all category associations but not the categories themselves.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMenuConfirm && handleDeleteMenu(deleteMenuConfirm)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Category Confirmation */}
      <AlertDialog open={!!deleteCategoryConfirm} onOpenChange={() => setDeleteCategoryConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Remove Category
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove &quot;{deleteCategoryConfirm?.category.name}&quot; from this menu?
              The category and its items will remain in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteCategory}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Item Confirmation */}
      <AlertDialog open={!!deleteItemConfirm} onOpenChange={() => setDeleteItemConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Remove Item
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this item from the category?
              The item will remain in the system and can be added to other categories.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteItem}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ============================================================================
// MENU ROW COMPONENT
// ============================================================================

interface MenuRowProps {
  menu: AdminMenu
  merchantId: string
  locationId: string | null
  isExpanded: boolean
  onToggle: () => void
  onViewDetails: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
  onAddCategory: () => void
  onEditCategory: (category: AdminCategory) => void
  onDeleteCategory: (category: AdminCategory) => void
  onAddItem: (categoryId: string) => void
  onEditItem: (item: AdminMenuItem, categoryId: string) => void
  onViewItem: (itemId: string) => void
  onDeleteItem: (itemId: string, categoryId: string) => void
  onManageSchedules: () => void
}

function MenuRow({
  menu,
  merchantId,
  locationId,
  isExpanded,
  onToggle,
  onViewDetails,
  onEdit,
  onDelete,
  onToggleActive,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  onAddItem,
  onEditItem,
  onViewItem,
  onDeleteItem,
  onManageSchedules,
}: MenuRowProps) {
  // Fetch details only when expanded
  const { data: menuDetails, isLoading: detailsLoading } = useAdminMenuWithCategories(
    merchantId,
    isExpanded ? menu.id : null,
    locationId
  )

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

            {/* Icon */}
            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Name & Description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  href={`/manage/merchants/${merchantId}/menu/${menu.id}`}
                  className="font-medium truncate hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {menu.name}
                </Link>
                {menu.is_global ? (
                  <Badge variant="outline" className="text-xs bg-slate-50 dark:bg-slate-900">
                    <Globe className="h-3 w-3 mr-1" />
                    Global
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    <MapPin className="h-3 w-3 mr-1" />
                    {menu.location_name || 'Location'}
                  </Badge>
                )}
              </div>
              {menu.description && (
                <p className="text-xs text-muted-foreground truncate">{menu.description}</p>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                <FolderTree className="h-3 w-3 mr-1" />
                {menu.categories_count} categories
              </Badge>
              <Badge variant="secondary">
                <Package className="h-3 w-3 mr-1" />
                {menu.items_count} items
              </Badge>
              {menu.schedules_count > 0 && (
                <Badge variant="outline" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  {menu.schedules_count} schedules
                </Badge>
              )}
            </div>

            {/* Status */}
            <div>
              {menu.is_active ? (
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
                <DropdownMenuItem asChild>
                  <Link href={`/manage/merchants/${merchantId}/menu/${menu.id}`}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Menu
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleActive(); }}>
                  {menu.is_active ? (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Activate
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddCategory(); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Category
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onManageSchedules(); }}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Manage Schedules
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Menu
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t">
            {detailsLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : menuDetails?.categories && menuDetails.categories.length > 0 ? (
              <div className="divide-y">
                {menuDetails.categories.map((category) => (
                  <CategorySection
                    key={category.id}
                    category={category}
                    onEdit={() => onEditCategory({
                      id: category.category_id,
                      name: category.category.name,
                      description: category.category.description,
                      image: category.category.image,
                      is_active: category.is_active,
                      is_global: category.category.is_global,
                      location_id: category.category.location_id,
                      location_name: null,
                      items_count: category.items.length,
                      display_order: category.display_order,
                      created_at: '',
                    })}
                    onDelete={() => onDeleteCategory({
                      id: category.category_id,
                      name: category.category.name,
                      description: category.category.description,
                      image: category.category.image,
                      is_active: category.is_active,
                      is_global: category.category.is_global,
                      location_id: category.category.location_id,
                      location_name: null,
                      items_count: category.items.length,
                      display_order: category.display_order,
                      created_at: '',
                    })}
                    onAddItem={() => onAddItem(category.category_id)}
                    onEditItem={(item) => onEditItem(item, category.category_id)}
                    onViewItem={onViewItem}
                    onDeleteItem={(itemId) => onDeleteItem(itemId, category.category_id)}
                  />
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">
                <p>No categories in this menu</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={onAddCategory}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Category
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// ============================================================================
// CATEGORY SECTION COMPONENT
// ============================================================================

interface CategorySectionProps {
  category: AdminMenuWithCategories['categories'][0]
  onEdit: () => void
  onDelete: () => void
  onAddItem: () => void
  onEditItem: (item: AdminMenuItem) => void
  onViewItem: (itemId: string) => void
  onDeleteItem: (itemId: string) => void
}

function CategorySection({
  category,
  onEdit,
  onDelete,
  onAddItem,
  onEditItem,
  onViewItem,
  onDeleteItem,
}: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 cursor-pointer">
          <div className="text-muted-foreground ml-6">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>

          <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
            {category.category.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={category.category.image}
                alt={category.category.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">{category.custom_title || category.category.name}</p>
              {category.category.is_global ? (
                <Badge variant="outline" className="text-xs scale-90">Global</Badge>
              ) : (
                <Badge variant="outline" className="text-xs scale-90 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  Local
                </Badge>
              )}
              {!category.is_active && (
                <Badge variant="outline" className="text-xs scale-90 bg-red-50 text-red-700">
                  Inactive
                </Badge>
              )}
            </div>
          </div>

          <Badge variant="secondary" className="text-xs">
            {category.items.length} items
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Category
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddItem(); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove from Menu
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {category.items.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="w-[40px] pl-16">#</TableHead>
                <TableHead className="w-[50px]">Image</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Base Price</TableHead>
                <TableHead>Effective Price</TableHead>
                <TableHead className="w-[80px]">Source</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {category.items.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  onEdit={() => onEditItem({
                    id: item.menu_item_id,
                    name: item.menu_item.name,
                    description: item.menu_item.description,
                    image: item.menu_item.image,
                    allergens: item.menu_item.allergens,
                    meal_types: item.menu_item.meal_types,
                    card_bg_color: item.menu_item.card_bg_color,
                    base_price: item.menu_item.base_price,
                    base_cash_price: item.menu_item.base_cash_price,
                    base_availability: item.menu_item.base_availability,
                    effective_price: item.menu_item.effective_price,
                    effective_cash_price: item.menu_item.effective_cash_price,
                    effective_availability: item.menu_item.effective_availability,
                    price_source: item.menu_item.price_source,
                    has_location_override: item.menu_item.has_location_item_override,
                    tax_category: null,
                    is_tax_exempt: false,
                    available_channels: ['pos', 'online', 'kiosk'],
                    effective_tax_category: null,
                    effective_is_tax_exempt: false,
                    effective_available_channels: ['pos', 'online', 'kiosk'],
                    stock_tracking_mode: item.menu_item.stock_tracking_mode,
                    current_stock: item.menu_item.current_stock,
                    categories: [],
                    location_override: null,
                    created_at: '',
                    updated_at: '',
                  })}
                  onView={() => onViewItem(item.menu_item_id)}
                  onDelete={() => onDeleteItem(item.menu_item_id)}
                />
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="px-4 py-3 text-center text-sm text-muted-foreground ml-6">
            <p>No items in this category</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1"
              onClick={onAddItem}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Item
            </Button>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

// ============================================================================
// ITEM ROW COMPONENT
// ============================================================================

interface ItemRowProps {
  item: AdminMenuWithCategories['categories'][0]['items'][0]
  index: number
  onEdit: () => void
  onView: () => void
  onDelete: () => void
}

/**
 * Get price source badge styling
 */
function getPriceSourceBadge(priceSource: string) {
  const sourceMap: Record<string, { label: string; className: string }> = {
    base: { label: 'L1', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
    location_item: { label: 'L2', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
    category: { label: 'L3', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
    location_category: { label: 'L4', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
    location_menu: { label: 'L5', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
  }
  return sourceMap[priceSource] || sourceMap.base
}

function ItemRow({
  item,
  index,
  onEdit,
  onView,
  onDelete,
}: ItemRowProps) {
  const { menu_item } = item
  const basePrice = menu_item.base_price
  const effectivePrice = menu_item.effective_price
  const priceSource = menu_item.price_source || 'base'
  const hasPriceOverride = effectivePrice !== basePrice
  const sourceBadge = getPriceSourceBadge(priceSource)

  return (
    <TableRow className="hover:bg-muted/30">
      <TableCell className="text-muted-foreground pl-16">{index + 1}</TableCell>
      <TableCell>
        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center overflow-hidden">
          {menu_item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={menu_item.image}
              alt={menu_item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageOff className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </TableCell>
      <TableCell>
        <div>
          <p className="font-medium text-sm">{menu_item.name}</p>
          {menu_item.description && (
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
              {menu_item.description}
            </p>
          )}
          {item.is_featured && (
            <Badge variant="outline" className="text-xs mt-1 bg-yellow-50 text-yellow-700">
              Featured
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <span className={hasPriceOverride ? 'text-muted-foreground line-through text-xs' : 'font-medium'}>
          {formatCurrency(basePrice)}
        </span>
      </TableCell>
      <TableCell>
        <span className={hasPriceOverride ? 'font-medium' : 'text-muted-foreground'}>
          {formatCurrency(effectivePrice)}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={`text-xs border-0 ${sourceBadge.className}`}>
          {sourceBadge.label}
        </Badge>
      </TableCell>
      <TableCell>
        {menu_item.effective_availability ? (
          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-0">
            Available
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-0">
            Unavailable
          </Badge>
        )}
      </TableCell>
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
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onEdit}
            title="Edit Item"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title="Remove from Category"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
