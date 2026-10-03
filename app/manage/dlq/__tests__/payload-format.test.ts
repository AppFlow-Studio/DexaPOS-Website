import { describe, expect, it } from 'vitest'
import {
  humanizeKey,
  isIdentifier,
  isZonedTimestamp,
  itemTitle,
  partitionObject,
} from '../payload-format'
import { isReplayable, isStrippedOnReplay, resolveReplayTarget, stripEnrichmentKeys } from '../replay'

describe('humanizeKey', () => {
  it('splits camelCase and snake_case and spells acronyms', () => {
    expect(humanizeKey('externalReferenceId')).toBe('External reference ID')
    expect(humanizeKey('_matched_location_id')).toBe('Matched location ID')
    expect(humanizeKey('ccExpirationDate')).toBe('Card expiration date')
    expect(humanizeKey('mcc')).toBe('MCC')
    expect(humanizeKey('event')).toBe('Event')
  })
})

describe('isStrippedOnReplay', () => {
  it('matches the keys stripEnrichmentKeys removes, and only those', () => {
    expect(isStrippedOnReplay('_matched_location_id')).toBe(true)
    expect(isStrippedOnReplay('_rpc_error')).toBe(true)
    expect(isStrippedOnReplay('_error')).toBe(true)
    expect(isStrippedOnReplay('_raw')).toBe(true)
    expect(isStrippedOnReplay('_auto_accept')).toBe(false)
    expect(isStrippedOnReplay('event')).toBe(false)
  })
})

describe('replay targets', () => {
  it('replays OrderOut orders and push_menu, and nothing else', () => {
    expect(resolveReplayTarget('orderout', 'received').path).toBe('orderout-orders-webhook')
    expect(resolveReplayTarget('orderout', 'push_menu').path).toBe('orderout-push-menu-webhook')
    for (const source of ['valor', 'orderout_status_relay', 'orderout_delivery_webhook', 'telnyx', 'telnyx_outbound']) {
      expect(isReplayable(source, 'any')).toBe(false)
    }
  })

  it('strips only the enrichment keys', () => {
    expect(stripEnrichmentKeys({ event: 'received', _auto_accept: true, _rpc_error: 'x', _matched_location_id: 'y' })).toEqual({
      event: 'received',
      _auto_accept: true,
    })
  })
})

describe('partitionObject', () => {
  it('sorts keys into fields, sections and empties', () => {
    const node = partitionObject({
      event: 'received',
      deliveryCompany: { name: 'grubhub' },
      customer: { customerName: 'Mahdi H', city: null },
      items: [{ name: 'original hummus', quantity: 1 }],
      tags: ['a', 'b'],
      modifiers: [],
      note: '  ',
      leadTime: null,
    })
    expect(node.fields.map((f) => [f.key, f.value])).toEqual([
      ['event', 'received'],
      // A one-value wrapper reads as its value.
      ['deliveryCompany', 'grubhub'],
      ['tags', ['a', 'b']],
    ])
    expect(node.groups.map((g) => g.key)).toEqual(['customer', 'items'])
    expect(node.empty.map((e) => e.key)).toEqual(['modifiers', 'note', 'leadTime'])
  })

  it('keeps zero and false as values, not empties', () => {
    const node = partitionObject({ amount: 0, is_voided: false })
    expect(node.fields.map((f) => f.value)).toEqual([0, false])
    expect(node.empty).toEqual([])
  })

  it('reads a mixed list as compact JSON items', () => {
    const node = partitionObject({ mixed: [1, { a: 1 }] })
    expect(node.fields[0].value).toEqual([1, '{"a":1}'])
  })
})

describe('itemTitle', () => {
  it('names an item by its name, then title, then id', () => {
    expect(itemTitle({ id: 'x', name: 'lentil soup' })).toBe('lentil soup')
    expect(itemTitle({ id: 'x' })).toBe('x')
    expect(itemTitle({ quantity: 2 })).toBeNull()
  })
})

describe('isZonedTimestamp', () => {
  it('accepts only timestamps that carry a zone', () => {
    expect(isZonedTimestamp('2026-03-06T22:22:46.262086Z')).toBe(true)
    expect(isZonedTimestamp('2026-03-06T22:52:34+00:00')).toBe(true)
    // Valor's local wall-clock strings have no zone; reformatting would guess one.
    expect(isZonedTimestamp('2026-09-21 17:43:06')).toBe(false)
    expect(isZonedTimestamp('received')).toBe(false)
  })
})

describe('isIdentifier', () => {
  it('flags UUIDs and id-named keys', () => {
    expect(isIdentifier('restaurantId', '657a703d-37ef-423e-a72b-a8766f67941a')).toBe(true)
    expect(isIdentifier('external_id', '5453316557504512')).toBe(true)
    expect(isIdentifier('externalRestaurantId', 6487684134600704)).toBe(true)
    expect(isIdentifier('paid', true)).toBe(false)
    expect(isIdentifier('name', 'original hummus')).toBe(false)
  })
})
