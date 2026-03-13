"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { StoreMapEmbed } from "./StoreMapEmbed";
import type { SavedAddress } from "../../customer-actions";

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
                      ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                      : "var(--bg)",
                  }}
                >
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--primary)" }} />
                  <div>
                    <p className="text-sm font-medium">{addr.label}</p>
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
              <Input
                value={newAddress.street}
                onChange={(e) => onNewAddressChange({ ...newAddress, street: e.target.value })}
                placeholder="Street address"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
              />
              <div className="grid grid-cols-3 gap-2">
                <Input
                  value={newAddress.city}
                  onChange={(e) => onNewAddressChange({ ...newAddress, city: e.target.value })}
                  placeholder="City"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                />
                <Input
                  value={newAddress.state}
                  onChange={(e) => onNewAddressChange({ ...newAddress, state: e.target.value })}
                  placeholder="State"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                />
                <Input
                  value={newAddress.zip}
                  onChange={(e) => onNewAddressChange({ ...newAddress, zip: e.target.value })}
                  placeholder="ZIP"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
                />
              </div>
              <Input
                value={newAddress.notes}
                onChange={(e) => onNewAddressChange({ ...newAddress, notes: e.target.value })}
                placeholder="Delivery notes (apt #, gate code...)"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
              />
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
            className="flex-1"
            onClick={() => onPickupTimeChange("asap")}
            style={
              pickupTime === "asap"
                ? { backgroundColor: "var(--primary)", color: "#fff", borderRadius: "var(--radius)" }
                : { borderColor: "var(--border)", borderRadius: "var(--radius)" }
            }
          >
            ASAP
            {pickupTime === "asap" && prepTime > 0 && (
              <span className="ml-1 opacity-75">~{prepTime} min</span>
            )}
          </Button>
          <Button
            variant={pickupTime === "scheduled" ? "default" : "outline"}
            className="flex-1"
            onClick={() => onPickupTimeChange("scheduled")}
            style={
              pickupTime === "scheduled"
                ? { backgroundColor: "var(--primary)", color: "#fff", borderRadius: "var(--radius)" }
                : { borderColor: "var(--border)", borderRadius: "var(--radius)" }
            }
          >
            Schedule
          </Button>
        </div>

        {pickupTime === "scheduled" && (
          <div className="grid grid-cols-2 gap-3 mt-3 animate-in fade-in slide-in-from-top-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal")}
                    style={{ borderColor: "var(--border)" }}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduledDate ? format(scheduledDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={scheduledDate}
                    onSelect={onScheduledDateChange}
                    initialFocus
                    disabled={(date) => {
                      const maxDate = new Date();
                      maxDate.setDate(maxDate.getDate() + maxFutureDays);
                      return date < new Date() || date > maxDate;
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
                  {Array.from({ length: 28 }, (_, i) => {
                    const hour = Math.floor(i / 2) + 8;
                    const min = i % 2 === 0 ? "00" : "30";
                    if (hour > 21) return null;
                    const ampm = hour >= 12 ? "PM" : "AM";
                    const displayHour = hour > 12 ? hour - 12 : hour;
                    return (
                      <SelectItem key={i} value={`${hour}:${min}`}>
                        {displayHour}:{min} {ampm}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
