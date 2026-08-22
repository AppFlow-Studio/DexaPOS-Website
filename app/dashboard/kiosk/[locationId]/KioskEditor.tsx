"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  X,
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
  unpublishKioskProfile,
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
import { PageHeader, PageShell, Panel } from "@/components/dashboard/shell";
import { CROPPABLE_MIME_TYPES, ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  return "border-border/60 bg-muted/40 text-foreground";
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

function KioskSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Panel padded>
      <div className="mb-6 space-y-1">
        <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
          {title}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className={className}>{children}</div>
    </Panel>
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
      <div className="relative">
        <label className="absolute left-1.5 top-1/2 z-10 h-7 w-7 -translate-y-1/2 cursor-pointer overflow-hidden rounded-full border border-border/60">
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="absolute -inset-2 cursor-pointer"
            aria-label={`${label} color picker`}
          />
        </label>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 pl-11 font-mono text-sm uppercase"
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
    <label className="flex items-start justify-between gap-4 rounded-2xl border-0 bg-muted/60 px-4 py-3.5 transition-colors hover:bg-muted">
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
  hideIconOnMobile = false,
}: {
  icon?: React.ReactNode;
  title: string;
  helper: string;
  badge?: React.ReactNode;
  hideIconOnMobile?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? (
          <div className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
            hideIconOnMobile && "hidden md:flex",
          )}>
            {icon}
          </div>
        ) : null}
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
          <div className="h-12 w-12 overflow-hidden rounded-xl border border-border/60 bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-size-[10px_10px]">
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
  const tileWidth =
    aspectRatio >= 1
      ? "w-full sm:w-[calc((100%-0.5rem)/2)]"
      : "w-[calc((100%-0.5rem)/2)] sm:w-[calc((100%-1.5rem)/4)]";

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
        hideIconOnMobile
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
            <Button type="button" variant="outline" size="sm" className="hidden md:inline-flex" onClick={pickFile} disabled={disabled || uploading || atLimit}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload
            </Button>
          </div>
        }
      />

      <div className="flex justify-center md:hidden">
        <Button type="button" variant="outline" size="sm" onClick={pickFile} disabled={disabled || uploading || atLimit}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload
        </Button>
      </div>

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

      {images.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
        {images.map((url, index) => (
          <div
            key={url}
            className={cn(
              "group relative overflow-hidden rounded-xl border border-border/60 bg-muted/40",
              tileWidth,
            )}
            style={{ aspectRatio }}
          >
            <img src={url} alt={`${title} ${index + 1}`} className="h-full w-full object-cover" />
            <span className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-sm bg-background/90 px-1 text-[10px] font-medium tabular-nums">
              {index + 1}
            </span>
            <button
              type="button"
              onClick={() => onRemove(url)}
              disabled={disabled}
              aria-label={`Remove image ${index + 1}`}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        </div>
      ) : null}

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

/**
 * Single idle-only video slot (no gallery — one video per orientation).
 * Currently unused — video upload is disabled, see the comment in the Assets
 * tab's Idle screen card. Kept here ready to reconnect once uploadKioskAsset
 * moves off the Server Action body path.
 */
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
  const [cloneName, setCloneName] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [contrastOpen, setContrastOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [uploadingAsset, setUploadingAsset] = useState<KioskAssetType | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [activeSection, setActiveSection] = useState("design");
  const sectionRailRef = useRef<HTMLDivElement>(null);
  const sectionTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const rail = sectionRailRef.current;
    const trigger = sectionTriggerRefs.current[activeSection];
    if (!rail || !trigger) return;

    const railRect = rail.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const centeredOffset =
      triggerRect.left - railRect.left - (railRect.width - triggerRect.width) / 2;

    rail.scrollTo({
      left: Math.max(0, rail.scrollLeft + centeredOffset),
      behavior: "smooth",
    });
  }, [activeSection]);

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

  function unpublishDraft() {
    if (!isExistingProfile) return;
    startTransition(async () => {
      const result = await unpublishKioskProfile(draft.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Kiosk profile unpublished");
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
      toast.success("Asset uploaded", {
        icon: <Check className="h-5 w-5 text-foreground" />,
        style: {
          background: "#e5e7eb",
          borderColor: "#d1d5db",
          color: "#111827",
          "--success-bg": "#e5e7eb",
          "--success-border": "#d1d5db",
          "--success-text": "#111827",
        } as CSSProperties,
      });
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

  // Currently unused — video upload is disabled, see the comment in the
  // Assets tab's Idle screen card.
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
    <PageShell width="narrow">
      <PageHeader
        title="Kiosk"
        subtitle={data.location.name}
        backHref="/dashboard/kiosk"
        backLabel="Back to Kiosks"
        stackActionsBelowIndicatorOnMobile
        indicator={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                draft.is_active
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-muted/60 text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  draft.is_active ? "bg-emerald-500" : "bg-muted-foreground/60",
                )}
              />
              {draft.is_active ? "Live" : "Draft"}
            </span>
            {draft.published_at ? (
              <span className="text-xs text-muted-foreground">
                Published {new Date(draft.published_at).toLocaleDateString()}
              </span>
            ) : null}
          </div>
        }
        actions={
          <>
            <Select value={selectedProfileId} onValueChange={selectProfile}>
              <SelectTrigger className="h-9 w-full shadow-sm sm:w-56">
                <SelectValue placeholder="Select profile">
                  {draft.profile_name?.trim() || "Untitled profile"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {data.profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.profile_name?.trim() || "Untitled profile"}
                  </SelectItem>
                ))}
                <SelectItem value="new">Create new profile</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={saveState === "dirty" ? "default" : "outline"}
              onClick={requestSave}
              disabled={isPending}
              className="h-9 gap-1.5 px-4 text-[0.8125rem] font-medium shadow-sm"
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

            {draft.is_active ? (
              <Button
                variant="outline"
                onClick={unpublishDraft}
                disabled={isPending || !isExistingProfile}
                className="h-9 gap-1.5 px-4 text-[0.8125rem] font-medium shadow-sm"
              >
                <Send className="h-4 w-4" />
                Unpublish
              </Button>
            ) : (
              <Button
                onClick={() => setPublishOpen(true)}
                disabled={isPending || !isExistingProfile || isDirty}
                className="h-9 gap-1.5 px-4 text-[0.8125rem] font-medium shadow-sm"
                title={isDirty ? "Save your changes before publishing" : undefined}
              >
                <Send className="h-4 w-4" />
                Publish
              </Button>
            )}
          </>
        }
      />

      {isDirty ? (
        <div className="flex items-center gap-2 rounded-2xl border-0 bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Unsaved changes — save before publishing so the live kiosk gets the latest version.
        </div>
      ) : null}

      {draft.is_active ? (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Your kiosk is live</AlertTitle>
          <AlertDescription>Published changes appear on connected kiosks within 3 minutes.</AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={activeSection} onValueChange={setActiveSection} className="space-y-6">
        <div ref={sectionRailRef} className="no-scrollbar w-full min-w-0 overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
            {[
              ["design", "Design"],
              ["assets", "Assets"],
              ["behavior", "Behavior"],
              ["stations", "Stations"],
              ["security", "Security"],
            ].map(([value, label]) => (
              <TabsTrigger
                key={value}
                ref={(node) => {
                  sectionTriggerRefs.current[value] = node;
                }}
                value={value}
                className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="design" className="mt-0 space-y-6">
          <KioskSection
            title="Profile"
            description={<>Name and orientation for {data.location.name}.</>}
            className="grid gap-4 sm:grid-cols-2"
          >
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
          </KioskSection>

          <KioskSection
            title="Template"
            description="Layout the kiosk uses for browsing and ordering."
            className="grid gap-3 sm:grid-cols-3"
          >
              {templates.map((template) => {
                const selected = draft.template_id === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => updateDraft({ template_id: template.id })}
                    className={cn(
                      "group rounded-2xl border-0 bg-muted/60 p-3 text-left transition-colors hover:bg-muted",
                      selected && "bg-[#0C4FD1]/10 ring-1 ring-[#0C4FD1] dark:bg-[#6CA0FF]/10 dark:ring-[#6CA0FF]",
                    )}
                  >
                    <div
                      className="mb-3 h-24 overflow-hidden rounded-xl"
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
                        <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0C4FD1] text-white dark:bg-[#6CA0FF] dark:text-background">
                          <Check className="h-2.5 w-2.5" />
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
          </KioskSection>

          <KioskSection
            title="Colors"
            description="Brand colors applied across the kiosk. Contrast is checked automatically."
            className="space-y-5"
          >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <ColorField label="Primary" value={draft.primary_color} onChange={(value) => updateDraft({ primary_color: value })} />
                <ColorField label="Secondary" value={draft.secondary_color || "#E5E7EB"} onChange={(value) => updateDraft({ secondary_color: value })} />
                <ColorField label="Accent" value={draft.accent_color || "#16A34A"} onChange={(value) => updateDraft({ accent_color: value })} />
                <ColorField label="Background" value={draft.background_color} onChange={(value) => updateDraft({ background_color: value })} />
                <ColorField label="Text" value={draft.text_color} onChange={(value) => updateDraft({ text_color: value })} />
                <ColorField label="Header text" value={draft.header_text_color || "#FFFFFF"} onChange={(value) => updateDraft({ header_text_color: value })} />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className={cn("flex items-center justify-between rounded-2xl border px-4 py-3 text-sm", contrastTone(textContrast))}>
                  <span className="font-medium">Body contrast</span>
                  <span className="font-mono tabular-nums">{formatRatio(textContrast)}</span>
                </div>
                <div className={cn("flex items-center justify-between rounded-2xl border px-4 py-3 text-sm", contrastTone(headerContrast))}>
                  <span className="font-medium">Header contrast</span>
                  <span className="font-mono tabular-nums">{formatRatio(headerContrast)}</span>
                </div>
              </div>
          </KioskSection>
        </TabsContent>

        <TabsContent value="assets" className="mt-0 space-y-6">
          <KioskSection
            title="Logo"
            description="Shown in the kiosk header and as the idle-screen fallback."
          >
              <AssetUpload
                label="Logo"
                helper="SVG or PNG, up to 2MB"
                accept="image/svg+xml,image/png"
                disabled={isPending}
                value={draft.logo_url}
                onClear={() => updateDraft({ logo_url: null })}
                onUpload={uploadLogo}
              />
          </KioskSection>

          <KioskSection
            title="Idle screen"
            description={
              <>
                Shown when no one is ordering. Vertical and horizontal kiosks need separate images for their screen
                shape — video, when set, replaces the image carousel.
              </>
            }
            className="space-y-6"
          >
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

              {/*
                Video upload disabled for now: uploadKioskAsset routes the
                raw file through a Next.js Server Action, which base64-encodes
                it (~1.33x size) and is capped by next.config.ts's
                bodySizeLimit (6mb) — a 30MB video encodes to ~40MB and fails
                outright. Needs a direct client -> Supabase Edge Function
                upload (see lib/cdn/use-merchant-cdn-image-upload.ts for the
                existing pattern) before this can come back.

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
              */}
          </KioskSection>

          <KioskSection
            title="In-order banner"
            description={
              <>
                Shown inside the menu while browsing (Templates B and C) — a separate slot from the idle screen, framed
                and cropped for its own placement. Image only, no video.
              </>
            }
            className="grid gap-6 lg:grid-cols-2"
          >
              <KioskGallerySlot
                title="Images — Vertical"
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
              <KioskGallerySlot
                title="Images — Horizontal"
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
          </KioskSection>
        </TabsContent>

        <TabsContent value="behavior" className="mt-0 space-y-6">
          <KioskSection
            title="Ordering flow"
            description="Welcome message, pickup numbers, and timing."
            className="space-y-5"
          >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Welcome message</Label>
                  <Textarea
                    className="border-0 bg-muted/60 shadow-none focus-visible:ring-1"
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
          </KioskSection>

          <KioskSection
            title="Checkout"
            description="Tipping, receipts, and menu metadata shown to customers."
            className="space-y-5"
          >
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Tip presets (%)</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {draft.tip_presets.map((preset, index) => (
                    <div key={index} className="relative">
                      <Input
                        className="border-0 bg-muted/60 pr-20 shadow-none focus-visible:ring-1"
                        type="number"
                        min={0}
                        max={100}
                        value={preset}
                        onChange={(event) => {
                          const next = [...draft.tip_presets];
                          next[index] = Number(event.target.value);
                          updateDraft({ tip_presets: next });
                        }}
                        aria-label={`Tip preset ${index + 1}`}
                      />
                      <span className="pointer-events-none absolute right-11 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        %
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:bg-background/70 hover:text-destructive"
                        onClick={() =>
                          updateDraft({ tip_presets: draft.tip_presets.filter((_, i) => i !== index) })
                        }
                        aria-label={`Remove tip preset ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 w-full border-dashed bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    onClick={() => updateDraft({ tip_presets: [...draft.tip_presets, 0] })}
                  >
                    <Plus className="h-4 w-4" />
                    Add preset
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <ToggleRow label="Tip screen" checked={draft.tip_screen_enabled} onCheckedChange={(value) => updateDraft({ tip_screen_enabled: value })} />
                <ToggleRow label="Loyalty enrollment" checked={draft.loyalty_enrollment_enabled} onCheckedChange={(value) => updateDraft({ loyalty_enrollment_enabled: value })} />
                <ToggleRow label="Auto-print receipt" checked={draft.auto_print_receipt} onCheckedChange={(value) => updateDraft({ auto_print_receipt: value })} />
              </div>
          </KioskSection>
        </TabsContent>

        <TabsContent value="stations" className="mt-0 space-y-6">
          <KioskSection
            title="Payment terminal"
            description="Terminal this profile charges through."
          >
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
          </KioskSection>

          <KioskSection
            title="Stations"
            description="Physical kiosks at this location and which profile they run."
          >
              {data.stations.length === 0 ? (
                <div className="rounded-2xl border-0 bg-muted/60 p-8 text-center text-sm text-muted-foreground">
                  No kiosk stations are registered for this location yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.stations.map((station) => (
                    <div
                      key={station.id}
                      className="flex flex-col gap-3 rounded-2xl border-0 bg-muted/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
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
          </KioskSection>
        </TabsContent>

        <TabsContent value="security" className="mt-0 space-y-6">
          <KioskSection
            title="Clone profile"
            description="Duplicate this profile's design and settings under a new name."
          >
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
          </KioskSection>
        </TabsContent>
      </Tabs>

      <div className="hidden space-y-4 md:block">
        <div>
          <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
            Preview
          </h2>
          <p className="text-sm text-muted-foreground">
            A live preview of what customers see on the kiosk, built from this profile&apos;s real menu and settings.
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
          <div className="rounded-2xl border-0 bg-muted/60 px-4 py-3.5 text-sm">
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
    </PageShell>
  );
}
