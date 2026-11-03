# Sounding Line

> This repo also holds **[Grid Clash](gridclash/README.md)**, a 1v1 shoot-and-build arena
> for phones (APK at `gridclash/dist/grid-clash.apk`).

A chill Fisch-style fishing game. Cast on a timing bar, set the hook inside a
one-second window, fight the fish in a momentum-based reel minigame, sell your
bucket, buy better gear, unlock new spots, rebirth, repeat.

Each spot is a painted, gently animated scene drawn procedurally on a canvas —
a forest pond at first light, a midday beach, a mountain lake, a coral lagoon, a
marsh full of fireflies at dusk, a jungle waterfall in warm rain, and a polar
fjord under the aurora.

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
- The APK is ~200 KB and asks for no permissions at all.

## Play

| | |
|---|---|
| **Cast** | A marker sweeps the power bar. Tap SET on the green band — the bright middle is a perfect cast, worth a luck bonus on that catch. |
| **Hook** | The float dips about a second before the fish spits it. Tap then. |
| **Reel** | Hold to drive your bracket right, release to let it fall back. It has momentum, so it overshoots. Keep the fish inside the bracket to fill the bar; the bar drains while it's outside. |
| **Sell** | The Bucket tab sells one fish, everything, or everything below a rarity you pick. |

Rarer fish move faster, jitter harder and drain the bar quicker. Better rods
widen the bracket. When something big takes the bait, the screen tells you before
you hook it.

## Systems

- **7 spots**, 12 named species each (84 total), each with its own scene, palette
  and fish table. Later water shifts the roll toward the rare end.

  | | Spot | Unlocks at |
  |---|---|---|
  | 1 | Willow Pond — forest pond, early morning | free |
  | 2 | Sunny Cove — sandy beach, midday | 1.5K |
  | 3 | Pinecrest Lake — mountain lake, afternoon | 8K |
  | 4 | Coral Lagoon — tropical shallows, noon | 90K |
  | 5 | Firefly Marsh — wetland, dusk | 1M + rebirth 1 |
  | 6 | Jungle Falls — plunge pool, warm rain | 9M + rebirth 2 |
  | 7 | Aurora Fjord — polar water, night | 80M + rebirth 4 |

- **8 rarity tiers** — Common through Secret — each with a color that carries
  through the fish shadow, the result card, the bucket and the journal.
- **9 mutations** rolled independently, from Normal to Prismatic (×120 value).
- **8 rods** trading luck, lure speed, control and value.
- **6 baits**, one consumed per cast, auto-unequipping when the stack runs out.
- **Rebirth** at a threshold that quadruples each cycle, granting tokens and a
  permanent +30% earnings per cycle. Spots, journal and token upgrades persist.
- **6 token upgrades** with per-level caps, each showing its current and next
  effect.

## Pacing

`npm run balance` simulates a competent player against the real engine:

```
first catch      8.8 s
Birchwood Rod    1.8 min
Pinecrest Lake   10.2 min
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
src/data.js      fish tables, rods, baits, spots and their scenes — content only
src/engine.js    rolls, formulas, save shape — pure, no React or DOM
src/scene.js     the painted scene renderer (canvas, no images)
src/storage.js   persistence adapter (host API → Android bridge → browser)
src/game.jsx     the game itself: scene, minigames, tabs
src/styles.css   palette, type and layout
android/         manifest, MainActivity, resources
build/           bundler, APK script, icon renderer, tests, balance sim
```

## Saving

`src/storage.js` probes, in order: a host-provided artifact storage API, the
Android `SaveBridge` (SharedPreferences), then browser storage. The APK always
takes the native path. There is a reset button under Rebirth → Console.
