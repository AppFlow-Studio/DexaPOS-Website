'use client'

import { PageHeader } from '@/components/dashboard/shell/PageHeader'
import { PageShell } from '@/components/dashboard/shell/PageShell'
import { HealthDashboard } from '@/app/manage/components/HealthDashboard'

/**
 * `/manage/health` — the standalone route for the same view the `/manage`
 * Health tab renders.
 *
 * This page previously re-implemented `HealthDashboard` inline: ~450 lines of
 * duplicated grid, filter, sort and row markup driven by the same hooks. The
 * two copies had already drifted — the "Locations" figure divided by a
 * different field in each — so a bug fixed in one would not reach the other.
 *
 * It now hosts the shared component, which is the single definition.
 */
export default function HealthDashboardPage() {
    return (
        <PageShell as="div">
            <PageHeader
                title="Merchant Health Dashboard"
                subtitle="Monitor merchant performance and operational health. Health score is calculated from multiple factors including system uptime, transaction success rates, and activity levels."
            />
            <HealthDashboard />
        </PageShell>
    )
}
