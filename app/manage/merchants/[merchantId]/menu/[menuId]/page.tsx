'use client'

import { useState, useMemo, useEffect, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// UI Components
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Icons
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Globe,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  Folder,
  FolderOpen,
  Package,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Save,
  Loader2,
  MoreHorizontal,
  Settings,
  Calendar,
  ImageOff,
  RefreshCw,
} from 'lucide-react'

// Admin hooks and actions
import {
  useAdminMenuWithCategories,
  useAdminMerchantDetails,
  type AdminMenuWithCategories,
  type AdminMenuItem,
} from '@/lib/queries/use-admin-merchant'
import { adminKeys } from '@/lib/queries/admin-keys'
import {
  toggleAdminCategoryInMenu,
  updateAdminMenuCategoryOrder,
  updateAdminMenu,
  deleteAdminMenu,
  type AdminMenuCategory,
} from '@/app/manage/actions/admin-merchant/menus'
import { getAdminMenuSchedules } from '@/app/manage/actions/admin-merchant/menus'

// Form Sheets (reuse from MenuTab)
import { MenuFormSheet } from '../../components/MenuTab/sheets/MenuFormSheet'
import { ItemFormSheet } from '../../components/MenuTab/sheets/ItemFormSheet'

// OrderOut
import { AdminMenuOrderOutTab } from './AdminMenuOrderOutTab'
import {
  useAdminOrderOutStatus,
  useAdminOrderOutMenuSync,
  useAdminMenuPayloadDiff,
} from '@/lib/queries/use-admin-orderout'

// ============================================================================
// TYPES
// ============================================================================

interface AdminMenuDetailPageProps {
  params: Promise<{ merchantId: string; menuId: string }>
}

interface MenuSchedule {
  id: string
  name: string
  description: string | null
  is_active: boolean
  time_slots: Array<{
    id: string
    day_of_week: number
    start_time: string
    end_time: string
    is_active: boolean
  }>
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

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminMenuDetailPage({ params }: AdminMenuDetailPageProps) {
  const { merchantId: clerkOrgId, menuId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  // Fetch merchant details (UUID + locations) from clerk_org_id
  const { data: merchantDetails, isLoading: isMerchantLoading } = useAdminMerchantDetails(clerkOrgId)
  const merchantId = merchantDetails?.id
  const locations = merchantDetails?.locations ?? []

  // Location selection with URL sync
  const locationParam = searchParams.get('location')
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    locationParam || 'all'
  )
  const locationId = selectedLocationId !== 'all' ? selectedLocationId : null

  const selectedLocationName = locations.find((l) => l.id === selectedLocationId)?.name

  const handleLocationChange = (value: string) => {
    setSelectedLocationId(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete('location')
    } else {
      params.set('location', value)
    }
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  // State for expanded categories
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  // State for category reordering
  const [reorderedCategories, setReorderedCategories] = useState<AdminMenuCategory[]>([])
  const [hasCategoryOrderChanges, setHasCategoryOrderChanges] = useState(false)
  const [isSavingOrder, setIsSavingOrder] = useState(false)

  // Sheets state
  const [menuFormOpen, setMenuFormOpen] = useState(false)
  const [itemFormOpen, setItemFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<AdminMenuItem | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false)
  const [isDeletingMenu, setIsDeletingMenu] = useState(false)

  // Settings state
  const [editedName, setEditedName] = useState('')
  const [editedDescription, setEditedDescription] = useState('')
  const [hasSettingsChanges, setHasSettingsChanges] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  // Schedule state
  const [schedules, setSchedules] = useState<MenuSchedule[]>([])
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false)

  // Fetch menu with categories (only when merchantId is available)
  const {
    data: menu,
    isLoading: isMenuLoading,
    refetch,
    isFetching,
  } = useAdminMenuWithCategories(clerkOrgId, menuId, locationId)

  // OrderOut status
  const { data: orderOutData } = useAdminOrderOutStatus(merchantId || '')
  const locationRestaurant = orderOutData?.data?.restaurants?.find((r) => r.locationId === locationId)
  const canShowOrderOutTab = !!locationId

  // OrderOut sync status for tab indicator dot
  const { data: syncResult } = useAdminOrderOutMenuSync(
    merchantId || '',
    locationId || '',
    menuId
  )
  const { data: diffResult } = useAdminMenuPayloadDiff(
    merchantId || '',
    locationId || '',
    menuId
  )

  // Compute dot color for OrderOut tab indicator
  const orderOutDotColor = (() => {
    if (!canShowOrderOutTab || !locationRestaurant?.hasRestaurant) return null
    const lastSync = syncResult?.data?.lastSync
    const diff = diffResult?.data
    if (lastSync?.status === 'failed') return 'bg-red-500'
    if (diff?.hasChanges) return 'bg-amber-500'
    if (lastSync?.status === 'success') return 'bg-green-500'
    return null
  })()

  // Combined loading state
  const isLoading = isMerchantLoading || isMenuLoading

  // Initialize settings when menu loads
  useEffect(() => {
    if (menu) {
      setEditedName(menu.name)
      setEditedDescription(menu.description || '')
      setHasSettingsChanges(false)
    }
  }, [menu])

  // Initialize reordered categories
  useEffect(() => {
    if (menu?.categories && !hasCategoryOrderChanges) {
      const sorted = [...menu.categories].sort((a, b) => a.display_order - b.display_order)
      setReorderedCategories(sorted)
    }
  }, [menu?.categories, hasCategoryOrderChanges])

  // Load schedules (only when merchantId is available)
  useEffect(() => {
    async function loadSchedules() {
      if (!merchantId) return
      setIsLoadingSchedules(true)
      try {
        const data = await getAdminMenuSchedules(merchantId, menuId)
        setSchedules(data)
      } catch (error) {
        console.error('Failed to load schedules:', error)
      } finally {
        setIsLoadingSchedules(false)
      }
    }
    if (merchantId && menuId) {
      loadSchedules()
    }
  }, [merchantId, menuId])

  // Track settings changes
  useEffect(() => {
    if (menu) {
      const hasChanges = editedName !== menu.name || editedDescription !== (menu.description || '')
      setHasSettingsChanges(hasChanges)
    }
  }, [editedName, editedDescription, menu])

  // Categories to display (with reordering if changed)
  const displayCategories = hasCategoryOrderChanges
    ? reorderedCategories
    : (menu?.categories || []).sort((a, b) => a.display_order - b.display_order)

  // Toggle expand/collapse
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedCategories(new Set(displayCategories.map((c) => c.id)))
  }

  const collapseAll = () => {
    setExpandedCategories(new Set())
  }

  // Category visibility toggle
  const handleToggleCategoryVisibility = async (categoryId: string, isActive: boolean) => {
    if (!merchantId) return
    const result = await toggleAdminCategoryInMenu(merchantId, menuId, categoryId, isActive)
    if (result.error) {
      toast.error('Failed to update visibility', { description: result.error })
    } else {
      toast.success(isActive ? 'Category shown' : 'Category hidden')
      invalidateMenu()
    }
  }

  // Category reordering
  const moveCategoryUp = (index: number) => {
    if (index === 0) return
    const newOrder = [...reorderedCategories]
    const temp = newOrder[index]
    newOrder[index] = newOrder[index - 1]
    newOrder[index - 1] = temp
    setReorderedCategories(newOrder)
    setHasCategoryOrderChanges(true)
  }

  const moveCategoryDown = (index: number) => {
    if (index === reorderedCategories.length - 1) return
    const newOrder = [...reorderedCategories]
    const temp = newOrder[index]
    newOrder[index] = newOrder[index + 1]
    newOrder[index + 1] = temp
    setReorderedCategories(newOrder)
    setHasCategoryOrderChanges(true)
  }

  const handleSaveCategoryOrder = async () => {
    if (!merchantId) return
    setIsSavingOrder(true)
    try {
      const categoryOrders = reorderedCategories.map((cat, index) => ({
        categoryId: cat.category_id,
        displayOrder: index + 1,
      }))

      const result = await updateAdminMenuCategoryOrder(merchantId, menuId, categoryOrders)

      if (result.error) {
        toast.error('Failed to save order', { description: result.error })
        return
      }

      toast.success('Category order saved')
      setHasCategoryOrderChanges(false)
      invalidateMenu()
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSavingOrder(false)
    }
  }

  const handleResetCategoryOrder = () => {
    if (menu?.categories) {
      const sorted = [...menu.categories].sort((a, b) => a.display_order - b.display_order)
      setReorderedCategories(sorted)
      setHasCategoryOrderChanges(false)
    }
  }

  // Item editing
  const handleEditItem = (item: any, categoryId: string) => {
    // Transform to AdminMenuItem format
    const adminItem: AdminMenuItem = {
      id: item.menu_item_id,
      name: item.menu_item.name,
      description: item.menu_item.description,
      image: item.menu_item.image,
      allergens: item.menu_item.allergens,
      meal_types: item.menu_item.meal_types,
      card_bg_color: item.menu_item.card_bg_color,
      base_price: item.menu_item.base_price,
      base_cash_price: item.menu_item.base_cash_price || null,
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
      modifier_groups_count: item.menu_item.modifier_groups?.length || 0,
      location_override: null,
      created_at: '',
      updated_at: '',
    }
    setEditingItem(adminItem)
    setEditingCategoryId(categoryId)
    setItemFormOpen(true)
  }

  // Settings save
  const handleSaveSettings = async () => {
    if (!merchantId) return
    setIsSavingSettings(true)
    try {
      const result = await updateAdminMenu(merchantId, menuId, {
        name: editedName.trim(),
        description: editedDescription.trim() || null,
      })

      if (result.error) {
        toast.error('Failed to save settings', { description: result.error })
        return
      }

      toast.success('Settings saved')
      setHasSettingsChanges(false)
      invalidateMenu()
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSavingSettings(false)
    }
  }

  // Delete menu
  const handleDeleteMenu = async () => {
    if (!merchantId) return
    setIsDeletingMenu(true)
    try {
      const result = await deleteAdminMenu(merchantId, menuId)

      if (!result.success) {
        toast.error('Failed to delete menu', { description: result.error || undefined })
        return
      }

      toast.success('Menu deleted')
      invalidateMenuList()
      router.push(`/manage/merchants/${clerkOrgId}?tab=menu`)
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      setIsDeletingMenu(false)
      setDeleteMenuOpen(false)
    }
  }

  // Invalidation helpers
  const invalidateMenu = () => {
    if (!merchantId) return
    queryClient.invalidateQueries({
      queryKey: adminKeys.merchantMenuWithCategories(merchantId, menuId, locationId),
    })
  }

  const invalidateMenuList = () => {
    if (!merchantId) return
    queryClient.invalidateQueries({
      queryKey: adminKeys.merchantMenus(merchantId, locationId),
    })
    queryClient.invalidateQueries({
      queryKey: adminKeys.merchantMenuStats(merchantId, locationId),
    })
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  // Not found state
  if (!menu) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FolderOpen className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Menu Not Found</h2>
        <p className="text-muted-foreground mb-4">
          The menu you are looking for does not exist or you do not have access.
        </p>
        <Button asChild>
          <Link href={`/manage/merchants/${clerkOrgId}?tab=menu`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Menus
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/manage/merchants/${clerkOrgId}?tab=menu`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {/* Location Selector */}
          {locations.length > 0 && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedLocationId} onValueChange={handleLocationChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations (Global)</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{menu.name}</h1>
            {menu.description && (
              <p className="text-muted-foreground mt-1">{menu.description}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              {locationId
                ? <>Viewing effective prices for <span className="text-foreground font-medium">{selectedLocationName}</span></>
                : <>Viewing global prices (L1) for all locations</>
              }
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Badge
                variant="outline"
                className={menu.is_active ? 'bg-green-50 text-green-700 border-0' : 'bg-red-50 text-red-700 border-0'}
              >
                {menu.is_active ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Active
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-1" />
                    Inactive
                  </>
                )}
              </Badge>
              <Badge variant="outline" className={menu.is_global ? 'bg-slate-50' : 'bg-blue-50 text-blue-700'}>
                {menu.is_global ? (
                  <>
                    <Globe className="h-3 w-3 mr-1" />
                    Global
                  </>
                ) : (
                  <>
                    <MapPin className="h-3 w-3 mr-1" />
                    {menu.location_name || 'Location'}
                  </>
                )}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-1.5">
            Categories & Items
            {menu.categories_count > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {menu.categories_count}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="schedules" className="flex items-center gap-1.5">
            Schedules
            {schedules.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {schedules.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          {canShowOrderOutTab && (
            <TabsTrigger value="orderout" className="flex items-center gap-1.5">
              OrderOut
              {orderOutDotColor && (
                <span className={`h-2 w-2 rounded-full ${orderOutDotColor}`} />
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Folder className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-bold">{menu.categories_count}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-bold">{menu.items_count}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Schedules</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-bold">{schedules.length}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Menu Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {menu.created_at
                      ? format(new Date(menu.created_at), 'MMM d, yyyy')
                      : 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Updated</p>
                  <p className="font-medium">
                    {menu.updated_at
                      ? formatDistanceToNow(new Date(menu.updated_at), { addSuffix: true })
                      : 'Unknown'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories & Items Tab */}
        <TabsContent value="categories" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={expandAll}>
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Collapse All
              </Button>
            </div>
            {hasCategoryOrderChanges && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleResetCategoryOrder}>
                  Reset Order
                </Button>
                <Button size="sm" onClick={handleSaveCategoryOrder} disabled={isSavingOrder}>
                  {isSavingOrder ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Order
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {displayCategories.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No categories in this menu</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {displayCategories.map((category, index) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  index={index}
                  totalCategories={displayCategories.length}
                  isExpanded={expandedCategories.has(category.id)}
                  onToggle={() => toggleCategory(category.id)}
                  onToggleVisibility={(isActive) =>
                    handleToggleCategoryVisibility(category.category_id, isActive)
                  }
                  onMoveUp={() => moveCategoryUp(index)}
                  onMoveDown={() => moveCategoryDown(index)}
                  onEditItem={(item) => handleEditItem(item, category.category_id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Schedules Tab */}
        <TabsContent value="schedules" className="space-y-4">
          {isLoadingSchedules ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : schedules.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No schedules assigned to this menu</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {schedules.map((schedule) => (
                <Card key={schedule.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{schedule.name}</CardTitle>
                      <Badge
                        variant="outline"
                        className={schedule.is_active ? 'bg-green-50 text-green-700 border-0' : 'bg-red-50 text-red-700 border-0'}
                      >
                        {schedule.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    {schedule.description && (
                      <CardDescription>{schedule.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {schedule.time_slots.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No time slots defined</p>
                      ) : (
                        schedule.time_slots.map((slot) => (
                          <Badge key={slot.id} variant="secondary">
                            {dayNames[slot.day_of_week]} {slot.start_time} - {slot.end_time}
                          </Badge>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Menu Details</CardTitle>
              <CardDescription>Update the menu name and description</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="menu-name">Name</Label>
                <Input
                  id="menu-name"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  placeholder="Menu name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="menu-description">Description</Label>
                <Textarea
                  id="menu-description"
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder="Menu description (optional)"
                  rows={3}
                />
              </div>
              {hasSettingsChanges && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditedName(menu.name)
                      setEditedDescription(menu.description || '')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveSettings} disabled={isSavingSettings}>
                    {isSavingSettings ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Menu Status</CardTitle>
              <CardDescription>
                {menu.is_active
                  ? 'This menu is currently active and visible to customers'
                  : 'This menu is currently inactive and hidden from customers'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => setMenuFormOpen(true)}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit Menu
              </Button>
            </CardContent>
          </Card>

          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Permanently delete this menu. This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={() => setDeleteMenuOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Menu
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* OrderOut Tab */}
        {canShowOrderOutTab && merchantId && locationId && (
          <TabsContent value="orderout" className="space-y-4">
            <AdminMenuOrderOutTab
              merchantId={merchantId}
              locationId={locationId}
              menuId={menuId}
              menuName={menu.name}
              clerkOrgId={clerkOrgId}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Menu Form Sheet - only render when merchantId is available */}
      {merchantId && (
        <MenuFormSheet
          open={menuFormOpen}
          onClose={() => setMenuFormOpen(false)}
          merchantId={merchantId}
          locationId={locationId}
          mode="edit"
          menu={menu}
          onSuccess={() => {
            invalidateMenu()
            invalidateMenuList()
          }}
        />
      )}

      {/* Item Form Sheet - only render when merchantId is available */}
      {merchantId && (
        <ItemFormSheet
          open={itemFormOpen}
          onClose={() => {
            setItemFormOpen(false)
            setEditingItem(null)
            setEditingCategoryId(null)
          }}
          merchantId={merchantId}
          locationId={locationId}
          mode="edit"
          item={editingItem}
          categoryId={editingCategoryId}
          onSuccess={() => {
            invalidateMenu()
            setItemFormOpen(false)
            setEditingItem(null)
            setEditingCategoryId(null)
          }}
        />
      )}

      {/* Delete Menu Confirmation */}
      <AlertDialog open={deleteMenuOpen} onOpenChange={setDeleteMenuOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Menu
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{menu.name}&quot;? This will remove all
              category associations and schedules. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingMenu}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMenu}
              disabled={isDeletingMenu}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingMenu ? 'Deleting...' : 'Delete Menu'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================================
// CATEGORY ROW COMPONENT
// ============================================================================

interface CategoryRowProps {
  category: AdminMenuCategory
  index: number
  totalCategories: number
  isExpanded: boolean
  onToggle: () => void
  onToggleVisibility: (isActive: boolean) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onEditItem: (item: any) => void
}

function CategoryRow({
  category,
  index,
  totalCategories,
  isExpanded,
  onToggle,
  onToggleVisibility,
  onMoveUp,
  onMoveDown,
  onEditItem,
}: CategoryRowProps) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className="border rounded-lg">
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors">
            {/* Expand Icon */}
            <div className="text-muted-foreground">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>

            {/* Category Image */}
            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
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

            {/* Category Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">
                  {category.custom_title || category.category.name}
                </p>
                {category.category.is_global ? (
                  <Badge variant="outline" className="text-xs scale-90">Global</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs scale-90 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    Local
                  </Badge>
                )}
                {!category.is_active && (
                  <Badge variant="outline" className="text-xs scale-90 bg-red-50 text-red-700">
                    Hidden
                  </Badge>
                )}
              </div>
            </div>

            {/* Item Count */}
            <Badge variant="secondary" className="text-xs">
              {category.items.length} items
            </Badge>

            {/* Reorder Controls */}
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={index === 0}
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveUp()
                }}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={index === totalCategories - 1}
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveDown()
                }}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>

            {/* Visibility Toggle */}
            <div onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleVisibility(!category.is_active)
                }}
                title={category.is_active ? 'Hide category' : 'Show category'}
              >
                {category.is_active ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t">
            {category.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="w-[40px] pl-8">#</TableHead>
                    <TableHead className="w-[50px]">Image</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Base Price</TableHead>
                    <TableHead>Effective Price</TableHead>
                    <TableHead className="w-[80px]">Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {category.items.map((item, itemIndex) => {
                    const menuItem = item.menu_item
                    const basePrice = menuItem.base_price
                    const effectivePrice = menuItem.effective_price
                    const hasPriceOverride = effectivePrice !== basePrice
                    const sourceBadge = getPriceSourceBadge(menuItem.price_source || 'base')

                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="text-muted-foreground pl-8">{itemIndex + 1}</TableCell>
                        <TableCell>
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center overflow-hidden">
                            {menuItem.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={menuItem.image}
                                alt={menuItem.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImageOff className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{menuItem.name}</p>
                            {menuItem.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {menuItem.description}
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
                          {menuItem.effective_availability ? (
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
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => onEditItem(item)}
                            title="Edit Item"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                <p>No items in this category</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
