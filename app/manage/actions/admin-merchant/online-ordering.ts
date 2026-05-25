'use server'

// ============================================================================
// Admin Online Ordering Server Actions
// Description: View and manage merchant online ordering settings from HQ
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import { revalidatePath } from 'next/cache'
import { createClerkClient } from '@clerk/backend'
import {
  buildOnlineStoreReviewChecklist,
  canHqEditStoreSetup,
  extractLocationOnlineStoreReviewPacket,
  extractMerchantOnlineStoreReviewPacket,
  getDefaultStoreSlug,
  normalizeOnlineStoreRequestStatus,
  sendOnlineStoreDecisionEmail,
  type LocationOnlineStoreReviewPacket,
  type MerchantOnlineStoreReviewPacket,
  type OnlineStoreReviewChecklist,
} from '@/lib/online-store/setup-flow'
import { uploadMerchantDocument, uploadOrganizationDocument } from '@/lib/cdn/server'
import {
  syncStorefrontWhitelistForLocation,
  type WhitelistSyncResult,
} from '@/lib/payments/storefront-whitelist'

type MissingRequestFieldKey =
  | 'legalBusinessName'
  | 'dbaName'
  | 'einTaxId'
  | 'w9Form'
  | 'ownerFirstName'
  | 'ownerLastName'
  | 'ownerDob'
  | 'ownerSsn'
  | 'ownerGovernmentId'
  | 'bankName'
  | 'accountHolderName'
  | 'ddaAccountNumber'
  | 'routingNumber'
  | 'bankSupportDocument'

type RequestPacketMissing = Record<MissingRequestFieldKey, boolean>

export type AdminOnlineStoreRequestRequirementsResult = {
  success: boolean
  complete: boolean
  missing: RequestPacketMissing
  values: Partial<Record<MissingRequestFieldKey, string>>
  error?: string
}

function emptyMissing(): RequestPacketMissing {
  return {
    legalBusinessName: false,
    dbaName: false,
    einTaxId: false,
    w9Form: false,
    ownerFirstName: false,
    ownerLastName: false,
    ownerDob: false,
    ownerSsn: false,
    ownerGovernmentId: false,
    bankName: false,
    accountHolderName: false,
    ddaAccountNumber: false,
    routingNumber: false,
    bankSupportDocument: false,
  }
}

function hasAnyMissing(missing: RequestPacketMissing): boolean {
  return Object.values(missing).some(Boolean)
}

function normalizeDigits(value: string): string {
  return value.replace(/\\D/g, '')
}

function readMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

async function getClerkOrganizationPublicMetadata(
  clerkOrgId?: string | null
): Promise<Record<string, unknown>> {
  if (!clerkOrgId || !process.env.CLERK_SECRET_KEY) {
    return {}
  }

  try {
    const clerkClient = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    })
    const organization = await clerkClient.organizations.getOrganization({
      organizationId: clerkOrgId,
    })

    return (organization.publicMetadata as Record<string, unknown>) ?? {}
  } catch (error) {
    console.error(
      '[HQ_ONLINE_ORDERING] Failed to load Clerk organization metadata:',
      error
    )
    return {}
  }
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

interface LocationNmiPaymentDeviceSummary {
  id: string
  location_id: string
  provider: string
  provider_public_key: string | null
  is_active: boolean
  use_for_online_ordering: boolean
  status: string
  environment: string
  provider_merchant_id: string | null
  provider_gateway_id: string | null
  has_provider_secret: boolean
}

interface OnlineOrderingSettings {
  id?: string
  locationId: string
  setupRequestStatus?: 'not_requested' | 'pending_review' | 'approved' | 'rejected' | 'setup_completed'
  setupRequestedAt?: string | null
  setupRequestedBy?: string | null
  setupReviewedAt?: string | null
  setupReviewedBy?: string | null
  setupApprovedAt?: string | null
  setupCompletedAt?: string | null
  setupRejectionReason?: string | null
  merchantReviewPacket?: MerchantOnlineStoreReviewPacket
  locationReviewPacket?: LocationOnlineStoreReviewPacket
  reviewChecklist?: OnlineStoreReviewChecklist
  enabled: boolean
  storeName: string
  storeSlug: string
  storeUrl?: string
  description?: string
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
  ogImageUrl?: string | null
  bannerText?: string | null
  templateId?: 'classic' | 'bold' | 'minimal'
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string | null
  backgroundColor?: string
  textColor?: string
  borderColor?: string | null
  cardColor?: string | null
  fontFamily?: string | null
  headerStyle?: 'filled' | 'transparent' | 'outlined'
  headerTextColor?: string | null
  menuLayout?: 'cards' | 'sidebyside' | 'no-images'
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
  nmiTokenizationKey?: string
  nmiPrivateApiKey?: string
  nmiConfigured?: boolean
  tippingEnabled?: boolean
  tipConfig?: TipConfig
  baseDeliveryFee?: number
  freeDeliveryThreshold?: number
  convenienceFeeEnabled?: boolean
  convenienceFeePercent?: number
  convenienceFeeFlat?: number
}

async function getLocationNmiPaymentDevice(
  locationId: string
) {
  const supabase = createServerSupabaseClient() as any
  const { data, error } = await supabase.rpc('list_location_payment_devices', {
    p_location_id: locationId,
  })

  if (error) {
    console.error('[HQ_ONLINE_ORDERING] Failed to load location payment devices:', error)
    return null
  }

  const devices = ((data as LocationNmiPaymentDeviceSummary[] | null) ?? [])
    .filter((device) => device.provider === 'nmi')

  return (
    devices.find((device) => device.use_for_online_ordering) ??
    null
  )
}

async function buildRequestedStoreSlug(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  locationName: string,
  locationId: string
) {
  const baseSlug = getDefaultStoreSlug(locationName) || 'store'
  const candidates = [baseSlug, `${baseSlug}-${locationId.slice(0, 8)}`]

  for (const candidate of candidates) {
    const { data: existing } = await supabase
      .from('online_store_config')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()

    if (!existing) {
      return candidate
    }
  }

  return `${baseSlug}-${Date.now().toString().slice(-6)}`
}

// ============================================================================
// Storefront whitelist sync (QR-32)
//
// The actual sync logic lives in lib/payments/storefront-whitelist.ts so the
// same code path is reused by the standalone backfill/audit scripts under
// scripts/. Kept the type alias here for backward compatibility with anything
// that imports `StorefrontWhitelistSyncResult` from this module.
// See docs/RUNBOOK-PAYMENT-WHITELIST-SYNC.md.
// ============================================================================

export type StorefrontWhitelistSyncResult = WhitelistSyncResult

async function syncStorefrontWhitelist(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  locationId: string
): Promise<StorefrontWhitelistSyncResult> {
  return syncStorefrontWhitelistForLocation(supabase as any, locationId)
}

async function getReviewContext(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  merchantId: string,
  locationId: string
) {
  const [{ data: merchant }, { data: location }] = await Promise.all([
    supabase
      .from('merchants')
      .select(
        'id, name, owner_email, owner_first_name, owner_last_name, business_legal_name, dba_name, ein_last_four, public_metadata, clerk_org_id'
      )
      .eq('id', merchantId)
      .single(),
    supabase
      .from('locations')
      .select(
        'id, name, phone, email, address_line1, city, state, postal_code, business_hours, public_metadata'
      )
      .eq('id', locationId)
      .single(),
  ])

  const clerkMetadata = await getClerkOrganizationPublicMetadata(
    merchant?.clerk_org_id
  )

  const merchantReviewSource = merchant
    ? {
        ...merchant,
        public_metadata: {
          ...((merchant.public_metadata as Record<string, unknown> | null) ?? {}),
          ...(clerkMetadata ?? {}),
        },
        business_legal_name:
          merchant.business_legal_name ??
          readMetadataString(clerkMetadata, 'business_legal_name') ??
          readMetadataString(clerkMetadata, 'legal_business_name'),
        dba_name:
          merchant.dba_name ??
          readMetadataString(clerkMetadata, 'dba_name') ??
          readMetadataString(clerkMetadata, 'business_name'),
        owner_first_name:
          merchant.owner_first_name ??
          readMetadataString(clerkMetadata, 'owner_first_name'),
        owner_last_name:
          merchant.owner_last_name ??
          readMetadataString(clerkMetadata, 'owner_last_name'),
      }
    : merchant

  const merchantReviewPacket =
    extractMerchantOnlineStoreReviewPacket(merchantReviewSource)
  const locationReviewPacket = extractLocationOnlineStoreReviewPacket(location)
  const reviewChecklist = buildOnlineStoreReviewChecklist(
    merchantReviewPacket,
    locationReviewPacket
  )

  return {
    merchant: merchantReviewSource,
    location,
    merchantReviewPacket,
    locationReviewPacket,
    reviewChecklist,
  }
}

export async function getAdminOnlineStoreRequestRequirements(
  merchantId: string,
  locationId: string
): Promise<AdminOnlineStoreRequestRequirementsResult> {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()
    const { merchant, location, merchantReviewPacket, locationReviewPacket } =
      await getReviewContext(supabase, merchantId, locationId)

    const missing = emptyMissing()

    if (!merchant || !location) {
      missing.legalBusinessName = true
      return {
        success: false,
        complete: false,
        missing,
        values: {},
        error: 'Merchant/location not found',
      }
    }

    // Granular merchant identity fields (first/last are stored separately)
    const md =
      (merchant.public_metadata as Record<string, unknown> | null) ?? {}
    const ownerFirstName =
      (typeof (merchant as any).owner_first_name === 'string' &&
      (merchant as any).owner_first_name.trim().length > 0
        ? (merchant as any).owner_first_name.trim()
        : null) ??
      readMetadataString(md, 'owner_first_name')
    const ownerLastName =
      (typeof (merchant as any).owner_last_name === 'string' &&
      (merchant as any).owner_last_name.trim().length > 0
        ? (merchant as any).owner_last_name.trim()
        : null) ??
      readMetadataString(md, 'owner_last_name')

    if (!merchantReviewPacket?.legalBusinessName) missing.legalBusinessName = true
    if (!merchantReviewPacket?.dbaName) missing.dbaName = true
    if (!merchantReviewPacket?.einTaxId) missing.einTaxId = true
    if (!merchantReviewPacket?.w9FormUrl) missing.w9Form = true

    if (!ownerFirstName) missing.ownerFirstName = true
    if (!ownerLastName) missing.ownerLastName = true
    if (!merchantReviewPacket?.ownerDob) missing.ownerDob = true
    if (!merchantReviewPacket?.ownerSsn) missing.ownerSsn = true
    if (!merchantReviewPacket?.ownerGovernmentIdUrl) missing.ownerGovernmentId = true

    if (!locationReviewPacket?.bankName) missing.bankName = true
    if (!locationReviewPacket?.accountHolderName) missing.accountHolderName = true
    if (!locationReviewPacket?.ddaAccountNumber) missing.ddaAccountNumber = true
    if (!locationReviewPacket?.routingNumber) missing.routingNumber = true
    if (!locationReviewPacket?.bankSupportDocumentUrl) missing.bankSupportDocument = true

    const values: Partial<Record<MissingRequestFieldKey, string>> = {
      legalBusinessName: merchantReviewPacket?.legalBusinessName ?? '',
      dbaName: merchantReviewPacket?.dbaName ?? '',
      einTaxId: merchantReviewPacket?.einTaxId ?? '',
      ownerFirstName: ownerFirstName ?? '',
      ownerLastName: ownerLastName ?? '',
      ownerDob: merchantReviewPacket?.ownerDob ?? '',
      ownerSsn: merchantReviewPacket?.ownerSsn ?? '',
      bankName: locationReviewPacket?.bankName ?? '',
      accountHolderName: locationReviewPacket?.accountHolderName ?? '',
      ddaAccountNumber: locationReviewPacket?.ddaAccountNumber ?? '',
      routingNumber: locationReviewPacket?.routingNumber ?? '',
    }

    return {
      success: true,
      complete: !hasAnyMissing(missing),
      missing,
      values,
    }
  } catch (error) {
    const missing = emptyMissing()
    missing.legalBusinessName = true
    return {
      success: false,
      complete: false,
      missing,
      values: {},
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function adminSaveOnlineStoreRequestRequirements(formData: FormData): Promise<{
  success: boolean
  error?: string
}> {
  try {
    await assertHQPermission('hq.merchant.update')

    const merchantId = String(formData.get('merchantId') || '')
    const locationId = String(formData.get('locationId') || '')

    if (!merchantId || !locationId) {
      return { success: false, error: 'merchantId and locationId are required' }
    }

    const supabase = createServerSupabaseClient()
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id, clerk_org_id')
      .eq('id', merchantId)
      .single()

    if (merchantError || !merchant?.clerk_org_id) {
      return { success: false, error: 'Merchant organization not found' }
    }

    const organizationId = merchant.clerk_org_id as string

    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
    const org = await clerkClient.organizations.getOrganization({ organizationId })
    const currentMetadata = (org.publicMetadata as Record<string, unknown>) ?? {}
    const metadataUpdates: Record<string, unknown> = { ...currentMetadata }

    const readText = (key: string) => {
      const raw = formData.get(key)
      if (typeof raw !== 'string') return null
      const trimmed = raw.trim()
      return trimmed.length > 0 ? trimmed : null
    }

    const legalBusinessName = readText('legalBusinessName')
    const dbaName = readText('dbaName')
    const einTaxIdRaw = readText('einTaxId')
    const ownerFirstName = readText('ownerFirstName')
    const ownerLastName = readText('ownerLastName')
    const ownerDob = readText('ownerDob')
    const ownerSsnRaw = readText('ownerSsn')

    const einTaxId = einTaxIdRaw ? normalizeDigits(einTaxIdRaw) : null
    const ownerSsn = ownerSsnRaw ? normalizeDigits(ownerSsnRaw) : null

    if (legalBusinessName) {
      metadataUpdates.business_legal_name = legalBusinessName
      metadataUpdates.legal_business_name = legalBusinessName
    }
    if (dbaName) {
      metadataUpdates.dba_name = dbaName
      metadataUpdates.business_name = dbaName
    }
    if (einTaxId) {
      metadataUpdates.online_store_ein_tax_id = einTaxId
      metadataUpdates.ein_tax_id = einTaxId
      metadataUpdates.ein_last_four = einTaxId.slice(-4)
    }
    if (ownerFirstName) metadataUpdates.owner_first_name = ownerFirstName
    if (ownerLastName) metadataUpdates.owner_last_name = ownerLastName
    if (ownerDob) metadataUpdates.online_store_owner_dob = ownerDob
    if (ownerSsn) metadataUpdates.online_store_owner_ssn = ownerSsn

    const w9File = formData.get('w9FormFile')
    const ownerIdFile = formData.get('ownerGovernmentIdFile')

    if (w9File && typeof w9File !== 'string') {
      const file = w9File as File
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      if (!isPdf) return { success: false, error: 'W-9 must be uploaded as a PDF' }

      const uploadResult = await uploadOrganizationDocument(file, organizationId, 'online-store-w9')
      if (!uploadResult.success || !uploadResult.cdnUrl) {
        return { success: false, error: uploadResult.error || 'Failed to upload W-9 PDF' }
      }
      metadataUpdates.online_store_w9_form_url = uploadResult.cdnUrl
      metadataUpdates.w9_form_url = uploadResult.cdnUrl
    }

    if (ownerIdFile && typeof ownerIdFile !== 'string') {
      const file = ownerIdFile as File
      const uploadResult = await uploadOrganizationDocument(file, organizationId, 'online-store-owner-id')
      if (!uploadResult.success || !uploadResult.cdnUrl) {
        return { success: false, error: uploadResult.error || 'Failed to upload owner government ID' }
      }
      metadataUpdates.online_store_owner_government_id_url = uploadResult.cdnUrl
    }

    await clerkClient.organizations.updateOrganization(organizationId, {
      publicMetadata: metadataUpdates,
    })

    // Location banking packet updates
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('id, merchant_id, public_metadata')
      .eq('id', locationId)
      .single()

    if (locationError || !location) {
      return { success: false, error: 'Location not found' }
    }

    const bankName = readText('bankName')
    const accountHolderName = readText('accountHolderName')
    const ddaAccountNumber = readText('ddaAccountNumber')
    const routingNumber = readText('routingNumber')
    const bankSupportFile = formData.get('bankSupportDocumentFile')

    const locationMetadata = (location.public_metadata as Record<string, unknown> | null) ?? {}
    const nextLocationMetadata: Record<string, unknown> = { ...locationMetadata }

    if (bankName) nextLocationMetadata.online_store_bank_name = bankName
    if (accountHolderName) nextLocationMetadata.online_store_account_holder_name = accountHolderName
    if (ddaAccountNumber) nextLocationMetadata.online_store_bank_dda_account_number = ddaAccountNumber
    if (routingNumber) nextLocationMetadata.online_store_bank_routing_number = routingNumber

    if (bankSupportFile && typeof bankSupportFile !== 'string') {
      const file = bankSupportFile as File
      const uploadResult = await uploadMerchantDocument(file, merchantId, 'online-store-bank-support')
      if (!uploadResult.success || !uploadResult.cdnUrl) {
        return { success: false, error: uploadResult.error || 'Failed to upload bank support document' }
      }
      nextLocationMetadata.online_store_bank_support_document_url = uploadResult.cdnUrl
    }

    const { error: locationUpdateError } = await supabase
      .from('locations')
      .update({ public_metadata: nextLocationMetadata, updated_at: new Date().toISOString() })
      .eq('id', locationId)

    if (locationUpdateError) {
      return { success: false, error: locationUpdateError.message }
    }

    revalidateOnlineStorePaths(merchantId)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save required information',
    }
  }
}

function revalidateOnlineStorePaths(merchantId: string) {
  revalidatePath(`/manage/merchants/${merchantId}`)
  revalidatePath('/dashboard/online-ordering')
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
    const {
      merchant,
      location,
      merchantReviewPacket,
      locationReviewPacket,
      reviewChecklist,
    } = await getReviewContext(supabase, merchantId, locationId)

    if (!location) {
      return { success: false, data: null, error: 'Location not found' }
    }

    const { data: config, error: configError } = await supabase
      .from('online_store_config')
      .select('*')
      .eq('location_id', locationId)
      .single()

    if (configError && configError.code !== 'PGRST116') {
      console.error('[getAdminOnlineOrderingSettings] Config error:', configError)
    }

    const locationPaymentDevice = await getLocationNmiPaymentDevice(locationId)

    const settings: Partial<OnlineOrderingSettings> = {
      locationId,
      setupRequestStatus: 'not_requested',
      setupRequestedAt: null,
      setupRequestedBy: null,
      setupReviewedAt: null,
      setupReviewedBy: null,
      setupApprovedAt: null,
      setupCompletedAt: null,
      setupRejectionReason: null,
      merchantReviewPacket,
      locationReviewPacket,
      reviewChecklist,
      storeName: location.name,
      phone: location.phone ?? '',
      email: location.email ?? '',
      address: `${location.address_line1 || ''}, ${location.city || ''}, ${location.state || ''} ${location.postal_code || ''}`.trim(),
      operatingHours: location.business_hours as WeeklySchedule,
    }

    if (config) {
      const setupRequestStatus = normalizeOnlineStoreRequestStatus(
        config.setup_request_status
      )
      settings.id = config.id
      settings.setupRequestStatus = setupRequestStatus
      settings.setupRequestedAt = config.setup_requested_at ?? null
      settings.setupRequestedBy = config.setup_requested_by ?? null
      settings.setupReviewedAt = config.setup_reviewed_at ?? null
      settings.setupReviewedBy = config.setup_reviewed_by ?? null
      settings.setupApprovedAt = config.setup_approved_at ?? null
      settings.setupCompletedAt = config.setup_completed_at ?? null
      settings.setupRejectionReason = config.setup_rejection_reason ?? null
      settings.enabled = config.is_active ?? false
      settings.storeName = config.store_name || settings.storeName
      settings.storeSlug = config.slug ?? ''
      settings.description = config.description ?? ''
      settings.logoUrl = config.logo_url
      settings.heroImageUrl = config.hero_image_url
      settings.faviconUrl = config.favicon_url
      settings.ogImageUrl = config.og_image_url
      settings.templateId = (config.template_id ?? 'classic') as OnlineOrderingSettings['templateId']
      settings.primaryColor = config.primary_color ?? '#2DD4BF'
      settings.secondaryColor = config.secondary_color ?? '#10b981'
      settings.accentColor = config.accent_color ?? null
      settings.backgroundColor = config.background_color ?? '#FFFFFF'
      settings.textColor = config.text_color ?? '#111827'
      settings.borderColor = config.border_color ?? null
      settings.cardColor = config.card_color ?? null
      settings.fontFamily = config.font_family ?? 'DM Sans'
      settings.headerStyle = (config.header_style ?? 'filled') as OnlineOrderingSettings['headerStyle']
      settings.headerTextColor = config.header_text_color ?? null
      settings.menuLayout = (config.menu_layout ?? 'cards') as OnlineOrderingSettings['menuLayout']
      settings.phone = config.phone ?? settings.phone
      settings.email = config.email ?? settings.email

      if (config.operating_hours) settings.operatingHours = config.operating_hours as WeeklySchedule
      settings.pickupEnabled = config.accepts_pickup
      settings.deliveryEnabled = config.accepts_delivery
      settings.preparationLeadTime = config.estimated_prep_minutes
      settings.futureOrderMaxDays = config.max_future_order_days
      settings.minimumOrderAmount = Number(config.min_order ?? 0)
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
      settings.baseDeliveryFee = Number(config.delivery_fee ?? 0)
      settings.freeDeliveryThreshold = Number(config.free_delivery_threshold ?? 0)
      settings.acceptOnlinePayments = config.accepts_online_payments ?? true
      settings.acceptCashOnDelivery = config.accepts_cash_on_delivery ?? false
      settings.acceptCardOnDelivery = config.accepts_card_on_delivery ?? false
      settings.nmiTokenizationKey = locationPaymentDevice?.provider_public_key ?? ''
      settings.nmiPrivateApiKey = ''
      settings.nmiConfigured = Boolean(
        locationPaymentDevice?.provider_public_key &&
        locationPaymentDevice?.has_provider_secret &&
        locationPaymentDevice?.status === 'active'
      )
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
      .select(
        'id, location_id, is_active, store_name, slug, setup_request_status, setup_requested_at, setup_reviewed_at, setup_rejection_reason, setup_completed_at'
      )
      .in('location_id', locationIds)

    if (configError) {
      console.error('[getAdminMerchantOnlineOrderingOverview] Config error:', configError)
    }

    const configMap = new Map<
      string,
      {
        id: string
        location_id: string
        is_active: boolean | null
        store_name: string | null
        slug: string | null
        setup_request_status: string | null
        setup_requested_at: string | null
        setup_reviewed_at: string | null
        setup_rejection_reason: string | null
        setup_completed_at: string | null
      }
    >(configs?.map((c) => [c.location_id, c]) || [])
    const result = locations?.map((loc) => {
      const config = configMap.get(loc.id)
      const setupRequestStatus = normalizeOnlineStoreRequestStatus(
        config?.setup_request_status
      )
      return {
        locationId: loc.id,
        locationName: loc.name,
        hasOnlineStore: !!config,
        setupRequestStatus,
        setupRequestedAt: config?.setup_requested_at ?? null,
        setupReviewedAt: config?.setup_reviewed_at ?? null,
        setupCompletedAt: config?.setup_completed_at ?? null,
        setupRejectionReason: config?.setup_rejection_reason ?? null,
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

export async function adminApproveOnlineStoreRequest(
  merchantId: string,
  locationId: string
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')
    const supabase = createServerSupabaseClient()

    const [{ data: existingConfig }, { data: location }] = await Promise.all([
      supabase
        .from('online_store_config')
        .select('id, slug, store_name, setup_request_status')
        .eq('merchant_id', merchantId)
        .eq('location_id', locationId)
        .maybeSingle(),
      supabase
        .from('locations')
        .select('id, name')
        .eq('id', locationId)
        .single(),
    ])

    if (!existingConfig) {
      return { success: false, error: 'No online-store request exists for this location.' }
    }

    const status = normalizeOnlineStoreRequestStatus(existingConfig.setup_request_status)
    if (status === 'approved' || status === 'setup_completed') {
      return { success: true, error: null }
    }

    if (status !== 'pending_review') {
      return {
        success: false,
        error: 'Only pending review requests can be approved.',
      }
    }

    const now = new Date().toISOString()
    const slug =
      existingConfig.slug ||
      (location
        ? await buildRequestedStoreSlug(supabase, location.name, location.id)
        : null)

    const { error: updateError } = await supabase
      .from('online_store_config')
      .update({
        slug,
        setup_request_status: 'approved',
        setup_reviewed_at: now,
        setup_reviewed_by: userId ?? null,
        setup_approved_at: now,
        setup_rejection_reason: null,
      })
      .eq('id', existingConfig.id)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    await sendOnlineStoreDecisionEmail({
      supabase,
      merchantId,
      locationName: location?.name ?? existingConfig.store_name ?? 'this location',
      status: 'approved',
    })

    await LogAuditEvent({
      merchantId,
      action: 'HQ Admin Approved Online Store Request',
      actionCategory: 'settings',
      resourceType: 'online_store',
      resourceId: locationId,
      resourceName: location?.name || existingConfig.store_name || 'Location',
      locationId,
      metadata: {
        reviewed_by_admin: userId,
        new_status: 'approved',
      },
    })

    revalidateOnlineStorePaths(merchantId)
    return { success: true, error: null }
  } catch (error) {
    console.error('[adminApproveOnlineStoreRequest] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function adminRejectOnlineStoreRequest(
  merchantId: string,
  locationId: string,
  reason: string
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')
    const supabase = createServerSupabaseClient()

    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      return { success: false, error: 'A rejection reason is required.' }
    }

    const [{ data: existingConfig }, { data: location }] = await Promise.all([
      supabase
        .from('online_store_config')
        .select('id, store_name, setup_request_status')
        .eq('merchant_id', merchantId)
        .eq('location_id', locationId)
        .maybeSingle(),
      supabase
        .from('locations')
        .select('id, name')
        .eq('id', locationId)
        .single(),
    ])

    if (!existingConfig) {
      return { success: false, error: 'No online-store request exists for this location.' }
    }

    const status = normalizeOnlineStoreRequestStatus(existingConfig.setup_request_status)
    if (status !== 'pending_review') {
      return {
        success: false,
        error: 'Only pending review requests can be rejected.',
      }
    }

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('online_store_config')
      .update({
        setup_request_status: 'rejected',
        setup_reviewed_at: now,
        setup_reviewed_by: userId ?? null,
        setup_rejection_reason: trimmedReason,
        setup_approved_at: null,
      })
      .eq('id', existingConfig.id)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    await sendOnlineStoreDecisionEmail({
      supabase,
      merchantId,
      locationName: location?.name ?? existingConfig.store_name ?? 'this location',
      status: 'rejected',
      rejectionReason: trimmedReason,
    })

    await LogAuditEvent({
      merchantId,
      action: 'HQ Admin Rejected Online Store Request',
      actionCategory: 'settings',
      resourceType: 'online_store',
      resourceId: locationId,
      resourceName: location?.name || existingConfig.store_name || 'Location',
      locationId,
      metadata: {
        reviewed_by_admin: userId,
        new_status: 'rejected',
        rejection_reason: trimmedReason,
      },
    })

    revalidateOnlineStorePaths(merchantId)
    return { success: true, error: null }
  } catch (error) {
    console.error('[adminRejectOnlineStoreRequest] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function adminUploadMerchantW9Pdf(
  merchantId: string,
  file: File
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    await assertHQPermission('hq.merchant.update')

    if (!file) {
      return { success: false, error: 'W-9 PDF is required' }
    }

    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf')

    if (!isPdf) {
      return { success: false, error: 'W-9 must be uploaded as a PDF' }
    }

    const supabase = createServerSupabaseClient()
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id, clerk_org_id')
      .eq('id', merchantId)
      .single()

    if (merchantError || !merchant?.clerk_org_id) {
      return { success: false, error: 'Merchant organization not found' }
    }

    const uploadResult = await uploadOrganizationDocument(
      file,
      merchant.clerk_org_id,
      'online-store-w9'
    )

    if (!uploadResult.success || !uploadResult.cdnUrl) {
      return {
        success: false,
        error: uploadResult.error || 'Failed to upload W-9 PDF',
      }
    }

    const clerkClient = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY!,
    })
    const organization = await clerkClient.organizations.getOrganization({
      organizationId: merchant.clerk_org_id,
    })
    await clerkClient.organizations.updateOrganization(merchant.clerk_org_id, {
      publicMetadata: {
        ...(organization.publicMetadata as Record<string, unknown>),
        online_store_w9_form_url: uploadResult.cdnUrl,
        w9_form_url: uploadResult.cdnUrl,
      },
    })

    await LogAuditEvent({
      merchantId,
      action: 'merchant.online_store.w9_uploaded',
      actionCategory: 'settings',
      resourceType: 'merchant',
      resourceId: merchantId,
      resourceName: merchantId,
      metadata: {
        source: 'adminUploadMerchantW9Pdf',
        organizationId: merchant.clerk_org_id,
      },
    })

    revalidateOnlineStorePaths(merchantId)

    return {
      success: true,
      url: uploadResult.cdnUrl,
    }
  } catch (error) {
    console.error('[adminUploadMerchantW9Pdf] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload W-9 PDF',
    }
  }
}

export async function adminSaveOnlineOrderingSettings(
  merchantId: string,
  locationId: string,
  settings: Partial<OnlineOrderingSettings>
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    const { data: existingConfig } = await supabase
      .from('online_store_config')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('location_id', locationId)
      .maybeSingle()

    if (!existingConfig) {
      return {
        success: false,
        error: 'Merchant must request and HQ must approve online-store setup before configuration can be saved.',
      }
    }

    if (!canHqEditStoreSetup(existingConfig.setup_request_status)) {
      return {
        success: false,
        error: 'Approve the online-store request before editing storefront setup.',
      }
    }

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

    const existingLocationPaymentDevice = await getLocationNmiPaymentDevice(locationId)

    const configData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (settings.storeName !== undefined) configData.store_name = settings.storeName
    if (settings.storeSlug !== undefined && settings.storeSlug !== '') {
      configData.slug = settings.storeSlug
    }
    if (settings.enabled !== undefined) configData.is_active = settings.enabled
    if (settings.description !== undefined) configData.description = settings.description
    if (settings.logoUrl !== undefined) configData.logo_url = settings.logoUrl
    if (settings.heroImageUrl !== undefined) configData.hero_image_url = settings.heroImageUrl
    if (settings.faviconUrl !== undefined) configData.favicon_url = settings.faviconUrl
    if (settings.ogImageUrl !== undefined) configData.og_image_url = settings.ogImageUrl
    if (settings.templateId !== undefined) configData.template_id = settings.templateId
    if (settings.primaryColor !== undefined) configData.primary_color = settings.primaryColor
    if (settings.secondaryColor !== undefined) configData.secondary_color = settings.secondaryColor
    if (settings.accentColor !== undefined) configData.accent_color = settings.accentColor
    if (settings.backgroundColor !== undefined) configData.background_color = settings.backgroundColor
    if (settings.textColor !== undefined) configData.text_color = settings.textColor
    if (settings.borderColor !== undefined) configData.border_color = settings.borderColor
    if (settings.cardColor !== undefined) configData.card_color = settings.cardColor
    if (settings.fontFamily !== undefined) configData.font_family = settings.fontFamily
    if (settings.headerStyle !== undefined) configData.header_style = settings.headerStyle
    if (settings.headerTextColor !== undefined) configData.header_text_color = settings.headerTextColor
    if (settings.menuLayout !== undefined) configData.menu_layout = settings.menuLayout
    if (settings.phone !== undefined) configData.phone = settings.phone
    if (settings.email !== undefined) configData.email = settings.email
    if (settings.operatingHours !== undefined) configData.operating_hours = settings.operatingHours
    if (settings.pickupEnabled !== undefined) configData.accepts_pickup = settings.pickupEnabled
    if (settings.deliveryEnabled !== undefined) configData.accepts_delivery = settings.deliveryEnabled
    if (settings.minimumOrderAmount !== undefined) {
      configData.min_order_cents = Math.round(settings.minimumOrderAmount * 100)
      configData.min_order = settings.minimumOrderAmount
    }
    if (settings.preparationLeadTime !== undefined)
      configData.estimated_prep_minutes = settings.preparationLeadTime
    if (settings.futureOrderMaxDays !== undefined)
      configData.max_future_order_days = settings.futureOrderMaxDays
    if (settings.baseDeliveryFee !== undefined) {
      configData.delivery_fee_cents = Math.round(settings.baseDeliveryFee * 100)
      configData.delivery_fee = settings.baseDeliveryFee
    }
    if (settings.freeDeliveryThreshold !== undefined) {
      const v = settings.freeDeliveryThreshold > 0 ? settings.freeDeliveryThreshold : null
      configData.free_delivery_threshold_cents = v !== null ? Math.round(v * 100) : null
      configData.free_delivery_threshold = v
    }
    if (settings.tippingEnabled !== undefined) configData.tip_enabled = settings.tippingEnabled
    if (settings.tipConfig?.presetPercentages !== undefined)
      configData.tip_presets = settings.tipConfig.presetPercentages
    if (settings.acceptOnlinePayments !== undefined)
      configData.accepts_online_payments = settings.acceptOnlinePayments
    if (settings.acceptCashOnDelivery !== undefined)
      configData.accepts_cash_on_delivery = settings.acceptCashOnDelivery
    if (settings.acceptCardOnDelivery !== undefined)
      configData.accepts_card_on_delivery = settings.acceptCardOnDelivery

    const nextTokenizationKey =
      settings.nmiTokenizationKey !== undefined
        ? settings.nmiTokenizationKey.trim()
        : existingLocationPaymentDevice?.provider_public_key ?? ''
    const providedPrivateApiKey = settings.nmiPrivateApiKey?.trim() ?? ''
    const tokenizationKeyChanged =
      settings.nmiTokenizationKey !== undefined &&
      nextTokenizationKey !== (existingLocationPaymentDevice?.provider_public_key ?? '')
    const shouldUpsertLocationPaymentDevice =
      tokenizationKeyChanged ||
      providedPrivateApiKey.length > 0

    if (shouldUpsertLocationPaymentDevice && nextTokenizationKey.length === 0) {
      return {
        success: false,
        error: 'NMI tokenization key is required to configure online card payments.',
      }
    }

    if (
      shouldUpsertLocationPaymentDevice &&
      !existingLocationPaymentDevice &&
      providedPrivateApiKey.length === 0
    ) {
      return {
        success: false,
        error: 'NMI private API key is required for a new online-ordering payment configuration.',
      }
    }

    if (
      shouldUpsertLocationPaymentDevice &&
      existingLocationPaymentDevice &&
      tokenizationKeyChanged &&
      providedPrivateApiKey.length === 0
    ) {
      return {
        success: false,
        error:
          'NMI private API key is required when updating the tokenization key for the existing online-ordering device.',
      }
    }

    if (!configData.store_name) configData.store_name = existingConfig.store_name || 'Online Store'
    if (!configData.slug) {
      const { data: location } = await supabase
        .from('locations')
        .select('id, name')
        .eq('id', locationId)
        .single()

      configData.slug =
        existingConfig.slug ||
        (location ? await buildRequestedStoreSlug(supabase, location.name, location.id) : null)
    }

    if (normalizeOnlineStoreRequestStatus(existingConfig.setup_request_status) === 'approved') {
      configData.setup_request_status = 'setup_completed'
      configData.setup_completed_at = new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('online_store_config')
      .update(configData)
      .eq('id', existingConfig.id)

    if (updateError) {
      console.error('[adminSaveOnlineOrderingSettings] Config update error:', updateError)
      return { success: false, error: updateError.message }
    }

    if (shouldUpsertLocationPaymentDevice) {
      let paymentDeviceId = existingLocationPaymentDevice?.id ?? null

      if (!paymentDeviceId) {
        const { data: createdDeviceId, error: createDeviceError } = await (supabase as any).rpc(
          'create_nmi_payment_device',
          {
            p_location_id: locationId,
            p_device_label: 'Online Ordering',
            p_environment: 'production',
            p_use_for_online_ordering: true,
          }
        )

        if (createDeviceError || !createdDeviceId) {
          return {
            success: false,
            error: `NMI device creation failed: ${createDeviceError?.message ?? 'Unknown error'}`,
          }
        }

        paymentDeviceId = createdDeviceId
      }

      const providerMerchantId =
        existingLocationPaymentDevice?.provider_merchant_id?.trim() ||
        `manual:${merchantId}`
      const providerGatewayId =
        existingLocationPaymentDevice?.provider_gateway_id?.trim() ||
        `manual:${locationId}`

      const { error: activateDeviceError } = await (supabase as any).rpc(
        'activate_nmi_payment_device',
        {
          p_device_id: paymentDeviceId,
          p_provider_merchant_id: providerMerchantId,
          p_provider_gateway_id: providerGatewayId,
          p_public_key: nextTokenizationKey,
          p_security_key: providedPrivateApiKey,
          p_webhook_secret: null,
        }
      )

      if (activateDeviceError) {
        return {
          success: false,
          error: `NMI device activation failed: ${activateDeviceError.message}`,
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
        nmi_configured: shouldUpsertLocationPaymentDevice
          ? true
          : Boolean(
            existingLocationPaymentDevice?.provider_public_key &&
            existingLocationPaymentDevice?.has_provider_secret &&
            existingLocationPaymentDevice?.status === 'active'
          ),
        nmi_tokenization_key_changed: tokenizationKeyChanged,
      },
    })

    const whitelist = await syncStorefrontWhitelist(supabase, locationId)
    if (whitelist.error) {
      console.error(
        '[adminSaveOnlineOrderingSettings] Whitelist sync error:',
        whitelist.error
      )
    }

    revalidateOnlineStorePaths(merchantId)

    return {
      success: true,
      error: null,
      domainWhitelisted: whitelist.synced && !whitelist.skipped,
      domainWhitelistError: whitelist.error,
      domainWhitelistSkipped: whitelist.skipped ?? false,
      whitelistOrigins: whitelist.origins,
      whitelistSyncedAt: whitelist.syncedAt,
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
      .select('id, slug, setup_request_status, accepts_online_payments')
      .eq('location_id', locationId)
      .single()

    if (!existingConfig) {
      return { success: false, error: 'Online store not configured for this location' }
    }

    if (!canHqEditStoreSetup(existingConfig.setup_request_status) ||
      normalizeOnlineStoreRequestStatus(existingConfig.setup_request_status) !== 'setup_completed') {
      return {
        success: false,
        error: 'Finish HQ storefront setup before enabling this branch store.',
      }
    }

    if (enabled && existingConfig.accepts_online_payments) {
      const locationPaymentDevice = await getLocationNmiPaymentDevice(locationId)
      if (
        !locationPaymentDevice?.provider_public_key ||
        !locationPaymentDevice?.has_provider_secret ||
        locationPaymentDevice.status !== 'active'
      ) {
        return {
          success: false,
          error:
            'Configure the NMI tokenization key and private API key before enabling online card payments for this storefront.',
        }
      }
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

    const whitelist = enabled
      ? await syncStorefrontWhitelist(supabase, locationId)
      : null

    if (whitelist?.error) {
      console.error(
        '[adminToggleOnlineStore] Whitelist sync error:',
        whitelist.error
      )
    }

    revalidateOnlineStorePaths(merchantId)
    return {
      success: true,
      error: null,
      domainWhitelistError: whitelist?.error,
      domainWhitelistSkipped: whitelist ? (whitelist.skipped ?? false) : true,
      whitelistOrigins: whitelist?.origins ?? [],
      whitelistSyncedAt: whitelist?.syncedAt ?? null,
    }
  } catch (error) {
    console.error('[adminToggleOnlineStore] Exception:', error)
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
        min_order: 0,
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
