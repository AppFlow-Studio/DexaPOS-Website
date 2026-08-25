import { PlayCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

/**
 * Marketing half of the split auth layout.
 *
 * Hidden below `lg`: on a phone the form is the only thing that matters, and
 * stacking a large product shot above it would push the password field off
 * screen. Decorative there, essential nowhere — so it is simply not rendered.
 *
 * The purple wash is `bg-primary/10`, derived from the brand token rather than
 * a fixed hex, so it tracks the theme instead of glowing on the dark palette.
 */
export function AuthBrandPanel() {
  return (
    <aside className="relative hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col items-center justify-center overflow-hidden bg-primary/10 px-10 py-12 dark:bg-primary/15">
      <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
        <Image
          src="/dexalogolight.png"
          alt=""
          width={44}
          height={44}
          priority
          className="h-11 w-11 rounded-xl object-contain dark:hidden"
        />
        <Image
          src="/dexalogodark.png"
          alt=""
          width={44}
          height={44}
          priority
          className="hidden h-11 w-11 rounded-xl object-contain dark:block"
        />

        <p className="mt-5 text-balance text-2xl font-semibold leading-snug tracking-tight text-foreground">
          Everything your restaurant runs on, in one place.
        </p>

        {/* Height-capped rather than width-driven: at 1440x900 the full-width
            image pushed the CTAs below the fold on a short laptop screen. */}
        <div className="relative mt-6 w-full">
          <Image
            src="/dexa-pos-terminals.png"
            alt="DexaPOS terminal and card reader"
            width={900}
            height={675}
            priority
            sizes="(max-width: 1024px) 0px, 45vw"
            className="mx-auto h-auto max-h-[38vh] w-full object-contain"
          />
        </div>

        {/* Accounts are invitation-only, so the useful CTAs are "try it" and
            "talk to us" — a self-serve sign-up link would dead-end everyone.
            The demo is the primary: it costs the visitor nothing to click. */}
        <p className="mt-6 text-sm text-muted-foreground">
          Not a DexaPOS customer yet?
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/demo"
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background shadow-sm transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <PlayCircle className="h-4 w-4" />
            Try the live demo
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Get in touch
          </Link>
        </div>
      </div>
    </aside>
  );
}
