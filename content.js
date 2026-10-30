(() => {
  if (window.top !== window || window.__fpwLoaded) return;
  window.__fpwLoaded = true;
  const api = browser;
  const DOCK_H = 38;

  let enabled = false;
  let counter = 0;
  let zTop = 10;
  const wins = new Map(); // id -> {el, chip, minimized, maximized, snapped, prev, url}

  let restoring = false;
  let saveT;

  api.storage.local.get("enabled").then((r) => (enabled = !!r.enabled));
  api.storage.onChanged.addListener((c) => {
    if (c.enabled) {
      enabled = !!c.enabled.newValue;
      toast(enabled ? "Pop-up mode ON: left-click a link to open it in a floating window" : "Pop-up mode OFF (Alt+click still works)");
    }
  });

  // ---------- UI host (shadow DOM so page CSS can't interfere) ----------
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>
    *{box-sizing:border-box;font-family:system-ui,sans-serif}
    .win{position:fixed;pointer-events:auto;display:flex;flex-direction:column;background:#fff;
      border:1px solid #475569;border-radius:8px;box-shadow:0 10px 35px rgba(0,0,0,.4);overflow:hidden;min-width:240px;min-height:160px}
    .win.focus{border-color:#3b82f6;box-shadow:0 12px 40px rgba(0,0,0,.55)}
    .win.min{display:none}
    .win.max{left:0!important;top:0!important;width:100vw!important;height:calc(100vh - ${DOCK_H}px)!important;border-radius:0}
    .bar{display:flex;align-items:center;gap:6px;padding:4px 6px;background:#1f2937;color:#e5e7eb;cursor:move;user-select:none;flex:none}
    .win.focus .bar{background:#1e3a8a}
    .title{font-size:12px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .url{flex:1;min-width:40px;font-size:12px;padding:3px 6px;border-radius:4px;border:0;background:#111827;color:#e5e7eb;outline:none}
    button{all:unset;cursor:pointer;width:24px;height:22px;text-align:center;line-height:22px;border-radius:4px;font-size:13px;color:#e5e7eb}
    button:hover{background:rgba(255,255,255,.18)}
    button.x:hover{background:#dc2626}
    .body{flex:1;position:relative;background:#fff}
    iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
    .h{position:absolute;z-index:5}
    .h[data-d=n]{top:-3px;left:8px;right:8px;height:8px;cursor:ns-resize}
    .h[data-d=s]{bottom:-3px;left:8px;right:8px;height:8px;cursor:ns-resize}
    .h[data-d=e]{right:-3px;top:8px;bottom:8px;width:8px;cursor:ew-resize}
    .h[data-d=w]{left:-3px;top:8px;bottom:8px;width:8px;cursor:ew-resize}
    .h[data-d=ne]{top:-3px;right:-3px;width:14px;height:14px;cursor:nesw-resize}
    .h[data-d=nw]{top:-3px;left:-3px;width:14px;height:14px;cursor:nwse-resize}
    .h[data-d=se]{bottom:-3px;right:-3px;width:14px;height:14px;cursor:nwse-resize}
    .h[data-d=sw]{bottom:-3px;left:-3px;width:14px;height:14px;cursor:nesw-resize}
    /* Dock + preview + toast always sit above every window */
    .dock{position:fixed;left:0;right:0;bottom:0;height:${DOCK_H}px;pointer-events:auto;display:none;align-items:center;gap:6px;
      padding:4px 8px;background:rgba(17,24,39,.97);color:#e5e7eb;z-index:2147483000;box-shadow:0 -2px 12px rgba(0,0,0,.4)}
    .dock.show{display:flex}
    .chip{font-size:12px;padding:4px 10px;border-radius:6px;background:#374151;color:#e5e7eb;cursor:pointer;max-width:160px;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:auto;height:auto;line-height:1.4}
    .chip:hover{background:#2563eb}
    .dock button.tool{width:auto;padding:0 8px;background:#1d4ed8}
    .dock .sp{flex:1}
    .preview{position:fixed;pointer-events:none;display:none;background:rgba(59,130,246,.22);border:2px solid #3b82f6;
      border-radius:8px;z-index:2147482000;transition:all .08s}
    .toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:8px 14px;z-index:2147483100;
      border-radius:8px;font-size:13px;pointer-events:none;opacity:0;transition:opacity .25s}
    .toast.show{opacity:1}
  </style>
  <div class="preview"></div>
  <div class="dock">
    <button class="tool" data-act="new" title="Open a new window">＋ New</button>
    <button class="tool" data-act="tile" title="Auto-tile all windows">▦ Tile</button>
    <button class="tool" data-act="tile4" title="4-tile: arrange the 4 newest windows in 2×2">⊞ 4-Tile</button>
    <button class="tool" data-act="closeall" title="Close all windows">✕ All</button>
    <span class="sp"></span>
    <span class="chips" style="display:flex;gap:6px"></span>
  </div>
  <div class="toast"></div>`;
  document.documentElement.appendChild(host);

  const dock = root.querySelector(".dock");
  const chips = root.querySelector(".chips");
  const toastEl = root.querySelector(".toast");
  const preview = root.querySelector(".preview");
  let toastTimer;
  function toast(t) {
    toastEl.textContent = t;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2500);
  }

  function normalize(u) {
    u = u.trim();
    if (!u) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
    try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; }
  }
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  const availH = () => innerHeight - DOCK_H;

  function report() {
    api.runtime.sendMessage({ type: "windows", count: wins.size }).catch(() => {});
    dock.classList.toggle("show", wins.size > 0);
  }

  // ---------- persistence (survives page reloads / navigation in the same tab) ----------
  function serialize() {
    const order = [...wins.values()].sort((a, b) => (parseInt(a.el.style.zIndex) || 0) - (parseInt(b.el.style.zIndex) || 0));
    return {
      windows: order.map((w) => ({
        url: w.url,
        x: parseFloat(w.el.style.left), y: parseFloat(w.el.style.top),
        w: parseFloat(w.el.style.width), h: parseFloat(w.el.style.height),
        minimized: w.minimized, maximized: w.maximized, snapped: w.snapped, prev: w.prev,
      })),
    };
  }
  function flush() {
    if (restoring) return;
    api.runtime.sendMessage({ type: "saveState", state: serialize() }).catch(() => {});
  }
  function save() {
    if (restoring) return;
    clearTimeout(saveT);
    saveT = setTimeout(flush, 250);
  }
  addEventListener("pagehide", flush);

  function focusWin(id, raise = true) {
    wins.forEach((w, k) => w.el.classList.toggle("focus", k === id));
    const w = wins.get(id);
    if (w && raise) w.el.style.zIndex = ++zTop;
  }

  function setRect(el, x, y, w, h) {
    Object.assign(el.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
  }
  function savePrev(rec) {
    if (rec.snapped || rec.maximized) return;
    const r = rec.el.getBoundingClientRect();
    rec.prev = { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  // ---------- snap zones (drag to an edge / corner) ----------
  function zoneAt(x, y) {
    const T = 14, C = 90, H = availH(), W = innerWidth;
    const hw = Math.floor(W / 2), hh = Math.floor(H / 2);
    const l = x <= T, r = x >= W - T, t = y <= T;
    if (l || r) {
      const left = l;
      if (y < C) return { kind: "snap", x: left ? 0 : hw, y: 0, w: left ? hw : W - hw, h: hh };            // top corners
      if (y > H - C) return { kind: "snap", x: left ? 0 : hw, y: hh, w: left ? hw : W - hw, h: H - hh };    // bottom corners
      return { kind: "snap", x: left ? 0 : hw, y: 0, w: left ? hw : W - hw, h: H };                          // left / right half
    }
    if (t) return { kind: "max" };
    return null;
  }
  function showPreview(z) {
    if (!z) { preview.style.display = "none"; return; }
    const r = z.kind === "max" ? { x: 0, y: 0, w: innerWidth, h: availH() } : z;
    Object.assign(preview.style, { display: "block", left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
  }
  function applyZone(rec, z) {
    if (!z) return;
    savePrev(rec);
    if (z.kind === "max") {
      rec.maximized = true; rec.snapped = false; rec.el.classList.add("max");
    } else {
      rec.maximized = false; rec.snapped = true; rec.el.classList.remove("max");
      setRect(rec.el, z.x, z.y, z.w, z.h);
    }
  }
  // un-snap / un-maximize back to the remembered size (used when dragging out of a snap)
  function unsnap(rec, fallbackW, fallbackH) {
    const p = rec.prev || { w: fallbackW, h: fallbackH };
    rec.maximized = false; rec.snapped = false; rec.el.classList.remove("max");
    return p;
  }

  // ---------- create a window ----------
  async function openWindow(url, saved) {
    url = normalize(url || "https://duckduckgo.com");
    if (!url) return;
    const id = ++counter;
    const n = wins.size;
    const W = Math.min(900, innerWidth * 0.6), H = Math.min(620, innerHeight * 0.7);
    const el = document.createElement("div");
    el.className = "win";
    if (saved) {
      const sw = Math.min(saved.w || W, innerWidth), sh = Math.min(saved.h || H, availH());
      const sx = Math.max(-sw + 80, Math.min(innerWidth - 80, saved.x || 0));
      const sy = Math.max(0, Math.min(availH() - 40, saved.y || 0));
      el.style.cssText = `left:${sx}px;top:${sy}px;width:${sw}px;height:${sh}px;`;
    } else {
      el.style.cssText = `left:${40 + (n % 8) * 32}px;top:${40 + (n % 8) * 32}px;width:${W}px;height:${H}px;`;
    }
    el.innerHTML = `
      <div class="bar">
        <span class="title"></span>
        <input class="url" spellcheck="false">
        <button data-a="left" title="Snap left half">◧</button>
        <button data-a="right" title="Snap right half">◨</button>
        <button data-a="reload" title="Reload">⟳</button>
        <button data-a="tab" title="Open in a normal tab">↗</button>
        <button data-a="min" title="Minimize">–</button>
        <button data-a="max" title="Maximize / restore">▢</button>
        <button data-a="close" class="x" title="Close">✕</button>
      </div>
      <div class="body"><iframe allow="fullscreen; clipboard-write; autoplay; encrypted-media"></iframe></div>
      ${["n","s","e","w","ne","nw","se","sw"].map((d) => `<div class="h" data-d="${d}"></div>`).join("")}`;
    root.appendChild(el);

    const chip = document.createElement("button");
    chip.className = "chip";
    const rec = { el, chip, minimized: false, maximized: false, snapped: false, prev: null, url };
    if (saved) {
      rec.maximized = !!saved.maximized; rec.snapped = !!saved.snapped; rec.prev = saved.prev || null;
      if (rec.maximized) el.classList.add("max");
    }
    wins.set(id, rec);
    report();
    await new Promise((r) => setTimeout(r, 50)); // let background register this tab first

    const iframe = el.querySelector("iframe");
    const urlBox = el.querySelector(".url");
    const title = el.querySelector(".title");
    const load = (u) => { rec.url = u; urlBox.value = u; title.textContent = hostOf(u); chip.textContent = hostOf(u); iframe.src = u; save(); };
    load(url);
    if (saved && saved.minimized) minimize(id); else focusWin(id);

    el.addEventListener("pointerdown", () => { focusWin(id); save(); }, true);

    // Hover = select: highlight instantly, raise + give keyboard/scroll focus after a short delay
    let hoverT;
    el.addEventListener("pointerenter", () => {
      if (rec.minimized) return;
      focusWin(id, false);
      clearTimeout(hoverT);
      hoverT = setTimeout(() => {
        if (!el.matches(":hover")) return;
        el.style.zIndex = ++zTop;
        const typing = root.activeElement && root.activeElement.tagName === "INPUT";
        if (!typing) { try { iframe.focus(); } catch {} }
      }, 120);
    });
    el.addEventListener("pointerleave", () => clearTimeout(hoverT));

    urlBox.addEventListener("keydown", (e) => { if (e.key === "Enter") { const u = normalize(urlBox.value); if (u) { report(); load(u); } } });
    chip.addEventListener("click", () => restore(id));

    const act = {
      close: () => closeWin(id),
      min: () => minimize(id),
      max: () => toggleMax(id),
      reload: () => { report(); load(rec.url); },
      tab: () => window.open(rec.url, "_blank"),
      left: () => snapHalf(id, "left"),
      right: () => snapHalf(id, "right"),
    };
    const bar = el.querySelector(".bar");
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-a]");
      if (b) act[b.dataset.a]();
    });
    bar.addEventListener("dblclick", (e) => { if (!e.target.closest("input,button")) toggleMax(id); });

    // drag (with edge/corner snapping)
    bar.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button,input") || e.button !== 0) return;
      let r = el.getBoundingClientRect();
      if (rec.maximized || rec.snapped) {
        const ratio = (e.clientX - r.left) / r.width;
        const p = unsnap(rec, W, H);
        setRect(el, e.clientX - ratio * p.w, r.top, p.w, p.h);
        r = el.getBoundingClientRect();
      }
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      let zone = null;
      bar.setPointerCapture(e.pointerId);
      const move = (ev) => {
        el.style.left = Math.max(-r.width + 80, Math.min(innerWidth - 80, ev.clientX - dx)) + "px";
        el.style.top = Math.max(0, Math.min(availH() - 40, ev.clientY - dy)) + "px";
        zone = zoneAt(ev.clientX, ev.clientY);
        showPreview(zone);
      };
      const up = () => {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
        showPreview(null);
        if (zone) {
          // remember the free-floating rect (current position) only if we weren't already restored
          rec.snapped = false; rec.maximized = false;
          const cur = el.getBoundingClientRect();
          rec.prev = { x: cur.left, y: cur.top, w: cur.width, h: cur.height };
          applyZone(rec, zone);
          rec.prev = { x: cur.left, y: cur.top, w: cur.width, h: cur.height };
        }
        save();
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
    });

    // resize
    el.querySelectorAll(".h").forEach((h) => {
      h.addEventListener("pointerdown", (e) => {
        if (rec.maximized) return;
        e.preventDefault();
        rec.snapped = false;
        const d = h.dataset.d, r = el.getBoundingClientRect();
        const sx = e.clientX, sy = e.clientY;
        h.setPointerCapture(e.pointerId);
        const MINW = 240, MINH = 160;
        const move = (ev) => {
          let { left, top, width, height } = r;
          const ddx = ev.clientX - sx, ddy = ev.clientY - sy;
          if (d.includes("e")) width = Math.max(MINW, r.width + ddx);
          if (d.includes("s")) height = Math.max(MINH, r.height + ddy);
          if (d.includes("w")) { width = Math.max(MINW, r.width - ddx); left = r.right - width; }
          if (d.includes("n")) { height = Math.max(MINH, r.height - ddy); top = r.bottom - height; }
          Object.assign(el.style, { left: left + "px", top: Math.max(0, top) + "px", width: width + "px", height: height + "px" });
        };
        const up = () => { h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); save(); };
        h.addEventListener("pointermove", move);
        h.addEventListener("pointerup", up);
      });
    });
  }

  // ---------- window operations ----------
  function closeWin(id) {
    const w = wins.get(id); if (!w) return;
    w.el.remove(); w.chip.remove(); wins.delete(id); report(); save();
  }
  function minimize(id) {
    const w = wins.get(id); if (!w) return;
    w.minimized = true; w.el.classList.add("min"); chips.appendChild(w.chip); save();
  }
  function restore(id) {
    const w = wins.get(id); if (!w) return;
    w.minimized = false; w.el.classList.remove("min"); w.chip.remove(); focusWin(id); save();
  }
  function toggleMax(id) {
    const w = wins.get(id); if (!w) return;
    if (!w.maximized) {
      savePrev(w);
      w.maximized = true; w.snapped = false; w.el.classList.add("max");
    } else {
      w.maximized = false; w.el.classList.remove("max");
      if (w.prev) setRect(w.el, w.prev.x, w.prev.y, w.prev.w, w.prev.h);
    }
    focusWin(id); save();
  }
  function snapHalf(id, side) {
    const w = wins.get(id); if (!w) return;
    const hw = Math.floor(innerWidth / 2);
    applyZone(w, { kind: "snap", x: side === "left" ? 0 : hw, y: 0, w: side === "left" ? hw : innerWidth - hw, h: availH() });
    focusWin(id); save();
  }
  function tile(maxCount, forceCols) {
    let list = [...wins.values()].filter((w) => !w.minimized);
    if (maxCount) list = list.slice(-maxCount);
    if (!list.length) return;
    const cols = forceCols || Math.ceil(Math.sqrt(list.length));
    const rows = Math.ceil(list.length / cols);
    const cw = Math.floor(innerWidth / cols), ch = Math.floor(availH() / rows);
    list.forEach((w, i) => {
      savePrev(w);
      w.maximized = false; w.snapped = true; w.el.classList.remove("max");
      const lone = i === list.length - 1 && i % cols === 0 && cols > 1; // last window alone in its row → full width
      setRect(w.el, (i % cols) * cw, Math.floor(i / cols) * ch, lone ? innerWidth : cw, ch);
    });
    save();
  }

  dock.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const a = b.dataset.act;
    if (a === "new") { const u = prompt("Enter a URL to open:", "https://"); if (u) openWindow(u); }
    if (a === "tile") tile();
    if (a === "tile4") tile(4, 2);
    if (a === "closeall") [...wins.keys()].forEach(closeWin);
  });

  // ---------- restore windows after a reload ----------
  (async () => {
    try {
      const st = await api.runtime.sendMessage({ type: "getState" });
      if (st && st.windows && st.windows.length) {
        restoring = true;
        for (const w of st.windows) await openWindow(w.url, w);
        restoring = false;
        save();
        toast("Restored " + st.windows.length + " pop-up window" + (st.windows.length > 1 ? "s" : ""));
      }
    } catch { restoring = false; }
  })();

  // ---------- left-click interception ----------
  document.addEventListener("click", (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
    if (!enabled && !e.altKey) return;
    const a = e.composedPath().find((n) => n instanceof HTMLAnchorElement && n.href);
    if (!a || !/^https?:$/.test(a.protocol)) return;
    e.preventDefault();
    e.stopPropagation();
    openWindow(a.href);
  }, true);
})();
