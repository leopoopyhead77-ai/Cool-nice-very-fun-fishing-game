# Anchor

An authenticator app. It holds the 2FA secret Roblox gives you and turns it
into the six-digit code Roblox asks for, offline, on your own phone — the same
job Google Authenticator or Authy does, in about 900 lines you can read.

- **`auth/dist/anchor.apk`** — the Android build. 152 KB, one Activity, no
  account, no cloud, no analytics.
- **`auth/dist/index.html`** — the same app as a single self-contained page,
  for a desktop browser.

## How an authenticator actually works

There is no network in it. Nothing is "sent" to Roblox when you log in.

1. **Setup.** Roblox generates a random secret and shows it to you once, as a
   QR code (and as a "setup key" in base32 text). Both encode the same
   `otpauth://` URI: the secret, who it belongs to, and the parameters.
2. **Storing.** Your app keeps that secret. Roblox keeps its copy. That shared
   secret is the whole relationship.
3. **Generating.** Every 30 seconds both sides compute
   `HMAC-SHA1(secret, floor(unix_time / 30))`, take a 4-byte slice of the
   result at an offset the last byte points to, and reduce it mod 10⁶. Same
   secret plus same clock gives the same six digits, so Roblox can check your
   code without either side transmitting anything.

That is [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238) (TOTP), built on
[RFC 4226](https://www.rfc-editor.org/rfc/rfc4226) (HOTP), and it is why a
wrong phone clock breaks 2FA while a dead network does not.

`src/crypto.js` and `src/totp.js` implement exactly that, and
`build/otp-test.mjs` checks them against every test vector printed in both
RFCs, plus SHA-256 and SHA-512 variants.

## Adding your Roblox account

On the web: **Settings → Account Info → Security → 2-Step Verification →
Authenticator App**. Roblox shows a QR code and a setup key. In Anchor, tap
**+** and pick whichever fits:

| | |
|---|---|
| **Scan** | Point the camera at the QR code — best when Roblox is open on a computer. |
| **Image** | Screenshot the QR code and choose the file. This is the one that works when Roblox and Anchor are on the same phone. |
| **Setup key** | Paste the base32 key from “Can’t scan the QR code?”, or a full `otpauth://` link. |

Then type the six-digit code Anchor shows back into Roblox to finish turning
2FA on, and **save the recovery codes Roblox gives you**. Anchor cannot help
you if you lose the phone; those codes can.

It reads other services' QR codes too, and imports a Google Authenticator
"transfer accounts" export (Settings → Import).

## Installing the APK

Copy `auth/dist/anchor.apk` to your phone and open it. Android asks you to
allow installs from your file manager the first time, since the app is signed
with its own key rather than distributed through Play.

Package `com.anchor.auth`, minSdk 24, targetSdk 34, portrait.

## What it does with your secrets

- They live in app-private `SharedPreferences` and go nowhere else. There is no
  sync, no backup service, no telemetry.
- **PIN lock** (Settings) encrypts the whole vault with AES-GCM under a
  PBKDF2-SHA256 key, 210 000 iterations. Forget the PIN and the accounts are
  gone — no recovery, by design.
- The window is `FLAG_SECURE`, so codes stay out of screenshots, screen
  recordings and the recent-apps thumbnail.
- Two permissions. **Camera** is for scanning and is optional — the image and
  setup-key paths never touch it. **Internet** is declared because the app
  serves its own files to the WebView over an `https://appassets.androidplatform.net/`
  origin instead of `file://`: that origin is what makes the page a secure
  context, which is the precondition for both the camera API and WebCrypto.
  Every request is answered from the APK's own assets and anything else is
  refused in `MainActivity.serveAsset`, with a `Content-Security-Policy` of
  `connect-src 'none'` over the top.
- An export (Settings → Backup) writes your secrets out in the clear, because
  that is what another authenticator needs to read. Treat it like the password
  itself.

## Building it

```bash
npm install
npm run auth:test    # RFC vectors, then the app driven in a real browser
npm run auth:build   # → auth/dist/index.html
npm run auth:apk     # → auth/dist/anchor.apk   (needs ANDROID_HOME)
npm run auth:icon    # re-renders the launcher icon
node auth/build/shots.mjs   # phone-sized screenshots into auth/dist/
```

`auth:apk` is Gradle-free: `aapt2 → javac → d8 → apksigner`, against
`build-tools;34.0.0` and `platforms;android-34`. It signs with a local
throwaway key it generates on first run.

## Layout

| | |
|---|---|
| `src/crypto.js` | SHA-1/256/512 and HMAC, in plain JS — a `file://` page has no WebCrypto, and the tests want them synchronous. |
| `src/totp.js` | base32, HOTP, TOTP, `otpauth://` parsing, Google export import. |
| `src/qr.js` | camera scanning and screenshot decoding, both via jsQR. |
| `src/vault.js` | storage, and the AES-GCM PIN lock. |
| `src/app.jsx` | the screen. |
| `android/` | the Activity, the manifest and the launcher icon. |
| `build/otp-test.mjs` | RFC 4226 / RFC 6238 vectors. |
| `build/app-test.mjs` | Playwright: add by key, add by generated QR image, reload, PIN lock, delete. |

## Known limits

- The APK is built and its manifest verified here, but it has not been run on a
  physical device from this environment. The web build is exercised end to end
  in Chromium on every `npm run auth:test`.
- HOTP accounts are supported but counter-based codes advance only when you tap
  ↻; there is no resync window.
- No encrypted export format yet — a backup is plain `otpauth://` links or JSON.
