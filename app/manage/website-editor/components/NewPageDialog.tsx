"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Field } from "@/components/cms/cms-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { pageEditorHref } from "../lib/paths";

const ROUTE_PATTERN = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i;

/**
 * Picks the URL for a new page and opens the editor on it. Nothing is written
 * until the page is first saved there.
 */
export function NewPageDialog() {
  const [open, setOpen] = useState(false);
  const [route, setRoute] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setRoute("");
      setError("");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = route.trim().replace(/^\/+|\/+$/g, "");
    if (!slug) {
      setError("Enter a route for the page.");
      return;
    }
    if (!ROUTE_PATTERN.test(slug)) {
      setError("Use letters, numbers, hyphens and underscores, with / between nested segments.");
      return;
    }
    router.push(pageEditorHref(`/${slug}`));
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button className="h-9 px-4 text-[0.8125rem] font-medium">
          <Plus className="h-4 w-4" aria-hidden />
          New page
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-6">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle>New page</DialogTitle>
            <DialogDescription>Choose its URL. The page is created when you first save it.</DialogDescription>
          </DialogHeader>

          <Field
            label="Route"
            htmlFor="new-page-route"
            hint={error ? undefined : "For example pricing, or industries/restaurants"}
          >
            <div className="flex min-w-0 items-center">
              <span className="flex h-9 shrink-0 items-center rounded-l-full bg-muted px-3 text-sm text-muted-foreground">
                /
              </span>
              <Input
                id="new-page-route"
                value={route}
                onChange={(e) => {
                  setRoute(e.target.value);
                  setError("");
                }}
                placeholder="page-route"
                aria-invalid={!!error || undefined}
                aria-describedby={error ? "new-page-route-error" : undefined}
                autoFocus
                className="rounded-l-none"
              />
            </div>
            {error && (
              <p id="new-page-route-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => reset(false)}>
              Cancel
            </Button>
            <Button type="submit">Create page</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
