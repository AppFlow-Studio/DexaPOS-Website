'use server'

import { auth } from '@clerk/nextjs/server'

import { toDeviceActivityFeed } from '@/lib/device-registry/activity'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolveImpersonationFromCookies } from '@/lib/admin/impersonation'
import type {
  AdminDeviceInventoryRow,
  DeviceActivityItem,
  DeviceAssignmentRow,
  DeviceConfigHistoryRow,
  DeviceNoteRow,
} from '@/types/device-registry'

type ActionResult<T> = {
  success: boolean
  data: T | null
  error: string | null
}

async function requireMerchantDeviceContext() {
  const { userId, orgId } = await auth()

  if (!userId) {
    throw new Error('Unauthorized: merchant access required')
  }

  const supabase = createServerSupabaseClient() as any

  // Under HQ impersonation, route every device-registry read/write to the
  // impersonated merchant. The HQ session has no merchant org, so the
  // legacy orgId path would fail.
  const impersonation = await resolveImpersonationFromCookies().catch(() => null)
  if (impersonation) {
    return {
      supabase,
      merchantId: impersonation.merchantId,
    }
  }

  if (!orgId) {
    throw new Error('Unauthorized: merchant access required')
  }

  const { data: merchant, error } = await supabase
    .from('merchants')
    .select('id, name, clerk_org_id')
    .eq('clerk_org_id', orgId)
    .maybeSingle()

  if (error || !merchant) {
    throw new Error('Unauthorized: merchant context required')
  }

  return {
    supabase,
    merchantId: merchant.id as string,
  }
}

export async function getMerchantDeviceInventory(): Promise<ActionResult<AdminDeviceInventoryRow[]>> {
  try {
    const { supabase, merchantId } = await requireMerchantDeviceContext()

    const { data, error } = await supabase
      .from('admin_device_inventory')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[getMerchantDeviceInventory] Error:', error)
      return { success: false, data: null, error: error.message }
    }

    return {
      success: true,
      data: (data ?? []) as AdminDeviceInventoryRow[],
      error: null,
    }
  } catch (error) {
    console.error('[getMerchantDeviceInventory] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function getMerchantDeviceActivity(
  deviceId: string
): Promise<ActionResult<DeviceActivityItem[]>> {
  try {
    const { supabase, merchantId } = await requireMerchantDeviceContext()

    const { data: device, error: deviceError } = await supabase
      .from('device_inventory')
      .select('id, merchant_id')
      .eq('id', deviceId)
      .eq('merchant_id', merchantId)
      .maybeSingle()

    if (deviceError) {
      console.error('[getMerchantDeviceActivity] Device lookup error:', deviceError)
      return { success: false, data: null, error: deviceError.message }
    }

    if (!device) {
      return { success: false, data: null, error: 'Device not found' }
    }

    const [assignmentsResult, configResult, notesResult] = await Promise.all([
      supabase
        .from('device_assignments')
        .select('*')
        .eq('device_id', deviceId)
        .order('assigned_at', { ascending: false }),
      supabase
        .from('device_config_history')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false }),
      supabase
        .from('device_notes')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false }),
    ])

    const error =
      assignmentsResult.error ?? configResult.error ?? notesResult.error ?? null

    if (error) {
      console.error('[getMerchantDeviceActivity] Error:', error)
      return { success: false, data: null, error: error.message }
    }

    return {
      success: true,
      data: toDeviceActivityFeed(
        (assignmentsResult.data ?? []) as DeviceAssignmentRow[],
        (configResult.data ?? []) as DeviceConfigHistoryRow[],
        (notesResult.data ?? []) as DeviceNoteRow[]
      ),
      error: null,
    }
  } catch (error) {
    console.error('[getMerchantDeviceActivity] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
