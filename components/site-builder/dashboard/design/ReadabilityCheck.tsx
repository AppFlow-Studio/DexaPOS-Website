"use client";

import { AlertTriangle, Check, CircleAlert } from "lucide-react";

import { contrastRatio, gradeContrast, type ContrastGrade } from "@/lib/site-builder/color";
import type { ThemeTokens } from "@/lib/site-builder/render-context";
import { cn } from "@/lib/utils";

/**
 * WCAG contrast for the five text/background pairs a merchant can actually
 * break by choosing colours.
 *
 * A merchant picking "sunny yellow" for their brand has no way to know white
 * button text will be unreadable on it — a hex field will happily accept it and
 * the preview will look fine at a glance. This turns that into a specific,
 * fixable warning before publish rather than a customer complaint after.
 */
const PAIRS: { id: string; label: string; foreground: keyof ThemeTokens; background: keyof ThemeTokens }[] = [
  { id: "button", label: "Button text on your brand colour", foreground: "brandContrast", background: "brand" },
  { id: "body", label: "Body text on the page background", foreground: "text", background: "surface" },
  { id: "muted", label: "Secondary text on the page background", foreground: "textMuted", background: "surface" },
  { id: "card", label: "Text inside content cards", foreground: "text", background: "card" },
  { id: "footer", label: "Footer text on the dark band", foreground: "textOnDark", background: "surfaceDark" },
];

const GRADE_COPY: Record<ContrastGrade, { tone: string; icon: typeof Check; label: string }> = {
  aaa: { tone: "text-emerald-600", icon: Check, label: "Excellent" },
  aa: { tone: "text-emerald-600", icon: Check, label: "Readable" },
  "aa-large": { tone: "text-amber-600", icon: AlertTriangle, label: "Large text only" },
  fail: { tone: "text-destructive", icon: CircleAlert, label: "Hard to read" },
};

export function readabilityProblems(theme: ThemeTokens): number {
  return PAIRS.filter(({ foreground, background }) => {
    const grade = gradeContrast(String(theme[foreground]), String(theme[background]));
    return grade === "fail" || grade === "aa-large";
  }).length;
}

export default function ReadabilityCheck({ theme }: { theme: ThemeTokens }) {
  return (
    <ul className="space-y-1.5">
      {PAIRS.map(({ id, label, foreground, background }) => {
        const fg = String(theme[foreground]);
        const bg = String(theme[background]);
        const grade = gradeContrast(fg, bg);
        const { tone, icon: Icon, label: verdict } = GRADE_COPY[grade];
        const ratio = contrastRatio(fg, bg);

        return (
          <li key={id} className="flex items-center gap-2.5 text-xs">
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border text-[10px] font-bold"
              style={{ background: bg, color: fg }}
            >
              Aa
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
            <span className={cn("flex shrink-0 items-center gap-1 font-medium", tone)}>
              <Icon className="h-3.5 w-3.5" />
              {verdict}
              <span className="tabular-nums text-muted-foreground">{ratio.toFixed(1)}:1</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
