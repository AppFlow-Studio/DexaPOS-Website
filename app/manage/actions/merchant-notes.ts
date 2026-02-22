'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { revalidatePath } from 'next/cache'

interface MerchantNoteRecord {
  id: string
  merchant_id: string
  author_user_id: string
  author_name: string
  author_role: string | null
  content: string
  is_pinned: boolean
  created_at: string
  updated_at: string
  can_edit: boolean
  can_delete: boolean
}

const EDIT_WINDOW_HOURS = 24

async function assertMerchantScope(
  userId: string,
  roleCode: string | undefined,
  merchantId: string
): Promise<void> {
  if (roleCode !== 'hq.manager') {
    return
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('admin_merchant_access')
    .select('id')
    .eq('admin_user_id', userId)
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) {
    throw new Error('Unauthorized: merchant not assigned to this manager')
  }
}

function canEditNote(note: { author_user_id: string; created_at: string }, userId: string): boolean {
  if (note.author_user_id !== userId) return false
  const noteCreatedAt = new Date(note.created_at).getTime()
  if (Number.isNaN(noteCreatedAt)) return false
  const diffHours = (Date.now() - noteCreatedAt) / (1000 * 60 * 60)
  return diffHours <= EDIT_WINDOW_HOURS
}

export async function GetMerchantNotes(merchantId: string): Promise<MerchantNoteRecord[]> {
  const authContext = await assertHQPermission('hq.merchant.view')
  await assertMerchantScope(authContext.userId, authContext.role?.role_code, merchantId)

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('merchant_notes')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[GetMerchantNotes] Error:', error)
    throw new Error(error.message)
  }

  const isSuperAdmin = authContext.role?.role_code === 'hq.super_admin'

  return (data || []).map((note) => ({
    ...note,
    can_edit: canEditNote(note, authContext.userId),
    can_delete: isSuperAdmin || note.author_user_id === authContext.userId,
  }))
}

export async function AddMerchantNote(merchantId: string, content: string): Promise<MerchantNoteRecord> {
  const authContext = await assertHQPermission('hq.merchant.update')
  await assertMerchantScope(authContext.userId, authContext.role?.role_code, merchantId)

  const normalizedContent = content.trim()
  if (!normalizedContent) {
    throw new Error('Note content is required.')
  }

  const supabase = createServerSupabaseClient()
  const { data: authorUser } = await supabase
    .from('users')
    .select('first_name, last_name, email')
    .eq('id', authContext.userId)
    .maybeSingle()

  const authorName = `${authorUser?.first_name || ''} ${authorUser?.last_name || ''}`.trim()
    || authorUser?.email
    || authContext.userId

  const { data, error } = await supabase
    .from('merchant_notes')
    .insert({
      merchant_id: merchantId,
      author_user_id: authContext.userId,
      author_name: authorName,
      author_role: authContext.role?.role_code || null,
      content: normalizedContent,
      is_pinned: false,
    })
    .select('*')
    .single()

  if (error || !data) {
    console.error('[AddMerchantNote] Error:', error)
    throw new Error(error?.message || 'Failed to add note.')
  }

  await logAdminAction('MERCHANT_NOTE_ADDED', {
    merchantId,
    resourceType: 'merchant_note',
    resourceId: data.id,
    resourceName: `Note by ${authorName}`,
    changes: {
      after: {
        content: normalizedContent,
        is_pinned: false,
      },
    },
    metadata: {
      source: 'AddMerchantNote',
    },
  })

  revalidatePath(`/manage/merchants/${merchantId}`)
  revalidatePath('/manage/merchants')

  return {
    ...data,
    can_edit: true,
    can_delete: true,
  }
}

export async function UpdateMerchantNote(noteId: string, content: string): Promise<MerchantNoteRecord> {
  const authContext = await assertHQPermission('hq.merchant.update')
  const normalizedContent = content.trim()

  if (!normalizedContent) {
    throw new Error('Note content is required.')
  }

  const supabase = createServerSupabaseClient()
  const { data: existingNote, error: existingError } = await supabase
    .from('merchant_notes')
    .select('*')
    .eq('id', noteId)
    .single()

  if (existingError || !existingNote) {
    throw new Error(existingError?.message || 'Note not found.')
  }

  await assertMerchantScope(authContext.userId, authContext.role?.role_code, existingNote.merchant_id)

  if (!canEditNote(existingNote, authContext.userId)) {
    throw new Error('Only the note author can edit within 24 hours.')
  }

  const { data, error } = await supabase
    .from('merchant_notes')
    .update({ content: normalizedContent })
    .eq('id', noteId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update note.')
  }

  await logAdminAction('MERCHANT_NOTE_UPDATED', {
    merchantId: data.merchant_id,
    resourceType: 'merchant_note',
    resourceId: data.id,
    resourceName: `Note by ${data.author_name}`,
    changes: {
      before: { content: existingNote.content },
      after: { content: normalizedContent },
    },
    metadata: {
      source: 'UpdateMerchantNote',
    },
  })

  revalidatePath(`/manage/merchants/${data.merchant_id}`)
  revalidatePath('/manage/merchants')

  const isSuperAdmin = authContext.role?.role_code === 'hq.super_admin'
  return {
    ...data,
    can_edit: canEditNote(data, authContext.userId),
    can_delete: isSuperAdmin || data.author_user_id === authContext.userId,
  }
}

export async function DeleteMerchantNote(noteId: string): Promise<void> {
  const authContext = await assertHQPermission('hq.merchant.update')
  const isSuperAdmin = authContext.role?.role_code === 'hq.super_admin'
  const supabase = createServerSupabaseClient()

  const { data: existingNote, error: existingError } = await supabase
    .from('merchant_notes')
    .select('*')
    .eq('id', noteId)
    .single()

  if (existingError || !existingNote) {
    throw new Error(existingError?.message || 'Note not found.')
  }

  await assertMerchantScope(authContext.userId, authContext.role?.role_code, existingNote.merchant_id)

  if (!isSuperAdmin && existingNote.author_user_id !== authContext.userId) {
    throw new Error('Only the author or a super admin can delete this note.')
  }

  const { error } = await supabase
    .from('merchant_notes')
    .delete()
    .eq('id', noteId)

  if (error) {
    throw new Error(error.message)
  }

  await logAdminAction('MERCHANT_NOTE_DELETED', {
    merchantId: existingNote.merchant_id,
    resourceType: 'merchant_note',
    resourceId: existingNote.id,
    resourceName: `Note by ${existingNote.author_name}`,
    changes: {
      before: {
        content: existingNote.content,
        is_pinned: existingNote.is_pinned,
      },
      after: {},
    },
    metadata: {
      source: 'DeleteMerchantNote',
    },
  })

  revalidatePath(`/manage/merchants/${existingNote.merchant_id}`)
  revalidatePath('/manage/merchants')
}

export async function ToggleNotePin(noteId: string, isPinned: boolean): Promise<void> {
  const authContext = await assertHQPermission('hq.merchant.update')
  const supabase = createServerSupabaseClient()

  const { data: existingNote, error: existingError } = await supabase
    .from('merchant_notes')
    .select('*')
    .eq('id', noteId)
    .single()

  if (existingError || !existingNote) {
    throw new Error(existingError?.message || 'Note not found.')
  }

  await assertMerchantScope(authContext.userId, authContext.role?.role_code, existingNote.merchant_id)

  const isSuperAdmin = authContext.role?.role_code === 'hq.super_admin'
  if (!isSuperAdmin && existingNote.author_user_id !== authContext.userId) {
    throw new Error('Only the author or a super admin can pin/unpin this note.')
  }

  const { error } = await supabase
    .from('merchant_notes')
    .update({ is_pinned: isPinned })
    .eq('id', noteId)

  if (error) {
    throw new Error(error.message)
  }

  await logAdminAction('MERCHANT_NOTE_PIN_TOGGLED', {
    merchantId: existingNote.merchant_id,
    resourceType: 'merchant_note',
    resourceId: existingNote.id,
    resourceName: `Note by ${existingNote.author_name}`,
    changes: {
      is_pinned: {
        old: Boolean(existingNote.is_pinned),
        new: isPinned,
      },
    },
    metadata: {
      source: 'ToggleNotePin',
    },
  })

  revalidatePath(`/manage/merchants/${existingNote.merchant_id}`)
  revalidatePath('/manage/merchants')
}
