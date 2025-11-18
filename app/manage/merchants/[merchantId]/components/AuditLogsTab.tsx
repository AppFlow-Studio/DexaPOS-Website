'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function AuditLogsTab() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Audit logs</CardTitle>
                <CardDescription>Security and activity for this merchant</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">No events to display.</CardContent>
        </Card>
    )
}
