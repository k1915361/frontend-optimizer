
/* offscreen_and_layout_safety.js — DOM-early safe injector */
(() => {
  const UFO   = (window.__ufo ??= {});
  const CLEAN = (UFO.__cleanups ??= []);

  // Skip non-HTML documents (e.g., SVG, XML, PDFs rendered as docs)
  const ct = (document.contentType || "text/html").toLowerCase();
  if (!ct.includes("html")) return;

  // Use shared helper if present; otherwise resilient local fallback
  const injectStyle = UFO.util?.injectStyle ?? function injectStyle(cssText, id) {
    function appendNow() {
      const host = document.head || document.getElementsByTagName("head")[0] || document.body || document.documentElement;
      if (!host) return { node: null };
      const el = document.createElement("style");
      if (id) el.id = id;
      el.textContent = cssText;
      host.appendChild(el);
      CLEAN.push(() => { try { el.remove(); } catch {} });
      return { node: el };
    }

    // Fast path
    if (document.head || document.body) return appendNow();

    // Slow path: wait until head/body exists
    let done = false;
    const tryAppend = () => {
      if (done) return;
      if (document.head || document.body) {
        done = true;
        appendNow();
        try { mo.disconnect(); } catch {}
        try { document.removeEventListener("readystatechange", onRS); } catch {}
        try { document.removeEventListener("DOMContentLoaded", onReady); } catch {}
      }
    };
    const mo = new MutationObserver(tryAppend);
    try { mo.observe(document.documentElement || document, { childList: true, subtree: true }); } catch {}
    const onReady = () => tryAppend();
    const onRS = () => { if (document.readyState !== "loading") tryAppend(); };
    document.addEventListener("readystatechange", onRS);
    document.addEventListener("DOMContentLoaded", onReady, { once: true });

    return { node: null };
  };

  // ⬇️ your CSS goes here (example shown—keep your actual rules)
  const CSS = `
  .ufo-auto{ content-visibility:auto; contain:content; }
  /* add any other rules you had */
  `.trim();

  // Inject safely (won’t crash if head isn’t ready yet)
  injectStyle(CSS, "ufo-offscreen-style");

  // …the rest of your module logic…
})();
