import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, AlertTriangle, CheckCircle2, CircleHelp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getMerchantBatchJourney } from '@/app/manage/actions/admin-merchant/batch-journey'

function money(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function date(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function title(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>
}

export default async function MerchantBatchJourneyPage({
  params,
}: { params: Promise<{ merchantId: string; batchId: string }> }) {
  const { merchantId, batchId } = await params
  const story = await getMerchantBatchJourney(merchantId, batchId)
  if (!story) notFound()

  const { batch, terminal, payments, transactions, processorBatches, deposits, audit, attempts } = story
  const batchLabel = batch.batch_number
    ? `${batch.acquirer ? `${batch.acquirer}-` : ''}${batch.batch_number}`
    : batch.batch_id
  const paymentSum = payments.reduce((total, payment) => total + Number(payment.total_amount ?? 0), 0)
  const matchedPaymentIds = new Set(transactions.map((txn) => txn.reconciled_payment_id))
  const ledgerComplete = story.paymentsTotal === payments.length

  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
    <Link href={`/manage/merchants/${merchantId}?tab=settlements`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Batches &amp; deposits
    </Link>

    <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Batch investigation</p>
        <h1 className="text-3xl font-semibold tracking-tight">Batch {batchLabel}</h1>
        <p className="text-sm text-muted-foreground">Follow the recorded path from POS close to processor activity and deposits. Missing links are shown as missing, not matched by number.</p>
      </div>
      <Badge variant="outline" className="text-sm">{title(batch.status)}</Badge>
    </header>

    <nav aria-label="Batch story sections" className="flex flex-wrap gap-2 text-sm">
      {[
        ['batch', '01 Batch'], ['payments', '02 POS payments'], ['processor', '03 Processor'],
        ['deposits', '04 Deposits'], ['activity', '05 Activity'],
      ].map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-full border px-3 py-1.5 hover:bg-muted">{label}</a>)}
    </nav>

    {story.warnings.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Incomplete evidence</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">{story.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
    </div>}

    <Card id="batch" className="scroll-mt-6">
      <CardHeader><CardTitle>01 / POS batch</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Location" value={story.locationName ?? 'Not recorded'} />
          <Fact label="Business date" value={batch.business_date} />
          <Fact label="Opened" value={date(batch.opened_at)} />
          <Fact label="Closed" value={date(batch.closed_at)} />
          <Fact label="POS transaction count" value={batch.transaction_count ?? 0} />
          <Fact label="POS gross" value={money(batch.gross_amount)} />
          <Fact label="POS tips" value={money(batch.tip_amount)} />
          <Fact label="POS estimated net" value={money(batch.net_deposit)} />
          <Fact label="Origin" value={batch.origin ? title(batch.origin) : 'Not recorded'} />
          <Fact label="Settlement date" value={batch.settlement_date ?? 'Not recorded'} />
          <Fact label="Funded date" value={batch.funded_date ?? 'Not recorded'} />
        </dl>
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">
          <p className="font-semibold">Linked terminal: {terminal?.terminal_name ?? (batch.payment_terminal_id ? 'Record unavailable' : 'Not recorded')}</p>
          <p className="mt-1 text-muted-foreground">
            {terminal?.serial_number ? `Serial ${terminal.serial_number}. ` : ''}
            This is the terminal associated with the batch record, not proof of which physical device initiated settlement.
          </p>
          {terminal?.serial_number && <Link className="mt-2 inline-flex items-center gap-1 text-primary hover:underline" href={`/manage/merchants/${merchantId}/devices/terminal/${encodeURIComponent(terminal.serial_number)}`}>
            Inspect device <ArrowUpRight className="h-3 w-3" />
          </Link>}
        </div>
      </CardContent>
    </Card>

    <Card id="payments" className="scroll-mt-6">
      <CardHeader><CardTitle>02 / Explicitly linked POS payments</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">Only payments with this exact settlement batch UUID are included. Legacy payments without that link may be absent.</p>
        <div className="flex flex-wrap gap-4 rounded-lg bg-muted/40 p-4">
          <Fact label="Linked payments" value={`${payments.length}${ledgerComplete ? '' : ` of ${story.paymentsTotal}`}`} />
          <Fact label="Linked payment total" value={money(paymentSum)} />
          <Fact label="Processor matches recorded" value={story.unavailable.processor ? 'Lookup unavailable' : `${matchedPaymentIds.size} of ${payments.length}`} />
        </div>
        {story.unavailable.payments ? <p className="rounded-lg border border-amber-300 p-4 text-amber-900">POS payment lookup unavailable.</p> : payments.length ? <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[650px] text-left">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Payment ID</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Captured</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Processor</th></tr></thead>
          <tbody>{payments.map((payment) => <tr key={payment.id} className="border-t">
            <td className="px-3 py-2">{payment.orders?.display_number ?? payment.orders?.order_number ?? 'Unknown'}</td>
            <td className="px-3 py-2 font-mono text-xs">{payment.id}</td>
            <td className="px-3 py-2">{payment.status ?? 'Unknown'}</td>
            <td className="px-3 py-2">{date(payment.captured_at ?? payment.initiated_at)}</td>
            <td className="px-3 py-2 text-right">{money(payment.total_amount)}</td>
            <td className="px-3 py-2">{story.unavailable.processor ? 'Lookup unavailable' : matchedPaymentIds.has(payment.id) ? 'Recorded match' : 'Not linked'}</td>
          </tr>)}</tbody>
        </table></div> : <p className="rounded-lg border border-dashed p-4 text-muted-foreground">No explicitly linked POS payments found.</p>}
      </CardContent>
    </Card>

    <Card id="processor" className="scroll-mt-6">
      <CardHeader><CardTitle>03 / Processor evidence</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">These cached processor transactions carry a recorded reconciliation to the POS payments above. Reconciliation can use matching rules and is not independent device proof.</p>
        {story.unavailable.processor ? <p className="rounded-lg border border-amber-300 p-4 text-amber-900">Processor transaction evidence unavailable.</p> : transactions.length ? <div className="space-y-2">{transactions.map((txn) => <div key={txn.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4">
          <Fact label="MID / processor batch" value={`${txn.mid} / ${txn.batch_id}`} />
          <Fact label="Processor transaction" value={<span className="break-all font-mono text-xs">{txn.id}</span>} />
          <Fact label="Processor terminal ID" value={txn.terminal_id ?? 'Not recorded'} />
          <Fact label="Amount / date" value={`${money(txn.amount_dollars)} / ${txn.original_transaction_date}`} />
        </div>)}</div> : <p className="rounded-lg border border-dashed p-4 text-muted-foreground">No recorded processor transaction matches for the explicitly linked payments.</p>}
        <h3 className="font-semibold">Related processor batches</h3>
        {story.unavailable.processorBatches ? <p className="text-amber-900">Processor batch lookup unavailable.</p> : processorBatches.length ? <div className="grid gap-3 sm:grid-cols-2">{processorBatches.map((row) => <div key={`${row.mid}:${row.id}`} className="rounded-lg border p-4">
          <div className="font-semibold">MID {row.mid} / Batch {row.id}</div>
          <p className="mt-1 text-muted-foreground">{row.matchedTransactions} transaction(s) above in this processor batch</p>
          <p className="mt-2">Processor batch total {money(row.batched_amount)}; processor net {money(row.net_deposit)}</p>
          <p className="text-xs text-muted-foreground">These are totals for the entire processor batch, not just this POS batch.</p>
        </div>)}</div> : <p className="text-muted-foreground">No processor batch record linked through a matched transaction.</p>}
      </CardContent>
    </Card>

    <Card id="deposits" className="scroll-mt-6">
      <CardHeader><CardTitle>04 / Deposit records</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">Deposit associations come from processor sync, which may link by MID and settlement date. They are investigation leads, not proof that this POS batch alone funded the bank.</p>
        {story.unavailable.deposits ? <p className="rounded-lg border border-amber-300 p-4 text-amber-900">Deposit lookup unavailable.</p> : deposits.length ? <div className="grid gap-3 sm:grid-cols-2">{deposits.map((deposit) => <div key={`${deposit.mid}:${deposit.id}`} className="rounded-lg border p-4">
          <div className="font-semibold">Reference {deposit.reference_number ?? deposit.id}</div>
          <dl className="mt-3 grid grid-cols-2 gap-3"><Fact label="MID" value={deposit.mid} /><Fact label="Deposit date" value={deposit.deposit_date} /><Fact label="Deposit total" value={money(deposit.net_deposit)} /><Fact label="Matched transactions" value={deposit.matchedTransactions} /></dl>
          <p className="mt-3 text-xs text-muted-foreground">Deposit total can include other processor batches, fees, and adjustments. Verify against the bank statement.</p>
        </div>)}</div> : <p className="rounded-lg border border-dashed p-4 text-muted-foreground">No related deposit record found through the recorded processor links.</p>}
      </CardContent>
    </Card>

    <Card id="activity" className="scroll-mt-6">
      <CardHeader><CardTitle>05 / Settlement activity</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">Events and attempts attached to this batch UUID. An attempt source does not establish the physical initiator.</p>
        {story.unavailable.audit || story.unavailable.attempts ? <p className="rounded-lg border border-amber-300 p-4 text-amber-900">{story.unavailable.audit ? 'Audit activity unavailable. ' : ''}{story.unavailable.attempts ? 'Settlement attempts unavailable.' : ''}</p> : null}
        {audit.length || attempts.length ? <ol className="space-y-2">{[
          ...audit.map((row) => ({ id: row.id, at: row.created_at, label: title(row.action), detail: row.actor_name ?? 'System', status: row.status ?? null })),
          ...attempts.map((row) => ({ id: row.id, at: row.created_at, label: `Attempt: ${title(row.phase)}`, detail: `${row.origin ?? 'Unknown source'} / ${row.initiated_by ?? 'Unknown initiator'}`, status: row.outcome })),
        ].sort((a, b) => b.at.localeCompare(a.at)).map((event) => <li key={event.id} className="flex gap-3 rounded-lg border p-3">
          {event.status === 'failed' ? <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" /> : event.status === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <CircleHelp className="mt-0.5 h-4 w-4 text-muted-foreground" />}
          <div><p className="font-medium">{event.label}</p><p className="text-muted-foreground">{date(event.at)} / {event.detail}{event.status ? ` / ${event.status}` : ''}</p></div>
        </li>)}</ol> : !story.unavailable.audit && !story.unavailable.attempts ? <p className="rounded-lg border border-dashed p-4 text-muted-foreground">No batch-specific audit events or settlement attempts recorded.</p> : null}
        <Link href={`/manage/merchants/${merchantId}?tab=audit&category=settlement`} className="inline-flex items-center gap-1 text-primary hover:underline">Open full settlement audit <ArrowUpRight className="h-3 w-3" /></Link>
      </CardContent>
    </Card>
  </div>
}
