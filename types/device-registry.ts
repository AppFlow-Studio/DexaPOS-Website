export type DeviceCategory =
  | 'pos_tablet'
  | 'cfd'
  | 'kds'
  | 'payment_terminal'
  | 'receipt_printer'
  | 'kitchen_printer'
  | 'cash_drawer'

export type DeviceLifecycleStatus =
  | 'in_warehouse'
  | 'allocated'
  | 'shipped'
  | 'provisioning'
  | 'deployed'
  | 'in_repair'
  | 'decommissioned'
  | 'lost'
  | 'rma'

export interface AdminDeviceInventoryRow {
  id: string
  catalog_id: string
  serial_number: string
  pos_id: string | null
  mac_address: string | null
  status: DeviceLifecycleStatus
  condition: string
  firmware_version: string | null
  app_version: string | null
  purchased_at: string | null
  warranty_expires_at: string | null
  purchase_order_number: string | null
  last_config_at: string | null
  created_at: string
  updated_at: string
  device_category: DeviceCategory
  manufacturer: string
  model_name: string
  model_sku: string | null
  monthly_fee_cents: number | null
  monthly_fee: number | null
  merchant_id: string | null
  merchant_name: string | null
  location_id: string | null
  location_name: string | null
  linked_station_id: string | null
  linked_payment_terminal_id: string | null
  linked_printer_id: string | null
}

export interface AdminDeviceSummaryRow {
  device_category: DeviceCategory
  manufacturer: string
  model_name: string
  status: DeviceLifecycleStatus
  device_count: number
}

export interface DeviceAssignmentRow {
  id: string
  device_id: string
  previous_status: DeviceLifecycleStatus | null
  new_status: DeviceLifecycleStatus
  from_merchant_id: string | null
  to_merchant_id: string | null
  from_location_id: string | null
  to_location_id: string | null
  performed_by: string
  performed_by_name: string | null
  tracking_number: string | null
  reason: string | null
  notes: string | null
  assigned_at: string
}

export interface DeviceConfigHistoryRow {
  id: string
  device_id: string
  change_type:
    | 'firmware_update'
    | 'app_update'
    | 'config_change'
    | 'factory_reset'
    | 'reprovisioning'
  previous_value: string | null
  new_value: string | null
  config_snapshot: Record<string, unknown> | null
  performed_by: string | null
  performed_by_name: string | null
  notes: string | null
  created_at: string
}

export interface DeviceNoteRow {
  id: string
  device_id: string
  note_type: 'support' | 'maintenance' | 'incident' | 'general' | 'warranty_claim'
  content: string
  created_by: string
  created_by_name: string | null
  external_ticket_id: string | null
  created_at: string
}

export type DeviceActivityItem =
  | {
      id: string
      type: 'assignment'
      occurred_at: string
      title: string
      subtitle: string | null
      body: string | null
      actor: string | null
      status: DeviceLifecycleStatus | null
      tracking_number: string | null
    }
  | {
      id: string
      type: 'config'
      occurred_at: string
      title: string
      subtitle: string | null
      body: string | null
      actor: string | null
    }
  | {
      id: string
      type: 'note'
      occurred_at: string
      title: string
      subtitle: string | null
      body: string | null
      actor: string | null
    }

export interface AdminDeviceInventoryFilters {
  status?: DeviceLifecycleStatus | 'all' | null
  category?: DeviceCategory | 'all' | null
  search?: string | null
}

export interface DeviceRegistryMerchantOption {
  id: string
  name: string
}

export interface DeviceRegistryLocationOption {
  id: string
  merchant_id: string
  name: string
}

export interface DeviceTransitionRequirement {
  requiresMerchant: boolean
  requiresLocation: boolean
  clearsAssignment: boolean
}

export interface AssignDevicePayload {
  deviceId: string
  newStatus: DeviceLifecycleStatus
  toMerchantId?: string | null
  toLocationId?: string | null
  trackingNumber?: string | null
  reason?: string | null
  notes?: string | null
}

export interface AssignDeviceResult {
  success: boolean
  error?: string
  assignment_id?: string
  device_id?: string
  previous_status?: DeviceLifecycleStatus
  new_status?: DeviceLifecycleStatus
  merchant_id?: string | null
  location_id?: string | null
}

export interface DeviceOverviewKpis {
  total: number
  deployed: number
  warehouse: number
  inTransit: number
  needsAttention: number
  unlinked: number
  warranty30: number
  warranty60: number
  warranty90: number
  expiredWarranty: number
}

export interface DeviceOverviewChartDatum {
  key: string
  label: string
  value: number
}

export interface DeviceOverviewMerchantDatum {
  merchantName: string
  value: number
}

export interface DeviceOverviewMonthlyDatum {
  month: string
  value: number
}

export interface DeviceOverviewData {
  kpis: DeviceOverviewKpis
  statusBreakdown: DeviceOverviewChartDatum[]
  categoryBreakdown: DeviceOverviewChartDatum[]
  merchantBreakdown: DeviceOverviewMerchantDatum[]
  registrationTrend: DeviceOverviewMonthlyDatum[]
}

export interface DeviceRegistryCommandResult {
  id: string
  serial_number: string
  pos_id: string | null
  status: DeviceLifecycleStatus
  device_category: DeviceCategory
  manufacturer: string
  model_name: string
  model_sku: string | null
  merchant_name: string | null
  location_name: string | null
  updated_at: string
}
