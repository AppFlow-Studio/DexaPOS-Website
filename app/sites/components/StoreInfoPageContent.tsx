"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Site } from "@/types/site";
import { InfoPanel } from "./InfoPanel";
import { useStorefrontPath } from "../lib/use-storefront-path";

interface StoreInfoPageContentProps {
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
  slug: string;
}

export function StoreInfoPageContent({ site, location, slug }: StoreInfoPageContentProps) {
  const router = useRouter();
  const storefrontPath = useStorefrontPath(slug);
  const storeName = site?.title || location.name;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FFFFFF", color: "#111827" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 border-b"
        style={{
          backgroundColor: "#FFFFFF",
          borderColor: "#E5E7EB",
        }}
      >
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.push(storefrontPath())}
            className="flex items-center justify-center h-9 w-9 rounded-full transition-colors"
            style={{ color: "var(--primary)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--primary) 10%, transparent)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
            aria-label="Back to menu"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1
              className="text-base font-bold leading-tight"
              style={{ fontFamily: "var(--font-display)", color: "#111827" }}
            >
              Store Menu
            </h1>
            <p className="text-xs" style={{ color: "#6B7280" }}>
              {storeName}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <InfoPanel site={site} location={location} />
      </div>
    </div>
  );
}
