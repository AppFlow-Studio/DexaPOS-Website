// Clover Menu Importer — shared types.
// IR shape is the contract between parser, diff, server action, and the
// import_clover_menu RPC. Keep field names in lockstep with the SQL.

export type CloverFlagCode =
  | "A" // Item name collides with existing menu_item (different external id)
  | "B" // Item has no category in Clover
  | "C" // NaN price defaulted to 0.00
  | "D" // Item references undefined modifier group
  | "E" // Item references undefined category
  | "F" // Duplicate name within the Clover file itself
  | "G" // Variant items detected (out of scope v1)
  | "H" // File hash matches a prior successful import
  | "I"; // Pre-existing unowned name match (category or modifier group)

export interface CloverFlag {
  code: CloverFlagCode;
  entity_type: "item" | "category" | "modifier_group" | "modifier_group_item" | "file";
  name?: string;
  clover_id?: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface CloverCategoryIR {
  clover_id: string;
  name: string;
  display_order?: number | null;
}

export interface CloverModifierGroupItemIR {
  clover_id: string;
  name: string;
  price_modifier: number;
}

export interface CloverModifierGroupIR {
  clover_id: string;
  name: string;
  is_required: boolean;
  min_selections: number;
  max_selections: number | null;
  items: CloverModifierGroupItemIR[];
}

export interface CloverItemIR {
  clover_id: string;
  name: string;
  price: number;
  availability: boolean;
  is_tax_exempt: boolean;
  description: string | null;
  display_order?: number | null;
  category_clover_ids: string[];
  modifier_group_clover_ids: string[];
}

export interface CloverIR {
  categories: CloverCategoryIR[];
  modifier_groups: CloverModifierGroupIR[];
  items: CloverItemIR[];
  flags: CloverFlag[];
}

export interface DiffSummary {
  will_create: { items: number; categories: number; modifier_groups: number; modifier_group_items: number };
  will_update: { items: number; categories: number; modifier_groups: number; modifier_group_items: number };
  will_skip: { items: number; categories: number; modifier_groups: number; modifier_group_items: number };
}

export interface DryRunPayload {
  ir: CloverIR;
  diff: DiffSummary;
  flags: CloverFlag[];
  // location_id intentionally absent — GATE-1 forbids it. The RPC asserts this.
}

export type ImportTarget =
  | { mode: "existing"; menu_id: string }
  | { mode: "create"; name: string; description?: string };

export type FieldUpdatePolicy = "skip" | "overwrite" | "overwrite_safe";

export interface FlagIResolution {
  entity_type: "category" | "modifier_group";
  name: string;
  resolution: "adopt" | "rename" | "skip";
}

export interface CommitOptions {
  merge_confirmed?: boolean;
  field_update_policy?: FieldUpdatePolicy;
  flag_resolutions?: { flag_i?: FlagIResolution[] };
}

export interface PreviewResponse {
  dryRunId: string;
  diff: DiffSummary;
  flags: CloverFlag[];
  available_menus: { id: string; name: string }[];
  requires_merge_confirm: boolean;
  fingerprint: string;
  file_hash: string;
}

export interface CommitResponse {
  target_menu_id: string;
  created_categories: number;
  created_modifier_groups: number;
  created_modifier_group_items: number;
  created_items: number;
  joined_item_menus: number;
  joined_menu_categories: number;
  joined_category_items: number;
  joined_item_modifier_groups: number;
}
