/*───────────────────────────────────────────────────────────────────────────────
  REFINEMENT [2025-09-07]: Script Neutering (safe, reversible)  —  OFF by default
  Goal:
    - Instead of hard-blocking by regex-removal, we "neuter" matching <script> tags by
      changing their type to a non-executable value (type="ufo-blocked") BEFORE they
      enter the document, so the browser won't execute them.
    - Provide APIs to inspect and restore neutered scripts if a site needs them.
  Scope:
    - Catches dynamically-added scripts via DOM APIs (appendChild/insertBefore/replaceChild)
      and document.createElement('script').
    - Parser-inserted scripts from the HTML stream are NOT reliably interceptable; this is
      intentionally a "least breakage" best-effort.
  APIs:
    • __ufo_setScriptBlocklist([...RegExp|string])   → set/replace matchers
    • __ufo_addScriptBlockers(...matchers)           → push additional matchers
    • __ufo_blockedScripts()                         → list current neutered script info
    • __ufo_restoreScript(predicate)                 → restore by id/element/function
    • Flags via per-site profile: FEAT.SCRIPT_NEUTER = true to enable
  Notes:
    - Neutered scripts remain in DOM with data-ufo-blocked="1" & original attrs mirrored on data-*.
    - Restoration clones the original attributes, flips to executable type, reinserts after the blocked node.
───────────────────────────────────────────────────────────────────────────────*/
(() => {
  const UFO = (window.__ufo ||= {}); 
  const FEAT = (UFO.FEAT ||= {});
  FEAT.SCRIPT_NEUTER = false // safe mode default
  let installed = false;
  function installIfEnabled() {
    if (installed || !FEAT.SCRIPT_NEUTER) return;
    installed = true;

  const ORIG = {
    append: Node.prototype.appendChild,
    insertBefore: Node.prototype.insertBefore,
    replaceChild: Node.prototype.replaceChild,
    createElement: Document.prototype.createElement
  };

  // Store metadata for neutered scripts
  const META = new WeakMap(); // scriptEl -> { reason, attrs, when }
  const blockedList = [];     // array of { el, reason, when }

  // Default (empty) blocklist; you own these. Use __ufo_setScriptBlocklist to fill.
  let BLOCKERS = [];

  function normMatcher(m) {
    if (m instanceof RegExp) return m;
    if (typeof m === "string") return new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    return null;
  }

  window.__ufo_setScriptBlocklist = function (arr) {
    const next = [];
    for (const m of (arr || [])) {
      const rx = normMatcher(m);
      if (rx) next.push(rx);
    }
    BLOCKERS = next;
    return BLOCKERS.slice();
  };

  window.__ufo_addScriptBlockers = function (...arr) {
    for (const m of arr) {
      const rx = normMatcher(m);
      if (rx) BLOCKERS.push(rx);
    }
    return BLOCKERS.slice();
  };

  // Helper: decide if a script should be neutered; return reason or empty string.
  function shouldBlock(script) {
    try {
      if (!(script instanceof HTMLScriptElement)) return "";
      if (script.getAttribute("data-ufo") === "off") return ""; // explicit opt-out
      // If author already set a non-executable type, ignore.
      const t = (script.type || "").trim().toLowerCase();
      if (t && !/^(?:application|text)\/(?:javascript|ecmascript|jsx|babel|importmap)$|^module$/i.test(t)) {
        return ""; // already non-executable
      }
      // Prefer src matching; fall back to inline content sampling (short & safe).
      const src = script.src || "";
      const sample = src ? "" : (script.textContent || "").slice(0, 256);
      for (const rx of BLOCKERS) {
        if (src && rx.test(src)) return `src:${rx}`;
        if (!src && sample && rx.test(sample)) return `inline:${rx}`;
      }
      return "";
    } catch { return ""; }
  }

  function neuter(script, reason) {
    try {
      if (META.has(script)) return script; // already neutered
      const attrs = {};
      for (const { name, value } of [...script.attributes]) {
        attrs[name] = value;
      }
      // Mark blocked BEFORE insertion/execution
      script.setAttribute("type", "ufo-blocked");
      script.setAttribute("data-ufo-blocked", "1");
      script.setAttribute("data-ufo-reason", String(reason));
      // Mirror original attributes on dataset for restore
      for (const [k, v] of Object.entries(attrs)) {
        // data-ufo-attr-<name>=<value>
        script.setAttribute(`data-ufo-attr-${k}`, v);
      }
      const when = performance.now();
      META.set(script, { reason, attrs, when });
      blockedList.push({ el: script, reason, when });
    } catch {}
    return script;
  }

  // Inspect & restore
  window.__ufo_blockedScripts = function () {
    return blockedList.map(({ el, reason, when }) => ({
      element: el,
      reason,
      when,
      src: el.getAttribute("data-ufo-attr-src") || "",
      id: el.getAttribute("id") || "",
    }));
  };

  window.__ufo_restoreScript = function (predicate) {
    // predicate can be: string id | element | function(el)->bool
    let matchFn;
    if (typeof predicate === "string") {
      matchFn = (el) => el.id === predicate;
    } else if (typeof predicate === "function") {
      matchFn = predicate;
    } else if (predicate && predicate.nodeType === 1) {
      matchFn = (el) => el === predicate;
    } else {
      return 0;
    }
    let restored = 0;
    for (const { el } of blockedList.slice()) {
      if (!el.isConnected) continue;
      if (!el.hasAttribute("data-ufo-blocked")) continue;
      if (!matchFn(el)) continue;

      const meta = META.get(el);
      if (!meta) continue;

      // Create a fresh executable clone
      const clone = document.createElement("script");
      // Restore original attributes (except nonce — leave as-is unless present)
      for (const [name, val] of Object.entries(meta.attrs)) {
        try { clone.setAttribute(name, val); } catch {}
      }
      // Restore text for inline scripts
      if (!meta.attrs.src && el.textContent) {
        clone.textContent = el.textContent;
      }
      // Insert after the blocked node
      try { el.insertAdjacentElement("afterend", clone); restored++; } catch {}
      // Keep the blocked marker for audit or remove it:
      // el.remove();
    }
    return restored;
  };

  // Core interception: ensure we neuter BEFORE nodes hit the DOM.
  function interceptInsert(apiName, fn) {
    Node.prototype[apiName] = function (node, ref) {
      try {
        if (node instanceof HTMLScriptElement) {
          const reason = shouldBlock(node);
          if (reason) neuter(node, reason);
        }
      } catch {}
      if (apiName === "insertBefore") return ORIG.insertBefore.call(this, node, ref);
      if (apiName === "replaceChild") return ORIG.replaceChild.call(this, node, ref);
      return ORIG.append.call(this, node);
    }.bind(Node.prototype);
  }

  interceptInsert("appendChild");
  interceptInsert("insertBefore");
  interceptInsert("replaceChild");

  // Intercept element creation so we can tag early (e.g., frameworks re-use one node)
  Document.prototype.createElement = function (name, options) {
    const el = ORIG.createElement.call(this, name, options);
    if (String(name).toLowerCase() === "script") {
      // If it later matches, we'll neuter on insertion; nothing to do now.
      // But we can set a tiny marker to detect programmatic insertion if needed.
      try { el.setAttribute("data-ufo-created", "1"); } catch {}
    }
    return el;
  };

  // Cleanups for kill switch
  (UFO.__cleanups ??= []).push(() => {
    try { Node.prototype.appendChild = ORIG.append; } catch {}
    try { Node.prototype.insertBefore = ORIG.insertBefore; } catch {}
    try { Node.prototype.replaceChild = ORIG.replaceChild; } catch {}
    try { Document.prototype.createElement = ORIG.createElement; } catch {}
  });

    }

  installIfEnabled();

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.type !== "ufo:feat") return;
    Object.assign(FEAT, e.data.feat || {});
    installIfEnabled();
  });
})();
