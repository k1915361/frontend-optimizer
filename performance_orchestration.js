
/*───────────────────────────────────────────────────────────────────────────────
  REFINEMENT [2025-09-07]: Realtime opt-outs + Mutation batching (hardened)
  - __ufo_realtime(true/false): toggles a global "realtime" mode (also adds/removes
    class="ufo-realtime" on <html> so CSS/other modules can react).
  - __ufo_batch(fn, opts?): coalesces DOM work via microtask → requestIdleCallback.
    If FEAT.MUTATION_BATCHING === false, runs fn immediately.
    If opts.immediateIfRealtime !== false and flags.REALTIME === true, runs fn immediately.
  - __ufo_batchNow(): flush queued tasks now.
  - __ufo_batchClear(): discard queued tasks.
  - Fully cleanup-aware: kill switch cancels pending idle work and clears the queue.
───────────────────────────────────────────────────────────────────────────────*/
(() => {
  const UFO   = (window.__ufo ??= {});
  const FEAT  = (UFO.FEAT ??= {});
  const CLEAN = (UFO.__cleanups ??= []);
  const flags = (UFO.flags ??= { REALTIME: false });

  // Feature gate (per-site overridable)
  FEAT.MUTATION_BATCHING ??= true;

  // --- Realtime toggle -------------------------------------------------------
  function refreshRealtimeFlag() {
    flags.REALTIME =
      document.documentElement.classList.contains("ufo-realtime") ||
      performance.getEntriesByName("ufo:realtime").length > 0 ||
      !!flags.REALTIME; // manual toggle persists
  }
  window.__ufo_realtime = function (on) {
    flags.REALTIME = !!on;
    document.documentElement.classList.toggle("ufo-realtime", !!on);
  };
  refreshRealtimeFlag();

  // (Tip for your rAF/timer wrapper elsewhere)
  // if (UFO.flags?.REALTIME) return ORIG_rAF(cb);

  // --- Mutation batching -----------------------------------------------------
  const rIC = window.requestIdleCallback || (fn => setTimeout(() => fn({ didTimeout:false, timeRemaining: () => 50 }), 1));
  const cIC = window.cancelIdleCallback || (id => clearTimeout(id));

  let scheduled = false;
  let scheduledId = 0;
  const queue = [];

  function flush() {
    scheduled = false; scheduledId = 0;
    const tasks = queue.splice(0);
    for (const t of tasks) { try { t(); } catch {} }
  }

  window.__ufo_batch = function (fn, opts) {
    if (typeof fn !== "function") return;
    const immediateIfRealtime = (opts?.immediateIfRealtime ?? true);

    // Bypass batching if disabled or in realtime
    if (!FEAT.MUTATION_BATCHING || (immediateIfRealtime && flags.REALTIME)) {
      try { fn(); } catch {}
      return;
    }

    queue.push(fn);
    if (scheduled) return;

    scheduled = true;
    // microtask → idle
    queueMicrotask(() => {
      // guard: kill switch could have run meanwhile
      if (!scheduled) return;
      scheduledId = rIC(() => flush());
    });
  };

  window.__ufo_batchNow = function () {
    if (scheduled && scheduledId) { try { cIC(scheduledId); } catch {} }
    flush();
  };

  window.__ufo_batchClear = function () {
    if (scheduled && scheduledId) { try { cIC(scheduledId); } catch {} }
    scheduled = false; scheduledId = 0; queue.length = 0;
  };

  // Helpful hooks: flush on hidden/unload to avoid stale work (best-effort, safe)
  const onHide = () => { try { window.__ufo_batchNow(); } catch {} };
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide();
  }, { once: true });
  window.addEventListener("pagehide", onHide, { once: true });

  // Cleanup for kill switch
  CLEAN.push(() => { try { window.removeEventListener("pagehide", onHide); } catch {} });
  CLEAN.push(() => { try { window.removeEventListener("visibilitychange", onHide); } catch {} });
  CLEAN.push(() => window.__ufo_batchClear());
})();
