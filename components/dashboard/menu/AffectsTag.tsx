"use client";

import * as React from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  affectsLabel,
  scopeColor,
  scopeIcon,
  type ScopeContext,
} from "@/lib/menu/cascade-labels";
import { useRoleAwareScopeCopy } from "@/lib/menu/useRoleAwareScope";

type AffectsTagVariant = "save-button" | "banner" | "inline";

interface AffectsTagProps {
  ctx: ScopeContext;
  variant?: AffectsTagVariant;
  className?: string;
  /**
   * Hide the icon in save-button / inline variants. Banner always keeps the icon.
   */
  hideIcon?: boolean;
  /**
   * Override the "affects " prefix in inline/save-button variants.
   * Passing empty string prints only the label.
   */
  prefix?: string;
  /**
   * Route the scope through the role-aware copy hook. When `true` (default),
   * managers see the degraded scope (L1→L2, L3→L4) and members see a
   * "Read-only" pill. Pass `false` for unit tests or pure/static contexts
   * where no QueryClient is mounted.
   */
  roleAware?: boolean;
}

function ReadOnlyPill({
  variant,
  className,
}: {
  variant: AffectsTagVariant;
  className?: string;
}) {
  const baseClasses =
    "inline-flex items-center gap-1 border font-medium whitespace-nowrap bg-slate-50 border-slate-200 text-slate-600";
  const ariaLabel = "You have view-only access";

  if (variant === "banner") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-xs",
          baseClasses,
          className,
        )}
        role="status"
        aria-label={ariaLabel}
      >
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <span className="font-semibold leading-tight">Read-only</span>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px]",
          baseClasses,
          className,
        )}
        aria-label={ariaLabel}
      >
        <Eye className="h-2.5 w-2.5" />
        <span>Read-only</span>
      </span>
    );
  }

  return (
    <span
      className={cn("ml-1 text-[10px] font-normal opacity-80", className)}
      aria-label={ariaLabel}
    >
      · Read-only
    </span>
  );
}

/**
 * Surfaces the blast-radius of a save at the current scope.
 *
 * - `save-button` (default): light subscript text rendered inside Save buttons
 *     e.g. "Save · affects Downtown only"
 * - `banner`: full-width colored pill used at the top of forms/sections
 * - `inline`: tiny badge for list rows, toolbars, dialog headers
 *
 * Always derives its text + color from the shared cascade-labels helpers so
 * merchants see consistent wording across the entire menu UI.
 *
 * When `roleAware` is true (default), the tag swaps to a neutral
 * "Read-only" pill for members and shows the degraded scope (L1→L2,
 * L3→L4) for managers so the label never overstates what a save will
 * actually affect.
 */
export function AffectsTag({
  ctx,
  variant = "save-button",
  className,
  hideIcon = false,
  prefix,
  roleAware = true,
}: AffectsTagProps) {
  if (roleAware) {
    return (
      <RoleAwareAffectsTag
        ctx={ctx}
        variant={variant}
        className={className}
        hideIcon={hideIcon}
        prefix={prefix}
      />
    );
  }
  return (
    <PureAffectsTag
      ctx={ctx}
      variant={variant}
      className={className}
      hideIcon={hideIcon}
      prefix={prefix}
    />
  );
}

function RoleAwareAffectsTag({
  ctx,
  variant = "save-button",
  className,
  hideIcon = false,
  prefix,
}: Omit<AffectsTagProps, "roleAware">) {
  const vm = useRoleAwareScopeCopy(ctx);
  if (vm.affects.mode === "readonly") {
    return <ReadOnlyPill variant={variant} className={className} />;
  }
  return (
    <PureAffectsTag
      ctx={vm.effectiveScope}
      variant={variant}
      className={className}
      hideIcon={hideIcon}
      prefix={prefix}
    />
  );
}

function PureAffectsTag({
  ctx,
  variant = "save-button",
  className,
  hideIcon = false,
  prefix,
}: Omit<AffectsTagProps, "roleAware">) {
  const colors = scopeColor(ctx.level);
  const Icon = scopeIcon(ctx.level);
  const label = affectsLabel(ctx);
  const effectivePrefix = prefix === undefined ? "affects " : prefix;

  if (variant === "banner") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium",
          colors.bg,
          colors.border,
          colors.text,
          className,
        )}
        role="status"
        aria-label={`This action affects ${label}`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="leading-tight">
          <span className="opacity-75">Affects:</span>{" "}
          <span className="font-semibold">{label}</span>
        </span>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
          colors.bg,
          colors.border,
          colors.text,
          className,
        )}
        aria-label={`Affects ${label}`}
      >
        {!hideIcon && <Icon className="h-2.5 w-2.5" />}
        <span>
          {effectivePrefix}
          {label}
        </span>
      </span>
    );
  }

  // save-button variant — subscript inside a button
  return (
    <span
      className={cn(
        "ml-1 text-[10px] font-normal opacity-80 whitespace-nowrap",
        className,
      )}
      aria-label={`Affects ${label}`}
    >
      · {effectivePrefix}
      {label}
    </span>
  );
}

export default AffectsTag;
