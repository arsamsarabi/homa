// Where to put a floating panel beside an anchor (a selection or an event) so it stays on screen.

export type Box = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };

const MARGIN = 8;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/**
 * Top-left for a panel of `panel` size next to `anchor` inside `viewport`: on the inline-end side
 * (right in LTR, left in RTL) when it fits, else the other side, else centered over the anchor.
 * Always clamped inside the viewport. Without an anchor the panel sits centered near the top.
 */
export function placeBeside(
  anchor: Box | undefined,
  panel: Size,
  viewport: Size,
  rtl: boolean,
): { top: number; left: number } {
  const maxLeft = Math.max(MARGIN, viewport.width - panel.width - MARGIN);
  const maxTop = Math.max(MARGIN, viewport.height - panel.height - MARGIN);
  if (!anchor)
    return { top: clamp(80, MARGIN, maxTop), left: clamp((viewport.width - panel.width) / 2, MARGIN, maxLeft) };

  const after = anchor.left + anchor.width + MARGIN;
  const before = anchor.left - panel.width - MARGIN;
  const fitsAfter = after + panel.width + MARGIN <= viewport.width;
  const fitsBefore = before >= MARGIN;
  const left = rtl
    ? fitsBefore
      ? before
      : fitsAfter
        ? after
        : anchor.left + (anchor.width - panel.width) / 2
    : fitsAfter
      ? after
      : fitsBefore
        ? before
        : anchor.left + (anchor.width - panel.width) / 2;
  return { top: clamp(anchor.top, MARGIN, maxTop), left: clamp(left, MARGIN, maxLeft) };
}
