// permissions.ts
export const Permissions = {
    // Organization Level
    ORG_MANAGE_SETTINGS: 'org.manage_settings',
    ORG_MANAGE_TEAM: 'org.manage_team',
    ORG_VIEW_ALL_CARRIERS: 'org.view_all_carriers',
    ORG_MANAGE_BILLING: 'org.manage_billing',
    ORG_VIEW_ANALYTICS: 'org.view_analytics',
    ORG_MANAGE_API_KEYS: 'org.manage_api_keys',
    ORG_VIEW_AUDIT_LOGS: 'org.view_audit_logs',
    
    // Carrier Level
    CARRIER_CREATE: 'carrier.create',
    CARRIER_UPDATE: 'carrier.update',
    CARRIER_DELETE: 'carrier.delete',
    CARRIER_VIEW: 'carrier.view',
    CARRIER_MANAGE_MERCHANTS: 'carrier.manage_merchants',
    CARRIER_VIEW_ANALYTICS: 'carrier.view_analytics',
    CARRIER_MANAGE_SETTINGS: 'carrier.manage_settings',
    CARRIER_MANAGE_TEAM: 'carrier.manage_team',
    
    // Merchant Level
    MERCHANT_CREATE: 'merchant.create',
    MERCHANT_UPDATE: 'merchant.update',
    MERCHANT_DELETE: 'merchant.delete',
    MERCHANT_VIEW: 'merchant.view',
    MERCHANT_VIEW_TRANSACTIONS: 'merchant.view_transactions',
    MERCHANT_MANAGE_DEVICES: 'merchant.manage_devices',
    MERCHANT_MANAGE_PRODUCTS: 'merchant.manage_products',
    MERCHANT_VIEW_REPORTS: 'merchant.view_reports',
    MERCHANT_MANAGE_SETTINGS: 'merchant.manage_settings',
    
    // Support
    SUPPORT_VIEW_TICKETS: 'support.view_tickets',
    SUPPORT_MANAGE_TICKETS: 'support.manage_tickets',
    SUPPORT_ACCESS_CUSTOMER_DATA: 'support.access_customer_data',
    
    // Financial
    FINANCE_VIEW_TRANSACTIONS: 'finance.view_transactions',
    FINANCE_VIEW_REPORTS: 'finance.view_reports',
    FINANCE_MANAGE_BILLING: 'finance.manage_billing',
    FINANCE_PROCESS_REFUNDS: 'finance.process_refunds',
  } as const;
  
  // Role to Permission Mapping
  export const RolePermissions: Record<string, string[]> = {
    'org:super_admin': Object.values(Permissions),
    
    'org:platform_admin': [
      Permissions.ORG_VIEW_ALL_CARRIERS,
      Permissions.ORG_VIEW_ANALYTICS,
      Permissions.ORG_MANAGE_TEAM,
      Permissions.CARRIER_CREATE,
      Permissions.CARRIER_UPDATE,
      Permissions.CARRIER_VIEW,
      Permissions.CARRIER_MANAGE_MERCHANTS,
      Permissions.CARRIER_VIEW_ANALYTICS,
      Permissions.MERCHANT_CREATE,
      Permissions.MERCHANT_UPDATE,
      Permissions.MERCHANT_VIEW,
      Permissions.MERCHANT_VIEW_TRANSACTIONS,
    ],
    
    'org:support_manager': [
      Permissions.ORG_VIEW_ALL_CARRIERS,
      Permissions.CARRIER_VIEW,
      Permissions.MERCHANT_VIEW,
      Permissions.MERCHANT_VIEW_TRANSACTIONS,
      Permissions.SUPPORT_VIEW_TICKETS,
      Permissions.SUPPORT_MANAGE_TICKETS,
      Permissions.SUPPORT_ACCESS_CUSTOMER_DATA,
    ],
    
    'carrier:admin': [
      Permissions.CARRIER_UPDATE,
      Permissions.CARRIER_VIEW,
      Permissions.CARRIER_MANAGE_MERCHANTS,
      Permissions.CARRIER_VIEW_ANALYTICS,
      Permissions.CARRIER_MANAGE_SETTINGS,
      Permissions.CARRIER_MANAGE_TEAM,
      Permissions.MERCHANT_CREATE,
      Permissions.MERCHANT_UPDATE,
      Permissions.MERCHANT_VIEW,
      Permissions.MERCHANT_VIEW_TRANSACTIONS,
      Permissions.MERCHANT_MANAGE_DEVICES,
    ],
    
    'carrier:manager': [
      Permissions.CARRIER_VIEW,
      Permissions.CARRIER_VIEW_ANALYTICS,
      Permissions.MERCHANT_CREATE,
      Permissions.MERCHANT_UPDATE,
      Permissions.MERCHANT_VIEW,
      Permissions.MERCHANT_VIEW_TRANSACTIONS,
    ],
    
    'carrier:support': [
      Permissions.CARRIER_VIEW,
      Permissions.MERCHANT_VIEW,
      Permissions.MERCHANT_VIEW_TRANSACTIONS,
      Permissions.SUPPORT_VIEW_TICKETS,
      Permissions.SUPPORT_MANAGE_TICKETS,
    ],
    
    'carrier:merchant_manager': [
      Permissions.MERCHANT_UPDATE,
      Permissions.MERCHANT_VIEW,
      Permissions.MERCHANT_VIEW_TRANSACTIONS,
      Permissions.MERCHANT_MANAGE_SETTINGS,
    ],
  };