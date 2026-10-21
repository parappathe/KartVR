// Pista: curva fechada (Catmull-Rom) pelos pontos da definição, reamostrada a cada ~1 m.
// Guarda posição, direção, curvatura, a "linha ideal" (por onde a IA anda) e o perfil de
// velocidade (quanto dá para correr em cada trecho). Sem navegador.
//
// Convenções: metros; s = distância ao longo da pista a partir da largada; lat = desvio
// lateral (positivo = à esquerda de quem anda no sentido da corrida).
import { clamp } from './util.js';

const cr = (a, b, c, d, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
};

export class Track {
  constructor(def) {
    this.def = def;
    this.halfWidth = def.width / 2;
    this.grass = def.grass ?? 3;                    // faixa fora do asfalto antes do muro
    this.wall = this.halfWidth + this.grass;       // |lat| do muro

    // 1. Curva densa
    const sc = def.scale || 1;
    const P = def.points.map(([x, z, y]) => [x * sc, z * sc, y || 0]), n = P.length;
    const dense = [];
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      const steps = Math.max(8, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.25));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        dense.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t),
          cr(p0[2] || 0, p1[2] || 0, p2[2] || 0, p3[2] || 0, t)]);
      }
    }
    // 2. Reamostra com passo igual
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1], b = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    this.length = cum[dense.length];
    const N = this.N = Math.round(this.length);
    this.step = this.length / N;
    this.x = new Float64Array(N); this.z = new Float64Array(N); this.y = new Float64Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * this.step;
      while (cum[j + 1] < s) j++;
      const a = dense[j], b = dense[(j + 1) % dense.length];
      const u = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      this.x[i] = a[0] + (b[0] - a[0]) * u;
      this.z[i] = a[1] + (b[1] - a[1]) * u;
      this.y[i] = a[2] + (b[2] - a[2]) * u;
    }
    // 3. Direção e curvatura
    this.tx = new Float64Array(N); this.tz = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a], l = Math.hypot(dx, dz);
      this.tx[i] = dx / l; this.tz[i] = dz / l;
    }
    const rawCurv = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const b = (i + 1) % N;
      const cross = this.tx[i] * this.tz[b] - this.tz[i] * this.tx[b];
      rawCurv[i] = -cross / this.step;               // positivo = curva para a esquerda
    }
    this.curv = smooth(rawCurv, 4);

    // 4. Linha ideal: corta por dentro das curvas, antecipando um pouco.
    const ahead = smooth(rawCurv, 14);
    this.line = new Float64Array(N);
    const lim = this.halfWidth * 0.6;
    for (let i = 0; i < N; i++) this.line[i] = clamp(ahead[(i + 4) % N] * this.halfWidth * 16, -lim, lim);
    this.line = smooth(this.line, 6);
    // curvatura do caminho da linha ideal, medida no próprio caminho
    const lx = new Float64Array(N), lz = new Float64Array(N);
    for (let i = 0; i < N; i++) { lx[i] = this.x[i] + this.tz[i] * this.line[i]; lz[i] = this.z[i] - this.tx[i] * this.line[i]; }
    const lc = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const ax = lx[i] - lx[a], az = lz[i] - lz[a], bx = lx[b] - lx[i], bz = lz[b] - lz[i];
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      lc[i] = -(ax * bz - az * bx) / (la * lb) / ((la + lb) / 2);
    }
    this.lineCurv = smooth(lc, 3);
    this.ramps = (def.ramps || []).map(r => ({ ...r, s: r.s ?? r.f * this.length }));
    this.items = (def.items || []).map(f => f * this.length);
    this.profile = null;
  }

  // Velocidade possível em cada amostra para um veículo com velocidade máxima vmax, aceleração
  // lateral alat e freio decel. Duas voltas de trás para frente, porque a pista é fechada.
  buildProfile({ vmax, alat, decel }) {
    const N = this.N, p = new Float64Array(N);
    for (let i = 0; i < N; i++) p[i] = Math.min(vmax, Math.sqrt(alat / Math.max(1e-4, Math.abs(this.lineCurv[i]))));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const nx = p[(i + 1) % N];
        p[i] = Math.min(p[i], Math.sqrt(nx * nx + 2 * decel * this.step));
      }
    }
    this.profile = p;
    this.profileMax = p.reduce((a, b) => Math.max(a, b), 0);
    return p;
  }

  idx(s) { const i = Math.floor(this.wrap(s) / this.step); return i % this.N; }
  wrap(s) { s %= this.length; return s < 0 ? s + this.length : s; }

  // Valor interpolado de um vetor por amostra.
  sampleAt(arr, s) {
    s = this.wrap(s) / this.step;
    const i = Math.floor(s) % this.N, u = s - Math.floor(s);
    return arr[i] + (arr[(i + 1) % this.N] - arr[i]) * u;
  }

  // Altura do chão na distância s (centro da pista + rampas).
  heightAt(s) {
    let h = this.sampleAt(this.y, s);
    const w = this.wrap(s);
    for (const r of this.ramps) {
      const d = w - r.s;
      if (d >= 0 && d <= r.len) h += r.h * d / r.len;
    }
    return h;
  }
  gradeAt(s) { return (this.heightAt(s + 0.25) - this.heightAt(s - 0.25)) / 0.5; }

  // Ponto da pista em (s, lat).
  pointAt(s, lat = 0, out = {}) {
    const f = this.wrap(s) / this.step;
    const i = Math.floor(f) % this.N, b = (i + 1) % this.N, u = f - Math.floor(f);
    let tx = this.tx[i] + (this.tx[b] - this.tx[i]) * u, tz = this.tz[i] + (this.tz[b] - this.tz[i]) * u;
    const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    out.tx = tx; out.tz = tz;
    out.x = this.x[i] + (this.x[b] - this.x[i]) * u + tz * lat;
    out.z = this.z[i] + (this.z[b] - this.z[i]) * u - tx * lat;
    out.y = this.heightAt(s);
    return out;
  }

  // Projeta (x, z) na pista. hint = índice da última projeção (procura só em volta), -1 = tudo.
  project(x, z, hint = -1, out = {}) {
    const N = this.N;
    let best = Infinity, bi = 0, bu = 0;
    const from = hint < 0 ? 0 : hint - 40, to = hint < 0 ? N : hint + 40;
    for (let k = from; k < to; k++) {
      const i = ((k % N) + N) % N, b = (i + 1) % N;
      const ax = this.x[i], az = this.z[i];
      const dx = this.x[b] - ax, dz = this.z[b] - az;
      const u = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      const px = ax + dx * u - x, pz = az + dz * u - z;
      const d = px * px + pz * pz;
      if (d < best) { best = d; bi = i; bu = u; }
    }
    const b = (bi + 1) % N;
    const cx = this.x[bi] + (this.x[b] - this.x[bi]) * bu, cz = this.z[bi] + (this.z[b] - this.z[bi]) * bu;
    let tx = this.tx[bi] + (this.tx[b] - this.tx[bi]) * bu, tz = this.tz[bi] + (this.tz[b] - this.tz[bi]) * bu;
    const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    out.i = bi;
    out.s = (bi + bu) * this.step;
    out.lat = (x - cx) * tz - (z - cz) * tx;
    out.tx = tx; out.tz = tz;
    out.y = this.heightAt(out.s);
    return out;
  }
}

function smooth(arr, r) {
  const N = arr.length, out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += arr[((i + k) % N + N) % N];
    out[i] = sum / (2 * r + 1);
  }
  return out;
}
