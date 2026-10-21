// As 3 pistas. Pontos [x, z, altura] em metros, no sentido da corrida; a largada fica no
// primeiro ponto; scale aumenta tudo na horizontal. ramps = lombadas de salto (f = onde começa,
// em fração da volta; len = comprimento; h = altura). items = onde há uma fileira de caixas de
// item (fração da volta). Sem navegador.
export const TRACKS = [
  {
    id: 'parque', name: 'Parque Verde', desc: 'Curvas largas e uma lombada. Boa para começar.',
    width: 12, grass: 3.5, scale: 1.35,
    points: [[0, 0, 0], [0, -60, 0], [10, -105, 0], [45, -125, 1], [85, -115, 2], [105, -80, 2.5],
      [95, -45, 1.5], [115, -10, 0.5], [105, 30, 0], [70, 50, 0], [30, 45, 0], [5, 25, 0]],
    ramps: [{ f: 0.06, len: 7, h: 0.9 }],
    items: [0.17, 0.5, 0.8],
    theme: {
      sky: 0x8fd0ff, fog: 0xbfe6ff, ground: 0x5fae45, grass: 0x6fbf4f, road: 0x5b5d66,
      curbA: 0xe23b3b, curbB: 0xf4f4f4, wall: 0x2f6fd6, tree: 'pine', decor: 'park',
      sun: 0xfff2d6, hemiSky: 0xcfeaff, hemiGround: 0x4d7a35,
    },
  },
  {
    id: 'praia', name: 'Praia do Coco', desc: 'À beira-mar, com areia que segura o kart e dois saltos.',
    width: 12, grass: 4, scale: 1.2,
    points: [[0, 0, 0], [0, -70, 0], [-15, -120, 0], [-55, -145, 0], [-100, -135, 1], [-120, -100, 2],
      [-110, -60, 3], [-80, -40, 3], [-60, -10, 2], [-75, 25, 1], [-110, 45, 0], [-120, 85, 0],
      [-95, 120, 0], [-50, 125, 0], [-20, 100, 0], [0, 55, 0]],
    ramps: [{ f: 0.04, len: 7, h: 1.0 }, { f: 0.86, len: 8, h: 1.2 }],
    items: [0.13, 0.4, 0.67, 0.88],
    theme: {
      sky: 0x6cc4ff, fog: 0xc9ecff, ground: 0xe9d39a, grass: 0xe2c784, road: 0x6a625c,
      curbA: 0xff8a1e, curbB: 0xffffff, wall: 0xf2f2f2, tree: 'palm', decor: 'beach',
      sun: 0xfff0cc, hemiSky: 0xd8f0ff, hemiGround: 0xb59c5c,
    },
  },
  {
    id: 'vulcao', name: 'Vulcão', desc: 'Subida, grampos fechados e um salto sobre a lava.',
    width: 11, grass: 3, scale: 1.2,
    points: [[0, 0, 0], [0, -80, 1], [15, -130, 3], [55, -150, 5], [90, -130, 6], [85, -95, 7],
      [50, -85, 8], [40, -55, 8], [70, -30, 7], [110, -40, 6], [140, -10, 4], [135, 40, 3],
      [100, 65, 2], [60, 55, 1], [40, 80, 0.5], [10, 95, 0], [-20, 75, 0], [-15, 40, 0]],
    ramps: [{ f: 0.045, len: 7, h: 0.9 }, { f: 0.105, len: 8, h: 1.3 }],
    items: [0.13, 0.4, 0.62, 0.86],
    theme: {
      sky: 0x2a1420, fog: 0x3a1a1a, ground: 0x2a2224, grass: 0x3b3134, road: 0x3a3a40,
      curbA: 0xff5a1e, curbB: 0x222222, wall: 0x8a3020, tree: 'rock', decor: 'volcano',
      sun: 0xffb27a, hemiSky: 0xb07a8a, hemiGround: 0x502020,
    },
  },
];
