'use client'

import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import { PageHeader, PageShell, Panel, PanelSection } from '@/components/dashboard/shell'
import { Badge } from '@/components/ui/badge'
import { useAdminMerchantAuditLog } from '@/lib/queries/use-admin-merchant'
import {
    DetailPageSkeleton,
    DetailUnavailable,
    Fact,
    FactGrid,
} from '@/app/manage/transactions/components/detail-primitives'
import { merchantAuditTabHref } from '../routes'
import { AuditChanges, AuditMetadata, describeChanges, formatKey, readChanges } from '@/app/manage/components/audit-detail-parts'

const BACK_LABEL = 'Back to audit log'

/**
 * One audit entry, opened from the merchant detail page's Audit tab. Laid out
 * like /manage/transactions/audit/[eventId]: the facts first, then what
 * changed, with the request context beside it from `lg`.
 */
export default function MerchantAuditLogPage() {
    const params = useParams<{ merchantId: string; logId: string }>()
    const merchantId = params?.merchantId ?? ''
    const logId = params?.logId ?? ''
    const backHref = merchantAuditTabHref(merchantId)
    const query = useAdminMerchantAuditLog(merchantId, logId)

    if (query.isLoading) return <DetailPageSkeleton />

    const log = query.data?.data ?? null

    if (!log) {
        const failed = query.isError || !!query.data?.error
        return (
            <DetailUnavailable
                title="Audit entry unavailable"
                heading={failed ? "We couldn't load this audit entry" : "We couldn't find this audit entry"}
                detail={
                    failed
                        ? (query.data?.error ?? (query.error as Error | null)?.message)
                        : 'It may belong to a different merchant, or the link may be incomplete.'
                }
                backHref={backHref}
                backLabel={BACK_LABEL}
                onRetry={failed ? () => void query.refetch() : undefined}
            />
        )
    }

    const when = format(new Date(log.created_at), 'MMM d, yyyy, HH:mm:ss')
    const resource = log.resource_type ? formatKey(log.resource_type).toLowerCase() : 'record'
    const changes = readChanges(log.changes)
    const metadata =
        log.metadata && typeof log.metadata === 'object' && Object.keys(log.metadata).length > 0
            ? (log.metadata as Record<string, unknown>)
            : null

    return (
        <PageShell as="div">
            <PageHeader
                title={log.action}
                titleBadge={
                    <Badge variant="outline" className="capitalize max-sm:hidden">
                        {log.severity}
                    </Badge>
                }
                subtitle={[log.actor_name, when].filter(Boolean).join(' · ')}
                backHref={backHref}
                backLabel={BACK_LABEL}
            />

            <Panel nested>
                <PanelSection label="Event" caption="Who did it, when, and to what.">
                    <FactGrid className="lg:grid-cols-4">
                        <Fact label="When" value={when} />
                        <Fact label="Actor" value={log.actor_name} />
                        <Fact label="Role" value={log.actor_role ? formatKey(log.actor_role) : null} />
                        <Fact label="Email" value={log.actor_email} />
                        <Fact label="Category" value={formatKey(log.action_category)} />
                        <Fact label="Severity" value={formatKey(log.severity)} />
                        <Fact label="Location" value={log.location?.name || 'Global'} />
                        {log.is_impersonation && <Fact label="Performed via" value="View as merchant" />}
                        {log.status && <Fact label="Status" value={formatKey(log.status)} />}
                        <Fact
                            label={log.resource_type ? formatKey(log.resource_type) : 'Resource'}
                            value={log.resource_name}
                        />
                        <Fact
                            label="Resource ID"
                            value={log.resource_id}
                            mono
                            copyable
                            className="col-span-2 sm:col-span-1"
                        />
                        <Fact label="Entry ID" value={log.id} mono copyable className="col-span-2 sm:col-span-1" />
                    </FactGrid>
                </PanelSection>
            </Panel>

            {log.error_message && (
                <Panel>
                    <PanelSection label="Error" caption="Why the action failed, as recorded at the time.">
                        <p className="break-words rounded-2xl bg-muted/60 px-4 py-3 font-mono text-xs">
                            {log.error_message}
                        </p>
                    </PanelSection>
                </Panel>
            )}

            <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-3">
                <Panel className={metadata ? 'lg:col-span-2' : 'lg:col-span-3'}>
                    <PanelSection label="Changes" caption={describeChanges(changes, resource)} showCaptionOnMobile>
                        <AuditChanges shape={changes} />
                    </PanelSection>
                </Panel>

                {metadata && (
                    <Panel>
                        <PanelSection label="Request context" caption="Where the action came from.">
                            <AuditMetadata data={metadata} />
                        </PanelSection>
                    </Panel>
                )}
            </div>
        </PageShell>
    )
}
