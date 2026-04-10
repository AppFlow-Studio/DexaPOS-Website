'use server'

// ============================================================================
// Admin Online Ordering Server Actions
// Description: View and manage merchant online ordering settings from HQ
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'dexaposai.com'

interface PaymentDeviceSummary {
  id: string
  device_label: string | null
  tpn: string
  use_for_online_ordering: boolean
  is_active: boolean
  ftd_key_configured: boolean
}

// ============================================================================
// Types
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
  ipospaysDeviceId?: string | null
  ipospaysDeviceLabel?: string | null
  ipospaysTpn?: string
  ipospaysFtdEcomKey?: string
  ipospaysFtdEcomKeyConfigured?: boolean
  tippingEnabled?: boolean
  tipConfig?: TipConfig
  baseDeliveryFee?: number
  freeDeliveryThreshold?: number
  convenienceFeeEnabled?: boolean
  convenienceFeePercent?: number
  convenienceFeeFlat?: number
}

async function whitelistDejavooDomain(
  tpn: string,
  storeSlug: string
): Promise<{ success: boolean; error?: string; skipped?: boolean; domain?: string }> {
  if (!tpn || !storeSlug) {
    return { success: false, error: 'TPN and store slug are required' }
  }

  const isDev = ROOT_DOMAIN.includes('localhost')
  const storeDomain = isDev
    ? `http://${storeSlug}.localhost:3000`
    : `https://${storeSlug}.${ROOT_DOMAIN}`

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.functions.invoke(
    'dejavoo-whitelist-domain',
    {
      body: { tpn, storeSlug, storeDomain },
    }
  )

  if (error) {
    console.error('[HQ_DEJAVOO_WHITELIST] Edge invoke error:', error)
    return {
      success: false,
      error: `Domain whitelist invoke error: ${error.message}`,
    }
  }

  const result = (data || {}) as { success?: boolean; skipped?: boolean; error?: string }
  return {
    success: Boolean(result.success),
    skipped: result.skipped,
    error: result.error,
    domain: storeDomain,
  }
}

async function getLocationPaymentDevices(locationId: string) {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('list_location_payment_devices', {
    p_location_id: locationId,
  })

  if (error) {
    console.error('[HQ_ONLINE_ORDERING] Failed to load payment devices:', error)
    return [] as PaymentDeviceSummary[]
  }

  return ((data as PaymentDeviceSummary[] | null) ?? []).filter(Boolean)
}

async function getSelectedLocationPaymentDevice(locationId: string) {
  const devices = await getLocationPaymentDevices(locationId)
  return (
    devices.find((device) => device.use_for_online_ordering && device.is_active) ??
    devices.find((device) => device.is_active) ??
    null
  )
}

// ============================================================================
// READ Operations
// ============================================================================

export async function getAdminOnlineOrderingSettings(
  merchantId: string,
  locationId: string
): Promise<{ success: boolean; data: Partial<OnlineOrderingSettings> | null; error: string | null }> {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    const { data: location, error: locError } = await supabase
      .from('locations')
      .select('id, name, phone, email, address_line1, city, state, postal_code, business_hours')
      .eq('id', locationId)
      .single()

    if (locError) {
      console.error('[getAdminOnlineOrderingSettings] Location error:', locError)
      return { success: false, data: null, error: locError.message }
    }

    const { data: config, error: configError } = await supabase
      .from('online_store_config')
      .select('*')
      .eq('location_id', locationId)
      .single()

    if (configError && configError.code !== 'PGRST116') {
      console.error('[getAdminOnlineOrderingSettings] Config error:', configError)
    }

    const selectedDevice = config
      ? await getSelectedLocationPaymentDevice(locationId)
      : null

    const settings: Partial<OnlineOrderingSettings> = {
      locationId,
      storeName: location.name,
      phone: location.phone ?? '',
      email: location.email ?? '',
      address: `${location.address_line1 || ''}, ${location.city || ''}, ${location.state || ''} ${location.postal_code || ''}`.trim(),
      operatingHours: location.business_hours as WeeklySchedule,
    }

    if (config) {
      settings.id = config.id
      settings.enabled = config.is_active ?? false
      settings.storeName = config.store_name || settings.storeName
      settings.storeSlug = config.slug ?? ''
      settings.logoUrl = config.logo_url
      settings.heroImageUrl = config.hero_image_url
      settings.faviconUrl = config.favicon_url
      settings.primaryColor = config.primary_color ?? '#2DD4BF'
      settings.secondaryColor = config.secondary_color ?? '#10b981'
      settings.phone = config.phone ?? settings.phone
      settings.email = config.email ?? settings.email

      if (config.operating_hours) settings.operatingHours = config.operating_hours as WeeklySchedule
      settings.pickupEnabled = config.accepts_pickup
      settings.deliveryEnabled = config.accepts_delivery
      settings.preparationLeadTime = config.estimated_prep_minutes
      settings.futureOrderMaxDays = config.max_future_order_days
      settings.minimumOrderAmount = config.min_order_cents ? config.min_order_cents / 100 : 0
      settings.tippingEnabled = config.tip_enabled
      if (config.tip_presets) {
        settings.tipConfig = {
          presetPercentages: config.tip_presets as number[],
          calculationMethod: 'subtotal',
          smartTipEnabled: false,
          smartTipThreshold: 10,
          smartTipAmounts: [1, 2, 3],
          allowCustomTip: true,
        }
      }
      settings.baseDeliveryFee = config.delivery_fee_cents ? config.delivery_fee_cents / 100 : 0
      settings.freeDeliveryThreshold = config.free_delivery_threshold_cents
        ? config.free_delivery_threshold_cents / 100
        : 0
      settings.acceptOnlinePayments = config.accepts_online_payments ?? true
      settings.acceptCashOnDelivery = config.accepts_cash_on_delivery ?? false
      settings.acceptCardOnDelivery = config.accepts_card_on_delivery ?? false
      settings.ipospaysDeviceId = selectedDevice?.id ?? null
      settings.ipospaysDeviceLabel = selectedDevice?.device_label ?? null
      settings.ipospaysTpn = selectedDevice?.tpn ?? config.ipospays_tpn ?? ''
      settings.ipospaysFtdEcomKey = ''
      settings.ipospaysFtdEcomKeyConfigured = selectedDevice?.ftd_key_configured ?? false
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

export async function getAdminMerchantOnlineOrderingOverview(merchantId: string) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

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

    const { data: configs, error: configError } = await supabase
      .from('online_store_config')
      .select('id, location_id, is_active, store_name, slug')
      .in('location_id', locationIds)

    if (configError) {
      console.error('[getAdminMerchantOnlineOrderingOverview] Config error:', configError)
    }

    const configMap = new Map<
      string,
      { id: string; location_id: string; is_active: boolean | null; store_name: string | null; slug: string | null }
    >(configs?.map((c) => [c.location_id, c]) || [])
    const result = locations?.map((loc) => {
      const config = configMap.get(loc.id)
      return {
        locationId: loc.id,
        locationName: loc.name,
        hasOnlineStore: !!config,
        isEnabled: config?.is_active ?? false,
        storeName: config?.store_name || loc.name,
        storeSlug: config?.slug || null,
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

export async function adminSaveOnlineOrderingSettings(
  merchantId: string,
  locationId: string,
  settings: Partial<OnlineOrderingSettings>
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

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

    const { data: existingConfig } = await supabase
      .from('online_store_config')
      .select('*')
      .eq('location_id', locationId)
      .single()

    const existingPaymentDevice = await getSelectedLocationPaymentDevice(locationId)

    const configData: Record<string, unknown> = {
      location_id: locationId,
      merchant_id: merchantId,
    }

    if (settings.storeName !== undefined) configData.store_name = settings.storeName
    if (settings.storeSlug !== undefined && settings.storeSlug !== '') {
      configData.slug = settings.storeSlug
    }
    if (settings.enabled !== undefined) configData.is_active = settings.enabled
    if (settings.logoUrl !== undefined) configData.logo_url = settings.logoUrl
    if (settings.heroImageUrl !== undefined) configData.hero_image_url = settings.heroImageUrl
    if (settings.faviconUrl !== undefined) configData.favicon_url = settings.faviconUrl
    if (settings.primaryColor !== undefined) configData.primary_color = settings.primaryColor
    if (settings.secondaryColor !== undefined) configData.secondary_color = settings.secondaryColor
    if (settings.phone !== undefined) configData.phone = settings.phone
    if (settings.email !== undefined) configData.email = settings.email
    if (settings.operatingHours !== undefined) configData.operating_hours = settings.operatingHours
    if (settings.pickupEnabled !== undefined) configData.accepts_pickup = settings.pickupEnabled
    if (settings.deliveryEnabled !== undefined) configData.accepts_delivery = settings.deliveryEnabled
    if (settings.minimumOrderAmount !== undefined)
      configData.min_order_cents = Math.round(settings.minimumOrderAmount * 100)
    if (settings.preparationLeadTime !== undefined)
      configData.estimated_prep_minutes = settings.preparationLeadTime
    if (settings.futureOrderMaxDays !== undefined)
      configData.max_future_order_days = settings.futureOrderMaxDays
    if (settings.baseDeliveryFee !== undefined)
      configData.delivery_fee_cents = Math.round(settings.baseDeliveryFee * 100)
    if (settings.freeDeliveryThreshold !== undefined)
      configData.free_delivery_threshold_cents =
        settings.freeDeliveryThreshold > 0
          ? Math.round(settings.freeDeliveryThreshold * 100)
          : null
    if (settings.tippingEnabled !== undefined) configData.tip_enabled = settings.tippingEnabled
    if (settings.tipConfig?.presetPercentages !== undefined)
      configData.tip_presets = settings.tipConfig.presetPercentages
    if (settings.acceptOnlinePayments !== undefined)
      configData.accepts_online_payments = settings.acceptOnlinePayments
    if (settings.acceptCashOnDelivery !== undefined)
      configData.accepts_cash_on_delivery = settings.acceptCashOnDelivery
    if (settings.acceptCardOnDelivery !== undefined)
      configData.accepts_card_on_delivery = settings.acceptCardOnDelivery
    if (settings.ipospaysTpn !== undefined) configData.ipospays_tpn = settings.ipospaysTpn || null

    const previousSlug = existingConfig?.slug ?? null
    const nextSlugCandidate =
      settings.storeSlug !== undefined && settings.storeSlug !== '' ? settings.storeSlug : previousSlug
    const slugIsChanging = nextSlugCandidate !== null && nextSlugCandidate !== previousSlug
    const nextTpn =
      settings.ipospaysTpn !== undefined
        ? settings.ipospaysTpn.trim() || null
        : existingPaymentDevice?.tpn ?? existingConfig?.ipospays_tpn ?? null
    const currentTpn =
      existingPaymentDevice?.tpn ?? existingConfig?.ipospays_tpn ?? null
    const tpnIsChanging = nextTpn !== currentTpn
    const providedFtdKey = settings.ipospaysFtdEcomKey?.trim() ?? ''
    const shouldUpsertPaymentDevice =
      Boolean(nextTpn) &&
      (tpnIsChanging || providedFtdKey.length > 0 || !existingPaymentDevice)

    if (shouldUpsertPaymentDevice && providedFtdKey.length === 0) {
      return {
        success: false,
        error: existingPaymentDevice
          ? 'Enter the FTD Ecom/TOP key when changing the online-ordering TPN.'
          : 'TPN and FTD Ecom/TOP key are both required to configure online card payments.',
      }
    }

    if (existingConfig) {
      const { error: updateError } = await supabase
        .from('online_store_config')
        .update(configData)
        .eq('id', existingConfig.id)

      if (updateError) {
        console.error('[adminSaveOnlineOrderingSettings] Config update error:', updateError)
        return { success: false, error: updateError.message }
      }
    } else {
      const { data: location } = await supabase
        .from('locations')
        .select('name')
        .eq('id', locationId)
        .single()

      if (!configData.store_name) configData.store_name = location?.name || 'Online Store'
      if (!configData.slug) {
        configData.slug = (location?.name || 'store')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      }

      const { data: newConfig, error: insertError } = await supabase
        .from('online_store_config')
        .insert(configData)
        .select('id')
        .single()

      if (insertError) {
        console.error('[adminSaveOnlineOrderingSettings] Config insert error:', insertError)
        return { success: false, error: insertError.message }
      }

      if (newConfig) {
        await supabase.from('online_store_pages').insert([
          {
            store_config_id: newConfig.id,
            page_type: 'home',
            section_type: 'hero',
            title: configData.store_name as string,
            subtitle: 'Order online for pickup or delivery',
            cta_text: 'Order Now',
            cta_link: '/menu',
            display_order: 0,
            is_visible: true,
          },
          {
            store_config_id: newConfig.id,
            page_type: 'home',
            section_type: 'hours',
            title: 'Hours',
            display_order: 1,
            is_visible: true,
          },
          {
            store_config_id: newConfig.id,
            page_type: 'home',
            section_type: 'location_map',
            title: 'Find Us',
            display_order: 2,
            is_visible: true,
          },
        ])
      }
    }

    if (shouldUpsertPaymentDevice && nextTpn) {
      const { error: paymentDeviceError } = await supabase.rpc(
        'upsert_location_payment_device',
        {
          p_location_id: locationId,
          p_tpn: nextTpn,
          p_ftd_ecom_key: providedFtdKey,
          p_device_label:
            settings.ipospaysDeviceLabel?.trim() ||
            existingPaymentDevice?.device_label ||
            'Online ordering device',
          p_use_for_online_ordering: true,
        }
      )

      if (paymentDeviceError) {
        return {
          success: false,
          error: `Payment device update failed: ${paymentDeviceError.message}`,
        }
      }
    } else if (settings.ipospaysTpn !== undefined && !nextTpn) {
      const { error: clearPaymentDeviceError } = await supabase
        .from('location_payment_devices')
        .update({ use_for_online_ordering: false })
        .eq('location_id', locationId)
        .eq('use_for_online_ordering', true)

      if (clearPaymentDeviceError) {
        return {
          success: false,
          error: `Failed to clear selected payment device: ${clearPaymentDeviceError.message}`,
        }
      }
    }

    const { data: loc } = await supabase
      .from('locations')
      .select('name')
      .eq('id', locationId)
      .single()

    await LogAuditEvent({
      merchantId,
      action: `HQ Admin Updated Online Store Config`,
      actionCategory: 'settings',
      resourceType: 'online_store',
      resourceId: locationId,
      resourceName: loc?.name || 'Location',
      locationId,
      metadata: {
        location_name: loc?.name,
        updated_by_admin: userId,
        enabled: settings.enabled,
      },
    })

    const finalSlug = (configData.slug as string | undefined) ?? existingConfig?.slug ?? ''
    const finalTpn = nextTpn
    const shouldWhitelist = Boolean((tpnIsChanging || slugIsChanging) && finalTpn && finalSlug)

    let domainWhitelistError: string | undefined
    let domainWhitelistSkipped = false
    if (shouldWhitelist) {
      const whitelistResult = await whitelistDejavooDomain(finalTpn as string, finalSlug)
      if (!whitelistResult.success && !whitelistResult.skipped) {
        domainWhitelistError = whitelistResult.error || 'Domain whitelist failed'
        console.error('[adminSaveOnlineOrderingSettings] Domain whitelist failed:', domainWhitelistError)
      }
      if (whitelistResult.skipped) {
        domainWhitelistSkipped = true
      }
    }

    return {
      success: true,
      error: null,
      domainWhitelisted: shouldWhitelist,
      domainWhitelistError,
      domainWhitelistSkipped,
    }
  } catch (error) {
    console.error('[adminSaveOnlineOrderingSettings] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function adminToggleOnlineStore(
  merchantId: string,
  locationId: string,
  enabled: boolean
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    const { data: existingConfig } = await supabase
      .from('online_store_config')
      .select('id, slug')
      .eq('location_id', locationId)
      .single()

    const selectedDevice = await getSelectedLocationPaymentDevice(locationId)

    if (!existingConfig) {
      return { success: false, error: 'Online store not configured for this location' }
    }

    const { error } = await supabase
      .from('online_store_config')
      .update({ is_active: enabled })
      .eq('id', existingConfig.id)

    if (error) {
      console.error('[adminToggleOnlineStore] Error:', error)
      return { success: false, error: error.message }
    }

    const { data: loc } = await supabase
      .from('locations')
      .select('name')
      .eq('id', locationId)
      .single()

    await LogAuditEvent({
      merchantId,
      action: `HQ Admin ${enabled ? 'Enabled' : 'Disabled'} Online Store`,
      actionCategory: 'settings',
      resourceType: 'online_store',
      resourceId: locationId,
      resourceName: loc?.name || 'Location',
      locationId,
      metadata: {
        location_name: loc?.name,
        toggled_by_admin: userId,
        new_status: enabled,
      },
    })

    let domainWhitelistError: string | undefined
    let domainWhitelistSkipped = false
    if (enabled && selectedDevice?.tpn && existingConfig.slug) {
      const whitelistResult = await whitelistDejavooDomain(selectedDevice.tpn, existingConfig.slug)
      if (!whitelistResult.success && !whitelistResult.skipped) {
        domainWhitelistError = whitelistResult.error || 'Domain whitelist failed'
        console.error('[adminToggleOnlineStore] Domain whitelist failed:', domainWhitelistError)
      }
      if (whitelistResult.skipped) {
        domainWhitelistSkipped = true
      }
    }

    return { success: true, error: null, domainWhitelistError, domainWhitelistSkipped }
  } catch (error) {
    console.error('[adminToggleOnlineStore] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function adminRetriggerDomainWhitelist(
  merchantId: string,
  locationId: string
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()
    const selectedDevice = await getSelectedLocationPaymentDevice(locationId)
    const { data: config, error } = await supabase
      .from('online_store_config')
      .select('slug')
      .eq('merchant_id', merchantId)
      .eq('location_id', locationId)
      .single()

    if (error || !config) {
      return { success: false, error: 'Store config not found for this location' }
    }
    if (!selectedDevice?.tpn) {
      return { success: false, error: 'No TPN configured for this location' }
    }
    if (!config.slug) {
      return { success: false, error: 'No store slug configured for this location' }
    }

    const result = await whitelistDejavooDomain(selectedDevice.tpn, config.slug)
    if (!result.success) {
      return { success: false, skipped: result.skipped, error: result.error || 'Domain whitelist failed' }
    }
    return { success: true, skipped: result.skipped }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function adminCreateOnlineStore(
  merchantId: string,
  locationId: string,
  locationName: string
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    const { data: existingConfig } = await supabase
      .from('online_store_config')
      .select('id')
      .eq('location_id', locationId)
      .single()

    if (existingConfig) {
      return { success: false, error: 'Online store already exists for this location' }
    }

    const defaultSlug = locationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const { data: newConfig, error } = await supabase
      .from('online_store_config')
      .insert({
        merchant_id: merchantId,
        location_id: locationId,
        store_name: locationName,
        slug: defaultSlug,
        is_active: false,
        primary_color: '#2DD4BF',
        accepts_pickup: true,
        accepts_delivery: false,
        estimated_prep_minutes: 15,
        min_order_cents: 0,
        tip_enabled: true,
        tip_presets: [15, 18, 20],
      })
      .select()
      .single()

    if (error) {
      console.error('[adminCreateOnlineStore] Error:', error)
      return { success: false, error: error.message }
    }

    // Seed default pages
    if (newConfig) {
      await supabase.from('online_store_pages').insert([
        {
          store_config_id: newConfig.id,
          page_type: 'home',
          section_type: 'hero',
          title: locationName,
          subtitle: 'Order online for pickup or delivery',
          cta_text: 'Order Now',
          cta_link: '/menu',
          display_order: 0,
          is_visible: true,
        },
        {
          store_config_id: newConfig.id,
          page_type: 'home',
          section_type: 'hours',
          title: 'Hours',
          display_order: 1,
          is_visible: true,
        },
        {
          store_config_id: newConfig.id,
          page_type: 'home',
          section_type: 'location_map',
          title: 'Find Us',
          display_order: 2,
          is_visible: true,
        },
      ])
    }

    await LogAuditEvent({
      merchantId,
      action: `HQ Admin Created Online Store for ${locationName}`,
      actionCategory: 'settings',
      resourceType: 'online_store',
      resourceId: locationId,
      resourceName: locationName,
      locationId,
      metadata: {
        location_name: locationName,
        created_by_admin: userId,
        config_id: newConfig.id,
      },
    })

    return { success: true, data: newConfig, error: null }
  } catch (error) {
    console.error('[adminCreateOnlineStore] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
