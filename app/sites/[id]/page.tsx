import { getStorefrontData } from "../actions";
import { notFound } from "next/navigation";
import { CartSidebar } from "../components/CartSidebar";
import { FloatingCartBar } from "../components/FloatingCartBar";
import { StorefrontLayout } from "../components/StorefrontLayout";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function StorefrontPage({ params }: PageProps) {
  const { id } = await params;
  const { site, location, menus } = await getStorefrontData(id);

  if (!location) {
    notFound();
  }

  // Use site branding or fallback to location name
  const primaryColor = site?.theme_config?.primaryColor || "#3b82f6";
  const secondaryColor = site?.theme_config?.secondaryColor || "#10b981";

  // Inject CSS variables for theming
  const themeStyle = {
    "--primary": primaryColor,
    "--secondary": secondaryColor,
  } as React.CSSProperties;

  return (
    <div
      className="min-h-screen bg-gray-50 overflow-x-hidden"
      style={themeStyle}
    >
      <StorefrontLayout site={site} location={location} menus={menus} />

      <CartSidebar config={site?.online_ordering_config || undefined} />
      <FloatingCartBar />
    </div>
  );
}
