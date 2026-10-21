// Testes automáticos (rodam no Node, sem navegador e sem som): node tests/run.js
import { Track } from '../js/track.js';
import { TRACKS } from '../js/tracks.js';
import { Kart, PHYS, DT } from '../js/kart.js';
import { Race } from '../js/race.js';
import { LEVELS, ROBOT } from '../js/ai.js';

let fails = 0;
function check(ok, msg) {
  if (ok) console.log('  ok  ' + msg);
  else { fails++; console.log('  FALHOU  ' + msg); }
}

function runRace(opts, maxT = 600) {
  const ev = {};
  const race = new Race({ ...opts, onEvent: (t, d) => { (ev[t] ||= []).push(d); } });
  while (race.state !== 'done' && race.t < maxT) race.step({});
  return { race, ev };
}

for (const def of TRACKS) {
  console.log(`\nPista: ${def.name}`);
  const tr = new Track(def);
  tr.buildProfile({ vmax: PHYS.vboost, alat: PHYS.alat * 0.9, decel: 15 });

  // Geometria
  let worst = 0;
  for (let s = 0; s < tr.length; s += 7.3) for (const lat of [-4, 0, 3]) {
    const p = tr.pointAt(s, lat), q = tr.project(p.x, p.z, -1);
    let ds = Math.abs(q.s - s); ds = Math.min(ds, tr.length - ds);
    worst = Math.max(worst, ds, Math.abs(q.lat - lat));
  }
  check(worst < 0.15, `projeção volta ao mesmo ponto (erro máx ${worst.toFixed(3)} m)`);
  let minC = Infinity;
  for (let i = 0; i < tr.N; i += 2) for (let j = i + 2; j < tr.N; j += 2) {
    const along = Math.min(Math.abs(i - j), tr.N - Math.abs(i - j)) * tr.step;
    if (along > 60) minC = Math.min(minC, Math.hypot(tr.x[i] - tr.x[j], tr.z[i] - tr.z[j]));
  }
  check(minC > 2 * tr.wall + 4, `trechos da pista não se encostam (folga ${minC.toFixed(1)} m)`);
  let minR = Infinity;
  for (let i = 0; i < tr.N; i++) minR = Math.min(minR, 1 / Math.abs(tr.curv[i]));
  check(minR > 10, `curva mais fechada tem raio ${minR.toFixed(1)} m (> 10)`);
  check(tr.length > 600 && tr.length < 1100, `comprimento ${tr.length.toFixed(0)} m`);

  // Muro: acelerando e virando todo para um lado, o kart nunca sai da pista
  for (const steer of [-1, 1]) {
    const k = new Kart(tr, 20, 0);
    let out = 0;
    for (let i = 0; i < 120 * 8; i++) {
      k.step({ throttle: 1, steer: i < 120 ? 0 : steer * 0.4 });
      out = Math.max(out, Math.abs(k.proj.lat));
    }
    check(out <= tr.wall - PHYS.radius + 0.01, `muro segura o kart virando para ${steer < 0 ? 'a esquerda' : 'a direita'} (|lat| máx ${out.toFixed(2)})`);
  }

  // Volta só conta andando para frente
  {
    const k = new Kart(tr, 3, 0);
    k.h += Math.PI;
    for (let i = 0; i < 120 * 4; i++) k.step({ throttle: 1 });
    check(k.dist < 0 && Math.floor(k.dist / tr.length) <= 0, `andar para trás pela largada não conta volta (dist ${k.dist.toFixed(1)})`);
  }

  // Robô completa a corrida sozinho; saltos acontecem
  {
    const { race, ev } = runRace({ trackDef: def, level: LEVELS[1], robotPlayer: true, opponents: 0, seed: 3 });
    const p = race.player;
    check(p.finished, `robô completa 3 voltas sozinho (${p.finishTime?.toFixed(1)} s, melhor volta ${Math.min(...p.lapTimes).toFixed(1)} s)`);
    const jumps = (ev.jump || []).filter(e => e.kart === 0).length;
    check(jumps >= def.ramps.length * 3, `saltos nas lombadas: ${jumps} (esperado ≥ ${def.ramps.length * 3})`);
    check(p.finishTime < race.laps * tr.length / 13, `tempo dentro do limite (${(race.laps * tr.length / 13).toFixed(0)} s)`);
  }

  // Níveis: média dos pilotos do computador mais rápida no Difícil
  const avg = [];
  for (const lv of LEVELS) {
    let sum = 0, n = 0;
    for (const seed of [11, 12]) {
      const { race } = runRace({ trackDef: def, level: lv, robotPlayer: true, seed });
      for (const r of race.results) if (r.index !== 0) { sum += r.time; n++; }
    }
    avg.push(sum / n);
  }
  check(avg[0] > avg[1] && avg[1] > avg[2], `níveis em ordem: Fácil ${avg[0].toFixed(1)} s > Médio ${avg[1].toFixed(1)} s > Difícil ${avg[2].toFixed(1)} s`);

  // Corrida completa com 8 karts
  {
    const { race, ev } = runRace({ trackDef: def, level: LEVELS[2], robotPlayer: true, seed: 7 });
    check(race.state === 'done' && race.results.length === 8, 'corrida de 8 termina com resultado de todos');
    check(new Set(race.results.map(r => r.index)).size === 8, 'resultado sem repetidos');
    check((ev.item || []).length > 5 && (ev.use || []).length > 3, `itens pegos (${(ev.item || []).length}) e usados (${(ev.use || []).length})`);
    console.log(`     robô chegou em ${ev.over[0].pos}º no Difícil (${ev.over[0].time.toFixed(1)} s) · batidas em obstáculos: ${(ev.hit || []).length} (robô: ${(ev.hit || []).filter(h => h.kart === 0).length})`);
  }
}

// Obstáculo faz o kart rodar
{
  console.log('\nItens');
  const race = new Race({ trackDef: TRACKS[0], robotPlayer: true, opponents: 0 });
  while (race.state !== 'race') race.step({});
  const k = race.player;
  for (let i = 0; i < 240; i++) race.step({});
  const p = race.track.pointAt(k.s + 6, k.proj.lat);
  race.hazards.push({ type: 'casca', x: p.x, z: p.z, y: p.y, s: k.s + 6, lat: k.proj.lat, life: 60, r: 0.7, owner: -1, grace: 0 });
  race.drivers[0].control = () => ({ throttle: 1, steer: 0 });
  let spun = false;
  for (let i = 0; i < 120 && !spun; i++) { race.step({}); spun = k.spin > 0; }
  check(spun && race.hazards.length === 0, 'casca de banana faz rodar e some');
  k.item = 'turbo'; k.spin = 0; k.immune = 0;
  for (let i = 0; i < 120; i++) race.step({});
  const v0 = k.v;
  race.useItem(k);
  for (let i = 0; i < 100; i++) race.step({});
  check(k.v > v0 + 3 && k.v > PHYS.vmax, `turbo passa da velocidade máxima (${(k.v * 3.6).toFixed(0)} km/h)`);
}

console.log(fails ? `\n${fails} teste(s) falharam` : '\nTudo certo');
process.exit(fails ? 1 : 0);
