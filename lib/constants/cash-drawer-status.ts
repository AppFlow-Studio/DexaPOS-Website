export type CashDrawerState = "inactive" | "open" | "closed";

export function cashDrawerStatus(
  isActive: boolean,
  isOpen: boolean,
): CashDrawerState {
  if (!isActive) return "inactive";
  return isOpen ? "open" : "closed";
}
