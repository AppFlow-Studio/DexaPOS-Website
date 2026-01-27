'use server'

import { assertHQPermission } from '@/lib/admin/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  Discount,
  DiscountFormInput,
  DiscountListFilters,
  DiscountUsageStats,
  defaultApplicableDays,
} from '@/types/discount'
import { discountFormSchema } from '@/lib/validations/discount'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'

type MutationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

function normalizeTime(time?: string | null) {
  if (!time) return null
  return time.length === 5 ? `${time}:00` : time
}

function serializeDate(date?: Date | null) {
  if (!date) return null
  return date.toISOString().split('T')[0]
}

function buildPayload(input: DiscountFormInput, merchantId: string) {
  const parsed = discountFormSchema.parse(input)

  return {
    merchant_id: merchantId,
    name: parsed.name,
    description: parsed.description ?? null,
    discount_type: parsed.discount_type,
    discount_value: parsed.discount_value,
    min_purchase_amount: parsed.min_purchase_amount ?? null,
    max_discount_amount:
      parsed.discount_type === 'percentage'
        ? (parsed.max_discount_amount ?? null)
        : null,
    start_date: serializeDate(parsed.start_date),
    end_date: serializeDate(parsed.end_date),
    is_active: parsed.is_active,
    scope: parsed.scope,
    requires_manager_approval: parsed.requires_manager_approval,
    max_uses_per_day: parsed.max_uses_per_day ?? null,
    max_uses_per_order: parsed.max_uses_per_order ?? 1,
    applicable_days: parsed.applicable_days?.length
      ? parsed.applicable_days
      : defaultApplicableDays,
    applicable_hours_start: normalizeTime(parsed.applicable_hours_start),
    applicable_hours_end: normalizeTime(parsed.applicable_hours_end),
    exclude_alcohol: parsed.exclude_alcohol,
    exclude_categories: parsed.exclude_categories?.length
      ? parsed.exclude_categories
      : null,
    applies_to_categories: parsed.applies_to_categories?.length
      ? parsed.applies_to_categories
      : null,
    stackable: parsed.stackable,
    display_order: parsed.display_order ?? 0,
    updated_at: new Date().toISOString(),
  }
}

export async function listAdminDiscounts(
  merchantId: string,
  filters: DiscountListFilters = {}
) {
  try {
    await assertHQPermission('hq.merchant.view')
    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('discounts')
      .select('*, menu_item_discounts (menu_item_id)')
      .eq('merchant_id', merchantId)

    if (filters.isActive !== undefined && filters.isActive !== 'all') {
      query = query.eq('is_active', filters.isActive)
    }

    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`)
    }

    const sortBy = filters.sortBy ?? 'display_order'
    const ascending = filters.sortDir !== 'desc'

    const { data, error } = await query
      .order(sortBy, { ascending })
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    return { success: true, data: (data || []) as Discount[] }
  } catch (error: any) {
    console.error('[listAdminDiscounts] error', error)
    return {
      success: false,
      error: error.message || 'Failed to fetch discounts',
    }
  }
}

export async function getAdminDiscountById(merchantId: string, discountId: string) {
  try {
    await assertHQPermission('hq.merchant.view')
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('discounts')
      .select('*, menu_item_discounts (menu_item_id)')
      .eq('merchant_id', merchantId)
      .eq('id', discountId)
      .single()

    if (error || !data) {
      throw error || new Error('Discount not found')
    }

    const menuItemIds =
      (data as any).menu_item_discounts?.map((row: any) => row.menu_item_id) || []

    return {
      success: true,
      data: { ...(data as Discount), menu_item_ids: menuItemIds },
    }
  } catch (error: any) {
    console.error('[getAdminDiscountById] error', error)
    return {
      success: false,
      error: error.message || 'Failed to load discount',
    }
  }
}

async function upsertAdminMenuItemLinks(
  discountId: string,
  merchantId: string,
  menuItemIds?: string[] | null
) {
  const supabase = createServerSupabaseClient()

  // Clear existing links first
  const { error: deleteError } = await supabase
    .from('menu_item_discounts')
    .delete()
    .eq('discount_id', discountId)

  if (deleteError) {
    throw new Error(`Failed to clear existing items: ${deleteError.message}`)
  }

  if (!menuItemIds || menuItemIds.length === 0) {
    return
  }

  const { error: insertError } = await supabase
    .from('menu_item_discounts')
    .insert(
      menuItemIds.map((menu_item_id) => ({
        discount_id: discountId,
        menu_item_id,
        merchant_id: merchantId,
      }))
    )

  if (insertError) {
    throw new Error(`Failed to save items: ${insertError.message}`)
  }
}

export async function createAdminDiscount(
  merchantId: string,
  input: DiscountFormInput
): Promise<MutationResult<Discount>> {
  try {
    await assertHQPermission('hq.merchant.update')
    const supabase = createServerSupabaseClient()
    const payload = buildPayload(input, merchantId)

    const { data, error } = await supabase
      .from('discounts')
      .insert(payload)
      .select()
      .single()

    if (error || !data) {
      throw error || new Error('Failed to create discount')
    }

    await upsertAdminMenuItemLinks(data.id, merchantId, input.menu_item_ids)

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `Created Discount (Admin): ${input.name}`,
      actionCategory: 'settings',
      resourceType: 'discount',
      resourceId: data.id,
      resourceName: input.name,
      metadata: {
        discount_type: input.discount_type,
        discount_value: input.discount_value,
        admin_created: true,
      },
    })

    return { success: true, data: data as Discount }
  } catch (error: any) {
    console.error('[createAdminDiscount] error', error)
    return {
      success: false,
      error: error.message || 'Failed to create discount',
    }
  }
}

export async function updateAdminDiscount(
  merchantId: string,
  discountId: string,
  input: DiscountFormInput
): Promise<MutationResult<Discount>> {
  try {
    await assertHQPermission('hq.merchant.update')
    const supabase = createServerSupabaseClient()
    const payload = buildPayload(input, merchantId)

    const { data, error } = await supabase
      .from('discounts')
      .update(payload)
      .eq('id', discountId)
      .eq('merchant_id', merchantId)
      .select()
      .single()

    if (error || !data) {
      throw error || new Error('Failed to update discount')
    }

    await upsertAdminMenuItemLinks(discountId, merchantId, input.menu_item_ids)

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `Updated Discount (Admin): ${data.name}`,
      actionCategory: 'settings',
      resourceType: 'discount',
      resourceId: discountId,
      resourceName: data.name,
      changes: { after: input as any },
      metadata: {
        admin_updated: true,
      },
    })

    return { success: true, data: data as Discount }
  } catch (error: any) {
    console.error('[updateAdminDiscount] error', error)
    return {
      success: false,
      error: error.message || 'Failed to update discount',
    }
  }
}

export async function toggleAdminDiscountActive(
  merchantId: string,
  discountId: string,
  isActive: boolean
): Promise<MutationResult<null>> {
  try {
    await assertHQPermission('hq.merchant.update')
    const supabase = createServerSupabaseClient()

    const { data: discount } = await supabase
      .from('discounts')
      .select('name')
      .eq('id', discountId)
      .single()

    const { error } = await supabase
      .from('discounts')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', discountId)
      .eq('merchant_id', merchantId)

    if (error) throw error

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `${isActive ? 'Activated' : 'Deactivated'} Discount (Admin): ${discount?.name || 'Unknown'}`,
      actionCategory: 'settings',
      resourceType: 'discount',
      resourceId: discountId,
      resourceName: discount?.name,
      changes: { before: { is_active: !isActive }, after: { is_active: isActive } },
      metadata: {
        admin_action: true,
      },
    })

    return { success: true, data: null }
  } catch (error: any) {
    console.error('[toggleAdminDiscountActive] error', error)
    return {
      success: false,
      error: error.message || 'Failed to update status',
    }
  }
}

export async function deleteAdminDiscount(
  merchantId: string,
  discountId: string,
  mode: 'soft' | 'hard' = 'hard'
): Promise<MutationResult<null>> {
  try {
    await assertHQPermission('hq.merchant.update')
    const supabase = createServerSupabaseClient()

    // Fetch discount first for name
    const { data: discount } = await supabase
      .from('discounts')
      .select('name')
      .eq('id', discountId)
      .single()

    if (mode === 'soft') {
      const { error } = await supabase
        .from('discounts')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', discountId)
        .eq('merchant_id', merchantId)

      if (error) throw error

      // Log audit event
      await LogAuditEvent({
        merchantId,
        action: `Soft Deleted Discount (Admin): ${discount?.name || 'Unknown'}`,
        actionCategory: 'settings',
        resourceType: 'discount',
        resourceId: discountId,
        resourceName: discount?.name,
        metadata: {
          mode: 'soft',
          admin_action: true,
        },
      })

      return { success: true, data: null }
    }

    await supabase
      .from('menu_item_discounts')
      .delete()
      .eq('discount_id', discountId)

    const { error } = await supabase
      .from('discounts')
      .delete()
      .eq('id', discountId)
      .eq('merchant_id', merchantId)

    if (error) throw error

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `Hard Deleted Discount (Admin): ${discount?.name || 'Unknown'}`,
      actionCategory: 'settings',
      resourceType: 'discount',
      resourceId: discountId,
      resourceName: discount?.name,
      severity: 'info',
      metadata: {
        mode: 'hard',
        admin_action: true,
      },
    })

    return { success: true, data: null }
  } catch (error: any) {
    console.error('[deleteAdminDiscount] error', error)
    return {
      success: false,
      error: error.message || 'Failed to delete discount',
    }
  }
}

export async function bulkUpdateAdminDiscountStatus(
  merchantId: string,
  discountIds: string[],
  isActive: boolean
): Promise<MutationResult<number>> {
  try {
    await assertHQPermission('hq.merchant.update')
    if (!discountIds.length) return { success: true, data: 0 }
    const supabase = createServerSupabaseClient()

    const { error, count } = await supabase
      .from('discounts')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .in('id', discountIds)
      .eq('merchant_id', merchantId)
      // @ts-ignore
      .select('*', { count: 'exact', head: true })

    if (error) throw error

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `${isActive ? 'Bulk Activated' : 'Bulk Deactivated'} ${count || 0} Discounts (Admin)`,
      actionCategory: 'settings',
      metadata: {
        count: count || 0,
        discount_ids: discountIds,
        is_active: isActive,
        admin_action: true,
      },
    })

    return { success: true, data: count || 0 }
  } catch (error: any) {
    console.error('[bulkUpdateAdminDiscountStatus] error', error)
    return {
      success: false,
      error: error.message || 'Failed to update discounts',
    }
  }
}

export async function bulkDeleteAdminDiscounts(
  merchantId: string,
  discountIds: string[],
  mode: 'soft' | 'hard' = 'hard'
): Promise<MutationResult<number>> {
  try {
    await assertHQPermission('hq.merchant.update')
    if (!discountIds.length) return { success: true, data: 0 }
    const supabase = createServerSupabaseClient()

    if (mode === 'soft') {
      const { data, error } = await supabase
        .from('discounts')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('id', discountIds)
        .eq('merchant_id', merchantId)
        .select()

      if (error) throw error
      return { success: true, data: data?.length || 0 }
    }

    await supabase
      .from('menu_item_discounts')
      .delete()
      .in('discount_id', discountIds)

    const { data, error } = await supabase
      .from('discounts')
      .delete()
      .in('id', discountIds)
      .eq('merchant_id', merchantId)
      .select()

    if (error) throw error

    // Log audit event
    await LogAuditEvent({
      merchantId,
      action: `Bulk Hard Deleted ${discountIds.length} Discounts (Admin)`,
      actionCategory: 'settings',
      severity: 'info',
      metadata: {
        count: discountIds.length,
        discount_ids: discountIds,
        mode: 'hard',
        admin_action: true,
      },
    })

    return { success: true, data: data?.length || 0 }
  } catch (error: any) {
    console.error('[bulkDeleteAdminDiscounts] error', error)
    return {
      success: false,
      error: error.message || 'Failed to delete discounts',
    }
  }
}

export async function getAdminDiscountUsage(
  merchantId: string,
  discountId: string
): Promise<MutationResult<DiscountUsageStats>> {
  try {
    await assertHQPermission('hq.merchant.view')
    const supabase = createServerSupabaseClient()

    const { count, error } = await supabase
      .from('order_discounts')
      .select('*', { count: 'exact', head: true })
      .eq('discount_id', discountId)
      .eq('merchant_id', merchantId)

    if (error) throw error

    return {
      success: true,
      data: { usage_count: count || 0, last_used_at: null },
    }
  } catch (error: any) {
    console.error('[getAdminDiscountUsage] error', error)
    return {
      success: false,
      error: error.message || 'Failed to load usage',
    }
  }
}
