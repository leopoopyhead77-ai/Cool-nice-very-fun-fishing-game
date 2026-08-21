// Checks the OTP core against the vectors printed in RFC 4226 and RFC 6238.
// A wrong code here means every account in the app is locked out, so this runs
// before any build.
import { sha1, sha256, sha512, hmac } from "../src/crypto.js";
import {
  base32Decode, base32Encode, hotp, totp, codeFor, secondsRemaining,
  parseOtpauth, buildOtpauth, parseMigration, parseAny,
} from "../src/totp.js";

let failures = 0;
const enc = (s) => new TextEncoder().encode(s);
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

function eq(actual, expected, what) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) return;
  failures++;
  console.log(`FAIL ${what}\n  expected ${b}\n  actual   ${a}`);
}

function throws(fn, what) {
  try { fn(); } catch { return; }
  failures++;
  console.log(`FAIL ${what} — expected it to be rejected`);
}

// --- hashes (FIPS / RFC 2202) ---------------------------------------------
eq(hex(sha1(enc("abc"))), "a9993e364706816aba3e25717850c26c9cd0d89d", "sha1(abc)");
eq(hex(sha1(enc(""))), "da39a3ee5e6b4b0d3255bfef95601890afd80709", "sha1(empty)");
eq(hex(sha256(enc("abc"))),
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha256(abc)");
eq(hex(sha512(enc("abc"))).slice(0, 32), "ddaf35a193617abacc417349ae204131", "sha512(abc)");
// A message that crosses the 1024-bit block boundary exercises the padding.
eq(hex(sha256(enc("a".repeat(1000)))).slice(0, 16), "41edece42d63e8d9", "sha256(1000 a's)");
eq(hex(hmac("SHA1", enc("key"), enc("The quick brown fox jumps over the lazy dog"))),
  "de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9", "hmac-sha1");
// RFC 2202 case 3: a key longer than the block must be hashed down first.
eq(hex(hmac("SHA1", new Uint8Array(80).fill(0xaa), enc("Test Using Larger Than Block-Size Key - Hash Key First"))),
  "aa4ae5e15272d00e95705637ce8a3b55ed402112", "hmac-sha1 oversized key");

// --- base32 ----------------------------------------------------------------
eq(base32Encode(enc("foobar")), "MZXW6YTBOI", "base32 encode");
eq(new TextDecoder().decode(base32Decode("MZXW6YTBOI")), "foobar", "base32 decode");
eq(new TextDecoder().decode(base32Decode("mzxw 6ytb-oi")), "foobar", "base32 decode is forgiving");
eq(new TextDecoder().decode(base32Decode("MZXW6YTBOI======")), "foobar", "base32 padding");
throws(() => base32Decode("MZXW6YTB01"), "base32 rejects 0/1");
throws(() => base32Decode("   "), "base32 rejects empty");

// --- RFC 4226 appendix D ---------------------------------------------------
const hotpSecret = enc("12345678901234567890");
const rfc4226 = ["755224", "287082", "359152", "969429", "338314",
                 "254676", "287922", "162583", "399871", "520489"];
rfc4226.forEach((expected, counter) => {
  eq(hotp(hotpSecret, counter), expected, `RFC 4226 counter ${counter}`);
});

// --- RFC 6238 appendix B ---------------------------------------------------
const seed = (n) => base32Encode(enc("12345678901234567890123456789012345678901234567890123456789012345678901234567890".slice(0, n)));
const vectors = [
  [59, "SHA1", "94287082"], [59, "SHA256", "46119246"], [59, "SHA512", "90693936"],
  [1111111109, "SHA1", "07081804"], [1111111109, "SHA256", "68084774"], [1111111109, "SHA512", "25091201"],
  [1111111111, "SHA1", "14050471"], [1111111111, "SHA256", "67062674"], [1111111111, "SHA512", "99943326"],
  [1234567890, "SHA1", "89005924"], [1234567890, "SHA256", "91819424"], [1234567890, "SHA512", "93441116"],
  [2000000000, "SHA1", "69279037"], [2000000000, "SHA256", "90698825"], [2000000000, "SHA512", "38618901"],
  [20000000000, "SHA1", "65353130"], [20000000000, "SHA256", "77737706"], [20000000000, "SHA512", "47863826"],
];
const keyLen = { SHA1: 20, SHA256: 32, SHA512: 64 };
for (const [t, algorithm, expected] of vectors) {
  const account = { secret: seed(keyLen[algorithm]), algorithm, digits: 8, period: 30 };
  eq(totp(account, t * 1000), expected, `RFC 6238 ${algorithm} @ ${t}`);
}

// A 6-digit code is the same truncation, one digit column narrower.
eq(totp({ secret: seed(20), algorithm: "SHA1", digits: 6, period: 30 }, 59_000), "287082",
  "6-digit code matches the 8-digit tail");

// --- clock behaviour -------------------------------------------------------
const roblox = { secret: seed(20), algorithm: "SHA1", digits: 6, period: 30, type: "totp" };
eq(codeFor(roblox, 1_700_000_010_000), codeFor(roblox, 1_700_000_039_999), "code holds for its window");
eq(codeFor(roblox, 1_700_000_010_000) !== codeFor(roblox, 1_700_000_040_000), true, "code rolls at the boundary");
eq(secondsRemaining(1_700_000_010_000, 30), 30, "countdown is full at the boundary");
eq(secondsRemaining(1_700_000_039_000, 30), 1, "countdown reaches 1 before rollover");

// --- otpauth URIs ----------------------------------------------------------
const robloxUri = "otpauth://totp/Roblox:builderman?secret=JBSWY3DPEHPK3PXP&issuer=Roblox";
eq(parseOtpauth(robloxUri), {
  type: "totp", issuer: "Roblox", name: "builderman", secret: "JBSWY3DPEHPK3PXP",
  algorithm: "SHA1", digits: 6, period: 30, counter: 0,
}, "parses a Roblox setup link");

eq(parseOtpauth("otpauth://totp/Roblox%3A%20builderman%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Roblox&algorithm=SHA256&digits=8&period=60").name,
  "builderman@example.com", "percent-encoded label with a space");
eq(parseOtpauth("otpauth://totp/plain?secret=JBSWY3DPEHPK3PXP"), {
  type: "totp", issuer: "", name: "plain", secret: "JBSWY3DPEHPK3PXP",
  algorithm: "SHA1", digits: 6, period: 30, counter: 0,
}, "label with no issuer");
eq(parseOtpauth("otpauth://hotp/Bank:me?secret=JBSWY3DPEHPK3PXP&counter=7").counter, 7, "hotp counter");
eq(parseOtpauth("otpauth://totp/x?secret=jbswy3dp%20ehpk3pxp").secret, "JBSWY3DPEHPK3PXP", "secret is normalised");
throws(() => parseOtpauth("https://example.com"), "rejects a non-otpauth link");
throws(() => parseOtpauth("otpauth://totp/x?issuer=Roblox"), "rejects a link with no secret");
throws(() => parseOtpauth("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=MD5"), "rejects MD5");
throws(() => parseOtpauth("otpauth://totp/x?secret=NOT!BASE32"), "rejects a malformed secret");

// Round-tripping must not change the code the account produces.
const rebuilt = parseOtpauth(buildOtpauth(parseOtpauth(robloxUri)));
eq(rebuilt, parseOtpauth(robloxUri), "otpauth round-trip");

// --- bare setup keys and Google exports ------------------------------------
eq(parseAny("jbsw y3dp ehpk 3pxp")[0].secret, "JBSWY3DPEHPK3PXP", "bare setup key");
eq(parseAny(robloxUri)[0].issuer, "Roblox", "parseAny takes a link too");
// "hello there" is, by accident, all base32 letters; the length floor is what
// keeps stray text out of the vault.
throws(() => parseAny("hello there"), "parseAny rejects prose that happens to be base32");
throws(() => parseAny("not a secret!"), "parseAny rejects obvious non-secrets");
// The wrong QR code is the common mistake, so it gets its own message.
try {
  parseAny("https://www.roblox.com/login");
  failures++; console.log("FAIL parseAny rejects a plain web link");
} catch (err) {
  eq(err.message.includes("https link"), true, "names the scheme of a wrong QR code");
}

// Built from the wire format Google Authenticator emits: one TOTP entry,
// secret 0x48 0x65..., name "builderman", issuer "Roblox".
function varint(n) { const out = []; while (n > 127) { out.push((n & 127) | 128); n >>>= 7; } out.push(n); return out; }
function field(num, wire, payload) { return [...varint((num << 3) | wire), ...payload]; }
function lenDelim(num, bytes) { return field(num, 2, [...varint(bytes.length), ...bytes]); }
const secretBytes = [...base32Decode("JBSWY3DPEHPK3PXP")];
const params = [
  ...lenDelim(1, secretBytes),
  ...lenDelim(2, [...enc("builderman")]),
  ...lenDelim(3, [...enc("Roblox")]),
  ...field(4, 0, varint(1)), // SHA1
  ...field(5, 0, varint(1)), // six digits
  ...field(6, 0, varint(2)), // TOTP
];
const payload = Uint8Array.from([...lenDelim(1, params), ...field(2, 0, varint(1))]);
const migrationUri = "otpauth-migration://offline?data=" +
  encodeURIComponent(Buffer.from(payload).toString("base64"));
eq(parseMigration(migrationUri), [{
  type: "totp", issuer: "Roblox", name: "builderman", secret: "JBSWY3DPEHPK3PXP",
  algorithm: "SHA1", digits: 6, period: 30, counter: 0,
}], "reads a Google Authenticator export");
eq(parseAny(migrationUri).length, 1, "parseAny takes an export link");
throws(() => parseMigration("otpauth-migration://offline?data="), "rejects an empty export");

console.log(failures ? `\n${failures} failing check(s)` : "otp: all checks passed");
process.exit(failures ? 1 : 0);
