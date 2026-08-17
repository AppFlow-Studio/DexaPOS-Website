export type SupportTicketContextItem = {
  label: string;
  value: string;
  title?: string;
};

function readString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getDeviceLabel(userAgent: string): string {
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  return "Desktop";
}

export function buildSupportTicketContext(
  metadata: Record<string, unknown> | null | undefined,
): SupportTicketContextItem[] {
  if (!metadata) return [];

  const context: SupportTicketContextItem[] = [];
  const createdFrom = readString(metadata, "created_from");
  const userAgent = readString(metadata, "userAgent");
  const appVersion = readString(metadata, "app_version");
  const submittedAt = readString(metadata, "submittedAt");

  if (createdFrom === "manage_support") {
    context.push({ label: "Source", value: "DEXA HQ dashboard" });
  }

  if (userAgent) {
    context.push({
      label: "Device",
      value: getDeviceLabel(userAgent),
      title: userAgent,
    });
  }

  if (appVersion) {
    context.push({ label: "App version", value: appVersion });
  }

  if (submittedAt) {
    context.push({ label: "Submitted", value: submittedAt });
  }

  return context;
}
