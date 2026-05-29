import * as XLSX from "xlsx";
import type {
  CloverCategoryIR,
  CloverFlag,
  CloverIR,
  CloverItemIR,
  CloverModifierGroupIR,
  CloverModifierGroupItemIR,
} from "./types";

const REQUIRED_SHEETS = ["Items", "Modifier Groups", "Categories", "Tax Rates", "Instructions"] as const;

type Row = Record<string, unknown>;

function readSheet(wb: XLSX.WorkBook, name: string): Row[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Row>(ws, { defval: null, raw: false });
}

function cell(row: Row, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s === "" || s.toLowerCase() === "nan") continue;
    return s;
  }
  return null;
}

function num(row: Row, ...keys: string[]): number | null {
  const v = cell(row, ...keys);
  if (v === null) return null;
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function bool(row: Row, ...keys: string[]): boolean | null {
  const v = cell(row, ...keys);
  if (v === null) return null;
  const lower = v.toLowerCase();
  if (["yes", "true", "1", "y"].includes(lower)) return true;
  if (["no", "false", "0", "n"].includes(lower)) return false;
  return null;
}

export interface ParseError extends Error {
  code: "MISSING_SHEETS" | "EMPTY_FILE" | "MALFORMED";
}
function parseError(code: ParseError["code"], message: string): ParseError {
  const e = new Error(message) as ParseError;
  e.code = code;
  return e;
}

export function parseCloverWorkbook(buffer: ArrayBuffer | Buffer): CloverIR {
  const wb = XLSX.read(buffer, { type: "buffer" });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw parseError("EMPTY_FILE", "Workbook contains no sheets");
  }

  const missing = REQUIRED_SHEETS.filter((s) => !wb.SheetNames.includes(s));
  if (missing.length > 0) {
    throw parseError("MISSING_SHEETS", `Missing required Clover sheets: ${missing.join(", ")}`);
  }

  const flags: CloverFlag[] = [];

  const categories = parseCategories(readSheet(wb, "Categories"));
  const modifierGroups = parseModifierGroups(readSheet(wb, "Modifier Groups"));
  const { items, itemFlags } = parseItems(readSheet(wb, "Items"), categories, modifierGroups);
  flags.push(...itemFlags);

  return { categories: categories.list, modifier_groups: modifierGroups.list, items, flags };
}

interface CategoryIndex {
  list: CloverCategoryIR[];
  byName: Map<string, string>; // lower(name) → clover_id
  byClover: Map<string, CloverCategoryIR>;
  // Items linked to categories via Categories-sheet membership rows
  // (fill-down: a row with Item Name but no Category ID belongs to the most
  // recently seen Category ID). This is the canonical mechanism in some Clover
  // exports — without it items get inserted with no category and disappear.
  itemMembership: Map<string, Set<string>>; // lower(itemName) → Set<categoryCloverId>
}

function parseCategories(rows: Row[]): CategoryIndex {
  const list: CloverCategoryIR[] = [];
  const byName = new Map<string, string>();
  const byClover = new Map<string, CloverCategoryIR>();
  const itemMembership = new Map<string, Set<string>>();

  let currentId: string | null = null;
  let order = 0;

  for (const row of rows) {
    const id = cell(row, "Category ID");
    const name = cell(row, "Name", "Category Name");
    if (id && name) {
      currentId = id;
      if (!byClover.has(id)) {
        const cat: CloverCategoryIR = { clover_id: id, name, display_order: order++ };
        list.push(cat);
        byName.set(name.toLowerCase(), id);
        byClover.set(id, cat);
      }
    }

    if (currentId) {
      const itemName = cell(row, "Item Name", "Item");
      // Skip the header row itself (Item Name === category Name on header rows
      // is rare, but guard anyway). Only record when this row is *not* the
      // category-defining row.
      if (itemName && !(id && name)) {
        const key = itemName.toLowerCase();
        let set = itemMembership.get(key);
        if (!set) {
          set = new Set();
          itemMembership.set(key, set);
        }
        set.add(currentId);
      }
    }
  }

  return { list, byName, byClover, itemMembership };
}

interface ModifierGroupIndex {
  list: CloverModifierGroupIR[];
  byName: Map<string, string>; // lower(name) → clover_id
  byClover: Map<string, CloverModifierGroupIR>;
}

function parseModifierGroups(rows: Row[]): ModifierGroupIndex {
  const list: CloverModifierGroupIR[] = [];
  const byName = new Map<string, string>();
  const byClover = new Map<string, CloverModifierGroupIR>();

  let current: CloverModifierGroupIR | null = null;

  for (const row of rows) {
    const groupId = cell(row, "Modifier Group ID");
    const groupName = cell(row, "Name", "Modifier Group Name");

    if (groupId && groupName) {
      current = {
        clover_id: groupId,
        name: groupName,
        is_required: bool(row, "Required?", "Is Required") ?? false,
        min_selections: num(row, "Min Selections") ?? 0,
        max_selections: num(row, "Max Selections"),
        items: [],
      };
      list.push(current);
      byName.set(groupName.toLowerCase(), groupId);
      byClover.set(groupId, current);
    }

    const itemName = cell(row, "Item Name", "Modifier Name");
    if (itemName && current) {
      const itemId = `${current.clover_id}:${itemName.toLowerCase()}`;
      // Avoid dupes when the group header row also carries an item name.
      if (!current.items.find((i) => i.clover_id === itemId)) {
        current.items.push({
          clover_id: itemId,
          name: itemName,
          price_modifier: num(row, "Item Price", "Price Modifier", "Price") ?? 0,
        });
      }
    }
  }

  return { list, byName, byClover };
}

function parseItems(
  rows: Row[],
  categories: CategoryIndex,
  modifierGroups: ModifierGroupIndex,
): { items: CloverItemIR[]; itemFlags: CloverFlag[] } {
  const items: CloverItemIR[] = [];
  const flags: CloverFlag[] = [];
  const seenNames = new Map<string, string>(); // lower(name) → first clover_id

  let current: CloverItemIR | null = null;

  for (const row of rows) {
    const id = cell(row, "Clover ID", "Item ID");
    const name = cell(row, "Name", "Item Name");

    const isContinuation = !id && !name && current !== null;

    if (!isContinuation) {
      if (!id || !name) continue; // skip blank rows
      const priceRaw = cell(row, "Price");
      const priceNum = num(row, "Price");
      const priceFinal = priceNum ?? 0;

      if (priceRaw === null || priceNum === null) {
        flags.push({
          code: "C",
          entity_type: "item",
          clover_id: id,
          name,
          message: `Item "${name}" has no price; defaulted to 0.00.`,
        });
      }

      const variantAttr = cell(row, "Variant Attribute");
      if (variantAttr) {
        flags.push({
          code: "G",
          entity_type: "item",
          clover_id: id,
          name,
          message: `Item "${name}" is a variant (attribute=${variantAttr}). v1 will flatten variants to separate items.`,
        });
      }

      current = {
        clover_id: id,
        name,
        price: priceFinal,
        availability: (bool(row, "Hidden?", "Hidden") ?? false) === false,
        is_tax_exempt: (bool(row, "Default tax rates?", "Use Default Tax Rates") ?? true) === false,
        description: cell(row, "Description"),
        display_order: null,
        category_clover_ids: [],
        modifier_group_clover_ids: [],
      };
      items.push(current);

      const prev = seenNames.get(name.toLowerCase());
      if (prev && prev !== id) {
        flags.push({
          code: "F",
          entity_type: "item",
          name,
          message: `Duplicate item name "${name}" in file (Clover IDs ${prev} and ${id}).`,
          meta: { clover_ids: [prev, id] },
        });
      } else {
        seenNames.set(name.toLowerCase(), id);
      }
    }

    if (!current) continue;

    // Categories column on item row — comma-or-pipe-separated names *or* IDs.
    // Some Clover exports emit IDs here, others emit names; accept both.
    const catRaw = cell(row, "Categories", "Category");
    if (catRaw) {
      for (const token of splitList(catRaw)) {
        const cId =
          categories.byName.get(token.toLowerCase()) ??
          (categories.byClover.has(token) ? token : undefined);
        if (cId) {
          if (!current.category_clover_ids.includes(cId)) {
            current.category_clover_ids.push(cId);
          }
        } else {
          flags.push({
            code: "E",
            entity_type: "item",
            clover_id: current.clover_id,
            name: current.name,
            message: `Item "${current.name}" references unknown category "${token}".`,
          });
        }
      }
    }

    // Modifier Groups column on item row — comma-or-pipe-separated names.
    const mgRaw = cell(row, "Modifier Groups", "Modifier Group");
    if (mgRaw) {
      for (const mgName of splitList(mgRaw)) {
        const mId = modifierGroups.byName.get(mgName.toLowerCase());
        if (mId) {
          if (!current.modifier_group_clover_ids.includes(mId)) {
            current.modifier_group_clover_ids.push(mId);
          }
        } else {
          flags.push({
            code: "D",
            entity_type: "item",
            clover_id: current.clover_id,
            name: current.name,
            message: `Item "${current.name}" references unknown modifier group "${mgName}".`,
          });
        }
      }
    }
  }

  // Union with category membership rows from the Categories sheet. In real
  // Clover exports this is often the *only* link source — the Items sheet may
  // omit the Categories column, or operators may rely on the per-category
  // membership rows alone.
  if (categories.itemMembership.size > 0) {
    for (const item of items) {
      const memberOf = categories.itemMembership.get(item.name.toLowerCase());
      if (!memberOf) continue;
      for (const cId of memberOf) {
        if (!item.category_clover_ids.includes(cId)) {
          item.category_clover_ids.push(cId);
        }
      }
    }
  }

  // Drop any FLAG-E rows that the membership union now resolves — the link
  // recovered, so it's no longer a flag.
  const resolvedKeys = new Set(
    items
      .filter((i) => i.category_clover_ids.length > 0)
      .map((i) => `${i.clover_id}::${i.name.toLowerCase()}`),
  );
  const filteredFlags = flags.filter((f) => {
    if (f.code !== "E") return true;
    return !resolvedKeys.has(`${f.clover_id ?? ""}::${(f.name ?? "").toLowerCase()}`);
  });

  // FLAG-B: items still missing a category after both sources are unioned.
  for (const item of items) {
    if (item.category_clover_ids.length === 0) {
      filteredFlags.push({
        code: "B",
        entity_type: "item",
        clover_id: item.clover_id,
        name: item.name,
        message: `Item "${item.name}" has no category. It will be attached to the auto-created "Unsorted (Clover)" category so it remains visible.`,
      });
    }
  }

  return { items, itemFlags: filteredFlags };
}

function splitList(s: string): string[] {
  return s
    .split(/[,|;]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
