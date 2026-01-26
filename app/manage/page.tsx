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
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { AdminInviteWizard } from './organizations/[organizationId]/components/AdminInviteWizard'
import Link from 'next/link'

// HQ Organization ID for direct admin invites
const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID || 'org_33z36QibAMZy6kc2xZNYmDl5duh'

const kpiData = [
  {
    title: 'Total Revenue',
    value: '$1,250.00',
    change: '+12.5%',
    trend: 'up',
    description: 'Trending up this month',
    subtitle: 'Visitors for the last 6 months',
    icon: DollarSign,
  },
  {
    title: 'New Merchants',
    value: '1,234',
    change: '-20%',
    trend: 'down',
    description: 'Down 20% this period',
    subtitle: 'Acquisition needs attention',
    icon: Building2,
  },
  {
    title: 'Active Accounts',
    value: '45,678',
    change: '+12.5%',
    trend: 'up',
    description: 'Strong user retention',
    subtitle: 'Engagement exceed targets',
    icon: Users,
  },
  {
    title: 'Growth Steps',
    value: '4.2',
    change: '+8.1%',
    trend: 'up',
    description: 'Metrics trending positive',
    subtitle: 'Performance indicators',
    icon: Activity,
  },
]

const chartData = [
  { date: 'Jun 1', visitors: 1200, revenue: 800 },
  { date: 'Jun 2', visitors: 1900, revenue: 1200 },
  { date: 'Jun 3', visitors: 3000, revenue: 1800 },
  { date: 'Jun 4', visitors: 2800, revenue: 1600 },
  { date: 'Jun 5', visitors: 1890, revenue: 1100 },
  { date: 'Jun 6', visitors: 2390, revenue: 1400 },
  { date: 'Jun 7', visitors: 3490, revenue: 2100 },
  { date: 'Jun 8', visitors: 3200, revenue: 1900 },
  { date: 'Jun 9', visitors: 2800, revenue: 1600 },
  { date: 'Jun 10', visitors: 3100, revenue: 1800 },
  { date: 'Jun 11', visitors: 2900, revenue: 1700 },
  { date: 'Jun 12', visitors: 3400, revenue: 2000 },
  { date: 'Jun 13', visitors: 3600, revenue: 2200 },
  { date: 'Jun 14', visitors: 3200, revenue: 1900 },
  { date: 'Jun 15', visitors: 2800, revenue: 1600 },
  { date: 'Jun 16', visitors: 3000, revenue: 1800 },
  { date: 'Jun 17', visitors: 3500, revenue: 2100 },
  { date: 'Jun 18', visitors: 3800, revenue: 2300 },
  { date: 'Jun 19', visitors: 3400, revenue: 2000 },
  { date: 'Jun 20', visitors: 3200, revenue: 1900 },
  { date: 'Jun 21', visitors: 3000, revenue: 1800 },
  { date: 'Jun 22', visitors: 2800, revenue: 1600 },
  { date: 'Jun 23', visitors: 3200, revenue: 1900 },
]

const merchantData = [
  { name: 'Coffee Shop A', transactions: 245, revenue: 12500, growth: 12.5 },
  { name: 'Restaurant B', transactions: 189, revenue: 9800, growth: 8.2 },
  { name: 'Retail Store C', transactions: 156, revenue: 7200, growth: -2.1 },
  { name: 'Bakery D', transactions: 134, revenue: 5600, growth: 15.3 },
  { name: 'Pharmacy E', transactions: 98, revenue: 4200, growth: 5.7 },
]

export default function Dashboard() {
  const [isAdminInviteOpen, setIsAdminInviteOpen] = useState(false)

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiData.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                {kpi.trend === 'up' ? (
                  <ArrowUpRight className="h-3 w-3 text-green-600" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-red-600" />
                )}
                <span className={kpi.trend === 'up' ? 'text-green-600' : 'text-red-600'}>
                  {kpi.change}
                </span>
                <span>{kpi.description}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{kpi.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Total Visitors</CardTitle>
            <CardDescription>Total for the last 3 months</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="flex items-center space-x-2 mb-4">
              <Button variant="outline" size="sm">
                Last 3 months
              </Button>
              <Button variant="ghost" size="sm">
                Last 6 months
              </Button>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="visitors"
                  stackId="1"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stackId="2"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.1}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Top Merchants</CardTitle>
            <CardDescription>Revenue by merchant this month</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={merchantData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="revenue" fill="var(--primary)" />
              </BarChart>
            </ResponsiveContainer>
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
                <h3 className="text-lg font-semibold">Performance Metrics</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  {merchantData.map((merchant) => (
                    <Card key={merchant.name}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{merchant.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">${merchant.revenue.toLocaleString()}</div>
                        <div className="flex items-center space-x-2 text-xs">
                          {merchant.growth > 0 ? (
                            <TrendingUp className="h-3 w-3 text-green-600" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-red-600" />
                          )}
                          <span className={merchant.growth > 0 ? 'text-green-600' : 'text-red-600'}>
                            {merchant.growth > 0 ? '+' : ''}{merchant.growth}%
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {merchant.transactions} transactions
                        </p>
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