// ---------------------------------------------------------------------------
// Anchor — the screen itself.
//
// One list of accounts, each showing the code for the current 30-second
// window, plus the three ways an account gets in: scan a QR, decode a saved
// screenshot, or type the setup key.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { buildOtpauth, codeFor, parseAny, secondsRemaining } from "./totp.js";
import * as vault from "./vault.js";
import { cameraProblem, decodeImageFile, startScanner } from "./qr.js";

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const groupCode = (code) =>
  code.length % 2 === 0
    ? `${code.slice(0, code.length / 2)} ${code.slice(code.length / 2)}`
    : code;

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}

// clipboard.writeText needs a secure context; a plain http page still needs to
// be able to copy a code.
function legacyCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
}

/** A ticking clock, corrected by whatever drift the user has dialled in. */
function useNow(offsetMs) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    // 250ms keeps the countdown honest without spinning the CPU.
    const id = setInterval(() => setTick(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return tick + (offsetMs || 0);
}

// --- shell pieces ----------------------------------------------------------

function Sheet({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className={"sheet" + (wide ? " sheet-wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

function Ring({ fraction, seconds, urgent }) {
  const r = 13;
  const c = 2 * Math.PI * r;
  return (
    <svg className={"ring" + (urgent ? " urgent" : "")} viewBox="0 0 32 32" aria-hidden="true">
      <circle className="ring-track" cx="16" cy="16" r={r} />
      <circle
        className="ring-fill"
        cx="16" cy="16" r={r}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
      />
      <text x="16" y="20.5" textAnchor="middle" className="ring-text">{seconds}</text>
    </svg>
  );
}

function AccountRow({ account, now, hidden, onCopy, onOpen, onAdvance }) {
  const [revealed, setRevealed] = useState(!hidden);
  useEffect(() => setRevealed(!hidden), [hidden]);

  const period = account.period || 30;
  const isHotp = account.type === "hotp";

  let code, error = null;
  try {
    code = codeFor(account, now);
  } catch (err) {
    error = err.message;
    code = "—".repeat(account.digits || 6);
  }

  const left = secondsRemaining(now, period);
  const fraction = left / period;
  const urgent = !isHotp && left <= 5;

  return (
    <li className="account">
      <button
        className="account-main"
        onClick={() => {
          if (error) return onOpen();
          if (!revealed) return setRevealed(true);
          onCopy(code);
        }}
      >
        <span className="account-who">
          <span className="issuer">{account.issuer || account.name || "Account"}</span>
          {account.issuer && account.name ? <span className="name">{account.name}</span> : null}
        </span>
        <span className={"code" + (error ? " code-error" : "") + (urgent ? " urgent" : "")}>
          {revealed ? groupCode(code) : "•".repeat(account.digits || 6)}
        </span>
        {error ? <span className="row-error">{error}</span> : null}
      </button>

      <div className="account-side">
        {isHotp ? (
          <button className="icon-btn" onClick={onAdvance} aria-label="Next code" title="Next code">↻</button>
        ) : (
          <Ring fraction={fraction} seconds={left} urgent={urgent} />
        )}
        <button className="icon-btn" onClick={onOpen} aria-label="Account settings">⋯</button>
      </div>
    </li>
  );
}

// --- adding an account -----------------------------------------------------

function ScanPane({ onText, onFallback }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(() => cameraProblem());

  useEffect(() => {
    if (cameraProblem()) return undefined;
    const scanner = startScanner(videoRef.current, {
      onResult: onText,
      onError: (err) => setError(err.message),
    });
    return () => scanner.stop();
  }, [onText]);

  return (
    <div className="scan">
      <div className="viewport">
        <video ref={videoRef} playsInline muted />
        <div className="reticle" />
      </div>
      {error ? <p className="notice warn">{error}</p> : (
        <p className="notice">Point the camera at the QR code on the Roblox 2-Step Verification page.</p>
      )}
      <button className="ghost-btn" onClick={onFallback}>
        Can’t scan? Use a screenshot or the setup key
      </button>
    </div>
  );
}

function ImagePane({ onText, onError }) {
  const [busy, setBusy] = useState(false);

  const handle = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      onText(await decodeImageFile(file));
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pane">
      <p className="notice">
        Screenshot the QR code on the Roblox page, then pick it here. This is the
        one that works when the code is on the same phone.
      </p>
      <label className="file-drop">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handle(e.target.files && e.target.files[0])}
        />
        <span>{busy ? "Reading…" : "Choose an image"}</span>
      </label>
    </div>
  );
}

function KeyPane({ onText, onError }) {
  const [text, setText] = useState("");
  return (
    <div className="pane">
      <p className="notice">
        Roblox shows a setup key under “Can’t scan the QR code?”. Paste that, or a
        full otpauth:// link.
      </p>
      <textarea
        className="key-input"
        rows={3}
        spellCheck={false}
        autoCapitalize="characters"
        placeholder="JBSW Y3DP EHPK 3PXP"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        className="primary-btn"
        onClick={() => {
          try {
            onText(text);
          } catch (err) {
            onError(err.message);
          }
        }}
        disabled={!text.trim()}
      >
        Continue
      </button>
    </div>
  );
}

function ConfirmPane({ drafts, now, onCancel, onSave }) {
  const [rows, setRows] = useState(drafts);
  const edit = (i, patch) =>
    setRows((rs) => rs.map((r, j) => (i === j ? { ...r, ...patch } : r)));

  return (
    <div className="pane">
      <p className="notice">
        {rows.length > 1 ? `${rows.length} accounts found.` : "Found it."} Check the
        name, then save.
      </p>
      {rows.map((r, i) => {
        let preview = "";
        try { preview = groupCode(codeFor(r, now)); } catch { preview = "invalid secret"; }
        return (
          <div className="draft" key={i}>
            <label>
              <span>Service</span>
              <input value={r.issuer} placeholder="Roblox"
                onChange={(e) => edit(i, { issuer: e.target.value })} />
            </label>
            <label>
              <span>Account</span>
              <input value={r.name} placeholder="your username"
                onChange={(e) => edit(i, { name: e.target.value })} />
            </label>
            <p className="draft-meta">
              {r.type.toUpperCase()} · {r.algorithm} · {r.digits} digits ·{" "}
              {r.type === "hotp" ? `counter ${r.counter}` : `${r.period}s`}
              <span className="draft-code">{preview}</span>
            </p>
          </div>
        );
      })}
      <div className="row-buttons">
        <button className="ghost-btn" onClick={onCancel}>Cancel</button>
        <button className="primary-btn" onClick={() => onSave(rows)}>
          Save {rows.length > 1 ? `${rows.length} accounts` : "account"}
        </button>
      </div>
    </div>
  );
}

function AddSheet({ now, onClose, onSave, notify }) {
  const [tab, setTab] = useState(() => (cameraProblem() ? "image" : "scan"));
  const [drafts, setDrafts] = useState(null);
  const [error, setError] = useState(null);

  const accept = useCallback((text) => {
    try {
      setDrafts(parseAny(text).map((d) => ({ ...d, id: uid() })));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  if (drafts) {
    return (
      <Sheet title="Confirm account" onClose={onClose}>
        <ConfirmPane
          drafts={drafts}
          now={now}
          onCancel={() => setDrafts(null)}
          onSave={(rows) => { onSave(rows); notify(rows.length > 1 ? "Accounts added" : "Account added"); }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet title="Add account" onClose={onClose}>
      <div className="tabs" role="tablist">
        {[["scan", "Scan"], ["image", "Image"], ["key", "Setup key"]].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={"tab" + (tab === id ? " on" : "")}
            onClick={() => { setTab(id); setError(null); }}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? <p className="notice warn">{error}</p> : null}
      {tab === "scan" ? <ScanPane onText={accept} onFallback={() => setTab("image")} /> : null}
      {tab === "image" ? <ImagePane onText={accept} onError={setError} /> : null}
      {tab === "key" ? <KeyPane onText={accept} onError={setError} /> : null}
    </Sheet>
  );
}

// --- one account's own screen ---------------------------------------------

function AccountSheet({ account, onClose, onChange, onDelete, notify }) {
  const [draft, setDraft] = useState(account);
  const [showSecret, setShowSecret] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <Sheet title={account.issuer || account.name || "Account"} onClose={onClose}>
      <div className="pane">
        <label>
          <span>Service</span>
          <input value={draft.issuer}
            onChange={(e) => setDraft({ ...draft, issuer: e.target.value })} />
        </label>
        <label>
          <span>Account</span>
          <input value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <button className="primary-btn" onClick={() => { onChange(draft); notify("Saved"); }}>
          Save
        </button>

        <h3>Backup</h3>
        <p className="notice">
          Keep this somewhere safe and offline. Anyone holding it can generate your
          codes.
        </p>
        {showSecret ? (
          <>
            <code className="secret">{account.secret}</code>
            <div className="row-buttons">
              <button className="ghost-btn"
                onClick={() => copyText(account.secret).then(() => notify("Setup key copied"))}>
                Copy key
              </button>
              <button className="ghost-btn"
                onClick={() => copyText(buildOtpauth(account)).then(() => notify("otpauth link copied"))}>
                Copy link
              </button>
            </div>
          </>
        ) : (
          <button className="ghost-btn" onClick={() => setShowSecret(true)}>Show setup key</button>
        )}

        <h3>Remove</h3>
        {confirming ? (
          <div className="row-buttons">
            <button className="ghost-btn" onClick={() => setConfirming(false)}>Keep it</button>
            <button className="danger-btn" onClick={onDelete}>Delete for good</button>
          </div>
        ) : (
          <>
            <p className="notice warn">
              Deleting this does not turn 2FA off at Roblox. Turn it off there first,
              or you will be locked out.
            </p>
            <button className="danger-btn" onClick={() => setConfirming(true)}>Delete account</button>
          </>
        )}
      </div>
    </Sheet>
  );
}

// --- settings --------------------------------------------------------------

function SettingsSheet({ state, onClose, onVault, notify }) {
  const { accounts, settings } = state;
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState(null);
  const [importText, setImportText] = useState("");
  const [exported, setExported] = useState(null);

  const applyPin = async () => {
    setError(null);
    if (pin !== pin2) return setError("The two PINs do not match.");
    try {
      await vault.setPin(pin, state);
      setPin(""); setPin2("");
      onVault(state);
      notify("PIN set");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Sheet title="Settings" onClose={onClose} wide>
      <div className="pane">
        <h3>PIN lock</h3>
        {vault.canEncrypt() ? (
          vault.hasPin() ? (
            <>
              <p className="notice">The vault is encrypted. Anchor asks for the PIN on open.</p>
              <button className="ghost-btn" onClick={async () => {
                await vault.clearPin(state); onVault(state); notify("PIN removed");
              }}>
                Remove PIN
              </button>
            </>
          ) : (
            <>
              <p className="notice">
                Encrypts your secrets with AES-GCM. There is no recovery — lose the
                PIN and the accounts go with it, so keep the setup keys backed up.
              </p>
              <label><span>PIN</span>
                <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} /></label>
              <label><span>Again</span>
                <input type="password" value={pin2} onChange={(e) => setPin2(e.target.value)} /></label>
              <button className="primary-btn" onClick={applyPin} disabled={pin.length < 4}>Set PIN</button>
            </>
          )
        ) : (
          <p className="notice warn">
            This page has no WebCrypto, so it cannot encrypt the vault. The APK can.
          </p>
        )}

        <h3>Clock</h3>
        <p className="notice">
          Codes are time-based. If Roblox keeps rejecting them, your clock is off —
          fix it in Android settings, or nudge it here.
        </p>
        <label>
          <span>Offset</span>
          <select
            value={settings.timeOffsetMs}
            onChange={(e) => onVault({ ...state, settings: { ...settings, timeOffsetMs: Number(e.target.value) } })}
          >
            {[-60000, -30000, -10000, -5000, 0, 5000, 10000, 30000, 60000].map((ms) => (
              <option key={ms} value={ms}>{ms === 0 ? "None" : `${ms > 0 ? "+" : ""}${ms / 1000}s`}</option>
            ))}
          </select>
        </label>

        <h3>Privacy</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={!!settings.hideCodes}
            onChange={(e) => onVault({ ...state, settings: { ...settings, hideCodes: e.target.checked } })}
          />
          <span>Hide codes until tapped</span>
        </label>

        <h3>Backup</h3>
        <p className="notice warn">
          An export holds your secrets in the clear. Treat it like the passwords
          themselves.
        </p>
        <div className="row-buttons">
          <button className="ghost-btn" onClick={() => setExported(accounts.map(buildOtpauth).join("\n"))}>
            Show otpauth links
          </button>
          <button className="ghost-btn" disabled={!accounts.length} onClick={() => {
            copyText(JSON.stringify({ v: 1, accounts }, null, 2)).then(() => notify("Backup copied"));
          }}>
            Copy JSON
          </button>
        </div>
        {exported ? <textarea className="key-input" rows={4} readOnly value={exported} /> : null}

        <h3>Import</h3>
        <p className="notice">
          Paste otpauth:// links (one per line), an Anchor JSON backup, or a Google
          Authenticator export link.
        </p>
        <textarea className="key-input" rows={3} value={importText} spellCheck={false}
          onChange={(e) => setImportText(e.target.value)} />
        <button className="primary-btn" disabled={!importText.trim()} onClick={() => {
          try {
            const added = readImport(importText);
            onVault({ ...state, accounts: [...accounts, ...added.map((a) => ({ ...a, id: uid() }))] });
            setImportText("");
            notify(`Imported ${added.length} account${added.length === 1 ? "" : "s"}`);
          } catch (err) {
            setError(err.message);
          }
        }}>
          Import
        </button>
        {error ? <p className="notice warn">{error}</p> : null}
      </div>
    </Sheet>
  );
}

/** Reads whatever a person pastes into the import box. */
function readImport(text) {
  const raw = text.trim();
  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.accounts;
    if (!Array.isArray(list) || !list.length) throw new Error("No accounts in that backup.");
    return list.map((a) => parseAny(buildOtpauth(a))[0]);
  }
  const out = [];
  for (const line of raw.split(/[\r\n]+/)) {
    if (line.trim()) out.push(...parseAny(line.trim()));
  }
  if (!out.length) throw new Error("Nothing to import.");
  return out;
}

// --- lock screen -----------------------------------------------------------

function LockScreen({ onUnlocked }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onUnlocked(await vault.unlock(pin));
    } catch (err) {
      setError(err.message);
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="lock" onSubmit={submit}>
      <div className="mark" aria-hidden="true">⚓</div>
      <h1>Anchor</h1>
      <p className="notice">Enter your PIN to unlock.</p>
      <input type="password" value={pin} autoFocus
        onChange={(e) => setPin(e.target.value)} aria-label="PIN" />
      {error ? <p className="notice warn">{error}</p> : null}
      <button className="primary-btn" disabled={busy || !pin}>Unlock</button>
    </form>
  );
}

// --- the app ---------------------------------------------------------------

function App() {
  const [phase, setPhase] = useState("loading");
  const [state, setState] = useState(vault.emptyVault());
  const [sheet, setSheet] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState("");

  const now = useNow(state.settings.timeOffsetMs);

  useEffect(() => {
    vault.open().then((r) => {
      if (r.status === "locked") return setPhase("locked");
      setState(r.vault);
      setPhase("ready");
    });
  }, []);

  const notify = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast((t) => (t === message ? null : t)), 1800);
  }, []);

  // Every change goes straight to storage: an authenticator that loses an
  // account because the app was swiped away is worse than useless.
  const commit = useCallback((next) => {
    setState(next);
    vault.persist(next).catch(() => notify("Could not save to storage"));
  }, [notify]);

  const addAccounts = (rows) => {
    const fresh = rows.filter(
      (r) => !state.accounts.some((a) => a.secret === r.secret && a.issuer === r.issuer && a.name === r.name)
    );
    if (!fresh.length) {
      notify("Already saved");
      setSheet(null);
      return;
    }
    commit({ ...state, accounts: [...state.accounts, ...fresh] });
    setSheet(null);
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.accounts;
    return state.accounts.filter((a) =>
      `${a.issuer} ${a.name}`.toLowerCase().includes(q));
  }, [state.accounts, query]);

  const open = state.accounts.find((a) => a.id === openId) || null;

  if (phase === "loading") return <div className="loading" />;
  if (phase === "locked") {
    return (
      <LockScreen onUnlocked={(v) => { setState(v); setPhase("ready"); }} />
    );
  }

  return (
    <div className="app">
      <header className="top">
        <span className="brand"><span aria-hidden="true">⚓</span> Anchor</span>
        <div className="top-actions">
          {vault.hasPin() ? (
            <button className="icon-btn" title="Lock now" aria-label="Lock now"
              onClick={() => { vault.lockNow(); setPhase("locked"); }}>🔒</button>
          ) : null}
          <button className="icon-btn" aria-label="Settings" onClick={() => setSheet("settings")}>⚙</button>
        </div>
      </header>

      {state.accounts.length > 6 ? (
        <input className="search" placeholder="Search" value={query}
          onChange={(e) => setQuery(e.target.value)} />
      ) : null}

      {state.accounts.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No accounts yet</p>
          <p className="notice">
            On Roblox: Settings → Account Info → Security → 2-Step Verification →
            Authenticator App. Scan the QR it shows, or paste the setup key.
          </p>
          <button className="primary-btn" onClick={() => setSheet("add")}>Add your first account</button>
        </div>
      ) : (
        <ul className="accounts">
          {shown.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              now={now}
              hidden={!!state.settings.hideCodes}
              onCopy={(code) => copyText(code).then(() => notify("Code copied"))}
              onOpen={() => setOpenId(a.id)}
              onAdvance={() => commit({
                ...state,
                accounts: state.accounts.map((x) =>
                  x.id === a.id ? { ...x, counter: (x.counter || 0) + 1 } : x),
              })}
            />
          ))}
          {shown.length === 0 ? <li className="empty-hint">Nothing matches “{query}”.</li> : null}
        </ul>
      )}

      {state.accounts.length > 0 ? (
        <button className="fab" onClick={() => setSheet("add")} aria-label="Add account">+</button>
      ) : null}

      {sheet === "add" ? (
        <AddSheet now={now} notify={notify} onClose={() => setSheet(null)} onSave={addAccounts} />
      ) : null}

      {sheet === "settings" ? (
        <SettingsSheet
          state={state}
          notify={notify}
          onClose={() => setSheet(null)}
          onVault={commit}
        />
      ) : null}

      {open ? (
        <AccountSheet
          account={open}
          notify={notify}
          onClose={() => setOpenId(null)}
          onChange={(next) => commit({
            ...state,
            accounts: state.accounts.map((x) => (x.id === next.id ? next : x)),
          })}
          onDelete={() => {
            commit({ ...state, accounts: state.accounts.filter((x) => x.id !== open.id) });
            setOpenId(null);
            notify("Account deleted");
          }}
        />
      ) : null}

      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
