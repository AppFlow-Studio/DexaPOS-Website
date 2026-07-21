import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireHqUser } from "@/lib/cms/cms-auth";
import { sanitizeHtml } from "@/lib/cms/sanitize";
import { mergeCanonicalSections, Section } from "@/lib/cms/cms-sections";
import { DEFAULT_PAGE_SECTIONS } from "@/lib/cms/default-page-content";

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeHtml(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitizeValue(entry)])
    );
  }
  return value;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ route: string }> }
) {
  const { route } = await params;
  const { userId, supabase } = await requireHqUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = route === "root" ? "/" : "/" + route.replace(/%2F/g, "/").replace(/^\/+/, "");

  const { data, error } = await supabase
    .from("page_content")
    .select("*")
    .eq("route", decoded)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json(null);

  const sections = mergeCanonicalSections(
    (data.sections || []) as Section[],
    DEFAULT_PAGE_SECTIONS[decoded] || []
  );
  return NextResponse.json({ ...data, sections });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ route: string }> }
) {
  const { route } = await params;
  const { userId, supabase } = await requireHqUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = route === "root" ? "/" : "/" + route.replace(/%2F/g, "/").replace(/^\/+/, "");
  const body = await req.json();
  const allowed = ["cms_title", "title", "description", "hero_title", "hero_subtitle", "sections", "published", "category", "route"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    if (key === "sections" && Array.isArray(body[key])) {
      updates[key] = body[key].map(sanitizeValue);
    } else {
      updates[key] = sanitizeValue(body[key]);
    }
  }
  updates.updated_at = new Date().toISOString();

  // If the route is being changed, handle the migration
  const newRoute = updates.route as string | undefined;
  if (newRoute && newRoute !== decoded) {
    // Delete old row, create new one with the updated route
    await supabase.from("page_content").delete().eq("route", decoded);
    const { data, error } = await supabase
      .from("page_content")
      .upsert({ route: newRoute, ...updates }, { onConflict: "route" })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath(decoded);
    revalidatePath(newRoute);
    return NextResponse.json({ ...data, previousRoute: decoded });
  }

  const { data, error } = await supabase
    .from("page_content")
    .upsert({ route: decoded, ...updates }, { onConflict: "route" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath(decoded);
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ route: string }> }
) {
  const { route } = await params;
  const { userId, supabase } = await requireHqUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = route === "root" ? "/" : "/" + route.replace(/%2F/g, "/").replace(/^\/+/, "");

  const { error } = await supabase.from("page_content").delete().eq("route", decoded);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath(decoded);
  return NextResponse.json({ success: true, route: decoded });
}
