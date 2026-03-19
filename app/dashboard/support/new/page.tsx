"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  MessageCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useCreateTicket, GetSupportUploadUrl } from "../../hooks/useSupport";
import { useClerkOrgId } from "../../hooks/useLocationScoped";
import { useSelectedLocation, useLocationStore } from "@/stores/location-store";
import { TicketCategory, TICKET_CATEGORY_LABELS, AttachmentInput } from "@/types/support-ticket";
import FileUploadInput from "@/components/support/FileUploadInput";

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

const CATEGORIES: { key: TicketCategory; label: string; emoji: string }[] = [
  { key: "general", label: "General", emoji: "💬" },
  { key: "pos_app", label: "POS App", emoji: "📱" },
  { key: "hardware", label: "Hardware", emoji: "🖨️" },
  { key: "payments", label: "Payments", emoji: "💳" },
  { key: "menu", label: "Menu", emoji: "🍽️" },
  { key: "kitchen", label: "Kitchen Display", emoji: "🔥" },
  { key: "billing", label: "Billing", emoji: "💰" },
  { key: "feature_request", label: "Feature Request", emoji: "💡" },
  { key: "onboarding", label: "Setup & Onboarding", emoji: "🚀" },
];

export default function NewTicketPage() {
  const router = useRouter();
  const { mutateAsync: createTicket, isPending } = useCreateTicket();
  const selectedLocation = useSelectedLocation();
  const { locations } = useLocationStore();
  const clerkOrgId = useClerkOrgId();

  // Stable upload session ID for this form instance
  const uploadSessionId = useMemo(() => crypto.randomUUID(), []);
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);

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

  const handleGetUploadUrl = async (fileName: string, fileId: string, sessionId: string) => {
    if (!clerkOrgId) return { error: "Not authenticated" };
    return GetSupportUploadUrl(clerkOrgId, fileName, fileId, sessionId);
  };

  const onSubmit = async (values: FormValues) => {
    const metadata: Record<string, unknown> = {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      submittedAt: new Date().toISOString(),
    };

    const result = await createTicket({
      subject: values.subject,
      description: values.description,
      category: values.category,
      locationId: values.locationId,
      metadata,
      attachments,
    });

    if (result?.data?.ticket_id) {
      router.push(`/dashboard/support/${result.data.ticket_id}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/support">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            New Support Ticket
          </h1>
          <p className="text-sm text-muted-foreground">
            Describe your issue and we&apos;ll get back to you shortly
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Category */}
        <div className="space-y-2">
          <Label>What do you need help with?</Label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setValue("category", cat.key)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm text-left transition-all hover:border-primary/50",
                  selectedCategory === cat.key
                    ? "border-primary bg-primary/5 text-primary font-medium"
                    : "border-border text-muted-foreground"
                )}
              >
                <span className="text-base">{cat.emoji}</span>
                <span className="leading-tight">{cat.label}</span>
                {selectedCategory === cat.key && (
                  <CheckCircle2 className="h-3.5 w-3.5 ml-auto shrink-0" />
                )}
              </button>
            ))}
          </div>
          {errors.category && (
            <p className="text-xs text-destructive">{errors.category.message}</p>
          )}
        </div>

        {/* Subject */}
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            placeholder="e.g. POS app freezes when printing receipts"
            {...register("subject")}
          />
          {errors.subject && (
            <p className="text-xs text-destructive">{errors.subject.message}</p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Describe the issue</Label>
          <Textarea
            id="description"
            placeholder="Provide as much detail as possible — what happened, when it occurs, what you've already tried..."
            className="min-h-[140px] resize-none"
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
            Images (PNG, JPG, WebP) or PDFs. Max 3 files, 5MB each.
          </p>
          <FileUploadInput
            onUploadsChange={setAttachments}
            getUploadUrl={handleGetUploadUrl}
            sessionId={uploadSessionId}
            disabled={isPending}
          />
        </div>

        {/* Location */}
        {locations.length > 1 && (
          <div className="space-y-2">
            <Label htmlFor="location">Location (optional)</Label>
            <Select
              defaultValue={selectedLocation?.id || ""}
              onValueChange={(val) => setValue("locationId", val || undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a location" />
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

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/support">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Ticket"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
