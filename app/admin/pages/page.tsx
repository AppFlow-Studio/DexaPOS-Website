import { requireHqUser } from "@/lib/cms/cms-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewPageForm from "./NewPageForm";
import PageRowActions from "./PageRowActions";

interface PageRow {
  route: string;
  cms_title: string;
  title: string;
  description: string;
  updated_at: string;
  published: boolean;
  category: string | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

export default async function AdminPages() {
  const { userId, supabase } = await requireHqUser();
  if (!userId) redirect("/dashboard");

  const [{ data: pages }, { data: cats }] = await Promise.all([
    supabase
      .from("page_content")
      .select("route, cms_title, title, description, updated_at, published, category")
      .order("route"),
    supabase.from("page_categories").select("id, name, slug, sort_order").order("sort_order").order("name"),
  ]);

  const rows = (pages as PageRow[] | null) || [];
  const categories = (cats as Category[] | null) || [];

  // Build slug → name map with fallback
  const slugToName = new Map(categories.map((c) => [c.slug, c.name]));
  const categoryOrder = categories.map((c) => c.slug);

  function sortByCategoryOrder(a: string, b: string) {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  }

  const groups = new Map<string, PageRow[]>();
  for (const page of rows) {
    const cat = page.category || "other";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(page);
  }

  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => sortByCategoryOrder(a, b));

  return (
    <div>
      <div className="admin-head">
        <h1>Pages</h1>
        <NewPageForm />
      </div>
      {sortedGroups.map(([slug, catPages]) => (
        <div key={slug} className="admin-category-group">
          <div className="admin-category-header">
            <span className="admin-category-name">{slugToName.get(slug) || slug}</span>
            <span className="admin-category-count">{catPages.length}</span>
          </div>
          <div className="admin-page-list">
            {catPages.map((page) => (
              <Link
                key={page.route}
                href={`/admin/pages/${encodeURIComponent(page.route.replace(/^\/+/, "") || "root")}`}
                className="admin-page-row"
              >
                <div>
                  <h3>{page.cms_title || page.route}</h3>
                  <span className="route">{page.route}</span>
                </div>
                <PageRowActions route={page.route} published={page.published} />
              </Link>
            ))}
          </div>
        </div>
      ))}
      {rows.length === 0 && <p style={{ color: "var(--slate-500)" }}>No pages found.</p>}
    </div>
  );
}
