// Recordes e opções, salvos no navegador.
const KEY = 'kartvr.v1';
const DEFAULTS = {
  best: {},        // por pista: { time, lap } (melhor corrida e melhor volta)
  podium: {},      // por pista e nível: melhor posição { 'parque:medio': 1 }
  level: 1,        // último nível escolhido
  comfort: true,   // escurece as bordas da visão nas curvas (VR)
  fps: false,
  view: 'chase',   // câmera no PC: 'chase' (atrás) | 'cockpit'
};

export function loadSave() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: segue sem salvar */ }
}
