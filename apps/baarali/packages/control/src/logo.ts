// The Baarali mark (chosen 01/10/2026): a B that looks at you, on its two
// feet. Blue #1A6DFF and white; the same drawing as the desktop app's icon
// (apps/baarali/packages/desktop/assets/brand). Inline, for the pages' CSP
// only admits their own nonce and data: images.

const BLUE = '#1A6DFF';
const WHITE = '#FFFFFF';

function shapes(mark: string, eyes: string): string {
  return (
    `<path d="M450 250 H502 C574 250 612 280 612 322 C612 345 602 360 590 368 Q584 373 590 378 C612 388 626 408 626 436 C626 476 590 502 512 502 H450 C413 502 384 473 384 436 V316 C384 279 413 250 450 250 Z" fill="${mark}"/>` +
    `<circle cx="460" cy="556" r="38" fill="${mark}"/><circle cx="552" cy="556" r="38" fill="${mark}"/>` +
    `<ellipse cx="492" cy="318" rx="21" ry="33" fill="${eyes}"/><ellipse cx="546" cy="318" rx="21" ry="33" fill="${eyes}"/>`
  );
}

/** The mark alone, `height` px tall, for a page's header. Decorative: the name sits beside it. */
export function logoMark(height: number): string {
  const width = Math.round((height * 250) / 352);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="380 246 250 352" width="${width}" height="${height}" aria-hidden="true" focusable="false">${shapes(BLUE, WHITE)}</svg>`;
}

/** The app icon, white tile and blue mark, as the tab's icon. */
export const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="230" fill="${WHITE}"/><g transform="translate(512 512) scale(1.55) translate(-505 -423)">${shapes(BLUE, WHITE)}</g></svg>`,
)}`;
