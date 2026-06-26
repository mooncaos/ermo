/* ===========================================================================
   ERMO — motor do cliente (em rede)
   - conecta no servidor por Socket.IO (o servidor é a autoridade)
   - câmera que segue você num mapa maior que a tela
   - personagem customizável (look) com animação de passo
   ===========================================================================*/

// ---------- elementos ----------
const gate    = document.getElementById('gate');
const booting = document.getElementById('booting');
const stage   = document.getElementById('stage');
const canvas  = document.getElementById('game');
const ctx     = canvas.getContext('2d');
const hud     = document.getElementById('hud');
const help    = document.getElementById('help');
const logoutB = document.getElementById('logout');
const onlineEl= document.getElementById('online');
const coordsEl= document.getElementById('coords');
const phaseEl = document.getElementById('phase');
const statusEl= document.getElementById('status');

// abas + campos de conta
const tabLogin   = document.getElementById('tab-login');
const tabReg     = document.getElementById('tab-register');
const panelLogin = document.getElementById('panel-login');
const panelReg   = document.getElementById('panel-register');
const loginEmail = document.getElementById('login-email');
const loginPass  = document.getElementById('login-pass');
const regEmail   = document.getElementById('reg-email');
const regName    = document.getElementById('reg-name');
const regPass    = document.getElementById('reg-pass');
const btnLogin   = document.getElementById('btn-login');
const btnReg     = document.getElementById('btn-register');

// mochila / inventario
const bagBtn   = document.getElementById('bag-btn');
const invEl    = document.getElementById('inv');
const invGrid  = document.getElementById('inv-grid');
const equipRow = document.getElementById('equip-row');
const invClose = document.getElementById('inv-close');
const toastEl  = document.getElementById('toast');

// chat
const chatOpenBtn = document.getElementById('chat-open');
const chatBarEl   = document.getElementById('chatbar');
const chatInputEl = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send');

const TOKEN_KEY = 'ermo_token';

// ---------- viewport + zoom (câmera) ----------
let VIEW_COLS = 15, VIEW_ROWS = 19;     // janela em tiles (ajustada à tela/zoom)
const STEP_MS = 130;                    // cadência de passo ao segurar
const TAU = 55;                         // suavização do tween (ms)
const WALK_CYCLE = 320;                 // ms por ciclo de caminhada

// Zoom: o servidor manda o tamanho-base do tile; aqui multiplicamos por um fator.
// Mais zoom = tile maior = personagem grande, menos mundo. Menos zoom = mais mundo.
let BASE_TS = 32;
const ZOOM_LEVELS = [0.7, 0.85, 1.0, 1.2, 1.45, 1.75];
let zoom = 1.0;
try { const z = parseFloat(localStorage.getItem('ermo_zoom')); if (z && z >= 0.5 && z <= 2.5) zoom = z; } catch(e){}

// Enche a tela com o máximo de tiles que cabem no TS atual (limitado ao mapa).
function pickViewport(){
  let cols = Math.floor((window.innerWidth  * 0.96) / TS);
  let rows = Math.floor((window.innerHeight * 0.94) / TS);
  cols = Math.max(9,  Math.min(cols, mapW || 40));
  rows = Math.max(11, Math.min(rows, mapH || 30));
  return { cols, rows };
}
function nearestZoomIndex(z){
  let bi = 0, bd = Infinity;
  ZOOM_LEVELS.forEach((lv, i) => { const d = Math.abs(lv - z); if (d < bd){ bd = d; bi = i; } });
  return bi;
}
function updateZoomLabel(){
  const el = document.getElementById('zoom-pct');
  if (el) el.textContent = Math.round(zoom * 100) + '%';
}
// Aplica um nível de zoom: redimensiona, redesenha o mapa e reancora todo mundo.
function applyZoom(z){
  zoom = Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], Math.max(ZOOM_LEVELS[0], z));
  TS = Math.round(BASE_TS * zoom);
  const vp = pickViewport();
  VIEW_COLS = vp.cols; VIEW_ROWS = vp.rows;
  if (canvas){ canvas.width = VIEW_COLS * TS; canvas.height = VIEW_ROWS * TS; }
  if (mapW) buildMapCanvas();
  for (const p of players.values()){ p.rx = p.x * TS; p.ry = p.y * TS; }  // sem deslizar
  try { localStorage.setItem('ermo_zoom', String(zoom)); } catch(e){}
  updateZoomLabel();
}
function zoomStep(dir){   // +1 aproxima, -1 afasta
  const i = nearestZoomIndex(zoom);
  applyZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, i + dir))]);
}

// ---------- estado ----------
let socket = null, myId = null;
let TS = 32, mapRows = [], mapW = 0, mapH = 0, mapCanvas = null, mapName = 'ermo', throneBounds = null;
let camX = 0, camY = 0;
const players = new Map();
let started = false;

// ---------- inventario / itens ----------
let inventory = [];           // mochila local: lista de pilhas {item, qty}
let equipment = {};           // equipamento local: slot -> item_id
const catalog = {};           // definicoes de itens vindas do servidor
const ground = new Map();     // "x,y" -> item_id (itens no chao agora)
let myFicha = {};             // ficha do personagem (raca, classe, atributos, vida)
let invOpen = false;

// ---------- clique pra andar ----------
let autoPath = [];            // direcoes restantes do trajeto clicado
let autoTimer = null;
let clickFx = null;           // marcador visual do destino {x,y,start}
let throneWarn = null;        // aparicao do Pofnir avisando no trono {cx,cy,text,start}

// ---------- ciclo de dia e noite ----------
let dayLength = 480;          // segundos por ciclo (o servidor manda o valor real)
let dayOffset = 0;            // diferenca entre relogio do servidor e o nosso
let dayTime = 0;              // 0..1 dentro do ciclo (0 = meia-noite)
let lastPhase = '';           // pra so atualizar o HUD quando a fase muda

// ---------- falas (balao), NPC e o raio do Valdris ----------
const bubbles = new Map();    // id da entidade -> {text, until} (balao acima dela)
const smites  = new Map();    // id do alvo -> {start} (efeito do raio cosmico)
const BUBBLE_MS = 4500;       // quanto tempo um balao fica na tela
const SMITE_MS  = 700;        // duracao do raio + flash

// ===========================================================================
//  PALETAS + CRIADOR DE PERSONAGEM  (valores iguais aos do servidor)
// ===========================================================================
const CLOAKS = ['#9b6dff','#f4b860','#5fd0c5','#e85d75','#7cc4f4','#b6e36a','#f49ad0','#c9a0ff'];
const SKINS  = ['#f1c9a5','#e8b58c','#c68642','#8d5524','#ffe0bd'];
const HAIRS  = ['#2a2233','#5a3f28','#8a6a3a','#d8b25a','#b6b0be','#9c3b2e'];

const currentLook = { skin:SKINS[0], cloak:CLOAKS[0], hood:'up', hat:'none', hair:HAIRS[0], staff:false };

function buildSwatches(containerId, colors, key){
  const box = document.getElementById(containerId);
  colors.forEach(col=>{
    const b = document.createElement('button');
    b.className = 'sw' + (currentLook[key]===col ? ' sel' : '');
    b.style.background = col; b.type = 'button';
    b.addEventListener('click', ()=>{
      currentLook[key] = col;
      [...box.children].forEach(c=>c.classList.remove('sel'));
      b.classList.add('sel');
    });
    box.appendChild(b);
  });
}
function buildPills(containerId, options, key){
  const box = document.getElementById(containerId);
  options.forEach(([val,label])=>{
    const b = document.createElement('button');
    b.className = 'pill' + (currentLook[key]===val ? ' sel' : '');
    b.textContent = label; b.type = 'button';
    b.addEventListener('click', ()=>{
      currentLook[key] = val;
      [...box.children].forEach(c=>c.classList.remove('sel'));
      b.classList.add('sel');
    });
    box.appendChild(b);
  });
}
function buildCreator(){
  buildSwatches('row-cloak', CLOAKS, 'cloak');
  buildSwatches('row-skin',  SKINS,  'skin');
  buildSwatches('row-hair',  HAIRS,  'hair');
  buildPills('row-hood', [['up','Pra cima'],['down','Pra baixo']], 'hood');
  buildPills('row-hat',  [['none','Nenhum'],['wizard','Mago'],['cap','Boné']], 'hat');
}

// pré-visualização: o herói andando enquanto você escolhe
const pcanvas = document.getElementById('pcanvas');
const pctx = pcanvas ? pcanvas.getContext('2d') : null;
const FACES = ['down','left','up','right'];
let pLast = performance.now(), pWalk = 0;
function previewLoop(now){
  const dt = Math.min(50, now - pLast); pLast = now; pWalk += dt;
  const face = FACES[Math.floor(now/900) % 4];
  const rs = document.getElementById('race');
  if(rs && rs.classList.contains('open') && racePctx){
    const rts = 96;
    racePctx.clearRect(0,0,racePcanvas.width,racePcanvas.height);
    drawCharacter(racePctx, racePcanvas.width/2 - rts/2, racePcanvas.height - rts - 14, rts,
                  raceScreenLook, face, '', false, true, pWalk);
  } else if(pctx){
    const ts = 72;
    pctx.clearRect(0,0,pcanvas.width,pcanvas.height);
    drawCharacter(pctx, pcanvas.width/2 - ts/2, pcanvas.height - ts - 16, ts,
                  currentLook, face, '', false, true, pWalk);
  }
  requestAnimationFrame(previewLoop);
}

// ===========================================================================
//  CORES E DESENHO DO MUNDO
// ===========================================================================
const COL = {
  grass:'#5d8a4a', grassDk:'#4f7a3f', grassLt:'#6c9b57',
  path:'#b9996a', pathDk:'#a98a5b',
  water:'#3f6fae', waterLt:'#5a8ad0', waterDk:'#345f9a',
  trunk:'#5a3f28', leaf:'#3d6b34', leafDk:'#356030', leafLt:'#4d7d42',
  wall:'#cdb892', wallDk:'#b6a079', roof:'#a8504a', roofDk:'#8f4640',
  door:'#5a3f28', doorKnob:'#f4b860', fence:'#7a6048',
  flower:['#e8657a','#f4d35e','#c9a0ff'],
};
function rng(x, y, salt){
  let h = (x*374761393 + y*668265263 + salt*2246822519) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function shade(hex, lum){
  let n = parseInt(hex.slice(1),16);
  let r = (n>>16)&255, g=(n>>8)&255, b=n&255;
  r = Math.round(Math.min(255,Math.max(0, r + 255*lum)));
  g = Math.round(Math.min(255,Math.max(0, g + 255*lum)));
  b = Math.round(Math.min(255,Math.max(0, b + 255*lum)));
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}
function grassBase(c, px, py, ts, gx, gy){
  c.fillStyle = COL.grass; c.fillRect(px,py,ts,ts);
  for(let i=0;i<3;i++){
    const rx = px + rng(gx,gy,i+1)*ts, ry = py + rng(gx,gy,i+5)*ts;
    c.fillStyle = rng(gx,gy,i+9) > .5 ? COL.grassLt : COL.grassDk;
    c.fillRect(rx, ry, 2, 2);
  }
}
// piso do Salao (igual ao tile 'o'), usado de fundo das estatuas
function salaoFloor(c, px, py, ts, gx, gy){
  c.fillStyle='#322d47'; c.fillRect(px,py,ts,ts);
  c.fillStyle='#3b3556'; c.fillRect(px, py, ts, ts*0.5);
  c.fillStyle='#2a2640';
  c.fillRect(px, py+ts-2, ts, 2); c.fillRect(px+ts-2, py, 2, ts);
}
// pedestal de pedra das estatuas (com sombra no chao)
function pedestal(c, px, py, ts){
  c.fillStyle='rgba(0,0,0,0.24)';
  c.beginPath(); c.ellipse(px+ts*0.5, py+ts*0.95, ts*0.27, ts*0.07, 0, 0, Math.PI*2); c.fill();
  c.fillStyle='#565160'; c.fillRect(px+ts*0.28, py+ts*0.78, ts*0.44, ts*0.18);
  c.fillStyle='#625c70'; c.fillRect(px+ts*0.28, py+ts*0.76, ts*0.44, ts*0.04);
  c.fillStyle='#6f6982'; c.fillRect(px+ts*0.30, py+ts*0.76, ts*0.10, ts*0.18);  // luz
  c.fillStyle='#494556'; c.fillRect(px+ts*0.28, py+ts*0.93, ts*0.44, ts*0.03);
}
// estatua de OURO do Pofnir, desenhada num espaco 2x2 (2ts x 2ts) na origem ox,oy
function drawPofnirBig(c, ox, oy, ts){
  const W = ts*2, H = ts*2, cx = ox + ts;
  for(let i=3;i>=1;i--){                                   // halo dourado em camadas
    c.fillStyle = 'rgba(244,193,78,'+(0.07*i)+')';
    c.beginPath(); c.arc(cx, oy+H*0.46, ts*(0.55+0.18*i), 0, Math.PI*2); c.fill();
  }
  c.fillStyle = '#a87a28'; c.fillRect(cx-ts*0.80, oy+H*0.82, ts*1.60, H*0.16);   // pedestal
  c.fillStyle = '#c79233'; c.fillRect(cx-ts*0.80, oy+H*0.80, ts*1.60, H*0.04);
  c.fillStyle = '#8a6420'; c.fillRect(cx-ts*0.80, oy+H*0.96, ts*1.60, H*0.02);
  c.fillStyle = '#d8a23f';                                 // cauda peluda
  c.beginPath(); c.ellipse(cx+ts*0.64, oy+H*0.58, ts*0.16, ts*0.40, -0.5, 0, Math.PI*2); c.fill();
  c.fillStyle = '#f4c14e';                                 // corpo sentado
  c.beginPath(); c.ellipse(cx, oy+H*0.64, ts*0.60, ts*0.46, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = '#ffe08a';                                 // peito claro
  c.beginPath(); c.ellipse(cx, oy+H*0.66, ts*0.26, ts*0.34, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = '#e8b43f';                                 // patas
  c.fillRect(cx-ts*0.28, oy+H*0.78, ts*0.18, ts*0.16);
  c.fillRect(cx+ts*0.10, oy+H*0.78, ts*0.18, ts*0.16);
  c.fillStyle = '#f4c14e';                                 // cabeca
  c.beginPath(); c.arc(cx, oy+H*0.34, ts*0.42, 0, Math.PI*2); c.fill();
  c.beginPath(); c.moveTo(cx-ts*0.40,oy+H*0.26); c.lineTo(cx-ts*0.22,oy+H*0.02); c.lineTo(cx-ts*0.04,oy+H*0.22); c.closePath(); c.fill();  // orelhas
  c.beginPath(); c.moveTo(cx+ts*0.40,oy+H*0.26); c.lineTo(cx+ts*0.22,oy+H*0.02); c.lineTo(cx+ts*0.04,oy+H*0.22); c.closePath(); c.fill();
  c.fillStyle = '#ffe08a';                                 // tufos das orelhas
  c.beginPath(); c.moveTo(cx-ts*0.30,oy+H*0.20); c.lineTo(cx-ts*0.22,oy+H*0.08); c.lineTo(cx-ts*0.14,oy+H*0.19); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(cx+ts*0.30,oy+H*0.20); c.lineTo(cx+ts*0.22,oy+H*0.08); c.lineTo(cx+ts*0.14,oy+H*0.19); c.closePath(); c.fill();
  c.fillStyle = '#e8b43f';                                 // bochechas peludas
  c.beginPath(); c.arc(cx-ts*0.30, oy+H*0.40, ts*0.14, 0, Math.PI*2); c.fill();
  c.beginPath(); c.arc(cx+ts*0.30, oy+H*0.40, ts*0.14, 0, Math.PI*2); c.fill();
  c.fillStyle = '#ffe8a0';                                 // realce de luz
  c.beginPath(); c.arc(cx-ts*0.16, oy+H*0.26, ts*0.10, 0, Math.PI*2); c.fill();
  c.fillStyle = '#ffe08a';                                 // focinho
  c.beginPath(); c.ellipse(cx, oy+H*0.41, ts*0.16, ts*0.12, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = '#6d44c4';                                 // olhos violeta
  c.beginPath(); c.arc(cx-ts*0.15, oy+H*0.32, ts*0.06, 0, Math.PI*2); c.fill();
  c.beginPath(); c.arc(cx+ts*0.15, oy+H*0.32, ts*0.06, 0, Math.PI*2); c.fill();
  c.fillStyle = '#b89bff';
  c.beginPath(); c.arc(cx-ts*0.13, oy+H*0.30, ts*0.02, 0, Math.PI*2); c.fill();
  c.beginPath(); c.arc(cx+ts*0.17, oy+H*0.30, ts*0.02, 0, Math.PI*2); c.fill();
}
// um quadrante (qx,qy in {0,1}) do Pofnir 2x2: recorta no tile e desenha o todo
function _pofnirQuad(c, px, py, ts, gx, gy, qx, qy){
  salaoFloor(c, px, py, ts, gx, gy);
  c.save();
  c.beginPath(); c.rect(px, py, ts, ts); c.clip();
  drawPofnirBig(c, px - qx*ts, py - qy*ts, ts);
  c.restore();
}
function drawTile(c, ch, px, py, ts, gx, gy){
  switch(ch){
    case '.': grassBase(c,px,py,ts,gx,gy); break;
    case ',':
      grassBase(c,px,py,ts,gx,gy);
      { const col = COL.flower[Math.floor(rng(gx,gy,3)*COL.flower.length)];
        const fx = px+ts*0.5, fy = py+ts*0.5;
        c.fillStyle = col;
        c.fillRect(fx-1,fy-3,2,2); c.fillRect(fx-3,fy-1,2,2);
        c.fillRect(fx+1,fy-1,2,2); c.fillRect(fx-1,fy+1,2,2);
        c.fillStyle = COL.flower[1]; c.fillRect(fx-1,fy-1,2,2); }
      break;
    case ':':
      grassBase(c,px,py,ts,gx,gy);
      c.fillStyle = COL.leafDk;
      c.beginPath(); c.arc(px+ts*0.5, py+ts*0.55, ts*0.32, 0, Math.PI*2); c.fill();
      c.fillStyle = COL.leaf;
      c.beginPath(); c.arc(px+ts*0.42, py+ts*0.46, ts*0.22, 0, Math.PI*2); c.fill();
      c.fillStyle = COL.leafLt; c.fillRect(px+ts*0.36, py+ts*0.34, 2, 2);
      break;
    case '=':
      c.fillStyle = COL.path; c.fillRect(px,py,ts,ts);
      for(let i=0;i<4;i++){
        c.fillStyle = COL.pathDk;
        c.fillRect(px+rng(gx,gy,i)*ts, py+rng(gx,gy,i+4)*ts, 2, 2);
      }
      break;
    case '~':
      c.fillStyle = COL.water; c.fillRect(px,py,ts,ts);
      c.strokeStyle = COL.waterLt; c.lineWidth = 1.5;
      for(let i=0;i<2;i++){
        const wy = py + ts*(0.3 + i*0.35) + rng(gx,gy,i)*3;
        c.beginPath(); c.moveTo(px+3, wy);
        c.quadraticCurveTo(px+ts*0.5, wy-3, px+ts-3, wy); c.stroke();
      }
      c.fillStyle = COL.waterDk; c.fillRect(px, py, ts, 2);
      break;
    case 'T':
      grassBase(c,px,py,ts,gx,gy);
      c.fillStyle = COL.trunk; c.fillRect(px+ts*0.44, py+ts*0.55, ts*0.12, ts*0.3);
      c.fillStyle = COL.leafDk;
      c.beginPath(); c.arc(px+ts*0.5, py+ts*0.42, ts*0.34, 0, Math.PI*2); c.fill();
      c.fillStyle = COL.leaf;
      c.beginPath(); c.arc(px+ts*0.40, py+ts*0.36, ts*0.24, 0, Math.PI*2); c.fill();
      c.beginPath(); c.arc(px+ts*0.62, py+ts*0.46, ts*0.18, 0, Math.PI*2); c.fill();
      c.fillStyle = COL.leafLt; c.fillRect(px+ts*0.34, py+ts*0.26, 3, 3);
      break;
    case '#':
      grassBase(c,px,py,ts,gx,gy);
      c.fillStyle = COL.fence;
      c.fillRect(px+ts*0.5-1, py+ts*0.2, 3, ts*0.6); c.fillRect(px, py+ts*0.4, ts, 3);
      break;
    case '^':
      c.fillStyle = COL.roof; c.fillRect(px,py,ts,ts);
      c.fillStyle = COL.roofDk; for(let i=0;i<ts;i+=4) c.fillRect(px, py+i, ts, 2);
      c.fillStyle = shade(COL.roof,0.12); c.fillRect(px,py,ts,3);
      break;
    case 'H':
      c.fillStyle = COL.wall; c.fillRect(px,py,ts,ts);
      c.fillStyle = COL.wallDk; c.fillRect(px, py+ts-3, ts, 3);
      break;
    case 'D':
      c.fillStyle = COL.wall; c.fillRect(px,py,ts,ts);
      c.fillStyle = COL.door; c.fillRect(px+ts*0.25, py+ts*0.18, ts*0.5, ts*0.82);
      c.fillStyle = COL.doorKnob; c.fillRect(px+ts*0.62, py+ts*0.55, 2, 2);
      break;
    case 'w':
      grassBase(c,px,py,ts,gx,gy);
      for(let i=0;i<4;i++){
        const stalkX = px + ts*(0.18 + i*0.21) + (rng(gx,gy,i)-0.5)*2.2;
        const h = ts*(0.42 + rng(gx,gy,i+2)*0.22);
        const topY = py + ts - h;
        c.fillStyle = '#b9842b';                       // talo
        c.fillRect(stalkX, topY, 1.5, h);
        c.fillStyle = '#e3b347';                       // espiga dourada
        c.fillRect(stalkX-1.5, topY-1, 4.5, ts*0.2);
        c.fillStyle = '#f6d680';                       // brilho do grao
        c.fillRect(stalkX-0.5, topY, 1.5, ts*0.12);
      }
      break;
    case 'p': {                                        // paralelepipedo
      c.fillStyle = '#6f6a63'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#585249';
      c.fillRect(px, py+ts*0.5-1, ts, 1.5);
      const off = (gy%2) ? ts*0.5 : 0;
      c.fillRect(px+off, py, 1.5, ts*0.5);
      c.fillRect(px+((off+ts*0.5)%ts), py+ts*0.5, 1.5, ts*0.5);
      c.fillStyle = '#7d776e'; c.fillRect(px+ts*0.22, py+ts*0.22, 2, 2);
      break;
    }
    case 'o':                                          // piso do Salao (pedra polida)
      c.fillStyle = '#322d47'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#3b3556'; c.fillRect(px, py, ts, ts*0.5);   // brilho de cima
      c.fillStyle = '#2a2640';                                   // juntas
      c.fillRect(px, py+ts-2, ts, 2); c.fillRect(px+ts-2, py, 2, ts);
      c.fillStyle = '#4a4368';
      c.fillRect(px+ts*0.2+rng(gx,gy,1)*ts*0.5, py+ts*0.2+rng(gx,gy,2)*ts*0.5, 2, 2);
      break;
    case 'c':                                          // tapete/corredor central
      c.fillStyle = '#4a2d8f'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#5e3bb0'; c.fillRect(px+1, py, ts-2, ts);   // corpo do tapete
      c.fillStyle = '#7d5bd0';                                   // bordas
      c.fillRect(px, py, 2, ts); c.fillRect(px+ts-2, py, 2, ts);
      c.fillStyle = '#f4b860';                                   // detalhe ambar
      c.fillRect(px+ts*0.5-1, py+ts*0.3, 2, 2);
      c.fillRect(px+ts*0.5-1, py+ts*0.7, 2, 2);
      break;
    case 'O': {                                        // portal de volta (brilho)
      c.fillStyle = '#1a1730'; c.fillRect(px,py,ts,ts);          // base escura
      const cx = px+ts*0.5, cy = py+ts*0.5;
      c.fillStyle = '#6d44c4';                                   // halo violeta
      c.beginPath(); c.ellipse(cx, cy, ts*0.34, ts*0.42, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = '#9b6dff';
      c.beginPath(); c.ellipse(cx, cy, ts*0.22, ts*0.30, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = '#f4b860';                                   // nucleo ambar
      c.beginPath(); c.ellipse(cx, cy, ts*0.10, ts*0.16, 0, 0, Math.PI*2); c.fill();
      break;
    }
    // ---- estatuas do Salao (pedestal de pedra + a forma do deus) ----
    case 's': {                                        // humanoide (Korgath/Bragor/Valiria)
      salaoFloor(c,px,py,ts,gx,gy); const cx=px+ts*0.5;
      pedestal(c,px,py,ts);
      c.fillStyle='#6b6577'; c.fillRect(cx-ts*0.13, py+ts*0.36, ts*0.26, ts*0.42);
      c.beginPath(); c.arc(cx, py+ts*0.30, ts*0.11, 0, Math.PI*2); c.fill();
      c.fillStyle='#847e92'; c.fillRect(cx-ts*0.10, py+ts*0.40, ts*0.05, ts*0.34);
      break;
    }
    case 'h': {                                        // lebre (Nhare)
      salaoFloor(c,px,py,ts,gx,gy); const cx=px+ts*0.5;
      pedestal(c,px,py,ts);
      c.fillStyle='#6b6577';
      c.beginPath(); c.ellipse(cx, py+ts*0.62, ts*0.14, ts*0.17, 0,0,Math.PI*2); c.fill();
      c.beginPath(); c.arc(cx, py+ts*0.46, ts*0.10, 0, Math.PI*2); c.fill();
      c.fillRect(cx-ts*0.08, py+ts*0.22, ts*0.045, ts*0.22);     // orelhas longas
      c.fillRect(cx+ts*0.035, py+ts*0.22, ts*0.045, ts*0.22);
      c.fillStyle='#847e92'; c.fillRect(cx-ts*0.10, py+ts*0.56, ts*0.05, ts*0.12);
      break;
    }
    case 'j': {                                        // jabuti (Martur)
      salaoFloor(c,px,py,ts,gx,gy); const cx=px+ts*0.5;
      pedestal(c,px,py,ts);
      c.fillStyle='#6b6577';
      c.beginPath(); c.arc(cx, py+ts*0.68, ts*0.20, Math.PI, 0); c.fill();   // casco
      c.fillRect(cx-ts*0.20, py+ts*0.66, ts*0.40, ts*0.06);
      c.beginPath(); c.arc(cx+ts*0.22, py+ts*0.64, ts*0.07, 0, Math.PI*2); c.fill();  // cabeca
      c.fillStyle='#4f4a5e'; c.fillRect(cx-ts*0.02, py+ts*0.52, ts*0.04, ts*0.16);
      break;
    }
    case 'f': {                                        // felino (Facalan/Jose)
      salaoFloor(c,px,py,ts,gx,gy); const cx=px+ts*0.5;
      pedestal(c,px,py,ts);
      c.fillStyle='#6b6577';
      c.beginPath(); c.ellipse(cx, py+ts*0.62, ts*0.13, ts*0.17, 0,0,Math.PI*2); c.fill();
      c.beginPath(); c.arc(cx, py+ts*0.44, ts*0.10, 0, Math.PI*2); c.fill();
      c.beginPath(); c.moveTo(cx-ts*0.10,py+ts*0.38); c.lineTo(cx-ts*0.04,py+ts*0.28); c.lineTo(cx,py+ts*0.38); c.fill();
      c.beginPath(); c.moveTo(cx+ts*0.10,py+ts*0.38); c.lineTo(cx+ts*0.04,py+ts*0.28); c.lineTo(cx,py+ts*0.38); c.fill();
      c.fillRect(cx+ts*0.11, py+ts*0.52, ts*0.04, ts*0.20);      // cauda
      c.fillStyle='#847e92'; c.fillRect(cx-ts*0.07, py+ts*0.55, ts*0.04, ts*0.12);
      break;
    }
    case 'g': {                                        // dragao (Drazun)
      salaoFloor(c,px,py,ts,gx,gy); const cx=px+ts*0.5;
      pedestal(c,px,py,ts);
      c.fillStyle='#6b6577'; c.fillRect(cx-ts*0.05, py+ts*0.34, ts*0.10, ts*0.42);
      c.beginPath(); c.arc(cx, py+ts*0.30, ts*0.10, 0, Math.PI*2); c.fill();
      c.fillRect(cx-ts*0.085, py+ts*0.18, ts*0.03, ts*0.09);     // chifres
      c.fillRect(cx+ts*0.055, py+ts*0.18, ts*0.03, ts*0.09);
      c.beginPath(); c.moveTo(cx+ts*0.05,py+ts*0.42); c.lineTo(cx+ts*0.22,py+ts*0.36); c.lineTo(cx+ts*0.05,py+ts*0.58); c.fill();
      c.fillStyle='#4f4a5e'; c.beginPath(); c.moveTo(cx-ts*0.05,py+ts*0.42); c.lineTo(cx-ts*0.21,py+ts*0.39); c.lineTo(cx-ts*0.05,py+ts*0.56); c.fill();
      break;
    }
    case 'b': {                                        // coruja (Nherith)
      salaoFloor(c,px,py,ts,gx,gy); const cx=px+ts*0.5;
      pedestal(c,px,py,ts);
      c.fillStyle='#6b6577';
      c.beginPath(); c.ellipse(cx, py+ts*0.56, ts*0.15, ts*0.20, 0,0,Math.PI*2); c.fill();
      c.beginPath(); c.moveTo(cx-ts*0.12,py+ts*0.40); c.lineTo(cx-ts*0.06,py+ts*0.28); c.lineTo(cx-ts*0.01,py+ts*0.40); c.fill();
      c.beginPath(); c.moveTo(cx+ts*0.12,py+ts*0.40); c.lineTo(cx+ts*0.06,py+ts*0.28); c.lineTo(cx+ts*0.01,py+ts*0.40); c.fill();
      c.fillStyle='#3b3653';
      c.beginPath(); c.arc(cx-ts*0.06,py+ts*0.47,ts*0.045,0,Math.PI*2); c.fill();
      c.beginPath(); c.arc(cx+ts*0.06,py+ts*0.47,ts*0.045,0,Math.PI*2); c.fill();
      break;
    }
    case 'k': {                                        // livro do Mago (sem deus)
      salaoFloor(c,px,py,ts,gx,gy); const cx=px+ts*0.5;
      pedestal(c,px,py,ts);
      c.fillStyle='#6b6577'; c.fillRect(cx-ts*0.03, py+ts*0.52, ts*0.06, ts*0.24);  // suporte
      c.fillStyle='#d8cfa0';                                     // paginas
      c.beginPath(); c.moveTo(cx,py+ts*0.44); c.lineTo(cx-ts*0.18,py+ts*0.52); c.lineTo(cx-ts*0.18,py+ts*0.40); c.lineTo(cx,py+ts*0.34); c.fill();
      c.beginPath(); c.moveTo(cx,py+ts*0.44); c.lineTo(cx+ts*0.18,py+ts*0.52); c.lineTo(cx+ts*0.18,py+ts*0.40); c.lineTo(cx,py+ts*0.34); c.fill();
      c.fillStyle='#9b6dff'; c.fillRect(cx-ts*0.012, py+ts*0.35, ts*0.024, ts*0.16);  // brilho do cosmo
      break;
    }
    case 'P': _pofnirQuad(c,px,py,ts,gx,gy,0,0); break;   // Pofnir 2x2: sup-esq
    case 'Q': _pofnirQuad(c,px,py,ts,gx,gy,1,0); break;   // sup-dir
    case 'R': _pofnirQuad(c,px,py,ts,gx,gy,0,1); break;   // inf-esq
    case 'U': _pofnirQuad(c,px,py,ts,gx,gy,1,1); break;   // inf-dir
    case 'M':                                          // parede do cabare
      c.fillStyle = '#7d2738'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#5e1b2a'; c.fillRect(px, py+ts-3, ts, 3);
      if(gx%2===0){
        c.fillStyle = '#3a1620'; c.fillRect(px+ts*0.26, py+ts*0.24, ts*0.48, ts*0.42);
        c.fillStyle = '#f2c14e'; c.fillRect(px+ts*0.3, py+ts*0.28, ts*0.4, ts*0.34);
        c.fillStyle = '#c98f3a'; c.fillRect(px+ts*0.5-0.5, py+ts*0.28, 1, ts*0.34);
      }
      break;
    case 'm':                                          // toldo + placa do cabare
      c.fillStyle = '#5e1b2a'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#8a2b3d'; for(let i=0;i<ts;i+=6) c.fillRect(px+i, py, 3, ts*0.55);
      c.fillStyle = '#3a1620'; c.fillRect(px, py, ts, 2);
      c.fillStyle = '#e3b34a'; c.fillRect(px, py+ts*0.56, ts, ts*0.2);   // faixa da placa
      c.fillStyle = '#9c6f28'; c.fillRect(px, py+ts*0.56, ts, 1.5);
      break;
    case 'E':                                          // entrada iluminada do cabare
      c.fillStyle = '#7d2738'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#2a0f16'; c.fillRect(px+ts*0.2, py+ts*0.08, ts*0.6, ts*0.92);
      c.fillStyle = '#b5533a'; c.fillRect(px+ts*0.27, py+ts*0.16, ts*0.46, ts*0.84);
      c.fillStyle = '#f2c14e'; c.fillRect(px+ts*0.37, py+ts*0.46, ts*0.26, ts*0.54);
      break;
    case 'L':                                          // lampiao
      grassBase(c,px,py,ts,gx,gy);
      c.fillStyle = '#2e2a22'; c.fillRect(px+ts*0.5-1.5, py+ts*0.22, 3, ts*0.72);
      c.fillStyle = '#3a3328'; c.fillRect(px+ts*0.5-4, py+ts*0.16, 8, 4);
      c.fillStyle = 'rgba(255,207,110,0.22)';
      c.beginPath(); c.arc(px+ts*0.5, py+ts*0.16, ts*0.34, 0, Math.PI*2); c.fill();
      c.fillStyle = '#ffcf6e';
      c.beginPath(); c.arc(px+ts*0.5, py+ts*0.16, ts*0.15, 0, Math.PI*2); c.fill();
      break;
    case 'W':                                          // parede de madeira (Sapopemba)
      c.fillStyle = '#7a4a2a'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#5f3a20'; for(let i=0;i<ts;i+=5) c.fillRect(px, py+i, ts, 1.5);  // tabuas
      c.fillStyle = '#8a5630'; c.fillRect(px,py,ts,2);                                // topo
      c.fillStyle = '#4d2f1a'; c.fillRect(px, py+ts-3, ts, 3);                        // base
      c.fillStyle = '#3a2414'; c.fillRect(px+ts*0.5-0.5, py, 1, ts);                  // junta vertical
      break;
    case 'V': {                                        // placa I LOVE SAPOPEMBA
      grassBase(c,px,py,ts,gx,gy);
      c.fillStyle = '#2e2a22'; c.fillRect(px+ts*0.5-1.5, py+ts*0.5, 3, ts*0.5);       // poste
      c.fillStyle = '#c0392b'; c.fillRect(px+ts*0.06, py+ts*0.06, ts*0.88, ts*0.48);  // placa vermelha
      c.fillStyle = '#9c2419'; c.fillRect(px+ts*0.06, py+ts*0.5, ts*0.88, 2);
      const hx=px+ts*0.5, hy=py+ts*0.27, s=ts*0.13;                                   // coracao branco
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(hx-s*0.5, hy-s*0.18, s*0.62, 0, Math.PI*2);
      c.arc(hx+s*0.5, hy-s*0.18, s*0.62, 0, Math.PI*2);
      c.moveTo(hx-s*1.08, hy); c.lineTo(hx, hy+s*1.15); c.lineTo(hx+s*1.08, hy); c.closePath();
      c.fill();
      break;
    }
    // ---- RASHARAN (o hub em terra divina) ----
    case 'a': {                                        // marmore branco da igreja
      c.fillStyle = '#eef0f6'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#e2e5ef'; c.fillRect(px,py,ts,1); c.fillRect(px,py,1,ts);
      c.strokeStyle = 'rgba(180,186,205,0.5)'; c.lineWidth = 1;
      if((gx+gy)%2){ c.beginPath(); c.moveTo(px+ts*0.2,py+ts*0.3); c.lineTo(px+ts*0.7,py+ts*0.6); c.stroke(); }
      break;
    }
    case 'A': {                                        // coluna/parede de marmore
      c.fillStyle = '#dfe2ec'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#f3f5fb'; c.fillRect(px+ts*0.18,py,ts*0.12,ts);   // caneluras
      c.fillStyle = '#f3f5fb'; c.fillRect(px+ts*0.52,py,ts*0.12,ts);
      c.fillStyle = '#c3c8d8'; c.fillRect(px+ts*0.38,py,ts*0.06,ts);
      c.fillStyle = '#b6bccd'; c.fillRect(px,py+ts-2,ts,2);
      break;
    }
    case 'l': {                                        // altar de Valiria (ouro+luz)
      c.fillStyle = '#eef0f6'; c.fillRect(px,py,ts,ts);
      c.save(); c.globalCompositeOperation='lighter';
      const ag=c.createRadialGradient(px+ts/2,py+ts/2,1,px+ts/2,py+ts/2,ts*0.7);
      ag.addColorStop(0,'rgba(255,233,176,0.8)'); ag.addColorStop(1,'rgba(255,233,176,0)');
      c.fillStyle=ag; c.fillRect(px-ts*0.3,py-ts*0.3,ts*1.6,ts*1.6); c.restore();
      c.fillStyle = '#d9b15a'; c.fillRect(px+ts*0.16,py+ts*0.28,ts*0.68,ts*0.5);
      c.fillStyle = '#f4d27a'; c.fillRect(px+ts*0.16,py+ts*0.28,ts*0.68,ts*0.1);
      c.fillStyle = '#fff8e6'; c.fillRect(px+ts*0.44,py+ts*0.1,ts*0.12,ts*0.22);   // chama/vela
      break;
    }
    case 'e': {                                        // chao de floresta noturna
      c.fillStyle = '#1d2817'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#2f3f26';
      for(let i=0;i<4;i++){ const rx=(gx*7+i*53)%ts, ry=(gy*11+i*29)%ts; c.fillRect(px+rx,py+ry,2,2); }
      c.fillStyle = '#36492b'; c.fillRect(px,py,ts,1);
      break;
    }
    case 'n': {                                        // flor-da-lua (brilha)
      c.fillStyle = '#26331f'; c.fillRect(px,py,ts,ts);
      c.save(); c.globalCompositeOperation='lighter';
      const fg=c.createRadialGradient(px+ts/2,py+ts*0.45,1,px+ts/2,py+ts*0.45,ts*0.5);
      fg.addColorStop(0,'rgba(199,182,255,0.9)'); fg.addColorStop(1,'rgba(199,182,255,0)');
      c.fillStyle=fg; c.beginPath(); c.arc(px+ts/2,py+ts*0.45,ts*0.5,0,Math.PI*2); c.fill();
      c.restore();
      c.fillStyle = '#d9ccff';
      for(let k=0;k<5;k++){ const a=k*Math.PI*2/5 - Math.PI/2;
        c.beginPath(); c.ellipse(px+ts/2+Math.cos(a)*ts*0.14, py+ts*0.45+Math.sin(a)*ts*0.14, ts*0.07, ts*0.04, a, 0, Math.PI*2); c.fill(); }
      c.fillStyle = '#fff'; c.beginPath(); c.arc(px+ts/2,py+ts*0.45,ts*0.05,0,Math.PI*2); c.fill();
      break;
    }
    case 'd': {                                        // terra de cemiterio
      c.fillStyle = '#3a3730'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#46423a';
      for(let i=0;i<5;i++){ const rx=(gx*13+i*37)%ts, ry=(gy*7+i*19)%ts; c.fillRect(px+rx,py+ry,2,1); }
      c.fillStyle = '#312e28'; c.fillRect(px,py+ts-1,ts,1);
      break;
    }
    case 'q': {                                        // lapide
      c.fillStyle = '#3a3730'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#2a2722'; c.beginPath(); c.ellipse(px+ts/2,py+ts*0.8,ts*0.34,ts*0.1,0,0,Math.PI*2); c.fill();
      c.fillStyle = '#9aa0a8';
      roundRect(c, px+ts*0.26, py+ts*0.14, ts*0.48, ts*0.66, ts*0.22); c.fill();
      c.fillStyle = '#7c828a'; c.fillRect(px+ts*0.46,py+ts*0.3,ts*0.08,ts*0.34);   // cruz
      c.fillRect(px+ts*0.36,py+ts*0.4,ts*0.28,ts*0.08);
      break;
    }
    case 'N': {                                        // ninho do Jeans
      c.fillStyle = '#3a3730'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#6b4a2a';
      c.beginPath(); c.ellipse(px+ts/2,py+ts*0.6,ts*0.4,ts*0.26,0,0,Math.PI*2); c.fill();
      c.fillStyle = '#4d3320';
      c.beginPath(); c.ellipse(px+ts/2,py+ts*0.58,ts*0.26,ts*0.16,0,0,Math.PI*2); c.fill();
      c.strokeStyle = '#5a3d24'; c.lineWidth=1.4;
      for(let k=0;k<6;k++){ const a=k*Math.PI/3; c.beginPath();
        c.moveTo(px+ts/2+Math.cos(a)*ts*0.2, py+ts*0.6+Math.sin(a)*ts*0.12);
        c.lineTo(px+ts/2+Math.cos(a)*ts*0.42, py+ts*0.6+Math.sin(a)*ts*0.2); c.stroke(); }
      break;
    }
    case '@': {                                        // portal pros Ermos (volta pra casa)
      c.fillStyle = '#3a3730'; c.fillRect(px,py,ts,ts);
      c.save(); c.globalCompositeOperation='lighter';
      const t=Date.now()/600;
      const pg=c.createRadialGradient(px+ts/2,py+ts/2,1,px+ts/2,py+ts/2,ts*0.55);
      pg.addColorStop(0,'rgba(244,184,96,0.9)'); pg.addColorStop(0.6,'rgba(120,200,170,0.5)'); pg.addColorStop(1,'rgba(120,200,170,0)');
      c.fillStyle=pg; c.beginPath(); c.arc(px+ts/2,py+ts/2,ts*0.55,0,Math.PI*2); c.fill();
      c.strokeStyle='rgba(255,240,200,0.8)'; c.lineWidth=2;
      for(let r=0;r<3;r++){ c.beginPath(); c.arc(px+ts/2,py+ts/2,ts*0.16+r*ts*0.12, t+r, t+r+Math.PI*1.3); c.stroke(); }
      c.restore();
      break;
    }
    // ---- VALORAN (a alcova de luz do Pofnir) ----
    case 'i': {                                        // marmore divino luminoso
      c.fillStyle = '#f4f1e6'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#fbf9f0'; c.fillRect(px,py,ts,1); c.fillRect(px,py,1,ts);
      c.fillStyle = '#e7e0cb'; c.fillRect(px,py+ts-1,ts,1);
      if((gx*3+gy)%5===0){ c.fillStyle='rgba(244,210,122,0.5)'; c.fillRect(px+ts*0.5,py+ts*0.5,2,2); }
      break;
    }
    case 'I': {                                        // pilar dourado
      c.fillStyle = '#e7d49a'; c.fillRect(px+ts*0.12,py,ts*0.76,ts);
      c.fillStyle = '#f6e6ad'; c.fillRect(px+ts*0.22,py,ts*0.14,ts);
      c.fillStyle = '#f6e6ad'; c.fillRect(px+ts*0.5,py,ts*0.14,ts);
      c.fillStyle = '#c9ad63'; c.fillRect(px+ts*0.42,py,ts*0.08,ts);
      c.fillStyle = '#d9b15a'; c.fillRect(px+ts*0.06,py,ts*0.88,ts*0.08);          // capitel
      c.fillStyle = '#d9b15a'; c.fillRect(px+ts*0.06,py+ts*0.9,ts*0.88,ts*0.1);    // base
      break;
    }
    case 'u': {                                        // dais de luz (lar do Pofnir)
      c.fillStyle = '#fdf6e3'; c.fillRect(px,py,ts,ts);
      c.save(); c.globalCompositeOperation='lighter';
      const dg=c.createRadialGradient(px+ts/2,py+ts/2,1,px+ts/2,py+ts/2,ts*0.8);
      dg.addColorStop(0,'rgba(255,244,210,0.7)'); dg.addColorStop(1,'rgba(255,244,210,0)');
      c.fillStyle=dg; c.fillRect(px-ts*0.4,py-ts*0.4,ts*1.8,ts*1.8); c.restore();
      c.strokeStyle='rgba(214,177,90,0.5)'; c.lineWidth=1;
      c.strokeRect(px+0.5,py+0.5,ts-1,ts-1);
      break;
    }
    case 'v': {                                        // nuvem luminosa (borda)
      c.save(); c.globalCompositeOperation='lighter';
      const vg=c.createRadialGradient(px+ts/2,py+ts/2,1,px+ts/2,py+ts/2,ts*0.75);
      vg.addColorStop(0,'rgba(255,255,255,0.95)'); vg.addColorStop(0.6,'rgba(214,196,255,0.55)'); vg.addColorStop(1,'rgba(214,196,255,0)');
      c.fillStyle=vg; c.restore();
      c.fillStyle='#f3eeff'; 
      c.beginPath();
      c.arc(px+ts*0.3,py+ts*0.55,ts*0.3,0,Math.PI*2);
      c.arc(px+ts*0.62,py+ts*0.45,ts*0.34,0,Math.PI*2);
      c.arc(px+ts*0.75,py+ts*0.62,ts*0.26,0,Math.PI*2);
      c.fill();
      c.fillStyle='rgba(214,196,255,0.5)';
      c.beginPath(); c.arc(px+ts*0.5,py+ts*0.7,ts*0.3,0,Math.PI*2); c.fill();
      break;
    }
    case 'x': {                                        // fleco de luz no chao
      c.fillStyle = '#f4f1e6'; c.fillRect(px,py,ts,ts);
      c.save(); c.globalCompositeOperation='lighter';
      const t=Date.now()/500 + (gx+gy);
      const a=0.4+0.4*Math.abs(Math.sin(t));
      c.globalAlpha=a; c.fillStyle='#fff7da'; c.strokeStyle='#fff7da'; c.lineWidth=1.4;
      const sxx=px+ts/2, syy=py+ts/2, r=ts*0.2;
      c.beginPath(); c.moveTo(sxx-r,syy); c.lineTo(sxx+r,syy); c.moveTo(sxx,syy-r); c.lineTo(sxx,syy+r); c.stroke();
      c.beginPath(); c.arc(sxx,syy,1.6,0,Math.PI*2); c.fill();
      c.restore();
      break;
    }
    case 'y': {                                        // fonte de luz / braseiro
      c.fillStyle = '#f4f1e6'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#d9b15a'; c.beginPath(); c.ellipse(px+ts/2,py+ts*0.74,ts*0.3,ts*0.12,0,0,Math.PI*2); c.fill();
      c.fillStyle = '#c9a24a'; c.fillRect(px+ts*0.4,py+ts*0.5,ts*0.2,ts*0.26);
      c.save(); c.globalCompositeOperation='lighter';
      const t=Date.now()/300;
      const pg=c.createRadialGradient(px+ts/2,py+ts*0.36,1,px+ts/2,py+ts*0.36,ts*0.36);
      pg.addColorStop(0,'rgba(255,255,235,0.95)'); pg.addColorStop(0.5,'rgba(255,233,176,0.6)'); pg.addColorStop(1,'rgba(255,233,176,0)');
      c.fillStyle=pg;
      const h=ts*0.3*(0.85+0.15*Math.sin(t));
      c.beginPath(); c.ellipse(px+ts/2,py+ts*0.4-h*0.3,ts*0.12,h,0,0,Math.PI*2); c.fill();
      c.restore();
      break;
    }
    case '*': {                                        // portal-estrela (volta pra Rasharan)
      c.fillStyle = (mapName==='valoran') ? '#f4f1e6' : '#3a3730';
      c.fillRect(px,py,ts,ts);
      c.save(); c.globalCompositeOperation='lighter';
      const t=Date.now()/700;
      const sg=c.createRadialGradient(px+ts/2,py+ts/2,1,px+ts/2,py+ts/2,ts*0.7);
      sg.addColorStop(0,'rgba(255,248,220,0.95)'); sg.addColorStop(0.5,'rgba(214,177,90,0.6)'); sg.addColorStop(1,'rgba(214,177,90,0)');
      c.fillStyle=sg; c.beginPath(); c.arc(px+ts/2,py+ts/2,ts*0.7,0,Math.PI*2); c.fill();
      c.translate(px+ts/2,py+ts/2); c.rotate(t*0.4);
      c.fillStyle='#fff7da';
      c.beginPath();
      for(let k=0;k<10;k++){ const ang=k*Math.PI/5 - Math.PI/2; const rad=(k%2? ts*0.14: ts*0.34);
        const fx=Math.cos(ang)*rad, fy=Math.sin(ang)*rad; if(k===0)c.moveTo(fx,fy); else c.lineTo(fx,fy); }
      c.closePath(); c.fill();
      c.restore();
      break;
    }
    // ---- FUNDAMENTO (o castelo do Moon no cosmo) ----
    case 'z': {                                        // cosmo (vazio): estrelas + nebula
      c.fillStyle = '#06060d'; c.fillRect(px,py,ts,ts);
      const nb = Math.sin(gx*0.09) + Math.sin(gy*0.07) + Math.sin((gx+gy)*0.05);
      if(nb > 0){ c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.10 + 0.10*nb;
        c.fillStyle = (nb>1.0) ? '#3a2a6a' : '#1f2a5a'; c.fillRect(px,py,ts,ts); c.restore(); }
      const h = (gx*73856093 ^ gy*19349663) >>> 0;
      if(h%11===0){ const b=h%3;
        c.fillStyle = b===0?'#ffffff':(b===1?'#cdd6ff':'#fff2cc');
        c.fillRect(px+(h%ts), py+((h>>4)%ts), b===2?2:1, b===2?2:1); }
      if(h%53===0){ c.save(); c.globalCompositeOperation='lighter';
        const sxx=px+(h%ts), syy=py+((h>>6)%ts);
        const g=c.createRadialGradient(sxx,syy,0,sxx,syy,3);
        g.addColorStop(0,'#fff'); g.addColorStop(1,'rgba(255,255,255,0)');
        c.fillStyle=g; c.beginPath(); c.arc(sxx,syy,3,0,Math.PI*2); c.fill(); c.restore(); }
      break;
    }
    case 'r': {                                        // piso do castelo (pedra regia)
      c.fillStyle = '#1b1826'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#231f33'; c.fillRect(px,py,ts,1); c.fillRect(px,py,1,ts);
      c.fillStyle = '#131120'; c.fillRect(px,py+ts-1,ts,1); c.fillRect(px+ts-1,py,1,ts);
      if((gx+gy)%2){ c.fillStyle = 'rgba(155,109,255,0.05)'; c.fillRect(px,py,ts,ts); }
      break;
    }
    case 'G': {                                        // muralha de pedra
      c.fillStyle = '#15131e'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#221d30'; c.fillRect(px,py,ts,ts*0.5);
      c.fillStyle = '#0e0c16'; c.fillRect(px,py+ts*0.5,ts,ts*0.5);
      c.fillStyle = '#2a2540'; c.fillRect(px,py,ts,2);
      c.fillStyle = '#080610'; c.fillRect(px,py+ts-2,ts,2);
      c.fillStyle = '#0c0a14'; c.fillRect(px+ts*0.5-0.5,py,1,ts);
      if((gx*3+gy)%6===0){ c.fillStyle='rgba(155,109,255,0.18)'; c.fillRect(px+ts*0.3,py+ts*0.42,ts*0.4,2); }
      break;
    }
    case 'C': {                                        // tapete real (violeta + ouro)
      c.fillStyle = '#3a2a5a'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#d9b15a'; c.fillRect(px,py,ts*0.1,ts); c.fillRect(px+ts*0.9,py,ts*0.1,ts);
      c.fillStyle = '#4a3670'; c.fillRect(px+ts*0.12,py,ts*0.76,ts);
      c.strokeStyle = 'rgba(217,177,90,0.6)'; c.lineWidth = 1;
      const m=px+ts/2, nn=py+ts/2, s=ts*0.22;
      c.beginPath(); c.moveTo(m,nn-s); c.lineTo(m+s,nn); c.lineTo(m,nn+s); c.lineTo(m-s,nn); c.closePath(); c.stroke();
      break;
    }
    case 'Z': {                                        // dais / degraus
      c.fillStyle = '#2a2738'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#34304a'; c.fillRect(px,py,ts,2);
      c.fillStyle = '#d9b15a'; c.fillRect(px,py,ts,1);
      c.fillStyle = '#191726'; c.fillRect(px,py+ts-2,ts,2);
      break;
    }
    case 'B': {                                        // braseiro cosmico
      c.fillStyle = '#1b1826'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#3a3550'; c.beginPath(); c.ellipse(px+ts/2,py+ts*0.74,ts*0.28,ts*0.1,0,0,Math.PI*2); c.fill();
      c.fillStyle = '#2a2740'; c.fillRect(px+ts*0.36,py+ts*0.52,ts*0.28,ts*0.22);
      c.fillStyle = '#4a4566'; c.beginPath(); c.ellipse(px+ts/2,py+ts*0.5,ts*0.24,ts*0.08,0,0,Math.PI*2); c.fill();
      c.save(); c.globalCompositeOperation='lighter';
      const g=c.createRadialGradient(px+ts/2,py+ts*0.38,1,px+ts/2,py+ts*0.38,ts*0.34);
      g.addColorStop(0,'#e9ddff'); g.addColorStop(0.4,'#9b6dff'); g.addColorStop(1,'rgba(120,90,200,0)');
      c.fillStyle=g; c.beginPath(); c.ellipse(px+ts/2,py+ts*0.36,ts*0.18,ts*0.3,0,0,Math.PI*2); c.fill();
      c.restore();
      break;
    }
    case 'F': {                                        // estandarte do Moon
      c.fillStyle = '#15131e'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#2a1f4a'; c.fillRect(px+ts*0.22,py,ts*0.56,ts*0.88);
      c.beginPath(); c.moveTo(px+ts*0.22,py+ts*0.88); c.lineTo(px+ts*0.5,py+ts*0.78);
      c.lineTo(px+ts*0.78,py+ts*0.88); c.lineTo(px+ts*0.78,py+ts*0.96); c.lineTo(px+ts*0.22,py+ts*0.96); c.closePath(); c.fill();
      c.fillStyle = '#3a2d5e'; c.fillRect(px+ts*0.22,py,ts*0.56,2);
      c.fillStyle = '#d9b15a'; c.beginPath(); c.arc(px+ts*0.5,py+ts*0.4,ts*0.16,0,Math.PI*2); c.fill();
      c.fillStyle = '#2a1f4a'; c.beginPath(); c.arc(px+ts*0.57,py+ts*0.36,ts*0.14,0,Math.PI*2); c.fill();
      break;
    }
    case 'K': {                                        // janela cosmica na muralha
      c.fillStyle = '#15131e'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#05050c'; c.fillRect(px+ts*0.18,py+ts*0.12,ts*0.64,ts*0.76);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=0.3; c.fillStyle='#3a2a6a';
      c.fillRect(px+ts*0.18,py+ts*0.12,ts*0.64,ts*0.76); c.restore();
      const h=(gx*2654435761 ^ gy*40503) >>> 0;
      c.fillStyle='#cdd6ff'; c.fillRect(px+ts*0.3+(h%6),py+ts*0.3+((h>>3)%6),1,1);
      c.fillStyle='#fff'; c.fillRect(px+ts*0.5+((h>>5)%5),py+ts*0.55+((h>>8)%5),1,1);
      c.strokeStyle='#2a2540'; c.lineWidth=2; c.strokeRect(px+ts*0.18,py+ts*0.12,ts*0.64,ts*0.76);
      c.fillStyle='#2a2540'; c.fillRect(px+ts*0.5-1,py+ts*0.12,2,ts*0.76);
      break;
    }
    case 'Y': _throneTile(c, px, py, ts, gx, gy); break;   // trono monumental
    default: grassBase(c,px,py,ts,gx,gy);
  }
}
function computeThroneBounds(){
  let X0=999,Y0=999,X1=-1,Y1=-1;
  for(let y=0;y<mapH;y++) for(let x=0;x<mapW;x++){
    if(mapRows[y] && mapRows[y][x]==='Y'){ if(x<X0)X0=x; if(y<Y0)Y0=y; if(x>X1)X1=x; if(y>Y1)Y1=y; }
  }
  return (X1<0) ? null : {x0:X0,y0:Y0,x1:X1,y1:Y1,w:X1-X0+1,h:Y1-Y0+1};
}
function _throneTile(c, px, py, ts, gx, gy){
  const tb = throneBounds;
  c.fillStyle='#15131e'; c.fillRect(px,py,ts,ts);
  if(!tb){ c.fillStyle='#3a3550'; c.fillRect(px,py,ts,ts); return; }
  const rx=gx-tb.x0, ry=gy-tb.y0, W=tb.w, H=tb.h;
  const left=rx===0, right=rx===W-1, topRow=ry===0, botRow=ry===H-1;
  const dark='#1a1726', gold='#d9b15a', goldD='#b08a3a', seatV='#4a3670';
  c.fillStyle=dark; c.fillRect(px,py,ts,ts);
  if(topRow){                                         // coroa do espaldar
    c.fillStyle=gold; c.fillRect(px+ts*0.18,py+ts*0.32,ts*0.64,ts*0.68);
    c.beginPath(); c.moveTo(px+ts*0.3,py+ts*0.34); c.lineTo(px+ts*0.5,py); c.lineTo(px+ts*0.7,py+ts*0.34); c.closePath(); c.fill();
    c.fillStyle=goldD; c.fillRect(px+ts*0.18,py+ts*0.86,ts*0.64,ts*0.14);
  } else if(botRow){                                  // base dourada
    c.fillStyle=goldD; c.fillRect(px,py+ts*0.28,ts,ts*0.72);
    c.fillStyle=gold; c.fillRect(px,py+ts*0.28,ts,3);
  } else if(left || right){                           // bracos/postes laterais
    c.fillStyle=gold; c.fillRect(left?px+ts*0.45:px, py, ts*0.55, ts);
    c.fillStyle=goldD; c.fillRect(left?px+ts*0.45:px, py+ts*0.4, ts*0.55, 3);
  } else if(ry >= H-2){                               // assento (almofada violeta)
    c.fillStyle=seatV; c.fillRect(px,py,ts,ts);
    c.fillStyle='#5a4486'; c.fillRect(px,py,ts,3);
  } else {                                            // espaldar central + sigilo
    c.fillStyle=goldD; c.fillRect(px+ts*0.15,py,ts*0.7,ts);
    c.fillStyle=dark; c.fillRect(px+ts*0.25,py,ts*0.5,ts);
    const cxr=(tb.x0+tb.x1)/2, cyr=tb.y0+1.5;
    if(Math.abs(gx-cxr)<1.0 && Math.abs(gy-cyr)<1.2){
      c.fillStyle=gold; c.beginPath(); c.arc(px+ts/2,py+ts/2,ts*0.32,0,Math.PI*2); c.fill();
      c.fillStyle=dark; c.beginPath(); c.arc(px+ts*0.64,py+ts*0.42,ts*0.27,0,Math.PI*2); c.fill();
    }
  }
}
function buildMapCanvas(){
  mapCanvas = document.createElement('canvas');
  mapCanvas.width = mapW*TS; mapCanvas.height = mapH*TS;
  const c = mapCanvas.getContext('2d');
  for(let y=0;y<mapH;y++)
    for(let x=0;x<mapW;x++)
      drawTile(c, mapRows[y][x], x*TS, y*TS, TS, x, y);
}

// ===========================================================================
//  OS DEUSES — desenhos grandes (4x4 a 6x6), com aura e efeito ao andar.
//  Cada deus se revela com o nome por cima. So aparecem nos reinos secretos.
// ===========================================================================
function _deityAura(c, cx, cy, R, color, moving){
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(cx, cy, R*0.1, cx, cy, R*1.2);
  g.addColorStop(0, color + 'cc'); g.addColorStop(0.45, color + '3a'); g.addColorStop(1, color + '00');
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R*1.2, 0, Math.PI*2); c.fill();
  c.restore();
}
function _deitySparkles(c, cx, cy, R, color, moving){
  const t = Date.now()/1000;
  const n = moving ? 9 : 5;
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = color;
  for(let i=0;i<n;i++){
    const a = t*1.3 + i*(Math.PI*2/n);
    const rr = R*(0.72 + 0.22*Math.sin(t*2+i));
    const x = cx + Math.cos(a)*rr;
    const y = cy + Math.sin(a)*rr*0.65 + Math.sin(t*1.5+i)*2;
    const s = (moving?1.7:1.1) * (0.6 + 0.4*Math.sin(t*3+i));
    c.globalAlpha = 0.5 + 0.4*Math.sin(t*2.5+i);
    c.beginPath(); c.arc(x, y, Math.max(0.5,s), 0, Math.PI*2); c.fill();
  }
  c.restore();
}
function _deityName(c, cx, topY, name, color){
  if(!name) return;
  c.save();
  c.font = '600 12px Cinzel, Georgia, serif'; c.textAlign = 'center';
  const w = c.measureText(name).width;
  c.fillStyle = 'rgba(8,8,16,0.55)';
  roundRect(c, cx - w/2 - 9, topY - 14, w + 18, 19, 6); c.fill();
  c.fillStyle = color || '#fff'; c.shadowColor = color || '#fff'; c.shadowBlur = 9;
  c.fillText(name, cx, topY); c.restore();
}
function drawDeity(c, sx, sy, ts, p){
  const N = p.size || 4;
  const span = N*ts;
  const cx = sx + ts*0.5;
  const cy = sy + ts*0.5;
  const R = span*0.46;
  const moving = !!p._moving;
  const accent = p.accent || '#ffffff';
  const bob = moving ? Math.sin(((p.walk||0)/WALK_CYCLE)*Math.PI*2)*3
                     : Math.sin(Date.now()/700)*1.6;
  _deityAura(c, cx, cy + bob, R, accent, moving);
  c.save(); c.translate(cx, cy + bob);
  if(p.form === 'cat_white') drawPofnirGod(c, R, p.eyes || '#34d17a');
  else if(p.form === 'elf')  drawValiriaGod(c, R, accent);
  else if(p.form === 'owl')  drawNherithGod(c, R, accent);
  else if(p.form === 'crow') drawJeansGod(c, R, accent);
  else if(p.form === 'valdris')  drawValdrisGod(c, R, accent);
  else if(p.form === 'dog_black') drawVargoGod(c, R, accent);
  else if(p.form === 'tortoise')  drawMarturGod(c, R, accent);
  else { c.fillStyle = accent; c.beginPath(); c.arc(0,0,R*0.5,0,Math.PI*2); c.fill(); }
  c.restore();
  _deitySparkles(c, cx, cy + bob, R, accent, moving);
  _deityName(c, cx, cy - R - 6 + bob, p.name || '', accent);
}

// --- Pofnir: o Maine Coon branco supremo, olhos verdes, com halo dourado ---
function _pofnirTail(c, S){
  c.save(); c.fillStyle = '#f2f2f8';
  c.beginPath();
  c.moveTo(S*0.4, S*0.4);
  c.quadraticCurveTo(S*1.05, S*0.22, S*0.98, -S*0.42);
  c.quadraticCurveTo(S*0.92, -S*0.74, S*0.7, -S*0.52);
  c.quadraticCurveTo(S*0.82, -S*0.18, S*0.55, S*0.22);
  c.closePath(); c.fill();
  c.fillStyle = '#e3e4ee'; c.globalAlpha = 0.6;
  c.beginPath();
  c.moveTo(S*0.5, S*0.3);
  c.quadraticCurveTo(S*0.95, S*0.1, S*0.9, -S*0.4);
  c.quadraticCurveTo(S*0.86, -S*0.2, S*0.6, S*0.18);
  c.closePath(); c.fill();
  c.restore();
}
function drawPofnirGod(c, R, eyes){
  const S = R;
  // halo dourado (supremo)
  c.save(); c.globalCompositeOperation = 'lighter';
  c.strokeStyle = 'rgba(255,230,150,0.9)'; c.lineWidth = Math.max(2, S*0.05);
  c.shadowColor = '#ffe09a'; c.shadowBlur = 12;
  c.beginPath(); c.ellipse(0, -S*1.04, S*0.5, S*0.16, 0, 0, Math.PI*2); c.stroke();
  c.restore();
  // sombra
  c.save(); c.globalAlpha = 0.25; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0, S*0.92, S*0.62, S*0.16, 0, 0, Math.PI*2); c.fill(); c.restore();
  _pofnirTail(c, S);
  const white = '#f7f7fb', shade = '#dfe0ea';
  // corpo
  c.fillStyle = white;
  c.beginPath(); c.ellipse(0, S*0.32, S*0.58, S*0.62, 0, 0, Math.PI*2); c.fill();
  // tufos do peito
  c.fillStyle = '#ffffff';
  for(let i=-2;i<=2;i++){
    c.beginPath(); c.moveTo(i*S*0.17, S*0.02);
    c.lineTo(i*S*0.17 - S*0.06, S*0.52); c.lineTo(i*S*0.17 + S*0.06, S*0.52);
    c.closePath(); c.fill();
  }
  c.fillStyle = shade; c.globalAlpha = 0.45;
  c.beginPath(); c.ellipse(S*0.34, S*0.36, S*0.18, S*0.48, 0, 0, Math.PI*2); c.fill();
  c.globalAlpha = 1;
  // cabeca
  c.fillStyle = white;
  c.beginPath(); c.ellipse(0, -S*0.34, S*0.46, S*0.4, 0, 0, Math.PI*2); c.fill();
  // bochechas/tufos
  c.beginPath(); c.moveTo(-S*0.42,-S*0.34); c.lineTo(-S*0.64,-S*0.2); c.lineTo(-S*0.4,-S*0.1); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.42,-S*0.34); c.lineTo(S*0.64,-S*0.2); c.lineTo(S*0.4,-S*0.1); c.closePath(); c.fill();
  // orelhas
  function ear(dx){
    c.fillStyle = white;
    c.beginPath(); c.moveTo(dx - S*0.07, -S*0.6); c.lineTo(dx + S*0.04, -S*0.98); c.lineTo(dx + S*0.18, -S*0.58); c.closePath(); c.fill();
    c.fillStyle = '#e7bcd0';
    c.beginPath(); c.moveTo(dx + 0.0, -S*0.64); c.lineTo(dx + S*0.06, -S*0.88); c.lineTo(dx + S*0.12, -S*0.62); c.closePath(); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = Math.max(1, S*0.02);
    c.beginPath(); c.moveTo(dx + S*0.04, -S*0.98); c.lineTo(dx + S*0.06, -S*1.08); c.stroke();
  }
  ear(-S*0.26); ear(S*0.1);
  // olhos verdes (a assinatura)
  function eye(dx){
    c.fillStyle = '#0c1a12';
    c.beginPath(); c.ellipse(dx, -S*0.34, S*0.13, S*0.16, 0, 0, Math.PI*2); c.fill();
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(dx,-S*0.34,1,dx,-S*0.34,S*0.16);
    g.addColorStop(0, eyes); g.addColorStop(0.7, eyes); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(dx,-S*0.34,S*0.12,S*0.15,0,0,Math.PI*2); c.fill();
    c.restore();
    c.fillStyle = '#06120a';
    c.beginPath(); c.ellipse(dx,-S*0.34,S*0.035,S*0.12,0,0,Math.PI*2); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(dx - S*0.045, -S*0.4, S*0.03, 0, Math.PI*2); c.fill();
  }
  eye(-S*0.2); eye(S*0.2);
  // nariz
  c.fillStyle = '#e88aa0';
  c.beginPath(); c.moveTo(-S*0.05,-S*0.17); c.lineTo(S*0.05,-S*0.17); c.lineTo(0,-S*0.1); c.closePath(); c.fill();
  // boca
  c.strokeStyle = 'rgba(150,130,140,0.8)'; c.lineWidth = Math.max(1, S*0.015);
  c.beginPath();
  c.moveTo(0,-S*0.1); c.lineTo(0,-S*0.05);
  c.moveTo(0,-S*0.05); c.quadraticCurveTo(-S*0.08,-S*0.01,-S*0.12,-S*0.05);
  c.moveTo(0,-S*0.05); c.quadraticCurveTo(S*0.08,-S*0.01,S*0.12,-S*0.05); c.stroke();
  // bigodes
  c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1;
  for(const s of [-1,1]) for(let k=0;k<3;k++){
    c.beginPath(); c.moveTo(s*S*0.08, -S*0.12 + k*S*0.03);
    c.lineTo(s*S*0.52, -S*0.2 + k*S*0.05); c.stroke();
  }
}

// --- Valiria: a elfa da aurora, manto branco e ouro ---
function drawValiriaGod(c, R, accent){
  const S = R;
  c.save(); c.globalAlpha = 0.22; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0, S*0.95, S*0.5, S*0.14, 0, 0, Math.PI*2); c.fill(); c.restore();
  // manto
  c.fillStyle = '#fbf6ea';
  c.beginPath(); c.moveTo(0,-S*0.2); c.lineTo(-S*0.45, S*0.95); c.lineTo(S*0.45, S*0.95); c.closePath(); c.fill();
  c.strokeStyle = '#e9dcbf'; c.lineWidth = Math.max(1, S*0.02);
  c.beginPath(); c.moveTo(0,-S*0.1); c.lineTo(0,S*0.92);
  c.moveTo(-S*0.18,S*0.2); c.lineTo(-S*0.28,S*0.9);
  c.moveTo(S*0.18,S*0.2); c.lineTo(S*0.28,S*0.9); c.stroke();
  c.fillStyle = accent; c.fillRect(-S*0.44, S*0.86, S*0.88, S*0.06);   // barra dourada
  // estola dourada
  c.fillStyle = accent; c.globalAlpha = 0.9;
  c.beginPath(); c.moveTo(0,-S*0.18); c.lineTo(-S*0.34,S*0.5); c.lineTo(-S*0.24,S*0.5);
  c.lineTo(0,-S*0.05); c.lineTo(S*0.24,S*0.5); c.lineTo(S*0.34,S*0.5); c.closePath(); c.fill();
  c.globalAlpha = 1;
  // cabelo atras
  c.fillStyle = '#d9b15a';
  c.beginPath(); c.ellipse(0,-S*0.45,S*0.3,S*0.42,0,0,Math.PI*2); c.fill();
  // rosto
  c.fillStyle = '#f3d4b3';
  c.beginPath(); c.ellipse(0,-S*0.5,S*0.2,S*0.24,0,0,Math.PI*2); c.fill();
  // orelhas pontudas
  for(const s of [-1,1]){
    c.beginPath(); c.moveTo(s*S*0.18,-S*0.52); c.lineTo(s*S*0.33,-S*0.66); c.lineTo(s*S*0.2,-S*0.42); c.closePath(); c.fill();
  }
  // mechas na testa
  c.fillStyle = '#e7c267';
  c.beginPath(); c.moveTo(-S*0.2,-S*0.62); c.quadraticCurveTo(0,-S*0.8,S*0.2,-S*0.62);
  c.lineTo(S*0.18,-S*0.5); c.quadraticCurveTo(0,-S*0.6,-S*0.18,-S*0.5); c.closePath(); c.fill();
  // olhos serenos
  c.fillStyle = '#7a5a3a';
  c.beginPath(); c.ellipse(-S*0.08,-S*0.5,S*0.026,S*0.018,0,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(S*0.08,-S*0.5,S*0.026,S*0.018,0,0,Math.PI*2); c.fill();
  // chama da aurora na mao
  c.save(); c.globalCompositeOperation = 'lighter';
  const fx = S*0.42, fy = S*0.3;
  const g = c.createRadialGradient(fx,fy,1,fx,fy,S*0.22);
  g.addColorStop(0,'#fff'); g.addColorStop(0.5,accent); g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(fx,fy,S*0.22,0,Math.PI*2); c.fill(); c.restore();
}

// --- Nherith: a coruja de prata, olhos de lua ---
function drawNherithGod(c, R, accent){
  const S = R;
  c.save(); c.globalAlpha = 0.22; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0,S*0.92,S*0.5,S*0.14,0,0,Math.PI*2); c.fill(); c.restore();
  const silver = '#cfd3e6', dark = '#9aa0be';
  c.fillStyle = silver;
  c.beginPath(); c.ellipse(0,S*0.15,S*0.52,S*0.62,0,0,Math.PI*2); c.fill();
  // asas
  c.fillStyle = dark;
  c.beginPath(); c.ellipse(-S*0.42,S*0.2,S*0.16,S*0.46,0.2,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(S*0.42,S*0.2,S*0.16,S*0.46,-0.2,0,Math.PI*2); c.fill();
  // escamas do peito
  c.fillStyle = '#e7eaf6'; c.globalAlpha = 0.7;
  for(let r=0;r<3;r++) for(let k=-2;k<=2;k++){
    c.beginPath(); c.arc(k*S*0.18, S*0.05+r*S*0.18, S*0.07, Math.PI, 0); c.fill();
  }
  c.globalAlpha = 1;
  // tufos de orelha
  c.fillStyle = dark;
  c.beginPath(); c.moveTo(-S*0.28,-S*0.42); c.lineTo(-S*0.42,-S*0.74); c.lineTo(-S*0.14,-S*0.5); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.28,-S*0.42); c.lineTo(S*0.42,-S*0.74); c.lineTo(S*0.14,-S*0.5); c.closePath(); c.fill();
  // disco facial
  c.fillStyle = '#e9ecf7';
  c.beginPath(); c.ellipse(0,-S*0.28,S*0.44,S*0.4,0,0,Math.PI*2); c.fill();
  // olhos enormes (lua)
  for(const s of [-1,1]){
    const ex = s*S*0.2;
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(ex,-S*0.28,1,ex,-S*0.28,S*0.2);
    g.addColorStop(0,'#fff'); g.addColorStop(0.6,accent); g.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(ex,-S*0.28,S*0.2,0,Math.PI*2); c.fill(); c.restore();
    c.fillStyle = '#fbfcff'; c.beginPath(); c.arc(ex,-S*0.28,S*0.15,0,Math.PI*2); c.fill();
    c.fillStyle = '#1a1430'; c.beginPath(); c.arc(ex,-S*0.28,S*0.08,0,Math.PI*2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(ex-S*0.03,-S*0.32,S*0.025,0,Math.PI*2); c.fill();
  }
  // bico
  c.fillStyle = '#e0b050';
  c.beginPath(); c.moveTo(-S*0.05,-S*0.2); c.lineTo(S*0.05,-S*0.2); c.lineTo(0,-S*0.04); c.closePath(); c.fill();
  // garras
  c.fillStyle = '#e0b050';
  c.fillRect(-S*0.18,S*0.74,S*0.1,S*0.08); c.fillRect(S*0.08,S*0.74,S*0.1,S*0.08);
}

// --- Jeans: o corvo-deus, negro com brilho violeta ---
function drawJeansGod(c, R, accent){
  const S = R;
  c.save(); c.globalAlpha = 0.25; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0,S*0.9,S*0.45,S*0.13,0,0,Math.PI*2); c.fill(); c.restore();
  const black = '#14141d';
  // cauda
  c.fillStyle = black;
  c.beginPath(); c.moveTo(-S*0.1,S*0.2); c.lineTo(-S*0.52,S*0.55); c.lineTo(S*0.05,S*0.45); c.closePath(); c.fill();
  // corpo
  c.beginPath(); c.ellipse(0,S*0.18,S*0.4,S*0.5,0,0,Math.PI*2); c.fill();
  // asa
  c.fillStyle = '#1d1b2e';
  c.beginPath(); c.ellipse(S*0.12,S*0.2,S*0.28,S*0.42,-0.2,0,Math.PI*2); c.fill();
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; c.fillStyle = accent;
  c.beginPath(); c.ellipse(S*0.1,S*0.1,S*0.2,S*0.3,-0.2,0,Math.PI*2); c.fill(); c.restore();
  // cabeca
  c.fillStyle = black;
  c.beginPath(); c.arc(0,-S*0.4,S*0.3,0,Math.PI*2); c.fill();
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.4; c.fillStyle = accent;
  c.beginPath(); c.arc(-S*0.08,-S*0.48,S*0.12,0,Math.PI*2); c.fill(); c.restore();
  // bico
  c.fillStyle = '#1a1a22';
  c.beginPath(); c.moveTo(-S*0.02,-S*0.46); c.lineTo(-S*0.52,-S*0.36); c.lineTo(-S*0.02,-S*0.28); c.closePath(); c.fill();
  c.fillStyle = '#0d0d12';
  c.beginPath(); c.moveTo(-S*0.02,-S*0.4); c.lineTo(-S*0.52,-S*0.36); c.lineTo(-S*0.02,-S*0.33); c.closePath(); c.fill();
  // olho esperto
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(S*0.1,-S*0.46,1,S*0.1,-S*0.46,S*0.1);
  g.addColorStop(0,'#fff'); g.addColorStop(0.6,accent); g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(S*0.1,-S*0.46,S*0.1,0,Math.PI*2); c.fill(); c.restore();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(S*0.1,-S*0.46,S*0.045,0,Math.PI*2); c.fill();
  c.fillStyle = '#1a1430'; c.beginPath(); c.arc(S*0.1,-S*0.46,S*0.02,0,Math.PI*2); c.fill();
}

// --- Valdris: o forasteiro, aqui imponente e belo, servo do Criador ---
function drawValdrisGod(c, R, accent){
  const S = R;
  c.save(); c.globalAlpha = 0.25; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0,S*0.96,S*0.5,S*0.14,0,0,Math.PI*2); c.fill(); c.restore();
  // manto exterior
  c.fillStyle = '#2a1f4a';
  c.beginPath(); c.moveTo(0,-S*0.55);
  c.quadraticCurveTo(-S*0.7,-S*0.2,-S*0.6,S*0.95); c.lineTo(S*0.6,S*0.95);
  c.quadraticCurveTo(S*0.7,-S*0.2,0,-S*0.55); c.closePath(); c.fill();
  // forro mais claro
  c.fillStyle = '#4a3670';
  c.beginPath(); c.moveTo(0,-S*0.4); c.lineTo(-S*0.34,S*0.92); c.lineTo(S*0.34,S*0.92); c.closePath(); c.fill();
  // dobras
  c.strokeStyle = '#1c1436'; c.lineWidth = Math.max(1,S*0.02);
  c.beginPath(); c.moveTo(-S*0.18,S*0.1); c.lineTo(-S*0.34,S*0.9);
  c.moveTo(S*0.18,S*0.1); c.lineTo(S*0.34,S*0.9); c.moveTo(0,-S*0.3); c.lineTo(0,S*0.9); c.stroke();
  // gola alta / ombreiras
  c.fillStyle = '#1c1436';
  c.beginPath(); c.moveTo(-S*0.34,-S*0.38); c.quadraticCurveTo(0,-S*0.6,S*0.34,-S*0.38);
  c.quadraticCurveTo(0,-S*0.46,-S*0.34,-S*0.38); c.closePath(); c.fill();
  // broche ambar VAZIO no peito (o cristal perdido)
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5;
  const ag = c.createRadialGradient(0,-S*0.12,1,0,-S*0.12,S*0.08);
  ag.addColorStop(0,'#caa15a'); ag.addColorStop(1,'rgba(180,140,60,0)');
  c.fillStyle = ag; c.beginPath(); c.arc(0,-S*0.12,S*0.08,0,Math.PI*2); c.fill(); c.restore();
  c.strokeStyle = '#b08a3a'; c.lineWidth = 1; c.beginPath(); c.arc(0,-S*0.12,S*0.05,0,Math.PI*2); c.stroke();
  // cabelo escuro
  c.fillStyle = '#1a1430';
  c.beginPath(); c.ellipse(0,-S*0.52,S*0.32,S*0.34,0,0,Math.PI*2); c.fill();
  // rosto palido
  c.fillStyle = '#d9cfe6';
  c.beginPath(); c.ellipse(0,-S*0.55,S*0.2,S*0.25,0,0,Math.PI*2); c.fill();
  // mechas na frente
  c.fillStyle = '#231a42';
  c.beginPath(); c.moveTo(-S*0.22,-S*0.66); c.quadraticCurveTo(0,-S*0.84,S*0.22,-S*0.66);
  c.lineTo(S*0.16,-S*0.52); c.quadraticCurveTo(0,-S*0.64,-S*0.16,-S*0.52); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(-S*0.2,-S*0.6); c.lineTo(-S*0.24,-S*0.4); c.lineTo(-S*0.12,-S*0.5); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.2,-S*0.6); c.lineTo(S*0.24,-S*0.4); c.lineTo(S*0.12,-S*0.5); c.closePath(); c.fill();
  // circlete sutil
  c.strokeStyle = accent; c.lineWidth = Math.max(1,S*0.02);
  c.beginPath(); c.arc(0,-S*0.58,S*0.2,Math.PI*1.15,Math.PI*1.85); c.stroke();
  // olhos que brilham (violeta)
  for(const s of [-1,1]){
    const ex = s*S*0.08;
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(ex,-S*0.55,0,ex,-S*0.55,S*0.06);
    g.addColorStop(0,'#fff'); g.addColorStop(0.4,accent); g.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(ex,-S*0.55,S*0.06,0,Math.PI*2); c.fill(); c.restore();
    c.fillStyle = '#6a4aa0'; c.beginPath(); c.arc(ex,-S*0.55,S*0.022,0,Math.PI*2); c.fill();
  }
  // sobrancelhas severas
  c.strokeStyle = '#1a1430'; c.lineWidth = Math.max(1,S*0.02);
  c.beginPath(); c.moveTo(-S*0.14,-S*0.62); c.lineTo(-S*0.03,-S*0.59);
  c.moveTo(S*0.14,-S*0.62); c.lineTo(S*0.03,-S*0.59); c.stroke();
}

// --- Vargo: o cao negro que leva os mortos ---
function drawVargoGod(c, R, accent){
  const S = R;
  c.save(); c.globalAlpha = 0.28; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0,S*0.92,S*0.55,S*0.15,0,0,Math.PI*2); c.fill(); c.restore();
  const black = '#14121c', edge = '#2a2438';
  // cauda
  c.fillStyle = black;
  c.beginPath(); c.moveTo(-S*0.4,S*0.3); c.quadraticCurveTo(-S*0.8,S*0.1,-S*0.7,-S*0.3);
  c.quadraticCurveTo(-S*0.6,-S*0.1,-S*0.35,S*0.35); c.closePath(); c.fill();
  // corpo
  c.beginPath(); c.ellipse(0,S*0.35,S*0.5,S*0.55,0,0,Math.PI*2); c.fill();
  // patas
  c.fillRect(-S*0.3,S*0.55,S*0.16,S*0.4); c.fillRect(S*0.14,S*0.55,S*0.16,S*0.4);
  c.fillStyle = edge; c.fillRect(-S*0.3,S*0.9,S*0.16,S*0.06); c.fillRect(S*0.14,S*0.9,S*0.16,S*0.06);
  // brilho no peito
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.3; c.fillStyle = accent;
  c.beginPath(); c.ellipse(0,S*0.3,S*0.2,S*0.34,0,0,Math.PI*2); c.fill(); c.restore();
  // cabeca
  c.fillStyle = black;
  c.beginPath(); c.ellipse(0,-S*0.32,S*0.36,S*0.34,0,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(0,-S*0.14,S*0.18,S*0.16,0,0,Math.PI*2); c.fill();   // focinho
  // orelhas
  c.beginPath(); c.moveTo(-S*0.3,-S*0.52); c.lineTo(-S*0.46,-S*0.8); c.lineTo(-S*0.16,-S*0.58); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.3,-S*0.52); c.lineTo(S*0.46,-S*0.8); c.lineTo(S*0.16,-S*0.58); c.closePath(); c.fill();
  c.fillStyle = edge;
  c.beginPath(); c.moveTo(-S*0.28,-S*0.54); c.lineTo(-S*0.4,-S*0.73); c.lineTo(-S*0.2,-S*0.58); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.28,-S*0.54); c.lineTo(S*0.4,-S*0.73); c.lineTo(S*0.2,-S*0.58); c.closePath(); c.fill();
  // ponta do focinho
  c.fillStyle = '#0a0810'; c.beginPath(); c.ellipse(0,-S*0.04,S*0.06,S*0.045,0,0,Math.PI*2); c.fill();
  // olhos que brilham
  for(const s of [-1,1]){
    const ex = s*S*0.15;
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(ex,-S*0.34,0,ex,-S*0.34,S*0.1);
    g.addColorStop(0,'#fff'); g.addColorStop(0.4,accent); g.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(ex,-S*0.34,S*0.1,0,Math.PI*2); c.fill(); c.restore();
    c.fillStyle = '#d9ccff'; c.beginPath(); c.arc(ex,-S*0.34,S*0.04,0,Math.PI*2); c.fill();
    c.fillStyle = '#3a2d5e'; c.beginPath(); c.arc(ex,-S*0.34,S*0.018,0,Math.PI*2); c.fill();
  }
}

// --- Martur: o jabuti ancestral que carrega o tempo ---
function drawMarturGod(c, R, accent){
  const S = R;
  c.save(); c.globalAlpha = 0.25; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0,S*0.9,S*0.6,S*0.16,0,0,Math.PI*2); c.fill(); c.restore();
  // pernas
  c.fillStyle = '#5a6a3a';
  c.fillRect(-S*0.5,S*0.4,S*0.18,S*0.4); c.fillRect(S*0.32,S*0.4,S*0.18,S*0.4);
  c.beginPath(); c.ellipse(-S*0.41,S*0.8,S*0.11,S*0.07,0,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(S*0.41,S*0.8,S*0.11,S*0.07,0,0,Math.PI*2); c.fill();
  // pescoco + cabeca
  c.fillStyle = '#6a7a4a';
  c.beginPath(); c.ellipse(0,S*0.34,S*0.16,S*0.2,0,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(0,S*0.54,S*0.18,S*0.16,0,0,Math.PI*2); c.fill();
  c.strokeStyle = '#4a5a30'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(-S*0.1,S*0.34); c.lineTo(S*0.1,S*0.34); c.moveTo(-S*0.1,S*0.42); c.lineTo(S*0.1,S*0.42); c.stroke();
  // olhos velhos
  c.fillStyle = '#1a1a10';
  c.beginPath(); c.arc(-S*0.07,S*0.52,S*0.025,0,Math.PI*2); c.fill();
  c.beginPath(); c.arc(S*0.07,S*0.52,S*0.025,0,Math.PI*2); c.fill();
  // CASCO (o mais imponente)
  const shell='#6e5a32', shellD='#54421f', shellL='#8a7240';
  c.fillStyle = shell;
  c.beginPath(); c.ellipse(0,-S*0.05,S*0.6,S*0.55,0,Math.PI,0); c.fill();
  c.fillStyle = shellD;
  c.beginPath(); c.ellipse(0,-S*0.02,S*0.6,S*0.16,0,0,Math.PI*2); c.fill();
  // placas hexagonais
  c.strokeStyle = shellD; c.lineWidth = Math.max(1,S*0.025); c.fillStyle = shellL;
  function plate(cx,cy,rr){
    c.beginPath();
    for(let k=0;k<6;k++){ const a=k*Math.PI/3 - Math.PI/2; const x=cx+Math.cos(a)*rr, y=cy+Math.sin(a)*rr*0.85;
      if(k===0)c.moveTo(x,y); else c.lineTo(x,y);} c.closePath(); c.fill(); c.stroke();
  }
  plate(0,-S*0.18,S*0.2);
  plate(-S*0.3,-S*0.08,S*0.16); plate(S*0.3,-S*0.08,S*0.16);
  plate(-S*0.16,-S*0.36,S*0.13); plate(S*0.16,-S*0.36,S*0.13);
  // brilho dourado do tempo
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.2; c.fillStyle = accent;
  c.beginPath(); c.ellipse(-S*0.15,-S*0.25,S*0.2,S*0.16,0,0,Math.PI*2); c.fill(); c.restore();
}

// ===========================================================================
//  PERSONAGEM (look + animação de passo)
// ===========================================================================
function roundRect(c,x,y,w,h,r){
  c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
}
function drawStaff(c, cx, py, ts, bob){
  const sx = cx + ts*0.30;
  const top = py+ts*0.28 + bob, bot = py+ts*0.86 + bob;
  c.strokeStyle = '#6b4a2a'; c.lineWidth = 2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(sx, bot); c.lineTo(sx-ts*0.05, top); c.stroke();
  c.fillStyle = 'rgba(244,184,96,.35)';
  c.beginPath(); c.arc(sx-ts*0.05, top, ts*0.11, 0, Math.PI*2); c.fill();
  c.fillStyle = '#f4b860';
  c.beginPath(); c.arc(sx-ts*0.05, top, ts*0.05, 0, Math.PI*2); c.fill();
}
function drawHat(c, hx, topY, hr, kind, cloak, facing){
  const hatCol = shade(cloak,-0.18);
  if(kind==='wizard'){
    c.fillStyle = hatCol;
    c.beginPath(); c.ellipse(hx, topY+1, hr*1.3, hr*0.42, 0, 0, Math.PI*2); c.fill();
    c.beginPath(); c.moveTo(hx-hr*0.85, topY+1); c.lineTo(hx+hr*0.85, topY+1);
    c.lineTo(hx+hr*0.2, topY-hr*1.8); c.closePath(); c.fill();
    c.fillStyle = '#f4b860'; c.fillRect(hx-hr*0.7, topY-hr*0.5, hr*1.4, 2);
  } else if(kind==='cap'){
    c.fillStyle = hatCol;
    c.beginPath(); c.arc(hx, topY+hr*0.25, hr*0.95, Math.PI, 0); c.fill();
    c.fillRect(hx-hr*0.95, topY+hr*0.25-1, hr*1.9, 2);
    const bw = hr*0.8;
    if(facing==='left') c.fillRect(hx-hr*1.5, topY+hr*0.12, bw, 2);
    else if(facing==='right') c.fillRect(hx+hr*0.7, topY+hr*0.12, bw, 2);
    else c.fillRect(hx-bw/2, topY+hr*0.02, bw, 2);
  }
}
function drawCharacter(c, px, py, ts, look, facing, name, isSelf, moving, walk){
  const cx = px + ts/2;
  const cyc = ((walk||0) % WALK_CYCLE) / WALK_CYCLE;
  const frame = cyc < 0.5 ? 0 : 1;
  const bob = moving ? -Math.abs(Math.sin(cyc*Math.PI*2))*1.4 : 0;

  // sombra (no chão, sem balanço)
  c.fillStyle = 'rgba(0,0,0,.28)';
  c.beginPath(); c.ellipse(cx, py+ts*0.86, ts*0.26, ts*0.09, 0, 0, Math.PI*2); c.fill();

  // botas (alternam ao andar)
  const bootCol = shade(look.cloak,-0.5);
  const baseFy = py+ts*0.74 + bob;
  const lf = baseFy + (moving ? (frame ? -1.5 : 1.5) : 0);
  const rf = baseFy + (moving ? (frame ? 1.5 : -1.5) : 0);
  c.fillStyle = bootCol;
  c.fillRect(cx-ts*0.16, lf, ts*0.1, ts*0.13);
  c.fillRect(cx+ts*0.06, rf, ts*0.1, ts*0.13);

  if(look.staff) drawStaff(c, cx, py, ts, bob);

  const hood = shade(look.cloak,-0.30);
  const bodyTop = py+ts*0.42 + bob, bodyH = ts*0.40, bodyW = ts*0.44;

  // corpo (capa)
  c.fillStyle = look.cloak;
  roundRect(c, cx-bodyW/2, bodyTop, bodyW, bodyH, 4); c.fill();
  c.strokeStyle = hood; c.lineWidth = 1; c.stroke();

  // cabeça
  const hx = cx, hy = py+ts*0.34 + bob, hr = ts*0.20;
  c.fillStyle = look.skin;
  c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI*2); c.fill();

  if(look.hood==='up'){
    c.fillStyle = hood;
    c.beginPath(); c.arc(hx, hy, hr+1, Math.PI, Math.PI*2); c.fill();
    c.fillRect(hx-hr-1, hy-1, (hr+1)*2, 2);
  } else {
    c.fillStyle = look.hair;
    c.beginPath(); c.arc(hx, hy-hr*0.15, hr*0.95, Math.PI, 0); c.fill();
    c.fillRect(hx-hr*0.95, hy-hr*0.15-1, hr*1.9, 2);
    c.fillStyle = hood;
    roundRect(c, cx-bodyW*0.34, bodyTop-2, bodyW*0.68, 5, 3); c.fill();
  }

  // olhos conforme direção
  c.fillStyle = '#2a2233'; const ey = hy + hr*0.18;
  if(facing==='up'){
    c.fillStyle = (look.hood==='up') ? hood : look.hair;
    c.beginPath(); c.arc(hx, hy, hr*0.99, 0, Math.PI*2); c.fill();
  } else if(facing==='left'){ c.fillRect(hx-hr*0.55, ey, 2, 2); }
  else if(facing==='right'){ c.fillRect(hx+hr*0.35, ey, 2, 2); }
  else { c.fillRect(hx-hr*0.45, ey, 2, 2); c.fillRect(hx+hr*0.20, ey, 2, 2); }

  if(look.hat && look.hat!=='none') drawHat(c, hx, hy-hr*0.95, hr, look.hat, look.cloak, facing);

  // placa de nome (ancorada, sem balanço)
  if(name){
    c.font = '600 11px Inter, sans-serif'; c.textAlign='center'; c.textBaseline='middle';
    const w = c.measureText(name).width + 12; const ty = py - 1, th = 15;
    c.fillStyle = 'rgba(15,14,23,.8)'; roundRect(c, cx-w/2, ty-th, w, th, 5); c.fill();
    c.fillStyle = isSelf ? '#f4b860' : '#e8e4f0'; c.fillText(name, cx, ty-th/2+1);
  }
}

// O corvo: passarinho preto empoleirado, com um pulinho quando se move.
function drawCrow(c, px, py, ts, facing, moving, walk, look){
  const body = (look && look.feather) || '#15151b';
  const cx = px + ts*0.5;
  const hop = moving ? Math.abs(Math.sin((walk/WALK_CYCLE)*Math.PI*2))*3 : 0;
  const baseY = py + ts*0.66 - hop;
  const dir = (facing==='left') ? -1 : 1;     // pra onde aponta o bico
  c.save();
  c.globalAlpha = 0.22; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(cx, py+ts*0.82, ts*0.2, ts*0.07, 0, 0, Math.PI*2); c.fill();
  c.globalAlpha = 1;
  c.fillStyle = body;
  c.beginPath(); c.ellipse(cx, baseY, ts*0.2, ts*0.16, 0, 0, Math.PI*2); c.fill();   // corpo
  c.beginPath();                                                                      // cauda
  c.moveTo(cx - dir*ts*0.15, baseY - ts*0.02);
  c.lineTo(cx - dir*ts*0.36, baseY + ts*0.05);
  c.lineTo(cx - dir*ts*0.15, baseY + ts*0.1);
  c.closePath(); c.fill();
  const hx = cx + dir*ts*0.13, hy = baseY - ts*0.13;
  c.beginPath(); c.arc(hx, hy, ts*0.1, 0, Math.PI*2); c.fill();                        // cabeca
  c.fillStyle = '#e0a020';                                                             // bico
  c.beginPath();
  c.moveTo(hx + dir*ts*0.07, hy - ts*0.01);
  c.lineTo(hx + dir*ts*0.22, hy + ts*0.02);
  c.lineTo(hx + dir*ts*0.07, hy + ts*0.05);
  c.closePath(); c.fill();
  c.fillStyle = '#3a3a52';                                                             // leve brilho na asa
  c.globalAlpha = 0.5;
  c.beginPath(); c.ellipse(cx - dir*ts*0.03, baseY - ts*0.04, ts*0.09, ts*0.05, 0, 0, Math.PI*2); c.fill();
  c.globalAlpha = 1;
  c.fillStyle = '#fff'; c.fillRect(hx + dir*ts*0.015 - 0.8, hy - ts*0.035, 1.8, 1.8);  // olho
  c.restore();
}

// O Jose (Mestre Cuscuz): gato preto, sorrisao de cheshire, fumaca roxa subindo.
function drawCat(c, px, py, ts, facing, moving, walk, look){
  const smoke = !look || look.smoke !== false;
  const grin  = !look || look.grin  !== false;
  const cx = px + ts*0.5;
  const t = performance.now();
  const hop = moving ? Math.abs(Math.sin((walk/WALK_CYCLE)*Math.PI*2))*2 : 0;
  const baseY = py + ts*0.7 - hop;
  const dir = (facing==='left') ? -1 : 1;
  c.save();
  if(smoke){
    for(let i=0;i<3;i++){                                 // fumaca roxa
      const ph = (t/700 + i*0.45) % 1;
      const wy = baseY - ts*0.12 - ph*ts*0.7;
      const wx = cx + Math.sin(t/500 + i*2)*ts*0.16 + (i-1)*ts*0.12;
      c.globalAlpha = 0.24*(1-ph);
      c.fillStyle = '#9b6dff';
      c.beginPath(); c.arc(wx, wy, ts*(0.11+ph*0.13), 0, Math.PI*2); c.fill();
    }
  }
  c.globalAlpha = 0.22; c.fillStyle='#000';
  c.beginPath(); c.ellipse(cx, py+ts*0.84, ts*0.2, ts*0.06, 0,0,Math.PI*2); c.fill();
  c.globalAlpha = 1;
  c.strokeStyle = '#15151b'; c.lineWidth = ts*0.1; c.lineCap='round';   // cauda
  c.beginPath();
  c.moveTo(cx - dir*ts*0.15, baseY);
  c.quadraticCurveTo(cx - dir*ts*0.36, baseY - ts*0.1, cx - dir*ts*0.3, baseY - ts*0.34);
  c.stroke();
  c.fillStyle = '#15151b';
  c.beginPath(); c.ellipse(cx, baseY, ts*0.2, ts*0.18, 0, 0, Math.PI*2); c.fill();   // corpo
  const hy = baseY - ts*0.22;
  c.beginPath(); c.arc(cx, hy, ts*0.17, 0, Math.PI*2); c.fill();                       // cabeca
  c.beginPath(); c.moveTo(cx-ts*0.15,hy-ts*0.1); c.lineTo(cx-ts*0.04,hy-ts*0.12); c.lineTo(cx-ts*0.12,hy-ts*0.27); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(cx+ts*0.15,hy-ts*0.1); c.lineTo(cx+ts*0.04,hy-ts*0.12); c.lineTo(cx+ts*0.12,hy-ts*0.27); c.closePath(); c.fill();
  c.fillStyle = '#f2c14e';                                                             // olhos
  c.beginPath(); c.arc(cx-ts*0.07, hy-ts*0.01, ts*0.045, 0, Math.PI*2); c.fill();
  c.beginPath(); c.arc(cx+ts*0.07, hy-ts*0.01, ts*0.045, 0, Math.PI*2); c.fill();
  c.fillStyle = '#15151b';
  c.fillRect(cx-ts*0.07-0.5, hy-ts*0.05, 1, ts*0.08);
  c.fillRect(cx+ts*0.07-0.5, hy-ts*0.05, 1, ts*0.08);
  if(grin){
    c.strokeStyle = '#f4e6c0'; c.lineWidth = 1.5; c.lineCap='round';                   // sorrisao cheshire
    c.beginPath(); c.arc(cx, hy+ts*0.03, ts*0.1, 0.12*Math.PI, 0.88*Math.PI); c.stroke();
    c.fillStyle = '#f4e6c0';
    for(let i=-1;i<=1;i++) c.fillRect(cx+i*ts*0.05-0.6, hy+ts*0.09, 1.4, 1.6);
  } else {
    c.strokeStyle = '#0f0f14'; c.lineWidth = 1.2; c.lineCap='round';                    // boquinha normal
    c.beginPath(); c.arc(cx-ts*0.035, hy+ts*0.07, ts*0.03, 0, Math.PI); c.stroke();
    c.beginPath(); c.arc(cx+ts*0.035, hy+ts*0.07, ts*0.03, 0, Math.PI); c.stroke();
  }
  c.restore();
}

// "O Gato Branco e Grande": a aparicao do Pofnir. Gato grande, branco e etereo,
// com brilho frio e placa de nome. (Funcao propria pra nao tocar no Jose.)
function drawApparition(c, px, py, ts, facing, moving, walk, name){
  const cx = px + ts*0.5;
  const t = performance.now();
  const hop = moving ? Math.abs(Math.sin((walk/WALK_CYCLE)*Math.PI*2))*2 : 0;
  const bob = Math.sin(t/650)*1.6 + hop;        // flutua de leve, mesmo parado
  const S   = ts*1.8;                            // bem maior que um gato normal
  const baseY = py + ts*0.82 - bob;
  const dir = (facing==='left') ? -1 : 1;
  const FUR='#f4f5fc', SHADE='#d6daf0', EAR='#e7b6c8', EYE='#ecd797', GLOW='#dfe6ff';
  c.save();
  c.globalAlpha = 0.97;
  // sombra no chao
  c.globalAlpha = 0.20; c.fillStyle='#000';
  c.beginPath(); c.ellipse(cx, py+ts*0.9, ts*0.26, ts*0.07, 0,0,Math.PI*2); c.fill();
  c.globalAlpha = 0.97;
  // brilho frio em volta (aura)
  const gy = baseY - S*0.26;
  const grd = c.createRadialGradient(cx, gy, S*0.05, cx, gy, S*0.72);
  grd.addColorStop(0, 'rgba(223,230,255,0.40)');
  grd.addColorStop(1, 'rgba(223,230,255,0)');
  c.fillStyle = grd;
  c.beginPath(); c.arc(cx, gy, S*0.72, 0, Math.PI*2); c.fill();
  // cauda emplumada subindo atras
  c.strokeStyle = FUR; c.lineWidth = S*0.18; c.lineCap='round';
  c.beginPath();
  c.moveTo(cx - dir*S*0.16, baseY);
  c.quadraticCurveTo(cx - dir*S*0.44, baseY - S*0.12, cx - dir*S*0.36, baseY - S*0.46);
  c.stroke();
  c.fillStyle = FUR;                                   // ponta fofa
  c.beginPath(); c.arc(cx - dir*S*0.36, baseY - S*0.48, S*0.12, 0, Math.PI*2); c.fill();
  // corpo
  c.fillStyle = FUR;
  c.beginPath(); c.ellipse(cx, baseY - S*0.04, S*0.24, S*0.22, 0, 0, Math.PI*2); c.fill();
  // juba/peito fofo (cara de Maine Coon)
  c.fillStyle = '#fbfcff';
  c.beginPath(); c.ellipse(cx, baseY - S*0.1, S*0.17, S*0.14, 0, 0, Math.PI*2); c.fill();
  // cabeca
  const hy = baseY - S*0.3;
  c.fillStyle = FUR;
  c.beginPath(); c.arc(cx, hy, S*0.2, 0, Math.PI*2); c.fill();
  // orelhas + tufos
  for(const sgn of [-1, 1]){
    c.fillStyle = FUR;
    c.beginPath();
    c.moveTo(cx+sgn*S*0.18, hy-S*0.1);
    c.lineTo(cx+sgn*S*0.06, hy-S*0.14);
    c.lineTo(cx+sgn*S*0.14, hy-S*0.33);
    c.closePath(); c.fill();
    c.fillStyle = EAR;                                  // interno rosado
    c.beginPath();
    c.moveTo(cx+sgn*S*0.155, hy-S*0.13);
    c.lineTo(cx+sgn*S*0.10, hy-S*0.15);
    c.lineTo(cx+sgn*S*0.14, hy-S*0.27);
    c.closePath(); c.fill();
    c.strokeStyle = FUR; c.lineWidth = 1.4; c.lineCap='round';   // tufo na ponta
    c.beginPath(); c.moveTo(cx+sgn*S*0.14, hy-S*0.32);
    c.lineTo(cx+sgn*S*0.17, hy-S*0.4); c.stroke();
  }
  // olhos calmos (gota dourada, pupila fina) + brilho
  c.fillStyle = EYE;
  c.beginPath(); c.ellipse(cx-S*0.08, hy-S*0.0, S*0.05, S*0.06, 0, 0, Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(cx+S*0.08, hy-S*0.0, S*0.05, S*0.06, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = '#3a3550';
  c.fillRect(cx-S*0.08-0.6, hy-S*0.05, 1.2, S*0.1);
  c.fillRect(cx+S*0.08-0.6, hy-S*0.05, 1.2, S*0.1);
  c.fillStyle = '#ffffff';
  c.fillRect(cx-S*0.095, hy-S*0.04, 1.1, 1.1);
  c.fillRect(cx+S*0.065, hy-S*0.04, 1.1, 1.1);
  // narizinho
  c.fillStyle = EAR;
  c.beginPath();
  c.moveTo(cx-S*0.03, hy+S*0.07); c.lineTo(cx+S*0.03, hy+S*0.07);
  c.lineTo(cx, hy+S*0.1); c.closePath(); c.fill();
  // bigodes
  c.strokeStyle = 'rgba(214,218,240,0.9)'; c.lineWidth = 1;
  for(const sgn of [-1,1]){
    c.beginPath(); c.moveTo(cx+sgn*S*0.04, hy+S*0.08);
    c.lineTo(cx+sgn*S*0.24, hy+S*0.05); c.stroke();
    c.beginPath(); c.moveTo(cx+sgn*S*0.04, hy+S*0.1);
    c.lineTo(cx+sgn*S*0.23, hy+S*0.11); c.stroke();
  }
  // placa de nome
  if(name){
    c.globalAlpha = 1;
    c.font = '600 11px Inter, sans-serif'; c.textAlign='center'; c.textBaseline='middle';
    const w = c.measureText(name).width + 12; const ty = hy - S*0.42, th = 15;
    c.fillStyle = 'rgba(15,14,23,.82)'; roundRect(c, cx-w/2, ty-th, w, th, 5); c.fill();
    c.fillStyle = '#eaf0ff'; c.fillText(name, cx, ty-th/2+1);
  }
  c.restore();
}

// Cachorro caramelo (o vira-lata que, nesse mundo, MIA).
function drawDog(c, px, py, ts, facing, moving, walk, look){
  const cx = px + ts*0.5;
  const coat = (look && look.skin) || '#c8843a';
  const dark = shade(coat, -0.22);
  const hop = moving ? Math.abs(Math.sin((walk/WALK_CYCLE)*Math.PI*2))*2 : 0;
  const baseY = py + ts*0.64 - hop;
  const dir = (facing==='left') ? -1 : 1;
  c.save();
  c.globalAlpha=0.22; c.fillStyle='#000';
  c.beginPath(); c.ellipse(cx, py+ts*0.84, ts*0.24, ts*0.06, 0,0,Math.PI*2); c.fill();
  c.globalAlpha=1;
  c.strokeStyle = coat; c.lineWidth = ts*0.09; c.lineCap='round';                       // cauda
  c.beginPath(); c.moveTo(cx - dir*ts*0.18, baseY);
  c.quadraticCurveTo(cx - dir*ts*0.34, baseY - ts*0.12, cx - dir*ts*0.3, baseY - ts*0.26); c.stroke();
  c.fillStyle = dark;                                                                    // pernas
  c.fillRect(cx - dir*ts*0.12, baseY + ts*0.05, ts*0.05, ts*0.16);
  c.fillRect(cx + dir*ts*0.1,  baseY + ts*0.05, ts*0.05, ts*0.16);
  c.fillStyle = coat;                                                                    // corpo
  c.beginPath(); c.ellipse(cx, baseY, ts*0.24, ts*0.16, 0, 0, Math.PI*2); c.fill();
  const hx = cx + dir*ts*0.2, hy = baseY - ts*0.12;                                      // cabeca
  c.beginPath(); c.arc(hx, hy, ts*0.14, 0, Math.PI*2); c.fill();
  c.fillStyle = dark;                                                                    // focinho + orelha
  c.beginPath(); c.ellipse(hx + dir*ts*0.1, hy + ts*0.04, ts*0.07, ts*0.05, 0,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(hx - dir*ts*0.08, hy - ts*0.08, ts*0.05, ts*0.09, dir*0.4, 0, Math.PI*2); c.fill();
  c.fillStyle = '#1a1a1a';
  c.beginPath(); c.arc(hx + dir*ts*0.16, hy + ts*0.02, ts*0.025, 0, Math.PI*2); c.fill(); // nariz
  c.beginPath(); c.arc(hx + dir*ts*0.02, hy - ts*0.02, ts*0.022, 0, Math.PI*2); c.fill(); // olho
  c.restore();
}

// Sapo gordo e preto, quase sempre parado num canto da cidade.
function drawToad(c, px, py, ts, facing, moving, walk, look){
  const cx = px + ts*0.5;
  const body = (look && look.skin) || '#26302a';
  const belly = shade(body, 0.25);
  const breathe = Math.sin(performance.now()/600)*ts*0.012;
  const baseY = py + ts*0.74;
  c.save();
  c.globalAlpha=0.22; c.fillStyle='#000';
  c.beginPath(); c.ellipse(cx, py+ts*0.86, ts*0.28, ts*0.06, 0,0,Math.PI*2); c.fill();
  c.globalAlpha=1;
  c.fillStyle = body;                                                                    // corpo gordo
  c.beginPath(); c.ellipse(cx, baseY, ts*0.3, ts*0.2+breathe, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = belly;                                                                   // barriga
  c.beginPath(); c.ellipse(cx, baseY+ts*0.05, ts*0.18, ts*0.1, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = body;                                                                    // patas
  c.beginPath(); c.ellipse(cx-ts*0.2, baseY+ts*0.12, ts*0.06, ts*0.04, -0.3,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(cx+ts*0.2, baseY+ts*0.12, ts*0.06, ts*0.04, 0.3,0,Math.PI*2); c.fill();
  const ey = baseY - ts*0.18;                                                            // olhos esbugalhados
  c.fillStyle = body;
  c.beginPath(); c.arc(cx-ts*0.12, ey, ts*0.09, 0, Math.PI*2); c.fill();
  c.beginPath(); c.arc(cx+ts*0.12, ey, ts*0.09, 0, Math.PI*2); c.fill();
  c.fillStyle = '#e8d44a';
  c.beginPath(); c.arc(cx-ts*0.12, ey, ts*0.05, 0, Math.PI*2); c.fill();
  c.beginPath(); c.arc(cx+ts*0.12, ey, ts*0.05, 0, Math.PI*2); c.fill();
  c.fillStyle = '#000';
  c.fillRect(cx-ts*0.12-0.6, ey-ts*0.05, 1.2, ts*0.1);
  c.fillRect(cx+ts*0.12-0.6, ey-ts*0.05, 1.2, ts*0.1);
  c.strokeStyle = shade(body,-0.3); c.lineWidth=1.5; c.lineCap='round';                  // boca larga
  c.beginPath(); c.arc(cx, baseY-ts*0.02, ts*0.16, 0.1*Math.PI, 0.9*Math.PI); c.stroke();
  c.restore();
}

// ===========================================================================
//  ÍCONES DE ITENS (mesma fonte de cores do servidor, via catalog)
// ===========================================================================
function drawItemIcon(c, cx, cy, size, itemId, glow){
  const def = catalog[itemId]; if(!def) return;
  const col = def.color || '#cccccc';
  if(glow){
    c.save(); c.globalAlpha = 0.28; c.fillStyle = col;
    c.beginPath(); c.arc(cx, cy, size*0.4, 0, Math.PI*2); c.fill(); c.restore();
  }
  if(def.kind === 'currency'){
    const r = size*0.3;
    c.fillStyle = shade(col,-0.3);
    c.beginPath(); c.arc(cx, cy, r+1.5, 0, Math.PI*2); c.fill();        // borda
    c.fillStyle = col;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI*2); c.fill();            // corpo
    c.strokeStyle = shade(col,-0.42); c.lineWidth = 1;
    c.beginPath(); c.arc(cx, cy, r*0.6, 0, Math.PI*2); c.stroke();      // anel interno
    c.fillStyle = shade(col,0.28);
    c.beginPath(); c.arc(cx - r*0.3, cy - r*0.32, r*0.34, 0, Math.PI*2); c.fill(); // brilho
  } else {
    const h = size*0.6, w = Math.max(2, size*0.08);
    c.fillStyle = '#5a3f28';
    c.fillRect(cx - w/2, cy - h*0.3, w, h*0.85);                        // cabo
    const oy = cy - h*0.4, orb = size*0.17;
    c.save(); c.globalAlpha = 0.5; c.fillStyle = col;
    c.beginPath(); c.arc(cx, oy, orb*1.5, 0, Math.PI*2); c.fill(); c.restore(); // halo
    c.fillStyle = shade(col,0.12);
    c.beginPath(); c.arc(cx, oy, orb, 0, Math.PI*2); c.fill();          // orbe
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(cx - orb*0.28, oy - orb*0.28, orb*0.34, 0, Math.PI*2); c.fill(); // brilho
  }
}

// ===========================================================================
//  LOOP DE RENDER (com câmera)
// ===========================================================================
let lastT = performance.now();
function frame(now){
  const dt = Math.min(50, now - lastT); lastT = now;
  const t = 1 - Math.exp(-dt/TAU);

  players.forEach(p=>{
    const tx = p.x*TS, ty = p.y*TS;
    const moving = Math.abs(tx-p.rx) > 0.5 || Math.abs(ty-p.ry) > 0.5;
    p.rx += (tx - p.rx)*t; p.ry += (ty - p.ry)*t;
    if(Math.abs(tx-p.rx)<0.4) p.rx = tx;
    if(Math.abs(ty-p.ry)<0.4) p.ry = ty;
    p.walk = moving ? (p.walk || 0) + dt : 0;
    p._moving = moving;
  });

  // câmera centra em você, presa às bordas do mapa
  const me = players.get(myId);
  if(me){
    const tcx = me.rx + TS/2 - canvas.width/2;
    const tcy = me.ry + TS/2 - canvas.height/2;
    camX = Math.round(Math.max(0, Math.min(tcx, mapW*TS - canvas.width)));
    camY = Math.round(Math.max(0, Math.min(tcy, mapH*TS - canvas.height)));
  }

  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(mapCanvas) ctx.drawImage(mapCanvas, camX, camY, canvas.width, canvas.height,
                                          0, 0, canvas.width, canvas.height);

  // itens no chao (debaixo dos jogadores)
  ground.forEach((itemId, key)=>{
    const c = key.indexOf(','); const gx = +key.slice(0,c), gy = +key.slice(c+1);
    const sx = gx*TS - camX, sy = gy*TS - camY;
    if(sx < -TS || sy < -TS || sx > canvas.width+TS || sy > canvas.height+TS) return;
    const bob = Math.sin(now/420 + gx*1.3 + gy*0.7)*2.2;
    ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(sx+TS/2, sy+TS*0.8, TS*0.22, TS*0.09, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    drawItemIcon(ctx, sx+TS/2, sy+TS*0.5 - 2 + bob, TS, itemId, true);
  });

  // marcador do destino clicado (some sozinho)
  if(clickFx){
    const age = now - clickFx.start;
    if(age > 520){ clickFx = null; }
    else {
      const k = age/520;
      const mx = clickFx.x*TS - camX + TS/2, my = clickFx.y*TS - camY + TS/2;
      ctx.save();
      ctx.globalAlpha = (1-k)*0.85;
      ctx.strokeStyle = '#9b6dff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, 4 + k*TS*0.5, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  const ordered = [...players.values()].sort((a,b)=> (a.ry - b.ry));
  for(const p of ordered){
    const sx = p.rx - camX, sy = p.ry - camY;
    const cull = (p.size ? p.size*TS : TS);
    if(sx < -cull || sy < -cull || sx > canvas.width+cull || sy > canvas.height+cull) continue;
    if(p.kind === 'deity') drawDeity(ctx, sx, sy, TS, p);
    else if(p.kind === 'bird') drawCrow(ctx, sx, sy, TS, p.facing, p._moving, p.walk, p.look);
    else if(p.kind === 'cat') drawCat(ctx, sx, sy, TS, p.facing, p._moving, p.walk, p.look);
    else if(p.kind === 'dog') drawDog(ctx, sx, sy, TS, p.facing, p._moving, p.walk, p.look);
    else if(p.kind === 'toad') drawToad(ctx, sx, sy, TS, p.facing, p._moving, p.walk, p.look);
    else if(p.kind === 'apparition') drawApparition(ctx, sx, sy, TS, p.facing, p._moving, p.walk, p.name);
    else drawCharacter(ctx, sx, sy, TS, p.look, p.facing, p.name, p.id===myId, p._moving, p.walk);
  }

  // ---- ciclo de dia e noite: tinte por cima de tudo ----
  dayTime = (((Date.now()/1000) + dayOffset) % dayLength) / dayLength;
  if(dayTime < 0) dayTime += 1;
  const tint = dayTint(dayTime);
  if(tint){ ctx.fillStyle = tint; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if(phaseEl){
    const ph = phaseName(dayTime);
    if(ph !== lastPhase){ phaseEl.textContent = ph; lastPhase = ph; }
  }

  // ---- overlays nitidos por cima do tinte: raio, dica, baloes ----
  smites.forEach((fx, id)=>{                 // o raio do justiceiro no(s) alvo(s)
    const age = now - fx.start;
    if(age > SMITE_MS){ smites.delete(id); return; }
    const p = players.get(id); if(!p) return;
    drawSmiteFx(ctx, p.rx - camX + TS/2, p.ry - camY + TS, age/SMITE_MS, fx.color);
  });
  const myFx = smites.get(myId);             // se EU levei, flash na cor do golpe
  if(myFx){
    const k = (now - myFx.start)/SMITE_MS;
    const [fr,fg,fb] = hexRgb(myFx.color);
    ctx.save(); ctx.fillStyle = `rgba(${fr},${fg},${fb},${(0.5*(1-k)).toFixed(3)})`;
    ctx.fillRect(0,0,canvas.width,canvas.height); ctx.restore();
  }
  const hintNpc = nearestNpcWithin(1);         // dica "falar" sobre o NPC colado
  if(hintNpc && !bubbles.has(hintNpc.id)){
    drawTalkHint(ctx, hintNpc.rx - camX + TS/2, hintNpc.ry - camY, now);
  }
  bubbles.forEach((b, id)=>{                   // baloes de fala
    if(now > b.until){ bubbles.delete(id); return; }
    const p = players.get(id); if(!p) return;
    const sx = p.rx - camX + TS/2, sy = p.ry - camY;
    if(sx < -120 || sx > canvas.width+120 || sy < -70 || sy > canvas.height+70) return;
    drawBubble(ctx, sx, sy, b.text);
  });

  if(me) coordsEl.textContent = `x ${me.x}, y ${me.y}`;
  drawThroneWarn(ctx, now);                     // aparicao do Pofnir no trono
  requestAnimationFrame(frame);
}

function drawThroneWarn(c, now){
  if(!throneWarn) return;
  const age = now - throneWarn.start, LIFE = 12000;
  if(age > LIFE){ throneWarn = null; return; }
  let a = 1;
  if(age < 600) a = age/600;
  else if(age > LIFE-1400) a = Math.max(0,(LIFE-age)/1400);
  const cx = (throneWarn.cx+0.5)*TS - camX, cy = (throneWarn.cy+0.5)*TS - camY;
  const R = TS*3.2, bob = Math.sin(now/600)*TS*0.12;
  // halo de presenca
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = a*0.5;
  const g = c.createRadialGradient(cx, cy+bob, R*0.2, cx, cy+bob, R*1.5);
  g.addColorStop(0,'rgba(246,230,173,0.55)'); g.addColorStop(0.5,'rgba(155,109,255,0.25)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g; c.beginPath(); c.arc(cx, cy+bob, R*1.5, 0, Math.PI*2); c.fill(); c.restore();
  // o Pofnir espectral, imenso, sobre o trono
  c.save(); c.translate(cx, cy - R*0.35 + bob); c.globalAlpha = a*0.92;
  drawPofnirGod(c, R, '#34d17a'); c.restore();
  // a sentenca, em ouro
  if(throneWarn.text){
    c.save(); c.font = '700 '+Math.round(TS*0.62)+'px Cinzel, serif'; c.textAlign='center';
    const tyy = cy + R*0.95 + bob;
    c.lineWidth = 4; c.strokeStyle='rgba(0,0,0,0.85)'; c.strokeText(throneWarn.text, cx, tyy);
    c.fillStyle = 'rgba(246,230,173,'+a.toFixed(2)+')'; c.fillText(throneWarn.text, cx, tyy);
    c.restore();
  }
}

// ===========================================================================
//  DIA E NOITE — cor do ceu ao longo do ciclo (0 = meia-noite, .5 = meio-dia)
// ===========================================================================
// Cada ponto: [instante 0..1, [r, g, b, alpha]]. Entre dois pontos a cor e o
// alpha sao interpolados, entao o mundo escurece e clareia de leve. O
// crepusculo (entardecer) e o auge roxo-ambar, a cara do Ermo.
const SKY = [
  [0.00, [18, 22, 60, 0.58]],    // meia-noite: azul-violeta fundo
  [0.20, [40, 40, 95, 0.42]],    // madrugada
  [0.26, [255, 150, 110, 0.24]], // amanhecer quente
  [0.34, [255, 255, 255, 0.0]],  // manha: ceu limpo
  [0.52, [255, 255, 255, 0.0]],  // meio-dia: ceu limpo
  [0.68, [255, 184, 92, 0.14]],  // tarde dourada
  [0.78, [196, 92, 120, 0.32]],  // crepusculo: rosa-violeta
  [0.86, [70, 48, 110, 0.46]],   // anoitecer
  [1.00, [18, 22, 60, 0.58]],    // volta pra meia-noite
];
function dayTint(t){
  for(let i = 0; i < SKY.length - 1; i++){
    const a = SKY[i], b = SKY[i+1];
    if(t >= a[0] && t <= b[0]){
      const k = (t - a[0]) / ((b[0] - a[0]) || 1);
      const r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * k);
      const g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * k);
      const bl= Math.round(a[1][2] + (b[1][2] - a[1][2]) * k);
      const al= a[1][3] + (b[1][3] - a[1][3]) * k;
      if(al <= 0.001) return null;
      return `rgba(${r},${g},${bl},${al.toFixed(3)})`;
    }
  }
  return null;
}
function phaseName(t){
  if(t < 0.23) return 'noite';
  if(t < 0.30) return 'amanhecer';
  if(t < 0.50) return 'manhã';
  if(t < 0.66) return 'tarde';
  if(t < 0.80) return 'crepúsculo';
  if(t < 0.88) return 'anoitecer';
  return 'noite';
}

// ===========================================================================
//  VALDRIS · BALÕES DE FALA · RAIO
// ===========================================================================
function chebyshev(a, b){ return Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y)); }
function nearestNpcWithin(radius){
  const me = players.get(myId); if(!me) return null;
  let best=null, bestd=radius+1;
  for(const p of players.values()){
    if(!p.npc) continue;
    const d = chebyshev(me, p);
    if(d <= radius && d < bestd){ best=p; bestd=d; }
  }
  return best;
}
function npcOnTile(tx, ty){
  for(const p of players.values()) if(p.npc && p.x===tx && p.y===ty) return p;
  return null;
}
function meNearNpc(){ return !!nearestNpcWithin(1); }
function tryInteract(){ if(meNearNpc() && socket) socket.emit('interact'); }

// um vizinho passavel e livre do tile (tx,ty), o mais perto de quem chamou
function nearestFreeNeighbor(tx, ty, fromX, fromY){
  const cand = [[tx+1,ty],[tx-1,ty],[tx,ty+1],[tx,ty-1]]
    .filter(([x,y])=> walkableTile(x,y) && !occupiedByOther(x,y));
  if(!cand.length) return null;
  cand.sort((a,b)=> (Math.abs(a[0]-fromX)+Math.abs(a[1]-fromY)) -
                    (Math.abs(b[0]-fromX)+Math.abs(b[1]-fromY)));
  return cand[0];
}

function drawBubble(c, cx, topY, text){
  c.save();
  c.font = '600 12px Inter, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const maxW = 180;
  const words = String(text).split(' ');
  const lines = []; let line = '';
  for(const w of words){
    const t = line ? line+' '+w : w;
    if(c.measureText(t).width > maxW && line){ lines.push(line); line = w; }
    else line = t;
  }
  if(line) lines.push(line);
  const lh = 15, padX = 9, padY = 6;
  let tw = 0; for(const l of lines) tw = Math.max(tw, c.measureText(l).width);
  const w = Math.min(maxW, tw) + padX*2;
  const h = lines.length*lh + padY*2;
  const x = cx - w/2, y = topY - h - 9;
  c.fillStyle = 'rgba(20,18,30,.92)';
  c.strokeStyle = 'rgba(155,109,255,.5)'; c.lineWidth = 1;
  roundRect(c, x, y, w, h, 8); c.fill(); c.stroke();
  c.beginPath();                       // rabicho apontando pra cabeca
  c.moveTo(cx-5, y+h-0.5); c.lineTo(cx+5, y+h-0.5); c.lineTo(cx, y+h+6); c.closePath();
  c.fillStyle = 'rgba(20,18,30,.92)'; c.fill();
  c.fillStyle = '#e8e4f0';
  lines.forEach((l,i)=> c.fillText(l, cx, y+padY+lh/2 + i*lh));
  c.restore();
}

function drawTalkHint(c, cx, topY, now){
  const bob = Math.sin(now/300)*2;
  c.save();
  c.font = '600 11px Inter, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const label = 'falar';
  const w = c.measureText(label).width + 18, h = 18;
  const y = topY - h - 16 + bob;
  c.fillStyle = 'rgba(244,184,96,.96)';
  roundRect(c, cx - w/2, y, w, h, 9); c.fill();
  c.fillStyle = '#140f06';
  c.fillText(label, cx, y + h/2);
  c.restore();
}

function hexRgb(hex){
  hex = (hex || '#9b6dff').replace('#','');
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  const n = parseInt(hex,16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}
function drawSmiteFx(c, cx, groundY, k, color){
  // k: 0..1 (progresso). clarao no alvo + raio em ziguezague, na cor do justiceiro.
  const [r0,g0,b0] = hexRgb(color);
  const lr = Math.round(r0+(255-r0)*0.6), lg = Math.round(g0+(255-g0)*0.6), lb = Math.round(b0+(255-b0)*0.6);
  c.save();
  const alpha = 1 - k;
  const r = TS*(0.6 + k*1.2);
  const grd = c.createRadialGradient(cx, groundY-TS*0.3, 2, cx, groundY-TS*0.3, r);
  grd.addColorStop(0,   `rgba(${lr},${lg},${lb},${0.9*alpha})`);
  grd.addColorStop(0.4, `rgba(${r0},${g0},${b0},${0.55*alpha})`);
  grd.addColorStop(1,   `rgba(${r0},${g0},${b0},0)`);
  c.fillStyle = grd;
  c.beginPath(); c.arc(cx, groundY-TS*0.3, r, 0, Math.PI*2); c.fill();
  if(k < 0.55){                        // o raio so na primeira metade
    c.strokeStyle = `rgba(${lr},${lg},${lb},${alpha})`;
    c.lineWidth = 3; c.shadowColor = color || '#9b6dff'; c.shadowBlur = 12;
    c.beginPath();
    let x = cx + (Math.random()*8-4), y = 0;
    c.moveTo(x, y);
    const segs = 6, dy = (groundY - TS*0.4)/segs;
    for(let i=1;i<=segs;i++){ y = dy*i; x = cx + (Math.random()*18-9); c.lineTo(x, y); }
    c.stroke();
  }
  c.restore();
}

// ===========================================================================
//  CHAT
// ===========================================================================
function openChat(){
  if(!started) return;
  chatBarEl.style.display = 'flex';
  chatInputEl.focus();
}
function closeChat(){
  chatBarEl.style.display = 'none';
  chatInputEl.value = '';
  chatInputEl.blur();
}
function sendChat(){
  const t = chatInputEl.value.trim().slice(0, 120);
  if(t && socket) socket.emit('chat', { text: t });
  closeChat();
}
if(chatOpenBtn) chatOpenBtn.addEventListener('click', openChat);
if(chatSendBtn) chatSendBtn.addEventListener('click', sendChat);
if(chatInputEl) chatInputEl.addEventListener('keydown', e=>{
  if(e.key === 'Enter'){ e.preventDefault(); sendChat(); }
  else if(e.key === 'Escape'){ e.preventDefault(); closeChat(); }
});

// ===========================================================================
//  ENTRADA (teclado + direcional na tela)
// ===========================================================================
const KEYMAP = {
  ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down',
  ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right',
};
const held = []; let ticker = null;
function pressDir(dir){
  stopAuto();                 // controle manual cancela o caminhar do clique
  if(!held.includes(dir)){
    held.push(dir); sendMove(dir);
    if(!ticker) ticker = setInterval(()=>{ if(held.length) sendMove(held[held.length-1]); }, STEP_MS);
  }
}
function releaseDir(dir){
  const i = held.indexOf(dir); if(i>=0) held.splice(i,1);
  if(!held.length && ticker){ clearInterval(ticker); ticker = null; }
}
function sendMove(dir){ if(started && socket) socket.emit('move', {dir}); }

// O WASD so vira movimento DENTRO do mundo e fora de um campo de texto.
// Sem isso, digitar a/s/d/w no email/nome/senha seria engolido pelo jogo.
function typingInField(e){
  const el = e.target || document.activeElement;
  if(!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

window.addEventListener('keydown', e=>{
  if(!started || typingInField(e)) return;
  if(e.code === 'KeyE'){ e.preventDefault(); tryInteract(); return; }
  if(e.code === 'Enter'){ e.preventDefault(); openChat(); return; }
  const dir = KEYMAP[e.code]; if(!dir || e.repeat) return;
  e.preventDefault(); pressDir(dir);
});
window.addEventListener('keyup', e=>{
  const dir = KEYMAP[e.code]; if(!dir) return;
  // sempre solta (evita tecla "presa" se o foco mudar no meio do passo)
  if(started && !typingInField(e)) e.preventDefault();
  releaseDir(dir);
});

function buildDpad(){
  const pad = document.createElement('div');
  pad.style.cssText = 'position:fixed;right:18px;bottom:18px;display:grid;'+
    'grid-template-columns:repeat(3,48px);grid-template-rows:repeat(3,48px);'+
    'gap:6px;z-index:5;touch-action:none;user-select:none;opacity:.9';
  const cells = {up:'2/1',down:'2/3',left:'1/2',right:'3/2'};
  const glyph = {up:'▲',down:'▼',left:'◀',right:'▶'};
  for(const dir of ['up','down','left','right']){
    const b = document.createElement('button');
    const [col,row] = cells[dir].split('/');
    b.textContent = glyph[dir];
    b.style.cssText = `grid-column:${col};grid-row:${row};border-radius:12px;`+
      'border:1px solid rgba(155,109,255,.3);background:rgba(26,24,38,.85);'+
      'color:#cfc8e6;font-size:15px;cursor:pointer;backdrop-filter:blur(4px)';
    const press = ev=>{ ev.preventDefault(); b.style.background='rgba(155,109,255,.35)'; pressDir(dir); };
    const release = ev=>{ ev.preventDefault(); b.style.background='rgba(26,24,38,.85)'; releaseDir(dir); };
    b.addEventListener('pointerdown', press);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointerleave', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('contextmenu', ev=>ev.preventDefault());
    pad.appendChild(b);
  }
  document.body.appendChild(pad);
}

// ===========================================================================
//  REDE
// ===========================================================================
function connectWithToken(token){
  if(socket){ try{ socket.disconnect(); }catch(e){} }
  socket = io({ auth:{ token }, transports:['websocket','polling'] });

  // versao nova no ar: derruba o cliente velho (recarrega pra pegar a nova).
  socket.on('version', d=>{
    if(d && d.v && window.ERMO_VERSION && d.v !== window.ERMO_VERSION){
      try{ socket.disconnect(); }catch(e){}
      location.reload();
    }
  });

  // conta sem raca (contas antigas): manda escolher antes de entrar, itens preservados.
  socket.on('need_race', d=>{
    raceScreenLook = (d && d.look) ? d.look : currentLook;
    openRaceScreen('choose');
  });
  socket.on('race_error', d=>{
    raceConfirm.disabled = false;
    raceStatus.className = 'err';
    raceStatus.textContent = (d && d.reason) ? d.reason : 'Não consegui salvar a raça.';
  });

  socket.on('init', data=>{
    myId = data.id;
    BASE_TS = data.map.tilesize; mapRows = data.map.rows;
    mapW = data.map.width; mapH = data.map.height; mapName = data.map.map || 'ermo';
    throneBounds = computeThroneBounds();
    applyZoom(zoom);   // define TS, viewport, dimensiona o canvas e desenha o mapa
    players.clear();
    bubbles.clear(); smites.clear();
    for(const p of data.players) addPlayer(p);

    inventory = Array.isArray(data.inventory) ? data.inventory : [];
    equipment = data.equipment || {};
    Object.keys(catalog).forEach(k=> delete catalog[k]);
    Object.assign(catalog, data.items || {});
    ground.clear();
    for(const it of (data.ground||[])) ground.set(it.x+','+it.y, it.item);
    refreshInventory();
    myFicha = data.ficha || {};
    renderFicha();

    // sincroniza o relogio do mundo (dia/noite) com o servidor
    dayLength = data.day_length || 480;
    dayOffset = (data.server_now || (Date.now()/1000)) - (Date.now()/1000);

    enterWorld();
  });

  // troca de mapa (entrar no Salao / voltar pro Ermo): troca o mapa, as
  // entidades e o chao, e recoloca a camera no jogador. Mochila/ficha/relogio
  // continuam como estao.
  socket.on('map_change', data=>{
    BASE_TS = data.map.tilesize; mapRows = data.map.rows;
    mapW = data.map.width; mapH = data.map.height; mapName = data.map.map || 'ermo';
    throneBounds = computeThroneBounds();
    players.clear();
    bubbles.clear(); smites.clear();
    for(const p of data.players) addPlayer(p);
    ground.clear();
    for(const it of (data.ground||[])) ground.set(it.x+','+it.y, it.item);
    applyZoom(zoom);   // redesenha o mapa novo e cola as posicoes (sem deslizar)
    updateOnline();
  });

  socket.on('player_joined', p => addPlayer(p));
  socket.on('player_moved', m=>{
    const p = players.get(m.id); if(!p) return;
    const jump = Math.abs(m.x - p.x) + Math.abs(m.y - p.y);
    p.x = m.x; p.y = m.y; p.facing = m.facing;
    if(jump > 2){ p.rx = m.x*TS; p.ry = m.y*TS; }  // teleporte: cola, sem deslizar
  });
  socket.on('player_left', m=>{ players.delete(m.id); bubbles.delete(m.id); smites.delete(m.id); updateOnline(); });

  // falas (balao acima da entidade) e o raio do Valdris
  socket.on('speech', d=>{
    if(!d || !d.id) return;
    if(!players.has(d.id)) return;   // so fala de quem esta no mapa atual
    bubbles.set(d.id, { text: String(d.text||'').slice(0,120), until: performance.now() + BUBBLE_MS });
  });
  socket.on('smite', d=>{
    if(!d || !d.target) return;
    smites.set(d.target, { start: performance.now(), color: d.color || '#9b6dff' });
  });

  // mochila e itens do chao
  socket.on('inventory', d=>{
    inventory = Array.isArray(d.bag) ? d.bag : inventory;
    refreshInventory();
    if(d.picked) toastItem(d.picked);
  });
  socket.on('item_taken',   d=> ground.delete(d.x+','+d.y) );
  socket.on('item_spawned', d=> ground.set(d.x+','+d.y, d.item) );

  // equipamento
  socket.on('loadout', d=>{
    inventory = Array.isArray(d.bag) ? d.bag : inventory;
    equipment = d.equipment || {};
    refreshInventory();
  });
  socket.on('player_look', d=>{
    const p = players.get(d.id); if(p && d.look) p.look = d.look;
  });

  // ---- confirmacao generica (ex.: o corvo perguntando se quer ir pro Salao) ----
  socket.on('confirm', d=>{
    if(!d || !d.action) return;
    showConfirm({ title: d.title, body: d.body, ok: d.ok, cancel: d.cancel },
      ()=> socket.emit('confirm_ok', { action: d.action }));
  });

  // ---- um mestre ofereceu a classe dele: confirma + escolhe 2 atributos ----
  socket.on('class_offer', d=>{ if(d && d.class_id) openClassPicker(d); });

  // ---- a ficha mudou (classe setada / estado inicial) ----
  socket.on('ficha', d=>{
    if(d && d.ficha){
      myFicha = d.ficha;
      renderFicha();
      if(d.just_set){
        closeClassPicker();
        toastMsg('Você agora é ' + (myFicha.class_name || 'iniciado') +
                 '! Vida ' + (myFicha.hp || '?') + '.');
        if(!fichaPanelOpen) toggleFicha(true);   // abre a ficha pra ver o resultado
      }
      if(d.blessed && !fichaPanelOpen) toggleFicha(true);   // bencao: mostra a vida nova
    }
  });
  socket.on('toast', d=>{ if(d && d.text) toastMsg(d.text); });
  socket.on('throne_warn', d=>{ if(d) throneWarn = {cx:d.cx, cy:d.cy, text:d.text||'', start:performance.now()}; });
  socket.on('class_error', d=>{
    toastMsg('Não rolou: ' + ((d && d.reason) || 'erro') , true);
  });

  // token recusado pelo servidor: limpa e volta pro login
  socket.on('auth_error', ()=>{
    localStorage.removeItem(TOKEN_KEY);
    try{ socket.disconnect(); }catch(e){}
    showGate();
    setStatus('Sua sessão expirou. Entre de novo.', true);
  });

  // falha de transporte (nao de senha); se ainda nao entrou, volta pro portao
  socket.on('connect_error', ()=>{
    if(!started){
      try{ socket.disconnect(); }catch(e){}
      showGate();
      setStatus('Não consegui conectar ao Ermo. Tente de novo.', true);
    }
  });
  socket.on('disconnect', ()=>{ if(started) setStatus('Conexão perdida. Tentando voltar…'); });
}
function addPlayer(p){
  players.set(p.id, {
    id:p.id, x:p.x, y:p.y, rx:p.x*TS, ry:p.y*TS,
    facing:p.facing, name:p.name, look:p.look, walk:0, _moving:false,
    npc: !!p.npc, kind: p.kind || 'person', solid: (p.solid === false ? false : true),
    form: p.form, size: p.size, accent: p.accent, eyes: p.eyes,
  });
  updateOnline();
}
function updateOnline(){
  let n = 0; players.forEach(p=>{ if(!p.npc) n++; });
  onlineEl.textContent = n;
}
function enterWorld(){
  booting.style.display = 'none';
  gate.style.display = 'none';
  raceScreen.classList.remove('open');
  pendingReg = null;
  if(started) return;          // reconexao: estado ja refeito pelo 'init'
  started = true;
  stage.style.display = 'flex';
  hud.style.display = 'block';
  help.style.display = 'block';
  logoutB.style.display = 'block';
  bagBtn.style.display = 'block';
  if(fichaBtn) fichaBtn.style.display = 'block';
  if(chatOpenBtn) chatOpenBtn.style.display = 'block';
  { const zc = document.getElementById('zoom-ctl'); if(zc) zc.style.display = 'flex'; updateZoomLabel(); }
  buildDpad();
  requestAnimationFrame(frame);
}

// ===========================================================================
//  PORTÃO
// ===========================================================================
function setStatus(msg, isErr){
  statusEl.textContent = msg || '';
  statusEl.className = isErr ? 'err' : '';
  if(isErr) setBusy(false);
}
function setBusy(busy){ btnLogin.disabled = busy; btnReg.disabled = busy; }
function showGate(){ booting.style.display='none'; gate.style.display='block'; setBusy(false); }
function showBooting(){ gate.style.display='none'; booting.style.display='block'; }

// abas
function selectTab(which){
  const login = which === 'login';
  tabLogin.classList.toggle('active', login);
  tabReg.classList.toggle('active', !login);
  panelLogin.classList.toggle('active', login);
  panelReg.classList.toggle('active', !login);
  setStatus('');
}
tabLogin.addEventListener('click', ()=> selectTab('login'));
tabReg.addEventListener('click', ()=> selectTab('register'));

// chamadas de conta (HTTP)
async function api(path, body){
  const r = await fetch(path, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body),
  });
  let data = {};
  try{ data = await r.json(); }catch(e){}
  if(!r.ok) throw new Error(data.error || 'Falha na conexão.');
  return data;
}

async function doLogin(){
  const email = loginEmail.value.trim(), pass = loginPass.value;
  if(!email || !pass){ setStatus('Preencha email e senha.', true); return; }
  setBusy(true); setStatus('Entrando…');
  try{
    const { token } = await api('/api/login', { email, password: pass });
    localStorage.setItem(TOKEN_KEY, token);
    setStatus('Atravessando…');
    connectWithToken(token);
  }catch(err){ setStatus(err.message, true); }
}

function doRegister(){
  const email = regEmail.value.trim();
  const name = regName.value.trim() || 'Viajante';
  const pass = regPass.value;
  if(!email || !pass){ setStatus('Preencha email e senha.', true); return; }
  if(pass.length < 6){ setStatus('A senha precisa de pelo menos 6 caracteres.', true); return; }
  pendingReg = { email, name, pass };   // guarda; cria a conta ao confirmar a raça
  raceScreenLook = currentLook;
  setStatus('');
  openRaceScreen('create');
}

btnLogin.addEventListener('click', doLogin);
btnReg.addEventListener('click', doRegister);
loginPass.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
regPass.addEventListener('keydown', e=>{ if(e.key==='Enter') doRegister(); });

// sair: esquece o token e recomeca no portao
logoutB.addEventListener('click', ()=>{
  const token = localStorage.getItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  try{ api('/api/logout', { token }); }catch(e){}
  location.reload();
});

// ===========================================================================
//  TELA DE RAÇAS  (criação nova + escolha obrigatória de contas antigas)
// ===========================================================================
const raceScreen   = document.getElementById('race');
const raceListEl   = document.getElementById('race-list');
const raceDetailEl = document.getElementById('race-detail');
const raceSearch   = document.getElementById('race-search');
const raceConfirm  = document.getElementById('race-confirm');
const raceBack     = document.getElementById('race-back');
const raceStatus   = document.getElementById('race-status');
const racePcanvas  = document.getElementById('race-pcanvas');
const racePctx     = racePcanvas ? racePcanvas.getContext('2d') : null;

const TIER_DOT = { nucleo:'#3fae5a', expansao:'#3aa6a0', monstruosa:'#d08a3a', cenario:'#9b6dff', avulsa:'#8a8597' };

let raceMode = 'create';            // 'create' (cadastro) ou 'choose' (conta sem raça)
let selectedRace = null;            // id da raça escolhida
let pendingReg = null;              // {email,name,pass} entre o portão e a confirmação
let raceScreenLook = currentLook;   // qual look o preview da tela desenha

function rowLabel(r){ return r.subrace || r.name_pt; }

function renderRaceList(filter){
  filter = (filter || '').trim().toLowerCase();
  raceListEl.innerHTML = '';
  TIER_ORDER.forEach(tier=>{
    const inTier = RACES.filter(r=> r.tier === tier && (!filter ||
      (r.name_pt + ' ' + (r.subrace||'') + ' ' + r.name_en).toLowerCase().includes(filter)));
    if(!inTier.length) return;
    const h = document.createElement('div'); h.className = 'tier-h';
    const dot = document.createElement('span'); dot.className = 'tier-dot';
    dot.style.background = TIER_DOT[tier]; h.appendChild(dot);
    const lab = document.createElement('span'); lab.style.color = TIER_DOT[tier];
    lab.textContent = TIER_LABELS[tier]; h.appendChild(lab);
    raceListEl.appendChild(h);
    inTier.forEach(r=>{
      const row = document.createElement('div');
      row.className = 'race-row' + (r.id === selectedRace ? ' sel' : '');
      row.dataset.rid = r.id;
      row.textContent = rowLabel(r);
      row.addEventListener('click', ()=> selectRace(r.id));
      raceListEl.appendChild(row);
    });
  });
}

function bonusLine(r){
  if(r.bonus_flex) return r.bonus_text;             // regra de escolha: mostra tal qual
  const parts = Object.entries(r.bonus || {}).map(([a,v])=> '+' + v + ' ' + a);
  return parts.join(', ') || r.bonus_text || '—';
}

// Atributos iniciais (igual ao servidor): o array padrao [15,14,13,12,10,8]
// distribuido pros atributos na ordem de prioridade da raca. A classe da bonus depois.
const ATTR_ORDER = ['FOR','DES','CON','INT','SAB','CAR'];
const STD_ARRAY = [15,14,13,12,10,8];
function baseAttrs(r){
  const bonus = r.bonus || {};
  const ranked = ATTR_ORDER.slice().sort((a,b)=>{
    const d = (bonus[b]||0) - (bonus[a]||0);
    return d !== 0 ? d : ATTR_ORDER.indexOf(a) - ATTR_ORDER.indexOf(b);
  });
  const out = {}; ranked.forEach((a,i)=> out[a] = STD_ARRAY[i]); return out;
}
function attrMod(v){ return Math.floor((v-10)/2); }
function fmtMod(m){ return (m>=0?'+':'') + m; }
function attrGridHtml(r){
  const ba = baseAttrs(r);
  const cell = 'display:inline-block;text-align:center;min-width:48px;margin:3px;padding:6px 4px;background:#1b1830;border:1px solid #34304f;border-radius:8px;';
  const cells = ATTR_ORDER.map(a=>{
    const v = ba[a], m = attrMod(v);
    return '<div style="'+cell+'">'
      + '<div style="font:700 11px Inter,sans-serif;color:#9b6dff;letter-spacing:.5px">'+a+'</div>'
      + '<div style="font:700 19px Cinzel,serif;color:#e8e4f0;line-height:1.1">'+v+'</div>'
      + '<div style="font:600 11px Inter,sans-serif;color:#8a86a0">'+fmtMod(m)+'</div>'
      + '</div>';
  }).join('');
  return '<div style="margin:4px 0 2px">'+cells+'</div>';
}
function esc(s){ const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

function selectRace(rid){
  selectedRace = rid;
  raceListEl.querySelectorAll('.race-row').forEach(el=> el.classList.remove('sel'));
  const sel = raceListEl.querySelector('.race-row[data-rid="' + rid + '"]');
  if(sel) sel.classList.add('sel');
  const r = RACES.find(x=> x.id === rid); if(!r) return;
  const nome = r.name_pt + (r.subrace ? ' — ' + r.subrace : '');
  const dark = (r.darkvision && r.darkvision !== '—') ? r.darkvision : '—';
  raceDetailEl.innerHTML =
    '<div class="race-name">' + esc(nome) + '</div>' +
    '<div class="race-meta"><span class="race-badge" style="background:' + TIER_DOT[r.tier] + '">' +
      esc(TIER_LABELS[r.tier]) + '</span>' + esc(r.name_en) + (r.source ? ' · ' + esc(r.source) : '') + '</div>' +
    '<div class="fila"><span class="k">Bônus racial</span><span class="v">' + esc(bonusLine(r)) + '</span></div>' +
    '<div class="fsec">Atributos iniciais (da raça)</div>' + attrGridHtml(r) +
    '<div class="fila"><span class="k">Tamanho</span><span class="v">' + esc(r.size || '—') + '</span></div>' +
    '<div class="fila"><span class="k">Deslocamento</span><span class="v">' + esc(r.speed || '—') + '</span></div>' +
    '<div class="fila"><span class="k">Visão no escuro</span><span class="v">' + esc(dark) + '</span></div>' +
    '<div class="fila"><span class="k">Idiomas</span><span class="v">' + esc(r.languages || '—') + '</span></div>' +
    '<div class="fsec">Traços raciais</div><div class="ftext">' + esc(r.traits || '—').replace(/;\s*/g, '<br>') + '</div>' +
    '<div class="fsec">Descrição</div><div class="ftext">' + esc(r.desc || '') + '</div>';
  raceConfirm.disabled = false;
  raceConfirm.textContent = (raceMode === 'choose' ? 'Confirmar ' : 'Escolher ') + rowLabel(r) + ' e entrar';
}

function openRaceScreen(mode){
  raceMode = mode;
  selectedRace = null;
  raceConfirm.disabled = true;
  raceConfirm.textContent = 'Escolher raça e entrar';
  raceStatus.textContent = ''; raceStatus.className = '';
  raceSearch.value = '';
  raceBack.style.display = (mode === 'choose') ? 'none' : 'block';
  gate.style.display = 'none'; booting.style.display = 'none';
  raceDetailEl.innerHTML = '<div class="race-empty">escolha uma raça à esquerda pra ver a ficha completa</div>';
  renderRaceList('');
  raceScreen.classList.add('open');
}
function closeRaceScreen(){ raceScreen.classList.remove('open'); }

async function confirmRace(){
  if(!selectedRace) return;
  if(raceMode === 'create'){
    if(!pendingReg){ closeRaceScreen(); showGate(); return; }
    raceConfirm.disabled = true; raceStatus.className = ''; raceStatus.textContent = 'Criando sua conta…';
    try{
      const { token } = await api('/api/register', {
        email: pendingReg.email, name: pendingReg.name, password: pendingReg.pass,
        look: currentLook, race: selectedRace,
      });
      localStorage.setItem(TOKEN_KEY, token);
      raceStatus.textContent = 'Atravessando…';
      closeRaceScreen();
      connectWithToken(token);
    }catch(err){
      raceStatus.className = 'err'; raceStatus.textContent = err.message; raceConfirm.disabled = false;
    }
  } else {
    raceConfirm.disabled = true; raceStatus.className = ''; raceStatus.textContent = 'Salvando sua raça…';
    if(socket && socket.connected){ socket.emit('choose_race', { race: selectedRace }); }
    else { raceStatus.className = 'err'; raceStatus.textContent = 'Conexão perdida. Recarregue a página.'; raceConfirm.disabled = false; }
  }
}

raceConfirm.addEventListener('click', confirmRace);
raceBack.addEventListener('click', ()=>{ closeRaceScreen(); showGate(); });
raceSearch.addEventListener('input', ()=> renderRaceList(raceSearch.value));

// ---------- start ----------
buildCreator();
if(pctx) requestAnimationFrame(previewLoop);

(function boot(){
  const token = localStorage.getItem(TOKEN_KEY);
  if(token){ showBooting(); connectWithToken(token); }
  else { showGate(); loginEmail.focus(); }
})();

// ===========================================================================
//  MOCHILA (inventário)
// ===========================================================================
const INV_SLOTS = 20;
const EQUIP_SLOTS = ['hand'];
const SLOT_LABELS = { hand: 'Mão' };

function equipItem(itemId){ if(socket) socket.emit('equip', { item: itemId }); }
function unequipSlot(slot){ if(socket) socket.emit('unequip', { slot }); }

function refreshEquip(){
  if(!equipRow) return;
  equipRow.innerHTML = '';
  for(const slot of EQUIP_SLOTS){
    const cell = document.createElement('div'); cell.className = 'eq-slot';
    const box = document.createElement('div'); box.className = 'slot';
    const itemId = equipment[slot];
    if(itemId){
      box.classList.add('full');
      const def = catalog[itemId];
      box.title = (def ? def.name : itemId) + ' — clique pra tirar';
      const c = document.createElement('canvas'); c.width = 48; c.height = 48;
      drawItemIcon(c.getContext('2d'), 24, 24, 48, itemId, false);
      box.appendChild(c);
      box.style.cursor = 'pointer';
      box.addEventListener('click', ()=> unequipSlot(slot));
    } else {
      box.classList.add('eq-empty');
      box.title = 'Vazio';
    }
    const label = document.createElement('span'); label.className = 'eq-label';
    label.textContent = SLOT_LABELS[slot] || slot;
    cell.appendChild(box); cell.appendChild(label);
    equipRow.appendChild(cell);
  }
}

function refreshInventory(){
  refreshEquip();
  if(!invGrid) return;
  invGrid.innerHTML = '';
  if(!inventory.length){
    const e = document.createElement('div');
    e.className = 'inv-empty';
    e.textContent = 'Mochila vazia. Ache itens espalhados pelo mundo.';
    invGrid.appendChild(e);
    return;
  }
  const n = Math.max(INV_SLOTS, inventory.length);
  for(let i=0;i<n;i++){
    const slot = document.createElement('div');
    slot.className = 'slot';
    const stack = inventory[i];
    if(stack){
      slot.classList.add('full');
      const def = catalog[stack.item];
      const eqp = def && def.equippable;
      slot.title = (def ? def.name : stack.item) + (eqp ? ' — clique pra equipar' : '');
      const c = document.createElement('canvas'); c.width = 44; c.height = 44;
      drawItemIcon(c.getContext('2d'), 22, 22, 44, stack.item, false);
      slot.appendChild(c);
      if(stack.qty > 1){
        const q = document.createElement('span'); q.className = 'qty';
        q.textContent = stack.qty; slot.appendChild(q);
      }
      if(eqp){
        slot.style.cursor = 'pointer';
        slot.addEventListener('click', ()=> equipItem(stack.item));
      }
    }
    invGrid.appendChild(slot);
  }
}
function toggleInv(force){
  invOpen = (force === undefined) ? !invOpen : force;
  invEl.classList.toggle('open', invOpen);
  if(invOpen) refreshInventory();
}
function toastItem(picked){
  if(!toastEl) return;
  toastEl.innerHTML = '';
  const c = document.createElement('canvas'); c.width = 26; c.height = 26;
  drawItemIcon(c.getContext('2d'), 13, 13, 26, picked.item, false);
  toastEl.appendChild(c);
  const s = document.createElement('span');
  s.textContent = 'Pegou: ' + (picked.name || picked.item);
  toastEl.appendChild(s);
  toastEl.classList.add('show');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(()=> toastEl.classList.remove('show'), 2200);
}
// ===========================================================================
//  MODAIS (confirmacao + seletor de classe) e FICHA in-game
// ===========================================================================
const ATTR_NAMES = {FOR:'Força', DES:'Destreza', CON:'Constituição',
                    INT:'Inteligência', SAB:'Sabedoria', CAR:'Carisma'};

function _overlay(){
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;'+
    'justify-content:center;background:rgba(8,7,18,.72);';
  return ov;
}
function _box(maxw){
  const b = document.createElement('div');
  b.style.cssText = 'background:#15131f;border:1px solid #3a3556;border-radius:14px;'+
    'box-shadow:0 18px 50px rgba(0,0,0,.55);padding:20px 22px;max-width:'+(maxw||380)+'px;'+
    'width:calc(100% - 48px);max-height:84vh;overflow:auto;color:#e8e4f0;'+
    'font-family:Inter,system-ui,sans-serif;';
  return b;
}
function _btn(label, primary){
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = 'border:none;border-radius:9px;padding:10px 16px;font:600 14px Inter,sans-serif;'+
    'cursor:pointer;'+(primary
      ? 'background:linear-gradient(180deg,#9b6dff,#7d4fe0);color:#fff;'
      : 'background:#241f36;color:#c9c4dc;border:1px solid #3a3556;');
  return b;
}

// popup de confirmacao generico (o do corvo etc.)
function showConfirm(opts, onOk){
  const ov = _overlay(); const box = _box(380);
  const t = document.createElement('div');
  t.textContent = opts.title || 'Confirmar?';
  t.style.cssText = 'font:700 18px Cinzel,serif;color:#f4d8a0;margin-bottom:8px;';
  box.appendChild(t);
  if(opts.body){
    const bd = document.createElement('div');
    bd.textContent = opts.body;
    bd.style.cssText = 'font-size:13.5px;color:#bdb8d0;line-height:1.45;margin-bottom:18px;';
    box.appendChild(bd);
  }
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
  const cancel = _btn(opts.cancel || 'Cancelar', false);
  const ok = _btn(opts.ok || 'Confirmar', true);
  const close = ()=> ov.remove();
  cancel.onclick = close;
  ok.onclick = ()=>{ close(); try{ onOk && onOk(); }catch(e){} };
  row.appendChild(cancel); row.appendChild(ok); box.appendChild(row);
  ov.appendChild(box);
  ov.addEventListener('click', e=>{ if(e.target===ov) close(); });
  document.body.appendChild(ov);
}

// seletor de classe: confirma + escolhe 2 atributos pro +2, com preview da vida
let _classOv = null;
function closeClassPicker(){ if(_classOv){ _classOv.remove(); _classOv = null; } }
function openClassPicker(offer){
  closeClassPicker();
  const base = myFicha.attrs || {};
  const principal = offer.principal;
  const chosen = new Set();
  const ov = _overlay(); const box = _box(460); _classOv = ov;

  const t = document.createElement('div');
  t.textContent = 'Tornar-se ' + offer.name + '?';
  t.style.cssText = 'font:700 20px Cinzel,serif;color:#f4d8a0;margin-bottom:4px;';
  box.appendChild(t);

  const deus = offer.god ? ('Serve ' + offer.god + '.')
                         : 'Não serve deus nenhum: o cosmo e os livros.';
  const sub = document.createElement('div');
  sub.textContent = (offer.master || '') + ' · ' + deus + ' · Dado de vida d' + (offer.hd||'?');
  sub.style.cssText = 'font-size:12.5px;color:#9b95b4;margin-bottom:14px;';
  box.appendChild(sub);

  const inst = document.createElement('div');
  inst.innerHTML = '<b style="color:#f4b860">+4</b> em ' + ATTR_NAMES[principal] +
    ' (fixo). Escolha <b style="color:#9b6dff">2 atributos</b> para <b>+2</b>; os outros 3 ganham +1.' +
    '<br><span style="color:#e85d75;font-size:12px">A classe é uma escolha permanente.</span>';
  inst.style.cssText = 'font-size:13px;color:#cfc9e0;margin-bottom:12px;line-height:1.45;';
  box.appendChild(inst);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;';
  const cells = {};
  ATTR_ORDER.forEach(a=>{
    const cell = document.createElement('button');
    cell.style.cssText = 'text-align:center;padding:8px 4px;border-radius:9px;cursor:pointer;'+
      'border:1px solid #34304f;background:#1b1830;color:#e8e4f0;font-family:Inter,sans-serif;';
    cells[a] = cell;
    cell.onclick = ()=>{
      if(a===principal) return;
      if(chosen.has(a)) chosen.delete(a);
      else { if(chosen.size>=2) return; chosen.add(a); }
      paint();
    };
    grid.appendChild(cell);
  });
  box.appendChild(grid);

  const hpLine = document.createElement('div');
  hpLine.style.cssText = 'font:600 14px Inter,sans-serif;color:#5fd0c5;margin-bottom:16px;';
  box.appendChild(hpLine);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
  const cancel = _btn('Cancelar', false);
  const ok = _btn('Confirmar', true);
  cancel.onclick = closeClassPicker;
  ok.onclick = ()=>{
    if(chosen.size!==2) return;
    showConfirm({
      title: 'Tornar-se ' + offer.name + ' para sempre?',
      body: 'Esta escolha é PERMANENTE e não pode ser desfeita. Depois disso os mestres '+
            'não oferecem mais nenhuma classe. Tem certeza?',
      ok: 'Sim, para sempre', cancel: 'Voltar',
    }, ()=> socket.emit('set_class', { plus2: [...chosen] }));
  };
  row.appendChild(cancel); row.appendChild(ok); box.appendChild(row);

  function paint(){
    ATTR_ORDER.forEach(a=>{
      const c = cells[a]; const bv = base[a]||10;
      let delta, tag, col;
      if(a===principal){ delta=4; tag='+4 fixo'; col='#f4b860'; }
      else if(chosen.has(a)){ delta=2; tag='+2'; col='#9b6dff'; }
      else { delta=1; tag='+1'; col='#6b6680'; }
      const fv = Math.min(20, bv+delta);
      c.style.borderColor = (a===principal) ? '#f4b860' : (chosen.has(a) ? '#9b6dff' : '#34304f');
      c.style.background = (a===principal) ? 'rgba(244,184,96,.12)'
        : (chosen.has(a) ? 'rgba(155,109,255,.16)' : '#1b1830');
      c.innerHTML = '<div style="font:700 11px Inter;color:'+col+';letter-spacing:.5px">'+a+'</div>'+
        '<div style="font:700 20px Cinzel,serif;line-height:1.15">'+fv+'</div>'+
        '<div style="font:600 10px Inter;color:#8a86a0">'+tag+'</div>';
    });
    const conv = Math.min(20, (base.CON||10) + (principal==='CON'?4:(chosen.has('CON')?2:1)));
    const hp = Math.max(1, (offer.hd||8) + Math.floor((conv-10)/2));
    hpLine.textContent = 'Vida no nível 1: ' + hp + '  (d' + (offer.hd||'?') + ' + mod CON)';
    ok.disabled = chosen.size!==2;
    ok.style.opacity = chosen.size===2 ? '1' : '.5';
  }
  paint();
  ov.appendChild(box);
  document.body.appendChild(ov);
}

// FICHA in-game (botao + painel)
let fichaPanelOpen = false, fichaBtn = null, fichaPanel = null;
function _buildFichaUI(){
  if(fichaBtn) return;
  fichaBtn = document.createElement('button');
  fichaBtn.textContent = '📜'; fichaBtn.title = 'Ficha (C)';
  fichaBtn.style.cssText = 'position:fixed;right:14px;top:108px;z-index:50;width:42px;height:42px;'+
    'border-radius:10px;border:1px solid rgba(155,109,255,.35);background:rgba(26,24,38,.9);'+
    'color:#e8e4f0;font-size:18px;cursor:pointer;display:none;';
  fichaBtn.onclick = ()=> toggleFicha();
  document.body.appendChild(fichaBtn);

  fichaPanel = document.createElement('div');
  fichaPanel.style.cssText = 'position:fixed;right:14px;top:158px;z-index:55;width:300px;'+
    'max-width:calc(100% - 28px);max-height:70vh;overflow:auto;background:#15131f;'+
    'border:1px solid #3a3556;border-radius:14px;box-shadow:0 16px 44px rgba(0,0,0,.5);'+
    'padding:16px 18px;color:#e8e4f0;font-family:Inter,system-ui,sans-serif;display:none;';
  document.body.appendChild(fichaPanel);
}
function toggleFicha(force){
  fichaPanelOpen = (force===undefined) ? !fichaPanelOpen : force;
  if(fichaPanel) fichaPanel.style.display = fichaPanelOpen ? 'block' : 'none';
  if(fichaPanelOpen) renderFicha();
}
function renderFicha(){
  if(!fichaPanel) return;
  const f = myFicha || {};
  const hasClass = !!f.class_id;
  const attrs = hasClass ? (f.attrs_final||{}) : (f.attrs||{});
  const cellHtml = ATTR_ORDER.map(a=>{
    const v = attrs[a]; if(v==null) return '';
    const m = Math.floor((v-10)/2);
    return '<div style="text-align:center;padding:6px 2px;background:#1b1830;border:1px solid #34304f;border-radius:8px">'+
      '<div style="font:700 10px Inter;color:#9b6dff;letter-spacing:.5px">'+a+'</div>'+
      '<div style="font:700 17px Cinzel,serif;line-height:1.1">'+v+'</div>'+
      '<div style="font:600 10px Inter;color:#8a86a0">'+((m>=0?'+':'')+m)+'</div></div>';
  }).join('');
  const line = (k,v)=> '<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;margin:3px 0">'+
    '<span style="color:#9b95b4">'+k+'</span><span style="color:#e8e4f0;text-align:right">'+esc(v)+'</span></div>';
  let h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
    '<div style="font:700 16px Cinzel,serif;color:#f4d8a0">Ficha</div>'+
    '<button id="ficha-x" style="background:none;border:none;color:#9b95b4;font-size:18px;cursor:pointer">×</button></div>';
  h += line('Raça', f.race_name || '—');
  if(hasClass){
    h += line('Classe', f.class_name + (f.god ? ' · ' + f.god : ' · sem deus'));
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 6px">'+
      '<span style="color:#9b95b4;font-size:13px">Vida</span>'+
      '<span style="font:700 16px Cinzel,serif;color:#e85d75">❤ '+(f.hp||'?')+' / '+(f.hp_max||'?')+'</span></div>';
    h += line('Nível', f.level || 1);
  } else {
    h += '<div style="font-size:12.5px;color:#9b95b4;margin:8px 0;line-height:1.4">'+
      'Sem classe ainda. Fale com o corvo (no Ermo) pra ir ao Salão das Classes e escolher um mestre.</div>';
  }
  h += '<div style="font:600 11px Inter;color:#8a86a0;margin:12px 0 6px;letter-spacing:.5px;text-transform:uppercase">'+
    (hasClass?'Atributos (com a classe)':'Atributos (da raça)')+'</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">'+cellHtml+'</div>';
  fichaPanel.innerHTML = h;
  const x = document.getElementById('ficha-x'); if(x) x.onclick = ()=> toggleFicha(false);
}

function toastMsg(msg, isErr){
  let el = document.getElementById('msg-toast');
  if(!el){
    el = document.createElement('div'); el.id = 'msg-toast';
    el.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:9100;'+
      'padding:11px 18px;border-radius:10px;font:600 14px Inter,sans-serif;color:#fff;'+
      'box-shadow:0 10px 30px rgba(0,0,0,.45);opacity:0;transition:opacity .2s;pointer-events:none;'+
      'max-width:80vw;text-align:center;';
    document.body.appendChild(el);
  }
  el.style.background = isErr ? 'linear-gradient(180deg,#b23a4e,#8d2d3d)'
                              : 'linear-gradient(180deg,#7d4fe0,#5e3bb0)';
  el.textContent = msg; el.style.opacity = '1';
  clearTimeout(el._t); el._t = setTimeout(()=> el.style.opacity='0', 2600);
}

_buildFichaUI();
window.addEventListener('keydown', e=>{
  if(!started || typingInField(e)) return;
  if(e.code === 'KeyC'){ e.preventDefault(); toggleFicha(); }
});

if(bagBtn)   bagBtn.addEventListener('click', ()=> toggleInv());
if(invClose) invClose.addEventListener('click', ()=> toggleInv(false));
if(invEl)    invEl.addEventListener('click', e=>{ if(e.target === invEl) toggleInv(false); });
window.addEventListener('keydown', e=>{
  if(!started || typingInField(e)) return;
  if(e.code === 'KeyI'){ e.preventDefault(); toggleInv(); }
  else if(e.code === 'Escape' && invOpen){ e.preventDefault(); toggleInv(false); }
});

// ===========================================================================
//  CLIQUE PRA ANDAR (mouse / toque no mapa)
//  - acha o menor caminho ate o tile clicado, desviando de obstaculos (BFS)
//  - emite os passos no mesmo ritmo do teclado; o servidor valida cada um
// ===========================================================================
const SOLID_TILES = new Set(['~', 'T', '#', '^', 'H', 'M', 'm', 'L', 'W', 'V']);  // iguais ao servidor
const STEPV = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };
function walkableTile(x, y){
  return y >= 0 && y < mapH && x >= 0 && x < mapW && !SOLID_TILES.has(mapRows[y][x]);
}
// algum OUTRO viajante (solido) esta parado neste tile agora?
function occupiedByOther(x, y){
  for(const p of players.values()){
    if(p.id === myId) continue;
    if(p.solid === false) continue;        // corvo e afins: da pra atravessar
    if(p.x === x && p.y === y) return true;
  }
  return false;
}
function findPath(sx, sy, tx, ty){
  // nao da pra parar em cima de obstaculo nem de outro jogador
  if(!walkableTile(tx, ty) || occupiedByOther(tx, ty)) return null;
  if(sx === tx && sy === ty) return [];
  const key = (x, y) => x + ',' + y;
  const start = key(sx, sy);
  const came = new Map([[start, null]]);
  const q = [[sx, sy]]; let head = 0, found = false;
  const DIRS = [['up',0,-1], ['down',0,1], ['left',-1,0], ['right',1,0]];
  while(head < q.length){
    const [cx, cy] = q[head++];
    if(cx === tx && cy === ty){ found = true; break; }
    for(const [d, dx, dy] of DIRS){
      const nx = cx + dx, ny = cy + dy;
      if(!walkableTile(nx, ny)) continue;
      if(occupiedByOther(nx, ny)) continue;   // contorna quem esta parado
      const nk = key(nx, ny);
      if(came.has(nk)) continue;
      came.set(nk, [key(cx, cy), d]);
      q.push([nx, ny]);
    }
  }
  if(!found) return null;
  const dirs = []; let cur = key(tx, ty);
  while(cur !== start){
    const e = came.get(cur); if(!e) return null;
    dirs.unshift(e[1]); cur = e[0];
  }
  return dirs;
}
function stopAuto(){
  autoPath = [];
  if(autoTimer){ clearInterval(autoTimer); autoTimer = null; }
}
function walkPath(dirs){
  stopAuto();
  if(!dirs || !dirs.length) return;
  const me = players.get(myId); if(!me) return;
  autoPath = dirs.slice();
  // posicao esperada conforme vamos emitindo os passos
  let ex = me.x, ey = me.y;
  const step = () => {
    if(!autoPath.length){ stopAuto(); return; }
    const dir = autoPath[0], d = STEPV[dir];
    const nx = ex + d[0], ny = ey + d[1];
    // se um viajante cruzou na frente, para em vez de empacar batendo nele
    if(occupiedByOther(nx, ny)){ stopAuto(); return; }
    autoPath.shift();
    sendMove(dir);
    ex = nx; ey = ny;
  };
  step();                                  // primeiro passo imediato
  autoTimer = setInterval(step, STEP_MS);  // o resto no ritmo de caminhada
}
canvas.addEventListener('pointerdown', e => {
  if(!started || invOpen) return;
  const me = players.get(myId); if(!me) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width) + camX;
  const py = (e.clientY - rect.top) * (canvas.height / rect.height) + camY;
  const tx = Math.floor(px / TS), ty = Math.floor(py / TS);

  // tocou num NPC? colado = conversa; longe = anda ate um vizinho dele
  const npc = npcOnTile(tx, ty);
  if(npc){
    if(chebyshev(me, npc) <= 1){ if(socket) socket.emit('interact'); return; }
    const dest = nearestFreeNeighbor(npc.x, npc.y, me.x, me.y);
    if(dest){
      const path = findPath(me.x, me.y, dest[0], dest[1]);
      if(path && path.length){ clickFx = {x:dest[0], y:dest[1], start:performance.now()}; walkPath(path); }
    }
    return;
  }

  // tocou no trono do Criador? (so no Fundamento) -> provoca o Pofnir
  if(mapName === 'fundamento' && mapRows[ty] && mapRows[ty][tx] === 'Y'){
    if(socket) socket.emit('throne');
    return;
  }

  const path = findPath(me.x, me.y, tx, ty);
  if(path && path.length){
    clickFx = { x: tx, y: ty, start: performance.now() };
    walkPath(path);
  }
});

// zoom com o scroll do mouse (desktop)
canvas.addEventListener('wheel', e => {
  if(!started) return;
  e.preventDefault();
  zoomStep(e.deltaY < 0 ? +1 : -1);
}, { passive: false });

// botões de zoom (+ / −) — funcionam no PC e no toque
{
  const zi = document.getElementById('zoom-in');
  const zo = document.getElementById('zoom-out');
  if(zi) zi.addEventListener('click', e => { e.preventDefault(); zoomStep(+1); });
  if(zo) zo.addEventListener('click', e => { e.preventDefault(); zoomStep(-1); });
  updateZoomLabel();
}
