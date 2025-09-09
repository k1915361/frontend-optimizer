// ==UserScript==
// @name         Enter → Generate (tensor.art)
// @namespace    ufo
// @version      2025-08-03
// @description  Press Enter to click the “Generate” button on tensor.art.
// @match        https://tensor.art/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // Don’t trigger while the user is typing in inputs/textareas/contenteditable
  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    const type = el.type?.toLowerCase();
    if (el.isContentEditable) return true;
    if (tag === 'textarea') return true;
    if (tag === 'input' && !/^(button|submit|checkbox|radio|range|color|file)$/i.test(type)) return true;
    return false;
  }

  // Find a likely “Generate” button
  function findGenerateButton() {
    const candidates = document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]');
    for (const el of candidates) {
      const txt = (el.textContent || el.value || '').trim();
      if (!txt) continue;
      if (/^generate\b/i.test(txt)) return el;
      if (/^start\s*generat/i.test(txt)) return el;
    }
    return null;
  }

  function onKeyDown(e) {
    if (e.key !== 'Enter') return;
    if (isTypingTarget(document.activeElement)) return; // don’t fire while typing
    const btn = findGenerateButton();
    if (!btn) return;
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
    btn.click();
  }

  // Avoid double-binding if the script re-runs
  if (!window.__tensor_enter_generate_bound) {
    window.__tensor_enter_generate_bound = true;
    window.addEventListener('keydown', onKeyDown, { capture: true });
  }
})();
