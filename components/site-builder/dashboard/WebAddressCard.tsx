"use client";

import { Check, Globe2, Loader2, PencilLine, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ClaimSubdomain } from "@/app/dashboard/website/actions/site";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MAX_SUBDOMAIN_LENGTH,
  checkSubdomain,
  slugifySubdomain,
} from "@/lib/site-builder/reserved-subdomains";

const SITE_DOMAIN = "dexaposai.com";

/**
 * Claiming the address the built site is served at.
 *
 * The last step between publishing and a visitor, and the reason it gets a card
 * of its own rather than a row in a settings list: a merchant who publishes
 * without one has done everything the product asked and is still unreachable,
 * which is the single most confusing state this feature can be in.
 *
 * **Changing an address is treated as heavier than claiming one.** Links,
 * QR codes and search rankings attach to a hostname, so the second time through
 * this asks for confirmation and says what breaks. The first time it does not
 * get in the way.
 */
export default function WebAddressCard({
  id,
  clerkOrgId,
  siteId,
  storeName,
  subdomain,
  isPublished,
}: {
  id?: string;
  clerkOrgId: string;
  siteId: string;
  storeName: string;
  subdomain: string | null;
  isPublished: boolean;
}) {
  const [value, setValue] = useState(subdomain ?? "");
  const [claimed, setClaimed] = useState(subdomain);
  const [editing, setEditing] = useState(!subdomain);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const trimmed = value.trim().toLowerCase();
  const check = trimmed ? checkSubdomain(trimmed) : null;
  const unchanged = trimmed === (claimed ?? "");
  const canSave = !!trimmed && !!check?.ok && !unchanged && !pending;

  // Replacing an address the public may already be using is not the same
  // decision as picking a free one, and the difference is invisible unless
  // something says so. Claiming a first address is not interrupted.
  const attemptSave = () => (claimed ? setConfirming(true) : save());

  const save = () => {
    setConfirming(false);
    startTransition(async () => {
      const result = await ClaimSubdomain(clerkOrgId, siteId, trimmed);
      if (!result.data) {
        toast.error(result.error ?? "Could not save the web address.");
        return;
      }
      setClaimed(result.data.subdomain);
      setEditing(false);
      toast.success(`Your website address is ${result.data.subdomain}.${SITE_DOMAIN}`);
    });
  };

  return (
    <Card id={id} className="scroll-mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe2 className="size-4 text-muted-foreground" />
          Web address
        </CardTitle>
        <CardDescription>
          {claimed
            ? "Where visitors find your website. Your online-ordering links are separate and are not affected."
            : "Choose where your website will live. Until you do, publishing saves your work but nobody can reach it."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {!editing && claimed ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3.5 py-3">
            <span className="flex items-center gap-2 font-mono text-sm">
              <Check className="size-4 shrink-0 text-emerald-600" />
              {claimed}.{SITE_DOMAIN}
            </span>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <PencilLine className="size-3.5" />
              Change
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onBlur={() => setValue((current) => slugifySubdomain(current) || current)}
                placeholder={slugifySubdomain(storeName) || "your-restaurant"}
                aria-label="Web address"
                aria-invalid={!!trimmed && !check?.ok}
                maxLength={MAX_SUBDOMAIN_LENGTH}
                spellCheck={false}
                autoCapitalize="none"
                className="h-10 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
              />
              <span className="shrink-0 font-mono text-sm text-muted-foreground">
                .{SITE_DOMAIN}
              </span>
            </div>

            {trimmed && !check?.ok && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {check?.message}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button size="sm" disabled={!canSave} onClick={attemptSave}>
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                {claimed ? "Save address" : "Claim address"}
              </Button>
              {claimed && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setValue(claimed);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </>
        )}

        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Change your web address?</AlertDialogTitle>
              <AlertDialogDescription>
                Your site will move from{" "}
                <span className="font-mono">{claimed}.{SITE_DOMAIN}</span> to{" "}
                <span className="font-mono">{trimmed}.{SITE_DOMAIN}</span>. Anything pointing at the
                old address — links you have shared, printed QR codes, search results — will stop
                reaching your site, and the old address becomes free for someone else to claim.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep {claimed}.{SITE_DOMAIN}</AlertDialogCancel>
              <AlertDialogAction onClick={save}>Change the address</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {isPublished && !claimed && (
          <p className="rounded-lg border border-amber-300/60 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">
            You have published a page, but your website has no address yet — so guests still cannot
            reach it. Claim one above and it goes live immediately; there is nothing more to
            publish.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
