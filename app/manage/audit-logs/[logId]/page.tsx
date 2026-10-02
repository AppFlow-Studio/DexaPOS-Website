'use client'

import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { Bookmark, BookmarkCheck, ShieldAlert } from 'lucide-react'
import { PageHeader, PageShell, Panel, PanelSection } from '@/components/dashboard/shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePlatformAuditLog } from '@/lib/queries/use-platform-analytics'
import { buildAuditSentence } from '@/lib/audit/sentence-templates'
import { describeSettlementActivity } from '@/lib/audit/settlement-activity'
import { PII_ACCESS_TYPE_LABELS, type PiiAccessType } from '@/types/audit-log'
import {
    DetailPageSkeleton,
    DetailUnavailable,
    Fact,
    FactGrid,
} from '@/app/manage/transactions/components/detail-primitives'
import {
    AuditChanges,
    AuditMetadata,
    describeChanges,
    formatKey,
    readChanges,
} from '@/app/manage/components/audit-detail-parts'
import {
    STATUS_LABELS,
    absoluteTime,
    auditLogsListHref,
    categoryLabel,
    describeAnomaly,
    formatActionLabel,
    inferOrgType,
    normalizeStatus,
    parseAnomaly,
    rowToFakeLog,
    toggleAuditLogFlag,
    useFlaggedAuditLogIds,
} from '../audit-log-shared'

const BACK_LABEL = 'Back to audit logs'

/**
 * One platform audit entry (§5.9): the facts first, then what changed, with
 * the request context beside it from `lg`. Laid out like the merchant audit
 * entry page. Back returns to the list's page and filters, carried in `?list=`.
 */
export default function PlatformAuditLogPage() {
    const params = useParams<{ logId: string }>()
    const searchParams = useSearchParams()
    const logId = params?.logId ?? ''
    const backHref = auditLogsListHref(searchParams.get('list'))
    const anomaly = parseAnomaly(searchParams.get('anomaly'))
    const flaggedIds = useFlaggedAuditLogIds()
    const query = usePlatformAuditLog(logId)

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
                        : 'The link may be incomplete, or the entry may no longer exist.'
                }
                backHref={backHref}
                backLabel={BACK_LABEL}
                onRetry={failed ? () => void query.refetch() : undefined}
            />
        )
    }

    const status = normalizeStatus(log.status)
    const isFlagged = flaggedIds.has(log.id)
    const fakeLog = rowToFakeLog(log)
    const { sentence, highlight } = buildAuditSentence(fakeLog)
    const settlement = describeSettlementActivity(fakeLog)
    const resource = log.resource_type ? formatKey(log.resource_type).toLowerCase() : 'record'
    const changes = readChanges(log.changes)
    const metadata = log.metadata && Object.keys(log.metadata).length > 0 ? log.metadata : null
    const piiAccess = log.pii_access_type
        ? (PII_ACCESS_TYPE_LABELS[log.pii_access_type as PiiAccessType] ?? formatKey(log.pii_access_type))
        : null

    return (
        <PageShell as="div">
            <PageHeader
                title={formatActionLabel(log.action)}
                titleBadge={
                    <Badge variant="outline" className="max-sm:hidden">
                        {STATUS_LABELS[status]}
                    </Badge>
                }
                subtitle={[log.actor_name || log.actor_email, absoluteTime(log.created_at)].filter(Boolean).join(' · ')}
                backHref={backHref}
                backLabel={BACK_LABEL}
                actions={
                    <Button
                        variant="outline"
                        className="h-9 px-4 text-[0.8125rem] font-medium"
                        aria-pressed={isFlagged}
                        onClick={() => toggleAuditLogFlag(log.id)}
                    >
                        {isFlagged ? (
                            <BookmarkCheck className="mr-2 h-4 w-4" aria-hidden />
                        ) : (
                            <Bookmark className="mr-2 h-4 w-4" aria-hidden />
                        )}
                        {isFlagged ? 'Flagged' : 'Flag for review'}
                    </Button>
                }
            />

            {/* Said in words on a neutral callout, never a tinted banner (§3.5). */}
            {anomaly && (
                <div className="flex items-start gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                        <p>
                            <span className="font-medium">Anomaly detected:</span> {describeAnomaly(anomaly)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Found among the events loaded on the audit log list.
                        </p>
                    </div>
                </div>
            )}

            <Panel nested>
                <PanelSection label="Event" caption="Who did it, when, and to what.">
                    <p className="text-sm font-medium leading-snug">{sentence}</p>
                    {highlight && <p className="mt-1 text-sm text-muted-foreground">{highlight}</p>}
                    <FactGrid className="mt-5 lg:grid-cols-4">
                        <Fact label="When" value={absoluteTime(log.created_at)} />
                        <Fact label="Actor" value={log.actor_name} />
                        <Fact label="Role" value={log.actor_role ? formatKey(log.actor_role) : null} />
                        <Fact label="Email" value={log.actor_email} />
                        <Fact
                            label={inferOrgType(log) === 'Merchant' ? 'Merchant' : 'Organization'}
                            value={
                                log.merchant_id ? (
                                    <Link
                                        href={`/manage/merchants/${encodeURIComponent(log.merchant_id)}`}
                                        className="underline-offset-2 hover:underline"
                                    >
                                        {log.merchant_name || log.organization_name || log.merchant_id}
                                    </Link>
                                ) : (
                                    log.organization_name || inferOrgType(log)
                                )
                            }
                        />
                        <Fact label="Location" value={log.location_name} />
                        <Fact label="Category" value={log.action_category ? categoryLabel(log.action_category) : null} />
                        <Fact label="Severity" value={formatKey(log.severity || 'info')} />
                        <Fact label="Status" value={STATUS_LABELS[status]} />
                        {piiAccess && <Fact label="PII access" value={piiAccess} />}
                        {log.is_impersonation && <Fact label="Performed via" value="View as merchant" />}
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

            {/* Batch events: readable facts from metadata + the batch's linked terminal. */}
            {settlement && settlement.details.length > 0 && (
                <Panel>
                    <PanelSection
                        label="Batch details"
                        caption={
                            settlement.terminalSerial
                                ? 'The linked terminal is the reader this batch belongs to, not necessarily the device that initiated settlement.'
                                : 'What the batch looked like when this was recorded.'
                        }
                        action={
                            settlement.terminalSerial && log.merchant_id ? (
                                <Button variant="outline" className="h-9 px-4 text-[0.8125rem] font-medium" asChild>
                                    <Link
                                        href={`/manage/merchants/${encodeURIComponent(log.merchant_id)}/devices/terminal/${encodeURIComponent(settlement.terminalSerial)}`}
                                    >
                                        View terminal and its batches
                                    </Link>
                                </Button>
                            ) : undefined
                        }
                    >
                        <FactGrid className="lg:grid-cols-4">
                            {settlement.details.map((detail) => (
                                <Fact key={detail.label} label={detail.label} value={detail.value} />
                            ))}
                        </FactGrid>
                    </PanelSection>
                </Panel>
            )}

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
