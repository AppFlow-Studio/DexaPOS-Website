"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  commitCloverImport,
  parseAndPreviewCloverImport,
} from "@/app/manage/actions/admin-merchant/clover-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  CloverFlag,
  CommitOptions,
  CommitResponse,
  FlagIResolution,
  ImportTarget,
  PreviewResponse,
} from "@/lib/clover-import/types";

type Step = "upload" | "preview" | "result";

interface CloverImportDialogProps {
  merchantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CloverImportDialog({ merchantId, open, onOpenChange }: CloverImportDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);

  const [targetMode, setTargetMode] = useState<"existing" | "create">("create");
  const [existingMenuId, setExistingMenuId] = useState<string>("");
  const [newMenuName, setNewMenuName] = useState<string>("");
  const [newMenuDescription, setNewMenuDescription] = useState<string>("");
  const [fieldPolicy, setFieldPolicy] = useState<"overwrite_safe" | "overwrite" | "skip">("overwrite_safe");
  const [mergeConfirmed, setMergeConfirmed] = useState(false);
  const [flagIResolutions, setFlagIResolutions] = useState<Record<string, FlagIResolution["resolution"]>>({});

  const reset = () => {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setCommitResult(null);
    setExistingMenuId("");
    setNewMenuName("");
    setNewMenuDescription("");
    setFieldPolicy("overwrite_safe");
    setMergeConfirmed(false);
    setFlagIResolutions({});
  };

  const previewMut = useMutation({
    mutationFn: async (selectedFile: File) => {
      const buffer = await selectedFile.arrayBuffer();
      const base64 = bufferToBase64(new Uint8Array(buffer));
      const result = await parseAndPreviewCloverImport({
        merchantId,
        fileBase64: base64,
        fileName: selectedFile.name,
      });
      if (result.error) throw new Error(result.error);
      return result.data!;
    },
    onSuccess: (data) => {
      setPreview(data);
      setStep("preview");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Preview failed"),
  });

  const commitMut = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview to commit");

      const target: ImportTarget =
        targetMode === "existing"
          ? { mode: "existing", menu_id: existingMenuId }
          : { mode: "create", name: newMenuName.trim(), description: newMenuDescription.trim() || undefined };

      const flagIList: FlagIResolution[] = Object.entries(flagIResolutions).map(([key, resolution]) => {
        const [entity_type, name] = key.split("::");
        return {
          entity_type: entity_type as FlagIResolution["entity_type"],
          name,
          resolution,
        };
      });

      const options: CommitOptions = {
        merge_confirmed: preview.requires_merge_confirm ? mergeConfirmed : undefined,
        field_update_policy: fieldPolicy,
        flag_resolutions: { flag_i: flagIList },
      };

      const result = await commitCloverImport({
        merchantId,
        dryRunId: preview.dryRunId,
        target,
        options,
      });
      if (result.error) throw new Error(result.error);
      return result.data!;
    },
    onSuccess: (data) => {
      setCommitResult(data);
      setStep("result");
      void queryClient.invalidateQueries({ queryKey: ["menus"] });
      void queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      void queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      toast.success("Clover menu imported");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Commit failed"),
  });

  const flagIEntries = useMemo(() => {
    if (!preview) return [];
    return preview.flags.filter((f) => f.code === "I");
  }, [preview]);

  const canCommit = (() => {
    if (!preview) return false;
    if (targetMode === "existing" && !existingMenuId) return false;
    if (targetMode === "create" && !newMenuName.trim()) return false;
    if (preview.requires_merge_confirm && !mergeConfirmed) return false;
    return true;
  })();

  const flagIUnresolved = flagIEntries.some((f) => !flagIResolutions[`${f.entity_type}::${f.name}`]);
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      {/* §12/§13.1: a wizard, so full-screen below `sm`. The content clips and
          the body scrolls; header and footer carry no rule (§5.5). */}
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 max-sm:overflow-hidden sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-3xl sm:rounded-3xl">
        <DialogHeader className="shrink-0 space-y-3 px-6 pb-2 pr-14 pt-6 text-left">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground max-sm:hidden" />
            Import menu from Clover
          </DialogTitle>
          <DialogDescription>
            Upload a Clover .xlsx export. Items, categories, and modifier groups will be staged for review before commit.
          </DialogDescription>

          {/* Neutral step pills (§14.6.4 wizard): complete is `bg-muted`,
              active is `ring-1 ring-border`. */}
          <ol className="flex gap-1">
            {STEPS.map((s, index) => {
              const isActive = index === stepIndex;
              const isComplete = index < stepIndex;
              return (
                <li
                  key={s.key}
                  title={`${index + 1}. ${s.label}`}
                  aria-current={isActive ? "step" : undefined}
                  className={cn(
                    "min-w-0 shrink-0 rounded-full px-2.5 py-1.5 text-xs sm:flex-1 sm:shrink sm:truncate",
                    isActive && "bg-background font-medium text-foreground ring-1 ring-border",
                    isComplete && "bg-muted font-medium text-foreground",
                    !isActive && !isComplete && "bg-muted/50 text-muted-foreground",
                  )}
                >
                  <span className="sm:hidden">{index + 1}</span>
                  <span className="hidden sm:inline">
                    {index + 1}. {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </DialogHeader>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {step === "upload" && (
            <button
              type="button"
              className="flex w-full flex-col items-center gap-2 rounded-2xl bg-muted/60 px-6 py-10 text-center transition-colors hover:bg-muted"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm">
                {file ? file.name : "Click to select a Clover .xlsx export"}
              </span>
              <span className="text-xs text-muted-foreground">
                Must include the standard 5 Clover sheets: Items, Modifier Groups, Categories, Tax Rates, Instructions.
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile(f);
                  e.target.value = "";
                }}
              />
            </button>
          )}

          {step === "preview" && preview && (
            <div className="space-y-6">
              <DiffSummaryGrid diff={preview.diff} />

              <FlagsList
                flags={preview.flags}
                flagIResolutions={flagIResolutions}
                onFlagIChange={(key, res) =>
                  setFlagIResolutions((prev) => ({ ...prev, [key]: res }))
                }
              />

              <div className="space-y-3">
                <Label>Target menu</Label>
                <RadioGroup value={targetMode} onValueChange={(v) => setTargetMode(v as "existing" | "create")}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="create" id="target-create" />
                    <Label htmlFor="target-create" className="font-normal">Create new menu</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="existing" id="target-existing" disabled={preview.available_menus.length === 0} />
                    <Label htmlFor="target-existing" className="font-normal">
                      Use an existing menu {preview.available_menus.length === 0 && "(none available)"}
                    </Label>
                  </div>
                </RadioGroup>

                {targetMode === "create" ? (
                  <div className="space-y-2 pl-6">
                    <Input
                      placeholder="Menu name (e.g. Dinner)"
                      value={newMenuName}
                      onChange={(e) => setNewMenuName(e.target.value)}
                    />
                    <Input
                      placeholder="Description (optional)"
                      value={newMenuDescription}
                      onChange={(e) => setNewMenuDescription(e.target.value)}
                    />
                  </div>
                ) : (
                  <Select value={existingMenuId} onValueChange={setExistingMenuId}>
                    <SelectTrigger className="w-full min-w-0" aria-label="Existing menu">
                      <SelectValue placeholder="Select a menu…" />
                    </SelectTrigger>
                    <SelectContent>
                      {preview.available_menus.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label>Field update policy</Label>
                <RadioGroup value={fieldPolicy} onValueChange={(v) => setFieldPolicy(v as typeof fieldPolicy)}>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="overwrite_safe" id="policy-safe" className="mt-0.5" />
                    <div>
                      <Label htmlFor="policy-safe" className="font-normal">Overwrite safe (recommended)</Label>
                      <p className="text-xs text-muted-foreground">
                        Update only fields untouched since the previous Clover import. Manual edits win.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="overwrite" id="policy-overwrite" className="mt-0.5" />
                    <div>
                      <Label htmlFor="policy-overwrite" className="font-normal">Overwrite</Label>
                      <p className="text-xs text-muted-foreground">
                        Always replace fields from the file. Manual edits will be lost.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="skip" id="policy-skip" className="mt-0.5" />
                    <div>
                      <Label htmlFor="policy-skip" className="font-normal">Skip updates</Label>
                      <p className="text-xs text-muted-foreground">
                        Only insert new rows. Existing rows stay as-is.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {preview.requires_merge_confirm && (
                <div className="flex items-start gap-2 rounded-2xl bg-muted/60 px-4 py-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-medium">
                      This merchant already has menu items.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Re-import will merge into the existing menu domain based on Clover IDs. Confirm to proceed.
                    </p>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="merge-confirm"
                        checked={mergeConfirmed}
                        onCheckedChange={(c) => setMergeConfirmed(c === true)}
                      />
                      <Label htmlFor="merge-confirm" className="text-sm font-normal">
                        I understand — merge anyway
                      </Label>
                    </div>
                  </div>
                </div>
              )}

              {flagIUnresolved && (
                <p className="text-xs text-muted-foreground">
                  Resolve all FLAG-I name collisions above before committing.
                </p>
              )}
            </div>
          )}

          {step === "result" && commitResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                <p className="font-medium">Import complete</p>
              </div>
              <ResultGrid result={commitResult} />
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 px-6 pb-6 pt-4 sm:gap-2">
          {step === "upload" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={!file || previewMut.isPending}
                onClick={() => file && previewMut.mutate(file)}
              >
                {previewMut.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Parsing…
                  </>
                ) : (
                  "Preview"
                )}
              </Button>
            </>
          )}

          {step === "preview" && preview && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button
                disabled={!canCommit || commitMut.isPending || flagIUnresolved}
                onClick={() => commitMut.mutate()}
              >
                {commitMut.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Committing…
                  </>
                ) : (
                  "Commit import"
                )}
              </Button>
            </>
          )}

          {step === "result" && commitResult && (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STEPS: Array<{ key: Step; label: string }> = [
  { key: "upload", label: "Upload file" },
  { key: "preview", label: "Review changes" },
  { key: "result", label: "Done" },
];

function DiffSummaryGrid({ diff }: { diff: PreviewResponse["diff"] }) {
  const rows: Array<{ label: string; create: number; update: number; skip: number }> = [
    { label: "Items", create: diff.will_create.items, update: diff.will_update.items, skip: diff.will_skip.items },
    { label: "Categories", create: diff.will_create.categories, update: diff.will_update.categories, skip: diff.will_skip.categories },
    {
      label: "Modifier groups",
      create: diff.will_create.modifier_groups,
      update: diff.will_update.modifier_groups,
      skip: diff.will_skip.modifier_groups,
    },
    {
      label: "Modifier group items",
      create: diff.will_create.modifier_group_items,
      update: diff.will_update.modifier_group_items,
      skip: diff.will_skip.modifier_group_items,
    },
  ];

  // Four fixed rows and no `min-w`, so it fits a phone and needs no pager.
  // `bounded={false}`: the dialog body already owns the scroll (§5.7).
  return (
    <Table variant="data" bounded={false}>
      <TableHeader>
        <TableRow>
          <TableHead>Entity</TableHead>
          <TableHead className="text-right">Will create</TableHead>
          <TableHead className="text-right">Will update</TableHead>
          <TableHead className="text-right">Will skip</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.label}>
            <TableCell>{r.label}</TableCell>
            <TableCell className="text-right tabular-nums">{r.create}</TableCell>
            <TableCell className="text-right tabular-nums">{r.update}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{r.skip}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FlagsList({
  flags,
  flagIResolutions,
  onFlagIChange,
}: {
  flags: CloverFlag[];
  flagIResolutions: Record<string, FlagIResolution["resolution"]>;
  onFlagIChange: (key: string, resolution: FlagIResolution["resolution"]) => void;
}) {
  if (flags.length === 0) {
    return (
      <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
        All clear — no flags raised for this file.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl bg-muted/60 p-3">
      <p className="px-1 text-xs font-medium text-muted-foreground">
        Flags raised (<span className="tabular-nums">{flags.length}</span>)
      </p>
      <ul className="space-y-1">
        {flags.map((f, i) => {
          const key = `${f.entity_type}::${f.name ?? f.clover_id ?? i}`;
          return (
            <li key={`${f.code}-${i}`} className="space-y-1 rounded-2xl bg-card/70 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="shrink-0 text-[10px]">FLAG-{f.code}</Badge>
                <span className="min-w-0 text-muted-foreground">{f.message}</span>
              </div>

              {f.code === "I" && (f.entity_type === "category" || f.entity_type === "modifier_group") && f.name && (
                <div className="flex flex-wrap items-center gap-2 pl-1">
                  <Label className="text-[11px] text-muted-foreground">Resolution:</Label>
                  <RadioGroup
                    value={flagIResolutions[key] ?? ""}
                    onValueChange={(v) => onFlagIChange(key, v as FlagIResolution["resolution"])}
                    className="flex gap-3"
                  >
                    {(["adopt", "rename", "skip"] as const).map((opt) => (
                      <div key={opt} className="flex items-center gap-1">
                        <RadioGroupItem value={opt} id={`${key}-${opt}`} className="h-3 w-3" />
                        <Label htmlFor={`${key}-${opt}`} className="text-[11px] font-normal capitalize">
                          {opt}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ResultGrid({ result }: { result: CommitResponse }) {
  const orphans = result.orphan_items_attached ?? 0;
  const rows = [
    { label: "Items created", v: result.created_items },
    { label: "Categories created", v: result.created_categories },
    { label: "Modifier groups created", v: result.created_modifier_groups },
    { label: "Modifier group items created", v: result.created_modifier_group_items },
    { label: "Item↔menu joins", v: result.joined_item_menus },
    { label: "Menu↔category joins", v: result.joined_menu_categories },
    { label: "Item↔category joins", v: result.joined_category_items },
    { label: "Item↔modifier-group joins", v: result.joined_item_modifier_groups },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex min-w-0 justify-between gap-3 rounded-2xl bg-muted/45 px-4 py-2">
            <span className="min-w-0 text-muted-foreground">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{r.v}</span>
          </div>
        ))}
      </div>
      {orphans > 0 && (
        <div className="flex items-start gap-2 rounded-2xl bg-muted/60 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-xs">
            <p className="font-medium">
              <span className="tabular-nums">{orphans}</span> item{orphans === 1 ? "" : "s"} attached to "Unsorted (Clover)".
            </p>
            <p className="mt-0.5 text-muted-foreground">
              These items had no category in the Clover file (or referenced an unknown category). They are visible
              under a safety-net category so you can reassign them — no items were silently dropped.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function bufferToBase64(bytes: Uint8Array): string {
  if (typeof window === "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(slice) as number[]);
  }
  return btoa(binary);
}
