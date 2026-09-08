"use client";

import { ClipboardList, Inbox, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CreateForm, type FormSummary } from "@/app/dashboard/website/actions/forms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { websiteRoutes } from "../routes";
import DataCard from "../shell/DataCard";
import ListHeader from "../shell/ListHeader";

/**
 * The forms list.
 *
 * **`Status` here means usage, not publish state**, and that is the column
 * worth copying from the Owner teardown. The obvious thing to show is
 * published/draft; the *useful* thing is "can anyone actually reach this form?"
 * A form with thirteen historical responses that now sits on no page is
 * invisible otherwise — the same class of problem as the navigation hole that
 * started this whole rebuild, surfaced as a column instead of discovered months
 * later.
 *
 * Response counts sit beside it because they are the fastest signal of which
 * forms matter.
 */
export default function FormsScreen({
  clerkOrgId,
  locationId,
  forms,
}: {
  clerkOrgId: string;
  locationId: string;
  forms: FormSummary[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <ListHeader
        title="Forms"
        subtitle="Add and manage forms you can put on your website pages."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            New Form
          </Button>
        }
      />

      <DataCard
        items={forms}
        getKey={(form) => form.id}
        getSearchText={(form) => form.name}
        columns={["Responses", "Status"]}
        gridTemplate="minmax(0,1fr) 120px 130px"
        emptyLabel="No forms yet"
        emptyIcon={ClipboardList}
        renderRow={(form) => (
          <>
            <Link
              href={websiteRoutes.formEditor(form.id, locationId)}
              className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline"
            >
              <ClipboardList className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{form.name}</span>
            </Link>

            <Link
              href={websiteRoutes.formSubmissions(form.id, locationId)}
              className="flex items-center gap-1.5 text-sm tabular-nums hover:underline"
            >
              {form.submissionCount}
              {form.unreadCount > 0 && (
                <span
                  aria-label={`${form.unreadCount} unread`}
                  className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground"
                >
                  {form.unreadCount}
                </span>
              )}
            </Link>

            <UsagePill form={form} />
          </>
        )}
      />

      <NewFormDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={async (name) => {
          const result = await CreateForm(clerkOrgId, name);
          if (!result.data) {
            toast.error(result.error ?? "Could not create the form.");
            return;
          }
          // Straight into the builder: a merchant who just named a form wants to
          // build it, not look at a list with one more row on it.
          router.push(websiteRoutes.formEditor(result.data.id, locationId));
        }}
      />
    </div>
  );
}

/**
 * Where this form can be reached from.
 *
 * Three states rather than two, because "on a page you have not published yet"
 * is genuinely different from "on no page at all" — the merchant has done the
 * work and is one publish away, and telling them "Not used" would be wrong.
 */
function UsagePill({ form }: { form: FormSummary }) {
  const used = form.usedOnPages > 0;
  const label = used
    ? `${form.usedOnPages} page${form.usedOnPages === 1 ? "" : "s"}`
    : form.publishedAt
      ? "Not used"
      : "Not published";

  return (
    <span
      title={
        used
          ? "Guests can reach this form."
          : form.publishedAt
            ? "This form is published but sits on no live page, so nobody can reach it."
            : "This form has never been published."
      }
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
        used
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function NewFormDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await onCreate(trimmed);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setName("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New form</DialogTitle>
        </DialogHeader>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium">Form name</span>
          <Input
            autoFocus
            value={name}
            maxLength={100}
            placeholder="Catering enquiries"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
          <span className="mt-1.5 block text-[11px] text-muted-foreground">
            Guests see this as the form&rsquo;s heading. You can change it later.
          </span>
        </label>

        <DialogFooter>
          <Button disabled={!name.trim() || pending} onClick={submit}>
            {pending ? "Creating…" : "Create"}
            <Inbox className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
