import { packScore, indexCountAt } from './score.js';

const STROKE_VS = `#version 300 es
precision highp float;
in vec2 aPos; in vec2 aNrm; in float aSide; in float aS; in float aLen;
in float aT0; in float aDur; in float aW; in vec3 aCol; in float aWeight;
uniform vec2 uScale; uniform float uN; uniform float uT;
out float vS; out float vLen; out float vT0; out float vDur; out float vD; out float vW;
out vec3 vCol; out vec2 vWorld; out float vWeight;
const float TAU = 6.28318530718;
void main() {
  int inst = gl_InstanceID;
  float k = float(inst >> 1);
  bool mir = (inst & 1) == 1;
  float ang = k * TAU / uN;
  float c = cos(ang), s = sin(ang);
  vec2 p = aPos, n = aNrm;
  if (mir) { p.y = -p.y; n.y = -n.y; }
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  n = vec2(c * n.x - s * n.y, s * n.x + c * n.y);
  float f = aLen > 0.0 ? aS / aLen : 0.0;
  float taper = 0.45 + 0.55 * pow(sin(3.14159265 * clamp(f, 0.0, 1.0)), 0.35);
  float w = aW * taper;
  float hw = w * 5.0;
  vec2 world = p + n * hw;
  gl_Position = vec4(world * uScale, 0.0, 1.0);
  vS = aS; vLen = aLen; vT0 = aT0; vDur = aDur; vD = aSide * hw; vW = w;
  vCol = aCol; vWorld = world; vWeight = aWeight;
}`;

const SWEEP_GLSL = `
uniform float uSweep; uniform float uNs;
const float DELTA = 0.35;
float sweepFront(vec2 p) {
  float th = atan(p.y, p.x);
  float g = fract(th * uNs / 6.28318530718);
  float uu = uSweep * (1.0 + DELTA) - DELTA * g;
  uu = clamp(uu, 0.0, 1.0);
  return 1.06 * (1.0 - uu);
}
`;

const STROKE_FS = `#version 300 es
precision highp float;
in float vS; in float vLen; in float vT0; in float vDur; in float vD; in float vW;
in vec3 vCol; in vec2 vWorld; in float vWeight;
uniform float uT; uniform float uPx; uniform float uLive; uniform float uGlow; uniform float uHeat; uniform float uTip; uniform float uGrain; uniform float uGrainSize;
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
${SWEEP_GLSL}
out vec4 outColor;
void main() {
  float prog = clamp((uT - vT0) / vDur, 0.0, 1.0);
  float sh = prog * vLen;
  if (vS > sh) discard;
  float d = abs(vD);
  float gr = 1.0;
  if (uGrain > 0.0) {
    vec2 cell = floor(gl_FragCoord.xy / uGrainSize);
    float g1 = hash21(cell);
    float g2 = hash21(cell + 17.3);
    d += (g1 - 0.5) * vW * uGrain * 1.6;
    gr = mix(1.0 - 0.55 * uGrain, 1.0 + 0.2 * uGrain, g2);
  }
  float aa = uPx;
  float core = 1.0 - smoothstep(vW * 0.5 - aa, vW * 0.5 + aa, d);
  float glow = uGlow * exp(-d * d / (2.0 * vW * vW * 2.2));
  float prof = (core + glow) * gr;
  float reached = vT0 + vDur * (vLen > 0.0 ? vS / vLen : 0.0);
  float age = max(uT - reached, 0.0);
  float heat = exp(-age / 4.0);
  float dh = sh - vS;
  float tipFade = exp(-max(uT - (vT0 + vDur), 0.0) / 1.2);
  float tip = exp(-dh * dh / (2.0 * 0.012 * 0.012)) * tipFade;
  vec3 col = vCol * (1.0 + uHeat * heat) + vec3(1.0, 0.92, 0.78) * tip * uTip * vWeight;
  float r = length(vWorld);
  // slow light that travels outward once the drawing has settled
  float breath = 1.0 + uLive * 0.16 * sin(6.28318530718 * (uT * 0.045 - r * 1.6));
  float a = 1.0;
  if (uSweep > 0.0) {
    float f = sweepFront(vWorld);
    a = 1.0 - smoothstep(f - 0.012, f + 0.004, r);
  }
  outColor = vec4(col * prof * breath * a, 1.0);
}`;

const DUST_VS = `#version 300 es
precision highp float;
in vec2 aO; in vec3 aCol; in float aRnd;
uniform vec2 uScale; uniform float uN; uniform float uFade; uniform float uDrift; uniform float uPx;
out vec3 vCol; out float vA;
${SWEEP_GLSL}
const float TAU = 6.28318530718;
float hash(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
void main() {
  int inst = gl_InstanceID;
  float k = float(inst >> 1);
  bool mir = (inst & 1) == 1;
  float ang = k * TAU / uN;
  vec2 o = aO;
  if (mir) o.y = -o.y;
  float c = cos(ang), s = sin(ang);
  vec2 p0 = vec2(c * o.x - s * o.y, s * o.x + c * o.y);
  float r0 = length(p0);
  float th0 = atan(p0.y, p0.x);
  float g = fract(th0 * uNs / TAU);
  float uNeed = (1.0 - r0 / 1.06 + DELTA * g) / (1.0 + DELTA);
  float since = uSweep - uNeed;
  float rnd = hash(aRnd * 17.0 + float(inst));
  float rnd2 = hash(aRnd * 31.0 + float(inst) * 1.7);
  vA = 0.0;
  vec2 pos = p0;
  if (since > 0.0) {
    float rf = sweepFront(p0);
    float lag = rnd * rnd * 0.09 * (0.4 + rf);
    float pile = 0.008 + 0.07 * rnd2;
    float r = max(rf + lag, pile * (0.6 + 0.4 * (1.0 - uFade)));
    r = min(r, r0);
    float swirl = (r0 - r) * 0.7 + (rnd - 0.5) * 0.05;
    float th = th0 + swirl;
    pos = r * vec2(cos(th), sin(th));
    pos += vec2(1.0, 0.25) * uDrift * (0.3 + rnd) * 0.5;
    vA = smoothstep(0.0, 0.02, since) * (1.0 - uFade);
  }
  vCol = mix(aCol, vec3(dot(aCol, vec3(0.34))), 0.65) * 0.8;
  gl_Position = vec4(pos * uScale, 0.0, 1.0);
  gl_PointSize = max(1.0, 2.6 * uPx);
}`;

const DUST_FS = `#version 300 es
precision highp float;
in vec3 vCol; in float vA;
uniform float uDustGain;
out vec4 outColor;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float a = smoothstep(0.5, 0.0, d) * vA;
  outColor = vec4(vCol * a * uDustGain, 1.0);
}`;

const FS_QUAD_VS = `#version 300 es
in vec2 aP; out vec2 vUv;
void main() { vUv = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir; out vec4 outColor;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.2270270270;
  c += texture(uTex, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uTex, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  outColor = vec4(c, 1.0);
}`;

const DOWN_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; out vec4 outColor;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture(uTex, vUv + uTexel * vec2(0.5, -0.5)).rgb
         + texture(uTex, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture(uTex, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  outColor = vec4(c * 0.25, 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene; uniform sampler2D uB1; uniform sampler2D uB2; uniform sampler2D uB3; uniform sampler2D uB4;
uniform vec3 uBg; uniform vec3 uPaper; uniform float uInk; uniform float uAbsorb; uniform float uGrainBg; uniform vec4 uBloom; uniform float uExposure; uniform float uBgLift; uniform vec2 uRes; uniform float uFrame; uniform float uS; uniform float uFadeIn;
out vec4 outColor;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 col = texture(uScene, vUv).rgb;
  vec3 bloom = uBloom.x * texture(uB1, vUv).rgb + uBloom.y * texture(uB2, vUv).rgb + uBloom.z * texture(uB3, vUv).rgb + uBloom.w * texture(uB4, vUv).rgb;
  vec2 q = (vUv - 0.5) * uRes / uS;
  float r = length(q);
  if (uInk > 0.5) {
    vec2 pp = gl_FragCoord.xy / (uS / 45.0);
    float n1 = vnoise(pp), n2 = vnoise(pp * 3.1 + 7.0), n3 = vnoise(pp * 9.0 + 3.0);
    float mott = 0.85 + 0.3 * (0.5 * n1 + 0.3 * n2 + 0.2 * n3);
    vec3 A = (col + bloom) * uAbsorb * mott;
    float fibre = (hash12(floor(gl_FragCoord.xy / max(1.0, uS / 700.0))) - 0.5) * 0.05 + (n1 - 0.5) * 0.05 + (n3 - 0.5) * 0.03;
    vec3 paper = uPaper * (1.0 + 0.05 * exp(-r * r * 2.0)) * (1.0 - 0.32 * smoothstep(0.55, 1.6, r)) * (1.0 + fibre);
    col = paper * exp(-A);
  } else {
    col += bloom;
    vec3 bg = uBg * (1.0 + uBgLift * exp(-r * r * 1.6)) * (1.0 - 0.55 * smoothstep(0.4, 1.6, r));
    if (uGrainBg > 0.0) bg *= 1.0 + (hash12(floor(gl_FragCoord.xy / max(1.0, uS / 500.0))) - 0.5) * 0.7 * uGrainBg + (vnoise(gl_FragCoord.xy / (uS / 30.0)) - 0.5) * 0.5 * uGrainBg;
    col += bg;
    col = 1.0 - exp(-col * uExposure);
  }
  col = pow(col, vec3(1.0 / 2.2));
  float n = hash12(gl_FragCoord.xy + uFrame * 1.37) + hash12(gl_FragCoord.xy * 1.7 + uFrame * 0.71) - 1.0;
  col += n / 255.0;
  col *= uFadeIn;
  outColor = vec4(col, 1.0);
}`;

const BLEND_FS = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uA; uniform sampler2D uB; uniform float uMix; out vec4 outColor;
void main() { outColor = vec4(mix(texture(uA, vUv).rgb, texture(uB, vUv).rgb, uMix), 1.0); }`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    this.internal = this.hdr ? gl.RGBA16F : gl.RGBA8;
    this.type = this.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    this.progStroke = program(gl, STROKE_VS, STROKE_FS);
    this.progDust = program(gl, DUST_VS, DUST_FS);
    this.progBlur = program(gl, FS_QUAD_VS, BLUR_FS);
    this.progDown = program(gl, FS_QUAD_VS, DOWN_FS);
    this.progComp = program(gl, FS_QUAD_VS, COMPOSITE_FS);
    this.progBlend = program(gl, FS_QUAD_VS, BLEND_FS);
    this.quad = gl.createVertexArray();
    gl.bindVertexArray(this.quad);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.targets = null;
    this.size = [0, 0];
    this.frameNo = 0;
  }

  makeTarget(w, h, ldr = false) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, ldr ? gl.RGBA8 : this.internal, w, h, 0, gl.RGBA, ldr ? gl.UNSIGNED_BYTE : this.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }

  resize(w, h) {
    const gl = this.gl;
    if (this.size[0] === w && this.size[1] === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.size = [w, h];
    if (this.targets) {
      for (const t of [this.targets.scene, this.targets.ta, this.targets.tb, ...this.targets.a, ...this.targets.b]) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fb);
      }
    }
    const scene = this.makeTarget(w, h);
    const a = [];
    const b = [];
    for (let i = 1; i <= 4; i++) {
      const lw = Math.max(2, w >> i);
      const lh = Math.max(2, h >> i);
      a.push(this.makeTarget(lw, lh));
      b.push(this.makeTarget(lw, lh));
    }
    this.targets = { scene, a, b, ta: this.makeTarget(w, h, true), tb: this.makeTarget(w, h, true) };
  }

  disposeScene(scene) {
    const gl = this.gl;
    for (const g of scene?.pack.groups || []) {
      gl.deleteVertexArray(g.strokeVao);
      gl.deleteVertexArray(g.dustVao);
      for (const b of g.buffers) gl.deleteBuffer(b);
    }
  }

  buildScene(score) {
    const gl = this.gl;
    const pack = packScore(score);
    const F = pack.floats * 4;
    const layout = [['aPos', 2, 0], ['aNrm', 2, 2], ['aSide', 1, 4], ['aS', 1, 5], ['aLen', 1, 6], ['aT0', 1, 7], ['aDur', 1, 8], ['aW', 1, 9], ['aCol', 3, 10], ['aWeight', 1, 13]];
    for (const g of pack.groups) {
      g.buffers = [];
      g.strokeVao = gl.createVertexArray();
      gl.bindVertexArray(g.strokeVao);
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, g.verts, gl.STATIC_DRAW);
      for (const [name, size, off] of layout) {
        const loc = gl.getAttribLocation(this.progStroke.p, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, F, off * 4);
      }
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW);
      g.dustVao = gl.createVertexArray();
      gl.bindVertexArray(g.dustVao);
      const db = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, db);
      gl.bufferData(gl.ARRAY_BUFFER, g.dust, gl.STATIC_DRAW);
      for (const [name, size, off] of [['aO', 2, 0], ['aCol', 3, 2], ['aRnd', 1, 5]]) {
        const loc = gl.getAttribLocation(this.progDust.p, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 24, off * 4);
      }
      g.buffers.push(vb, ib, db);
    }
    gl.bindVertexArray(null);
    return { score, pack };
  }

  setScore(score) {
    this.disposeScene(this.scene);
    this.disposeScene(this.prev);
    this.prev = null;
    this.trans = null;
    this.scene = this.buildScene(score);
    this.score = score;
  }

  // change to a new score with a crossfade from what is showing now
  transitionTo(score, ms = 2200) {
    if (!this.scene) return this.setScore(score);
    this.disposeScene(this.prev);
    this.prev = this.scene;
    this.scene = this.buildScene(score);
    this.score = score;
    this.trans = { t0: performance.now(), ms };
  }

  get transitioning() {
    return !!this.trans;
  }

  pass(target, prog, setup) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : this.size[0], target ? target.h : this.size[1]);
    gl.useProgram(prog.p);
    setup(prog.u);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  bindTex(unit, tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  render(t) {
    const gl = this.gl;
    if (this.trans) {
      const u = (performance.now() - this.trans.t0) / this.trans.ms;
      if (u < 1) {
        this.renderScene(this.prev, t, this.targets.ta);
        this.renderScene(this.scene, t, this.targets.tb);
        const e = u * u * (3 - 2 * u);
        this.pass(null, this.progBlend, (un) => {
          this.bindTex(0, this.targets.ta.tex);
          this.bindTex(1, this.targets.tb.tex);
          gl.uniform1i(un.uA, 0);
          gl.uniform1i(un.uB, 1);
          gl.uniform1f(un.uMix, e);
        });
        return;
      }
      this.disposeScene(this.prev);
      this.prev = null;
      this.trans = null;
    }
    this.renderScene(this.scene, t, null);
  }

  renderScene(scene, t, target) {
    const gl = this.gl;
    const [w, h] = this.size;
    const score = scene.score;
    const S = 0.47 * Math.min(w, h);
    const scale = [S / (w / 2), S / (h / 2)];
    const px = 1 / S; // one pixel in mandala units
    const tg = this.targets;

    // scene
    gl.bindFramebuffer(gl.FRAMEBUFFER, tg.scene.fb);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    const sweep = t <= score.tSweepStart ? 0 : Math.min(1, (t - score.tSweepStart) / (score.tSweepEnd - score.tSweepStart));
    const fade = t <= score.tSweepEnd ? 0 : Math.min(1, (t - score.tSweepEnd) / (score.tFadeEnd - score.tSweepEnd));
    const drift = fade * fade * 0.5;
    const live = Math.min(1, Math.max(0, (t - score.tBuildEnd) / 20 + 0.3)) * (1 - sweep);

    const st = score.st;
    if (fade < 1) {
      const P = this.progStroke;
      gl.useProgram(P.p);
      gl.uniform2f(P.u.uScale, scale[0], scale[1]);
      gl.uniform1f(P.u.uNs, score.N);
      gl.uniform1f(P.u.uT, t);
      gl.uniform1f(P.u.uPx, px);
      gl.uniform1f(P.u.uLive, live);
      gl.uniform1f(P.u.uSweep, sweep);
      gl.uniform1f(P.u.uGlow, st.glow);
      gl.uniform1f(P.u.uHeat, st.heat);
      gl.uniform1f(P.u.uTip, st.tip);
      gl.uniform1f(P.u.uGrain, st.grain || 0);
      gl.uniform1f(P.u.uGrainSize, Math.max(1, Math.round(S / 500)));
      for (const g of scene.pack.groups) {
        const n = indexCountAt(g, t);
        if (n === 0) continue;
        gl.uniform1f(P.u.uN, g.N);
        gl.bindVertexArray(g.strokeVao);
        gl.drawElementsInstanced(gl.TRIANGLES, n, gl.UNSIGNED_INT, 0, g.N * 2);
      }
    }
    if (sweep > 0 && fade < 1) {
      const D = this.progDust;
      gl.useProgram(D.p);
      gl.uniform2f(D.u.uScale, scale[0], scale[1]);
      gl.uniform1f(D.u.uNs, score.N);
      gl.uniform1f(D.u.uSweep, sweep);
      gl.uniform1f(D.u.uFade, fade);
      gl.uniform1f(D.u.uDrift, drift);
      gl.uniform1f(D.u.uPx, Math.max(1, S / 500));
      gl.uniform1f(D.u.uDustGain, st.dust);
      for (const g of scene.pack.groups) {
        gl.uniform1f(D.u.uN, g.N);
        gl.bindVertexArray(g.dustVao);
        gl.drawArraysInstanced(gl.POINTS, 0, g.dustCount, g.N * 2);
      }
    }
    gl.disable(gl.BLEND);

    // bloom chain
    let src = tg.scene;
    for (let i = 0; i < 4; i++) {
      const a = tg.a[i];
      const b = tg.b[i];
      this.pass(a, this.progDown, (u) => {
        this.bindTex(0, src.tex);
        gl.uniform1i(u.uTex, 0);
        gl.uniform2f(u.uTexel, 1 / src.w, 1 / src.h);
      });
      this.pass(b, this.progBlur, (u) => {
        this.bindTex(0, a.tex);
        gl.uniform1i(u.uTex, 0);
        gl.uniform2f(u.uDir, 1 / a.w, 0);
      });
      this.pass(a, this.progBlur, (u) => {
        this.bindTex(0, b.tex);
        gl.uniform1i(u.uTex, 0);
        gl.uniform2f(u.uDir, 0, 1 / a.h);
      });
      src = a;
    }
    const fadeIn = Math.min(1, t / 2.5) * Math.min(1, Math.max(0, (score.duration - t) / 4));
    this.pass(target, this.progComp, (u) => {
      this.bindTex(0, tg.scene.tex);
      this.bindTex(1, tg.a[0].tex);
      this.bindTex(2, tg.a[1].tex);
      this.bindTex(3, tg.a[2].tex);
      this.bindTex(4, tg.a[3].tex);
      gl.uniform1i(u.uScene, 0);
      gl.uniform1i(u.uB1, 1);
      gl.uniform1i(u.uB2, 2);
      gl.uniform1i(u.uB3, 3);
      gl.uniform1i(u.uB4, 4);
      gl.uniform3f(u.uBg, score.bg[0], score.bg[1], score.bg[2]);
      gl.uniform4f(u.uBloom, st.bloom[0], st.bloom[1], st.bloom[2], st.bloom[3]);
      gl.uniform1f(u.uExposure, st.exposure);
      gl.uniform1f(u.uBgLift, st.bgLift);
      gl.uniform3f(u.uPaper, score.paper[0], score.paper[1], score.paper[2]);
      gl.uniform1f(u.uInk, st.ink ? 1 : 0);
      gl.uniform1f(u.uAbsorb, st.absorb || 1);
      gl.uniform1f(u.uGrainBg, st.grain || 0);
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uFrame, this.frameNo++);
      gl.uniform1f(u.uS, S);
      gl.uniform1f(u.uFadeIn, fadeIn);
    });
  }
}
