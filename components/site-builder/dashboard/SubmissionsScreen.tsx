"use client";

import { Download, Inbox, PencilRuler, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
  MarkSubmissionRead,
  RetrySubmissionNotification,
  type SubmissionRow,
} from "@/app/dashboard/website/actions/forms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { csvFilename, submissionsToCsv } from "@/lib/site-builder/forms/export";
import { cn } from "@/lib/utils";
import { websiteRoutes } from "../routes";
import DataCard from "../shell/DataCard";
import ListHeader from "../shell/ListHeader";

/**
 * One form's inbox.
 *
 * **Columns are derived from the form's own fields** — a form asking for a name
 * and a phone number gets Name and Phone Number columns, because those are
 * distinct semantic field kinds rather than text boxes. Everything else lives in
 * the row detail.
 *
 * **Export is the primary action**, not a menu item, because pulling leads into
 * a spreadsheet or a CRM is what merchants actually do with them.
 */
export default function SubmissionsScreen({
  clerkOrgId,
  formId,
  formName,
  locationId,
  columns,
  rows: initialRows,
}: {
  clerkOrgId: string;
  formId: string;
  formName: string;
  locationId: string;
  columns: { key: string; label: string }[];
  rows: SubmissionRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [open, setOpen] = useState<SubmissionRow | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const view = (row: SubmissionRow) => {
    setOpen(row);
    if (row.readAt) return;

    // Optimistic: opening a response is the act of reading it, and a dot that
    // lingers until a round trip finishes reads as a bug.
    setRows((current) =>
      current.map((r) => (r.id === row.id ? { ...r, readAt: new Date().toISOString() } : r)),
    );
    void MarkSubmissionRead(clerkOrgId, row.id, true);
  };

  const exportCsv = () => {
    if (rows.length === 0) return;

    const csv = submissionsToCsv(
      // Oldest first in the file: a spreadsheet of leads reads chronologically,
      // even though the screen above shows newest first.
      [...rows].reverse().map((row) => ({ createdAt: row.createdAt, answers: row.answers })),
    );

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename(formName);
    link.click();
    URL.revokeObjectURL(url);

    toast.success(`Exported ${rows.length} response${rows.length === 1 ? "" : "s"}.`);
  };

  const retryNotification = async (row: SubmissionRow) => {
    setRetrying(row.id);
    const result = await RetrySubmissionNotification(clerkOrgId, row.id);

    if (result.data) {
      const updated = { ...row, notification: result.data.notification };
      setRows((current) => current.map((candidate) => (candidate.id === row.id ? updated : candidate)));
      setOpen(updated);
    }

    if (result.error) toast.error(result.error);
    else toast.success("Notification sent.");
    setRetrying(null);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <ListHeader
        title={formName}
        subtitle="The responses people have sent through this form."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={websiteRoutes.formEditor(formId, locationId)}>
                <PencilRuler className="size-4" />
                View Form
              </Link>
            </Button>
            <Button disabled={rows.length === 0} onClick={exportCsv}>
              <Download className="size-4" />
              Export Responses
            </Button>
          </>
        }
      />

      <DataCard
        items={rows}
        getKey={(row) => row.id}
        getSearchText={(row) =>
          [row.contact.name, row.contact.email, row.contact.phone, ...row.answers.map((a) => a.value)]
            .filter(Boolean)
            .join(" ")
        }
        columns={[...columns.map((c) => c.label), "Notification", "Received"]}
        gridTemplate={`24px ${columns.map(() => "minmax(0,1fr)").join(" ")} 120px 140px`}
        emptyLabel="No responses yet"
        emptyIcon={Inbox}
        renderRow={(row) => (
          <>
            <span className="flex items-center justify-center">
              {!row.readAt && (
                <span
                  aria-label="Unread"
                  title="Unread"
                  className="size-2 rounded-full bg-primary"
                />
              )}
            </span>

            {columns.map((column) => (
              <button
                key={column.key}
                type="button"
                onClick={() => view(row)}
                className={cn(
                  "min-w-0 truncate text-left text-sm hover:underline",
                  !row.readAt && "font-medium",
                )}
              >
                {row.contact[column.key as keyof typeof row.contact] ?? "—"}
              </button>
            ))}

            <span className={cn("text-xs font-medium", notificationTone(row.notification.state))}>
              {notificationLabel(row.notification.state)}
            </span>

            <span className="truncate text-xs text-muted-foreground">
              {formatReceived(row.createdAt)}
            </span>
          </>
        )}
      />

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Response</DialogTitle>
          </DialogHeader>

          {open && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">{formatReceived(open.createdAt)}</p>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      Email notification: {notificationLabel(open.notification.state)}
                    </p>
                    {open.notification.recipients.length > 0 && (
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {open.notification.recipients.join(", ")}
                      </p>
                    )}
                    {open.notification.error && (
                      <p role="alert" className="mt-2 break-words text-xs text-destructive">
                        {open.notification.error}
                      </p>
                    )}
                    {open.notification.attempts > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {open.notification.attempts} delivery attempt
                        {open.notification.attempts === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>

                  {open.notification.state === "failed" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={retrying === open.id}
                      onClick={() => void retryNotification(open)}
                    >
                      <RefreshCw className={cn("size-3.5", retrying === open.id && "animate-spin")} />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
              <dl className="space-y-3">
                {open.answers.map((answer) => (
                  <div key={answer.fieldId}>
                    {/*
                      The question as it was worded WHEN THIS WAS ANSWERED, read
                      from the submission rather than the current form. A lead
                      from before the form was rewritten still shows the question
                      that person actually saw.
                    */}
                    <dt className="text-xs font-medium text-muted-foreground">{answer.label}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                      {answer.value}
                    </dd>
                  </div>
                ))}
                {open.answers.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    This response has no answers stored.
                  </p>
                )}
              </dl>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function notificationLabel(state: SubmissionRow["notification"]["state"]): string {
  switch (state) {
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "pending":
    case "sending":
      return "Sending";
    default:
      return "Not requested";
  }
}

function notificationTone(state: SubmissionRow["notification"]["state"]): string {
  switch (state) {
    case "sent":
      return "text-emerald-700 dark:text-emerald-400";
    case "failed":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function formatReceived(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
