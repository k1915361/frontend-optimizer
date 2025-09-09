
// ==UserScript==
// @name         LoRAs always visible (mask IDs, ignore Hires, asserts, same insert point)
// @namespace    ufo
// @version      2025-09-06
// @description  Improve easiness/UX for direct-viewing LoRA weights of each image generation data. Extract only the LoRA line, ignore Hires, show compact summary; asserts for debugging.
// @match        https://tensor.art/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(() => {
  'use strict';

  const DEBUG = true;
  const A = (cond, ...msg) => console.assert(cond, ...msg);

  // ----- CSS (GM_addStyle if present; else fallback) -----
  const addStyle = (css) => {
    try { if (typeof GM_addStyle === 'function') return GM_addStyle(css); } catch {}
    const s = document.createElement('style');
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  };
  addStyle(`
    pre.lora-top-compact {
      display:block; margin:6px 0;
      white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word;
      max-width:100%; max-height:60vh; overflow:auto; line-height:1.25;
      font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size:12px; background:#111; color:#eee; border:1px solid #333;
      border-radius:8px; padding:8px;
    }
  `);

  // ----- Helpers -----
  const maskName = (name) => {
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f-]{27,}(?:\.[A-Za-z0-9_+-]+)?$/i;
    if (uuidLike.test(name)) {
      const prefix = name.slice(0, 2);
      const suffix = name.includes(".") ? "." + name.split(".").pop() : "";
      return `${prefix}....${suffix}`;
    }
    if (/[A-Za-z0-9+/=_-]{20,}/.test(name)) return name.slice(0, 2) + "..." + name.slice(-2);
    return name;
  };

  // Extract ONLY the LoRA line (ignore everything after the first newline).
  const extractLoRALine = (text) => {
    const m = /lora:\s*([^\n\r]+)/i.exec(text || "");
    return m ? m[1].trim() : "";
  };

  // Parse name:weight pairs from the LoRA line
  const parseLoRA = (line) => {
    if (!line) return [];
    return line.split(",")
      .map(s => s.trim()).filter(Boolean)
      .map((tok, i) => {
        const j = tok.lastIndexOf(":");
        if (j < 0) { A(false, "[LoRA] token missing ':' →", tok); return null; }
        const name = maskName(tok.slice(0, j).trim());
        const w = parseFloat(tok.slice(j + 1).trim());
        A(Number.isFinite(w), "[LoRA] weight parse:", tok, "→", w);
        if (!Number.isFinite(w)) return null;
        return `${i + 1} ${w.toFixed(1)} ${name}`;
      })
      .filter(Boolean);
  };

  // Keep original insert placement: after nearest .flex-1.flex-c-sb.gap-4.cursor-pointer
  const insertBlock = (p, lines) => {
    if (!p || !lines?.length) return;
    if (p.dataset.loraInserted === '1') { A(true, "[LoRA] already inserted on <p>"); return; }

    const pre = document.createElement('pre');
    pre.className = 'lora-top-compact';
    pre.textContent = `LoRA (${lines.length}):\n${lines.join('\n')}`;

    const flexDiv = p.closest('.flex-1.flex-c-sb.gap-4.cursor-pointer');
    A(!!flexDiv, "[LoRA] nearest flex container found:", flexDiv);

    const host = flexDiv || p;
    if (host.dataset.loraInserted === '1') { A(true, "[LoRA] host already marked inserted"); return; }

    host.insertAdjacentElement('afterend', pre);
    host.dataset.loraInserted = '1';
    p.dataset.loraInserted = '1';
    A(true, "[LoRA] inserted after host:", host);
  };

  // Process a candidate paragraph-like node
  const processP = (p) => {
    if (!p || p.nodeType !== 1) return;
    if (p.dataset.loraParsed === '1') return;

    const full = p.textContent || "";
    if (!/lora\s*:/i.test(full)) return; // fast reject — no LoRA:

    const line = extractLoRALine(full);
    A(!!line, "[LoRA] extracted line:", line);
    if (!line) { p.dataset.loraParsed = '1'; return; } // mark to avoid rework

    const lines = parseLoRA(line);
    A(lines.length > 0, "[LoRA] parsed lines:", lines);
    if (!lines.length) { p.dataset.loraParsed = '1'; return; }

    insertBlock(p, lines);
    p.dataset.loraParsed = '1';
  };

  // Scan a subtree for paragraphs (keeps your original <p> targeting)
  const scanForP = (root) => {
    if (!root) return;
    if (root.nodeType === 1 && root.tagName.toLowerCase() === 'p') processP(root);
    root.querySelectorAll?.('p').forEach(processP);
  };

  // Initial pass (what your original did)
  scanForP(document);

  // Observe: added nodes AND text changes (characterData)
  const mo = new MutationObserver((recs) => {
    for (const r of recs) {
      // new elements
      for (const n of r.addedNodes) {
        if (n.nodeType === 1) scanForP(n);
        else if (n.nodeType === 3 && n.parentElement) processP(n.parentElement); // new text
      }
      // changed text in existing nodes
      if (r.type === 'characterData' && r.target?.parentElement) {
        processP(r.target.parentElement);
      }
    }
  });
  try {
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    A(true, "[LoRA] MutationObserver armed");
  } catch (e) {
    console.warn("[LoRA] MO observe failed:", e);
  }
})();