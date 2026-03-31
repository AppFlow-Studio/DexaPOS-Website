"use client";

import { Site } from "@/types/site";
import { motion } from "motion/react";
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
import { cn } from "@/lib/utils";
import { OpenClosedIndicator } from "./OpenClosedIndicator";

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

// Parse business hours from various formats
function parseBusinessHours(
  businessHours: any
): { day: string; hours: string }[] {
  if (!businessHours) return [];

  // If it's a string, try to parse as JSON
  let parsed = businessHours;
  if (typeof businessHours === "string") {
    try {
      parsed = JSON.parse(businessHours);
    } catch {
      return [];
    }
  }

  // If it's an array of objects like [{ day: 'Monday', open: '9:00', close: '17:00' }]
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => ({
        day: item.day || item.name || "",
        hours: item.closed
          ? "Closed"
          : item.hours ||
            (item.open && item.close
              ? formatTimeRange(item.open, item.close)
              : "Closed"),
      }))
      .filter((item) => item.day);
  }

  // If it's an object (Legacy or WeeklySchedule)
  if (typeof parsed === "object") {
    const dayOrder = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];

    return dayOrder
      .map((day) => {
        const value =
          parsed[day] || parsed[day.charAt(0).toUpperCase() + day.slice(1)];

        if (!value) return null;

        if (typeof value === "object" && "enabled" in value) {
          if (!value.enabled)
            return { day: capitalizeDay(day), hours: "Closed" };
          if (value.is24Hours)
            return { day: capitalizeDay(day), hours: "Open 24 Hours" };
          return {
            day: capitalizeDay(day),
            hours: formatTimeRange(value.from, value.to),
          };
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
  return `${formatTime(from)} - ${formatTime(to)}`;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0 },
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "var(--card)",
  borderColor: "var(--border)",
  color: "var(--text)",
};

const iconBoxStyle: React.CSSProperties = {
  backgroundColor: "color-mix(in srgb, var(--text) 8%, var(--card))",
  color: "var(--text-secondary)",
};

const labelStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
};

const mutedTextStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
};

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
    pickupEnabled ||
    deliveryEnabled ||
    (prepTime && prepTime > 0) ||
    (minOrder && minOrder > 0);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="pb-8 overflow-hidden max-w-4xl mx-auto space-y-4"
    >
      {/* Store Header Card */}
      <motion.div
        variants={itemVariants}
        className="rounded-xl border p-5 shadow-sm"
        style={cardStyle}
      >
        <div className="flex items-start gap-4">
          {site?.logo_url ? (
            <div
              className="h-16 w-16 rounded-xl overflow-hidden shadow-sm border shrink-0"
              style={{ borderColor: "var(--border)" }}
            >
              <img
                src={site.logo_url}
                alt={storeName}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-xl text-white font-bold text-xl shrink-0"
              style={{
                backgroundColor: site?.theme_config?.primaryColor || "#3b82f6",
              }}
            >
              {storeName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate" style={{ color: "var(--text)" }}>
              {storeName}
            </h1>
            {description && (
              <p className="mt-1 text-sm line-clamp-2" style={mutedTextStyle}>
                {description}
              </p>
            )}
            <div className="mt-3">
              <OpenClosedIndicator
                businessHours={rawBusinessHours}
                showSchedule={true}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Two-column grid on md+, single column on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

        {/* LEFT: Contact info + Ordering Options */}
        <div className="space-y-2">
          {/* Address */}
          <motion.a
            variants={itemVariants}
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-4 rounded-xl border p-4 shadow-sm transition-all duration-200"
            style={cardStyle}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "";
            }}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={iconBoxStyle}>
              <MapPin className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide" style={labelStyle}>
                Address
              </p>
              <p className="text-sm font-medium truncate mt-0.5" style={{ color: "var(--text)" }}>
                {location.address_line1}
              </p>
              <p className="text-sm truncate" style={mutedTextStyle}>
                {location.city}, {location.state} {location.postal_code}
              </p>
            </div>
            <ExternalLink className="h-4 w-4 shrink-0 transition-colors" style={mutedTextStyle} />
          </motion.a>

          {/* Phone */}
          {location.phone && (
            <motion.a
              variants={itemVariants}
              href={`tel:${location.phone}`}
              className="group flex items-center gap-4 rounded-xl border p-4 shadow-sm transition-all duration-200"
              style={cardStyle}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = "";
              }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={iconBoxStyle}>
                <Phone className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide" style={labelStyle}>
                  Phone
                </p>
                <p className="text-sm font-medium truncate mt-0.5" style={{ color: "var(--text)" }}>
                  {location.phone}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 transition-colors" style={mutedTextStyle} />
            </motion.a>
          )}

          {/* Email */}
          {location.email && (
            <motion.a
              variants={itemVariants}
              href={`mailto:${location.email}`}
              className="group flex items-center gap-4 rounded-xl border p-4 shadow-sm transition-all duration-200"
              style={cardStyle}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = "";
              }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={iconBoxStyle}>
                <Mail className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide" style={labelStyle}>
                  Email
                </p>
                <p className="text-sm font-medium truncate mt-0.5" style={{ color: "var(--text)" }}>
                  {location.email}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 transition-colors" style={mutedTextStyle} />
            </motion.a>
          )}

          {/* Ordering Options */}
          {showOrderingOptions && (
            <motion.div
              variants={itemVariants}
              className="rounded-xl border p-5 shadow-sm"
              style={cardStyle}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={iconBoxStyle}>
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold" style={{ color: "var(--text)" }}>Ordering Options</h3>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm" style={mutedTextStyle}>
                    <ShoppingBag className="h-4 w-4" style={{ opacity: 0.6 }} />
                    <span>Pickup</span>
                  </div>
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", pickupEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400")}>
                    {pickupEnabled ? "Available" : "Unavailable"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm" style={mutedTextStyle}>
                    <Truck className="h-4 w-4" style={{ opacity: 0.6 }} />
                    <span>Delivery</span>
                  </div>
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", deliveryEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400")}>
                    {deliveryEnabled ? "Available" : "Unavailable"}
                  </span>
                </div>

                {deliveryEnabled && deliveryFee != null && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm" style={mutedTextStyle}>
                      <BadgeDollarSign className="h-4 w-4" style={{ opacity: 0.6 }} />
                      <span>Delivery Fee</span>
                    </div>
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {deliveryFee === 0 ? "Free" : `$${deliveryFee.toFixed(2)}`}
                      {freeDeliveryThreshold && freeDeliveryThreshold > 0 && (
                        <span className="ml-1 text-xs" style={mutedTextStyle}>(free over ${freeDeliveryThreshold.toFixed(0)})</span>
                      )}
                    </span>
                  </div>
                )}

                {minOrder != null && minOrder > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm" style={mutedTextStyle}>
                      <BadgeDollarSign className="h-4 w-4" style={{ opacity: 0.6 }} />
                      <span>Minimum Order</span>
                    </div>
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>${minOrder.toFixed(2)}</span>
                  </div>
                )}

                {prepTime != null && prepTime > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm" style={mutedTextStyle}>
                      <Timer className="h-4 w-4" style={{ opacity: 0.6 }} />
                      <span>Prep Time</span>
                    </div>
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{prepTime} min</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* RIGHT: Hours */}
        <div className="space-y-4">
          <motion.div
            variants={itemVariants}
            className="rounded-xl border p-5 shadow-sm"
            style={cardStyle}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={iconBoxStyle}>
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold" style={{ color: "var(--text)" }}>Store Hours</h3>
            </div>

            {businessHours.length > 0 ? (
              <div className="space-y-0">
                {businessHours.map((item, index) => {
                  const isToday =
                    new Date()
                      .toLocaleDateString("en-US", { weekday: "long" })
                      .toLowerCase() === item.day.toLowerCase();
                  const isClosed = item.hours.toLowerCase() === "closed";
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors"
                      style={
                        isToday
                          ? {
                              backgroundColor: "color-mix(in srgb, var(--text) 6%, var(--card))",
                              border: "1px solid var(--border)",
                            }
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--text)" }}
                        >
                          {item.day}
                        </span>
                        {isToday && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: "var(--text)",
                              color: "var(--card)",
                            }}
                          >
                            TODAY
                          </span>
                        )}
                      </div>
                      <span
                        className="text-sm"
                        style={{
                          color: isClosed
                            ? "var(--text-secondary)"
                            : isToday
                            ? "var(--primary)"
                            : "var(--text-secondary)",
                          fontWeight: isToday ? 500 : undefined,
                        }}
                      >
                        {item.hours}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="font-medium" style={{ color: "var(--text)" }}>Hours not available</p>
                <p className="text-sm mt-1" style={mutedTextStyle}>Contact the store for operating hours</p>
              </div>
            )}
          </motion.div>
        </div>

      </div>
    </motion.div>
  );
}
