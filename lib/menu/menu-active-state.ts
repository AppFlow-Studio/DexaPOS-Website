export function applyMenuActiveState<T extends { id: string; is_active: boolean }>(
  menus: readonly T[] | undefined,
  menuId: string,
  isActive: boolean,
): T[] | undefined {
  if (!menus) return undefined;
  return menus.map((menu) =>
    menu.id === menuId ? { ...menu, is_active: isActive } : menu,
  );
}

export function applySingleMenuActiveState<
  T extends { id: string; is_active: boolean },
>(menu: T | null | undefined, menuId: string, isActive: boolean): T | null | undefined {
  if (!menu || menu.id !== menuId) return menu;
  return { ...menu, is_active: isActive };
}
