
/*───────────────────────────────────────────────────────────────────────────────
  REFINEMENT [2025-09-07]: Media guardrails (images + videos)
  - Smarter image downscale eligibility
  - Respect CSS aspect-ratio, devicePixelRatio
  - Stateful offscreen video pause/resume
───────────────────────────────────────────────────────────────────────────────*/
(() => {
  const UFO = (window.__ufo ??= {});
  const FEAT = (UFO.FEAT ??= {});
  FEAT.DOWNSCALE_OVERSIZE_IMAGES ??= true;
  FEAT.OFFSCREEN_VIDEO_PAUSE ??= true;

  // Heuristics for zoom/gallery regions
  const ZOOMY_SELECTOR = [
    "[data-zoomable]","[data-gallery]","[data-lightbox]","[data-fancybox]","[data-pswp]",
    ".lightbox",".fancybox",".pswp",".glightbox",".photoswipe",".zoomy",".zoom-container"
  ].join(",");

  function hasExplicitAspectRatio(el) {
    const cs = getComputedStyle(el);
    return !!(el.style.aspectRatio || cs.aspectRatio && cs.aspectRatio !== "auto");
  }

  function shouldDownscale(img) {
    if (!FEAT.DOWNSCALE_OVERSIZE_IMAGES) return false;
    if (!(img instanceof HTMLImageElement)) return false;
    if (img.closest(ZOOMY_SELECTOR)) return false;
    if (img.hasAttribute("data-no-downscale")) return false;

    // If srcset/sizes is present, let the browser pick responsive candidates
    if (img.hasAttribute("srcset")) return false;

    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    // Respect DPR
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const neededW = Math.ceil(rect.width * dpr);
    const neededH = Math.ceil(rect.height * dpr);

    // If there's a defined aspect-ratio, don't stamp width/height; it can cause shifts
    if (hasExplicitAspectRatio(img)) return false;

    // Oversize threshold (allow some headroom)
    return (img.naturalWidth > neededW * 1.5) && (img.naturalHeight > neededH * 1.5);
  }

  // Hook point: call `maybeDownscale(img)` from your existing image pipeline
  window.__ufo_maybeDownscale = async function (img, quality = 0.82, type = "image/webp") {
    try {
      if (!shouldDownscale(img)) return false;

      const rect = img.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const targetW = Math.max(1, Math.round(rect.width * dpr));
      const targetH = Math.max(1, Math.round(rect.height * dpr));

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const blob = await new Promise(res => canvas.toBlob(res, type, quality));
      if (!blob) return false;

      const url = URL.createObjectURL(blob);
      const prev = img.src;
      img.src = url;

      // Cleanup old object URLs on load/error
      const cleanup = () => { try { URL.revokeObjectURL(url); } catch {} };
      img.addEventListener("load", cleanup, { once: true });
      img.addEventListener("error", () => { cleanup(); img.src = prev; }, { once: true });
      return true;
    } catch { return false; }
  };

  // Video: pause when offscreen; resume only if previously playing
  const wasPlaying = new WeakMap();

  function isActuallyPlaying(v) {
    return !v.paused && !v.ended && v.readyState >= 2;
  }

  function setupVideoObserver() {
    if (!FEAT.OFFSCREEN_VIDEO_PAUSE) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target;
        if (!(v instanceof HTMLVideoElement)) continue;
        if (e.isIntersecting) {
          if (wasPlaying.get(v)) { // resume only if it was playing before
            try { v.play().catch(() => {}); } catch {}
          }
        } else {
          wasPlaying.set(v, isActuallyPlaying(v));
          if (wasPlaying.get(v)) { try { v.pause(); } catch {} }
        }
      }
    }, { root: null, threshold: 0.01 });

    const attach = () => {
      document.querySelectorAll("video:not([data-ufo='off'])").forEach(v => io.observe(v));
    };
    attach();
    document.addEventListener("DOMContentLoaded", attach, { once: true });

    (UFO.__cleanups ??= []).push(() => io.disconnect());
  }

  setupVideoObserver();
})();