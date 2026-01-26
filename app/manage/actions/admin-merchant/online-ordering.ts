'use server'

// ============================================================================
// Admin Online Ordering Server Actions
// Description: View and manage merchant online ordering settings from HQ
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import type { Site, SiteThemeConfig } from '@/types/site'

// ============================================================================
// Types (copied from merchant hooks for consistency)
// ============================================================================

interface DaySchedule {
  enabled: boolean
  from: string
  to: string
  is24Hours: boolean
}

interface WeeklySchedule {
  monday: DaySchedule
  tuesday: DaySchedule
  wednesday: DaySchedule
  thursday: DaySchedule
  friday: DaySchedule
  saturday: DaySchedule
  sunday: DaySchedule
}

interface TipConfig {
  calculationMethod: 'subtotal' | 'total'
  presetPercentages: number[]
  smartTipEnabled: boolean
  smartTipThreshold: number
  smartTipAmounts: number[]
  allowCustomTip: boolean
}

interface OnlineOrderingSettings {
  id?: string
  locationId: string
  enabled: boolean
  storeName: string
  storeSlug: string
  storeUrl?: string
  phone: string
  email: string
  address: string
  hideFromLocationPicker?: boolean
  dontMarkClosedOutsideHours?: boolean
  sendEmailOnNewOrder?: boolean
  notificationEmail?: string
  autoAcceptOrders?: boolean
  autoClosePaidOrders?: boolean
  operatingHours?: WeeklySchedule
  useCustomDeliveryHours?: boolean
  deliveryHours?: WeeklySchedule
  logoUrl?: string | null
  heroImageUrl?: string | null
  faviconUrl?: string | null
  bannerText?: string | null
  primaryColor?: string
  secondaryColor?: string
  headerStyle?: 'primary' | 'dark' | 'light'
  pickupEnabled?: boolean
  deliveryEnabled?: boolean
  preparationLeadTime?: number
  acceptFutureOrdersOnly?: boolean
  futureOrderMinDays?: number
  futureOrderMaxDays?: number
  minimumOrderAmount?: number
  acceptOnlinePayments?: boolean
  acceptCashOnDelivery?: boolean
  acceptCardOnDelivery?: boolean
  tippingEnabled?: boolean
  tipConfig?: TipConfig
  baseDeliveryFee?: number
  freeDeliveryThreshold?: number
  convenienceFeeEnabled?: boolean
  convenienceFeePercent?: number
  convenienceFeeFlat?: number
}

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get online ordering settings for a specific location (admin access)
 */
export async function getAdminOnlineOrderingSettings(
  merchantId: string,
  locationId: string
): Promise<{ success: boolean; data: Partial<OnlineOrderingSettings> | null; error: string | null }> {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    // 1. Fetch Location Data
    const { data: location, error: locError } = await supabase
      .from('locations')
      .select('id, name, phone, email, address_line1, city, state, postal_code, business_hours')
      .eq('id', locationId)
      .single()

    if (locError) {
      console.error('[getAdminOnlineOrderingSettings] Location error:', locError)
      return { success: false, data: null, error: locError.message }
    }

    // 2. Fetch Site Data
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('location_id', locationId)
      .single()

    // Site might not exist yet - that's ok
    if (siteError && siteError.code !== 'PGRST116') {
      console.error('[getAdminOnlineOrderingSettings] Site error:', siteError)
    }

    // 3. Build settings
    const settings: Partial<OnlineOrderingSettings> = {
      locationId,
      storeName: location.name,
      phone: location.phone ?? '',
      email: location.email ?? '',
      address: `${location.address_line1 || ''}, ${location.city || ''}, ${location.state || ''} ${location.postal_code || ''}`.trim(),
      operatingHours: location.business_hours as WeeklySchedule,
    }

    if (site) {
      // Map site data
      settings.id = site.id
      settings.enabled = site.is_active ?? false
      settings.storeName = site.title || settings.storeName
      settings.storeSlug = site.subdomain ?? ''
      settings.logoUrl = site.logo_url
      settings.bannerText = site.banner_text
      settings.primaryColor = site.theme_config?.primaryColor ?? '#3b82f6'
      settings.secondaryColor = site.theme_config?.secondaryColor ?? '#10b981'
      settings.heroImageUrl = site.theme_config?.heroImageUrl
      settings.faviconUrl = site.theme_config?.faviconUrl

      // Map online_ordering_config
      const config = site.online_ordering_config as any
      if (config) {
        if (config.operatingHours) settings.operatingHours = config.operatingHours
        settings.useCustomDeliveryHours = config.useCustomDeliveryHours
        settings.deliveryHours = config.deliveryHours
        settings.pickupEnabled = config.pickupEnabled
        settings.deliveryEnabled = config.deliveryEnabled
        settings.preparationLeadTime = config.preparationLeadTime
        settings.acceptFutureOrdersOnly = config.acceptFutureOrdersOnly
        settings.futureOrderMinDays = config.futureOrderMinDays
        settings.futureOrderMaxDays = config.futureOrderMaxDays
        settings.minimumOrderAmount = config.minimumOrderAmount
        settings.tippingEnabled = config.tippingEnabled
        settings.tipConfig = config.tipConfig
        settings.baseDeliveryFee = config.baseDeliveryFee
        settings.freeDeliveryThreshold = config.freeDeliveryThreshold
        settings.acceptOnlinePayments = config.acceptOnlinePayments
        settings.acceptCashOnDelivery = config.acceptCashOnDelivery
        settings.acceptCardOnDelivery = config.acceptCardOnDelivery
        settings.sendEmailOnNewOrder = config.sendEmailOnNewOrder
        settings.notificationEmail = config.notificationEmail
        settings.autoAcceptOrders = config.autoAcceptOrders
        settings.autoClosePaidOrders = config.autoClosePaidOrders
        settings.convenienceFeeEnabled = config.convenienceFeeEnabled
        settings.convenienceFeePercent = config.convenienceFeePercent
        settings.convenienceFeeFlat = config.convenienceFeeFlat
      }
    }

    return { success: true, data: settings, error: null }
  } catch (error) {
    console.error('[getAdminOnlineOrderingSettings] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get all locations with their online ordering status for a merchant
 */
export async function getAdminMerchantOnlineOrderingOverview(merchantId: string) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    // Get all locations for the merchant
    const { data: locations, error: locError } = await supabase
      .from('locations')
      .select('id, name')
      .eq('merchant_id', merchantId)
      .order('name')

    if (locError) {
      console.error('[getAdminMerchantOnlineOrderingOverview] Location error:', locError)
      return { success: false, data: null, error: locError.message }
    }

    const locationIds = locations?.map((l) => l.id) || []

    if (locationIds.length === 0) {
      return { success: true, data: [], error: null }
    }

    // Get sites for these locations
    const { data: sites, error: siteError } = await supabase
      .from('sites')
      .select('id, location_id, is_active, title, subdomain')
      .in('location_id', locationIds)

    if (siteError) {
      console.error('[getAdminMerchantOnlineOrderingOverview] Site error:', siteError)
    }

    // Map locations with their site status
    const siteMap = new Map(sites?.map((s) => [s.location_id, s]) || [])
    const result = locations?.map((loc) => {
      const site = siteMap.get(loc.id)
      return {
        locationId: loc.id,
        locationName: loc.name,
        hasOnlineStore: !!site,
        isEnabled: site?.is_active ?? false,
        storeName: site?.title || loc.name,
        storeSlug: site?.subdomain || null,
      }
    })

    return { success: true, data: result, error: null }
  } catch (error) {
    console.error('[getAdminMerchantOnlineOrderingOverview] Exception:', error)
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// WRITE Operations
// ============================================================================

/**
 * Save online ordering settings for a location (admin access)
 */
export async function adminSaveOnlineOrderingSettings(
  merchantId: string,
  locationId: string,
  settings: Partial<OnlineOrderingSettings>
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // 1. Update location contact info if provided
    const locationUpdates: Record<string, unknown> = {}
    if (settings.phone !== undefined) locationUpdates.phone = settings.phone
    if (settings.email !== undefined) locationUpdates.email = settings.email
    if (settings.operatingHours !== undefined) {
      locationUpdates.business_hours = settings.operatingHours
    }

    if (Object.keys(locationUpdates).length > 0) {
      const { error: locError } = await supabase
        .from('locations')
        .update(locationUpdates)
        .eq('id', locationId)

      if (locError) {
        console.error('[adminSaveOnlineOrderingSettings] Location update error:', locError)
        return { success: false, error: locError.message }
      }
    }

    // 2. Check if site exists
    const { data: existingSite } = await supabase
      .from('sites')
      .select('id, theme_config, online_ordering_config')
      .eq('location_id', locationId)
      .single()

    const currentTheme = (existingSite?.theme_config as any) || {}
    const currentConfig = (existingSite?.online_ordering_config as any) || {}

    // Build theme config
    const themeConfig: SiteThemeConfig = {
      primaryColor: settings.primaryColor ?? currentTheme.primaryColor ?? '#3b82f6',
      secondaryColor: settings.secondaryColor ?? currentTheme.secondaryColor ?? '#10b981',
      heroImageUrl: settings.heroImageUrl ?? currentTheme.heroImageUrl,
      faviconUrl: settings.faviconUrl ?? currentTheme.faviconUrl,
      headerStyle: settings.headerStyle ?? currentTheme.headerStyle,
    }

    // Build online ordering config
    const onlineOrderingConfig = {
      ...currentConfig,
      operatingHours: settings.operatingHours ?? currentConfig.operatingHours,
      useCustomDeliveryHours: settings.useCustomDeliveryHours ?? currentConfig.useCustomDeliveryHours,
      deliveryHours: settings.deliveryHours ?? currentConfig.deliveryHours,
      pickupEnabled: settings.pickupEnabled ?? currentConfig.pickupEnabled,
      deliveryEnabled: settings.deliveryEnabled ?? currentConfig.deliveryEnabled,
      preparationLeadTime: settings.preparationLeadTime ?? currentConfig.preparationLeadTime,
      acceptFutureOrdersOnly: settings.acceptFutureOrdersOnly ?? currentConfig.acceptFutureOrdersOnly,
      futureOrderMinDays: settings.futureOrderMinDays ?? currentConfig.futureOrderMinDays,
      futureOrderMaxDays: settings.futureOrderMaxDays ?? currentConfig.futureOrderMaxDays,
      minimumOrderAmount: settings.minimumOrderAmount ?? currentConfig.minimumOrderAmount,
      tippingEnabled: settings.tippingEnabled ?? currentConfig.tippingEnabled,
      tipConfig: settings.tipConfig ?? currentConfig.tipConfig,
      baseDeliveryFee: settings.baseDeliveryFee ?? currentConfig.baseDeliveryFee,
      freeDeliveryThreshold: settings.freeDeliveryThreshold ?? currentConfig.freeDeliveryThreshold,
      acceptOnlinePayments: settings.acceptOnlinePayments ?? currentConfig.acceptOnlinePayments,
      acceptCashOnDelivery: settings.acceptCashOnDelivery ?? currentConfig.acceptCashOnDelivery,
      acceptCardOnDelivery: settings.acceptCardOnDelivery ?? currentConfig.acceptCardOnDelivery,
      sendEmailOnNewOrder: settings.sendEmailOnNewOrder ?? currentConfig.sendEmailOnNewOrder,
      notificationEmail: settings.notificationEmail ?? currentConfig.notificationEmail,
      autoAcceptOrders: settings.autoAcceptOrders ?? currentConfig.autoAcceptOrders,
      autoClosePaidOrders: settings.autoClosePaidOrders ?? currentConfig.autoClosePaidOrders,
      convenienceFeeEnabled: settings.convenienceFeeEnabled ?? currentConfig.convenienceFeeEnabled,
      convenienceFeePercent: settings.convenienceFeePercent ?? currentConfig.convenienceFeePercent,
      convenienceFeeFlat: settings.convenienceFeeFlat ?? currentConfig.convenienceFeeFlat,
    }

    // Build site data
    const siteData: Record<string, unknown> = {
      location_id: locationId,
      theme_config: themeConfig,
      online_ordering_config: onlineOrderingConfig,
    }

    if (settings.storeName !== undefined) siteData.title = settings.storeName
    if (settings.storeSlug !== undefined && settings.storeSlug !== '') {
      siteData.subdomain = settings.storeSlug
    }
    if (settings.logoUrl !== undefined) siteData.logo_url = settings.logoUrl
    if (settings.bannerText !== undefined) siteData.banner_text = settings.bannerText
    if (settings.enabled !== undefined) siteData.is_active = settings.enabled

    if (existingSite) {
      // Update existing site
      const { error: siteError } = await supabase
        .from('sites')
        .update(siteData)
        .eq('id', existingSite.id)

      if (siteError) {
        console.error('[adminSaveOnlineOrderingSettings] Site update error:', siteError)
        return { success: false, error: siteError.message }
      }
    } else {
      // Create new site - need to get location name for defaults
      const { data: location } = await supabase
        .from('locations')
        .select('name')
        .eq('id', locationId)
        .single()

      siteData.merchant_id = merchantId
      if (!siteData.title) siteData.title = location?.name || 'Online Store'
      if (!siteData.subdomain) {
        siteData.subdomain = (location?.name || 'store').toLowerCase().replace(/\s+/g, '-')
      }

      const { error: siteError } = await supabase.from('sites').insert(siteData)

      if (siteError) {
        console.error('[adminSaveOnlineOrderingSettings] Site insert error:', siteError)
        return { success: false, error: siteError.message }
      }
    }

    // Fetch location name for audit log
    const { data: loc } = await supabase
      .from('locations')
      .select('name')
      .eq('id', locationId)
      .single()

    await LogAuditEvent({
      merchantId: merchantId,
      action: `HQ Admin Updated Online Ordering Settings`,
      actionCategory: 'settings',
      resourceType: 'online_ordering',
      resourceId: locationId,
      resourceName: loc?.name || 'Location',
      locationId: locationId,
      metadata: {
        location_name: loc?.name,
        updated_by_admin: userId,
        enabled: settings.enabled,
      },
    })

    return { success: true, error: null }
  } catch (error) {
    console.error('[adminSaveOnlineOrderingSettings] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Toggle online store enabled/disabled (admin access)
 */
export async function adminToggleOnlineStore(
  merchantId: string,
  locationId: string,
  enabled: boolean
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // Check if site exists
    const { data: existingSite } = await supabase
      .from('sites')
      .select('id')
      .eq('location_id', locationId)
      .single()

    if (!existingSite) {
      return { success: false, error: 'Online store not configured for this location' }
    }

    const { error } = await supabase
      .from('sites')
      .update({ is_active: enabled })
      .eq('id', existingSite.id)

    if (error) {
      console.error('[adminToggleOnlineStore] Error:', error)
      return { success: false, error: error.message }
    }

    // Fetch location name for audit log
    const { data: loc } = await supabase
      .from('locations')
      .select('name')
      .eq('id', locationId)
      .single()

    await LogAuditEvent({
      merchantId: merchantId,
      action: `HQ Admin ${enabled ? 'Enabled' : 'Disabled'} Online Store`,
      actionCategory: 'settings',
      resourceType: 'online_ordering',
      resourceId: locationId,
      resourceName: loc?.name || 'Location',
      locationId: locationId,
      metadata: {
        location_name: loc?.name,
        toggled_by_admin: userId,
        new_status: enabled,
      },
    })

    return { success: true, error: null }
  } catch (error) {
    console.error('[adminToggleOnlineStore] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Create/initialize online store for a location (admin access)
 */
export async function adminCreateOnlineStore(
  merchantId: string,
  locationId: string,
  locationName: string
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // Check if site already exists
    const { data: existingSite } = await supabase
      .from('sites')
      .select('id')
      .eq('location_id', locationId)
      .single()

    if (existingSite) {
      return { success: false, error: 'Online store already exists for this location' }
    }

    // Create default site
    const defaultSlug = locationName.toLowerCase().replace(/\s+/g, '-')
    const { data: newSite, error } = await supabase
      .from('sites')
      .insert({
        merchant_id: merchantId,
        location_id: locationId,
        title: locationName,
        subdomain: defaultSlug,
        is_active: false,
        theme_config: {
          primaryColor: '#3b82f6',
          secondaryColor: '#10b981',
        },
        online_ordering_config: {
          pickupEnabled: true,
          deliveryEnabled: false,
          preparationLeadTime: 15,
          minimumOrderAmount: 0,
          tippingEnabled: true,
          tipConfig: {
            calculationMethod: 'subtotal',
            presetPercentages: [15, 18, 20],
            smartTipEnabled: false,
            smartTipThreshold: 10,
            smartTipAmounts: [1, 2, 3],
            allowCustomTip: true,
          },
          acceptOnlinePayments: true,
          acceptCashOnDelivery: false,
          acceptCardOnDelivery: false,
          autoAcceptOrders: false,
          autoClosePaidOrders: false,
        },
      })
      .select()
      .single()

    if (error) {
      console.error('[adminCreateOnlineStore] Error:', error)
      return { success: false, error: error.message }
    }

    await LogAuditEvent({
      merchantId: merchantId,
      action: `HQ Admin Created Online Store for ${locationName}`,
      actionCategory: 'settings',
      resourceType: 'online_ordering',
      resourceId: locationId,
      resourceName: locationName,
      locationId: locationId,
      metadata: {
        location_name: locationName,
        created_by_admin: userId,
        site_id: newSite.id,
      },
    })

    return { success: true, data: newSite, error: null }
  } catch (error) {
    console.error('[adminCreateOnlineStore] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
