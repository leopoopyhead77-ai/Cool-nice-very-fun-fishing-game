// ---------------------------------------------------------------------------
// Where the secrets live.
//
// Two hosts, two stores: inside the APK the page talks to SharedPreferences
// through a JavaScript bridge (app-private, and it survives a WebView data
// wipe); in a browser it falls back to localStorage.
//
// A PIN is optional. When one is set the whole account list is encrypted with
// AES-GCM under a PBKDF2 key, so the stored blob is useless without the PIN.
// That needs WebCrypto, which exists in the APK because the app is served to
// the WebView over https rather than file://.
// ---------------------------------------------------------------------------

const KEY = "anchor/vault/v1";
const KDF_ITERATIONS = 210000;

function nativeStore() {
  const a = typeof window !== "undefined" ? window.AndroidStore : null;
  if (!a || typeof a.get !== "function") return null;
  return { get: () => a.get(KEY), set: (v) => a.set(KEY, v), del: () => a.remove(KEY) };
}

function webStore() {
  try {
    const ls = window.localStorage;
    ls.setItem("__probe__", "1");
    ls.removeItem("__probe__");
    return { get: () => ls.getItem(KEY), set: (v) => ls.setItem(KEY, v), del: () => ls.removeItem(KEY) };
  } catch {
    let mem = null;
    return { get: () => mem, set: (v) => (mem = v), del: () => (mem = null) };
  }
}

let backend = null;
function store() {
  if (!backend) backend = nativeStore() || webStore();
  return backend;
}

export function storageLabel() {
  return nativeStore() ? "device storage" : "browser storage";
}

const subtle = () =>
  (typeof crypto !== "undefined" && crypto.subtle) ? crypto.subtle : null;

/** Whether a PIN can be offered at all — it needs WebCrypto. */
export function canEncrypt() {
  return !!subtle();
}

const b64 = {
  from: (bytes) => btoa(String.fromCharCode(...bytes)),
  to: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

async function deriveKey(pin, salt, iterations) {
  const material = await subtle().importKey(
    "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export const emptyVault = () => ({
  accounts: [],
  settings: { timeOffsetMs: 0, hideCodes: false },
});

function normalize(vault) {
  const v = vault && typeof vault === "object" ? vault : {};
  return {
    accounts: Array.isArray(v.accounts) ? v.accounts : [],
    settings: { timeOffsetMs: 0, hideCodes: false, ...(v.settings || {}) },
  };
}

// Held for the life of the session so saves after an unlock do not re-ask.
let sessionKey = null;
let sessionMeta = null;

async function readContainer() {
  try {
    const raw = await store().get();
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/**
 * First read at startup. Returns one of:
 *   { status: "empty" }              — nothing stored yet
 *   { status: "ready", vault }       — stored in the clear
 *   { status: "locked" }             — needs a PIN
 */
export async function open() {
  const c = await readContainer();
  if (!c) return { status: "empty", vault: emptyVault() };
  if (c.enc) {
    sessionMeta = { salt: c.salt, iterations: c.iterations || KDF_ITERATIONS };
    return { status: "locked" };
  }
  return { status: "ready", vault: normalize(c.vault || c) };
}

/** Decrypts with a PIN. Throws when the PIN is wrong — AES-GCM tells us. */
export async function unlock(pin) {
  const c = await readContainer();
  if (!c || !c.enc) throw new Error("This vault is not locked.");
  if (!subtle()) throw new Error("This browser cannot decrypt the vault (no WebCrypto).");

  const salt = b64.to(c.salt);
  const key = await deriveKey(pin, salt, c.iterations || KDF_ITERATIONS);
  let plain;
  try {
    plain = await subtle().decrypt(
      { name: "AES-GCM", iv: b64.to(c.iv) }, key, b64.to(c.data));
  } catch {
    throw new Error("Wrong PIN.");
  }
  sessionKey = key;
  sessionMeta = { salt: c.salt, iterations: c.iterations || KDF_ITERATIONS };
  return normalize(JSON.parse(new TextDecoder().decode(plain)));
}

async function writeEncrypted(vault) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle().encrypt(
    { name: "AES-GCM", iv }, sessionKey,
    new TextEncoder().encode(JSON.stringify(vault)));
  await store().set(JSON.stringify({
    v: 1,
    enc: "pbkdf2-sha256/aes-gcm",
    iterations: sessionMeta.iterations,
    salt: sessionMeta.salt,
    iv: b64.from(iv),
    data: b64.from(new Uint8Array(data)),
  }));
}

/** Persists the vault, encrypted when a PIN is in force. */
export async function persist(vault) {
  const clean = normalize(vault);
  if (sessionKey) return writeEncrypted(clean);
  await store().set(JSON.stringify({ v: 1, enc: null, vault: clean }));
}

/** Turns a PIN on (or changes it) and rewrites the stored blob. */
export async function setPin(pin, vault) {
  if (!subtle()) throw new Error("This browser cannot encrypt the vault (no WebCrypto).");
  if (!pin || pin.length < 4) throw new Error("Use at least four characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  sessionMeta = { salt: b64.from(salt), iterations: KDF_ITERATIONS };
  sessionKey = await deriveKey(pin, salt, KDF_ITERATIONS);
  await writeEncrypted(normalize(vault));
}

/** Turns the PIN off, leaving the vault stored in the clear. */
export async function clearPin(vault) {
  sessionKey = null;
  sessionMeta = null;
  await persist(vault);
}

export function isLocked() {
  return !!sessionMeta && !sessionKey;
}

export function hasPin() {
  return !!sessionKey;
}

/** Drops the derived key; the next open() will ask for the PIN again. */
export function lockNow() {
  sessionKey = null;
}

export async function wipe() {
  sessionKey = null;
  sessionMeta = null;
  try { await store().del(); } catch { /* nothing stored */ }
}
