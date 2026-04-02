"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag } from "lucide-react";

export function PromoCodeSection() {
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState("");

  return (
    <section>
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 text-sm font-medium"
          style={{ color: "var(--primary)" }}
        >
          <Tag className="h-4 w-4" />
          Add Promo Code +
        </button>
      ) : (
        <div className="flex gap-2 animate-in fade-in slide-in-from-top-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Enter promo code"
            className="flex-1 !bg-white !text-gray-900"
            style={{ borderColor: "#e5e7eb", backgroundColor: "#ffffff" }}
          />
          <Button
            variant="outline"
            disabled={!code.trim()}
            style={{
              borderColor: "var(--primary)",
              color: "var(--primary)",
              borderRadius: "var(--radius)",
            }}
          >
            Apply
          </Button>
        </div>
      )}
    </section>
  );
}
