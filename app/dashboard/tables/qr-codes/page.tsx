'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
    useGatedLocationId,
    useLocationById,
    useLocationStore,
} from '@/stores/location-store'
import { LocationListView } from '@/components/dashboard/tables/LocationListView'
import {
    LocationIndicator,
    PageHeader,
    PageShell,
} from '@/components/dashboard/shell'
import {
    getQrTableManagerSnapshot,
    type QrTableManagerSnapshot,
} from '@/app/dashboard/online-ordering/actions'

import { QrTableManager } from './components/QrTableManager'
import { QrAnalyticsPanel } from './components/QrAnalyticsPanel'
import { QrGuestAlertsPanel } from './components/QrGuestAlertsPanel'

/**
 * Table QR codes live under Tables, not under Online Ordering, because the rows
 * are floor-plan objects: a table added on the floor plan appears here as
 * "Not generated". What stays on the Online Ordering side is the policy — the
 * enable switch, the kill switch, the fulfilment mode, the service fee and the
 * tier gate — because those are storefront configuration.
 *
 * The marketing QR deliberately did not move with this screen. It has no table
 * behind it; it points at the storefront and belongs with the storefront.
 */
export default function TableQrCodesPage() {
    const { selectedLocationId, setSelectedLocation } = useLocationStore()
    const gatedLocationId = useGatedLocationId()
    // Mirrors the floor-plan page so both Tables screens pick a location the
    // same way: an explicit in-page choice wins, then the globally selected
    // branch, then the gated fallback that single-location accounts sit on.
    const [pickedLocationId, setPickedLocationId] = React.useState<string | null>(null)
    const locationId =
        pickedLocationId ||
        (selectedLocationId !== 'all' ? selectedLocationId : null) ||
        gatedLocationId

    // The store already knows the branch name, so the heading and the manager
    // read correctly on first paint rather than after the snapshot lands.
    const storeLocation = useLocationById(locationId ?? '')

    const { data: snapshot, isLoading, refetch } = useQuery<QrTableManagerSnapshot>({
        queryKey: ['qr-table-manager', locationId],
        queryFn: () => getQrTableManagerSnapshot(locationId as string),
        enabled: Boolean(locationId),
        refetchOnWindowFocus: false,
    })

    const locationName = snapshot?.locationName || storeLocation?.name || ''

    // The snapshot reports its own failures in the payload rather than throwing,
    // so the surfacing that used to live inside the manager's loader lands here.
    const snapshotError = snapshot && !snapshot.success ? snapshot.error : null
    React.useEffect(() => {
        if (snapshotError) toast.error(snapshotError)
    }, [snapshotError])

    if (!locationId) {
        return (
            <PageShell>
                <PageHeader
                    title="QR Codes"
                    subtitle="Generate, print and revoke the table QR codes guests scan to order."
                />
                <LocationListView
                    onLocationSelect={(id) => {
                        setPickedLocationId(id)
                        setSelectedLocation(id)
                    }}
                />
            </PageShell>
        )
    }

    return (
        <PageShell>
            <PageHeader
                title="QR Codes"
                subtitle="Generate, print and revoke the table QR codes guests scan to order."
                backHref="/dashboard/tables"
                backLabel="Back to floor plan"
                indicator={
                    <LocationIndicator
                        isAllLocations={false}
                        locationName={locationName || null}
                    />
                }
            />

            <QrTableManager
                locationId={locationId}
                fallbackLocationName={locationName}
                snapshot={snapshot ?? null}
                isLoading={isLoading}
                refresh={refetch}
            />

            <QrAnalyticsPanel
                locationId={locationId}
                qrEnabled={snapshot?.acceptsDineIn ?? false}
            />

            <QrGuestAlertsPanel locationId={locationId} />
        </PageShell>
    )
}
