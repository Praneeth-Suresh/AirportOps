// Sentinel stylized digital-twin map — self-contained backdrop for the pitch.
// Deterministic (no Math.random / Date.now). Passenger flow is driven by GSAP
// keyframes added to the beat's paused timeline, so HyperFrames can seek it.
(function () {
  const ZONES = [
    { x: 960, y: 205, label: "Departure Hall", pct: 60, s: "ok" },
    { x: 330, y: 500, label: "Gate 10", pct: 41, s: "ok" },
    { x: 1590, y: 440, label: "Gate 5", pct: 46, s: "ok" },
    { x: 762, y: 480, label: "Check-in A", pct: 95, s: "crit" },
    { x: 1130, y: 480, label: "Check-in B", pct: 76, s: "warn" },
    { x: 600, y: 700, label: "Security", pct: 94, s: "crit" },
    { x: 1205, y: 700, label: "Immigration", pct: 58, s: "ok" },
    { x: 960, y: 895, label: "Terminal Entrance", pct: 37, s: "ok" },
  ];
  // color-coded staff (airline green idle at Gate 10, plus ground/immigration/security)
  const STAFF = [
    { x: 300, y: 548, c: "#37d6a0" }, { x: 362, y: 560, c: "#37d6a0" }, { x: 332, y: 590, c: "#37d6a0" },
    { x: 800, y: 520, c: "#ffb23e" }, { x: 622, y: 678, c: "#ff5c6c" }, { x: 1188, y: 680, c: "#39c2ff" },
    { x: 1128, y: 542, c: "#ffb23e" },
  ];
  // passenger streams: polyline waypoints [x,y]
  const FLOWS = [
    [[1585, 455], [1440, 560], [1300, 660], [1210, 700]],
    [[960, 880], [860, 710], [795, 560], [762, 500]],
    [[762, 500], [690, 600], [612, 690]],
    [[370, 505], [600, 360], [885, 250], [955, 220]],
    [[1130, 505], [1165, 600], [1200, 690]],
  ];
  const PLANE = "M10 35 L64 30 L98 12 L108 15 L88 31 L126 30 L140 24 L146 28 L132 35 L146 42 L140 46 L126 40 L88 39 L108 55 L98 58 L64 40 Z";

  function counterRows(x, y, n) {
    let s = "";
    for (let r = 0; r < 3; r++) for (let c = 0; c < n; c++) s += `<rect class="counter" x="${x + c * 46}" y="${y + r * 54}" width="34" height="40" rx="5"/>`;
    return s;
  }

  function build(container) {
    let html = `
      <svg class="map-geo" viewBox="0 0 1920 1080" preserveAspectRatio="none">
        <rect class="floor" x="150" y="150" width="1620" height="800" rx="26"/>
        <rect class="floor" x="620" y="380" width="680" height="330" rx="14"/>
        <g>${counterRows(660, 420, 5)}${counterRows(1030, 420, 5)}</g>
        <line class="floor" x1="960" y1="150" x2="960" y2="380"/>
        <line class="floor" x1="960" y1="710" x2="960" y2="950"/>
      </svg>`;
    html += `<svg class="plane" style="left:1665px;top:405px" width="156" height="70" viewBox="0 0 156 70"><path d="${PLANE}"/></svg>`;
    html += `<svg class="plane" style="left:245px;top:470px;transform:translate(-50%,-50%) scaleX(-1)" width="156" height="70" viewBox="0 0 156 70"><path d="${PLANE}"/></svg>`;
    html += `<div class="pax-layer"></div>`;
    for (const t of STAFF) html += `<div class="staff" style="left:${t.x}px;top:${t.y}px;background:${t.c};color:${t.c}"></div>`;
    for (const z of ZONES) html += `<div class="zpill s-${z.s}" style="left:${z.x}px;top:${z.y}px"><span class="zdot"></span><span class="zlabel">${z.label}</span><span class="zpct">${z.pct}%</span></div>`;
    container.innerHTML = html;
  }

  function flow(tl, container) {
    const root = container || document.querySelector(".map");
    const cont = root.querySelector(".pax-layer") || root;
    FLOWS.forEach((wp, fi) => {
      const xs = wp.map((p) => p[0]);
      const ys = wp.map((p) => p[1]);
      const K = 5;
      for (let i = 0; i < K; i++) {
        const d = document.createElement("div");
        d.className = "pax";
        cont.appendChild(d);
        gsap.set(d, { x: xs[0], y: ys[0] });
        const dur = 6 + fi * 0.7 + i * 0.55; // varied so the stream desyncs
        // finite repeat covers the longest beat (20s) without exploding the render frame set
        tl.to(d, { keyframes: { x: xs, y: ys }, duration: dur, ease: "none", repeat: 5 }, 0);
      }
    });
  }

  window.SentinelMap = { build, flow, ZONES };
})();
