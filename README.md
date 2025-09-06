
# Universal Frontend Optimizer

A lightweight userscript/extension that automatically applies **frontend performance optimisations** to any site you visit.  

It’s designed to be safe, unobtrusive, and compatible with dynamic UIs (SPAs, infinite scroll, etc.).

---

## ✅ Optimisations Implemented

### 1. **Images & Iframes**
- Adds `loading="lazy"` → avoids fetching images/iframes until they are near viewport.  
- Adds `decoding="async"` (for `<img>`) → lets decoding happen off the main thread.  
- Adds `fetchpriority="low"` by default, switches to `"high"` when scrolled into view.  
- Hydrates `width` and `height` attributes once images load → reduces layout shifts (CLS).  
- Adds safe defaults for `<iframe>` like `referrerpolicy`.

---

### 2. **Event Listeners**
- Monkey-patches `addEventListener` so that **scroll, touch, wheel events** are automatically made **passive by default** (unless a site explicitly requests `passive: false`).  
  👉 Prevents handlers from blocking the main thread during scrolling.

#### 🔄 New: Event Listener Cleanup
- Tracks every listener added to DOM nodes.  
- When a node is removed from the DOM:
  - All listeners on that node **and its descendants** are automatically detached.  
- Works with `{ capture }` options and `{ signal }` (removes on `AbortSignal.abort`).  
- Keeps Window/Document listeners intact (not detached).  
- Prevents memory leaks from detached nodes holding onto handlers.

---

### 3. **Offscreen Optimisations**
- Uses `content-visibility: auto` + `contain: content` on large sections (`<section>, <article>, .container, .card` …) → browsers skip layout/paint for offscreen elements.  
- Pauses **animations** when elements go offscreen (`animation-play-state: paused`).  
- Pauses **autoplay videos** when offscreen, resumes when visible again.

---

### 4. **Connections**
- Scans the page for top external domains (images, scripts, iframes, videos).  
- Adds `<link rel="preconnect">` to the 5 most used domains → speeds up DNS + TLS handshake.

---

### 5. **CSS Safe Defaults**
- Honors **prefers-reduced-motion** by forcing instant animations/transitions for users who prefer less motion.  
- Optimizes text rendering for `<pre>`/`<code>`.  
- Ensures `img { image-rendering: auto; }` (so no weird pixelation).  
- Provides `.ufo-contain` and `.ufo-content-visibility` utility classes for dynamic nodes.

---

### 6. **User Motion Preference**
- If user has “reduce motion” enabled, disables CSS smooth scrolling (`scroll-behavior: auto`).

---

## ❌ What It Does *Not* Do (Yet)
- Deduplicate identical event listeners.  
- Throttle `requestAnimationFrame` loops or long-running timers.  
- Replace big inline base64 images with cacheable URLs.  
- Compress/resize oversize images.  
- Block analytics/ads scripts (intentionally avoided to keep optimisations “safe”).

---

## 🔎 Summary
- Optimises **media, events, offscreen content, and network connections**.  
- Now also **auto-cleans up event listeners** to prevent memory leaks.  
- Designed to run safely on any site without breaking functionality.  

---

## 🚀 Usage

### Option 1: Install as a Userscript
1. Install [Tampermonkey](https://www.tampermonkey.net/) or Violentmonkey.  
2. Create a new script and paste in `optimizer.user.js`.  
3. Save → it will run automatically on all sites.

### Option 2: Install as a Chrome Extension
1. Create a folder (e.g. `ufo-optimizer/`).  
2. Inside it, add:

[**`manifest.json`**](/manifest.json)
