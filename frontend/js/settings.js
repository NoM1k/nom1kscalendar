// Per-browser preferences (selected user, theme, zoom) stored in localStorage under "ak.<key>".
// Everything is wrapped in try/catch: storage can be blocked, the app must still work.

export function loadSetting(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(`ak.${key}`)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveSetting(key, value) {
  try {
    localStorage.setItem(`ak.${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable: ignore */
  }
}
