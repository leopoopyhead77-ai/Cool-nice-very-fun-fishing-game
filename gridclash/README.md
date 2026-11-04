# Grid Clash

A 1v1 shoot-and-build arena for phones, played in landscape on a **30×20 grid**.
You spawn on the left, your opponent on the right. Shoot, throw up walls, cut
windows into them, and win 3 rounds first.

Two modes today:

- **Play vs Bot (PvB)**: you against an AI opponent, on Easy, Normal or Hard.
- **2 Players, same phone (local PvP)**: lay the phone flat and play a friend,
  one player at each end.

Online play is planned; see [Online play](#online-play-next) below.

- **`dist/grid-clash.apk`**: the Android app (≈80 KB, landscape, offline, minSdk 24).
- **`dist/index.html`**: the same game as one self-contained web page.

## Install

Copy `dist/grid-clash.apk` to your phone and open it. Android will ask you to
allow installs from your browser or file manager the first time, because the
app is signed with its own key rather than coming from the Play Store.

## Controls

| | |
|---|---|
| **Left stick** (left half of the screen) | Move. The player walks in whatever direction you push. |
| **Right stick** (right half) | Drag to aim. A **transparent line shows the shot's trajectory**: where it stops on a wall, red when it will hit the enemy, a dotted arc and blast circle for the grenade launcher. **Release to shoot.** A quick tap fires with auto-aim, and dragging back to the centre cancels. |
| **BUILD** (the button above the right stick) | Turns the right stick into a **build stick**. A green ghost previews where the wall will land (red if blocked or you're out of mats). Drag to move it and release to drop it. Tap BUILD again (now labelled FIGHT) to go back to shooting. |
| **EDIT** (in build mode) | Aim at one of your walls and release to cut **one tile** out of it, making a window or door you can shoot and walk through. Release on the open tile again to restore it. Each wall can have one edited tile at a time; editing another tile moves the gap there. |
| **RESET** (in build mode) | Restores the edit on the wall you're aiming at, or on your nearest edited wall. |
| **Weapon slots** (top right) | Tap to switch guns. Tap the active one to reload. |
| **Pause** | Top-right corner, or the Android back button. |

### 2 Players on one phone (local 1v1)

Tap **2 PLAYERS** and the phone switches to portrait. **Blue plays from the bottom end and Red from the top end.** The arena runs between you, with each base at its player's end.

- Each player owns their half of the screen: **left thumb on the move stick, right thumb on the aim stick**, with BUILD above the aim stick.
- Red's controls, weapon slots / EDIT / RESET, materials, score and banners are flipped 180° so they face Red.
- Push a stick away from yourself to move or shoot toward the other player.
- Your health is the coloured strip along your end of the phone. Pause is on the left edge, at mid-screen.
- On the loadout screen, switch to the **P2 · Red** tab to pick Red's two guns.
- The menu and bot mode stay in landscape. In a desktop browser window that's wider than it is tall, 2-player puts Blue at the left end and Red at the right instead.

Keyboard and mouse also work in a browser (player 1 only): WASD to move, mouse to aim (release to
fire), B to build, E to edit, R to reset or reload, 1/2 or Q to switch weapons, Esc to pause.

## Building

- Every wall is **3 tiles in a straight line**, snapped to the grid. It always
  stands across your aim direction, so it ends up between you and what you're
  aiming at.
- A wall costs **30 mats**. You start with 90, mats regenerate at 7/s, and you
  can hold up to 300.
- Each tile has 150 HP and breaks on its own. Explosives, the minigun and the
  flamethrower are best for breaking builds, and the railgun shoots straight
  through them.

## The armory (12 guns)

Pick any two on the loadout screen.

| Gun | Tier | Style |
|---|---|---|
| Pistol | Common | fast single shots, fast reload |
| SMG | Uncommon | 6-round spray per release |
| Revolver | Uncommon | heavy, pinpoint single shots |
| Assault Rifle | Rare | 4-round burst, good at every range |
| Burst Rifle | Rare | tight 3-round burst |
| Flamethrower | Rare | short-range torrent, burns walls |
| Pump Shotgun | Epic | 9-pellet cone |
| Minigun | Epic | 14 rounds per release, melts builds |
| Grenade Launcher | Epic | lobs over walls; aim distance = throw distance |
| Sniper | Legendary | 82 damage, zero spread |
| Rocket Launcher | Legendary | explodes on contact, deletes walls |
| Railgun | Mythic | instant beam that pierces builds |

## Match rules

- First to 3 rounds wins. Each round lasts 90 seconds.
- If time runs out, the player with more health wins the round. If health is
  tied, it goes to whoever dealt more damage that round. A match is capped at 9 rounds.
- Medkits (+35 HP) spawn at the top and bottom of the centre line.

## The bot

The bot uses the same controls you do. It picks the right gun for the range,
paths around cover (a BFS search on the grid), strafes while it can see you,
throws up a wall when it gets hit, and peeks by editing a window into its own
wall, shooting, then restoring it. If it hasn't seen you for a while, it pushes
in. **Easy / Normal / Hard** change its reaction time, accuracy, target leading
and how often it builds and edits.

## Online play (next)

The simulation (`src/game.js`) is pure state plus `step()`, with no DOM and no
rendering. Each player is driven by a controller that returns the same command
format: movement, live aim, and a list of actions (`fire`, `build`, `edit`,
`reset`, `mode`, `slot`…). The touch input and the bot are two such controllers.
Online play adds a third that receives a remote player's commands from a server.
The game rules don't need to change.

## Project layout

```
src/game.js     match simulation: players, weapons, projectiles, builds, edits, rounds
src/world.js    the 30×20 grid, map, raycasts, collision, wall placement and editing
src/guns.js     the 12 guns as data
src/bot.js      PvB AI
src/input.js    twin joysticks for 1 or 2 players, BUILD / EDIT / RESET / weapon buttons, keyboard + mouse
src/render.js   canvas renderer, trajectory and build/edit previews, HUD
src/audio.js    synthesized sound effects + vibration
src/main.js     menus, loadout screen, game loop
android/        one Activity hosting the page in a full-screen WebView (landscape; portrait for 2-player)
build/          bundler, APK script, icon renderer, tests
```

## Commands (from the repo root)

```bash
npm ci
npm run clash:build   # → gridclash/dist/index.html
npm run clash:test    # bot-vs-bot sims for every gun and difficulty + touch-driven browser test (solo and 2-player)
npm run clash:apk     # → gridclash/dist/grid-clash.apk (needs Android SDK build-tools 34 + platform 34 in $ANDROID_HOME)
```

`build/apk.sh` doesn't use Gradle. It runs the SDK tools directly (aapt2, javac,
d8, zipalign, apksigner). It creates a signing key in `build/release.keystore` the
first time it runs. That file is git-ignored, so keep it if you want later builds
to install over earlier ones without uninstalling first.
