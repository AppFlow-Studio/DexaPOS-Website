import { z } from 'zod'

export const FloorPlanPropertiesSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  capacity: z.number().int().positive('Capacity must be a positive number').nullable().optional(),
  min_capacity: z.number().int().nonnegative('Min capacity must be 0 or greater').nullable().optional(),
  is_reservable: z.boolean().default(false),
  is_combinable: z.boolean().default(false),
  default_turn_time: z.number().int().positive('Turn time must be positive').nullable().optional(),
  section_id: z.string().nullable().optional(),
  zone_name: z.string().max(50, 'Zone name must be less than 50 characters').nullable().optional(),
  label_override: z.string().max(20, 'Label must be less than 20 characters').nullable().optional(),
  color_override: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid color format').nullable().optional(),
})

export type FloorPlanProperties = z.infer<typeof FloorPlanPropertiesSchema>
