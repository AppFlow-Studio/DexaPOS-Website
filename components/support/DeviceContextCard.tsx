"use client";

import { createElement } from "react";
import { Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  deviceLifecycleStatusLabel,
  deviceWarrantyState,
} from "@/lib/constants/device-status";
import {
  formatDeviceCategory,
  getDeviceCategoryIcon,
} from "@/lib/device-registry/presentation";
import type { AdminDeviceInventoryRow } from "@/types/device-registry";

function formatDate(date: string | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

/**
 * The device a support report is being filed against, shown read-only above the
 * form. Everything here travels with the ticket, so the merchant can see what
 * support will receive without having to type any of it.
 */
export function DeviceContextCard({
  device,
}: {
  device: AdminDeviceInventoryRow;
}) {
  const warranty = deviceWarrantyState(device.warranty_expires_at);
  const warrantyDate = formatDate(device.warranty_expires_at);

  const facts: { label: string; value: string }[] = [
    { label: "Location", value: device.location_name ?? "Not assigned" },
    { label: "Status", value: deviceLifecycleStatusLabel(device.status) },
    {
      label: "Warranty",
      value: warrantyDate
        ? `${warranty.state === "expired" ? "Ended" : "Until"} ${warrantyDate}`
        : "Not on file",
    },
    { label: "Firmware", value: device.firmware_version ?? "N/A" },
    { label: "MAC", value: device.mac_address ?? "N/A" },
  ];

  return (
    <section
      aria-label="Device attached to this report"
      className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground">
          {createElement(getDeviceCategoryIcon(device.device_category), {
            className: "h-5 w-5",
          })}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold tracking-tight">
            {device.serial_number}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {device.manufacturer} {device.model_name} ·{" "}
            {formatDeviceCategory(device.device_category)}
          </p>
        </div>
        <Badge
          variant="secondary"
          className="shrink-0 border-0 bg-muted text-muted-foreground"
        >
          Hardware
        </Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border/60 pt-4 sm:grid-cols-5">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {fact.label}
            </dt>
            <dd className="mt-1 truncate text-sm font-medium" title={fact.value}>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Sent with your report, so nobody has to ask you for a serial number.
      </p>
    </section>
  );
}

export default DeviceContextCard;
