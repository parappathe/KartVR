# KartVR (Kart Maluco)

Corrida de kart cartoon em VR para o Meta Quest 3, no navegador do óculos (WebXR), sem instalar
nada. 3 pistas, 3 voltas, 7 pilotos do computador em 3 níveis, caixas de item (turbo, casca de
banana, mancha de óleo) e lombadas que fazem o kart saltar. Também joga no PC (teclado ou controle
de videogame). Tudo em português.

## Como rodar / jogar

**No Quest:** abrir no navegador do óculos **https://parappathe.github.io/KartVR/** (ou a página
inicial https://parappathe.github.io/) e apertar "Entrar em VR". Jogar sentado. Para atualizar o
site: commitar e rodar `python publicar.py KartVR` na pasta `C:\claude code`.

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8781` (o painel de visualização
usa `.claude/launch.json`). `python serve.py --https` serve na rede de casa para testar no Quest
sem publicar.

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Acelerar | Gatilho direito | Seta para cima / W (controle: RT ou A) |
| Frear / ré | Gatilho esquerdo | Seta para baixo / S (controle: LT) |
| Esterçar | Segurar o volante com o botão lateral (grip) de uma ou das duas mãos e girar; ou o analógico | Setas / A e D (controle: analógico) |
| Usar item | A ou X | Espaço (controle: X) |
| Pausa | B ou Y | Esc ou P (controle: Start) |
| Câmera | Sempre na cabine | C troca entre atrás do kart e cabine |
| FPS | Opções → Mostrar FPS | Tecla F |

Conforto: no VR a cabeça fica presa ao assento e o horizonte nunca inclina (o kart do jogador não
empina nem roda na tela, mesmo ao bater numa casca). A opção "Conforto" (ligada por padrão)
escurece as bordas da visão nas curvas fortes, saltos e rodadas. "Recentralizar" na pausa põe a
cabeça de volta no banco.

### Regras

8 karts, 3 voltas; o jogador larga em último. Caixas "?" dão um item por vez; quem está mais atrás
ganha mais turbo. Turbo: 1,6 s acima da velocidade máxima. Casca e óleo caem atrás do kart; quem
passa por cima roda e perde velocidade (a casca some, o óleo fica 12 s). Grama/areia reduz a
velocidade máxima pela metade. Muros seguram o kart. Depois que o jogador cruza a chegada, o
computador termina por ele e a tela de resultado aparece (quem não chegou em 10 s tem o tempo
estimado).

Pistas (em `js/tracks.js`): Parque Verde (663 m, 1 lombada), Praia do Coco (878 m, areia, 2
saltos), Vulcão (929 m, subida até 8 m, grampos, 2 saltos). Níveis (em `js/ai.js`): Fácil,
Médio, Difícil. Melhor tempo, melhor volta e melhor colocação por pista/nível ficam salvos no
navegador (localStorage, chave `kartvr.v1`).

## Como testar

- `node tests/run.js` (ou `npm test`): pista não se cruza e não tem curva fechada demais,
  projeção na pista, muro segura o kart, andar de ré pela largada não conta volta, robô completa
  as 3 pistas e salta nas lombadas, níveis em ordem (Difícil mais rápido), corrida de 8 termina
  com resultado de todos, itens pegos e usados, casca faz rodar, turbo passa da velocidade
  máxima. Tem que terminar com "Tudo certo". Não toca som.
- No navegador (console): `kart.startRace(0); kart.dev.autoplay = true; kart.dev.advance(60)`
  corre 60 s na hora com o robô dirigindo. `advance` existe porque o painel de visualização
  escondido não anima a página. `kart.renderer.info.render.calls` mostra o peso de desenho
  (~170 a 200 por olho).
- **Só dá para testar no óculos:** pegar e girar o volante, gatilhos, conforto/enjoo, vibração,
  FPS real e altura do assento.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", painel do kart no canto (PC) |
| `js/track.js` | `Track`: curva da pista, projeção (s, lat), altura com rampas, linha ideal e perfil de velocidade. Sem navegador |
| `js/tracks.js` | As 3 pistas (pontos, largura, rampas, caixas, cores do cenário). Sem navegador |
| `js/kart.js` | Física do kart em passo fixo de 1/120 s (`PHYS` tem as constantes). Sem navegador |
| `js/ai.js` | Níveis (`LEVELS`), nomes/cores dos pilotos e o `Driver` que pilota. Sem navegador |
| `js/race.js` | `Race`: largada, voltas, itens, obstáculos, batidas entre karts, resultado. Sem navegador |
| `js/main.js` | Liga tudo: render, assento/VR, volante, teclado/controle, menus, câmera, sons |
| `js/scene.js` | Pista 3D, cenário de cada tema, caixas, casca/óleo, modelo do kart, vinheta de conforto |
| `js/hud.js` | Painel do kart (posição, volta, tempo, item, velocidade, minimapa) e letreiro grande |
| `js/ui.js` | Painel de menu 3D (mesmo dos outros jogos, cores próprias) |
| `js/audio.js` | Sons sintetizados (motor contínuo, itens, batidas, largada, chegada) |
| `js/save.js` | Recordes e opções salvos |
| `serve.py` | Servidor local sem cache (`--https` para testar no Quest pela rede de casa) |
| `tests/run.js` | Testes automáticos |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Convenções: metros; `s` = distância ao longo da pista; `lat` = desvio lateral (positivo = à
esquerda); `h` = direção do kart igual a `rotation.y` (o kart olha para (-sen h, -cos h));
`steer` -1 esquerda, +1 direita.

## Regras e convenções do projeto

- `track.js`, `tracks.js`, `kart.js`, `ai.js`, `race.js` e `util.js` não podem usar navegador
  nem Three.js: os testes rodam no Node.
- Mexeu em pista, física ou pilotos: rodar `node tests/run.js`.
- Pista nova: pontos espaçados ~30 a 60 m, rampas só em reta (o teste acusa trechos que se
  encostam e curvas com raio < 10 m).
- Dificuldade: `speed` (fração da velocidade possível), `wander` (quanto erra a linha),
  `itemDelay` e `ambush` (uso de itens) em `LEVELS`; `catchUp` em `race.js` aproxima o pelotão
  (±3%).

## Decisões

- Mesmo caminho dos outros jogos web (WebXR no navegador, Three.js local, GitHub Pages).
- Este projeto é a base dos outros 4 jogos de corrida (RallyVR, NeonVR, LanchaVR, EstradaVR):
  cada um tem a sua cópia do núcleo, sem dependência entre pastas.
- Volante virtual e analógico funcionam juntos, sem opção para escolher: se a mão segura o
  volante, ela manda; senão, o analógico.
- Para conforto, o assento do jogador só acompanha a direção e a altura (suavizada) do kart.
- Física de fliperama (sem derrapagem real), para ser fácil de controlar no VR.
- Jogador larga em último; níveis calibrados para o robô (que dirige perfeito) ganhar quase
  sempre no Fácil e no Médio e brigar no Difícil.

## Pendências / problemas conhecidos

- Nada testado no Quest ainda: alcance e sensibilidade do volante (giro máximo ~90°), altura
  do assento, conforto, FPS.
