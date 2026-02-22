export type AdminAuditSeverity = 'info' | 'warning' | 'critical'

export interface AdminActionDefinition {
  action: string
  category: string
  severity: AdminAuditSeverity
}

export const ADMIN_ACTIONS = {
  // Merchant management
  MERCHANT_CREATED: {
    action: 'merchant.created',
    category: 'merchant',
    severity: 'info',
  },
  MERCHANT_UPDATED: {
    action: 'merchant.updated',
    category: 'merchant',
    severity: 'info',
  },
  MERCHANT_DEACTIVATED: {
    action: 'merchant.deactivated',
    category: 'merchant',
    severity: 'warning',
  },
  MERCHANT_SETTINGS_CHANGED: {
    action: 'merchant.settings_changed',
    category: 'merchant',
    severity: 'info',
  },

  // Admin user management
  ADMIN_INVITED: {
    action: 'admin.invited',
    category: 'user_management',
    severity: 'info',
  },
  ADMIN_INVITE_RESENT: {
    action: 'admin.invite_resent',
    category: 'user_management',
    severity: 'info',
  },
  ADMIN_INVITE_REVOKED: {
    action: 'admin.invite_revoked',
    category: 'user_management',
    severity: 'warning',
  },
  ADMIN_CREATED_DIRECTLY: {
    action: 'admin.created_directly',
    category: 'user_management',
    severity: 'info',
  },
  ADMIN_ROLE_CHANGED: {
    action: 'admin.role_changed',
    category: 'user_management',
    severity: 'warning',
  },
  ADMIN_DEACTIVATED: {
    action: 'admin.deactivated',
    category: 'user_management',
    severity: 'warning',
  },
  ADMIN_MERCHANT_ACCESS_GRANTED: {
    action: 'admin.access_granted',
    category: 'user_management',
    severity: 'info',
  },
  ADMIN_MERCHANT_ACCESS_REVOKED: {
    action: 'admin.access_revoked',
    category: 'user_management',
    severity: 'warning',
  },

  // Device / terminal management
  DEVICE_REBOOTED: {
    action: 'device.rebooted',
    category: 'device',
    severity: 'info',
  },
  DEVICE_CONFIG_CHANGED: {
    action: 'device.config_changed',
    category: 'device',
    severity: 'info',
  },
  TERMINAL_PAIRED: {
    action: 'terminal.paired',
    category: 'device',
    severity: 'info',
  },
  TERMINAL_UNPAIRED: {
    action: 'terminal.unpaired',
    category: 'device',
    severity: 'warning',
  },

  // Merchant staff actions by HQ admin
  MERCHANT_STAFF_PIN_RESET: {
    action: 'staff.pin_reset_by_admin',
    category: 'staff',
    severity: 'info',
  },
  MERCHANT_STAFF_CREATED: {
    action: 'staff.created_by_admin',
    category: 'staff',
    severity: 'info',
  },
  MERCHANT_STAFF_DEACTIVATED: {
    action: 'staff.deactivated_by_admin',
    category: 'staff',
    severity: 'warning',
  },
  MERCHANT_STAFF_REACTIVATED: {
    action: 'staff.reactivated_by_admin',
    category: 'staff',
    severity: 'info',
  },

  // Notes
  MERCHANT_NOTE_ADDED: {
    action: 'merchant.note_added',
    category: 'notes',
    severity: 'info',
  },
  MERCHANT_NOTE_DELETED: {
    action: 'merchant.note_deleted',
    category: 'notes',
    severity: 'info',
  },
} as const satisfies Record<string, AdminActionDefinition>

export type AdminActionKey = keyof typeof ADMIN_ACTIONS
