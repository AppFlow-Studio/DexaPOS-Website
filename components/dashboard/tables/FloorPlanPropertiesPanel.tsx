'use client'

import { useMemo, useEffect, useRef } from 'react'
import { FloorPlanObject } from '@/types/floor-plan'
import { useFloorPlanStore } from '@/stores/floor-plan-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  getSizeForPreset,
  inferSizePreset,
  TABLE_SIZE_PRESETS,
  TableSizePreset
} from '@/utils/tables/floor-plan-helpers'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { X, RotateCcw } from 'lucide-react'

/**
 * Borderless field material — the same tinted fill the dashboard search input
 * and dialog fields use, so a stack of them reads as one surface instead of a
 * ladder of outlined boxes.
 *
 * Written as a literal in this `.tsx` on purpose: Tailwind does not scan `.ts`
 * files, so a class sourced only from a constants module gets no CSS rule and
 * the element silently renders unstyled.
 */
const PANEL_FIELD =
  'h-10 rounded-xl border-transparent bg-muted/50 shadow-none focus-visible:bg-background'

interface FloorPlanPropertiesPanelProps {
  selectedTableId: string | null
  draftTables: FloorPlanObject[]
  onClose: () => void
}

export function FloorPlanPropertiesPanel ({
  selectedTableId,
  draftTables,
  onClose
}: FloorPlanPropertiesPanelProps) {
  const { updateTableInDraft, saveSnapshot } = useFloorPlanStore()
  const snapshotSavedRef = useRef(false)

  const selectedTable = useMemo(
    () => draftTables.find(t => t.id === selectedTableId),
    [selectedTableId, draftTables]
  )

  // Reset snapshot flag when switching tables
  useEffect(() => {
    snapshotSavedRef.current = false
  }, [selectedTableId])

  if (!selectedTable) {
    return (
      <div className='w-full sm:w-80 bg-background border-l border-border flex flex-col p-4 h-full'>
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-lg font-semibold'>Properties</h2>
          <Button variant='ghost' size='sm' onClick={onClose}>
            <X className='w-4 h-4' />
          </Button>
        </div>
        <div className='flex-1 flex items-center justify-center text-sm text-muted-foreground'>
          Select a table to edit properties
        </div>
      </div>
    )
  }

  const isTable =
    selectedTable.category === 'table' || selectedTable.category === 'booth'
  const activeSizePreset = inferSizePreset(
    selectedTable.shape_id,
    selectedTable.width,
    selectedTable.height
  )

  // Direct update helper — writes to draft store immediately
  const updateProperty = (field: string, value: unknown) => {
    if (!snapshotSavedRef.current) {
      saveSnapshot()
      snapshotSavedRef.current = true
    }
    updateTableInDraft(selectedTable.id, {
      [field]: value
    } as Partial<FloorPlanObject>)
  }

  const updateSizePreset = (preset: TableSizePreset) => {
    if (!snapshotSavedRef.current) {
      saveSnapshot()
      snapshotSavedRef.current = true
    }

    updateTableInDraft(selectedTable.id, getSizeForPreset(selectedTable.shape_id, preset))
  }

  return (
    <div className='w-full lg:w-80 bg-background border-l border-border flex flex-col h-full overflow-hidden'>
      <Card className='rounded-none border-0 shadow-none flex-1 overflow-y-auto'>
        <CardHeader className='pb-3'>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle className='text-base'>{selectedTable.name}</CardTitle>
              <CardDescription className='text-xs capitalize'>
                {selectedTable.category}
              </CardDescription>
            </div>
            <Button variant='ghost' size='sm' onClick={onClose}>
              <X className='w-4 h-4' />
            </Button>
          </div>
        </CardHeader>

        <CardContent className='space-y-6 pb-6'>
          {/* Basic Properties */}
          <div className='space-y-3'>
            <h3 className='text-sm font-semibold'>Basic</h3>

            <div className='space-y-1.5'>
              <Label className='text-sm'>Name</Label>
              <Input
                value={selectedTable.name || ''}
                onChange={e => updateProperty('name', e.target.value)}
                placeholder='Table 1'
                className={PANEL_FIELD}
              />
            </div>

            <div className='space-y-1.5'>
              <Label className='text-sm'>Label (Display)</Label>
              <Input
                value={selectedTable.label_override || ''}
                onChange={e =>
                  updateProperty('label_override', e.target.value || null)
                }
                placeholder='Max 20 chars'
                maxLength={20}
                className={PANEL_FIELD}
              />
              <p className='text-xs text-muted-foreground'>
                Short label shown on table
              </p>
            </div>

            <div className='space-y-1.5'>
              <Label className='text-sm'>Zone/Section</Label>
              <Input
                value={selectedTable.zone_name || ''}
                onChange={e =>
                  updateProperty('zone_name', e.target.value || null)
                }
                placeholder='e.g., Patio, Bar, Main'
                className={PANEL_FIELD}
              />
            </div>
          </div>

          {/* Seating Properties */}
          {isTable && (
            <>
              <div className='space-y-3'>
                <h3 className='text-sm font-semibold'>Seating</h3>

                <div className='space-y-1.5'>
                  <Label className='text-sm'>Capacity (Seats)</Label>
                  <Input
                    type='number'
                    value={selectedTable.capacity ?? ''}
                    onChange={e =>
                      updateProperty(
                        'capacity',
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                    placeholder='4'
                    min={1}
                    className={PANEL_FIELD}
                  />
                </div>

                <div className='space-y-1.5'>
                  <Label className='text-sm'>Minimum Capacity</Label>
                  <Input
                    type='number'
                    value={selectedTable.min_capacity ?? ''}
                    onChange={e =>
                      updateProperty(
                        'min_capacity',
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                    placeholder='1'
                    min={0}
                    className={PANEL_FIELD}
                  />
                </div>
              </div>

              {/* Business Rules */}
              <div className='space-y-3'>
                <h3 className='text-sm font-semibold'>Business Rules</h3>

                <div className='flex items-center space-x-2'>
                  <Checkbox
                    id='is_reservable'
                    checked={selectedTable.is_reservable ?? false}
                    onCheckedChange={checked =>
                      updateProperty('is_reservable', !!checked)
                    }
                  />
                  <Label htmlFor='is_reservable' className='cursor-pointer'>
                    Can be Reserved
                  </Label>
                </div>

                <div className='flex items-center space-x-2'>
                  <Checkbox
                    id='is_combinable'
                    checked={selectedTable.is_combinable ?? false}
                    onCheckedChange={checked =>
                      updateProperty('is_combinable', !!checked)
                    }
                  />
                  <Label htmlFor='is_combinable' className='cursor-pointer'>
                    Can be Combined
                  </Label>
                </div>

                <div className='space-y-1.5'>
                  <Label className='text-sm'>Default Turn Time (min)</Label>
                  <Input
                    type='number'
                    value={selectedTable.default_turn_time ?? ''}
                    onChange={e =>
                      updateProperty(
                        'default_turn_time',
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                    placeholder='90'
                    min={1}
                    className={PANEL_FIELD}
                  />
                  <p className='text-xs text-muted-foreground'>
                    Expected dining duration
                  </p>
                </div>
              </div>

            </>
          )}

          {/* Display Options */}
          <div className='space-y-3'>
            <h3 className='text-sm font-semibold'>Display</h3>

            <div className='space-y-1.5'>
              <Label className='text-sm'>Size</Label>
              <div className='grid grid-cols-4 gap-2'>
                {(Object.keys(TABLE_SIZE_PRESETS) as TableSizePreset[]).map(
                  preset => (
                    <Button
                      key={preset}
                      type='button'
                      variant={activeSizePreset === preset ? 'default' : 'outline'}
                      size='sm'
                      className='h-8'
                      onClick={() => updateSizePreset(preset)}
                    >
                      {preset}
                    </Button>
                  )
                )}
              </div>
            </div>

            {!isTable && (
              <div className='space-y-1.5'>
                <Label className='text-sm'>Color</Label>
                <div className='flex gap-2 items-center'>
                  <input
                    type='color'
                    value={selectedTable.color_override || '#808080'}
                    onChange={e =>
                      updateProperty('color_override', e.target.value)
                    }
                    className='w-10 h-10 rounded-xl border-0 cursor-pointer p-0.5'
                  />
                  <Input
                    value={selectedTable.color_override || ''}
                    onChange={e => {
                      const val = e.target.value
                      if (val === '') {
                        updateProperty('color_override', null)
                      } else if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                        updateProperty('color_override', val)
                      }
                    }}
                    placeholder='#3b82f6'
                    className='font-mono text-sm flex-1 h-10 rounded-xl border-transparent bg-muted/50'
                  />
                  {selectedTable.color_override && (
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-8 w-8 shrink-0'
                      onClick={() => updateProperty('color_override', null)}
                      title='Reset to default'
                    >
                      <RotateCcw className='w-3.5 h-3.5' />
                    </Button>
                  )}
                </div>
                <p className='text-xs text-muted-foreground'>
                  Pick a color or enter hex code. Clear to use default.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Footer */}
      <div className='bg-muted/50 px-4 py-2 text-xs text-muted-foreground'>
        <div className='space-y-1'>
          <div>
            ID:{' '}
            <span className='font-mono'>{selectedTable.id.slice(0, 8)}...</span>
          </div>
          <div>
            Position: ({selectedTable.x.toFixed(0)},{' '}
            {selectedTable.y.toFixed(0)})
          </div>
        </div>
      </div>
    </div>
  )
}
