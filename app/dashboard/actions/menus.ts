'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { MenusModel } from '@/types/db-modles'
import {
  SyncMenuToAllLocations,
  UpdateLocationMenuOrder
} from './location-menus'
import { MenuWithCategories, MenuForLocation } from '@/types/menu'
import { LogAuditEvent } from './audit-logs'
import { getCurrentUserMerchantRole } from './role-check'
import { assertNameAvailable } from './_name-uniqueness'

// ============================================================================
// TYPES
// ============================================================================

export interface MenuWithLocationStatus extends MenusModel {
  location_menu_id?: string
  is_active_at_location: boolean
  display_order_at_location?: number
  is_inherited: boolean // true for global menus when viewing a location
}

export interface MenuItemWithPricing {
  id: string
  name: string
  description: string | null
  price: number
  cash_price: number | null
  image: string | null
  availability: boolean
  // Location-specific fields
  effective_price: number
  effective_cash_price: number | null
  has_price_override: boolean
  location_is_available: boolean
  global_price: number
  global_cash_price: number | null
}

// ============================================================================
// GET OPERATIONS - CATEGORY CENTRIC
// ============================================================================

/**
 * Get menu with categories and nested items using the new RPC
 * This is the PRIMARY way to get menu data for display
 */
export async function GetMenuWithCategories (
  menuId: string,
  locationId?: string | null
): Promise<MenuWithCategories | null> {
  if (!menuId) {
    return null
  }

  const supabase = createServerSupabaseClient()
  const location_Id = locationId === 'all' ? null : locationId
  console.log('[GetMenuWithCategories] location_Id', location_Id)

  let { data, error } = await supabase.rpc('get_menu_with_categories', {
    p_menu_id: menuId,
    p_location_id: location_Id || null
  })

  // A location-owned menu has one concrete pricing context even when the
  // dashboard's location selector is on "All". Calling the cascade RPC with a
  // null location omits L2/L4/L5 overrides, so a successful bulk adjustment is
  // written but the refreshed UI continues to show the global base price.
  // Resolve the menu once, then rerun through its owning location so the
  // displayed effective price matches what customers at that location pay.
  if (!error && !location_Id && data) {
    const unscopedMenu = data as MenuWithCategories
    if (unscopedMenu.is_location_owned && unscopedMenu.location_id) {
      const scopedResult = await supabase.rpc('get_menu_with_categories', {
        p_menu_id: menuId,
        p_location_id: unscopedMenu.location_id,
      })
      if (!scopedResult.error && scopedResult.data) {
        data = scopedResult.data
      } else if (scopedResult.error) {
        console.error(
          'Error resolving location-owned menu pricing:',
          scopedResult.error,
        )
      }
    }
  }
  console.log('[GetMenuWithCategories] data', data)

  if (error) {
    console.error('Error getting menu with categories:', error)
    return null
  }

  const menuData = data as MenuWithCategories
  const { data: menuRow } = await supabase
    .from('menus')
    .select('image')
    .eq('id', menuId)
    .maybeSingle()

  return {
    ...menuData,
    image: menuRow?.image || null
  }
}

/**
 * @deprecated Use GetMenuWithCategories instead
 * Legacy function for backwards compatibility
 */
export async function getMenuForLocation (menuId: string, locationId?: string) {
  const supabase = await createServerSupabaseClient()
  const location_Id = locationId == 'all' ? null : locationId

  // Try new RPC first
  const { data: newData, error: newError } = await supabase.rpc(
    'get_menu_with_categories',
    {
      p_menu_id: menuId,
      p_location_id: location_Id || null
    }
  )
  console.log('newData', newData)

  if (!newError && newData) {
    // Transform to legacy format for backwards compatibility
    const menu = newData as MenuWithCategories
    return {
      ...menu,
      menu_categories:
        menu.categories?.map(cat => ({
          id: cat.id,
          category: cat.category
        })) || [],
      // Flatten items from all categories for legacy format
      menu_item_menus:
        menu.categories?.flatMap(
          cat =>
            cat.items?.map(item => ({
              id: item.id,
              custom_price: null,
              custom_cash_price: null,
              is_available: item.menu_item.effective_availability,
              location_menu_override: null,
              menu_item: {
                id: item.menu_item.id,
                name: item.menu_item.name,
                description: item.menu_item.description,
                image: item.menu_item.image,
                meal_types: item.menu_item.meal_types,
                allergens: item.menu_item.allergens,
                card_bg_color: item.menu_item.card_bg_color,
                price: item.menu_item.price_levels.level_1_base,
                cash_price: null,
                availability: item.menu_item.effective_availability,
                location_item_override: null,
                effective_price: item.menu_item.effective_price,
                effective_cash_price: item.menu_item.effective_cash_price,
                effective_availability: item.menu_item.effective_availability,
                has_location_item_override:
                  item.menu_item.has_location_item_override,
                has_menu_override: item.menu_item.has_category_override,
                has_location_menu_override:
                  item.menu_item.has_location_menu_override,
                price_source: item.menu_item.price_source,
                price_breakdown: item.menu_item.price_levels,
                stock_tracking_mode: item.menu_item.stock_tracking_mode,
                current_stock: item.menu_item.current_stock,
                modifier_groups: item.menu_item.modifier_groups
              }
            })) || []
        ) || [],
      menu_schedules: menu.schedules || []
    } as MenuForLocation
  }

  // Fallback to old RPC if new one not available
  const { data, error } = await supabase.rpc('get_menu_for_location', {
    p_menu_id: menuId,
    p_location_id: location_Id || null
  })

  if (error) {
    console.error('Error getting menu for location:', error)
    return null
  }

  return data as MenuForLocation
}

// ============================================================================
// GET OPERATIONS - BASIC
// ============================================================================

export async function GetMenus (clerkOrgId: string, locationId?: string | null) {
  if (!clerkOrgId) {
    return []
  }

  const supabase = createServerSupabaseClient()
  // if( locationId != 'all' && locationId != null){
  //     const { data: FullMenusAndItems, error: FullMenusAndItemsError } = await supabase.rpc('get_pos_full_sync', {
  //         p_location_id: locationId
  //     })
  //     console.log('FullMenusAndItems', FullMenusAndItems)
  //     if(FullMenusAndItemsError){
  //         console.error('Error getting full menus and items:', FullMenusAndItemsError)
  //         return []
  //     }
  //     return FullMenusAndItems as MenuWithCategories[]
  // }

  // First, get the merchant ID from the clerk_org_id
  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select('id')
    .eq('clerk_org_id', clerkOrgId)
    .single()

  if (merchantError || !merchant) {
    console.error('Error getting merchant:', merchantError)
    return []
  }

  // If viewing "all locations" or no location specified
  if (locationId === null || locationId === 'all') {
    // Get all menus for the merchant (both global and location-specific)
    const { data, error } = await supabase
      .from('menus')
      .select(
        `
                *,
                locations(
                    id,
                    name
                )   
            `
      )
      .eq('merchant_id', merchant.id)

      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error getting menus:', error)
      return []
    }
    return data as MenusModel[]
  }

  // // Location-specific view - get global menus with location status
  // const { data: location, error: locationError } = await supabase
  //     .from('locations')
  //     .select('uses_global_menu')
  //     .eq('id', locationId)
  //     .single()

  // if (locationError) {
  //     console.error('Error getting location:', locationError)
  //     return []
  // }

  // Get all global menus for this merchant
  const { data: globalMenus, error: menusError } = await supabase
    .from('menus')
    .select('*')
    .eq('merchant_id', merchant.id)
    .is('location_id', null)
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (menusError) {
    console.error('Error getting global menus:', menusError)
    return []
  }

  // Get location_menus records to see which are active at this location
  const { data: locationMenus } = await supabase
    .from('menus')
    .select('*')
    .eq('location_id', locationId)

  const locationMenuMap = new Map(
    (locationMenus || []).map(lm => [lm.menu_id, lm])
  )

  // Build result with location status
  const result: MenuWithLocationStatus[] = globalMenus.map(menu => {
    const locationMenu = locationMenuMap.get(menu.id)

    return {
      ...menu,
      location_menu_id: locationMenu?.id,
      is_active_at_location: locationMenu,
      display_order_at_location: locationMenu?.display_order,
      is_inherited: true
    }
  })

  // Also get any location-specific menus
  const { data: locationSpecificMenus } = await supabase
    .from('menus')
    .select(
      `*,
            locations(
                id,
                name
            )
            `
    )
    .eq('merchant_id', merchant.id)
    .eq('location_id', locationId)
    .order('display_order', { ascending: true, nullsFirst: false })

  if (locationSpecificMenus?.length) {
    for (const menu of locationSpecificMenus) {
      result.push({
        ...menu,
        is_active_at_location: menu.is_active,
        is_inherited: false
      })
    }
  }

  return result
}

export async function GetMenu (menuId: string) {
  if (!menuId) {
    return null
  }

  const supabase = createServerSupabaseClient()

  // Get menu with categories (new structure)
  const { data: menu, error: menuError } = await supabase
    .from('menus')
    .select(
      `
            *,
            menu_categories(
                id,
                display_order,
                is_active,
                custom_title,
                category:categories(*)
            ),
            menu_schedules(
                id,
                schedule:schedules(
                    *,
                    schedule_time_slots(*)
                )
            )
        `
    )
    .eq('id', menuId)
    .single()

  if (menuError || !menu) {
    console.error('Error getting menu:', menuError)
    return null
  }

  return menu
}

/**
 * @deprecated Use GetMenuWithCategories instead
 */
export async function GetMenuWithLocationContext (
  menuId: string,
  locationId?: string | null
) {
  // Redirect to new function
  return GetMenuWithCategories(menuId, locationId)
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

export async function CreateMenu (
  clerkOrgId: string,
  data: {
    name: string
    description?: string
    image?: string | null
    location_id?: string | null
    is_active?: boolean
    display_order?: number
    created_by?: string
  }
) {
  if (!clerkOrgId) {
    return { error: 'Organization ID is required' }
  }

  const supabase = createServerSupabaseClient()

  // Role check: managers can only create location-specific menus for their assigned locations
  const roleInfo = await getCurrentUserMerchantRole()
  if (roleInfo?.isMember) {
    return { error: 'You do not have permission to create menus' }
  }
  if (roleInfo?.isManager) {
    if (!data.location_id) {
      return { error: 'Managers cannot create global menus' }
    }
    if (!roleInfo.assignedLocationIds.includes(data.location_id)) {
      return { error: 'You do not have access to this location' }
    }
  }

  // Get merchant ID
  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select('id')
    .eq('clerk_org_id', clerkOrgId)
    .single()

  if (merchantError || !merchant) {
    console.error('Error getting merchant:', merchantError)
    return { error: 'Merchant not found' }
  }

  // If location_id is provided, verify it belongs to the merchant
  if (data.location_id) {
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('id')
      .eq('id', data.location_id)
      .eq('merchant_id', merchant.id)
      .single()

    if (locationError || !location) {
      return { error: 'Location not found or does not belong to merchant' }
    }
  }

  const nameCheck = await assertNameAvailable(supabase, merchant.id, data.name)
  if (nameCheck.error) {
    return { error: nameCheck.error }
  }

  const { data: menu, error } = await supabase
    .from('menus')
    .insert({
      merchant_id: merchant.id,
      name: data.name,
      description: data.description || null,
      image: data.image || null,
      location_id: data.location_id || null,
      is_active: data.is_active ?? true,
      display_order: data.display_order || null,
      created_by: data.created_by || null
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating menu:', error)
    return { error: error.message }
  }

  // If this is a global menu (no location_id), sync it to all locations
  if (!data.location_id) {
    await SyncMenuToAllLocations(menu.id)
  }

  // Fetch location name for audit log if applicable
  let locationName: string | undefined
  if (data.location_id) {
    const { data: loc } = await supabase
      .from('locations')
      .select('name')
      .eq('id', data.location_id)
      .single()
    locationName = loc?.name
  }

  // Log audit event
  await LogAuditEvent({
    merchantId: merchant.id,
    action: `Created Menu: ${data.name}`,
    actionCategory: 'menu',
    resourceType: 'menu',
    resourceId: menu.id,
    resourceName: data.name,
    locationId: data.location_id || undefined,
    changes: { after: data as Record<string, unknown> },
    metadata: locationName ? { location_name: locationName } : undefined
  })

  return { data: menu as MenusModel }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

export async function UpdateMenu (
  menuId: string,
  data: {
    name?: string
    description?: string
    image?: string | null
    location_id?: string | null
    is_active?: boolean
    display_order?: number
  },
  locationId?: string | null
) {
  if (!menuId) {
    return { error: 'Menu ID is required' }
  }

  const supabase = createServerSupabaseClient()

  // Fetch current state before update for audit logging
  const { data: beforeMenu } = await supabase
    .from('menus')
    .select('*')
    .eq('id', menuId)
    .single()

  if (!beforeMenu) {
    return { error: 'Menu not found' }
  }

  // Role check: managers cannot edit global menus
  const roleInfo = await getCurrentUserMerchantRole()
  if (roleInfo?.isMember) {
    return { error: 'You do not have permission to update menus' }
  }
  if (roleInfo?.isManager) {
    if (!beforeMenu.location_id) {
      return { error: 'Managers cannot edit global menus' }
    }
    if (!roleInfo.assignedLocationIds.includes(beforeMenu.location_id)) {
      return { error: 'You do not have access to this menu' }
    }
  }

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.image !== undefined) updateData.image = data.image
  if (data.location_id !== undefined)
    updateData.location_id = data.location_id || null
  if (data.is_active !== undefined) updateData.is_active = data.is_active
  if (data.display_order !== undefined)
    updateData.display_order = data.display_order

  // If location_id is being updated, verify it belongs to the merchant
  if (data.location_id !== undefined && data.location_id) {
    const { data: menu } = await supabase
      .from('menus')
      .select('merchant_id')
      .eq('id', menuId)
      .single()

    if (menu) {
      const { data: location, error: locationError } = await supabase
        .from('locations')
        .select('id')
        .eq('id', data.location_id)
        .eq('merchant_id', menu.merchant_id)
        .single()

      if (locationError || !location) {
        return { error: 'Location not found or does not belong to merchant' }
      }
    }
  }

  if (
    data.name !== undefined &&
    data.name.trim().toLowerCase() !==
      (beforeMenu.name ?? '').trim().toLowerCase()
  ) {
    const nameCheck = await assertNameAvailable(
      supabase,
      beforeMenu.merchant_id,
      data.name,
      { excludeTable: 'menus', excludeId: menuId }
    )
    if (nameCheck.error) {
      return { error: nameCheck.error }
    }
  }

  const { data: menu, error } = await supabase
    .from('menus')
    .update(updateData)
    .eq('id', menuId)
    .select()
    .single()

  if (error) {
    console.error('Error updating menu:', error)
    return { error: error.message }
  }

  // Log audit event
  await LogAuditEvent({
    merchantId: menu.merchant_id,
    action: `Updated Menu: ${menu.name}`,
    actionCategory: 'menu',
    resourceType: 'menu',
    resourceId: menuId,
    resourceName: menu.name,
    locationId: locationId,
    changes: {
      before: beforeMenu,
      after: menu
    }
  })

  return { data: menu as MenusModel }
}

/**
 * Batch update display order for multiple menus
 */
export async function UpdateMenusOrder (
  menuOrders: Array<{ menuId: string; displayOrder: number }>,
  locationId?: string | null
) {
  if (!menuOrders || menuOrders.length === 0) {
    return { error: 'Menu orders are required' }
  }

  const supabase = createServerSupabaseClient()

  // Validate all menus belong to the same merchant
  const menuIds = menuOrders.map(mo => mo.menuId)
  const { data: menus, error: fetchError } = await supabase
    .from('menus')
    .select('id, merchant_id, name')
    .in('id', menuIds)

  if (fetchError || !menus || menus.length !== menuIds.length) {
    return { error: 'One or more menus not found' }
  }

  // Check all menus belong to same merchant
  const merchantIds = new Set(menus.map(m => m.merchant_id))
  if (merchantIds.size > 1) {
    return { error: 'All menus must belong to the same merchant' }
  }

  // Map IDs to names for human-readable logging
  const menuNames = menus.map(m => m.name)

  // Batch update display_order
  const updates = menuOrders.map(({ menuId, displayOrder }) =>
    supabase
      .from('menus')
      .update({
        display_order: displayOrder,
        updated_at: new Date().toISOString()
      })
      .eq('id', menuId)
  )

  const results = await Promise.all(updates)
  const errors = results.filter(r => r.error)

  if (errors.length > 0) {
    console.error('Error updating menu orders:', errors)
    return { error: 'Failed to update some menu orders' }
  }

  if (locationId && locationId !== 'all') {
    const locationOrderUpdates = await Promise.all(
      menuOrders.map(({ menuId, displayOrder }) =>
        UpdateLocationMenuOrder(locationId, menuId, displayOrder)
      )
    )

    const locationOrderErrors = locationOrderUpdates.filter(
      result => result.error
    )

    if (locationOrderErrors.length > 0) {
      console.error('Error updating location menu orders:', locationOrderErrors)
      return { error: 'Failed to update some location menu orders' }
    }
  }

  // Fetch one menu to get merchant id for logging (all should be same)
  const sampleMenu = menus[0]
  await LogAuditEvent({
    merchantId: sampleMenu.merchant_id,
    action: `Updated Menu Display Order`,
    actionCategory: 'menu',
    resourceType: 'menu',
    // 2026-01-19: Fixed - resourceId must be UUID or null. Removed "bulk_menu_reorder" string.
    resourceId: undefined,
    resourceName: 'Multiple Menus',
    locationId: locationId,
    metadata: {
      count: menuOrders.length,
      menu_names: menuNames
    }
  })

  return { success: true }
}

export async function ToggleMenuActive (
  menuId: string,
  locationId?: string | null
) {
  if (!menuId) {
    return { error: 'Menu ID is required' }
  }

  const supabase = createServerSupabaseClient()

  // First get current status
  const { data: menu, error: fetchError } = await supabase
    .from('menus')
    .select('is_active')
    .eq('id', menuId)
    .single()

  if (fetchError || !menu) {
    console.error('Error fetching menu:', fetchError)
    return { error: 'Menu not found' }
  }

  // Toggle the status
  const { data: updatedMenu, error } = await supabase
    .from('menus')
    .update({ is_active: !menu.is_active })
    .eq('id', menuId)
    .select()
    .single()

  if (error) {
    console.error('Error toggling menu active status:', error)
    return { error: error.message }
  }

  // Log audit event
  const newStatus = updatedMenu.is_active ? 'activated' : 'deactivated'
  await LogAuditEvent({
    merchantId: updatedMenu.merchant_id,
    action: `Menu ${newStatus}: ${updatedMenu.name}`,
    actionCategory: 'menu',
    resourceType: 'menu',
    resourceId: menuId,
    resourceName: updatedMenu.name,
    locationId: locationId,
    changes: {
      before: { is_active: menu.is_active },
      after: { is_active: updatedMenu.is_active }
    }
  })

  return { data: updatedMenu as MenusModel }
}

/**
 * Toggle whether a menu is active at a specific location
 */
export async function ToggleMenuActiveAtLocation (
  menuId: string,
  locationId: string
) {
  if (!menuId || !locationId) {
    return { error: 'Menu ID and Location ID are required' }
  }

  const supabase = createServerSupabaseClient()

  // Check if a location_menus record exists
  const { data: existing } = await supabase
    .from('location_menus')
    .select('id, is_active')
    .eq('menu_id', menuId)
    .eq('location_id', locationId)
    .single()

  if (existing) {
    // Toggle existing record
    const { data, error } = await supabase
      .from('location_menus')
      .update({ is_active: !existing.is_active })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      console.error('Error toggling location menu:', error)
      return { error: error.message }
    }

    if (data) {
      // Fetch names for audit log
      const { data: menu } = await supabase
        .from('menus')
        .select('name, merchant_id')
        .eq('id', menuId)
        .single()
      const { data: loc } = await supabase
        .from('locations')
        .select('name')
        .eq('id', locationId)
        .single()

      const action = data.is_active ? 'Enabled' : 'Disabled'
      if (menu) {
        await LogAuditEvent({
          merchantId: menu.merchant_id,
          action: `${action} Menu at Location: ${menu.name} (${
            loc?.name || 'Unknown Location'
          })`,
          actionCategory: 'menu',
          resourceType: 'menu_location_override',
          resourceId: data.id,
          resourceName: menu.name,
          locationId: locationId,
          metadata: {
            location_name: loc?.name,
            menu_name: menu.name,
            is_active: data.is_active
          },
          changes: {
            before: { is_active: !data.is_active },
            after: { is_active: data.is_active }
          }
        })
      }
    }

    return { data }
  } else {
    // Create new record with is_active = false (disabling inherited menu)
    const { data, error } = await supabase
      .from('location_menus')
      .insert({
        menu_id: menuId,
        location_id: locationId,
        is_active: false
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating location menu:', error)
      return { error: error.message }
    }

    if (data) {
      // Fetch names for audit log
      const { data: menu } = await supabase
        .from('menus')
        .select('name, merchant_id')
        .eq('id', menuId)
        .single()
      const { data: loc } = await supabase
        .from('locations')
        .select('name')
        .eq('id', locationId)
        .single()

      if (menu) {
        await LogAuditEvent({
          merchantId: menu.merchant_id,
          action: `Disabled Menu at Location: ${menu.name} (${
            loc?.name || 'Unknown Location'
          })`,
          actionCategory: 'menu',
          resourceType: 'menu_location_override',
          resourceId: data.id,
          resourceName: menu.name,
          locationId: locationId,
          metadata: {
            location_name: loc?.name,
            menu_name: menu.name,
            is_active: false
          }
        })
      }
    }

    return { data }
  }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

export async function DeleteMenu (menuId: string, locationId?: string | null) {
  if (!menuId) {
    return { error: 'Menu ID is required' }
  }

  const supabase = createServerSupabaseClient()

  // Fetch menu details before deletion for audit log
  const { data: menuToDelete } = await supabase
    .from('menus')
    .select('name, merchant_id, location_id')
    .eq('id', menuId)
    .single()

  // Role check: managers can only delete location-specific menus for their assigned locations
  const roleInfo = await getCurrentUserMerchantRole()
  if (roleInfo?.isMember) {
    return { error: 'You do not have permission to delete menus' }
  }
  if (roleInfo?.isManager) {
    if (!menuToDelete?.location_id) {
      return { error: 'Managers cannot delete global menus' }
    }
    if (!roleInfo.assignedLocationIds.includes(menuToDelete.location_id)) {
      return { error: 'You do not have access to this menu' }
    }
  }

  const { error } = await supabase.from('menus').delete().eq('id', menuId)

  if (error) {
    console.error('Error deleting menu:', error)
    return { error: error.message }
  }

  // Log audit event
  if (menuToDelete) {
    await LogAuditEvent({
      merchantId: menuToDelete.merchant_id,
      action: `Deleted Menu: ${menuToDelete.name}`,
      actionCategory: 'menu',
      resourceType: 'menu',
      resourceId: menuId,
      resourceName: menuToDelete.name,
      locationId: locationId || menuToDelete.location_id || undefined
    })
  }

  return { success: true }
}
