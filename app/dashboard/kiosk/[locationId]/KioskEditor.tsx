"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  FileVideo,
  ImageIcon,
  Loader2,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import {
  assignProfileToStation,
  cloneKioskProfile,
  KioskAssetType,
  KioskEditorData,
  KioskProfile,
  KioskProfileInput,
  KioskTemplateId,
  listKioskProfiles,
  publishKioskProfile,
  setAdminPin,
  uploadKioskAsset,
  upsertKioskProfile,
} from "@/app/dashboard/actions/kiosk";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CROPPABLE_MIME_TYPES, ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { KioskPreview } from "./KioskPreview";

const NONE_VALUE = "__none__";

const templates: Array<{ id: KioskTemplateId; name: string; description: string }> = [
  { id: "template_a", name: "Template A", description: "Menu-first grid with a large hero header." },
  { id: "template_b", name: "Template B", description: "Category rail with compact product rows." },
  { id: "template_c", name: "Template C", description: "Visual browse layout for high-traffic counters." },
];

function defaultProfile(locationId: string): KioskProfile {
  const now = new Date().toISOString();
  return {
    id: "draft",
    merchant_id: "",
    location_id: locationId,
    profile_name: "Default Kiosk",
    template_id: "template_a",
    primary_color: "#0C4FD1",
    secondary_color: null,
    accent_color: "#16A34A",
    background_color: "#FFFFFF",
    text_color: "#0A0A0A",
    header_text_color: "#FFFFFF",
    font_family: "Inter",
    logo_url: null,
    idle_images_vertical: [],
    idle_images_horizontal: [],
    idle_video_vertical: null,
    idle_video_horizontal: null,
    order_banner_images_vertical: [],
    order_banner_images_horizontal: [],
    orientation: "vertical",
    idle_timeout_seconds: 60,
    cart_reset_timeout_seconds: 30,
    welcome_message: "Tap to order",
    pickup_number_prefix: "",
    auto_print_receipt: false,
    receipt_email_prompt: true,
    receipt_sms_prompt: true,
    show_calorie_info: false,
    show_allergens: true,
    loyalty_enrollment_enabled: true,
    tip_screen_enabled: true,
    tip_presets: [15, 18, 20, 25],
    is_active: false,
    payment_terminal_id: null,
    admin_pin_hash: null,
    published_at: null,
    created_at: now,
    updated_at: now,
  };
}

function toInput(profile: KioskProfile): KioskProfileInput {
  return {
    id: profile.id === "draft" ? undefined : profile.id,
    location_id: profile.location_id,
    profile_name: profile.profile_name,
    template_id: profile.template_id,
    primary_color: profile.primary_color,
    secondary_color: profile.secondary_color,
    accent_color: profile.accent_color,
    background_color: profile.background_color,
    text_color: profile.text_color,
    header_text_color: profile.header_text_color,
    font_family: profile.font_family,
    logo_url: profile.logo_url,
    idle_images_vertical: profile.idle_images_vertical,
    idle_images_horizontal: profile.idle_images_horizontal,
    idle_video_vertical: profile.idle_video_vertical,
    idle_video_horizontal: profile.idle_video_horizontal,
    order_banner_images_vertical: profile.order_banner_images_vertical,
    order_banner_images_horizontal: profile.order_banner_images_horizontal,
    orientation: profile.orientation,
    idle_timeout_seconds: profile.idle_timeout_seconds,
    cart_reset_timeout_seconds: profile.cart_reset_timeout_seconds,
    welcome_message: profile.welcome_message,
    pickup_number_prefix: profile.pickup_number_prefix,
    auto_print_receipt: profile.auto_print_receipt,
    receipt_email_prompt: profile.receipt_email_prompt,
    receipt_sms_prompt: profile.receipt_sms_prompt,
    show_calorie_info: profile.show_calorie_info,
    show_allergens: profile.show_allergens,
    loyalty_enrollment_enabled: profile.loyalty_enrollment_enabled,
    tip_screen_enabled: profile.tip_screen_enabled,
    tip_presets: profile.tip_presets,
    is_active: profile.is_active,
    payment_terminal_id: profile.payment_terminal_id,
  };
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const convert = (channel: number) => {
    const next = channel / 255;
    return next <= 0.03928 ? next / 12.92 : ((next + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
}

function contrastRatio(foreground: string, background: string) {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function formatRatio(value: number) {
  return `${value.toFixed(1)}:1`;
}

function contrastTone(value: number) {
  if (value < 3) return "border-destructive/30 bg-destructive/5 text-destructive";
  if (value < 4.5) return "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-400";
  return "border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-400";
}

/** Section label used above each grouped field cluster inside a card. */
function FieldGroupLabel({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium">{title}</h3>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 rounded-md border pl-1 pr-2.5 focus-within:ring-2 focus-within:ring-ring/50">
        <label className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-sm border">
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="absolute -inset-2 cursor-pointer"
            aria-label={`${label} color picker`}
          />
        </label>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full min-w-0 bg-transparent font-mono text-sm uppercase outline-none"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-md border px-3.5 py-3 transition-colors hover:bg-muted/40">
      <div className="space-y-0.5">
        <p className="text-sm font-medium leading-none">{label}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5 shrink-0" />
    </label>
  );
}

/** Shared chrome for every upload slot: icon, title, helper text, status badge. */
function SlotHeader({
  icon,
  title,
  helper,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  helper: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>
        </div>
      </div>
      {badge}
    </div>
  );
}

/** Single-image slot used for the logo — no fixed crop ratio, no gallery. */
function AssetUpload({
  label,
  helper,
  accept,
  onUpload,
  disabled,
  value,
  onClear,
}: {
  label: string;
  helper: string;
  accept: string;
  onUpload: (file: File) => void;
  disabled: boolean;
  value?: string | null;
  onClear?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SlotHeader
        icon={<ImageIcon className="h-4 w-4" />}
        title={label}
        helper={helper}
        badge={
          value ? (
            <Badge variant="outline" className="shrink-0 border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-400">
              Uploaded
            </Badge>
          ) : undefined
        }
      />

      <div className="flex shrink-0 items-center gap-4 sm:pl-3">
        {value ? (
          <div className="h-12 w-12 overflow-hidden rounded-md border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-size-[10px_10px]">
            <img src={value} alt={`${label} preview`} className="h-full w-full object-contain" />
          </div>
        ) : null}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="relative overflow-hidden" disabled={disabled}>
            <Upload className="h-3.5 w-3.5" />
            {value ? "Replace" : "Upload"}
            <input
              aria-label={label}
              type="file"
              accept={accept}
              disabled={disabled}
              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file);
                event.currentTarget.value = "";
              }}
            />
          </Button>
          {value && onClear ? (
            <Button type="button" variant="ghost" size="icon" onClick={onClear} disabled={disabled} aria-label={`Remove ${label}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * A single placement × orientation image gallery slot (up to 5 images).
 * Every add goes through the shared crop dialog locked to `aspectRatio`, so
 * whatever the merchant uploads always fills the slot's real render shape —
 * no stretched or off-center hero shots on the kiosk.
 */
function KioskGallerySlot({
  title,
  helper,
  aspectRatio,
  aspectLabel,
  images,
  onAdd,
  onRemove,
  disabled,
  uploading,
}: {
  title: string;
  helper: string;
  aspectRatio: number;
  aspectLabel: string;
  images: string[];
  onAdd: (file: File) => void;
  onRemove: (url: string) => void;
  disabled: boolean;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const atLimit = images.length >= 5;

  function pickFile() {
    if (disabled || uploading || atLimit) return;
    inputRef.current?.click();
  }

  function handleFilePicked(file: File | null) {
    if (!file) return;
    if (!CROPPABLE_MIME_TYPES.has(file.type)) {
      toast.error("Use a JPG, PNG, or WEBP image.");
      return;
    }
    setPendingFile(file);
    setCropOpen(true);
  }

  function handleCropConfirm(croppedFile: File) {
    onAdd(croppedFile);
    setPendingFile(null);
  }

  return (
    <div className="space-y-3">
      <SlotHeader
        icon={<ImageIcon className="h-4 w-4" />}
        title={title}
        helper={helper}
        badge={
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="outline" className="font-mono text-[10px] font-normal text-muted-foreground">
              {aspectLabel}
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px] font-normal">
              {images.length}/5
            </Badge>
          </div>
        }
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          event.currentTarget.value = "";
          handleFilePicked(file);
        }}
      />

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((url, index) => (
          <div key={url} className="group relative overflow-hidden rounded-md border bg-muted/40" style={{ aspectRatio }}>
            <img src={url} alt={`${title} ${index + 1}`} className="h-full w-full object-cover" />
            <span className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-sm bg-background/90 px-1 text-[10px] font-medium tabular-nums">
              {index + 1}
            </span>
            <button
              type="button"
              onClick={() => onRemove(url)}
              disabled={disabled}
              aria-label={`Remove image ${index + 1}`}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-sm bg-background/90 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:opacity-0"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}

        {!atLimit ? (
          <button
            type="button"
            onClick={pickFile}
            disabled={disabled || uploading}
            className="flex items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:bg-muted/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            style={{ aspectRatio }}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      <ImageCropDialog
        file={pendingFile}
        open={cropOpen}
        onOpenChange={(open) => {
          setCropOpen(open);
          if (!open) setPendingFile(null);
        }}
        onConfirm={handleCropConfirm}
        aspectRatio={aspectRatio}
        title={`Fit image to ${aspectLabel}`}
        description="Drag to pan, scroll or use the slider to zoom. The framed area is what shows on the kiosk."
      />
    </div>
  );
}

/** Single idle-only video slot (no gallery — one video per orientation). */
function KioskVideoSlot({
  title,
  helper,
  value,
  onUpload,
  onClear,
  disabled,
  uploading,
}: {
  title: string;
  helper: string;
  value: string | null;
  onUpload: (file: File) => void;
  onClear: () => void;
  disabled: boolean;
  uploading: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SlotHeader
        icon={<Video className="h-4 w-4" />}
        title={title}
        helper={helper}
        badge={
          value ? (
            <Badge variant="outline" className="shrink-0 border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-400">
              Uploaded
            </Badge>
          ) : undefined
        }
      />

      <div className="flex shrink-0 items-center gap-1 sm:pl-3">
        <Button variant="outline" size="sm" className="relative overflow-hidden" disabled={disabled || uploading}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {value ? "Replace" : "Upload"}
          <input
            aria-label={title}
            type="file"
            accept="video/mp4"
            disabled={disabled || uploading}
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.currentTarget.value = "";
            }}
          />
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="icon" onClick={onClear} disabled={disabled} aria-label={`Remove ${title}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function KioskEditor({ initialData }: { initialData: KioskEditorData }) {
  const initialProfile = initialData.profiles[0] ?? defaultProfile(initialData.location.id);
  const [data, setData] = useState(initialData);
  const [selectedProfileId, setSelectedProfileId] = useState(initialProfile.id);
  const [draft, setDraft] = useState<KioskProfile>(initialProfile);
  const [pin, setPin] = useState("");
  const [cloneName, setCloneName] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [contrastOpen, setContrastOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [uploadingAsset, setUploadingAsset] = useState<KioskAssetType | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const textContrast = useMemo(
    () => contrastRatio(draft.text_color, draft.background_color),
    [draft.background_color, draft.text_color],
  );
  const headerContrast = useMemo(
    () => contrastRatio(draft.header_text_color || "#FFFFFF", draft.primary_color),
    [draft.header_text_color, draft.primary_color],
  );
  const minimumContrast = Math.min(textContrast, headerContrast);
  const isExistingProfile = draft.id !== "draft";

  // The dashboard shell's #main-content sets `overflow-y-auto overflow-x-hidden`,
  // which makes it a scroll container per spec (a non-`visible` value on
  // either axis forces the *other* axis to compute as `auto` too, even if
  // set to `visible`). But its flex ancestor chain has no definite height
  // (`min-h-svh`, not `h-svh`), so #main-content's box never actually grows
  // taller than its content — there's nothing to scroll internally, so the
  // real scrolling happens on <body>. That leaves #main-content as an inert
  // scroll container that still wins as the `position: sticky` containing
  // block, so the header never finds a scroll distance to stick against.
  // Overriding both axes to `visible` here — scoped to this page only, not
  // the shared layout — removes it from the containing-block chain so the
  // sticky header binds to <body>'s real scroll instead.
  useEffect(() => {
    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;
    const previousOverflowY = mainContent.style.overflowY;
    const previousOverflowX = mainContent.style.overflowX;
    mainContent.style.overflowY = "visible";
    mainContent.style.overflowX = "visible";
    return () => {
      mainContent.style.overflowY = previousOverflowY;
      mainContent.style.overflowX = previousOverflowX;
    };
  }, []);

  function updateDraft(updates: Partial<KioskProfile>) {
    setDraft((current) => ({ ...current, ...updates }));
    setIsDirty(true);
  }

  async function refresh(nextProfileId?: string) {
    const result = await listKioskProfiles(data.location.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setData(result.data);
    const nextProfile =
      result.data.profiles.find((profile) => profile.id === (nextProfileId ?? selectedProfileId)) ??
      result.data.profiles[0] ??
      defaultProfile(result.data.location.id);
    setSelectedProfileId(nextProfile.id);
    setDraft(nextProfile);
    setIsDirty(false);
  }

  function selectProfile(profileId: string) {
    if (profileId === "new") {
      const next = defaultProfile(data.location.id);
      setSelectedProfileId(next.id);
      setDraft(next);
      setIsDirty(false);
      return;
    }
    const profile = data.profiles.find((item) => item.id === profileId);
    if (profile) {
      setSelectedProfileId(profile.id);
      setDraft(profile);
      setIsDirty(false);
    }
  }

  function requestSave() {
    if (minimumContrast < 3) {
      toast.error("Save blocked. Text contrast must be at least 3:1.");
      return;
    }
    if (minimumContrast < 4.5 && !pendingSave) {
      setContrastOpen(true);
      return;
    }
    saveDraft();
  }

  function saveDraft() {
    setPendingSave(false);
    startTransition(async () => {
      const result = await upsertKioskProfile(toInput(draft));
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Kiosk profile saved");
      await refresh(result.data.id);
    });
  }

  function publishDraft() {
    if (!isExistingProfile) {
      toast.error("Save the profile before publishing.");
      return;
    }
    if (isDirty) {
      toast.error("You have unsaved changes. Save before publishing.");
      return;
    }
    startTransition(async () => {
      const result = await publishKioskProfile(draft.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Kiosk profile published");
      setPublishOpen(false);
      await refresh(result.data.id);
    });
  }

  function cloneDraft() {
    if (!isExistingProfile) {
      toast.error("Save the profile before cloning.");
      return;
    }
    startTransition(async () => {
      const result = await cloneKioskProfile(draft.id, cloneName || `${draft.profile_name} copy`);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Kiosk profile cloned");
      setCloneName("");
      await refresh(result.data.id);
    });
  }

  function updateStation(stationId: string, profileId: string) {
    startTransition(async () => {
      const result = await assignProfileToStation(stationId, profileId === NONE_VALUE ? null : profileId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Station binding updated");
      await refresh();
    });
  }

  function savePin() {
    if (!isExistingProfile) {
      toast.error("Save the profile before setting a PIN.");
      return;
    }
    startTransition(async () => {
      const result = await setAdminPin(draft.id, pin);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Admin PIN saved");
      setPin("");
      await refresh(draft.id);
    });
  }

  async function uploadAsset(file: File, assetType: KioskAssetType): Promise<string | null> {
    setUploadingAsset(assetType);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadKioskAsset(formData, { locationId: data.location.id, assetType });
      if (!result.success) {
        toast.error(result.error);
        return null;
      }
      toast.success("Asset uploaded");
      return result.data.url;
    } finally {
      setUploadingAsset(null);
    }
  }

  function uploadLogo(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be 2MB or smaller.");
      return;
    }
    startTransition(async () => {
      const url = await uploadAsset(file, "logo");
      if (url) updateDraft({ logo_url: url });
    });
  }

  function uploadGalleryImage(
    file: File,
    assetType: KioskAssetType,
    field: "idle_images_vertical" | "idle_images_horizontal" | "order_banner_images_vertical" | "order_banner_images_horizontal",
  ) {
    if (draft[field].length >= 5) {
      toast.error("You can upload up to 5 images per slot.");
      return;
    }
    startTransition(async () => {
      const url = await uploadAsset(file, assetType);
      if (url) updateDraft({ [field]: [...draft[field], url] });
    });
  }

  function uploadIdleVideo(file: File, orientation: "vertical" | "horizontal") {
    if (file.size > 30 * 1024 * 1024) {
      toast.error("Idle video must be 30MB or smaller.");
      return;
    }
    const assetType: KioskAssetType = orientation === "vertical" ? "idle_video_vertical" : "idle_video_horizontal";
    const field = orientation === "vertical" ? "idle_video_vertical" : "idle_video_horizontal";
    startTransition(async () => {
      const url = await uploadAsset(file, assetType);
      if (url) updateDraft({ [field]: url });
    });
  }

  const saveState: "clean" | "dirty" | "saving" = isPending ? "saving" : isDirty ? "dirty" : "clean";

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="sticky top-0 z-20 -mx-4 -mt-4 space-y-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/85 sm:-mx-6 sm:-mt-6 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">Kiosk</h1>
              <Badge variant={draft.is_active ? "default" : "secondary"}>{draft.is_active ? "Live" : "Draft"}</Badge>
              {draft.published_at ? (
                <span className="text-xs text-muted-foreground">
                  Published {new Date(draft.published_at).toLocaleDateString()}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{data.location.name}</p>
          </div>

          <div className="flex items-center gap-2">
            <Select value={selectedProfileId} onValueChange={selectProfile}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Select profile" />
              </SelectTrigger>
              <SelectContent>
                {data.profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.profile_name}
                  </SelectItem>
                ))}
                <SelectItem value="new">Create new profile</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={saveState === "dirty" ? "default" : "outline"}
              onClick={requestSave}
              disabled={isPending}
              className="gap-1.5"
            >
              {saveState === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saveState === "dirty" ? (
                <Save className="h-4 w-4" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Save" : "Saved"}
            </Button>

            <Button
              onClick={() => setPublishOpen(true)}
              disabled={isPending || !isExistingProfile || isDirty}
              className="gap-1.5"
              title={isDirty ? "Save your changes before publishing" : undefined}
            >
              <Send className="h-4 w-4" />
              Publish
            </Button>
          </div>
        </div>

        {isDirty ? (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Unsaved changes — save before publishing so the live kiosk gets the latest version.
          </div>
        ) : null}
      </div>

      {draft.is_active ? (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Your kiosk is live</AlertTitle>
          <AlertDescription>Published changes appear on connected kiosks within 3 minutes.</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="design" className="gap-6">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="behavior">Behavior</TabsTrigger>
          <TabsTrigger value="stations">Stations</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="design" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Name and orientation for {data.location.name}.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Profile name</Label>
                <Input value={draft.profile_name} onChange={(event) => updateDraft({ profile_name: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Orientation</Label>
                <Select value={draft.orientation} onValueChange={(value) => updateDraft({ orientation: value as KioskProfile["orientation"] })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vertical">Vertical</SelectItem>
                    <SelectItem value="horizontal">Horizontal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Template</CardTitle>
              <CardDescription>Layout the kiosk uses for browsing and ordering.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {templates.map((template) => {
                const selected = draft.template_id === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => updateDraft({ template_id: template.id })}
                    className={cn(
                      "group rounded-lg border p-2.5 text-left transition-colors",
                      selected ? "border-primary ring-1 ring-primary" : "hover:border-foreground/20",
                    )}
                  >
                    <div
                      className="mb-2.5 h-24 overflow-hidden rounded-md"
                      style={{ background: `linear-gradient(135deg, ${draft.primary_color} 0 38%, ${draft.background_color} 38% 100%)` }}
                    >
                      <div className="grid h-full grid-cols-3 gap-1 p-2.5">
                        <div className="col-span-1 rounded-sm bg-white/75" />
                        <div className="col-span-2 space-y-1">
                          <div className="h-2.5 rounded-sm bg-black/20" />
                          <div className="grid grid-cols-2 gap-1">
                            <div className="h-10 rounded-sm bg-black/10" />
                            <div className="h-10 rounded-sm bg-black/10" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{template.name}</p>
                        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{template.description}</p>
                      </div>
                      {selected ? (
                        <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-2.5 w-2.5" />
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Colors</CardTitle>
              <CardDescription>Brand colors applied across the kiosk. Contrast is checked automatically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <ColorField label="Primary" value={draft.primary_color} onChange={(value) => updateDraft({ primary_color: value })} />
                <ColorField label="Secondary" value={draft.secondary_color || "#E5E7EB"} onChange={(value) => updateDraft({ secondary_color: value })} />
                <ColorField label="Accent" value={draft.accent_color || "#16A34A"} onChange={(value) => updateDraft({ accent_color: value })} />
                <ColorField label="Background" value={draft.background_color} onChange={(value) => updateDraft({ background_color: value })} />
                <ColorField label="Text" value={draft.text_color} onChange={(value) => updateDraft({ text_color: value })} />
                <ColorField label="Header text" value={draft.header_text_color || "#FFFFFF"} onChange={(value) => updateDraft({ header_text_color: value })} />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className={cn("flex items-center justify-between rounded-md border px-3 py-2 text-sm", contrastTone(textContrast))}>
                  <span className="font-medium">Body contrast</span>
                  <span className="font-mono tabular-nums">{formatRatio(textContrast)}</span>
                </div>
                <div className={cn("flex items-center justify-between rounded-md border px-3 py-2 text-sm", contrastTone(headerContrast))}>
                  <span className="font-medium">Header contrast</span>
                  <span className="font-mono tabular-nums">{formatRatio(headerContrast)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Logo</CardTitle>
              <CardDescription>Shown in the kiosk header and as the idle-screen fallback.</CardDescription>
            </CardHeader>
            <CardContent>
              <AssetUpload
                label="Logo"
                helper="SVG or PNG, up to 2MB"
                accept="image/svg+xml,image/png"
                disabled={isPending}
                value={draft.logo_url}
                onClear={() => updateDraft({ logo_url: null })}
                onUpload={uploadLogo}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Idle screen</CardTitle>
              <CardDescription>
                Shown when no one is ordering. Vertical and horizontal kiosks need separate images for their screen
                shape — video, when set, replaces the image carousel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <KioskGallerySlot
                  title="Images — Vertical"
                  helper="Full-bleed portrait idle screen"
                  aspectRatio={9 / 16}
                  aspectLabel="9:16"
                  images={draft.idle_images_vertical}
                  disabled={isPending}
                  uploading={uploadingAsset === "idle_image_vertical"}
                  onAdd={(file) => uploadGalleryImage(file, "idle_image_vertical", "idle_images_vertical")}
                  onRemove={(url) => updateDraft({ idle_images_vertical: draft.idle_images_vertical.filter((item) => item !== url) })}
                />
                <KioskGallerySlot
                  title="Images — Horizontal"
                  helper="Full-bleed landscape idle screen"
                  aspectRatio={16 / 9}
                  aspectLabel="16:9"
                  images={draft.idle_images_horizontal}
                  disabled={isPending}
                  uploading={uploadingAsset === "idle_image_horizontal"}
                  onAdd={(file) => uploadGalleryImage(file, "idle_image_horizontal", "idle_images_horizontal")}
                  onRemove={(url) => updateDraft({ idle_images_horizontal: draft.idle_images_horizontal.filter((item) => item !== url) })}
                />
              </div>

              <Separator />

              <div className="grid gap-6 lg:grid-cols-2">
                <KioskVideoSlot
                  title="Video — Vertical"
                  helper="MP4, up to 30MB"
                  value={draft.idle_video_vertical}
                  disabled={isPending}
                  uploading={uploadingAsset === "idle_video_vertical"}
                  onUpload={(file) => uploadIdleVideo(file, "vertical")}
                  onClear={() => updateDraft({ idle_video_vertical: null })}
                />
                <KioskVideoSlot
                  title="Video — Horizontal"
                  helper="MP4, up to 30MB"
                  value={draft.idle_video_horizontal}
                  disabled={isPending}
                  uploading={uploadingAsset === "idle_video_horizontal"}
                  onUpload={(file) => uploadIdleVideo(file, "horizontal")}
                  onClear={() => updateDraft({ idle_video_horizontal: null })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>In-order banner</CardTitle>
              <CardDescription>
                Shown inside the menu while browsing (Templates B and C) — a separate slot from the idle screen, framed
                and cropped for its own placement. Image only, no video.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <KioskGallerySlot
                title="Images — Vertical"
                helper="Wide banner above the menu grid"
                aspectRatio={21 / 9}
                aspectLabel="21:9"
                images={draft.order_banner_images_vertical}
                disabled={isPending}
                uploading={uploadingAsset === "order_banner_image_vertical"}
                onAdd={(file) => uploadGalleryImage(file, "order_banner_image_vertical", "order_banner_images_vertical")}
                onRemove={(url) =>
                  updateDraft({ order_banner_images_vertical: draft.order_banner_images_vertical.filter((item) => item !== url) })
                }
              />
              <KioskGallerySlot
                title="Images — Horizontal"
                helper="Tall sidebar next to the menu grid"
                aspectRatio={3 / 4}
                aspectLabel="3:4"
                images={draft.order_banner_images_horizontal}
                disabled={isPending}
                uploading={uploadingAsset === "order_banner_image_horizontal"}
                onAdd={(file) => uploadGalleryImage(file, "order_banner_image_horizontal", "order_banner_images_horizontal")}
                onRemove={(url) =>
                  updateDraft({ order_banner_images_horizontal: draft.order_banner_images_horizontal.filter((item) => item !== url) })
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="behavior" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Ordering flow</CardTitle>
              <CardDescription>Welcome message, pickup numbers, and timing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Welcome message</Label>
                  <Textarea
                    value={draft.welcome_message || ""}
                    onChange={(event) => updateDraft({ welcome_message: event.target.value })}
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Pickup number prefix</Label>
                  <Input value={draft.pickup_number_prefix || ""} onChange={(event) => updateDraft({ pickup_number_prefix: event.target.value })} />
                </div>
                <div />
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Idle timeout (seconds)</Label>
                  <Input
                    type="number"
                    min={15}
                    max={600}
                    value={draft.idle_timeout_seconds}
                    onChange={(event) => updateDraft({ idle_timeout_seconds: Number(event.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Cart reset (seconds)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={300}
                    value={draft.cart_reset_timeout_seconds}
                    onChange={(event) => updateDraft({ cart_reset_timeout_seconds: Number(event.target.value) })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Checkout</CardTitle>
              <CardDescription>Tipping, receipts, and menu metadata shown to customers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tip presets (%)</Label>
                <Input
                  value={draft.tip_presets.join(", ")}
                  onChange={(event) =>
                    updateDraft({
                      tip_presets: event.target.value
                        .split(",")
                        .map((item) => Number.parseInt(item.trim(), 10))
                        .filter((item) => Number.isFinite(item)),
                    })
                  }
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <ToggleRow label="Tip screen" checked={draft.tip_screen_enabled} onCheckedChange={(value) => updateDraft({ tip_screen_enabled: value })} />
                <ToggleRow label="Loyalty enrollment" checked={draft.loyalty_enrollment_enabled} onCheckedChange={(value) => updateDraft({ loyalty_enrollment_enabled: value })} />
                <ToggleRow label="Auto-print receipt" checked={draft.auto_print_receipt} onCheckedChange={(value) => updateDraft({ auto_print_receipt: value })} />
                <ToggleRow label="Email receipt prompt" checked={draft.receipt_email_prompt} onCheckedChange={(value) => updateDraft({ receipt_email_prompt: value })} />
                <ToggleRow label="SMS receipt prompt" checked={draft.receipt_sms_prompt} onCheckedChange={(value) => updateDraft({ receipt_sms_prompt: value })} />
                <ToggleRow label="Show calories" checked={draft.show_calorie_info} onCheckedChange={(value) => updateDraft({ show_calorie_info: value })} />
                <ToggleRow label="Show allergens" checked={draft.show_allergens} onCheckedChange={(value) => updateDraft({ show_allergens: value })} />
                <ToggleRow
                  label="Active kill-switch"
                  description="Turns the kiosk off without unpublishing it"
                  checked={draft.is_active}
                  onCheckedChange={(value) => updateDraft({ is_active: value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment terminal</CardTitle>
              <CardDescription>Terminal this profile charges through.</CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={draft.payment_terminal_id || NONE_VALUE}
                onValueChange={(value) => updateDraft({ payment_terminal_id: value === NONE_VALUE ? null : value })}
              >
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>No terminal</SelectItem>
                  {data.paymentTerminals.map((terminal) => (
                    <SelectItem key={terminal.id} value={terminal.id}>
                      {terminal.terminal_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stations</CardTitle>
              <CardDescription>Physical kiosks at this location and which profile they run.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.stations.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No kiosk stations are registered for this location yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.stations.map((station) => (
                    <div
                      key={station.id}
                      className="flex flex-col gap-3 rounded-md border px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{station.station_name}</p>
                          <span className={cn("h-1.5 w-1.5 rounded-full", station.is_online ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                          <span className="text-xs text-muted-foreground">{station.is_online ? "Online" : "Offline"}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{station.station_code || "No station code"}</p>
                      </div>
                      <Select value={station.kiosk_profile_id || NONE_VALUE} onValueChange={(value) => updateStation(station.id, value)}>
                        <SelectTrigger className="w-full sm:w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>No profile</SelectItem>
                          {data.profiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.profile_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Clone profile</CardTitle>
              <CardDescription>Duplicate this profile's design and settings under a new name.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={cloneName}
                  onChange={(event) => setCloneName(event.target.value)}
                  placeholder={`${draft.profile_name} copy`}
                  className="sm:max-w-sm"
                />
                <Button variant="outline" onClick={cloneDraft} disabled={isPending || !isExistingProfile} className="gap-1.5">
                  <Copy className="h-4 w-4" />
                  Clone
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Admin PIN</CardTitle>
              <CardDescription>Required to exit lock-task mode on the kiosk device.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder={draft.admin_pin_hash ? "PIN is set" : "4-8 digit PIN"}
                  type="password"
                  className="sm:max-w-xs"
                />
                <Button onClick={savePin} disabled={isPending || !isExistingProfile || pin.length < 4} className="gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  Set PIN
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="space-y-4 border-t pt-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Preview</h2>
          <p className="text-sm text-muted-foreground">
            A live preview of what customers see on the kiosk, built from this profile's real menu and settings.
          </p>
        </div>
        <KioskPreview profile={draft} />
      </div>

      <AlertDialog open={contrastOpen} onOpenChange={setContrastOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contrast warning</AlertDialogTitle>
            <AlertDialogDescription>
              One or more text combinations are below WCAG AA 4.5:1. The current minimum is {formatRatio(minimumContrast)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingSave(true);
                setContrastOpen(false);
                saveDraft();
              }}
            >
              Save with warning
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish kiosk profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This sets the profile live for {data.location.name}. Connected kiosks assigned to this profile should
              pick up the published settings within 3 minutes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border px-3.5 py-3 text-sm">
            <p className="font-medium">{draft.profile_name}</p>
            {!draft.logo_url ? (
              <p className="mt-1.5 text-amber-700 dark:text-amber-400">No logo is uploaded; the kiosk will show the placeholder brand mark.</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={publishDraft}>Publish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
