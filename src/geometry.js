// Motif library. Everything is authored inside the fundamental half wedge, the
// angular range [0, alpha] with alpha = PI / N. The renderer completes the
// figure with N rotations and a mirror, so every stroke is drawn 2N times.
//
// A stroke is { pts: [[x, y], ...], w: widthMultiplier, weight: brightness }.
// Strokes that lie on a mirror line are drawn twice by the symmetry group, so
// they carry weight 0.5 to stay at unit brightness.

const TAU = Math.PI * 2;
const STEP = 0.005;

const P = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

function stroke(pts, w = 1, weight = 1) {
  return { pts, w, weight };
}

function arcPts(r, a0, a1, step = STEP) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(P(r, a0 + ((a1 - a0) * i) / n));
  return pts;
}

function linePts(a, b, step = STEP * 2) {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return pts;
}

// place local points (base at origin, axis along +x) at radius rb, angle phi
function place(local, rb, phi, flip = false) {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const [bx, by] = P(rb, phi);
  return local.map(([x, y]) => {
    const yy = flip ? -y : y;
    return [bx + c * x - s * yy, by + s * x + c * yy];
  });
}

export function circleLoop(cx, cy, rho, n = 28) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    pts.push([cx + rho * Math.cos(a), cy + rho * Math.sin(a)]);
  }
  return pts;
}

// ---- frames -------------------------------------------------------------

export function ring(ctx, r, { w = 1, flip = false } = {}) {
  const pts = arcPts(r, 0, ctx.alpha);
  return [stroke(flip ? pts.reverse() : pts, w)];
}

export function ticks(ctx, r, len, m, { w = 0.7, inward = false } = {}) {
  const out = [];
  for (let i = 0; i < m; i++) {
    const a = ((i + 0.5) / m) * ctx.alpha;
    const r1 = inward ? r - len : r + len;
    out.push(stroke(linePts(P(r, a), P(r1, a)), w));
  }
  return out;
}

export function radial(ctx, r0, r1, onBoundary = false, w = 0.8) {
  const a = onBoundary ? ctx.alpha : 0;
  return [stroke(linePts(P(r0, a), P(r1, a)), w, 0.5)];
}

// ---- petals -------------------------------------------------------------

function petalHalf(len, w, n = 30, sharp = 0.85, bulge = 0.72) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    pts.push([len * s, w * Math.pow(Math.sin(Math.PI * Math.pow(s, bulge)), sharp)]);
  }
  return pts;
}

function petalStrokes(mode, rb, phi, len, w, opts, out, ctxAlpha) {
  const half = petalHalf(len, w, 30, opts.sharp, opts.bulge);
  if (mode === 'full') {
    const up = half;
    const down = half.map(([x, y]) => [x, -y]).reverse();
    const loop = up.concat(down.slice(1));
    out.push(stroke(place(loop, rb, phi), opts.w));
  } else {
    out.push(stroke(place(half, rb, phi, mode === 'down'), opts.w));
  }
}

// A ring of lotus petals. m petals across the half wedge. Draws optional
// inset outlines, a vein and a jewel at the tip.
export function petals(ctx, rb, len, m, { fat = 0.9, insets = 2, vein = true, jewel = true, offset = false, sharp = 0.85, bulge = 0.72, w = 1 } = {}) {
  const out = [];
  const delta = ctx.alpha / m;
  const wmax = 0.5 * (rb + 0.4 * len) * delta * fat;
  const opts = { sharp, bulge, w };
  const centers = [];
  if (offset) for (let j = 0; j < m; j++) centers.push({ phi: (j + 0.5) * delta, mode: 'full' });
  else {
    centers.push({ phi: 0, mode: 'up' });
    for (let j = 1; j < m; j++) centers.push({ phi: j * delta, mode: 'full' });
    centers.push({ phi: ctx.alpha, mode: 'down' });
  }
  for (const { phi, mode } of centers) {
    petalStrokes(mode, rb, phi, len, wmax, opts, out);
    for (let k = 1; k <= insets; k++) {
      const rbk = rb + len * 0.09 * k;
      petalStrokes(mode, rbk, phi, len * (1 - 0.2 * k), wmax * (1 - 0.3 * k), { ...opts, w: w * 0.75 }, out);
    }
    if (vein) {
      const on = mode !== 'full';
      const a = place([[len * 0.16, 0], [len * 0.62, 0]], rb, phi);
      out.push(stroke(linePts(a[0], a[1]), 0.7 * w, on ? 0.5 : 1));
    }
    if (jewel) {
      const jr = wmax * 0.13;
      const c = place([[len * 0.8, 0]], rb, phi)[0];
      if (mode === 'full') out.push(stroke(circleLoop(c[0], c[1], jr, 20), 0.8 * w));
      else {
        const half = [];
        const a0 = Math.atan2(c[1], c[0]);
        for (let i = 0; i <= 12; i++) {
          const t = (i / 12) * Math.PI;
          const lx = jr * Math.cos(t);
          const ly = jr * Math.sin(t) * (mode === 'down' ? -1 : 1);
          const cc = Math.cos(phi);
          const ss = Math.sin(phi);
          half.push([c[0] + cc * lx - ss * ly, c[1] + ss * lx + cc * ly]);
        }
        out.push(stroke(half, 0.8 * w));
      }
    }
  }
  return out;
}

// Long narrow spikes, like vajra points.
export function spikes(ctx, rb, len, m, { fat = 0.35, w = 1 } = {}) {
  return petals(ctx, rb, len, m, { fat, insets: 1, vein: false, jewel: true, sharp: 1.0, bulge: 0.55, w });
}

// ---- flames -------------------------------------------------------------

export function flames(ctx, rb, len, m, { lean = 0.35, fat = 0.7, w = 1 } = {}) {
  const out = [];
  const delta = ctx.alpha / m;
  const wmax = 0.5 * (rb + 0.3 * len) * delta * fat;
  const n = 44;
  const centre = (s) => lean * wmax * 2.6 * s * s * Math.sin(s * 3.4);
  const half = (s) => wmax * Math.pow(1 - s, 1.15) * (0.3 + 0.7 * Math.sin((Math.PI / 2) * Math.min(1, s / 0.3)));
  for (let j = 0; j < m; j++) {
    const phi = (j + 0.5) * delta;
    const up = [];
    const down = [];
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      up.push([len * s, centre(s) + half(s)]);
      down.push([len * s, centre(s) - half(s)]);
    }
    out.push(stroke(place(up.concat(down.reverse().slice(1)), rb, phi), w));
    // an inner tongue and a spine
    const inner = [];
    for (let i = 0; i <= n; i++) {
      const s = 0.06 + 0.7 * (i / n);
      inner.push([len * s, centre(s) + half(s) * 0.45 * Math.sin(Math.PI * (i / n))]);
    }
    out.push(stroke(place(inner, rb, phi), 0.7 * w));
    const spine = [];
    for (let i = 0; i <= n; i++) {
      const s = 0.1 + 0.6 * (i / n);
      spine.push([len * s, centre(s)]);
    }
    out.push(stroke(place(spine, rb, phi), 0.6 * w));
  }
  return out;
}

// ---- waves and chains ---------------------------------------------------

export function wave(ctx, r, amp, m, { phase = 0, w = 1 } = {}) {
  const k = ctx.N * m;
  const n = Math.ceil((ctx.alpha * r) / 0.0035);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * ctx.alpha;
    pts.push(P(r + amp * Math.cos(k * a + phase), a));
  }
  return [stroke(pts, w)];
}

export function guilloche(ctx, r, amp, m, { w = 1, jewels = true } = {}) {
  const out = wave(ctx, r, amp, m, { phase: 0, w }).concat(wave(ctx, r, amp, m, { phase: Math.PI, w }));
  if (jewels) {
    for (let j = 0; j < m; j++) {
      const a = ((j + 0.5) / m) * ctx.alpha;
      const c = P(r, a);
      out.push(stroke(circleLoop(c[0], c[1], amp * 0.28, 20), 0.7 * w));
    }
    // the crossings at the axis and boundary get half jewels through the loops above
  }
  return out;
}

export function scallops(ctx, r, bulge, m, { w = 1, inward = false } = {}) {
  const out = [];
  const d = ctx.alpha / m;
  const sign = inward ? -1 : 1;
  for (let i = 0; i < m; i++) {
    const n = 26;
    const pts = [];
    for (let j = 0; j <= n; j++) {
      const s = j / n;
      const rr = r + sign * bulge * Math.pow(Math.sin(Math.PI * s), 0.75);
      pts.push(P(rr, (i + s) * d));
    }
    out.push(stroke(pts, w));
  }
  return out;
}

// ---- beads --------------------------------------------------------------

export function beads(ctx, r, rho, m, { w = 0.9, inner = true, double = false } = {}) {
  const out = [];
  for (let i = 0; i < m; i++) {
    const a = ((i + 0.5) / m) * ctx.alpha;
    const c = P(r, a);
    out.push(stroke(circleLoop(c[0], c[1], rho, 22), w));
    if (inner) out.push(stroke(circleLoop(c[0], c[1], rho * 0.5, 16), w * 0.8));
    if (double) out.push(stroke(circleLoop(c[0], c[1], rho * 1.5, 26), w * 0.6));
  }
  return out;
}

// beads that sit on the mirror lines, drawn as half circles
export function axisBeads(ctx, r, rho, { w = 0.9 } = {}) {
  const half = (cx, cy, dir) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = (i / 16) * Math.PI;
      pts.push([cx + rho * Math.cos(t), cy + dir * rho * Math.sin(t)]);
    }
    return pts;
  };
  const out = [stroke(half(r, 0, 1), w)];
  const c = P(r, ctx.alpha);
  const cc = Math.cos(ctx.alpha);
  const ss = Math.sin(ctx.alpha);
  const bpts = half(0, 0, -1).map(([x, y]) => [c[0] + cc * x - ss * y, c[1] + ss * x + cc * y]);
  out.push(stroke(bpts, w));
  return out;
}

// ---- star and lattice ---------------------------------------------------

// chord star: connects points on a ring that are k steps apart
export function star(ctx, r, k, { w = 0.9, double = 0.012 } = {}) {
  const a = P(r, 0);
  const b = P(r, (TAU * k) / ctx.N);
  const out = [stroke(linePts(a, b), w, 0.5)];
  if (double > 0) {
    const f = 1 - double / r;
    out.push(stroke(linePts([a[0] * f, a[1] * f], [b[0] * f, b[1] * f]), w * 0.6, 0.5));
  }
  return out;
}

// a polar grid: radial lines and cross arcs with beads at the crossings
export function lattice(ctx, r0, r1, m, levels, { w = 0.8, rho = 0.004 } = {}) {
  const out = [];
  for (let i = 1; i < m; i++) {
    const a = (i / m) * ctx.alpha;
    out.push(stroke(linePts(P(r0, a), P(r1, a)), w * 0.8));
  }
  for (let l = 0; l <= levels; l++) {
    const r = r0 + ((r1 - r0) * l) / levels;
    if (l > 0 && l < levels) out.push(stroke(arcPts(r, 0, ctx.alpha), w * 0.8));
    for (let i = 1; i < m; i++) {
      const a = (i / m) * ctx.alpha;
      const c = P(r, a);
      out.push(stroke(circleLoop(c[0], c[1], rho, 14), 0.6 * w));
    }
  }
  return out;
}

// ---- center -------------------------------------------------------------

export function bindu(ctx, palette) {
  const out = [];
  const half = (rho, w) => {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = (i / 14) * Math.PI;
      pts.push([rho * Math.cos(t), rho * Math.sin(t)]);
    }
    return stroke(pts, w);
  };
  out.push(half(0.004, 1.6));
  out.push(half(0.009, 1.2));
  out.push(half(0.015, 0.9));
  return out;
}

// ---- palace (four fold, domain [0, PI/4]) --------------------------------

export function poly(verts, step = STEP * 2) {
  const pts = [];
  for (let i = 0; i < verts.length - 1; i++) {
    const seg = linePts(verts[i], verts[i + 1], step);
    if (i > 0) seg.shift();
    pts.push(...seg);
  }
  return pts;
}

// One wall of the palace from the gate axis around to the corner diagonal.
// s is the half side, p how far the gate projects, g the doorway half width,
// gc the half width of the gate's cap.
export function palaceWall(s, p, g, gc, w = 1) {
  return stroke(poly([[s + p, 0], [s + p, gc], [s + p * 0.5, gc], [s + p * 0.5, g], [s, g], [s, s]]), w);
}

// a square outline of half side c, authored as one stroke from axis to diagonal
export function squareLine(c, w = 1) {
  return stroke(poly([[c, 0], [c, c]]), w);
}

// half circle centered at (cx, cy) on one side of a line through the center at dirAngle
export function halfCircle(cx, cy, rho, dirAngle, side = 1, w = 1) {
  const pts = [];
  const co = Math.cos(dirAngle);
  const si = Math.sin(dirAngle);
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * Math.PI;
    const lx = rho * Math.cos(t);
    const ly = side * rho * Math.sin(t);
    pts.push([cx + co * lx - si * ly, cy + si * lx + co * ly]);
  }
  return stroke(pts, w);
}

export function line(a, b, w = 1, weight = 1) {
  return stroke(linePts(a, b), w, weight);
}

export { P as polar };

// A petal on the x axis whose base sits at x = xb and whose tip points back
// toward the center. Half outline only; the mirror completes it.
export function inwardPetal(xb, len, w, { insets = 1, lineW = 1 } = {}) {
  const out = [];
  const shape = (l, ww, base) => {
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const s = i / 30;
      pts.push([base - l * s, ww * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.72)), 0.85)]);
    }
    return stroke(pts, lineW);
  };
  out.push(shape(len, w, xb));
  for (let k = 1; k <= insets; k++) out.push(shape(len * (1 - 0.22 * k), w * (1 - 0.3 * k), xb - len * 0.09 * k));
  out.push(stroke(linePts([xb - len * 0.16, 0], [xb - len * 0.6, 0]), 0.7 * lineW, 0.5));
  return out;
}

// arc between two angles at radius r, authored inside the fourfold domain
export function arcBetween(r, a0, a1, w = 1) {
  return stroke(arcPts(r, a0, a1), w);
}

export function dentils(c, y0, y1, step, len, w = 0.6) {
  const out = [];
  for (let y = y0; y <= y1 + 1e-6; y += step) out.push(stroke(linePts([c, y], [c + len, y]), w));
  return out;
}
