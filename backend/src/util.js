// Small shared helpers.

/** Normalise a date string to ISO UTC, or return null if it is not a valid date. */
export function toIso(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Parse a positive integer id from a route param, or return null. */
export function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
