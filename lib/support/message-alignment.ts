export function isSupportMessageMine(
  senderId: string,
  currentUserId: string | null | undefined,
): boolean {
  return Boolean(currentUserId && senderId === currentUserId);
}
