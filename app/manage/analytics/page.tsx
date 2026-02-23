'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    DollarSign,
    Users,
    CreditCard,
    Activity
} from 'lucide-react'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    LineChart,
    Line
} from 'recharts'

const revenueData = [
    { month: 'Jan', revenue: 12000, transactions: 450 },
    { month: 'Feb', revenue: 15000, transactions: 520 },
    { month: 'Mar', revenue: 18000, transactions: 680 },
    { month: 'Apr', revenue: 22000, transactions: 750 },
    { month: 'May', revenue: 25000, transactions: 820 },
    { month: 'Jun', revenue: 28000, transactions: 950 },
]

const merchantTypeData = [
    { name: 'Restaurants', value: 35, color: '#8884d8' },
    { name: 'Retail', value: 25, color: '#82ca9d' },
    { name: 'Services', value: 20, color: '#ffc658' },
    { name: 'Healthcare', value: 12, color: '#ff7300' },
    { name: 'Other', value: 8, color: '#00ff00' },
]

const dailyTransactions = [
    { day: 'Mon', transactions: 1200, revenue: 8000 },
    { day: 'Tue', transactions: 1900, revenue: 12000 },
    { day: 'Wed', transactions: 3000, revenue: 18000 },
    { day: 'Thu', transactions: 2800, revenue: 16000 },
    { day: 'Fri', transactions: 1890, revenue: 11000 },
    { day: 'Sat', transactions: 2390, revenue: 14000 },
    { day: 'Sun', transactions: 1490, revenue: 9000 },
]

const topMerchants = [
    { name: 'Coffee Corner', revenue: 12500, growth: 12.5 },
    { name: 'Tech Store Pro', revenue: 9800, growth: 8.2 },
    { name: 'Fresh Market', revenue: 7200, growth: -2.1 },
    { name: 'Beauty Salon', revenue: 5600, growth: 15.3 },
    { name: 'Pharmacy Plus', revenue: 4200, growth: 5.7 },
]

export default function AnalyticsPage() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
                    <p className="text-muted-foreground">
                        Comprehensive insights into your POS system performance
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <Button variant="outline">Export Report</Button>
                    <Button>Generate Insights</Button>
                </div>
            </div>

            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$28,000</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-600">+12.5%</span> from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Merchants</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">1,156</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-600">+8.2%</span> from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">4,270</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-600">+15.3%</span> from last month
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Transaction</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$6.56</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-red-600">-2.1%</span> from last month
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Analytics Tabs */}
            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="revenue">Revenue</TabsTrigger>
                    <TabsTrigger value="merchants">Merchants</TabsTrigger>
                    <TabsTrigger value="transactions">Transactions</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Revenue Trend</CardTitle>
                                <CardDescription>Monthly revenue over the last 6 months</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <AreaChart data={revenueData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="month" />
                                        <YAxis />
                                        <Tooltip />
                                        <Area
                                            type="monotone"
                                            dataKey="revenue"
                                            stroke="hsl(var(--primary))"
                                            fill="hsl(var(--primary))"
                                            fillOpacity={0.3}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Merchant Types</CardTitle>
                                <CardDescription>Distribution of merchants by type</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={merchantTypeData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {merchantTypeData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="revenue" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Revenue Analytics</CardTitle>
                            <CardDescription>Detailed revenue breakdown and trends</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={400}>
                                <LineChart data={revenueData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" />
                                    <YAxis />
                                    <Tooltip />
                                    <Line
                                        type="monotone"
                                        dataKey="revenue"
                                        stroke="hsl(var(--primary))"
                                        strokeWidth={2}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="merchants" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Top Performing Merchants</CardTitle>
                            <CardDescription>Revenue by merchant this month</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={400}>
                                <BarChart data={topMerchants}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="revenue" fill="hsl(var(--primary))" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="transactions" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Daily Transaction Volume</CardTitle>
                            <CardDescription>Transaction patterns throughout the week</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={400}>
                                <BarChart data={dailyTransactions}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="day" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="transactions" fill="hsl(var(--primary))" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}