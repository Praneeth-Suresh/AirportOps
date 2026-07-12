// Deterministic placeholder "live map" dot field — populates any .dotfield element.
// No Math.random / Date.now (HyperFrames requires deterministic logic).
(function () {
  function build() {
    var fields = document.querySelectorAll(".dotfield");
    for (var f = 0; f < fields.length; f++) {
      var field = fields[f];
      var W = 1920, H = 1080, N = 46;
      for (var i = 0; i < N; i++) {
        var a = i * 0.7;
        var rad = 120 + (i % 5) * 66;
        var cx = W / 2 + Math.cos(a) * rad * (1 + (i % 3) * 0.45);
        var cy = H / 2 + Math.sin(a * 1.1) * rad * 0.62;
        var col = i % 7 === 0 ? "#ffb23e" : i % 5 === 0 ? "#ff5c6c" : "#39c2ff";
        var d = document.createElement("div");
        d.className = "dot";
        d.style.left = cx + "px";
        d.style.top = cy + "px";
        d.style.background = col;
        d.style.boxShadow = "0 0 10px " + col;
        field.appendChild(d);
      }
    }
  }
  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
