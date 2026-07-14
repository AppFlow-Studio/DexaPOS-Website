"use client";

import { Site } from "@/types/site";
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  ExternalLink,
  ChevronRight,
  ShoppingBag,
  Truck,
  Timer,
  BadgeDollarSign,
} from "lucide-react";
import { OpenClosedIndicator } from "./OpenClosedIndicator";
import { formatPhoneForDisplay } from "@/lib/phone";

interface InfoPanelProps {
  site: Site | null;
  location: {
    id: string;
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    phone: string | null;
    email: string | null;
    business_hours: any;
  };
}

function parseBusinessHours(businessHours: any): { day: string; hours: string }[] {
  if (!businessHours) return [];

  let parsed = businessHours;
  if (typeof businessHours === "string") {
    try {
      parsed = JSON.parse(businessHours);
    } catch {
      return [];
    }
  }

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => ({
        day: item.day || item.name || "",
        hours: item.closed
          ? "Closed"
          : item.hours || (item.open && item.close ? formatTimeRange(item.open, item.close) : "Closed"),
      }))
      .filter((item) => item.day);
  }

  if (typeof parsed === "object") {
    const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    return dayOrder
      .map((day) => {
        const value = parsed[day] || parsed[day.charAt(0).toUpperCase() + day.slice(1)];
        if (!value) return null;
        if (typeof value === "object" && "enabled" in value) {
          if (!value.enabled) return { day: capitalizeDay(day), hours: "Closed" };
          if (value.is24Hours) return { day: capitalizeDay(day), hours: "Open 24 Hours" };
          return { day: capitalizeDay(day), hours: formatTimeRange(value.from, value.to) };
        }
        return {
          day: capitalizeDay(day),
          hours: value?.closed
            ? "Closed"
            : typeof value === "string"
            ? value
            : value?.open && value?.close
            ? formatTimeRange(value.open, value.close)
            : "Closed",
        };
      })
      .filter((item): item is { day: string; hours: string } => item !== null);
  }

  return [];
}

function capitalizeDay(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function formatTimeRange(from: string, to: string): string {
  const formatTime = (time: string): string => {
    if (!time) return "";
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = (minutes || 0).toString().padStart(2, "0");
    return `${displayHours}:${displayMinutes} ${period}`;
  };
  return `${formatTime(from)} – ${formatTime(to)}`;
}

const border = "1px solid #E5E7EB";
const muted: React.CSSProperties = { color: "#6B7280" };
const label: React.CSSProperties = { color: "#9CA3AF", fontSize: "0.7rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" };

export function InfoPanel({ site, location }: InfoPanelProps) {
  const storeName = site?.title || location.name;
  const description = site?.description;

  const rawBusinessHours =
    site?.online_ordering_config?.operatingHours || location.business_hours;
  const businessHours = parseBusinessHours(rawBusinessHours);

  const fullAddress = `${location.address_line1}, ${location.city}, ${location.state} ${location.postal_code}`;
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`;

  const config = site?.online_ordering_config;
  const pickupEnabled = config?.pickupEnabled !== false;
  const deliveryEnabled = config?.deliveryEnabled === true;
  const prepTime = config?.preparationLeadTime;
  const minOrder = config?.minimumOrderAmount;
  const deliveryFee = config?.baseDeliveryFee;
  const freeDeliveryThreshold = config?.freeDeliveryThreshold;
  const showOrderingOptions =
    pickupEnabled || deliveryEnabled || (prepTime && prepTime > 0) || (minOrder && minOrder > 0);

  return (
    <div className="pb-8 max-w-4xl mx-auto space-y-4">
      {/* Store Header Card */}
      <div className="p-5" style={{ border, borderRadius: "16px", backgroundColor: "#fff" }}>
        <div className="flex items-start gap-4">
          {site?.logo_url ? (
            <div className="h-16 w-16 overflow-hidden shrink-0" style={{ border, borderRadius: "8px" }}>
              <img src={site.logo_url} alt={storeName} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center font-bold text-xl shrink-0"
              style={{ backgroundColor: "#f3f4f6", color: "#374151", borderRadius: "8px", border }}
            >
              {storeName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate" style={{ color: "var(--primary)", fontFamily: "var(--font-display)" }}>
              {storeName}
            </h1>
            {description && (
              <p className="mt-1 text-sm line-clamp-2" style={muted}>{description}</p>
            )}
            <div className="mt-2">
              <OpenClosedIndicator businessHours={rawBusinessHours} showSchedule={true} />
            </div>
          </div>
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

        {/* LEFT: Contact + Ordering */}
        <div className="space-y-2">
          {/* Address */}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-4 transition-colors hover:bg-gray-50"
            style={{ border, borderRadius: "16px", backgroundColor: "#fff" }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ backgroundColor: "#f3f4f6", borderRadius: "8px" }}>
              <MapPin className="h-4 w-4" style={{ color: "#6B7280" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p style={label}>Address</p>
              <p className="text-sm font-medium truncate mt-0.5" style={{ color: "#111827" }}>{location.address_line1}</p>
              <p className="text-sm truncate" style={muted}>{location.city}, {location.state} {location.postal_code}</p>
            </div>
            <ExternalLink className="h-4 w-4 shrink-0" style={muted} />
          </a>

          {/* Phone */}
          {location.phone && (
            <a
              href={`tel:${location.phone}`}
              className="flex items-center gap-4 p-4 transition-colors hover:bg-gray-50"
              style={{ border, borderRadius: "16px", backgroundColor: "#fff" }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ backgroundColor: "#f3f4f6", borderRadius: "8px" }}>
                <Phone className="h-4 w-4" style={{ color: "#6B7280" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p style={label}>Phone</p>
                <p className="text-sm font-medium truncate mt-0.5" style={{ color: "#111827" }}>{formatPhoneForDisplay(location.phone)}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0" style={muted} />
            </a>
          )}

          {/* Email */}
          {location.email && (
            <a
              href={`mailto:${location.email}`}
              className="flex items-center gap-4 p-4 transition-colors hover:bg-gray-50"
              style={{ border, borderRadius: "16px", backgroundColor: "#fff" }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ backgroundColor: "#f3f4f6", borderRadius: "8px" }}>
                <Mail className="h-4 w-4" style={{ color: "#6B7280" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p style={label}>Email</p>
                <p className="text-sm font-medium truncate mt-0.5" style={{ color: "#111827" }}>{location.email}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0" style={muted} />
            </a>
          )}

          {/* Ordering Options */}
          {showOrderingOptions && (
            <div className="p-5" style={{ border, borderRadius: "16px", backgroundColor: "#fff" }}>
              <div className="flex items-center gap-2 mb-4" style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: "12px" }}>
                <ShoppingBag className="h-4 w-4" style={{ color: "#9ca3af" }} />
                <h3 className="text-sm font-semibold" style={{ color: "#111827" }}>Ordering Options</h3>
              </div>

              <div className="space-y-3">
                {/* Pickup row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm" style={muted}>
                    <ShoppingBag className="h-4 w-4" />
                    <span>Pickup</span>
                  </div>
                  {/* MUI Chip — outlined style */}
                  <span
                    className="text-xs font-semibold px-2.5 py-0.5"
                    style={
                      pickupEnabled
                        ? { border: "1px solid var(--primary)", color: "var(--primary)", borderRadius: "16px" }
                        : { border: "1px solid #E5E7EB", color: "#9CA3AF", borderRadius: "16px" }
                    }
                  >
                    {pickupEnabled ? "Available" : "Unavailable"}
                  </span>
                </div>

                {/* Delivery row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm" style={muted}>
                    <Truck className="h-4 w-4" />
                    <span>Delivery</span>
                  </div>
                  <span
                    className="text-xs font-semibold px-2.5 py-0.5"
                    style={
                      deliveryEnabled
                        ? { border: "1px solid var(--primary)", color: "var(--primary)", borderRadius: "16px" }
                        : { border: "1px solid #E5E7EB", color: "#9CA3AF", borderRadius: "16px" }
                    }
                  >
                    {deliveryEnabled ? "Available" : "Unavailable"}
                  </span>
                </div>

                {deliveryEnabled && deliveryFee != null && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm" style={muted}>
                      <BadgeDollarSign className="h-4 w-4" />
                      <span>Delivery Fee</span>
                    </div>
                    <span className="text-sm font-medium" style={{ color: "#111827" }}>
                      {deliveryFee === 0 ? "Free" : `$${deliveryFee.toFixed(2)}`}
                      {freeDeliveryThreshold && freeDeliveryThreshold > 0 && (
                        <span className="ml-1 text-xs" style={muted}>(free over ${freeDeliveryThreshold.toFixed(0)})</span>
                      )}
                    </span>
                  </div>
                )}

                {minOrder != null && minOrder > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm" style={muted}>
                      <BadgeDollarSign className="h-4 w-4" />
                      <span>Minimum Order</span>
                    </div>
                    <span className="text-sm font-medium" style={{ color: "#111827" }}>${minOrder.toFixed(2)}</span>
                  </div>
                )}

                {prepTime != null && prepTime > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm" style={muted}>
                      <Timer className="h-4 w-4" />
                      <span>Prep Time</span>
                    </div>
                    <span className="text-sm font-medium" style={{ color: "#111827" }}>{prepTime} min</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Hours */}
        <div className="p-5" style={{ border, borderRadius: "16px", backgroundColor: "#fff" }}>
          <div className="flex items-center gap-2 mb-4" style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: "12px" }}>
            <Clock className="h-4 w-4" style={{ color: "#9ca3af" }} />
            <h3 className="text-sm font-semibold" style={{ color: "#111827" }}>Store Hours</h3>
          </div>

          {businessHours.length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <tbody>
                {businessHours.map((item, index) => {
                  const isToday =
                    new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase() ===
                    item.day.toLowerCase();
                  const isClosed = item.hours.toLowerCase() === "closed";
                  return (
                    <tr
                      key={index}
                      style={isToday ? { borderLeft: "3px solid var(--primary)" } : { borderLeft: "3px solid transparent" }}
                    >
                      <td className="py-2.5 px-3" style={{ color: isToday ? "var(--primary)" : "#374151", fontWeight: isToday ? 600 : 400 }}>
                        {item.day}
                        {isToday && (
                          <span
                            className="ml-2 text-[10px] font-semibold px-1.5 py-0.5"
                            style={{ backgroundColor: "#111827", color: "#fff", borderRadius: "3px" }}
                          >
                            TODAY
                          </span>
                        )}
                      </td>
                      <td
                        className="py-2.5 px-3 text-right"
                        style={{ color: isClosed ? "#d1d5db" : isToday ? "var(--primary)" : "#6B7280", fontWeight: isToday ? 600 : 400 }}
                      >
                        {item.hours}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-4">
              <p className="font-medium" style={{ color: "#111827" }}>Hours not available</p>
              <p className="text-sm mt-1" style={muted}>Contact the store for operating hours</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
