import type { Metadata } from "next";
import SectionRenderer from "@/components/cms/SectionRenderer";
import { getCmsPage } from "@/lib/cms/get-cms-page";
import "./contact.css";

export async function generateMetadata(): Promise<Metadata> {
  const cms = await getCmsPage("/contact");
  return {
    title: cms?.title || "Contact",
    description: cms?.description || "Get in touch with the DEXA team. Request a demo, ask about pricing, or learn how DEXA can work for your restaurant.",
    openGraph: { title: cms?.title || "Contact DEXA", url: "/contact" },
  };
}

export default async function ContactPage() {
  const cms = await getCmsPage("/contact");
  return <SectionRenderer route="/contact" sections={cms?.sections || []} />;
}
