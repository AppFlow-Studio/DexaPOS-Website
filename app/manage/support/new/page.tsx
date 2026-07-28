"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bug,
  Loader2,
  LockKeyhole,
  MessageSquarePlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CreateHQSupportTicket,
  GetHQSupportDraftUploadUrl,
  type CreateHQSupportTicketInput,
} from "../../actions/support";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  type TicketCategory,
  type TicketPriority,
  type AttachmentInput,
} from "@/types/support-ticket";
import FileUploadInput from "@/components/support/FileUploadInput";

type HQSupportTicketForm = Pick<
  CreateHQSupportTicketInput,
  "subject" | "description" | "category" | "priority"
>;

const DEFAULT_FORM: HQSupportTicketForm = {
  subject: "",
  description: "",
  category: "general",
  priority: "normal",
};

export default function NewHQSupportTicketPage() {
  const router = useRouter();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [uploadSessionId] = useState(() => crypto.randomUUID());

  const update = <K extends keyof HQSupportTicketForm>(
    key: K,
    value: HQSupportTicketForm[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      if (isUploading) {
        toast.error("Wait for attachments to finish uploading");
        return;
      }

      const result = await CreateHQSupportTicket({
        ...form,
        attachments,
        uploadSessionId,
      });
      if (result.error || !result.data) {
        toast.error(result.error || "Failed to create ticket");
        return;
      }

      toast.success(`${result.data.ticket_number} created`);
      router.push(`/manage/support/${result.data.ticket_id}`);
    } catch {
      toast.error("Failed to create ticket");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/manage/support" aria-label="Back to support inbox">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageSquarePlus className="h-6 w-6" />
            New Developer Ticket
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create an internal engineering ticket from DEXA HQ.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-blue-950">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-blue-100 p-2">
            <LockKeyhole className="h-4 w-4 text-blue-700" />
          </div>
          <div>
            <p className="text-sm font-semibold">Location fixed to DEXA HQ</p>
            <p className="mt-1 text-xs leading-relaxed text-blue-800">
              Website-created tickets are developer work items. The server
              assigns the configured DEXA HQ location automatically; it cannot
              be changed from this form.
            </p>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border bg-card p-6 shadow-sm"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={form.category}
              onValueChange={(value) =>
                update("category", value as TicketCategory)
              }
            >
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TICKET_CATEGORY_LABELS).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select
              value={form.priority}
              onValueChange={(value) =>
                update("priority", value as TicketPriority)
              }
            >
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TICKET_PRIORITY_LABELS).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={form.subject}
            onChange={(event) => update("subject", event.target.value)}
            minLength={5}
            maxLength={150}
            required
            placeholder="Short description of the work or bug"
          />
          <p className="text-xs text-muted-foreground">
            Use a specific title that developers can recognize in the inbox.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Developer details</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
            minLength={10}
            maxLength={3000}
            required
            className="min-h-48 resize-y"
            placeholder="Describe the problem, reproduction steps, expected behavior, and useful context."
          />
        </div>

        <div className="space-y-2">
          <Label>Screenshots or files (optional)</Label>
          <p className="text-xs text-muted-foreground">
            PNG, JPG, WebP, or PDF. Maximum 3 files and 5 MB per file.
          </p>
          <FileUploadInput
            onUploadsChange={setAttachments}
            onUploadStateChange={setIsUploading}
            getUploadUrl={GetHQSupportDraftUploadUrl}
            sessionId={uploadSessionId}
            disabled={isSubmitting}
          />
        </div>

        <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" asChild>
            <Link href="/manage/support">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting || isUploading}>
            {isSubmitting || isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Bug className="mr-2 h-4 w-4" />
            )}
            {isUploading ? "Uploading files..." : "Create Developer Ticket"}
          </Button>
        </div>
      </form>
    </div>
  );
}
