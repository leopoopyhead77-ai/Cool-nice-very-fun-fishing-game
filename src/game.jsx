// ---------------------------------------------------------------------------
// SOUNDING LINE — a Fisch-style fishing console.
// ---------------------------------------------------------------------------

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";

import {
  AREAS,
  BAITS,
  INVENTORY_CAP,
  MUTATIONS,
  RARITIES,
  REEL_TUNING,
  RODS,
  UPGRADES,
} from "./data.js";
import {
  CAST_LABEL,
  SWEET_SPOT,
  areaOf,
  baitOf,
  baitPrice,
  baseLuck,
  biteDelay,
  bracketWidth,
  castQuality,
  clamp,
  fishValue,
  fmt,
  fmtKg,
  freshState,
  inventoryValue,
  lvl,
  makeCatch,
  migrate,
  mutationOf,
  rarityOf,
  rebirthThreshold,
  rebirthTokens,
  recordBestiary,
  rodOf,
  rollFish,
  upgradeCost,
  twinChance,
} from "./engine.js";
import { drawScene } from "./scene.js";
import { clearSave, loadSave, storageLabel, writeSave } from "./storage.js";

// --- shared mutable frame state (read by the scene, written by the loop) ---
const live = {
  phase: "idle",
  blip: 0.5,
  bracket: 0.5,
  width: 0.2,
  fill: 0,
  tier: 0,
  rarityColor: "#2F3B36",
};

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// ===========================================================================
// The view from the bank — a painted, gently animated scene per area.
// ===========================================================================

function Scene({ area, status, when }) {
  const ref = useRef(null);
  const areaRef = useRef(area);
  areaRef.current = area;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let last = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const rect = cv.getBoundingClientRect();
      const nw = Math.max(1, Math.round(rect.width * dpr));
      const nh = Math.max(1, Math.round(rect.height * dpr));
      if (cv.width === nw && cv.height === nh) return;
      cv.width = nw;
      cv.height = nh;
      w = nw;
      h = nh;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    const start = performance.now();
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return; // 30 fps keeps phones cool
      last = now;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      drawScene(ctx, w / dpr, h / dpr, areaRef.current.scene, (now - start) / 1000, live);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="scene">
      <canvas ref={ref} aria-hidden="true" />
      <div className="scene-hud">
        <span className="scene-place">{area.name}</span>
      </div>
      <div className="scene-foot">
        <span className="scene-status">{status}</span>
        <span className="scene-when">{when}</span>
      </div>
    </div>
  );
}

// ===========================================================================
// Small presentational pieces
// ===========================================================================

const RarityChip = ({ tier }) => {
  const r = rarityOf(tier);
  return (
    <span className="chip" style={{ color: r.color }}>
      {r.name}
    </span>
  );
};

const MutTag = ({ mut }) => {
  if (!mut) return null;
  const m = mutationOf(mut);
  return (
    <span className="mut-chip" style={{ color: m.color }}>
      {m.name} ×{m.mult}
    </span>
  );
};

function Panel({ title, note, children, style }) {
  return (
    <section className="panel" style={style}>
      {(title || note) && (
        <header className="panel-head">
          <h2 className="panel-title">{title}</h2>
          {note && <span className="panel-note">{note}</span>}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Readout({ cells }) {
  return (
    <div className="readout">
      {cells.map((c) => (
        <div key={c.k}>
          <span className="k">{c.k}</span>
          <span className="v" style={c.color ? { color: c.color } : undefined}>
            {c.v}
          </span>
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
// Fishing tab
// ===========================================================================

const REEL_ACCEL = 1.75;
const REEL_GRAVITY = 1.15;
const REEL_DRAG = 2.3;
const BITE_WINDOW = 1.05;

function FishTab({ state, phase, result, castInfo, refs, recent }) {
  const area = areaOf(state);
  const rod = rodOf(state);
  const bait = baitOf(state);

  const statusText = {
    idle: "Nice and quiet",
    casting: "Winding up",
    waiting: "Line's in the water",
    bite: "Something's biting!",
    reeling: "Fish on!",
    result: "In the bucket",
    escaped: "It got away",
  }[phase];



  return (
    <>
      <Scene area={area} status={statusText} when={area.when} />

      <Readout
        cells={[
          { k: "Rod", v: rod.short },
          { k: "Bait", v: bait ? `${bait.name.split(" ")[0]} ×${state.baits[bait.key] || 0}` : "None" },
          { k: "Luck", v: fmt(Math.round(baseLuck(state))) },
          { k: "Bucket", v: `${state.inventory.length}/${INVENTORY_CAP}` },
        ]}
      />

      {phase === "casting" && (
        <Panel title="Cast" note="tap SET on the green">
          <div className="track" ref={refs.castTrack}>
            <div
              className="sweet"
              style={{
                left: `${(SWEET_SPOT - 0.09) * 100}%`,
                width: `${0.18 * 100}%`,
              }}
            />
            <div
              className="sweet core"
              style={{
                left: `${(SWEET_SPOT - 0.03) * 100}%`,
                width: `${0.06 * 100}%`,
              }}
            />
            <div className="marker" ref={refs.marker} style={{ left: "0%" }} />
          </div>
          <p className="note">
            Power builds left to right. Stop inside the green band; the bright middle is a
            perfect cast.
          </p>
        </Panel>
      )}

      {(phase === "waiting" || phase === "bite") && (
        <Panel
          title={phase === "waiting" ? "Waiting" : "Bite!"}
          note={castInfo ? CAST_LABEL[castInfo.quality] : ""}
        >
          <p className="note">
            {phase === "waiting"
              ? "Float's out. Watch it — when it dips, you have about a second."
              : "It's taken the bait. Set the hook!"}
          </p>
        </Panel>
      )}

      {phase === "reeling" && (
        <Panel title="Reeling" note="hold to move right, let go to drift back">
          <div className="track" ref={refs.reelTrack}>
            <div className="bracket" ref={refs.bracket} />
            <div className="blip" ref={refs.blip} />
          </div>
          <div className="meter" ref={refs.meter}>
            <div className="meter-fill" ref={refs.meterFill} style={{ width: "35%" }} />
            <div className="meter-ticks" />
          </div>
        </Panel>
      )}

      {phase === "result" && result && <ResultCard result={result} />}

      {phase === "escaped" && (
        <Panel title="It got away">
          <p className="note" style={{ color: "var(--alert)", fontSize: "12px" }}>
            {result?.reason || "The line went slack."}
          </p>
        </Panel>
      )}

      {state.stats.catches < 3 && (
        <Panel title="How to fish" note="you'll get the hang of it">
          <div className="steps">
            <div>
              <b>1</b>
              <span>Tap <em>Cast</em>, then <em>Set</em> when the marker is on the green.</span>
            </div>
            <div>
              <b>2</b>
              <span>Watch the float. When it dips, tap <em>Hook</em> straight away.</span>
            </div>
            <div>
              <b>3</b>
              <span>Hold to move your bracket right, let go to drift left. Keep the fish
              inside it until the bar fills.</span>
            </div>
            <div>
              <b>4</b>
              <span>Sell what you catch in the <em>Bucket</em>, then buy a better rod in
              the <em>Shop</em>.</span>
            </div>
          </div>
        </Panel>
      )}

      {recent.length > 0 && (
        <Panel title="Just caught" note={`last ${recent.length}`}>
          <div className="list">
            {recent.map((e) => {
              const r = rarityOf(e.tier);
              return (
                <div key={e.id} className="item" style={{ "--rar": r.color }}>
                  <div className="stripe" />
                  <div>
                    <div className="name" style={{ fontSize: 12 }}>
                      {e.name}
                      <MutTag mut={e.mut} />
                    </div>
                    <div className="meta">{fmtKg(e.weight)}</div>
                  </div>
                  <span className="price">{fmt(e.value)}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      <Panel title="This spot" note={area.sub}>
          <p className="note">
            {area.fish.length} kinds of fish live here. Better bait and a luckier rod tip
            the odds toward the rare end of the list.
          </p>
          <div className="grid2">
            {RARITIES.map((r, i) =>
              area.weights[i] ? (
                <div key={r.key} className="kv">
                  <span style={{ color: r.color }}>{r.name}</span>
                  <b>{rarityOdds(state, i)}</b>
                </div>
              ) : null
            )}
        </div>
      </Panel>
    </>
  );
}

function rarityOdds(state, tier) {
  const area = areaOf(state);
  const luck = baseLuck(state);
  let total = 0;
  let mine = 0;
  for (let i = 0; i < RARITIES.length; i++) {
    const base = area.weights[i];
    if (!base) continue;
    const w = base * (1 + luck * [0, 0.0015, 0.004, 0.008, 0.014, 0.022, 0.032, 0.045][i]);
    total += w;
    if (i === tier) mine = w;
  }
  const pct = (mine / total) * 100;
  if (pct >= 10) return pct.toFixed(0) + "%";
  if (pct >= 1) return pct.toFixed(1) + "%";
  if (pct >= 0.01) return pct.toFixed(2) + "%";
  return "1 in " + fmt(Math.round(100 / pct));
}

function ResultCard({ result }) {
  const { entries, extra } = result;
  return (
    <>
      {entries.map((e, idx) => {
        const r = rarityOf(e.tier);
        return (
          <div
            key={e.id}
            className="result"
            style={{
              "--rar": r.color,
              "--rar-wash": r.soft,
            }}
          >
            <div className="kv">
              <RarityChip tier={e.tier} />
              {idx === 1 && <span className="note">TWIN HOOK</span>}
            </div>
            <h3 className="result-name">{e.name}</h3>
            <div className="kv">
              <span>WEIGHT</span>
              <b>{fmtKg(e.weight)}</b>
            </div>
            <div className="kv">
              <span>MUTATION</span>
              <b style={{ color: mutationOf(e.mut).color }}>
                {mutationOf(e.mut).name}
                {e.mut ? ` ×${mutationOf(e.mut).mult}` : ""}
              </b>
            </div>
            <div className="hr" />
            <div className="kv">
              <span>VALUE</span>
              <span className="result-value">{fmt(e.value)}</span>
            </div>
            {extra[idx] && <p className="note">{extra[idx]}</p>}
          </div>
        );
      })}
    </>
  );
}

// ===========================================================================
// Inventory tab
// ===========================================================================

function InventoryTab({ state, api }) {
  const inv = state.inventory;
  const total = inventoryValue(inv);
  const sorted = useMemo(
    () => [...inv].sort((a, b) => b.value - a.value),
    [inv]
  );
  const counts = useMemo(() => {
    const c = new Array(RARITIES.length).fill(0);
    for (const f of inv) c[f.tier] += 1;
    return c;
  }, [inv]);

  return (
    <>
      <Panel title="Bucket" note={`${inv.length}/${INVENTORY_CAP}`}>
        <div className="kv">
          <span>TOTAL VALUE</span>
          <b style={{ color: "var(--amber)", fontSize: "15px" }}>{fmt(total)}</b>
        </div>
        <div className="btn-row">
          <button className="btn primary" disabled={!inv.length} onClick={() => api.sellAll()}>
            Sell all · {fmt(total)}
          </button>
        </div>
        <div className="hr" />
        <span className="strip-label">Sell everything below</span>
        <div className="grid2">
          {RARITIES.slice(1).map((r, i) => {
            const tier = i + 1;
            const n = counts.slice(0, tier).reduce((a, b) => a + b, 0);
            return (
              <button
                key={r.key}
                className="btn ghost"
                disabled={!n}
                style={{ color: r.color, borderColor: rgba(r.color, 0.4) }}
                onClick={() => api.sellBelow(tier)}
              >
                {r.name} · {n}
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="list">
        {sorted.map((fish) => {
          const r = rarityOf(fish.tier);
          return (
            <div key={fish.id} className="item" style={{ "--rar": r.color }}>
              <div className="stripe" />
              <div>
                <div className="name">
                  {fish.name}
                  <MutTag mut={fish.mut} />
                </div>
                <div className="meta">
                  {r.name} · {fmtKg(fish.weight)}
                </div>
              </div>
              <button className="btn primary" onClick={() => api.sellOne(fish.id)}>
                {fmt(fish.value)}
              </button>
            </div>
          );
        })}
        {!inv.length && (
          <p className="empty">
            Your bucket is empty.
            <br />
            Everything you catch waits here until you sell it.
          </p>
        )}
      </div>
    </>
  );
}

// ===========================================================================
// Shop tab
// ===========================================================================

function ShopTab({ state, api, shopView, setShopView }) {
  return (
    <>
      <div className="seg">
        {["rods", "bait", "areas"].map((v) => (
          <button key={v} aria-pressed={shopView === v} onClick={() => setShopView(v)}>
            {v}
          </button>
        ))}
      </div>

      {shopView === "rods" && <RodShop state={state} api={api} />}
      {shopView === "bait" && <BaitShop state={state} api={api} />}
      {shopView === "areas" && <AreaShop state={state} api={api} />}
    </>
  );
}

function RodShop({ state, api }) {
  const current = rodOf(state);
  return (
    <div className="list">
      {RODS.map((rod) => {
        const owned = state.rodsOwned.includes(rod.key);
        const equipped = state.rod === rod.key;
        const afford = state.coins >= rod.cost;
        const better = (a, b) => (a > b ? "var(--good)" : a < b ? "var(--alert)" : "var(--muted)");
        return (
          <div
            key={rod.key}
            className="panel"
            style={{ opacity: owned || afford ? 1 : 0.62 }}
          >
            <div className="panel-body" style={{ gap: 8 }}>
              <div className="kv">
                <b style={{ fontSize: 14, fontFamily: "var(--f-display)", letterSpacing: ".04em" }}>
                  {rod.name}
                </b>
                {equipped ? (
                  <span className="chip" style={{ color: "var(--amber)" }}>
                    Equipped
                  </span>
                ) : owned ? (
                  <span className="chip" style={{ color: "var(--good)" }}>
                    Owned
                  </span>
                ) : (
                  <span className="price">{fmt(rod.cost)}</span>
                )}
              </div>
              <p className="note">{rod.sub}</p>
              <div className="readout">
                <div>
                  <span className="k">Luck</span>
                  <span className="v" style={{ color: better(rod.luck, current.luck) }}>
                    +{rod.luck}
                  </span>
                </div>
                <div>
                  <span className="k">Lure</span>
                  <span className="v" style={{ color: better(rod.lure, current.lure) }}>
                    ×{rod.lure.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="k">Control</span>
                  <span className="v" style={{ color: better(rod.control, current.control) }}>
                    ×{rod.control.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="k">Value</span>
                  <span className="v" style={{ color: better(rod.value, current.value) }}>
                    ×{rod.value.toFixed(2)}
                  </span>
                </div>
              </div>
              {!equipped &&
                (owned ? (
                  <button className="btn" onClick={() => api.equipRod(rod.key)}>
                    Equip
                  </button>
                ) : (
                  <button
                    className="btn primary"
                    disabled={!afford}
                    onClick={() => api.buyRod(rod.key)}
                  >
                    Buy · {fmt(rod.cost)}
                  </button>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BaitShop({ state, api }) {
  return (
    <div className="list">
      {BAITS.map((b) => {
        const owned = state.baits[b.key] || 0;
        const price = baitPrice(state, b);
        const equipped = state.bait === b.key;
        return (
          <div key={b.key} className="panel">
            <div className="panel-body" style={{ gap: 8 }}>
              <div className="kv">
                <b style={{ fontSize: 14, fontFamily: "var(--f-display)", letterSpacing: ".04em" }}>
                  {b.name}
                </b>
                <span className="price">×{owned}</span>
              </div>
              <div className="kv">
                <span>
                  +{b.luck} luck
                  {b.mut ? ` · +${(b.mut * 100).toFixed(0)}% mutation` : " · no mutation boost"}
                </span>
              </div>
              <div className="btn-row">
                <button className="btn" disabled={state.coins < price} onClick={() => api.buyBait(b.key)}>
                  Buy {b.pack} · {fmt(price)}
                </button>
                <button
                  className={"btn" + (equipped ? " primary" : "")}
                  disabled={!owned && !equipped}
                  onClick={() => api.equipBait(equipped ? null : b.key)}
                >
                  {equipped ? "Unequip" : "Equip"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
      <p className="note">
        One bait is consumed per cast. When a stack runs out it unequips itself — you will
        never burn a cast on bait you do not have.
      </p>
    </div>
  );
}

function AreaShop({ state, api }) {
  return (
    <div className="list">
      {AREAS.map((area, i) => {
        const unlocked = state.areasUnlocked.includes(area.key);
        const here = state.area === i;
        const needRebirth = state.rebirths < area.rebirth;
        const afford = state.coins >= area.cost;
        return (
          <div key={area.key} className="panel" style={{ opacity: unlocked || (!needRebirth && afford) ? 1 : 0.62 }}>
            <div className="panel-body" style={{ gap: 8 }}>
              <div className="kv">
                <b
                  style={{
                    fontSize: 14,
                    fontFamily: "var(--f-display)",
                    letterSpacing: ".04em",
                    color: area.palette.accent,
                  }}
                >
                  {area.name}
                </b>
                {here ? (
                  <span className="chip" style={{ color: "var(--amber)" }}>
                    You are here
                  </span>
                ) : unlocked ? (
                  <span className="chip" style={{ color: "var(--good)" }}>
                    Unlocked
                  </span>
                ) : (
                  <span className="price">{fmt(area.cost)}</span>
                )}
              </div>
              <p className="note">{area.sub}</p>
              <div className="grid2">
                {RARITIES.map((r, t) =>
                  area.weights[t] ? (
                    <div className="kv" key={r.key}>
                      <span style={{ color: r.color }}>{r.name}</span>
                      <b>{area.fish.filter((f) => f.r === t).length}</b>
                    </div>
                  ) : null
                )}
              </div>
              {!here &&
                (unlocked ? (
                  <button className="btn" onClick={() => api.travel(i)}>
                    Travel
                  </button>
                ) : needRebirth ? (
                  <button className="btn" disabled>
                    Requires rebirth {area.rebirth}
                  </button>
                ) : (
                  <button className="btn primary" disabled={!afford} onClick={() => api.unlockArea(i)}>
                    Unlock · {fmt(area.cost)}
                  </button>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Bestiary tab
// ===========================================================================

function BestiaryTab({ state }) {
  const total = AREAS.reduce((a, ar) => a + ar.fish.length, 0);
  const found = Object.keys(state.bestiary).length;
  return (
    <>
      <Panel title="Journal" note={`${found}/${total} found`}>
        <div className="bar-mini">
          <i style={{ width: `${(found / total) * 100}%` }} />
        </div>
        <div className="kv">
          <span>CASTS</span>
          <b>{fmt(state.stats.casts)}</b>
        </div>
        <div className="kv">
          <span>CAUGHT / LOST</span>
          <b>
            {fmt(state.stats.catches)} / {fmt(state.stats.escapes)}
          </b>
        </div>
        <div className="kv">
          <span>TOTAL EARNED</span>
          <b style={{ color: "var(--amber)" }}>{fmt(state.stats.earned)}</b>
        </div>
        <div className="kv">
          <span>BEST SINGLE FISH</span>
          <b style={{ color: "var(--amber)" }}>{fmt(state.stats.best)}</b>
        </div>
      </Panel>

      {AREAS.map((area) => {
        const seen = area.fish.filter((f) => state.bestiary[f.n]).length;
        return (
          <Panel key={area.key} title={area.name} note={`${seen}/${area.fish.length}`}>
            <div className="list">
              {area.fish.map((f) => {
                const rec = state.bestiary[f.n];
                const r = rarityOf(f.r);
                return (
                  <div
                    key={f.n}
                    className={"item" + (rec ? "" : " locked")}
                    style={{ "--rar": r.color }}
                  >
                    <div className="stripe" />
                    <div>
                      <div className="name" style={{ color: rec ? r.color : "var(--muted)" }}>
                        {f.n}
                        {rec && rec.bestMut ? <MutTag mut={rec.bestMut} /> : null}
                      </div>
                      <div className="meta">
                        {rec
                          ? `caught ${fmt(rec.count)} · best ${fmtKg(rec.best)}`
                          : `${r.name} · ${fmtKg(f.wmin)}–${fmtKg(f.wmax)} · not caught yet`}
                      </div>
                    </div>
                    <span className="price" style={{ color: rec ? "var(--amber)" : "var(--faint)" }}>
                      {fmt(f.v)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })}
    </>
  );
}

// ===========================================================================
// Rebirth tab
// ===========================================================================

function RebirthTab({ state, api }) {
  const need = rebirthThreshold(state.rebirths);
  const ready = state.coins >= need;
  const gain = rebirthTokens(state.rebirths);
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  return (
    <>
      <Panel title="Rebirth" note={`Cycle ${state.rebirths}`}>
        <div className="bar-mini">
          <i style={{ width: `${Math.min(100, (state.coins / need) * 100)}%` }} />
        </div>
        <div className="kv">
          <span>THRESHOLD</span>
          <b style={{ color: ready ? "var(--good)" : "var(--ink)" }}>
            {fmt(state.coins)} / {fmt(need)}
          </b>
        </div>
        <div className="kv">
          <span>TOKENS ON RESET</span>
          <b style={{ color: "var(--amber)" }}>+{gain}</b>
        </div>
        <div className="kv">
          <span>EARNINGS BONUS AFTER</span>
          <b>×{(1 + (state.rebirths + 1) * 0.3).toFixed(2)}</b>
        </div>
        <p className="note">
          Starting over spends your coins and every rod but the Bamboo. Your unlocked
          spots, your journal and all token upgrades stay with you.
        </p>
        {confirming ? (
          <div className="btn-row">
            <button
              className="btn danger"
              onClick={() => {
                api.rebirth();
                setConfirming(false);
              }}
            >
              Confirm reset
            </button>
            <button className="btn ghost" onClick={() => setConfirming(false)}>
              Keep fishing
            </button>
          </div>
        ) : (
          <button className="btn primary" disabled={!ready} onClick={() => setConfirming(true)}>
            {ready ? `Rebirth · +${gain} tokens` : `Need ${fmt(need - state.coins)} more`}
          </button>
        )}
      </Panel>

      <Panel title="Token upgrades" note={`${state.tokens} tokens`}>
        <div className="list">
          {UPGRADES.map((u) => {
            const level = lvl(state, u.key);
            const maxed = level >= u.max;
            const cost = upgradeCost(u.key, level);
            const afford = state.tokens >= cost;
            return (
              <div key={u.key} className="panel" style={{ background: "var(--hull-2)" }}>
                <div className="panel-body" style={{ gap: 7 }}>
                  <div className="kv">
                    <b style={{ fontSize: 13, fontFamily: "var(--f-display)", letterSpacing: ".05em" }}>
                      {u.name}
                    </b>
                    <span className="panel-note">
                      LV {level}/{u.max}
                    </span>
                  </div>
                  <p className="note">{u.sub}</p>
                  <div className="bar-mini">
                    <i style={{ width: `${(level / u.max) * 100}%` }} />
                  </div>
                  <div className="kv">
                    <span>NOW</span>
                    <b>{level ? u.effect(level) : "—"}</b>
                  </div>
                  {!maxed && (
                    <div className="kv">
                      <span>NEXT</span>
                      <b style={{ color: "var(--good)" }}>{u.effect(level + 1)}</b>
                    </div>
                  )}
                  <button
                    className="btn primary"
                    disabled={maxed || !afford}
                    onClick={() => api.buyUpgrade(u.key)}
                  >
                    {maxed ? "Maxed" : `Buy · ${cost} token${cost === 1 ? "" : "s"}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Save" note={storageLabel()}>
        <p className="note">
          The game saves itself after everything you do. A reset wipes coins, gear,
          spots, tokens and your journal — there is no undo.
        </p>
        {resetting ? (
          <div className="btn-row">
            <button className="btn danger" onClick={() => api.hardReset()}>
              Erase everything
            </button>
            <button className="btn ghost" onClick={() => setResetting(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn danger" onClick={() => setResetting(true)}>
            Reset save
          </button>
        )}
      </Panel>
    </>
  );
}

// ===========================================================================
// Root
// ===========================================================================

const TABS = [
  { key: "fish", label: "Fish" },
  { key: "hold", label: "Bucket" },
  { key: "shop", label: "Shop" },
  { key: "log", label: "Journal" },
  { key: "rebirth", label: "Rebirth" },
];

function App() {
  const [state, setState] = useState(freshState);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("fish");
  const [shopView, setShopView] = useState("rods");
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null);
  const [castInfo, setCastInfo] = useState(null);
  const [toast, setToast] = useState(null);
  const [recent, setRecent] = useState([]);
  const [flash, setFlash] = useState(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const refs = {
    marker: useRef(null),
    castTrack: useRef(null),
    bracket: useRef(null),
    blip: useRef(null),
    meter: useRef(null),
    meterFill: useRef(null),
    reelTrack: useRef(null),
  };

  const run = useRef({
    marker: 0,
    dir: 1,
    biteAt: 0,
    biteDeadline: 0,
    pending: null,
    bracket: 0.5,
    bvel: 0,
    blip: 0.5,
    blipVel: 0,
    blipTimer: 0,
    fill: 0.35,
    width: 0.2,
    tuning: REEL_TUNING[0],
    hold: false,
    quality: "fair",
  });

  const toastTimer = useRef(0);
  const say = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  // --- load / save ---------------------------------------------------------

  useEffect(() => {
    let alive = true;
    loadSave().then((saved) => {
      if (!alive) return;
      if (saved) setState(migrate(saved));
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => writeSave(state), 350);
    return () => clearTimeout(t);
  }, [state, loaded]);

  // --- economy actions -----------------------------------------------------

  const api = useMemo(() => {
    const mut = (fn) => setState((s) => fn(s) || s);
    return {
      sellOne: (id) =>
        mut((s) => {
          const fish = s.inventory.find((f) => f.id === id);
          if (!fish) return s;
          say(`Sold ${fish.name} · ${fmt(fish.value)}`);
          return {
            ...s,
            coins: s.coins + fish.value,
            inventory: s.inventory.filter((f) => f.id !== id),
            stats: { ...s.stats, earned: s.stats.earned + fish.value },
          };
        }),
      sellAll: () =>
        mut((s) => {
          const total = inventoryValue(s.inventory);
          if (!total) return s;
          say(`Sold ${s.inventory.length} fish · ${fmt(total)}`);
          return {
            ...s,
            coins: s.coins + total,
            inventory: [],
            stats: { ...s.stats, earned: s.stats.earned + total },
          };
        }),
      sellBelow: (tier) =>
        mut((s) => {
          const sell = s.inventory.filter((f) => f.tier < tier);
          if (!sell.length) return s;
          const total = inventoryValue(sell);
          say(`Sold ${sell.length} below ${RARITIES[tier].name} · ${fmt(total)}`);
          return {
            ...s,
            coins: s.coins + total,
            inventory: s.inventory.filter((f) => f.tier >= tier),
            stats: { ...s.stats, earned: s.stats.earned + total },
          };
        }),
      buyRod: (key) =>
        mut((s) => {
          const rod = RODS.find((r) => r.key === key);
          if (!rod || s.rodsOwned.includes(key) || s.coins < rod.cost) return s;
          say(`${rod.name} — ready to go`);
          return {
            ...s,
            coins: s.coins - rod.cost,
            rodsOwned: [...s.rodsOwned, key],
            rod: key,
          };
        }),
      equipRod: (key) => mut((s) => (s.rodsOwned.includes(key) ? { ...s, rod: key } : s)),
      buyBait: (key) =>
        mut((s) => {
          const b = BAITS.find((x) => x.key === key);
          const price = baitPrice(s, b);
          if (s.coins < price) return s;
          say(`${b.pack} × ${b.name}`);
          return {
            ...s,
            coins: s.coins - price,
            baits: { ...s.baits, [key]: (s.baits[key] || 0) + b.pack },
            bait: s.bait || key,
          };
        }),
      equipBait: (key) => mut((s) => ({ ...s, bait: key && (s.baits[key] || 0) > 0 ? key : null })),
      unlockArea: (i) =>
        mut((s) => {
          const area = AREAS[i];
          if (s.areasUnlocked.includes(area.key)) return s;
          if (s.coins < area.cost || s.rebirths < area.rebirth) return s;
          say(`${area.name} unlocked!`);
          return {
            ...s,
            coins: s.coins - area.cost,
            areasUnlocked: [...s.areasUnlocked, area.key],
            area: i,
          };
        }),
      travel: (i) =>
        mut((s) => {
          if (!s.areasUnlocked.includes(AREAS[i].key)) return s;
          say(`Off to ${AREAS[i].name}`);
          return { ...s, area: i };
        }),
      buyUpgrade: (key) =>
        mut((s) => {
          const u = UPGRADES.find((x) => x.key === key);
          const level = s.upgrades[key] || 0;
          const cost = upgradeCost(key, level);
          if (level >= u.max || s.tokens < cost) return s;
          say(`${u.name} → LV ${level + 1}`);
          return {
            ...s,
            tokens: s.tokens - cost,
            upgrades: { ...s.upgrades, [key]: level + 1 },
          };
        }),
      rebirth: () =>
        mut((s) => {
          if (s.coins < rebirthThreshold(s.rebirths)) return s;
          const gain = rebirthTokens(s.rebirths);
          say(`Rebirth ${s.rebirths + 1} · +${gain} tokens`);
          return {
            ...s,
            coins: 0,
            inventory: [],
            rod: "twine",
            rodsOwned: ["twine"],
            rebirths: s.rebirths + 1,
            tokens: s.tokens + gain,
          };
        }),
      hardReset: async () => {
        await clearSave();
        setState(freshState());
        setRecent([]);
        setPhase("idle");
        setResult(null);
        setTab("fish");
        say("Fresh start");
      },
    };
  }, [say]);

  // --- the fishing loop ----------------------------------------------------

  const endCatch = useCallback(
    (roll) => {
      const s = stateRef.current;
      const entries = [makeCatch(s, roll)];
      if (Math.random() < twinChance(s)) {
        const second = rollFish(s, run.current.quality);
        entries.push(makeCatch(s, second));
      }
      // Resolve everything against the current save before touching state, so
      // the result card and the store always agree.
      const extra = [];
      let bestiary = s.bestiary;
      let inventory = s.inventory;
      let coins = s.coins;
      let earned = s.stats.earned;
      let best = s.stats.best;
      entries.forEach((e, i) => {
        const prevRec = bestiary[e.name];
        extra[i] = !prevRec
          ? "New fish for the journal!"
          : e.weight > prevRec.best
          ? `Your biggest yet — old record ${fmtKg(prevRec.best)}.`
          : "";
        bestiary = recordBestiary(bestiary, e);
        best = Math.max(best, e.value);
        if (inventory.length < INVENTORY_CAP) {
          inventory = [...inventory, e];
        } else {
          coins += e.value;
          earned += e.value;
          extra[i] = (extra[i] ? extra[i] + " " : "") + "Bucket full — sold it right away.";
        }
      });
      setState((prev) => ({
        ...prev,
        coins,
        inventory,
        bestiary,
        stats: {
          ...prev.stats,
          catches: prev.stats.catches + entries.length,
          earned,
          best,
        },
      }));
      setResult({ entries, extra });
      setRecent((prev) => [...entries].reverse().concat(prev).slice(0, 5));
      setPhase("result");
      live.phase = "result";
    },
    []
  );

  const startCast = useCallback(() => {
    const s = stateRef.current;
    const bait = baitOf(s);
    if (bait) {
      const left = (s.baits[bait.key] || 0) - 1;
      setState((prev) => ({
        ...prev,
        baits: { ...prev.baits, [bait.key]: Math.max(0, left) },
        bait: left > 0 ? prev.bait : null,
      }));
      if (left <= 0) say(`Out of ${bait.name} — bait unequipped`);
    }
    setState((prev) => ({ ...prev, stats: { ...prev.stats, casts: prev.stats.casts + 1 } }));
    run.current.marker = 0;
    run.current.dir = 1;
    setResult(null);
    setCastInfo(null);
    setPhase("casting");
    live.phase = "casting";
  }, [say]);

  const lockCast = useCallback(() => {
    const quality = castQuality(run.current.marker);
    run.current.quality = quality;
    setCastInfo({ quality, at: run.current.marker });
    const s = stateRef.current;
    run.current.biteAt = performance.now() + biteDelay(s, quality) * 1000;
    run.current.pending = rollFish(s, quality);
    setPhase("waiting");
    live.phase = "waiting";
    live.tier = run.current.pending.tier;
    live.rarityColor = RARITIES[run.current.pending.tier].color;
  }, []);

  const hook = useCallback(() => {
    const s = stateRef.current;
    const roll = run.current.pending;
    const tuning = REEL_TUNING[roll.tier];
    run.current.tuning = tuning;
    run.current.width = bracketWidth(s);
    run.current.bracket = 0.5;
    run.current.bvel = 0;
    run.current.blip = 0.5;
    run.current.blipVel = 0;
    run.current.blipTimer = 0;
    run.current.fill =
      0.35 + (run.current.quality === "perfect" ? 0.12 : run.current.quality === "poor" ? -0.08 : 0);
    live.fill = run.current.fill;
    live.width = run.current.width;
    setPhase("reeling");
    live.phase = "reeling";
  }, []);

  const escape = useCallback(
    (reason) => {
      setResult({ entries: [], extra: [], reason });
      setPhase("escaped");
      live.phase = "escaped";
      setState((prev) => ({ ...prev, stats: { ...prev.stats, escapes: prev.stats.escapes + 1 } }));
    },
    []
  );

  // main animation loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const r = run.current;
      const p = phaseRef.current;

      if (p === "casting") {
        r.marker += r.dir * 1.15 * dt;
        if (r.marker > 1) {
          r.marker = 1;
          r.dir = -1;
        } else if (r.marker < 0) {
          r.marker = 0;
          r.dir = 1;
        }
        if (refs.marker.current) refs.marker.current.style.left = `${r.marker * 100}%`;
        return;
      }

      if (p === "waiting") {
        if (now >= r.biteAt) {
          r.biteDeadline = now + BITE_WINDOW * 1000;
          setPhase("bite");
          live.phase = "bite";
          const tier = r.pending.tier;
          if (tier >= 3) setFlash({ tier, at: now });
        }
        return;
      }

      if (p === "bite") {
        if (now >= r.biteDeadline) escape("Too slow — it spat the hook.");
        return;
      }

      if (p === "reeling") {
        const t = r.tuning;
        // fish
        r.blipTimer -= dt;
        if (r.blipTimer <= 0) {
          const dart = Math.random() < 0.18 ? 1.7 : 1;
          r.blipVel = (Math.random() * 2 - 1) * t.speed * dart;
          r.blipTimer = (0.28 + Math.random() * 0.5) / t.erratic;
        }
        r.blip += r.blipVel * dt;
        if (r.blip < 0.02) {
          r.blip = 0.02;
          r.blipVel = Math.abs(r.blipVel);
        } else if (r.blip > 0.98) {
          r.blip = 0.98;
          r.blipVel = -Math.abs(r.blipVel);
        }

        // bracket
        r.bvel += (r.hold ? REEL_ACCEL : -REEL_GRAVITY) * dt;
        r.bvel -= r.bvel * REEL_DRAG * dt;
        r.bracket += r.bvel * dt;
        const half = r.width / 2;
        if (r.bracket < half) {
          r.bracket = half;
          r.bvel = 0;
        } else if (r.bracket > 1 - half) {
          r.bracket = 1 - half;
          r.bvel = 0;
        }

        const inside = Math.abs(r.blip - r.bracket) <= half;
        r.fill += (inside ? t.fill : -t.drain) * dt;

        live.blip = r.blip;
        live.bracket = r.bracket;
        live.fill = r.fill;

        if (refs.bracket.current) {
          refs.bracket.current.style.left = `${(r.bracket - half) * 100}%`;
          refs.bracket.current.style.width = `${r.width * 100}%`;
        }
        if (refs.blip.current) {
          const rar = RARITIES[r.pending.tier];
          refs.blip.current.style.left = `${r.blip * 100}%`;
          refs.blip.current.style.setProperty("--rar", rar.color);
        }
        if (refs.meterFill.current) {
          refs.meterFill.current.style.width = `${clamp(r.fill, 0, 1) * 100}%`;
        }
        if (refs.meter.current) {
          refs.meter.current.classList.toggle("danger", r.fill < 0.25);
        }

        if (r.fill >= 1) {
          r.fill = 1;
          endCatch(r.pending);
        } else if (r.fill <= 0) {
          escape("The line went slack. It got away.");
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endCatch, escape]);

  // keep the scene's idea of the world in sync
  useLayoutEffect(() => {
    live.phase = phase;
  }, [phase]);

  // clear the rare-signal flash
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [flash]);

  // --- action button -------------------------------------------------------

  const onPointerDown = (e) => {
    e.preventDefault();
    const p = phaseRef.current;
    if (p === "idle" || p === "result" || p === "escaped") {
      if (tab !== "fish") setTab("fish");
      startCast();
    } else if (p === "casting") {
      lockCast();
    } else if (p === "bite") {
      hook();
    } else if (p === "reeling") {
      run.current.hold = true;
      e.currentTarget.classList.add("held");
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety, not a requirement */
      }
    }
  };

  const release = (e) => {
    run.current.hold = false;
    if (e && e.currentTarget && e.currentTarget.classList) e.currentTarget.classList.remove("held");
  };

  const actionMode =
    phase === "bite" ? "hook" : phase === "reeling" ? "reel" : phase === "casting" ? "cast" : "idle";

  const actionText = {
    idle: ["Cast", "tap to cast out"],
    casting: ["Set", "stop it on the green"],
    waiting: ["Waiting", "watch the float"],
    bite: ["Hook!", "now!"],
    reeling: ["Hold", "keep the fish in the bracket"],
    result: ["Cast again", "nice one"],
    escaped: ["Cast again", "no worries, try again"],
  }[phase];

  const area = areaOf(state);
  const flashRarity = flash ? RARITIES[flash.tier] : null;

  if (!loaded) {
    return (
      <div className="app">
        <div className="well">
          <p className="empty">Getting the boat ready…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app" style={{ "--area": area.palette.accent }}>
      <header className="strip">
        <div className="coins">
          <span className="strip-label">Coins</span>
          <span className="strip-value">{fmt(state.coins)}</span>
        </div>
        <div>
          <span className="strip-label">Rebirth</span>
          <span className="strip-value">
            {state.rebirths}
            {state.tokens ? (
              <span style={{ color: "var(--cyan)", fontSize: 11 }}> · {state.tokens}t</span>
            ) : null}
          </span>
        </div>
        <button
          className="area-btn"
          onClick={() => {
            setTab("shop");
            setShopView("areas");
          }}
        >
          <span className="strip-label">Spot</span>
          <span className="strip-value">{area.name}</span>
        </button>
      </header>

      <main className="well">
        {tab === "fish" && (
          <FishTab
            state={state}
            phase={phase}
            result={result}
            castInfo={castInfo}
            refs={refs}
            recent={recent}
          />
        )}
        {tab === "hold" && <InventoryTab state={state} api={api} />}
        {tab === "shop" && (
          <ShopTab state={state} api={api} shopView={shopView} setShopView={setShopView} />
        )}
        {tab === "log" && <BestiaryTab state={state} />}
        {tab === "rebirth" && <RebirthTab state={state} api={api} />}
      </main>

      {flashRarity && (
        <div
          className="signal-flash"
          style={{ "--rar": flashRarity.color }}
        >
          <div className="signal-word">
            {flash.tier >= 6
              ? "Something incredible!"
              : flash.tier >= 5
              ? "Something huge!"
              : "Something big!"}
          </div>
        </div>
      )}

      <footer className="dock">
        {toast && <div className="toast">{toast}</div>}
        <button
          className="action"
          data-mode={actionMode}
          disabled={phase === "waiting"}
          onPointerDown={onPointerDown}
          onPointerUp={release}
          onPointerCancel={release}
          onPointerLeave={release}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="action-main">{actionText[0]}</span>
          <span className="action-sub">{actionText[1]}</span>
        </button>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              className="tab"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className="badge">
                {t.key === "hold"
                  ? `${state.inventory.length}`
                  : t.key === "rebirth"
                  ? `${state.tokens}t`
                  : t.key === "log"
                  ? `${Object.keys(state.bestiary).length}`
                  : t.key === "shop"
                  ? fmt(state.coins)
                  : area.code}
              </span>
            </button>
          ))}
        </nav>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
