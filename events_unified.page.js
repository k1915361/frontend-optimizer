
/*───────────────────────────────────────────────────────────────────────────────
  REFINEMENT [2025-09-07]: Unified Event Wrapper (passive-by-default + dedupe + cleanup)


  Notes

Load this file at document-start if possible; anything added before the patch won’t be dedup/cleaned.

Now you can toggle it per-site via:

__ufo_profileUpdate?.({ UNIFIED_EVENT_WRAPPER: false })  // disable entirely
__ufo_profileUpdate?.({ PASSIVE_LISTENERS: false })      // keep wrapper, no passive default
__ufo_profileUpdate?.({ DEDUP_EVENT_LISTENERS: false })  // allow duplicates (debugging)
__ufo_profileUpdate?.({ LISTENER_CLEANUP: false })       // skip detach observer

───────────────────────────────────────────────────────────────────────────────*/

(() => {
  const UFO   = (window.__ufo ??= {});
  const CLEAN = (UFO.__cleanups ??= []);
  const FEAT  = (UFO.FEAT ??= {});

    // Listen for FEAT updates posted from the content script
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.type !== "ufo:feat") return;
    try {
      const incoming = e.data.feat;
      if (!incoming || typeof incoming !== "object") return;
      (window.__ufo ||= {}).FEAT = Object.assign((window.__ufo.FEAT ||= {}), incoming);
    } catch {}
  });


  // Feature gates (set defaults only if not already set by profiles)
  FEAT.UNIFIED_EVENT_WRAPPER ??= true;
  FEAT.PASSIVE_LISTENERS     ??= true;
  FEAT.DEDUP_EVENT_LISTENERS ??= true;
  FEAT.LISTENER_CLEANUP      ??= true;
  if (!FEAT.UNIFIED_EVENT_WRAPPER) return;

  // Register cleanups with the global kill switch
  const regCleanup = (fn) => { (UFO.__cleanups ??= []).push(fn); };
  if (typeof window.__ufo_disable === "function" && !UFO.__disableWrapped) {
    const prev = window.__ufo_disable;
    window.__ufo_disable = function () {
      try { for (const c of (UFO.__cleanups ?? []).splice(0)) try { c(); } catch {} }
      finally { try { prev.call(this); } catch {} }
    };
    UFO.__disableWrapped = true;
  }

  // ---- START of unified wrapper body ----

  const ORIG = {
    add: EventTarget.prototype.addEventListener,
    remove: EventTarget.prototype.removeEventListener,
  };

  const listeners = new WeakMap();
  const PASSIVE_BY_DEFAULT = new Set(["scroll","wheel","touchstart","touchmove","touchend","touchcancel"]);

  function normalizeOptions(type, options) {
    let capture = false, passive, once = false, signal, signalId = "";
    if (typeof options === "boolean") capture = options;
    else if (options && typeof options === "object") ({ capture = false, passive, once = false, signal } = options);

    // Apply passive default only if enabled
    if (passive === undefined && FEAT.PASSIVE_LISTENERS && PASSIVE_BY_DEFAULT.has(type)) passive = true;

    if (signal && typeof signal === "object") signalId = String((signal.__ufoId ??= `sig_${Math.random().toString(36).slice(2)}`));
    return { capture: !!capture, passive, once: !!once, signal, signalId };
  }

  function entryKey(type, listener, opt) {
    return `${type}::${String(listener)}::c${opt.capture?1:0}::p${opt.passive===true?1:opt.passive===false?0:2}::o${opt.once?1:0}::${opt.signalId}`;
  }

  function typeMap(target, type) {
    let byType = listeners.get(target); if (!byType) listeners.set(target, (byType = new Map()));
    let map = byType.get(type); if (!map) byType.set(type, (map = new Map()));
    return map; // Map<key, Entry>
  }

  function wrappedAdd(type, listener, options) {
    if (listener == null) return;
    const opt = normalizeOptions(type, options);
    const key = entryKey(type, listener, opt);
    const map = typeMap(this, type);

    // Dedup only if enabled
    if (FEAT.DEDUP_EVENT_LISTENERS && map.has(key)) return;

    const browserOpts = {};
    if (opt.capture) browserOpts.capture = true;
    if (opt.once)    browserOpts.once = true;
    if (opt.passive !== undefined) browserOpts.passive = opt.passive;
    if (opt.signal)  browserOpts.signal = opt.signal;

    const wrapped = function (...args) { return listener.apply(this, args); };

    let abortHandler = null;
    if (opt.signal) {
      abortHandler = () => { try { map.delete(key); } catch {} };
      try { opt.signal.addEventListener("abort", abortHandler, { once: true }); } catch {}
    }

    ORIG.add.call(this, type, wrapped, browserOpts);
    map.set(key, { type, listener, wrapped, options: opt, target: this, abortHandler });
  }

  function wrappedRemove(type, listener, options) {
    const opt = normalizeOptions(type, options);
    const key = entryKey(type, listener, opt);
    const map = typeMap(this, type);
    const entry = map.get(key);
    if (entry) {
      try { ORIG.remove.call(this, type, entry.wrapped, { capture: !!opt.capture }); } catch {}
      map.delete(key);
    } else {
      // Fallback for listeners registered before wrapping
      ORIG.remove.call(this, type, listener, options);
    }
  }

  EventTarget.prototype.addEventListener = wrappedAdd;
  EventTarget.prototype.removeEventListener = wrappedRemove;
  regCleanup(() => {
    EventTarget.prototype.addEventListener = ORIG.add;
    EventTarget.prototype.removeEventListener = ORIG.remove;
  });

  // Auto-cleanup on detach only if enabled
  let mo = null;
  if (FEAT.LISTENER_CLEANUP) {
    mo = new MutationObserver((records) => {
      for (const r of records) {
        r.removedNodes && r.removedNodes.forEach((node) => {
          const stack = [node];
          while (stack.length) {
            const n = stack.pop();
            const byType = listeners.get(n);
            if (byType) {
              for (const [type, map] of byType) {
                for (const [, e] of map) {
                  try { ORIG.remove.call(n, type, e.wrapped, { capture: !!e.options.capture }); } catch {}
                }
              }
              listeners.delete(n);
            }
            if (n && n.childNodes && n.childNodes.length) stack.push(...n.childNodes);
          }
        });
      }
    });
    try { mo.observe(document, { childList: true, subtree: true }); } catch {}
    regCleanup(() => { try { mo.disconnect(); } catch {} });
  }

  // Debug helpers
  window.__ufo_events = function (node) {
    const byType = listeners.get(node);
    if (!byType) return [];
    const out = [];
    for (const [type, map] of byType) {
      for (const [, e] of map) out.push({
        type,
        capture: e.options.capture,
        passive: e.options.passive,
        once: e.options.once,
        listener: String(e.listener).slice(0, 80) + (String(e.listener).length > 80 ? "…" : "")
      });
    }
    return out;
  };
  window.__ufo_restoreEvents = function () {
    EventTarget.prototype.addEventListener = ORIG.add;
    EventTarget.prototype.removeEventListener = ORIG.remove;
    try { mo && mo.disconnect(); } catch {}
  };

  // ---- END of unified wrapper body ----
})();
