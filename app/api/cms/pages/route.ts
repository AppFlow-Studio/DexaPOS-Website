import { NextResponse } from "next/server";
import { requireHqUser } from "@/lib/cms/cms-auth";

export async function GET() {
  const { userId, supabase } = await requireHqUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("page_content")
    .select("route, title, description, updated_at, published")
    .order("route");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
