"use client";

import { MapPin } from "lucide-react";

interface StoreMapEmbedProps {
  lat?: number | null;
  lng?: number | null;
  address: string;
}

export function StoreMapEmbed({ lat, lng, address }: StoreMapEmbedProps) {
  if (!lat || !lng) {
    return (
      <div
        className="rounded-lg p-4 flex items-center gap-3"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <MapPin className="h-5 w-5 shrink-0" style={{ color: "var(--primary)" }} />
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {address}
          </p>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline"
            style={{ color: "var(--primary)" }}
          >
            View on Google Maps
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <iframe
          title="Store location"
          width="100%"
          height="180"
          style={{ border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
        />
      </div>
      <div className="flex items-center gap-2 px-1">
        <MapPin className="h-4 w-4 shrink-0" style={{ color: "var(--primary)" }} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {address}
        </p>
      </div>
    </div>
  );
}
