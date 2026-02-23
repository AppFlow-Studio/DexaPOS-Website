'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AddMerchantNote,
  DeleteMerchantNote,
  GetMerchantNotes,
  ToggleNotePin,
  UpdateMerchantNote,
} from '@/app/manage/actions/merchant-notes'

function merchantNotesKey(merchantId: string) {
  return ['admin', 'merchant-notes', merchantId] as const
}

export function useMerchantNotes(merchantId: string) {
  return useQuery({
    queryKey: merchantNotesKey(merchantId),
    queryFn: () => GetMerchantNotes(merchantId),
    enabled: Boolean(merchantId),
    staleTime: 15 * 1000,
  })
}

export function useAddMerchantNote(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => AddMerchantNote(merchantId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantNotesKey(merchantId) })
      queryClient.invalidateQueries({ queryKey: ['admin', 'merchants'] })
    },
  })
}

export function useUpdateMerchantNote(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, content }: { noteId: string; content: string }) =>
      UpdateMerchantNote(noteId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantNotesKey(merchantId) })
      queryClient.invalidateQueries({ queryKey: ['admin', 'merchants'] })
    },
  })
}

export function useDeleteMerchantNote(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (noteId: string) => DeleteMerchantNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantNotesKey(merchantId) })
      queryClient.invalidateQueries({ queryKey: ['admin', 'merchants'] })
    },
  })
}

export function useToggleMerchantNotePin(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, isPinned }: { noteId: string; isPinned: boolean }) =>
      ToggleNotePin(noteId, isPinned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantNotesKey(merchantId) })
      queryClient.invalidateQueries({ queryKey: ['admin', 'merchants'] })
    },
  })
}

