import { describe, expect, it } from 'vitest'
import { diffChanges, formatKey, formatScalar, itemLabel, readChanges, summarizeValue } from '../audit-diff'

const seats = (labels: string[]) => labels.map((label, i) => ({ id: `seat-${i + 1}`, label }))

describe('diffChanges — nested objects', () => {
  it('reports the changed leaf, not the whole object', () => {
    const before = { kiosk_settings: { seat_mode: 'ask', order_types: 'dine_in_only', seat_options: seats(['Seat 1', 'Seat 2']) } }
    const after = { kiosk_settings: { seat_mode: 'fixed', order_types: 'dine_in_only', seat_options: seats(['Seat 1', 'Seat 2']) } }
    const { changes, unchanged } = diffChanges(before, after)

    expect(changes).toEqual([
      { kind: 'changed', path: ['Kiosk settings', 'Seat mode'], before: 'ask', after: 'fixed' },
    ])
    expect(unchanged.map((u) => u.path)).toEqual([
      ['Kiosk settings', 'Order types'],
      ['Kiosk settings', 'Seat options'],
    ])
  })

  it('says a value was added or removed', () => {
    const { changes } = diffChanges(
      { kiosk_settings: { seat_mode: 'ask', table_label: '1' } },
      { kiosk_settings: { seat_mode: 'ask', fixed_seat_label: 'Seat 7' } }
    )
    expect(changes).toEqual([
      { kind: 'removed', path: ['Kiosk settings', 'Table label'], before: '1' },
      { kind: 'added', path: ['Kiosk settings', 'Fixed seat label'], after: 'Seat 7' },
    ])
  })

  it('treats null and empty string as no value', () => {
    const { changes } = diffChanges({ note: null }, { note: 'Hello' })
    expect(changes).toEqual([{ kind: 'added', path: ['Note'], after: 'Hello' }])
    expect(diffChanges({ note: '' }, { note: null }).changes).toEqual([])
  })

  it('finds nothing when the two sides match', () => {
    const value = { a: 1, b: { c: [1, 2] } }
    expect(diffChanges(value, structuredClone(value)).changes).toEqual([])
  })
})

describe('diffChanges — lists', () => {
  it('matches records by id and names them by label', () => {
    const before = { seat_options: seats(['Seat 1', 'Window']) }
    const after = { seat_options: [{ id: 'seat-1', label: 'Seat 1' }, { id: 'seat-2', label: 'Bar' }] }
    expect(diffChanges(before, after).changes).toEqual([
      { kind: 'changed', path: ['Seat options', 'Bar', 'Label'], before: 'Window', after: 'Bar' },
    ])
  })

  it('reports a record added to or removed from a list', () => {
    const { changes } = diffChanges(
      { seat_options: seats(['Seat 1', 'Seat 2']) },
      { seat_options: [{ id: 'seat-1', label: 'Seat 1' }, { id: 'seat-9', label: 'Seat 9' }] }
    )
    expect(changes).toEqual([
      { kind: 'removed', path: ['Seat options'], before: { id: 'seat-2', label: 'Seat 2' }, item: true },
      { kind: 'added', path: ['Seat options'], after: { id: 'seat-9', label: 'Seat 9' }, item: true },
    ])
  })

  it('says when only the order changed', () => {
    const { changes } = diffChanges({ seat_options: seats(['A', 'B']) }, { seat_options: seats(['A', 'B']).reverse() })
    expect(changes).toEqual([{ kind: 'reordered', path: ['Seat options'] }])
  })

  it('lists plain values that were added or removed', () => {
    const { changes } = diffChanges({ tags: ['vip', 'late'] }, { tags: ['vip', 'regular'] })
    expect(changes).toEqual([
      { kind: 'removed', path: ['Tags'], before: 'late', item: true },
      { kind: 'added', path: ['Tags'], after: 'regular', item: true },
    ])
    expect(diffChanges({ tags: ['a', 'b'] }, { tags: ['b', 'a'] }).changes).toEqual([
      { kind: 'reordered', path: ['Tags'] },
    ])
  })

  it('falls back to before → after for records without ids', () => {
    const { changes } = diffChanges({ hours: [{ day: 'mon' }] }, { hours: [{ day: 'tue' }] })
    expect(changes).toEqual([
      { kind: 'changed', path: ['Hours'], before: [{ day: 'mon' }], after: [{ day: 'tue' }] },
    ])
  })
})

describe('readChanges', () => {
  it('reads { before, after } as an update', () => {
    expect(readChanges({ before: { a: 1 }, after: { a: 2 } })).toEqual({ kind: 'update', before: { a: 1 }, after: { a: 2 } })
  })

  it('reads the { field: { old, new } } format as an update', () => {
    expect(readChanges({ price: { old: 5, new: 6 }, reason: 'promo' })).toEqual({
      kind: 'update',
      before: { price: 5 },
      after: { price: 6 },
    })
  })

  it('keeps created, removed, snapshot and none', () => {
    expect(readChanges({ after: { a: 1 } })).toEqual({ kind: 'created', values: { a: 1 } })
    expect(readChanges({ before: { a: 1 } })).toEqual({ kind: 'removed', values: { a: 1 } })
    expect(readChanges({ a: 1 })).toEqual({ kind: 'snapshot', values: { a: 1 } })
    expect(readChanges(null)).toEqual({ kind: 'none' })
    expect(readChanges({})).toEqual({ kind: 'none' })
  })
})

describe('labels and values', () => {
  it('humanises keys and stored codes', () => {
    expect(formatKey('fixed_seat_label')).toBe('Fixed seat label')
    expect(formatKey('ipAddress')).toBe('IP address')
    expect(formatScalar('dine_in_only')).toBe('Dine in only')
    expect(formatScalar('ask')).toBe('Ask')
    expect(formatScalar(true)).toBe('Yes')
    expect(formatScalar(12)).toBe('12')
  })

  it('leaves free text, emails and ids as written', () => {
    expect(formatScalar('Window seat')).toBe('Window seat')
    expect(formatScalar('a@b.co')).toBe('a@b.co')
    expect(formatScalar('829a3d86-5b76-43e0-99d8-b4c7dd0dc4e6')).toBe('829a3d86-5b76-43e0-99d8-b4c7dd0dc4e6')
  })

  it('names a record by its label, name or title', () => {
    expect(itemLabel({ id: 'x', label: 'Seat 3' }, 2)).toBe('Seat 3')
    expect(itemLabel({ id: 'x', name: 'Patio' }, 0)).toBe('Patio')
    expect(itemLabel({ id: 'x' }, 4)).toBe('Item 5')
  })

  it('summarises lists and records in a line', () => {
    expect(summarizeValue(seats(['Seat 1', 'Seat 2']))).toBe('Seat 1, Seat 2')
    expect(summarizeValue(seats(['1', '2', '3', '4', '5', '6', '7']))).toBe('1, 2, 3, 4, 5 and 2 more')
    expect(summarizeValue([{ day: 'mon' }, { day: 'tue' }])).toBe('2 items')
    expect(summarizeValue({ id: 'x', label: 'Seat 3' })).toBe('Seat 3')
    expect(summarizeValue({ a: 1, b: 2 })).toBe('2 fields')
    expect(summarizeValue(['vip', 'late'])).toBe('Vip, Late')
  })
})
