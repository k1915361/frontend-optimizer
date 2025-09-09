// page_injector.js — CSP-safe, no inline code
(() => {
  // Safety: only patch the top frame (re-enable iframes later if you want)
  if (window.top !== window) return;

  // 1) Inject page-world modules as external scripts (allowed by CSP because
  //    they come from your extension origin listed in manifest.web_accessible_resources)
  const urls = [
    chrome.runtime.getURL("events_unified.page.js"),
    chrome.runtime.getURL("neutering.page.js"),
  ];

  for (const src of urls) {
    const s = document.createElement("script");
    s.src = src;
    s.type = "text/javascript"; // your page files are IIFEs
    s.async = false;            // preserve order
    (document.head || document.documentElement).appendChild(s);
    s.onload = () => s.remove();
  }

  // 2) Broadcast the current FEAT snapshot to the page world (no inline <script>)
  //    Your page files already listen for {type:"ufo:feat"} and merge FEAT.
  queueMicrotask(() => {
    try {
      window.postMessage(
        { type: "ufo:feat", feat: (window.__ufo?.FEAT || {}) },
        "*"
      );
    } catch {}
  });
})();
