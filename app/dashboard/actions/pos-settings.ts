"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";
import {
  getEffectivePosConfig,
  normalizePosConfig,
  normalizeStationOverrides,
  type PosConfig,
  type StationPosConfigOverrides,
} from "@/lib/pos/pos-config";

export interface PosSettingsStation {
  id: string;
  station_name: string;
  station_code: string | null;
  station_type: string;
  station_number: number | null;
  pos_config_overrides: StationPosConfigOverrides;
  effective_pos_config: PosConfig;
}

export interface LocationPosSettingsPayload {
  location: {
    id: string;
    name: string;
    merchant_id: string;
    pos_config: PosConfig;
  };
  stations: PosSettingsStation[];
}

async function getMerchantForOrg(clerkOrgId: string) {
  const supabase = createServerSupabaseClient();
  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("id, name")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !merchant) {
    return { supabase, merchant: null, error: "Merchant not found" };
  }

  return { supabase, merchant, error: null };
}

export async function getLocationPosSettings(
  clerkOrgId: string,
  locationId: string,
): Promise<{
  success: boolean;
  data: LocationPosSettingsPayload | null;
  error: string | null;
}> {
  try {
    if (!clerkOrgId || !locationId || locationId === "all") {
      return {
        success: false,
        data: null,
        error: "A concrete location is required",
      };
    }

    const { supabase, merchant, error: merchantError } =
      await getMerchantForOrg(clerkOrgId);

    if (merchantError || !merchant) {
      return { success: false, data: null, error: merchantError };
    }

    const { data: location, error: locationError } = await supabase
      .from("locations")
      .select("id, name, merchant_id, pos_config")
      .eq("id", locationId)
      .eq("merchant_id", merchant.id)
      .single();

    if (locationError || !location) {
      return { success: false, data: null, error: "Location not found" };
    }

    const { data: stations, error: stationsError } = await (supabase as any)
      .from("stations")
      .select(
        "id, station_name, station_code, station_type, station_number, pos_config_overrides",
      )
      .eq("location_id", locationId)
      .eq("merchant_id", merchant.id)
      .order("station_number", { ascending: true, nullsFirst: false })
      .order("station_name", { ascending: true });

    if (stationsError) {
      return { success: false, data: null, error: stationsError.message };
    }

    const locationConfig = normalizePosConfig(location.pos_config);
    const stationRows = ((stations ?? []) as Array<{
      id: string;
      station_name: string;
      station_code: string | null;
      station_type: string;
      station_number: number | null;
      pos_config_overrides: unknown;
    }>).map((station) => {
      const overrides = normalizeStationOverrides(station.pos_config_overrides);
      return {
        ...station,
        pos_config_overrides: overrides,
        effective_pos_config: getEffectivePosConfig(locationConfig, overrides),
      };
    });

    return {
      success: true,
      data: {
        location: {
          id: location.id,
          name: location.name,
          merchant_id: location.merchant_id,
          pos_config: locationConfig,
        },
        stations: stationRows,
      },
      error: null,
    };
  } catch (error) {
    console.error("[getLocationPosSettings] Exception:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function saveLocationPosConfig(
  clerkOrgId: string,
  locationId: string,
  posConfig: PosConfig,
): Promise<{ success: boolean; data: PosConfig | null; error: string | null }> {
  try {
    if (!clerkOrgId || !locationId || locationId === "all") {
      return {
        success: false,
        data: null,
        error: "A concrete location is required",
      };
    }

    const { supabase, merchant, error: merchantError } =
      await getMerchantForOrg(clerkOrgId);

    if (merchantError || !merchant) {
      return { success: false, data: null, error: merchantError };
    }

    const { data: location, error: locationError } = await supabase
      .from("locations")
      .select("id, name, merchant_id")
      .eq("id", locationId)
      .eq("merchant_id", merchant.id)
      .single();

    if (locationError || !location) {
      return { success: false, data: null, error: "Location not found" };
    }

    const nextConfig = normalizePosConfig(posConfig);
    const { data, error } = await (supabase as any).rpc(
      "set_location_pos_config_v1",
      {
        p_location_id: locationId,
        p_pos_config: nextConfig,
      },
    );

    if (error) {
      return { success: false, data: null, error: error.message };
    }

    await LogAuditEvent({
      merchantId: merchant.id,
      action: "Updated Location POS Settings",
      actionCategory: "settings",
      resourceType: "location",
      resourceId: locationId,
      resourceName: location.name,
      locationId,
      changes: { after: nextConfig as unknown as Record<string, unknown> },
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/settings/pos");

    return { success: true, data: normalizePosConfig(data), error: null };
  } catch (error) {
    console.error("[saveLocationPosConfig] Exception:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function saveStationPosConfigOverrides(
  clerkOrgId: string,
  stationId: string,
  overrides: StationPosConfigOverrides,
): Promise<{
  success: boolean;
  data: StationPosConfigOverrides | null;
  error: string | null;
}> {
  try {
    if (!clerkOrgId || !stationId) {
      return {
        success: false,
        data: null,
        error: "Station and organization are required",
      };
    }

    const { supabase, merchant, error: merchantError } =
      await getMerchantForOrg(clerkOrgId);

    if (merchantError || !merchant) {
      return { success: false, data: null, error: merchantError };
    }

    const { data: station, error: stationError } = await (supabase as any)
      .from("stations")
      .select("id, station_name, location_id, merchant_id")
      .eq("id", stationId)
      .eq("merchant_id", merchant.id)
      .single();

    if (stationError || !station) {
      return { success: false, data: null, error: "Station not found" };
    }

    const nextOverrides = normalizeStationOverrides(overrides);
    const { data, error } = await (supabase as any).rpc(
      "set_station_pos_config_overrides_v1",
      {
        p_station_id: stationId,
        p_overrides: nextOverrides,
      },
    );

    if (error) {
      return { success: false, data: null, error: error.message };
    }

    await LogAuditEvent({
      merchantId: merchant.id,
      action: "Updated Station POS Settings Overrides",
      actionCategory: "settings",
      resourceType: "station",
      resourceId: stationId,
      resourceName: station.station_name,
      locationId: station.location_id,
      changes: { after: nextOverrides as Record<string, unknown> },
    });

    revalidatePath("/dashboard/settings/pos");
    revalidatePath("/dashboard/settings/stations");

    return {
      success: true,
      data: normalizeStationOverrides(data),
      error: null,
    };
  } catch (error) {
    console.error("[saveStationPosConfigOverrides] Exception:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
