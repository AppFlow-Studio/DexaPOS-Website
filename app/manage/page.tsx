'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/dashboard/shell/PageHeader'
import { PageShell } from '@/components/dashboard/shell/PageShell'
import { UserPlus2, BarChart3, Activity, Zap } from 'lucide-react'
import { AdminInviteWizard } from './organizations/[organizationId]/components/AdminInviteWizard'
import { PlatformPulseSection } from './components/PlatformPulseSection'
import { MerchantSpotlightSection } from './components/MerchantSpotlightSection'
import { LiveActivityFeed } from './components/LiveActivityFeed'
import { DeviceFleetMap } from './components/DeviceFleetMap'
import { OrdersHeatmap } from './components/OrdersHeatmap'
import { AlertsPanel } from './components/AlertsPanel'
import { PlatformStatusLine } from './components/PlatformStatusLine'
import { HealthDashboard } from './components/HealthDashboard'
import { AnalyticsContent } from './components/AnalyticsContent'

const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID ?? ''

export default function Dashboard() {
  const [isAdminInviteOpen, setIsAdminInviteOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <PageShell as="div">
      <PageHeader
        title="Mission Control"
        subtitle="Platform dashboard and real-time monitoring"
        actions={
          <Button size="sm" onClick={() => setIsAdminInviteOpen(true)}>
            <UserPlus2 className="h-4 w-4 mr-2" />
            Invite Admin
          </Button>
        }
      />

      <PlatformStatusLine />

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Scrolls rather than clips: three labelled triggers do not fit a
            320px viewport, and a wrapped tab strip reads as two rows of
            unrelated controls. */}
        <TabsList className="inline-flex h-auto max-w-full gap-1 overflow-x-auto rounded-full bg-muted/60 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsTrigger
            value="dashboard"
            className="gap-2 rounded-full px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger
            value="health"
            className="gap-2 rounded-full px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Health</span>
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            className="gap-2 rounded-full px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
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
          {/* `items-start` for the same reason as the row below: the feed was
              stretched to the fleet panel's height, so an empty "Waiting for
              activity…" held a full-height column. */}
          <div className="grid items-start gap-6 md:grid-cols-12">
            <div className="md:col-span-5">
              <LiveActivityFeed />
            </div>
            <div className="md:col-span-7">
              <DeviceFleetMap />
            </div>
          </div>

          {/* Section 1D & 1E: Heatmap + Alerts (2-column layout) */}
          {/* `items-start`: grid items stretch by default, so the chart was
              padded out to whatever height the alerts list happened to be.
              Each panel now takes its own content height. */}
          <div className="grid items-start gap-6 md:grid-cols-12">
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
    </PageShell>
  )
}
