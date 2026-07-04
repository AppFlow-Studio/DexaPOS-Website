export type PosUiScale = "compact" | "comfortable" | "large";
export type PosAppTheme = "system" | "light" | "dark";

export interface PosPrintingConfig {
  showTaxBreakdown: boolean;
  showItemizedList: boolean;
  showTipOptions: boolean;
  footerMessage: string;
  showGuestCount: boolean;
  showCourseNumber: boolean;
}

export interface PosPaymentConfig {
  cashEnabled: boolean;
  splitByItem: boolean;
  splitEvenly: boolean;
  splitByAmount: boolean;
}

export interface PosDisplayConfig {
  uiScale: PosUiScale;
  appTheme: PosAppTheme;
}

export interface PosNotificationConfig {
  soundEnabled: boolean;
  volume: number;
}

export interface PosConfig {
  _schema?: "pos_config_v1";
  _version?: number;
  _updated_at?: string;
  printing: PosPrintingConfig;
  payment: PosPaymentConfig;
  display: PosDisplayConfig;
  notifications: PosNotificationConfig;
}

export interface StationPosConfigOverrides {
  display?: Partial<PosDisplayConfig>;
  notifications?: Partial<PosNotificationConfig>;
}

export const DEFAULT_POS_CONFIG: PosConfig = {
  _schema: "pos_config_v1",
  _version: 0,
  printing: {
    showTaxBreakdown: true,
    showItemizedList: true,
    showTipOptions: true,
    footerMessage: "",
    showGuestCount: true,
    showCourseNumber: true,
  },
  payment: {
    cashEnabled: true,
    splitByItem: true,
    splitEvenly: true,
    splitByAmount: true,
  },
  display: {
    uiScale: "comfortable",
    appTheme: "system",
  },
  notifications: {
    soundEnabled: true,
    volume: 70,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMergeConfig<T extends Record<string, unknown>>(
  base: T,
  overlay: unknown,
): T {
  if (!isRecord(overlay)) return { ...base };

  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overlay)) {
    const current = result[key];
    if (isRecord(current) && isRecord(value)) {
      result[key] = deepMergeConfig(current, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }

  return result as T;
}

export function normalizePosConfig(config: unknown): PosConfig {
  const merged = deepMergeConfig(DEFAULT_POS_CONFIG as unknown as Record<string, unknown>, config);

  return {
    ...merged,
    _schema: "pos_config_v1",
    _version:
      typeof merged._version === "number"
        ? merged._version
        : Number.parseInt(String(merged._version ?? 0), 10) || 0,
    printing: {
      ...DEFAULT_POS_CONFIG.printing,
      ...(isRecord(merged.printing) ? merged.printing : {}),
      footerMessage:
        typeof (merged.printing as PosPrintingConfig | undefined)?.footerMessage === "string"
          ? (merged.printing as PosPrintingConfig).footerMessage
          : "",
    },
    payment: {
      ...DEFAULT_POS_CONFIG.payment,
      ...(isRecord(merged.payment) ? merged.payment : {}),
    },
    display: {
      ...DEFAULT_POS_CONFIG.display,
      ...(isRecord(merged.display) ? merged.display : {}),
    },
    notifications: {
      ...DEFAULT_POS_CONFIG.notifications,
      ...(isRecord(merged.notifications) ? merged.notifications : {}),
      volume: clampVolume(
        Number((merged.notifications as PosNotificationConfig | undefined)?.volume),
      ),
    },
  } as PosConfig;
}

export function normalizeStationOverrides(
  overrides: unknown,
): StationPosConfigOverrides {
  if (!isRecord(overrides)) return {};

  const next: StationPosConfigOverrides = {};

  if (isRecord(overrides.display)) {
    next.display = {};
    if (typeof overrides.display.uiScale === "string") {
      next.display.uiScale = overrides.display.uiScale as PosUiScale;
    }
    if (typeof overrides.display.appTheme === "string") {
      next.display.appTheme = overrides.display.appTheme as PosAppTheme;
    }
    if (Object.keys(next.display).length === 0) delete next.display;
  }

  if (isRecord(overrides.notifications)) {
    next.notifications = {};
    if (typeof overrides.notifications.soundEnabled === "boolean") {
      next.notifications.soundEnabled = overrides.notifications.soundEnabled;
    }
    if (typeof overrides.notifications.volume === "number") {
      next.notifications.volume = clampVolume(overrides.notifications.volume);
    }
    if (Object.keys(next.notifications).length === 0) delete next.notifications;
  }

  return next;
}

export function getEffectivePosConfig(
  locationConfig: unknown,
  stationOverrides?: unknown,
): PosConfig {
  return normalizePosConfig(
    deepMergeConfig(
      normalizePosConfig(locationConfig) as unknown as Record<string, unknown>,
      normalizeStationOverrides(stationOverrides),
    ),
  );
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_POS_CONFIG.notifications.volume;
  return Math.min(100, Math.max(0, Math.round(value)));
}
