"use server";

// ============================================================================
// Tax Rates Server Actions
// Description: CRUD operations for location-specific tax rates
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  TaxRate,
  TaxCategory,
  TaxRateLookupResult,
  TaxCalculationResult,
} from "@/types/tax";
import { TaxRatesModel } from "@/types/db-modles";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get all active tax rates for a specific location
 */
export async function getTaxRatesForLocation(locationId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("tax_rates")
      .select("*")
      .eq("location_id", locationId)
      .eq("is_active", true)
      .order("tax_category");

    if (error) {
      console.error("[getTaxRatesForLocation] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data as TaxRate[], error: null };
  } catch (error) {
    console.error("[getTaxRatesForLocation] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Get a specific tax rate by ID
 */
export async function getTaxRateById(taxRateId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("tax_rates")
      .select("*")
      .eq("id", taxRateId)
      .single();

    if (error) {
      console.error("[getTaxRateById] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data as TaxRate, error: null };
  } catch (error) {
    console.error("[getTaxRateById] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Get tax rate for a specific category at a location
 */
export async function getTaxRateForCategory(
  locationId: string,
  taxCategory: TaxCategory,
) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("tax_rates")
      .select("*")
      .eq("location_id", locationId)
      .eq("tax_category", taxCategory)
      .eq("is_active", true)
      .single();

    if (error) {
      // Not found is okay, just return null
      if (error.code === "PGRST116") {
        return { success: true, data: null, error: null };
      }
      console.error("[getTaxRateForCategory] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data as TaxRate, error: null };
  } catch (error) {
    console.error("[getTaxRateForCategory] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// WRITE Operations
// ============================================================================

/**
 * Create or update a tax rate (upsert on location_id + tax_category)
 */
export async function upsertTaxRate(
  locationId: string,
  taxCategory: TaxCategory,
  name: string,
  percentage: number,
) {
  try {
    const supabase = createServerSupabaseClient();

    // Validate percentage
    if (percentage < 0 || percentage > 100) {
      return {
        success: false,
        error: "Percentage must be between 0 and 100",
        data: null,
      };
    }

    // First, deactivate any existing active rate for this category
    await supabase
      .from("tax_rates")
      .update({ is_active: false })
      .eq("location_id", locationId)
      .eq("tax_category", taxCategory)
      .eq("is_active", true);

    // Create new rate
    const { data, error } = await supabase
      .from("tax_rates")
      .insert({
        location_id: locationId,
        name,
        percentage,
        tax_category: taxCategory,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[upsertTaxRate] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Fetch location name for audit log
    const { data: location } = await supabase
      .from("locations")
      .select("name, merchant_id")
      .eq("id", locationId)
      .single();

    if (location) {
      await LogAuditEvent({
        merchantId: location.merchant_id,
        action: `Set Tax Rate: ${name} (${percentage}%)`,
        actionCategory: "settings",
        resourceType: "tax_rate",
        resourceId: data.id,
        resourceName: name,
        locationId: locationId,
        severity: "warning",
        metadata: {
          location_name: location.name,
          tax_category: taxCategory,
          percentage: percentage,
        },
      });
    }

    return { success: true, data: data as TaxRate, error: null };
  } catch (error) {
    console.error("[upsertTaxRate] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Deactivate a tax rate (soft delete)
 */
export async function deactivateTaxRate(taxRateId: string) {
  try {
    const supabase = createServerSupabaseClient();

    // Fetch details BEFORE deactivating (RLS might block access after is_active = false)
    const { data: taxRate } = await supabase
      .from("tax_rates")
      .select("name, location_id, tax_category")
      .eq("id", taxRateId)
      .single();

    // Get Location Name and Merchant ID (tax_rates doesn't have merchant_id directly)
    let merchantId = "";
    let locationName = "";
    if (taxRate?.location_id) {
      const { data: loc } = await supabase
        .from("locations")
        .select("name, merchant_id")
        .eq("id", taxRate.location_id)
        .single();
      if (loc) {
        merchantId = loc.merchant_id;
        locationName = loc.name;
      }
    }

    const { error } = await supabase
      .from("tax_rates")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taxRateId);

    if (error) {
      console.error("[deactivateTaxRate] Error:", error);
      return { success: false, error: error.message };
    }

    // Log audit event (using details fetched before deactivation)
    if (taxRate) {
      await LogAuditEvent({
        merchantId: merchantId,
        action: `Deactivated Tax Rate: ${taxRate.name}`,
        actionCategory: "settings",
        resourceType: "tax_rate",
        resourceId: taxRateId,
        resourceName: taxRate.name,
        locationId: taxRate.location_id,
        severity: "warning",
        metadata: {
          location_name: locationName,
          tax_category: taxRate.tax_category,
        },
      });
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("[deactivateTaxRate] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Permanently delete a tax rate
 */
export async function deleteTaxRate(taxRateId: string) {
  try {
    const supabase = createServerSupabaseClient();

    // Fetch details before delete
    const { data: taxRate } = await supabase
      .from("tax_rates")
      .select("name, location_id, tax_category")
      .eq("id", taxRateId) // select merchant_id if present, but unlikely if via location
      .single();

    let merchantId = "";
    let locationName = "";

    if (taxRate?.location_id) {
      const { data: loc } = await supabase
        .from("locations")
        .select("id, name, merchant_id")
        .eq("id", taxRate.location_id)
        .single();
      if (loc) {
        merchantId = loc.merchant_id;
        locationName = loc.name;
      }
    }

    const { error } = await supabase
      .from("tax_rates")
      .delete()
      .eq("id", taxRateId);

    if (error) {
      console.error("[deleteTaxRate] Error:", error);
      return { success: false, error: error.message };
    }

    if (taxRate) {
      await LogAuditEvent({
        merchantId: merchantId,
        action: `Deleted Tax Rate: ${taxRate.name}`,
        actionCategory: "settings",
        resourceType: "tax_rate",
        resourceId: taxRateId,
        resourceName: taxRate.name,
        locationId: taxRate.location_id,
        severity: "warning",
        metadata: {
          location_name: locationName,
          tax_category: taxRate.tax_category,
        },
      });
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("[deleteTaxRate] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Tax Calculation Helpers
// ============================================================================

/**
 * Get effective tax settings for an item at a location (with L2 > L1 inheritance)
 * Uses the get_effective_item_tax RPC function
 */
export async function getEffectiveItemTax(
  menuItemId: string,
  locationId: string,
) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.rpc("get_effective_item_tax", {
      p_menu_item_id: menuItemId,
      p_location_id: locationId,
    });

    if (error) {
      console.error("[getEffectiveItemTax] Error:", error);
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }

    return {
      success: true,
      data: data as TaxRateLookupResult,
      error: null,
    };
  } catch (error) {
    console.error("[getEffectiveItemTax] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Calculate tax for an item (helper for UI preview)
 * This is a client-side preview; actual order tax is calculated server-side
 */
export async function calculateItemTax(
  menuItemId: string,
  locationId: string,
  quantity: number,
  unitPrice: number,
) {
  try {
    // Get effective tax settings
    const taxInfoResult = await getEffectiveItemTax(menuItemId, locationId);

    if (!taxInfoResult.success || !taxInfoResult.data) {
      return {
        success: false,
        error: taxInfoResult.error || "Failed to get tax info",
        data: null,
      };
    }

    const taxInfo = taxInfoResult.data;

    // If exempt, return 0 tax
    if (taxInfo.is_tax_exempt) {
      return {
        success: true,
        data: {
          subtotal: quantity * unitPrice,
          tax_amount: 0,
          total: quantity * unitPrice,
          tax_category: taxInfo.tax_category,
          is_tax_exempt: true,
          applicable_rate: null,
        },
        error: null,
      };
    }

    // Calculate tax
    const subtotal = quantity * unitPrice;
    const taxAmount = (subtotal * taxInfo.percentage) / 100;

    return {
      success: true,
      data: {
        subtotal,
        tax_amount: Math.round(taxAmount * 100) / 100, // Round to 2 decimals
        total: subtotal + taxAmount,
        tax_category: taxInfo.tax_category,
        is_tax_exempt: false,
        applicable_rate: taxInfo.tax_rate,
      },
      error: null,
    };
  } catch (error) {
    console.error("[calculateItemTax] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

/**
 * Calculate tax for an entire order
 * Uses the calculate_order_tax RPC function
 */
export async function calculateOrderTax(orderId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.rpc("calculate_order_tax", {
      p_order_id: orderId,
    });

    if (error) {
      console.error("[calculateOrderTax] Error:", error);
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }

    return {
      success: true,
      data: data as TaxCalculationResult,
      error: null,
    };
  } catch (error) {
    console.error("[calculateOrderTax] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}
