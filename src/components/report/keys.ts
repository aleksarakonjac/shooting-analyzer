/** Where the keyboard is for typing: text fields, selects, lists and menus keep their own arrow keys. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(
    el?.closest?.(
      'textarea, select, [contenteditable="true"], [role="listbox"], [role="menu"], input:not([type="radio"]):not([type="checkbox"]):not([type="range"]):not([type="button"]):not([type="color"])',
    ),
  );
}
