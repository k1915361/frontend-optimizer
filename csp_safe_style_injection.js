
/*───────────────────────────────────────────────────────────────────────────────
  REFINEMENT [2025-09-07]: CSP-safe style injection (inline → Blob fallback)
  - UFO.util.injectStyle(css) returns { node, revoke?: fn }
───────────────────────────────────────────────────────────────────────────────*/
(() => {
  const UFO = (window.__ufo ??= {});
  const util = (UFO.util ??= {});

  util.injectStyle = function injectStyle(cssText, id) {
    // Try inline first (fast-path)
    try {
      const st = document.createElement("style");
      if (id) st.id = id;
      st.textContent = cssText;
      document.head.appendChild(st);
      (UFO.__cleanups ??= []).push(() => st.remove());
      return { node: st };
    } catch {}

    // Fallback: Blob stylesheet link
    try {
      const blob = new Blob([cssText], { type: "text/css" });
      const url = URL.createObjectURL(blob);
      const ln = document.createElement("link");
      if (id) ln.id = id;
      ln.rel = "stylesheet";
      ln.href = url;
      document.head.appendChild(ln);
      const revoke = () => { try { URL.revokeObjectURL(url); } catch {} };
      (UFO.__cleanups ??= []).push(() => { try { ln.remove(); } finally { revoke(); } });
      return { node: ln, revoke };
    } catch {}

    // As a last resort, do nothing
    return { node: null };
  };
})();

