"use client";

import { Site } from "@/types/site";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

interface BranchStorySectionProps {
  site: Site | null;
  className?: string;
}

/** Branch-specific "Local Vibe" section — shows when description exists. */
export function BranchStorySection({ site, className }: BranchStorySectionProps) {
  const description = site?.description?.trim();
  if (!description || description.length < 10) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className={className}
    >
      <div
        className="px-4 py-4 rounded-2xl"
        style={{
          backgroundColor: "color-mix(in srgb, var(--primary) 8%, var(--bg))",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: "color-mix(in srgb, var(--primary) 20%, transparent)",
            }}
          >
            <Sparkles className="h-4 w-4" style={{ color: "var(--primary)" }} />
          </div>
          <div>
            <h3
              className="text-sm font-semibold mb-1"
              style={{ color: "var(--primary)" }}
            >
              About Us
            </h3>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {description}
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
