'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Store, DollarSign, Target, TrendingUp, TrendingDown, Users, CheckCircle, Clock, XCircle } from 'lucide-react'
import { MerchantsModel } from '@/types/db-modles'
import { useRouter } from 'next/navigation'

export const MerchantsTable = ({ merchants }: { merchants: MerchantsModel[] }) => {
    const router = useRouter()
    if (!merchants || merchants?.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center space-y-4 py-12">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
                    <Store className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-2 text-center">
                    <h3 className="text-lg font-semibold">No merchants yet</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                        This organization doesn't have any merchants yet. Create a merchant account to get started.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sales</TableHead>
                    <TableHead>Transactions</TableHead>
                    <TableHead>Conversion</TableHead>
                    <TableHead>Growth</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[70px]">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {merchants.map((merchant: any) => (
                    <TableRow key={merchant.id} className="cursor-pointer" onClick={() => router.push(`/manage/merchants/${merchant.clerk_org_id}`)}>
                        <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
                                    {merchant?.public_metadata?.imageURL ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={merchant.public_metadata.imageURL}
                                            alt={merchant.business_name}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <Store className="h-4 w-4 text-primary" />
                                    )}
                                </div>
                                <div>
                                    <div className="font-semibold">{merchant.name}</div>
                                    <div className="text-sm text-muted-foreground">ID: {merchant.clerk_org_id}</div>
                                </div>
                            </div>
                        </TableCell>
                        <TableCell>
                            {merchant.status === 'active' ? (
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                    <span className="text-sm">Active</span>
                                </div>
                            ) : merchant.status === 'pending' ? (
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-yellow-600" />
                                    <span className="text-sm">Pending</span>
                                </div>
                            ) : merchant.status === 'suspended' ? (
                                <div className="flex items-center gap-2">
                                    <XCircle className="h-4 w-4 text-red-600" />
                                    <span className="text-sm">Suspended</span>
                                </div>
                            ) : (
                                <span className="text-muted-foreground">-</span>
                            )}
                        </TableCell>
                        <TableCell className="font-medium">
                            ${merchant.total_sales?.toLocaleString() || '0'}
                        </TableCell>
                        <TableCell>
                            <div className="flex items-center gap-1">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <span>{merchant.transaction_count || 0}</span>
                            </div>
                        </TableCell>
                        <TableCell>
                            <div className="flex items-center gap-1">
                                <Target className="h-4 w-4 text-muted-foreground" />
                                <span>{merchant.conversion_rate || 0}%</span>
                            </div>
                        </TableCell>
                        <TableCell>
                            <div className="flex items-center gap-1">
                                {merchant.growth_rate > 0 ? (
                                    <TrendingUp className="h-3 w-3 text-green-600" />
                                ) : (
                                    <TrendingDown className="h-3 w-3 text-red-600" />
                                )}
                                <span className={merchant.growth_rate > 0 ? 'text-green-600' : 'text-red-600'}>
                                    {merchant.growth_rate > 0 ? '+' : ''}{merchant.growth_rate || 0}%
                                </span>
                            </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                            {merchant.created_at ? new Date(merchant.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            }) : '-'}
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
                                        Edit Merchant
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                        View Analytics
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem>
                                        Send Login Link
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                        Reset Password
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-red-600">
                                        Suspend Account
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}