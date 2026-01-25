'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ============================================================================
// TYPES
// ============================================================================

export type PriceSource = 'base' | 'location_item' | 'category' | 'location_category' | 'location_menu'

export interface AdminMenu {
  id: string
  name: string
  description: string | null
  is_active: boolean
  is_global: boolean
  location_id: string | null
  location_name: string | null
  categories_count: number
  items_count: number
  created_at: string
  updated_at: string
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
      )
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
    // Count categories and items
    const categoriesCount = menu.menu_categories?.length || 0
    let itemsCount = 0
    menu.menu_categories?.forEach((mc: any) => {
      itemsCount += mc.categories?.category_items?.length || 0
    })

    return {
      id: menu.id,
      name: menu.name,
      description: menu.description,
      is_active: menu.is_active,
      is_global: !menu.location_id,
      location_id: menu.location_id,
      location_name: menu.locations?.name || null,
      categories_count: categoriesCount,
      items_count: itemsCount,
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

  // Verify item belongs to merchant
  const { data: item } = await supabase
    .from('menu_items')
    .select('merchant_id')
    .eq('id', itemId)
    .single()

  if (!item || item.merchant_id !== merchantId) {
    return null
  }

  return data as AdminMenuItem
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

  // Build query for categories
  let query = supabase
    .from('categories')
    .select(`
      id,
      name,
      description,
      image,
      is_active,
      is_global,
      location_id,
      display_order,
      created_at,
      locations(name),
      category_items(count)
    `)
    .eq('merchant_id', merchantId)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  // If location specified, show global categories + that location's categories
  if (effectiveLocationId) {
    query = query.or(`location_id.is.null,location_id.eq.${effectiveLocationId}`)
  }

  const { data: categories, error } = await query

  if (error) {
    console.error('[getAdminCategories] Error:', error)
    return []
  }

  return (categories || []).map((cat: any) => ({
    id: cat.id,
    name: cat.name,
    description: cat.description,
    image: cat.image,
    is_active: cat.is_active,
    is_global: cat.is_global ?? (cat.location_id === null),
    location_id: cat.location_id,
    location_name: cat.locations?.name || null,
    items_count: cat.category_items?.length || 0,
    display_order: cat.display_order || 0,
    created_at: cat.created_at,
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

// ============================================================================
// MODIFIERS
// ============================================================================

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
    items_count: group.modifier_group_items?.length || 0,
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
  if (data.merchant_id !== merchantId) {
    console.error('[getAdminMenuWithCategories] Menu does not belong to merchant')
    return null
  }

  // Transform RPC response to AdminMenuWithCategories format
  return transformToAdminMenuWithCategories(data)
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
    is_active: data.is_active,
    is_global: data.is_global ?? !data.location_id,
    location_id: data.location_id,
    location_name: null, // RPC doesn't include location name, can fetch separately if needed
    categories_count: categories.length,
    items_count: categories.reduce((sum, cat) => sum + cat.items.length, 0),
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
      location_id: data.location_id || null,
      is_active: data.is_active ?? true,
      display_order: data.display_order || 0,
    })
    .select(`
      id, name, description, is_active, location_id, created_at, updated_at,
      locations(name)
    `)
    .single()

  if (error) {
    console.error('[createAdminMenu] Error:', error)
    return { data: null, error: error.message }
  }

  return {
    data: {
      id: menu.id,
      name: menu.name,
      description: menu.description,
      is_active: menu.is_active,
      is_global: !menu.location_id,
      location_id: menu.location_id,
      location_name: (menu as any).locations?.name || null,
      categories_count: 0,
      items_count: 0,
      created_at: menu.created_at,
      updated_at: menu.updated_at,
    },
    error: null,
  }
}

export interface UpdateMenuData {
  name?: string
  description?: string | null
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
  if (data.is_active !== undefined) updateData.is_active = data.is_active
  if (data.display_order !== undefined) updateData.display_order = data.display_order

  const { data: menu, error } = await supabase
    .from('menus')
    .update(updateData)
    .eq('id', menuId)
    .eq('merchant_id', merchantId)
    .select(`
      id, name, description, is_active, location_id, created_at, updated_at,
      locations(name),
      menu_categories(category_id)
    `)
    .single()

  if (error) {
    console.error('[updateAdminMenu] Error:', error)
    return { data: null, error: error.message }
  }

  return {
    data: {
      id: menu.id,
      name: menu.name,
      description: menu.description,
      is_active: menu.is_active,
      is_global: !menu.location_id,
      location_id: menu.location_id,
      location_name: (menu as any).locations?.name || null,
      categories_count: (menu as any).menu_categories?.length || 0,
      items_count: 0,
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
    .select('is_active')
    .eq('id', menuId)
    .eq('merchant_id', merchantId)
    .single()

  if (!current) {
    return { data: null, error: 'Menu not found' }
  }

  return updateAdminMenu(merchantId, menuId, { is_active: !current.is_active })
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
    .select('id')
    .eq('id', menuId)
    .eq('merchant_id', merchantId)
    .single()

  const { data: category } = await supabase
    .from('categories')
    .select('id')
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
      menu_id: menuId,
      category_id: categoryId,
      display_order: displayOrder || 0,
      is_active: true,
    })

  if (error) {
    console.error('[addCategoryToMenu] Error:', error)
    return { success: false, error: error.message }
  }

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
    .select('id')
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
    .select('id')
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
    .select('id')
    .single()

  if (error) {
    console.error('[updateAdminMenuItem] Error:', error)
    return { data: null, error: error.message }
  }

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
  const { error } = await supabase
    .from('menu_items')
    .delete()
    .eq('id', itemId)
    .eq('merchant_id', merchantId)

  if (error) {
    console.error('[deleteAdminMenuItem] Error:', error)
    return { success: false, error: error.message }
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
    .select('id')
    .eq('id', categoryId)
    .eq('merchant_id', merchantId)
    .single()

  const { data: item } = await supabase
    .from('menu_items')
    .select('id')
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
    .single()

  if (existing) {
    return { success: true, error: null }
  }

  const { error } = await supabase
    .from('category_items')
    .insert({
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
    .select('id')
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
    .select('id')
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
    .select('id')
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
    .select('id')
    .eq('id', itemId)
    .eq('merchant_id', merchantId)
    .single()

  if (!item) {
    return { success: false, error: 'Item not found' }
  }

  // Verify location belongs to merchant
  const { data: location } = await supabase
    .from('locations')
    .select('id')
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
    .select('id')
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
    .select('id')
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

  return {
    data: {
      id: group.id,
      name: group.name,
      description: group.description,
      is_required: group.is_required,
      is_active: group.is_active,
      min_selections: group.min_selections || 0,
      max_selections: group.max_selections,
      items_count: (group as any).modifier_group_items?.length || 0,
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
    .select('id')
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
      is_active: data.is_active ?? true,
      display_order: data.display_order || 0,
    })
    .select()
    .single()

  if (error) {
    console.error('[createAdminModifierItem] Error:', error)
    return { data: null, error: error.message }
  }

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
    .select('modifier_group_id, modifier_groups!inner(merchant_id)')
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

  return { success: true, error: null }
}
