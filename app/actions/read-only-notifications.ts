'use server'

import { auth } from '@clerk/nextjs/server'
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

export async function GetReadOnlyNotifications(
  limit = 20,
): Promise<ReadOnlyNotificationFeed> {
  const { userId } = await auth()
  if (!userId) return { notifications: [], unreadCount: 0 }

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

  const supabase = createServerSupabaseClient() as any
  const { data, error } = await supabase.rpc('mark_all_app_notifications_read')

  if (error) {
    console.error('[MarkAllReadOnlyNotificationsRead] failed:', error)
    return { success: false, error: error.message }
  }

  return { success: true, markedCount: Number(data ?? 0) }
}
