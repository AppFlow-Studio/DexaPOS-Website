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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name / Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Sent</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {invites.map((invite) => {
          const expired = isPast(new Date(invite.expires_at));
          const displayName =
            invite.first_name || invite.last_name
              ? `${invite.first_name ?? ""} ${invite.last_name ?? ""}`.trim()
              : invite.email;

          return (
            <TableRow key={invite.id}>
              {/* Name / email */}
              <TableCell>
                <div className="text-sm font-medium">{displayName}</div>
                {(invite.first_name || invite.last_name) && (
                  <div className="text-xs text-muted-foreground">
                    {invite.email}
                  </div>
                )}
              </TableCell>

              {/* Role */}
              <TableCell>
                <Badge variant="secondary" className="text-xs font-mono">
                  {invite.role_code}
                </Badge>
              </TableCell>

              {/* Invite type */}
              <TableCell className="text-xs text-muted-foreground">
                {inviteTypeLabel(invite.invite_type)}
              </TableCell>

              {/* Sent at */}
              <TableCell className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(invite.created_at), {
                  addSuffix: true,
                })}
              </TableCell>

              {/* Expiry */}
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

              {/* Actions */}
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => resend.mutate(invite.id)}
                      disabled={resend.isPending}
                    >
                      <RotateCw className="mr-2 h-4 w-4" />
                      Resend Invite
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => revoke.mutate(invite.id)}
                      disabled={revoke.isPending}
                      className="text-destructive focus:text-destructive"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Revoke Invite
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
