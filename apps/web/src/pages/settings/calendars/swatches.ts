/**
 * Colors offered for calendars. Each one stands out at least 3:1 (WCAG non-text contrast) against
 * the light background (#f9f5f2) and the dark background and surface (#16162a, #22223b), since an
 * event's bar and dot use the calendar color as is. The first two are the brand's dusty grape and
 * lilac ash, lifted or deepened just enough to pass on both.
 */
export const SWATCHES = [
  '#7d7fa3', // dusty grape, lifted
  '#8f818d', // lilac ash, deepened
  '#a6807a', // almond silk, deepened
  '#c06c84', // rose
  '#c2575b', // brick
  '#c4704f', // terracotta
  '#a87d24', // ochre
  '#7f8f34', // olive
  '#669070', // sage
  '#3b9492', // teal
  '#4f8fc0', // sky
  '#6c7fd1', // periwinkle
  '#9070c8', // violet
  '#a8649e', // plum
] as const;
