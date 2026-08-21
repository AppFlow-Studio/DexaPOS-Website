'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Users, Clock, DollarSign, Eye } from 'lucide-react'
// Date formatting helpers
function format(dateString: string, formatStr: string): string {
    const date = new Date(dateString)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = months[date.getMonth()]
    const day = date.getDate()
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? 'pm' : 'am'
    const displayHours = hours % 12 || 12
    const displayMinutes = minutes.toString().padStart(2, '0')

    if (formatStr === 'MMM d, h:mm a') {
        return `${month} ${day}, ${displayHours}:${displayMinutes} ${ampm}`
    }
    return `${month} ${day}, ${displayHours}:${displayMinutes} ${ampm}`
}

interface HistorySession {
    id: string
    session_number: string
    guest_name?: string
    party_size: number
    seated_at: string
    cleared_at?: string
    duration_minutes?: number
    total_amount?: number
    status: string
}

interface HistoryPanelProps {
    sessions: HistorySession[]
    onViewDetails?: (sessionId: string) => void
}

export function HistoryPanel({ sessions, onViewDetails }: HistoryPanelProps) {
    if (sessions.length === 0) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="text-center text-muted-foreground">
                        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No history available</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-2">
            {sessions.map((session) => (
                <Card key={session.id} className="rounded-2xl shadow-none transition-colors hover:border-primary/30">
                    <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <CardTitle className="text-base">
                                    {session.guest_name || session.session_number}
                                </CardTitle>
                                <CardDescription className="mt-1 flex items-center gap-4">
                                    <span className="flex items-center gap-1">
                                        <Users className="h-3 w-3" />
                                        {session.party_size}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {session.duration_minutes || 0} min
                                    </span>
                                    <span className="text-xs">
                                        {format(session.seated_at, 'MMM d, h:mm a')}
                                    </span>
                                </CardDescription>
                            </div>
                            <Badge variant="outline">{session.status}</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="flex items-center justify-between">
                            {session.total_amount !== undefined && (
                                <div className="flex items-center gap-1 text-sm font-medium">
                                    <DollarSign className="h-4 w-4" />
                                    ${session.total_amount.toFixed(2)}
                                </div>
                            )}
                            {onViewDetails && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onViewDetails(session.id)}
                                >
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

