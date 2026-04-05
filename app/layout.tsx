import type { Metadata } from "next";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TanstackProvider from "@/utils/tanstackquery";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DexaPOS - Modern Point of Sale Solution",
  description:
    "Transform your business operations with DexaPOS - the modern point-of-sale solution with powerful analytics and seamless user experience.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
          suppressHydrationWarning
        >
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
