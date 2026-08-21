// ---------------------------------------------------------------------------
// One-time passwords: RFC 4226 (HOTP), RFC 6238 (TOTP), and the otpauth:// URI
// that a QR code carries.
//
// Roblox hands out a plain SHA-1 / 6-digit / 30-second TOTP secret, which is
// what almost every site uses; the other shapes are here so an account from
// somewhere else does not have to be retyped by hand.
// ---------------------------------------------------------------------------

import { hmac } from "./crypto.js";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decodes base32 (RFC 4648), tolerating the spaces and case sites print. */
export function base32Decode(input) {
  const clean = String(input || "")
    .toUpperCase()
    .replace(/[\s\-_.]/g, "")
    .replace(/=+$/, "");
  if (!clean) throw new Error("The secret is empty.");
  // 0/1/8/9 are the usual typos: they look like O/I/B/g but are not base32.
  const bad = clean.match(/[^A-Z2-7]/g);
  if (bad) throw new Error(`The secret has characters that are not base32: ${[...new Set(bad)].join(" ")}`);

  const out = new Uint8Array(Math.floor((clean.length * 5) / 8));
  let bits = 0, value = 0, i = 0;
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out[i++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  if (!out.length) throw new Error("The secret is too short.");
  return out;
}

export function base32Encode(bytes) {
  let out = "", bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** HOTP (RFC 4226): HMAC of the counter, dynamically truncated to N digits. */
export function hotp(secretBytes, counter, { algorithm = "SHA1", digits = 6 } = {}) {
  const msg = new Uint8Array(8);
  let hi = Math.floor(counter / 0x100000000);
  let lo = counter >>> 0;
  for (let i = 3; i >= 0; i--) { msg[i] = hi & 0xff; hi >>>= 8; }
  for (let i = 7; i >= 4; i--) { msg[i] = lo & 0xff; lo >>>= 8; }

  const mac = hmac(algorithm, secretBytes, msg);
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** The counter TOTP is on at a given moment (ms since epoch). */
export function counterAt(nowMs, period = 30) {
  return Math.floor(nowMs / 1000 / period);
}

/** TOTP (RFC 6238) for an account record at a given moment. */
export function totp(account, nowMs = Date.now()) {
  const { algorithm = "SHA1", digits = 6, period = 30 } = account;
  return hotp(base32Decode(account.secret), counterAt(nowMs, period), { algorithm, digits });
}

/** Seconds until the current code rolls over. */
export function secondsRemaining(nowMs = Date.now(), period = 30) {
  return period - Math.floor(nowMs / 1000) % period;
}

/** Produces the code for an account of either type. */
export function codeFor(account, nowMs = Date.now()) {
  if (account.type === "hotp") {
    return hotp(base32Decode(account.secret), account.counter || 0, {
      algorithm: account.algorithm || "SHA1",
      digits: account.digits || 6,
    });
  }
  return totp(account, nowMs);
}

const ALGORITHMS = ["SHA1", "SHA256", "SHA512"];

function normalizeAlgorithm(raw) {
  if (!raw) return "SHA1";
  const a = String(raw).toUpperCase().replace(/[-\s]/g, "");
  if (!ALGORITHMS.includes(a)) throw new Error(`Unsupported algorithm: ${raw}`);
  return a;
}

/**
 * Parses an otpauth:// URI — the payload of every 2FA setup QR code.
 *
 * Hand-rolled rather than `new URL`: the label sits in the path and carries
 * percent-encoded colons and spaces that URL parsing of a non-special scheme
 * handles inconsistently across the engines this ships on.
 */
export function parseOtpauth(uri) {
  const raw = String(uri || "").trim();
  const m = /^otpauth:\/\/(totp|hotp)\/?([^?]*)(?:\?(.*))?$/i.exec(raw);
  if (!m) throw new Error("That is not an otpauth:// link.");

  const type = m[1].toLowerCase();
  const label = decodeURIComponent((m[2] || "").replace(/\+/g, "%20"));
  const params = {};
  for (const pair of (m[3] || "").split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq)).toLowerCase();
    const v = eq < 0 ? "" : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, "%20"));
    params[k] = v;
  }

  if (!params.secret) throw new Error("That link has no secret in it.");
  base32Decode(params.secret); // reject a malformed secret at the door

  // "Issuer:account" is the convention; the issuer= parameter wins when both
  // are present, since the label is what humans edit and get wrong.
  let issuer = params.issuer || "";
  let name = label;
  const colon = label.indexOf(":");
  if (colon >= 0) {
    if (!issuer) issuer = label.slice(0, colon).trim();
    name = label.slice(colon + 1).trim();
  }

  const digits = params.digits ? parseInt(params.digits, 10) : 6;
  if (!(digits >= 6 && digits <= 10)) throw new Error(`Unsupported digit count: ${params.digits}`);
  const period = params.period ? parseInt(params.period, 10) : 30;
  if (!(period > 0 && period <= 300)) throw new Error(`Unsupported period: ${params.period}`);

  return {
    type,
    issuer: issuer || "",
    name: name || "",
    secret: String(params.secret).toUpperCase().replace(/[\s\-_.=]/g, ""),
    algorithm: normalizeAlgorithm(params.algorithm),
    digits,
    period,
    counter: type === "hotp" ? parseInt(params.counter || "0", 10) || 0 : 0,
  };
}

/** The inverse, for exporting an account back out to another app. */
export function buildOtpauth(a) {
  const label = a.issuer ? `${a.issuer}:${a.name || ""}` : a.name || "";
  const q = [
    `secret=${a.secret}`,
    a.issuer ? `issuer=${encodeURIComponent(a.issuer)}` : "",
    `algorithm=${a.algorithm || "SHA1"}`,
    `digits=${a.digits || 6}`,
    a.type === "hotp" ? `counter=${a.counter || 0}` : `period=${a.period || 30}`,
  ].filter(Boolean);
  return `otpauth://${a.type || "totp"}/${encodeURIComponent(label)}?${q.join("&")}`;
}

// --- Google Authenticator export ------------------------------------------
// Its "transfer accounts" QR is otpauth-migration://offline?data=<base64 of a
// protobuf>. Only the handful of fields below matter, so this reads them
// directly instead of pulling in a protobuf runtime.

const MIGRATION_ALGORITHM = { 0: "SHA1", 1: "SHA1", 2: "SHA256", 3: "SHA512" };
const MIGRATION_DIGITS = { 0: 6, 1: 6, 2: 8 };

function b64ToBytes(b64) {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = typeof atob === "function"
    ? atob(norm)
    : Buffer.from(norm, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function readVarint(buf, pos) {
  let result = 0n, shift = 0n;
  for (;;) {
    if (pos >= buf.length) throw new Error("Truncated migration payload.");
    const b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7n;
    if (shift > 63n) throw new Error("Malformed migration payload.");
  }
  return [result, pos];
}

function parseOtpParameters(buf) {
  const out = { secretBytes: null, name: "", issuer: "", algorithm: 1, digits: 1, type: 2, counter: 0 };
  let pos = 0;
  while (pos < buf.length) {
    let key;
    [key, pos] = readVarint(buf, pos);
    const field = Number(key >> 3n), wire = Number(key & 7n);
    if (wire === 2) {
      let len;
      [len, pos] = readVarint(buf, pos);
      const slice = buf.subarray(pos, pos + Number(len));
      pos += Number(len);
      if (field === 1) out.secretBytes = slice;
      else if (field === 2) out.name = new TextDecoder().decode(slice);
      else if (field === 3) out.issuer = new TextDecoder().decode(slice);
    } else if (wire === 0) {
      let v;
      [v, pos] = readVarint(buf, pos);
      if (field === 4) out.algorithm = Number(v);
      else if (field === 5) out.digits = Number(v);
      else if (field === 6) out.type = Number(v);
      else if (field === 7) out.counter = Number(v);
    } else if (wire === 5) pos += 4;
    else if (wire === 1) pos += 8;
    else throw new Error("Malformed migration payload.");
  }
  return out;
}

/** Reads an otpauth-migration:// URI into account records. */
export function parseMigration(uri) {
  const m = /^otpauth-migration:\/\/offline\?(.*)$/i.exec(String(uri || "").trim());
  if (!m) throw new Error("That is not a Google Authenticator export link.");
  const data = new URLSearchParams(m[1]).get("data");
  if (!data) throw new Error("That export link carries no data.");

  const buf = b64ToBytes(data);
  const accounts = [];
  let pos = 0;
  while (pos < buf.length) {
    let key;
    [key, pos] = readVarint(buf, pos);
    const field = Number(key >> 3n), wire = Number(key & 7n);
    if (field === 1 && wire === 2) {
      let len;
      [len, pos] = readVarint(buf, pos);
      const p = parseOtpParameters(buf.subarray(pos, pos + Number(len)));
      pos += Number(len);
      if (!p.secretBytes || !p.secretBytes.length) continue;
      accounts.push({
        type: p.type === 1 ? "hotp" : "totp",
        issuer: p.issuer || "",
        name: p.name || "",
        secret: base32Encode(p.secretBytes),
        algorithm: MIGRATION_ALGORITHM[p.algorithm] || "SHA1",
        digits: MIGRATION_DIGITS[p.digits] || 6,
        period: 30,
        counter: p.counter || 0,
      });
    } else if (wire === 2) {
      let len;
      [len, pos] = readVarint(buf, pos);
      pos += Number(len);
    } else if (wire === 0) {
      [, pos] = readVarint(buf, pos);
    } else if (wire === 5) pos += 4;
    else if (wire === 1) pos += 8;
    else throw new Error("Malformed migration payload.");
  }
  if (!accounts.length) throw new Error("That export link had no accounts in it.");
  return accounts;
}

/**
 * Accepts whatever the user actually has: a scanned otpauth link, a Google
 * export link, or the bare "setup key" a site shows next to the QR.
 */
export function parseAny(text) {
  const raw = String(text || "").trim();
  if (/^otpauth:\/\//i.test(raw)) return [parseOtpauth(raw)];
  if (/^otpauth-migration:\/\//i.test(raw)) return parseMigration(raw);

  // Scanning the wrong QR code is the common mistake — a page link, a Wi-Fi
  // code, a payment code. Say so, instead of complaining about base32.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  if (scheme) {
    throw new Error(
      `That QR code holds a ${scheme[1]} link, not a 2FA setup code. Scan the one on the 2-Step Verification page.`);
  }

  // A bare setup key. Requiring 80 bits (RFC 4226's floor, and what Roblox
  // hands out) keeps a stray line of text from being stored as a "secret"
  // that would then produce plausible-looking codes forever.
  const bytes = base32Decode(raw);
  if (bytes.length < 10) {
    throw new Error("That is too short to be a setup key — they are at least 16 characters.");
  }
  return [{
    type: "totp",
    issuer: "",
    name: "",
    secret: raw.toUpperCase().replace(/[\s\-_.=]/g, ""),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    counter: 0,
  }];
}
