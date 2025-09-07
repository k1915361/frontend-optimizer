/*───────────────────────────────────────────────────────────────────────────────
  REFINEMENT [2025-09-07]: Local-only Core Web Vitals stub
  - Tracks LCP, CLS, INP (fallback FID) and logs a summary to console.
  - No network. Call __ufo_logVitalsNow() to print on demand.
───────────────────────────────────────────────────────────────────────────────*/
(() => {
  const UFO = (window.__ufo ??= {});
  const supported = typeof PerformanceObserver !== "undefined";
  let lcp = null;
  let cls = 0;
  let inp = null;
  let fid = null;

  if (supported) {
    try {
      // LCP
      const poLCP = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (document.visibilityState === "hidden") return;
        lcp = Math.max(lcp ?? 0, last.startTime);
      });
      poLCP.observe({ type: "largest-contentful-paint", buffered: true });
      (UFO.__cleanups ??= []).push(() => poLCP.disconnect());
    } catch {}

    try {
      // CLS
      const poCLS = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.hadRecentInput) cls += e.value;
        }
      });
      poCLS.observe({ type: "layout-shift", buffered: true });
      (UFO.__cleanups ??= []).push(() => poCLS.disconnect());
    } catch {}

    try {
      // INP (fallback: FID)
      const poINP = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          // INP uses event-timing entries; keep the max interaction latency
          const dur = e.duration || (e.processingEnd - e.startTime);
          if (dur > (inp ?? 0)) inp = dur;
        }
      });
      poINP.observe({ type: "event", buffered: true, durationThreshold: 16 });
      (UFO.__cleanups ??= []).push(() => poINP.disconnect());
    } catch {
      try {
        const poFID = new PerformanceObserver((list) => {
          const first = list.getEntries()[0];
          fid = first.processingStart - first.startTime;
        });
        poFID.observe({ type: "first-input", buffered: true });
        (UFO.__cleanups ??= []).push(() => poFID.disconnect());
      } catch {}
    }
  }

  function fmt(n) { return n == null ? "—" : (Math.round(n) + " ms"); }
  function fmtCLS(n) { return n == null ? "—" : n.toFixed(3); }

  function logVitals() {
    // Prefer INP if present; else FID
    const latency = inp != null ? { INP: fmt(inp) } : { FID: fmt(fid) };
    const out = { LCP: fmt(lcp), CLS: fmtCLS(cls), ...latency };
    // eslint-disable-next-line no-console
    console.log("[UFO] Core Vitals", out);
    return out;
  }

  window.__ufo_logVitalsNow = logVitals;
  window.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") logVitals(); }, { once: true });
})();
