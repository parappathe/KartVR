// Liga a corrida à tela, aos controles do Quest (volante e gatilhos), ao teclado/controle no PC
// e aos menus.
import * as THREE from '../vendor/three/three.module.js';
import { TRACKS } from './tracks.js';
import { Race } from './race.js';
import { DT, PHYS } from './kart.js';
import { LEVELS } from './ai.js';
import { buildWorld, disposeGroup, makeKart, makeItemBoxes, makeHazard, makeVignette, KART } from './scene.js';
import { Hud, Banner } from './hud.js';
import { Panel, Label } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';
import { clamp, lerp, fmtTime, wrapAngle } from './util.js';

const save = loadSave();
const sfx = new Sfx();
const WHEEL_MAX = 1.6;         // giro máximo do volante (rad), ~90°

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 900);
scene.add(camera);
const seat = new THREE.Group();      // cabeça do piloto, presa ao kart do jogador (só gira no eixo vertical)
scene.add(seat);
const rig = new THREE.Group();       // espaço do VR (ajustado pelo "recentralizar")
seat.add(rig);

const panel = new Panel(1.1);
panel.onShow = () => { banner.mesh.visible = false; };
const banner = new Banner();
const vignette = makeVignette();
const fpsLabel = new Label(0.14);
fpsLabel.mesh.visible = false;
let hud = new Hud(null);
document.getElementById('hudbox').appendChild(hud.canvas);

// ---------- Estado ----------
let app = 'menu';          // 'menu' | 'playing' | 'paused' | 'result'
let screen = 'main';
let optionsBack = 'main';
let trackIndex = 0;
let levelIndex = clamp(save.level ?? 1, 0, LEVELS.length - 1);
let race = null;
let world = null;
let kartModels = [];
let boxMeshes = [];
const hazardMeshes = new Map();
let lastResult = null;
let time = 0;

// ---------- Pista ----------
function loadTrack(i) {
  trackIndex = i;
  const def = TRACKS[i];
  if (world) { scene.remove(world.group); disposeGroup(world.group); }
  race = new Race({ trackDef: def, level: LEVELS[levelIndex], onEvent, seed: (Date.now() & 0xffff) + 1 });
  world = buildWorld(race.track, def.theme);
  scene.add(world.group);
  scene.background = world.background;
  scene.fog = world.fog;
  boxMeshes = makeItemBoxes(race.boxes);
  for (const m of boxMeshes) world.group.add(m);
  clearHazards();
  if (!kartModels.length) {
    kartModels = race.karts.map((k, idx) => makeKart(k.color, { player: idx === 0 }));
    for (const m of kartModels) scene.add(m.group);
    // painel do kart do jogador
    hud.mesh.position.set(0, 0.76, -0.78);
    hud.mesh.rotation.x = -0.55;
    kartModels[0].body.add(hud.mesh);
  }
  hud.setTrack(race.track);
  seatY = null;
  syncKarts(0);
}

function clearHazards() {
  for (const m of hazardMeshes.values()) m.parent?.remove(m);
  hazardMeshes.clear();
}

// ---------- VR: controles ----------
const hands = { left: null, right: null };
const ctrls = [];
const handGeo = new THREE.SphereGeometry(0.035, 12, 10);
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl); rig.add(grip);
  const laser = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffcf3a }));
  laser.scale.z = 2; laser.visible = false;
  ctrl.add(laser);
  const glove = new THREE.Mesh(handGeo, new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
  glove.visible = false;
  scene.add(glove);
  const entry = { ctrl, grip, laser, glove, source: null, hand: null, prev: [], hoverIndex: -1, held: false, a0: 0, w0: 0 };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => {
    entry.source = e.data; entry.hand = e.data.handedness;
    if (entry.hand === 'left' || entry.hand === 'right') hands[entry.hand] = entry;
  });
  ctrl.addEventListener('disconnected', () => {
    if (entry.hand && hands[entry.hand] === entry) hands[entry.hand] = null;
    entry.source = null; entry.hand = null; entry.held = false;
  });
  ctrl.addEventListener('selectstart', () => onSelect(entry));
}

function pulse(handName, v, ms) {
  try { hands[handName]?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(v, ms); } catch { /* sem vibração */ }
}
function pulseBoth(v, ms) { pulse('left', v, ms); pulse('right', v, ms); }

function recenter() {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.y);
  rig.position.set(-head.x, -head.y, -head.z);
}
let recenterIn = 0;
renderer.xr.addEventListener('sessionstart', () => {
  rig.add(camera);
  camera.add(vignette);
  camera.add(fpsLabel.mesh);
  fpsLabel.mesh.position.set(0.12, -0.12, -0.5);
  recenterIn = 5;
  placeOverlays();
  updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  scene.add(camera);
  camera.remove(vignette);
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  for (const e of ctrls) { e.held = false; e.glove.visible = false; }
  camera.fov = 70; camera.updateProjectionMatrix();
  placeOverlays();
  updateHint();
});

// Painel do menu e letreiro: presos ao assento no VR, presos à câmera no PC.
function placeOverlays() {
  if (renderer.xr.isPresenting) {
    seat.add(panel.mesh); panel.mesh.position.set(0, 0.0, -1.05); panel.mesh.rotation.set(0, 0, 0);
    seat.add(banner.mesh); banner.mesh.position.set(0, 0.45, -3.2); banner.mesh.scale.setScalar(1);
  } else {
    camera.add(panel.mesh); panel.mesh.position.set(0, 0, -1.25); panel.mesh.rotation.set(0, 0, 0);
    camera.add(banner.mesh); banner.mesh.position.set(0, 0.32, -2.2); banner.mesh.scale.setScalar(0.8);
  }
}

// ---------- Volante ----------
const wheel = { angle: 0, grabbed: false };
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

function updateWheel(dt, stickSteer) {
  const piv = kartModels[0].wheelPivot;
  piv.updateWorldMatrix(true, false);
  let sum = 0, n = 0;
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp) { e.glove.visible = false; continue; }
    e.grip.getWorldPosition(tmpV);
    const world = tmpV.clone();
    piv.worldToLocal(tmpV);
    const r = Math.hypot(tmpV.x, tmpV.y), a = Math.atan2(tmpV.y, tmpV.x);
    const gripOn = !!gp.buttons[1]?.pressed;
    const canPlay = app === 'playing' || app === 'paused';
    const pressedNow = gripOn && !e.gripWas;
    e.gripWas = gripOn;
    if (pressedNow && !e.held && canPlay && !panel.visible && Math.abs(r - KART.wheelR) < 0.12 && Math.abs(tmpV.z) < 0.14) {
      e.held = true; e.a0 = a; e.w0 = wheel.angle;
      pulse(e.hand, 0.3, 30);
    }
    if (!gripOn) e.held = false;
    if (e.held) {
      sum += e.w0 + wrapAngle(a - e.a0); n++;
      // mão desenhada no aro
      const ang = a;
      tmpV.set(Math.cos(ang) * KART.wheelR, Math.sin(ang) * KART.wheelR, 0);
      piv.localToWorld(tmpV);
      e.glove.position.copy(tmpV);
    } else e.glove.position.copy(world);
    e.glove.visible = true;
  }
  wheel.grabbed = n > 0;
  if (wheel.grabbed) {
    wheel.angle = clamp(sum / n, -WHEEL_MAX, WHEEL_MAX);
  } else {
    const target = -stickSteer * WHEEL_MAX;
    wheel.angle += clamp(target - wheel.angle, -dt * 8, dt * 8);
  }
  kartModels[0].wheelRim.rotation.z = wheel.angle;
  return -wheel.angle / WHEEL_MAX;
}

// ---------- Teclado e controle (PC) ----------
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  if (!keys.has(e.code)) {
    if (e.code === 'Space' && app === 'playing') pendingItem = true;
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    if (e.code === 'KeyC') { save.view = save.view === 'chase' ? 'cockpit' : 'chase'; storeSave(save); }
    if (e.code === 'KeyF') { save.fps = !save.fps; storeSave(save); }
  }
  keys.add(e.code);
  sfx.unlock();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
let pendingItem = false;
const padPrev = [];

function readDesktopInput() {
  const k = (c) => keys.has(c);
  let throttle = (k('ArrowUp') || k('KeyW')) ? 1 : 0;
  let brake = (k('ArrowDown') || k('KeyS')) ? 1 : 0;
  let steer = ((k('ArrowRight') || k('KeyD')) ? 1 : 0) - ((k('ArrowLeft') || k('KeyA')) ? 1 : 0);
  for (const gp of navigator.getGamepads?.() || []) {
    if (!gp || gp.mapping !== 'standard') continue;
    throttle = Math.max(throttle, gp.buttons[7]?.value || 0, gp.buttons[0]?.pressed ? 1 : 0);
    brake = Math.max(brake, gp.buttons[6]?.value || 0);
    const ax = gp.axes[0] || 0;
    if (Math.abs(ax) > 0.12) steer = ax;
    if (gp.buttons[2]?.pressed && !padPrev[2] && app === 'playing') pendingItem = true;
    if (gp.buttons[9]?.pressed && !padPrev[9]) togglePause();
    gp.buttons.forEach((b, i) => { padPrev[i] = b.pressed; });
  }
  return { throttle, brake, steer };
}

function readVRInput(dt) {
  const R = hands.right?.source?.gamepad, Lg = hands.left?.source?.gamepad;
  const throttle = R?.buttons[0]?.value || 0;
  const brake = Lg?.buttons[0]?.value || 0;
  let stick = 0;
  for (const gp of [Lg, R]) {
    const ax = gp?.axes?.[2] || 0;
    if (Math.abs(ax) > Math.abs(stick)) stick = ax;
  }
  if (Math.abs(stick) < 0.12) stick = 0;
  const steer = updateWheel(dt, stick);
  return { throttle, brake, steer };
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Mouse (menu no PC) ----------
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
function setMouse(e) { mouse.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); }
renderer.domElement.addEventListener('pointermove', setMouse);
renderer.domElement.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  setMouse(e);
  if (!panel.visible) return;
  raycaster.setFromCamera(mouse, camera);
  doAction(panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv)));
});

// ---------- Corrida ----------
function startRace(ti = trackIndex, li = levelIndex) {
  levelIndex = li;
  save.level = li; storeSave(save);
  loadTrack(ti);
  app = 'playing';
  panel.hide();
  hud.last = '';
  updateHint();
}

function onEvent(type, d) {
  const mine = d.kart === 0;
  switch (type) {
    case 'count': banner.show(String(d.n), '', 0.9); sfx.beep(false); pulseBoth(0.2, 60); break;
    case 'go': banner.show('VAI!', '', 1.0, '#6fe08a'); sfx.beep(true); pulseBoth(0.6, 120); break;
    case 'lap':
      if (!mine) break;
      banner.show(d.final ? 'Última volta!' : `Volta ${d.lap}`, fmtTime(d.time), 1.8);
      sfx.lap(d.final);
      break;
    case 'finish':
      if (!mine) break;
      banner.show(`${d.pos}º lugar!`, fmtTime(d.time), 3, d.pos === 1 ? '#ffcf3a' : '#ffffff');
      sfx.fanfare(d.pos <= 3);
      if (d.pos <= 3) sfx.cheer();
      break;
    case 'item': if (mine) { sfx.item(); pulse('right', 0.3, 40); } break;
    case 'use':
      if (mine) { if (d.item === 'turbo') { sfx.turbo(); pulseBoth(0.5, 300); } else sfx.drop(); }
      break;
    case 'hit':
      if (mine) { sfx.spin(); banner.show('Rodou!', d.item === 'oleo' ? 'Mancha de óleo' : 'Casca de banana', 1.2, '#ff8a6a'); pulseBoth(0.9, 400); }
      else { const k = race.karts[d.kart]; if (dist2(k) < 900) sfx.spin(panOf(k)); }
      break;
    case 'wall': if (mine) { sfx.bump(d.power); pulseBoth(Math.min(1, d.power * 0.15), 80); } break;
    case 'bump': if (d.kart === 0 || d.other === 0) { sfx.bump(d.power * 0.7); pulseBoth(0.4, 60); } break;
    case 'jump': if (mine) sfx.jump(); break;
    case 'land': if (mine) { sfx.land(d.power); pulseBoth(Math.min(1, d.power * 0.12), 90); } break;
    case 'over': {
      const def = TRACKS[trackIndex], lv = LEVELS[levelIndex];
      const b = save.best[def.id] || {};
      const rec = { time: b.time == null || d.time < b.time, lap: b.lap == null || d.bestLap < b.lap };
      save.best[def.id] = { time: rec.time ? d.time : b.time, lap: rec.lap ? d.bestLap : b.lap };
      const key = `${def.id}:${lv.id}`;
      save.podium[key] = Math.min(save.podium[key] || 99, d.pos);
      storeSave(save);
      lastResult = { ...d, rec, track: trackIndex, level: levelIndex };
      setTimeout(() => { if (app === 'playing' && race?.state === 'done') { app = 'result'; showScreen('result'); } }, 1500);
      break;
    }
  }
}
function dist2(k) { const p = race.player; return (k.x - p.x) ** 2 + (k.z - p.z) ** 2; }
function panOf(k) {
  const p = race.player, dx = k.x - p.x, dz = k.z - p.z;
  return clamp((Math.cos(p.h) * dx - Math.sin(p.h) * dz) / 15, -1, 1);   // lado direito do kart: (cos h, -sen h)
}

function togglePause() {
  if (app === 'playing' && race?.state !== 'done') { app = 'paused'; showScreen('pause'); }
  else if (app === 'paused' && screen === 'pause') { app = 'playing'; panel.hide(); updateHint(); }
}

// ---------- Telas do menu ----------
const PW = 1024;
function showScreen(name) { screen = name; panel.show((p) => SCREENS[name](p)); updateHint(); }
const PODIUM = ['', '🥇', '🥈', '🥉'];

const SCREENS = {
  main(p) {
    p.title('Kart Maluco', 56);
    p.text('3 voltas contra 7 pilotos. Pegue as caixas "?" para ganhar itens.', PW / 2, 104, { size: 26, color: '#a9b0c2' });
    TRACKS.forEach((t, i) => {
      const b = save.best[t.id];
      const medal = PODIUM[save.podium[`${t.id}:${LEVELS[levelIndex].id}`]] || '';
      p.row(132 + i * 100, {
        num: i + 1, name: t.name, style: `${['Fácil', 'Média', 'Difícil'][i]}`, desc: t.desc,
        status: 'open', action: 'race:' + i, color: '#' + t.theme.curbA.toString(16).padStart(6, '0'),
        tag: `${medal} ${b?.time ? fmtTime(b.time) : 'Correr ▶'}`,
      });
    });
    p.text('Pilotos:', 60, 470, { size: 30, bold: true, align: 'left' });
    LEVELS.forEach((lv, i) => p.button(lv.name, 'level:' + i, 230 + i * 200, 436, 186, 68, { on: i === levelIndex, size: 30 }));
    const vr = renderer.xr.isPresenting;
    p.text(vr ? 'Gatilho direito acelera, esquerdo freia. Segure o volante com os botões laterais ou use o analógico.'
      : 'Setas ou WASD para dirigir, Espaço usa o item, C troca a câmera. No Quest, use "Entrar em VR".', PW / 2, 548, { size: 21, color: '#a9b0c2' });
    p.button('Opções', 'options', PW / 2 - 150, 590, 300, 74);
  },
  options(p) {
    p.title('Opções', 58);
    const line = (y, label, items, current, key) => {
      p.text(label, 50, y + 34, { size: 30, align: 'left', bold: true });
      const x0 = 470, w = (PW - 50 - x0 - (items.length - 1) * 10) / items.length;
      items.forEach(([val, txt], i) => p.button(txt, `set:${key}:${val}`, x0 + i * (w + 10), y, w, 68, { on: String(current) === String(val), size: 28 }));
    };
    line(130, 'Conforto no VR', [[1, 'Ligado'], [0, 'Desligado']], save.comfort ? 1 : 0, 'comfort');
    p.text('Escurece as bordas da visão nas curvas e saltos (ajuda contra enjoo).', PW / 2, 228, { size: 22, color: '#a9b0c2' });
    line(270, 'Câmera no PC', [['chase', 'Atrás'], ['cockpit', 'Cabine']], save.view, 'view');
    line(370, 'Mostrar FPS', [[1, 'Sim'], [0, 'Não']], save.fps ? 1 : 0, 'fps');
    p.button('Voltar', 'back', PW / 2 - 150, 580, 300, 76, { on: true });
  },
  pause(p) {
    p.title('Pausa', 64);
    const pl = race.player;
    p.text(`${TRACKS[trackIndex].name} · ${pl.pos}º lugar · volta ${Math.min(race.laps, pl.lap + 1)}/${race.laps}`, PW / 2, 124, { size: 30 });
    const vr = renderer.xr.isPresenting;
    const items = [['Continuar', 'resume'], ...(vr ? [['Recentralizar', 'recenter']] : []), ['Reiniciar corrida', 'restart'], ['Opções', 'options'], ['Sair para o menu', 'quit']];
    items.forEach(([t, a], i) => p.button(t, a, PW / 2 - 230, 168 + i * 100, 460, 82, { on: i === 0 }));
  },
  result(p) {
    const r = lastResult, t = TRACKS[r.track];
    p.title(r.pos === 1 ? 'Vitória!' : `${r.pos}º lugar`, 56);
    p.text(`${t.name} · ${LEVELS[r.level].name} · seu tempo ${fmtTime(r.time)} · melhor volta ${fmtTime(r.bestLap)}`, PW / 2, 104, { size: 24, color: '#a9b0c2' });
    const recs = [r.rec.time && 'novo recorde da pista', r.rec.lap && 'nova volta mais rápida'].filter(Boolean);
    if (recs.length) p.text('★ ' + recs.join(' e ') + '!', PW / 2, 138, { size: 26, color: '#ffcf3a', bold: true });
    r.results.forEach((x, i) => {
      const col = i < 4 ? 0 : 1, row = i % 4;
      const X = 70 + col * 450, Y = 182 + row * 56;
      const me = x.index === 0;
      p.text(`${i + 1}º`, X, Y, { size: 30, bold: true, align: 'left', color: me ? '#ffcf3a' : '#f4f6fb' });
      p.ctx.fillStyle = '#' + x.color.toString(16).padStart(6, '0'); p.ctx.fillRect(X + 56, Y - 14, 14, 28);
      p.text(x.name, X + 84, Y, { size: 28, bold: me, align: 'left', color: me ? '#ffcf3a' : '#f4f6fb' });
      p.text(x.estimated ? '—' : fmtTime(x.time), X + 390, Y, { size: 26, align: 'right', color: '#a9b0c2' });
    });
    const btns = [];
    if (r.track < TRACKS.length - 1) btns.push([`Próxima: ${TRACKS[r.track + 1].name}`, 'race:' + (r.track + 1)]);
    btns.push(['Correr de novo', 'race:' + r.track]);
    btns.push(['Menu', 'menu']);
    const w = 300, gap = 16, x0 = (PW - (btns.length * w + (btns.length - 1) * gap)) / 2;
    btns.forEach(([tx, a], i) => p.button(tx, a, x0 + i * (w + gap), 420, w, 84, { on: i === 0, size: 28 }));
    p.text(r.pos <= 3 ? 'Pódio! Tente outro nível de pilotos.' : 'Dica: na curva, solte o acelerador antes, não depois.', PW / 2, 560, { size: 24, color: '#a9b0c2' });
  },
};

function doAction(a) {
  if (!a) return;
  sfx.unlock();
  sfx.click();
  if (a.startsWith('race:')) { startRace(Number(a.slice(5))); return; }
  if (a.startsWith('level:')) { levelIndex = Number(a.slice(6)); save.level = levelIndex; storeSave(save); showScreen('main'); return; }
  if (a.startsWith('set:')) {
    const [, key, val] = a.split(':');
    if (key === 'comfort') save.comfort = val === '1';
    else if (key === 'fps') save.fps = val === '1';
    else if (key === 'view') save.view = val;
    storeSave(save);
    showScreen('options');
    return;
  }
  switch (a) {
    case 'options': optionsBack = screen; showScreen('options'); break;
    case 'back': showScreen(optionsBack === 'options' ? 'main' : optionsBack); break;
    case 'menu': case 'quit': goMenu(); break;
    case 'resume': app = 'playing'; panel.hide(); updateHint(); break;
    case 'restart': startRace(trackIndex); break;
    case 'recenter': recenter(); break;
  }
}

function goMenu() {
  app = 'menu';
  loadTrack(trackIndex);
  showScreen('main');
}

function onSelect(entry) {
  sfx.unlock();
  if (panel.visible && entry.hoverIndex >= 0) doAction(panel.actionAt(entry.hoverIndex));
}

function pollVRButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[5] && !e.prev[5]) togglePause();
    if (b[4] && !e.prev[4] && app === 'playing') pendingItem = true;
    e.prev = b;
  }
}

// ---------- Raio do menu ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateMenuRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1;
  for (const e of ctrls) {
    e.hoverIndex = -1;
    e.laser.visible = vr && panel.visible && !!e.source;
    if (!e.laser.visible) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(tmpQ);
    rayDir.set(0, 0, -1).applyQuaternion(tmpQ);
    raycaster.set(rayOrigin, rayDir);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    e.laser.scale.z = hit ? hit.distance : 2;
    e.hoverIndex = panel.pick(hit?.uv);
    if (e.hoverIndex >= 0) hover = e.hoverIndex;
  }
  if (!vr && panel.visible) {
    raycaster.setFromCamera(mouse, camera);
    hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
    renderer.domElement.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
  } else renderer.domElement.style.cursor = 'default';
  if (panel.visible) panel.setHover(hover);
}

// ---------- Karts na tela ----------
let seatY = null;
function syncKarts(dt) {
  const vr = renderer.xr.isPresenting;
  const tr = race.track;
  race.karts.forEach((k, i) => {
    const m = kartModels[i];
    m.group.position.set(k.x, k.y, k.z);
    const mine = i === 0;
    const spin = mine && vr ? 0 : Math.sin(k.spinAngle) * 0.6 + (k.spin > 0 ? k.spinAngle : 0);
    m.group.rotation.y = k.h + (mine && vr ? 0 : spin);
    const along = k.fx * k.proj.tx + k.fz * k.proj.tz;
    const pitch = k.airborne ? clamp(k.vy * 0.04, -0.3, 0.3) : Math.atan(tr.gradeAt(k.s) * along);
    m.body.rotation.x = mine && vr ? 0 : lerp(m.body.rotation.x, pitch, Math.min(1, dt * 12));
    m.body.rotation.z = mine && vr ? 0 : -k.steer * Math.min(1, Math.abs(k.v) / 20) * 0.06;
    for (const w of m.wheels) w.rotation.x -= k.v * dt / 0.2;
    for (const f of m.front) f.rotation.y = -k.steer * 0.45;
    if (!mine) m.wheelRim.rotation.z = -k.steer * WHEEL_MAX;
    m.shadow.position.y = (tr.heightAt(k.s) - k.y) + 0.03;
    m.driver.visible = !(mine && (vr || save.view === 'cockpit' || app === 'menu'));
  });
  // assento (cabeça) segue o kart do jogador, sem inclinar
  const p = race.player;
  if (seatY == null) seatY = p.y;
  seatY = lerp(seatY, p.y, Math.min(1, dt * (p.airborne ? 6 : 14)));
  const c = Math.cos(p.h), s = Math.sin(p.h);
  // ponto (0, headY, headZ) do kart girado por h
  seat.position.set(p.x + s * KART.headZ, seatY + KART.headY, p.z + c * KART.headZ);
  seat.rotation.set(0, p.h, 0);
  if (!dt) seatY = p.y;
}

// Câmera do PC
const chase = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
function updateDesktopCamera(dt) {
  const p = race.player;
  if (save.view === 'cockpit' || app === 'menu') {
    seat.getWorldPosition(tmpV);
    camera.position.copy(tmpV);
    camera.rotation.set(-0.12, p.h, 0, 'YXZ');
    chase.init = false;
    if (app === 'menu') { camera.position.y += 0.05; camera.rotation.set(-0.05, p.h, 0, 'YXZ'); }
    return;
  }
  const back = 4.4, up = 1.9;
  const want = tmpV.set(p.x + Math.sin(p.h) * back, p.y + up, p.z + Math.cos(p.h) * back);
  if (!chase.init) { chase.pos.copy(want); chase.init = true; }
  chase.pos.lerp(want, Math.min(1, dt * 6));
  const ground = race.track.heightAt(race.track.project(chase.pos.x, chase.pos.z, p.proj.i).s);
  chase.pos.y = Math.max(chase.pos.y, ground + 0.8);
  camera.position.copy(chase.pos);
  chase.look.set(p.x - Math.sin(p.h) * 3, p.y + 0.8, p.z - Math.cos(p.h) * 3);
  camera.lookAt(chase.look);
}

function syncItems() {
  for (let i = 0; i < boxMeshes.length; i++) {
    const b = race.boxes[i], m = boxMeshes[i];
    m.visible = b.respawn <= 0;
    m.rotation.set(0.4, time * 1.6 + i, 0.3);
    m.position.y = b.y + 0.9 + Math.sin(time * 2 + i) * 0.1;
  }
  const live = new Set(race.hazards);
  for (const [hz, m] of hazardMeshes) if (!live.has(hz)) { m.parent?.remove(m); hazardMeshes.delete(hz); }
  for (const hz of race.hazards) {
    if (hazardMeshes.has(hz)) continue;
    const m = makeHazard(hz.type);
    m.position.set(hz.x, hz.y + 0.03, hz.z);
    if (hz.type === 'casca') m.rotation.y = Math.random() * 6;
    world.group.add(m);
    hazardMeshes.set(hz, m);
  }
}

// ---------- HTML (PC) ----------
const hintEl = document.getElementById('hint');
const fpsEl = document.getElementById('fps');
const hudBox = document.getElementById('hudbox');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  hintEl.textContent = app === 'playing'
    ? 'Setas/WASD dirigem · Espaço usa o item · C troca a câmera · Esc pausa'
    : 'Clique nas opções do painel · No Quest, use o botão "Entrar em VR"';
}

const vrBtn = document.getElementById('vr');
async function setupVR() {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Laço principal ----------
let acc = 0, lastT = performance.now();
let fpsFrames = 0, fpsTime = 0;
let vigOp = 0, lastH = 0;

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  time += dt;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) recenter();
  if (vr) pollVRButtons();

  const inp = vr ? readVRInput(dt) : readDesktopInput();
  if (!vr) kartModels[0].wheelRim.rotation.z = -race.player.steer * WHEEL_MAX;
  if (app === 'playing' && race) {
    race.robotPlayer = dev.autoplay;
    acc += dt;
    const n = Math.min(12, Math.floor(acc / DT));
    for (let i = 0; i < n; i++) {
      race.step({ ...inp, item: pendingItem });
      pendingItem = false;
    }
    acc -= n * DT;
  } else { acc = 0; pendingItem = false; }

  syncKarts(dt);
  syncItems();
  hud.mesh.visible = vr;
  hud.draw(race);
  banner.update();

  // som do motor
  const p = race.player;
  const racing = app === 'playing';
  sfx.motor(racing, Math.abs(p.v) / PHYS.vboost, race.state === 'race' ? inp.throttle : 0,
    (p.onGrass && Math.abs(p.v) > 4 ? 0.6 : 0) + (Math.abs(p.steer) > 0.7 && Math.abs(p.v) > 15 ? 0.4 : 0) + (p.spin > 0 ? 1 : 0));

  // conforto: escurece as bordas quando o kart gira rápido ou voa
  const yawRate = Math.abs(wrapAngle(p.h - lastH)) / Math.max(dt, 1e-3);
  lastH = p.h;
  const want = vr && save.comfort && app === 'playing' ? clamp((yawRate - 0.4) * 0.45 + (p.airborne ? 0.35 : 0) + (p.spin > 0 ? 0.6 : 0), 0, 0.8) : 0;
  vigOp = lerp(vigOp, want, Math.min(1, dt * 8));
  vignette.material.opacity = vigOp;
  vignette.visible = vigOp > 0.01;

  if (!vr) updateDesktopCamera(dt);
  hudBox.style.display = !vr && app !== 'menu' ? 'block' : 'none';
  updateMenuRays();

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
  renderer.render(scene, camera);
}

// Para testes no console: kart.startRace(0); kart.dev.autoplay = true; kart.dev.advance(30)
const dev = { autoplay: false };
dev.advance = (sec) => { for (let i = 0; i < sec * 72; i++) { lastT = performance.now() - 1000 / 72; frame(); } };
window.kart = { get race() { return race; }, get app() { return app; }, save, startRace, doAction, dev, camera, renderer };

placeOverlays();
goMenu();
renderer.setAnimationLoop(frame);
