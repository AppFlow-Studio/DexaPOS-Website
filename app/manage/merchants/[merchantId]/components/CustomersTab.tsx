'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Download, Users } from 'lucide-react'
import { useAdminCustomers } from '@/lib/queries/use-admin-customers'
import { CustomerList } from '@/app/dashboard/customers/components/CustomerList'
import { AdminCustomerProfileSheet } from './AdminCustomerProfileSheet'
import { CustomerListItem } from '@/types/customer'
import { MerchantDetails } from '@/types/merchant'

interface CustomersTabProps {
    merchantInfo?: MerchantDetails
}

export function CustomersTab({ merchantInfo }: CustomersTabProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerListItem | null>(null)
    const [isProfileOpen, setIsProfileOpen] = useState(false)

    const clerkOrgId = merchantInfo?.clerk_org_id || ''

    const { data: customers = [], isLoading } = useAdminCustomers(clerkOrgId)

    // Filter customers
    const filteredCustomers = customers.filter(customer => {
        if (!searchTerm) return true
        const term = searchTerm.toLowerCase()
        const name = (customer.name || '').toLowerCase()
        const email = (customer.email || '').toLowerCase()
        const phone = (customer.phone || '').toLowerCase()
        return name.includes(term) || email.includes(term) || phone.includes(term)
    })

    const handleViewProfile = (customer: CustomerListItem) => {
        setSelectedCustomer(customer)
        setIsProfileOpen(true)
    }

    if (!clerkOrgId) {
        return (
            <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                    Missing merchant configuration (clerk_org_id)
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                   <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Customer Management
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        View and manage customer database
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative w-full sm:w-[300px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search customers..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" size="icon">
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <CustomerList
                customers={filteredCustomers}
                isLoading={isLoading}
                onViewProfile={handleViewProfile}
            />

            <AdminCustomerProfileSheet
                customer={selectedCustomer}
                merchantId={merchantInfo?.id || null}
                open={isProfileOpen}
                onOpenChange={setIsProfileOpen}
            />
        </div>
    )
}
