import { NextResponse } from "next/server";
import { requireHqUser } from "@/lib/cms/cms-auth";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const { userId } = await requireHqUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await serviceClient.storage
    .from("cms")
    .list("", { sortBy: { column: "created_at", order: "desc" } });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const images = (data || []).map((file) => {
    const { data: { publicUrl } } = serviceClient.storage
      .from("cms")
      .getPublicUrl(file.name);
    return { name: file.name, url: publicUrl, created_at: file.created_at };
  });

  return NextResponse.json({ images });
}
