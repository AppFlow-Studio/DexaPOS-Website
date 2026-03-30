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

const DARK_MODE_VARS = {
  classic: {
    dark: {
      "--bg": "#111827",
      "--card": "#1F2937",
      "--text": "#F9FAFB",
      "--text-secondary": "#9CA3AF",
      "--border": "#374151",
      "--surface": "#1F2937",
      "--surface-text": "#F9FAFB",
      "--card-text": "#F9FAFB",
      "--background": "#111827",
      "--foreground": "#F9FAFB",
      "--muted": "#1F2937",
      "--muted-foreground": "#9CA3AF",
      "--popover": "#1F2937",
      "--popover-foreground": "#F9FAFB",
    },
  },
  minimal: {
    dark: {
      "--bg": "#111827",
      "--card": "#1F2937",
      "--text": "#FAFAF9",
      "--text-secondary": "#A8A29E",
      "--border": "#44403C",
      "--surface": "#292524",
      "--surface-text": "#FAFAF9",
      "--card-text": "#FAFAF9",
      "--background": "#1C1917",
      "--foreground": "#FAFAF9",
      "--muted": "#292524",
      "--muted-foreground": "#A8A29E",
      "--popover": "#292524",
      "--popover-foreground": "#FAFAF9",
    },
  },
} as const;

/**
 * Returns CSS variable overrides for the requested color mode.
 * Returns an empty object when the mode matches the template's default
 * (no override needed — the base themeVars already have the right values).
 *
 * Bold: only the page background changes on dark toggle — cards/text stay
 * in their native bold colors so item cards are unaffected by the toggle.
 */
export function getDarkModeOverrides(
  isDark: boolean,
  templateId: string
): Record<string, string> {
  if (templateId === "bold") {
    // Only swap the page background; leave card/text/border vars untouched
    return isDark ? { "--bg": "#1c1c1c", "--background": "#1c1c1c" } : {};
  }
  if (templateId === "minimal") {
    return isDark
      ? (DARK_MODE_VARS.minimal.dark as Record<string, string>)
      : {};
  }
  // classic
  return isDark
    ? (DARK_MODE_VARS.classic.dark as Record<string, string>)
    : {};
}

export function buildThemeVars(theme: SiteThemeConfig | null | undefined) {
  const templateId = theme?.templateId || "classic";
  const defaults = TEMPLATE_DEFAULTS[templateId];

  // Bold gets a vivid neon-orange default primary/secondary if merchant hasn't customised
  const isBold = templateId === "bold";
  const primary = theme?.primaryColor || (isBold ? "#FF4D00" : "#2DD4BF");

  // '#f5f5f5' is the DB schema DEFAULT for background_color — it means "not explicitly set
  // by the merchant". Fall through to the template default so bold stays dark, classic
  // stays white, etc. Any other value was chosen intentionally and is respected.
  const SCHEMA_BG_DEFAULT = "#f5f5f5";
  const bg =
    theme?.backgroundColor &&
    theme.backgroundColor.toLowerCase() !== SCHEMA_BG_DEFAULT
      ? theme.backgroundColor
      : defaults.bg;

  // Transparent header is not supported on the Minimal template — fall back to filled.
  const rawHeaderStyle = theme?.headerStyle || "filled";
  const headerStyle =
    templateId === "minimal" && rawHeaderStyle === "transparent"
      ? "filled"
      : rawHeaderStyle;

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
      headerText = primary;
      headerBorder = primary;
      break;
    default:
      headerBg = primary;
      headerText = primaryText;
      headerBorder = "transparent";
      break;
  }

  // Surface colors for inputs/panels - ensure contrast even when user customizes
  const card = defaults.card;
  const text = theme?.textColor || defaults.text;
  const isCardDark = getContrastTextColor(card) === "#FFFFFF";
  const surface = isCardDark ? "#FFFFFF" : card;
  const surfaceText = isCardDark ? "#111827" : text;
  const cardText = getContrastTextColor(card);

  // Use merchant's custom font if set, otherwise template default
  const font = theme?.fontFamily
    ? `'${theme.fontFamily}', sans-serif`
    : defaults.font;

  return {
    // --- Storefront-custom vars ---
    "--primary": primary,
    "--secondary": theme?.secondaryColor || (isBold ? "#FACC15" : "#10b981"),
    "--accent": theme?.accentColor || (isBold ? "#A855F7" : primary),
    "--bg": bg,
    "--card": card,
    "--text": text,
    "--surface": surface,
    "--surface-text": surfaceText,
    "--card-text": cardText,
    "--text-secondary": defaults.textSecondary,
    "--border": defaults.border,
    "--radius": defaults.radius,
    "--font": font,
    "--font-display": defaults.fontDisplay,
    "--template": templateId,
    "--primary-text": primaryText,
    "--header-bg": headerBg,
    "--header-text": headerText,
    "--header-border": headerBorder,
    // --- Shadcn UI compatibility overrides ---
    // Bridge storefront vars to Shadcn's CSS token names so that Shadcn
    // components (Tabs, Button, Popover, Select, Input, etc.) inherit the
    // template's color scheme without per-component inline style overrides.
    "--background": bg,
    "--foreground": text,
    "--muted": card,
    "--muted-foreground": defaults.textSecondary,
    "--popover": card,
    "--popover-foreground": cardText,
    "--primary-foreground": primaryText,
    "--input": defaults.border,
    "--ring": primary,
  } as React.CSSProperties;
}
