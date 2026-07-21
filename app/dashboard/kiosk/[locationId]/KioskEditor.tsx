"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  Circle,
  Copy,
  FileVideo,
  ImageIcon,
  LinkIcon,
  Loader2,
  Monitor,
  PanelTop,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  assignProfileToStation,
  cloneKioskProfile,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const NONE_VALUE = "__none__";

const templates: Array<{ id: KioskTemplateId; name: string; description: string }> = [
  { id: "template_a", name: "Template A", description: "Menu-first grid with large hero header." },
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
    hero_image_url: null,
    attract_video_url: null,
    attract_image_urls: [],
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
    hero_image_url: profile.hero_image_url,
    attract_video_url: profile.attract_video_url,
    attract_image_urls: profile.attract_image_urls,
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
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-12 shrink-0 p-1"
        />
        <Input value={value} onChange={(event) => onChange(event.target.value)} className="font-mono" />
      </div>
    </div>
  );
}

function contrastTone(value: number) {
  if (value < 3) return "border-destructive/40 bg-destructive/5 text-destructive";
  if (value < 4.5) return "border-amber-300 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function AssetUpload({
  label,
  helper,
  accept,
  onUpload,
  disabled,
  value,
  onClear,
  icon,
  previewKind = "image",
}: {
  label: string;
  helper: string;
  accept: string;
  onUpload: (file: File) => void;
  disabled: boolean;
  value?: string | null;
  onClear?: () => void;
  icon: ReactNode;
  previewKind?: "image" | "video";
}) {
  return (
    <div className="rounded-md border bg-background p-3 shadow-sm transition-colors hover:border-muted-foreground/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          </div>
        </div>
        {value ? (
          <Badge variant="outline" className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">
            Uploaded
          </Badge>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button variant="outline" size="sm" className="relative overflow-hidden" disabled={disabled}>
          <Upload className="mr-2 h-4 w-4" />
          Upload
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
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {value && previewKind === "image" ? (
        <div className="mt-3 overflow-hidden rounded-md border bg-muted/30">
          <div className="flex h-36 items-center justify-center bg-[linear-gradient(45deg,#f3f4f6_25%,transparent_25%),linear-gradient(-45deg,#f3f4f6_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f3f4f6_75%),linear-gradient(-45deg,transparent_75%,#f3f4f6_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0px]">
            <img src={value} alt={`${label} preview`} className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex min-w-0 items-center gap-2 border-t bg-background px-2.5 py-2 text-xs text-muted-foreground">
            <LinkIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{value}</span>
          </div>
        </div>
      ) : null}

      {value && previewKind === "video" ? (
        <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
          <FileVideo className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{value}</span>
        </div>
      ) : null}
    </div>
  );
}

export function KioskEditor({ initialData }: { initialData: KioskEditorData }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
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

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: "kiosk-preview:update", profile: draft }, window.location.origin);
  }, [draft]);

  function updateDraft(updates: Partial<KioskProfile>) {
    setDraft((current) => ({ ...current, ...updates }));
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
  }

  function selectProfile(profileId: string) {
    if (profileId === "new") {
      const next = defaultProfile(data.location.id);
      setSelectedProfileId(next.id);
      setDraft(next);
      return;
    }
    const profile = data.profiles.find((item) => item.id === profileId);
    if (profile) {
      setSelectedProfileId(profile.id);
      setDraft(profile);
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

  function uploadAsset(file: File, assetType: "logo" | "hero" | "attract_image" | "attract_video") {
    const clientLimits = {
      logo: { max: 2 * 1024 * 1024, label: "Logo must be 2MB or smaller." },
      hero: { max: 5 * 1024 * 1024, label: "Hero image must be 5MB or smaller." },
      attract_image: { max: 5 * 1024 * 1024, label: "Attract image must be 5MB or smaller." },
      attract_video: { max: 30 * 1024 * 1024, label: "Attract video must be 30MB or smaller." },
    }[assetType];
    if (file.size > clientLimits.max) {
      toast.error(clientLimits.label);
      return;
    }
    if (assetType === "attract_image" && draft.attract_image_urls.length >= 5) {
      toast.error("You can upload up to 5 attract images.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadKioskAsset(formData, { locationId: data.location.id, assetType });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (assetType === "logo") updateDraft({ logo_url: result.data.url });
      if (assetType === "hero") updateDraft({ hero_image_url: result.data.url });
      if (assetType === "attract_video") updateDraft({ attract_video_url: result.data.url });
      if (assetType === "attract_image") updateDraft({ attract_image_urls: [...draft.attract_image_urls, result.data.url] });
      toast.success("Asset uploaded");
    });
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-10">
      <div className="rounded-md border bg-background p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Kiosk</h1>
              <Badge variant={draft.is_active ? "default" : "secondary"}>{draft.is_active ? "Live" : "Draft"}</Badge>
              {draft.published_at ? (
                <Badge variant="outline">Published {new Date(draft.published_at).toLocaleDateString()}</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{data.location.name}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={selectedProfileId} onValueChange={selectProfile}>
              <SelectTrigger className="w-full sm:w-64">
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
            <div className="flex gap-2">
              <Button variant="outline" onClick={requestSave} disabled={isPending} className="flex-1 sm:flex-none">
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
              <Button onClick={() => setPublishOpen(true)} disabled={isPending || !isExistingProfile} className="flex-1 sm:flex-none">
                <Send className="mr-2 h-4 w-4" />
                Publish
              </Button>
            </div>
          </div>
        </div>
      </div>

      {draft.is_active ? (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Your kiosk is live</AlertTitle>
          <AlertDescription>Published changes appear on connected kiosks within 5 seconds.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_560px]">
        <Tabs defaultValue="design" className="space-y-4">
          <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-md bg-muted/70 p-1">
            <TabsTrigger value="design">Design</TabsTrigger>
            <TabsTrigger value="assets">Assets</TabsTrigger>
            <TabsTrigger value="behavior">Behavior</TabsTrigger>
            <TabsTrigger value="stations">Stations</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="design" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>{draft.profile_name}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Profile name</Label>
                    <Input value={draft.profile_name} onChange={(event) => updateDraft({ profile_name: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Orientation</Label>
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
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => updateDraft({ template_id: template.id })}
                      className={cn(
                        "rounded-md border bg-background p-3 text-left shadow-sm transition hover:border-primary/60 hover:shadow",
                        draft.template_id === template.id && "border-primary bg-primary/5 shadow",
                      )}
                    >
                      <div
                        className="mb-3 h-28 overflow-hidden rounded-md border"
                        style={{
                          background: `linear-gradient(135deg, ${draft.primary_color} 0 38%, ${draft.background_color} 38% 100%)`,
                        }}
                      >
                        <div className="grid h-full grid-cols-3 gap-1 p-3">
                          <div className="col-span-1 rounded-sm bg-white/75 shadow-sm" />
                          <div className="col-span-2 space-y-1">
                            <div className="h-3 rounded-sm bg-black/20" />
                            <div className="grid grid-cols-2 gap-1">
                              <div className="h-12 rounded-sm bg-black/10" />
                              <div className="h-12 rounded-sm bg-black/10" />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{template.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                        </div>
                        {draft.template_id === template.id ? <Check className="h-4 w-4 text-primary" /> : null}
                      </div>
                    </button>
                  ))}
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-3">
                  <ColorField label="Primary" value={draft.primary_color} onChange={(value) => updateDraft({ primary_color: value })} />
                  <ColorField label="Secondary" value={draft.secondary_color || "#E5E7EB"} onChange={(value) => updateDraft({ secondary_color: value })} />
                  <ColorField label="Accent" value={draft.accent_color || "#16A34A"} onChange={(value) => updateDraft({ accent_color: value })} />
                  <ColorField label="Background" value={draft.background_color} onChange={(value) => updateDraft({ background_color: value })} />
                  <ColorField label="Text" value={draft.text_color} onChange={(value) => updateDraft({ text_color: value })} />
                  <ColorField
                    label="Header text"
                    value={draft.header_text_color || "#FFFFFF"}
                    onChange={(value) => updateDraft({ header_text_color: value })}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className={cn("rounded-md border p-3", contrastTone(textContrast))}>
                    <div className="flex items-center gap-2">
                      <Circle className="h-2.5 w-2.5 fill-current" />
                      <p className="text-sm font-medium">Body contrast</p>
                    </div>
                    <p className="mt-1 text-sm opacity-80">{formatRatio(textContrast)} against background</p>
                  </div>
                  <div className={cn("rounded-md border p-3", contrastTone(headerContrast))}>
                    <div className="flex items-center gap-2">
                      <Circle className="h-2.5 w-2.5 fill-current" />
                      <p className="text-sm font-medium">Header contrast</p>
                    </div>
                    <p className="mt-1 text-sm opacity-80">{formatRatio(headerContrast)} against primary</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assets" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Brand Assets</CardTitle>
                <CardDescription>Upload kiosk media and save the profile to publish the URLs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <AssetUpload
                    label="Logo"
                    helper="SVG or PNG, up to 2MB"
                    accept="image/svg+xml,image/png"
                    disabled={isPending}
                    value={draft.logo_url}
                    icon={<ImageIcon className="h-5 w-5" />}
                    onClear={() => updateDraft({ logo_url: null })}
                    onUpload={(file) => uploadAsset(file, "logo")}
                  />
                  <AssetUpload
                    label="Hero image"
                    helper="PNG or JPG, up to 5MB"
                    accept="image/png,image/jpeg"
                    disabled={isPending}
                    value={draft.hero_image_url}
                    icon={<ImageIcon className="h-5 w-5" />}
                    onClear={() => updateDraft({ hero_image_url: null })}
                    onUpload={(file) => uploadAsset(file, "hero")}
                  />
                  <AssetUpload
                    label="Attract images"
                    helper={`${draft.attract_image_urls.length}/5 uploaded`}
                    accept="image/png,image/jpeg"
                    disabled={isPending || draft.attract_image_urls.length >= 5}
                    value={draft.attract_image_urls[0] ?? null}
                    icon={<ImageIcon className="h-5 w-5" />}
                    onUpload={(file) => uploadAsset(file, "attract_image")}
                  />
                  <AssetUpload
                    label="Attract video"
                    helper="MP4, up to 30MB"
                    accept="video/mp4"
                    disabled={isPending}
                    value={draft.attract_video_url}
                    icon={<FileVideo className="h-5 w-5" />}
                    previewKind="video"
                    onClear={() => updateDraft({ attract_video_url: null })}
                    onUpload={(file) => uploadAsset(file, "attract_video")}
                  />
                </div>

                {draft.attract_image_urls.length > 0 ? (
                  <div className="space-y-2">
                    <Label>Attract image rotation</Label>
                    <div className="grid gap-2">
                      {draft.attract_image_urls.map((url, index) => (
                        <div key={url} className="flex min-w-0 items-center gap-3 rounded-md border bg-muted/30 p-2">
                          <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-sm border bg-background">
                            <img src={url} alt={`Attract image ${index + 1}`} className="h-full w-full object-cover" />
                            <span className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-sm bg-background/90 px-1 text-xs font-medium">
                              {index + 1}
                            </span>
                          </div>
                          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{url}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              updateDraft({
                                attract_image_urls: draft.attract_image_urls.filter((item) => item !== url),
                              })
                            }
                            disabled={isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <LinkIcon className="h-4 w-4 text-muted-foreground" />
                    Direct URLs
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input placeholder="Logo URL" value={draft.logo_url || ""} onChange={(event) => updateDraft({ logo_url: event.target.value || null })} />
                    <Input placeholder="Hero image URL" value={draft.hero_image_url || ""} onChange={(event) => updateDraft({ hero_image_url: event.target.value || null })} />
                    <Input
                      className="md:col-span-2"
                      placeholder="Attract video URL"
                      value={draft.attract_video_url || ""}
                      onChange={(event) => updateDraft({ attract_video_url: event.target.value || null })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="behavior" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Behavior Settings</CardTitle>
                <CardDescription>Customer flow, receipt prompts, tips, loyalty, and menu metadata.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Welcome message</Label>
                    <Textarea value={draft.welcome_message || ""} onChange={(event) => updateDraft({ welcome_message: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Pickup prefix</Label>
                    <Input value={draft.pickup_number_prefix || ""} onChange={(event) => updateDraft({ pickup_number_prefix: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Idle timeout seconds</Label>
                    <Input
                      type="number"
                      min={15}
                      max={600}
                      value={draft.idle_timeout_seconds}
                      onChange={(event) => updateDraft({ idle_timeout_seconds: Number(event.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cart reset seconds</Label>
                    <Input
                      type="number"
                      min={10}
                      max={300}
                      value={draft.cart_reset_timeout_seconds}
                      onChange={(event) => updateDraft({ cart_reset_timeout_seconds: Number(event.target.value) })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Tip presets</Label>
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
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <ToggleRow label="Auto-print receipt" checked={draft.auto_print_receipt} onCheckedChange={(value) => updateDraft({ auto_print_receipt: value })} />
                  <ToggleRow label="Email receipt prompt" checked={draft.receipt_email_prompt} onCheckedChange={(value) => updateDraft({ receipt_email_prompt: value })} />
                  <ToggleRow label="SMS receipt prompt" checked={draft.receipt_sms_prompt} onCheckedChange={(value) => updateDraft({ receipt_sms_prompt: value })} />
                  <ToggleRow label="Tip screen" checked={draft.tip_screen_enabled} onCheckedChange={(value) => updateDraft({ tip_screen_enabled: value })} />
                  <ToggleRow label="Loyalty enrollment" checked={draft.loyalty_enrollment_enabled} onCheckedChange={(value) => updateDraft({ loyalty_enrollment_enabled: value })} />
                  <ToggleRow label="Show calories" checked={draft.show_calorie_info} onCheckedChange={(value) => updateDraft({ show_calorie_info: value })} />
                  <ToggleRow label="Show allergens" checked={draft.show_allergens} onCheckedChange={(value) => updateDraft({ show_allergens: value })} />
                  <ToggleRow label="Active kill-switch" checked={draft.is_active} onCheckedChange={(value) => updateDraft({ is_active: value })} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stations" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Payment And Stations</CardTitle>
                <CardDescription>Pair the profile with a payment terminal and bind physical kiosk stations.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Payment terminal</Label>
                  <Select
                    value={draft.payment_terminal_id || NONE_VALUE}
                    onValueChange={(value) => updateDraft({ payment_terminal_id: value === NONE_VALUE ? null : value })}
                  >
                    <SelectTrigger className="w-full">
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
                </div>

                <Separator />

                {data.stations.length === 0 ? (
                  <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                    No kiosk stations are registered for this location yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.stations.map((station) => (
                      <div key={station.id} className="flex flex-col gap-3 rounded-md border bg-background p-3 shadow-sm md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{station.station_name}</p>
                            <Badge variant="outline" className={station.is_online ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>
                              {station.is_online ? "Online" : "Offline"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{station.station_code || "No station code"}</p>
                        </div>
                        <Select value={station.kiosk_profile_id || NONE_VALUE} onValueChange={(value) => updateStation(station.id, value)}>
                          <SelectTrigger className="w-full md:w-64">
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

          <TabsContent value="security" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Profile Management</CardTitle>
                <CardDescription>Clone profiles and set the admin PIN used to exit lock-task mode.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <Input value={cloneName} onChange={(event) => setCloneName(event.target.value)} placeholder={`${draft.profile_name} copy`} />
                  <Button variant="outline" onClick={cloneDraft} disabled={isPending || !isExistingProfile}>
                    <Copy className="mr-2 h-4 w-4" />
                    Clone
                  </Button>
                </div>
                <Separator />
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <Input
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder={draft.admin_pin_hash ? "PIN is set" : "4-8 digit PIN"}
                    type="password"
                  />
                  <Button onClick={savePin} disabled={isPending || !isExistingProfile || pin.length < 4}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Set PIN
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="overflow-hidden shadow-sm 2xl:sticky 2xl:top-4 2xl:self-start">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Live Preview</CardTitle>
                <CardDescription>{draft.orientation === "vertical" ? "Vertical kiosk" : "Horizontal kiosk"}</CardDescription>
              </div>
              {draft.orientation === "vertical" ? <Smartphone className="h-5 w-5 text-muted-foreground" /> : <Monitor className="h-5 w-5 text-muted-foreground" />}
            </div>
          </CardHeader>
          <CardContent className="bg-muted/30 p-4">
            <div
              className={cn(
                "mx-auto overflow-hidden rounded-[22px] border-8 border-zinc-900 bg-background shadow-xl",
                draft.orientation === "vertical"
                  ? "h-[720px] max-w-[390px]"
                  : "aspect-[16/10] w-full max-w-[720px]",
              )}
            >
              <iframe
                ref={iframeRef}
                title="Kiosk preview"
                src="/kiosk-preview"
                className="h-full w-full bg-white"
                onLoad={() =>
                  iframeRef.current?.contentWindow?.postMessage({ type: "kiosk-preview:update", profile: draft }, window.location.origin)
                }
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className={cn("rounded-md border px-2.5 py-2", contrastTone(textContrast))}>Body {formatRatio(textContrast)}</div>
              <div className={cn("rounded-md border px-2.5 py-2", contrastTone(headerContrast))}>Header {formatRatio(headerContrast)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={contrastOpen} onOpenChange={setContrastOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contrast Warning</AlertDialogTitle>
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
              This sets the profile live for {data.location.name}. Connected kiosks assigned to this profile should pick up the published settings within 5 seconds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2">
              <PanelTop className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{draft.profile_name}</span>
            </div>
            {!draft.logo_url ? <p className="mt-2 text-amber-600">No logo is uploaded; kiosk will show the placeholder brand mark.</p> : null}
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
