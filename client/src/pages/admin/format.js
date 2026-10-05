// Formatting shared by the admin pages.

// plural(1, "vote") → "1 vote"; plural(3, "entry", "entries") → "3 entries"
export const plural = (n, one, many = `${one}s`) => `${n} ${Number(n) === 1 ? one : many}`;
