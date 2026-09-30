import type { DeviceCategory } from "@/types/device-registry";

/**
 * Common first-line symptoms per hardware category, offered as quick picks on
 * the report form. They only seed the subject line — the merchant can always
 * type their own, and "Something else" leaves the subject alone.
 *
 * Kept short on purpose: these are the phrases a merchant would say on the
 * phone, not a diagnostic taxonomy.
 */
const SYMPTOMS_BY_CATEGORY: Record<DeviceCategory, string[]> = {
  pos_tablet: [
    "Will not turn on",
    "Frozen or very slow",
    "Keeps logging out",
    "Not connecting to Wi-Fi",
    "Screen or touch problem",
  ],
  cfd: [
    "Screen is blank",
    "Shows the wrong order",
    "Will not turn on",
    "Not connecting to Wi-Fi",
  ],
  kds: [
    "Orders not arriving",
    "Screen is blank",
    "Frozen or very slow",
    "Not connecting to Wi-Fi",
  ],
  payment_terminal: [
    "Declining every card",
    "Will not connect",
    "Card reader not responding",
    "Prints no receipt",
  ],
  receipt_printer: [
    "Not printing",
    "Not cutting paper",
    "Prints blank receipts",
    "Paper jam",
    "Offline or not found",
  ],
  kitchen_printer: [
    "Not printing tickets",
    "Prints blank tickets",
    "Paper jam",
    "Offline or not found",
  ],
  cash_drawer: [
    "Will not open",
    "Opens on its own",
    "Lock or key problem",
  ],
};

const FALLBACK_SYMPTOMS = [
  "Will not turn on",
  "Not responding",
  "Not connecting",
];

export const OTHER_SYMPTOM = "Something else";

export function getDeviceSymptoms(category: DeviceCategory | null | undefined) {
  const symptoms = category
    ? SYMPTOMS_BY_CATEGORY[category] ?? FALLBACK_SYMPTOMS
    : FALLBACK_SYMPTOMS;

  return [...symptoms, OTHER_SYMPTOM];
}

/** The subject a symptom seeds, e.g. `TEST-PRN-0002 — not cutting paper`. */
export function buildDeviceSubject(serialNumber: string, symptom: string) {
  return `${serialNumber} — ${symptom.toLowerCase()}`;
}
