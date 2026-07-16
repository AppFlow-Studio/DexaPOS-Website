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
      {/* Header — matches the checkout header (cream bar, circular bordered back button) */}
      <header
        className="sticky top-0 z-50"
        style={{
          backgroundColor: "var(--bg)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.push(storefrontPath())}
            className="p-2 rounded-full transition-colors hover:opacity-80 shrink-0"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
            aria-label="Back to menu"
          >
            <ArrowLeft className="h-4 w-4" style={{ color: "var(--text)" }} />
          </button>

          {site?.logo_url && (
            <img
              src={site.logo_url}
              alt={storeName}
              className="h-8 w-8 rounded-full object-cover shrink-0"
            />
          )}

          <h1
            className="text-lg font-bold truncate"
            style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
          >
            {storeName}
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <InfoPanel site={site} location={location} />
      </div>
    </div>
  );
}
