import type { TimesheetEmployee, TimesheetShift, TimesheetSummaryPayload } from '@/lib/timesheets/types'

export function employee(id: string, displayName: string, roleName: string | null = 'Server'): TimesheetEmployee {
  const [firstName, ...rest] = displayName.split(' ')
  return {
    staffProfileId: id,
    displayName,
    firstName,
    lastName: rest.join(' '),
    avatarUrl: null,
    roleName,
    isActiveMember: true,
  }
}

let seq = 0
export function shift(partial: Partial<TimesheetShift> & Pick<TimesheetShift, 'staffProfileId' | 'localDate'>): TimesheetShift {
  seq += 1
  return {
    id: `shift-${seq}`,
    clockIn: `${partial.localDate}T14:00:00Z`,
    clockOut: `${partial.localDate}T22:00:00Z`,
    status: 'completed',
    netMinutes: 480,
    unpaidBreakMinutes: 0,
    paidBreakMinutes: 0,
    otMinutes: 0,
    rate: 19,
    payCents: 15_200,
    isOpen: false,
    isOnClock: false,
    isMissingOut: false,
    isOvernight: false,
    isOverMax: false,
    isEdited: false,
    isAutoClosed: false,
    fromPos: true,
    breaks: [],
    breakLogs: [],
    notes: null,
    isVerified: false,
    ...partial,
  }
}

export function payload(employees: TimesheetEmployee[], shifts: TimesheetShift[]): TimesheetSummaryPayload {
  return {
    meta: {
      locationId: 'loc-1',
      locationName: 'Uptown Branch',
      timezone: 'America/New_York',
      weekStartsOn: 'monday',
      otThresholdMinutes: 2400,
      otMultiplier: 1.5,
      maxShiftMinutes: 960,
      rangeStart: '2026-09-07',
      rangeEnd: '2026-09-13',
      generatedAt: '2026-09-15T12:00:00Z',
    },
    employees,
    shifts,
  }
}
