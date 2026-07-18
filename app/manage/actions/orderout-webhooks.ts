'use server'

// ============================================================================
// HQ OrderOut Webhook Registration
// Platform-wide, one-time registration of the push_menu callback with
// OrderOut. After this runs once, all merchants' menu pushes will emit
// per-platform status back to orderout-push-menu-webhook.
// ============================================================================

import { assertHQPermission } from '@/lib/admin/auth'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import { createServerSupabaseClient } from '@/lib/supabase/server'

interface RegisterPushMenuWebhookResult {
  success: boolean
  endpoint?: string
  deliveryServices?: string[]
  orderoutResponse?: unknown
  error?: string
}

export async function registerOrderOutPushMenuWebhook(): Promise<RegisterPushMenuWebhookResult> {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return { success: false, error: 'Server configuration error' }
    }

    const response = await fetch(
      `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/orderout-menu-webhook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ action: 'register_push_menu_webhook' }),
      }
    )

    const result = await response.json().catch(() => ({}))

    if (!response.ok || !result?.success) {
      return {
        success: false,
        error:
          (result?.error as string) ||
          `Registration failed (status ${response.status})`,
      }
    }

    const data = result.data as {
      endpoint?: string
      delivery_services?: string[]
      orderout_response?: unknown
    } | undefined

    await LogAuditEvent({
      action: 'registered_orderout_push_menu_webhook',
      actionCategory: 'integrations',
      severity: 'info',
      resourceType: 'orderout_webhook',
      resourceId: 'push_menu',
      resourceName: 'OrderOut push_menu webhook',
      metadata: {
        registered_by_admin: userId,
        endpoint: data?.endpoint,
        delivery_services: data?.delivery_services,
      },
    })

    return {
      success: true,
      endpoint: data?.endpoint,
      deliveryServices: data?.delivery_services,
      orderoutResponse: data?.orderout_response,
    }
  } catch (error) {
    console.error('[registerOrderOutPushMenuWebhook] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// Status / audit helpers for the HQ integrations card
// ============================================================================

export interface OrderOutPushMenuWebhookStatus {
  expectedEndpoint: string | null
  lastRegisteredAt: string | null
  lastRegisteredBy: string | null
  dlqCount: number
}

export async function getOrderOutPushMenuWebhookStatus(): Promise<{
  success: boolean
  data: OrderOutPushMenuWebhookStatus | null
  error: string | null
}> {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '')
    const expectedEndpoint = supabaseUrl
      ? `${supabaseUrl}/functions/v1/orderout-push-menu-webhook`
      : null

    const [{ data: auditRow }, { count: dlqCount }] = await Promise.all([
      supabase
        .from('audit_logs')
        .select('created_at, actor_name, actor_user_id')
        .eq('action', 'registered_orderout_push_menu_webhook')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('webhook_dead_letter_queue')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'orderout')
        // Single-service channel callbacks are logged as 'push_menu_channels';
        // legacy array-shape results as 'push_menu'. Count both.
        .in('event_type', ['push_menu', 'push_menu_channels']),
    ])

    return {
      success: true,
      data: {
        expectedEndpoint,
        lastRegisteredAt: auditRow?.created_at ?? null,
        lastRegisteredBy:
          (auditRow as { actor_name?: string | null } | null)?.actor_name ?? null,
        dlqCount: dlqCount ?? 0,
      },
      error: null,
    }
  } catch (error) {
    console.error('[getOrderOutPushMenuWebhookStatus] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
