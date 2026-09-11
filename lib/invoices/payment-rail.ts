import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveProcessorAccount } from "@/lib/payments/resolver";
import type { ProcessorName } from "@/lib/payments/types";

export type InvoicePaymentRailKind =
  | "location_payment_device"
  | "platform_billing_config"
  | "merchant_processor_account";

export interface InvoiceRailInvoiceRef {
  id: string;
  merchant_id: string;
  location_id: string | null;
  bill_type: string | null;
  total_amount?: number | null;
  amount_paid?: number | null;
  status?: string | null;
}

export interface ResolvedInvoicePaymentRail {
  kind: InvoicePaymentRailKind;
  provider: ProcessorName;
  merchantId: string;
  locationId: string | null;
  billType: string;
  tokenizationKey: string | null;
  apiKey: string | null;
  webhookSecret: string | null;
  paymentDeviceId: string | null;
  platformBillingConfigId: string | null;
  processorAccountId: string | null;
  valorCredentials: {
    appId: string;
    appKey: string;
    epi: string;
  } | null;
}

interface ResolveInvoicePaymentRailOptions {
  includeSecrets?: boolean;
  preferredPaymentDeviceId?: string | null;
  preferredPlatformBillingConfigId?: string | null;
  supabase?: any;
}

interface LocationPaymentDeviceRow {
  id: string;
  merchant_id: string;
  location_id: string | null;
  provider_public_key: string | null;
}

interface DeviceSecretRow {
  device_id: string;
  merchant_id: string;
  location_id: string | null;
  provider_public_key: string | null;
  decrypted_security_key: string | null;
  decrypted_webhook_secret: string | null;
}

interface PlatformBillingConfigRow {
  id: string;
  tokenization_key: string | null;
  is_active: boolean;
}

interface PlatformSecretRow {
  config_id: string;
  tokenization_key: string | null;
  decrypted_private_api_key: string | null;
  decrypted_webhook_secret: string | null;
  is_active: boolean;
}

interface ValorCredentialRow {
  valor_appid: string | null;
  valor_epi: string | null;
  decrypted_appkey: string | null;
}

function normalizeInvoiceBillType(value: string | null | undefined) {
  return value === "platform_to_merchant"
    ? "platform_to_merchant"
    : "merchant_to_customer";
}

async function findMerchantLocationPaymentDevice(
  supabase: any,
  merchantId: string,
  locationId: string | null,
  preferredPaymentDeviceId?: string | null,
): Promise<LocationPaymentDeviceRow | null> {
  if (preferredPaymentDeviceId) {
    const { data } = await supabase
      .from("location_payment_devices")
      .select("id, merchant_id, location_id, provider_public_key")
      .eq("id", preferredPaymentDeviceId)
      .eq("merchant_id", merchantId)
      .eq("provider", "nmi")
      .eq("status", "active")
      .eq("is_active", true)
      .maybeSingle();

    if (data?.id) {
      return data as LocationPaymentDeviceRow;
    }
  }

  if (locationId) {
    const { data } = await supabase
      .from("location_payment_devices")
      .select("id, merchant_id, location_id, provider_public_key")
      .eq("merchant_id", merchantId)
      .eq("location_id", locationId)
      .eq("provider", "nmi")
      .eq("status", "active")
      .eq("is_active", true)
      .order("use_for_online_ordering", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.id) {
      return data as LocationPaymentDeviceRow;
    }
  }

  const { data } = await supabase
    .from("location_payment_devices")
    .select("id, merchant_id, location_id, provider_public_key")
    .eq("merchant_id", merchantId)
    .eq("provider", "nmi")
    .eq("status", "active")
    .eq("is_active", true)
    .order("use_for_online_ordering", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ? (data as LocationPaymentDeviceRow) : null;
}

async function getNmiDeviceSecrets(
  supabase: any,
  deviceId: string,
): Promise<DeviceSecretRow | null> {
  const { data, error } = await (supabase as any).rpc(
    "get_nmi_device_payment_secrets",
    {
      p_device_id: deviceId,
    },
  );

  if (error) {
    console.error("[resolveInvoicePaymentRail:getNmiDeviceSecrets] RPC error:", error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row?.device_id ? (row as DeviceSecretRow) : null;
}

async function getPlatformBillingConfig(
  supabase: any,
  preferredPlatformBillingConfigId?: string | null,
): Promise<PlatformBillingConfigRow | null> {
  let query = (supabase as any)
    .from("platform_billing_provider_configs")
    .select("id, tokenization_key, is_active")
    .eq("provider", "nmi")
    .eq("is_active", true)
    .limit(1);

  if (preferredPlatformBillingConfigId) {
    query = query.eq("id", preferredPlatformBillingConfigId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("[resolveInvoicePaymentRail:getPlatformBillingConfig] Query error:", error);
    return null;
  }

  return data?.id ? (data as PlatformBillingConfigRow) : null;
}

async function getPlatformBillingSecrets(supabase: any): Promise<PlatformSecretRow | null> {
  const { data, error } = await (supabase as any).rpc(
    "get_platform_billing_provider_payment_secrets",
    {
      p_provider: "nmi",
    },
  );

  if (error) {
    console.error(
      "[resolveInvoicePaymentRail:getPlatformBillingSecrets] RPC error:",
      error,
    );
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row?.config_id ? (row as PlatformSecretRow) : null;
}

async function getValorAccountCredentials(
  supabase: any,
  accountId: string,
): Promise<ResolvedInvoicePaymentRail["valorCredentials"]> {
  const { data, error } = await (supabase as any).rpc(
    "get_valor_account_credentials",
    { p_account_id: accountId },
  );

  if (error) {
    console.error(
      "[resolveInvoicePaymentRail:getValorAccountCredentials] RPC error:",
      error,
    );
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | ValorCredentialRow
    | null;
  const appId = row?.valor_appid?.trim();
  const appKey = row?.decrypted_appkey?.trim();
  const epi = row?.valor_epi?.trim();

  return appId && appKey && epi ? { appId, appKey, epi } : null;
}

export async function resolveInvoicePaymentRail(
  invoice: InvoiceRailInvoiceRef,
  options: ResolveInvoicePaymentRailOptions = {},
): Promise<ResolvedInvoicePaymentRail | null> {
  const supabase = options.supabase ?? createServiceRoleClient();
  const billType = normalizeInvoiceBillType(invoice.bill_type);

  if (billType === "platform_to_merchant") {
    if (options.includeSecrets) {
      const secretRow = await getPlatformBillingSecrets(supabase);
      if (!secretRow) {
        return {
          kind: "platform_billing_config",
          provider: "nmi",
          merchantId: invoice.merchant_id,
          locationId: invoice.location_id,
          billType,
          tokenizationKey: null,
          apiKey: null,
          webhookSecret: null,
          paymentDeviceId: null,
          platformBillingConfigId: null,
          processorAccountId: null,
          valorCredentials: null,
        };
      }

      return {
        kind: "platform_billing_config",
        provider: "nmi",
        merchantId: invoice.merchant_id,
        locationId: invoice.location_id,
        billType,
        tokenizationKey: secretRow.tokenization_key ?? null,
        apiKey: secretRow.decrypted_private_api_key?.trim() || null,
        webhookSecret: secretRow.decrypted_webhook_secret?.trim() || null,
        paymentDeviceId: null,
        platformBillingConfigId: secretRow.config_id,
        processorAccountId: null,
        valorCredentials: null,
      };
    }

    const publicConfig = await getPlatformBillingConfig(
      supabase,
      options.preferredPlatformBillingConfigId,
    );

    return {
      kind: "platform_billing_config",
      provider: "nmi",
      merchantId: invoice.merchant_id,
      locationId: invoice.location_id,
      billType,
      tokenizationKey: publicConfig?.tokenization_key ?? null,
      apiKey: null,
      webhookSecret: null,
      paymentDeviceId: null,
      platformBillingConfigId: publicConfig?.id ?? null,
      processorAccountId: null,
      valorCredentials: null,
    };
  }

  const processorAccount = await resolveProcessorAccount(
    invoice.merchant_id,
    "invoice",
    { locationId: invoice.location_id },
  );

  if (processorAccount?.processor === "valor") {
    const valorCredentials = options.includeSecrets
      ? await getValorAccountCredentials(supabase, processorAccount.id)
      : null;

    return {
      kind: "merchant_processor_account",
      provider: "valor",
      merchantId: invoice.merchant_id,
      locationId: invoice.location_id,
      billType,
      tokenizationKey: null,
      apiKey: null,
      webhookSecret: null,
      paymentDeviceId: null,
      platformBillingConfigId: null,
      processorAccountId: processorAccount.id,
      valorCredentials,
    };
  }

  const device = await findMerchantLocationPaymentDevice(
    supabase,
    invoice.merchant_id,
    invoice.location_id,
    options.preferredPaymentDeviceId,
  );

  if (!device) {
    return {
      kind: "location_payment_device",
      provider: "nmi",
      merchantId: invoice.merchant_id,
      locationId: invoice.location_id,
      billType,
      tokenizationKey: null,
      apiKey: null,
      webhookSecret: null,
      paymentDeviceId: null,
      platformBillingConfigId: null,
      processorAccountId: processorAccount?.id ?? null,
      valorCredentials: null,
    };
  }

  if (!options.includeSecrets) {
    return {
      kind: "location_payment_device",
      provider: "nmi",
      merchantId: invoice.merchant_id,
      locationId: invoice.location_id,
      billType,
      tokenizationKey: device.provider_public_key ?? null,
      apiKey: null,
      webhookSecret: null,
      paymentDeviceId: device.id,
      platformBillingConfigId: null,
      processorAccountId: processorAccount?.id ?? null,
      valorCredentials: null,
    };
  }

  const secretRow = await getNmiDeviceSecrets(supabase, device.id);

  return {
    kind: "location_payment_device",
    provider: "nmi",
    merchantId: invoice.merchant_id,
    locationId: invoice.location_id,
    billType,
    tokenizationKey:
      secretRow?.provider_public_key ?? device.provider_public_key ?? null,
    apiKey: secretRow?.decrypted_security_key?.trim() || null,
    webhookSecret: secretRow?.decrypted_webhook_secret?.trim() || null,
    paymentDeviceId: device.id,
    platformBillingConfigId: null,
    processorAccountId: processorAccount?.id ?? null,
    valorCredentials: null,
  };
}

export async function resolveInvoicePaymentRailForPublicToken(
  publicToken: string,
  options: Omit<ResolveInvoicePaymentRailOptions, "supabase"> = {},
): Promise<ResolvedInvoicePaymentRail | null> {
  if (!publicToken) return null;

  const supabase = createServiceRoleClient();
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id, merchant_id, location_id, bill_type")
    .eq("public_token", publicToken)
    .maybeSingle();

  if (error || !invoice?.id) {
    if (error) {
      console.error(
        "[resolveInvoicePaymentRailForPublicToken] Invoice lookup error:",
        error,
      );
    }
    return null;
  }

  return resolveInvoicePaymentRail(invoice as InvoiceRailInvoiceRef, {
    ...options,
    supabase,
  });
}

export function buildInvoicePaymentOrderId(paymentId: string) {
  return `invoicepay:${paymentId}`;
}

export function parseInvoicePaymentOrderId(orderId: string | null | undefined) {
  if (!orderId?.startsWith("invoicepay:")) return null;
  const paymentId = orderId.slice("invoicepay:".length).trim();
  return paymentId || null;
}
