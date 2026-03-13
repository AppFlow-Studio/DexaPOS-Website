import type { SiteThemeConfig } from "@/types/site";

export const TEMPLATE_DEFAULTS = {
  classic: {
    bg: "#FFFFFF",
    card: "#F9FAFB",
    text: "#111827",
    textSecondary: "#6B7280",
    border: "#E5E7EB",
    radius: "12px",
    font: "'DM Sans', sans-serif",
    fontDisplay: "'DM Serif Display', serif",
    fontUrl:
      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap",
  },
  bold: {
    bg: "#0A0A0A",
    card: "#171717",
    text: "#FAFAFA",
    textSecondary: "#A3A3A3",
    border: "#262626",
    radius: "16px",
    font: "'Space Grotesk', sans-serif",
    fontDisplay: "'Playfair Display', serif",
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap",
  },
  minimal: {
    bg: "#FAFAF9",
    card: "#FFFFFF",
    text: "#1C1917",
    textSecondary: "#78716C",
    border: "#E7E5E4",
    radius: "8px",
    font: "'Outfit', sans-serif",
    fontDisplay: "'Outfit', sans-serif",
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap",
  },
} as const;

export function getContrastTextColor(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const toLinear = (v: number) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.4 ? "#111827" : "#FFFFFF";
}

export function buildThemeVars(theme: SiteThemeConfig | null | undefined) {
  const templateId = theme?.templateId || "classic";
  const defaults = TEMPLATE_DEFAULTS[templateId];
  const primary = theme?.primaryColor || "#2DD4BF";
  const bg = theme?.backgroundColor || defaults.bg;
  const headerStyle = theme?.headerStyle || "filled";

  const primaryText =
    theme?.headerTextColor || getContrastTextColor(primary);

  let headerBg: string;
  let headerText: string;
  let headerBorder: string;

  switch (headerStyle) {
    case "transparent":
      headerBg = "transparent";
      headerText = "#FFFFFF";
      headerBorder = "transparent";
      break;
    case "outlined":
      headerBg = bg;
      headerText = theme?.textColor || defaults.text;
      headerBorder = defaults.border;
      break;
    default:
      headerBg = primary;
      headerText = primaryText;
      headerBorder = "transparent";
      break;
  }

  return {
    "--primary": primary,
    "--secondary": theme?.secondaryColor || "#10b981",
    "--accent": theme?.accentColor || primary,
    "--bg": bg,
    "--card": defaults.card,
    "--text": theme?.textColor || defaults.text,
    "--text-secondary": defaults.textSecondary,
    "--border": defaults.border,
    "--radius": defaults.radius,
    "--font": defaults.font,
    "--font-display": defaults.fontDisplay,
    "--template": templateId,
    "--primary-text": primaryText,
    "--header-bg": headerBg,
    "--header-text": headerText,
    "--header-border": headerBorder,
  } as React.CSSProperties;
}
