interface InvoiceLocationContext {
  selectedLocationId: string;
  activeLocationIds: string[];
  existingLocationId?: string | null;
  isEditing: boolean;
  chosenLocationId: string | null;
}

export function resolveInvoiceLocationId({
  selectedLocationId,
  activeLocationIds,
  existingLocationId,
  isEditing,
  chosenLocationId,
}: InvoiceLocationContext): string | null {
  if (chosenLocationId) return chosenLocationId;
  if (isEditing) return existingLocationId ?? null;
  if (selectedLocationId !== "all") return selectedLocationId;
  return activeLocationIds.length === 1 ? activeLocationIds[0] : null;
}
