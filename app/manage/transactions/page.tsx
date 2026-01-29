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
    CreditCard,
    Search,
    Filter,
    Download,
    MoreHorizontal,
    CheckCircle,
    XCircle,
    Clock,
    DollarSign
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePlatformKPIs, usePlatformTransactions } from '@/lib/queries/use-platform-analytics'
import { format } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'
import { useState } from 'react'
import Link from 'next/link'

export default function TransactionsPage() {
    const [page, setPage] = useState(1)
    const pageSize = 50
    const { data: kpis, isLoading: kpisLoading } = usePlatformKPIs()
    const { data: transactionsData, isLoading: transactionsLoading } = usePlatformTransactions(pageSize, (page - 1) * pageSize)

    const transactions = transactionsData?.data || []
    const totalTransactions = transactionsData?.total || 0

    const stats = [
        {
            title: 'Total Transactions',
            value: totalTransactions.toLocaleString(),
            icon: CreditCard,
            color: 'text-muted-foreground',
            sub: '+15.3% from last month'
        },
        {
            title: 'Completed',
            value: transactions.filter(t => t.status === 'completed').length.toLocaleString(), // This is just for the current page, ideally should come from aggregate stats
            icon: CheckCircle,
            color: 'text-green-600',
            sub: 'Success rate'
        },
        {
            title: 'Pending',
            value: transactions.filter(t => t.status === 'pending').length.toLocaleString(),
            icon: Clock,
            color: 'text-yellow-600',
            sub: 'Active logic'
        },
        {
            title: 'Total Revenue (30d)',
            value: kpis ? `$${kpis.totalRevenue.toLocaleString()}` : '$0',
            icon: DollarSign,
            color: 'text-blue-600',
            sub: 'Platform aggregate'
        }
    ]
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
                    <p className="text-muted-foreground">
                        Monitor and manage all transaction activity
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <Button variant="outline">
                        <Download className="mr-2 h-4 w-4" />
                        Export
                    </Button>
                    <Button variant="outline">
                        <Filter className="mr-2 h-4 w-4" />
                        Filter
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                    <Card key={stat.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                            <stat.icon className={`h-4 w-4 ${stat.color}`} />
                        </CardHeader>
                        <CardContent>
                            {kpisLoading || transactionsLoading ? (
                                <Skeleton className="h-8 w-24" />
                            ) : (
                                <>
                                    <div className="text-2xl font-bold">{stat.value}</div>
                                    <p className="text-xs text-muted-foreground">
                                        {stat.sub}
                                    </p>
                                </>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Transactions Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Recent Transactions</CardTitle>
                            <CardDescription>
                                Latest transaction activity across all merchants
                            </CardDescription>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search transactions..." className="pl-8 w-64" />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Transaction ID</TableHead>
                                <TableHead>Merchant</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead>Timestamp</TableHead>
                                <TableHead className="w-[70px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {transactionsLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                        <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                                    </TableRow>
                                ))
                            ) : transactions.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                                        No transactions found across the platform.
                                    </TableCell>
                                </TableRow>
                            ) : transactions.map((transaction) => (
                                <TableRow key={transaction.id}>
                                    <TableCell className="font-medium text-xs">
                                        {transaction.id.slice(0, 8)}...
                                    </TableCell>
                                    <TableCell className="font-medium">{transaction.merchant_name}</TableCell>
                                    <TableCell>{transaction.customer_name || 'Anonymous'}</TableCell>
                                    <TableCell className="font-medium">
                                        ${transaction.total_amount.toFixed(2)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={
                                                transaction.status === 'completed' ? 'default' :
                                                    transaction.status === 'pending' ? 'secondary' : 'destructive'
                                            }
                                            className="capitalize"
                                        >
                                            {transaction.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="capitalize">
                                            {transaction.order_type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {format(new Date(transaction.created_at), 'MMM d, h:mm a')}
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
                                                <Link href={`/manage/merchants/${transaction.merchant_id}/transactions`}>
                                                    <DropdownMenuItem>
                                                        View in Merchant
                                                    </DropdownMenuItem>
                                                </Link>
                                                <DropdownMenuItem>
                                                    Refund
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem>
                                                    Export Receipt
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
