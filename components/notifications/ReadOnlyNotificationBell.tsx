'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth, useSession } from '@clerk/nextjs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  GetReadOnlyNotifications,
  MarkAllReadOnlyNotificationsRead,
  MarkReadOnlyNotificationRead,
  type ReadOnlyNotification,
} from '@/app/actions/read-only-notifications'
import { cn } from '@/lib/utils'

const QUERY_KEY = ['read-only-app-notifications'] as const

function formatNotificationTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function ReadOnlyNotificationBell() {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const { userId, orgId } = useAuth()
  const { session } = useSession()
  const [open, setOpen] = useState(false)

  const notificationQueryKey = useMemo(
    () => [
      ...QUERY_KEY,
      userId ?? 'anonymous',
      orgId ?? 'no-org',
      pathname.startsWith('/manage') ? 'hq' : 'merchant',
    ],
    [orgId, pathname, userId],
  )

  const { data, isLoading } = useQuery({
    queryKey: notificationQueryKey,
    queryFn: () => GetReadOnlyNotifications(20),
    enabled: Boolean(userId),
    refetchInterval: 60_000,
    staleTime: 15_000,
  })

  const markOne = useMutation({
    mutationFn: MarkReadOnlyNotificationRead,
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationQueryKey }),
  })

  const markAll = useMutation({
    mutationFn: () => MarkAllReadOnlyNotificationsRead(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationQueryKey }),
  })

  useEffect(() => {
    if (!session) return

    const invalidate = () => queryClient.invalidateQueries({ queryKey: notificationQueryKey })
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { accessToken: async () => (await session.getToken()) ?? null },
    )
    const channel = supabase
      .channel(`read-only-app-notifications:${userId ?? 'anonymous'}:${orgId ?? 'no-org'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_notifications' },
        invalidate,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [notificationQueryKey, orgId, queryClient, session, userId])

  const unreadCount = data?.unreadCount ?? 0
  const notifications = data?.notifications ?? []
  const badge = unreadCount > 99 ? '99+' : String(unreadCount)

  const openNotification = (notification: ReadOnlyNotification) => {
    if (!notification.is_read) markOne.mutate(notification.id)
    setOpen(false)
    if (notification.href) router.push(notification.href)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
              {badge}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,390px)] overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="font-semibold">Notifications</div>
            <div className="text-xs text-muted-foreground">Read-only account and billing updates</div>
          </div>
          {unreadCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => openNotification(notification)}
                className={cn(
                  'relative block w-full border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/55',
                  !notification.is_read && 'bg-primary/[0.055]',
                )}
              >
                {!notification.is_read ? (
                  <span className="absolute left-1.5 top-4 h-2 w-2 rounded-full bg-primary" />
                ) : null}
                <div className="flex items-start justify-between gap-3 pl-1">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{notification.title}</div>
                    <div className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                      {notification.body}
                    </div>
                  </div>
                  <time className="shrink-0 text-[11px] text-muted-foreground">
                    {formatNotificationTime(notification.created_at)}
                  </time>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
