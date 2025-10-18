// clerk-metadata.ts
export const ClerkRoles = {
    // Organization Roles
    SUPER_ADMIN: 'org:super_admin',
    PLATFORM_ADMIN: 'org:platform_admin',
    SUPPORT_MANAGER: 'org:support_manager',
    FINANCE_MANAGER: 'org:finance_manager',
    DEVELOPER: 'org:developer',
    
    // Carrier Roles
    CARRIER_ADMIN: 'carrier:admin',
    CARRIER_MANAGER: 'carrier:manager',
    CARRIER_SUPPORT: 'carrier:support',
    MERCHANT_ACCOUNT_MANAGER: 'carrier:merchant_manager',
  } as const;
  
  // Store in Clerk's publicMetadata
  export interface ClerkUserMetadata {
    organizationRole: string;
    carrierRoles: {
      carrierId: string;
      role: string;
    }[];
    permissions: string[];
  }