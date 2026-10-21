// Uma corrida: 8 karts, largada, voltas, caixas de item, obstáculos, batidas e resultado.
// O kart 0 é o jogador. Avança em passos fixos (step). Sem navegador.
import { Track } from './track.js';
import { Kart, PHYS, DT } from './kart.js';
import { Driver, LEVELS, ROBOT, DRIVERS } from './ai.js';
import { rng } from './util.js';

export const COUNTDOWN = 3.5;
export const ITEM_NAMES = { turbo: 'Turbo', casca: 'Casca de banana', oleo: 'Mancha de óleo' };

export class Race {
  constructor({ trackDef, level = LEVELS[1], laps = 3, seed = 1, onEvent = () => {}, robotPlayer = false, opponents = 7 }) {
    this.track = new Track(trackDef);
    this.track.buildProfile({ vmax: PHYS.vboost, alat: PHYS.alat * 0.9, decel: 15 });
    this.level = level;
    this.laps = laps;
    this.rand = rng(seed);
    this.onEvent = onEvent;
    this.robotPlayer = robotPlayer;
    this.t = -COUNTDOWN;
    this.state = 'countdown';
    this.count = 4;
    this.hazards = [];
    this.order = [];
    this.results = null;

    // Grid em duas colunas; o jogador larga em último.
    const n = opponents + 1;
    this.karts = [];
    this.drivers = [];
    for (let slot = 0; slot < n; slot++) {
      const row = Math.floor(slot / 2), col = slot % 2;
      const s = this.track.length - 5 - row * 5.5;
      const lat = col ? -2.6 : 2.6;
      const k = new Kart(this.track, s, lat);
      const who = slot === n - 1 ? 0 : slot + 1;
      k.index = who;
      k.name = who === 0 ? 'Você' : DRIVERS[(who - 1) % DRIVERS.length].name;
      k.color = who === 0 ? 0xe23b3b : DRIVERS[(who - 1) % DRIVERS.length].color;
      k.item = null; k.lap = 0; k.lapStart = 0; k.lapTimes = []; k.finished = false; k.finishTime = null; k.pos = 0;
      this.karts[who] = k;
    }
    for (let i = 0; i < n; i++) this.drivers[i] = new Driver(i === 0 ? ROBOT : level, this.rand, i === 0 ? 0 : (this.rand() - 0.5) * 0.04);
    this.player = this.karts[0];

    // Caixas de item: fileiras de 4 atravessando a pista.
    this.boxes = [];
    for (const s of this.track.items) {
      for (let c = 0; c < 4; c++) {
        const lat = (c - 1.5) * this.track.halfWidth * 0.42;
        const p = this.track.pointAt(s, lat);
        this.boxes.push({ x: p.x, z: p.z, y: p.y, s, lat, respawn: 0 });
      }
    }
    this.updateOrder();
  }

  emit(type, d = {}) { this.onEvent(type, d); }

  // Ajuste para a corrida não espalhar demais (só para os pilotos do computador).
  catchUp(k) {
    if (k.index === 0) return 1;
    const gap = k.dist - this.player.dist;
    return Math.max(0.97, Math.min(1.03, 1 - gap * 0.0005));
  }

  someoneBehind(k, a, b) {
    return this.karts.some(o => o !== k && k.dist - o.dist > a && k.dist - o.dist < b && Math.abs(o.proj.lat - k.proj.lat) < 3);
  }

  pickItem(k) {
    const pos = k.pos, n = this.karts.length, r = this.rand();
    const back = (pos - 1) / (n - 1);              // 0 = líder, 1 = último
    const pTurbo = 0.15 + back * 0.5;
    if (r < pTurbo) return 'turbo';
    return r < pTurbo + (1 - pTurbo) / 2 ? 'casca' : 'oleo';
  }

  useItem(k) {
    const it = k.item;
    if (!it) return;
    k.item = null;
    if (it === 'turbo') { k.boost = 1.6; }
    else {
      const back = it === 'oleo' ? 2.6 : 2.0;
      const x = k.x - k.fx * back, z = k.z - k.fz * back;
      const pr = this.track.project(x, z, k.proj.i);
      this.hazards.push({ type: it, x, z, y: pr.y, s: pr.s, lat: pr.lat, life: it === 'oleo' ? 12 : 60, r: it === 'oleo' ? 1.2 : 0.6, owner: k.index, grace: 0.4 });
    }
    this.emit('use', { kart: k.index, item: it });
  }

  // input do jogador: { throttle, brake, steer, item } (item = apertou agora)
  step(input = {}) {
    this.t += DT;
    if (this.state === 'countdown') {
      const c = Math.ceil(-this.t);
      if (c < this.count && c >= 1) { this.count = c; this.emit('count', { n: c }); }
      if (this.t >= 0) { this.state = 'race'; this.emit('go'); }
      for (const k of this.karts) k.step({});
      return;
    }
    if (this.state === 'done') return;

    const L = this.track.length;
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      const human = i === 0 && !this.robotPlayer && !k.finished;
      const inp = human ? input : this.drivers[i].control(k, this, this.t);
      k.step(inp);
      if (inp.item && k.item) this.useItem(k);
      for (const e of k.events) this.emit(e.type, { kart: i, power: e.power });
      k.events.length = 0;

      // Voltas
      const lapsDone = Math.floor(k.dist / L);
      if (lapsDone > k.lap && !k.finished) {
        k.lap = lapsDone;
        if (lapsDone >= 1) { k.lapTimes.push(this.t - k.lapStart); k.lapStart = this.t; }
        if (k.lap >= this.laps) {
          k.finished = true; k.finishTime = this.t;
          this.updateOrder();
          this.emit('finish', { kart: i, pos: k.pos, time: k.finishTime });
        } else if (lapsDone >= 1) this.emit('lap', { kart: i, lap: k.lap + 1, final: k.lap + 1 === this.laps, time: k.lapTimes.at(-1) });
      }
    }
    this.collide();
    this.updateItems();
    this.updateOrder();

    const p = this.player;
    if (p.finished && (this.karts.every(k => k.finished) || this.t > p.finishTime + 10)) this.finishRace();
  }

  collide() {
    const ks = this.karts, R2 = PHYS.radius * 2;
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i], b = ks[j];
      if (Math.abs(a.y - b.y) > 1) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= R2 || d < 1e-6) continue;
      const nx = dx / d, nz = dz / d, push = (R2 - d) / 2;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      // quem vem atrás perde um pouco de velocidade
      const behind = a.dist < b.dist ? a : b;
      const closing = (a.fx * a.v - b.fx * b.v) * nx + (a.fz * a.v - b.fz * b.v) * nz;
      if (closing > 0) {
        behind.v *= 0.92;
        if (closing > 2) this.emit('bump', { kart: i, other: j, power: closing });
      }
    }
  }

  updateItems() {
    for (const b of this.boxes) {
      if (b.respawn > 0) { b.respawn -= DT; continue; }
      for (const k of this.karts) {
        if (k.item || k.spin > 0) continue;
        const dx = k.x - b.x, dz = k.z - b.z;
        if (dx * dx + dz * dz < 1.7 * 1.7 && Math.abs(k.y - b.y) < 1.6) {
          k.item = this.pickItem(k);
          b.respawn = 3;
          this.emit('item', { kart: k.index, item: k.item });
          break;
        }
      }
    }
    for (let h = this.hazards.length - 1; h >= 0; h--) {
      const hz = this.hazards[h];
      hz.life -= DT; hz.grace -= DT;
      let gone = hz.life <= 0;
      for (const k of this.karts) {
        if (gone || k.airborne || (hz.grace > 0 && k.index === hz.owner)) continue;
        const dx = k.x - hz.x, dz = k.z - hz.z, rr = hz.r + 0.5;
        if (dx * dx + dz * dz < rr * rr && k.hitHazard()) {
          this.emit('hit', { kart: k.index, item: hz.type });
          if (hz.type === 'casca') gone = true;
        }
      }
      if (gone) this.hazards.splice(h, 1);
    }
  }

  updateOrder() {
    const key = k => k.finished ? 1e9 - k.finishTime : k.dist;
    this.order = this.karts.slice().sort((a, b) => key(b) - key(a));
    this.order.forEach((k, i) => { k.pos = i + 1; });
  }

  finishRace() {
    const L = this.track.length;
    // Quem não chegou: tempo estimado pelo que falta na velocidade média até agora.
    this.results = this.order.map(k => {
      let time = k.finishTime;
      if (!k.finished) {
        const avg = Math.max(5, k.dist / Math.max(1, this.t));
        time = this.t + (this.laps * L - k.dist) / avg;
      }
      return { index: k.index, name: k.name, color: k.color, time, estimated: !k.finished, bestLap: k.lapTimes.length ? Math.min(...k.lapTimes) : null };
    });
    this.results.sort((a, b) => a.time - b.time);
    const playerPos = this.results.findIndex(r => r.index === 0) + 1;
    this.state = 'done';
    this.emit('over', { pos: playerPos, results: this.results, time: this.player.finishTime, bestLap: Math.min(...this.player.lapTimes) });
  }
}
