'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
    DollarSign,
    ShoppingCart,
    Target,
    Users,
    Store,
    MapPin,
    User,
    Mail,
    Phone,
    TrendingUp,
    TrendingDown,
    Activity,
    Clock,
    Package,
    CreditCard,
    ArrowUpRight,
    ArrowDownRight
} from 'lucide-react'
import { MerchantInfoModel } from '@/types/db-modles'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Area, AreaChart, Bar, BarChart, Line, LineChart, Pie, PieChart, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'

interface OverviewTabProps {
    merchantInfo: MerchantInfoModel
}

// Mock data for charts
const salesData = [
    { month: 'Jan', sales: 45000, orders: 320 },
    { month: 'Feb', sales: 52000, orders: 380 },
    { month: 'Mar', sales: 48000, orders: 350 },
    { month: 'Apr', sales: 61000, orders: 420 },
    { month: 'May', sales: 55000, orders: 390 },
    { month: 'Jun', sales: 67000, orders: 480 },
]

const revenueByCategory = [
    { name: 'Food', value: 45000, color: 'hsl(var(--chart-1))' },
    { name: 'Beverages', value: 28000, color: 'hsl(var(--chart-2))' },
    { name: 'Desserts', value: 15000, color: 'hsl(var(--chart-3))' },
    { name: 'Other', value: 8000, color: 'hsl(var(--chart-4))' },
]

const dailyRevenue = [
    { day: 'Mon', revenue: 3200 },
    { day: 'Tue', revenue: 2800 },
    { day: 'Wed', revenue: 3500 },
    { day: 'Thu', revenue: 4100 },
    { day: 'Fri', revenue: 5200 },
    { day: 'Sat', revenue: 6800 },
    { day: 'Sun', revenue: 5900 },
]

const recentActivity = [
    { id: 1, type: 'order', description: 'New order #1234', amount: 45.50, time: '2 min ago' },
    { id: 2, type: 'payment', description: 'Payment received', amount: 89.90, time: '15 min ago' },
    { id: 3, type: 'customer', description: 'New customer registered', amount: null, time: '1 hour ago' },
    { id: 4, type: 'order', description: 'Order #1233 completed', amount: 67.20, time: '2 hours ago' },
]

const chartConfig = {
    sales: {
        label: 'Sales',
        color: 'hsl(var(--chart-1))',
    },
    orders: {
        label: 'Orders',
        color: 'hsl(var(--chart-2))',
    },
    revenue: {
        label: 'Revenue',
        color: 'hsl(var(--chart-3))',
    },
}

export function OverviewTab({ merchantInfo }: OverviewTabProps) {
    return (
        <>
            {/* Main KPIs */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$328,000</div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <ArrowUpRight className="h-3 w-3 text-green-600" />
                            <span className="text-green-600">+12.5%</span> from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Transactions</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">2,340</div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <ArrowUpRight className="h-3 w-3 text-green-600" />
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
                        <div className="text-2xl font-bold">$140.17</div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <ArrowUpRight className="h-3 w-3 text-green-600" />
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
                        <div className="text-2xl font-bold">1,847</div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <ArrowUpRight className="h-3 w-3 text-green-600" />
                            <span className="text-green-600">+12.3%</span> from last month
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Additional KPIs */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Orders Today</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">47</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-600">+8</span> from yesterday
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Revenue Today</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$6,580</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-600">+15.3%</span> vs yesterday
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Return Rate</CardTitle>
                        <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">2.3%</div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <ArrowDownRight className="h-3 w-3 text-green-600" />
                            <span className="text-green-600">-0.5%</span> from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Order Value</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$140.17</div>
                        <p className="text-xs text-muted-foreground">
                            Target: <span className="font-medium">$150</span>
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="grid gap-4 md:grid-cols-2 mt-6">
                {/* Sales Trend Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Sales Trend (6 Months)</CardTitle>
                        <CardDescription>Monthly sales and order volume</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={chartConfig}>
                            <AreaChart data={salesData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="month" />
                                <YAxis />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Area
                                    type="monotone"
                                    dataKey="sales"
                                    stroke="hsl(var(--chart-1))"
                                    fill="hsl(var(--chart-1))"
                                    fillOpacity={0.2}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="orders"
                                    stroke="hsl(var(--chart-2))"
                                    fill="hsl(var(--chart-2))"
                                    fillOpacity={0.2}
                                />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* Revenue by Category */}
                <Card>
                    <CardHeader>
                        <CardTitle>Revenue by Category</CardTitle>
                        <CardDescription>Breakdown of revenue sources</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={chartConfig}>
                            <PieChart>
                                <Pie
                                    data={revenueByCategory}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {revenueByCategory.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <ChartTooltip content={<ChartTooltipContent />} />
                            </PieChart>
                        </ChartContainer>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                            {revenueByCategory.map((category) => (
                                <div key={category.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="h-3 w-3 rounded-full"
                                            style={{ backgroundColor: category.color }}
                                        />
                                        <span className="text-sm text-muted-foreground">{category.name}</span>
                                    </div>
                                    <span className="text-sm font-medium">${category.value.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Weekly Revenue Chart */}
            <Card className="mt-4">
                <CardHeader>
                    <CardTitle>Weekly Revenue</CardTitle>
                    <CardDescription>Daily revenue for the current week</CardDescription>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={chartConfig}>
                        <BarChart data={dailyRevenue}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="day" />
                            <YAxis />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="revenue" fill="hsl(var(--chart-1))" radius={[8, 8, 0, 0]} />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>

            {/* Bottom Section: Business Info and Recent Activity */}
            <div className="grid gap-4 md:grid-cols-2 mt-6">
                {/* Business Information */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Business Information</CardTitle>
                        <CardDescription>Merchant business details and contact information</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Store className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <div className="font-medium">Business Type</div>
                                <div className="text-sm text-muted-foreground">
                                    {(merchantInfo?.public_metadata as any)?.merchant_type || 'Not specified'}
                                </div>
                            </div>
                        </div>
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

                {/* Recent Activity */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Recent Activity</CardTitle>
                        <CardDescription>Latest transactions and activities</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {recentActivity.map((activity) => (
                                <div key={activity.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${activity.type === 'order' ? 'bg-blue-100 text-blue-600' :
                                            activity.type === 'payment' ? 'bg-green-100 text-green-600' :
                                                'bg-purple-100 text-purple-600'
                                            }`}>
                                            {activity.type === 'order' ? (
                                                <ShoppingCart className="h-4 w-4" />
                                            ) : activity.type === 'payment' ? (
                                                <CreditCard className="h-4 w-4" />
                                            ) : (
                                                <Users className="h-4 w-4" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm">{activity.description}</div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {activity.time}
                                            </div>
                                        </div>
                                    </div>
                                    {activity.amount && (
                                        <div className="font-medium">${activity.amount.toFixed(2)}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Performance Metrics */}
            <Card className="mt-4">
                <CardHeader>
                    <CardTitle>Performance Metrics</CardTitle>
                    <CardDescription>Key performance indicators and trends</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Conversion Rate</span>
                                <span className="text-sm font-medium">3.2%</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: '68%' }} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Customer Retention</span>
                                <span className="text-sm font-medium">78%</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full" style={{ width: '78%' }} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Inventory Turnover</span>
                                <span className="text-sm font-medium">12x</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: '80%' }} />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </>
    )
}