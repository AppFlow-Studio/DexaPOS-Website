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
import { usePlatformActivityFeed } from '@/lib/queries/use-platform-dashboard'
import { cn } from '@/lib/utils'
import { HealthDashboard } from './components/HealthDashboard'
import { AnalyticsContent } from './components/AnalyticsContent'

const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID ?? ''

export default function Dashboard() {
  const [isAdminInviteOpen, setIsAdminInviteOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')
  // Served from cache — LiveActivityFeed below uses the same query.
  const { data: activityEvents } = usePlatformActivityFeed()
  const hasActivity = (activityEvents?.length ?? 0) > 0

  return (
    <PageShell as="div">
      {/* Inviting an admin is a Dashboard-tab action, not a reporting one.
          Carried into Analytics it was a prominent primary button offering
          something unrelated to anything on screen, while the tab had no
          action of its own — so the header cost its full height to say
          nothing. It is withheld outside the Dashboard rather than moved,
          because Health has no use for it either.

          `PlatformStatusLine` below deliberately stays on every tab: it is a
          platform-wide incident indicator, and its counts link back into the
          Dashboard tab (switching tabs before scrolling, since Radix unmounts
          inactive ones). Hiding it per-tab would break that path. */}
      <PageHeader
        title="Mission Control"
        subtitle="Platform dashboard and real-time monitoring"
        actions={
          activeTab === 'dashboard' ? (
            <Button size="sm" onClick={() => setIsAdminInviteOpen(true)}>
              <UserPlus2 className="h-4 w-4 mr-2" />
              Invite Admin
            </Button>
          ) : undefined
        }
      />

      <PlatformStatusLine onNavigate={() => setActiveTab('dashboard')} />

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
        {/* A flex column rather than plain block flow: the alerts row is
            ordered ahead of the feed, fleet and spotlight on a phone, where
            those four blocks stacked put the page's only actionable panel
            roughly five screens down. `md:` restores the authored order, so
            the desktop page is unchanged. `space-y-6` does not apply across
            reordered flex children — the gap carries the rhythm instead. */}
        <TabsContent value="dashboard" className="mt-6 flex flex-col gap-6">
          {/* Section 1A: Platform Pulse (KPIs) */}
          <div className="order-1">
            <PlatformPulseSection />
          </div>

          {/* Section 1A.5: Merchant Spotlight — top merchants by today's revenue */}
          <div className="order-3 md:order-2">
            <MerchantSpotlightSection />
          </div>

          {/* Section 1B & 1C: Live Feed + Device Fleet.
              The feed gives up its column when it has nothing to show: an empty
              "Waiting for activity…" was holding 5 of 12 columns while the
              fleet panel — the one with the offline devices in it — was squeezed
              into 7. `items-start` keeps each panel at its own height. */}
          <div className="order-4 grid items-start gap-6 md:order-3 md:grid-cols-12">
            {/* One instance, reordered rather than re-mounted: rendering the
                feed in two branches would remount it (and refetch) each time
                the last event aged out. */}
            <div
              className={
                hasActivity ? 'md:order-1 md:col-span-5' : 'md:order-2 md:col-span-12'
              }
            >
              <LiveActivityFeed />
            </div>
            <div
              id="fleet"
              className={cn(
                "scroll-mt-24",
                hasActivity ? "md:order-2 md:col-span-7" : "md:order-1 md:col-span-12",
              )}
            >
              <DeviceFleetMap />
            </div>
          </div>

          {/* Section 1D & 1E: Heatmap + Alerts (2-column layout) */}
          {/* `items-start`: grid items stretch by default, so the chart was
              padded out to whatever height the alerts list happened to be.
              Each panel now takes its own content height. */}
          <div className="order-2 grid items-start gap-6 md:order-4 md:grid-cols-12">
            {/* Alerts lead on a phone. Stacked, the chart is a full screen of
                scrolling in front of the one panel an admin opens this page to
                act on, so the two swap order below `md` and the desktop
                arrangement is restored at `md` unchanged. */}
            <div className="order-2 md:order-1 md:col-span-4">
              <OrdersHeatmap />
            </div>
            <div id="alerts" className="order-1 scroll-mt-24 md:order-2 md:col-span-8">
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
