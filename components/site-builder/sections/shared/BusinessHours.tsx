import { parseBusinessHours } from "@/lib/site-builder/business-hours";
import type { ResolvedLocation } from "@/lib/site-builder/bindings/resolved";

/** Opening hours table. Shared by the location and footer sections. */
export default function BusinessHours({
  businessHours,
  compact = false,
}: {
  businessHours: unknown;
  compact?: boolean;
}) {
  const days = parseBusinessHours(businessHours);
  if (days.length === 0) return null;

  return (
    <div>
      {!compact && (
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider opacity-60">Hours</h3>
      )}
      <dl className="space-y-1.5 text-sm">
        {days.map((day) => (
          <div key={day.day} className="flex justify-between gap-6">
            <dt className="opacity-70">{day.day}</dt>
            <dd className={`tabular-nums ${day.closed ? "opacity-50" : "font-medium"}`}>
              {day.hours}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function formatAddress(location: ResolvedLocation): string | null {
  const street = location.addressLine1;
  if (!street) return null;
  const cityLine = [location.city, location.state].filter(Boolean).join(", ");
  return [street, cityLine, location.postalCode].filter(Boolean).join(", ");
}

export function mapsSearchUrl(location: ResolvedLocation): string {
  const query = formatAddress(location) ?? location.name;
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}
