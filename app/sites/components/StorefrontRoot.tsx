"use client";

import { useState, useEffect } from "react";
import { getDarkModeOverrides } from "../lib/theme-utils";
import { DarkModeContext } from "../contexts/DarkModeContext";

interface StorefrontRootProps {
  children: React.ReactNode;
  themeStyle: React.CSSProperties;
  templateId: string;
  baseBgColor: string;
  baseTextColor: string;
  className?: string;
}

export function StorefrontRoot({
  children,
  themeStyle,
  templateId,
  baseBgColor,
  baseTextColor,
  className = "min-h-screen overflow-x-clip",
}: StorefrontRootProps) {
  // All templates default to light; dark toggle applies overrides
  const defaultIsDark = false;

  // Start with the template default to match the server-rendered HTML (no hydration mismatch).
  const [isDark, setIsDark] = useState(defaultIsDark);
  const [mounted, setMounted] = useState(false);

  // After mount, apply the customer's stored preference.
  useEffect(() => {
    const stored = localStorage.getItem("dexa-color-mode");
    if (stored === "dark") setIsDark(true);
    else if (stored === "light") setIsDark(false);
    setMounted(true);
  }, []);

  // Keep :root CSS vars in sync so Sheet/Dialog portals (rendered outside this div) pick up the override.
  useEffect(() => {
    if (!mounted) return;
    const overrides = getDarkModeOverrides(isDark, templateId);
    Object.entries(overrides).forEach(([k, v]) => {
      document.documentElement.style.setProperty(k, v);
    });
    // When switching back to default, clear any previously-set overrides.
    if (Object.keys(overrides).length === 0) {
      const allKeys = [
        "--bg", "--card", "--text", "--text-secondary", "--border",
        "--surface", "--surface-text", "--card-text",
        "--background", "--foreground", "--muted", "--muted-foreground",
        "--popover", "--popover-foreground",
      ];
      allKeys.forEach((k) => document.documentElement.style.removeProperty(k));
    }
  }, [isDark, mounted, templateId]);

  const toggle = () => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem("dexa-color-mode", next ? "dark" : "light");
      return next;
    });
  };

  const overrides = mounted ? getDarkModeOverrides(isDark, templateId) : {};
  const bgColor = (overrides["--bg"] as string) || baseBgColor;
  const textColor = (overrides["--text"] as string) || baseTextColor;

  return (
    <DarkModeContext.Provider value={{ isDark, toggle }}>
      <div
        className={className}
        style={{
          ...themeStyle,
          ...overrides,
          backgroundColor: bgColor,
          color: textColor,
          fontFamily: "var(--font)",
          transition: "background-color 0.2s, color 0.2s",
        }}
        data-template={templateId}
        data-color-mode={isDark ? "dark" : "light"}
      >
        {children}
      </div>
    </DarkModeContext.Provider>
  );
}
