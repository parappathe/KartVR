// Física do kart: modelo de fliperama em passo fixo. Sem navegador.
// heading h: o kart olha para (-sen h, -cos h) no chão (igual a rotation.y do Three.js).
// steer: -1 (esquerda) .. +1 (direita).
import { clamp, wrapAngle } from './util.js';

export const DT = 1 / 120;
export const PHYS = {
  vmax: 21,         // m/s (~75 km/h)
  vboost: 29,       // com turbo
  acc: 12,          // aceleração saindo do zero
  brake: 22,
  reverse: 6,
  coast: 2.5,       // desaceleração soltando tudo
  alat: 26,         // aceleração lateral máxima (define o raio mínimo de curva)
  turnLow: 2.6,     // rad/s de giro em baixa velocidade
  grassMax: 0.5,    // fração da velocidade máxima na grama/areia
  gravity: 14,
  radius: 0.75,     // para batidas
};

export class Kart {
  constructor(track, s, lat, opts = {}) {
    this.track = track;
    this.power = opts.power ?? 1;            // multiplica a velocidade máxima
    const p = track.pointAt(s, lat);
    this.x = p.x; this.z = p.z; this.y = p.y; this.vy = 0;
    this.h = Math.atan2(-p.tx, -p.tz);
    this.v = 0;
    this.steer = 0;
    this.airborne = false;
    this.boost = 0;          // s de turbo restantes
    this.spin = 0;           // s rodando depois de bater num obstáculo
    this.immune = 0;
    this.spinAngle = 0;      // só visual
    this.onGrass = false;
    this.proj = track.project(this.x, this.z, -1);
    this.s = this.proj.s;
    this.dist = s >= track.length / 2 ? s - track.length : s;   // distância percorrida (negativa no grid)
    this.lastSlopeVy = 0;
    this.events = [];
  }

  get fx() { return -Math.sin(this.h); }
  get fz() { return -Math.cos(this.h); }
  get speedKmh() { return Math.abs(this.v) * 3.6; }

  step(input) {
    const P = PHYS, dt = DT, tr = this.track;
    let { throttle = 0, brake = 0, steer = 0 } = input;
    if (this.spin > 0) {
      this.spin -= dt;
      this.spinAngle += dt * 12;
      throttle = 0; brake = 0; steer = 0;
      this.v *= 1 - 2.2 * dt;
      if (this.spin <= 0) { this.spinAngle = 0; this.immune = 1; }
    }
    if (this.immune > 0) this.immune -= dt;
    this.steer += clamp(steer - this.steer, -7 * dt, 7 * dt);

    const vmax = (this.boost > 0 ? P.vboost : P.vmax * this.power) * (this.onGrass ? P.grassMax : 1);
    if (!this.airborne) {
      if (throttle > 0 && this.v > -0.5) {
        if (this.v < vmax) this.v += throttle * P.acc * Math.max(0.15, 1 - this.v / vmax) * dt;
      }
      if (brake > 0) {
        if (this.v > 0.3) this.v -= P.brake * brake * dt;
        else this.v = Math.max(-P.reverse, this.v - 7 * brake * dt);
      }
      if (throttle <= 0 && brake <= 0) this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), P.coast * dt);
      if (this.v > vmax) this.v -= Math.min(this.v - vmax, (this.onGrass ? 18 : 6) * dt);
      if (this.boost > 0 && this.v < P.vboost) this.v = Math.min(P.vboost, this.v + 20 * dt);
    }
    if (this.boost > 0) this.boost -= dt;

    // Giro: limitado pela aceleração lateral, quase nada parado.
    const av = Math.abs(this.v);
    const yawMax = Math.min(P.turnLow, P.alat / Math.max(av, 0.1)) * clamp(av / 3, 0, 1) * (this.airborne ? 0.25 : 1);
    this.h = wrapAngle(this.h - this.steer * yawMax * Math.sign(this.v) * dt);

    const ox = this.x, oz = this.z;
    this.x += this.fx * this.v * dt;
    this.z += this.fz * this.v * dt;

    // Pista: projeção, grama e muro
    const pr = tr.project(this.x, this.z, this.proj.i, this.proj);
    this.onGrass = Math.abs(pr.lat) > tr.halfWidth + 0.3;
    const lim = tr.wall - P.radius;
    if (Math.abs(pr.lat) > lim) {
      const side = Math.sign(pr.lat), push = pr.lat - side * lim;
      this.x -= pr.tz * push; this.z += pr.tx * push;          // volta para dentro (eixo "esquerda" = (tz, -tx))
      const lx = pr.tz * side, lz = -pr.tx * side;               // normal apontando para o muro
      const into = (this.fx * lx + this.fz * lz) * this.v;       // velocidade contra o muro
      if (into > 0) {
        this.v *= clamp(1 - (into / Math.max(Math.abs(this.v), 1)) * 0.9, 0.25, 1);
        // gira o kart para ficar paralelo ao muro
        const along = Math.sign(this.fx * pr.tx + this.fz * pr.tz) || 1;
        const ht = Math.atan2(-pr.tx * along, -pr.tz * along);
        this.h = wrapAngle(this.h + wrapAngle(ht - this.h) * 0.5);
        if (into > 2) this.events.push({ type: 'wall', power: into });
      }
      tr.project(this.x, this.z, pr.i, pr);
    }

    // Distância percorrida
    let ds = pr.s - this.s;
    if (ds < -tr.length / 2) ds += tr.length; else if (ds > tr.length / 2) ds -= tr.length;
    this.dist += ds;
    this.s = pr.s;

    // Altura: segue o chão; sai do chão quando a descida é mais rápida que a gravidade (salto).
    const ground = pr.y;
    const along = this.fx * pr.tx + this.fz * pr.tz;
    const slopeVy = this.v * along * tr.gradeAt(pr.s);
    if (this.airborne) {
      this.vy -= P.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) {
        if (this.vy < -3) this.events.push({ type: 'land', power: -this.vy });
        this.y = ground; this.airborne = false; this.vy = slopeVy;
      }
    } else {
      if ((this.lastSlopeVy - slopeVy) / dt > P.gravity * 1.5 && this.lastSlopeVy > 0.8) {
        this.airborne = true;
        this.vy = this.lastSlopeVy;
        this.y += this.vy * dt;
        this.events.push({ type: 'jump' });
      } else { this.y = ground; this.vy = slopeVy; }
    }
    this.lastSlopeVy = this.airborne ? 0 : slopeVy;
    this.moved = Math.hypot(this.x - ox, this.z - oz);
  }

  hitHazard() {
    if (this.spin > 0 || this.immune > 0) return false;
    this.spin = 0.9;
    this.v *= 0.35;
    this.boost = 0;
    return true;
  }
}
