export function getTaxPercentageError(value: string): string | null {
  if (!value.trim()) {
    return "Tax percentage is required.";
  }

  const percentage = Number(value);
  if (!Number.isFinite(percentage)) {
    return "Enter a valid tax percentage.";
  }

  if (percentage < 0 || percentage > 100) {
    return "Tax percentage must be between 0 and 100.";
  }

  return null;
}
