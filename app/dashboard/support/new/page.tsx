"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle2, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Empty } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PageShell, PageHeader, Panel } from "@/components/dashboard/shell";
import {
  useCreateTicket,
  GetSupportUploadUrl,
  DiscardSupportUpload,
} from "../../hooks/useSupport";
import { useMerchantDevice } from "../../hooks/useDeviceRegistry";
import { useClerkOrgId } from "../../hooks/useLocationScoped";
import { useSelectedLocation, useLocationStore } from "@/stores/location-store";
import { TicketCategory, AttachmentInput } from "@/types/support-ticket";
import FileUploadInput from "@/components/support/FileUploadInput";
import DeviceContextCard from "@/components/support/DeviceContextCard";
import {
  buildDeviceSubject,
  getDeviceSymptoms,
  OTHER_SYMPTOM,
} from "@/lib/support/device-symptoms";
import {
  deviceLifecycleStatusLabel,
  deviceWarrantyState,
} from "@/lib/constants/device-status";

const schema = z.object({
  category: z.enum([
    "general", "billing", "hardware", "pos_app",
    "menu", "payments", "kitchen", "feature_request", "onboarding",
  ] as const),
  subject: z.string().min(5, "Subject must be at least 5 characters").max(150),
  description: z.string().min(10, "Please provide more detail (at least 10 characters)").max(3000),
  locationId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const CATEGORIES: { key: TicketCategory; label: string }[] = [
  { key: "general", label: "General" },
  { key: "pos_app", label: "POS App" },
  { key: "hardware", label: "Hardware" },
  { key: "payments", label: "Payments" },
  { key: "menu", label: "Menu" },
  { key: "kitchen", label: "Kitchen Display" },
  { key: "billing", label: "Billing" },
  { key: "feature_request", label: "Feature Request" },
  { key: "onboarding", label: "Setup & Onboarding" },
];

function NewTicketForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutateAsync: createTicket, isPending } = useCreateTicket();
  const selectedLocation = useSelectedLocation();
  const { locations } = useLocationStore();
  const clerkOrgId = useClerkOrgId();

  // A report opened from the Devices page carries its device here. The id is
  // untrusted — the server re-checks it against the merchant on both read and
  // write; this lookup only decides what the form shows.
  const deviceId = searchParams.get("device");
  const deviceQuery = useMerchantDevice(deviceId);
  const device = deviceQuery.data ?? null;

  // Stable upload session ID for this form instance
  const uploadSessionId = useMemo(() => crypto.randomUUID(), []);
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [selectedSymptom, setSelectedSymptom] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: "general",
      locationId: selectedLocation?.id || undefined,
    },
  });

  const selectedCategory = watch("category");

  // A device fixes the category and the location: a receipt printer at Uptown
  // is never a billing question about somewhere else.
  useEffect(() => {
    if (!device) return;
    setValue("category", "hardware");
    if (device.location_id) {
      setValue("locationId", device.location_id);
    }
  }, [device, setValue]);

  const symptoms = useMemo(
    () => getDeviceSymptoms(device?.device_category),
    [device?.device_category],
  );

  const handleSymptomPick = (symptom: string) => {
    setSelectedSymptom(symptom);
    if (!device || symptom === OTHER_SYMPTOM) return;
    setValue("subject", buildDeviceSubject(device.serial_number, symptom), {
      shouldValidate: true,
    });
  };

  const handleGetUploadUrl = async (
    fileName: string,
    fileId: string,
    sessionId: string,
    contentType: string,
  ) => {
    if (!clerkOrgId) return { error: "Not authenticated" };
    return GetSupportUploadUrl(
      clerkOrgId,
      fileName,
      fileId,
      sessionId,
      contentType,
    );
  };

  const handleDiscardUpload = async (filePath: string) => {
    if (!clerkOrgId) return;
    return DiscardSupportUpload(clerkOrgId, filePath);
  };

  const onSubmit = async (values: FormValues) => {
    const metadata: Record<string, unknown> = {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      submittedAt: new Date().toISOString(),
    };

    // Snapshot the hardware as it stood when the report was filed. The ticket
    // outlives the registry row's current values, and this is what saves the
    // agent a round trip asking for a serial or a firmware version.
    if (device) {
      const warranty = deviceWarrantyState(device.warranty_expires_at);
      metadata.device_serial = device.serial_number;
      metadata.device_model = `${device.manufacturer} ${device.model_name}`.trim();
      metadata.device_category = device.device_category;
      metadata.device_status = deviceLifecycleStatusLabel(device.status);
      metadata.device_location_name = device.location_name ?? undefined;
      metadata.device_warranty = warranty.label;
      metadata.device_firmware_version = device.firmware_version ?? undefined;
      metadata.device_app_version = device.app_version ?? undefined;
      metadata.device_mac_address = device.mac_address ?? undefined;
      if (selectedSymptom && selectedSymptom !== OTHER_SYMPTOM) {
        metadata.device_symptom = selectedSymptom;
      }
    }

    const result = await createTicket({
      subject: values.subject,
      description: values.description,
      category: values.category,
      locationId: values.locationId,
      metadata,
      attachments,
      deviceId: device?.id,
    });

    if (result?.data?.ticket_id) {
      router.push(`/dashboard/support/${result.data.ticket_id}`);
    }
  };

  // Device requested but unreachable — a stale link, or someone else's serial.
  if (deviceId && deviceQuery.isError) {
    return (
      <PageShell width="narrow">
        <PageHeader
          title="Report an issue"
          subtitle="We could not open that device."
          backHref="/dashboard/devices"
          backLabel="Back to Devices"
        />
        <Panel padded>
          <Empty
            icon={MonitorSmartphone}
            title="Device not found"
            description="This device is not in your registry any more. Open a ticket from the Devices page, or start a general one."
            action={
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => router.push("/dashboard/support/new")}
              >
                Start a general ticket
              </Button>
            }
          />
        </Panel>
      </PageShell>
    );
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        title={device ? "Report an issue" : "New Support Ticket"}
        subtitle={
          device
            ? "Tell us what the device is doing. The technical details are already attached."
            : "Describe your issue and we'll get back to you shortly"
        }
        backHref={device ? "/dashboard/devices" : "/dashboard/support"}
        backLabel={device ? "Back to Devices" : "Back to Support"}
      />

      {deviceId && deviceQuery.isLoading && (
        <Panel padded>
          <Skeleton className="h-32 w-full rounded-2xl" />
        </Panel>
      )}

      {device && (
        <Panel padded>
          <DeviceContextCard device={device} />
        </Panel>
      )}

      <Panel padded>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Symptom quick picks — only when a device is attached */}
          {device && (
            <div className="space-y-2">
              <Label>What is it doing?</Label>
              <div className="flex flex-wrap gap-2">
                {symptoms.map((symptom) => (
                  <button
                    key={symptom}
                    type="button"
                    aria-pressed={selectedSymptom === symptom}
                    onClick={() => handleSymptomPick(symptom)}
                    className={cn(
                      "rounded-full px-3.5 py-2 text-sm transition-colors",
                      selectedSymptom === symptom
                        ? "bg-muted font-medium text-foreground"
                        : "bg-muted/45 text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    {symptom}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category — fixed to Hardware when a device is attached */}
          {!device && (
            <div className="space-y-2">
              <Label>What do you need help with?</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setValue("category", cat.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-2xl border-0 px-3 py-2.5 text-sm text-left transition-colors min-w-0",
                      selectedCategory === cat.key
                        ? "bg-muted text-foreground font-medium"
                        : "bg-muted/45 text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    <span className="leading-tight truncate min-w-0">{cat.label}</span>
                    {selectedCategory === cat.key && (
                      <CheckCircle2 className="h-3.5 w-3.5 ml-auto shrink-0 text-[#0C4FD1] dark:text-[#6CA0FF]" />
                    )}
                  </button>
                ))}
              </div>
              {errors.category && (
                <p className="text-xs text-destructive">{errors.category.message}</p>
              )}
            </div>
          )}

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder={
                device
                  ? `e.g. ${device.serial_number} — not printing`
                  : "e.g. POS app freezes when printing receipts"
              }
              aria-invalid={!!errors.subject}
              className="aria-invalid:border aria-invalid:border-destructive"
              {...register("subject")}
            />
            {device && (
              <p className="text-xs text-muted-foreground">
                Picking a symptom above fills this in. Change it if you like.
              </p>
            )}
            {errors.subject && (
              <p className="text-xs text-destructive">{errors.subject.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-muted-foreground font-normal">
              {device ? "What happened?" : "Describe the issue"}
            </Label>
            <Textarea
              id="description"
              placeholder={
                device
                  ? "When did it start, does it happen every time, and what have you already tried?"
                  : "Provide as much detail as possible — what happened, when it occurs, what you've already tried..."
              }
              className="min-h-[140px] resize-none border-none shadow-none focus-visible:ring-0 aria-invalid:border aria-invalid:border-destructive"
              aria-invalid={!!errors.description}
              {...register("description")}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <Label>Screenshots / Files (optional)</Label>
            <p className="text-xs text-muted-foreground">
              {device
                ? "A photo of the fault saves a day of back-and-forth. Images/PDFs up to 5 MB; video up to 100 MB. Max 3 files."
                : "Images/PDFs up to 5 MB; video (MP4, MOV, WebM) up to 100 MB. Max 3 files."}
            </p>
            <FileUploadInput
              onUploadsChange={setAttachments}
              getUploadUrl={handleGetUploadUrl}
              onDiscardUpload={handleDiscardUpload}
              sessionId={uploadSessionId}
              disabled={isPending}
            />
          </div>

          {/* Location — a device already determines it */}
          {!device && locations.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="location">Location (optional)</Label>
              <Select
                defaultValue={selectedLocation?.id || ""}
                onValueChange={(val) => setValue("locationId", val || undefined)}
              >
                <SelectTrigger size="sm" className="w-auto max-w-[200px] text-sm">
                  <SelectValue placeholder="Select a location" className="truncate" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {device && (
            <p className="text-xs text-muted-foreground">
              You&apos;ll get email updates, and this ticket will show up in{" "}
              {device.serial_number}&apos;s own history.
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() =>
                router.push(device ? "/dashboard/devices" : "/dashboard/support")
              }
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-full" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : device ? (
                "Send to DexaPOS support"
              ) : (
                "Submit Ticket"
              )}
            </Button>
          </div>
        </form>
      </Panel>
    </PageShell>
  );
}

export default function NewTicketPage() {
  // useSearchParams needs a Suspense boundary to keep this route prerenderable.
  return (
    <Suspense
      fallback={
        <PageShell width="narrow">
          <Panel padded>
            <Skeleton className="h-64 w-full rounded-2xl" />
          </Panel>
        </PageShell>
      }
    >
      <NewTicketForm />
    </Suspense>
  );
}
