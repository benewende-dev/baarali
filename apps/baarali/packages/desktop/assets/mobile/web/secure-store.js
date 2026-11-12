// BAARALI(08/11/2026): Baarali in the browser. The phone keeps its secrets in
// the Keychain; the browser has no Keychain, so this page keeps them in its
// own storage (same origin only).
const read = (key) => { try { return window.localStorage.getItem(`baarali.secure.${key}`); } catch { return null; } };
export async function getItemAsync(key) { return read(key); }
export async function setItemAsync(key, value) { try { window.localStorage.setItem(`baarali.secure.${key}`, value); } catch { /* storage refused */ } }
export async function deleteItemAsync(key) { try { window.localStorage.removeItem(`baarali.secure.${key}`); } catch { /* storage refused */ } }
export function getItem(key) { return read(key); }
export function setItem(key, value) { try { window.localStorage.setItem(`baarali.secure.${key}`, value); } catch { /* storage refused */ } }
export async function isAvailableAsync() { return true; }
export const AFTER_FIRST_UNLOCK = 0;
export const WHEN_UNLOCKED = 0;
