// Drives the real app's renderToString(state) to emit pixel-perfect dashboard
// HTML at several states, tags each chrome region so the pitch can reveal them
// one at a time, and writes assets/dash.js (window.SentinelDash.variants).
import { state, renderToString } from "../../../src/app/index.js";
import { writeFileSync } from "node:fs";

function tag(html) {
  return html
    .split('src="photo_2026-07-12_07-44-35.jpg"').join('src="assets/sentinel-logo.jpg"')
    .replace("<header ", '<header data-hf="topbar" ')
    .replace("<footer ", '<footer data-hf="timeline" ')
    .replace(
      'style="position:absolute; left:14px; top:14px; bottom:14px; z-index:12;',
      'data-hf="rail" style="position:absolute; left:14px; top:14px; bottom:14px; z-index:12;',
    )
    .replace(
      'style="position:absolute; right:14px; top:14px; bottom:14px; width:312px; z-index:11;',
      'data-hf="panel" style="position:absolute; right:14px; top:14px; bottom:14px; width:312px; z-index:11;',
    )
    .replace(
      'style="position:absolute; right:14px; bottom:14px; z-index:13;',
      'data-hf="copilot" style="position:absolute; right:14px; bottom:14px; z-index:13;',
    );
}

function variant(cfg) {
  state.booted = true;
  state.view = "departure";
  state.mode = "live";
  state.tick = cfg.tick ?? 6;
  state.copilot = cfg.copilot ?? false;
  state.selected = null;
  state.hover = null;
  state.minute = cfg.minute ?? 0;
  Object.assign(state.layers, { pax: true, staff: true, heat: true, flights: true }, cfg.layers || {});
  return tag(renderToString());
}

const variants = {
  min0: variant({ minute: 0 }),
  min60: variant({ minute: 60 }),
  otto: variant({ minute: 30, copilot: true }),
};

const out = "window.SentinelDash = " + JSON.stringify({ variants }) + ";\n";
writeFileSync(new URL("../assets/dash.js", import.meta.url), out);
console.log("wrote dash.js", out.length, "bytes;", Object.keys(variants).join(","));
