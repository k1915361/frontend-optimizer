// ==UserScript==
// @name         Universal Frontend Optimizer
// @namespace    http://tampermonkey.net/
// @version      2025-09-06
// @author       You
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==

// @description  Lazy media, passive events, offscreen savings, preconnect, and auto-cleanup of event listeners on detached nodes, deduped listeners, rAF/timer throttling, data-URL offload, client-side image downscale, and optional tracker blocking.
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(() => {
  'use strict';

  /**********************
   * Feature toggles
   **********************/
  const FEAT = {
    // existing features assumed already present in your base script...
    DEDUP_EVENT_LISTENERS: true,
    THROTTLE_RAF_AND_TIMERS: true,
    DATA_URL_TO_BLOB_URL: true,
    DOWNSCALE_OVERSIZE_IMAGES: true,
    BLOCK_TRACKERS: false, // ⚠️ off by default; can break sites
  };

  /**********************
   * Utilities
   **********************/
  const DEBUG = false;
  const log = (...a) => DEBUG && console.log('[UFO+]', ...a);
  const now = () => (performance && performance.now ? performance.now() : Date.now());

  /****************************************************************
   * 1) Deduplicate identical event listeners (type+listener+capture)
   *    (Browsers mostly ignore exact duplicates; we make it robust
   *     across differing options objects by normalizing capture.)
   ****************************************************************/
  if (FEAT.DEDUP_EVENT_LISTENERS) {
    const PASSIVE_TYPES = new Set(['scroll', 'wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel']);
    const origAdd = EventTarget.prototype.addEventListener;
    const origRem = EventTarget.prototype.removeEventListener;

    // Registry per-target of {type, listener, capture}
    const REG = new WeakMap(); // target -> Set(key)
    const keyOf = (type, listener, capture) => `${type}::${capture ? 1 : 0}::${(listener && (listener.__ufoId || (listener.__ufoId = Symbol())))}`;

    // Install wrappers that (1) passivize scroll/touch/wheel, (2) dedup by normalized key
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      let capture = typeof options === 'boolean' ? options : !!(options && options.capture);
      // passive-by-default for scroll/wheel/touch (unless explicit false)
      let finalOpts = options;
      if (PASSIVE_TYPES.has(type)) {
        if (options == null || typeof options === 'boolean') {
          finalOpts = { capture, passive: true };
        } else if (typeof options === 'object') {
          finalOpts = { ...options, passive: options.passive !== false };
        }
      }
      // Dedup
      try {
        let set = REG.get(this);
        if (!set) { set = new Set(); REG.set(this, set); }
        const k = keyOf(type, listener, capture);
        if (set.has(k)) {
          // Already registered → skip
          return;
        }
        set.add(k);
      } catch {}

      return origAdd.call(this, type, listener, finalOpts);
    };

    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      const capture = typeof options === 'boolean' ? options : !!(options && options.capture);
      try {
        const set = REG.get(this);
        if (set) set.delete(keyOf(type, listener, capture));
      } catch {}
      return origRem.call(this, type, listener, options);
    };

    // Optional: if nodes are removed, purge their registry entries (best-effort)
    new MutationObserver((muts) => {
      for (const m of muts) {
        m.removedNodes?.forEach(n => {
          if (n instanceof Element) {
            REG.delete(n);
            n.querySelectorAll?.('*').forEach(el => REG.delete(el));
          }
        });
      }
    }).observe(document.documentElement, { childList: true, subtree: true });

    log('Listener dedup enabled');
  }

  /*************************************************************
   * 2) Throttle rAF & Timers
   *    - rAF: cap FPS (e.g., 30), pause when tab hidden
   *    - setTimeout/setInterval: enforce min delay; coerce excessive pace
   *************************************************************/
  if (FEAT.THROTTLE_RAF_AND_TIMERS) {
    const RAF_CAP_FPS = 30;                     // cap frame rate (30fps)
    const RAF_MIN_MS = 1000 / RAF_CAP_FPS;      // ~33.3ms
    const MIN_TIMEOUT_MS = 16;                  // coerce too-fast timers to >=16ms
    const MIN_INTERVAL_MS = 50;                 // force intervals to at least 50ms
    const PAUSE_WHEN_HIDDEN = true;

    // requestAnimationFrame throttle
    const _raf = window.requestAnimationFrame.bind(window);
    const _caf = window.cancelAnimationFrame.bind(window);
    let lastRAF = 0;
    const rafMap = new Map(); // id -> wrapped

    window.requestAnimationFrame = (cb) => {
      const wrapped = (t) => {
        if (PAUSE_WHEN_HIDDEN && document.hidden) {
          // Defer until visible
          const id = _raf(wrapped);
          rafMap.set(id, wrapped);
          return;
        }
        const nowT = now();
        if ((nowT - lastRAF) < RAF_MIN_MS) {
          // too soon → defer
          const id = _raf(wrapped);
          rafMap.set(id, wrapped);
          return;
        }
        lastRAF = nowT;
        cb(t);
      };
      const id = _raf(wrapped);
      rafMap.set(id, wrapped);
      return id;
    };

    window.cancelAnimationFrame = (id) => {
      const wrapped = rafMap.get(id);
      rafMap.delete(id);
      return _caf(id, wrapped);
    };

    // Timer coercion
    const _setTimeout = window.setTimeout.bind(window);
    const _setInterval = window.setInterval.bind(window);
    const _clearTimeout = window.clearTimeout.bind(window);
    const _clearInterval = window.clearInterval.bind(window);

    window.setTimeout = (fn, delay = 0, ...rest) => {
      const d = Math.max(MIN_TIMEOUT_MS, delay|0);
      return _setTimeout(fn, d, ...rest);
    };
    window.setInterval = (fn, delay = 0, ...rest) => {
      const d = Math.max(MIN_INTERVAL_MS, delay|0);
      return _setInterval(fn, d, ...rest);
    };
    window.clearTimeout = (id) => _clearTimeout(id);
    window.clearInterval = (id) => _clearInterval(id);

    // When page becomes visible again, reset RAF pacing to avoid long jitter
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) lastRAF = 0;
    });

    log('rAF/timer throttling enabled');
  }

  /*****************************************************************
   * 3) Replace large data: URLs (inline base64 images) with Blob URLs
   *    - Helps memory & caching within the session (not cross-session)
   *****************************************************************/
  if (FEAT.DATA_URL_TO_BLOB_URL) {
    const SIZE_THRESHOLD = 64 * 1024; // bytes; only offload very large inlines
    const processed = new WeakSet();

    const toBlobURL = (dataUrl) => {
      try {
        const [meta, b64] = dataUrl.split(',');
        const mime = (meta.match(/data:(.*?);base64/i) || [])[1] || 'application/octet-stream';
        const bin = atob(b64);
        const len = bin.length;
        const buf = new Uint8Array(len);
        for (let i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);
        const blob = new Blob([buf], { type: mime });
        return { url: URL.createObjectURL(blob), size: len, mime };
      } catch {
        return null;
      }
    };

    const handleImg = (img) => {
      if (processed.has(img)) return;
      const src = img.getAttribute('src') || '';
      if (!src.startsWith('data:')) return;
      // quick size check from base64 length
      const b64 = src.split(',')[1] || '';
      const approxBytes = Math.floor(b64.length * 0.75);
      if (approxBytes < SIZE_THRESHOLD) return;

      const out = toBlobURL(src);
      if (out) {
        img.setAttribute('src', out.url);
        processed.add(img);
        log('Offloaded data: URL to blob:', out.mime, out.size);
      }
    };

    document.querySelectorAll('img[src^="data:"]').forEach(handleImg);
    new MutationObserver((muts) => {
      muts.forEach(m => m.addedNodes?.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches?.('img[src^="data:"]')) handleImg(n);
        n.querySelectorAll?.('img[src^="data:"]').forEach(handleImg);
      }));
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  /*****************************************************************
   * 4) Downscale / compress oversize images on the client
   *    - If natural size >> displayed size, draw to canvas and swap src
   *****************************************************************/
  if (FEAT.DOWNSCALE_OVERSIZE_IMAGES) {
    const SCALE_THRESHOLD = 1.8;   // only downscale if natural >= 1.8x displayed
    const MAX_DIMENSION = 2560;    // clamp very large sides (optional)
    const JPEG_QUALITY = 0.82;     // output quality for jpeg/webp
    const processed = new WeakSet();

    const onceOnLoad = (img, fn) => {
      if (img.complete && img.naturalWidth) return fn();
      img.addEventListener('load', fn, { once: true });
      img.addEventListener('error', () => {}, { once: true });
    };

    const downscaleIfOversized = (img) => {
      if (processed.has(img)) return;
      onceOnLoad(img, () => {
        try {
          const dispW = Math.max(1, img.clientWidth || img.offsetWidth || 0);
          const dispH = Math.max(1, img.clientHeight || img.offsetHeight || 0);
          const natW = img.naturalWidth;
          const natH = img.naturalHeight;
          if (!natW || !natH || !dispW || !dispH) return;

          const scaleW = natW / dispW;
          const scaleH = natH / dispH;
          const scale = Math.max(scaleW, scaleH);

          let targetW = natW;
          let targetH = natH;

          // Cap huge dimensions
          if (MAX_DIMENSION) {
            const maxSide = Math.max(targetW, targetH);
            if (maxSide > MAX_DIMENSION) {
              const s = MAX_DIMENSION / maxSide;
              targetW = Math.round(targetW * s);
              targetH = Math.round(targetH * s);
            }
          }

          if (scale >= SCALE_THRESHOLD) {
            // compute target proportional to display size (avoid too aggressive compression)
            const s = 1 / Math.ceil(scale / 1.2); // a bit conservative
            targetW = Math.min(targetW, Math.round(natW * s));
            targetH = Math.min(targetH, Math.round(natH * s));

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d', { alpha: true });
            // imageSmoothing helps quality when downscaling
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, targetW, targetH);

            const mime = /image\/(png|webp|jpeg|jpg)/i.test(img.src) ? (img.src.match(/image\/(png|webp|jpeg|jpg)/i)[0]) :
                         (img.currentSrc && /image\/(png|webp|jpeg|jpg)/i.test(img.currentSrc) ? img.currentSrc.match(/image\/(png|webp|jpeg|jpg)/i)[0] : 'image/jpeg');

            const outMime = mime.includes('png') ? 'image/webp' : 'image/jpeg'; // prefer webp/jpeg for size
            canvas.toBlob((blob) => {
              if (!blob) return;
              const url = URL.createObjectURL(blob);
              img.src = url;
              processed.add(img);
              log('Downscaled image →', outMime, targetW, 'x', targetH);
            }, outMime, JPEG_QUALITY);
          }
        } catch {}
      });
    };

    document.querySelectorAll('img').forEach(downscaleIfOversized);
    new MutationObserver((muts) => {
      muts.forEach(m => m.addedNodes?.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches?.('img')) downscaleIfOversized(n);
        n.querySelectorAll?.('img').forEach(downscaleIfOversized);
      }));
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  /*****************************************************************
   * 5) (Optional) Block analytics/ads scripts
   *    - Blocks script tags with matching src
   *    - No-ops common globals to reduce breakage
   *****************************************************************/
  if (FEAT.BLOCK_TRACKERS) {
    const BLOCK_PATTERNS = [
      /googletagmanager\.com/i,
      /google-analytics\.com/i,
      /www\.google-analytics\.com/i,
      /doubleclick\.net/i,
      /googlesyndication\.com/i,
      /facebook\.net/i,
      /connect\.facebook\.net/i,
      /fbcdn\.net/i,
      /fullstory\.com/i,
      /mixpanel\.com/i,
      /segment\.com/i,
      /newrelic\.com/i,
      /hotjar\.com/i,
      /clarity\.ms/i,
      /criteo\.com/i,
      /adservice\.google\.com/i,
      /taboola\.com/i,
      /outbrain\.com/i
    ];

    // Neuter common globals gracefully
    try {
      // GA
      Object.defineProperty(window, 'ga', { value: function(){}, writable: false });
      Object.defineProperty(window, 'gtag', { value: function(){}, writable: false });
      // GTM dataLayer
      if (!Array.isArray(window.dataLayer)) window.dataLayer = [];
      const dlPush = window.dataLayer.push;
      window.dataLayer.push = function(){ return 0; };
      // FB
      Object.defineProperty(window, 'fbq', { value: function(){}, writable: false });
    } catch {}

    const shouldBlock = (src) => BLOCK_PATTERNS.some(rx => rx.test(src));

    const neuterScript = (s) => {
      s.type = 'javascript/blocked';
      s.removeAttribute('src');
      s.textContent = '';
    };

    // Existing scripts
    document.querySelectorAll('script[src]').forEach(s => {
      const src = s.getAttribute('src') || '';
      if (shouldBlock(src)) neuterScript(s);
    });

    // Future scripts
    new MutationObserver((muts) => {
      muts.forEach(m => m.addedNodes?.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches?.('script[src]')) {
          const src = n.getAttribute('src') || '';
          if (shouldBlock(src)) neuterScript(n);
        }
        n.querySelectorAll?.('script[src]').forEach(s => {
          const src = s.getAttribute('src') || '';
          if (shouldBlock(src)) neuterScript(s);
        });
      }));
    }).observe(document.documentElement, { childList: true, subtree: true });

    log('Tracker blocking enabled');
  }
})();