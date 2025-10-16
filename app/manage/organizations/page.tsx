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
    Filter,
    Plus,
    MoreHorizontal,
    TrendingUp,
    TrendingDown,
    Users,
    DollarSign,
    Target,
    ArrowUpRight,
    ArrowDownRight,
    CheckCircle,
    XCircle,
    Clock
} from 'lucide-react'
import Link from 'next/link'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCarrierOrganizations } from '../hooks/useCarrierOrganizations'
import { useRouter } from 'next/navigation'


export default function OrganizationsPage() {
    const router = useRouter()
        const { data: organizationsData, isLoading, error } = useCarrierOrganizations()
    if (isLoading) return (
        <div className="space-y-6 animate-in fade-in-0 duration-300">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-7 w-48 bg-muted rounded-md animate-pulse" />
                    <div className="h-4 w-72 bg-muted rounded-md animate-pulse" />
                </div>
                <div className="h-9 w-32 bg-muted rounded-md animate-pulse" />
            </div>

            {/* KPI cards skeleton */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="border rounded-xl p-4 bg-card">
                        <div className="flex items-center justify-between pb-2">
                            <div className="h-4 w-24 bg-muted rounded-md animate-pulse" />
                            <div className="h-4 w-4 bg-muted rounded-sm animate-pulse" />
                        </div>
                        <div className="h-7 w-28 bg-muted rounded-md animate-pulse" />
                        <div className="h-3 w-40 mt-2 bg-muted rounded-md animate-pulse" />
                    </div>
                ))}
            </div>

            {/* Table skeleton */}
            <div className="border rounded-xl overflow-hidden">
                <div className="border-b p-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-2">
                            <div className="h-5 w-40 bg-muted rounded-md animate-pulse" />
                            <div className="h-4 w-64 bg-muted rounded-md animate-pulse" />
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-9 w-64 bg-muted rounded-md animate-pulse" />
                            <div className="h-9 w-20 bg-muted rounded-md animate-pulse" />
                        </div>
                    </div>
                </div>
                <div className="divide-y">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-12 items-center gap-4 px-4 py-3">
                            <div className="col-span-3 h-4 bg-muted rounded-md animate-pulse" />
                            <div className="col-span-2 h-4 bg-muted rounded-md animate-pulse" />
                            <div className="col-span-2 h-4 bg-muted rounded-md animate-pulse" />
                            <div className="col-span-1 h-4 bg-muted rounded-md animate-pulse" />
                            <div className="col-span-1 h-4 bg-muted rounded-md animate-pulse" />
                            <div className="col-span-1 h-4 bg-muted rounded-md animate-pulse" />
                            <div className="col-span-1 h-8 w-8 bg-muted rounded-md animate-pulse justify-self-end" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )

    if (error) return (
        <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in-0 duration-300">
            <div className="relative">
                <div className="absolute inset-0 rounded-full bg-destructive/20 blur-2xl animate-pulse" />
                <div className="h-14 w-14 rounded-full border-4 border-destructive border-t-transparent animate-spin" />
            </div>
            <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">We hit a snag loading organizations</h3>
                <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => window.location.reload()}
                    className="h-9 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                    Retry
                </button>
                <button
                    onClick={() => history.back()}
                    className="h-9 px-4 rounded-md border border-border hover:bg-muted transition-colors"
                >
                    Go Back
                </button>
            </div>
        </div>
    )
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
                    <p className="text-muted-foreground">
                        Manage your partner organizations and their performance
                    </p>
                </div>
                <Button asChild>
                    <Link href="/manage/organizations/create-organization">
                        <Plus className="mr-2 h-4 w-4" />
                        Create Organization
                    </Link>
                </Button>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Partners</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">1,234</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-600">+12.5%</span> from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$2.4M</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-600">+8.2%</span> from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Conversion</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">11.2%</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-600">+2.1%</span> from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Partners</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">1,156</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-600">+5.3%</span> from last month
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Search and Filters */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Partner Organizations</CardTitle>
                            <CardDescription>
                                Manage and monitor your partner organizations
                            </CardDescription>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name, domain, or organization ID"
                                    className="pl-8 w-80"
                                />
                            </div>
                            <Button variant="outline" size="sm">
                                <Filter className="mr-2 h-4 w-4" />
                                Filter
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                {/* <TableHead>Domains</TableHead> */}
                                {/* <TableHead>Single Sign-On</TableHead> */}
                                <TableHead>Directory Sync</TableHead>
                                <TableHead>Users</TableHead>
                                <TableHead>Sales</TableHead>
                                <TableHead>Conversion</TableHead>
                                <TableHead>Growth</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="w-[70px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {organizationsData?.map((org) => (
                                <TableRow key={org.id} className='cursor-pointer' onClick={() => router.push(`/manage/organizations/${org.clerk_org_id}`)}>
                                    <TableCell className="font-medium">
                                        <div>
                                            <div className="font-semibold">{org.name}</div>
                                            <div className="text-sm text-muted-foreground">ID: {org.clerk_org_id}</div>
                                        </div>
                                    </TableCell>
                                    {/* <TableCell>
                                        <Badge variant="outline">{org.domain}</Badge>
                                    </TableCell> */}
                                    {/* <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                            <span className="text-sm">{org.sso}</span>
                                        </div>
                                    </TableCell> */}
                                    <TableCell>
                                        {org.directorySync ? (
                                            <div className="flex items-center gap-2">
                                                <CheckCircle className="h-4 w-4 text-green-600" />
                                                <span className="text-sm">Enabled</span>
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            <Users className="h-4 w-4 text-muted-foreground" />
                                            <span>{org.organizations.members.length}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {/* ${org.sales.toLocaleString()} */}
                                        $0
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            <Target className="h-4 w-4 text-muted-foreground" />
                                            {/* <span>{org.conversions}%</span> */}
                                            <span>0%</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            {org.growth > 0 ? (
                                                <ArrowUpRight className="h-3 w-3 text-green-600" />
                                            ) : (
                                                <ArrowDownRight className="h-3 w-3 text-red-600" />
                                            )}
                                            <span className={org.growth > 0 ? 'text-green-600' : 'text-red-600'}>
                                                {/* {org.growth > 0 ? '+' : ''}{org.growth}% */}
                                                <span>0%</span>
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {new Date(org.created_at).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                        })}
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
                                                    View Details
                                                </DropdownMenuItem>
                                                <DropdownMenuItem>
                                                    Edit Organization
                                                </DropdownMenuItem>
                                                <DropdownMenuItem>
                                                    View Analytics
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem>
                                                    Manage Users
                                                </DropdownMenuItem>
                                                <DropdownMenuItem>
                                                    Configure SSO
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-red-600">
                                                    Suspend Organization
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

            {/* Performance Summary */}
            {/* <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Top Performers</CardTitle>
                        <CardDescription>Organizations with highest sales this month</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {organizationsData
                                .sort((a, b) => b.sales - a.sales)
                                .slice(0, 3)
                                .map((org, index) => (
                                    <div key={org.id} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold">
                                                {index + 1}
                                            </div>
                                            <div>
                                                <div className="font-medium">{org.name}</div>
                                                <div className="text-sm text-muted-foreground">{org.domain}</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-semibold">${org.sales.toLocaleString()}</div>
                                            <div className="text-sm text-muted-foreground">{org.conversions}% conv.</div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Growth Leaders</CardTitle>
                        <CardDescription>Organizations with highest growth rates</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {organizationsData
                                .filter(org => org.growth > 0)
                                .sort((a, b) => b.growth - a.growth)
                                .slice(0, 3)
                                .map((org, index) => (
                                    <div key={org.id} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700">
                                                {index + 1}
                                            </div>
                                            <div>
                                                <div className="font-medium">{org.name}</div>
                                                <div className="text-sm text-muted-foreground">{org.transactions} transactions</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-semibold text-green-600">+{org.growth}%</div>
                                            <div className="text-sm text-muted-foreground">${org.sales.toLocaleString()}</div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Status Overview</CardTitle>
                        <CardDescription>Organization status distribution</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                    <span className="text-sm">Active</span>
                                </div>
                                <Badge variant="default">1,156</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-yellow-600" />
                                    <span className="text-sm">Pending</span>
                                </div>
                                <Badge variant="secondary">45</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <XCircle className="h-4 w-4 text-red-600" />
                                    <span className="text-sm">Suspended</span>
                                </div>
                                <Badge variant="destructive">33</Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div> */}
        </div>
    )
}