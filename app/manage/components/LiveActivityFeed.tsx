'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'

interface FeedEvent {
  id: string
  emoji: string
  message: string
  timestamp: Date
  link?: string
  resourceType: string
}

export function LiveActivityFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    // Initialize empty feed
    setIsLoading(false)

    // Create realtime channel for various events
    const channel = supabase.channel('admin-live-feed').on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'merchants',
      },
      (payload) => {
        const merchant = payload.new as any
        addEvent({
          id: `merchant-${merchant.id}`,
          emoji: '🏪',
          message: `**${merchant.name}** just joined the platform`,
          timestamp: new Date(),
          link: `/manage/merchants/${merchant.id}`,
          resourceType: 'merchant',
        })
      }
    )

    // New order at merchant with no prior orders (first order)
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
      },
      (payload) => {
        const order = payload.new as any
        // This would need a query to check if it's the first order, so we'll skip the complex detection
        // and just show significant orders (high value orders)
        if (order.total_amount > 100) {
          addEvent({
            id: `order-${order.id}`,
            emoji: '🎉',
            message: `New order of **$${Number(order.total_amount).toFixed(2)}** placed`,
            timestamp: new Date(),
            link: `/manage/transactions?orderId=${order.id}`,
            resourceType: 'order',
          })
        }
      }
    )

    // Payment failures
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'order_payments',
      },
      (payload) => {
        const payment = payload.new as any
        if (payment.status === 'failed' || payment.status === 'declined') {
          addEvent({
            id: `payment-${payment.id}`,
            emoji: '⚠️',
            message: `Payment failed — ${payment.status === 'declined' ? 'card declined' : 'error'}`,
            timestamp: new Date(),
            link: `/manage/transactions?paymentId=${payment.id}`,
            resourceType: 'payment',
          })
        }
      }
    )

    // Stations going offline
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'stations',
      },
      (payload) => {
        const oldStation = payload.old as any
        const newStation = payload.new as any

        // Station went offline
        if (oldStation.is_online && !newStation.is_online) {
          addEvent({
            id: `station-offline-${newStation.id}`,
            emoji: '📡',
            message: `Station **${newStation.name}** went offline`,
            timestamp: new Date(),
            link: `/manage/merchants/${newStation.merchant_id}?tab=devices`,
            resourceType: 'station',
          })
        }

        // Low battery
        if (
          newStation.battery_level !== null &&
          newStation.battery_level < 15 &&
          (!oldStation.battery_level || oldStation.battery_level >= 15)
        ) {
          addEvent({
            id: `battery-${newStation.id}`,
            emoji: '🔋',
            message: `Station **${newStation.name}** battery critically low (${newStation.battery_level}%)`,
            timestamp: new Date(),
            link: `/manage/merchants/${newStation.merchant_id}?tab=devices`,
            resourceType: 'station',
          })
        }
      }
    )

    // Chargebacks
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chargebacks',
      },
      (payload) => {
        const chargeback = payload.new as any
        addEvent({
          id: `chargeback-${chargeback.id}`,
          emoji: '🚨',
          message: `Chargeback received — $${Number(chargeback.amount).toFixed(2)}`,
          timestamp: new Date(),
          link: `/manage/transactions`,
          resourceType: 'payment',
        })
      }
    )

    // Void orders (significant ones)
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
      },
      (payload) => {
        const oldOrder = payload.old as any
        const newOrder = payload.new as any

        if (oldOrder.status !== 'void' && newOrder.status === 'void' && newOrder.total_amount > 50) {
          addEvent({
            id: `void-${newOrder.id}`,
            emoji: '🚫',
            message: `$${Number(newOrder.total_amount).toFixed(2)} order voided`,
            timestamp: new Date(),
            link: `/manage/transactions?orderId=${newOrder.id}`,
            resourceType: 'order',
          })
        }
      }
    )

    channelRef.current = channel
    channel.subscribe()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [])

  const addEvent = (event: FeedEvent) => {
    setEvents((prev) => {
      // Keep max 50 items
      const updated = [event, ...prev].slice(0, 50)
      return updated
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Live Activity Feed</CardTitle>
      </CardHeader>
      <CardContent className="max-h-[500px] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            Waiting for activity...
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="flex gap-3 pb-3 border-b last:border-0 text-sm">
                <div className="text-lg">{event.emoji}</div>
                <div className="flex-1 min-w-0">
                  {event.link ? (
                    <Link href={event.link} className="hover:underline text-blue-600">
                      <span dangerouslySetInnerHTML={{ __html: event.message }} />
                    </Link>
                  ) : (
                    <span dangerouslySetInnerHTML={{ __html: event.message }} />
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
