'use client'

import { useState } from 'react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
    Phone,
    Mail,
    FileText,
    Plus,
    ChevronRight,
    Receipt,
    RotateCcw,
    MapPin,
    Gift,
    MessageSquare,
    Loader2,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { cn } from '@/lib/utils'
import {
    useAdminCustomerProfile,
    useAdminAddCustomerTag,
    useAdminUpdateCustomerNotes,
} from '@/lib/queries/use-admin-customers'
import type {
    CustomerListItem,
    CustomerActivity,
    CustomerActivityType,
} from '@/types/customer'
import {
    getCustomerDisplayName,
    transformOrderChannelsForChart,
    formatActivityTime,
    ACTIVITY_DISPLAY_MAP,
} from '@/types/customer'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'

interface AdminCustomerProfileSheetProps {
    customer: CustomerListItem | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

function ActivityIcon({ type }: { type: CustomerActivityType }) {
    const config = ACTIVITY_DISPLAY_MAP[type]
    const iconClass = 'h-5 w-5'

    const icons: Record<CustomerActivityType, React.ReactNode> = {
        order: <Receipt className={iconClass} />,
        refund: <RotateCcw className={iconClass} />,
        visit: <MapPin className={iconClass} />,
        loyalty: <Gift className={iconClass} />,
        feedback: <MessageSquare className={iconClass} />,
    }

    return (
        <div
            className={cn(
                'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                config.bgColor,
                config.color
            )}
        >
            {icons[type]}
        </div>
    )
}

function ActivityItem({ activity }: { activity: CustomerActivity }) {
    const config = ACTIVITY_DISPLAY_MAP[activity.activity_type]
    const { time, date } = formatActivityTime(activity.created_at)
    const metadata = activity.metadata

    const renderActivityContent = () => {
        switch (activity.activity_type) {
            case 'order':
                return (
                    <>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={cn('font-semibold text-base', config.color)}>
                                Order
                            </span>
                            {metadata?.order_total && (
                                <>
                                    <span className="text-muted-foreground">for</span>
                                    <span className="font-medium text-foreground">
                                        ${metadata.order_total.toFixed(2)}
                                    </span>
                                </>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Completed
                            {metadata?.order_type && ` • ${metadata.order_type}`}
                            {metadata?.item_count && ` • ${metadata.item_count} items`}
                        </p>
                    </>
                )

            case 'refund':
                return (
                    <>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={cn('font-semibold text-base', config.color)}>
                                Refund
                            </span>
                            {metadata?.refund_amount && (
                                <>
                                    <span className="text-muted-foreground">for</span>
                                    <span className="font-medium text-foreground line-through decoration-muted-foreground/60">
                                        ${metadata.refund_amount.toFixed(2)}
                                    </span>
                                </>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {metadata?.refund_reason || 'Refunded to card'}
                        </p>
                    </>
                )

            case 'visit':
                return (
                    <>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={cn('font-semibold text-base', config.color)}>
                                Visit
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Customer checked in
                            {metadata?.notes && ` • ${metadata.notes}`}
                        </p>
                    </>
                )

            case 'loyalty':
                return (
                    <>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={cn('font-semibold text-base', config.color)}>
                                Loyalty
                            </span>
                            {metadata?.points_earned && (
                                <span className="font-medium text-foreground">
                                    +{metadata.points_earned} pts
                                </span>
                            )}
                            {metadata?.points_redeemed && (
                                <span className="font-medium text-foreground">
                                    -{metadata.points_redeemed} pts
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {metadata?.reward_name || 'Points updated'}
                        </p>
                    </>
                )

            case 'feedback':
                return (
                    <>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={cn('font-semibold text-base', config.color)}>
                                Feedback
                            </span>
                            {metadata?.rating && (
                                <span className="font-medium text-foreground">
                                    {metadata.rating}/5 ⭐
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {metadata?.comment || 'Feedback submitted'}
                        </p>
                    </>
                )

            default:
                return (
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-base text-muted-foreground">
                            Activity
                        </span>
                    </div>
                )
        }
    }

    return (
        <div className="flex items-start gap-4 group cursor-pointer hover:opacity-80 transition-opacity">
            <ActivityIcon type={activity.activity_type} />
            <div className="flex-1 min-w-0">{renderActivityContent()}</div>
            <div className="text-right flex items-center gap-3 text-sm text-muted-foreground">
                <span>{time}</span>
                <span>{date}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
            </div>
        </div>
    )
}

function MetricCard({
    title,
    value,
    className,
    isLoading,
}: {
    title: string
    value: string
    className?: string
    isLoading?: boolean
}) {
    return (
        <Card
            className={cn('flex flex-col justify-center p-5 h-[110px]', className)}
        >
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {title}
            </span>
            {isLoading ? (
                <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            ) : (
                <span className="text-2xl font-bold text-foreground tracking-tight">
                    {value}
                </span>
            )}
        </Card>
    )
}

function AddTagDialog({
    open,
    onOpenChange,
    onAdd,
    isLoading,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onAdd: (tag: string) => void
    isLoading: boolean
}) {
    const [tag, setTag] = useState('')

    const handleSubmit = () => {
        if (tag.trim()) {
            onAdd(tag.trim())
            setTag('')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>Add Tag</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Input
                        placeholder="Enter tag name..."
                        value={tag}
                        onChange={(e) => setTag(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!tag.trim() || isLoading}>
                        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Add Tag
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function AddNoteDialog({
    open,
    onOpenChange,
    onSave,
    isLoading,
    currentNotes,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSave: (notes: string) => void
    isLoading: boolean
    currentNotes: string | null
}) {
    const [notes, setNotes] = useState(currentNotes || '')

    const handleSubmit = () => {
        onSave(notes)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Customer Notes</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Textarea
                        placeholder="Add notes about this customer..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={5}
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isLoading}>
                        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save Notes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function AdminCustomerProfileSheet({
    customer,
    open,
    onOpenChange,
}: AdminCustomerProfileSheetProps) {
    const [showAddTag, setShowAddTag] = useState(false)
    const [showAddNote, setShowAddNote] = useState(false)

    // Fetch full profile when sheet opens
    const { data: profile, isLoading: isLoadingProfile } = useAdminCustomerProfile(
        open && customer ? customer.id : null
    )

    // Mutations
    const addTagMutation = useAdminAddCustomerTag()
    const updateNotesMutation = useAdminUpdateCustomerNotes()

    if (!customer) return null

    // Get customer data - prefer profile data if loaded, fallback to list item
    const customerData = profile?.customer || customer
    const orderChannels = transformOrderChannelsForChart(profile?.order_channels || null)
    const mostOrderedItems = profile?.most_ordered_items || []
    const recentActivity = profile?.recent_activity || []
    const totalVisits = profile?.customer?.visits ?? customer.visits ?? 0

    // Format last order date
    const lastOrderDate = profile?.customer?.last_order_date
        ? new Date(profile.customer.last_order_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
        : 'N/A'

    // Calculate metrics
    const lifetimeSpend = profile?.customer?.lifetime_spend ?? customer.lifetime_spend ?? 0
    const avgSpend = profile?.customer?.avg_spend ?? customer.avg_spend ?? 0
    const avgTip = profile?.customer?.avg_tip_percent ?? 0

    const handleAddTag = (tag: string) => {
        addTagMutation.mutate(
            { customerId: customer.id, tag },
            {
                onSuccess: () => setShowAddTag(false),
            }
        )
    }

    const handleSaveNotes = (notes: string) => {
        updateNotesMutation.mutate(
            { customerId: customer.id, notes },
            {
                onSuccess: () => setShowAddNote(false),
            }
        )
    }

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent className="sm:max-w-[900px] w-full overflow-y-auto px-0 bg-[#F8F9FB] dark:bg-background">
                    <div className="px-6 py-6 border-b bg-background">
                        <SheetHeader className="space-y-4">
                            <div className="flex justify-between items-start">
                                <div className="space-y-2">
                                    <SheetTitle className="text-3xl font-bold tracking-tight text-left">
                                        {getCustomerDisplayName(customerData as any)}
                                    </SheetTitle>
                                    <div className="flex gap-2 flex-wrap">
                                        {profile?.customer?.tags?.map((tag) => (
                                            <Badge
                                                key={tag}
                                                variant="secondary"
                                                className="h-7 text-xs rounded-full"
                                            >
                                                {tag}
                                            </Badge>
                                        ))}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs rounded-full bg-muted/50 border-muted-foreground/20 text-muted-foreground hover:bg-muted hover:text-foreground"
                                            onClick={() => setShowAddTag(true)}
                                        >
                                            <Plus className="w-3 h-3 mr-1" /> ADD TAG
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
                                            onClick={() => setShowAddNote(true)}
                                        >
                                            <FileText className="w-3 h-3 mr-2" /> add note
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-1.5 text-sm">
                                    <div className="flex items-center gap-2 text-foreground/80 font-medium">
                                        <Phone className="h-4 w-4 text-muted-foreground" />
                                        {customerData.phone || 'No phone'}
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Mail className="h-4 w-4" />
                                        {customerData.email || 'No email address'}
                                    </div>
                                </div>
                            </div>
                        </SheetHeader>

                        <Tabs defaultValue="overview" className="mt-8">
                            <TabsList className="bg-transparent h-auto p-0 space-x-6 border-b rounded-none w-full justify-start">
                                {[
                                    { name: 'Overview', count: null },
                                    { name: 'Orders', count: profile?.customer?.total_orders ?? customer.total_orders ?? 0 },
                                    { name: 'Bookings', count: 0 },
                                    { name: 'Feedback', count: 0 },
                                    { name: 'Loyalty', count: null },
                                    { name: 'Marketing', count: null },
                                    { name: 'Details', count: null },
                                ].map((tab) => (
                                    <TabsTrigger
                                        key={tab.name}
                                        value={tab.name.toLowerCase()}
                                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 text-muted-foreground data-[state=active]:text-foreground font-medium bg-transparent shadow-none border-b-2 border-transparent transition-none"
                                    >
                                        {tab.name}
                                        {tab.count !== null && (
                                            <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                                                {tab.count}
                                            </span>
                                        )}
                                    </TabsTrigger>
                                ))}
                            </TabsList>

                            <div className="mt-6">
                                <TabsContent
                                    value="overview"
                                    className="space-y-6 animate-in fade-in-50 duration-300"
                                >
                                    <div className="grid grid-cols-4 gap-4">
                                        <MetricCard
                                            title="LAST ORDER"
                                            value={lastOrderDate}
                                            className="bg-white dark:bg-card border-none shadow-sm"
                                            isLoading={isLoadingProfile}
                                        />
                                        <MetricCard
                                            title="LIFETIME SPEND"
                                            value={`$${lifetimeSpend.toLocaleString()}`}
                                            className="bg-white dark:bg-card border-none shadow-sm"
                                            isLoading={isLoadingProfile}
                                        />
                                        <MetricCard
                                            title="AVERAGE SPEND"
                                            value={`$${avgSpend.toFixed(2)}`}
                                            className="bg-white dark:bg-card border-none shadow-sm"
                                            isLoading={isLoadingProfile}
                                        />
                                        <MetricCard
                                            title="AVERAGE TIP"
                                            value={`${avgTip.toFixed(1)}%`}
                                            className="bg-white dark:bg-card border-none shadow-sm"
                                            isLoading={isLoadingProfile}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <Card className="border-none shadow-sm bg-white dark:bg-card h-full">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                                    ORDER CHANNELS
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="flex items-center justify-between pl-0">
                                                {isLoadingProfile ? (
                                                    <div className="w-full h-[140px] flex items-center justify-center">
                                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                                    </div>
                                                ) : orderChannels.length > 0 ? (
                                                    <>
                                                        <div className="space-y-3 pl-6 text-sm">
                                                            {orderChannels.map((channel, idx) => (
                                                                <div key={idx} className="flex items-center gap-2">
                                                                    <span
                                                                        className="w-2.5 h-2.5 rounded-full"
                                                                        style={{ backgroundColor: channel.color }}
                                                                    />
                                                                    <span className="font-medium text-foreground">
                                                                        {channel.name}
                                                                    </span>
                                                                    <span className="text-muted-foreground ml-auto">
                                                                        {channel.value}%
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="h-[140px] w-[140px] relative">
                                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                                <span className="text-xl font-bold">
                                                                    {totalVisits}
                                                                </span>
                                                            </div>
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <PieChart>
                                                                    <Pie
                                                                        data={orderChannels}
                                                                        cx="50%"
                                                                        cy="50%"
                                                                        innerRadius={45}
                                                                        outerRadius={60}
                                                                        paddingAngle={0}
                                                                        dataKey="value"
                                                                        stroke="none"
                                                                    >
                                                                        {orderChannels.map((entry, index) => (
                                                                            <Cell
                                                                                key={`cell-${index}`}
                                                                                fill={entry.color}
                                                                            />
                                                                        ))}
                                                                    </Pie>
                                                                    <Tooltip />
                                                                </PieChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="w-full h-[140px] flex items-center justify-center text-muted-foreground text-sm">
                                                        No order data yet
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>

                                        <Card className="border-none shadow-sm bg-white dark:bg-card h-full">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                                    MOST ORDERED ITEMS
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-2 px-6">
                                                {isLoadingProfile ? (
                                                    <div className="space-y-4">
                                                        {[1, 2, 3].map((i) => (
                                                            <div
                                                                key={i}
                                                                className="h-6 bg-muted animate-pulse rounded"
                                                            />
                                                        ))}
                                                    </div>
                                                ) : mostOrderedItems.length > 0 ? (
                                                    <div className="space-y-4">
                                                        {mostOrderedItems.map((item, i) => (
                                                            <div
                                                                key={item.item_id || i}
                                                                className="flex items-center justify-between text-sm py-1 border-b last:border-0 border-muted/40"
                                                            >
                                                                <span className="font-medium text-foreground/90 truncate pr-4">
                                                                    {item.item_name}
                                                                </span>
                                                                <span className="text-muted-foreground font-mono">
                                                                    {item.total_quantity}x
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="h-[120px] flex items-center justify-center text-muted-foreground text-sm">
                                                        No orders yet
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <div className="bg-white dark:bg-card rounded-lg p-6 shadow-sm">
                                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-6">
                                            ACTIVITY
                                        </h3>
                                        {isLoadingProfile ? (
                                            <div className="space-y-6">
                                                {[1, 2].map((i) => (
                                                    <div key={i} className="flex items-start gap-4">
                                                        <div className="h-10 w-10 bg-muted animate-pulse rounded-lg" />
                                                        <div className="flex-1 space-y-2">
                                                            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                                                            <div className="h-3 w-48 bg-muted animate-pulse rounded" />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : recentActivity.length > 0 ? (
                                            <div className="space-y-6">
                                                {recentActivity.map((activity) => (
                                                    <ActivityItem key={activity.id} activity={activity} />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                                                No activity recorded yet
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>

                                {[
                                    'orders',
                                    'bookings',
                                    'feedback',
                                    'loyalty',
                                    'marketing',
                                    'details',
                                ].map((tab) => (
                                    <TabsContent
                                        key={tab}
                                        value={tab}
                                        className="h-64 flex items-center justify-center text-muted-foreground bg-white dark:bg-card rounded-lg border-2 border-dashed"
                                    >
                                        {tab.charAt(0).toUpperCase() + tab.slice(1)} view coming soon
                                    </TabsContent>
                                ))}
                            </div>
                        </Tabs>
                    </div>
                </SheetContent>
            </Sheet>

            <AddTagDialog
                open={showAddTag}
                onOpenChange={setShowAddTag}
                onAdd={handleAddTag}
                isLoading={addTagMutation.isPending}
            />
            <AddNoteDialog
                open={showAddNote}
                onOpenChange={setShowAddNote}
                onSave={handleSaveNotes}
                isLoading={updateNotesMutation.isPending}
                currentNotes={profile?.customer?.notes || null}
            />
        </>
    )
}
