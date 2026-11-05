// A minimal MQTT 3.1.1 client over WebSocket: just CONNECT, SUBSCRIBE,
// PUBLISH (QoS 0) and keep-alive pings. That's all an online match needs to
// use a public broker as a relay between phones on different networks
// (mobile data included) without running any server of our own.

const enc = new TextEncoder();
const dec = new TextDecoder();

function varint(n) {
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}

function str(s) {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 0xff, ...b];
}

function packet(type, body) {
  const head = [type, ...varint(body.length)];
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0);
  out.set(body, head.length);
  return out;
}

// url: wss://host[:port]/path ; opts: { username, password, keepalive }
export function mqttConnect(url, clientId, opts = {}) {
  const handlers = { message: [], close: [] };
  let ws;
  let buf = new Uint8Array(0);
  let ping = null;
  let pid = 1;
  let open = false;
  let closedByUs = false;

  const client = {
    get connected() { return open; },
    on(ev, fn) { handlers[ev].push(fn); return client; },
    subscribe(topic) {
      const id = pid++ & 0xffff || 1;
      send(packet(0x82, new Uint8Array([id >> 8, id & 0xff, ...str(topic), 0])));
    },
    publish(topic, payload) {
      const t = str(topic);
      const p = typeof payload === "string" ? enc.encode(payload) : payload;
      const body = new Uint8Array(t.length + p.length);
      body.set(t, 0);
      body.set(p, t.length);
      send(packet(0x30, body));
    },
    close() {
      closedByUs = true;
      try {
        if (open) ws.send(new Uint8Array([0xe0, 0]));
        ws.close();
      } catch (_) { /* already gone */ }
    },
  };

  function send(bytes) {
    if (ws && ws.readyState === 1) ws.send(bytes);
  }

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout"));
      try { ws.close(); } catch (_) { /* ignore */ }
    }, opts.timeout || 7000);
    try {
      ws = new WebSocket(url, ["mqtt"]);
    } catch (e) {
      clearTimeout(timer);
      reject(e);
      return;
    }
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      let flags = 0x02; // clean session
      const payload = [...str(clientId)];
      if (opts.username != null) {
        flags |= 0x80;
        payload.push(...str(opts.username));
      }
      if (opts.password != null) {
        flags |= 0x40;
        payload.push(...str(opts.password));
      }
      const ka = opts.keepalive || 30;
      const body = new Uint8Array([...str("MQTT"), 4, flags, ka >> 8, ka & 0xff, ...payload]);
      ws.send(packet(0x10, body));
    };
    ws.onmessage = (ev) => {
      const chunk = new Uint8Array(ev.data);
      const merged = new Uint8Array(buf.length + chunk.length);
      merged.set(buf, 0);
      merged.set(chunk, buf.length);
      buf = merged;
      // parse every complete packet in the buffer
      for (;;) {
        if (buf.length < 2) break;
        let mul = 1;
        let len = 0;
        let i = 1;
        let b;
        do {
          if (i >= buf.length) return;
          b = buf[i++];
          len += (b & 127) * mul;
          mul *= 128;
        } while (b & 128);
        if (buf.length < i + len) return;
        const type = buf[0] >> 4;
        const body = buf.subarray(i, i + len);
        if (type === 2) {
          // CONNACK
          clearTimeout(timer);
          if (body[1] === 0) {
            open = true;
            ping = setInterval(() => send(new Uint8Array([0xc0, 0])), ((opts.keepalive || 30) * 1000) / 2);
            resolve(client);
          } else {
            reject(new Error("refused " + body[1]));
          }
        } else if (type === 3) {
          // PUBLISH
          const qos = (buf[0] >> 1) & 3;
          const tl = (body[0] << 8) | body[1];
          const topic = dec.decode(body.subarray(2, 2 + tl));
          const start = 2 + tl + (qos ? 2 : 0);
          const msg = dec.decode(body.subarray(start));
          for (const fn of handlers.message) fn(topic, msg);
        }
        buf = buf.slice(i + len);
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      if (!open) reject(new Error("socket error"));
    };
    ws.onclose = () => {
      clearTimeout(timer);
      const was = open;
      open = false;
      clearInterval(ping);
      if (!was) reject(new Error("closed"));
      if (!closedByUs) for (const fn of handlers.close) fn();
    };
  });
  return ready;
}
