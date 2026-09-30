import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PlatformTransactionDetails } from '@/app/manage/actions/hq-platform/transactions'
import { buildPaymentActivity } from '../payment-format'
import { PaymentActivitySection, PaymentOrderSection, PaymentTerminalSection } from '../PaymentDetailSections'

// A refunded single-card contactless payment, as recorded on staging.
const detail = {
    id: 'pay-1',
    order_id: 'order-1',
    order_number: 'ORD-20260929-S10-0011',
    merchant_id: 'm-1',
    merchant_name: 'Joes Coffee Shop',
    location_name: 'Uptown Branch',
    payment_method: 'card',
    status: 'refunded',
    amount: 0.01,
    tip_amount: 0,
    total_amount: 0.01,
    order_subtotal: 0.01,
    order_tax_amount: 0,
    order_tip_amount: 0,
    order_discount_amount: 0,
    order_service_charge: 0,
    order_total_amount: 0.01,
    terminal_type: 'codepay',
    terminal_id: '3690d833-cb72-4d4c-b592-1a451db29327',
    processor_response: { serial_number: 'WTYG002534000956' },
    is_voided: true,
    void_reason: 'Refunded: Customer request',
    voided_by: 'd21b9332-5043-4f33-81a6-b8cc898edd32',
    voided_at: '2026-09-29T19:34:00Z',
    is_returned: true,
    return_amount: 0.01,
    return_reason: 'Customer request',
    returned_at: '2026-09-29T19:34:00Z',
    refunded_amount: 0.01,
    refunded_at: '2026-09-29T19:34:00Z',
    created_at: '2026-09-29T19:33:00Z',
    initiated_at: '2026-09-29T19:33:00Z',
    captured_at: '2026-09-29T19:33:10Z',
    items: [],
    paid_items: [{ id: 'pi-1', item_name: 'Jj', quantity_paid: 1, unit_price_paid: 0.01, subtotal_paid: 0.01, tax_paid: 0 }],
    order_items_full: [
        {
            id: 'oi-1',
            item_name: 'Jj',
            quantity: 1,
            unit_price: 0.01,
            subtotal: 0.01,
            tax: 0,
            is_voided: true,
            void_reason: 'Refunded: Customer request',
            is_open_item: false,
            is_tax_exempt: false,
            modifiers: [],
        },
    ],
    order_discounts: [],
    payment_events: [
        {
            id: 'ev-1',
            event_type: 'captured',
            new_status: 'captured',
            timestamp: '2026-09-29T19:33:10Z',
            result_code: '00',
            response_message: 'Card payment captured successfully',
            raw_response: { ok: true },
        },
    ],
    payment_segments: [{ id: 'pay-1', payment_method: 'card', status: 'refunded', amount: 0.01, tip_amount: 0, total_amount: 0.01, is_voided: true }],
} as PlatformTransactionDetails

const noop = () => undefined
describe('payment detail sections', () => {
    it('says a POS refund once, naming who did it', () => {
        const html = renderToStaticMarkup(
            <PaymentActivitySection
                entries={buildPaymentActivity({ ...detail, staff_names: { [detail.voided_by!]: 'Temur Bek' } })}
                isLoading={false}
            />
        )
        for (const label of ['Initiated', 'Captured', 'Refunded']) expect(html).toContain(label)
        expect(html).not.toContain('>Voided<')
        expect(html).not.toContain('>Returned<')
        expect(html).toContain('Also recorded as a return and a void')
        expect(html).toContain('Temur Bek')
        expect(html).not.toContain('Tip adjusted')
    })

    it('shortens an unresolved staff id', () => {
        const html = renderToStaticMarkup(<PaymentActivitySection entries={buildPaymentActivity(detail)} isLoading={false} />)
        expect(html).toContain('d21b9332…')
    })

    it('shows the order once, without a split breakdown for a single payment', () => {
        const html = renderToStaticMarkup(
            <PaymentOrderSection paymentId="pay-1" detail={detail} isLoading={false} onRetry={noop} />
        )
        expect(html).toContain('Voided — Refunded: Customer request')
        expect(html).toContain('Order total')
        expect(html).not.toContain('Split across')
        expect(html).not.toContain('Items this payment covered')
        // A zero discount or service charge is not a line on the receipt.
        expect(html).not.toContain('Service charge')
    })

    it('drops unrecorded terminal facts and folds empty groups into one sentence', () => {
        const html = renderToStaticMarkup(<PaymentTerminalSection detail={detail} isLoading={false} onRetry={noop} />)
        expect(html).toContain('WTYG002534000956')
        expect(html).not.toContain('TPN')
        expect(html).not.toContain('Settlement batch')
        expect(html).toContain('No processor or chip (EMV) data was recorded.')
        expect(html).toContain('Card payment captured successfully')
    })

    it('words a failed record load with a retry', () => {
        const html = renderToStaticMarkup(<PaymentTerminalSection detail={null} isLoading={false} onRetry={noop} />)
        expect(html).toContain('didn&#x27;t load')
        expect(html).toContain('Retry')
    })
})
