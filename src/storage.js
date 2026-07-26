// ---------------------------------------------------------------------------
// Persistence adapter.
//
// The game runs in two hosts: a published Claude artifact and an Android
// WebView (the APK). It probes for a host-provided storage API first and only
// falls back to the WebView's own storage when none is present — the fallback
// is what makes the packaged app persist, since there is no artifact runtime
// inside an APK.
// ---------------------------------------------------------------------------

const KEY = "sounding-line/save/v1";

function hostApi() {
  const c = typeof window !== "undefined" ? window.claude : null;
  if (!c) return null;
  if (c.storage && typeof c.storage.getItem === "function" && typeof c.storage.setItem === "function") {
    return {
      get: () => c.storage.getItem(KEY),
      set: (v) => c.storage.setItem(KEY, v),
      del: () => (c.storage.removeItem ? c.storage.removeItem(KEY) : c.storage.setItem(KEY, "")),
    };
  }
  if (typeof c.getState === "function" && typeof c.setState === "function") {
    return {
      get: async () => {
        const s = await c.getState();
        return s && s[KEY];
      },
      set: async (v) => {
        const s = (await c.getState()) || {};
        await c.setState({ ...s, [KEY]: v });
      },
      del: async () => {
        const s = (await c.getState()) || {};
        delete s[KEY];
        await c.setState(s);
      },
    };
  }
  return null;
}

// The Android build injects this; SharedPreferences outlive the WebView's own
// storage, which a file:// origin cannot be trusted to keep.
function nativeApi() {
  const a = typeof window !== "undefined" ? window.AndroidStore : null;
  if (!a || typeof a.get !== "function") return null;
  return {
    get: () => a.get(KEY),
    set: (v) => a.set(KEY, v),
    del: () => a.remove(KEY),
  };
}

function webStore() {
  try {
    const ls = window.localStorage;
    ls.setItem("__probe__", "1");
    ls.removeItem("__probe__");
    return {
      get: () => ls.getItem(KEY),
      set: (v) => ls.setItem(KEY, v),
      del: () => ls.removeItem(KEY),
    };
  } catch {
    let mem = null;
    return { get: () => mem, set: (v) => (mem = v), del: () => (mem = null) };
  }
}

let backend = null;
function store() {
  if (!backend) backend = hostApi() || nativeApi() || webStore();
  return backend;
}

export async function loadSave() {
  try {
    const raw = await store().get();
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

export async function writeSave(state) {
  try {
    await store().set(JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export async function clearSave() {
  try {
    await store().del();
  } catch {
    /* nothing to clear */
  }
}

export function storageLabel() {
  if (hostApi()) return "host storage";
  return nativeApi() ? "device storage" : "browser storage";
}
