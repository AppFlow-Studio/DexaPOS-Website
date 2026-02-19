'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { UserPlus2 } from 'lucide-react'
import { AdminInviteWizard } from './organizations/[organizationId]/components/AdminInviteWizard'
import { PlatformPulseSection } from './components/PlatformPulseSection'
import { LiveActivityFeed } from './components/LiveActivityFeed'
import { DeviceFleetMap } from './components/DeviceFleetMap'
import { OrdersHeatmap } from './components/OrdersHeatmap'
import { AlertsPanel } from './components/AlertsPanel'

// HQ Organization ID for direct admin invites
const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID || 'org_33z36QibAMZy6kc2xZNYmDl5duh'

export default function Dashboard() {
  const [isAdminInviteOpen, setIsAdminInviteOpen] = useState(false)

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
