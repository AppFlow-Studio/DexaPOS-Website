"use client";

import { useMemo, useState } from "react";
import { Pencil, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export type OnlineStoreMissingFieldKey =
  | "legalBusinessName"
  | "dbaName"
  | "einTaxId"
  | "w9Form"
  | "ownerFirstName"
  | "ownerLastName"
  | "ownerDob"
  | "ownerSsn"
  | "ownerGovernmentId"
  | "bankName"
  | "accountHolderName"
  | "ddaAccountNumber"
  | "routingNumber"
  | "bankSupportDocument";

export type MissingFieldMap = Record<OnlineStoreMissingFieldKey, boolean>;

export type MissingFieldValues = Partial<Record<OnlineStoreMissingFieldKey, string>>;

export type RequirementsResult = {
  success: boolean;
  complete: boolean;
  missing: MissingFieldMap;
  values: MissingFieldValues;
  error?: string;
};

type FieldType = "text" | "date" | "file";

type FieldDef = {
  key: OnlineStoreMissingFieldKey;
  label: string;
  type: FieldType;
  placeholder?: string;
  accept?: string;
  fileFormKey?: string; // FormData key for file inputs
  help?: string;
};

const FIELD_DEFS: FieldDef[] = [
  { key: "legalBusinessName", label: "Legal Business Name", type: "text", placeholder: "Legal business name" },
  { key: "dbaName", label: "DBA Name", type: "text", placeholder: "Doing business as" },
  { key: "einTaxId", label: "EIN / Tax ID", type: "text", placeholder: "9 digits" },
  { key: "w9Form", label: "Signed W-9", type: "file", accept: "application/pdf", fileFormKey: "w9FormFile", help: "PDF only" },
  { key: "ownerFirstName", label: "Owner First Name", type: "text" },
  { key: "ownerLastName", label: "Owner Last Name", type: "text" },
  { key: "ownerDob", label: "Owner DOB", type: "date" },
  { key: "ownerSsn", label: "Owner SSN", type: "text", placeholder: "9 digits" },
  { key: "ownerGovernmentId", label: "Owner Government ID", type: "file", accept: "application/pdf,image/png,image/jpeg,image/webp", fileFormKey: "ownerGovernmentIdFile" },
  { key: "bankName", label: "Bank Name", type: "text" },
  { key: "accountHolderName", label: "Account Holder Name", type: "text" },
  { key: "ddaAccountNumber", label: "DDA Account Number", type: "text" },
  { key: "routingNumber", label: "Routing Number", type: "text" },
  { key: "bankSupportDocument", label: "Bank Letter / Voided Check", type: "file", accept: "application/pdf,image/png,image/jpeg,image/webp", fileFormKey: "bankSupportDocumentFile" },
];

export function MissingDataForm(props: {
  mode: "merchant" | "admin";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  // Context keys to include in save requests.
  locationId: string;
  merchantId?: string;
  requirements: RequirementsResult | null;
  // Save callback should persist provided fields/files and return refreshed requirements.
  onSave: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
  onRefresh: () => Promise<RequirementsResult>;
  onCompleted?: () => void;
}) {
  const {
    mode,
    open,
    onOpenChange,
    title = "Complete Required Info",
    description = "Only missing fields are shown.",
    locationId,
    merchantId,
    requirements,
    onSave,
    onRefresh,
    onCompleted,
  } = props;

  const missingKeys = useMemo(() => {
    if (!requirements?.success) return [] as OnlineStoreMissingFieldKey[];
    return FIELD_DEFS
      .map((d) => d.key)
      .filter((key) => Boolean((requirements.missing as any)?.[key]));
  }, [requirements]);

  const [activeKey, setActiveKey] = useState<OnlineStoreMissingFieldKey | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [saving, setSaving] = useState(false);

  const activeDef = useMemo(() => FIELD_DEFS.find((d) => d.key === activeKey) ?? null, [activeKey]);

  function setFromRequirements() {
    const vals = requirements?.values ?? {};
    setDraft((prev) => ({ ...vals, ...prev } as any));
  }

  async function saveActiveField() {
    if (!activeDef) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("locationId", locationId);
      if (mode === "admin" && merchantId) {
        formData.set("merchantId", merchantId);
      }

      if (activeDef.type === "file") {
        const file = files[activeDef.key] ?? null;
        if (file) {
          formData.set(activeDef.fileFormKey || activeDef.key, file);
        }
      } else {
        const value = (draft[activeDef.key] ?? "").trim();
        if (value.length > 0) {
          formData.set(activeDef.key, value);
        }
      }

      const result = await onSave(formData);
      if (!result.success) {
        toast.error(result.error || "Failed to save");
        return;
      }

      const refreshed = await onRefresh();
      if (!refreshed.success) {
        toast.error(refreshed.error || "Failed to refresh");
        return;
      }

      // Update local draft to include latest values (safe fields only)
      setDraft((prev) => ({ ...prev, ...(refreshed.values as any) }));

      // Close editor if field is no longer missing
      if (!(refreshed.missing as any)[activeDef.key]) {
        setActiveKey(null);
        toast.success("Saved");
      } else {
        toast.error("Field is still missing. Check format and try again.");
      }

      if (refreshed.complete) {
        onOpenChange(false);
        onCompleted?.();
      }
    } finally {
      setSaving(false);
    }
  }

  const content = (
    <div className="space-y-4">
      {missingKeys.length === 0 ? (
        <div className="text-sm text-muted-foreground">No missing fields.</div>
      ) : (
        <div className="space-y-2">
          {missingKeys.map((key) => {
            const def = FIELD_DEFS.find((d) => d.key === key)!;
            const isActive = activeKey === key;
            return (
              <div key={key} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{def.label}</span>
                      <Badge variant="secondary">Missing</Badge>
                      {def.help ? (
                        <span className="text-xs text-muted-foreground">{def.help}</span>
                      ) : null}
                    </div>
                    {def.type !== "file" ? (
                      <div className="mt-1 text-xs text-muted-foreground break-all">
                        {draft[key] || (requirements?.values?.[key] ?? "") || ""}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFromRequirements();
                      setActiveKey(key);
                    }}
                    className="shrink-0"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>

                {isActive ? (
                  <div className="mt-4 grid gap-2">
                    <Label className="text-xs text-muted-foreground">Update</Label>
                    {def.type === "file" ? (
                      <Input
                        type="file"
                        accept={def.accept}
                        onChange={(e) =>
                          setFiles((prev) => ({
                            ...prev,
                            [key]: e.target.files?.[0] ?? null,
                          }))
                        }
                      />
                    ) : (
                      <Input
                        type={def.type === "date" ? "date" : "text"}
                        value={draft[key] || ""}
                        placeholder={def.placeholder}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      />
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveKey(null)}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={saveActiveField}
                        disabled={saving}
                      >
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {content}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

