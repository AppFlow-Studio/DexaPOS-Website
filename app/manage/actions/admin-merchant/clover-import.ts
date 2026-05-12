"use server";

import { auth } from "@clerk/nextjs/server";
import { createHash } from "node:crypto";

import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import { assertHQPermission } from "@/lib/admin/auth";
import { diffCloverAgainstMerchant, type ExistingMerchantData } from "@/lib/clover-import/diff";
import { computeMerchantMenuFingerprint } from "@/lib/clover-import/fingerprint";
import { parseCloverWorkbook } from "@/lib/clover-import/parser";
import type {
  CommitOptions,
  CommitResponse,
  DryRunPayload,
  ImportTarget,
  PreviewResponse,
} from "@/lib/clover-import/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

interface PreviewArgs {
  merchantId: string;
  fileBase64: string;
  fileName: string;
}

export async function parseAndPreviewCloverImport(
  args: PreviewArgs,
): Promise<{ data?: PreviewResponse; error?: string }> {
  try {
    await assertHQPermission("hq.merchant.menu.import");
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    const buffer = Buffer.from(args.fileBase64, "base64");
    if (buffer.length === 0) return { error: "Empty file" };
    if (buffer.length > 10 * 1024 * 1024) return { error: "File exceeds 10MB limit" };

    const fileHash = createHash("sha256").update(buffer).digest("hex");

    // Parse the workbook — may throw with ParseError.code.
    const ir = parseCloverWorkbook(buffer);

    const authedClient = createServerSupabaseClient();
    const serviceClient = createServiceRoleClient();

    // Load existing merchant menu data for diff resolution.
    const [
      itemsRes,
      catsRes,
      mgsRes,
      mgiRes,
      priorRes,
      menusRes,
      itemCountRes,
    ] = await Promise.all([
      serviceClient
        .from("menu_items")
        .select("id, name, source_external_id, source_system")
        .eq("merchant_id", args.merchantId),
      serviceClient
        .from("categories")
        .select("id, name, source_external_id, source_system")
        .eq("merchant_id", args.merchantId),
      serviceClient
        .from("modifier_groups")
        .select("id, name, source_external_id, source_system")
        .eq("merchant_id", args.merchantId),
      serviceClient
        .from("modifier_group_items")
        .select("id, name, source_external_id, source_system, modifier_group_id")
        .eq("merchant_id", args.merchantId),
      serviceClient
        .from("clover_import_dry_runs")
        .select("file_hash, committed_at")
        .eq("merchant_id", args.merchantId)
        .eq("status", "committed"),
      serviceClient
        .from("menus")
        .select("id, name")
        .eq("merchant_id", args.merchantId)
        .order("name", { ascending: true }),
      serviceClient
        .from("menu_items")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", args.merchantId),
    ]);

    const dataErr = [itemsRes, catsRes, mgsRes, mgiRes, priorRes, menusRes, itemCountRes].find(
      (r) => r.error,
    )?.error;
    if (dataErr) return { error: `Failed to load merchant menu state: ${dataErr.message}` };

    const existing: ExistingMerchantData = {
      items: itemsRes.data ?? [],
      categories: catsRes.data ?? [],
      modifier_groups: mgsRes.data ?? [],
      modifier_group_items: mgiRes.data ?? [],
      prior_file_hashes: (priorRes.data ?? []).map((r) => ({
        file_hash: r.file_hash as string,
        committed_at: r.committed_at as string,
      })),
    };

    const { diff, flags: diffFlags } = diffCloverAgainstMerchant(ir, existing, fileHash);
    const flags = [...ir.flags, ...diffFlags];

    const fingerprint = await computeMerchantMenuFingerprint(authedClient, args.merchantId);

    const payload: DryRunPayload = { ir, diff, flags };

    const { data: dryRun, error: insertErr } = await serviceClient
      .from("clover_import_dry_runs")
      .insert({
        merchant_id: args.merchantId,
        created_by_clerk_user_id: userId,
        file_name: args.fileName,
        file_hash: fileHash,
        payload,
        fingerprint,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertErr || !dryRun) {
      return { error: `Failed to stage dry run: ${insertErr?.message ?? "unknown"}` };
    }

    return {
      data: {
        dryRunId: dryRun.id as string,
        diff,
        flags,
        available_menus: (menusRes.data ?? []).map((m) => ({ id: m.id as string, name: m.name as string })),
        requires_merge_confirm: (itemCountRes.count ?? 0) > 0,
        fingerprint,
        file_hash: fileHash,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: message };
  }
}

interface CommitArgs {
  merchantId: string;
  dryRunId: string;
  target: ImportTarget;
  options?: CommitOptions;
}

export async function commitCloverImport(
  args: CommitArgs,
): Promise<{ data?: CommitResponse; error?: string }> {
  try {
    await assertHQPermission("hq.merchant.menu.import");
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    if (!args.target || (args.target.mode !== "existing" && args.target.mode !== "create")) {
      return { error: "GATE-6: target must be { mode: 'existing', menu_id } or { mode: 'create', name }" };
    }
    if (args.target.mode === "existing" && !args.target.menu_id) {
      return { error: "GATE-6: target.menu_id required when mode=existing" };
    }
    if (args.target.mode === "create" && !args.target.name?.trim()) {
      return { error: "GATE-6: target.name required when mode=create" };
    }

    // GATE-2: enforce merge confirmation when merchant already has menu items
    // and the dry-run preview flagged it.
    const serviceClient = createServiceRoleClient();
    const { data: dryRun, error: dryErr } = await serviceClient
      .from("clover_import_dry_runs")
      .select("id, merchant_id, created_by_clerk_user_id, status, expires_at, file_hash, payload")
      .eq("id", args.dryRunId)
      .single();

    if (dryErr || !dryRun) return { error: `Dry run not found: ${dryErr?.message ?? "missing"}` };
    if (dryRun.merchant_id !== args.merchantId) {
      return { error: "Dry run does not belong to merchant" };
    }
    if (dryRun.created_by_clerk_user_id !== userId) {
      return { error: "Dry run owned by a different user" };
    }
    if (dryRun.status !== "pending") return { error: `Dry run already ${dryRun.status}` };

    const { count: existingItemCount } = await serviceClient
      .from("menu_items")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", args.merchantId);

    if ((existingItemCount ?? 0) > 0 && args.options?.merge_confirmed !== true) {
      return { error: "GATE-2: this merchant has existing menu items; pass merge_confirmed=true to commit" };
    }

    const authedClient = createServerSupabaseClient();
    const { data, error } = await authedClient.rpc("import_clover_menu", {
      p_dry_run_id: args.dryRunId,
      p_target: args.target,
      p_field_update_policy: args.options?.field_update_policy ?? "overwrite_safe",
      p_flag_resolutions: args.options?.flag_resolutions ?? {},
    });

    if (error) return { error: error.message };

    const result = data as unknown as CommitResponse;

    await LogAuditEvent({
      merchantId: args.merchantId,
      action: "Imported menu from Clover",
      actionCategory: "menu_management",
      severity: "info",
      resourceType: "clover_import",
      resourceId: result.target_menu_id,
      resourceName: args.target.mode === "create" ? args.target.name : undefined,
      changes: { after: { row_counts: result } },
      metadata: {
        dry_run_id: args.dryRunId,
        file_hash: dryRun.file_hash,
        target: args.target,
        field_update_policy: args.options?.field_update_policy ?? "overwrite_safe",
      },
    });

    return { data: result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: message };
  }
}
