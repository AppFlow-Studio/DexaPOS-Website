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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import menu from Clover
          </DialogTitle>
          <DialogDescription>
            Upload a Clover .xlsx export. Items, categories, and modifier groups will be staged for review before commit.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg px-6 py-10 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm">
                {file ? file.name : "Click to select a Clover .xlsx export"}
              </p>
              <p className="text-xs text-muted-foreground">
                Must include the standard 5 Clover sheets: Items, Modifier Groups, Categories, Tax Rates, Instructions.
              </p>
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
            </div>

            <DialogFooter>
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
            </DialogFooter>
          </div>
        )}

        {step === "preview" && preview && (
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4">
              <DiffSummaryGrid diff={preview.diff} />

              {preview.flags.length > 0 && (
                <FlagsList
                  flags={preview.flags}
                  flagIResolutions={flagIResolutions}
                  onFlagIChange={(key, res) =>
                    setFlagIResolutions((prev) => ({ ...prev, [key]: res }))
                  }
                />
              )}

              <Separator />

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
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={existingMenuId}
                    onChange={(e) => setExistingMenuId(e.target.value)}
                  >
                    <option value="">Select a menu…</option>
                    {preview.available_menus.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <Separator />

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
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-medium text-amber-900">
                      This merchant already has menu items.
                    </p>
                    <p className="text-xs text-amber-800">
                      Re-import will merge into the existing menu domain based on Clover IDs. Confirm to proceed.
                    </p>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="merge-confirm"
                        checked={mergeConfirmed}
                        onCheckedChange={(c) => setMergeConfirmed(c === true)}
                      />
                      <Label htmlFor="merge-confirm" className="text-sm font-normal text-amber-900">
                        I understand — merge anyway
                      </Label>
                    </div>
                  </div>
                </div>
              )}

              {flagIEntries.length > 0 && flagIEntries.some((f) => !flagIResolutions[`${f.entity_type}::${f.name}`]) && (
                <p className="text-xs text-destructive">
                  Resolve all FLAG-I name collisions above before committing.
                </p>
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button
                disabled={
                  !canCommit ||
                  commitMut.isPending ||
                  flagIEntries.some((f) => !flagIResolutions[`${f.entity_type}::${f.name}`])
                }
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
            </DialogFooter>
          </ScrollArea>
        )}

        {step === "result" && commitResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-medium">Import complete</p>
            </div>
            <ResultGrid result={commitResult} />
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

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

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Entity</th>
            <th className="text-right px-3 py-2 font-medium">Will create</th>
            <th className="text-right px-3 py-2 font-medium">Will update</th>
            <th className="text-right px-3 py-2 font-medium">Will skip</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t">
              <td className="px-3 py-2">{r.label}</td>
              <td className="px-3 py-2 text-right tabular-nums text-green-700">{r.create}</td>
              <td className="px-3 py-2 text-right tabular-nums text-blue-700">{r.update}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.skip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  return (
    <div className="rounded-md border bg-amber-50/40">
      <div className="px-3 py-2 text-xs font-medium text-amber-900 border-b bg-amber-50">
        Flags raised ({flags.length})
      </div>
      <ul className="divide-y">
        {flags.map((f, i) => {
          const key = `${f.entity_type}::${f.name ?? f.clover_id ?? i}`;
          return (
            <li key={`${f.code}-${i}`} className="px-3 py-2 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">FLAG-{f.code}</Badge>
                <span className="text-muted-foreground">{f.message}</span>
              </div>

              {f.code === "I" && (f.entity_type === "category" || f.entity_type === "modifier_group") && f.name && (
                <div className="pl-1 flex items-center gap-2">
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
    <div className="grid grid-cols-2 gap-2 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between rounded-md border px-3 py-1.5">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="tabular-nums font-medium">{r.v}</span>
        </div>
      ))}
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
