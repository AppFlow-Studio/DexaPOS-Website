'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
    ArrowLeft, CreditCard, Wifi, WifiOff, Clock, AlertTriangle, CheckCircle2,
    XCircle, Loader2, RefreshCw, Activity, Layers, FolderOpen, KeyRound, Cpu,
    Hash, Store, Server, Banknote, PauseCircle, Receipt, Smartphone, Building2,
    ExternalLink,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { cn } from '@/lib/utils'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { getPaymentDeviceDetail } from '@/app/manage/actions/admin-merchant/payment-device-detail'
import type {
    DeviceBatch, DevicePayment, DeviceUnsettledSummary, DeviceIdentity, DeviceWebhookEvent,
} from '@/app/manage/actions/admin-merchant/payment-device-detail'

const fmtUsd = (n: number | null | undefined) =>
    n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const timeAgo = (iso: string | null | undefined) => {
    if (!iso) return '—'
    try { return formatDistanceToNow(new Date(iso), { addSuffix: true }) } catch { return '—' }
}
const dateTime = (iso: string | null | undefined) => {
    if (!iso) return '—'
    try { return format(new Date(iso), 'MMM d, HH:mm:ss') } catch { return '—' }
}
const dateTimeAmPm = (iso: string | null | undefined) => {
    if (!iso) return '—'
    try { return format(new Date(iso), 'MMM d, yyyy h:mm a') } catch { return '—' }
}
const dateOnly = (iso: string | null | undefined) => {
    if (!iso) return '—'
    try { return format(new Date(iso), 'MMM d, yyyy') } catch { return '—' }
}
const batchLabel = (b: DeviceBatch) => {
    const num = b.batch_number || b.batch_id
    return b.acquirer ? `${b.acquirer}-${num}` : num
}

// ─── Webhook payload visualizer ──────────────────────────────────────────────
// Turns a raw Valor webhook payload into a human-readable, receipt-style view
// (KPI tiles + labeled sections) instead of a JSON blob. Valor sends money in
// CENTS, so all *_amount fields are divided by 100 and formatted as USD. Three
// payload shapes are handled by `event`: `batch_summary` (batch totals),
// `transactions` (one payment + card/device/store metadata) and `batch_detail`
// (an array of payments). A "Raw JSON" toggle is kept for byte-exact inspection.

const PAYLOAD_LABELS: Record<string, string> = {
    epi_id: 'EPI ID', rrn: 'RRN', stan_no: 'STAN', txn_id: 'Transaction ID',
    tran_no: 'Tran No.', batch_no: 'Batch No.', batches_id: 'Batch ID', vpid: 'VPID',
    invoice_no: 'Invoice No.', agent_bank_number: 'Agent Bank No.', mcc: 'MCC',
    device_identifier: 'Device ID', pos_entry_mode: 'Entry Mode',
    ecomm_channel_identifier: 'eCommerce Channel', card_holder_name: 'Cardholder',
    card_type: 'Card Type', card_scheme: 'Card Brand', masked_card_no: 'Card Number',
    card_level: 'Card Level', card_category: 'Card Category', issuing_bank: 'Issuing Bank',
    country: 'Country', bin: 'BIN', txn_type: 'Transaction Type', txn_type_code: 'Type Code',
    is_voided: 'Voided', is_reversed: 'Reversed', display_message: 'Display Message',
    trigger_source: 'Trigger Source', timezone: 'Timezone', store_number: 'Store Number',
    approval_code: 'Approval Code', response_code: 'Response Code', host_response: 'Host Response',
    receipt_url: 'Receipt', summary_url: 'Batch Receipt', device_model: 'Device Model',
    device_id: 'Device ID', device_app_version: 'App Version', message_type: 'Message Type',
    store_name: 'Store', merchant_name: 'Merchant', mid: 'MID', store_id: 'Store ID',
    mp_id: 'MP ID', cust_id: 'Customer ID', fee_count: 'Fee Count', tip_count: 'Tip Count',
    amount: 'Amount', net_amount: 'Net Amount', original_amount: 'Original Amount',
    refunded_amount: 'Refunded', purchase_amount: 'Purchase', refund_amount: 'Refund',
    tip_amount: 'Tip', tax_amount: 'Tax', fee_amount: 'Fees', auth_amount: 'Auth Amount',
    void_amount: 'Voids', custom_fee_amount: 'Custom Fee', cashback_amount: 'Cashback',
    city_tax_amount: 'City Tax', state_tax_amount: 'State Tax', reduced_tax_amount: 'Reduced Tax',
    surcharge_fee_amount: 'Surcharge Fee', merchant_fee_amount: 'Merchant Fee',
    total_credit_amount: 'Total Credit', total_debit_amount: 'Total Debit',
    total_other_amount: 'Total Other', cash_refund_amount: 'Cash Refund',
    cash_discount_amount: 'Cash Discount', cash_purchase_amount: 'Cash Purchase',
    cash_withdrawal_amount: 'Cash Withdrawal', gift_add_value_amount: 'Gift Add Value',
    ebt_voucher_amount: 'EBT Voucher', total_ebt_cash_amount: 'Total EBT Cash',
    total_ebt_food_amount: 'Total EBT Food', total_ebt_voucher_amount: 'Total EBT Voucher',
    request_recv_at: 'Request Received', response_sent_at: 'Response Sent',
    settled_at: 'Settled', created_at: 'Created', modified_at: 'Modified',
    batch_opened_at: 'Batch Opened', batch_closed_at: 'Batch Closed',
}

const payloadLabel = (key: string) =>
    PAYLOAD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const isAmountKey = (k: string) => k === 'amount' || k.endsWith('_amount')
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Valor sends money in cents — render as dollars. Accepts number or string. */
const centsToUsd = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—'
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isNaN(n) ? String(v) : usd.format(n / 100)
}

const fmtPayloadDate = (v: unknown): string => {
    if (typeof v !== 'string' || !v) return v == null ? '—' : String(v)
    const d = new Date(v.replace(' ', 'T'))
    return Number.isNaN(d.getTime()) ? v : format(d, 'MMM d, yyyy · h:mm a')
}

/** Format a single leaf value for display, keyed by its field name. */
function fmtField(key: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—'
    const k = key.toLowerCase()
    if (isAmountKey(k)) return centsToUsd(value)
    if (k.endsWith('_at')) return fmtPayloadDate(value)
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (k.startsWith('is_')) return Number(value) ? 'Yes' : 'No'
    return String(value)
}

/** Safe nested read: pick(obj, 'card_metadata', 'issuing_bank'). */
function pick(obj: unknown, ...keys: string[]): unknown {
    let cur: unknown = obj
    for (const key of keys) {
        if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[key]
        else return undefined
    }
    return cur
}

/** Recursively flatten a payload into humanized label/value pairs (skips empties). */
function flattenPayload(value: unknown, prefix = ''): { label: string; value: string }[] {
    const out: { label: string; value: string }[] = []
    if (Array.isArray(value)) {
        value.forEach((item, i) => out.push(...flattenPayload(item, `${prefix} #${i + 1}`.trim())))
    } else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            const label = prefix ? `${prefix} › ${payloadLabel(k)}` : payloadLabel(k)
            if (v && typeof v === 'object') out.push(...flattenPayload(v, label))
            else if (v !== null && v !== undefined && v !== '') out.push({ label, value: fmtField(k, v) })
        }
    }
    return out
}

const isApproved = (code: unknown) => code === '00' || code === 0 || code === '000'

// ── Presentational primitives ────────────────────────────────────────────────
function KpiTile({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'red' | 'blue' }) {
    return (
        <div className="rounded-lg border bg-white px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
            <div className={cn('mt-0.5 text-base font-semibold tabular-nums',
                accent === 'green' ? 'text-emerald-600' : accent === 'red' ? 'text-red-600'
                    : accent === 'blue' ? 'text-blue-600' : 'text-slate-900')}>{value}</div>
        </div>
    )
}

type FieldRow = { label: string; value: ReactNode }
function SectionCard({ title, icon: Icon, rows, children }: { title: string; icon: LucideIcon; rows?: FieldRow[]; children?: ReactNode }) {
    const shown = (rows ?? []).filter((r) => r.value !== '—' && r.value !== '' && r.value != null)
    if (rows && shown.length === 0 && !children) return null
    return (
        <div className="rounded-lg border bg-white">
            <div className="flex items-center gap-1.5 border-b bg-slate-50/70 px-3 py-1.5 text-xs font-semibold text-slate-600">
                <Icon className="h-3.5 w-3.5 text-slate-400" />{title}
            </div>
            <div className="p-3">
                {shown.length > 0 && (
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                        {shown.map((r, i) => (
                            <div key={i} className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-100 pb-1">
                                <dt className="shrink-0 text-xs text-slate-500">{r.label}</dt>
                                <dd className="truncate text-right text-xs font-medium text-slate-800" title={typeof r.value === 'string' ? r.value : undefined}>{r.value}</dd>
                            </div>
                        ))}
                    </dl>
                )}
                {children}
            </div>
        </div>
    )
}

function ReceiptLink({ url, label }: { url: unknown; label: string }) {
    if (typeof url !== 'string' || !url) return null
    return (
        <a href={url} target="_blank" rel="noreferrer"
           className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
            <Receipt className="h-3.5 w-3.5" />{label}<ExternalLink className="h-3 w-3" />
        </a>
    )
}

function AllFieldsBlock({ data }: { data: unknown }) {
    const rows = flattenPayload(data)
    if (rows.length === 0) return null
    return (
        <details className="rounded-lg border bg-white">
            <summary className="cursor-pointer px-3 py-1.5 text-xs font-semibold text-slate-600">All fields ({rows.length})</summary>
            <div className="border-t p-3">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                    {rows.map((r, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-100 pb-0.5">
                            <dt className="shrink-0 text-[11px] text-slate-500">{r.label}</dt>
                            <dd className="truncate text-right text-[11px] text-slate-700" title={r.value}>{r.value}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </details>
    )
}

// ── Event-specific renderers ─────────────────────────────────────────────────
function BatchSummaryView({ d }: { d: Record<string, unknown> }) {
    return (
        <div className="space-y-3">
            <div className="rounded-xl border bg-gradient-to-br from-slate-50 to-white p-4">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Batch #{String(d.batch_no ?? '—')} · {String(d.trigger_source ?? 'Batch')}</div>
                        <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{centsToUsd(d.purchase_amount)}</div>
                        <div className="mt-1 text-xs text-slate-500">Gross sales · closed {fmtPayloadDate(d.batch_closed_at)}</div>
                    </div>
                    <ReceiptLink url={d.summary_url} label="Batch receipt" />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <KpiTile label="Total Credit" value={centsToUsd(d.total_credit_amount)} accent="green" />
                <KpiTile label="Total Debit" value={centsToUsd(d.total_debit_amount)} accent="green" />
                <KpiTile label="Fees" value={centsToUsd(d.fee_amount)} />
                <KpiTile label="Tips" value={centsToUsd(d.tip_amount)} />
                <KpiTile label="Refunds" value={centsToUsd(d.refund_amount)} accent="red" />
                <KpiTile label="Voids" value={centsToUsd(d.void_amount)} accent="red" />
                <KpiTile label="Tax" value={centsToUsd(d.tax_amount)} />
                <KpiTile label="Cashback" value={centsToUsd(d.cashback_amount)} />
            </div>
            <SectionCard title="Batch info" icon={Layers} rows={[
                { label: 'EPI ID', value: fmtField('epi_id', d.epi_id) },
                { label: 'Batch No.', value: fmtField('batch_no', d.batch_no) },
                { label: 'Batch ID', value: fmtField('batches_id', d.batches_id) },
                { label: 'Fee Count', value: fmtField('fee_count', d.fee_count) },
                { label: 'Tip Count', value: fmtField('tip_count', d.tip_count) },
                { label: 'Trigger', value: fmtField('trigger_source', d.trigger_source) },
                { label: 'Opened', value: fmtPayloadDate(d.batch_opened_at) },
                { label: 'Closed', value: fmtPayloadDate(d.batch_closed_at) },
            ]} />
            <AllFieldsBlock data={d} />
        </div>
    )
}

function TransactionView({ d }: { d: Record<string, unknown> }) {
    const approved = isApproved(d.response_code)
    return (
        <div className="space-y-3">
            <div className="rounded-xl border bg-gradient-to-br from-slate-50 to-white p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{String(d.txn_type ?? 'Transaction')} · {String(d.card_scheme ?? d.card_type ?? '')}</div>
                        <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{centsToUsd(d.amount)}</div>
                        <div className="mt-1 text-xs text-slate-500">{String(d.masked_card_no ?? '')} · {String(d.card_holder_name ?? '')}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        {approved
                            ? <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="mr-1 h-3 w-3" />Approved</Badge>
                            : <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">Code {String(d.response_code ?? '—')}</Badge>}
                        <div className="text-[11px] text-slate-400">Net {centsToUsd(d.net_amount)}</div>
                        <ReceiptLink url={d.receipt_url} label="Receipt" />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <KpiTile label="Amount" value={centsToUsd(d.amount)} />
                <KpiTile label="Net" value={centsToUsd(d.net_amount)} accent="green" />
                <KpiTile label="Tip" value={centsToUsd(d.tip_amount)} />
                <KpiTile label="Surcharge" value={centsToUsd(d.surcharge_fee_amount)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SectionCard title="Card" icon={CreditCard} rows={[
                    { label: 'Brand', value: fmtField('card_scheme', d.card_scheme) },
                    { label: 'Type', value: fmtField('card_type', d.card_type) },
                    { label: 'Number', value: fmtField('masked_card_no', d.masked_card_no) },
                    { label: 'Cardholder', value: fmtField('card_holder_name', d.card_holder_name) },
                    { label: 'Issuing Bank', value: fmtField('issuing_bank', pick(d, 'card_metadata', 'issuing_bank')) },
                    { label: 'Country', value: fmtField('country', pick(d, 'card_metadata', 'country')) },
                    { label: 'Level', value: fmtField('card_level', pick(d, 'card_metadata', 'card_level')) },
                    { label: 'Category', value: fmtField('card_category', pick(d, 'card_metadata', 'card_category')) },
                    { label: 'BIN', value: fmtField('bin', pick(d, 'card_metadata', 'bin')) },
                ]} />
                <SectionCard title="Transaction" icon={Hash} rows={[
                    { label: 'Type', value: fmtField('txn_type', d.txn_type) },
                    { label: 'Result', value: approved ? 'Approved (00)' : fmtField('response_code', d.response_code) },
                    { label: 'Approval Code', value: fmtField('approval_code', d.approval_code) },
                    { label: 'RRN', value: fmtField('rrn', d.rrn) },
                    { label: 'Transaction ID', value: fmtField('txn_id', d.txn_id) },
                    { label: 'STAN', value: fmtField('stan_no', d.stan_no) },
                    { label: 'Invoice No.', value: fmtField('invoice_no', d.invoice_no) },
                    { label: 'Batch No.', value: fmtField('batch_no', d.batch_no) },
                    { label: 'Voided', value: fmtField('is_voided', d.is_voided) },
                    { label: 'Reversed', value: fmtField('is_reversed', d.is_reversed) },
                ]} />
                <SectionCard title="Device" icon={Smartphone} rows={[
                    { label: 'Model', value: fmtField('device_model', pick(d, 'device_metadata', 'device_model')) },
                    { label: 'Device ID', value: fmtField('device_id', pick(d, 'device_metadata', 'device_id')) },
                    { label: 'App Version', value: fmtField('device_app_version', d.device_app_version) },
                    { label: 'Entry Mode', value: fmtField('pos_entry_mode', pick(d, 'device_metadata', 'pos_entry_mode')) },
                    { label: 'Host Response', value: fmtField('host_response', pick(d, 'device_metadata', 'host_response')) },
                ]} />
                <SectionCard title="Store" icon={Building2} rows={[
                    { label: 'Store', value: fmtField('store_name', pick(d, 'merchant_store_metadata', 'store_name')) },
                    { label: 'Merchant', value: fmtField('merchant_name', pick(d, 'merchant_store_metadata', 'merchant_name')) },
                    { label: 'MID', value: fmtField('mid', pick(d, 'merchant_store_metadata', 'mid')) },
                    { label: 'Store ID', value: fmtField('store_id', pick(d, 'merchant_store_metadata', 'store_id')) },
                    { label: 'MCC', value: fmtField('mcc', d.mcc) },
                ]} />
            </div>
            <SectionCard title="Timing" icon={Clock} rows={[
                { label: 'Created', value: fmtPayloadDate(d.created_at) },
                { label: 'Settled', value: fmtPayloadDate(d.settled_at) },
                { label: 'Request Received', value: fmtPayloadDate(d.request_recv_at) },
                { label: 'Response Sent', value: fmtPayloadDate(d.response_sent_at) },
                { label: 'Timezone', value: fmtField('timezone', d.timezone) },
            ]} />
            <AllFieldsBlock data={d} />
        </div>
    )
}

function BatchDetailView({ rows }: { rows: Record<string, unknown>[] }) {
    const totalAmount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const totalNet = rows.reduce((s, r) => s + (Number(r.net_amount) || 0), 0)
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border bg-gradient-to-br from-slate-50 to-white px-4 py-3">
                <div className="text-sm font-semibold text-slate-700">{rows.length} transaction{rows.length === 1 ? '' : 's'} in batch #{String(rows[0]?.batch_no ?? '—')}</div>
                <div className="text-right">
                    <div className="text-lg font-bold tabular-nums text-slate-900">{centsToUsd(totalAmount)}</div>
                    <div className="text-[11px] text-slate-400">Net {centsToUsd(totalNet)}</div>
                </div>
            </div>
            <div className="overflow-x-auto rounded-lg border bg-white">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b bg-slate-50/70 text-left text-slate-500">
                            <th className="px-3 py-2 font-medium">Time</th>
                            <th className="px-3 py-2 font-medium">Type</th>
                            <th className="px-3 py-2 font-medium">Card</th>
                            <th className="px-3 py-2 text-right font-medium">Amount</th>
                            <th className="px-3 py-2 text-right font-medium">Net</th>
                            <th className="px-3 py-2 font-medium">Approval</th>
                            <th className="px-3 py-2 font-medium">RRN</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i} className="border-t border-slate-100">
                                <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{fmtPayloadDate(r.created_at)}</td>
                                <td className="px-3 py-1.5">
                                    <Badge variant="outline" className="text-[10px]">{String(r.txn_type ?? '—')}</Badge>
                                    {Number(r.is_voided) ? <span className="ml-1 text-[10px] text-red-600">void</span> : null}
                                </td>
                                <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{String(r.card_scheme ?? r.card_type ?? '—')} {String(r.masked_card_no ?? '').slice(-4)}</td>
                                <td className="px-3 py-1.5 text-right font-medium tabular-nums text-slate-900">{centsToUsd(r.amount)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{centsToUsd(r.net_amount)}</td>
                                <td className="px-3 py-1.5 font-mono text-slate-500">{String(r.approval_code ?? '—')}</td>
                                <td className="px-3 py-1.5 font-mono text-slate-400">{String(r.rrn ?? '—')}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="border-t bg-slate-50/70 font-semibold">
                            <td className="px-3 py-2 text-slate-600" colSpan={3}>Total</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-900">{centsToUsd(totalAmount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{centsToUsd(totalNet)}</td>
                            <td colSpan={2} />
                        </tr>
                    </tfoot>
                </table>
            </div>
            <AllFieldsBlock data={rows} />
        </div>
    )
}

function GenericPayloadView({ data }: { data: unknown }) {
    const rows = flattenPayload(data)
    if (rows.length === 0) return <p className="text-sm text-muted-foreground">Empty payload.</p>
    return (
        <div className="rounded-lg border bg-white p-3">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {rows.map((r, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-100 pb-1">
                        <dt className="shrink-0 text-xs text-slate-500">{r.label}</dt>
                        <dd className="truncate text-right text-xs font-medium text-slate-800" title={r.value}>{r.value}</dd>
                    </div>
                ))}
            </dl>
        </div>
    )
}

/** Dispatch on the payload's `event` field. */
function PayloadBody({ payload }: { payload: Record<string, unknown> }) {
    const event = typeof payload.event === 'string' ? payload.event : ''
    const data = 'data' in payload ? payload.data : payload
    if (event === 'batch_summary' && data && typeof data === 'object' && !Array.isArray(data))
        return <BatchSummaryView d={data as Record<string, unknown>} />
    if (event === 'transactions' && data && typeof data === 'object' && !Array.isArray(data))
        return <TransactionView d={data as Record<string, unknown>} />
    if (event === 'batch_detail' && Array.isArray(data))
        return <BatchDetailView rows={data as Record<string, unknown>[]} />
    return <GenericPayloadView data={data} />
}

const EVENT_LABELS: Record<string, string> = {
    batch_summary: 'Batch Summary', transactions: 'Transaction', batch_detail: 'Batch Detail',
}

function WebhookPayloadDialog({ e }: { e: DeviceWebhookEvent }) {
    const [showRaw, setShowRaw] = useState(false)
    const payload = e.raw_payload as Record<string, unknown>
    const event = typeof payload.event === 'string' ? payload.event : ''
    const title = EVENT_LABELS[event] ?? 'Webhook Payload'
    return (
        <Dialog>
            <DialogTrigger asChild>
                <button type="button" className="text-xs font-medium text-blue-600 hover:underline">View</button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
                <DialogHeader className="border-b px-5 py-3">
                    <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                        {title}
                        {event && <Badge variant="outline" className="font-mono text-[10px]">{event}</Badge>}
                        {e.batch_no && <span className="text-xs font-normal text-slate-400">Batch #{e.batch_no}</span>}
                    </DialogTitle>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span>Received {dateTimeAmPm(e.received_at)}</span>
                        <span>·</span><span>{e.outcome}</span>
                        {e.http_status != null && <><span>·</span><span>HTTP {e.http_status}</span></>}
                        <button type="button" onClick={() => setShowRaw((v) => !v)}
                            className="ml-auto text-blue-600 hover:underline">{showRaw ? 'Formatted view' : 'Raw JSON'}</button>
                    </div>
                </DialogHeader>
                <div className="max-h-[70vh] overflow-y-auto bg-slate-50/50 px-5 py-4">
                    {showRaw
                        ? <pre className="overflow-auto rounded-lg border bg-white p-3 text-[11px] leading-relaxed">{JSON.stringify(payload, null, 2)}</pre>
                        : <PayloadBody payload={payload} />}
                </div>
            </DialogContent>
        </Dialog>
    )
}

function ConnectionBadge({ state }: { state: string }) {
    if (state === 'online') return <Badge className="bg-green-600 hover:bg-green-600"><Wifi className="h-3 w-3 mr-1" />Online</Badge>
    if (state === 'stale') return <Badge className="bg-amber-500 hover:bg-amber-500"><Clock className="h-3 w-3 mr-1" />Stale</Badge>
    if (state === 'offline') return <Badge variant="secondary"><WifiOff className="h-3 w-3 mr-1" />Offline</Badge>
    return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Unknown</Badge>
}

function statusBadge(status: string) {
    const s = status?.toLowerCase()
    // Matches the /settlements palette: open=amber, closed=blue, submitted=purple,
    // settled=emerald, funded=green.
    if (s === 'funded')
        return <Badge variant="outline" className="border-green-300 bg-green-100 text-green-800">funded</Badge>
    if (s === 'settled')
        return <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800">settled</Badge>
    if (s === 'submitted')
        return <Badge variant="outline" className="border-purple-300 bg-purple-100 text-purple-800">submitted</Badge>
    if (s === 'closed')
        return <Badge variant="outline" className="border-blue-300 bg-blue-100 text-blue-800">closed</Badge>
    if (s === 'open')
        return <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800">open</Badge>
    if (s === 'needs_review')
        return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">needs review</Badge>
    if (s === 'failed' || s === 'partial_failure' || s === 'terminal_unavailable')
        return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">{status}</Badge>
    if (s === 'pending' || s === 'settling')
        return <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">{status}</Badge>
    return <Badge variant="outline">{status}</Badge>
}

function originBadge(origin: string | null) {
    if (origin === 'valor_webhook') return <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">Auto · Webhook</Badge>
    if (origin === 'pos_auto') return <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">Auto</Badge>
    if (origin === 'hq_manual') return <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600">Manual · HQ</Badge>
    if (origin === 'pos_manual') return <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600">Manual</Badge>
    return <span className="text-muted-foreground">—</span>
}

function eventOutcomeBadge(outcome: string) {
    switch (outcome) {
        case 'processed': return <Badge className="bg-green-600 hover:bg-green-600">processed</Badge>
        case 'needs_review': return <Badge className="bg-amber-500 hover:bg-amber-500">needs review</Badge>
        case 'dead_letter': return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">dead-letter</Badge>
        case 'invalid_signature': return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">invalid sig</Badge>
        case 'error': return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">error</Badge>
        case 'ignored': return <Badge variant="secondary">ignored</Badge>
        case 'validation': return <Badge variant="outline">validation</Badge>
        default: return <Badge variant="outline">{outcome}</Badge>
    }
}

function attemptOutcomeBadge(outcome: string) {
    switch (outcome) {
        case 'success': return <Badge className="bg-green-600 hover:bg-green-600">success</Badge>
        case 'failed': return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">failed</Badge>
        case 'timeout': return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">timeout</Badge>
        case 'blocked': return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">blocked</Badge>
        case 'started': return <Badge variant="secondary">started</Badge>
        default: return <Badge variant="outline">{outcome}</Badge>
    }
}

// Real brand artwork per terminal type (dropped into public/)
const BRAND_LOGO: Record<string, string> = {
    valor: '/valorlogo.jpg',
    castles: '/castles.jpg',
    dejavoo: '/dejavoo.png',
}

type BrandTheme = {
    label: string
    heroGradient: string
    glow: string
    modelChip: string
}

function brandTheme(type: string): BrandTheme {
    switch (type) {
        case 'valor':
            return {
                label: 'Valor',
                heroGradient: 'from-slate-900 via-slate-900 to-blue-950',
                glow: 'bg-blue-500/30',
                modelChip: 'border-blue-400/30 bg-blue-500/10 text-blue-100',
            }
        case 'castles':
            return {
                label: 'Castles',
                heroGradient: 'from-slate-900 via-slate-900 to-red-950',
                glow: 'bg-red-500/30',
                modelChip: 'border-red-400/30 bg-red-500/10 text-red-100',
            }
        case 'dejavoo':
            return {
                label: 'Dejavoo',
                heroGradient: 'from-slate-900 via-slate-900 to-purple-950',
                glow: 'bg-purple-500/30',
                modelChip: 'border-purple-400/30 bg-purple-500/10 text-purple-100',
            }
        default:
            return {
                label: type,
                heroGradient: 'from-slate-900 via-slate-900 to-slate-800',
                glow: 'bg-slate-500/30',
                modelChip: 'border-slate-400/30 bg-slate-500/10 text-slate-100',
            }
    }
}

// Stylized payment terminal showing the real brand logo on its "screen"
function TerminalShowcase({
    logo, label, model, theme,
}: { logo?: string; label: string; model?: string | null; theme: BrandTheme }) {
    return (
        <div className="relative mx-auto w-44 shrink-0 sm:mx-0">
            <div className={`pointer-events-none absolute inset-3 rounded-full ${theme.glow} blur-2xl`} />
            <div className="relative rounded-[2rem] bg-gradient-to-b from-slate-600/90 to-slate-950 p-3 shadow-2xl ring-1 ring-white/10">
                <div className="rounded-[1.5rem] bg-slate-950/40 p-2">
                    {/* screen */}
                    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-white shadow-inner">
                        {logo ? (
                            <Image src={logo} alt={`${label} terminal`} fill sizes="176px" className="object-contain p-3" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center">
                                <CreditCard className="h-16 w-16 text-slate-300" />
                            </div>
                        )}
                    </div>
                    {/* keypad hint */}
                    <div className="mx-auto mt-3 grid w-4/5 grid-cols-3 gap-1.5 pb-1">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-1.5 rounded-full bg-white/15" />
                        ))}
                    </div>
                </div>
            </div>
            {model && (
                <div className="mt-3 flex justify-center">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest ${theme.modelChip}`}>
                        {model}
                    </span>
                </div>
            )}
        </div>
    )
}

function HeroStat({
    icon: Icon, label, value, warn, mono,
}: { icon: LucideIcon; label: string; value: string; warn?: boolean; mono?: boolean }) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur-sm">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <Icon className="h-3 w-3" />{label}
            </p>
            <p className={`mt-1 truncate text-sm font-semibold ${warn ? 'text-amber-300' : 'text-white'} ${mono ? 'font-mono' : ''}`} title={value}>
                {value}
            </p>
        </div>
    )
}

function DetailTile({
    icon: Icon, label, children,
}: { icon: LucideIcon; label: string; children: ReactNode }) {
    return (
        <div className="flex items-start gap-3 rounded-xl border bg-white p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">{children}</div>
            </div>
        </div>
    )
}

// Prominent callout for the money/state that silently vanishes when a terminal
// is deactivated or swapped — captured-but-unsettled payments + review-needed batches.
function AttentionBanner({ device, unsettled }: { device: DeviceIdentity; unsettled: DeviceUnsettledSummary }) {
    const inactive = !device.is_active
    const hasUnsettled = unsettled.count > 0
    const needsReview = unsettled.needs_review_batches > 0
    if (!inactive && !hasUnsettled && !needsReview) return null

    const critical = inactive && hasUnsettled
    const tone = critical ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
    const iconTone = critical ? 'text-red-600' : 'text-amber-600'

    return (
        <div className={`mb-6 rounded-2xl border p-4 sm:p-5 ${tone}`}>
            <div className="flex items-start gap-3">
                <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} />
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-900">
                        {critical
                            ? 'Deactivated terminal is still holding unsettled money'
                            : inactive
                                ? 'This terminal is deactivated'
                                : 'Unsettled activity on this terminal'}
                    </h3>
                    <p className="mt-0.5 text-sm text-slate-600">
                        {inactive
                            ? 'It no longer appears in the “Unique Terminals” panel or auto-settle, but its captured payments still need to be settled or reconciled.'
                            : 'Captured payments are waiting to be settled into a closed batch.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {inactive && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700">
                                <PauseCircle className="h-3.5 w-3.5" /> Deactivated
                            </span>
                        )}
                        {hasUnsettled && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                                <Banknote className="h-3.5 w-3.5" /> {fmtUsd(unsettled.total)} unsettled · {unsettled.count} payment{unsettled.count === 1 ? '' : 's'}
                            </span>
                        )}
                        {unsettled.oldest_captured_at && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                                <Clock className="h-3.5 w-3.5" /> oldest {timeAgo(unsettled.oldest_captured_at)}
                            </span>
                        )}
                        {needsReview && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800">
                                <AlertTriangle className="h-3.5 w-3.5" /> {unsettled.needs_review_batches} batch{unsettled.needs_review_batches === 1 ? '' : 'es'} need review
                            </span>
                        )}
                        {unsettled.open_batches > 0 && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                                <FolderOpen className="h-3.5 w-3.5" /> {unsettled.open_batches} open batch{unsettled.open_batches === 1 ? '' : 'es'}
                            </span>
                        )}
                    </div>
                    {unsettled.truncated && (
                        <p className="mt-2 text-[11px] text-slate-500">Showing the latest 100 payments; older unsettled items may exist.</p>
                    )}
                </div>
            </div>
        </div>
    )
}

function BatchKpi({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'warn' }) {
    const valueTone = tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-emerald-700' : 'text-slate-900'
    return (
        <div className="rounded-xl border bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 text-lg font-bold ${valueTone}`}>{value}</p>
        </div>
    )
}

function BatchStat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <div className="mt-0.5 text-sm font-semibold text-slate-900">{children}</div>
            {sub != null && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        </div>
    )
}

function cardCell(p: DevicePayment) {
    if (!p.card_type && !p.card_last_four) return <span className="text-muted-foreground">—</span>
    return (
        <span className="inline-flex items-center gap-1.5 text-sm">
            <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="capitalize">{p.card_type || 'card'}</span>
            {p.card_last_four && <span className="font-mono text-muted-foreground">•{p.card_last_four}</span>}
        </span>
    )
}

function settledCell(p: DevicePayment) {
    return p.is_settled
        ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />settled</span>
        : <span className="inline-flex items-center gap-1 text-amber-700"><XCircle className="h-3.5 w-3.5" />unsettled</span>
}

// Settlements-grade batch table: sticky-header list (matches the /settlements
// Batch Reconciliation table) with a click-to-select linked-payments panel.
function BatchesTab({ batches, payments }: { batches: DeviceBatch[]; payments: DevicePayment[] }) {
    const [selectedId, setSelectedId] = useState<string | null>(null)

    // Same association rule as the action / the /settlements RPC: prefer an
    // explicit settlement_batch_id, else fall back to matching host batch_number.
    const batchIdSet = new Set(batches.map((b) => b.id))
    const latestByNumber = new Map<string, string>()
    for (const b of batches) {
        if (b.batch_number && !latestByNumber.has(b.batch_number)) latestByNumber.set(b.batch_number, b.id)
    }
    const resolveBatchId = (p: DevicePayment): string | null => {
        if (p.settlement_batch_id && batchIdSet.has(p.settlement_batch_id)) return p.settlement_batch_id
        if (p.batch_number && latestByNumber.has(p.batch_number)) return latestByNumber.get(p.batch_number) ?? null
        return null
    }

    const selected = batches.find((b) => b.id === selectedId) || null
    const linked = selected ? payments.filter((p) => resolveBatchId(p) === selected.id) : []
    const selectedFees = selected
        ? (selected.interchange_fees ?? 0) + (selected.assessment_fees ?? 0) + (selected.processor_fees ?? 0)
        : 0

    const gross = batches.reduce((s, b) => s + (b.gross_amount ?? 0), 0)
    const net = batches.reduce((s, b) => s + (b.net_deposit ?? 0), 0)
    const discrepancies = batches.filter((b) => b.has_discrepancy).length

    if (batches.length === 0) {
        return <div className="rounded-lg border bg-white py-10 text-center text-sm text-muted-foreground">No batches for this terminal</div>
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <BatchKpi label="Batches" value={batches.length} />
                <BatchKpi label="Gross processed" value={fmtUsd(gross)} />
                <BatchKpi label="Net deposit" value={fmtUsd(net)} tone="good" />
                <BatchKpi label="Discrepancies" value={discrepancies} tone={discrepancies > 0 ? 'warn' : undefined} />
            </div>

            <Table containerClassName="max-h-[46vh] overflow-auto rounded-lg border bg-white">
                <TableHeader className="sticky top-0 z-20 bg-card">
                    <TableRow>
                        <TableHead>Batch</TableHead>
                        <TableHead>Business date</TableHead>
                        <TableHead>Opened</TableHead>
                        <TableHead>Closed</TableHead>
                        <TableHead className="text-right">Txns</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Tip</TableHead>
                        <TableHead className="text-right">Refund</TableHead>
                        <TableHead className="text-right">Net deposit</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Discrepancy</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {batches.map((b) => (
                        <TableRow
                            key={b.id}
                            className={`cursor-pointer ${selectedId === b.id ? 'bg-muted/40' : ''}`}
                            onClick={() => setSelectedId((cur) => (cur === b.id ? null : b.id))}
                        >
                            <TableCell className="font-mono text-xs">{batchLabel(b)}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">{dateOnly(b.business_date)}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dateTimeAmPm(b.opened_at)}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dateTimeAmPm(b.closed_at)}</TableCell>
                            <TableCell className="text-right font-mono">{(b.transaction_count ?? 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">{fmtUsd(b.gross_amount)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtUsd(b.tip_amount)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtUsd(b.refund_amount)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtUsd(b.net_deposit)}</TableCell>
                            <TableCell>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {statusBadge(b.status)}
                                    {originBadge(b.origin)}
                                </div>
                            </TableCell>
                            <TableCell className="text-right">
                                {b.has_discrepancy ? (
                                    <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800">
                                        <AlertTriangle className="mr-1 h-3 w-3" />{fmtUsd(b.discrepancy_amount)}
                                    </Badge>
                                ) : b.discrepancy_amount != null ? (
                                    <Badge variant="outline" className="border-green-300 bg-green-100 text-green-800">Matched</Badge>
                                ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {selected && (
                <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="font-medium">Selected batch:</span>
                        <Badge variant="outline" className="font-mono text-xs">{batchLabel(selected)}</Badge>
                        {statusBadge(selected.status)}
                        {originBadge(selected.origin)}
                        <span className="ml-2 text-muted-foreground">Linked payments:</span>
                        <span className="font-medium">{linked.length.toLocaleString()}</span>
                        <span className="text-muted-foreground">Linked amount:</span>
                        <span className="font-medium">{fmtUsd(selected.linked_payment_amount)}</span>
                        <span className="text-muted-foreground">Batch gross:</span>
                        <span className="font-medium">{fmtUsd(selected.gross_amount)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <BatchStat label="Transactions" sub={`${selected.sales_count ?? 0} sales · ${selected.refund_count ?? 0} refunds · ${selected.void_count ?? 0} voids`}>
                            {selected.transaction_count ?? 0}
                        </BatchStat>
                        <BatchStat label="Tips">{fmtUsd(selected.tip_amount)}</BatchStat>
                        <BatchStat label="Fees" sub={selectedFees > 0 ? `IC ${fmtUsd(selected.interchange_fees)} · AS ${fmtUsd(selected.assessment_fees)} · PR ${fmtUsd(selected.processor_fees)}` : undefined}>
                            {selectedFees > 0 ? fmtUsd(selectedFees) : '—'}
                        </BatchStat>
                        <BatchStat label="Net deposit">{fmtUsd(selected.net_deposit)}</BatchStat>
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                        <span>Opened: <span className="text-slate-700">{dateTimeAmPm(selected.opened_at)}</span></span>
                        <span>Closed: <span className="text-slate-700">{dateTimeAmPm(selected.closed_at)}</span></span>
                        <span>Settled: <span className="text-slate-700">{dateOnly(selected.settlement_date)}</span></span>
                        <span>Funded: <span className="text-slate-700">{dateOnly(selected.funded_date)}</span></span>
                        {selected.last_attempt_at && <span>Last attempt: <span className="text-slate-700">{dateTimeAmPm(selected.last_attempt_at)}</span></span>}
                    </div>

                    {selected.has_discrepancy && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            Batch gross {fmtUsd(selected.gross_amount)} vs {fmtUsd(selected.linked_payment_amount)} across {linked.length} linked payment{linked.length === 1 ? '' : 's'} on this terminal — {fmtUsd(selected.discrepancy_amount)} unaccounted.
                        </div>
                    )}
                    {selected.failure_reason && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{selected.failure_reason}</div>
                    )}

                    <Table containerClassName="max-h-[32vh] overflow-auto rounded-md border bg-white">
                        <TableHeader className="sticky top-0 z-20 bg-card">
                            <TableRow>
                                <TableHead>Card</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Tip</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Settled</TableHead>
                                <TableHead>Captured</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {linked.length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">No payments linked to this batch.</TableCell></TableRow>
                            ) : linked.map((p) => (
                                <TableRow key={p.id}>
                                    <TableCell>{cardCell(p)}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{p.payment_method || '—'}</TableCell>
                                    <TableCell className="text-right font-mono">{fmtUsd(p.amount)}</TableCell>
                                    <TableCell className="text-right font-mono text-muted-foreground">{fmtUsd(p.tip_amount)}</TableCell>
                                    <TableCell className="text-right font-mono font-medium">{fmtUsd(p.total_amount ?? p.amount)}</TableCell>
                                    <TableCell className="text-sm">{p.status}</TableCell>
                                    <TableCell>{settledCell(p)}</TableCell>
                                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dateTimeAmPm(p.captured_at ?? p.initiated_at)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    )
}

export function PaymentDeviceDetailView({ merchantId, serial }: { merchantId: string; serial: string }) {
    const { data: result, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['admin', 'payment-device-detail', merchantId, serial],
        queryFn: () => getPaymentDeviceDetail(merchantId, serial),
        enabled: !!merchantId && !!serial,
        staleTime: 30_000,
        refetchInterval: 60_000,
    })

    if (isLoading) {
        return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    }

    if (!result?.success || !result.data) {
        return (
            <div className="mx-auto max-w-3xl px-6 py-16 text-center">
                <CreditCard className="mx-auto h-10 w-10 text-muted-foreground" />
                <h2 className="mt-4 text-lg font-semibold">Device not found</h2>
                <p className="mt-1 text-sm text-muted-foreground">{result?.error || `No terminal with serial ${serial} for this merchant.`}</p>
                <Link href={`/manage/merchants/${merchantId}?tab=devices`} className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                    <ArrowLeft className="h-4 w-4" /> Back to devices
                </Link>
            </div>
        )
    }

    const { device: d, siblings, unsettled, batches, payments, attempts, webhookEvents, audit } = result.data
    const isValor = d.terminal_type === 'valor'
    const theme = brandTheme(d.terminal_type)
    const logo = BRAND_LOGO[d.terminal_type]

    return (
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between gap-3">
                <Link href={`/manage/merchants/${merchantId}?tab=devices`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" /> Devices
                </Link>
                <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                    <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
                </button>
            </div>

            {/* Hero */}
            <div className={`relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br ${theme.heroGradient} p-6 ring-1 ring-white/10 sm:p-8`}>
                <div className={`pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full ${theme.glow} blur-3xl`} />
                <div className={`pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full ${theme.glow} blur-3xl`} />

                <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
                    <TerminalShowcase logo={logo} label={theme.label} model={d.terminal_model} theme={theme} />

                    <div className="min-w-0 flex-1 text-center sm:text-left">
                        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                            <Badge variant="outline" className="border-white/20 bg-white/10 text-white">{theme.label}</Badge>
                            <ConnectionBadge state={d.connection_state} />
                            {!d.is_active && <Badge variant="destructive">Inactive</Badge>}
                            {d.auto_settle && (
                                <Badge className="border border-white/20 bg-white/10 text-white hover:bg-white/10">
                                    <Clock className="mr-1 h-3 w-3" />Auto-settle {(d.settle_time || '').slice(0, 5) || 'on'}
                                </Badge>
                            )}
                        </div>
                        <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">{d.terminal_name}</h1>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-sm text-slate-300 sm:justify-start">
                            <span className="inline-flex items-center gap-1.5 font-mono">
                                <Hash className="h-3.5 w-3.5 opacity-60" />{d.serial_number || 'No serial'}
                            </span>
                            {d.location_name && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Store className="h-3.5 w-3.5 opacity-60" />{d.location_name}
                                </span>
                            )}
                            {d.station_name && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Server className="h-3.5 w-3.5 opacity-60" />{d.station_name}
                                </span>
                            )}
                        </div>
                        {siblings > 0 && (
                            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-200 ring-1 ring-amber-400/30">
                                <AlertTriangle className="h-3.5 w-3.5" /> {siblings} other terminal{siblings > 1 ? 's' : ''} share this serial at this merchant.
                            </p>
                        )}

                        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <HeroStat icon={Activity} label="Last txn" value={timeAgo(d.last_transaction_at)} />
                            <HeroStat icon={Layers} label="Last batch" value={timeAgo(d.last_batch_at)} />
                            <HeroStat icon={FolderOpen} label="Open batches" value={String(d.open_batch_count ?? 0)} />
                            <HeroStat icon={AlertTriangle} label="Fails" value={String(d.consecutive_failures ?? 0)} warn={(d.consecutive_failures ?? 0) > 0} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Details */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <DetailTile icon={Clock} label="Auto-Settle">
                    {d.auto_settle
                        ? <span className="text-blue-600">{(d.settle_time || '').slice(0, 5) || 'On'}</span>
                        : <span className="text-muted-foreground">Off</span>}
                </DetailTile>
                <DetailTile icon={Wifi} label="Last connection test">{timeAgo(d.last_connection_test_at)}</DetailTile>
                <DetailTile icon={Cpu} label="Model">{d.terminal_model || '—'}</DetailTile>
                {isValor && (
                    <DetailTile icon={KeyRound} label="Valor EPI">
                        <span className="font-mono">{d.valor_epi || <span className="text-amber-600">not set</span>}</span>
                    </DetailTile>
                )}
            </div>

            {/* Unsettled / deactivated attention banner */}
            <AttentionBanner device={d} unsettled={unsettled} />

            <Tabs defaultValue="batches">
                <TabsList className="flex-wrap bg-slate-100">
                    <TabsTrigger value="batches">Batches ({batches.length})</TabsTrigger>
                    <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
                    <TabsTrigger value="attempts">Attempts ({attempts.length})</TabsTrigger>
                    {isValor && <TabsTrigger value="webhook">Webhook log ({webhookEvents.length})</TabsTrigger>}
                    <TabsTrigger value="activity">Activity ({audit.length})</TabsTrigger>
                </TabsList>

                {/* BATCHES */}
                <TabsContent value="batches" className="mt-4">
                    <BatchesTab batches={batches} payments={payments} />
                </TabsContent>

                {/* PAYMENTS */}
                <TabsContent value="payments" className="mt-4">
                    {unsettled.count > 0 && (
                        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            <Banknote className="h-4 w-4" />
                            <span><span className="font-semibold">{fmtUsd(unsettled.total)}</span> across {unsettled.count} captured payment{unsettled.count === 1 ? '' : 's'} not yet settled.</span>
                        </div>
                    )}
                    <div className="overflow-x-auto rounded-lg border bg-white">
                        <Table>
                            <TableHeader><TableRow>
                                <TableHead>Card</TableHead><TableHead>Method</TableHead>
                                <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Tip</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>Status</TableHead><TableHead>Settled</TableHead><TableHead>Batch #</TableHead>
                                <TableHead>Captured</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {payments.length === 0 ? (
                                    <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No payments</TableCell></TableRow>
                                ) : payments.map((p) => (
                                    <TableRow key={p.id}>
                                        <TableCell>{cardCell(p)}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{p.payment_method || '—'}</TableCell>
                                        <TableCell className="text-right">{fmtUsd(p.amount)}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">{fmtUsd(p.tip_amount)}</TableCell>
                                        <TableCell className="text-right font-medium">{fmtUsd(p.total_amount ?? p.amount)}</TableCell>
                                        <TableCell><span className="text-sm">{p.status}</span></TableCell>
                                        <TableCell>{settledCell(p)}</TableCell>
                                        <TableCell><span className="font-mono text-xs">{p.batch_number || '—'}</span></TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{timeAgo(p.captured_at ?? p.initiated_at)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                {/* ATTEMPTS */}
                <TabsContent value="attempts" className="mt-4">
                    <div className="overflow-x-auto rounded-lg border bg-white">
                        <Table>
                            <TableHeader><TableRow>
                                <TableHead>When</TableHead><TableHead>Phase</TableHead><TableHead>Outcome</TableHead>
                                <TableHead>Origin</TableHead><TableHead>Detail</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {attempts.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No settlement attempts logged (the POS tablet logs these per phase)</TableCell></TableRow>
                                ) : attempts.map((a) => (
                                    <TableRow key={a.id}>
                                        <TableCell className="text-sm text-muted-foreground" title={a.created_at}>{dateTime(a.created_at)}</TableCell>
                                        <TableCell><Badge variant="outline">{a.phase}</Badge></TableCell>
                                        <TableCell>{attemptOutcomeBadge(a.outcome)}</TableCell>
                                        <TableCell>{originBadge(a.origin)}</TableCell>
                                        <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground" title={a.detail || ''}>{a.detail || '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                {/* WEBHOOK LOG (visualizer) */}
                {isValor && (
                    <TabsContent value="webhook" className="mt-4">
                        <div className="overflow-x-auto rounded-lg border bg-white">
                            <Table>
                                <TableHeader><TableRow>
                                    <TableHead>Received</TableHead><TableHead>Outcome</TableHead><TableHead>Sig</TableHead>
                                    <TableHead className="text-right">HTTP</TableHead><TableHead>Batch #</TableHead>
                                    <TableHead className="text-right">Latency</TableHead><TableHead>Payload</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {webhookEvents.length === 0 ? (
                                        <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No webhook events yet</TableCell></TableRow>
                                    ) : webhookEvents.map((e) => (
                                        <TableRow key={e.id}>
                                            <TableCell className="text-sm text-muted-foreground" title={e.received_at}>{dateTime(e.received_at)}</TableCell>
                                            <TableCell>{eventOutcomeBadge(e.outcome)}{e.detail && <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-muted-foreground" title={e.detail}>{e.detail}</p>}</TableCell>
                                            <TableCell>{e.verified
                                                ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                                : <AlertTriangle className="h-4 w-4 text-amber-600" />}</TableCell>
                                            <TableCell className="text-right"><span className={e.http_status && e.http_status >= 400 ? 'text-red-600' : ''}>{e.http_status ?? '—'}</span></TableCell>
                                            <TableCell><span className="font-mono text-xs">{e.batch_no || '—'}</span></TableCell>
                                            <TableCell className="text-right text-muted-foreground">{e.latency_ms != null ? `${e.latency_ms}ms` : '—'}</TableCell>
                                            <TableCell>
                                                {e.raw_payload
                                                    ? <WebhookPayloadDialog e={e} />
                                                    : <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>
                )}

                {/* ACTIVITY / AUDIT */}
                <TabsContent value="activity" className="mt-4">
                    <div className="overflow-x-auto rounded-lg border bg-white">
                        <Table>
                            <TableHeader><TableRow>
                                <TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Severity</TableHead>
                                <TableHead>Actor</TableHead><TableHead>Detail</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {audit.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No activity</TableCell></TableRow>
                                ) : audit.map((a) => (
                                    <TableRow key={a.id}>
                                        <TableCell className="text-sm text-muted-foreground" title={a.created_at}>{dateTime(a.created_at)}</TableCell>
                                        <TableCell><span className="text-sm font-medium">{a.action}</span></TableCell>
                                        <TableCell>{a.severity === 'warning'
                                            ? <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">warning</Badge>
                                            : <Badge variant="outline">{a.severity || 'info'}</Badge>}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{a.actor_role || '—'}</TableCell>
                                        <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground" title={typeof a.metadata?.reason === 'string' ? a.metadata.reason : ''}>
                                            {typeof a.metadata?.reason === 'string' ? a.metadata.reason : (a.action_category || '—')}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
