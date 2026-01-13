// ============================================================================
// Terminal & Device Helper Functions
// Description: Utility functions for terminals and devices (client-safe)
// ============================================================================

// ============================================================================
// Terminal Types
// ============================================================================

export type TerminalType = 'dejavoo' | 'pax'
export type ApiEnvironment = 'sandbox' | 'production'
export type TerminalConnectionType = 'cloud' | 'local'

// ============================================================================
// Device Types
// ============================================================================

export type StationDeviceType =
  | 'receipt_printer'
  | 'kitchen_printer'
  | 'label_printer'
  | 'cash_drawer'
  | 'barcode_scanner'
  | 'scale'
  | 'customer_display'

export type DeviceConnectionType = 'usb' | 'bluetooth' | 'network' | 'integrated'

// ============================================================================
// Terminal Helper Functions
// ============================================================================

export const getTerminalTypeLabel = (type: TerminalType): string => {
  switch (type) {
    case 'dejavoo':
      return 'Dejavoo'
    case 'pax':
      return 'PAX'
    default:
      return type
  }
}

export const getApiEnvironmentLabel = (env: ApiEnvironment): string => {
  switch (env) {
    case 'sandbox':
      return 'Sandbox'
    case 'production':
      return 'Production'
    default:
      return env
  }
}

export const getTerminalConnectionTypeLabel = (type: TerminalConnectionType): string => {
  switch (type) {
    case 'cloud':
      return 'Cloud (SPIN API)'
    case 'local':
      return 'Local (DvPayLite)'
    default:
      return type
  }
}

export const maskAuthKey = (authKey: string): string => {
  if (!authKey || authKey.length < 4) return '****'
  return '****' + authKey.slice(-4)
}

// ============================================================================
// Device Helper Functions
// ============================================================================

export const getDeviceTypeLabel = (type: StationDeviceType): string => {
  switch (type) {
    case 'receipt_printer':
      return 'Receipt Printer'
    case 'kitchen_printer':
      return 'Kitchen Printer'
    case 'label_printer':
      return 'Label Printer'
    case 'cash_drawer':
      return 'Cash Drawer'
    case 'barcode_scanner':
      return 'Barcode Scanner'
    case 'scale':
      return 'Scale'
    case 'customer_display':
      return 'Customer Display'
    default:
      return type
  }
}

export const getDeviceTypeIcon = (type: StationDeviceType): string => {
  switch (type) {
    case 'receipt_printer':
      return '🖨️'
    case 'kitchen_printer':
      return '🍳'
    case 'label_printer':
      return '🏷️'
    case 'cash_drawer':
      return '💰'
    case 'barcode_scanner':
      return '📱'
    case 'scale':
      return '⚖️'
    case 'customer_display':
      return '📺'
    default:
      return '📱'
  }
}

export const getDeviceConnectionTypeLabel = (type: DeviceConnectionType): string => {
  switch (type) {
    case 'usb':
      return 'USB'
    case 'bluetooth':
      return 'Bluetooth'
    case 'network':
      return 'Network'
    case 'integrated':
      return 'Integrated'
    default:
      return type
  }
}
