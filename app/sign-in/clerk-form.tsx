"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { clerkAppearance } from "./clerk-appearance";

/**
 * Tracks the resolved dark/light mode for Clerk's `baseTheme`.
 *
 * The theme lives in `localStorage` (written by AnimatedThemeToggler, applied
 * before paint by the bootstrap script in app/layout.tsx), so a server
 * component cannot know it. Reading the `.dark` class the bootstrap already set
 * keeps this in agreement with the rest of the page instead of re-deriving the
 * preference and risking a different answer.
 *
 * Starts `false` so server and first client render agree; a dark-mode user gets
 * one immediate correction in the effect rather than a hydration mismatch.
 */
export function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();

    // The toggler swaps the class without a reload, so watch for it.
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export function ThemedSignIn() {
  const isDark = useIsDarkTheme();
  return <SignIn signInUrl="/sign-in" appearance={clerkAppearance(isDark)} />;
}

export function ThemedSignUp() {
  const isDark = useIsDarkTheme();
  return <SignUp appearance={clerkAppearance(isDark)} />;
}
