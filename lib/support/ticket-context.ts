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

  // Hardware the report was filed against, when it came from the Devices page.
  // These lead the panel: they are what an agent would otherwise have to ask for.
  const deviceSerial = readString(metadata, "device_serial");

  if (deviceSerial) {
    const deviceModel = readString(metadata, "device_model");
    const deviceLocation = readString(metadata, "device_location_name");
    const deviceStatus = readString(metadata, "device_status");
    const deviceWarranty = readString(metadata, "device_warranty");
    const deviceFirmware = readString(metadata, "device_firmware_version");
    const deviceAppVersion = readString(metadata, "device_app_version");
    const deviceMac = readString(metadata, "device_mac_address");

    context.push({
      label: "Device",
      value: deviceModel ? `${deviceSerial} · ${deviceModel}` : deviceSerial,
    });

    if (deviceLocation) {
      context.push({ label: "Installed at", value: deviceLocation });
    }
    if (deviceStatus) {
      context.push({ label: "Registry status", value: deviceStatus });
    }
    if (deviceWarranty) {
      context.push({ label: "Warranty", value: deviceWarranty });
    }
    if (deviceFirmware) {
      context.push({ label: "Firmware", value: deviceFirmware });
    }
    if (deviceAppVersion) {
      context.push({ label: "Device app version", value: deviceAppVersion });
    }
    if (deviceMac) {
      context.push({ label: "MAC", value: deviceMac });
    }
  }

  if (userAgent) {
    context.push({
      label: "Submitted from",
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
