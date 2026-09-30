'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PageHeader, PageShell, Panel, PanelSection, PanelSubLabel } from '@/components/dashboard/shell'
import { Badge } from '@/components/ui/badge'
import { usePlatformPaymentAuditEvent } from '@/lib/queries/use-platform-analytics'
import { paymentDetailHref, transactionsTabHref } from '../../routes'
import {
    DetailList,
    DetailPageSkeleton,
    DetailRow,
    DetailUnavailable,
} from '../../components/detail-primitives'
import { formatActionLabel, formatDateTime } from '../../components/AuditLogSection'

const BACK_HREF = transactionsTabHref('audit')
const BACK_LABEL = 'Back to payment audit log'

export default function PaymentAuditEventDetailPage() {
    const params = useParams<{ eventId: string }>()
    const eventId = params?.eventId ?? ''
    const query = usePlatformPaymentAuditEvent(eventId)

    if (query.isLoading) return <DetailPageSkeleton />

    const event = query.data?.data ?? null
    const errorCode = query.data?.errorCode

    if (!event) {
        const failed = query.isError || !!errorCode
        return (
            <DetailUnavailable
                title="Audit event unavailable"
                heading={failed ? "We couldn't load this audit event" : "We couldn't find this audit event"}
                detail={
                    errorCode
                        ? `The payment audit log may not be installed on this database. Error ${errorCode}`
                        : query.isError
                            ? (query.error as Error).message
                            : 'It may belong to a merchant outside your access.'
                }
                backHref={BACK_HREF}
                backLabel={BACK_LABEL}
                onRetry={failed ? () => void query.refetch() : undefined}
            />
        )
    }

    // A payment resource links to its payment page; anything else is shown as text.
    const resourceIsPayment = event.resource_type === 'order_payment' && !!event.resource_id

    return (
        <PageShell as="div">
            <PageHeader
                title={formatActionLabel(event.action)}
                titleBadge={<Badge variant="outline" className="max-sm:hidden">{event.success ? 'Success' : 'Failed'}</Badge>}
                subtitle={[event.user_email, formatDateTime(event.event_timestamp)].filter(Boolean).join(' · ')}
                backHref={BACK_HREF}
                backLabel={BACK_LABEL}
            />

            <Panel nested>
                <PanelSection
                    label="Event"
                    caption="Who accessed payment data, what they touched, and from where."
                >
                    <div className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2">
                        <div className="min-w-0">
                            <PanelSubLabel>Actor</PanelSubLabel>
                            <DetailList>
                                <DetailRow label="User" value={event.user_email} />
                                <DetailRow label="Role" value={event.user_role} />
                                <DetailRow label="IP address" value={event.ip_address} mono />
                                <DetailRow label="Timestamp" value={formatDateTime(event.event_timestamp)} />
                                <DetailRow label="Request path" value={event.request_path} mono wrap />
                            </DetailList>
                        </div>

                        <div className="min-w-0">
                            <PanelSubLabel>Resource</PanelSubLabel>
                            <DetailList>
                                <DetailRow label="Action" value={formatActionLabel(event.action)} />
                                <DetailRow label="Outcome" value={event.success ? 'Success' : 'Failed'} />
                                <DetailRow label="Resource type" value={event.resource_type} />
                                <DetailRow
                                    label="Resource ID"
                                    mono
                                    value={
                                        resourceIsPayment ? (
                                            <Link
                                                href={paymentDetailHref(event.resource_id!)}
                                                className="underline-offset-2 hover:underline"
                                            >
                                                {event.resource_id}
                                            </Link>
                                        ) : (
                                            event.resource_id
                                        )
                                    }
                                />
                                <DetailRow
                                    label="Merchant"
                                    value={
                                        event.merchant_id ? (
                                            <Link
                                                href={`/manage/merchants/${event.merchant_id}`}
                                                className="underline-offset-2 hover:underline"
                                            >
                                                {event.merchant_name || event.merchant_id}
                                            </Link>
                                        ) : null
                                    }
                                />
                            </DetailList>
                        </div>
                    </div>
                </PanelSection>
            </Panel>

            <Panel>
                <PanelSection label="Fields accessed" caption="The payment data fields this action exposed.">
                    {event.fields_accessed.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No specific fields were recorded for this event.</p>
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {event.fields_accessed.map((field) => (
                                <Badge key={field} variant="outline" className="font-mono text-xs">
                                    {field}
                                </Badge>
                            ))}
                        </div>
                    )}
                </PanelSection>
                {event.error_message && (
                    <PanelSection label="Error" caption="Why the action failed, as recorded at the time." className="pt-0">
                        <p className="break-words rounded-2xl bg-muted/60 px-4 py-3 font-mono text-xs">
                            {event.error_message}
                        </p>
                    </PanelSection>
                )}
            </Panel>
        </PageShell>
    )
}
