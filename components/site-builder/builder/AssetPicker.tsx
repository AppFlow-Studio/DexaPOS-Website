"use client";

import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  DeleteSiteAsset,
  ListSiteAssets,
  UpdateSiteAssetAlt,
  UploadSiteAsset,
} from "@/app/dashboard/website/actions/assets";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ALLOWED_ASSET_TYPES, MAX_ASSET_BYTES, formatBytes } from "@/lib/site-builder/assets";
import type { SiteAssetSummary } from "@/lib/site-builder/db-types";
import { cn } from "@/lib/utils";

/**
 * The photo control, and the library behind it.
 *
 * Every image field in the editor used to render the words *"Photo uploads
 * arrive with the asset library"*. This is that library.
 *
 * **A picker, not just an upload button.** Owner's own control offers `Select
 * Image` beside the drop zone, which is the tell that a library exists — and it
 * matters more than it looks: a restaurant reuses the same six photographs
 * across a home page, a catering page and an events listing, and re-uploading
 * each time means six copies, six sets of alt text, and six things to change
 * when the dish is replaced.
 *
 * **Alt text is asked for here**, on the asset, because it is a fact about the
 * photograph rather than about where it sits. Owner surfaces no alt text
 * anywhere, which is a genuine accessibility gap in a product that ships an
 * "Accessibility Statement" link in its own footer.
 */
export default function AssetPicker({
  value,
  onChange,
  label,
  clerkOrgId,
}: {
  value: { assetId: string; alt?: string } | undefined;
  onChange: (value: { assetId: string; alt?: string } | undefined) => void;
  label: string;
  clerkOrgId: string;
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<SiteAssetSummary[] | null>(null);
  const chosen = value ? assets?.find((a) => a.id === value.assetId) : undefined;

  // Loaded once the picker is first opened rather than on mount: most sections
  // never touch an image field, and the library is a round trip.
  useEffect(() => {
    if (!open || assets !== null) return;
    let cancelled = false;

    ListSiteAssets(clerkOrgId)
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          toast.error(result.error);
          setAssets([]);
          return;
        }
        setAssets(result.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setAssets([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, assets, clerkOrgId]);

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium">{label}</span>

      {value ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block w-full overflow-hidden rounded-md border bg-muted/30 transition-colors hover:border-foreground/25"
          >
            {chosen ? (
              // eslint-disable-next-line @next/next/no-img-element -- merchant CDN host
              <img
                src={chosen.cdnUrl}
                alt={value.alt ?? chosen.altText ?? ""}
                className="h-28 w-full object-cover"
              />
            ) : (
              <span className="flex h-28 items-center justify-center text-[11px] text-muted-foreground">
                {assets === null ? "Loading…" : "This photo is no longer in your library"}
              </span>
            )}
          </button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 flex-1 text-[11px]"
              onClick={() => setOpen(true)}
            >
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 flex-1 text-[11px]"
              onClick={() => onChange(undefined)}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed text-[11px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
        >
          <ImagePlus className="size-5" />
          Choose a photo
        </button>
      )}

      <AssetLibraryDialog
        open={open}
        onOpenChange={setOpen}
        clerkOrgId={clerkOrgId}
        assets={assets}
        setAssets={setAssets}
        selectedId={value?.assetId}
        onPick={(asset) => {
          onChange({ assetId: asset.id });
          setOpen(false);
        }}
      />
    </div>
  );
}

function AssetLibraryDialog({
  open,
  onOpenChange,
  clerkOrgId,
  assets,
  setAssets,
  selectedId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string;
  assets: SiteAssetSummary[] | null;
  setAssets: (assets: SiteAssetSummary[]) => void;
  selectedId?: string;
  onPick: (asset: SiteAssetSummary) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);

    try {
      // Sequential rather than parallel: each upload is a base64 body through
      // an edge function, and firing six at once is how a merchant on a café
      // wifi connection gets six timeouts instead of six photographs.
      const added: SiteAssetSummary[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const result = await UploadSiteAsset(clerkOrgId, form);
        if (result.error) {
          toast.error(`${file.name}: ${result.error}`);
          continue;
        }
        if (result.data) added.push(result.data);
      }

      if (added.length > 0) {
        setAssets([...added, ...(assets ?? [])]);
        toast.success(added.length === 1 ? "Photo added." : `${added.length} photos added.`);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Your photos</DialogTitle>
          <DialogDescription>
            JPG, PNG, WebP, GIF or AVIF, up to {formatBytes(MAX_ASSET_BYTES)} each.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          <div>
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_ASSET_TYPES.join(",")}
              multiple
              className="hidden"
              onChange={(e) => void upload(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {uploading ? "Uploading…" : "Upload photos"}
            </Button>
          </div>

          {assets === null ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Loading your photos…</p>
          ) : assets.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No photos yet. Upload one to get started.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {assets.map((asset) => (
                <AssetTile
                  key={asset.id}
                  asset={asset}
                  clerkOrgId={clerkOrgId}
                  selected={asset.id === selectedId}
                  onPick={() => onPick(asset)}
                  onAltChange={(altText) =>
                    setAssets(
                      (assets ?? []).map((a) => (a.id === asset.id ? { ...a, altText } : a)),
                    )
                  }
                  onDeleted={() => setAssets((assets ?? []).filter((a) => a.id !== asset.id))}
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssetTile({
  asset,
  clerkOrgId,
  selected,
  onPick,
  onAltChange,
  onDeleted,
}: {
  asset: SiteAssetSummary;
  clerkOrgId: string;
  selected: boolean;
  onPick: () => void;
  onAltChange: (altText: string) => void;
  onDeleted: () => void;
}) {
  const [alt, setAlt] = useState(asset.altText ?? "");

  return (
    <li
      className={cn(
        "overflow-hidden rounded-md border transition-colors",
        selected ? "border-foreground/40 ring-1 ring-foreground/20" : "hover:border-foreground/25",
      )}
    >
      <button type="button" onClick={onPick} className="block w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- merchant CDN host */}
        <img src={asset.cdnUrl} alt={asset.altText ?? ""} className="h-24 w-full object-cover" />
      </button>

      <div className="space-y-1.5 p-2">
        <input
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          onBlur={async () => {
            const next = alt.trim();
            if (next === (asset.altText ?? "")) return;
            const result = await UpdateSiteAssetAlt(clerkOrgId, asset.id, next);
            if (result.error) {
              toast.error(result.error);
              setAlt(asset.altText ?? "");
              return;
            }
            onAltChange(next);
          }}
          placeholder="Describe this photo"
          className="w-full rounded border border-input bg-background px-2 py-1 text-[11px] outline-none focus-visible:border-ring"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{formatBytes(asset.bytes)}</span>
          <button
            type="button"
            aria-label="Remove from your photos"
            className="text-muted-foreground transition-colors hover:text-destructive"
            onClick={async () => {
              const result = await DeleteSiteAsset(clerkOrgId, asset.id);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              onDeleted();
            }}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * The multi-photo control — galleries, and the hero's carousel.
 *
 * **The upload slot counts for you.** Owner labels theirs `Upload a photo 3/5`,
 * putting the limit and the current total into the affordance itself rather
 * than into help text nobody reads. It is a small thing that removes a whole
 * category of "why can't I add another one".
 *
 * Reordering is the same up/down button vocabulary the section gutters use, not
 * drag. A merchant who has moved one section has already learned this control.
 */
export function AssetListPicker({
  value,
  onChange,
  label,
  clerkOrgId,
  maxItems,
}: {
  value: { assetId: string; alt?: string }[];
  onChange: (value: { assetId: string; alt?: string }[]) => void;
  label: string;
  clerkOrgId: string;
  maxItems: number;
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<SiteAssetSummary[] | null>(null);
  const full = value.length >= maxItems;

  useEffect(() => {
    if (!open || assets !== null) return;
    let cancelled = false;

    ListSiteAssets(clerkOrgId)
      .then((result) => {
        if (!cancelled) setAssets(result.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setAssets([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, assets, clerkOrgId]);

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };

  return (
    <div>
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {value.length}/{maxItems}
        </span>
      </span>

      {value.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {value.map((item, index) => {
            const asset = assets?.find((a) => a.id === item.assetId);
            return (
              <li key={`${item.assetId}-${index}`} className="flex items-center gap-2 rounded-md border p-1.5">
                {asset ? (
                  // eslint-disable-next-line @next/next/no-img-element -- merchant CDN host
                  <img
                    src={asset.cdnUrl}
                    alt={asset.altText ?? ""}
                    className="size-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="size-10 shrink-0 rounded bg-muted" />
                )}
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                  {asset?.altText || asset?.originalFilename || "Photo"}
                </span>
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="px-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                  className="px-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                  className="px-1 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        disabled={full}
        onClick={() => setOpen(true)}
        className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed text-[11px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ImagePlus className="size-4" />
        {full ? `That is all ${maxItems}` : `Add a photo ${value.length}/${maxItems}`}
      </button>

      <AssetLibraryDialog
        open={open}
        onOpenChange={setOpen}
        clerkOrgId={clerkOrgId}
        assets={assets}
        setAssets={setAssets}
        onPick={(asset) => {
          if (value.length < maxItems) onChange([...value, { assetId: asset.id }]);
          setOpen(false);
        }}
      />
    </div>
  );
}
