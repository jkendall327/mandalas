import { Rng } from './rng.js';
import * as G from './geometry.js';
import { STYLES } from './styles.js';

export const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  const lin = (c) => Math.pow(c / 255, 2.2);
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
};

const LOTUS_TYPES = ['lotus', 'guilloche', 'scallops', 'beads', 'lattice', 'star', 'spikes', 'flames'];
const WEIGHTS = { lotus: 3, guilloche: 2, scallops: 2, beads: 1.6, lattice: 1.5, star: 1.6, spikes: 1.6, flames: 1.2 };
const THICK = { lotus: [0.07, 0.14], spikes: [0.05, 0.1], flames: [0.06, 0.11], guilloche: [0.03, 0.055], scallops: [0.03, 0.055], beads: [0.02, 0.032], star: [0.03, 0.2], lattice: [0.05, 0.09] };
const HEAVY = new Set(['lotus', 'spikes', 'flames', 'star', 'lattice']);

function pickType(rng, prev, heavyRun) {
  const opts = LOTUS_TYPES.filter((t) => t !== prev && !(heavyRun >= 2 && HEAVY.has(t)));
  const total = opts.reduce((s, t) => s + WEIGHTS[t], 0);
  let x = rng.next() * total;
  for (const t of opts) {
    x -= WEIGHTS[t];
    if (x <= 0) return t;
  }
  return opts[0];
}

function strokeLen(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

// Each builder returns [{ s: stroke, role }] in drawing order.
function tag(strokes, role, sym = 'n') {
  return strokes.map((s) => ({ s, role, sym }));
}

function buildBand(type, ctx, rng, r0, r1, rim = false) {
  const th = r1 - r0;
  const out = [];
  const N = ctx.N;
  out.push(...tag(G.ring(ctx, r1, { w: 1.3, flip: rng.chance(0.5) }), 'frame'));
  switch (type) {
    case 'lotus': {
      const m = th > 0.1 && r0 > 0.15 ? rng.pick([1, 2]) : 1;
      out.push(...tag(G.petals(ctx, r0 + 0.004, th * 0.96, m, { offset: true, insets: 1, vein: false, jewel: false, fat: 0.96 }), 'accent'));
      out.push(...tag(G.petals(ctx, r0 + 0.004, th * 0.7, m, { insets: 2, vein: true, jewel: true, fat: 0.92 }), 'main'));
      break;
    }
    case 'spikes': {
      const m = rng.pick([1, 2]);
      out.push(...tag(G.spikes(ctx, r0 + 0.004, th * 0.95, m, { fat: 0.3 }), 'main'));
      out.push(...tag(G.beads(ctx, r0 + th * 0.3, 0.0045, m, { inner: false }), 'fine'));
      break;
    }
    case 'flames': {
      const m = rim ? 3 : rng.pick([1, 2]);
      out.push(...tag(G.flames(ctx, r0 + 0.004, th * 0.95, m, { lean: rng.range(0.15, 0.5) }), 'main'));
      break;
    }
    case 'guilloche': {
      const m = rng.pick([1, 2, 3]);
      out.push(...tag(G.ring(ctx, r0, { w: 1.0 }), 'frame'));
      out.push(...tag(G.guilloche(ctx, r0 + th / 2, th * 0.3, m, {}), 'main'));
      break;
    }
    case 'scallops': {
      const m = rng.pick([2, 3, 4]);
      out.push(...tag(G.ring(ctx, r0, { w: 1.0 }), 'frame'));
      out.push(...tag(G.scallops(ctx, r0, th * 0.95, m, {}), 'main'));
      out.push(...tag(G.scallops(ctx, r1, th * 0.95, m, { inward: true }), 'accent'));
      break;
    }
    case 'beads': {
      const m = rng.pick([3, 4, 5, 6]);
      const rho = Math.min(th * 0.34, (((r0 + r1) / 2) * ctx.alpha) / (2 * m) * 0.85);
      out.push(...tag(G.ring(ctx, r0, { w: 1.0 }), 'frame'));
      out.push(...tag(G.beads(ctx, (r0 + r1) / 2, rho, m, { inner: true }), 'main'));
      break;
    }
    case 'lattice': {
      const m = rng.pick([3, 4, 5]);
      out.push(...tag(G.ring(ctx, r0, { w: 1.0 }), 'frame'));
      out.push(...tag(G.lattice(ctx, r0, r1, m, rng.pick([2, 3]), {}), 'main'));
      break;
    }
    case 'star': {
      const k = ctx.starK;
      out.push(...tag(G.ring(ctx, r0, { w: 1.0 }), 'frame'));
      out.push(...tag(G.star(ctx, r1, k, { w: 1.0, double: 0.01 }), 'main'));
      // small jewels at the star points
      out.push(...tag(G.axisBeads(ctx, r1 - 0.012, 0.006), 'fine'));
      break;
    }
  }
  out.push(...tag(G.ticks(ctx, r1, 0.008, rng.pick([3, 4, 6]) * 1, { inward: true }), 'fine'));
  return out;
}

// The traditional square palace with four gates. Walls, gates and the nested
// squares have fourfold symmetry (sym 'q'), the two circles are ordinary.
function buildPalace(ctx, rng, rc, Rp) {
  const out = [];
  const s0 = (Rp / Math.SQRT2) * 0.985;
  const D = Math.PI / 4;
  out.push(...tag(G.ring(ctx, Rp, { w: 1.4 }), 'frame'));
  out.push(...tag(G.ring(ctx, rc, { w: 1.2 }), 'frame'));
  // axes and diagonals
  out.push(...tag([G.line(G.polar(rc, D), G.polar(s0 * Math.SQRT2 - 0.004, D), 0.8, 0.5)], 'frame', 'q'));
  out.push(...tag([G.line([rc, 0], [s0, 0], 0.8, 0.5)], 'frame', 'q'));
  // nested squares between the inner circle and the wall
  const roles = ['accent', 'fine', 'main', 'fine'];
  let i = 0;
  for (let c = rc + 0.016; c < s0 - 0.055; c += 0.021) {
    out.push(...tag([G.squareLine(c, i % 2 ? 0.7 : 0.9)], roles[i % roles.length], 'q'));
    i++;
  }
  // three walls, each with its gates
  const p = 0.07;
  const walls = [
    { d: 0, role: 'main', w: 1.3 },
    { d: 0.017, role: 'accent', w: 1.0 },
    { d: 0.032, role: 'frame', w: 0.8 },
  ];
  for (const { d, role, w } of walls) {
    out.push(...tag([G.palaceWall(s0 - d, p - d * 0.6, 0.026 - d * 0.2, 0.05 - d * 0.35, w)], role, 'q'));
  }
  // jewels on the gates and at the corners
  out.push(...tag([G.halfCircle(s0 + p * 0.76, 0, 0.02, 0, 1, 0.8)], 'fine', 'q'));
  out.push(...tag([G.halfCircle(s0 + p * 0.76, 0, 0.009, 0, 1, 0.8)], 'fine', 'q'));
  const cd = s0 - 0.034;
  out.push(...tag([G.halfCircle(cd, cd, 0.013, D, -1, 0.8)], 'fine', 'q'));
  out.push(...tag([G.halfCircle(cd, cd, 0.006, D, -1, 0.8)], 'fine', 'q'));
  // the circular segments between the walls and the outer circle: a fan of
  // arcs, beads and a lotus petal reaching toward each gate
  const rad = (d) => (d * Math.PI) / 180;
  out.push(...tag([G.arcBetween(Rp - 0.012, rad(9), rad(37), 0.8)], 'accent', 'q'));
  out.push(...tag([G.arcBetween(Rp - 0.05, rad(13), rad(33), 0.7)], 'frame', 'q'));
  for (const deg of [16, 23, 30]) {
    const c = G.polar(Rp - 0.031, rad(deg));
    out.push(...tag([{ pts: G.circleLoop(c[0], c[1], 0.0055, 16), w: 0.8, weight: 1 }], 'fine', 'q'));
  }
  out.push(...tag(G.inwardPetal(Rp - 0.006, 0.062, 0.02, { insets: 1, lineW: 0.9 }), 'main', 'q'));
  // beaded corners and dentils on the nested squares
  i = 0;
  for (let c = rc + 0.016; c < s0 - 0.055; c += 0.021) {
    if (i % 2 === 0) out.push(...tag([G.halfCircle(c, c, 0.0042, D, -1, 0.7)], 'fine', 'q'));
    if (i === 1) out.push(...tag(G.dentils(c, 0.03, c - 0.03, 0.014, 0.008), 'fine', 'q'));
    i++;
  }
  // small rosettes tucked beside each gate
  out.push(...tag([{ pts: G.circleLoop(s0 - 0.052, 0.09, 0.008, 18), w: 0.7, weight: 1 }], 'fine', 'q'));
  return out;
}

// grow rings outward from r until the limit, appending to bands
function fillBands(bands, rng, ctx, r, stop, cap, state) {
  while (r < stop) {
    let type = state.first ? 'lotus' : pickType(rng, state.prev, state.heavyRun);
    let [a, b] = THICK[type];
    let th = rng.range(a, b);
    if (state.first) th = rng.range(0.09, 0.12);
    state.first = false;
    let starK = 1;
    if (type === 'star') {
      const ks = [];
      for (let k = 1; k <= Math.floor((ctx.N - 1) / 2); k++) {
        const rr = r / Math.cos((Math.PI * k) / ctx.N);
        if (rr < cap && rr - r >= 0.028 && rr - r <= 0.16) ks.push({ k, rr });
      }
      if (!ks.length) {
        type = 'guilloche';
        [a, b] = THICK[type];
        th = rng.range(a, b);
      } else {
        const pk = rng.pick(ks);
        starK = pk.k;
        th = pk.rr - r;
      }
    }
    let r1 = Math.min(r + th, cap);
    bands.push({ type, r0: r, r1, starK });
    state.heavyRun = HEAVY.has(type) ? state.heavyRun + 1 : 0;
    state.prev = type;
    r = r1 + 0.012;
  }
  return r;
}

export function generateScore(seed, { duration = 900, style = 'neon', form = 'auto' } = {}) {
  const st = STYLES[style] || STYLES.neon;
  const rng = new Rng(seed);
  let N = rng.pick([8, 8, 8, 8, 8, 12, 12, 16, 6]);
  const palace = form === 'palace' || (form === 'auto' && new Rng(seed + '-form').chance(0.55));
  if (palace && N % 4) N = 8;
  const ctx = { N, alpha: Math.PI / N };
  // palette comes from its own stream so a style change never moves the structure
  const prng = new Rng(seed + '-palette');
  const pal = prng.pick(st.palettes);
  // ink pigments are stored as the light they absorb
  const conv = (h) => (st.ink ? hex(h).map((v) => 1 - v) : hex(h));
  const mainCols = prng.shuffle(pal.main).map(conv);
  const fine = conv(pal.fine);
  const frame = conv(pal.frame);

  // --- layout of bands, center to rim
  const bands = [{ type: 'center', r0: 0, r1: 0.06 }];
  const RIM_START = 0.78;
  const state = { first: true, prev: 'center', heavyRun: 0 };
  let r = 0.072;
  if (palace) {
    const rc = rng.range(0.23, 0.27);
    fillBands(bands, rng, ctx, r, rc - 0.05, rc - 0.012, state);
    const Rp = 0.56;
    bands.push({ type: 'palace', r0: rc, r1: Rp, rc });
    state.prev = 'palace';
    state.heavyRun = 0;
    r = fillBands(bands, rng, ctx, Rp + 0.012, RIM_START - 0.05, RIM_START, state);
  } else {
    r = fillBands(bands, rng, ctx, r, RIM_START - 0.05, RIM_START, state);
  }
  // rim: flames, then a bead ring and outer circles
  bands.push({ type: 'flames', r0: r, r1: 0.9, rim: true });
  bands.push({ type: 'beads', r0: 0.91, r1: 0.94, rim: true });
  bands.push({ type: 'rimline', r0: 0.955, r1: 0.975, rim: true });

  // --- geometry per band
  const roleColors = (i) => {
    const m = mainCols[i % mainCols.length];
    const a = mainCols[(i + 1 + Math.floor(i / mainCols.length)) % mainCols.length];
    return { main: m, accent: a, fine, frame };
  };
  const items = [];
  bands.forEach((band, bi) => {
    let list;
    if (band.type === 'center') {
      list = [];
      list.push(...tag(G.ring(ctx, 0.004, { w: 1.6 }), 'fine'));
      list.push(...tag(G.ring(ctx, 0.011, { w: 1.2 }), 'main'));
      list.push(...tag(G.petals(ctx, 0.014, 0.038, 1, { insets: 1, vein: false, jewel: false, fat: 0.9, offset: true }), 'accent'));
      list.push(...tag(G.ring(ctx, 0.06, { w: 1.3 }), 'frame'));
    } else if (band.type === 'rimline') {
      list = [];
      list.push(...tag(G.ring(ctx, 0.955, { w: 1.0 }), 'frame'));
      list.push(...tag(G.ticks(ctx, 0.955, 0.012, 6, { inward: false }), 'fine'));
      list.push(...tag(G.ring(ctx, 0.975, { w: 1.5 }), 'frame'));
    } else if (band.type === 'palace') {
      list = buildPalace(ctx, rng, band.rc, band.r1);
    } else {
      ctx.starK = band.starK;
      list = buildBand(band.type, ctx, rng, band.r0, band.r1, !!band.rim);
    }
    const cols = roleColors(band.type === 'palace' ? 0 : bi);
    band.items = list.map(({ s, role, sym }) => ({ s, col: cols[role], role, sym, band: bi }));
    items.push(...band.items);
  });

  // --- timeline
  const TB = duration * 0.767;
  const tLead = 3;
  const LEN_SPEED = 0.03;
  let cursor = 0;
  const placed = [];
  const bandSpans = [];
  bands.forEach((band) => {
    const list = band.items;
    const lanes = Math.max(1, Math.min(6, Math.round(list.length / 9)));
    const laneT = new Array(lanes).fill(cursor);
    for (const it of list) {
      const len = strokeLen(it.s.pts);
      it.len = len;
      let li = 0;
      for (let k = 1; k < lanes; k++) if (laneT[k] < laneT[li]) li = k;
      const speed = LEN_SPEED * (it.role === 'frame' ? 1.6 : it.role === 'fine' ? 0.7 : 1);
      const dur = Math.max(1.8, len / speed);
      it.t0 = laneT[li] + 0.15;
      it.dur = dur;
      laneT[li] = it.t0 + dur;
      placed.push(it);
    }
    const end = Math.max(...laneT);
    bandSpans.push({ start: cursor, end });
    cursor = cursor + (end - cursor) * 0.88;
  });
  const rawEnd = Math.max(...placed.map((p) => p.t0 + p.dur));
  const k = (TB - tLead) / rawEnd;
  for (const it of placed) {
    it.t0 = tLead + it.t0 * k;
    it.dur = it.dur * k;
  }
  const bandInfo = bands.map((b, i) => ({
    type: b.type,
    r0: b.r0,
    r1: b.r1,
    tStart: tLead + bandSpans[i].start * k,
    tEnd: tLead + bandSpans[i].end * k,
  }));
  placed.sort((a, b) => a.t0 - b.t0);

  return {
    seed,
    N,
    ctx,
    style,
    st,
    form: palace ? 'palace' : 'circle',
    palette: style,
    duration,
    strokes: placed,
    bands: bandInfo,
    tBuildEnd: TB,
    tSweepStart: duration * 0.83,
    tSweepEnd: duration * 0.925,
    tFadeEnd: duration * 0.965,
    bg: hex(st.bg),
    paper: st.paper ? hex(st.paper) : [0, 0, 0],
  };
}

// ---- GPU packing --------------------------------------------------------

const FLOATS = 14;

function packGroup(strokes, lineW) {
  let nv = 0;
  let ni = 0;
  for (const s of strokes) {
    nv += s.s.pts.length * 2;
    ni += (s.s.pts.length - 1) * 6;
  }
  const verts = new Float32Array(nv * FLOATS);
  const idx = new Uint32Array(ni);
  const idxEnd = new Uint32Array(strokes.length);
  const t0s = new Float32Array(strokes.length);
  let vo = 0;
  let io = 0;
  let base = 0;
  strokes.forEach((st, si) => {
    const pts = st.s.pts;
    const n = pts.length;
    const arc = new Float32Array(n);
    for (let i = 1; i < n; i++) arc[i] = arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const total = arc[n - 1];
    const baseW = lineW * st.s.w;
    const col = st.col;
    const wt = st.s.weight;
    const segN = (a, b) => {
      const dx = pts[b][0] - pts[a][0];
      const dy = pts[b][1] - pts[a][1];
      const l = Math.hypot(dx, dy) || 1;
      return [-dy / l, dx / l];
    };
    for (let i = 0; i < n; i++) {
      let nx = 0;
      let ny = 0;
      let mx = 1;
      if (i === 0) [nx, ny] = segN(0, 1);
      else if (i === n - 1) [nx, ny] = segN(n - 2, n - 1);
      else {
        const a = segN(i - 1, i);
        const b = segN(i, i + 1);
        nx = a[0] + b[0];
        ny = a[1] + b[1];
        const l = Math.hypot(nx, ny) || 1;
        nx /= l;
        ny /= l;
        mx = 1 / Math.max(0.55, nx * a[0] + ny * a[1]);
      }
      for (const side of [-1, 1]) {
        const o = vo * FLOATS;
        verts[o] = pts[i][0];
        verts[o + 1] = pts[i][1];
        verts[o + 2] = nx * side * mx;
        verts[o + 3] = ny * side * mx;
        verts[o + 4] = side;
        verts[o + 5] = arc[i];
        verts[o + 6] = total;
        verts[o + 7] = st.t0;
        verts[o + 8] = st.dur;
        verts[o + 9] = baseW;
        verts[o + 10] = col[0] * wt;
        verts[o + 11] = col[1] * wt;
        verts[o + 12] = col[2] * wt;
        verts[o + 13] = wt;
        vo++;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      idx[io++] = a;
      idx[io++] = a + 1;
      idx[io++] = a + 2;
      idx[io++] = a + 1;
      idx[io++] = a + 3;
      idx[io++] = a + 2;
    }
    base += n * 2;
    idxEnd[si] = io;
    t0s[si] = st.t0;
  });
  return { verts, idx, idxEnd, t0s };
}

// Strokes are grouped by symmetry order: 'n' uses the mandala's own N, 'q' uses 4.
export function packScore(score, dustBudget = 56000) {
  const lineW = score.st.lineW;
  const orders = { n: score.N, q: 4 };
  const groups = [];
  for (const key of ['n', 'q']) {
    const list = score.strokes.filter((s) => s.sym === key);
    if (!list.length) continue;
    const g = packGroup(list, lineW);
    g.N = orders[key];
    g.list = list;
    g.length = list.reduce((a, s) => a + s.len * s.s.weight, 0);
    groups.push(g);
  }
  const denom = groups.reduce((a, g) => a + g.length * g.N * 2, 0);
  const rng = new Rng(score.seed + '-dust');
  for (const g of groups) {
    const count = Math.max(200, Math.round((dustBudget * g.length) / denom));
    const lens = g.list.map((s) => s.len * s.s.weight);
    const total = lens.reduce((a, b) => a + b, 0);
    const dust = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      let x = rng.next() * total;
      let si = 0;
      while (si < g.list.length - 1 && x > lens[si]) {
        x -= lens[si];
        si++;
      }
      const pts = g.list[si].s.pts;
      const p = pts[Math.min(pts.length - 1, Math.floor(rng.next() * pts.length))];
      const c = g.list[si].col;
      dust.set([p[0], p[1], c[0], c[1], c[2], rng.next()], i * 6);
    }
    g.dust = dust;
    g.dustCount = count;
    delete g.list;
  }
  return { groups, floats: FLOATS };
}

// number of indices to draw for a group at time t (strokes are sorted by t0)
export function indexCountAt(group, t) {
  const t0s = group.t0s;
  let lo = 0;
  let hi = t0s.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t0s[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? 0 : group.idxEnd[lo - 1];
}
