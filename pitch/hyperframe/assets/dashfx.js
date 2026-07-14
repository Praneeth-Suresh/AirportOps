// Animation overlays that live inside the real dashboard's map coordinate
// space (the app's 1448x1086 viewBox), so a docking plane / flowing passengers
// / staff line up exactly with the app's gates and zones.
// Deterministic (no Math.random / Date.now); motion is added to the beat's
// paused GSAP timeline so HyperFrames can seek it.
window.DashFX = (function () {
  const NS = "http://www.w3.org/2000/svg";
  const PLANE =
    "M0 -20 C2 -20 3.4 -17 3.4 -12 L3.4 -4 L18 5 L18 9 L3.4 5.5 L3.4 14 L8 17.5 L8 20.5 L0 18.5 L-8 20.5 L-8 17.5 L-3.4 14 L-3.4 5.5 L-18 9 L-18 5 L-3.4 -4 L-3.4 -12 C-3.4 -17 -2 -20 0 -20 Z";

  function overlay(dashEl) {
    const pan = dashEl.querySelector("[data-pan]");
    const wrap = pan && pan.firstElementChild ? pan.firstElementChild : dashEl;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 1448 1086");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.cssText = "position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:7;";
    wrap.appendChild(svg);
    return svg;
  }

  function node(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // A plane <g>; move/rotate via GSAP transforms on the group.
  function plane(svg, color) {
    const g = node("g", {});
    g.appendChild(node("path", { d: PLANE, fill: color || "#29a3ff", stroke: "#0b1015", "stroke-width": "1.2", opacity: "0.96" }));
    svg.appendChild(g);
    return g;
  }

  // Taxi + dock along waypoints, ending parked at the gate.
  function dock(tl, g, waypoints, rot, scale, at) {
    const xs = waypoints.map((w) => w[0]);
    const ys = waypoints.map((w) => w[1]);
    gsap.set(g, { xPercent: 0, yPercent: 0, transformOrigin: "0px 0px", x: xs[0], y: ys[0], rotation: rot, scale: scale, opacity: 0 });
    tl.to(g, { opacity: 1, duration: 0.5 }, at);
    tl.to(g, { keyframes: { x: xs, y: ys }, duration: 4.2, ease: "power2.inOut" }, at);
    return g;
  }

  // Passenger stream: slow, separated, human-like. Each dot gets its own
  // slightly-offset path, its own pace, and a gentle lateral wander.
  function pax(tl, svg, path, opts) {
    opts = opts || {};
    const n = opts.count || 7;
    const color = opts.color || "#29a3ff";
    const at = opts.at || 0;
    const dots = [];
    for (let i = 0; i < n; i++) {
      const off = ((i * 37) % 11) - 5; // deterministic per-dot lateral offset
      const off2 = ((i * 53) % 9) - 4;
      const xs = path.map((p, k) => p[0] + (k === 0 || k === path.length - 1 ? 0 : off));
      const ys = path.map((p, k) => p[1] + (k === 0 || k === path.length - 1 ? 0 : off2));
      const c = node("circle", { r: "5.2", fill: color, opacity: "0.92" });
      svg.appendChild(c);
      gsap.set(c, { x: xs[0], y: ys[0], transformOrigin: "0px 0px" });
      const dur = 5 + (i % 4) * 0.9 + (i % 3) * 0.6; // brisk + varied pace
      tl.to(c, { keyframes: { x: xs, y: ys }, duration: dur, ease: "none", repeat: 3 }, at + i * (opts.stagger || 1.4));
      // subtle human wander (side-to-side), independent of the along-path motion
      tl.to(c, { y: "+=6", duration: 1.6 + (i % 3) * 0.4, yoyo: true, repeat: 40, ease: "sine.inOut" }, at + i * 0.3);
      dots.push(c);
    }
    return dots;
  }

  // Staff markers that pop in (scale) at given [x,y,color] points.
  function staff(tl, svg, points, at) {
    points.forEach((p, i) => {
      const g = node("g", {});
      g.appendChild(node("rect", { x: "-7", y: "-7", width: "14", height: "14", rx: "3", fill: p[2], stroke: "#0b1015", "stroke-width": "1.5" }));
      svg.appendChild(g);
      gsap.set(g, { x: p[0], y: p[1], transformOrigin: "0px 0px", scale: 0, opacity: 0 });
      tl.to(g, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2.2)" }, at + i * 0.09);
    });
  }

  return { overlay, plane, dock, pax, staff };
})();
