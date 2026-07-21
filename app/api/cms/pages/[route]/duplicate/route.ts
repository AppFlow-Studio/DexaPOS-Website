import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireHqUser } from "@/lib/cms/cms-auth";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ route: string }> }
) {
  const { route } = await params;
  const { userId, supabase } = await requireHqUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = route === "root" ? "/" : "/" + route.replace(/%2F/g, "/").replace(/^\/+/, "");

  // Fetch source page
  const { data: source, error: fetchError } = await supabase
    .from("page_content")
    .select("*")
    .eq("route", decoded)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!source) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  // Derive new route — append -copy or -2 if already copied
  let newRoute = decoded + "-copy";
  let attempt = 2;
  while (true) {
    const { data: existing } = await supabase
      .from("page_content")
      .select("route")
      .eq("route", newRoute)
      .maybeSingle();
    if (!existing) break;
    newRoute = decoded + "-" + attempt;
    attempt++;
  }

  // Insert duplicate with new route
  const { data: inserted, error: insertError } = await supabase
    .from("page_content")
    .insert({
      route: newRoute,
      cms_title: (source.cms_title || source.title) + " (copy)",
      title: source.title,
      description: source.description,
      hero_title: source.hero_title,
      hero_subtitle: source.hero_subtitle,
      sections: source.sections,
      published: false,
      category: source.category,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  revalidatePath(decoded);
  revalidatePath(newRoute);
  return NextResponse.json(inserted);
}
