'use client'

import * as React from 'react'
import { OrderStatusHistory, OrderStatus, TableSessionWithEvents, TableSessionEvent } from '@/types/order-management'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Clock, User, Smartphone, Utensils, Calendar } from 'lucide-react'

interface OrderStatusTimelineProps {
    statusHistory: OrderStatusHistory[]
    currentStatus: OrderStatus
    createdAt: string
    tableSessions?: TableSessionWithEvents[]
}

// Status labels for display
const statusLabels: Record<OrderStatus, string> = {
    draft: 'Open',
    pending: 'Pending',
    sent_to_kitchen: 'Sent to Kitchen',
    preparing: 'Preparing',
    ready: 'Ready',
    completed: 'Completed',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
    void: 'Void',
}

const statusColors: Record<OrderStatus, string> = {
    draft: 'bg-gray-500',
    pending: 'bg-yellow-500',
    sent_to_kitchen: 'bg-indigo-500',
    preparing: 'bg-blue-500',
    ready: 'bg-green-500',
    completed: 'bg-emerald-600',
    cancelled: 'bg-red-500',
    refunded: 'bg-orange-500',
    void: 'bg-gray-700',
}

// Format time display
function formatTime(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) {
        return 'Just now'
    }

    if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60)
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
    }

    if (diffInSeconds < 18000) {
        const hours = Math.floor(diffInSeconds / 3600)
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`
    }

    // For older dates, show formatted date
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    })
}

function statusLabel(status: OrderStatus | null | undefined): string {
    if (!status) return ''
    return statusLabels[status] ?? status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function getStatusChangeMessage(fromStatus: OrderStatus | null | undefined, toStatus: OrderStatus | null | undefined): string {
    const to = statusLabel(toStatus)
    const from = statusLabel(fromStatus)

    if (!from) {
        return `Order created with status: ${to || 'Unknown'}`
    }
    if (!to) {
        return `Status changed from ${from}`
    }
    return `Status changed from ${from} to ${to}`
}

// Get table session event message
function getTableSessionEventMessage(event: TableSessionEvent): string {
    const eventType = event.event_type
    const eventData = event.event_data || {}

    switch (eventType) {
        case 'table_assigned':
            return `Table ${eventData.table_number || 'N/A'} assigned to order`
        case 'table_cleared':
            return `Table ${eventData.table_number || 'N/A'} cleared`
        case 'session_started':
            return `Table session started`
        case 'session_ended':
            return `Table session ended`
        case 'order_placed':
            return `Order placed at table`
        case 'payment_processed':
            return `Payment processed`
        default:
            return eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    }
}

export function OrderStatusTimeline({
    statusHistory,
    currentStatus,
    createdAt,
    tableSessions = [],
}: OrderStatusTimelineProps) {
    // Combine order creation, status history, and table session events
    const timelineEvents = React.useMemo(() => {
        const events: Array<{
            id: string
            type: 'creation' | 'status_change' | 'table_session_event'
            fromStatus?: OrderStatus | null
            toStatus?: OrderStatus
            timestamp: string
            changedBy?: string
            deviceId?: string
            reason?: string
            notes?: string
            eventType?: string
            eventData?: Record<string, any>
            triggeredBy?: string
            triggeredByName?: string
            changedByName?: string
            triggeredBySystem?: boolean
        }> = []

        // Add order creation event
        events.push({
            id: 'creation',
            type: 'creation',
            fromStatus: null,
            toStatus: 'draft',
            timestamp: createdAt,
        })

        // Add status history events
        statusHistory.forEach((history) => {
            
            events.push({
                id: history.id,
                type: 'status_change',
                fromStatus: history.from_status,
                toStatus: history.to_status,
                timestamp: history.changed_at,
                changedBy: history.changed_by_staff_id || history.changed_by_user_id,
                changedByName: history?.staff_profiles?.first_name ? 
                    history?.staff_profiles?.first_name + ' ' + history?.staff_profiles?.last_name :
                    history?.users?.first_name + ' ' + history?.users?.last_name || '',
                deviceId: history.device_id,
                reason: history.reason,
                notes: history.notes,
            })
        })

        // Add table session events
        tableSessions.forEach((session) => {
            if (session.table_session_events && session.table_session_events.length > 0) {
                session.table_session_events.forEach((event) => {
                    events.push({
                        id: event.id,
                        type: 'table_session_event',
                        timestamp: event.occurred_at,
                        eventType: event.event_type,
                        eventData: event.event_data,
                        triggeredBy: event.triggered_by_staff_id || event.triggered_by_user_id,
                        triggeredBySystem: event.triggered_by_system,
                        triggeredByName: event.staff_profiles?.first_name + ' ' + event.staff_profiles?.last_name,
                        notes: event.notes,
                    })
                })
            }
        })

        // Sort by timestamp (newest first)
        return events.sort((a, b) => {
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        })
    }, [statusHistory, createdAt, tableSessions])

    if (timelineEvents.length === 0) {
        return (
            <div className="text-sm text-muted-foreground py-4">
                No status history available
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-semibold">Timeline</h3>
            <div className="relative">
                {/* Timeline line - positioned at 9px from left (center of 18px dot container) */}
                <div className="absolute left-[9px] top-0 bottom-0 w-px bg-border" />

                {/* Timeline events */}
                <div className="space-y-4">
                    {timelineEvents.map((event, index) => {
                        let statusColor = 'bg-gray-500'
                        let eventIcon: React.ReactNode = null
                        let eventMessage = ''

                        if (event.type === 'creation') {
                            statusColor = statusColors[event.toStatus || 'draft'] || 'bg-gray-500'
                            eventMessage = `Order created with status: ${statusLabel(event.toStatus) || 'Open'}`
                        } else if (event.type === 'status_change') {
                            statusColor = statusColors[event.toStatus || 'draft'] || 'bg-gray-500'
                            eventMessage = getStatusChangeMessage(event.fromStatus, event.toStatus)
                        } else if (event.type === 'table_session_event') {
                            statusColor = 'bg-blue-500'
                            eventIcon = <Utensils className="h-3 w-3" />
                            eventMessage = getTableSessionEventMessage({
                                id: event.id || '',
                                session_id: '',
                                event_type: event.eventType || '',
                                event_data: event.eventData || {},
                                notes: event.notes || '',
                                occurred_at: event.timestamp,
                                minutes_since_previous: 0,
                            })
                        }
                        return (
                            <div key={event.id} className="relative flex gap-3">
                                {/* Timeline dot container - 18px wide, dot centered at 9px to align with line */}
                                <div className="relative z-10 flex-shrink-0 w-[18px] flex items-center justify-center">
                                    <div
                                        className={cn(
                                            'h-2 w-2 rounded-full',
                                            statusColor
                                        )}
                                    />
                                </div>

                                {/* Event content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center gap-1.5">
                                                {eventIcon}
                                                <p className="text-sm text-foreground leading-relaxed">
                                                    {eventMessage}
                                                </p>
                                            </div>

                                            {/* Additional details */}
                                            {(event.reason || event.notes) && (
                                                <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                                                    {event.reason && (
                                                        <p>
                                                            <span className="font-medium">Reason:</span> {event.reason}
                                                        </p>
                                                    )}
                                                    {event.notes && (
                                                        <p>
                                                            <span className="font-medium">Notes:</span> {event.notes}
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Changed by, triggered by, and device info */}
                                            {(event.changedBy || event.triggeredBy || event.triggeredByName || event.deviceId) && (
                                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                                    {(event.changedBy || event.triggeredBy) && (
                                                        <div className="flex items-center gap-1">
                                                            <User className="h-3 w-3" />
                                                            <span>{ event.triggeredByName ||event.changedByName || event.changedBy || event.triggeredBy}</span>
                                                        </div>
                                                    )}
                                                    {event.triggeredBySystem && (
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-xs">System</span>
                                                        </div>
                                                    )}
                                                    {event.deviceId && (
                                                        <div className="flex items-center gap-1">
                                                            <Smartphone className="h-3 w-3" />
                                                            <span>{event.deviceId}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Event data for table session events */}
                                            {event.type === 'table_session_event' && event.eventData && Object.keys(event.eventData).length > 0 && (
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    <details className="cursor-pointer">
                                                        <summary className="font-medium">Event Details</summary>
                                                        <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto">
                                                            {JSON.stringify(event.eventData, null, 2)}
                                                        </pre>
                                                    </details>
                                                </div>
                                            )}
                                        </div>

                                        {/* Timestamp */}
                                        <div className="flex-shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                                            {formatTime(event.timestamp)}
                                        </div>
                                    </div>

                                    {/* Status badge for status changes */}
                                    {event.type === 'status_change' && event.toStatus && statusLabel(event.toStatus) && (
                                        <div className="mt-2">
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    'text-xs',
                                                    event.toStatus === 'completed' && 'bg-green-50 text-green-700 border-green-200',
                                                    event.toStatus === 'cancelled' && 'bg-red-50 text-red-700 border-red-200',
                                                    event.toStatus === 'void' && 'bg-gray-50 text-gray-700 border-gray-200',
                                                    event.toStatus === 'ready' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                                    event.toStatus === 'sent_to_kitchen' && 'bg-indigo-50 text-indigo-700 border-indigo-200',
                                                    event.toStatus === 'preparing' && 'bg-blue-50 text-blue-700 border-blue-200',
                                                    event.toStatus === 'pending' && 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                                )}
                                            >
                                                {statusLabel(event.toStatus)}
                                            </Badge>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

