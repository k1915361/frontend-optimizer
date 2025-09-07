
// ==UserScript==
// @name         UFO (Universal Frontend Optimizer)
// @namespace    ufo
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/per_origin_config_kill_switch.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/csp_safe_style_injection.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/per_site_profiles.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/performance_orchestration.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/offscreen_and_layout_safety.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/image_and_video_handling_guardrails.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/network_hints.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/local_only_core_web_vitals_stub.js
// @require      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/hud.js
// @inject-into page      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/neutering.page.js
// @inject-into page      https://raw.githubusercontent.com/k1915361/frontend-optimizer/main/events_unified.page.js
// @license     MIT
// ==/UserScript==

// TODO inject-into page needs correction or use explicit <script> injection