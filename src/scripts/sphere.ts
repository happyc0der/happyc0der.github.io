// The hero's sphere: one point per commit of the last year (data-points, read from content/stats/commits.json
// at build time) spread evenly on a Fibonacci sphere. It turns slowly and leans toward the mouse; points on
// the far side are smaller and fainter. It draws only while on screen and the tab is visible, and under
// reduced motion it draws one still frame.
const canvas = document.querySelector<HTMLCanvasElement>('[data-sphere]');
if (canvas) sphere(canvas);

function sphere(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = Math.max(200, Math.min(5000, Number(canvas.dataset.points) || 1200));

  // Even spacing: each point a golden angle further round than the last, from pole to pole.
  const pts = new Float32Array(N * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), a = golden * i;
    pts[i * 3] = Math.cos(a) * r;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = Math.sin(a) * r;
  }

  // Depth in ten steps, back to front: deep purple and nearly clear, to lavender and nearly solid.
  const STEPS = 10;
  const back = [109, 40, 217], front = [196, 181, 253];
  const fills = Array.from({ length: STEPS }, (_, s) => {
    const t = s / (STEPS - 1);
    const c = back.map((b, k) => Math.round(b + (front[k] - b) * t));
    return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(0.1 + 0.85 * t * t).toFixed(3)})`;
  });
  const xs = new Float32Array(N), ys = new Float32Array(N), step = new Uint8Array(N);

  let w = 0, h = 0, cx = 0, cy = 0, R = 0;
  const resize = () => {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    w = box.width; h = box.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Wide screens: to the right of the name. Phones: up and to the right, behind it.
    const narrow = w < 720;
    R = narrow ? Math.min(w * 0.56, h * 0.3) : Math.min(w * 0.27, h * 0.4);
    cx = narrow ? w * 0.66 : w * 0.71;
    cy = narrow ? h * 0.36 : h * 0.47;
    draw(last);
  };

  // Lean toward the mouse, eased so it drifts rather than snaps.
  let leanX = 0, leanY = 0, tiltX = 0.38, tiltY = 0;
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    leanX = (e.clientY / innerHeight - 0.5) * 0.55;
    leanY = (e.clientX / innerWidth - 0.5) * 0.9;
  }, { passive: true });

  let last = 0;
  function draw(t: number) {
    last = t;
    tiltX += (0.38 + leanX - tiltX) * 0.04;
    tiltY += (leanY - tiltY) * 0.04;
    const spin = t * 0.00011 + tiltY;
    const cs = Math.cos(spin), sn = Math.sin(spin), ct = Math.cos(tiltX), st = Math.sin(tiltX);
    for (let i = 0; i < N; i++) {
      const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
      const x1 = x * cs - z * sn, z1 = x * sn + z * cs;
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;   // z2: -1 far side, +1 facing us
      const s = 1 + z2 * 0.16;
      xs[i] = cx + x1 * R * s;
      ys[i] = cy + y2 * R * s;
      step[i] = Math.min(STEPS - 1, Math.floor(((z2 + 1) / 2) * STEPS));
    }
    ctx!.clearRect(0, 0, w, h);
    for (let s = 0; s < STEPS; s++) {
      const size = 0.9 + (s / (STEPS - 1)) * 1.7;
      ctx!.fillStyle = fills[s];
      ctx!.beginPath();
      for (let i = 0; i < N; i++) if (step[i] === s) ctx!.rect(xs[i] - size / 2, ys[i] - size / 2, size, size);
      ctx!.fill();
    }
  }

  new ResizeObserver(resize).observe(canvas);
  if (still) return;

  let visible = true, raf = 0;
  const loop = (t: number) => { draw(t); raf = requestAnimationFrame(loop); };
  const run = () => {
    cancelAnimationFrame(raf);
    if (visible && !document.hidden) raf = requestAnimationFrame(loop);
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); }).observe(canvas);
  document.addEventListener('visibilitychange', run);
}
