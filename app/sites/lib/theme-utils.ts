import type { SiteThemeConfig } from "@/types/site";

// Maps the font options from the dashboard picker to their Google Fonts URLs.
// The template fontUrl already bundles display fonts — this map covers the body font only.
export const FONT_GOOGLE_URLS: Record<string, string> = {
  "DM Sans": "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap",
  "Inter": "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
  "Poppins": "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap",
  "Roboto": "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap",
  "Open Sans": "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap",
  "Lato": "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap",
  "Montserrat": "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap",
  "Playfair Display": "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
};

// Typography and geometry vary per template — colors do not.
export const TEMPLATE_DEFAULTS = {
  classic: {
    bg: "#FFFFFF",
    card: "#FFFFFF",
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
    bg: "#FFFFFF",
    card: "#FFFFFF",
    text: "#111827",
    textSecondary: "#6B7280",
    border: "#E5E7EB",
    radius: "16px",
    font: "'Space Grotesk', sans-serif",
    fontDisplay: "'Playfair Display', serif",
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap",
  },
  minimal: {
    bg: "#FFFFFF",
    card: "#FFFFFF",
    text: "#111827",
    textSecondary: "#6B7280",
    border: "#E5E7EB",
    radius: "8px",
    font: "'Outfit', sans-serif",
    fontDisplay: "'DM Serif Display', serif",
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=DM+Serif+Display&display=swap",
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

/**
 * Dark mode is disabled on the storefront — always returns an empty object.
 * The function is kept so callers compile without change.
 */
export function getDarkModeOverrides(
  _isDark: boolean,
  _templateId: string
): Record<string, string> {
  return {};
}

export function buildThemeVars(theme: SiteThemeConfig | null | undefined) {
  const templateId = theme?.templateId || "classic";
  const defaults = TEMPLATE_DEFAULTS[templateId];

  const isHex = (val: string | undefined | null) =>
    typeof val === "string" && /^#[0-9a-fA-F]{6}$/.test(val.trim());

  // Allow merchant overrides for the key theme colors.
  const primary = isHex(theme?.primaryColor)
    ? (theme?.primaryColor as string)
    : "#111827";
  const primaryText = getContrastTextColor(primary);

  const secondary = isHex(theme?.secondaryColor)
    ? (theme?.secondaryColor as string)
    : primary;
  const accent = isHex(theme?.accentColor)
    ? (theme?.accentColor as string)
    : primary;

  const bg = isHex(theme?.backgroundColor)
    ? (theme?.backgroundColor as string)
    : defaults.bg;
  const card = defaults.card;
  const text = isHex(theme?.textColor)
    ? (theme?.textColor as string)
    : defaults.text;
  const border = defaults.border;
  const textSecondary = defaults.textSecondary;

  // Header is always white with a gray bottom border.
  const headerBg = "#FFFFFF";
  const headerText = "#111827";
  const headerBorder = "#E5E7EB";

  // Surface for inputs/panels.
  const surface = "#F9FAFB";
  const surfaceText = "#111827";

  // Use merchant's custom font if set, otherwise template default.
  const font = theme?.fontFamily
    ? `'${theme.fontFamily}', sans-serif`
    : defaults.font;

  return {
    // --- Storefront-custom vars ---
    "--primary": primary,
    "--secondary": secondary,
    "--accent": accent,
    "--bg": bg,
    "--card": card,
    "--text": text,
    "--surface": surface,
    "--surface-text": surfaceText,
    "--card-text": text,
    "--text-secondary": textSecondary,
    "--border": border,
    "--radius": defaults.radius,
    "--font": font,
    "--font-display": defaults.fontDisplay,
    "--template": templateId,
    "--primary-text": primaryText,
    "--header-bg": headerBg,
    "--header-text": headerText,
    "--header-border": headerBorder,
    // --- Shadcn UI compatibility overrides ---
    "--background": bg,
    "--foreground": text,
    "--muted": "#F3F4F6",
    "--muted-foreground": textSecondary,
    "--popover": card,
    "--popover-foreground": text,
    "--primary-foreground": primaryText,
    "--input": border,
    "--ring": primary,
  } as React.CSSProperties;
}
