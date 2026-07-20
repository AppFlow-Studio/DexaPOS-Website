"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CdnImageUploadField } from "@/components/ui/cdn-image-upload-field";
import { UpdateMenuItem } from "@/app/dashboard/actions/menu-items";
import { useMerchantCdnImageUpload } from "@/lib/cdn/use-merchant-cdn-image-upload";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { AffectsTag } from "../../AffectsTag";
import type { SectionRenderCtx } from "@/app/dashboard/menu/items/[itemId]/edit/ItemEditLayout";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";

export function OverviewSection({ itemId, item, globalScope }: SectionRenderCtx) {
  const queryClient = useQueryClient();
  const { data: userInfo } = useUserInfo();
  const merchantId =
    userInfo?.members?.[0]?.organizations?.merchants?.id || "";
  const imageUpload = useMerchantCdnImageUpload({
    merchantId,
    category: "menu-items",
    fileNamePrefix: "item",
  });

  const [name, setName] = React.useState(item?.name ?? "");
  const [description, setDescription] = React.useState(item?.description ?? "");
  const [image, setImage] = React.useState(item?.image ?? "");

  React.useEffect(() => {
    setName(item?.name ?? "");
    setDescription(item?.description ?? "");
    setImage(item?.image ?? "");
  }, [item?.id, item?.name, item?.description, item?.image]);

  const mutation = useMutation({
    mutationFn: async () => {
      // Overview always writes to L1 regardless of selected location
      const res = await UpdateMenuItem(
        itemId,
        { name, description, image },
        undefined,
      );
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success("Overview saved");
      queryClient.invalidateQueries({ queryKey: ["menu-item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items-flat"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      invalidateOrderOutSync(queryClient);
    },
    onError: (err) =>
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  return (
    <div className="space-y-4">
      <SectionHeader title="Overview" scope={globalScope} />
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="overview-name">Name</Label>
          <Input
            id="overview-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="overview-description">Description</Label>
          <Textarea
            id="overview-description"
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Photo</Label>
          <CdnImageUploadField
            onClear={imageUpload.clear}
            onFileSelect={imageUpload.selectFile}
            previewUrl={imageUpload.previewUrl ?? (image || null)}
            selectedFileName={imageUpload.selectedFileName}
            uploading={imageUpload.isUploading}
            uploadLabel="Upload photo"
          />
        </div>
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                Save Overview
                <AffectsTag ctx={globalScope} variant="save-button" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SectionHeader({
  title,
  scope,
}: {
  title: string;
  scope: { level: 1 | 2 | 3 | 4 | 5; locationName?: string | null };
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <AffectsTag
        ctx={scope as any}
        variant="inline"
        prefix=""
      />
    </div>
  );
}
