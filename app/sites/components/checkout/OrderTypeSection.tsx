"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { MapPin, Plus, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { StoreMapEmbed } from "./StoreMapEmbed";
import type { SavedAddress } from "../../customer-actions";

interface OrderTypeSectionProps {
  orderType: "pickup" | "delivery";
  onOrderTypeChange: (v: "pickup" | "delivery") => void;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  // Store info
  storeAddress: string;
  storeLat?: number | null;
  storeLng?: number | null;
  // Delivery
  savedAddresses: SavedAddress[];
  selectedAddressId: string;
  onSelectedAddressChange: (id: string) => void;
  newAddress: { street: string; city: string; state: string; zip: string; notes: string };
  onNewAddressChange: (a: { street: string; city: string; state: string; zip: string; notes: string }) => void;
  isAuthenticated?: boolean;
  saveNewAddress?: boolean;
  onSaveNewAddressChange?: (v: boolean) => void;
  // Delivery zone eligibility feedback
  zoneCheckState?: "idle" | "checking" | "valid" | "invalid";
  zoneCheckMessage?: string;
}

export function OrderTypeSection({
  orderType,
  onOrderTypeChange,
  pickupEnabled,
  deliveryEnabled,
  storeAddress,
  storeLat,
  storeLng,
  savedAddresses,
  selectedAddressId,
  onSelectedAddressChange,
  newAddress,
  onNewAddressChange,
  isAuthenticated,
  saveNewAddress,
  onSaveNewAddressChange,
  zoneCheckState = "idle",
  zoneCheckMessage,
}: OrderTypeSectionProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
        Order Type
      </h2>

      <Tabs
        value={orderType}
        onValueChange={(v) => onOrderTypeChange(v as "pickup" | "delivery")}
        className="w-full"
      >
        <TabsList
          className={cn(
            "grid w-full h-auto p-1",
            deliveryEnabled ? "grid-cols-2" : "grid-cols-1"
          )}
          style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)" }}
        >
          <TabsTrigger
            value="pickup"
            disabled={!pickupEnabled}
            className="py-2 data-[state=active]:!bg-[var(--primary)] data-[state=active]:!text-[var(--primary-text)]"
          >
            Pickup
          </TabsTrigger>
          {/* Delivery hidden entirely while delivery is disabled site-wide. */}
          {deliveryEnabled && (
            <TabsTrigger
              value="delivery"
              className="py-2 data-[state=active]:!bg-[var(--primary)] data-[state=active]:!text-[var(--primary-text)]"
            >
              Delivery
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      {/* Pickup section */}
      {orderType === "pickup" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
          <StoreMapEmbed lat={storeLat} lng={storeLng} address={storeAddress} />
        </div>
      )}

      {/* Delivery address section */}
      {orderType === "delivery" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
          {savedAddresses.length > 0 && (
            <div className="space-y-2">
              {savedAddresses.map((addr) => (
                <button
                  key={addr.id}
                  onClick={() => onSelectedAddressChange(addr.id)}
                  className="w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-2"
                  style={{
                    borderColor: selectedAddressId === addr.id ? "var(--primary)" : "var(--border)",
                    backgroundColor: selectedAddressId === addr.id
                      ? "color-mix(in srgb, var(--primary) 10%, var(--bg))"
                      : "var(--card)",
                  }}
                >
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--primary)" }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{addr.label}</p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {addr.addressLine1}, {addr.city}, {addr.state} {addr.postalCode}
                    </p>
                  </div>
                </button>
              ))}
              <button
                onClick={() => onSelectedAddressChange("new")}
                className="w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-2 text-sm"
                style={{
                  borderColor: selectedAddressId === "new" ? "var(--primary)" : "var(--border)",
                  borderStyle: selectedAddressId === "new" ? "solid" : "dashed",
                  backgroundColor: "var(--card)",
                  color: "var(--text-secondary)",
                }}
              >
                <Plus className="h-4 w-4" />
                New address
              </button>
            </div>
          )}

          {selectedAddressId !== "new" && savedAddresses.length > 0 && (
            <ZoneFeedback state={zoneCheckState} message={zoneCheckMessage} />
          )}

          {(selectedAddressId === "new" || savedAddresses.length === 0) && (
            <div className="space-y-2">
              <AddressAutocomplete
                value={newAddress.street}
                onInputChange={(v) => onNewAddressChange({ ...newAddress, street: v })}
                onAddressSelected={(parts) =>
                  onNewAddressChange({
                    ...newAddress,
                    street: parts.address_line1,
                    city: parts.city,
                    state: parts.state,
                    zip: parts.postal_code.split("-")[0],
                  })
                }
                placeholder="Street address"
                inputStyle={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input
                  value={newAddress.city}
                  onChange={(e) => onNewAddressChange({ ...newAddress, city: e.target.value })}
                  placeholder="City"
                  autoComplete="address-level2"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
                />
                <Input
                  value={newAddress.state}
                  onChange={(e) => onNewAddressChange({ ...newAddress, state: e.target.value })}
                  placeholder="State"
                  autoComplete="address-level1"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
                />
                <Input
                  value={newAddress.zip}
                  onChange={(e) => onNewAddressChange({ ...newAddress, zip: e.target.value })}
                  placeholder="ZIP"
                  autoComplete="postal-code"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
                />
              </div>
              <Input
                value={newAddress.notes}
                onChange={(e) => onNewAddressChange({ ...newAddress, notes: e.target.value })}
                placeholder="Delivery notes (apt #, gate code...)"
                autoComplete="off"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
              />
              <ZoneFeedback state={zoneCheckState} message={zoneCheckMessage} />

              {isAuthenticated && onSaveNewAddressChange && (
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="save-address"
                    checked={saveNewAddress ?? false}
                    onCheckedChange={(checked) => onSaveNewAddressChange(!!checked)}
                  />
                  <label
                    htmlFor="save-address"
                    className="text-sm cursor-pointer select-none"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Save this address
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Address eligibility / quote line. Under self-fulfilment this is the delivery
 * zone check; under OrderOut Direct it shows the live courier fee and ETA.
 */
function ZoneFeedback({
  state,
  message,
}: {
  state: "idle" | "checking" | "valid" | "invalid";
  message?: string;
}) {
  if (state === "idle") return null;
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
      style={
        state === "valid"
          ? {
              backgroundColor: "color-mix(in srgb, #22c55e 12%, var(--bg))",
              color: "#15803d",
              border: "1px solid color-mix(in srgb, #22c55e 40%, transparent)",
              borderRadius: "var(--radius)",
            }
          : state === "invalid"
            ? {
                backgroundColor: "color-mix(in srgb, #ef4444 10%, var(--bg))",
                color: "#dc2626",
                border: "1px solid color-mix(in srgb, #ef4444 40%, transparent)",
                borderRadius: "var(--radius)",
              }
            : {
                backgroundColor: "var(--card)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
              }
      }
    >
      {state === "checking" && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
      {state === "valid" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
      {state === "invalid" && <XCircle className="h-4 w-4 shrink-0" />}
      <span>{state === "checking" ? (message ?? "Checking delivery availability…") : message}</span>
    </div>
  );
}
