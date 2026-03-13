"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useStorefrontPath } from "../../lib/use-storefront-path";

interface CheckoutHeaderProps {
  slug: string;
  storeName: string;
  logoUrl?: string | null;
}

export function CheckoutHeader({ slug, storeName, logoUrl }: CheckoutHeaderProps) {
  const storePath = useStorefrontPath(slug);

  return (
    <header
      className="sticky top-0 z-50 px-4 py-3 flex items-center gap-3"
      style={{
        backgroundColor: "var(--bg)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <Link
        href={storePath()}
        className="p-2 rounded-full transition-colors hover:opacity-80"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <ArrowLeft className="h-4 w-4" style={{ color: "var(--text)" }} />
      </Link>

      {logoUrl && (
        <img
          src={logoUrl}
          alt={storeName}
          className="h-8 w-8 rounded-full object-cover"
        />
      )}

      <h1
        className="text-lg font-bold truncate"
        style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}
      >
        {storeName}
      </h1>
    </header>
  );
}
