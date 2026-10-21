// Pilotos do computador: seguem a linha ideal da pista com velocidade e precisão por nível.
// O mesmo piloto (nível "robo") dirige o kart do jogador nos testes e depois da chegada.
// Sem navegador.
import { clamp, wrapAngle } from './util.js';
import { PHYS } from './kart.js';

export const LEVELS = [
  { id: 'facil', name: 'Fácil', desc: 'Pilotos tranquilos', speed: 0.78, wander: 1.6, itemDelay: [10, 18], ambush: 0 },
  { id: 'medio', name: 'Médio', desc: 'Briga de verdade', speed: 0.86, wander: 1.0, itemDelay: [7, 14], ambush: 0.15 },
  { id: 'dificil', name: 'Difícil', desc: 'Para quem conhece a pista', speed: 0.92, wander: 0.5, itemDelay: [5, 10], ambush: 0.3 },
];
export const ROBOT = { id: 'robo', speed: 1.0, wander: 0, itemDelay: [3, 6], ambush: 0.5 };

export const DRIVERS = [
  { name: 'Zeca', color: 0x2f7fd1 }, { name: 'Lia', color: 0xf2c518 }, { name: 'Bento', color: 0x3fbf5f },
  { name: 'Duda', color: 0xb04fd6 }, { name: 'Tião', color: 0xff8a1e }, { name: 'Nina', color: 0x1fc8c8 },
  { name: 'Faísca', color: 0xff5ab0 },
];

export class Driver {
  constructor(level, rand, personal = 0) {
    this.level = level;
    this.rand = rand;
    this.bias = (rand() - 0.5) * 2 * level.wander;     // faixa preferida
    this.phase = rand() * 10;
    this.personal = personal;                          // ±fração de velocidade própria
    this.stuck = 0; this.reverse = 0;
    this.itemTimer = level.itemDelay[0];
    this._p = {};
  }

  // Devolve { throttle, brake, steer, item }
  control(k, race, t) {
    const tr = race.track, lv = this.level;
    if (this.reverse > 0) {
      this.reverse -= 1 / 120;
      return { throttle: 0, brake: 1, steer: clamp(this.headingTo(k, k.s + 8, 0) * 2, -1, 1), item: false };   // de ré o volante inverte
    }
    const av = Math.abs(k.v);
    if (race.state === 'race' && av < 1.2) { this.stuck += 1 / 120; if (this.stuck > 1.6) { this.reverse = 1.0; this.stuck = 0; } }
    else this.stuck = 0;

    const look = 5 + av * 0.45;
    const sT = k.s + look;
    let lat = tr.sampleAt(tr.line, sT) + this.bias + Math.sin(t * 0.4 + this.phase) * lv.wander * 0.6;
    // ultrapassa quem está logo à frente e mais devagar
    for (const o of race.karts) {
      if (o === k) continue;
      const d = o.dist - k.dist;
      if (d > 0.5 && d < 4 + av * 0.5 && o.v < k.v + 0.5 && Math.abs(o.proj.lat - lat) < 1.9) {
        const side = o.proj.lat > 0 ? -1 : 1;
        lat = o.proj.lat + side * 2.2;
      }
    }
    // desvia de obstáculos à frente
    for (const hz of race.hazards) {
      let d = hz.s - k.s; if (d < -tr.length / 2) d += tr.length;
      if (d > 1 && d < 8 + av * 1.2 && Math.abs(hz.lat - lat) < hz.r + 2) lat = hz.lat + (hz.lat > 0 ? -1 : 1) * (hz.r + 2.4);
    }
    const lim = tr.halfWidth - 1.2;
    lat = clamp(lat, -lim, lim);
    const diff = this.headingTo(k, sT, lat);
    const steer = clamp(-diff * 2.6, -1, 1);

    // o perfil da pista vai até a velocidade do turbo; sem turbo o limite é a velocidade máxima
    let target = Math.min(tr.sampleAt(tr.profile, k.s + 2), k.boost > 0 ? PHYS.vboost : PHYS.vmax) * lv.speed * (1 + this.personal);
    target *= race.catchUp(k);
    const throttle = k.v < target ? 1 : 0;
    const brake = k.v > target + 1.5 ? 1 : 0;

    let item = false;
    if (k.item) {
      this.itemTimer -= 1 / 120;
      if (k.item === 'turbo') item = this.itemTimer <= 0 && tr.sampleAt(tr.profile, k.s + 25) > tr.profileMax * 0.9;
      else item = this.itemTimer <= 0 || (race.someoneBehind(k, 3, 12) && this.rand() < lv.ambush / 120);
      if (item) this.itemTimer = lv.itemDelay[0] + this.rand() * (lv.itemDelay[1] - lv.itemDelay[0]);
    }
    return { throttle, brake, steer, item };
  }

  headingTo(k, s, lat) {
    const p = k.track.pointAt(s, lat, this._p);
    const ht = Math.atan2(-(p.x - k.x), -(p.z - k.z));
    return wrapAngle(ht - k.h);
  }
}
