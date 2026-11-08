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
| **Left stick** | Move. Push where you want to go. |
| **Right stick** | Drag to aim (a transparent line shows the shot's path), **release to shoot**. Quick tap = auto-aim; drag back to centre = cancel. It always shoots: there's no mode switching. |
| **Building style** | Pick on the main menu: **Build: Stick** (new) or **Classic** (OG). Both apps, saved on the phone. Walls are 3 tiles, cost 30 mats, and land from 1.35 to 3.75 tiles away. If the exact spot is blocked, the wall slides to the nearest spot that fits. |
| **Stick: BUILD** | Its own joystick above the aim stick. **Tap** it: a wall drops in front of you. **Drag** it: a **build crosshair** and a ghost wall show where it lands; release to build, or drag back onto it to cancel. The ring around it shows your materials. Your aim stick always shoots. |
| **Stick: EDIT / ↺** | **Tap EDIT**: cut a gap in (or restore) your wall in front of you. **Drag from EDIT**: pick which wall tile. **↺** restores your nearest edited wall. |
| **Classic: BUILD** | Switches the aim stick into a build stick: drag to move the preview, release to drop the wall. Tap again (now FIGHT) to go back to shooting. In build mode the weapon buttons become **EDIT** (aim at your wall, release to cut or restore a tile; one gap per wall) and **RESET**. |
| **Weapon slots** (top right) | Tap to switch guns, tap the active one to reload. |

Keyboard and mouse (player 1): WASD move · mouse aim + release · B build · E edit · F restore · R reload · 1/2 weapons · Esc pause.

## Items and buff cards (Grid Clash)

- **Item pick**: before each match, every player picks their 2 guns on a pick screen. In 2-player mode, each player gets their own panel, and the top one is flipped to face the top player.
- **Buff cards**: before every round, each player is dealt **3 cards** and keeps **1**. Buffs stack for the rest of the match. Rarities: **Common** (grey), **Rare** (blue), **Epic** (purple), **Legendary** (gold); rarer cards are stronger and less common.

| Card | Effect (by rarity) |
|---|---|
| Shield | an extra **blue health bar** (+25 / +50 / +75 / +110) that soaks damage first; refilled every round |
| Damage | +10% / +20% / +32% / +50% damage |
| Fire rate | +8% / +16% / +26% |
| Speed | +8% / +15% / +24% move speed |
| Max health | +15 / +30 / +50 |
| Reload | 20% / 35% faster |
| Magazine | +50% / double |
| Armour | take 10% / 20% / 30% less damage |
| Lifesteal | heal 15% / 30% of damage dealt |
| Regen | 2 / 4 HP per second after 3 s without being hit |
| Builder | +60 mats each round; tougher walls (+50% / +100%); faster material regen |

The bot picks cards too. It prefers rarer cards, and damage and shield cards.

## Building

- Every wall is **3 tiles in a straight line**, snapped to the grid. It always
  stands across your aim direction, so it ends up between you and what you're
  aiming at.
- A wall costs **30 mats**. You start with 90, mats regenerate at 7/s, and you
  can hold up to 300.
- Each tile has 150 HP and breaks on its own. Explosives, the minigun and the
  flamethrower are best for breaking builds, and the railgun shoots straight
  through them.

## The armory (19 guns)

| Gun | Tier | Style |
|---|---|---|
| Pistol | Common | fast single shots, fast reload |
| SMG | Uncommon | 6-round spray per release |
| Revolver | Uncommon | heavy, pinpoint single shots |
| Akimbo Pistols | Uncommon | two pistols, 4 quick shots per release |
| Assault Rifle | Rare | 4-round burst, good at every range |
| Burst Rifle | Rare | tight 3-round burst |
| Marksman Rifle | Rare | fast, accurate single shots at long range |
| Crossbow | Rare | slow, heavy bolts; lead your target |
| Frost Ray | Rare | chilling stream that **slows** targets by 40% |
| Flamethrower | Rare | short-range torrent that **sets targets on fire** (damage over time) |
| Pump Shotgun | Epic | 9-pellet cone |
| Double Barrel | Epic | both barrels back to back, point blank |
| Minigun | Epic | 14 rounds per release, melts builds |
| Ricochet Blaster | Epic | bolts **bounce off walls** twice, so you can hit people behind cover |
| Grenade Launcher | Epic | lobs over walls; aim distance = throw distance *(nerfed: 42 dmg, smaller blast, slower shells)* |
| Sniper | Legendary | huge single shots *(nerfed: 66 dmg, slower to cycle, 3-round mag)* |
| Rocket Launcher | Legendary | explodes on contact, deletes walls |
| Cluster Launcher | Legendary | lobbed bomb that **bursts into 4 bomblets** |
| Railgun | Mythic | instant beam through builds, **loses 30% damage per wall** *(nerfed: 42 dmg, slower, 2-round mag)* |

Being slowed shows as an icy ring and burning shows flames on the player. When you're low on health, the screen edges glow red.

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
