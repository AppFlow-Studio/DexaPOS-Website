import { z } from "zod";

export const discountFormSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    description: z.string().max(500).nullish(),
    discount_type: z.enum(["percentage", "fixed_amount"]),
    discount_value: z.number().positive("Must be greater than 0"),
    min_purchase_amount: z.number().min(0).nullish(),
    max_discount_amount: z.number().min(0).nullish(),
    start_date: z.date().nullish(),
    end_date: z.date().nullish(),
    is_active: z.boolean().default(true),
    scope: z.enum(["dine_in", "takeout", "both"]).default("both"),
    requires_manager_approval: z.boolean().default(false),
    max_uses_per_day: z.number().int().min(1).nullish(),
    max_uses_per_order: z.number().int().min(1).default(1),
    applicable_days: z
      .array(
        z.union([
          z.literal(0),
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(5),
          z.literal(6),
        ])
      )
      .default([0, 1, 2, 3, 4, 5, 6]),
    applicable_hours_start: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullish(),
    applicable_hours_end: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullish(),
    exclude_alcohol: z.boolean().default(false),
    exclude_categories: z.array(z.string().uuid()).nullish(),
    applies_to_categories: z.array(z.string().uuid()).nullish(),
    stackable: z.boolean().default(false),
    display_order: z.number().int().min(0).default(0),
    menu_item_ids: z.array(z.string().uuid()).nullish(),
  })
  .refine(
    (data) => {
      if (data.discount_type === "percentage" && data.discount_value > 100) {
        return false;
      }
      return true;
    },
    {
      message: "Percentage discount cannot exceed 100%",
      path: ["discount_value"],
    }
  )
  .refine(
    (data) => {
      if (data.start_date && data.end_date && data.end_date < data.start_date) {
        return false;
      }
      return true;
    },
    { message: "End date must be after start date", path: ["end_date"] }
  )
  .refine(
    (data) => {
      if (
        (data.applicable_hours_start && !data.applicable_hours_end) ||
        (!data.applicable_hours_start && data.applicable_hours_end)
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Both start and end time required for time window",
      path: ["applicable_hours_end"],
    }
  );

export type DiscountFormSchema = typeof discountFormSchema;
export type DiscountFormValues = z.infer<typeof discountFormSchema>;
