'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LocationFormData, US_STATES, US_TIMEZONES, BusinessHours, DayHours } from '@/types/merchant_locations'
import { Building2, MapPin, Clock, Utensils, Edit2, Globe, Layers } from 'lucide-react'

interface ReviewStepProps {
    data: LocationFormData
    onEditStep: (step: number) => void
}

function ReviewSection({
    title,
    icon: Icon,
    step,
    onEdit,
    children,
}: {
    title: string
    icon: React.ElementType
    step: number
    onEdit: (step: number) => void
    children: React.ReactNode
}) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        {title}
                    </CardTitle>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(step)}
                        className="gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                {children}
            </CardContent>
        </Card>
    )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex justify-between py-1.5 border-b last:border-0">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-sm font-medium">{value || '—'}</span>
        </div>
    )
}

function formatBusinessHours(hours: BusinessHours): { day: string; hours: string }[] {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    return days.map((day, index) => {
        const dayHours = hours[day] as DayHours | undefined
        if (!dayHours || dayHours.is_closed) {
            return { day: dayLabels[index], hours: 'Closed' }
        }

        const formatTime = (time: string) => {
            return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            })
        }

        return {
            day: dayLabels[index],
            hours: `${formatTime(dayHours.open)} - ${formatTime(dayHours.close)}`
        }
    })
}

export function ReviewStep({ data, onEditStep }: ReviewStepProps) {
    const stateName = US_STATES.find(s => s.code === data.state)?.name || data.state
    const timezoneName = US_TIMEZONES.find(t => t.value === data.timezone)?.label || data.timezone
    const formattedHours = formatBusinessHours(data.business_hours)

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-6">
                Please review the information below before creating your location.
            </p>

            {/* Basic Info */}
            <ReviewSection title="Location Info" icon={Building2} step={1} onEdit={onEditStep}>
                <div className="space-y-0">
                    <InfoRow label="Name" value={data.name} />
                    <InfoRow label="Code" value={data.code} />
                    <InfoRow label="Phone" value={data.phone} />
                    <InfoRow label="Email" value={data.email} />
                </div>
            </ReviewSection>

            {/* Address */}
            <ReviewSection title="Address" icon={MapPin} step={2} onEdit={onEditStep}>
                <div className="space-y-0">
                    <InfoRow label="Street" value={data.address_line1} />
                    {data.address_line2 && <InfoRow label="Suite/Apt" value={data.address_line2} />}
                    <InfoRow label="City" value={data.city} />
                    <InfoRow label="State" value={stateName} />
                    <InfoRow label="ZIP Code" value={data.postal_code} />
                    {data.country && data.country !== 'US' && (
                        <InfoRow label="Country" value={data.country} />
                    )}
                    <InfoRow label="Timezone" value={timezoneName} />
                </div>
            </ReviewSection>

            {/* Business Hours */}
            <ReviewSection title="Business Hours" icon={Clock} step={3} onEdit={onEditStep}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {formattedHours.map(({ day, hours }) => (
                        <div key={day} className="flex justify-between py-1">
                            <span className="text-sm text-muted-foreground">{day}</span>
                            <span className={`text-sm ${hours === 'Closed' ? 'text-muted-foreground italic' : 'font-medium'}`}>
                                {hours}
                            </span>
                        </div>
                    ))}
                </div>
            </ReviewSection>

            {/* Menu Configuration */}
            <ReviewSection title="Menu Configuration" icon={Utensils} step={4} onEdit={onEditStep}>
                <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${data.uses_global_menu ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
                        {data.uses_global_menu ? (
                            <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        ) : (
                            <Layers className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        )}
                    </div>
                    <div>
                        <div className="font-medium">
                            {data.uses_global_menu ? 'Global Menu' : 'Custom Menu'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {data.uses_global_menu
                                ? 'Uses shared menu from all locations'
                                : 'Independent menu for this location'
                            }
                        </div>
                    </div>
                    <Badge variant={data.uses_global_menu ? 'default' : 'secondary'} className="ml-auto">
                        {data.uses_global_menu ? 'Shared' : 'Independent'}
                    </Badge>
                </div>
            </ReviewSection>

            {/* Summary */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-6">
                <h4 className="font-medium text-sm mb-2">Ready to create?</h4>
                <p className="text-sm text-muted-foreground">
                    Click "Create Location" below to add <strong>{data.name}</strong> to your merchant account.
                    You'll be able to manage staff, customize the menu, and configure additional settings after creation.
                </p>
            </div>
        </div>
    )
}

