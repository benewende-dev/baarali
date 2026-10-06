import type { blocks } from '@x/shared';

// The thread the list opened, handed to its screen without refetching (the
// Mac has no « get one thread » channel; the list already holds it whole).
let open: blocks.GmailThread | null = null;
export const setOpenThread = (t: blocks.GmailThread) => { open = t; };
export const openThread = (id: string): blocks.GmailThread | null => (open?.threadId === id ? open : null);
