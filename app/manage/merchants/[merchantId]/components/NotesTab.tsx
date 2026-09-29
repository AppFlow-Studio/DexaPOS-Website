'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  const { data: notes, isLoading, isError, refetch } = useMerchantNotes(merchantId)
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
    <div className="space-y-6">
      <Panel>
        <PanelSection icon={MessageSquare} label="Merchant Notes">
          <div className="space-y-3">
          <Textarea
            value={newNote}
            onChange={(event) => setNewNote(event.target.value)}
            placeholder="Add an internal note about this merchant..."
            rows={4}
            className="border-0 bg-muted/60 shadow-none focus-visible:bg-background dark:bg-muted/60 dark:focus-visible:bg-background"
          />
          <div className="flex justify-center sm:justify-end">
            <Button onClick={() => void handleAddNote()} disabled={!newNote.trim() || addNoteMutation.isPending}>
              {addNoteMutation.isPending ? 'Adding...' : 'Add Note'}
            </Button>
          </div>
          </div>
        </PanelSection>
      </Panel>

      <Panel>
        <PanelSection label="Recent Notes">
          <div className="space-y-3">
          {isLoading && (
            <>
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </>
          )}

          {isError && (
            <div className="rounded-2xl bg-muted/30 px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">We hit a snag loading notes for this merchant.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          )}

          {!isLoading && !isError && (!notes || notes.length === 0) && (
            <div className="rounded-2xl bg-muted/30 px-4 py-10 text-center">
              <p className="text-sm font-medium">No notes yet for this merchant</p>
              <p className="mt-1 text-xs text-muted-foreground">Notes added above appear here for the HQ team.</p>
            </div>
          )}

          {(notes as NoteRecord[] | undefined)?.map((note) => (
            <div key={note.id} className="rounded-2xl border-0 bg-muted/45 p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{note.author_name}</span>
                    {/* Plain text, not pills: this sits on a muted card (§3.5). */}
                    {note.author_role && <span className="text-xs text-muted-foreground">{note.author_role}</span>}
                    {note.is_pinned && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Pin className="h-3 w-3" />
                        Pinned
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-8 w-8 shrink-0 rounded-full p-0"
                      disabled={isBusy}
                      aria-label={`Actions for note by ${note.author_name}`}
                    >
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
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => void handleDelete(note.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {editingNoteId === note.id ? (
                <div className="space-y-2">
                  {/* `bg-background`, not the card's muted fill: this textarea
                      sits on top of a faded note card, so matching it would
                      erase the edit affordance. */}
                  <Textarea
                    value={editingContent}
                    onChange={(event) => setEditingContent(event.target.value)}
                    rows={4}
                    className="rounded-2xl border-0 bg-background dark:bg-background"
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
                <p className="text-sm whitespace-pre-wrap max-sm:hidden">{note.content}</p>
              )}
            </div>
          ))}
          </div>
        </PanelSection>
      </Panel>
    </div>
  )
}

