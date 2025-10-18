'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Building2,
    Search,
    Plus,
    MoreHorizontal,
    TrendingUp,
    TrendingDown,
    Eye,
    Edit,
    Trash2
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMerhcantOrganizations } from '../hooks/useMerchantOrganizations'
import { MerchantsModel } from '@/types/db-modles'
import { useRouter } from 'next/navigation'

const merchantsData = [
    {
        id: 1,
        name: 'Coffee Corner',
        type: 'Restaurant',
        status: 'active',
        revenue: 12500,
        transactions: 245,
        growth: 12.5,
        location: 'New York, NY',
        joinedDate: '2024-01-15',
    },
    {
        id: 2,
        name: 'Tech Store Pro',
        type: 'Retail',
        status: 'active',
        revenue: 9800,
        transactions: 189,
        growth: 8.2,
        location: 'San Francisco, CA',
        joinedDate: '2024-02-20',
    },
    {
        id: 3,
        name: 'Fresh Market',
        type: 'Grocery',
        status: 'pending',
        revenue: 7200,
        transactions: 156,
        growth: -2.1,
        location: 'Chicago, IL',
        joinedDate: '2024-03-10',
    },
    {
        id: 4,
        name: 'Beauty Salon',
        type: 'Service',
        status: 'active',
        revenue: 5600,
        transactions: 134,
        growth: 15.3,
        location: 'Miami, FL',
        joinedDate: '2024-03-25',
    },
    {
        id: 5,
        name: 'Pharmacy Plus',
        type: 'Healthcare',
        status: 'suspended',
        revenue: 4200,
        transactions: 98,
        growth: 5.7,
        location: 'Austin, TX',
        joinedDate: '2024-04-05',
    },
]

export default function MerchantsPage() {
    const router = useRouter()
    const { data: merchantsData, isLoading, isError, refetch: refetchMerchants } = useMerhcantOrganizations()
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-800 mb-4" />
                <p className="text-lg text-muted-foreground">Loading merchants...</p>
            </div>
        )
    }

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px]">
                <span className="text-destructive text-2xl mb-2">⚠️</span>
                <p className="text-lg text-destructive mb-4">Failed to load merchants.</p>
                <Button onClick={async () => await refetchMerchants()} variant="outline">
                    Retry
                </Button>
            </div>
        )
    }
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Merchants</h1>
                    <p className="text-muted-foreground">
                        Manage and monitor your merchant accounts
                    </p>
                </div>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Merchant
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Merchants</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">1,234</div>
                        <p className="text-xs text-muted-foreground">
                            +12.5% from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Merchants</CardTitle>
                        <TrendingUp className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">1,156</div>
                        <p className="text-xs text-muted-foreground">
                            +8.2% from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
                        <TrendingDown className="h-4 w-4 text-yellow-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">45</div>
                        <p className="text-xs text-muted-foreground">
                            -5.2% from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Suspended</CardTitle>
                        <TrendingDown className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">33</div>
                        <p className="text-xs text-muted-foreground">
                            +2.1% from last month
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Search and Filters */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>All Merchants</CardTitle>
                            <CardDescription>
                                A list of all merchants in your system
                            </CardDescription>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search merchants..." className="pl-8 w-64" />
                            </div>
                            <Button variant="outline" size="sm">
                                Filter
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Merchant</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Revenue</TableHead>
                                <TableHead>Transactions</TableHead>
                                <TableHead>Growth</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead>Joined</TableHead>
                                <TableHead className="w-[70px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {merchantsData?.map((merchant: MerchantsModel) => (
                                <TableRow key={merchant.id} className="cursor-pointer" onClick={() => router.push(`/manage/merchants/${merchant.clerk_org_id}`)} >
                                    <TableCell className="font-medium">
                                        <div>
                                            <div className="font-semibold">{merchant.name}</div>
                                            <div className="text-sm text-muted-foreground">ID: {merchant.id}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{merchant.type}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                        // variant={
                                        //     merchant.status === 'active' ? 'default' :
                                        //         merchant.status === 'pending' ? 'secondary' : 'destructive'
                                        // }
                                        >
                                            {/* {merchant.status} */}
                                            N/A
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        $0
                                    </TableCell>
                                    <TableCell>{/*merchant.transactions*/}0</TableCell>
                                    <TableCell>
                                        <div className="flex items-center">
                                            {/* {merchant.growth > 0 ? (
                                                <TrendingUp className="h-3 w-3 text-green-600 mr-1" />
                                            ) : (
                                                <TrendingDown className="h-3 w-3 text-red-600 mr-1" />
                                            )}
                                            <span className={merchant.growth > 0 ? 'text-green-600' : 'text-red-600'}>
                                                {merchant.growth > 0 ? '+' : ''}{merchant.growth}%
                                            </span> */}
                                            0
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {/* {merchant.location} */}
                                        N/A
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {new Date(merchant.created_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem>
                                                    <Eye className="mr-2 h-4 w-4" />
                                                    View Details
                                                </DropdownMenuItem>
                                                <DropdownMenuItem>
                                                    <Edit className="mr-2 h-4 w-4" />
                                                    Edit Merchant
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-red-600">
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
