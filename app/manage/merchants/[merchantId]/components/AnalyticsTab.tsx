'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function AnalyticsTab() {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Sales Performance</CardTitle>
                    <CardDescription>Monthly sales trends and metrics</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-sm">This Month</span>
                            <span className="font-medium">$0</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm">Last Month</span>
                            <span className="text-muted-foreground">$14,230</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm">Growth</span>
                            <span className="text-green-600">+0%</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Conversion Rate</CardTitle>
                    <CardDescription>Customer conversion metrics</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-3xl font-bold">0%</div>
                    <p className="text-sm text-muted-foreground">
                        <span className="text-green-600">+1.2%</span> from last month
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Peak Hours</CardTitle>
                    <CardDescription>Busiest times of day</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-sm">Morning (8-12)</span>
                            <span className="font-medium">35%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm">Afternoon (12-5)</span>
                            <span className="font-medium">45%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm">Evening (5-9)</span>
                            <span className="font-medium">20%</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
