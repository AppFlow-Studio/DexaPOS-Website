"use client";

import { formatDistanceToNow, isPast } from "date-fns";
import {
  Mail,
  RotateCw,
  X,
  Clock,
  AlertCircle,
  MoreHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  usePendingInvites,
  useResendInvite,
  useRevokeInvite,
} from "@/app/dashboard/hooks/useInvites";

// ============================================================================
// Helpers
// ============================================================================

function formatRoleCode(code: string): string {
  return (
    code
      .split(".")
      .pop()
      ?.replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) ?? code
  );
}

function inviteTypeLabel(type: string | null): string {
  switch (type) {
    case "clerk":
      return "Email invite";
    case "direct_clerk":
      return "Direct";
    default:
      return type ?? "—";
  }
}

// ============================================================================
// Component
// ============================================================================

export function PendingInvitesTable() {
  const { data: invites, isLoading } = usePendingInvites();
  const resend = useResendInvite();
  const revoke = useRevokeInvite();

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
      </div>
    );
  }

  if (!invites || invites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
        <Mail className="h-8 w-8 opacity-40" />
        <p className="text-sm">No pending invitations</p>
      </div>
    );
  }

  const renderInviteActions = (invite: NonNullable<typeof invites>[number]) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Invitation actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => resend.mutate(invite.id)}
          disabled={resend.isPending}
        >
          <RotateCw className="mr-2 h-4 w-4" />
          Resend invite
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => revoke.mutate(invite.id)}
          disabled={revoke.isPending}
          className="text-destructive focus:text-destructive"
        >
          <X className="mr-2 h-4 w-4" />
          Revoke invite
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="min-w-0">
      <div className="hidden overflow-hidden rounded-2xl bg-muted/20 xl:block">
        <Table className="[&_td]:px-3 [&_td]:py-3 [&_th]:px-3">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Name / Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-0">
            {invites.map((invite) => {
              const expired = isPast(new Date(invite.expires_at));
              const displayName =
                invite.first_name || invite.last_name
                  ? `${invite.first_name ?? ""} ${invite.last_name ?? ""}`.trim()
                  : invite.email;

              return (
                <TableRow
                  key={invite.id}
                  className="border-0 bg-card/70 hover:bg-muted/40"
                >
                  <TableCell>
                    <div className="text-sm font-medium">{displayName}</div>
                    {(invite.first_name || invite.last_name) && (
                      <div className="text-xs text-muted-foreground">
                        {invite.email}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="rounded-full border-0 px-2.5 text-xs"
                    >
                      {formatRoleCode(invite.role_code)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {inviteTypeLabel(invite.invite_type)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(invite.created_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs">
                      {expired ? (
                        <AlertCircle className="h-3 w-3 text-destructive" />
                      ) : (
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span
                        className={
                          expired ? "text-destructive" : "text-muted-foreground"
                        }
                      >
                        {expired
                          ? "Expired"
                          : formatDistanceToNow(new Date(invite.expires_at), {
                              addSuffix: true,
                            })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{renderInviteActions(invite)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
        {invites.map((invite) => {
          const expired = isPast(new Date(invite.expires_at));
          const displayName =
            invite.first_name || invite.last_name
              ? `${invite.first_name ?? ""} ${invite.last_name ?? ""}`.trim()
              : invite.email;

          return (
            <article
              key={invite.id}
              className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {displayName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {invite.email}
                  </p>
                </div>
                {renderInviteActions(invite)}
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
                <div className="min-w-0">
                  <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Role
                  </dt>
                  <dd className="mt-1 truncate text-sm font-medium">
                    {formatRoleCode(invite.role_code)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Type
                  </dt>
                  <dd className="mt-1 truncate text-sm font-medium">
                    {inviteTypeLabel(invite.invite_type)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Sent
                  </dt>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(invite.created_at), {
                      addSuffix: true,
                    })}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Expires
                  </dt>
                  <dd
                    className={
                      expired
                        ? "mt-1 flex items-center gap-1 text-sm text-destructive"
                        : "mt-1 flex items-center gap-1 text-sm text-muted-foreground"
                    }
                  >
                    {expired ? (
                      <AlertCircle className="h-3.5 w-3.5" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    {expired
                      ? "Expired"
                      : formatDistanceToNow(new Date(invite.expires_at), {
                          addSuffix: true,
                        })}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
}
