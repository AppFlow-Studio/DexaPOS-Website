import { redirect } from "next/navigation";

import { requireHqUser } from "@/lib/cms/cms-auth";
import { mergeCanonicalSections, Section, normalizeSections } from "@/lib/cms/cms-sections";
import { DEFAULT_PAGE_SECTIONS } from "@/lib/cms/default-page-content";
import { PageEditorClient, type EditorCategory } from "./PageEditorClient";

export default async function WebsiteEditorPage({
  params,
}: {
  params: Promise<{ route: string }>;
}) {
  const { userId, supabase } = await requireHqUser();
  if (!userId) redirect("/dashboard");

  const raw = (await params).route;
  const decoded = raw === "root" ? "/" : "/" + raw.replace(/%2F/g, "/").replace(/^\/+/, "");

  const [{ data }, { data: categories }] = await Promise.all([
    supabase
      .from("page_content")
      .select("*")
      .eq("route", decoded)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("page_categories").select("id, name, slug").order("sort_order").order("name"),
  ]);

  const savedSections = (data && (data.sections || [])) as Section[];
  const canonicalSections = normalizeSections(DEFAULT_PAGE_SECTIONS[decoded] || []);
  const sections = data
    ? mergeCanonicalSections(savedSections, canonicalSections)
    : canonicalSections;

  const pageData = {
    route: data?.route || decoded,
    cms_title: data?.cms_title || "",
    title: data?.title || "",
    description: data?.description || "",
    category: data?.category || "Other",
    sections,
    published: data?.published || false,
    isNew: !data,
  };

  return (
    <PageEditorClient
      data={pageData}
      categories={(categories as EditorCategory[] | null) || []}
    />
  );
}
