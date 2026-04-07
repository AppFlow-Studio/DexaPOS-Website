"use client";

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
  className = "min-h-screen overflow-x-clip",
}: StorefrontRootProps) {
  // Dark mode is disabled on the storefront — always light.
  // DarkModeContext.Provider is kept so any child that calls useDarkMode() compiles cleanly.
  const noopToggle = () => {};

  return (
    <DarkModeContext.Provider value={{ isDark: false, toggle: noopToggle }}>
      <div
        className={className}
        style={{
          ...themeStyle,
          backgroundColor: "#FFFFFF",
          color: "#111827",
          fontFamily: "var(--font)",
        }}
        data-template={templateId}
        data-color-mode="light"
      >
        {children}
      </div>
    </DarkModeContext.Provider>
  );
}
