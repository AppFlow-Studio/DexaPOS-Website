import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type AppNotificationAudience = 'hq' | 'merchant'

export interface CreateAppNotificationInput {
  audience: AppNotificationAudience
  merchantId?: string | null
  recipientUserId?: string | null
  notificationType: string
  title: string
  body: string
  href?: string | null
  actorUserId?: string | null
  subscriptionPlanRequestId?: string | null
  metadata?: Record<string, unknown>
}

export async function createAppNotification(
  input: CreateAppNotificationInput,
): Promise<{ id?: string; error?: string }> {
  const serviceRole = createServiceRoleClient() as any
  const { data, error } = await serviceRole
    .from('app_notifications')
    .insert({
      audience: input.audience,
      merchant_id: input.merchantId ?? null,
      recipient_user_id: input.recipientUserId ?? null,
      notification_type: input.notificationType,
      title: input.title.trim(),
      body: input.body.trim(),
      href: input.href ?? null,
      actor_user_id: input.actorUserId ?? null,
      subscription_plan_request_id: input.subscriptionPlanRequestId ?? null,
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    console.error('[createAppNotification] insert failed:', error)
    return { error: error?.message || 'Failed to create notification.' }
  }

  return { id: data.id as string }
}
