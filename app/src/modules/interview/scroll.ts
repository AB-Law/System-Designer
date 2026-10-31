/** Scroll a container so its newest content is in view. Does nothing before the element has mounted. */
export function scrollToEnd(el: { scrollTop: number; scrollHeight: number } | null): void {
  if (el) el.scrollTop = el.scrollHeight;
}
