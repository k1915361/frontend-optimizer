
/*───────────────────────────────────────────────────────────────────────────────
  REFINEMENT [2025-09-07]: Scoped content-visibility for heavy containers
  - Opt-in class:    .ufo-auto
  - Opt-out attr:    [data-ufo="off"]
  - Guards:
      • Skip elements that match current location.hash (anchor target)
      • Skip containers that contain position: sticky descendants
───────────────────────────────────────────────────────────────────────────────*/
(() => {
  const UFO = (window.__ufo ??= {});
  const FEAT = (UFO.FEAT ??= {});
  if (FEAT.OFFSCREEN_SCOPE === false) return;

  // Inject style once
  (function inject() {
    if (document.getElementById("ufo-auto-style")) return;
    const css = `
      .ufo-auto:not([data-ufo="off"]) {
        content-visibility: auto;
        contain: content;
      }
    `.trim();
    const el = document.createElement("style");
    el.id = "ufo-auto-style";
    el.textContent = css;
    document.head.appendChild(el);
    (UFO.__cleanups ??= []).push(() => el.remove());
  })();

  // Heuristic: skip containers with sticky descendants (expensive check is bounded)
  function hasStickyDescendant(root, max = 200) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let n, count = 0;
    while ((n = walker.nextNode()) && count++ < max) {
      const pos = getComputedStyle(n).position;
      if (pos === "sticky") return true;
    }
    return false;
  }

  function isHashTarget(el) {
    const h = location.hash && location.hash.slice(1);
    return !!(h && el.id && el.id === h);
  }

  // Public API: mark an element as offscreen-optimizable
  window.__ufo_markAuto = function (el) {
    if (!el || el.nodeType !== 1) return false;
    if (isHashTarget(el)) return false;
    if (hasStickyDescendant(el)) return false;
    el.classList.add("ufo-auto");
    return true;
  };

  // Auto-mark common large regions if author opted in via attribute
  // Example usage in HTML: <main data-ufo="auto">...</main>
  function bootstrapAutoMarks() {
    document.querySelectorAll('[data-ufo="auto"]').forEach((el) => {
      window.__ufo_markAuto(el);
    });
  }

  if (document.readyState !== "loading") bootstrapAutoMarks();
  else document.addEventListener("DOMContentLoaded", bootstrapAutoMarks, { once: true });
})();