'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { X, Plus, Edit2, Trash2, Loader2, Save } from 'lucide-react'
import { PhoneInput } from '@/components/ui/phone-input'
import { formatPhoneForDisplay, normalizePhone } from '@/lib/phone'
import { Skeleton } from '@/components/ui/skeleton'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'
import {
  useCustomerProfileDetails,
  useUpdateCustomerProfile,
  useCustomerNotes,
  useAddCustomerNote,
  useDeleteCustomerNote,
  useAddCustomerTag,
  useRemoveCustomerTag,
  useMerchantCustomerTags,
  useMerchantStaffProfiles
} from '../../hooks/useCustomerDetails'
import type { CustomerListItem } from '@/types/customer'

interface DetailsTabProps {
  customer: CustomerListItem | null
  merchantId: string | null
}


const DIETARY_PREFERENCES = [
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Halal',
  'Kosher',
  'Nut Allergy',
  'Dairy-Free',
  'Shellfish Allergy'
]

const SEATING_PREFERENCES = ['Indoor', 'Outdoor', 'Bar', 'Booth', 'Window']

const VIP_LEVELS = ['None', 'Silver', 'Gold', 'Platinum']

const SUGGESTED_TAGS = [
  'VIP',
  'REGULAR',
  'NEW',
  'CORPORATE',
  'FRIEND_OF_OWNER',
  'INFLUENCER',
  'COMPLAINT_HISTORY',
  'CATERING_CLIENT'
]

// Helper to display tags in user-friendly format
const formatTagForDisplay = (tag: string): string => {
  return tag
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

export function DetailsTab ({ customer, merchantId }: DetailsTabProps) {
  const customerId = customer?.id

  // Form state
  const [isEditing, setIsEditing] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [tagInput, setTagInput] = useState('')

  // Profile fields
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [birthday, setBirthday] = useState('')
  const [anniversary, setAnniversary] = useState('')
  const [dietaryPrefs, setDietaryPrefs] = useState<string[]>([])
  const [allergyNotes, setAllergyNotes] = useState('')
  const [preferredServerId, setPreferredServerId] = useState('')
  const [preferredTable, setPreferredTable] = useState('')
  const [preferredSeating, setPreferredSeating] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [vipLevel, setVipLevel] = useState('None')

  // Queries
  const { data: profileDetails, isLoading: isLoadingProfile } = useCustomerProfileDetails(customerId ?? null)
  const { data: notes } = useCustomerNotes(customerId ?? null)
  const { data: existingTags } = useMerchantCustomerTags(merchantId)
  const { data: staffProfiles } = useMerchantStaffProfiles(merchantId)
  const { data: userInfo } = useUserInfo()

  // Mutations
  const updateProfileMutation = useUpdateCustomerProfile()
  const addNoteMutation = useAddCustomerNote()
  const deleteNoteMutation = useDeleteCustomerNote()
  const addTagMutation = useAddCustomerTag()
  const removeTagMutation = useRemoveCustomerTag()

  // Initialize form with profile data
  useEffect(() => {
    if (profileDetails) {
      setName(profileDetails.name || '')
      setPhone(profileDetails.phone || '')
      setEmail(profileDetails.email || '')
      setAddress(profileDetails.address || '')
      setBirthday(profileDetails.birthday || '')
      setAnniversary(profileDetails.anniversary || '')
      setDietaryPrefs(profileDetails.dietary_preferences || [])
      setAllergyNotes(profileDetails.allergy_notes || '')
      setPreferredServerId(profileDetails.preferred_server_id || '')
      setPreferredTable(profileDetails.preferred_table || '')
      setPreferredSeating(profileDetails.preferred_seating || '')
      setCompanyName(profileDetails.company_name || '')
      setVipLevel(profileDetails.vip_level || 'None')
    }
  }, [profileDetails])

  const handleSaveProfile = async () => {
    await updateProfileMutation.mutateAsync({
      customerId: customerId!,
      updates: {
        name,
        phone: normalizePhone(phone) ?? phone || null,
        email,
        address,
        birthday: birthday || null,
        anniversary: anniversary || null,
        dietary_preferences: dietaryPrefs,
        allergy_notes: allergyNotes,
        preferred_server_id: preferredServerId || null,
        preferred_table: preferredTable,
        preferred_seating: preferredSeating,
        company_name: companyName,
        vip_level: vipLevel
      }
    })
    setIsEditing(false)
  }

  const handleAddNote = async () => {
    if (!noteText || !userInfo?.id || !merchantId) return
    await addNoteMutation.mutateAsync({
      customerId: customerId!,
      merchantId,
      content: noteText,
      createdBy: userInfo.id,
      createdByName: userInfo.name || userInfo.email || 'Unknown User'
    })
    setNoteText('')
  }

  const handleAddTag = async (tag: string) => {
    // Normalize tag to uppercase to match server-side behavior
    const normalizedTag = tag.trim().toUpperCase()
    if (!normalizedTag) return

    await addTagMutation.mutateAsync({
      customerId: customerId!,
      tag: normalizedTag
    })
    setTagInput('')
  }

  const handleRemoveTag = async (tag: string) => {
    // Tag is already uppercase from display
    await removeTagMutation.mutateAsync({
      customerId: customerId!,
      tag
    })
  }

  const handleToggleDietaryPref = (pref: string) => {
    setDietaryPrefs(prev =>
      prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]
    )
  }

  if (!customer) return null

  if (isLoadingProfile) {
    return (
      <div className='space-y-6'>
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className='h-4 w-32' />
            </CardHeader>
            <CardContent className='space-y-3'>
              <Skeleton className='h-4 w-full' />
              <Skeleton className='h-4 w-3/4' />
              <Skeleton className='h-4 w-1/2' />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!profileDetails) return null

  const customerTags = (profileDetails.tags || []).map((tag: string) =>
    tag.toUpperCase()
  )
  const suggestedNewTags = SUGGESTED_TAGS.filter(
    tag => !customerTags.includes(tag.toUpperCase())
  )

  return (
    <div className='space-y-6'>
      {/* Contact Information */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <CardTitle className='text-sm'>Contact Information</CardTitle>
          <Button
            size='sm'
            variant={isEditing ? 'secondary' : 'outline'}
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? (
              <>
                <X className='w-4 h-4 mr-2' />
                Cancel
              </>
            ) : (
              <>
                <Edit2 className='w-4 h-4 mr-2' />
                Edit
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent className='space-y-4'>
          {!isEditing ? (
            <div className='space-y-3'>
              <div>
                <p className='text-xs font-medium text-muted-foreground'>
                  Name
                </p>
                <p className='text-sm'>{name || '—'}</p>
              </div>
              <div>
                <p className='text-xs font-medium text-muted-foreground'>
                  Phone
                </p>
                <p className='text-sm'>{phone ? formatPhoneForDisplay(phone) : '—'}</p>
              </div>
              <div>
                <p className='text-xs font-medium text-muted-foreground'>
                  Email
                </p>
                <p className='text-sm'>{email || '—'}</p>
              </div>
              <div>
                <p className='text-xs font-medium text-muted-foreground'>
                  Address
                </p>
                <p className='text-sm'>{address || '—'}</p>
              </div>
            </div>
          ) : (
            <div className='space-y-3'>
              <div>
                <label className='text-sm font-medium'>Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label className='text-sm font-medium'>Phone</label>
                <PhoneInput value={phone} onChange={setPhone} />
              </div>
              <div>
                <label className='text-sm font-medium'>Email</label>
                <Input value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <label className='text-sm font-medium'>Address</label>
                <Input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personal Details */}
      <Card>
        <CardHeader>
          <CardTitle className='text-sm'>Personal Details</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {!isEditing ? (
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <p className='text-xs font-medium text-muted-foreground'>
                  Birthday
                </p>
                <p className='text-sm'>
                  {birthday ? new Date(birthday).toLocaleDateString() : '—'}
                </p>
              </div>
              <div>
                <p className='text-xs font-medium text-muted-foreground'>
                  Anniversary
                </p>
                <p className='text-sm'>
                  {anniversary
                    ? new Date(anniversary).toLocaleDateString()
                    : '—'}
                </p>
              </div>
              <div>
                <p className='text-xs font-medium text-muted-foreground'>
                  VIP Level
                </p>
                <p className='text-sm'>
                  {vipLevel && vipLevel !== 'None' ? (
                    <Badge>{vipLevel}</Badge>
                  ) : (
                    '—'
                  )}
                </p>
              </div>
              <div>
                <p className='text-xs font-medium text-muted-foreground'>
                  Company
                </p>
                <p className='text-sm'>{companyName || '—'}</p>
              </div>
            </div>
          ) : (
            <div className='space-y-3'>
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='text-sm font-medium'>Birthday</label>
                  <Input
                    type='date'
                    value={birthday}
                    onChange={e => setBirthday(e.target.value)}
                  />
                </div>
                <div>
                  <label className='text-sm font-medium'>Anniversary</label>
                  <Input
                    type='date'
                    value={anniversary}
                    onChange={e => setAnniversary(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className='text-sm font-medium'>VIP Level</label>
                <Select value={vipLevel} onValueChange={setVipLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIP_LEVELS.map(level => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className='text-sm font-medium'>Company Name</label>
                <Input
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dining Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className='text-sm'>Dining Preferences</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {!isEditing ? (
            <div className='space-y-3'>
              <div>
                <p className='text-xs font-medium text-muted-foreground'>
                  Dietary Preferences
                </p>
                <div className='flex flex-wrap gap-2 mt-1'>
                  {dietaryPrefs.length > 0 ? (
                    dietaryPrefs.map(pref => (
                      <Badge key={pref} variant='secondary'>
                        {pref}
                      </Badge>
                    ))
                  ) : (
                    <p className='text-sm text-muted-foreground'>None</p>
                  )}
                </div>
              </div>
              <div>
                <p className='text-xs font-medium text-muted-foreground'>
                  Allergy Notes
                </p>
                <p className='text-sm'>{allergyNotes || '—'}</p>
              </div>
              <div>
                <p className='text-xs font-medium text-muted-foreground'>
                  Preferred Server
                </p>
                <p className='text-sm'>
                  {staffProfiles?.find((s: any) => s.id === preferredServerId)
                    ?.display_name || '—'}
                </p>
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <p className='text-xs font-medium text-muted-foreground'>
                    Preferred Table
                  </p>
                  <p className='text-sm'>{preferredTable || '—'}</p>
                </div>
                <div>
                  <p className='text-xs font-medium text-muted-foreground'>
                    Preferred Seating
                  </p>
                  <p className='text-sm'>{preferredSeating || '—'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className='space-y-3'>
              <div>
                <label className='text-sm font-medium mb-2 block'>
                  Dietary Preferences
                </label>
                <div className='space-y-2'>
                  {DIETARY_PREFERENCES.map(pref => (
                    <label key={pref} className='flex items-center gap-2'>
                      <input
                        type='checkbox'
                        checked={dietaryPrefs.includes(pref)}
                        onChange={() => handleToggleDietaryPref(pref)}
                        className='w-4 h-4'
                      />
                      <span className='text-sm'>{pref}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className='text-sm font-medium'>Allergy Notes</label>
                <Textarea
                  value={allergyNotes}
                  onChange={e => setAllergyNotes(e.target.value)}
                  placeholder='e.g., Severe peanut allergy — alert kitchen'
                  rows={2}
                />
              </div>

              <div>
                <label className='text-sm font-medium'>Preferred Server</label>
                <Select
                  value={preferredServerId}
                  onValueChange={setPreferredServerId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select a server' />
                  </SelectTrigger>
                  <SelectContent>
                    {staffProfiles?.map((staff: any) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='text-sm font-medium'>Preferred Table</label>
                  <Input
                    value={preferredTable}
                    onChange={e => setPreferredTable(e.target.value)}
                    placeholder='e.g., Booth 3'
                  />
                </div>
                <div>
                  <label className='text-sm font-medium'>
                    Preferred Seating
                  </label>
                  <Select
                    value={preferredSeating}
                    onValueChange={setPreferredSeating}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select' />
                    </SelectTrigger>
                    <SelectContent>
                      {SEATING_PREFERENCES.map(seating => (
                        <SelectItem key={seating} value={seating}>
                          {seating}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader>
          <CardTitle className='text-sm'>Tags</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='flex flex-wrap gap-2'>
            {customerTags.map((tag: string) => (
              <Badge key={tag} variant='secondary'>
                {formatTagForDisplay(tag)}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  disabled={removeTagMutation.isPending}
                  className='ml-1'
                >
                  <X className='w-3 h-3' />
                </button>
              </Badge>
            ))}
          </div>

          <div className='space-y-3'>
            {/* Suggested Tags Dropdown */}
            <div>
              <label className='text-sm font-medium mb-2 block'>Suggested Tags</label>
              <Select onValueChange={(value) => {
                if (value) {
                  handleAddTag(value)
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder='Select from suggested tags...' />
                </SelectTrigger>
                <SelectContent>
                  {suggestedNewTags.length > 0 ? (
                    suggestedNewTags.map(tag => (
                      <SelectItem key={tag} value={tag}>
                        {formatTagForDisplay(tag)}
                      </SelectItem>
                    ))
                  ) : (
                    <div className='text-xs text-muted-foreground p-2'>
                      All suggested tags added
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Custom Tag Input */}
            <div>
              <label className='text-sm font-medium mb-2 block'>Custom Tag</label>
              <div className='flex gap-2'>
                <Input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  placeholder='Create a custom tag...'
                  onKeyPress={e => {
                    if (e.key === 'Enter' && tagInput) {
                      handleAddTag(tagInput)
                    }
                  }}
                />
                <Button
                  onClick={() => handleAddTag(tagInput)}
                  disabled={!tagInput || addTagMutation.isPending}
                  size='sm'
                >
                  {addTagMutation.isPending ? (
                    <Loader2 className='w-4 h-4 animate-spin' />
                  ) : (
                    <Plus className='w-4 h-4' />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className='text-sm'>Notes</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {/* Add Note */}
          <div className='space-y-2'>
            <Textarea
              placeholder='Add a note...'
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={2}
            />
            <Button
              onClick={handleAddNote}
              disabled={!noteText || addNoteMutation.isPending}
              className='w-full'
            >
              {addNoteMutation.isPending ? (
                <>
                  <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className='w-4 h-4 mr-2' />
                  Add Note
                </>
              )}
            </Button>
          </div>

          {/* Notes List */}
          {notes && notes.length > 0 && (
            <div className='space-y-2 pt-4 border-t'>
              {notes.map((note: any) => (
                <div
                  key={note.id}
                  className='bg-muted/30 p-3 rounded-lg border border-muted/50 hover:bg-muted/50 transition-colors'
                >
                  <div className='flex items-start justify-between gap-2'>
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm text-foreground whitespace-pre-wrap break-word'>
                        {note.content}
                      </p>
                      <p className='text-xs text-muted-foreground mt-2'>
                        <span className='font-medium'>
                          {note.created_by_name}
                        </span>
                        {' • '}
                        <time>
                          {new Date(note.created_at).toLocaleDateString(
                            'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }
                          )}
                        </time>
                      </p>
                    </div>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='h-7 w-7 p-0 shrink-0'
                      onClick={() => deleteNoteMutation.mutate(note.id)}
                      disabled={deleteNoteMutation.isPending}
                      title='Delete note'
                    >
                      <Trash2 className='w-3.5 h-3.5' />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(!notes || notes.length === 0) && (
            <p className='text-sm text-muted-foreground text-center py-4'>
              No notes yet
            </p>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      {isEditing && (
        <div className='fixed bottom-4 right-4 flex gap-2'>
          <Button
            onClick={handleSaveProfile}
            disabled={updateProfileMutation.isPending}
          >
            {updateProfileMutation.isPending ? (
              <>
                <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                Saving...
              </>
            ) : (
              <>
                <Save className='w-4 h-4 mr-2' />
                Save Changes
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
