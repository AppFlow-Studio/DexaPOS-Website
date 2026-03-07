'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { LocationFormStep6 } from '@/types/merchant_locations'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ManagerAssignableUser } from '@/app/dashboard/actions/location-members'

interface AssignManagerStepProps {
    data: LocationFormStep6
    onChange: (data: Partial<LocationFormStep6>) => void
    errors?: Record<string, string>
    managerCandidates?: ManagerAssignableUser[]
    isLoadingCandidates?: boolean
    candidatesError?: string | null
    onRetryLoadCandidates?: () => void
}

export function AssignManagerStep({
    data,
    onChange,
    errors,
    managerCandidates = [],
    isLoadingCandidates = false,
    candidatesError = null,
    onRetryLoadCandidates,
}: AssignManagerStepProps) {
    const [isManagerPickerOpen, setIsManagerPickerOpen] = useState(false)

    const selectedManager = useMemo(
        () =>
            managerCandidates.find(
                (candidate) =>
                    candidate.email === data.existing_manager_identifier ||
                    candidate.user_id === data.existing_manager_identifier
            ) || null,
        [managerCandidates, data.existing_manager_identifier]
    )

    const managerDisplay = selectedManager
        ? `${selectedManager.full_name} (${selectedManager.email})`
        : 'Select an existing user...'

    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                Choose how you want to assign a location manager. This replaces menu setup in onboarding.
            </p>

            <div className="space-y-3">
                <Label>Manager Assignment</Label>
                <RadioGroup
                    value={data.manager_assignment_type}
                    onValueChange={(value: 'skip' | 'invite_new' | 'assign_existing') => onChange({ manager_assignment_type: value })}
                    className="space-y-2"
                >
                    <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                        <RadioGroupItem value="skip" />
                        <div>
                            <p className="text-sm font-medium">Skip for now</p>
                            <p className="text-xs text-muted-foreground">You can assign a manager later from Team settings.</p>
                        </div>
                    </label>

                    <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                        <RadioGroupItem value="invite_new" />
                        <div>
                            <p className="text-sm font-medium">Invite a new manager</p>
                            <p className="text-xs text-muted-foreground">Send an invite to someone who is not in the system yet.</p>
                        </div>
                    </label>

                    <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                        <RadioGroupItem value="assign_existing" />
                        <div>
                            <p className="text-sm font-medium">Assign an existing user</p>
                            <p className="text-xs text-muted-foreground">Use an existing team member account.</p>
                        </div>
                    </label>
                </RadioGroup>
            </div>

            {data.manager_assignment_type === 'invite_new' && (
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="manager_invite_name">Manager Name</Label>
                        <Input
                            id="manager_invite_name"
                            value={data.manager_invite_name}
                            onChange={(event) => onChange({ manager_invite_name: event.target.value })}
                            placeholder="Jane Smith"
                            className={errors?.manager_invite_name ? 'border-destructive' : ''}
                        />
                        {errors?.manager_invite_name && (
                            <p className="text-sm text-destructive">{errors.manager_invite_name}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="manager_invite_email">Manager Email</Label>
                        <Input
                            id="manager_invite_email"
                            type="email"
                            value={data.manager_invite_email}
                            onChange={(event) => onChange({ manager_invite_email: event.target.value })}
                            placeholder="manager@example.com"
                            className={errors?.manager_invite_email ? 'border-destructive' : ''}
                        />
                        {errors?.manager_invite_email && (
                            <p className="text-sm text-destructive">{errors.manager_invite_email}</p>
                        )}
                    </div>
                </div>
            )}

            {data.manager_assignment_type === 'assign_existing' && (
                <div className="space-y-2">
                    <Label htmlFor="existing_manager_identifier">Existing User</Label>
                    <Popover open={isManagerPickerOpen} onOpenChange={setIsManagerPickerOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                id="existing_manager_identifier"
                                variant="outline"
                                role="combobox"
                                aria-expanded={isManagerPickerOpen}
                                className={cn(
                                    'w-full justify-between',
                                    errors?.existing_manager_identifier ? 'border-destructive' : ''
                                )}
                            >
                                <span className="truncate text-left">{managerDisplay}</span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[420px] p-0">
                            <Command>
                                <CommandInput placeholder="Search by name or email..." />
                                <CommandList>
                                    <CommandEmpty>
                                        <div className="py-4 text-center text-sm text-muted-foreground space-y-2">
                                            {isLoadingCandidates ? (
                                                <div className="inline-flex items-center gap-2">
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Loading users...
                                                </div>
                                            ) : (
                                                'No users found in this merchant organization.'
                                            )}
                                            {!!candidatesError && (
                                                <div className="text-destructive">{candidatesError}</div>
                                            )}
                                            {onRetryLoadCandidates && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={onRetryLoadCandidates}
                                                >
                                                    Reload Users
                                                </Button>
                                            )}
                                        </div>
                                    </CommandEmpty>
                                    <CommandGroup>
                                        {managerCandidates.map((candidate) => (
                                            <CommandItem
                                                key={candidate.user_id}
                                                value={`${candidate.full_name} ${candidate.email} ${candidate.user_id}`}
                                                onSelect={() => {
                                                    onChange({ existing_manager_identifier: candidate.email || candidate.user_id })
                                                    setIsManagerPickerOpen(false)
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        'mr-2 h-4 w-4',
                                                        data.existing_manager_identifier === candidate.email ||
                                                            data.existing_manager_identifier === candidate.user_id
                                                            ? 'opacity-100'
                                                            : 'opacity-0'
                                                    )}
                                                />
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{candidate.full_name}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {candidate.email}
                                                        {candidate.role_code ? ` - ${candidate.role_code}` : ''}
                                                    </span>
                                                </div>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                    {errors?.existing_manager_identifier && (
                        <p className="text-sm text-destructive">{errors.existing_manager_identifier}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Select from users in the current merchant organization.
                    </p>
                </div>
            )}
        </div>
    )
}
