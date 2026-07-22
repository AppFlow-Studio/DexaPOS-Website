import { NextResponse } from "next/server";
import { requireHqUser } from "@/lib/cms/cms-auth";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  const { userId, supabase } = await requireHqUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("page_categories")
    .select("*")
    .order("sort_order")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data || [] });
}

export async function POST(req: Request) {
  const { userId } = await requireHqUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, slug, parent_id, sort_order } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: "Name and slug are required" }, { status: 400 });
  }

  const serviceClient = getServiceClient();
  const { data, error } = await serviceClient
    .from("page_categories")
    .insert({ name, slug, parent_id: parent_id || null, sort_order: sort_order || 0 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const { userId } = await requireHqUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, name, slug, parent_id, sort_order } = body;

  if (!id) {
    return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
  }

  const serviceClient = getServiceClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (slug !== undefined) updates.slug = slug;
  if (parent_id !== undefined) updates.parent_id = parent_id || null;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const { data, error } = await serviceClient
    .from("page_categories")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const { userId } = await requireHqUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Category ID is required" }, { status: 400 });

  const serviceClient = getServiceClient();
  const { error } = await serviceClient.from("page_categories").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
