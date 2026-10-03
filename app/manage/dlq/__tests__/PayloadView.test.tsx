import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PayloadView } from '../PayloadView'

// Trimmed from a real OrderOut order entry in the queue.
const ORDER_PAYLOAD = {
  event: 'received',
  source: {
    ods: { name: 'OrderOut' },
    leadTime: null,
    orderNumber: 'pfkAkhmqEfGAky1FGBhUVA',
    deliveryCompany: { name: 'grubhub' },
  },
  payload: {
    order: {
      total: 29.78,
      items: [
        { id: 'pilf', name: 'original hummus', price: 11, quantity: 1, modifiers: [] },
        { id: 'xLd8', name: 'chicken shish sandwich', price: 17, quantity: 1, modifiers: [] },
      ],
    },
    customer: { customerName: 'Mahdi H', city: null },
  },
  _rpc_error: 'insert or update on table "audit_logs" violates foreign key constraint',
  _auto_accept: true,
  _matched_location_id: '657a703d-37ef-423e-a72b-a8766f67941a',
}

describe('PayloadView', () => {
  const html = renderToStaticMarkup(<PayloadView payload={ORDER_PAYLOAD} />)

  it('opens on labelled fields, one section per top-level object', () => {
    expect(html).toContain('Order number')
    expect(html).toContain('Delivery company')
    expect(html).toContain('grubhub')
    expect(html).toContain('>Source<')
    expect(html).toContain('>Payload<')
  })

  it('numbers list items and names them', () => {
    expect(html).toContain('original hummus')
    expect(html).toContain('chicken shish sandwich')
    expect(html).toContain('Items')
  })

  it('folds empty values into one line', () => {
    expect(html).toContain('Empty: Lead time')
    expect(html).toContain('Empty: City')
  })

  it('separates Dexa annotations and marks only the stripped keys', () => {
    expect(html).toContain('Added by Dexa')
    expect(html).toContain('Rpc error<span> · removed on replay')
    expect(html).toContain('Matched location ID<span> · removed on replay')
    expect(html).toMatch(/Auto accept<\/dt>/)
  })

  it('says so when a payload has no named fields', () => {
    const plain = renderToStaticMarkup(<PayloadView payload="not json" />)
    expect(plain).toContain('This payload has no named fields to lay out')
  })
})
