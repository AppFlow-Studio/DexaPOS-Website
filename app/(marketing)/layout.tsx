import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./marketing.css";
import RevealObserver from "./_components/RevealObserver";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DEXA POS — Restaurant operations, simplified.",
  description:
    "The all-in-one point-of-sale platform built for modern restaurants. From quick-service to fine dining.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={inter.variable}
      style={{ fontFamily: "var(--font)" }}
    >
      <RevealObserver />
      {children}
    </div>
  );
}
