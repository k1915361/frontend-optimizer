
/*───────────────────────────────────────────────────────────────────────────────
  REFINEMENT [2025-09-07]: Debug HUD (FPS + toggles)
  - Toggle with Alt+U (or call __ufo_hud(true/false)).
  - Click a flag to flip it; persists via __ufo_profileUpdate().
───────────────────────────────────────────────────────────────────────────────*/
(() => {
  const UFO = (window.__ufo ??= {});
  const FEAT = (UFO.FEAT ??= {});
  const util = (UFO.util ??= {});
  const HUD_ID = "ufo-hud";
  const CSS = `
#${HUD_ID}{position:fixed;inset:auto auto 16px 16px;z-index:2147483647;min-width:220px;
  font:12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  background:rgba(20,20,22,.9);color:#eee;border:1px solid #333;border-radius:10px;
  box-shadow:0 6px 18px rgba(0,0,0,.35);padding:10px;backdrop-filter:saturate(1.2) blur(4px)}
#${HUD_ID} .hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
#${HUD_ID} .hdr b{font-size:12px;letter-spacing:.6px;color:#ddd}
#${HUD_ID} .fps{font-weight:600}
#${HUD_ID} .flags{display:grid;grid-template-columns:1fr auto;gap:6px;margin-top:6px}
#${HUD_ID} .flag{display:contents}
#${HUD_ID} button{all:unset;cursor:pointer;border:1px solid #444;border-radius:8px;padding:2px 6px;text-align:center}
#${HUD_ID} button.on{background:#2f855a;border-color:#276749;color:#fff}
#${HUD_ID} button.off{background:#553c2a;border-color:#7b341e;color:#fff}
#${HUD_ID} .row{display:flex;justify-content:space-between;gap:8px}
  `.trim();

  // CSP-safe style injection (reuses util if present)
  const inject = util.injectStyle || ((css, id) => {
    try { const st = document.createElement("style"); if (id) st.id=id; st.textContent=css; document.head.appendChild(st); return { node: st }; }
    catch { return { node: null }; }
  });
  inject(CSS, "ufo-hud-style");

  let hud, rafId, fpsEl;
  const MAJOR_FLAGS = [
    "THROTTLE_RAF_AND_TIMERS",
    "PRECONNECT_SMART",
    "LCP_BOOST",
    "DOWNSCALE_OVERSIZE_IMAGES",
    "OFFSCREEN_VIDEO_PAUSE",
    "FONT_SWAP",
    "OFFSCREEN_SCOPE"
  ].filter(k => k in FEAT);

  function render() {
    if (hud) hud.remove();
    hud = document.createElement("div");
    hud.id = HUD_ID;
    hud.innerHTML = `
      <div class="hdr"><b>UFO HUD</b><span class="fps">FPS: <span id="ufo-fps">--</span></span></div>
      <div class="flags">
        ${MAJOR_FLAGS.map(k => `
          <div class="flag"><span>${k}</span>
            <button data-flag="${k}" class="${FEAT[k] ? 'on' : 'off'}">${FEAT[k] ? 'ON' : 'OFF'}</button>
          </div>`).join("")}
        <div class="row"><span>REALTIME</span><button data-realtime class="${UFO.flags?.REALTIME ? 'on' : 'off'}">${UFO.flags?.REALTIME ? 'ON' : 'OFF'}</button></div>
      </div>
    `;
    document.body.appendChild(hud);
    fpsEl = hud.querySelector("#ufo-fps");

    hud.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.hasAttribute("data-flag")) {
        const key = btn.getAttribute("data-flag");
        const next = !FEAT[key];
        window.__ufo_profileUpdate?.({ [key]: next });
        // reflect immediately
        btn.className = next ? "on" : "off";
        btn.textContent = next ? "ON" : "OFF";
      } else if (btn.hasAttribute("data-realtime")) {
        const next = !(UFO.flags?.REALTIME);
        window.__ufo_realtime?.(next);
        btn.className = next ? "on" : "off";
        btn.textContent = next ? "ON" : "OFF";
      }
    });

    // simple FPS meter
    let frames = 0, last = performance.now();
    function tick(now) {
      frames++;
      if (now - last >= 1000) {
        if (fpsEl) fpsEl.textContent = String(frames);
        frames = 0; last = now;
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    (UFO.__cleanups ??= []).push(() => { try { cancelAnimationFrame(rafId); } catch {}; try { hud.remove(); } catch {}; });
  }

  function toggle(show) {
    if (show === undefined) show = !document.getElementById(HUD_ID);
    if (show) render(); else { if (hud) { try { cancelAnimationFrame(rafId); } catch {}; hud.remove(); hud = null; } }
  }

  window.__ufo_hud = toggle;
  window.addEventListener("keydown", (e) => {
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === "u" || e.key === "U")) {
      e.preventDefault(); toggle();
    }
  });
})();