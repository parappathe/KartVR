// Painel do kart: posição, volta, tempo, item, velocidade e minimapa. Desenhado num canvas;
// no VR vira uma tela no painel do kart, no PC o mesmo canvas aparece no canto da tela.
import * as THREE from '../vendor/three/three.module.js';
import { fmtTime } from './util.js';
import { ITEM_NAMES } from './race.js';

const W = 640, H = 300;

export class Hud {
  constructor(track) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42 * H / W),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true }));
    this.setTrack(track);
    this.last = '';
  }

  setTrack(track) {
    this.track = track;
    if (!track) return;
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (let i = 0; i < track.N; i++) { a = Math.min(a, track.x[i]); b = Math.max(b, track.x[i]); c = Math.min(c, track.z[i]); d = Math.max(d, track.z[i]); }
    const box = 200, sc = (box - 20) / Math.max(b - a, d - c);
    this.map = { x0: W - box - 10 + (box - (b - a) * sc) / 2, y0: 50 + (box - (d - c) * sc) / 2, minX: a, minZ: c, sc };
  }

  mp(x, z) { const m = this.map; return [m.x0 + (x - m.minX) * m.sc, m.y0 + (z - m.minZ) * m.sc]; }

  draw(race) {
    if (!race) return;
    const p = race.player;
    const key = `${p.pos}|${p.lap}|${Math.floor(race.t * 10)}|${p.item}|${Math.round(p.speedKmh)}`;
    if (key === this.last) return;
    this.last = key;
    const g = this.ctx, tr = race.track;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(14,16,22,0.82)'; rr(g, 2, 2, W - 4, H - 4, 24); g.fill();
    g.strokeStyle = '#ffcf3a'; g.lineWidth = 4; g.stroke();
    g.textBaseline = 'middle';
    // posição
    g.fillStyle = '#ffcf3a'; g.font = 'bold 120px sans-serif'; g.textAlign = 'left';
    g.fillText(`${p.pos}º`, 26, 90);
    g.fillStyle = '#c9cfdc'; g.font = 'bold 34px sans-serif';
    g.fillText(`de ${race.karts.length}`, 32, 160);
    // volta e tempo
    const lap = Math.min(race.laps, Math.max(1, p.lap + 1));
    g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif';
    g.fillText(p.finished ? 'Chegada!' : `Volta ${lap}/${race.laps}`, 200, 60);
    g.font = '36px monospace';
    g.fillText(fmtTime(Math.max(0, p.finished ? p.finishTime : race.t)), 200, 110);
    g.fillStyle = '#c9cfdc'; g.font = '26px sans-serif';
    if (p.lapTimes.length) g.fillText(`Melhor volta ${fmtTime(Math.min(...p.lapTimes))}`, 200, 152);
    // velocidade
    g.fillStyle = '#fff'; g.font = 'bold 56px sans-serif';
    g.fillText(`${Math.round(p.speedKmh)}`, 30, 235);
    g.fillStyle = '#c9cfdc'; g.font = '26px sans-serif';
    g.fillText('km/h', 30, 280);
    // item
    g.fillStyle = 'rgba(255,255,255,0.08)'; rr(g, 200, 190, 220, 90, 16); g.fill();
    g.strokeStyle = p.item ? '#ffcf3a' : '#555'; g.lineWidth = 3; g.stroke();
    g.textAlign = 'center';
    if (p.item) {
      drawItemIcon(g, p.item, 245, 235);
      g.fillStyle = '#fff'; g.font = 'bold 24px sans-serif'; g.textAlign = 'left';
      wrapText(g, ITEM_NAMES[p.item], 285, 235, 130);
    } else { g.fillStyle = '#777'; g.font = '24px sans-serif'; g.fillText('sem item', 310, 235); }
    // minimapa
    g.strokeStyle = '#6a7080'; g.lineWidth = 8; g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= tr.N; i += 4) { const [x, y] = this.mp(tr.x[i % tr.N], tr.z[i % tr.N]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.stroke();
    const [sx, sy] = this.mp(tr.x[0], tr.z[0]);
    g.fillStyle = '#fff'; g.fillRect(sx - 6, sy - 3, 12, 6);
    for (let i = race.karts.length - 1; i >= 0; i--) {
      const k = race.karts[i];
      const [x, y] = this.mp(k.x, k.z);
      g.fillStyle = '#' + k.color.toString(16).padStart(6, '0');
      g.beginPath(); g.arc(x, y, i === 0 ? 10 : 6, 0, Math.PI * 2); g.fill();
      if (i === 0) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); }
    }
    this.tex.needsUpdate = true;
  }
}

export function drawItemIcon(g, item, x, y) {
  g.save(); g.translate(x, y);
  if (item === 'turbo') {
    g.fillStyle = '#ff8a1e';
    g.beginPath(); g.moveTo(-14, -26); g.lineTo(12, -4); g.lineTo(0, -4); g.lineTo(14, 26); g.lineTo(-12, 2); g.lineTo(0, 2); g.closePath(); g.fill();
  } else if (item === 'casca') {
    g.strokeStyle = '#f5d020'; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.arc(0, -8, 22, 0.3, Math.PI - 0.3); g.stroke();
  } else {
    g.fillStyle = '#222'; g.beginPath(); g.ellipse(0, 0, 28, 18, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5a5a8a'; g.beginPath(); g.ellipse(-8, -5, 8, 4, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

function wrapText(g, text, x, y, maxW) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  lines.push(line);
  lines.forEach((l, i) => g.fillText(l, x, y + (i - (lines.length - 1) / 2) * 28));
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Mensagem grande (largada, volta final, chegada), num plano à frente do jogador.
export class Banner {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024; this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false }));
    this.mesh.renderOrder = 12;
    this.mesh.visible = false;
    this.until = 0;
    this.text = '';
  }
  show(text, sub = '', secs = 1.5, color = '#ffcf3a') {
    const g = this.ctx, w = 1024, h = 256;
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 130px sans-serif';
    g.lineWidth = 14; g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.strokeText(text, w / 2, sub ? 100 : 128);
    g.fillStyle = color; g.fillText(text, w / 2, sub ? 100 : 128);
    if (sub) { g.font = 'bold 46px sans-serif'; g.lineWidth = 8; g.strokeText(sub, w / 2, 205); g.fillStyle = '#fff'; g.fillText(sub, w / 2, 205); }
    this.tex.needsUpdate = true;
    this.mesh.visible = true;
    this.text = text; this.sub = sub; this.color = color;
    this.until = performance.now() + secs * 1000;
  }
  update() { if (this.mesh.visible && performance.now() > this.until) this.mesh.visible = false; }
}
