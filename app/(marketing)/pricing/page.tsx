import type { Metadata } from "next";
import SectionRenderer from "@/components/cms/SectionRenderer";
import { getCmsPage } from "@/lib/cms/get-cms-page";
import "./pricing.css";

export async function generateMetadata(): Promise<Metadata> {
  const cms = await getCmsPage("/pricing");

  return {
    title: cms?.title || "Pricing",
    description:
      cms?.description ||
      "Transparent monthly pricing for DEXA POS. Build your plan with the live calculator. First station $99/mo, additional stations $49/mo, plus a la carte add-ons.",
    openGraph: { title: cms?.title || "DEXA Pricing", url: "/pricing" },
  };
}

export default async function PricingPage() {
  const cms = await getCmsPage("/pricing");

  return <SectionRenderer route="/pricing" sections={cms?.sections || []} />;
}
