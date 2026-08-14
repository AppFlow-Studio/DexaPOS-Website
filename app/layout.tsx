import type { Metadata } from "next";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/barlow/latin-300.css";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-700.css";
import "@fontsource/barlow-condensed/latin-400.css";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "./globals.css";
import TanstackProvider from "@/utils/tanstackquery";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  metadataBase: new URL("https://dexaposai.com"),
  title: {
    default: "DEXA POS — Restaurant operations, simplified.",
    template: "%s — DEXA POS",
  },
  description:
    "The all-in-one point-of-sale platform built for modern restaurants. From quick-service to fine dining.",
  applicationName: "DEXA POS",
  keywords: [
    "DEXA POS",
    "restaurant POS",
    "point of sale",
    "restaurant software",
    "quick-service POS",
    "fine dining POS",
    "kitchen display system",
    "online ordering",
    "tableside payments",
    "multi-location restaurant",
  ],
  icons: {
    icon: "/dexalogolight.png",
    shortcut: "/dexalogolight.png",
    apple: "/dexalogolight.png",
  },
  openGraph: {
    type: "website",
    siteName: "DEXA POS",
    title: "DEXA POS — Restaurant operations, simplified.",
    description:
      "The all-in-one point-of-sale platform built for modern restaurants. From quick-service to fine dining.",
    url: "/",
    images: [
      {
        url: "/dexalogolight.png",
        width: 1200,
        height: 630,
        alt: "DEXA POS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DEXA POS — Restaurant operations, simplified.",
    description:
      "The all-in-one point-of-sale platform built for modern restaurants. From quick-service to fine dining.",
    images: ["/dexalogolight.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          {/* Anti-FOUC theme bootstrap. Runs before first paint to apply the
              persisted theme from localStorage (set by AnimatedThemeToggler),
              falling back to the OS preference. Without this the page always
              loaded light on reload, dropping a toggled dark theme. Kept inline
              and blocking so there is no flash. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
            }}
          />
        </head>
        <body
          className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
          suppressHydrationWarning
        >
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[999] focus:p-2 focus:bg-white focus:text-black focus:rounded focus:shadow-md"
          >
            Skip to content
          </a>
          <TanstackProvider>
            {children}
            <Toaster
              position="top-center"
              richColors
              closeButton
              duration={4000}
            />
          </TanstackProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
