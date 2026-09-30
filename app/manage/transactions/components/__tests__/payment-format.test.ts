import { describe, expect, it } from 'vitest'
import { buildPaymentActivity, entryModeLabel } from '../payment-format'

describe('entryModeLabel', () => {
    it('names the common processor spellings', () => {
        expect(entryModeLabel('CONTACTLESS')).toBe('Contactless')
        expect(entryModeLabel('tap')).toBe('Contactless')
        expect(entryModeLabel('EMV_CHIP')).toBe('Chip')
        expect(entryModeLabel('magstripe')).toBe('Swipe')
        expect(entryModeLabel('keyed')).toBe('Manual')
    })

    it('returns null when the processor did not say', () => {
        expect(entryModeLabel(undefined)).toBeNull()
        expect(entryModeLabel('')).toBeNull()
        expect(entryModeLabel('something-else')).toBeNull()
    })
})

describe('buildPaymentActivity', () => {
    it('lists only what happened, oldest first', () => {
        const activity = buildPaymentActivity({
            initiated_at: '2026-09-29T19:33:00Z',
            captured_at: '2026-09-29T19:33:30Z',
            is_voided: true,
            voided_at: '2026-09-29T19:34:10Z',
            void_reason: 'Refunded: Customer request',
            voided_by: 'staff-1',
            is_returned: true,
            returned_at: '2026-09-29T19:34:05Z',
            return_amount: 0.01,
            return_reason: 'Customer request',
            refunded_at: '2026-09-29T19:34:20Z',
            refunded_amount: 0.01,
            tip_amount: 0,
        })

        // The POS writes a refund as refund + return + void; it reads as one event.
        expect(activity.map((e) => e.key)).toEqual(['initiated', 'captured', 'refunded'])
        expect(activity[2]).toMatchObject({
            label: 'Refunded',
            at: '2026-09-29T19:34:05Z',
            amount: 0.01,
            note: 'Customer request',
            by: 'staff-1',
            recordedAs: ['a return', 'a void'],
        })
    })

    it('names the staff member when the id resolves', () => {
        const activity = buildPaymentActivity({
            is_voided: true,
            voided_at: '2026-09-29T19:34:10Z',
            voided_by: 'staff-1',
            staff_names: { 'staff-1': 'Temur Bek' },
        })
        expect(activity[0].by).toBe('Temur Bek')
    })

    it('keeps a void that happened long before the refund separate', () => {
        const activity = buildPaymentActivity({
            is_voided: true,
            voided_at: '2026-09-29T10:00:00Z',
            refunded_at: '2026-09-29T19:34:20Z',
            refunded_amount: 5,
        })
        expect(activity.map((e) => e.key)).toEqual(['voided', 'refunded'])
        expect(activity[1].recordedAs).toBeUndefined()
    })

    it('has no reversal or tip entries for a clean capture', () => {
        const activity = buildPaymentActivity({
            initiated_at: '2026-09-29T19:33:00Z',
            captured_at: '2026-09-29T19:33:30Z',
            is_voided: false,
            is_returned: false,
            return_amount: 0,
            refunded_amount: 0,
            tip_amount: 2,
            original_tip_amount: 2,
        })
        expect(activity.map((e) => e.key)).toEqual(['initiated', 'captured'])
    })

    it('shows a tip change and sorts undated events last', () => {
        const activity = buildPaymentActivity({
            initiated_at: '2026-09-29T19:33:00Z',
            original_tip_amount: 2,
            tip_amount: 3,
            is_voided: true,
            settled_at: '2026-09-30T02:00:00Z',
        })
        expect(activity.map((e) => e.key)).toEqual(['initiated', 'settled', 'tip-adjusted', 'voided'])
        expect(activity.find((e) => e.key === 'tip-adjusted')?.note).toBe('$2.00 → $3.00')
        expect(activity.find((e) => e.key === 'voided')?.at).toBeNull()
    })
})
