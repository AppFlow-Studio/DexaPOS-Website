import type { CloverFlag, CloverIR, DiffSummary } from "./types";

interface ExistingRow {
  id: string;
  name: string;
  source_external_id: string | null;
  source_system: string | null;
}

export interface ExistingMerchantData {
  items: ExistingRow[];
  categories: ExistingRow[];
  modifier_groups: ExistingRow[];
  modifier_group_items: (ExistingRow & { modifier_group_id: string })[];
  prior_file_hashes: { file_hash: string; committed_at: string }[];
}

export interface DiffResult {
  diff: DiffSummary;
  flags: CloverFlag[]; // FLAG-A, FLAG-H, FLAG-I additions
}

export function diffCloverAgainstMerchant(
  ir: CloverIR,
  existing: ExistingMerchantData,
  file_hash: string,
): DiffResult {
  const flags: CloverFlag[] = [];

  const diff: DiffSummary = {
    will_create: { items: 0, categories: 0, modifier_groups: 0, modifier_group_items: 0 },
    will_update: { items: 0, categories: 0, modifier_groups: 0, modifier_group_items: 0 },
    will_skip: { items: 0, categories: 0, modifier_groups: 0, modifier_group_items: 0 },
  };

  // Build lookups.
  const existingByClover = <T extends ExistingRow>(rows: T[]) =>
    new Map(rows.filter((r) => r.source_system === "clover" && r.source_external_id).map((r) => [r.source_external_id!, r]));
  const existingUnownedByName = <T extends ExistingRow>(rows: T[]) =>
    new Map(
      rows
        .filter((r) => r.source_system !== "clover")
        .map((r) => [r.name.toLowerCase(), r]),
    );
  const existingAnyByName = <T extends ExistingRow>(rows: T[]) =>
    new Map(rows.map((r) => [r.name.toLowerCase(), r]));

  // FLAG-H: file hash matches a prior successful import.
  const priorImport = existing.prior_file_hashes.find((p) => p.file_hash === file_hash);
  if (priorImport) {
    flags.push({
      code: "H",
      entity_type: "file",
      message: `You already imported this file on ${priorImport.committed_at.slice(0, 10)}. Re-running will be a no-op under the default overwrite policy.`,
      meta: { committed_at: priorImport.committed_at },
    });
  }

  // Categories
  const catsByClover = existingByClover(existing.categories);
  const catsUnownedByName = existingUnownedByName(existing.categories);
  for (const cat of ir.categories) {
    if (catsByClover.has(cat.clover_id)) {
      diff.will_update.categories += 1;
    } else {
      const unowned = catsUnownedByName.get(cat.name.toLowerCase());
      if (unowned) {
        flags.push({
          code: "I",
          entity_type: "category",
          name: cat.name,
          clover_id: cat.clover_id,
          message: `Category "${cat.name}" already exists in this merchant (created manually). Choose: adopt, rename, or skip.`,
          meta: { existing_id: unowned.id },
        });
      }
      diff.will_create.categories += 1;
    }
  }

  // Modifier groups
  const mgsByClover = existingByClover(existing.modifier_groups);
  const mgsUnownedByName = existingUnownedByName(existing.modifier_groups);
  for (const mg of ir.modifier_groups) {
    if (mgsByClover.has(mg.clover_id)) {
      diff.will_update.modifier_groups += 1;
    } else {
      const unowned = mgsUnownedByName.get(mg.name.toLowerCase());
      if (unowned) {
        flags.push({
          code: "I",
          entity_type: "modifier_group",
          name: mg.name,
          clover_id: mg.clover_id,
          message: `Modifier group "${mg.name}" already exists in this merchant (created manually). Choose: adopt, rename, or skip.`,
          meta: { existing_id: unowned.id },
        });
      }
      diff.will_create.modifier_groups += 1;
    }

    // Modifier group items: synthetic clover ids of form "<mgCloverId>:<itemNameLower>"
    const mgiByClover = existingByClover(existing.modifier_group_items);
    for (const mgi of mg.items) {
      if (mgiByClover.has(mgi.clover_id)) {
        diff.will_update.modifier_group_items += 1;
      } else {
        diff.will_create.modifier_group_items += 1;
      }
    }
  }

  // Items
  const itemsByClover = existingByClover(existing.items);
  const itemsAnyByName = existingAnyByName(existing.items);
  for (const it of ir.items) {
    if (itemsByClover.has(it.clover_id)) {
      diff.will_update.items += 1;
    } else {
      const collision = itemsAnyByName.get(it.name.toLowerCase());
      if (collision && collision.source_external_id !== it.clover_id) {
        flags.push({
          code: "A",
          entity_type: "item",
          name: it.name,
          clover_id: it.clover_id,
          message: `Item name "${it.name}" already exists in this merchant. The importer will create a new row; rename or merge first if you want a single item.`,
          meta: { existing_id: collision.id },
        });
      }
      diff.will_create.items += 1;
    }
  }

  return { diff, flags };
}
