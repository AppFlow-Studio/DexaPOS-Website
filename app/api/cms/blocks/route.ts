import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireHqUser } from "@/lib/cms/cms-auth";
import { sanitizeHtml } from "@/lib/cms/sanitize";
import { DEFAULT_SITE_SETTINGS, SiteSettings } from "@/lib/cms/site-settings-data";

type ContentBlock = {
  id?: string;
  key: string;
  title: string;
  body_html: string;
  content_json?: unknown;
  published?: boolean;
};

function parseJson(value: string): Partial<SiteSettings> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeSiteSettingsBlock<T extends ContentBlock>(block: T): T {
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

export async function GET() {
  const { userId, supabase } = await requireHqUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("content_blocks")
    .select("*")
    .order("key");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const blocks = ((data || []) as ContentBlock[]).map(normalizeSiteSettingsBlock);
  if (!blocks.some((block) => block.key === "site-settings")) {
    blocks.unshift({
      id: "default-site-settings",
      key: "site-settings",
      title: "Site settings",
      body_html: JSON.stringify(DEFAULT_SITE_SETTINGS, null, 2),
      content_json: DEFAULT_SITE_SETTINGS,
      published: true,
    });
  }

  return NextResponse.json(blocks);
}

export async function POST(req: Request) {
  const { userId, supabase } = await requireHqUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.key) return NextResponse.json({ error: "key is required" }, { status: 400 });

  const payload: Record<string, unknown> = {
    key: body.key,
    title: body.title || "",
    body_html: sanitizeHtml(body.body_html || ""),
  };

  if (body.content_json !== undefined) {
    payload.content_json = body.content_json;
    payload.body_html = typeof body.body_html === "string" ? body.body_html : JSON.stringify(body.content_json, null, 2);
  }

  if (body.key === "site-settings") {
    const storedSettings =
      body.content_json && typeof body.content_json === "object"
        ? (body.content_json as Partial<SiteSettings>)
        : parseJson(typeof body.body_html === "string" ? body.body_html : "");
    const settings = { ...DEFAULT_SITE_SETTINGS, ...storedSettings };
    payload.content_json = settings;
    payload.body_html = JSON.stringify(settings, null, 2);
    payload.title = body.title || "Site settings";
  }

  const { data, error } = await supabase
    .from("content_blocks")
    .upsert(payload, { onConflict: "key" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Invalidate layout cache so Nav/Footer pick up changes on next page load
  revalidatePath("/", "layout");

  return NextResponse.json(data);
}
