import type {
  DeviceActivityItem,
  DeviceAssignmentRow,
  DeviceConfigHistoryRow,
  DeviceNoteRow,
} from '@/types/device-registry'

function formatAssignmentTitle(row: DeviceAssignmentRow) {
  return row.previous_status
    ? `${row.previous_status} -> ${row.new_status}`
    : `Moved to ${row.new_status}`
}

export function toDeviceActivityFeed(
  assignments: DeviceAssignmentRow[],
  configHistory: DeviceConfigHistoryRow[],
  notes: DeviceNoteRow[]
): DeviceActivityItem[] {
  const assignmentItems: DeviceActivityItem[] = assignments.map((row) => ({
    id: row.id,
    type: 'assignment',
    occurred_at: row.assigned_at,
    title: formatAssignmentTitle(row),
    subtitle: row.reason,
    body: row.notes,
    actor: row.performed_by_name ?? row.performed_by,
    status: row.new_status,
    tracking_number: row.tracking_number,
  }))

  const configItems: DeviceActivityItem[] = configHistory.map((row) => ({
    id: row.id,
    type: 'config',
    occurred_at: row.created_at,
    title: row.change_type.replace(/_/g, ' '),
    subtitle:
      row.previous_value || row.new_value
        ? `${row.previous_value ?? 'N/A'} -> ${row.new_value ?? 'N/A'}`
        : null,
    body: row.notes,
    actor: row.performed_by_name ?? row.performed_by,
  }))

  const noteItems: DeviceActivityItem[] = notes.map((row) => ({
    id: row.id,
    type: 'note',
    occurred_at: row.created_at,
    title: `${row.note_type.replace(/_/g, ' ')} note`,
    subtitle: row.external_ticket_id ? `Ticket ${row.external_ticket_id}` : null,
    body: row.content,
    actor: row.created_by_name ?? row.created_by,
  }))

  return [...assignmentItems, ...configItems, ...noteItems].sort(
    (left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime()
  )
}
