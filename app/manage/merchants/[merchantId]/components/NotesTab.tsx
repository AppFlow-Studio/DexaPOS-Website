'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { MessageSquare, MoreHorizontal, Pencil, Pin, PinOff, Save, Trash2, X } from 'lucide-react'
import {
  useAddMerchantNote,
  useDeleteMerchantNote,
  useMerchantNotes,
  useToggleMerchantNotePin,
  useUpdateMerchantNote,
} from '@/lib/queries/use-merchant-notes'

interface NoteRecord {
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

interface NotesTabProps {
  merchantId: string
}

export function NotesTab({ merchantId }: NotesTabProps) {
  const { data: notes, isLoading, isError } = useMerchantNotes(merchantId)
  const addNoteMutation = useAddMerchantNote(merchantId)
  const updateNoteMutation = useUpdateMerchantNote(merchantId)
  const deleteNoteMutation = useDeleteMerchantNote(merchantId)
  const togglePinMutation = useToggleMerchantNotePin(merchantId)

  const [newNote, setNewNote] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    try {
      await addNoteMutation.mutateAsync(newNote.trim())
      setNewNote('')
      toast.success('Note added')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add note')
    }
  }

  const handleStartEdit = (note: NoteRecord) => {
    setEditingNoteId(note.id)
    setEditingContent(note.content)
  }

  const handleCancelEdit = () => {
    setEditingNoteId(null)
    setEditingContent('')
  }

  const handleSaveEdit = async () => {
    if (!editingNoteId) return
    if (!editingContent.trim()) {
      toast.error('Note content cannot be empty')
      return
    }

    try {
      await updateNoteMutation.mutateAsync({
        noteId: editingNoteId,
        content: editingContent.trim(),
      })
      setEditingNoteId(null)
      setEditingContent('')
      toast.success('Note updated')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update note')
    }
  }

  const handleDelete = async (noteId: string) => {
    try {
      await deleteNoteMutation.mutateAsync(noteId)
      toast.success('Note deleted')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete note')
    }
  }

  const handleTogglePin = async (note: NoteRecord) => {
    try {
      await togglePinMutation.mutateAsync({
        noteId: note.id,
        isPinned: !note.is_pinned,
      })
      toast.success(note.is_pinned ? 'Note unpinned' : 'Note pinned')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update note pin')
    }
  }

  const isBusy =
    addNoteMutation.isPending ||
    updateNoteMutation.isPending ||
    deleteNoteMutation.isPending ||
    togglePinMutation.isPending

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Merchant Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={newNote}
            onChange={(event) => setNewNote(event.target.value)}
            placeholder="Add an internal note about this merchant..."
            rows={4}
          />
          <div className="flex justify-end">
            <Button onClick={() => void handleAddNote()} disabled={!newNote.trim() || addNoteMutation.isPending}>
              {addNoteMutation.isPending ? 'Adding...' : 'Add Note'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          )}

          {isError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Unable to load notes right now.
            </div>
          )}

          {!isLoading && !isError && (!notes || notes.length === 0) && (
            <div className="rounded-md border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
              No notes yet for this merchant.
            </div>
          )}

          {(notes as NoteRecord[] | undefined)?.map((note) => (
            <div key={note.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{note.author_name}</span>
                    {note.author_role && <Badge variant="outline" className="text-[10px]">{note.author_role}</Badge>}
                    {note.is_pinned && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Pin className="mr-1 h-3 w-3" />
                        Pinned
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" disabled={isBusy}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    {note.can_edit && (
                      <DropdownMenuItem onClick={() => handleStartEdit(note)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {(note.can_delete || note.can_edit) && (
                      <DropdownMenuItem onClick={() => void handleTogglePin(note)}>
                        {note.is_pinned ? (
                          <>
                            <PinOff className="mr-2 h-4 w-4" />
                            Unpin
                          </>
                        ) : (
                          <>
                            <Pin className="mr-2 h-4 w-4" />
                            Pin
                          </>
                        )}
                      </DropdownMenuItem>
                    )}
                    {note.can_delete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => void handleDelete(note.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {editingNoteId === note.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editingContent}
                    onChange={(event) => setEditingContent(event.target.value)}
                    rows={4}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                      <X className="mr-1 h-4 w-4" />
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => void handleSaveEdit()} disabled={updateNoteMutation.isPending}>
                      <Save className="mr-1 h-4 w-4" />
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

