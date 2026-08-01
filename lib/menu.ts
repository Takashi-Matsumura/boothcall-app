// 展示会当日のコーヒーメニュー。差し替えはこのファイルのみで完結する。
export const MENU_ITEMS = [
  { id: "blend", label: "ブレンド" },
  { id: "latte", label: "カフェラテ" },
  { id: "cappuccino", label: "カプチーノ" },
] as const;

export type MenuItemId = (typeof MENU_ITEMS)[number]["id"];

export function isMenuItemId(value: unknown): value is MenuItemId {
  return (
    typeof value === "string" &&
    MENU_ITEMS.some((item) => item.id === value)
  );
}

export function menuItemLabel(id: MenuItemId): string {
  return MENU_ITEMS.find((item) => item.id === id)?.label ?? id;
}
