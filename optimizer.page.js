// ==UserScript==
// @name         UFO (Universal Frontend Optimizer)
// @namespace    ufo
// @version      1.0.0
// @description  Safe, automatic frontend performance optimizations (userscript build)
// @license      MIT
// @match        *://*/*
// @run-at       document-start
// @grant        none
//
// --- Content-world modules (load order matters) ---
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/per_origin_config_kill_switch.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/csp_safe_style_injection.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/per_site_profiles.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/performance_orchestration.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/offscreen_and_layout_safety.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/image_and_video_handling_guardrails.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/network_hints.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/local_only_core_web_vitals_stub.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/hud.js
// ==/UserScript==

/*------------------------------------------------------------------------------
  Userscript bootstrap:
  - Seeds FEAT into the page (main world)
  - Injects page-world patches early (top-frame only for safety)
------------------------------------------------------------------------------*/
(() => {
  'use strict';

  // 1) Only inject page-world patches in the top frame (avoid iframe storms)
  if (window.top !== window) return;

  // 2) Seed current FEAT snapshot from the content-world into the page
  const feat = (window.__ufo && window.__ufo.FEAT)
    ? JSON.parse(JSON.stringify(window.__ufo.FEAT))
    : {};
  const seed = document.createElement('script');
  seed.textContent = `
    (function () {
      window.__ufo = window.__ufo || {};
      window.__ufo.FEAT = Object.assign(window.__ufo.FEAT || {}, ${JSON.stringify(feat)});
      // Listen for future FEAT updates from content world (per_site_profiles.js posts these)
      window.addEventListener("message", function(e){
        if (e.source !== window || !e.data || e.data.type !== "ufo:feat") return;
        try {
          var incoming = e.data.feat;
          if (incoming && typeof incoming === "object") {
            window.__ufo = window.__ufo || {};
            window.__ufo.FEAT = Object.assign(window.__ufo.FEAT || {}, incoming);
          }
        } catch {}
      });
    })();
  `;
  (document.head || document.documentElement).appendChild(seed);
  seed.remove();

  // 3) Inject page-world modules (patch real prototypes)
  //    Prefer external <script src=…> (fast, cached). If it fails (CSP/network),
  //    fall back to fetch + inline textContent.
  const PAGE_MODULE_URLS = [
    'https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/events_unified.page.js',
    'https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/neutering.page.js'
  ];

  function injectExternal(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.type = 'text/javascript';
      s.async = false; // load order matters
      s.onload = () => { s.remove(); resolve(true); };
      s.onerror = () => { s.remove(); reject(new Error('load error')); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function injectInline(code) {
    const s = document.createElement('script');
    s.textContent = code;
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  }

  async function loadPageModule(url) {
    try {
      await injectExternal(url);
    } catch {
      // Fallback: fetch and inline (CSP may block inline; works on many sites)
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-cache' });
        const code = await res.text();
        injectInline(code);
      } catch {}
    }
  }

  (async () => {
    for (const url of PAGE_MODULE_URLS) {
      await loadPageModule(url);
    }
  })();

  // 4) Optional: rebroadcast FEAT soon after load so page sees late profile merges
  try {
    setTimeout(() => {
      window.postMessage({ type: 'ufo:feat', feat: (window.__ufo?.FEAT || {}) }, '*');
    }, 0);
  } catch {}
})();
