'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Download, Users } from 'lucide-react'

export function CustomersTab() {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Customer Management</CardTitle>
                        <CardDescription>View and manage customer information</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input placeholder="Search customers..." className="w-64" />
                        <Button variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-2" /> Export
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-center py-12">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Customer Management</h3>
                    <p className="text-sm text-muted-foreground">
                        Customer management features coming soon. Track customer loyalty, purchase history, and more.
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
