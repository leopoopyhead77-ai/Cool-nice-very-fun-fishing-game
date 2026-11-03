// Durable settings. In the APK, window.AndroidStore (SharedPreferences) is used
// because file:// localStorage isn't reliable across WebView versions.

const PREFIX = "gridclash:";

export function load(key, fallback) {
  try {
    const raw = window.AndroidStore
      ? window.AndroidStore.get(PREFIX + key)
      : window.localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function save(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (window.AndroidStore) window.AndroidStore.set(PREFIX + key, raw);
    else window.localStorage.setItem(PREFIX + key, raw);
  } catch (_) { /* storage unavailable: settings just don't persist */ }
}
