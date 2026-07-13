'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserPlus2, BarChart3, Activity, Zap } from 'lucide-react'
import { AdminInviteWizard } from './organizations/[organizationId]/components/AdminInviteWizard'
import { PlatformPulseSection } from './components/PlatformPulseSection'
import { MerchantSpotlightSection } from './components/MerchantSpotlightSection'
import { LiveActivityFeed } from './components/LiveActivityFeed'
import { DeviceFleetMap } from './components/DeviceFleetMap'
import { OrdersHeatmap } from './components/OrdersHeatmap'
import { AlertsPanel } from './components/AlertsPanel'
import { HealthDashboard } from './components/HealthDashboard'
import { AnalyticsContent } from './components/AnalyticsContent'

const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID ?? ''

export default function Dashboard() {
  const [isAdminInviteOpen, setIsAdminInviteOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50/30 dark:from-background dark:to-background p-6 space-y-8 min-w-0 overflow-x-hidden">
      {/* Header with action button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-slate-900 to-blue-900 dark:from-slate-100 dark:to-blue-300 bg-clip-text text-transparent">
            Mission Control
          </h1>
          <p className="text-sm text-muted-foreground/80">
            Platform dashboard and real-time monitoring
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setIsAdminInviteOpen(true)}
          className="shadow-sm hover:shadow-md transition-all duration-200 self-start sm:self-auto"
        >
          <UserPlus2 className="h-4 w-4 mr-2" />
          Invite Admin
        </Button>
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="inline-flex h-auto p-1 bg-white/80 dark:bg-card/80 backdrop-blur-sm border border-blue-100/50 dark:border-border shadow-sm rounded-xl">
          <TabsTrigger
            value="dashboard"
            className="gap-2 px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all duration-200"
          >
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger
            value="health"
            className="gap-2 px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all duration-200"
          >
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Health</span>
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            className="gap-2 px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all duration-200"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6 mt-6">
          {/* Section 1A: Platform Pulse (KPIs) */}
          <PlatformPulseSection />

          {/* Section 1A.5: Merchant Spotlight — top merchants by today's revenue */}
          <MerchantSpotlightSection />

          {/* Section 1B & 1C: Live Feed + Device Fleet (2-column layout) */}
          <div className="grid gap-6 md:grid-cols-12">
            <div className="md:col-span-5">
              <LiveActivityFeed />
            </div>
            <div className="md:col-span-7">
              <DeviceFleetMap />
            </div>
          </div>

          {/* Section 1D & 1E: Heatmap + Alerts (2-column layout) */}
          <div className="grid gap-6 md:grid-cols-12">
            <div className="md:col-span-4">
              <OrdersHeatmap />
            </div>
            <div className="md:col-span-8">
              <AlertsPanel />
            </div>
          </div>
        </TabsContent>

        {/* Health Tab */}
        <TabsContent value="health" className="space-y-6 mt-6">
          <HealthDashboard />
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6 mt-6">
          <AnalyticsContent />
        </TabsContent>
      </Tabs>

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
