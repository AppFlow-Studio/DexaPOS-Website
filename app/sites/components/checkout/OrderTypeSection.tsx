"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon, MapPin, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { StoreMapEmbed } from "./StoreMapEmbed";
import type { SavedAddress } from "../../customer-actions";
import type { WeeklySchedule } from "@/types/site";

// Generates 30-min time slots within the store's operating hours for the selected day.
// Falls back to 8 AM–9 PM if no hours configured.
// Filters out past slots when the selected date is today.
function getTimeSlots(
  scheduledDate: Date | undefined,
  operatingHours: WeeklySchedule | undefined,
  prepTime: number
): string[] {
  const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
  const date = scheduledDate ?? new Date();
  const dayName = DAY_NAMES[date.getDay()];
  const daySchedule = operatingHours?.[dayName];

  let startHour = 8, startMin = 0;
  let endHour = 21, endMin = 0;

  if (daySchedule) {
    if (!daySchedule.enabled) return []; // store closed this day
    if (daySchedule.is24Hours) {
      startHour = 0; startMin = 0; endHour = 23; endMin = 30;
    } else {
      const [fH, fM] = daySchedule.from.split(":").map(Number);
      const [tH, tM] = daySchedule.to.split(":").map(Number);
      startHour = fH; startMin = fM; endHour = tH; endMin = tM;
    }
  }

  const endTotalMins = endHour * 60 + endMin;
  const startTotalMins = startHour * 60 + startMin + prepTime;

  // Filter past slots if the chosen date is today
  const now = new Date();
  const isToday = scheduledDate
    ? scheduledDate.toDateString() === now.toDateString()
    : true;
  const nowMinsPlusPrepTime = isToday ? now.getHours() * 60 + now.getMinutes() + prepTime : 0;

  const slots: string[] = [];
  // Round up to the next 30-min boundary from open+prep
  let cursor = Math.ceil(startTotalMins / 30) * 30;
  while (cursor < endTotalMins) {
    if (!isToday || cursor > nowMinsPlusPrepTime) {
      const h = Math.floor(cursor / 60);
      const m = cursor % 60;
      slots.push(`${h}:${m.toString().padStart(2, "0")}`);
    }
    cursor += 30;
  }
  return slots;
}

interface OrderTypeSectionProps {
  orderType: "pickup" | "delivery";
  onOrderTypeChange: (v: "pickup" | "delivery") => void;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  pickupTime: "asap" | "scheduled";
  onPickupTimeChange: (v: "asap" | "scheduled") => void;
  scheduledDate: Date | undefined;
  onScheduledDateChange: (d: Date | undefined) => void;
  scheduledTime: string;
  onScheduledTimeChange: (v: string) => void;
  maxFutureDays: number;
  prepTime: number;
  operatingHours?: WeeklySchedule;
  curbside: boolean;
  onCurbsideChange: (v: boolean) => void;
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
}

export function OrderTypeSection({
  orderType,
  onOrderTypeChange,
  pickupEnabled,
  deliveryEnabled,
  pickupTime,
  onPickupTimeChange,
  scheduledDate,
  onScheduledDateChange,
  scheduledTime,
  onScheduledTimeChange,
  maxFutureDays,
  prepTime,
  operatingHours,
  curbside,
  onCurbsideChange,
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
}: OrderTypeSectionProps) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);

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
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pickup" disabled={!pickupEnabled}>
            Pickup
          </TabsTrigger>
          <TabsTrigger value="delivery" disabled={!deliveryEnabled}>
            Delivery
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Pickup section */}
      {orderType === "pickup" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
          <StoreMapEmbed lat={storeLat} lng={storeLng} address={storeAddress} />

          {/* Curbside toggle */}
          <div
            className="flex items-center justify-between p-3 rounded-lg"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                Curbside Pickup
              </p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                We&apos;ll bring the order to your car
              </p>
            </div>
            <Switch checked={curbside} onCheckedChange={onCurbsideChange} />
          </div>
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
              />
              <div className="grid grid-cols-3 gap-2">
                <Input
                  value={newAddress.city}
                  onChange={(e) => onNewAddressChange({ ...newAddress, city: e.target.value })}
                  placeholder="City"
                  autoComplete="address-level2"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--card)", color: "var(--text)" }}
                />
                <Input
                  value={newAddress.state}
                  onChange={(e) => onNewAddressChange({ ...newAddress, state: e.target.value })}
                  placeholder="State"
                  autoComplete="address-level1"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--card)", color: "var(--text)" }}
                />
                <Input
                  value={newAddress.zip}
                  onChange={(e) => onNewAddressChange({ ...newAddress, zip: e.target.value })}
                  placeholder="ZIP"
                  autoComplete="postal-code"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--card)", color: "var(--text)" }}
                />
              </div>
              <Input
                value={newAddress.notes}
                onChange={(e) => onNewAddressChange({ ...newAddress, notes: e.target.value })}
                placeholder="Delivery notes (apt #, gate code...)"
                autoComplete="off"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--card)", color: "var(--text)" }}
              />
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

      {/* Scheduling */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
        <h3 className="font-semibold mb-3" style={{ color: "var(--text)" }}>
          {orderType === "pickup" ? "Pickup Time" : "Delivery Time"}
        </h3>
        <div className="flex gap-3">
          <Button
            variant={pickupTime === "asap" ? "default" : "outline"}
            className="flex-1 hover:bg-transparent active:bg-transparent"
            onClick={() => onPickupTimeChange("asap")}
            style={
              pickupTime === "asap"
                ? { backgroundColor: "var(--primary)", color: "#fff", borderRadius: "var(--radius)" }
                : { borderColor: "#E5E7EB", color: "#6B7280", borderRadius: "var(--radius)", backgroundColor: "#FFFFFF" }
            }
          >
            ASAP
            {pickupTime === "asap" && prepTime > 0 && (
              <span className="ml-1 opacity-75">~{prepTime} min</span>
            )}
          </Button>
          <Button
            variant={pickupTime === "scheduled" ? "default" : "outline"}
            className="flex-1 hover:bg-transparent active:bg-transparent"
            onClick={() => onPickupTimeChange("scheduled")}
            style={
              pickupTime === "scheduled"
                ? { backgroundColor: "var(--primary)", color: "#fff", borderRadius: "var(--radius)" }
                : { borderColor: "#E5E7EB", color: "#6B7280", borderRadius: "var(--radius)", backgroundColor: "#FFFFFF" }
            }
          >
            Schedule
          </Button>
        </div>

        {pickupTime === "scheduled" && (
          <div className="grid grid-cols-2 gap-3 mt-3 animate-in fade-in slide-in-from-top-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Date</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal hover:bg-transparent active:bg-transparent")}
                    style={{ borderColor: "#E5E7EB", color: "#111827" }}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduledDate ? format(scheduledDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={scheduledDate}
                    onSelect={(date) => {
                      onScheduledDateChange(date);
                      setDatePickerOpen(false);
                    }}
                    initialFocus
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const maxDate = new Date(today);
                      maxDate.setDate(maxDate.getDate() + maxFutureDays);
                      return date < today || date > maxDate;
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Time</Label>
              <Select value={scheduledTime} onValueChange={onScheduledTimeChange}>
                <SelectTrigger style={{ borderColor: "var(--border)" }}>
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const slots = getTimeSlots(scheduledDate, operatingHours, prepTime);
                    if (slots.length === 0) {
                      return (
                        <div className="p-3 text-sm text-center" style={{ color: "var(--text-secondary)" }}>
                          Store is closed on this day
                        </div>
                      );
                    }
                    return slots.map((slot) => {
                      const [h, m] = slot.split(":").map(Number);
                      const ampm = h >= 12 ? "PM" : "AM";
                      const displayHour = h % 12 || 12;
                      return (
                        <SelectItem key={slot} value={slot} className="focus:bg-transparent hover:bg-transparent data-[highlighted]:bg-gray-50">
                          {displayHour}:{m.toString().padStart(2, "0")} {ampm}
                        </SelectItem>
                      );
                    });
                  })()}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
