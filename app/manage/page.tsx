'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserPlus2, BarChart3, Activity, Zap } from 'lucide-react'
import { AdminInviteWizard } from './organizations/[organizationId]/components/AdminInviteWizard'
import { PlatformPulseSection } from './components/PlatformPulseSection'
import { LiveActivityFeed } from './components/LiveActivityFeed'
import { DeviceFleetMap } from './components/DeviceFleetMap'
import { OrdersHeatmap } from './components/OrdersHeatmap'
import { AlertsPanel } from './components/AlertsPanel'
import { HealthDashboard } from './components/HealthDashboard'
import { AnalyticsContent } from './components/AnalyticsContent'

// HQ Organization ID for direct admin invites
const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID || 'org_33z36QibAMZy6kc2xZNYmDl5duh'

export default function Dashboard() {
  const [isAdminInviteOpen, setIsAdminInviteOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="space-y-6">
      {/* Header with action button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mission Control</h1>
          <p className="text-muted-foreground">Platform dashboard and real-time monitoring</p>
        </div>
        <Button
          size="sm"
          onClick={() => setIsAdminInviteOpen(true)}
        >
          <UserPlus2 className="h-4 w-4 mr-2" />
          Invite Admin
        </Button>
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="dashboard" className="gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Health</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* Section 1A: Platform Pulse (KPIs) */}
          <PlatformPulseSection />

          {/* Section 1B & 1C: Live Feed + Device Fleet (2-column layout) */}
          <div className="grid gap-4 md:grid-cols-12">
            <div className="md:col-span-5">
              <LiveActivityFeed />
            </div>
            <div className="md:col-span-7">
              <DeviceFleetMap />
            </div>
          </div>

          {/* Section 1D & 1E: Heatmap + Alerts (2-column layout) */}
          <div className="grid gap-4 md:grid-cols-12">
            <div className="md:col-span-4">
              <OrdersHeatmap />
            </div>
            <div className="md:col-span-8">
              <AlertsPanel />
            </div>
          </div>
        </TabsContent>

        {/* Health Tab */}
        <TabsContent value="health" className="space-y-6">
          <HealthDashboard />
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
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
