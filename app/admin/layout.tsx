import Link from "next/link";
import { Barlow, Barlow_Condensed } from "next/font/google";
import ErrorBoundary from "@/components/marketing/ErrorBoundary";
import "./cms-theme.css";
import "./admin.css";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`admin-shell ${barlow.variable} ${barlowCondensed.variable}`}>
      <nav className="admin-nav">
        <div className="admin-nav-inner">
          <Link href="/admin" className="admin-logo">
            DEXA CMS
          </Link>
          <div className="admin-links">
            <Link href="/admin/pages">Pages</Link>
            <Link href="/admin/categories">Categories</Link>
            <Link href="/admin/blocks">Content Blocks</Link>
            <Link href="/" target="_blank" rel="noopener noreferrer">View Site</Link>
            <Link href="/manage">Back to HQ</Link>
          </div>
        </div>
      </nav>
      <main className="admin-main">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
