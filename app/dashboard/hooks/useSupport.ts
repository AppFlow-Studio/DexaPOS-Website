"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useClerkOrgId } from "./useLocationScoped";
import {
  GetMyTickets,
  GetTicketDetail,
  CreateTicket,
  AddMessage,
  ReopenTicket,
} from "../actions/support";
import { TicketStatus, TicketCategory } from "@/types/support-ticket";
import { toast } from "sonner";

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useMyTickets(
  status?: TicketStatus | "all",
  limit: number = 20,
  offset: number = 0
) {
  const clerkOrgId = useClerkOrgId();

  return useQuery({
    queryKey: ["support-tickets", clerkOrgId, status, limit, offset],
    queryFn: () => {
      if (!clerkOrgId) return { data: [], total: 0 };
      return GetMyTickets(clerkOrgId, status, limit, offset);
    },
    enabled: !!clerkOrgId,
  });
}

export function useTicketDetail(ticketId: string | null) {
  const clerkOrgId = useClerkOrgId();

  return useQuery({
    queryKey: ["support-ticket", clerkOrgId, ticketId],
    queryFn: () => {
      if (!clerkOrgId || !ticketId) return { data: undefined };
      return GetTicketDetail(clerkOrgId, ticketId);
    },
    enabled: !!clerkOrgId && !!ticketId,
    refetchInterval: 30_000, // Poll every 30s for new messages
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useCreateTicket() {
  const clerkOrgId = useClerkOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      subject: string;
      description: string;
      category: TicketCategory;
      locationId?: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!clerkOrgId) throw new Error("Not authenticated");
      return CreateTicket(clerkOrgId, input);
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Failed to submit ticket", { description: result.error });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["support-tickets", clerkOrgId] });
      toast.success("Ticket submitted!", {
        description: `Your ticket ${result.data?.ticket_number} has been created.`,
      });
    },
    onError: () => {
      toast.error("Failed to submit ticket");
    },
  });
}

export function useAddMessage(ticketId: string) {
  const clerkOrgId = useClerkOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (message: string) => {
      if (!clerkOrgId) throw new Error("Not authenticated");
      return AddMessage(clerkOrgId, ticketId, message);
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Failed to send message", { description: result.error });
        return;
      }
      queryClient.invalidateQueries({
        queryKey: ["support-ticket", clerkOrgId, ticketId],
      });
    },
    onError: () => {
      toast.error("Failed to send message");
    },
  });
}

export function useReopenTicket() {
  const clerkOrgId = useClerkOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ticketId: string) => {
      if (!clerkOrgId) throw new Error("Not authenticated");
      return ReopenTicket(clerkOrgId, ticketId);
    },
    onSuccess: (result, ticketId) => {
      if (result.error) {
        toast.error("Failed to reopen ticket", { description: result.error });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["support-tickets", clerkOrgId] });
      queryClient.invalidateQueries({
        queryKey: ["support-ticket", clerkOrgId, ticketId],
      });
      toast.success("Ticket reopened");
    },
  });
}
