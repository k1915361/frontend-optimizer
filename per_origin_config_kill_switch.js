
/*───────────────────────────────────────────────────────────────────────────────
  REFINEMENT NOTE [2025-09-07]: Per-origin config + kill switch
  - Per-site overrides live in localStorage.__ufo (JSON string for *this* origin).
  - Update at runtime via window.__ufo_update({...}).
  - Set { DISABLE: true } to detach observers, restore patched APIs, and stop features.
  - Each module can push cleanup fns into window.__ufo.__cleanups to cooperate.
───────────────────────────────────────────────────────────────────────────────*/
(() => {
  // Shared namespace
  const UFO = (window.__ufo ??= {});
  // Feature flags bucket (modules read/flip these). Do not overwrite if present.
  const FEAT = (UFO.FEAT ??= {});
  // Central cleanup registry: modules push fns here to undo their patches/observers.
  const CLEAN = (UFO.__cleanups ??= []);
  // Lightweight flags (e.g., REALTIME) live here if you need non-FEAT toggles.
  UFO.flags ??= {};

  
  (UFO.util ??= {});
  UFO.util.injectStyle ||= function injectStyle(cssText, id) {
    try {
      // if GM_addStyle exists (userscript case), use it
      // eslint-disable-next-line no-undef
      if (typeof GM_addStyle === "function") return GM_addStyle(cssText);
    } catch {}
    const el = document.createElement("style");
    if (id) el.id = id;
    el.textContent = cssText;
    document.head.appendChild(el);
    (UFO.__cleanups ??= []).push(() => el.remove());
    return { node: el };
  };

  // Optional adapter so older modules calling addStyle still work:
  UFO.util.addStyle = (css, id) => (UFO.util.injectStyle(css, id).node);

  // --- Helpers ---------------------------------------------------------------
  function safeParse(json) {
    try { return JSON.parse(json); } catch { return null; }
  }
  function merge(dst, src) {
    if (!src || typeof src !== "object") return dst;
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        dst[k] = merge(dst[k] ? { ...dst[k] } : {}, v);
      } else {
        dst[k] = v;
      }
    }
    return dst;
  }
  function applyFlags(partialFlags) {
    if (!partialFlags || typeof partialFlags !== "object") return;
    for (const [k, v] of Object.entries(partialFlags)) {
      // Only touch known flags; if a module later defines a new FEAT key, updates will apply too
      FEAT[k] = v;
    }
  }

  // --- Kill switch -----------------------------------------------------------
  // Call to undo patches/observers/timers registered by modules.
  window.__ufo_disable = function __ufo_disable() {
    // Run and clear all registered cleanups (best-effort)
    try {
      while (CLEAN.length) {
        const fn = CLEAN.pop();
        try { fn && fn(); } catch {}
      }
    } catch {}
    // Optional: mark disabled so other modules bail early if they check this.
    UFO.DISABLED = true;
  };

  // --- Config load / save ----------------------------------------------------
  function loadConfig() {
    // Per-origin; key is simple for convenience. Stored as a JSON string.
    return safeParse(localStorage.__ufo || "") || {};
  }
  function saveConfig(obj) {
    try { localStorage.__ufo = JSON.stringify(obj || {}); } catch {}
  }

  // --- Public API ------------------------------------------------------------
  // Merge and persist overrides; shape:
  //   { FEAT: { FLAG:true/false }, FLAGS: { REALTIME:true }, DISABLE:true }
  window.__ufo_update = function __ufo_update(partial) {
    if (!partial || typeof partial !== "object") return false;

    const cur = loadConfig();
    const next = merge({ ...cur }, partial);
    saveConfig(next);

    // Live-apply the changes immediately
    if (next.FEAT) applyFlags(next.FEAT);
    if (next.FLAGS && typeof next.FLAGS === "object") {
      UFO.flags = merge({ ...UFO.flags }, next.FLAGS);
    }
    if (next.DISABLE) window.__ufo_disable();

    return true;
  };

  // (Optional) quick getters if you want them:
  window.__ufo_getConfig = function __ufo_getConfig() {
    const stored = loadConfig();
    return {
      stored,
      effective: {
        FEAT: { ...FEAT, ...(stored.FEAT || {}) },
        FLAGS: merge({ ...UFO.flags }, stored.FLAGS || {})
      }
    };
  };

  // --- Cross-tab sync --------------------------------------------------------
  window.addEventListener("storage", (e) => {
    if (e.key !== "__ufo") return;
    const cfg = safeParse(e.newValue || "") || {};
    if (cfg.FEAT) applyFlags(cfg.FEAT);
    if (cfg.FLAGS) UFO.flags = merge({ ...UFO.flags }, cfg.FLAGS);
    if (cfg.DISABLE) window.__ufo_disable();
  });

  // --- Boot: apply stored config now -----------------------------------------
  (function boot() {
    const cfg = loadConfig();
    if (cfg.FEAT) applyFlags(cfg.FEAT);
    if (cfg.FLAGS) UFO.flags = merge({ ...UFO.flags }, cfg.FLAGS);
    if (cfg.DISABLE) window.__ufo_disable();
  })();
})();


// Turn a feature off for this site and persist it
// __ufo_update({ FEAT: { DOWNSCALE_OVERSIZE_IMAGES: false } });

// Enable a runtime flag (non-FEAT) and persist
// __ufo_update({ FLAGS: { REALTIME: true } });

// Emergency stop on a breaking site
// __ufo_update({ DISABLE: true }); // or just call __ufo_disable()