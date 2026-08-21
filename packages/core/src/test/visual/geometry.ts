/** Centre of an element's border box (or of a rect), in viewport pixels. */
export function centerOf(target: Element | DOMRect): { x: number, y: number } {
  const rect = target instanceof DOMRect ? target : target.getBoundingClientRect()
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 }
}

/** `getBoundingClientRect()` — read with the name the visual tests use. */
export function rectOf(target: Element): DOMRect {
  return target.getBoundingClientRect()
}
