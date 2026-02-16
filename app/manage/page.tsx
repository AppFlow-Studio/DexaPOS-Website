'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  TrendingUp,
  TrendingDown,
  Users,
  CreditCard,
  Building2,
  DollarSign,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  UserPlus2,
  Store,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'
import { AdminInviteWizard } from './organizations/[organizationId]/components/AdminInviteWizard'
import Link from 'next/link'
import { usePlatformKPIs, usePlatformSalesTrend, useTopMerchants } from '@/lib/queries/use-platform-analytics'
import { format } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

// HQ Organization ID for direct admin invites
const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID || 'org_33z36QibAMZy6kc2xZNYmDl5duh'

const chartConfig = {
  revenue: {
    label: 'Platform Revenue',
    color: 'hsl(var(--chart-1))',
  },
  merchants: {
    label: 'Active Merchants',
    color: 'hsl(var(--chart-2))',
  },
}

export default function Dashboard() {
  const [isAdminInviteOpen, setIsAdminInviteOpen] = useState(false)
  const { data: kpis, isLoading: kpisLoading } = usePlatformKPIs()
  const { data: salesTrend, isLoading: salesLoading } = usePlatformSalesTrend()
  const { data: topMerchants, isLoading: merchantsLoading } = useTopMerchants(5)

  const kpiItems = [
    {
      title: 'Total Revenue',
      value: kpis ? `$${kpis.totalRevenue.toLocaleString()}` : '$0.00',
      change: kpis?.revenueChange || '0%',
      trend: 'up',
      description: 'Trending up this month',
      subtitle: '30-day aggregate',
      icon: DollarSign,
    },
    {
      title: 'Total Merchants',
      value: kpis ? kpis.totalMerchants.toLocaleString() : '0',
      change: kpis?.merchantChange || '0%',
      trend: 'up',
      description: 'Platform capacity',
      subtitle: 'Registered organizations',
      icon: Building2,
    },
    {
      title: 'Active Accounts',
      value: kpis ? kpis.activeAccounts.toLocaleString() : '0',
      change: kpis?.activeChange || '0%',
      trend: 'up',
      description: '30-day active pool',
      subtitle: 'Transactional activity',
      icon: Users,
    },
    {
      title: 'Platform Growth',
      value: kpis ? `${kpis.growthRate.toFixed(1)}%` : '0%',
      change: kpis?.growthChange || '0%',
      trend: 'up',
      description: 'Metrics trending positive',
      subtitle: 'Velocity indicator',
      icon: Activity,
    },
  ]

  const chartData = salesTrend?.map(item => ({
    ...item,
    formattedDate: format(new Date(item.date), 'MMM d')
  })) || []

  const merchantChartData = topMerchants?.map((m, index) => ({
    name: m.name,
    revenue: m.revenue,
    color: `hsl(var(--chart-${(index % 5) + 1}))`
  })) || []

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiItems.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {kpisLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{kpi.value}</div>
                  <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                    <ArrowUpRight className="h-3 w-3 text-green-600" />
                    <span className="text-green-600">
                      {kpi.change}
                    </span>
                    <span>{kpi.description}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{kpi.subtitle}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Platform Sales Trend</CardTitle>
            <CardDescription>Aggregate revenue across all merchants (30 Days)</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            {salesLoading ? (
              <div className="h-75 flex items-center justify-center">
                <Skeleton className="h-70 w-full" />
              </div>
            ) : chartData.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-75 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="formattedDate" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--primary)"
                      fill="var(--primary)"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <div className="h-75 flex items-center justify-center text-muted-foreground">
                No transaction data found for the last 30 days.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Top Merchants</CardTitle>
            <CardDescription>Revenue by merchant (Last 30 Days)</CardDescription>
          </CardHeader>
          <CardContent>
            {merchantsLoading ? (
              <div className="h-75 flex items-center justify-center">
                <Skeleton className="h-70 w-full" />
              </div>
            ) : merchantChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={merchantChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} hide />
                  <Tooltip 
                    cursor={{fill: 'transparent'}}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-background border rounded-lg p-2 shadow-sm text-xs">
                            <p className="font-bold">{payload[0].payload.name}</p>
                            <p className="text-muted-foreground">
                              Revenue: ${payload[0].value?.toLocaleString()}
                            </p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                    {merchantChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-75 flex items-center justify-center text-muted-foreground">
                No active merchants found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Tabs Section */}
      <Card>
        <CardHeader>
          <Tabs defaultValue="outline" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="outline">Outline</TabsTrigger>
              <TabsTrigger value="performance">
                Past Performance
                <Badge variant="secondary" className="ml-2">3</Badge>
              </TabsTrigger>
              <TabsTrigger value="personnel">
                Key Personnel
                <Badge variant="secondary" className="ml-2">2</Badge>
              </TabsTrigger>
              <TabsTrigger value="documents">Focus Documents</TabsTrigger>
              <TabsTrigger value="customize">Customize</TabsTrigger>
            </TabsList>

            <TabsContent value="outline" className="mt-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Dashboard Overview</h3>
                <p className="text-muted-foreground">
                  Welcome to your DexaPOS admin dashboard. Here you can monitor merchant performance,
                  track revenue, and manage your POS operations.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <h4 className="font-medium">Recent Activity</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• 5 new merchants onboarded today</li>
                      <li>• Revenue increased by 12.5% this week</li>
                      <li>• 3 support tickets resolved</li>
                      <li>• System maintenance completed</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Quick Actions</h4>
                    <div className="flex flex-wrap gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setIsAdminInviteOpen(true)}
                      >
                        <UserPlus2 className="h-4 w-4 mr-2" />
                        Invite Admin
                      </Button>
                      <Link href="/manage/create-merchant">
                        <Button size="sm" variant="outline">
                          <Store className="h-4 w-4 mr-2" />
                          Add Merchant
                        </Button>
                      </Link>
                      <Link href="/manage/analytics">
                        <Button size="sm" variant="outline">View Analytics</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="performance" className="mt-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">High Performing Merchants</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  {merchantsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <Card key={i}>
                        <CardHeader className="pb-2">
                          <Skeleton className="h-4 w-32" />
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <Skeleton className="h-8 w-24" />
                          <Skeleton className="h-4 w-full" />
                        </CardContent>
                      </Card>
                    ))
                  ) : topMerchants?.map((merchant) => (
                    <Card key={merchant.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{merchant.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">${Number(merchant.revenue).toLocaleString()}</div>
                        <div className="flex items-center space-x-2 text-xs">
                          <TrendingUp className="h-3 w-3 text-green-600" />
                          <span className="text-green-600">
                             +12.5%
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {merchant.transactions} transactions
                        </p>
                        <Link href={`/manage/merchants/${merchant.id}`}>
                          <Button variant="ghost" size="sm" className="w-full mt-2 h-7 text-xs">
                            View Merchant
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="personnel" className="mt-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Key Personnel</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Support Team</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Sarah Johnson</span>
                          <Badge variant="outline">Lead</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Mike Chen</span>
                          <Badge variant="outline">Senior</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Development Team</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Alex Rodriguez</span>
                          <Badge variant="outline">Lead</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Emma Wilson</span>
                          <Badge variant="outline">Senior</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="documents" className="mt-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Focus Documents</h3>
                <div className="grid gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Monthly Report - June 2024</CardTitle>
                      <CardDescription>Comprehensive overview of merchant performance</CardDescription>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">System Health Report</CardTitle>
                      <CardDescription>Infrastructure and performance metrics</CardDescription>
                    </CardHeader>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="customize" className="mt-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Customize Dashboard</h3>
                <p className="text-muted-foreground">
                  Configure your dashboard layout and preferences.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Layout Options</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <Button variant="outline" size="sm" className="w-full">Compact View</Button>
                        <Button variant="outline" size="sm" className="w-full">Detailed View</Button>
                        <Button variant="outline" size="sm" className="w-full">Custom Layout</Button>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Widget Settings</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <Button variant="outline" size="sm" className="w-full">Add Widget</Button>
                        <Button variant="outline" size="sm" className="w-full">Remove Widget</Button>
                        <Button variant="outline" size="sm" className="w-full">Reorder Widgets</Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardHeader>
      </Card>

      {/* Admin Invite Wizard */}
      <AdminInviteWizard
        organizationId={DEXA_HQ_ORG_ID}
        orgType="hq"
        open={isAdminInviteOpen}
        onOpenChange={setIsAdminInviteOpen}
        onSuccess={() => {
          // Optionally refresh data or show success message
          console.log('Admin invited successfully')
        }}
      />
    </div>
  )
}