"use server";

import { revalidatePath } from "next/cache";

import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import type { ActionResult } from "@/lib/site-builder/db-types";
import {
  createStarterForm,
  normalizeForm,
  validateForm,
  type FormDocument,
} from "@/lib/site-builder/forms/document";
import { deliverFormSubmissionNotification } from "@/lib/site-builder/forms/notification-delivery";
import {
  isNotificationState,
  submissionRecordFromRow,
  type NotificationState,
} from "@/lib/site-builder/forms/notification";
import { submissionColumns } from "@/lib/site-builder/forms/submission";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Forms — brand-level reusable objects with one inbox each.
 *
 * Authorization is RLS (`is_merchant_admin`), not checks here. These actions
 * look the merchant up to scope a query; the database is what refuses
 * cross-tenant access, so a bug in this file cannot leak another merchant's
 * leads.
 */

export interface FormSummary {
  id: string;
  name: string;
  submissionCount: number;
  unreadCount: number;
  publishedAt: string | null;
  updatedAt: string;
  /**
   * How many published pages embed this form.
   *
   * The `Status` column, and the reason it is worth the extra query: the
   * obvious thing to show is published/draft, but the *useful* thing is "can
   * anyone actually reach this form?" A form with thirteen historical responses
   * that now sits on no page is invisible otherwise — the same class of problem
   * as the navigation hole, surfaced as a column.
   */
  usedOnPages: number;
}

async function resolveSite(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clerkOrgId: string,
): Promise<{ siteId?: string; merchantId?: string; error?: string }> {
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!merchant) return { error: "Merchant not found" };

  const { data: site } = await supabase
    .from("merchant_sites")
    .select("id")
    .eq("merchant_id", merchant.id as string)
    .maybeSingle();

  if (!site) return { error: "This merchant has no website yet" };
  return { siteId: site.id as string, merchantId: merchant.id as string };
}

/** Every form on the site, with its response count and where it is used. */
export async function ListForms(clerkOrgId: string): Promise<ActionResult<FormSummary[]>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();
  const { siteId, error } = await resolveSite(supabase, clerkOrgId);
  if (!siteId) return { error: error ?? "No website", code: "site_not_found" };

  const [{ data: forms, error: formsError }, { data: pages }] = await Promise.all([
    supabase
      .from("site_forms")
      .select("id, name, submission_count, unread_count, published_at, updated_at")
      .eq("site_id", siteId)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    /**
     * Usage is counted from PUBLISHED page content, not drafts.
     *
     * "Not used" has to mean "no visitor can reach this", and a form dropped
     * onto an unpublished draft is exactly as unreachable as one on no page at
     * all. Counting drafts would turn the column into a reassurance that the
     * merchant has done something, which is the opposite of what it is for.
     */
    supabase
      .from("site_pages")
      .select("published_version_id, site_page_versions!site_pages_published_version_id_fkey(content)")
      .eq("site_id", siteId)
      .eq("status", "published")
      .not("published_version_id", "is", null),
  ]);

  if (formsError) return { error: formsError.message, code: "db_error" };

  const usage = countFormUsage(pages);

  return {
    data: ((forms ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? "Untitled form"),
      submissionCount: Number(row.submission_count ?? 0),
      unreadCount: Number(row.unread_count ?? 0),
      publishedAt: (row.published_at as string | null) ?? null,
      updatedAt: String(row.updated_at ?? ""),
      usedOnPages: usage.get(String(row.id)) ?? 0,
    })),
  };
}

/**
 * How many published pages embed each form.
 *
 * Walks the published documents in JS rather than asking Postgres to index into
 * jsonb: a merchant has tens of pages, the documents are already being fetched,
 * and a `jsonb_path_query` here would be a clever query to maintain for no
 * measurable gain at this size.
 */
function countFormUsage(pages: unknown): Map<string, number> {
  const counts = new Map<string, number>();

  for (const page of (pages ?? []) as Record<string, unknown>[]) {
    const version = page.site_page_versions as { content?: unknown } | null;
    const content = version?.content as { sections?: unknown } | undefined;
    const sections = Array.isArray(content?.sections) ? content.sections : [];

    // A page that uses one form twice still counts as one page.
    const onThisPage = new Set<string>();
    for (const section of sections as Record<string, unknown>[]) {
      const props = section?.props as Record<string, unknown> | undefined;
      const formId = props?.formId;
      if (typeof formId === "string" && formId) onThisPage.add(formId);
    }

    for (const formId of onThisPage) {
      counts.set(formId, (counts.get(formId) ?? 0) + 1);
    }
  }

  return counts;
}

export async function CreateForm(
  clerkOrgId: string,
  name: string,
): Promise<ActionResult<{ id: string }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) return { error: "Give the form a name", code: "invalid_document" };

  const supabase = createServerSupabaseClient();
  const { siteId } = await resolveSite(supabase, clerkOrgId);
  if (!siteId) return { error: "Create your website first", code: "site_not_found" };

  const { data, error } = await supabase
    .from("site_forms")
    .insert({ site_id: siteId, name: trimmed, draft_definition: createStarterForm(trimmed) })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create the form", code: "db_error" };
  }

  await LogAuditEvent({
    clerkOrgId,
    locationId: null,
    action: "created_website_form",
    actionCategory: "website",
    severity: "info",
    resourceType: "site_form",
    resourceId: data.id as string,
    resourceName: trimmed,
  });

  revalidatePath("/dashboard/website/forms");
  return { data: { id: data.id as string } };
}

export async function GetForm(
  clerkOrgId: string,
  formId: string,
): Promise<ActionResult<{ id: string; name: string; doc: FormDocument; revision: number; publishedAt: string | null }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("site_forms")
    .select("id, name, draft_definition, revision, published_at")
    .eq("id", formId)
    .maybeSingle();

  if (error || !data) return { error: "Form not found", code: "page_not_found" };

  return {
    data: {
      id: String(data.id),
      name: String(data.name ?? "Untitled form"),
      doc: normalizeForm(data.draft_definition),
      revision: Number(data.revision ?? 0),
      publishedAt: (data.published_at as string | null) ?? null,
    },
  };
}

/**
 * Saves the working draft.
 *
 * Optimistic concurrency on `revision`, the same contract as page autosave: a
 * stale writer matches zero rows rather than silently clobbering another tab.
 */
export async function SaveFormDraft(
  clerkOrgId: string,
  formId: string,
  doc: FormDocument,
  revision: number,
): Promise<ActionResult<{ revision: number }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  // Never trust the posted document — it came from a browser.
  const clean = normalizeForm(doc);

  const { data, error } = await supabase
    .from("site_forms")
    .update({ draft_definition: clean, name: clean.title })
    .eq("id", formId)
    .eq("revision", revision)
    .select("revision")
    .maybeSingle();

  if (error) return { error: error.message, code: "db_error" };
  if (!data) {
    return {
      error: "This form was changed somewhere else. Reload to see the latest version.",
      code: "stale_revision",
    };
  }

  return { data: { revision: Number(data.revision ?? revision + 1) } };
}

/**
 * Makes the current draft the definition visitors see and submissions are
 * validated against.
 *
 * A copy rather than a version row: a form's meaningful history is its
 * submissions, and each submission snapshots its own question labels — so there
 * is nothing a definition history would let anyone recover that is not already
 * on the submission.
 */
export async function PublishForm(
  clerkOrgId: string,
  formId: string,
): Promise<ActionResult<{ publishedAt: string }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data: form } = await supabase
    .from("site_forms")
    .select("id, name, draft_definition")
    .eq("id", formId)
    .maybeSingle();

  if (!form) return { error: "Form not found", code: "page_not_found" };

  const doc = normalizeForm(form.draft_definition);
  const check = validateForm(doc);
  if (!check.ok) return { error: check.message, code: "invalid_document" };

  const publishedAt = new Date().toISOString();
  const { error } = await supabase
    .from("site_forms")
    .update({ published_definition: doc, published_at: publishedAt })
    .eq("id", formId);

  if (error) return { error: error.message, code: "db_error" };

  await LogAuditEvent({
    clerkOrgId,
    locationId: null,
    action: "published_website_form",
    actionCategory: "website",
    severity: "info",
    resourceType: "site_form",
    resourceId: formId,
    resourceName: String(form.name ?? "Form"),
  });

  revalidatePath("/dashboard/website", "layout");
  return { data: { publishedAt } };
}

/**
 * Archives a form.
 *
 * Soft, always. The submissions are real people's enquiries and deleting the
 * row would cascade them away — so a merchant tidying their forms list cannot
 * destroy a year of leads with one click. Pages still embedding it render
 * nothing, which `resolveForm` already handles.
 */
export async function ArchiveForm(
  clerkOrgId: string,
  formId: string,
): Promise<ActionResult<{ archived: true }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("site_forms")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", formId);

  if (error) return { error: error.message, code: "db_error" };

  await LogAuditEvent({
    clerkOrgId,
    locationId: null,
    action: "archived_website_form",
    actionCategory: "website",
    severity: "warning",
    resourceType: "site_form",
    resourceId: formId,
    resourceName: "Form",
  });

  revalidatePath("/dashboard/website/forms");
  return { data: { archived: true } };
}

export interface SubmissionRow {
  id: string;
  createdAt: string;
  readAt: string | null;
  contact: { name: string | null; email: string | null; phone: string | null; address: string | null };
  answers: { fieldId: string; label: string; kind: string; value: string }[];
  notification: {
    state: NotificationState;
    recipients: string[];
    attempts: number;
    lastAttemptAt: string | null;
    sentAt: string | null;
    error: string | null;
  };
}

export async function ListSubmissions(
  clerkOrgId: string,
  formId: string,
  { limit = 200 }: { limit?: number } = {},
): Promise<ActionResult<{ rows: SubmissionRow[]; columns: { key: string; label: string }[]; formName: string }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const [{ data: form }, { data: rows, error }] = await Promise.all([
    supabase.from("site_forms").select("name, draft_definition").eq("id", formId).maybeSingle(),
    supabase
      .from("site_form_submissions")
      .select("id, created_at, read_at, contact_name, contact_email, contact_phone, contact_address, answers, notification_state, notification_recipients, notification_attempts, notification_last_attempt_at, notification_sent_at, notification_error")
      .eq("form_id", formId)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 500)),
  ]);

  if (error) return { error: error.message, code: "db_error" };
  if (!form) return { error: "Form not found", code: "page_not_found" };

  return {
    data: {
      formName: String(form.name ?? "Form"),
      columns: submissionColumns(normalizeForm(form.draft_definition)),
      rows: ((rows ?? []) as Record<string, unknown>[]).map(toSubmissionRow),
    },
  };
}

function toSubmissionRow(row: Record<string, unknown>): SubmissionRow {
  return {
    id: String(row.id),
    createdAt: String(row.created_at ?? ""),
    readAt: (row.read_at as string | null) ?? null,
    contact: {
      name: (row.contact_name as string | null) ?? null,
      email: (row.contact_email as string | null) ?? null,
      phone: (row.contact_phone as string | null) ?? null,
      address: (row.contact_address as string | null) ?? null,
    },
    answers: Array.isArray(row.answers)
      ? (row.answers as Record<string, unknown>[]).map((a) => ({
          fieldId: String(a.fieldId ?? ""),
          label: String(a.label ?? ""),
          kind: String(a.kind ?? ""),
          value: String(a.value ?? ""),
        }))
      : [],
    notification: notificationFromRow(row),
  };
}

function notificationFromRow(row: Record<string, unknown>): SubmissionRow["notification"] {
  return {
    state: isNotificationState(row.notification_state) ? row.notification_state : "not_requested",
    recipients: Array.isArray(row.notification_recipients)
      ? row.notification_recipients.map((value) => String(value))
      : [],
    attempts: Number(row.notification_attempts ?? 0),
    lastAttemptAt: (row.notification_last_attempt_at as string | null) ?? null,
    sentAt: (row.notification_sent_at as string | null) ?? null,
    error: (row.notification_error as string | null) ?? null,
  };
}

export async function MarkSubmissionRead(
  clerkOrgId: string,
  submissionId: string,
  read: boolean,
): Promise<ActionResult<{ readAt: string | null }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const readAt = read ? new Date().toISOString() : null;
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("site_form_submissions")
    .update({ read_at: readAt })
    .eq("id", submissionId);

  if (error) return { error: error.message, code: "db_error" };
  return { data: { readAt } };
}

/**
 * Retries a failed notification without touching the stored response.
 *
 * The optimistic claim prevents two dashboard tabs from sending the same
 * message at once. A `sending` claim older than five minutes is considered
 * abandoned and may be reclaimed after a crashed request.
 */
export async function RetrySubmissionNotification(
  clerkOrgId: string,
  submissionId: string,
): Promise<ActionResult<{ notification: SubmissionRow["notification"] }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();
  const { data: row, error: loadError } = await supabase
    .from("site_form_submissions")
    .select("id, form_id, created_at, answers, contact_name, contact_email, contact_phone, contact_address, notification_state, notification_recipients, notification_attempts, notification_last_attempt_at, notification_sent_at, notification_error")
    .eq("id", submissionId)
    .maybeSingle();

  if (loadError) return { error: loadError.message, code: "db_error" };
  if (!row) return { error: "Response not found", code: "page_not_found" };

  const source = row as Record<string, unknown>;
  const current = notificationFromRow(source);
  if (current.state === "sent") return { data: { notification: current } };
  if (current.recipients.length === 0) {
    return { error: "This response has no notification recipients", code: "invalid_document" };
  }

  const lastAttemptMs = current.lastAttemptAt ? new Date(current.lastAttemptAt).getTime() : NaN;
  const staleSending =
    current.state === "sending" &&
    (!Number.isFinite(lastAttemptMs) || Date.now() - lastAttemptMs >= 5 * 60 * 1000);
  if (current.state === "sending" && !staleSending) {
    return { error: "Notification delivery is already in progress", code: "invalid_document" };
  }

  const attemptedAt = new Date().toISOString();
  const nextAttempts = current.attempts + 1;
  const { data: claimed, error: claimError } = await supabase
    .from("site_form_submissions")
    .update({
      notification_state: "sending",
      notification_attempts: nextAttempts,
      notification_last_attempt_at: attemptedAt,
      notification_error: null,
    })
    .eq("id", submissionId)
    .eq("notification_state", current.state)
    .eq("notification_attempts", current.attempts)
    .select("id")
    .maybeSingle();

  if (claimError) return { error: claimError.message, code: "db_error" };
  if (!claimed) {
    return { error: "Notification delivery was already retried elsewhere", code: "stale_revision" };
  }

  const { data: form } = await supabase
    .from("site_forms")
    .select("name")
    .eq("id", String(source.form_id))
    .maybeSingle();

  const delivery = await deliverFormSubmissionNotification({
    recipients: current.recipients,
    formName: String(form?.name ?? "Website form"),
    record: submissionRecordFromRow(source),
    receivedAt: String(source.created_at ?? attemptedAt),
  });

  const notification: SubmissionRow["notification"] = {
    state: delivery.ok ? "sent" : "failed",
    recipients: current.recipients,
    attempts: nextAttempts,
    lastAttemptAt: attemptedAt,
    sentAt: delivery.ok ? attemptedAt : null,
    error: delivery.error,
  };

  const { data: finalized, error: updateError } = await supabase
    .from("site_form_submissions")
    .update({
      notification_state: notification.state,
      notification_sent_at: notification.sentAt,
      notification_error: notification.error,
      notification_message_ids: delivery.messageIds,
    })
    .eq("id", submissionId)
    .eq("notification_state", "sending")
    .eq("notification_attempts", nextAttempts)
    .select("id")
    .maybeSingle();

  if (updateError) return { error: updateError.message, code: "db_error" };
  if (!finalized) {
    return {
      error: "The notification was sent, but its delivery state changed before it could be recorded",
      code: "stale_revision",
    };
  }

  revalidatePath(`/dashboard/website/forms/${String(source.form_id)}/submissions`);
  return delivery.ok
    ? { data: { notification } }
    : { data: { notification }, error: delivery.error ?? "Notification delivery failed" };
}
