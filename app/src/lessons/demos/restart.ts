import type { MouseEvent } from "react";

/** Reset a demo and put keyboard focus back on its first option, because the button that was pressed is about to disappear. */
export function restart(e: MouseEvent<HTMLElement>, reset: () => void) {
  const frame = e.currentTarget.closest(".demo");
  reset();
  requestAnimationFrame(() => frame?.querySelector<HTMLInputElement>("input[type=radio]")?.focus());
}
