// Monta o mundo 3D de uma pista: asfalto, zebras, grama, muros, cenário, caixas de item e os
// karts. Tudo com materiais simples e instâncias, para rodar liso no Quest.
import * as THREE from '../vendor/three/three.module.js';
import { rng } from './util.js';

const col = new THREE.Color();

// ---------- Pista ----------
function stationsOf(track) {
  const S = [];
  for (let i = 0; i <= track.N; i++) S.push(i * track.step);
  for (const r of track.ramps) S.push(r.s, r.s + r.len - 0.002, r.s + r.len + 0.002);
  return S.sort((a, b) => a - b);
}

function buildTrackMesh(track, th) {
  const S = stationsOf(track);
  const st = S.map(s => {
    const p = track.pointAt(s, 0);
    return { s, x: p.x, z: p.z, lx: p.tz, lz: -p.tx, h: track.heightAt(s) };
  });
  const pos = [], cols = [];
  const hw = track.halfWidth, W = track.wall;
  const inRamp = (s) => track.ramps.some(r => s >= r.s && s < r.s + r.len);
  const quad = (a, b, la, lb, ya, yb, c) => {
    const P = (q, lat, y) => [q.x + q.lx * lat, y(q.h), q.z + q.lz * lat];
    const v = [P(a, la, ya), P(a, lb, yb), P(b, la, ya), P(b, lb, yb)];
    for (const i of [0, 2, 1, 1, 2, 3]) { pos.push(...v[i]); cols.push(c.r, c.g, c.b); }
  };
  const flat = (o) => (h) => h + o;
  const roadC = new THREE.Color(th.road), grassC = new THREE.Color(th.grass), wallC = new THREE.Color(th.wall);
  const curbA = new THREE.Color(th.curbA), curbB = new THREE.Color(th.curbB), white = new THREE.Color(0xffffff);
  const rampA = new THREE.Color(0xf2c518), rampB = new THREE.Color(0x222222), bankC = new THREE.Color(th.ground);
  const r = rng(5);
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i], b = st[i + 1], sm = (a.s + b.s) / 2;
    const k = Math.floor(sm / 2) % 2;
    const ramp = inRamp(sm);
    // asfalto (com leve variação de tom) ou rampa listrada
    col.copy(ramp ? (Math.floor(sm / 1) % 2 ? rampA : rampB) : roadC);
    if (!ramp) col.multiplyScalar(0.94 + 0.12 * ((Math.floor(sm / 5) * 7919) % 13) / 13);
    quad(a, b, -hw, hw, flat(0), flat(0), col);
    if (!ramp && Math.floor(sm / 3) % 2 === 0) quad(a, b, -0.12, 0.12, flat(0.01), flat(0.01), white);
    for (const side of [-1, 1]) {
      // zebra, grama, muro e barranco por fora
      quad(a, b, side * (hw - 0.5), side * (hw + 0.5), flat(0.02), flat(0.02), k ? curbA : curbB);
      col.copy(grassC).multiplyScalar(0.92 + 0.1 * r());
      quad(a, b, side * (hw + 0.5), side * W, flat(0), flat(0), col);
      const wc = Math.floor(sm / 3) % 2 ? wallC : white;
      quad(a, b, side * W, side * W, flat(0), flat(0.9), wc);
      quad(a, b, side * W, side * (W + 0.4), flat(0.9), flat(0.9), wc);
      quad(a, b, side * (W + 0.4), side * (W + 2 + a.h * 1.6), flat(0.9), () => -0.02, bankC);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function startLine(track) {
  const grp = new THREE.Group();
  const p = track.pointAt(0.6, 0);
  const yaw = Math.atan2(-p.tx, -p.tz);
  const tex = canvasTex(256, 32, (g, w, h) => {
    const n = 16;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * w / n, j * h / 2, w / n, h / 2); }
  });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(track.halfWidth * 2, 1.2), new THREE.MeshBasicMaterial({ map: tex }));
  line.rotation.order = 'YXZ';
  line.rotation.set(-Math.PI / 2, yaw, 0);
  line.position.set(p.x, track.heightAt(0.6) + 0.03, p.z);
  grp.add(line);
  // pórtico de largada
  const W = track.wall + 0.3;
  const postM = new THREE.MeshLambertMaterial({ color: 0x333a44 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), postM);
    post.position.set(p.x + p.tz * W * side, p.y + 3, p.z - p.tx * W * side);
    grp.add(post);
  }
  const banTex = canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#e23b3b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * w / 32, j * 12 + (j ? h - 24 : 0), w / 32, 12); }
    g.fillStyle = '#fff'; g.font = 'bold 72px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('KART MALUCO', w / 2, h / 2 + 4);
  });
  const ban = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.5, 1.3, 0.3), new THREE.MeshBasicMaterial({ map: banTex }));
  ban.position.set(p.x, p.y + 6, p.z);
  ban.rotation.y = yaw;
  grp.add(ban);
  return grp;
}

// ---------- Cenário ----------
function scatter(track, count, minOut, maxOut, seed) {
  const r = rng(seed), out = [];
  let tries = 0;
  while (out.length < count && tries++ < count * 30) {
    const s = r() * track.length;
    const side = r() < 0.5 ? -1 : 1;
    const p = track.pointAt(s, 0);
    const d = track.wall + minOut + p.y * 1.6 + r() * (maxOut - minOut);
    const x = p.x + p.tz * d * side, z = p.z - p.tx * d * side;
    const q = track.project(x, z, -1);
    if (Math.abs(q.lat) < track.wall + minOut + q.y * 1.6) continue;
    out.push({ x, z, r: r() });
  }
  return out;
}

function instanced(geo, mat, items, place) {
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const o = new THREE.Object3D();
  items.forEach((it, i) => { place(o, it); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
  m.instanceMatrix.needsUpdate = true;
  return m;
}

function buildTrees(track, th) {
  const grp = new THREE.Group();
  const near = scatter(track, 160, 3, 30, 9), far = scatter(track, 140, 30, 90, 10);
  const all = near.concat(far);
  if (th.tree === 'pine') {
    grp.add(instanced(new THREE.CylinderGeometry(0.25, 0.35, 2, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }), all,
      (o, t) => { const s = 0.8 + t.r * 0.8; o.position.set(t.x, s, t.z); o.scale.setScalar(s); }));
    grp.add(instanced(new THREE.ConeGeometry(1.8, 5, 7), new THREE.MeshLambertMaterial({ color: 0x2f7a3a }), all,
      (o, t) => { const s = 0.8 + t.r * 0.8; o.position.set(t.x, 2 * s + 2.2 * s, t.z); o.scale.setScalar(s); }));
  } else if (th.tree === 'palm') {
    grp.add(instanced(new THREE.CylinderGeometry(0.18, 0.3, 7, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a42 }), all,
      (o, t) => { const s = 0.8 + t.r * 0.6; o.position.set(t.x, 3.5 * s, t.z); o.rotation.set(0.15 * (t.r - 0.5), 0, 0.2 * (t.r - 0.5)); o.scale.setScalar(s); }));
    const leaf = new THREE.ConeGeometry(2.6, 1.2, 7);
    grp.add(instanced(leaf, new THREE.MeshLambertMaterial({ color: 0x3f9a3a }), all,
      (o, t) => { const s = 0.8 + t.r * 0.6; o.position.set(t.x, 7 * s + 0.2, t.z); o.rotation.set(Math.PI, t.r * 6, 0); o.scale.set(s, s * 0.6, s); }));
  } else {
    const r = rng(4);
    grp.add(instanced(new THREE.DodecahedronGeometry(1.5, 0), new THREE.MeshLambertMaterial({ color: 0x3a3236, flatShading: true }), all,
      (o, t) => { const s = 0.6 + t.r * 2.2; o.position.set(t.x, s * 0.6, t.z); o.rotation.set(r() * 3, r() * 3, r() * 3); o.scale.set(s, s * (0.6 + r() * 0.6), s); }));
  }
  return grp;
}

function bounds(track) {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (let i = 0; i < track.N; i++) { a = Math.min(a, track.x[i]); b = Math.max(b, track.x[i]); c = Math.min(c, track.z[i]); d = Math.max(d, track.z[i]); }
  return { minX: a, maxX: b, minZ: c, maxZ: d, cx: (a + b) / 2, cz: (c + d) / 2, size: Math.max(b - a, d - c) };
}

function buildDecor(track, th, B) {
  const grp = new THREE.Group();
  if (th.decor === 'beach') {
    // mar de um lado, com barquinhos
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ color: 0x2a8fd0 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(B.maxX + 600 + 25, 0.05, B.cz);
    grp.add(sea);
    const r = rng(2);
    for (let i = 0; i < 6; i++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      const sail = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4, 3), new THREE.MeshLambertMaterial({ color: [0xff6a3a, 0xf2c518, 0xffffff][i % 3] }));
      sail.position.y = 2.4; boat.add(hull, sail);
      boat.position.set(B.maxX + 60 + r() * 200, 0.3, B.minZ + r() * (B.maxZ - B.minZ));
      boat.rotation.y = r() * 6;
      grp.add(boat);
    }
  } else if (th.decor === 'volcano') {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(120, 110, 18, 1, true), new THREE.MeshLambertMaterial({ color: 0x2c2024, flatShading: true }));
    cone.position.set(B.cx - 40, 50, B.minZ - 220);
    grp.add(cone);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(24, 18), new THREE.MeshBasicMaterial({ color: 0xff6a1e }));
    glow.rotation.x = -Math.PI / 2; glow.position.set(cone.position.x, 104, cone.position.z);
    grp.add(glow);
    const lavaM = new THREE.MeshBasicMaterial({ color: 0xff5a10 });
    for (const p of scatter(track, 16, 12, 60, 21)) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(4 + p.r * 8, 14), lavaM);
      pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, 0.02, p.z);
      grp.add(pool);
    }
    // lava embaixo do salto grande
    const rp = track.ramps.at(-1);
    if (rp) {
      const p = track.pointAt(rp.s + rp.len + 5, 0);
      const lava = new THREE.Mesh(new THREE.PlaneGeometry(track.wall * 2 + 30, 8), lavaM);
      lava.rotation.set(-Math.PI / 2, 0, Math.atan2(p.tx, p.tz));
      lava.position.set(p.x, -0.01, p.z);
      grp.add(lava);
    }
  } else {
    // parque: lago e arquibancada
    const lake = new THREE.Mesh(new THREE.CircleGeometry(30, 24), new THREE.MeshLambertMaterial({ color: 0x3a90d0 }));
    lake.rotation.x = -Math.PI / 2; lake.position.set(B.cx, 0.03, B.cz); lake.scale.set(1.4, 1, 1);
    const q = track.project(B.cx, B.cz, -1);
    if (Math.abs(q.lat) > track.wall + 40) grp.add(lake);
  }
  // arquibancada com torcida perto da largada
  const p = track.pointAt(25, 0);
  const side = th.decor === 'beach' ? 1 : -1;
  const d = track.wall + 6;
  const stand = new THREE.Group();
  const yaw = Math.atan2(-p.tx, -p.tz);
  for (let row = 0; row < 4; row++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(40, 0.8, 1.6), new THREE.MeshLambertMaterial({ color: 0x8a8f99 }));
    step.position.set(0, 0.4 + row * 0.8, -side * row * 1.6);
    stand.add(step);
  }
  const r = rng(6), fans = [];
  for (let row = 0; row < 4; row++) for (let i = 0; i < 40; i++) if (r() < 0.75) fans.push({ x: -19.5 + i, y: 1.2 + row * 0.8, z: -side * row * 1.6, c: r() });
  const fanMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.8, 0.4), new THREE.MeshLambertMaterial(), fans.length);
  const o = new THREE.Object3D();
  const palette = [0xe23b3b, 0x2f7fd1, 0xf2c518, 0x3fbf5f, 0xffffff, 0xff8a1e];
  fans.forEach((f, i) => { o.position.set(f.x, f.y, f.z); o.updateMatrix(); fanMesh.setMatrixAt(i, o.matrix); fanMesh.setColorAt(i, col.set(palette[Math.floor(f.c * palette.length)])); });
  stand.add(fanMesh);
  stand.position.set(p.x + p.tz * d * side, p.y, p.z - p.tx * d * side);
  stand.rotation.y = yaw + Math.PI / 2;
  grp.add(stand);
  stand.userData.fans = fanMesh;
  grp.userData.stand = stand;
  return grp;
}

// Tudo de uma pista num grupo (trocar de pista = tirar um grupo e pôr outro).
export function buildWorld(track, th) {
  const group = new THREE.Group();
  group.add(new THREE.HemisphereLight(th.hemiSky, th.hemiGround, 1.6));
  const sun = new THREE.DirectionalLight(th.sun, 1.8);
  sun.position.set(80, 140, 60);
  group.add(sun);
  const B = bounds(track);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: th.ground }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(B.cx, -0.05, B.cz);
  group.add(ground);
  group.add(buildTrackMesh(track, th));
  group.add(startLine(track));
  group.add(buildTrees(track, th));
  const decor = buildDecor(track, th, B);
  group.add(decor);
  return { group, background: new THREE.Color(th.sky), fog: new THREE.Fog(th.fog, 80, 420), bounds: B, decor };
}

export function disposeGroup(g) {
  g.traverse(o => {
    o.geometry?.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) { m.map?.dispose(); m.dispose(); }
  });
}

// ---------- Caixas de item e obstáculos ----------
const boxTex = () => canvasTex(128, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#ff5ad0'); gr.addColorStop(0.5, '#5ad0ff'); gr.addColorStop(1, '#ffe05a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = '#fff'; g.font = 'bold 90px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('?', w / 2, h / 2 + 4);
});

export function makeItemBoxes(boxes) {
  const mat = new THREE.MeshBasicMaterial({ map: boxTex(), transparent: true, opacity: 0.9 });
  const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  return boxes.map(b => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(b.x, b.y + 0.9, b.z);
    return m;
  });
}

export function makeHazard(type) {
  if (type === 'oleo') {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16), new THREE.MeshLambertMaterial({ color: 0x111116, emissive: 0x15151f }));
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  const g = new THREE.Group();
  const peel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.1, 6, 10, Math.PI * 1.2), new THREE.MeshLambertMaterial({ color: 0xf5d020 }));
  peel.rotation.x = Math.PI / 2;
  peel.position.y = 0.12;
  g.add(peel);
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 5), new THREE.MeshLambertMaterial({ color: 0xe8c418 }));
    leaf.position.set(Math.cos(i * 2.1) * 0.25, 0.1, Math.sin(i * 2.1) * 0.25);
    leaf.rotation.set(Math.PI / 2, 0, i * 2.1 + Math.PI / 2);
    g.add(leaf);
  }
  return g;
}

// ---------- Kart ----------
export const KART = { headY: 0.95, headZ: 0.22, wheelY: 0.6, wheelZ: -0.2, wheelR: 0.18, wheelTilt: 0.45 };

export function makeKart(color, { player = false } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x24262c });
  const metal = new THREE.MeshLambertMaterial({ color: 0xb8bcc4 });
  // chassi
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 1.7), dark); floor.position.y = 0.2; body.add(floor);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.28, 0.55), paint); nose.position.set(0, 0.32, -0.72); body.add(nose);
  const noseTop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.5), paint); noseTop.position.set(0, 0.5, -0.45); noseTop.rotation.x = 0.35; body.add(noseTop);
  for (const sx of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.9), paint); pod.position.set(sx * 0.52, 0.32, 0.05); body.add(pod);
  }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.14), metal); bumper.position.set(0, 0.3, 0.92); body.add(bumper);
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.35), metal); engine.position.set(0.22, 0.42, 0.68); body.add(engine);
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), dark); exhaust.rotation.x = Math.PI / 2; exhaust.position.set(0.22, 0.45, 0.95); body.add(exhaust);
  mergeByMaterial(body, [...body.children]);
  // banco
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.45), dark); seat.position.set(0, 0.32, 0.25); body.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1), dark); back.position.set(0, 0.58, 0.48); back.rotation.x = -0.25; body.add(back);
  // volante
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(0, KART.wheelY, KART.wheelZ);
  wheelPivot.rotation.x = KART.wheelTilt;
  body.add(wheelPivot);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), metal);
  column.rotation.x = Math.PI / 2; column.position.z = -0.25; wheelPivot.add(column);
  const wheelRim = new THREE.Group(); wheelPivot.add(wheelRim);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(KART.wheelR, 0.022, 8, 24), new THREE.MeshLambertMaterial({ color: 0x1a1a1e }));
  wheelRim.add(rim);
  const spokeM = new THREE.MeshLambertMaterial({ color: 0x555a66 });
  for (const a of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, KART.wheelR, 0.02), spokeM);
    sp.position.set(Math.sin(a) * KART.wheelR / 2, -Math.cos(a) * KART.wheelR / 2, 0); sp.rotation.z = a; wheelRim.add(sp);
  }
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.03), new THREE.MeshLambertMaterial({ color: 0xf2c518 }));
  mark.position.set(0, KART.wheelR, 0); wheelRim.add(mark);
  // rodas
  const tire = new THREE.CylinderGeometry(0.2, 0.2, 0.22, 12); tire.rotateZ(Math.PI / 2);
  const tireM = new THREE.MeshLambertMaterial({ color: 0x18181b });
  const wheels = [], front = [];
  for (const [x, z, f] of [[-0.62, -0.58, 1], [0.62, -0.58, 1], [-0.64, 0.6, 0], [0.64, 0.6, 0]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.2, z);
    const w = new THREE.Mesh(tire, tireM);
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.08, 0.08), metal); w.add(hub);
    pivot.add(w); body.add(pivot);
    wheels.push(w); if (f) front.push(pivot);
  }
  // piloto
  const driver = new THREE.Group();
  const suit = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.3, 4, 8), paint); suit.position.set(0, 0.62, 0.25); driver.add(suit);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), new THREE.MeshLambertMaterial({ color: 0xffffff })); helmet.position.set(0, KART.headY, KART.headZ); driver.add(helmet);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 6, 16), paint); stripe.position.copy(helmet.position); stripe.rotation.y = Math.PI / 2; driver.add(stripe);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.08), new THREE.MeshLambertMaterial({ color: 0x1a2a3a })); visor.position.set(0, KART.headY + 0.02, KART.headZ - 0.16); driver.add(visor);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 3, 6), paint);
    arm.position.set(sx * 0.18, 0.68, 0.0); arm.rotation.x = 1.1; driver.add(arm);
  }
  mergeByMaterial(driver, [...driver.children]);
  body.add(driver);
  // sombra redonda
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.6 }));
  shadow.rotation.x = -Math.PI / 2;
  g.add(shadow);
  return { group: g, body, wheels, front, wheelPivot, wheelRim, driver, shadow, player };
}

// Junta várias peças paradas num objeto por material (menos chamadas de desenho no Quest).
function mergeByMaterial(parent, meshes) {
  const byMat = new Map();
  for (const m of meshes) {
    if (!m.isMesh) continue;
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(m);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const pos = [], nor = [];
    for (const m of list) {
      m.updateMatrix();
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
      parent.remove(m);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    parent.add(new THREE.Mesh(g, mat));
  }
}

let _shadowTex = null;
function shadowTex() {
  if (_shadowTex) return _shadowTex;
  _shadowTex = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  return _shadowTex;
}

// Escurecimento nas bordas da visão (conforto no VR).
export function makeVignette() {
  const tex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.5);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  m.position.z = -0.2;
  m.renderOrder = 20;
  return m;
}
