

// page_injector.js
(() => {

  // TODO make this into a FEAT flag.
  if (window.top != window) return;

  // Snapshot FEAT from the content-script world
  const feat = (window.__ufo && window.__ufo.FEAT) ? JSON.parse(JSON.stringify(window.__ufo.FEAT)) : {};

  // Seed page world with the same FEAT values
  const seed = document.createElement("script");
  seed.textContent = `
    (function(){
      window.__ufo = window.__ufo || {};
      window.__ufo.FEAT = Object.assign(window.__ufo.FEAT || {}, ${JSON.stringify(feat)});
    })();
  `;
  (document.head || document.documentElement).appendChild(seed);
  seed.remove();

  // Now inject the page-world modules that depend on FEAT
  for (const src of [
    chrome.runtime.getURL("events_unified.page.js"),
    chrome.runtime.getURL("neutering.page.js"),
  ]) {
    const s = document.createElement("script");
    s.src = src;
    s.type = "text/javascript";
    (document.head || document.documentElement).appendChild(s);
    s.onload = () => s.remove();
  }
})();
