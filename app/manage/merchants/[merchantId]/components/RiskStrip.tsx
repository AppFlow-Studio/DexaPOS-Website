'use client'

import { CheckCircle2, Calendar, Shield, Activity } from 'lucide-react'
import { Panel, StatRow, StatTile } from '@/components/dashboard/shell'
import { MerchantDetails } from '@/types/merchant'

export function RiskStrip({ merchant }: { merchant: MerchantDetails }) {
    // Real KPI wiring lands with Luqra integration. For now, derive what we can
    // from MerchantDetails and show `—` with the reason for the rest (§4.9).
    const liveLocations = merchant.active_locations
    const totalLocations = merchant.total_locations

    // The standard KPI panel (§4.8) rather than a hand-rolled strip: its cell
    // dividers were lines (§5.5) and its labels an uppercase variant of the
    // stat label. Metas, including "Awaiting Luqra sync" on the `—` tiles, are
    // desktop-only: on phones the height matters more than the explanation.
    return (
        <Panel>
            <div className="px-4 py-6 sm:px-6">
                <StatRow columns={4}>
                    <StatTile
                        icon={<CheckCircle2 className="h-4 w-4" />}
                        label="Live MIDs"
                        value={`${liveLocations} / ${totalLocations}`}
                        meta={liveLocations === totalLocations ? 'All boarded' : 'Boarding in progress'}
                    />
                    <StatTile
                        icon={<Calendar className="h-4 w-4" />}
                        label="Next funding"
                        value="—"
                        meta="Awaiting Luqra sync"
                    />
                    <StatTile
                        icon={<Shield className="h-4 w-4" />}
                        label="Chargeback rate"
                        value="—"
                        meta="Awaiting Luqra sync"
                    />
                    <StatTile
                        icon={<Activity className="h-4 w-4" />}
                        label="Risk profile"
                        value="Low"
                        meta={`MCC ${merchant.business_type ?? '—'}`}
                    />
                </StatRow>
            </div>
        </Panel>
    )
}
