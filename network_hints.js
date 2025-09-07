
// ==UserScript==
// @name         UFO - Network Hints
// @namespace    ufo
// @version      2025-09-06
// @description  Preconnect + dns-prefetch + LCP hero image boost
// @match        *://*/*
// @run-at       document-start   // <— recommended for network hints & LCP
// @grant        none             // <— not needed because we use UFO.util.addStyle()
// ==/UserScript==

(() => {
  'use strict';
  const UFO   = (window.__ufo ??= {});
  const FEAT  = (UFO.FEAT ??= {});
  const CLEAN = (UFO.__cleanups ??= []);
  const addStyle = UFO.util?.addStyle ?? ((css)=>{ const s=document.createElement('style'); s.textContent=css; document.head.appendChild(s); return s; });
  const regCleanup = (fn) => CLEAN.push(fn);

  // Safe defaults (set only if not already provided by per-site profile/user)
  FEAT.PRECONNECT_SMART ??= true;
  FEAT.LCP_BOOST ??= true;
  FEAT.LCP_SYNC_DECODE ??= true;

  // ---------- Module A: Preconnect + dns-prefetch ----------
  (function installPreconnectSmart(){
    if (!FEAT.PRECONNECT_SMART) return;

    const injected = new Set();
    const TOP_N = 5;

    const originOf = (u) => { try { return new URL(u, location.href).origin; } catch { return ""; } };
    const isCross  = (o) => o && o !== location.origin;
    const hinted   = (o) => !!document.querySelector(`link[rel="preconnect"][href^="${o}"], link[rel="dns-prefetch"][href*="${new URL(o).host}"]`);
    const addLink  = (rel, href, crossorigin=false) => { const l=document.createElement('link'); l.rel=rel; l.href=href; if (crossorigin) l.crossOrigin=""; document.head.appendChild(l); regCleanup(()=>l.remove()); };

    function collect() {
      const css = [...document.querySelectorAll('link[rel="stylesheet"]')];
      const js  = [...document.querySelectorAll('script[src]:not([async]):not([defer]):not([type="module"])')];
      const arr = [];
      for (const el of [...css, ...js]) {
        const src = el.getAttribute(el.tagName==='LINK'?'href':'src'); if (!src) continue;
        const o = originOf(src); if (!isCross(o)) continue;
        arr.push({ origin:o, el });
      }
      const score = (e)=> e.el.tagName==='LINK' ? 2 : 1;
      arr.sort((a,b)=>score(b)-score(a));
      const uniq = [];
      const seen = new Set();
      for (const c of arr) {
        if (seen.has(c.origin) || hinted(c.origin) || injected.has(c.origin)) continue;
        seen.add(c.origin); uniq.push(c);
      }
      return uniq;
    }

    function injectHints() {
      const uniq = collect();
      if (!uniq.length) return;
      const tops = uniq.slice(0, TOP_N);
      const rest = uniq.slice(TOP_N);
      for (const t of tops) { addLink('preconnect', t.origin, !!t.el.crossOrigin); injected.add(t.origin); }
      for (const r of rest) { const hostHref = `//${new URL(r.origin).host}`; addLink('dns-prefetch', hostHref, false); injected.add(r.origin); }
    }

    try { injectHints(); } catch {}
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ()=>{ try { injectHints(); } catch {} }, { once:true });
    }
  })();

  // ---------- Module B: LCP hero image boost ----------
  (function installLcpBoost(){
    if (!FEAT.LCP_BOOST) return;

    const ZOOMY = [
      "[data-zoomable]","[data-gallery]","[data-lightbox]","[data-fancybox]","[data-pswp]",
      ".lightbox",".fancybox",".pswp",".glightbox",".photoswipe",".zoomy",".zoom-container"
    ].join(",");
    const isAnim = (s="") => /\.(gif|apng)(\?|#|$)/i.test(s);

    const cand = new Set();
    const io = new IntersectionObserver((entries)=>{
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const img = e.target, r = img.getBoundingClientRect();
        const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight);
        if (r.top > vh * 1.2) continue; // only early viewport
        const area = Math.max(1, r.width * r.height);
        cand.add({ img, area });
      }
    }, { threshold:[0, .25, .5, .75, 1] });

    function prime() {
      for (const img of document.images) {
        if (img.getAttribute('data-ufo') === 'off') continue;
        if (img.closest(ZOOMY)) continue;
        const src = img.currentSrc || img.src || "";
        if (isAnim(src)) continue;
        io.observe(img);
      }
    }

    function boost() {
      io.disconnect();
      const list = Array.from(cand); if (!list.length) return;
      list.sort((a,b)=>b.area-a.area);
      const top = list.slice(0,2);
      for (const {img} of top) { try { img.fetchPriority = 'high'; } catch {} }
      if (FEAT.LCP_SYNC_DECODE && top[0]) {
        const img = top[0].img, r = img.getBoundingClientRect();
        const big = r.width * r.height > (window.innerWidth*window.innerHeight)*0.25;
        if (big && img.decode && !img.complete) { try { img.decoding = 'sync'; } catch {} }
      }
    }

    prime();
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boost, 120);
    else document.addEventListener('DOMContentLoaded', ()=>setTimeout(boost,120), { once:true });

    regCleanup(()=>io.disconnect());
  })();

})();
