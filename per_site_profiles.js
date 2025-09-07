
/*───────────────────────────────────────────────────────────────────────────────
  REFINEMENT [2025-09-07]: Per-site profiles + schema + live-apply
  - Stores profiles in localStorage under "ufo:profiles" keyed by origin.
  - API:
      • __ufo_profileGet()            → current site profile (merged)
      • __ufo_profileUpdate(partial)  → merge + persist + apply flags
      • __ufo_profileReset()          → delete current site profile, re-apply defaults
  - Also listens to "storage" to live-apply changes across tabs.
───────────────────────────────────────────────────────────────────────────────*/
(() => {
  const UFO = (window.__ufo ??= {});
  const FEAT = (UFO.FEAT ??= {}); // existing feature flags
  const STORAGE_KEY = "ufo:profiles";
  const ORIGIN = location.origin;

  // Minimal schema: versioned, flags (object), notes (string)
  const DEFAULT_SCHEMA = { version: 1, flags: {}, notes: "" };

  function deepMerge(dst, src) {
    if (!src || typeof src !== "object") return dst;
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        dst[k] = deepMerge(dst[k] ? { ...dst[k] } : {}, v);
      } else dst[k] = v;
    }
    return dst;
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function saveAll(all) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch {}
  }

  function validateProfile(p) {
    if (!p || typeof p !== "object") return { ...DEFAULT_SCHEMA };
    const out = { ...DEFAULT_SCHEMA };
    out.version = Number.isInteger(p.version) ? p.version : 1;
    out.flags = (p.flags && typeof p.flags === "object") ? { ...p.flags } : {};
    out.notes = typeof p.notes === "string" ? p.notes : "";
    return out;
  }

  function currentProfileRaw() {
    const all = loadAll();
    return validateProfile(all[ORIGIN]);
  }

  function applyFlags(flags) {
    if (!flags || typeof flags !== "object") return;
    for (const [k, v] of Object.entries(flags)) {
      if (k in FEAT) FEAT[k] = v;
    }
    // Some flags may need side-effects; hook them here if needed.
    // e.g., if toggling REALTIME: document.documentElement.classList.toggle('ufo-realtime', !!UFO.flags?.REALTIME)
  }

  try {
    // Broadcast the latest FEAT flags to the page world
    window.postMessage({ type: "ufo:feat", feat: (window.__ufo?.FEAT || {}) }, "*");
  } catch {}


  window.__ufo_profileGet = function () {
    const prof = currentProfileRaw();
    // merged view: profile overrides FEAT defaults (read-only snapshot)
    return { origin: ORIGIN, profile: prof, effective: deepMerge({ ...FEAT }, prof.flags) };
  };

  window.__ufo_profileUpdate = function (partial) {
    if (!partial || typeof partial !== "object") return false;
    const all = loadAll();
    const prev = validateProfile(all[ORIGIN]);
    const next = validateProfile(deepMerge(prev, { flags: partial }));
    all[ORIGIN] = next;
    saveAll(all);
    applyFlags(next.flags);
    try { window.postMessage({ type: "ufo:feat", feat: (window.__ufo?.FEAT || {}) }, "*"); } catch {}

    return true;
  };

  window.__ufo_profileReset = function () {
    const all = loadAll();
    delete all[ORIGIN];
    saveAll(all);
    // Re-apply FEAT defaults (no overrides)
    applyFlags({});
    return true;
  };

  // Cross-tab live apply
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    try {
      const all = e.newValue ? JSON.parse(e.newValue) : {};
      const prof = validateProfile(all[ORIGIN]);
      applyFlags(prof.flags);
      try { window.postMessage({ type: "ufo:feat", feat: (window.__ufo?.FEAT || {}) }, "*"); } catch {}
    } catch {}
  });

  // On boot: apply any stored overrides
  try { applyFlags(currentProfileRaw().flags); } catch {}
})();