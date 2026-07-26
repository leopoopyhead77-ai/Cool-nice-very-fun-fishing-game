# Sounding Line

A Fisch-style fishing game built as a deep-sea instrument console. Cast on a
timing bar, set the hook inside a one-second window, fight the fish in a
momentum-based reel minigame, sell the hold, buy better gear, chart new water,
rebirth, repeat.

Ships two ways from one codebase:

- **`dist/index.html`** — the whole game in a single self-contained file. No
  network requests at runtime: React, both typefaces and every asset are inlined.
- **`dist/sounding-line.apk`** — an Android build that wraps the same file in a
  WebView, with saves in SharedPreferences.

## Install the APK

Copy `dist/sounding-line.apk` to your phone and open it. Android will ask you to
allow installs from your file manager or browser the first time, since the app is
signed with its own key rather than distributed through Play.

- Package `com.soundingline.fishing`, minSdk 24, targetSdk 34, portrait, offline.
- The APK is ~172 KB and asks for no permissions at all.

## Play

| | |
|---|---|
| **Cast** | A marker sweeps the power bar. Tap SET on the amber band — the bright core is a perfect drop, worth a luck bonus on that catch. |
| **Hook** | About a second after the bite. Miss it and the fish spits the hook. |
| **Reel** | Hold to drive your bracket right, release to let it fall back. It has momentum, so it overshoots. Keep the fish inside the bracket to fill the bar; the bar drains while it's outside. |
| **Sell** | The Hold tab sells one fish, everything, or everything below a rarity you pick. |

Rarer fish move faster, jitter harder and drain the bar quicker. Better rods
widen the bracket. When something big takes the bait, the console flashes before
you hook it.

## Systems

- **7 areas**, 12 named species each (84 total), own palette, own fish table, own
  rarity weights. Later water shifts the roll toward the rare end.
- **8 rarity tiers** — Common through Secret — each with a color that carries
  through the sounder trace, the result card, the hold and the bestiary.
- **9 mutations** rolled independently, from Normal to Prismatic (×120 value).
- **8 rods** trading luck, lure speed, control and value.
- **6 baits**, one consumed per cast, auto-unequipping when the stack runs out.
- **Rebirth** at a threshold that quadruples each cycle, granting tokens and a
  permanent +30% earnings per cycle. Charts, bestiary and token upgrades persist.
- **6 token upgrades** with per-level caps, each showing its current and next
  effect.

## Pacing

`npm run balance` simulates a competent player against the real engine:

```
first catch      8.8 s
Birchwood Rod    1.8 min
Grayharbor Pier  10.2 min
rebirth 1        18.5 min
rebirth 2        35.0 min
```

## Build

```bash
npm install
npm run build     # dist/index.html + dist/artifact.html
npm run apk       # dist/sounding-line.apk
npm test          # drives real cast → hook → reel → sell cycles in Chromium
npm run balance   # economy simulation
npm run fonts     # re-fetch and re-inline the typefaces
npm run icon      # re-render the launcher icons
```

The APK build is deliberately Gradle-free — the app is one Activity and a
WebView, so `aapt2 → javac → d8 → apksigner` does the whole job with no plugin
resolution and no network. It needs `ANDROID_HOME` with `build-tools;34.0.0` and
`platforms;android-34`, plus a JDK.

## Layout

```
src/data.js      fish tables, rods, baits, areas, upgrades — content only
src/engine.js    rolls, formulas, save shape — pure, no React or DOM
src/storage.js   persistence adapter (host API → Android bridge → browser)
src/game.jsx     the console: sounder canvas, minigames, tabs
src/styles.css   the instrument palette and layout
android/         manifest, MainActivity, resources
build/           bundler, APK script, icon renderer, tests, balance sim
```

## Saving

`src/storage.js` probes, in order: a host-provided artifact storage API, the
Android `SaveBridge` (SharedPreferences), then browser storage. The APK always
takes the native path. There is a reset button under Rebirth → Console.
