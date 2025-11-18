'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UserPlus, ShoppingCart } from 'lucide-react'

export function ProductsTab() {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Product Management</CardTitle>
                        <CardDescription>Manage inventory and product catalog</CardDescription>
                    </div>
                    <Button size="sm">
                        <UserPlus className="h-4 w-4 mr-2" /> Add Product
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-center py-12">
                    <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Product Management</h3>
                    <p className="text-sm text-muted-foreground">
                        Product catalog and inventory management features coming soon.
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
