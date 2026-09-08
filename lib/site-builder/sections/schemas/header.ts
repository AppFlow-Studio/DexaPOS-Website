import { z } from "zod";

/**
 * Site header. Locked to the masthead zone; not addable, not deletable.
 *
 * Navigation items and the logo live on the *site* (`merchant_sites.nav`), not
 * here — otherwise changing a nav link would create a new version of every
 * page. This section only carries how that shared chrome is presented.
 */
export const headerSchema = z.object({
  logoAlign: z.enum(["left", "center"]),
  sticky: z.boolean(),
  showOrderButton: z.boolean(),
  orderButtonLabel: z.string().max(40).optional(),
  showPhone: z.boolean(),
  transparentOverHero: z.boolean(),
});

export type HeaderProps = z.infer<typeof headerSchema>;

export function headerDefaults(): HeaderProps {
  return {
    logoAlign: "left",
    sticky: true,
    showOrderButton: true,
    orderButtonLabel: "Order Now",
    showPhone: false,
    transparentOverHero: false,
  };
}
