'use server'

import { auth } from '@clerk/nextjs/server'
import { getEffectiveMerchantContext } from '@/lib/admin/merchant-context'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface ReadOnlyNotification {
  id: string
  audience: 'hq' | 'merchant'
  merchant_id: string | null
  notification_type: string
  title: string
  body: string
  href: string | null
  metadata: Record<string, unknown>
  created_at: string
  is_read: boolean
}

export interface ReadOnlyNotificationFeed {
  notifications: ReadOnlyNotification[]
  unreadCount: number
}

async function getImpersonatedMerchantScope() {
  try {
    const context = await getEffectiveMerchantContext(null)
    return context.isImpersonating ? context : null
  } catch {
    return null
  }
}

function isNotificationForUser(
  notification: { recipient_user_id?: string | null },
  userId: string,
) {
  return !notification.recipient_user_id || notification.recipient_user_id === userId
}

async function getImpersonatedMerchantNotifications(
  merchantId: string,
  userId: string,
  limit: number,
): Promise<ReadOnlyNotificationFeed> {
  const serviceRole = createServiceRoleClient() as any
  const { data: rows, error } = await serviceRole
    .from('app_notifications')
    .select(
      'id, audience, merchant_id, recipient_user_id, notification_type, title, body, href, metadata, created_at',
    )
    .eq('audience', 'merchant')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error

  const visibleRows = (rows ?? []).filter(
    (notification: { recipient_user_id?: string | null }) =>
      isNotificationForUser(notification, userId),
  )
  const notificationIds = visibleRows.map((notification: { id: string }) => notification.id)
  const { data: reads, error: readsError } = notificationIds.length
    ? await serviceRole
        .from('app_notification_reads')
        .select('notification_id')
        .eq('user_id', userId)
        .in('notification_id', notificationIds)
    : { data: [], error: null }

  if (readsError) throw readsError

  const readIds = new Set((reads ?? []).map((read: { notification_id: string }) => read.notification_id))
  const notifications = visibleRows.slice(0, limit).map((notification: ReadOnlyNotification) => ({
    ...notification,
    metadata: notification.metadata ?? {},
    is_read: readIds.has(notification.id),
  }))

  return {
    notifications,
    unreadCount: visibleRows.filter(
      (notification: { id: string }) => !readIds.has(notification.id),
    ).length,
  }
}

export async function GetReadOnlyNotifications(
  limit = 20,
): Promise<ReadOnlyNotificationFeed> {
  const { userId } = await auth()
  if (!userId) return { notifications: [], unreadCount: 0 }

  const impersonatedMerchant = await getImpersonatedMerchantScope()
  if (impersonatedMerchant) {
    try {
      return await getImpersonatedMerchantNotifications(
        impersonatedMerchant.merchantId,
        userId,
        Math.min(Math.max(limit, 1), 100),
      )
    } catch (error) {
      console.error('[GetReadOnlyNotifications] impersonated merchant load failed:', error)
      return { notifications: [], unreadCount: 0 }
    }
  }

  const supabase = createServerSupabaseClient() as any
  const [{ data: notifications, error: feedError }, { data: unreadCount, error: countError }] =
    await Promise.all([
      supabase.rpc('get_my_app_notifications', {
        p_limit: Math.min(Math.max(limit, 1), 100),
      }),
      supabase.rpc('get_my_unread_app_notification_count'),
    ])

  if (feedError || countError) {
    console.error('[GetReadOnlyNotifications] load failed:', { feedError, countError })
    return { notifications: [], unreadCount: 0 }
  }

  return {
    notifications: ((notifications ?? []) as ReadOnlyNotification[]).map((notification) => ({
      ...notification,
      metadata: notification.metadata ?? {},
      is_read: Boolean(notification.is_read),
    })),
    unreadCount: Number(unreadCount ?? 0),
  }
}

export async function MarkReadOnlyNotificationRead(
  notificationId: string,
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'Unauthorized' }
  if (!notificationId) return { success: false, error: 'notificationId is required.' }

  const impersonatedMerchant = await getImpersonatedMerchantScope()
  if (impersonatedMerchant) {
    const serviceRole = createServiceRoleClient() as any
    const { data: notification, error: notificationError } = await serviceRole
      .from('app_notifications')
      .select('id, recipient_user_id')
      .eq('id', notificationId)
      .eq('audience', 'merchant')
      .eq('merchant_id', impersonatedMerchant.merchantId)
      .maybeSingle()

    if (
      notificationError ||
      !notification ||
      !isNotificationForUser(notification, userId)
    ) {
      return { success: false, error: 'Notification not found.' }
    }

    const { error } = await serviceRole.from('app_notification_reads').upsert(
      {
        notification_id: notificationId,
        user_id: userId,
        read_at: new Date().toISOString(),
      },
      { onConflict: 'notification_id,user_id' },
    )

    return error ? { success: false, error: error.message } : { success: true }
  }

  const supabase = createServerSupabaseClient() as any
  const { error } = await supabase.rpc('mark_app_notification_read', {
    p_notification_id: notificationId,
  })

  if (error) {
    console.error('[MarkReadOnlyNotificationRead] failed:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function MarkAllReadOnlyNotificationsRead(): Promise<{
  success: boolean
  markedCount?: number
  error?: string
}> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'Unauthorized' }

  const impersonatedMerchant = await getImpersonatedMerchantScope()
  if (impersonatedMerchant) {
    const serviceRole = createServiceRoleClient() as any
    const { data: rows, error: notificationError } = await serviceRole
      .from('app_notifications')
      .select('id, recipient_user_id')
      .eq('audience', 'merchant')
      .eq('merchant_id', impersonatedMerchant.merchantId)
      .limit(1000)

    if (notificationError) return { success: false, error: notificationError.message }

    const notificationIds = (rows ?? [])
      .filter((notification: { recipient_user_id?: string | null }) =>
        isNotificationForUser(notification, userId),
      )
      .map((notification: { id: string }) => notification.id)

    if (!notificationIds.length) return { success: true, markedCount: 0 }

    const readAt = new Date().toISOString()
    const { error } = await serviceRole.from('app_notification_reads').upsert(
      notificationIds.map((notificationId: string) => ({
        notification_id: notificationId,
        user_id: userId,
        read_at: readAt,
      })),
      { onConflict: 'notification_id,user_id' },
    )

    return error
      ? { success: false, error: error.message }
      : { success: true, markedCount: notificationIds.length }
  }

  const supabase = createServerSupabaseClient() as any
  const { data, error } = await supabase.rpc('mark_all_app_notifications_read')

  if (error) {
    console.error('[MarkAllReadOnlyNotificationsRead] failed:', error)
    return { success: false, error: error.message }
  }

  return { success: true, markedCount: Number(data ?? 0) }
}
