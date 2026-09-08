// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteAssetSummary } from "@/lib/site-builder/db-types";

/**
 * A filled image field has to draw its own thumbnail.
 *
 * Both pickers used to fetch the library only when the dialog was opened, which
 * left a field that already held a photo with nothing to resolve its id
 * against: `AssetPicker` rendered the word "Loading…" and `AssetListPicker`
 * rendered an empty grey square labelled "Photo", indefinitely — until the
 * merchant opened the picker, which is the one action a thumbnail exists to
 * make unnecessary. It is what made the hero carousel rows look blank.
 *
 * The library is still not fetched for a field that is *empty*, which is the
 * saving the lazy load was there for: most sections carry no image at all.
 */

const listSiteAssets = vi.fn();

vi.mock("@/app/dashboard/website/actions/assets", () => ({
  ListSiteAssets: (...args: unknown[]) => listSiteAssets(...args),
  UploadSiteAsset: vi.fn(),
  UpdateSiteAssetAlt: vi.fn(),
  DeleteSiteAsset: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { default: AssetPicker, AssetListPicker } = await import("../AssetPicker");

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const PHOTO: SiteAssetSummary = {
  id: "asset_1",
  cdnUrl: "https://cdn.test/plate.jpg",
  altText: "A plate of pasta",
  width: 1200,
  height: 800,
  originalFilename: "plate.jpg",
  bytes: 240_000,
  createdAt: "2026-08-01T00:00:00Z",
  mimeType: "image/jpeg",
};

const mounted: { root: ReturnType<typeof createRoot>; container: HTMLDivElement }[] = [];

/** Mounts a node and lets the library promise settle, as the effect would. */
async function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });

  await act(async () => {
    root.render(node);
  });
  return container;
}

beforeEach(() => {
  listSiteAssets.mockReset();
  listSiteAssets.mockResolvedValue({ data: [PHOTO] });
});

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

describe("AssetPicker draws a filled field without being opened", () => {
  it("loads the library and renders the thumbnail for a value it was given", async () => {
    const container = await render(
      <AssetPicker
        label="Image"
        clerkOrgId="org_1"
        value={{ assetId: "asset_1" }}
        onChange={() => {}}
      />,
    );

    expect(listSiteAssets).toHaveBeenCalledWith("org_1", "image");

    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(PHOTO.cdnUrl);
    expect(container.textContent).not.toContain("Loading…");
  });

  it("does not fetch anything for an empty field", async () => {
    const container = await render(
      <AssetPicker label="Image" clerkOrgId="org_1" value={undefined} onChange={() => {}} />,
    );

    // The saving the lazy load exists for: most sections have no image field.
    expect(listSiteAssets).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Choose a photo");
  });

  it("says the photo is gone rather than 'Loading…' once the library is known", async () => {
    listSiteAssets.mockResolvedValue({ data: [] });

    const container = await render(
      <AssetPicker
        label="Image"
        clerkOrgId="org_1"
        value={{ assetId: "deleted_asset" }}
        onChange={() => {}}
      />,
    );

    expect(container.textContent).toContain("no longer in your library");
    expect(container.textContent).not.toContain("Loading…");
  });
});

describe("AssetListPicker draws its rows without being opened", () => {
  it("renders a thumbnail and the real name for each row", async () => {
    const container = await render(
      <AssetListPicker
        label="Carousel"
        clerkOrgId="org_1"
        maxItems={5}
        value={[{ assetId: "asset_1" }]}
        onChange={() => {}}
      />,
    );

    expect(listSiteAssets).toHaveBeenCalledWith("org_1", "image");

    const img = container.querySelector("li img");
    expect(img?.getAttribute("src")).toBe(PHOTO.cdnUrl);

    // The row used to fall back to the literal word "Photo" beside a grey box.
    expect(container.textContent).toContain("A plate of pasta");
  });

  it("marks a row whose photo has been deleted from the library", async () => {
    listSiteAssets.mockResolvedValue({ data: [PHOTO] });

    const container = await render(
      <AssetListPicker
        label="Photos"
        clerkOrgId="org_1"
        maxItems={5}
        value={[{ assetId: "asset_1" }, { assetId: "deleted_asset" }]}
        onChange={() => {}}
      />,
    );

    // The dead row is the loudest thing in the list, not the quietest: it is
    // the only place the merchant learns their live page has an empty cell.
    expect(container.textContent).toContain("no longer in your library");

    const rows = container.querySelectorAll("li");
    expect(rows).toHaveLength(2);
    expect(rows[1].className).toContain("destructive");
    expect(rows[0].className).not.toContain("destructive");
  });

  it("does not fetch anything for an empty list", async () => {
    await render(
      <AssetListPicker
        label="Carousel"
        clerkOrgId="org_1"
        maxItems={5}
        value={[]}
        onChange={() => {}}
      />,
    );

    expect(listSiteAssets).not.toHaveBeenCalled();
  });
});
