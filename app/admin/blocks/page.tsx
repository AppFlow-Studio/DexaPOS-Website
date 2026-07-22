import { requireHqUser } from "@/lib/cms/cms-auth";
import { redirect } from "next/navigation";
import AdminBlocksClient from "./AdminBlocksClient";
import { DEFAULT_SITE_SETTINGS, SiteSettings } from "@/lib/cms/site-settings-data";

interface Block {
  id: string;
  key: string;
  title: string;
  body_html: string;
  content_json?: unknown;
  published: boolean;
}

function parseJson(value: string): Partial<SiteSettings> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function withDefaultSiteSettings(block: Block): Block {
  if (block.key !== "site-settings") return block;
  const storedSettings =
    block.content_json && typeof block.content_json === "object"
      ? (block.content_json as Partial<SiteSettings>)
      : parseJson(block.body_html);
  const settings = { ...DEFAULT_SITE_SETTINGS, ...storedSettings };
  return {
    ...block,
    body_html: JSON.stringify(settings, null, 2),
    content_json: settings,
  };
}

export default async function AdminBlocks() {
  const { userId, supabase } = await requireHqUser();
  if (!userId) redirect("/dashboard");

  const { data: blocks } = await supabase
    .from("content_blocks")
    .select("*")
    .order("key");

  const initialBlocks = ((blocks as Block[]) || []).map(withDefaultSiteSettings);
  if (!initialBlocks.some((block) => block.key === "site-settings")) {
    initialBlocks.unshift({
      id: "default-site-settings",
      key: "site-settings",
      title: "Site settings",
      body_html: JSON.stringify(DEFAULT_SITE_SETTINGS, null, 2),
      content_json: DEFAULT_SITE_SETTINGS,
      published: true,
    });
  }

  return <AdminBlocksClient initialBlocks={initialBlocks} />;
}
