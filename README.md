# Universal Frontend Optimizer (UFO)

A lightweight userscript/extension that applies **safe, automatic frontend performance optimizations** to the sites you visit. It’s designed for modern, dynamic pages (SPAs, infinite scroll, media-heavy UIs) and aims to reduce jank, crashes, and sluggish UX without breaking functionality.

---

## Why UFO?

Web apps today ship large bundles, render continuously, and stream media. The result can be:

* Long time-to-interact, scroll jank, high CPU/battery drain
* Runaway listeners and observers leaking memory
* Layout thrashers (offscreen work, heavy containers)
* Oversized images/videos and unhelpful network priorities

**UFO** provides sensible defaults and opt‑outs to keep pages responsive while respecting site behavior.

---

## What UFO does (at a glance)

* **Unified Event Wrapper**: passive-by-default for scroll/touch, **dedupes** duplicate listeners, **auto-cleans** listeners when nodes detach.
* **Network hints**: smart **preconnect/dns-prefetch** for render-blocking origins; LCP **hero image boost** (`fetchpriority=high`, optional `decoding=sync`).
* **Media guardrails**: DPR-aware client **downscale** for grossly oversized images; **stateful** offscreen video pause/resume.
* **Offscreen/layout safety**: scoped `content-visibility:auto` for opted-in containers (with guards for sticky/anchors).
* **Realtime & batching**: global **realtime** switch to bypass throttles + **mutation batching** to coalesce costly observer work.
* **CSP-safe CSS injection**: inline `<style>` or Blob stylesheet fallback.
* **Vitals stub**: local LCP/CLS/INP logger for quick sanity checks.
* **Debug HUD**: compact overlay (Alt+U) to flip flags and see FPS.
* **Script neutering (optional)**: safe, **reversible** blocking of known trackers by changing `type="ufo-blocked"` (off by default).

All features are **feature-flagged** and **per-site configurable**.

---

## Quick start

### Option A — Userscript (Tampermonkey/AdGuard/Violentmonkey)

1. Install your favorite userscript manager.
2. Create a small entry userscript that uses `@require` to include the UFO modules **in order** (see File Structure below). Use `@run-at document-start`.
3. For AdGuard on Android/desktop, you can import the userscript URL to apply system‑wide.

### Option B — Chromium Extension (Edge/Chrome, dev load)

> TODO - will apply correction to the manifest.json for injection of `.page.js` files.

1. `Load unpacked` the extension folder (contains `manifest.json`).
2. UFO injects two **page-world** modules via `page_injector.js` so prototype patches affect the site. Everything else runs as normal content scripts.
3. Optional: zip and submit to the store when ready.

> Userscript and extension builds share the same modules; only the bootstrapping differs.

---

## Architecture: two JS worlds

* **Page world (main world)**: the site’s own JS. UFO injects `events_unified.page.js` (event wrapper) and `neutering.page.js` here so patches apply to the real prototypes.
* **Content-script world (isolated)**: your extension/userscript environment. Holds the **canonical** `window.__ufo` state (feature flags, profiles, utils) and most modules.

UFO **seeds** feature flags from the content world into the page at startup, and **syncs** later changes via `postMessage`.

---

## Feature flags (defaults)

These live in `window.__ufo.FEAT` and can be toggled per-site.

| Flag                        | Default | What it controls                                                                      |
| --------------------------- | :-----: | ------------------------------------------------------------------------------------- |
| `UNIFIED_EVENT_WRAPPER`     |    ✅    | Install unified `addEventListener` wrapper in page world                              |
| `PASSIVE_LISTENERS`         |    ✅    | Make scroll/touch/wheel passive by default (unless explicitly false)                  |
| `DEDUP_EVENT_LISTENERS`     |    ✅    | Prevent duplicate registrations (type+listener+opts)                                  |
| `LISTENER_CLEANUP`          |    ✅    | Auto-remove listeners on detached nodes                                               |
| `PRECONNECT_SMART`          |    ✅    | Preconnect top cross-origin hosts used by blocking CSS/sync JS; dns‑prefetch the rest |
| `LCP_BOOST`                 |    ✅    | Elevate likely hero images (`fetchpriority=high`)                                     |
| `LCP_SYNC_DECODE`           |    ✅    | Optionally set `decoding=sync` for the single top hero candidate                      |
| `DOWNSCALE_OVERSIZE_IMAGES` |    ✅    | Client downscale absurdly oversized images (DPR-aware, zoom/gallery-safe)             |
| `OFFSCREEN_VIDEO_PAUSE`     |    ✅    | Pause offscreen videos; resume only if previously playing                             |
| `MUTATION_BATCHING`         |    ✅    | Batch observer work via microtask → `requestIdleCallback`                             |
| `OFFSCREEN_SCOPE`           |    ✅    | Enable `.ufo-auto` class behavior for safe `content-visibility:auto`                  |
| `FONT_SWAP`                 |    ✅    | Inject `font-display: swap` for **same-origin** `@font-face`                          |
| `SCRIPT_NEUTER`             |    ❌    | Attribute-neuter matching scripts (requires reload unless you enable live init)       |

There’s also a lightweight runtime bucket `window.__ufo.flags` (e.g., `REALTIME`).

---

## Per-site profiles & commands

Profiles are stored under `localStorage["ufo:profiles"]`, keyed by origin. Use the console on the target site.

**Inspect current profile:**

```js
__ufo_profileGet()
```

**Update flags for this site:**

```js
__ufo_profileUpdate({ DOWNSCALE_OVERSIZE_IMAGES: false, LCP_BOOST: true })
```

**Reset this site to defaults:**

```js
__ufo_profileReset()
```

**Emergency stop (current tab):**

```js
__ufo_disable()
```

**Realtime mode (bypass throttles, run batched work immediately):**

```js
__ufo_realtime(true)   // on
__ufo_realtime(false)  // off
```

> UFO broadcasts feature changes to the page world so page modules see updates live (where supported).

---

## Live controls: Debug HUD

Press **Alt+U** to toggle the HUD. You can:

* see **FPS** and the state of major flags,
* click a flag to flip it (persists via per-site profile),
* toggle **Realtime**.

---

## Key modules (what they actually do)

### Unified Event Wrapper (page world)

* One wrapper for `addEventListener`/`removeEventListener` → passive defaults, dedupe, auto-cleanup; respects `AbortSignal`, `once`, `capture`.
* Debug helpers: `__ufo_events(node)`, `__ufo_restoreEvents()`.

### Network Hints

* Preconnect top cross-origin hosts referenced by **blocking CSS** and **sync `<script>`**.
* LCP boost for the top 1–2 above-the-fold images; optionally `decoding=sync` for the single top hero.

### Media Guardrails

* Skip downscale for zoomable/carousel regions; respect `aspect-ratio` and DPR.
* Offscreen videos pause; resume only if previously playing.

### Offscreen/Layout Safety

* Opt‑in `.ufo-auto` class adds `content-visibility:auto; contain:content;` with guards for sticky descendants and anchor targets.

### CSP‑safe CSS Injection

* `UFO.util.injectStyle(css, id)` uses `<style>` or a Blob stylesheet if CSP blocks inline styles.

### Core Web Vitals (local)

* Tracks LCP, CLS, and INP/FID. Print on demand:

```js
__ufo_logVitalsNow()
```

### Script Neutering (optional)

* OFF by default. Enable and configure:

```js
__ufo_profileUpdate({ SCRIPT_NEUTER: true })
__ufo_setScriptBlocklist([/googletagmanager\.com/i, /google-analytics\.com/i])
__ufo_blockedScripts()              // inspect
__ufo_restoreScript('script-id')    // restore by id
```

> Note: enabling may require a page reload unless the page module listens for live FEAT updates.

---

## Troubleshooting

* **Site broke?**

  * `__ufo_disable()` to restore originals and detach observers (current tab).
  * Toggle off specific flags with `__ufo_profileUpdate({ FLAG:false })` and reload.
* **Event wrapper not active?** Ensure `events_unified.page.js` is injected (extension) or injected via `<script>` in userscript mode. In page console:

  ```js
  EventTarget.prototype.addEventListener.toString()
  // should show function wrappedAdd(...)
  ```
* **Two worlds confusion?** Use the console context dropdown to switch between **page** and **extension (content script)** contexts.

---

## Privacy & security

* UFO makes **no network requests** beyond optional `preconnect/dns-prefetch` hints for the page’s own resources.
* Script neutering is local and reversible; blocklists are stored per-site.
* No telemetry is sent anywhere; the vitals logger only prints to your console.

---

## File structure (extension build)

```
manifest.json
page_injector.js
  └─ injects: events_unified.page.js, neutering.page.js (page world)
per_origin_config_kill_switch.js   (core namespace, kill switch)
csp_safe_style_injection.js        (util: injectStyle + font swap logic)
per_site_profiles.js               (profiles + FEAT sync to page)
performance_orchestration.js       (realtime toggle + mutation batching)
offscreen_and_layout_safety.js     (opt‑in content‑visibility)
image_and_video_handling_guardrails.js
network_hints.js                   (preconnect + LCP boost)
local_only_core_web_vitals_stub.js
hud.js
```

---

## Roadmap

* Safer image heuristics for animated SVG/Lottie
* Optional per-site cookie/Storage budget trims
* More granular, low‑risk script neutering presets

---

## License

MIT. Add `// @license MIT` to your userscript header if you publish on GreasyFork.
