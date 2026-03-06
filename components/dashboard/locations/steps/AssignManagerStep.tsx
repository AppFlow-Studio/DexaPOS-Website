'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { LocationFormStep6 } from '@/types/merchant_locations'

interface AssignManagerStepProps {
    data: LocationFormStep6
    onChange: (data: Partial<LocationFormStep6>) => void
    errors?: Record<string, string>
}

export function AssignManagerStep({ data, onChange, errors }: AssignManagerStepProps) {
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
                    <Label htmlFor="existing_manager_identifier">Existing User (email or user ID)</Label>
                    <Input
                        id="existing_manager_identifier"
                        value={data.existing_manager_identifier}
                        onChange={(event) => onChange({ existing_manager_identifier: event.target.value })}
                        placeholder="manager@example.com or user_..."
                        className={errors?.existing_manager_identifier ? 'border-destructive' : ''}
                    />
                    {errors?.existing_manager_identifier && (
                        <p className="text-sm text-destructive">{errors.existing_manager_identifier}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        UI is ready. Lookup and assignment logic is deferred to backend wiring.
                    </p>
                </div>
            )}
        </div>
    )
}
