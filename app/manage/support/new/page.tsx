"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bug, Loader2, LockKeyhole } from "lucide-react";
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
import { PageHeader, PageShell, Panel } from "@/components/dashboard/shell";
import {
  CreateHQSupportTicket,
  GetConfiguredSupportAssignees,
  GetHQSupportDraftUploadUrl,
  DiscardAdminSupportUpload,
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
import { AssigneeEmailMultiSelect } from "@/components/support/AssigneeEmailMultiSelect";

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
  const [availableAssignees, setAvailableAssignees] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(true);
  // A failed load is not an empty list (§4.9): track it so the picker never
  // claims "No support assignees configured" when it simply couldn't ask.
  const [assigneeLoadFailed, setAssigneeLoadFailed] = useState(false);
  const [assigneeLoadAttempt, setAssigneeLoadAttempt] = useState(0);
  const [uploadSessionId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let active = true;

    GetConfiguredSupportAssignees()
      .then((result) => {
        if (!active) return;
        if (result.error) {
          setAssigneeLoadFailed(true);
          return;
        }
        setAvailableAssignees(result.data ?? []);
      })
      .catch(() => {
        if (active) setAssigneeLoadFailed(true);
      })
      .finally(() => {
        if (active) setIsLoadingAssignees(false);
      });

    return () => {
      active = false;
    };
  }, [assigneeLoadAttempt]);

  const retryAssignees = () => {
    setAssigneeLoadFailed(false);
    setIsLoadingAssignees(true);
    setAssigneeLoadAttempt((attempt) => attempt + 1);
  };

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
        return;
      }

      const result = await CreateHQSupportTicket({
        ...form,
        assignedToEmails: selectedAssignees,
        attachments,
        uploadSessionId,
      });
      if (result.error || !result.data) {
        toast.error("We couldn't create the ticket", {
          description: result.error ?? "Please try again.",
        });
        return;
      }

      router.push(`/manage/support/${result.data.ticket_id}`);
    } catch {
      toast.error("We couldn't create the ticket", {
        description: "Check your connection and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const assigneeUnavailableLabel = isLoadingAssignees
    ? "Loading assignees..."
    : assigneeLoadFailed
      ? "Assignees couldn't be loaded"
      : undefined;

  return (
    <PageShell as="div" width="narrow">
      <PageHeader
        title="New Developer Ticket"
        subtitle="Create an engineering ticket for the DEXA development team."
        backHref="/manage/support"
        backLabel="Back to Support"
      />

      {/* Callout recipe (§3.5): muted well, no border, bare icon with no plate. */}
      <div className="flex items-start gap-3 rounded-2xl bg-muted/60 px-4 py-3">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium">DEXA HQ developer ticket</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Website-created developer tickets are platform-scoped. They are not
            assigned to a merchant, location, or carrier.
          </p>
        </div>
      </div>

      <Panel padded>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(value) =>
                  update("category", value as TicketCategory)
                }
              >
                {/* SelectTrigger still ships a border by default (§11), so the
                    muted material (§4.2) is spelled out. */}
                <SelectTrigger
                  id="category"
                  className="h-9 w-full min-w-0 border-0 bg-muted/60 shadow-none dark:bg-muted/60"
                >
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

            <div className="min-w-0 space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(value) =>
                  update("priority", value as TicketPriority)
                }
              >
                <SelectTrigger
                  id="priority"
                  className="h-9 w-full min-w-0 border-0 bg-muted/60 shadow-none dark:bg-muted/60"
                >
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
            <Label>Assignees (optional)</Label>
            <AssigneeEmailMultiSelect
              emails={availableAssignees}
              value={selectedAssignees}
              onChange={setSelectedAssignees}
              disabled={isSubmitting || isLoadingAssignees}
              unavailableLabel={assigneeUnavailableLabel}
            />
            {assigneeLoadFailed ? (
              // §4.9: a failure is a neutral sentence with a way to retry.
              <p className="text-xs text-muted-foreground">
                We couldn&apos;t load the assignee list. You can still create
                the ticket without assignees, or{" "}
                <button
                  type="button"
                  onClick={retryAssignees}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  try again
                </button>
                .
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select one or more developers from the configured support
                notification list. Notifications still go to the entire list.
              </p>
            )}
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
            {/* Textarea still ships the bordered material; this matches Input
                (§4.2). The `dark:` pair beats the primitive's `dark:bg-input/30`. */}
            <Textarea
              id="description"
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              minLength={10}
              maxLength={3000}
              required
              className="min-h-48 resize-y border-0 bg-muted/60 shadow-none focus-visible:bg-background dark:bg-muted/60 dark:focus-visible:bg-background"
              placeholder="Describe the problem, reproduction steps, expected behavior, and useful context."
            />
          </div>

          <div className="space-y-2">
            <Label>Screenshots or files (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Images/PDFs up to 5 MB; video (MP4, MOV, WebM) up to 100 MB.
              Maximum 3 files.
            </p>
            <FileUploadInput
              onUploadsChange={setAttachments}
              onUploadStateChange={setIsUploading}
              getUploadUrl={GetHQSupportDraftUploadUrl}
              onDiscardUpload={DiscardAdminSupportUpload}
              sessionId={uploadSessionId}
              disabled={isSubmitting}
            />
          </div>

          {/* Separated by spacing, not a rule (§5.5); 44px targets on phones (§13.6). */}
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-9"
              asChild
            >
              <Link href="/manage/support">Cancel</Link>
            </Button>
            <Button
              type="submit"
              className="h-11 sm:h-9"
              disabled={isSubmitting || isUploading}
            >
              {isSubmitting || isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Bug className="mr-2 h-4 w-4" />
              )}
              {isUploading ? "Uploading files..." : "Create Developer Ticket"}
            </Button>
          </div>
        </form>
      </Panel>
    </PageShell>
  );
}
