'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BellRing, CheckCircle2, Loader2, Mail, Radar, XCircle } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { sendChurnSlackAlert } from '@/app/manage/actions/hq-platform/analytics'
import type {
  ChurnSeverity,
  ChurnWarningData,
  ChurnWarningMerchant,
} from '@/app/manage/actions/hq-platform/analytics'

/**
 * Mobile column meta for the at-risk table. Merchant is the row's identity and
 * Drop % is why it's listed, so those two are the phone default.
 */
const CHURN_COLUMNS: ReportColumn[] = [
  { id: 'merchant', label: 'Merchant', locked: true },
  { id: 'severity', label: 'Severity', defaultHidden: true },
  { id: 'prevGpv', label: 'Prev 7d GPV', defaultHidden: true },
  { id: 'lastGpv', label: 'Last 7d GPV', defaultHidden: true },
  { id: 'drop', label: 'Drop %' },
  { id: 'lastSale', label: 'Last Sale', defaultHidden: true },
  { id: 'actions', label: 'Actions', defaultHidden: true },
]

/** Rows shown per list before "Show all". */
const PREVIEW_ROWS = 10

// Words only: §14.3 HQ-2 keeps severity colour to `/manage/health`.
const SEVERITY_LABEL: Record<ChurnSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
}

function fmtMoney(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function emailHref(m: ChurnWarningMerchant) {
  const subject = `Checking in — ${m.name}`
  const body = [
    `Hi,`,
    ``,
    `We noticed ${m.name}'s sales on Dexa POS dropped ${m.dropPercentage}% this week`,
    `(${fmtMoney(m.prevSevenDaysGPV)} the week before, ${fmtMoney(m.lastSevenDaysGPV)} this week).`,
    ``,
    `Is everything running smoothly? Happy to help if anything's getting in the way.`,
  ].join('\n')
  return `mailto:${m.ownerEmail ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

type SlackState = {
  status: 'idle' | 'sending' | 'sent' | 'error' | 'no_webhook' | 'no_critical'
  message?: string
}

/**
 * One panel for every churn signal: week-over-week drops (merchant level) and
 * locations that have gone quiet (no sales in the churn window). It keeps one
 * title whatever the state, so "all clear" and "at risk" read as the same
 * instrument rather than two different panels.
 */
export function ChurnRadar({ data, isLoading }: { data?: ChurnWarningData; isLoading: boolean }) {
  const [slack, setSlack] = useState<SlackState>({ status: 'idle' })
  const [showAllMerchants, setShowAllMerchants] = useState(false)
  const [showAllQuiet, setShowAllQuiet] = useState(false)
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => initialHiddenColumns(CHURN_COLUMNS))
  // Hiding is mobile-only: the picker is md:hidden, so desktop ignores the set.
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)

  if (isLoading) return <Skeleton className="h-48 w-full rounded-3xl" />
  if (!data) return null

  async function notifySlack() {
    if (!data || slack.status === 'sending') return
    setSlack({ status: 'sending' })
    try {
      const result = await sendChurnSlackAlert(data.atRiskMerchants, {
        totalAtRisk: data.totalAtRisk,
        highCount: data.highCount,
        mediumCount: data.mediumCount,
        totalGPVAtRisk: data.totalGPVAtRisk,
      })
      setSlack({ status: result.status, message: result.message })
    } catch (err) {
      setSlack({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  const bands = ([
    ['critical', data.criticalCount],
    ['high', data.highCount],
    ['medium', data.mediumCount],
  ] as const).filter(([, n]) => n > 0)

  const merchants = showAllMerchants ? data.atRiskMerchants : data.atRiskMerchants.slice(0, PREVIEW_ROWS)
  const quiet = showAllQuiet ? data.quietLocations : data.quietLocations.slice(0, PREVIEW_ROWS)

  // Slack only carries critical merchants, so the button only exists when there are some.
  const slackButton = data.criticalCount > 0 && (
    <Button
      size="sm"
      variant="outline"
      className="no-print h-8 gap-1.5 rounded-full text-xs"
      disabled={slack.status === 'sending' || slack.status === 'sent'}
      onClick={notifySlack}
      title={slack.message}
    >
      {slack.status === 'sending' && <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending…</>}
      {slack.status === 'sent' && <><CheckCircle2 className="h-3.5 w-3.5" />Sent to Slack</>}
      {slack.status === 'error' && <><XCircle className="h-3.5 w-3.5" />Retry Slack</>}
      {slack.status === 'no_webhook' && <><BellRing className="h-3.5 w-3.5" />No webhook configured</>}
      {(slack.status === 'idle' || slack.status === 'no_critical') && <><BellRing className="h-3.5 w-3.5" />Notify Slack</>}
    </Button>
  )

  return (
    <Panel>
      <PanelSection
        icon={Radar}
        label="Churn radar"
        caption="Last 7 days vs the 7 before"
        action={slackButton || undefined}
      >
        {/* The summary line replaces three severity tiles, which spent a full
            row saying "1 / 0 / 0". */}
        <p className="text-sm text-muted-foreground">
          {data.totalAtRisk === 0 ? (
            <>No merchant&apos;s GPV fell more than 30% week over week.</>
          ) : (
            <>
              <span className="font-medium text-foreground">{plural(data.totalAtRisk, 'merchant')} at risk</span>
              {' · '}
              <span className="tabular-nums">{fmtMoney(data.totalGPVAtRisk)}</span> weekly GPV at stake
              {bands.map(([sev, n]) => ` · ${n} ${SEVERITY_LABEL[sev].toLowerCase()}`).join('')}
            </>
          )}
        </p>

        {merchants.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex justify-start">
              <MobileColumnsButton columns={CHURN_COLUMNS} hidden={hiddenCols} onChange={setHiddenCols} />
            </div>
            {/* The min-width is what forces the sideways scroll, so it lifts on
                mobile or hiding columns changes nothing. */}
            <Table variant="data" className={cn(!isMobile && 'min-w-[820px]')}>
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  {showCol('severity') && <TableHead>Severity</TableHead>}
                  {showCol('prevGpv') && <TableHead className="text-right">Prev 7d GPV</TableHead>}
                  {showCol('lastGpv') && <TableHead className="text-right">Last 7d GPV</TableHead>}
                  {showCol('drop') && <TableHead className="text-right">Drop %</TableHead>}
                  {showCol('lastSale') && <TableHead className="text-right">Last Sale</TableHead>}
                  {showCol('actions') && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr]:border-0">
                {merchants.map(m => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link href={`/manage/merchants/${m.id}`} className="font-medium hover:underline">
                        {m.name}
                      </Link>
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {m.transactionsLast7Days} txns (was {m.transactionsPrev7Days})
                      </p>
                    </TableCell>
                    {showCol('severity') && (
                      <TableCell className="text-sm text-muted-foreground">{SEVERITY_LABEL[m.severity]}</TableCell>
                    )}
                    {showCol('prevGpv') && (
                      <TableCell className="text-right font-medium tabular-nums">{fmtMoney(m.prevSevenDaysGPV)}</TableCell>
                    )}
                    {showCol('lastGpv') && (
                      <TableCell className="text-right font-medium tabular-nums">{fmtMoney(m.lastSevenDaysGPV)}</TableCell>
                    )}
                    {showCol('drop') && (
                      <TableCell className="text-right font-semibold tabular-nums">−{m.dropPercentage}%</TableCell>
                    )}
                    {showCol('lastSale') && (
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {m.daysSinceLastOrder === 0 ? 'Today' : `${m.daysSinceLastOrder}d ago`}
                      </TableCell>
                    )}
                    {showCol('actions') && (
                      <TableCell className="text-right">
                        {m.ownerEmail ? (
                          <Button asChild variant="outline" size="sm" className="h-7 gap-1 rounded-full px-2 text-xs">
                            <a href={emailHref(m)} title={`Email ${m.ownerEmail}`}>
                              <Mail className="h-3 w-3" />Email owner
                            </a>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No owner email</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {data.atRiskMerchants.length > PREVIEW_ROWS && (
          <ShowAllToggle
            expanded={showAllMerchants}
            total={data.atRiskMerchants.length}
            noun="merchants"
            onToggle={() => setShowAllMerchants(v => !v)}
          />
        )}

        {/* Week-over-week drops can't see a location that never sold or went
            fully silent, so those get their own group in the same panel. */}
        {data.quietLocations.length > 0 && (
          <div className="mt-8">
            <p className="text-sm font-medium">Locations with no recent sales</p>
            <p className="text-xs text-muted-foreground max-md:hidden">
              Active locations with no sales in {data.quietAfterDays}+ days
            </p>
            <Table variant="data" className="mt-3">
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="text-right">Last Sale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr]:border-0">
                {quiet.map(loc => (
                  <TableRow key={loc.locationId}>
                    <TableCell className="font-medium">{loc.locationName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <Link href={`/manage/merchants/${loc.merchantId}`} className="hover:underline">
                        {loc.merchantName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {loc.daysSinceLastOrder !== null ? `${loc.daysSinceLastOrder}d ago` : 'Never sold'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data.quietLocations.length > PREVIEW_ROWS && (
              <ShowAllToggle
                expanded={showAllQuiet}
                total={data.quietLocations.length}
                noun="locations"
                onToggle={() => setShowAllQuiet(v => !v)}
              />
            )}
          </div>
        )}
      </PanelSection>
    </Panel>
  )
}

function ShowAllToggle({
  expanded,
  total,
  noun,
  onToggle,
}: {
  expanded: boolean
  total: number
  noun: string
  onToggle: () => void
}) {
  return (
    <div className="mt-2">
      <Button variant="ghost" size="sm" className="-ml-2 h-8 rounded-full px-2 text-xs" onClick={onToggle}>
        {expanded ? `Show top ${PREVIEW_ROWS}` : `Show all ${total} ${noun}`}
      </Button>
    </div>
  )
}
