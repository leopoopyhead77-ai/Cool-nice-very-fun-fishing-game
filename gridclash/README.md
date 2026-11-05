# Grid Clash

A shoot-and-build arena for phones on a **30×20 grid**. Shoot, throw up walls,
cut windows into them, and win 3 rounds first.

It ships as **two separate apps** built from one codebase. They have different
package names, so you can install both:

| App | File | What's in it |
|---|---|---|
| **Grid Clash** | `dist/grid-clash.apk` (`com.gridclash.game`) | **2 Players on one phone** (upright, one player at each end) and **Play vs Bot** (Easy, Normal or Hard). Works offline. |
| **Grid Clash Online** | `dist/grid-clash-online.apk` (`com.gridclash.online`) | **Online** between phones on any network, mobile data included. Modes: **1v1**, **2v2**, and free-for-all **1v1v1** and **1v1v1v1**. One player hosts; everyone else joins with a **6-digit PIN**. Empty seats get bots. |

Each app also exists as a single self-contained web page: `dist/index.html` and `dist/online/index.html`.

## iPhone (no App Store needed)

iPhones can't install APKs, so both games also come as **web apps** that you install from Safari. The website is built into [`/docs`](../docs) and hosted free on GitHub Pages:

**https://leopoopyhead77-ai.github.io/Cool-nice-very-fun-fishing-game/**

1. Open that link in **Safari** on the iPhone and tap a game.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open it from the home screen. It runs full screen like an app, stays clear of the notch and home bar, and the local game works offline.

Online rooms work across platforms: iPhones on the website and Android phones with the APK can play in the same room with the same PIN.

**One-time setup (repo owner):** turn on GitHub Pages in the repo's **Settings → Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, **Branch** to `claude/two-player-game-shoot-build-lw3edo`, and **Folder** to `/docs`, then click **Save**. After that, the link above goes live within a minute or two. If the branch is merged into another branch later, point Pages at that branch instead.

Any static host works too. For example, you can drag the `docs` folder onto [app.netlify.com/drop](https://app.netlify.com/drop) to get a link instantly.

## Install

Copy `dist/grid-clash.apk` and/or `dist/grid-clash-online.apk` to your phone and open them. Android will ask you to
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

## Online play

**How to play online** (in Grid Clash Online):

1. Everyone taps **PLAY ONLINE** and types a name.
2. The host picks a mode (**1v1**, **2v2**, **1v1v1** or **1v1v1v1**), taps **Host a room**, and reads out the 6-digit PIN.
3. Everyone else types the PIN and taps **Join with PIN**. They appear in the lobby.
4. The host taps **Start match**. Empty seats are played by bots (using the Bots difficulty on the main menu).

| Mode | Players | Teams |
|---|---|---|
| 1v1 | 2 | blue vs red |
| 2v2 | up to 4 | blue vs red. The first joiner plays red, so two humans are never stuck together against bots. |
| 1v1v1 | 3 | free-for-all: blue, red, green. Spawns are in a wide triangle. |
| 1v1v1v1 | 4 | free-for-all: blue, red, green, yellow. Spawns are in the four corners. |

In free-for-all, a round ends when only one player is left standing. If time runs out, the round goes to whoever has the most health (then the most damage dealt that round). The first to 3 rounds wins. Each player gets their own colour, wall colour and score chip.

### How it works without a game server

- **The relay:** phones on mobile data can't accept incoming connections, because carriers put them behind NAT. So every phone connects *out* to a free public relay (an MQTT broker reached over secure websockets).
  - The default relay is `public.cloud.shiftr.io` on port 443, which works on practically any network.
  - `broker.emqx.io` and `broker.hivemq.com` are automatic fallbacks.
  - The first digit of the room PIN tells joiners which relay the room is on.
- **Direct link:** each guest also tries a direct WebRTC link to the host. If the carrier allows it, gameplay switches to that link for lower latency. If not, everything keeps going through the relay.
  - The in-game status line shows `direct` or `relay` and the round-trip time.
- **The host:** the room creator's phone runs the real match. Guests send their controls 30 times a second and draw the host's snapshots, sent 20 times a second.
  - Your own movement is predicted locally, so it feels instant even on the relay.
  - Shots, builds and edits are numbered and re-sent until the host confirms them, so none get lost.
- **Dropouts:** if a guest drops out mid-match, a bot takes over their player. If the host leaves, the match ends for everyone.

**Things to know:**

- **Keep the host in the app:** the room creator's phone *is* the server. If they switch apps, the match freezes and guests disconnect after about 8 seconds.
- **Rooms are public:** the relays are public test brokers. Anyone who knows a room PIN can see that room's traffic. That's fine for a game, but don't put anything private in your name.
- **Relays aren't guaranteed:** free public relays can be slow or briefly unavailable. If creating a room fails, try again; the app moves on to the next relay automatically.

## Project layout

```
src/game.js     match simulation: players, weapons, projectiles, builds, edits, rounds
src/world.js    the 30×20 grid, map, raycasts, collision, wall placement and editing
src/guns.js     the 12 guns as data
src/bot.js      PvB AI
src/input.js    twin joysticks for 1 or 2 players, BUILD / EDIT / RESET / weapon buttons, keyboard + mouse
src/render.js   canvas renderer, trajectory and build/edit previews, HUD
src/audio.js    synthesized sound effects + vibration
src/main.js     menus, loadout screen, online lobby, game loop
src/net.js      rooms on a public MQTT relay, WebRTC direct links, snapshot encoding
src/online.js   host sync, remote players, guest prediction
src/mqtt.js     a tiny MQTT-over-websocket client (no dependencies)
android/        one Activity hosting the page in a full-screen WebView (landscape; portrait for 2-player)
build/          bundler, APK script, icon renderer, tests
```

## Commands (from the repo root)

```bash
npm ci
npm run clash:build   # → gridclash/dist/index.html
npm run clash:test    # bot-vs-bot sims for every gun and difficulty + touch-driven browser test (solo and 2-player)
npm run clash:online  # real online matches (1v1 + 2v2) between browser 'phones' through the public relay (needs internet)
npm run clash:web     # builds /docs and tests it as an iPhone (offline cache, touch, iPhone-hosts/Android-joins online)
npm run clash:apk     # → gridclash/dist/grid-clash.apk + grid-clash-online.apk (needs Android SDK build-tools 34 + platform 34 in $ANDROID_HOME)
```

`build/apk.sh` doesn't use Gradle. It runs the SDK tools directly (aapt2, javac,
d8, zipalign, apksigner). It creates a signing key in `build/release.keystore` the
first time it runs. That file is git-ignored, so keep it if you want later builds
to install over earlier ones without uninstalling first.
