'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { RefreshCw, MoreHorizontal, Eye, Download, Trash2 } from 'lucide-react'

const recentTransactions = [
    { id: 1, amount: 45.50, customer: "Sarah Johnson", time: "2 min ago", status: "completed" },
    { id: 2, amount: 23.75, customer: "Mike Chen", time: "5 min ago", status: "completed" },
    { id: 3, amount: 67.20, customer: "Emily Davis", time: "12 min ago", status: "completed" },
    { id: 4, amount: 12.00, customer: "Alex Rodriguez", time: "18 min ago", status: "refunded" },
    { id: 5, amount: 89.90, customer: "Lisa Wang", time: "25 min ago", status: "completed" }
]

export function TransactionsTab() {
    return (
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
    )
}
