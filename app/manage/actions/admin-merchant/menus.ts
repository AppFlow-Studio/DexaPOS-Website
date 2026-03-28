'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ============================================================================
// TYPES
// ============================================================================

import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'

export type PriceSource = 'base' | 'location_item' | 'category' | 'location_category' | 'location_menu'

// Audit information type for admin display
export interface AuditInfo {
  created_at: string
  updated_at: string
  created_by?: { id: string; name: string; email: string } | null
  updated_by?: { id: string; name: string; email: string } | null
  admin_notes?: string | null
}

export interface AdminMenu {
  id: string
  name: string
  description: string | null
  image: string | null
  is_active: boolean
  is_global: boolean
  location_id: string | null
  location_name: string | null
  categories_count: number
  items_count: number
  schedules_count: number
  created_at: string
  updated_at: string
  // Audit fields for admin display
  created_by?: { id: string; name: string; email: string } | null
  updated_by?: { id: string; name: string; email: string } | null
  admin_notes?: string | null
}

export interface AdminMenuItemModifierGroup {
  id: string
  name: string
  is_required: boolean
  items_count: number
  sort_order: number
  items?: Array<{
    id: string
    name: string
    price_modifier: number
    is_active: boolean
  }>
}

export interface AdminMenuItem {
  id: string
  name: string
  description: string | null
  image: string | null
  allergens: string[] | null
  meal_types: string[] | null
  card_bg_color: string | null
  // L1 Base prices
  base_price: number
  base_cash_price: number | null
  base_availability: boolean
  // Effective prices (computed by cascade)
  effective_price: number
  effective_cash_price: number | null
  effective_availability: boolean
  // Price source indicator
  price_source: PriceSource
  // Override flags
  has_location_override: boolean
  // Tax
  tax_category: string | null
  is_tax_exempt: boolean
  available_channels: string[]
  effective_tax_category: string | null
  effective_is_tax_exempt: boolean
  effective_available_channels: string[]
  location_id?: string | null
  menu_count?: number
  // Stock
  stock_tracking_mode: string | null
  current_stock: number | null
  // Relations
  categories: Array<{
    id: string
    name: string
    location_id: string | null
    location_name: string | null
    is_global: boolean
  }>
  // Modifier groups
  modifier_groups?: AdminMenuItemModifierGroup[]
  modifier_groups_count: number
  // Location override details (L2)
  location_override: {
    id: string
    custom_price: number | null
    custom_cash_price: number | null
    price_modifier: number | null
    price_modifier_type: string | null
    is_available: boolean
    stock_tracking_mode: string | null
    current_stock: number | null
    tax_category: string | null
    is_tax_exempt: boolean | null
    available_channels: string[] | null
  } | null
  created_at: string
  updated_at: string
  // Audit fields for admin display
  created_by?: { id: string; name: string; email: string } | null
  updated_by?: { id: string; name: string; email: string } | null
  admin_notes?: string | null
}

export interface AdminCategory {
  id: string
  name: string
  description: string | null
  image: string | null
  is_active: boolean
  is_global: boolean
  location_id: string | null
  location_name: string | null
  items_count: number
  display_order: number
  created_at: string
  updated_at?: string
  // Audit fields for admin display
  created_by?: { id: string; name: string; email: string } | null
  updated_by?: { id: string; name: string; email: string } | null
  admin_notes?: string | null
  items?: any[]
}

export interface AdminModifierGroup {
  id: string
  name: string
  description: string | null
  is_required: boolean
  is_active: boolean
  min_selections: number
  max_selections: number | null
  items_count: number
  is_global: boolean
  location_id: string | null
  created_at: string
}

export interface AdminModifierItem {
  id: string
  name: string
  description: string | null
  price_modifier: number
  is_default: boolean
  is_active: boolean
  display_order: number
}

// ============================================================================
// PRICE CASCADE TYPES (5-Level System)
// ============================================================================

export interface AdminPriceLevels {
  level_1_base: number
  level_2_location_item: number | null
  level_2_modifier: number | null
  level_2_modifier_type: string | null
  level_3_category: number | null
  level_4_location_category: number | null
  level_5_location_menu: number | null
}

export interface AdminModifierGroupWithOverrides {
  id: string
  name: string
  min_selections: number
  max_selections: number | null
  is_required: boolean
  is_active: boolean
  items: {
    id: string
    name: string
    price_modifier: number
    is_active: boolean
    stock_tracking_mode: string
    current_stock: number | null
  }[]
}

export interface AdminMenuItemWithCascade {
  id: string
  name: string
  description: string | null
  image: string | null
  allergens: string[] | null
  meal_types: string[] | null
  card_bg_color: string | null
  // Base prices (L1)
  base_price: number
  base_cash_price: number | null
  base_availability: boolean
  // Price breakdown (all levels)
  price_levels: AdminPriceLevels
  // Computed effective values
  effective_price: number
  effective_cash_price: number | null
  effective_availability: boolean
  price_source: PriceSource
  // Override flags
  has_location_item_override: boolean
  has_category_override: boolean
  has_location_category_override: boolean
  has_location_menu_override: boolean
  // Stock
  stock_tracking_mode: string | null
  current_stock: number | null
  // Modifiers with location overrides
  modifier_groups: AdminModifierGroupWithOverrides[]
}

// ============================================================================
// MENUS
// ============================================================================

export async function getAdminMenus(
  merchantId: string,
  locationId?: string | null
): Promise<AdminMenu[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Build query for menus
  let query = supabase
    .from('menus')
    .select(`
      id,
      name,
      description,
      image,
      is_active,
      location_id,
      created_at,
      updated_at,
      locations(name),
      menu_categories(
        category_id,
        categories(
          category_items(count)
        )
      ),
      menu_schedules(count)
    `)
    .eq('merchant_id', merchantId)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  // If location specified, show global menus + that location's menus
  if (locationId && locationId !== 'all') {
    query = query.or(`location_id.is.null,location_id.eq.${locationId}`)
  }

  const { data: menus, error } = await query

  if (error) {
    console.error('[getAdminMenus] Error:', error)
    return []
  }

  return (menus || []).map((menu: any) => {
    // Count categories, items, and schedules
    const categoriesCount = menu.menu_categories?.length || 0
    let itemsCount = 0
    menu.menu_categories?.forEach((mc: any) => {
      itemsCount += mc.categories?.category_items?.length || 0
    })
    const schedulesCount = menu.menu_schedules?.length || 0

    return {
      id: menu.id,
      name: menu.name,
      description: menu.description,
      image: menu.image,
      is_active: menu.is_active,
      is_global: !menu.location_id,
      location_id: menu.location_id,
      location_name: menu.locations?.name || null,
      categories_count: categoriesCount,
      items_count: itemsCount,
      schedules_count: schedulesCount,
      created_at: menu.created_at,
      updated_at: menu.updated_at,
    }
  })
}

// ============================================================================
// MENU ITEMS
// ============================================================================

export interface AdminMenuItemsFilters {
  categoryId?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface AdminMenuItemsResponse {
  items: AdminMenuItem[]
  total: number
  page: number
  pageSize: number
}

export async function getAdminMenuItems(
  merchantId: string,
  locationId?: string | null,
  filters: AdminMenuItemsFilters = {}
): Promise<AdminMenuItemsResponse> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const { page = 1, pageSize = 50, search, categoryId } = filters
  const effectiveLocationId = locationId === 'all' ? null : locationId

  // Use the RPC function that returns items with L1/L2 pricing
  const { data, error } = await supabase.rpc('get_items_for_location_library', {
    p_merchant_id: merchantId,
    p_location_id: effectiveLocationId || null,
  })

  if (error) {
    console.error('[getAdminMenuItems] Error:', error)
    return { items: [], total: 0, page, pageSize }
  }

  let items = (data || []) as AdminMenuItem[]

  // Apply search filter
  if (search) {
    const searchLower = search.toLowerCase()
    items = items.filter(
      (item) =>
        item.name.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower)
    )
  }

  // Apply category filter
  if (categoryId && categoryId !== 'all') {
    items = items.filter((item) =>
      item.categories.some((cat) => cat.id === categoryId)
    )
  }

  const total = items.length

  // Apply pagination
  const offset = (page - 1) * pageSize
  items = items.slice(offset, offset + pageSize)

  return {
    items,
    total,
    page,
    pageSize,
  }
}

export async function getAdminMenuItemDetails(
  merchantId: string,
  itemId: string,
  locationId?: string | null
): Promise<AdminMenuItem | null> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const effectiveLocationId = locationId === 'all' ? null : locationId

  // Get the item using the RPC that includes full details
  const { data, error } = await supabase.rpc('get_menu_item_details', {
    p_item_id: itemId,
    p_location_id: effectiveLocationId || null,
  })

  if (error) {
    console.error('[getAdminMenuItemDetails] Error:', error)
    return null
  }

  if (!data) return null

  // Verify item belongs to merchant AND get location_id for UI logic
  const { data: item } = await supabase
    .from('menu_items')
    .select('merchant_id, location_id')
    .eq('id', itemId)
    .single()

  if (!item || item.merchant_id !== merchantId) {
    return null
  }

  return {
    ...(data as AdminMenuItem),
    location_id: item.location_id
  }
}

// ============================================================================
// CATEGORIES
// ============================================================================

export async function getAdminCategories(
  merchantId: string,
  locationId?: string | null
): Promise<AdminCategory[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const effectiveLocationId = locationId === 'all' ? null : locationId

  // Use the same RPC as the dashboard to ensure consistency
  // This returns full item details, effectively fetching "CategoriesWithItems"
  const { data: categories, error } = await supabase.rpc('get_categories_for_location', {
    p_merchant_id: merchantId,
    p_location_id: effectiveLocationId || null,
  })

  if (error) {
    console.error('[getAdminCategories] Error:', error)
    return []
  }

  // Map RPC result to AdminCategory
  return (categories || []).map((cat: any) => ({
    id: cat.id,
    name: cat.name,
    description: cat.description,
    image: cat.image,
    is_active: cat.effective_is_active ?? cat.is_active, // Use effective active state
    is_global: cat.is_global,
    location_id: cat.location_id,
    location_name: cat.location_name,
    items_count: cat.items?.length || 0, // Count from actual items
    display_order: cat.effective_display_order ?? cat.display_order,
    created_at: cat.created_at,
    updated_at: cat.updated_at,
    // Optional: Pass items if we update the interface to support it
    items: cat.items?.map((item: any) => ({
      ...item,
       // Normalize item fields if needed by UI
       name: item.menu_item.name,
       image: item.menu_item.image,
       base_price: item.menu_item.base_price
    }))
  }))
}

export interface AdminCategoryWithItems extends AdminCategory {
  items: Array<{
    id: string
    menu_item_id: string
    display_order: number
    is_featured: boolean
    // L3 Category price
    category_price: number | null
    category_cash_price: number | null
    // L4 Location + Category price
    location_category_price: number | null
    location_category_cash_price: number | null
    // The menu item with computed effective price
    menu_item: {
      id: string
      name: string
      description: string | null
      image: string | null
      base_price: number
      base_cash_price: number | null
      effective_price: number
      price_source: PriceSource
      availability: boolean
      has_location_override: boolean
    }
  }>
}

export async function getAdminCategoryWithItems(
  merchantId: string,
  categoryId: string,
  locationId?: string | null
): Promise<AdminCategoryWithItems | null> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const effectiveLocationId = locationId === 'all' ? null : locationId

  // Use the RPC that returns categories with full price cascade
  const { data, error } = await supabase.rpc('get_categories_for_location', {
    p_merchant_id: merchantId,
    p_location_id: effectiveLocationId || null,
  })

  if (error) {
    console.error('[getAdminCategoryWithItems] Error:', error)
    return null
  }

  // Find the specific category
  const category = (data || []).find((cat: any) => cat.id === categoryId)

  if (!category) return null

  return {
    id: category.id,
    name: category.name,
    description: category.description,
    image: category.image,
    is_active: category.is_active,
    is_global: category.is_global ?? (category.location_id === null),
    location_id: category.location_id,
    location_name: category.location_name || null,
    items_count: category.items?.length || 0,
    display_order: category.display_order || 0,
    created_at: category.created_at,
    items: (category.items || []).map((item: any) => ({
      id: item.id,
      menu_item_id: item.menu_item_id,
      display_order: item.display_order,
      is_featured: item.is_featured,
      category_price: item.category_price,
      category_cash_price: item.category_cash_price,
      location_category_price: item.location_category_price,
      location_category_cash_price: item.location_category_cash_price,
      menu_item: {
        id: item.menu_item?.id || item.menu_item_id,
        name: item.menu_item?.name || item.name,
        description: item.menu_item?.description || item.description,
        image: item.menu_item?.image || item.image,
        base_price: item.menu_item?.base_price || item.base_price,
        base_cash_price: item.menu_item?.base_cash_price,
        effective_price: item.effective_price,
        price_source: item.price_source || 'base',
        availability: item.effective_availability ?? item.menu_item?.availability ?? true,
        has_location_override: item.has_location_override ?? false,
      },
    })),
  }
}

// ... existing code ...

export async function updateAdminCategoryItemsOrder(
  merchantId: string,
  categoryId: string,
  itemOrders: Array<{ menuItemId: string; displayOrder: number }>
) {
  await assertHQPermission('hq.merchant.view')

  if (!categoryId || !itemOrders?.length) {
    return { error: 'Category ID and item orders are required' }
  }

  const supabase = createServerSupabaseClient()

  // Update each item's display order
  const updates = itemOrders.map(({ menuItemId, displayOrder }) =>
    supabase
      .from('category_items')
      .update({
        display_order: displayOrder,
        updated_at: new Date().toISOString(),
      })
      .eq('category_id', categoryId)
      .eq('menu_item_id', menuItemId)
  )

  const results = await Promise.all(updates)
  const errors = results.filter((r) => r.error)

  if (errors.length > 0) {
    console.error('[updateAdminCategoryItemsOrder] Error:', errors)
    return { success: false, error: 'Failed to update some item orders' }
  }

  return { success: true }
}

export async function removeAdminItemFromCategory(
  merchantId: string,
  categoryId: string,
  menuItemId: string
) {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('category_items')
    .delete()
    .eq('category_id', categoryId)
    .eq('menu_item_id', menuItemId)

  if (error) {
    console.error('[removeAdminItemFromCategory] Error:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function updateAdminCategoriesOrder(
  merchantId: string,
  categoryOrders: Array<{ categoryId: string; displayOrder: number }>,
) {
  await assertHQPermission("hq.merchant.view");

  if (!categoryOrders?.length) {
    return { error: "Category orders are required" };
  }

  const supabase = createServerSupabaseClient();

  // Update each category's display order
  const updates = categoryOrders.map(({ categoryId, displayOrder }) =>
    supabase
      .from("categories")
      .update({
        display_order: displayOrder,
        updated_at: new Date().toISOString(),
      })
      .eq("id", categoryId)
      .eq("merchant_id", merchantId),
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    console.error("[updateAdminCategoriesOrder] Error:", errors);
    return { success: false, error: "Failed to update some category orders" };
  }

  return { success: true };
}

// ... existing code ...

export async function getAdminModifierGroups(
  merchantId: string,
  locationId?: string | null
): Promise<AdminModifierGroup[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const effectiveLocationId = locationId === 'all' ? null : locationId

  let query = supabase
    .from('modifier_groups')
    .select(`
      id,
      name,
      description,
      is_required,
      is_active,
      min_selections,
      max_selections,
      location_id,
      created_at,
      locations(name),
      modifier_group_items(count)
    `)
    .eq('merchant_id', merchantId)
    .order('name', { ascending: true })

  // If location specified, show global modifier groups + that location's groups
  if (effectiveLocationId) {
    query = query.or(`location_id.is.null,location_id.eq.${effectiveLocationId}`)
  }

  const { data: groups, error } = await query

  if (error) {
    console.error('[getAdminModifierGroups] Error:', error)
    return []
  }

  return (groups || []).map((group: any) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    is_required: group.is_required,
    is_active: group.is_active,
    min_selections: group.min_selections || 0,
    max_selections: group.max_selections,
    items_count: group.modifier_group_items?.[0]?.count ?? 0,
    is_global: !group.location_id,
    location_id: group.location_id,
    created_at: group.created_at,
  }))
}

export interface AdminModifierGroupWithItems extends AdminModifierGroup {
  items: AdminModifierItem[]
}

export async function getAdminModifierGroupDetails(
  merchantId: string,
  groupId: string,
  locationId?: string | null
): Promise<AdminModifierGroupWithItems | null> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  const { data: group, error } = await supabase
    .from('modifier_groups')
    .select(`
      id,
      name,
      description,
      is_required,
      is_active,
      min_selections,
      max_selections,
      location_id,
      created_at,
      merchant_id,
      modifier_group_items(
        id,
        name,
        description,
        price_modifier,
        is_default,
        is_active,
        display_order
      )
    `)
    .eq('id', groupId)
    .single()

  if (error || !group) {
    console.error('[getAdminModifierGroupDetails] Error:', error)
    return null
  }

  // Verify belongs to merchant
  if (group.merchant_id !== merchantId) {
    return null
  }

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    is_required: group.is_required,
    is_active: group.is_active,
    min_selections: group.min_selections || 0,
    max_selections: group.max_selections,
    items_count: group.modifier_group_items?.length || 0,
    is_global: !group.location_id,
    location_id: group.location_id,
    created_at: group.created_at,
    items: (group.modifier_group_items || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price_modifier: Number(item.price_modifier || 0),
      is_default: item.is_default,
      is_active: item.is_active,
      display_order: item.display_order || 0,
    })),
  }
}

// ============================================================================
// MENU WITH CATEGORIES & ITEMS (Hierarchical View)
// ============================================================================

export interface AdminMenuCategory {
  id: string // menu_categories.id
  category_id: string
  display_order: number
  is_active: boolean
  custom_title: string | null
  category: {
    id: string
    name: string
    description: string | null
    image: string | null
    is_global: boolean
    location_id: string | null
    has_location_override: boolean
    has_menu_category_override: boolean
  }
  items: AdminMenuCategoryItem[]
}

export interface AdminMenuCategoryItem {
  id: string // category_items.id
  menu_item_id: string
  category_id: string
  display_order: number
  is_featured: boolean
  menu_item: AdminMenuItemWithCascade
}

export interface AdminMenuWithCategories extends AdminMenu {
  categories: AdminMenuCategory[]
}

export async function getAdminMenuWithCategories(
  merchantId: string,
  menuId: string,
  locationId?: string | null
): Promise<AdminMenuWithCategories | null> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const effectiveLocationId = locationId === 'all' ? null : locationId
  
  // GET Merchant ID
  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select('id')
    .eq('clerk_org_id', merchantId)
    .single()

  
  if (merchantError || !merchant) {
    console.error('[getAdminMenuWithCategories] Error getting merchant:', merchantError)
    return null
  }


  // Use the RPC that implements full 5-level cascade
  const { data, error } = await supabase.rpc('get_menu_with_categories', {
    p_menu_id: menuId,
    p_location_id: effectiveLocationId || null,
  })

  if (error || !data) {
    console.error('[getAdminMenuWithCategories] Error:', error)
    return null
  }

  // Verify menu belongs to merchant
  if (data.merchant_id !== merchant.id) {
    console.error('[getAdminMenuWithCategories] Menu does not belong to merchant')
    return null
  }

  const { data: menuRow } = await supabase
    .from('menus')
    .select('image')
    .eq('id', menuId)
    .maybeSingle()

  // Transform RPC response to AdminMenuWithCategories format
  return transformToAdminMenuWithCategories({
    ...data,
    image: menuRow?.image || null,
  })
}

/**
 * Transform RPC response to AdminMenuWithCategories format
 * Maps the get_menu_with_categories RPC response to the admin types
 */
function transformToAdminMenuWithCategories(data: any): AdminMenuWithCategories {
  const categories: AdminMenuCategory[] = (data.categories || []).map((mc: any) => ({
    id: mc.id,
    category_id: mc.category_id,
    display_order: mc.display_order || 0,
    is_active: mc.is_active ?? true,
    custom_title: mc.category?.name || null,
    category: {
      id: mc.category_id,
      name: mc.category?.name || '',
      description: mc.category?.description || null,
      image: mc.category?.image || null,
      is_global: !mc.category?.location_id,
      location_id: mc.category?.location_id || null,
      has_location_override: mc.category?.has_location_override ?? false,
      has_menu_category_override: mc.category?.has_menu_category_override ?? false,
    },
    items: (mc.items || []).map((item: any) => transformMenuItem(item, mc.category_id)),
  }))

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    image: data.image || null,
    is_active: data.is_active,
    is_global: data.is_global ?? !data.location_id,
    location_id: data.location_id,
    location_name: null, // RPC doesn't include location name, can fetch separately if needed
    categories_count: categories.length,
    items_count: categories.reduce((sum, cat) => sum + cat.items.length, 0),
    schedules_count: data.schedules_count || 0,
    created_at: data.created_at,
    updated_at: data.updated_at,
    categories,
  }
}

/**
 * Transform a menu item from RPC response to AdminMenuCategoryItem format
 */
function transformMenuItem(item: any, categoryId: string): AdminMenuCategoryItem {
  const menuItem = item.menu_item || {}
  const priceLevels = menuItem.price_levels || {}

  return {
    id: item.id,
    menu_item_id: item.menu_item_id,
    category_id: categoryId,
    display_order: item.display_order || 0,
    is_featured: item.is_featured ?? false,
    menu_item: {
      id: menuItem.id || item.menu_item_id,
      name: menuItem.name || '',
      description: menuItem.description || null,
      image: menuItem.image || null,
      allergens: menuItem.allergens || null,
      meal_types: menuItem.meal_types || null,
      card_bg_color: menuItem.card_bg_color || null,
      // Base prices (L1)
      base_price: priceLevels.level_1_base ?? 0,
      base_cash_price: null,
      base_availability: true,
      // Price breakdown (all levels)
      price_levels: {
        level_1_base: priceLevels.level_1_base ?? 0,
        level_2_location_item: priceLevels.level_2_location_item ?? null,
        level_2_modifier: priceLevels.level_2_modifier ?? null,
        level_2_modifier_type: priceLevels.level_2_modifier_type ?? null,
        level_3_category: priceLevels.level_3_category ?? null,
        level_4_location_category: priceLevels.level_4_location_category ?? null,
        level_5_location_menu: priceLevels.level_5_location_menu ?? null,
      },
      // Computed effective values
      effective_price: menuItem.effective_price ?? priceLevels.level_1_base ?? 0,
      effective_cash_price: menuItem.effective_cash_price ?? null,
      effective_availability: menuItem.effective_availability ?? true,
      price_source: (menuItem.price_source as PriceSource) || 'base',
      // Override flags
      has_location_item_override: menuItem.has_location_item_override ?? false,
      has_category_override: menuItem.has_category_override ?? false,
      has_location_category_override: menuItem.has_location_category_override ?? false,
      has_location_menu_override: menuItem.has_location_menu_override ?? false,
      // Stock
      stock_tracking_mode: menuItem.stock_tracking_mode || null,
      current_stock: menuItem.current_stock ?? null,
      // Modifiers with location overrides
      modifier_groups: (menuItem.modifier_groups || []).map((mg: any) => ({
        id: mg.id,
        name: mg.name,
        min_selections: mg.min_selections ?? 0,
        max_selections: mg.max_selections ?? null,
        is_required: mg.is_required ?? false,
        is_active: mg.is_active ?? true,
        items: (mg.items || []).map((mgi: any) => ({
          id: mgi.id,
          name: mgi.name,
          price_modifier: mgi.price_modifier ?? 0,
          is_active: mgi.is_active ?? true,
          stock_tracking_mode: mgi.stock_tracking_mode || 'in_stock',
          current_stock: mgi.current_stock ?? null,
        })),
      })),
    },
  }
}

// ============================================================================
// MENU CRUD
// ============================================================================

export interface CreateMenuData {
  name: string
  description?: string | null
  image?: string | null
  location_id?: string | null
  is_active?: boolean
  display_order?: number
}

export async function createAdminMenu(
  merchantId: string,
  data: CreateMenuData
): Promise<{ data: AdminMenu | null; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  const { data: menu, error } = await supabase
    .from('menus')
    .insert({
      merchant_id: merchantId,
      name: data.name,
      description: data.description || null,
      image: data.image || null,
      location_id: data.location_id || null,
      is_active: data.is_active ?? true,
      display_order: data.display_order || 0,
    })
    .select(`
      id, name, description, image, is_active, location_id, created_at, updated_at,
      locations(name)
    `)
    .single()

  if (error) {
    console.error('[createAdminMenu] Error:', error)
    return { data: null, error: error.message }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Created Menu: ${data.name}`,
    actionCategory: 'menu',
    resourceType: 'menu',
    resourceId: menu.id,
    resourceName: data.name,
    locationId: data.location_id || undefined,
    changes: { after: data as any },
    metadata: {
      location_name: (menu as any).locations?.name,
      admin_action: true,
    },
  })

  return {
    data: {
      id: menu.id,
      name: menu.name,
      description: menu.description,
      image: menu.image,
      is_active: menu.is_active,
      is_global: !menu.location_id,
      location_id: menu.location_id,
      location_name: (menu as any).locations?.name || null,
      categories_count: 0,
      items_count: 0,
      schedules_count: 0,
      created_at: menu.created_at,
      updated_at: menu.updated_at,
    },
    error: null,
  }
}

export interface UpdateMenuData {
  name?: string
  description?: string | null
  image?: string | null
  is_active?: boolean
  display_order?: number
}

export async function updateAdminMenu(
  merchantId: string,
  menuId: string,
  data: UpdateMenuData
): Promise<{ data: AdminMenu | null; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Build update object
  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.image !== undefined) updateData.image = data.image
  if (data.is_active !== undefined) updateData.is_active = data.is_active
  if (data.display_order !== undefined) updateData.display_order = data.display_order

  const { data: menu, error } = await supabase
    .from('menus')
    .update(updateData)
    .eq('id', menuId)
    .eq('merchant_id', merchantId)
    .select(`
      id, name, description, image, is_active, location_id, created_at, updated_at,
      locations(name),
      menu_categories(category_id)
    `)
    .single()

  if (error) {
    console.error('[updateAdminMenu] Error:', error)
    return { data: null, error: error.message }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Updated Menu: ${menu.name}`,
    actionCategory: 'menu',
    resourceType: 'menu',
    resourceId: menuId,
    resourceName: menu.name,
    locationId: menu.location_id || undefined,
    changes: { after: data as any },
    metadata: {
      admin_action: true,
    },
  })

  return {
    data: {
      id: menu.id,
      name: menu.name,
      description: menu.description,
      image: menu.image,
      is_active: menu.is_active,
      is_global: !menu.location_id,
      location_id: menu.location_id,
      location_name: (menu as any).locations?.name || null,
      categories_count: (menu as any).menu_categories?.length || 0,
      items_count: 0,
      schedules_count: 0,
      created_at: menu.created_at,
      updated_at: menu.updated_at,
    },
    error: null,
  }
}

export async function deleteAdminMenu(
  merchantId: string,
  menuId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Fetch menu details before deletion for audit log
  const { data: menuToDelete } = await supabase
    .from('menus')
    .select('name, location_id')
    .eq('id', menuId)
    .single()

  // First delete menu_categories associations
  await supabase
    .from('menu_categories')
    .delete()
    .eq('menu_id', menuId)

  // Then delete the menu
  const { error } = await supabase
    .from('menus')
    .delete()
    .eq('id', menuId)
    .eq('merchant_id', merchantId)

  if (error) {
    console.error('[deleteAdminMenu] Error:', error)
    return { success: false, error: error.message }
  }

  if (menuToDelete) {
    await LogAuditEvent({
      merchantId,
      action: `Deleted Menu: ${menuToDelete.name}`,
      actionCategory: 'menu',
      resourceType: 'menu',
      resourceId: menuId,
      resourceName: menuToDelete.name,
      locationId: menuToDelete.location_id || undefined,
      severity: 'info',
      metadata: {
        admin_action: true,
      },
    })
  }

  return { success: true, error: null }
}

export async function toggleAdminMenuActive(
  merchantId: string,
  menuId: string
): Promise<{ data: AdminMenu | null; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Get current state
  const { data: current } = await supabase
    .from('menus')
    .select('is_active, name, location_id')
    .eq('id', menuId)
    .eq('merchant_id', merchantId)
    .single()

  if (!current) {
    return { data: null, error: 'Menu not found' }
  }

  const result = await updateAdminMenu(merchantId, menuId, { is_active: !current.is_active })
  
  // Audit log is handled inside updateAdminMenu, but we want a more specific message if possible.
  // Actually, updateAdminMenu logs "Updated Menu: {name}" with changes. 
  // We can leave it as is, or add a specific log here. 
  // Dashboard toggle uses: `Menu ${newStatus}: ${updatedMenu.name}`
  // To match dashboard, we might want to override or add another log.
  // But updateAdminMenu already logs, so creating another log might be spammy.
  // Dashboard's ToggleMenuActive uses LogAuditEvent directly and doesn't call UpdateMenu.
  // Since we call updateAdminMenu, we get the "Updated Menu" log which shows the change in `changes`.
  // That should be sufficient and consistent with "Updated Menu".
  
  return result
}

// ============================================================================
// CATEGORY CRUD
// ============================================================================

export interface CreateCategoryData {
  name: string
  description?: string | null
  image?: string | null
  location_id?: string | null
  is_active?: boolean
  display_order?: number
}

export async function createAdminCategory(
  merchantId: string,
  data: CreateCategoryData
): Promise<{ data: AdminCategory | null; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  const { data: category, error } = await supabase
    .from('categories')
    .insert({
      merchant_id: merchantId,
      name: data.name,
      description: data.description || null,
      image: data.image || null,
      location_id: data.location_id || null,
      is_active: data.is_active ?? true,
      is_global: !data.location_id,
      display_order: data.display_order || 0,
    })
    .select(`
      id, name, description, image, is_active, is_global, location_id, display_order, created_at,
      locations(name)
    `)
    .single()

  if (error) {
    console.error('[createAdminCategory] Error:', error)
    return { data: null, error: error.message }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Created Category: ${data.name}`,
    actionCategory: 'menu',
    resourceType: 'category',
    resourceId: category.id,
    resourceName: data.name,
    locationId: data.location_id || undefined,
    changes: { after: data as any },
    metadata: {
      location_name: (category as any).locations?.name,
      admin_action: true,
    },
  })

  return {
    data: {
      id: category.id,
      name: category.name,
      description: category.description,
      image: category.image,
      is_active: category.is_active,
      is_global: category.is_global ?? !category.location_id,
      location_id: category.location_id,
      location_name: (category as any).locations?.name || null,
      items_count: 0,
      display_order: category.display_order || 0,
      created_at: category.created_at,
    },
    error: null,
  }
}

export interface UpdateCategoryData {
  name?: string
  description?: string | null
  image?: string | null
  is_active?: boolean
  display_order?: number
}

export async function updateAdminCategory(
  merchantId: string,
  categoryId: string,
  data: UpdateCategoryData
): Promise<{ data: AdminCategory | null; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.image !== undefined) updateData.image = data.image
  if (data.is_active !== undefined) updateData.is_active = data.is_active
  if (data.display_order !== undefined) updateData.display_order = data.display_order

  const { data: category, error } = await supabase
    .from('categories')
    .update(updateData)
    .eq('id', categoryId)
    .eq('merchant_id', merchantId)
    .select(`
      id, name, description, image, is_active, is_global, location_id, display_order, created_at,
      locations(name),
      category_items(count)
    `)
    .single()

  if (error) {
    console.error('[updateAdminCategory] Error:', error)
    return { data: null, error: error.message }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Updated Category: ${category.name}`,
    actionCategory: 'menu',
    resourceType: 'category',
    resourceId: categoryId,
    resourceName: category.name,
    locationId: category.location_id || undefined,
    changes: { after: data as any },
    metadata: {
      admin_action: true,
    },
  })

  return {
    data: {
      id: category.id,
      name: category.name,
      description: category.description,
      image: category.image,
      is_active: category.is_active,
      is_global: category.is_global ?? !category.location_id,
      location_id: category.location_id,
      location_name: (category as any).locations?.name || null,
      items_count: (category as any).category_items?.length || 0,
      display_order: category.display_order || 0,
      created_at: category.created_at,
    },
    error: null,
  }
}

export async function deleteAdminCategory(
  merchantId: string,
  categoryId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Fetch category first to get name for logging
  const { data: category } = await supabase
    .from('categories')
    .select('name, location_id')
    .eq('id', categoryId)
    .single()

  // Delete category_items associations
  await supabase
    .from('category_items')
    .delete()
    .eq('category_id', categoryId)

  // Delete menu_categories associations
  await supabase
    .from('menu_categories')
    .delete()
    .eq('category_id', categoryId)

  // Delete the category
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', categoryId)
    .eq('merchant_id', merchantId)

  if (error) {
    console.error('[deleteAdminCategory] Error:', error)
    return { success: false, error: error.message }
  }

  if (category) {
    await LogAuditEvent({
      merchantId,
      action: `Deleted Category: ${category.name}`,
      actionCategory: 'menu',
      resourceType: 'category',
      resourceId: categoryId,
      resourceName: category.name,
      locationId: category.location_id || undefined,
      severity: 'info',
      metadata: {
        admin_action: true,
      },
    })
  }

  return { success: true, error: null }
}

// ============================================================================
// MENU-CATEGORY ASSOCIATIONS
// ============================================================================

export async function addCategoryToMenu(
  merchantId: string,
  menuId: string,
  categoryId: string,
  displayOrder?: number
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify menu and category belong to merchant
  const { data: menu } = await supabase
    .from('menus')
    .select('id, name, location_id')
    .eq('id', menuId)
    .eq('merchant_id', merchantId)
    .single()

  const { data: category } = await supabase
    .from('categories')
    .select('id, name')
    .eq('id', categoryId)
    .eq('merchant_id', merchantId)
    .single()

  if (!menu || !category) {
    return { success: false, error: 'Menu or category not found' }
  }

  // Check if already exists
  const { data: existing } = await supabase
    .from('menu_categories')
    .select('id')
    .eq('menu_id', menuId)
    .eq('category_id', categoryId)
    .single()

  if (existing) {
    return { success: true, error: null } // Already exists
  }

  const { error } = await supabase
    .from('menu_categories')
    .insert({
      merchant_id: merchantId,
      menu_id: menuId,
      category_id: categoryId,
      display_order: displayOrder || 0,
      is_active: true,
    })

  if (error) {
    console.error('[addCategoryToMenu] Error:', error)
    return { success: false, error: error.message }
  }

  await LogAuditEvent({
    merchantId,
    action: `Assigned Category "${category.name || 'Unknown'}" to Menu: ${menu.name || 'Unknown'}`,
    actionCategory: 'menu',
    resourceType: 'menu_category',
    resourceId: categoryId,
    locationId: menu.location_id || undefined,
    metadata: {
      menu_id: menuId,
      menu_name: menu.name,
      category_name: category.name,
      display_order: displayOrder,
      admin_action: true,
    },
  })

  return { success: true, error: null }
}

export async function removeCategoryFromMenu(
  merchantId: string,
  menuId: string,
  categoryId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify menu belongs to merchant
  const { data: menu } = await supabase
    .from('menus')
    .select('id, name, location_id')
    .eq('id', menuId)
    .eq('merchant_id', merchantId)
    .single()

  if (!menu) {
    return { success: false, error: 'Menu not found' }
  }

  const { error } = await supabase
    .from('menu_categories')
    .delete()
    .eq('menu_id', menuId)
    .eq('category_id', categoryId)

  if (error) {
    console.error('[removeCategoryFromMenu] Error:', error)
    return { success: false, error: error.message }
  }

  // Fetch category name
  const { data: category } = await supabase
    .from('categories')
    .select('name')
    .eq('id', categoryId)
    .single()

  await LogAuditEvent({
    merchantId,
    action: `Removed Category "${category?.name || 'Unknown'}" from Menu: ${menu.name || 'Unknown'}`,
    actionCategory: 'menu',
    resourceType: 'menu_category',
    resourceId: categoryId,
    locationId: menu.location_id || undefined,
    metadata: {
      menu_id: menuId,
      menu_name: menu.name,
      category_name: category?.name,
      admin_action: true,
    },
  })

  return { success: true, error: null }
}

export async function updateMenuCategoryOrder(
  merchantId: string,
  menuId: string,
  categoryOrders: Array<{ categoryId: string; displayOrder: number }>
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify menu belongs to merchant
  const { data: menu } = await supabase
    .from('menus')
    .select('id, name, location_id')
    .eq('id', menuId)
    .eq('merchant_id', merchantId)
    .single()

  if (!menu) {
    return { success: false, error: 'Menu not found' }
  }

  // Update each category's order
  for (const { categoryId, displayOrder } of categoryOrders) {
    const { error } = await supabase
      .from('menu_categories')
      .update({ display_order: displayOrder })
      .eq('menu_id', menuId)
      .eq('category_id', categoryId)

    if (error) {
      console.error('[updateMenuCategoryOrder] Error:', error)
      return { success: false, error: error.message }
    }
  }

  return { success: true, error: null }
}

// ============================================================================
// MENU ITEM CRUD
// ============================================================================

export interface CreateMenuItemData {
  name: string
  description?: string | null
  price: number
  cash_price?: number | null
  image?: string | null
  meal_types?: string[]
  allergens?: string[]
  card_bg_color?: string | null
  availability?: boolean
  stock_tracking_mode?: 'in_stock' | 'out_of_stock' | 'quantity' | null
  tax_category?: string
  is_tax_exempt?: boolean
  available_channels?: string[]
  modifier_group_ids?: string[]
}

export async function createAdminMenuItem(
  merchantId: string,
  data: CreateMenuItemData
): Promise<{ data: AdminMenuItem | null; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  const { data: item, error } = await supabase
    .from('menu_items')
    .insert({
      merchant_id: merchantId,
      name: data.name,
      description: data.description || null,
      price: data.price,
      cash_price: data.cash_price || null,
      image: data.image || null,
      meal_types: data.meal_types || [],
      allergens: data.allergens || [],
      card_bg_color: data.card_bg_color || null,
      availability: data.availability ?? true,
      stock_tracking_mode: data.stock_tracking_mode || null,
      tax_category: data.tax_category || 'standard',
      is_tax_exempt: data.is_tax_exempt ?? false,
      available_channels: data.available_channels || ['pos', 'online', 'kiosk'],
    })
    .select()
    .single()

  if (error) {
    console.error('[createAdminMenuItem] Error:', error)
    return { data: null, error: error.message }
  }

  // Handle modifier groups if provided
  if (data.modifier_group_ids && data.modifier_group_ids.length > 0) {
    const modifierInserts = data.modifier_group_ids.map((groupId, index) => ({
      merchant_id: merchantId,
      menu_item_id: item.id,
      modifier_group_id: groupId,
    }))

    const { error: modError } = await supabase
      .from('menu_item_modifier_groups')
      .insert(modifierInserts)

    if (modError) {
       console.error('[createAdminMenuItem] Failed to add modifiers:', modError)
       // We don't fail the whole request, but we log it. 
       // Optionally we could return a warning.
    }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Created Menu Item: ${data.name}`,
    actionCategory: 'menu',
    resourceType: 'menu_item',
    resourceId: item.id,
    resourceName: data.name,
    changes: { after: data as any },
    metadata: {
      admin_action: true,
    },
  })

  // Return in AdminMenuItem format
  return {
    data: {
      id: item.id,
      name: item.name,
      description: item.description,
      image: item.image,
      allergens: item.allergens,
      meal_types: item.meal_types,
      card_bg_color: item.card_bg_color,
      base_price: item.price,
      base_cash_price: item.cash_price,
      base_availability: item.availability,
      effective_price: item.price,
      effective_cash_price: item.cash_price,
      effective_availability: item.availability,
      price_source: 'base',
      has_location_override: false,
      tax_category: item.tax_category,
      is_tax_exempt: item.is_tax_exempt,
      available_channels: item.available_channels,
      effective_tax_category: item.tax_category,
      effective_is_tax_exempt: item.is_tax_exempt,
      effective_available_channels: item.available_channels,
      stock_tracking_mode: item.stock_tracking_mode,
      current_stock: null,
      categories: [],
      modifier_groups: [],
      modifier_groups_count: 0,
      location_override: null,
      created_at: item.created_at,
      updated_at: item.updated_at,
    },
    error: null,
  }
}

export interface UpdateMenuItemData {
  name?: string
  description?: string | null
  price?: number
  cash_price?: number | null
  image?: string | null
  meal_types?: string[]
  allergens?: string[]
  card_bg_color?: string | null
  availability?: boolean
  stock_tracking_mode?: 'in_stock' | 'out_of_stock' | 'quantity' | null
  tax_category?: string
  is_tax_exempt?: boolean
  available_channels?: string[]
}

export async function updateAdminMenuItem(
  merchantId: string,
  itemId: string,
  data: UpdateMenuItemData
): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.price !== undefined) updateData.price = data.price
  if (data.cash_price !== undefined) updateData.cash_price = data.cash_price
  if (data.image !== undefined) updateData.image = data.image
  if (data.meal_types !== undefined) updateData.meal_types = data.meal_types
  if (data.allergens !== undefined) updateData.allergens = data.allergens
  if (data.card_bg_color !== undefined) updateData.card_bg_color = data.card_bg_color
  if (data.availability !== undefined) updateData.availability = data.availability
  if (data.stock_tracking_mode !== undefined) updateData.stock_tracking_mode = data.stock_tracking_mode
  if (data.tax_category !== undefined) updateData.tax_category = data.tax_category
  if (data.is_tax_exempt !== undefined) updateData.is_tax_exempt = data.is_tax_exempt
  if (data.available_channels !== undefined) updateData.available_channels = data.available_channels

  const { data: item, error } = await supabase
    .from('menu_items')
    .update(updateData)
    .eq('id', itemId)
    .eq('merchant_id', merchantId)
    .select('id, name')
    .single()

  if (error) {
    console.error('[updateAdminMenuItem] Error:', error)
    return { data: null, error: error.message }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Updated Menu Item: ${item.name}`,
    actionCategory: 'menu',
    resourceType: 'menu_item',
    resourceId: itemId,
    resourceName: item.name,
    changes: { after: data as any },
    metadata: {
      admin_action: true,
    },
  })

  return { data: { id: item.id }, error: null }
}

export async function deleteAdminMenuItem(
  merchantId: string,
  itemId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Delete category_items associations
  await supabase
    .from('category_items')
    .delete()
    .eq('menu_item_id', itemId)

  // Delete location overrides
  await supabase
    .from('location_item_overrides')
    .delete()
    .eq('menu_item_id', itemId)

  // Delete the item
  const { data: item } = await supabase
    .from('menu_items')
    .select('name')
    .eq('id', itemId)
    .single()

  const { error } = await supabase
    .from('menu_items')
    .delete()
    .eq('id', itemId)
    .eq('merchant_id', merchantId)

  if (error) {
    console.error('[deleteAdminMenuItem] Error:', error)
    return { success: false, error: error.message }
  }

  if (item) {
    await LogAuditEvent({
      merchantId,
      action: `Deleted Menu Item: ${item.name}`,
      actionCategory: 'menu',
      resourceType: 'menu_item',
      resourceId: itemId,
      resourceName: item.name,
      severity: 'info',
      metadata: {
        admin_action: true,
      },
    })
  }

  return { success: true, error: null }
}

// ============================================================================
// CATEGORY-ITEM ASSOCIATIONS
// ============================================================================

export async function addItemToCategory(
  merchantId: string,
  categoryId: string,
  itemId: string,
  displayOrder?: number,
  customPrice?: number | null
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify category and item belong to merchant
  const { data: category } = await supabase
    .from('categories')
    .select('id, name')
    .eq('id', categoryId)
    .eq('merchant_id', merchantId)
    .single()

  const { data: item } = await supabase
    .from('menu_items')
    .select('id, name')
    .eq('id', itemId)
    .eq('merchant_id', merchantId)
    .single()

  if (!category || !item) {
    return { success: false, error: 'Category or item not found' }
  }

  // Check if already exists
  const { data: existing } = await supabase
    .from('category_items')
    .select('id')
    .eq('category_id', categoryId)
    .eq('menu_item_id', itemId)
    .eq('merchant_id', merchantId)
    .maybeSingle()

  if (existing) {
    return { success: true, error: null }
  }

  const { error } = await supabase
    .from('category_items')
    .insert({
      merchant_id: merchantId,
      category_id: categoryId,
      menu_item_id: itemId,
      display_order: displayOrder || 0,
      is_featured: false,
      is_available: true,
      custom_price: customPrice || null,
    })

  if (error) {
    console.error('[addItemToCategory] Error:', error)
    return { success: false, error: error.message }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Assigned Item "${item.name}" to Category: ${category.name}`,
    actionCategory: 'menu',
    resourceType: 'category_item',
    resourceId: itemId,
    metadata: {
      category_id: categoryId,
      category_name: category.name,
      item_name: item.name,
      display_order: displayOrder,
      custom_price: customPrice,
      admin_action: true,
    },
  })

  return { success: true, error: null }
}

export async function removeItemFromCategory(
  merchantId: string,
  categoryId: string,
  itemId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify category belongs to merchant
  const { data: category } = await supabase
    .from('categories')
    .select('id, name')
    .eq('id', categoryId)
    .eq('merchant_id', merchantId)
    .single()

  if (!category) {
    return { success: false, error: 'Category not found' }
  }

  const { error } = await supabase
    .from('category_items')
    .delete()
    .eq('category_id', categoryId)
    .eq('menu_item_id', itemId)

  if (error) {
    console.error('[removeItemFromCategory] Error:', error)
    return { success: false, error: error.message }
  }

  // Get item name for log
  const { data: item } = await supabase
    .from('menu_items')
    .select('name')
    .eq('id', itemId)
    .single()

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Removed Item "${item?.name || 'Unknown'}" from Category "${category.name || 'Unknown'}"`,
    actionCategory: 'menu',
    resourceType: 'category_item',
    resourceId: itemId,
    resourceName: item?.name,
    metadata: {
      category_id: categoryId,
      category_name: category.name,
      item_name: item?.name,
      admin_action: true,
    },
  })

  return { success: true, error: null }
}

export async function updateCategoryItemOrder(
  merchantId: string,
  categoryId: string,
  itemOrders: Array<{ itemId: string; displayOrder: number }>
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify category belongs to merchant
  const { data: category } = await supabase
    .from('categories')
    .select('id, name')
    .eq('id', categoryId)
    .eq('merchant_id', merchantId)
    .single()

  if (!category) {
    return { success: false, error: 'Category not found' }
  }

  for (const { itemId, displayOrder } of itemOrders) {
    const { error } = await supabase
      .from('category_items')
      .update({ display_order: displayOrder })
      .eq('category_id', categoryId)
      .eq('menu_item_id', itemId)

    if (error) {
      console.error('[updateCategoryItemOrder] Error:', error)
      return { success: false, error: error.message }
    }
  }

  return { success: true, error: null }
}

export async function updateCategoryItemPrice(
  merchantId: string,
  categoryId: string,
  itemId: string,
  customPrice: number | null,
  customCashPrice?: number | null
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify category belongs to merchant
  const { data: category } = await supabase
    .from('categories')
    .select('id, name')
    .eq('id', categoryId)
    .eq('merchant_id', merchantId)
    .single()

  if (!category) {
    return { success: false, error: 'Category not found' }
  }

  const { error } = await supabase
    .from('category_items')
    .update({
      custom_price: customPrice,
      custom_cash_price: customCashPrice,
    })
    .eq('category_id', categoryId)
    .eq('menu_item_id', itemId)

  if (error) {
    console.error('[updateCategoryItemPrice] Error:', error)
    return { success: false, error: error.message }
  }

  // Get item name
  const { data: item } = await supabase
    .from('menu_items')
    .select('name')
    .eq('id', itemId)
    .single()

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Updated Category Item Price: "${item?.name || 'Unknown'}" (Category: "${category.name || 'Unknown'}")`,
    actionCategory: 'menu',
    resourceType: 'category_item',
    resourceId: itemId,
    resourceName: item?.name,
    changes: { after: { customPrice, customCashPrice } },
    metadata: {
      category_id: categoryId,
      category_name: category.name,
      admin_action: true,
    },
  })

  return { success: true, error: null }
}

// ============================================================================
// LOCATION ITEM OVERRIDES (L2)
// ============================================================================

export interface LocationItemOverrideData {
  custom_price?: number | null
  custom_cash_price?: number | null
  is_available?: boolean
  stock_tracking_mode?: 'in_stock' | 'out_of_stock' | 'quantity' | null
  current_stock?: number | null
  tax_category?: string | null
  is_tax_exempt?: boolean | null
  available_channels?: string[] | null
}

export async function getAdminLocationItemOverride(
  merchantId: string,
  locationId: string,
  itemId: string
): Promise<LocationItemOverrideData | null> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Verify item belongs to merchant
  const { data: item } = await supabase
    .from('menu_items')
    .select('id')
    .eq('id', itemId)
    .eq('merchant_id', merchantId)
    .single()

  if (!item) return null

  const { data: override } = await supabase
    .from('location_item_overrides')
    .select('*')
    .eq('location_id', locationId)
    .eq('menu_item_id', itemId)
    .single()

  return override || null
}

export async function upsertAdminLocationItemOverride(
  merchantId: string,
  locationId: string,
  itemId: string,
  data: LocationItemOverrideData
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify item belongs to merchant
  const { data: item } = await supabase
    .from('menu_items')
    .select('id, name')
    .eq('id', itemId)
    .eq('merchant_id', merchantId)
    .single()

  if (!item) {
    return { success: false, error: 'Item not found' }
  }

  // Verify location belongs to merchant
  const { data: location } = await supabase
    .from('locations')
    .select('id, name')
    .eq('id', locationId)
    .eq('merchant_id', merchantId)
    .single()

  if (!location) {
    return { success: false, error: 'Location not found' }
  }

  // Check if override exists
  const { data: existing } = await supabase
    .from('location_item_overrides')
    .select('id')
    .eq('location_id', locationId)
    .eq('menu_item_id', itemId)
    .single()

  if (existing) {
    // Update existing override
    const { error } = await supabase
      .from('location_item_overrides')
      .update({
        custom_price: data.custom_price,
        custom_cash_price: data.custom_cash_price,
        is_available: data.is_available,
        stock_tracking_mode: data.stock_tracking_mode,
        current_stock: data.current_stock,
        tax_category: data.tax_category,
        is_tax_exempt: data.is_tax_exempt,
        available_channels: data.available_channels,
      })
      .eq('id', existing.id)

    if (error) {
      console.error('[upsertAdminLocationItemOverride] Update error:', error)
      return { success: false, error: error.message }
    }
  } else {
    // Create new override
    const { error } = await supabase
      .from('location_item_overrides')
      .insert({
        location_id: locationId,
        menu_item_id: itemId,
        custom_price: data.custom_price,
        custom_cash_price: data.custom_cash_price,
        is_available: data.is_available ?? true,
        stock_tracking_mode: data.stock_tracking_mode,
        current_stock: data.current_stock,
        tax_category: data.tax_category,
        is_tax_exempt: data.is_tax_exempt,
        available_channels: data.available_channels,
      })

    if (error) {
      console.error('[upsertAdminLocationItemOverride] Insert error:', error)
      return { success: false, error: error.message }
    }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Overridden Item "${item.name}" (Location: ${location.name || 'Unknown'})`,
    actionCategory: 'menu',
    resourceType: 'menu_item',
    resourceId: itemId,
    resourceName: item.name,
    locationId,
    changes: { after: data as any },
    metadata: {
      location_name: location.name,
      admin_action: true,
    },
  })

  return { success: true, error: null }
}

export async function deleteAdminLocationItemOverride(
  merchantId: string,
  locationId: string,
  itemId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify item belongs to merchant
  const { data: item } = await supabase
    .from('menu_items')
    .select('id, name')
    .eq('id', itemId)
    .eq('merchant_id', merchantId)
    .single()

  if (!item) {
    return { success: false, error: 'Item not found' }
  }

  const { error } = await supabase
    .from('location_item_overrides')
    .delete()
    .eq('location_id', locationId)
    .eq('menu_item_id', itemId)

  if (error) {
    console.error('[deleteAdminLocationItemOverride] Error:', error)
    return { success: false, error: error.message }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Removed Override for Item "${item.name}"`,
    actionCategory: 'menu',
    resourceType: 'menu_item',
    resourceId: itemId,
    resourceName: item.name,
    locationId,
    severity: 'info',
    metadata: {
      admin_action: true,
    },
  })

  return { success: true, error: null }
}

// ============================================================================
// LOCATION CATEGORY OVERRIDES
// ============================================================================

export interface LocationCategoryOverrideData {
  is_active?: boolean
  display_order?: number | null
  custom_title?: string | null
  custom_subtitle?: string | null
  custom_image?: string | null
}

export async function upsertAdminLocationCategoryOverride(
  merchantId: string,
  locationId: string,
  categoryId: string,
  data: LocationCategoryOverrideData
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify category belongs to merchant
  const { data: category } = await supabase
    .from('categories')
    .select('id, name')
    .eq('id', categoryId)
    .eq('merchant_id', merchantId)
    .single()

  if (!category) {
    return { success: false, error: 'Category not found' }
  }

  // Check if override exists
  const { data: existing } = await supabase
    .from('location_category_overrides')
    .select('id')
    .eq('location_id', locationId)
    .eq('category_id', categoryId)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('location_category_overrides')
      .update({
        is_active: data.is_active,
        display_order: data.display_order,
        custom_title: data.custom_title,
        custom_subtitle: data.custom_subtitle,
        custom_image: data.custom_image,
      })
      .eq('id', existing.id)

    if (error) {
      console.error('[upsertAdminLocationCategoryOverride] Update error:', error)
      return { success: false, error: error.message }
    }
  } else {
    const { error } = await supabase
      .from('location_category_overrides')
      .insert({
        location_id: locationId,
        category_id: categoryId,
        is_active: data.is_active ?? true,
        display_order: data.display_order,
        custom_title: data.custom_title,
        custom_subtitle: data.custom_subtitle,
        custom_image: data.custom_image,
      })

    if (error) {
      console.error('[upsertAdminLocationCategoryOverride] Insert error:', error)
      return { success: false, error: error.message }
    }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Overridden Category "${category.name || 'Unknown'}" (Location Override)`,
    actionCategory: 'menu',
    resourceType: 'category',
    resourceId: categoryId,
    resourceName: category.name || 'Unknown',
    locationId,
    changes: { after: data as any },
    metadata: {
      admin_action: true,
    },
  })

  return { success: true, error: null }
}

export async function deleteAdminLocationCategoryOverride(
  merchantId: string,
  locationId: string,
  categoryId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('location_category_overrides')
    .delete()
    .eq('location_id', locationId)
    .eq('category_id', categoryId)

  if (error) {
    console.error('[deleteAdminLocationCategoryOverride] Error:', error)
    return { success: false, error: error.message }
  }

  // Fetch category name
  const { data: category } = await supabase
    .from('categories')
    .select('name')
    .eq('id', categoryId)
    .single()

  await LogAuditEvent({
    merchantId,
    action: `Removed Override for Category "${category?.name || 'Unknown'}"`,
    actionCategory: 'menu',
    resourceType: 'category',
    resourceId: categoryId,
    resourceName: category?.name,
    locationId,
    severity: 'info',
    metadata: {
      admin_action: true,
    },
  })

  return { success: true, error: null }
}

// ============================================================================
// HELPER QUERIES
// ============================================================================

export async function getAdminAvailableCategoriesForMenu(
  merchantId: string,
  menuId: string,
  locationId?: string | null
): Promise<AdminCategory[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Get all categories for merchant
  const allCategories = await getAdminCategories(merchantId, locationId)

  // Get categories already in this menu
  const { data: menuCategories } = await supabase
    .from('menu_categories')
    .select('category_id')
    .eq('menu_id', menuId)

  const usedCategoryIds = new Set((menuCategories || []).map((mc) => mc.category_id))

  // Return categories not in the menu
  return allCategories.filter((cat) => !usedCategoryIds.has(cat.id))
}

export async function getAdminAvailableItemsForCategory(
  merchantId: string,
  categoryId: string
): Promise<Array<{ id: string; name: string; price: number; image: string | null }>> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Get all items for merchant
  const { data: allItems } = await supabase
    .from('menu_items')
    .select('id, name, price, image')
    .eq('merchant_id', merchantId)
    .order('name')

  // Get items already in this category
  const { data: categoryItems } = await supabase
    .from('category_items')
    .select('menu_item_id')
    .eq('category_id', categoryId)

  const usedItemIds = new Set((categoryItems || []).map((ci) => ci.menu_item_id))

  // Return items not in the category
  return (allItems || []).filter((item) => !usedItemIds.has(item.id))
}

// ============================================================================
// STATS
// ============================================================================

export interface AdminMenuStats {
  totalItems: number
  activeItems: number
  itemsWithOverrides: number
  totalCategories: number
  activeCategories: number
  totalModifierGroups: number
}

export async function getAdminMenuStats(
  merchantId: string,
  locationId?: string | null
): Promise<AdminMenuStats> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const effectiveLocationId = locationId === 'all' ? null : locationId

  // Get items count
  const { count: totalItems } = await supabase
    .from('menu_items')
    .select('*', { count: 'exact', head: true })
    .eq('merchant_id', merchantId)

  // Get active items count
  const { count: activeItems } = await supabase
    .from('menu_items')
    .select('*', { count: 'exact', head: true })
    .eq('merchant_id', merchantId)
    .eq('availability', true)

  // Get items with location overrides
  let itemsWithOverrides = 0
  if (effectiveLocationId) {
    const { count } = await supabase
      .from('location_item_overrides')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', effectiveLocationId)
    itemsWithOverrides = count || 0
  }

  // Get categories count
  let categoriesQuery = supabase
    .from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('merchant_id', merchantId)

  if (effectiveLocationId) {
    categoriesQuery = categoriesQuery.or(`location_id.is.null,location_id.eq.${effectiveLocationId}`)
  }
  const { count: totalCategories } = await categoriesQuery

  // Get active categories
  let activeCategoriesQuery = supabase
    .from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('merchant_id', merchantId)
    .eq('is_active', true)

  if (effectiveLocationId) {
    activeCategoriesQuery = activeCategoriesQuery.or(`location_id.is.null,location_id.eq.${effectiveLocationId}`)
  }
  const { count: activeCategories } = await activeCategoriesQuery

  // Get modifier groups count
  let modifiersQuery = supabase
    .from('modifier_groups')
    .select('*', { count: 'exact', head: true })
    .eq('merchant_id', merchantId)

  if (effectiveLocationId) {
    modifiersQuery = modifiersQuery.or(`location_id.is.null,location_id.eq.${effectiveLocationId}`)
  }
  const { count: totalModifierGroups } = await modifiersQuery

  return {
    totalItems: totalItems || 0,
    activeItems: activeItems || 0,
    itemsWithOverrides,
    totalCategories: totalCategories || 0,
    activeCategories: activeCategories || 0,
    totalModifierGroups: totalModifierGroups || 0,
  }
}

// ============================================================================
// MODIFIER GROUP CRUD
// ============================================================================

export interface CreateModifierGroupData {
  name: string
  description?: string | null
  is_required?: boolean
  min_selections?: number
  max_selections?: number | null
  location_id?: string | null
  is_active?: boolean
}

export async function createAdminModifierGroup(
  merchantId: string,
  data: CreateModifierGroupData
): Promise<{ data: AdminModifierGroup | null; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  const { data: group, error } = await supabase
    .from('modifier_groups')
    .insert({
      merchant_id: merchantId,
      name: data.name,
      description: data.description || null,
      is_required: data.is_required ?? false,
      min_selections: data.min_selections ?? 0,
      max_selections: data.max_selections ?? null,
      location_id: data.location_id || null,
      is_active: data.is_active ?? true,
    })
    .select(`
      id,
      name,
      description,
      is_required,
      is_active,
      min_selections,
      max_selections,
      location_id,
      created_at
    `)
    .single()

  if (error) {
    console.error('[createAdminModifierGroup] Error:', error)
    return { data: null, error: error.message }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Created Modifier Group: ${data.name}`,
    actionCategory: 'menu',
    resourceType: 'modifier_group',
    resourceId: group.id,
    resourceName: data.name,
    locationId: data.location_id || undefined,
    changes: { after: data as any },
    metadata: {
      admin_action: true,
    },
  })

  return {
    data: {
      id: group.id,
      name: group.name,
      description: group.description,
      is_required: group.is_required,
      is_active: group.is_active,
      min_selections: group.min_selections || 0,
      max_selections: group.max_selections,
      items_count: 0,
      is_global: !group.location_id,
      location_id: group.location_id,
      created_at: group.created_at,
    },
    error: null,
  }
}

export interface UpdateModifierGroupData {
  name?: string
  description?: string | null
  is_required?: boolean
  min_selections?: number
  max_selections?: number | null
  is_active?: boolean
}

export async function updateAdminModifierGroup(
  merchantId: string,
  groupId: string,
  data: UpdateModifierGroupData
): Promise<{ data: AdminModifierGroup | null; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.is_required !== undefined) updateData.is_required = data.is_required
  if (data.min_selections !== undefined) updateData.min_selections = data.min_selections
  if (data.max_selections !== undefined) updateData.max_selections = data.max_selections
  if (data.is_active !== undefined) updateData.is_active = data.is_active

  const { data: group, error } = await supabase
    .from('modifier_groups')
    .update(updateData)
    .eq('id', groupId)
    .eq('merchant_id', merchantId)
    .select(`
      id,
      name,
      description,
      is_required,
      is_active,
      min_selections,
      max_selections,
      location_id,
      created_at,
      modifier_group_items(count)
    `)
    .single()

  if (error) {
    console.error('[updateAdminModifierGroup] Error:', error)
    return { data: null, error: error.message }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Updated Modifier Group: ${group.name}`,
    actionCategory: 'menu',
    resourceType: 'modifier_group',
    resourceId: groupId,
    resourceName: group.name,
    locationId: group.location_id || undefined,
    changes: { after: data as any },
    metadata: {
      admin_action: true,
    },
  })

  return {
    data: {
      id: group.id,
      name: group.name,
      description: group.description,
      is_required: group.is_required,
      is_active: group.is_active,
      min_selections: group.min_selections || 0,
      max_selections: group.max_selections,
      items_count: (group as any).modifier_group_items?.[0]?.count ?? 0,
      is_global: !group.location_id,
      location_id: group.location_id,
      created_at: group.created_at,
    },
    error: null,
  }
}

export async function deleteAdminModifierGroup(
  merchantId: string,
  groupId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Fetch group first for logging
  const { data: group } = await supabase
    .from('modifier_groups')
    .select('name, location_id')
    .eq('id', groupId)
    .single()

  // First delete all modifier items in this group (cascade)
  await supabase
    .from('modifier_group_items')
    .delete()
    .eq('modifier_group_id', groupId)

  // Then delete the group
  const { error } = await supabase
    .from('modifier_groups')
    .delete()
    .eq('id', groupId)
    .eq('merchant_id', merchantId)

  if (error) {
    console.error('[deleteAdminModifierGroup] Error:', error)
    return { success: false, error: error.message }
  }

  if (group) {
    await LogAuditEvent({
      merchantId,
      action: `Deleted Modifier Group: ${group.name}`,
      actionCategory: 'menu',
      resourceType: 'modifier_group',
      resourceId: groupId,
      resourceName: group.name,
      locationId: group.location_id || undefined,
      severity: 'info',
      metadata: {
        admin_action: true,
      },
    })
  }

  return { success: true, error: null }
}

// ============================================================================
// MODIFIER ITEM CRUD
// ============================================================================

export interface CreateModifierItemData {
  name: string
  description?: string | null
  price_modifier: number
  is_default?: boolean
  is_active?: boolean
  display_order?: number
}

export async function createAdminModifierItem(
  merchantId: string,
  groupId: string,
  data: CreateModifierItemData
): Promise<{ data: AdminModifierItem | null; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify group belongs to merchant
  const { data: group } = await supabase
    .from('modifier_groups')
    .select('id, name')
    .eq('id', groupId)
    .eq('merchant_id', merchantId)
    .single()

  if (!group) {
    return { data: null, error: 'Modifier group not found' }
  }

  const { data: item, error } = await supabase
    .from('modifier_group_items')
    .insert({
      modifier_group_id: groupId,
      name: data.name,
      description: data.description || null,
      price_modifier: data.price_modifier,
      is_default: data.is_default ?? false,
      merchant_id : merchantId,
      is_active: data.is_active ?? true,
      display_order: data.display_order || 0,
    })
    .select()
    .single()

  if (error) {
    console.error('[createAdminModifierItem] Error:', error)
    return { data: null, error: error.message }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Created Modifier Option: ${data.name} (in ${group.name || 'Unknown Group'})`,
    actionCategory: 'menu',
    resourceType: 'modifier_group', // Logging as modifier_group as items are part of it
    resourceId: groupId,
    resourceName: data.name,
    changes: { after: data as any },
    metadata: {
      option_id: item.id,
      modifier_group_name: group.name,
      admin_action: true,
    },
  })

  return {
    data: {
      id: item.id,
      name: item.name,
      description: item.description,
      price_modifier: Number(item.price_modifier || 0),
      is_default: item.is_default,
      is_active: item.is_active,
      display_order: item.display_order || 0,
    },
    error: null,
  }
}

export interface UpdateModifierItemData {
  name?: string
  description?: string | null
  price_modifier?: number
  is_default?: boolean
  is_active?: boolean
  display_order?: number
}

export async function updateAdminModifierItem(
  merchantId: string,
  itemId: string,
  data: UpdateModifierItemData
): Promise<{ data: AdminModifierItem | null; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify item belongs to merchant's group
  const { data: item } = await supabase
    .from('modifier_group_items')
    .select('modifier_group_id, modifier_groups!inner(merchant_id)')
    .eq('id', itemId)
    .single()

  if (!item || (item as any).modifier_groups?.merchant_id !== merchantId) {
    return { data: null, error: 'Modifier item not found' }
  }

  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.price_modifier !== undefined) updateData.price_modifier = data.price_modifier
  if (data.is_default !== undefined) updateData.is_default = data.is_default
  if (data.is_active !== undefined) updateData.is_active = data.is_active
  if (data.display_order !== undefined) updateData.display_order = data.display_order

  const { data: updatedItem, error } = await supabase
    .from('modifier_group_items')
    .update(updateData)
    .eq('id', itemId)
    .select()
    .single()

  if (error) {
    console.error('[updateAdminModifierItem] Error:', error)
    return { data: null, error: error.message }
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId,
    action: `Updated Modifier Option: ${updatedItem.name}`,
    actionCategory: 'menu',
    resourceType: 'modifier_group',
    resourceId: item.modifier_group_id,
    resourceName: updatedItem.name,
    changes: { after: data as any },
    metadata: {
      option_id: itemId,
      admin_action: true,
    },
  })

  return {
    data: {
      id: updatedItem.id,
      name: updatedItem.name,
      description: updatedItem.description,
      price_modifier: Number(updatedItem.price_modifier || 0),
      is_default: updatedItem.is_default,
      is_active: updatedItem.is_active,
      display_order: updatedItem.display_order || 0,
    },
    error: null,
  }
}

export async function deleteAdminModifierItem(
  merchantId: string,
  itemId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify item belongs to merchant's group
  const { data: item } = await supabase
    .from('modifier_group_items')
    .select('id, name, modifier_group_id, modifier_groups!inner(merchant_id)')
    .eq('id', itemId)
    .single()

  if (!item || (item as any).modifier_groups?.merchant_id !== merchantId) {
    return { success: false, error: 'Modifier item not found' }
  }

  const { error } = await supabase
    .from('modifier_group_items')
    .delete()
    .eq('id', itemId)

  if (error) {
    console.error('[deleteAdminModifierItem] Error:', error)
    return { success: false, error: error.message }
  }

  await LogAuditEvent({
    merchantId,
    action: `Deleted Modifier Option: ${item.name}`,
    actionCategory: 'menu',
    resourceType: 'modifier_group',
    resourceId: item.modifier_group_id,
    resourceName: item.name,
    severity: 'info',
    metadata: {
      option_id: itemId,
      admin_action: true,
    },
  })

  return { success: true, error: null }
}

// ============================================================================
// AUDIT INFORMATION
// ============================================================================

/**
 * Helper function to fetch last edit information from audit_logs
 * Returns who last edited a resource and when
 */
export async function getLastEditInfo(
  resourceType: 'menu_item' | 'category' | 'menu' | 'modifier_group',
  resourceId: string
): Promise<{
  updated_by: { id: string; name: string; email: string } | null
  updated_at: string | null
}> {
  const supabase = createServerSupabaseClient()

  // Query audit_logs table for the last edit action on this resource
  const { data } = await supabase
    .from('audit_logs')
    .select('created_at, actor_user_id, actor_name, actor_email')
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (data) {
    return {
      updated_by: {
        id: data.actor_user_id || '',
        name: data.actor_name || 'Unknown',
        email: data.actor_email || '',
      },
      updated_at: data.created_at,
    }
  }

  return { updated_by: null, updated_at: null }
}

/**
 * Fetch audit information for a menu item including last editor from audit_logs
 */
export async function getMenuItemAuditInfo(
  merchantId: string,
  itemId: string
): Promise<AuditInfo | null> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Get basic timestamps from menu_items
  const { data: item, error } = await supabase
    .from('menu_items')
    .select('created_at, updated_at, merchant_id')
    .eq('id', itemId)
    .single()

  if (error || !item || item.merchant_id !== merchantId) {
    return null
  }

  // Get last editor from audit_logs
  const { updated_by, updated_at } = await getLastEditInfo('menu_item', itemId)

  return {
    created_at: item.created_at,
    updated_at: updated_at || item.updated_at,
    updated_by,
    admin_notes: null, // Will be populated when admin_notes field is added to DB
  }
}

/**
 * Fetch audit information for a category including last editor from audit_logs
 */
export async function getCategoryAuditInfo(
  merchantId: string,
  categoryId: string
): Promise<AuditInfo | null> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Get basic timestamps and created_by from categories
  const { data: category, error } = await supabase
    .from('categories')
    .select('created_at, updated_at, merchant_id, created_by')
    .eq('id', categoryId)
    .single()

  if (error || !category || category.merchant_id !== merchantId) {
    return null
  }

  // Get last editor from audit_logs
  const { updated_by, updated_at } = await getLastEditInfo('category', categoryId)

  return {
    created_at: category.created_at,
    updated_at: updated_at || category.updated_at,
    updated_by,
    admin_notes: null, // Will be populated when admin_notes field is added to DB
  }
}

/**
 * Fetch audit information for a menu including last editor from audit_logs
 */
export async function getMenuAuditInfo(
  merchantId: string,
  menuId: string
): Promise<AuditInfo | null> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Get basic timestamps and created_by from menus
  const { data: menu, error } = await supabase
    .from('menus')
    .select('created_at, updated_at, merchant_id, created_by')
    .eq('id', menuId)
    .single()

  if (error || !menu || menu.merchant_id !== merchantId) {
    return null
  }

  // Get last editor from audit_logs
  const { updated_by, updated_at } = await getLastEditInfo('menu', menuId)

  return {
    created_at: menu.created_at,
    updated_at: updated_at || menu.updated_at,
    updated_by,
    admin_notes: null, // Will be populated when admin_notes field is added to DB
  }
}

/**
 * Fetch audit information for a modifier group including last editor from audit_logs
 */
export async function getModifierGroupAuditInfo(
  merchantId: string,
  groupId: string
): Promise<AuditInfo | null> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Get basic timestamps and created_by from modifier_groups
  const { data: group, error } = await supabase
    .from('modifier_groups')
    .select('created_at, updated_at, merchant_id, created_by')
    .eq('id', groupId)
    .single()

  if (error || !group || group.merchant_id !== merchantId) {
    return null
  }

  // Get last editor from audit_logs
  const { updated_by, updated_at } = await getLastEditInfo('modifier_group', groupId)

  return {
    created_at: group.created_at,
    updated_at: updated_at || group.updated_at,
    updated_by,
    admin_notes: null, // Will be populated when admin_notes field is added to DB
  }
}

/**
 * Update admin notes for a resource
 * Note: This requires admin_notes column to exist in the database tables
 * For now, returns success as placeholder - will work when DB migration is applied
 */
export async function updateAdminNotes(
  merchantId: string,
  resourceType: 'menu_item' | 'category' | 'menu' | 'modifier_group',
  resourceId: string,
  notes: string | null
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Map resource type to table name
  const tableMap: Record<string, string> = {
    menu_item: 'menu_items',
    category: 'categories',
    menu: 'menus',
    modifier_group: 'modifier_groups',
  }

  const tableName = tableMap[resourceType]
  if (!tableName) {
    return { success: false, error: 'Invalid resource type' }
  }

  // Note: admin_notes column needs to be added to the database tables via migration
  // For now, we'll just verify the resource exists and belongs to merchant
  const { data, error: fetchError } = await supabase
    .from(tableName)
    .select('id, merchant_id')
    .eq('id', resourceId)
    .single()

  if (fetchError || !data) {
    return { success: false, error: 'Resource not found' }
  }

  if ((data as any).merchant_id !== merchantId) {
    return { success: false, error: 'Resource does not belong to merchant' }
  }

  // The actual update would be:
  // await supabase.from(tableName).update({ admin_notes: notes }).eq('id', resourceId)
  // This will work once the admin_notes column is added to the tables

  // For now, log the intent and return success
  console.log(`[updateAdminNotes] Would update ${tableName}.${resourceId} with notes: ${notes?.substring(0, 50)}...`)

  return { success: true, error: null }
}

// ============================================================================
// ITEM-MODIFIER GROUP ASSIGNMENT
// ============================================================================

export async function getItemModifierGroups(
  merchantId: string,
  itemId: string
): Promise<AdminMenuItemModifierGroup[]> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Verify item belongs to merchant
  const { data: menuItem } = await supabase
    .from('menu_items')
    .select('id')
    .eq('id', itemId)
    .eq('merchant_id', merchantId)
    .single()

  if (!menuItem) {
    return []
  }

  // Query item_modifier_groups junction table with modifier group details
  const { data: assignments, error } = await supabase
    .from('menu_item_modifier_groups')
    .select(`
      modifier_groups!inner(
        id,
        name,
        is_required,
        modifier_group_items(
          id,
          name,
          price_modifier,
          is_active
        )
      )
    `)
    .eq('menu_item_id', itemId)
    // .order('sort_order', { ascending: true })

  if (error) {
    console.error('[getItemModifierGroups] Error:', error)
    return []
  }

  return (assignments || []).map((assignment: any) => ({
    id: assignment.modifier_groups.id,
    name: assignment.modifier_groups.name,
    is_required: assignment.modifier_groups.is_required,
    items_count: assignment.modifier_groups.modifier_group_items?.length || 0,
    sort_order: assignment.sort_order || 0,
    items: (assignment.modifier_groups.modifier_group_items || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      price_modifier: Number(item.price_modifier || 0),
      is_active: item.is_active,
    })),
  }))
}

export async function assignModifierGroupToItem(
  merchantId: string,
  itemId: string,
  modifierGroupId: string,
  sortOrder?: number
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify item belongs to merchant
  const { data: menuItem } = await supabase
    .from('menu_items')
    .select('id')
    .eq('id', itemId)
    .eq('merchant_id', merchantId)
    .single()

  if (!menuItem) {
    return { success: false, error: 'Menu item not found' }
  }

  // Verify modifier group belongs to merchant
  const { data: modifierGroup } = await supabase
    .from('modifier_groups')
    .select('id')
    .eq('id', modifierGroupId)
    .eq('merchant_id', merchantId)
    .single()

  if (!modifierGroup) {
    return { success: false, error: 'Modifier group not found' }
  }

  // Check if already assigned
  const { data: existing } = await supabase
    .from('menu_item_modifier_groups')
    .select('id')
    .eq('menu_item_id', itemId)
    .eq('modifier_group_id', modifierGroupId)
    .single()

  if (existing) {
    // Already assigned, return success
    return { success: true, error: null }
  }

  // Insert the assignment
  const { error } = await supabase
    .from('menu_item_modifier_groups')
    .insert({
      merchant_id: merchantId,
      menu_item_id: itemId,
      modifier_group_id: modifierGroupId,
    })

  if (error) {
    console.error('[assignModifierGroupToItem] Error:', error)
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

export async function removeModifierGroupFromItem(
  merchantId: string,
  itemId: string,
  modifierGroupId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify item belongs to merchant
  const { data: menuItem } = await supabase
    .from('menu_items')
    .select('id')
    .eq('id', itemId)
    .eq('merchant_id', merchantId)
    .single()

  if (!menuItem) {
    return { success: false, error: 'Menu item not found' }
  }

  // Delete the assignment
  const { error } = await supabase
    .from('menu_item_modifier_groups')
    .delete()
    .eq('menu_item_id', itemId)
    .eq('modifier_group_id', modifierGroupId)

  if (error) {
    console.error('[removeModifierGroupFromItem] Error:', error)
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

export async function updateItemModifierGroupOrder(
  merchantId: string,
  itemId: string,
  modifierGroupIds: string[]
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify item belongs to merchant
  const { data: menuItem } = await supabase
    .from('menu_items')
    .select('id')
    .eq('id', itemId)
    .eq('merchant_id', merchantId)
    .single()

  if (!menuItem) {
    return { success: false, error: 'Menu item not found' }
  }

  // Update sort_order for each modifier group
  for (let i = 0; i < modifierGroupIds.length; i++) {
    const { error } = await supabase
      .from('item_modifier_groups')
      .update({ sort_order: i })
      .eq('menu_item_id', itemId)
      .eq('modifier_group_id', modifierGroupIds[i])

    if (error) {
      console.error('[updateItemModifierGroupOrder] Error:', error)
      return { success: false, error: error.message }
    }
  }

  return { success: true, error: null }
}

// ============================================================================
// MENU DETAIL PAGE ACTIONS
// ============================================================================

/**
 * Toggle category visibility within a specific menu context
 * This updates the is_active field on menu_categories
 */
export async function toggleAdminCategoryInMenu(
  merchantId: string,
  menuId: string,
  categoryId: string,
  isActive: boolean
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify menu belongs to merchant
  const { data: menu } = await supabase
    .from('menus')
    .select('id, name, location_id')
    .eq('id', menuId)
    .eq('merchant_id', merchantId)
    .single()

  if (!menu) {
    return { success: false, error: 'Menu not found' }
  }

  // Update the menu_categories is_active field
  const { error } = await supabase
    .from('menu_categories')
    .update({ is_active: isActive })
    .eq('menu_id', menuId)
    .eq('category_id', categoryId)

  if (error) {
    console.error('[toggleAdminCategoryInMenu] Error:', error)
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

/**
 * Update category display order within a menu (admin version with merchant verification)
 * Uses the same pattern as updateMenuCategoryOrder but with additional admin context
 */
export async function updateAdminMenuCategoryOrder(
  merchantId: string,
  menuId: string,
  categoryOrders: Array<{ categoryId: string; displayOrder: number }>
): Promise<{ success: boolean; error: string | null }> {
  await assertHQPermission('hq.merchant.update')

  const supabase = createServerSupabaseClient()

  // Verify menu belongs to merchant
  const { data: menu } = await supabase
    .from('menus')
    .select('id, name, location_id')
    .eq('id', menuId)
    .eq('merchant_id', merchantId)
    .single()

  if (!menu) {
    return { success: false, error: 'Menu not found' }
  }

  // Update each category's order
  for (const { categoryId, displayOrder } of categoryOrders) {
    const { error } = await supabase
      .from('menu_categories')
      .update({ display_order: displayOrder })
      .eq('menu_id', menuId)
      .eq('category_id', categoryId)

    if (error) {
      console.error('[updateAdminMenuCategoryOrder] Error:', error)
      return { success: false, error: error.message }
    }
  }

  return { success: true, error: null }
}

/**
 * Get schedules assigned to a specific menu (admin version)
 * Returns detailed schedule information with time slots
 */
export async function getAdminMenuSchedules(
  merchantId: string,
  menuId: string
): Promise<Array<{
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
}>> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()

  // Verify menu belongs to merchant
  const { data: menu } = await supabase
    .from('menus')
    .select('id, name, location_id')
    .eq('id', menuId)
    .eq('merchant_id', merchantId)
    .single()

  if (!menu) {
    return []
  }

  // Query menu_schedules with schedule and time slot details
  const { data, error } = await supabase
    .from('menu_schedules')
    .select(`
      id,
      schedule:schedules(
        id,
        name,
        description,
        is_active,
        schedule_time_slots(
          id,
          day_of_week,
          start_time,
          end_time,
          is_active
        )
      )
    `)
    .eq('menu_id', menuId)

  if (error) {
    console.error('[getAdminMenuSchedules] Error:', error)
    return []
  }

  // Transform to a cleaner format
  return (data || [])
    .map((ms: any) => ms.schedule)
    .filter((s: any): s is NonNullable<typeof s> => s !== null)
    .map((schedule: any) => ({
      id: schedule.id,
      name: schedule.name,
      description: schedule.description,
      is_active: schedule.is_active,
      time_slots: (schedule.schedule_time_slots || []).map((slot: any) => ({
        id: slot.id,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        is_active: slot.is_active,
      })),
    }))
}
