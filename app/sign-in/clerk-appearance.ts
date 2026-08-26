import { dark } from "@clerk/themes";

/**
 * Shared Clerk styling for `/sign-in` and `/sign-up`.
 *
 * Both pages used to carry their own near-identical copy of this block, so a
 * styling change had to be made twice and the two pages had already drifted
 * apart. One export keeps them in step.
 *
 * `card`/`cardBox` are stripped bare because the pages supply their own
 * surface: Clerk's card would otherwise render a second bordered, shadowed box
 * inside ours, with a visible seam where its footer keeps its own background.
 */
const elements = {
  rootBox: "w-full",
  cardBox: "w-full shadow-none border-0",
  card: "shadow-none border-0 bg-transparent w-full p-0",
  // The pages render their own heading, so Clerk's would be a duplicate.
  headerTitle: "hidden",
  headerSubtitle: "hidden",
  // "Secured by Clerk" ships its own background; hiding it removes the grey
  // strip that otherwise breaks out of our rounded container.
  footer: "hidden",
  // `!` throughout: Clerk injects its own primary-button background, border
  // and ring at runtime with higher specificity than a plain utility class.
  // Without the override the Continue button renders in Clerk's blue with its
  // default border instead of matching the flat "Try the live demo" CTA.
  formButtonPrimary:
    "!bg-foreground hover:!bg-foreground/90 !text-background !border-0 !border-none !shadow-none !ring-0 !ring-offset-0 !outline-none normal-case text-sm font-medium",
  socialButtonsBlockButton:
    "border-border text-foreground hover:bg-muted/50 normal-case",
  formFieldInput: "bg-background border-border text-foreground",
  formFieldLabel: "text-foreground",
  formFieldInputShowPasswordButton:
    "text-muted-foreground hover:text-foreground",
  footerActionLink: "text-primary hover:text-primary/80",
  formResendCodeLink: "text-primary hover:text-primary/80",
  otpCodeFieldInput: "border-border text-foreground",
  // Token-based, not `text-green-600`: a light-only literal renders as a
  // near-invisible dark-on-dark string once the dark palette is applied.
  formFieldSuccessText: "text-primary",
  formFieldErrorText: "text-destructive",
  formFieldWarningText: "text-destructive",
  alertText: "text-destructive",
  identityPreview: "bg-muted/50 border-border",
  identityPreviewText: "text-muted-foreground",
  formHeaderTitle: "text-foreground",
  formHeaderSubtitle: "text-muted-foreground",
  dividerLine: "bg-border",
  dividerText: "text-muted-foreground",
};

/**
 * Clerk renders in its own shadow DOM, so the app's `.dark` class and CSS
 * variables do not reach inside it — the widget stayed light-on-dark for every
 * dark-mode user. `baseTheme` has to be chosen in JS instead, which is why this
 * takes the resolved mode rather than reading a class name.
 */
export function clerkAppearance(isDark: boolean) {
  return {
    baseTheme: isDark ? dark : undefined,
    variables: {
      colorPrimary: isDark ? "#6ca0ff" : "#0c4fd1",
      borderRadius: "0.625rem",
      // Clerk scales its whole internal rhythm off this (default 1rem).
      // Trimming it is what lets the form clear a short laptop viewport
      // without a scrollbar, and it is a documented variable rather than a
      // guessed element key, so it cannot fail silently.
      spacingUnit: "0.875rem",
    },
    elements,
  };
}
