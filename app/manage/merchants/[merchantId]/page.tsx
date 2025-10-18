'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
    Store,
    Settings,
    MoreHorizontal,
    DollarSign,
    TrendingUp,
    TrendingDown,
    Users,
    Target,
    Calendar,
    MapPin,
    Phone,
    Mail,
    User,
    CreditCard,
    BarChart3,
    ShoppingCart,
    Clock,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Eye,
    Edit,
    Trash2,
    UserPlus,
    Download,
    RefreshCw,
    Building2
} from 'lucide-react'
import { useMerchantInfo } from '../../hooks/useMerchantInfo'
import { MerchantInfoModel } from '@/types/db-modles'
export default function MerchantInfoPage() {
    const { merchantId } = useParams()
    const { data: merchantInfo, isLoading, isError } = useMerchantInfo(merchantId as string)
    // Mock data - replace with actual API calls


    const recentTransactions = [
        { id: 1, amount: 45.50, customer: "Sarah Johnson", time: "2 min ago", status: "completed" },
        { id: 2, amount: 23.75, customer: "Mike Chen", time: "5 min ago", status: "completed" },
        { id: 3, amount: 67.20, customer: "Emily Davis", time: "12 min ago", status: "completed" },
        { id: 4, amount: 12.00, customer: "Alex Rodriguez", time: "18 min ago", status: "refunded" },
        { id: 5, amount: 89.90, customer: "Lisa Wang", time: "25 min ago", status: "completed" }
    ]

    const staff = [
        { id: 1, name: "John Doe", role: "Owner", email: "john@joescoffee.com", status: "active", last_login: "2 hours ago" },
        { id: 2, name: "Sarah Smith", role: "Manager", email: "sarah@joescoffee.com", status: "active", last_login: "1 hour ago" },
        { id: 3, name: "Mike Johnson", role: "Cashier", email: "mike@joescoffee.com", status: "active", last_login: "30 min ago" },
        { id: 4, name: "Emily Brown", role: "Cashier", email: "emily@joescoffee.com", status: "inactive", last_login: "2 days ago" }
    ]
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
                <span className="text-muted-foreground text-sm font-medium">Loading merchant details...</span>
            </div>
        )
    }
    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
                <div className="text-destructive font-semibold mb-1">Unable to load merchant</div>
                <div className="text-muted-foreground text-sm">{String(isError)}</div>
            </div>
        )
    }
    if (merchantInfo instanceof Error) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
                <div className="text-destructive font-semibold mb-1">Something went wrong</div>
                <div className="text-muted-foreground text-sm">{merchantInfo.message}</div>
            </div>
        )
    }


    console.log('merchantInfo', merchantInfo)
    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Link href="/manage/merchants" className="hover:underline">Merchants</Link>
                <span className="mx-2">/</span>
                <div className="hover:underline text-foreground">Merchant Details</div>
            </div>

            {/* Header */}
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
                                {merchantInfo?.organizations?.imageURL ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={merchantInfo?.organizations?.imageURL} alt={merchantInfo?.name} className="h-full w-full object-cover" />
                                ) : (
                                    <Store className="h-6 w-6 text-primary" />
                                )}
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-semibold">{merchantInfo?.name}</CardTitle>
                                {/* Carrier indicator */}
                                {merchantInfo?.carriers && (
                                    <div className="mt-1 flex items-center gap-2 text-sm">
                                        <div className="flex items-center gap-2 rounded-md border px-2 py-1">
                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-muted-foreground">Carrier:</span>
                                            <span className="font-medium text-foreground">{merchantInfo?.carriers?.name || 'Carrier'}</span>
                                            <Link href={`/manage/organizations/${merchantInfo?.carriers?.clerk_org_id || ''}`} className="text-primary hover:underline ml-2">View</Link>
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline">ID: {merchantInfo?.clerk_org_id}</Badge>
                                    <Badge variant={merchantInfo?.public_metadata?.status === 'active' ? 'default' : 'secondary'}>
                                        {merchantInfo?.public_metadata?.status}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        Created {merchantInfo?.created_at ? new Date(merchantInfo?.created_at).toLocaleDateString() : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm">
                                <Settings className="h-4 w-4 mr-2" /> Settings
                            </Button>
                            <Button variant="outline" size="sm">
                                <Download className="h-4 w-4 mr-2" /> Export Data
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Tabs */}
                    <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="flex flex-wrap gap-x-3">
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="analytics">Analytics</TabsTrigger>
                            <TabsTrigger value="transactions">Transactions</TabsTrigger>
                            <TabsTrigger value="roles">Roles</TabsTrigger>
                            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
                            <TabsTrigger value="staff">Staff</TabsTrigger>
                            <TabsTrigger value="customers">Customers</TabsTrigger>
                            <TabsTrigger value="products">Products</TabsTrigger>
                            <TabsTrigger value="settings">Settings</TabsTrigger>
                        </TabsList>

                        {/* Overview */}
                        <TabsContent value="overview" className="mt-6">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">
                                            {/* ${merchant.total_sales.toLocaleString()} */}
                                            $0
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {/* <span className="text-green-600">
                                                +{merchant.growth_rate}%</span>  */}
                                            +0%
                                            from last month
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Transactions</CardTitle>
                                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{/*{merchant.transaction_count.toLocaleString()}*/}0</div>
                                        <p className="text-xs text-muted-foreground">
                                            <span className="text-green-600">+5.2%</span> from last month
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Avg. Transaction</CardTitle>
                                        <Target className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">${/*{merchant.average_transaction}*/}0</div>
                                        <p className="text-xs text-muted-foreground">
                                            <span className="text-green-600">+2.1%</span> from last month
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Customers</CardTitle>
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{/*{merchant.customer_count.toLocaleString()}*/}0</div>
                                        <p className="text-xs text-muted-foreground">
                                            <span className="text-green-600">+12.3%</span> from last month
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Business Information */}
                            <div className="grid gap-4 md:grid-cols-2 mt-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">Business Information</CardTitle>
                                        <CardDescription>Merchant business details and contact information</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <MapPin className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <div className="font-medium">Address</div>
                                                <div className="text-sm text-muted-foreground">{merchantInfo?.public_metadata?.business_address}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <User className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <div className="font-medium">Owner</div>
                                                <div className="text-sm text-muted-foreground">{merchantInfo?.public_metadata?.owner_name}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Mail className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <div className="font-medium">Email</div>
                                                <div className="text-sm text-muted-foreground">{merchantInfo?.public_metadata?.owner_email}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Phone className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <div className="font-medium">Phone</div>
                                                <div className="text-sm text-muted-foreground">{merchantInfo?.public_metadata?.owner_phone}</div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">Recent Activity</CardTitle>
                                        <CardDescription>Latest transactions and activities</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {recentTransactions.slice(0, 5).map((transaction) => (
                                                <div key={transaction.id} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                            <ShoppingCart className="h-4 w-4 text-primary" />
                                                        </div>
                                                        <div>
                                                            <div className="font-medium">${transaction.amount}</div>
                                                            <div className="text-sm text-muted-foreground">{transaction.customer}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <Badge variant={transaction.status === 'completed' ? 'default' : 'destructive'}>
                                                            {transaction.status}
                                                        </Badge>
                                                        <div className="text-xs text-muted-foreground mt-1">{transaction.time}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        {/* Roles */}
                        <TabsContent value="roles" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>Merchant Roles</CardTitle>
                                            <CardDescription>Define access levels for merchant staff</CardDescription>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="sm">Edit priority</Button>
                                            <Button size="sm">Create role</Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Name</TableHead>
                                                <TableHead>Slug</TableHead>
                                                <TableHead>Permissions</TableHead>
                                                <TableHead className="w-10"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {[
                                                { name: 'Cashier', slug: 'cashier', desc: 'Process sales and refunds', perms: ['pos:sales:create'] },
                                                { name: 'Store Manager', slug: 'store-manager', desc: 'Manage store, products, staff', perms: ['pos:store:manage'] },
                                                { name: 'Merchant Admin', slug: 'merchant-admin', desc: 'Full access to merchant', perms: ['pos:stores:manage', 'pos:staff:manage'] },
                                            ].map((r) => (
                                                <TableRow key={r.slug}>
                                                    <TableCell>
                                                        <div className="font-medium">{r.name}</div>
                                                        <div className="text-sm text-muted-foreground">{r.desc}</div>
                                                    </TableCell>
                                                    <TableCell><Badge variant="outline">{r.slug}</Badge></TableCell>
                                                    <TableCell>
                                                        {r.perms.length ? r.perms.map((p) => (
                                                            <Badge key={p} variant="secondary" className="mr-2 mb-1">{p}</Badge>
                                                        )) : <span className="text-muted-foreground">—</span>}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                <DropdownMenuItem>Edit role</DropdownMenuItem>
                                                                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Analytics */}
                        <TabsContent value="analytics" className="mt-6">
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
                                                <span className="font-medium">${/*{merchant.monthly_revenue.toLocaleString()}*/}0</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-sm">Last Month</span>
                                                <span className="text-muted-foreground">$14,230</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-sm">Growth</span>
                                                <span className="text-green-600">+{/*{merchant.growth_rate}%*/}0%</span>
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
                                        <div className="text-3xl font-bold">{/*{merchant.conversion_rate}%*/}0%</div>
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
                        </TabsContent>

                        {/* Audit logs */}
                        <TabsContent value="audit" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Audit logs</CardTitle>
                                    <CardDescription>Security and activity for this merchant</CardDescription>
                                </CardHeader>
                                <CardContent className="text-sm text-muted-foreground">No events to display.</CardContent>
                            </Card>
                        </TabsContent>

                        {/* Transactions */}
                        <TabsContent value="transactions" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>Recent Transactions</CardTitle>
                                            <CardDescription>Latest transaction history and details</CardDescription>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Input placeholder="Search transactions..." className="w-64" />
                                            <Button variant="outline" size="sm">
                                                <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Transaction</TableHead>
                                                <TableHead>Customer</TableHead>
                                                <TableHead>Amount</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Time</TableHead>
                                                <TableHead className="w-[70px]">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {recentTransactions.map((transaction) => (
                                                <TableRow key={transaction.id}>
                                                    <TableCell className="font-medium">
                                                        #{transaction.id.toString().padStart(6, '0')}
                                                    </TableCell>
                                                    <TableCell>{transaction.customer}</TableCell>
                                                    <TableCell className="font-medium">${transaction.amount}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={transaction.status === 'completed' ? 'default' : 'destructive'}>
                                                            {transaction.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">{transaction.time}</TableCell>
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
                                                                    <Eye className="h-4 w-4 mr-2" /> View Details
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem>
                                                                    <Download className="h-4 w-4 mr-2" /> Download Receipt
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem className="text-red-600">
                                                                    <Trash2 className="h-4 w-4 mr-2" /> Refund
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
                        </TabsContent>

                        {/* Staff */}
                        <TabsContent value="staff" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>Staff</CardTitle>
                                            <CardDescription>Manage merchant staff and pending invitations</CardDescription>
                                        </div>
                                        <Button size="sm">
                                            <UserPlus className="h-4 w-4 mr-2" /> Invite Staff
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Tabs defaultValue="management" className="w-full">
                                        <TabsList>
                                            <TabsTrigger value="management">Management</TabsTrigger>
                                            <TabsTrigger value="invites">Pending Invites</TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="management" className="mt-4">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Staff Member</TableHead>
                                                        <TableHead>Role</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead>Last Login</TableHead>
                                                        <TableHead className="w-[70px]">Actions</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {staff.map((member) => (
                                                        <TableRow key={member.id}>
                                                            <TableCell>
                                                                <div className="flex items-center gap-3">
                                                                    <Avatar className="h-8 w-8">
                                                                        <AvatarFallback>{member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                                                    </Avatar>
                                                                    <div>
                                                                        <div className="font-medium">{member.name}</div>
                                                                        <div className="text-sm text-muted-foreground">{member.email}</div>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline">{member.role}</Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                {member.status === 'active' ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                                                        <span className="text-sm">Active</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center gap-2">
                                                                        <XCircle className="h-4 w-4 text-red-600" />
                                                                        <span className="text-sm">Inactive</span>
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-sm text-muted-foreground">{member.last_login}</TableCell>
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
                                                                            <Eye className="h-4 w-4 mr-2" /> View Profile
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem>
                                                                            <Edit className="h-4 w-4 mr-2" /> Edit Role
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem className="text-red-600">
                                                                            <Trash2 className="h-4 w-4 mr-2" /> Remove
                                                                        </DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TabsContent>

                                        <TabsContent value="invites" className="mt-4">
                                            {!(merchantInfo as any)?.pending_org_admin_invites?.length ? (
                                                <div className="flex flex-col items-center justify-center space-y-2 py-8 text-center">
                                                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                                        <Users className="h-6 w-6 text-muted-foreground" />
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">No pending staff invites.</div>
                                                </div>
                                            ) : (
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Invitee</TableHead>
                                                            <TableHead>Role</TableHead>
                                                            <TableHead>Status</TableHead>
                                                            <TableHead>Sent</TableHead>
                                                            <TableHead className="w-[70px]">Actions</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {(merchantInfo as any).pending_org_admin_invites.map((inv: any) => (
                                                            <TableRow key={inv.id}>
                                                                <TableCell>
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                                                                            {(inv.email?.[0] || 'U').toUpperCase()}
                                                                        </div>
                                                                        <div>
                                                                            <div className="font-medium">{inv.email}</div>
                                                                            <div className="text-xs text-muted-foreground">Invite ID: {inv.clerk_invite_id}</div>
                                                                        </div>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Badge variant="outline">{inv.role || 'member'}</Badge>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Badge variant={inv.status === 'pending' ? 'secondary' : inv.status === 'accepted' ? 'default' : 'destructive'}>
                                                                        {inv.status}
                                                                    </Badge>
                                                                </TableCell>
                                                                <TableCell className="text-sm text-muted-foreground">
                                                                    {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '-'}
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
                                                                            <DropdownMenuItem>Copy invite link</DropdownMenuItem>
                                                                            <DropdownMenuItem>Resend</DropdownMenuItem>
                                                                            <DropdownMenuSeparator />
                                                                            <DropdownMenuItem className="text-red-600">Revoke</DropdownMenuItem>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            )}
                                        </TabsContent>
                                    </Tabs>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Customers */}
                        <TabsContent value="customers" className="mt-6">
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
                        </TabsContent>

                        {/* Products */}
                        <TabsContent value="products" className="mt-6">
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
                        </TabsContent>

                        {/* Settings */}
                        <TabsContent value="settings" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Merchant Settings</CardTitle>
                                    <CardDescription>Configure merchant account and preferences</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-center py-12">
                                        <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                        <h3 className="text-lg font-semibold mb-2">Settings</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Merchant configuration and settings panel coming soon.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    )
}