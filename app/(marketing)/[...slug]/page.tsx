import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SectionRenderer from "@/components/cms/SectionRenderer";
import { getCmsPage } from "@/lib/cms/get-cms-page";

interface CmsRoutePageProps {
  params: Promise<{ slug: string[] }>;
}

function routeFromSlug(slug: string[]) {
  return `/${slug.join("/")}`;
}

export async function generateMetadata({ params }: CmsRoutePageProps): Promise<Metadata> {
  const { slug } = await params;
  const cms = await getCmsPage(routeFromSlug(slug));

  if (!cms) {
    return {
      title: "Page not found",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: cms.title || undefined,
    description: cms.description || undefined,
    openGraph: {
      title: cms.title || undefined,
      description: cms.description || undefined,
    },
  };
}

export default async function CmsRoutePage({ params }: CmsRoutePageProps) {
  const { slug } = await params;
  const route = routeFromSlug(slug);
  const cms = await getCmsPage(route);

  if (!cms) notFound();

  return <SectionRenderer route={route} sections={cms.sections} />;
}
