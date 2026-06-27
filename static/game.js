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
const purseEl = document.getElementById('purse');

// Carteira: saldo total em bronze, exibido dividido (escala 100:1).
let walletBronze = 0;
function fmtWallet(b){
  b = Math.max(0, Math.floor(b || 0));
  const o = Math.floor(b/10000), p = Math.floor((b%10000)/100), br = b%100;
  const parts = [];
  if(o) parts.push(o+'o');
  if(p) parts.push(p+'p');
  parts.push(br+'b');                 // bronze sempre aparece
  return '🪙 ' + parts.join(' ');
}
function updateWallet(b){
  walletBronze = Math.max(0, Math.floor(b || 0));
  const o = Math.floor(walletBronze/10000), p = Math.floor((walletBronze%10000)/100), br = walletBronze%100;
  if(purseEl){
    purseEl.innerHTML =
      '<span class="coin"><span class="pip gold"></span>'+o+'</span>'+
      '<span class="coin"><span class="pip silver"></span>'+p+'</span>'+
      '<span class="coin"><span class="pip bronze"></span>'+br+'</span>';
  }
}
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
let wasKicked = false;   // conta aberta em outro lugar: nao reconectar
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
let grimoireData = null;      // dados do Grimorio vindos do servidor (pool, limites, escolhido)
let grimoireSel = null;       // selecao local em edicao {cantrips:Set, spells:Set}
const SPELL_CLASSES = new Set(['mago','feiticeiro','bruxo','clerigo','druida','bardo','paladino','patrulheiro']);
let classFeaturesData = {};   // features por classe (do servidor): id -> [[nivel,nome,desc],...]
let transformsData = {};      // formas por classe (transformacoes): id -> [{id,name,icon,desc,bonus}]
let featsCatalog = [];        // talentos do feat-or-ASI
let combat = null;            // estado da luta por turnos (null = fora de combate)
let dmgPops = [];             // numeros de dano flutuantes na tela
let invOpen = false;

// ---------- clique pra andar ----------
let autoPath = [];            // direcoes restantes do trajeto clicado
let autoTimer = null;
let clickFx = null;           // marcador visual do destino {x,y,start}
let throneWarn = null;        // aparicao do Pofnir avisando no trono {cx,cy,text,start}

// ---------- camada de atmosfera (sutil) + efeitos ----------
let vfx = [];                 // efeitos de combate ativos {kind,x0,y0,x1,y1,color,t0,life}
let particles = [];           // motas de ambiente (vaga-lumes/poeira) em coords de mundo
let pofnirSpot = null;        // {x,y} canto sup-esq da estatua do Pofnir (overlay de luz)
let bloomCanvas = null, bloomCtx = null, bloomW = 0, bloomH = 0;
const ATMO = {                // tudo discreto (intensidade "sutil")
  vignette: 0.30,            // escurecimento das bordas
  pool: 0.085,              // poca de luz quente em volta de voce
  bloom: 0.42,              // forca do brilho geral
  particlesMax: 26,         // teto de motas em tela
};
// MOOD por mapa: um veu de cor por cima da cena que da o clima de cada bioma.
// {r,g,b,a} -> overlay; part:'#hex' -> cor das motas de ambiente daquele mapa.
const MAP_AMBIENT = {
  ermo:             {r:54,  g:46,  b:88,  a:0.10, part:'#b59cff'},  // crepusculo arcano
  descampado:       {r:122, g:92,  b:52,  a:0.11, part:'#e8c98a'},  // descampado seco, poeira
  avasham:          {r:255, g:200, b:110, a:0.12, part:'#ffd98a'},  // deserto: calor ambar
  valdarkram:       {r:28,  g:38,  b:48,  a:0.40, part:'#9fb4c0'},  // cemiterio: bruma fria
  salao:            {r:46,  g:34,  b:78,  a:0.12, part:'#caa6ff'},  // salao: penumbra sagrada
  rasharan:         {r:232, g:182, b:92,  a:0.14, part:'#ffe6a0'},  // reino dourado do trigo
  valoran:          {r:118, g:160, b:230, a:0.14, part:'#bfe0ff'},  // reino etereo azulado
  fundamento:       {r:78,  g:58,  b:120, a:0.20, part:'#c89cff'},  // trono sombrio
  falanor:          {r:150, g:210, b:200, a:0.12, part:'#d6fff4'},  // reino claro
  fadrakor_litoral: {r:120, g:190, b:222, a:0.10, part:'#cfeeff'},  // litoral
  fadrakor_selva:   {r:38,  g:108, b:58,  a:0.16, part:'#a9f0c0'},  // selva densa
  fadrakor_vulcao:  {r:230, g:90,  b:40,  a:0.18, part:'#ffb070'},  // vulcao
  repouso_dama:     {r:22,  g:44,  b:42,  a:0.10, part:'#a9f0c0'},  // mata fria esverdeada
};
// mapas "magicos": as motas de ambiente brilham (faiscas etereas) mesmo de dia
const GLOW_MAPS = new Set(['valdarkram','salao','rasharan','valoran','fundamento','falanor','fadrakor_vulcao']);

// ---------- ciclo de dia e noite ----------
let dayLength = 480;          // segundos por ciclo (o servidor manda o valor real)
let dayOffset = 0;            // diferenca entre relogio do servidor e o nosso
let dayTime = 0;              // 0..1 dentro do ciclo (0 = meia-noite)
let lastPhase = '';           // pra so atualizar o HUD quando a fase muda

// ---------- falas (balao), NPC e o raio do Valdris ----------
const bubbles = new Map();    // id da entidade -> {text, until} (balao acima dela)
const smites  = new Map();    // id do alvo -> {start} (efeito do raio cosmico)
(function(){ const st=document.createElement('style'); st.textContent='@keyframes smiteBlink{0%,100%{opacity:1}50%{opacity:.3}}'; (document.head||document.documentElement).appendChild(st); })();
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
  // tom base com manchas organicas (algumas casas mais claras/escuras) -> quebra o "chapado"
  const tone = rng(gx,gy,17);
  c.fillStyle = tone < 0.20 ? COL.grassDk : (tone > 0.80 ? COL.grassLt : COL.grass);
  c.fillRect(px,py,ts,ts);
  // mancha organica extra: clareira ou sombra suave
  if(rng(gx,gy,31) > 0.72){
    c.save(); c.globalAlpha = 0.45;
    c.fillStyle = rng(gx,gy,32) > 0.5 ? COL.grassLt : COL.grassDk;
    c.beginPath(); c.ellipse(px+rng(gx,gy,33)*ts, py+rng(gx,gy,34)*ts, ts*0.24, ts*0.14, 0, 0, Math.PI*2); c.fill();
    c.restore();
  }
  // tufos de grama BALANCANDO ao vento (inclinacao por tempo)
  const sway = Math.sin(Date.now()/900 + (gx*0.7 + gy*1.3)) * 0.9;
  c.lineWidth = 1;
  for(let i=0;i<5;i++){
    const bx = px + rng(gx,gy,i+1)*ts;
    const by = py + ts*(0.35 + rng(gx,gy,i+6)*0.55);
    const h = 2 + rng(gx,gy,i+11)*2.5;
    c.strokeStyle = rng(gx,gy,i+16) > 0.5 ? COL.grassLt : COL.grassDk;
    c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + sway, by - h); c.stroke();
  }
  // florzinha rara
  if(rng(gx,gy,41) > 0.93){
    const fx = px + (0.3+rng(gx,gy,42)*0.4)*ts, fy = py + (0.3+rng(gx,gy,43)*0.4)*ts;
    c.fillStyle = COL.flower[(gx+gy) % COL.flower.length];
    c.beginPath(); c.arc(fx, fy, 1.5, 0, Math.PI*2); c.fill();
    c.fillStyle = '#f4d35e'; c.beginPath(); c.arc(fx, fy, 0.6, 0, Math.PI*2); c.fill();
  }
  // pedrinha rara
  if(rng(gx,gy,51) > 0.95){
    c.fillStyle = '#7d756a';
    c.beginPath(); c.ellipse(px+rng(gx,gy,52)*ts, py+rng(gx,gy,53)*ts, 1.6, 1.1, 0, 0, Math.PI*2); c.fill();
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
// Interiores das casas: chars ganham desenho aconchegante so dentro de casa.
// cada casa tem uma cor propria (a manta/tapete/parede mudam); a loja vira aco/concreto
const INT_THEMES = {
  casa_melissa:   {f1:'#6b4f34', f2:'#74563a', wall:'#3a2a1a', acc:'#e85d75', kind:'quarto'},
  casa_yasmin:    {f1:'#6b4f34', f2:'#74563a', wall:'#3a2a1a', acc:'#b388ff', kind:'quarto'},
  casa_valentina: {f1:'#6b4f34', f2:'#74563a', wall:'#3a2a1a', acc:'#4fd0c5', kind:'quarto'},
  casa_isabelle:  {f1:'#6b4f34', f2:'#74563a', wall:'#3a2a1a', acc:'#f2b84b', kind:'quarto'},
  casa_giovanna:  {f1:'#6b4f34', f2:'#74563a', wall:'#3a2a1a', acc:'#f49ad0', kind:'quarto'},
  casa_beatriz:   {f1:'#6b4f34', f2:'#74563a', wall:'#3a2a1a', acc:'#9bd16a', kind:'quarto'},
  casa_camila:    {f1:'#6b4f34', f2:'#74563a', wall:'#3a2a1a', acc:'#6db9f4', kind:'quarto'},
  casa_amanda:    {f1:'#6b4f34', f2:'#74563a', wall:'#3a2a1a', acc:'#ff9a6b', kind:'quarto'},
  casa_comum:     {f1:'#6b5638', f2:'#73603f', wall:'#3a2c1c', acc:'#b08d57', kind:'comum'},
  loja_armas:     {f1:'#494640', f2:'#524e47', wall:'#26231f', acc:'#9aa0aa', kind:'loja'},
};
function intTheme(m){ return INT_THEMES[m] || INT_THEMES.casa_comum; }

function drawInteriorTile(c, map, ch, px, py, ts, gx, gy){
  const th = intTheme(map);
  const woodFloor = () => {
    c.fillStyle=th.f1; c.fillRect(px,py,ts,ts);
    c.fillStyle=th.f2; c.fillRect(px,py+(((gx+gy)%2))*ts*0.5,ts,ts*0.5);
    c.strokeStyle='rgba(20,14,8,0.30)'; c.lineWidth=1;
    const seam=((gx*7+gy*13)%3)*ts*0.33;
    c.beginPath(); c.moveTo(px,py+ts-0.5); c.lineTo(px+ts,py+ts-0.5);
    c.moveTo(px+seam,py); c.lineTo(px+seam,py+ts); c.stroke();
  };
  switch(ch){
    case '1': woodFloor(); break;
    case '2': {                                        // tapete (borda na cor da casa)
      woodFloor();
      c.fillStyle='#7a2530'; c.fillRect(px+ts*0.03,py+ts*0.03,ts*0.94,ts*0.94);
      c.strokeStyle=th.acc; c.lineWidth=Math.max(1,ts*0.04);
      c.strokeRect(px+ts*0.12,py+ts*0.12,ts*0.76,ts*0.76);
      c.fillStyle='rgba(255,255,255,0.18)';
      c.beginPath(); c.moveTo(px+ts*0.5,py+ts*0.32); c.lineTo(px+ts*0.68,py+ts*0.5);
      c.lineTo(px+ts*0.5,py+ts*0.68); c.lineTo(px+ts*0.32,py+ts*0.5); c.closePath(); c.fill();
      break;
    }
    case 'F': {                                        // parede (cor do tema)
      c.fillStyle=th.wall; c.fillRect(px,py,ts,ts);
      c.fillStyle=shade(th.wall,0.12); for(let i=0;i<3;i++) c.fillRect(px+i*ts*0.34,py,ts*0.3,ts);
      c.strokeStyle='rgba(0,0,0,0.5)'; c.lineWidth=1;
      for(let i=1;i<3;i++){ c.beginPath(); c.moveTo(px+i*ts*0.34-1,py); c.lineTo(px+i*ts*0.34-1,py+ts); c.stroke(); }
      c.beginPath(); c.moveTo(px,py+ts*0.5); c.lineTo(px+ts,py+ts*0.5); c.stroke();
      break;
    }
    case 'b': {                                        // cama (manta na cor da casa)
      woodFloor();
      c.fillStyle='#5a3f28'; c.fillRect(px,py+ts*0.1,ts,ts*0.85);
      c.fillStyle='#efe6d6'; c.fillRect(px+ts*0.05,py+ts*0.15,ts*0.9,ts*0.32);   // travesseiro
      c.fillStyle=th.acc; c.fillRect(px+ts*0.05,py+ts*0.45,ts*0.9,ts*0.5);       // manta
      c.fillStyle=shade(th.acc,-0.18); c.fillRect(px+ts*0.05,py+ts*0.45,ts*0.9,ts*0.07);
      c.strokeStyle='rgba(0,0,0,0.25)'; c.lineWidth=1; c.strokeRect(px+ts*0.05,py+ts*0.15,ts*0.9,ts*0.8);
      break;
    }
    case 'h': {                                        // lareira
      c.fillStyle=th.wall; c.fillRect(px,py,ts,ts);
      c.fillStyle='#5a5560'; c.fillRect(px,py,ts,ts*0.95);
      c.fillStyle='#6a6570'; for(let i=0;i<3;i++) for(let j=0;j<3;j++) if((i+j)%2) c.fillRect(px+i*ts*0.34,py+j*ts*0.32,ts*0.3,ts*0.28);
      c.fillStyle='#1a1410'; c.fillRect(px+ts*0.22,py+ts*0.42,ts*0.56,ts*0.53);
      c.save(); c.globalCompositeOperation='lighter';
      const g=c.createRadialGradient(px+ts*0.5,py+ts*0.82,1,px+ts*0.5,py+ts*0.82,ts*0.4);
      g.addColorStop(0,'#ffe24a'); g.addColorStop(0.5,'#ff7a2a'); g.addColorStop(1,'rgba(255,80,20,0)');
      c.fillStyle=g; c.beginPath(); c.arc(px+ts*0.5,py+ts*0.8,ts*0.3,0,Math.PI*2); c.fill(); c.restore();
      c.fillStyle='#ff9a3a';
      c.beginPath(); c.moveTo(px+ts*0.4,py+ts*0.92); c.quadraticCurveTo(px+ts*0.46,py+ts*0.58,px+ts*0.5,py+ts*0.66);
      c.quadraticCurveTo(px+ts*0.54,py+ts*0.55,px+ts*0.6,py+ts*0.92); c.closePath(); c.fill();
      break;
    }
    case 'k': {                                        // mesa de madeira
      woodFloor();
      c.fillStyle='#3a2a1a'; c.fillRect(px+ts*0.18,py+ts*0.55,ts*0.08,ts*0.4); c.fillRect(px+ts*0.74,py+ts*0.55,ts*0.08,ts*0.4);
      c.fillStyle='#8a6740'; c.fillRect(px+ts*0.06,py+ts*0.32,ts*0.88,ts*0.26);
      c.fillStyle='#9a7548'; c.fillRect(px+ts*0.06,py+ts*0.32,ts*0.88,ts*0.08);
      c.strokeStyle='rgba(0,0,0,0.25)'; c.lineWidth=1; c.strokeRect(px+ts*0.06,py+ts*0.32,ts*0.88,ts*0.26);
      break;
    }
    case 'q': {                                        // bau (quarto) ou engradado (loja)
      woodFloor();
      if(th.kind==='loja'){
        c.fillStyle='#6a5236'; c.fillRect(px+ts*0.16,py+ts*0.34,ts*0.68,ts*0.58);
        c.fillStyle='#8a6a44'; c.fillRect(px+ts*0.16,py+ts*0.34,ts*0.68,ts*0.08);
        c.strokeStyle='#3a2c1d'; c.lineWidth=Math.max(1,ts*0.04); c.strokeRect(px+ts*0.16,py+ts*0.34,ts*0.68,ts*0.58);
        c.beginPath(); c.moveTo(px+ts*0.16,py+ts*0.42); c.lineTo(px+ts*0.84,py+ts*0.92);
        c.moveTo(px+ts*0.84,py+ts*0.42); c.lineTo(px+ts*0.16,py+ts*0.92); c.stroke();
      } else {
        c.fillStyle='#5a3f28'; c.fillRect(px+ts*0.15,py+ts*0.35,ts*0.7,ts*0.55);
        c.fillStyle='#6a4a2e'; c.beginPath(); c.moveTo(px+ts*0.15,py+ts*0.38);
        c.quadraticCurveTo(px+ts*0.5,py+ts*0.2,px+ts*0.85,py+ts*0.38);
        c.lineTo(px+ts*0.85,py+ts*0.5); c.lineTo(px+ts*0.15,py+ts*0.5); c.closePath(); c.fill();
        c.fillStyle='#c9a24a'; c.fillRect(px+ts*0.15,py+ts*0.48,ts*0.7,ts*0.05); c.fillRect(px+ts*0.46,py+ts*0.35,ts*0.08,ts*0.55);
        c.fillStyle='#e8d050'; c.fillRect(px+ts*0.47,py+ts*0.55,ts*0.06,ts*0.08);
      }
      break;
    }
    case '_': {                                        // penteadeira (quarto de menina)
      woodFloor();
      c.fillStyle='#6a4a2e'; c.fillRect(px+ts*0.12,py+ts*0.4,ts*0.76,ts*0.52);
      c.fillStyle='#7a5636'; c.fillRect(px+ts*0.12,py+ts*0.4,ts*0.76,ts*0.09);
      c.fillStyle='#2a2233'; c.beginPath(); c.ellipse(px+ts*0.5,py+ts*0.26,ts*0.2,ts*0.24,0,0,Math.PI*2); c.fill();
      c.fillStyle='rgba(200,220,255,0.6)'; c.beginPath(); c.ellipse(px+ts*0.5,py+ts*0.26,ts*0.15,ts*0.19,0,0,Math.PI*2); c.fill();
      c.fillStyle='rgba(255,255,255,0.5)'; c.beginPath(); c.moveTo(px+ts*0.44,py+ts*0.16); c.lineTo(px+ts*0.5,py+ts*0.32); c.lineTo(px+ts*0.46,py+ts*0.34); c.closePath(); c.fill();
      c.fillStyle=th.acc; c.beginPath(); c.arc(px+ts*0.32,py+ts*0.64,ts*0.03,0,Math.PI*2); c.arc(px+ts*0.68,py+ts*0.64,ts*0.03,0,Math.PI*2); c.fill();
      break;
    }
    case '/': {                                        // rack de arma na parede (Peteco + Mauser)
      c.fillStyle='#2e261d'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#3a3026'; c.fillRect(px,py+ts*0.12,ts,ts*0.05); c.fillRect(px,py+ts*0.8,ts,ts*0.05);
      c.strokeStyle='#8a6a44'; c.lineWidth=Math.max(1.5,ts*0.05); c.lineCap='round';
      const bx=px+ts*0.3;                              // um Peteco (estilingue)
      c.beginPath(); c.moveTo(bx,py+ts*0.72); c.lineTo(bx,py+ts*0.44);
      c.moveTo(bx,py+ts*0.44); c.lineTo(bx-ts*0.1,py+ts*0.3); c.moveTo(bx,py+ts*0.44); c.lineTo(bx+ts*0.1,py+ts*0.3); c.stroke();
      c.strokeStyle='rgba(90,70,46,0.85)'; c.lineWidth=1; c.beginPath(); c.moveTo(bx-ts*0.1,py+ts*0.3); c.lineTo(bx+ts*0.1,py+ts*0.3); c.stroke();
      const gx2=px+ts*0.58;                            // uma Mauser (silhueta)
      c.fillStyle='#4a4640'; c.fillRect(gx2,py+ts*0.4,ts*0.26,ts*0.06); c.fillRect(gx2+ts*0.16,py+ts*0.46,ts*0.08,ts*0.16);
      c.fillStyle='#6a6258'; c.fillRect(gx2,py+ts*0.4,ts*0.26,ts*0.02);
      break;
    }
    case ';': {                                        // estante com caixas de municao
      woodFloor();
      c.fillStyle='#5a4632'; c.fillRect(px+ts*0.08,py+ts*0.06,ts*0.84,ts*0.88);
      c.fillStyle='#2e2418'; for(let i=0;i<3;i++) c.fillRect(px+ts*0.12,py+ts*0.1+i*ts*0.28,ts*0.76,ts*0.22);
      const cols=['#7a5a3a','#6a6a4a','#8a4a3a'];
      for(let i=0;i<3;i++){ c.fillStyle=cols[i%3]; c.fillRect(px+ts*0.16,py+ts*0.12+i*ts*0.28,ts*0.22,ts*0.18);
        c.fillStyle=cols[(i+1)%3]; c.fillRect(px+ts*0.44,py+ts*0.12+i*ts*0.28,ts*0.18,ts*0.18);
        c.fillStyle=cols[(i+2)%3]; c.fillRect(px+ts*0.66,py+ts*0.12+i*ts*0.28,ts*0.16,ts*0.18); }
      break;
    }
    case '#': {                                        // balcao / vitrine da loja
      woodFloor();
      c.fillStyle='#5a3f28'; c.fillRect(px,py+ts*0.3,ts,ts*0.62);
      c.fillStyle='#6a4a30'; c.fillRect(px,py+ts*0.3,ts,ts*0.08);
      c.fillStyle='#7a5636'; c.fillRect(px,py+ts*0.24,ts,ts*0.08);
      c.fillStyle='rgba(150,200,220,0.16)'; c.fillRect(px+ts*0.03,py+ts*0.4,ts*0.94,ts*0.36);
      c.strokeStyle='rgba(200,230,240,0.28)'; c.lineWidth=1; c.strokeRect(px+ts*0.03,py+ts*0.4,ts*0.94,ts*0.36);
      c.fillStyle='#caa45a'; c.fillRect(px+ts*0.12,py+ts*0.54,ts*0.2,ts*0.05);
      c.fillStyle='#9aa0aa'; c.fillRect(px+ts*0.52,py+ts*0.5,ts*0.22,ts*0.06);
      break;
    }
    case 'D': {                                        // porta de saida
      c.fillStyle=th.wall; c.fillRect(px,py,ts,ts);
      c.fillStyle='#5a3f28'; c.fillRect(px+ts*0.12,py+ts*0.05,ts*0.76,ts*0.9);
      c.fillStyle='#6a4a30'; c.fillRect(px+ts*0.16,py+ts*0.1,ts*0.3,ts*0.8); c.fillRect(px+ts*0.54,py+ts*0.1,ts*0.3,ts*0.8);
      c.fillStyle='#e8d050'; c.beginPath(); c.arc(px+ts*0.74,py+ts*0.5,ts*0.05,0,Math.PI*2); c.fill();
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=0.25;
      const g=c.createLinearGradient(px,py+ts,px,py+ts*0.6); g.addColorStop(0,'#ffe24a'); g.addColorStop(1,'rgba(255,226,74,0)');
      c.fillStyle=g; c.fillRect(px+ts*0.12,py+ts*0.6,ts*0.76,ts*0.35); c.restore();
      break;
    }
    default: woodFloor();
  }
}

// Tiles exclusivos do acampamento de Sapopemba (interceptados so no Descampado).
// Devolve true se desenhou; false pra cair no switch normal (mato, terra, etc.).
function drawCampTile(c, ch, px, py, ts, gx, gy){
  switch(ch){
    case 'K': {   // barraco: telhado/parede de zinco enferrujado visto de cima
      c.fillStyle = '#6e6256'; c.fillRect(px, py, ts, ts);
      for(let i=0;i<ts;i+=3){ c.fillStyle = (i%6<3) ? '#5b5046' : '#7d7062'; c.fillRect(px, py+i, ts, 1.5); }
      const r = (gx*17 + gy*11) % 5;                       // manchas de ferrugem
      c.fillStyle = 'rgba(150,68,30,0.5)';
      if(r < 3) c.fillRect(px+ts*0.12, py+ts*0.18, ts*0.32, ts*0.22);
      if(r % 2 === 0) c.fillRect(px+ts*0.54, py+ts*0.56, ts*0.28, ts*0.2);
      c.fillStyle = '#8c7f6f'; c.fillRect(px, py, ts, 2);  // cumeeira
      c.fillStyle = '#3f372e'; c.fillRect(px, py+ts-2, ts, 2);
      c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(px+ts-2, py, 2, ts);
      return true;
    }
    case 'b': {   // barris de oleo / engradados de madeira
      c.fillStyle = '#5a4a36'; c.fillRect(px, py, ts, ts);  // chao de terra
      if((gx + gy) % 2 === 0){
        const bx = px+ts*0.5, w = ts*0.5, h = ts*0.66, ty = py+ts*0.22;
        c.fillStyle = '#7a3b2a'; roundRect(c, bx-w/2, ty, w, h, 3); c.fill();
        c.fillStyle = '#5e2c20'; c.fillRect(bx-w/2, ty+h*0.28, w, 2); c.fillRect(bx-w/2, ty+h*0.62, w, 2);
        c.fillStyle = '#9a5036'; c.fillRect(bx-w/2, ty, w, 2);
        c.fillStyle = '#c98a3a'; c.beginPath(); c.ellipse(bx, ty+1, w/2, 2.4, 0, 0, Math.PI*2); c.fill();
      } else {
        const w = ts*0.6, x0 = px+ts*0.2, y0 = py+ts*0.24, h = ts*0.58;
        c.fillStyle = '#8a5a30'; c.fillRect(x0, y0, w, h);
        c.fillStyle = '#5f3d20';
        c.fillRect(x0, y0, w, 2); c.fillRect(x0, y0+h-2, w, 2); c.fillRect(x0, y0, 2, h); c.fillRect(x0+w-2, y0, 2, h);
        c.strokeStyle = '#5f3d20'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0+w, y0+h); c.moveTo(x0+w, y0); c.lineTo(x0, y0+h); c.stroke();
      }
      return true;
    }
    case 'F': {   // fogueira central (chamas animadas)
      c.fillStyle = '#4a3c2c'; c.fillRect(px, py, ts, ts);
      c.fillStyle = '#39322f';                              // pedras em volta
      for(let a=0;a<6;a++){ const an = a/6*Math.PI*2; const sx = px+ts*0.5+Math.cos(an)*ts*0.34, sy = py+ts*0.58+Math.sin(an)*ts*0.24; c.beginPath(); c.arc(sx, sy, ts*0.085, 0, Math.PI*2); c.fill(); }
      c.strokeStyle = '#3a2414'; c.lineWidth = 2; c.lineCap = 'round';  // lenha
      c.beginPath(); c.moveTo(px+ts*0.32, py+ts*0.66); c.lineTo(px+ts*0.68, py+ts*0.5);
      c.moveTo(px+ts*0.32, py+ts*0.5); c.lineTo(px+ts*0.68, py+ts*0.66); c.stroke();
      const t = Date.now()/120 + (gx*7 + gy*13);
      c.save(); c.globalCompositeOperation = 'lighter';
      const fcx = px+ts*0.5, fbase = py+ts*0.56;
      for(let i=0;i<3;i++){
        const fl = 0.7 + 0.3*Math.sin(t + i*1.7);
        const fh = ts*(0.34 + 0.16*fl), fw = ts*(0.13 - i*0.02), ox = Math.sin(t*0.8 + i)*ts*0.05;
        const g = c.createLinearGradient(fcx+ox, fbase, fcx+ox, fbase-fh);
        g.addColorStop(0, '#ffd24a'); g.addColorStop(0.5, '#ff8a1e'); g.addColorStop(1, 'rgba(200,40,0,0)');
        c.fillStyle = g;
        c.beginPath(); c.moveTo(fcx+ox-fw, fbase);
        c.quadraticCurveTo(fcx+ox-fw*0.4, fbase-fh*0.6, fcx+ox, fbase-fh);
        c.quadraticCurveTo(fcx+ox+fw*0.4, fbase-fh*0.6, fcx+ox+fw, fbase);
        c.closePath(); c.fill();
      }
      const gl = c.createRadialGradient(fcx, fbase-ts*0.08, 1, fcx, fbase-ts*0.08, ts*0.5);
      gl.addColorStop(0, 'rgba(255,170,60,0.3)'); gl.addColorStop(1, 'rgba(255,140,30,0)');
      c.fillStyle = gl; c.fillRect(px-ts*0.2, py-ts*0.2, ts*1.4, ts*1.4);
      c.restore();
      return true;
    }
  }
  return false;
}

// ---- Sapopemba (SW do Ermo): cada um dos 5 comercios com fachada propria ----
const SAPO_SHOPS = [
  {x0:2,y0:18,x1:6,y1:20, dx:4,dy:20,  roof:'#b8462f', eave:'#7a2a18', awn:'#caa23a', sign:'#f4d06a', icon:'galo'}, // Galo de Ouro
  {x0:9,y0:19,x1:11,y1:20,dx:10,dy:20, roof:'#3a4048', eave:'#22262c', awn:'#5a6068', sign:'#9aa0aa', icon:'arma'}, // Armas Peteco
  {x0:13,y0:19,x1:15,y1:20,dx:14,dy:20,roof:'#c43e3e', eave:'#7a2424', awn:'#f0c040', sign:'#f0c040', icon:'burg'}, // Burgao
  {x0:2,y0:25,x1:5,y1:26, dx:3,dy:26,  roof:'#6a4e8a', eave:'#42305a', awn:'#e8d28a', sign:'#e8d28a', icon:'rest'}, // O Garfo de Ouro
  {x0:8,y0:25,x1:11,y1:26,dx:10,dy:26, roof:'#cdd6da', eave:'#9aa4a8', awn:'#e8eef0', sign:'#d65a5a', icon:'upa'},  // UPA
];
// a vila foi pro CENTRO de um mapa 100x100; desloca as lojas de Sapopemba junto.
const ERMO_OX = 30, ERMO_OY = 35;
SAPO_SHOPS.forEach(s=>{ s.x0+=ERMO_OX; s.x1+=ERMO_OX; s.dx+=ERMO_OX; s.y0+=ERMO_OY; s.y1+=ERMO_OY; s.dy+=ERMO_OY; });
function _sapoShopAt(gx, gy){
  for(const s of SAPO_SHOPS){ if(gx>=s.x0 && gx<=s.x1 && gy>=s.y0 && gy<=s.y1) return s; }
  return null;
}
function drawSapoIcon(c, s, cx, cy, r){
  c.save();
  if(s.icon==='arma'){
    c.fillStyle='#2a2622'; c.fillRect(cx-r,cy-r*0.3,r*1.5,r*0.5); c.fillRect(cx+r*0.2,cy,r*0.4,r*0.7);
  } else if(s.icon==='galo'){
    c.fillStyle='#f4d06a'; c.beginPath(); c.arc(cx,cy,r*0.6,0,Math.PI*2); c.fill();
    c.fillStyle='#d6452f'; c.beginPath(); c.moveTo(cx,cy-r*0.55); c.lineTo(cx-r*0.25,cy-r); c.lineTo(cx+r*0.15,cy-r*0.7); c.closePath(); c.fill();
    c.fillStyle='#e8902a'; c.beginPath(); c.moveTo(cx+r*0.5,cy); c.lineTo(cx+r,cy-r*0.1); c.lineTo(cx+r*0.5,cy+r*0.25); c.closePath(); c.fill();
  } else if(s.icon==='burg'){
    c.fillStyle='#e0a850'; c.beginPath(); c.arc(cx,cy-r*0.2,r*0.85,Math.PI,0); c.fill();
    c.fillStyle='#7a4a2a'; c.fillRect(cx-r*0.85,cy,r*1.7,r*0.22);
    c.fillStyle='#5aa84a'; c.fillRect(cx-r*0.85,cy+r*0.22,r*1.7,r*0.13);
    c.fillStyle='#e0a850'; c.fillRect(cx-r*0.85,cy+r*0.34,r*1.7,r*0.3);
  } else if(s.icon==='rest'){
    c.strokeStyle='#e8d28a'; c.lineWidth=Math.max(1.4,r*0.28); c.lineCap='round';
    c.beginPath(); c.moveTo(cx,cy-r); c.lineTo(cx,cy+r);
    for(let i=-1;i<=1;i++){ c.moveTo(cx+i*r*0.4,cy-r); c.lineTo(cx+i*r*0.4,cy-r*0.2); } c.stroke();
  } else if(s.icon==='upa'){
    c.fillStyle='#d65a5a'; c.fillRect(cx-r*0.22,cy-r*0.8,r*0.44,r*1.6); c.fillRect(cx-r*0.8,cy-r*0.22,r*1.6,r*0.44);
  }
  c.restore();
}
function drawSapoTile(c, ch, px, py, ts, gx, gy){
  const s = _sapoShopAt(gx, gy);
  if(!s) return false;
  const isDoor = (gx===s.dx && gy===s.dy);
  c.fillStyle=s.roof; c.fillRect(px,py,ts,ts);                       // telhado
  c.strokeStyle='rgba(0,0,0,0.18)'; c.lineWidth=1;
  for(let i=1;i<3;i++){ c.beginPath(); c.moveTo(px+i*ts*0.34,py); c.lineTo(px+i*ts*0.34,py+ts); c.stroke(); }
  if(gy===s.y0){ c.fillStyle=shade(s.roof,0.18); c.fillRect(px,py,ts,ts*0.16); }   // crista
  if(gy===s.y1 && !isDoor){ c.fillStyle=s.eave; c.fillRect(px,py+ts*0.82,ts,ts*0.18); } // beiral
  if(isDoor){
    c.fillStyle=s.awn; c.fillRect(px,py+ts*0.22,ts,ts*0.18);          // toldo
    c.fillStyle=shade(s.awn,-0.18); for(let i=0;i<4;i++) if(i%2) c.fillRect(px+i*ts*0.25,py+ts*0.22,ts*0.25,ts*0.18);
    c.fillStyle='#1a1410'; c.fillRect(px+ts*0.26,py+ts*0.44,ts*0.48,ts*0.5); // vao
    c.fillStyle='#3a2c1d'; c.fillRect(px+ts*0.26,py+ts*0.44,ts*0.48,ts*0.06);
    c.fillStyle='rgba(18,14,9,0.92)'; roundRect(c, px+ts*0.16, py+ts*0.01, ts*0.68, ts*0.2, 3); c.fill(); // placa
    c.strokeStyle=s.sign; c.lineWidth=1.2; c.stroke();
    drawSapoIcon(c, s, px+ts*0.5, py+ts*0.11, ts*0.12);
  }
  return true;
}

// ---- Repouso da Dama: chao escuro e pinheiros da floresta ----
const FCOL = {
  floor:'#2b3a2c', floorDk:'#243322', floorLt:'#33442f', dirt:'#2c2820',
  bare:'#232b26', bareDk:'#1d241f',
  pineDk:'#1f3a2a', pine:'#27482f', pineLt:'#346038', pineTip:'#5a7d4a',
  ptrunk:'#3a2c1e'
};
function forestFloor(c, px, py, ts, gx, gy, bare){
  const t = rng(gx,gy,17);
  if(bare){
    c.fillStyle = t < 0.5 ? FCOL.bare : FCOL.bareDk;
    c.fillRect(px,py,ts,ts);
    c.fillStyle = FCOL.dirt;
    c.fillRect(px+ts*(0.2+rng(gx,gy,2)*0.5), py+ts*(0.3+rng(gx,gy,3)*0.4), 3, 1.5);
    c.fillStyle = shade(FCOL.bare,-0.2);
    c.fillRect(px+ts*rng(gx,gy,5), py+ts*rng(gx,gy,6), 1.5, 1.5);
  } else {
    c.fillStyle = t < 0.25 ? FCOL.floorDk : (t > 0.8 ? FCOL.floorLt : FCOL.floor);
    c.fillRect(px,py,ts,ts);
    for(let i=0;i<3;i++){
      const bx = px+rng(gx,gy,i+1)*ts, by = py+ts*(0.4+rng(gx,gy,i+6)*0.5);
      c.fillStyle = rng(gx,gy,i+16) > 0.5 ? FCOL.floorLt : FCOL.floorDk;
      c.fillRect(bx, by-2, 1, 2);
    }
    // folhas caidas (manchas marrom/ocre)
    if(rng(gx,gy,28) > 0.74){
      c.fillStyle = rng(gx,gy,29) > 0.5 ? 'rgba(120,86,44,0.5)' : 'rgba(96,72,40,0.5)';
      c.beginPath(); c.ellipse(px+rng(gx,gy,30)*ts, py+rng(gx,gy,31)*ts, 2.2, 1.4, rng(gx,gy,32)*3, 0, Math.PI*2); c.fill();
    }
    // cogumelo raro (chapeu vermelho com pintas)
    if(rng(gx,gy,44) > 0.95){
      const mx = px+(0.35+rng(gx,gy,45)*0.3)*ts, my = py+(0.55+rng(gx,gy,46)*0.25)*ts;
      c.fillStyle='#e8e2d0'; c.fillRect(mx-0.6, my, 1.4, 2.4);
      c.fillStyle='#b5432f'; c.beginPath(); c.ellipse(mx, my, 2.4, 1.5, 0, Math.PI, 0); c.fill();
      c.fillStyle='#f0e8d8'; c.beginPath(); c.arc(mx-0.8, my-0.5, 0.4, 0, Math.PI*2); c.arc(mx+0.8, my-0.4, 0.4, 0, Math.PI*2); c.fill();
    }
  }
}
function drawPine(c, px, py, ts, gx, gy){
  const cx = px+ts*0.5;
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath(); c.ellipse(cx, py+ts*0.86, ts*0.26, ts*0.09, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = FCOL.ptrunk; c.fillRect(cx-ts*0.05, py+ts*0.6, ts*0.1, ts*0.28);
  const tiers = [[0.66,0.34],[0.5,0.28],[0.34,0.2]];
  for(let k=0;k<tiers.length;k++){
    const baseY = py+ts*tiers[k][0], w = ts*tiers[k][1];
    c.fillStyle = k===0?FCOL.pineDk:(k===1?FCOL.pine:FCOL.pineLt);
    c.beginPath();
    c.moveTo(cx, py+ts*(tiers[k][0]-0.26)); c.lineTo(cx-w, baseY); c.lineTo(cx+w, baseY);
    c.closePath(); c.fill();
  }
  c.fillStyle = FCOL.pineTip; c.fillRect(cx-1, py+ts*0.08, 2, 3);
}
function drawDesertTile(c, ch, px, py, ts, gx, gy){
  function sand(){
    const h=((gx*7+gy*13)%5);
    c.fillStyle=['#e3c486','#e8cb8e','#dcb978','#e6c888','#dfbf80'][h];
    c.fillRect(px,py,ts,ts);
    c.strokeStyle='rgba(176,140,82,0.28)'; c.lineWidth=1;
    c.beginPath(); c.moveTo(px,py+ts*0.6+((gx+gy)%3)); c.quadraticCurveTo(px+ts/2,py+ts*0.45,px+ts,py+ts*0.62); c.stroke();
    // segunda ondulacao de duna (mais clara, em cima)
    c.strokeStyle='rgba(255,240,200,0.18)';
    c.beginPath(); c.moveTo(px,py+ts*0.28+((gx*3+gy)%2)); c.quadraticCurveTo(px+ts/2,py+ts*0.18,px+ts,py+ts*0.3); c.stroke();
    // graos/pedrinhas raras
    if((gx*9+gy*5)%6===0){ c.fillStyle='rgba(150,120,72,0.5)'; c.fillRect(px+ts*(0.2+(gx%3)*0.22), py+ts*(0.5+(gy%3)*0.12), 1.6, 1.3); }
    if((gx*7+gy*3)%9===0){ c.fillStyle='rgba(255,250,225,0.5)'; c.fillRect(px+ts*0.6, py+ts*0.36, 1.2, 1.2); }
  }
  switch(ch){
    case '.': sand(); return true;
    case ',': sand();
      c.strokeStyle='#ece6d2'; c.lineWidth=1.4;
      c.beginPath(); c.moveTo(px+ts*0.3,py+ts*0.56); c.lineTo(px+ts*0.7,py+ts*0.5); c.stroke();
      c.fillStyle='#ece6d2'; c.beginPath(); c.arc(px+ts*0.3,py+ts*0.56,1.7,0,Math.PI*2); c.arc(px+ts*0.7,py+ts*0.5,1.7,0,Math.PI*2); c.fill();
      return true;
    case '^': sand();
      c.fillStyle='#9a8b73'; c.beginPath();
      c.moveTo(px+ts*0.2,py+ts*0.78); c.lineTo(px+ts*0.32,py+ts*0.42); c.lineTo(px+ts*0.58,py+ts*0.34); c.lineTo(px+ts*0.82,py+ts*0.6); c.lineTo(px+ts*0.76,py+ts*0.8); c.closePath(); c.fill();
      c.fillStyle=shade('#9a8b73',0.18); c.beginPath(); c.moveTo(px+ts*0.32,py+ts*0.42); c.lineTo(px+ts*0.58,py+ts*0.34); c.lineTo(px+ts*0.52,py+ts*0.56); c.closePath(); c.fill();
      return true;
    case 'T': sand();
      c.fillStyle='#4f7a45'; c.fillRect(px+ts*0.43,py+ts*0.2,ts*0.14,ts*0.58);
      c.fillRect(px+ts*0.24,py+ts*0.42,ts*0.2,ts*0.1); c.fillRect(px+ts*0.24,py+ts*0.32,ts*0.09,ts*0.18);
      c.fillRect(px+ts*0.56,py+ts*0.48,ts*0.2,ts*0.1); c.fillRect(px+ts*0.67,py+ts*0.3,ts*0.09,ts*0.26);
      return true;
    case '~':
      c.fillStyle='#3a8fb0'; c.fillRect(px,py,ts,ts);
      c.fillStyle='rgba(255,255,255,0.16)'; c.fillRect(px,py+ts*0.3+((gx+gy)%2),ts,2);
      return true;
  }
  return false;
}

function drawCemeteryTile(c, ch, px, py, ts, gx, gy){
  function dead(){
    const h=((gx*5+gy*11)%4);
    c.fillStyle=['#6b6a63','#727069','#65645d','#6e6d66'][h];
    c.fillRect(px,py,ts,ts);
    if((gx*13+gy*7)%5===0){ c.fillStyle='rgba(40,42,38,0.35)'; c.fillRect(px+(gx%4),py+(gy%4),3,2); }
    // fissuras na terra rachada
    if((gx*11+gy*17)%4===0){
      c.strokeStyle='rgba(34,34,30,0.45)'; c.lineWidth=1;
      c.beginPath(); c.moveTo(px+ts*0.2,py+ts*0.3); c.lineTo(px+ts*0.5,py+ts*0.5); c.lineTo(px+ts*0.4,py+ts*0.8); c.stroke();
    }
    // tufo de mato seco
    if((gx*7+gy*13)%11===0){
      c.strokeStyle='#7a7158'; c.lineWidth=1;
      for(let k=-1;k<=1;k++){ c.beginPath(); c.moveTo(px+ts*0.5,py+ts*0.7); c.lineTo(px+ts*0.5+k*2.5,py+ts*0.5); c.stroke(); }
    }
    // ossinho esbranquicado raro
    if((gx*19+gy*23)%17===0){
      c.strokeStyle='rgba(210,205,190,0.7)'; c.lineWidth=1.5;
      c.beginPath(); c.moveTo(px+ts*0.35,py+ts*0.4); c.lineTo(px+ts*0.62,py+ts*0.6); c.stroke();
    }
  }
  switch(ch){
    case '.': dead(); return true;
    case ',': dead();
      c.strokeStyle='#cfc9b6'; c.lineWidth=1.4;
      c.beginPath(); c.moveTo(px+ts*0.28,py+ts*0.6); c.lineTo(px+ts*0.66,py+ts*0.52); c.stroke();
      return true;
    case '^': dead();
      c.fillStyle='#8b8a82'; roundRect(c,px+ts*0.3,py+ts*0.28,ts*0.4,ts*0.5,ts*0.18); c.fill();
      c.fillStyle=shade('#8b8a82',-0.28); c.fillRect(px+ts*0.485,py+ts*0.4,2,ts*0.22);
      c.fillRect(px+ts*0.4,py+ts*0.46,ts*0.2,2);
      return true;
    case 'T': dead();
      c.strokeStyle='#3a332b'; c.lineWidth=Math.max(2,ts*0.07); c.lineCap='round';
      c.beginPath(); c.moveTo(px+ts*0.5,py+ts*0.8); c.lineTo(px+ts*0.5,py+ts*0.3); c.stroke();
      c.lineWidth=1.6;
      c.beginPath(); c.moveTo(px+ts*0.5,py+ts*0.5); c.lineTo(px+ts*0.3,py+ts*0.32); c.moveTo(px+ts*0.5,py+ts*0.44); c.lineTo(px+ts*0.7,py+ts*0.26); c.stroke();
      return true;
    case 'H': 
      c.fillStyle='#4a4842'; c.fillRect(px,py,ts,ts);
      c.strokeStyle='#33312c'; c.lineWidth=1;
      c.strokeRect(px+1,py+1,ts-2,ts*0.5); c.strokeRect(px+1,py+ts*0.5,ts-2,ts*0.48);
      return true;
  }
  return false;
}

function drawForestTile(c, ch, px, py, ts, gx, gy){
  switch(ch){
    case 'd': forestFloor(c,px,py,ts,gx,gy,true); return true;
    case '.': forestFloor(c,px,py,ts,gx,gy,false); return true;
    case 'Y': forestFloor(c,px,py,ts,gx,gy,false); drawPine(c,px,py,ts,gx,gy); return true;
    case ',':
      forestFloor(c,px,py,ts,gx,gy,false);
      c.fillStyle = FCOL.dirt; c.fillRect(px, py+ts*0.32, ts, ts*0.36);
      c.fillStyle = shade(FCOL.dirt,0.12);
      c.fillRect(px+ts*rng(gx,gy,3), py+ts*(0.36+rng(gx,gy,4)*0.28), 2, 1.5);
      return true;
    case '+': forestFloor(c,px,py,ts,gx,gy,false); return true;
  }
  return false;   // T, ^, 4 usam o desenho padrao (o breu por cima escurece tudo)
}

function drawTile(c, ch, px, py, ts, gx, gy){
  if(mapName && (mapName.indexOf('casa_')===0 || mapName.indexOf('loja_')===0)){ drawInteriorTile(c, mapName, ch, px, py, ts, gx, gy); return; }
  if(mapName === 'descampado' && drawCampTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'repouso_dama' && drawForestTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'avasham' && drawDesertTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'valdarkram' && drawCemeteryTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'ermo' && drawSapoTile(c, ch, px, py, ts, gx, gy)) return;
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
    case '=': {
      const tone = rng(gx,gy,9);
      c.fillStyle = tone < 0.5 ? COL.path : COL.pathDk;
      c.fillRect(px,py,ts,ts);
      for(let i=0;i<5;i++){                                           // granulado
        c.fillStyle = rng(gx,gy,i+13) > 0.5 ? shade(COL.path,0.10) : shade(COL.path,-0.14);
        c.fillRect(px+rng(gx,gy,i)*ts, py+rng(gx,gy,i+4)*ts, 2, 2);
      }
      c.fillStyle = shade(COL.pathDk,-0.1);                           // pedrinha maior
      c.fillRect(px+ts*(0.2+rng(gx,gy,20)*0.5), py+ts*(0.3+rng(gx,gy,21)*0.4), 3, 2);
      break;
    }
    case '~': {
      const tone = rng(gx,gy,5);
      c.fillStyle = tone < 0.5 ? COL.water : shade(COL.water,0.05);
      c.fillRect(px,py,ts,ts);
      const wt = Date.now()/600 + (gx*0.6 + gy*0.9);                  // fase da onda
      c.strokeStyle = 'rgba(210,232,255,0.45)'; c.lineWidth = 1.2;     // cristas ONDULANTES
      for(let i=0;i<2;i++){
        const wy = py + ts*(0.3 + i*0.36) + Math.sin(wt + i*1.6)*2.2;
        c.beginPath(); c.moveTo(px+3, wy); c.quadraticCurveTo(px+ts*0.5, wy-3, px+ts-3, wy); c.stroke();
      }
      c.fillStyle = COL.waterDk;                                       // pontos fundos
      c.fillRect(px+ts*(0.15+rng(gx,gy,3)*0.6), py+ts*(0.55+rng(gx,gy,4)*0.32), 2, 1.5);
      const glint = 0.30 + 0.4*Math.abs(Math.sin(wt*1.3));            // reflexo CINTILANTE
      c.fillStyle = 'rgba(255,255,255,'+glint.toFixed(2)+')';
      c.fillRect(px+ts*(0.2+rng(gx,gy,7)*0.5), py+ts*(0.16+rng(gx,gy,8)*0.25), 1.5, 1);
      break;
    }
    case 'T': {
      grassBase(c,px,py,ts,gx,gy);
      c.fillStyle = 'rgba(0,0,0,0.16)';                               // sombra projetada
      c.beginPath(); c.ellipse(px+ts*0.54, py+ts*0.82, ts*0.30, ts*0.10, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = COL.trunk; c.fillRect(px+ts*0.43, py+ts*0.5, ts*0.14, ts*0.34);   // tronco
      c.fillStyle = shade(COL.trunk,0.18); c.fillRect(px+ts*0.43, py+ts*0.5, ts*0.05, ts*0.34);
      c.fillStyle = shade(COL.trunk,-0.25); c.fillRect(px+ts*0.52, py+ts*0.5, ts*0.05, ts*0.34);
      c.fillStyle = COL.leafDk;                                       // copa: camada escura
      c.beginPath(); c.arc(px+ts*0.5, py+ts*0.42, ts*0.36, 0, Math.PI*2); c.fill();
      c.beginPath(); c.arc(px+ts*0.34, py+ts*0.46, ts*0.2, 0, Math.PI*2); c.fill();
      c.beginPath(); c.arc(px+ts*0.66, py+ts*0.44, ts*0.2, 0, Math.PI*2); c.fill();
      c.fillStyle = COL.leaf;                                         // camada media
      c.beginPath(); c.arc(px+ts*0.44, py+ts*0.38, ts*0.26, 0, Math.PI*2); c.fill();
      c.beginPath(); c.arc(px+ts*0.6, py+ts*0.46, ts*0.18, 0, Math.PI*2); c.fill();
      c.fillStyle = COL.leafLt;                                       // luz
      c.beginPath(); c.arc(px+ts*0.4, py+ts*0.32, ts*0.12, 0, Math.PI*2); c.fill();
      c.fillStyle = shade(COL.leafLt,0.15);
      c.fillRect(px+ts*0.36, py+ts*0.28, 2, 2); c.fillRect(px+ts*0.5, py+ts*0.34, 2, 2);
      break;
    }
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
    case 'p': {                                        // paralelepipedo (com volume por pedra)
      c.fillStyle = '#6f6a63'; c.fillRect(px,py,ts,ts);
      const off = (gy%2) ? ts*0.5 : 0;
      c.fillStyle = '#585249';                                        // juntas escuras
      c.fillRect(px, py+ts*0.5-1, ts, 1.5);
      c.fillRect(px+off, py, 1.5, ts*0.5);
      c.fillRect(px+((off+ts*0.5)%ts), py+ts*0.5, 1.5, ts*0.5);
      c.fillStyle = '#83796f';                                        // brilho no topo de cada pedra
      c.fillRect(px+off+2, py+1, ts*0.4, 1.5);
      c.fillRect(px+((off+ts*0.5)%ts)+2, py+ts*0.5+1, ts*0.4, 1.5);
      c.fillStyle = '#5b554c';                                        // granulado
      c.fillRect(px+ts*(0.2+rng(gx,gy,1)*0.5), py+ts*(0.2+rng(gx,gy,2)*0.5), 2, 2);
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

    // ---- FALANOR · FORJA DO BRAGOR ----
    case '3': {                                        // piso de pedra da forja
      c.fillStyle='#2a2220'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#332824'; c.fillRect(px,py,ts,1); c.fillRect(px,py,1,ts);
      c.fillStyle='#1d1715'; c.fillRect(px,py+ts-1,ts,1); c.fillRect(px+ts-1,py,1,ts);
      if((gx*31+gy*17)%5===0){ c.strokeStyle='rgba(224,138,58,0.25)'; c.lineWidth=1;
        c.beginPath(); c.moveTo(px+ts*0.2,py+ts*0.3); c.lineTo(px+ts*0.6,py+ts*0.7); c.stroke(); }
      break;
    }
    case '4': {                                        // rocha / parede da caverna
      c.fillStyle='#241c1a'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#312622'; c.fillRect(px,py,ts,ts*0.45);
      c.fillStyle='#181210'; c.fillRect(px,py+ts*0.55,ts,ts*0.45);
      c.fillStyle='#3d2f28'; c.fillRect(px,py,ts,2);
      c.fillStyle='#0e0a08'; c.fillRect(px,py+ts-2,ts,2);
      if((gx*13+gy*7)%4<2){ c.fillStyle='rgba(0,0,0,0.2)'; c.fillRect(px+ts*0.3,py+ts*0.4,ts*0.4,ts*0.2); }
      break;
    }
    case '5': {                                        // lava
      c.fillStyle='#3a1208'; c.fillRect(px,py,ts,ts);
      c.save(); c.globalCompositeOperation='lighter';
      const g=c.createRadialGradient(px+ts/2,py+ts/2,1,px+ts/2,py+ts/2,ts*0.7);
      g.addColorStop(0,'#ffd84a'); g.addColorStop(0.4,'#ff7a1e'); g.addColorStop(1,'rgba(200,40,0,0)');
      c.fillStyle=g; c.fillRect(px,py,ts,ts); c.restore();
      if((gx*29+gy*23)%6<2){ c.fillStyle='rgba(40,10,4,0.7)';
        c.beginPath(); c.ellipse(px+ts*0.5,py+ts*0.5,ts*0.28,ts*0.18,1,0,Math.PI*2); c.fill(); }
      break;
    }
    case '6': {                                        // fornalha acesa
      c.fillStyle='#241c1a'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#15100e'; c.fillRect(px+ts*0.15,py+ts*0.1,ts*0.7,ts*0.8);
      c.fillStyle='#3d2f28'; c.fillRect(px+ts*0.15,py+ts*0.1,ts*0.7,3);
      c.save(); c.globalCompositeOperation='lighter';
      const g=c.createRadialGradient(px+ts/2,py+ts*0.55,1,px+ts/2,py+ts*0.55,ts*0.32);
      g.addColorStop(0,'#fff0b0'); g.addColorStop(0.4,'#ff8a1e'); g.addColorStop(1,'rgba(200,40,0,0)');
      c.fillStyle=g; c.beginPath(); c.ellipse(px+ts/2,py+ts*0.55,ts*0.22,ts*0.26,0,0,Math.PI*2); c.fill(); c.restore();
      c.fillStyle='#0a0604'; c.fillRect(px+ts*0.3,py+ts*0.66,ts*0.4,ts*0.16);
      break;
    }
    case '&': {                                        // bigorna
      c.fillStyle='#2a2220'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#15110f'; c.beginPath(); c.ellipse(px+ts/2,py+ts*0.85,ts*0.22,ts*0.07,0,0,Math.PI*2); c.fill();
      c.fillStyle='#3a3540'; c.fillRect(px+ts*0.38,py+ts*0.5,ts*0.24,ts*0.32);
      c.fillStyle='#4a4550';
      c.beginPath(); c.moveTo(px+ts*0.2,py+ts*0.42); c.lineTo(px+ts*0.8,py+ts*0.42);
      c.lineTo(px+ts*0.66,py+ts*0.52); c.lineTo(px+ts*0.34,py+ts*0.52); c.closePath(); c.fill();
      c.fillStyle='#5e5868'; c.fillRect(px+ts*0.2,py+ts*0.36,ts*0.5,ts*0.08);
      c.beginPath(); c.moveTo(px+ts*0.7,py+ts*0.36); c.lineTo(px+ts*0.86,py+ts*0.38); c.lineTo(px+ts*0.7,py+ts*0.44); c.closePath(); c.fill();
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=0.5; c.fillStyle='#ff8a3a';
      c.fillRect(px+ts*0.3,py+ts*0.35,ts*0.2,2); c.restore();
      break;
    }

    // ---- FALANOR · CABARE DO JOSE ----
    case 'X': {                                        // parede do cabare
      c.fillStyle='#2a121e'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#3a1a28'; c.fillRect(px,py,ts,ts*0.5);
      c.fillStyle='#1e0c16'; c.fillRect(px,py+ts*0.5,ts,ts*0.5);
      c.fillStyle='#caa15a'; c.fillRect(px,py,ts,2);
      c.fillStyle='#120610'; c.fillRect(px,py+ts-1,ts,1);
      if((gx+gy)%3===0){ c.fillStyle='rgba(202,161,90,0.15)'; c.fillRect(px+ts*0.4,py+ts*0.3,ts*0.2,ts*0.4); }
      break;
    }
    case '0': {                                        // piso vinho do salao
      c.fillStyle='#3a1825'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#451d2c'; c.fillRect(px+1,py+1,ts-2,ts-2);
      if((gx+gy)%2){ c.fillStyle='rgba(202,161,90,0.07)'; c.fillRect(px,py,ts,ts); }
      if((gx*19+gy*29)%7<1){ c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=0.12;
        c.fillStyle='#9b6dff'; c.beginPath(); c.arc(px+ts/2,py+ts/2,ts*0.5,0,Math.PI*2); c.fill(); c.restore(); }
      break;
    }
    case '8': {                                        // mesa de jogo
      c.fillStyle='#3a1825'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#0e0a08'; c.beginPath(); c.ellipse(px+ts/2,py+ts*0.82,ts*0.32,ts*0.08,0,0,Math.PI*2); c.fill();
      c.fillStyle='#1f5a3a'; c.beginPath(); c.ellipse(px+ts/2,py+ts*0.5,ts*0.38,ts*0.3,0,0,Math.PI*2); c.fill();
      c.fillStyle='#2a6e48'; c.beginPath(); c.ellipse(px+ts/2,py+ts*0.46,ts*0.34,ts*0.26,0,0,Math.PI*2); c.fill();
      c.strokeStyle='#caa15a'; c.lineWidth=1; c.beginPath(); c.ellipse(px+ts/2,py+ts*0.46,ts*0.34,ts*0.26,0,0,Math.PI*2); c.stroke();
      c.fillStyle='#e8e0d0'; c.fillRect(px+ts*0.38,py+ts*0.42,ts*0.1,ts*0.14); c.fillRect(px+ts*0.5,py+ts*0.42,ts*0.1,ts*0.14);
      c.fillStyle='#d04a4a'; c.fillRect(px+ts*0.6,py+ts*0.5,ts*0.08,ts*0.08);
      break;
    }
    case '9': {                                        // palco
      c.fillStyle='#4a2e1a'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#5a3a22'; c.fillRect(px,py,ts,ts*0.5);
      c.fillStyle='#3a2414'; c.fillRect(px,py+ts-2,ts,2);
      c.strokeStyle='rgba(0,0,0,0.25)'; c.lineWidth=1;
      c.beginPath(); c.moveTo(px,py+ts*0.5); c.lineTo(px+ts,py+ts*0.5); c.stroke();
      c.fillStyle='#2a1a0e'; c.fillRect(px+ts*0.5-0.5,py,1,ts);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=0.5;
      const g=c.createLinearGradient(px,py+ts,px,py+ts*0.7); g.addColorStop(0,'#ffcf6a'); g.addColorStop(1,'rgba(255,180,80,0)');
      c.fillStyle=g; c.fillRect(px,py+ts*0.7,ts,ts*0.3); c.restore();
      break;
    }
    case '7': {                                        // cortina
      c.fillStyle='#2a0e18'; c.fillRect(px,py,ts,ts);
      for(let i=0;i<4;i++){ const xx=px+i*ts*0.25;
        c.fillStyle=(i%2)?'#451623':'#330f1a'; c.fillRect(xx,py,ts*0.25,ts); }
      c.fillStyle='#caa15a'; c.fillRect(px,py,ts,2);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=0.15;
      c.fillStyle='#9b6dff'; c.fillRect(px,py,ts,ts); c.restore();
      break;
    }

    // ---- FALANOR · JARDIM DO NHARE ----
    case 'J': {                                        // arbusto florido
      grassBase(c,px,py,ts,gx,gy);
      c.fillStyle='#1f5a2a';
      c.beginPath(); c.arc(px+ts*0.35,py+ts*0.6,ts*0.26,0,Math.PI*2); c.arc(px+ts*0.65,py+ts*0.6,ts*0.26,0,Math.PI*2);
      c.arc(px+ts*0.5,py+ts*0.42,ts*0.28,0,Math.PI*2); c.fill();
      c.fillStyle='#2a7038';
      c.beginPath(); c.arc(px+ts*0.42,py+ts*0.46,ts*0.18,0,Math.PI*2); c.arc(px+ts*0.6,py+ts*0.5,ts*0.16,0,Math.PI*2); c.fill();
      const h=(gx*7+gy*13)%3;
      c.fillStyle = h===0?'#e87da0':(h===1?'#e8d24a':'#c89bff');
      c.beginPath(); c.arc(px+ts*0.38,py+ts*0.44,ts*0.05,0,Math.PI*2); c.arc(px+ts*0.62,py+ts*0.54,ts*0.05,0,Math.PI*2);
      c.arc(px+ts*0.52,py+ts*0.36,ts*0.05,0,Math.PI*2); c.fill();
      break;
    }
    case '%': {                                        // canteiro de flores
      grassBase(c,px,py,ts,gx,gy);
      const h=(gx*11+gy*5), cols=['#e87da0','#e8d24a','#c89bff','#ff9a5a','#7ab8e8'];
      for(let i=0;i<4;i++){ const fx=px+((h*7+i*53)%ts), fy=py+((h*13+i*29)%ts);
        c.fillStyle=cols[(h+i)%cols.length]; c.beginPath(); c.arc(fx,fy,ts*0.06,0,Math.PI*2); c.fill();
        c.fillStyle='#e8e0a0'; c.fillRect(fx-1,fy-1,2,2); }
      break;
    }
    case 't': {                                        // toca do Nhare (mil saidas)
      grassBase(c,px,py,ts,gx,gy);
      c.fillStyle='#5a4730'; c.beginPath(); c.ellipse(px+ts*0.5,py+ts*0.58,ts*0.34,ts*0.24,0,0,Math.PI*2); c.fill();
      c.fillStyle='#3a2e1e'; c.beginPath(); c.ellipse(px+ts*0.5,py+ts*0.56,ts*0.26,ts*0.18,0,0,Math.PI*2); c.fill();
      c.fillStyle='#0a0806'; c.beginPath(); c.ellipse(px+ts*0.5,py+ts*0.56,ts*0.16,ts*0.12,0,0,Math.PI*2); c.fill();
      break;
    }

    // ---- FADRAKOR · LITORAL DO KORGATH ----
    case 'S': {                                        // areia da praia
      c.fillStyle='#d9c89a'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#e2d3a8'; c.fillRect(px,py,ts,ts*0.5);
      c.strokeStyle='rgba(180,160,120,0.4)'; c.lineWidth=1;
      const o=(gx*13+gy*7)%4;
      c.beginPath();
      c.moveTo(px,py+ts*0.3+o); c.quadraticCurveTo(px+ts*0.5,py+ts*0.3+o-2,px+ts,py+ts*0.3+o);
      c.moveTo(px,py+ts*0.7+o); c.quadraticCurveTo(px+ts*0.5,py+ts*0.7+o-2,px+ts,py+ts*0.7+o); c.stroke();
      const h=(gx*31+gy*17)%7;
      if(h===0){ c.fillStyle='#f0e8d8'; c.beginPath(); c.arc(px+ts*0.3,py+ts*0.6,ts*0.06,0,Math.PI*2); c.fill(); }
      else if(h===1){ c.fillStyle='#c8b890'; c.fillRect(px+ts*0.6,py+ts*0.4,ts*0.08,ts*0.05); }
      else if(h===2){ c.fillStyle='#b0a070'; c.beginPath(); c.arc(px+ts*0.7,py+ts*0.7,ts*0.03,0,Math.PI*2); c.fill(); }
      break;
    }
    case '!': {                                        // totem de guerra do Korgath
      c.fillStyle='#d9c89a'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#0e0a08'; c.beginPath(); c.ellipse(px+ts*0.5,py+ts*0.9,ts*0.18,ts*0.05,0,0,Math.PI*2); c.fill();
      c.fillStyle='#5a3a24'; c.fillRect(px+ts*0.34,py+ts*0.15,ts*0.32,ts*0.78);
      c.fillStyle='#6a4a30'; c.fillRect(px+ts*0.34,py+ts*0.15,ts*0.1,ts*0.78);
      c.fillStyle='#b03828'; c.fillRect(px+ts*0.34,py+ts*0.34,ts*0.32,ts*0.06);
      c.fillStyle='#c8a030'; c.fillRect(px+ts*0.34,py+ts*0.6,ts*0.32,ts*0.05);
      c.fillStyle='#4a2e1c'; c.fillRect(px+ts*0.3,py+ts*0.12,ts*0.4,ts*0.24);
      c.fillStyle='#e8d050';
      c.beginPath(); c.moveTo(px+ts*0.36,py+ts*0.2); c.lineTo(px+ts*0.44,py+ts*0.18); c.lineTo(px+ts*0.42,py+ts*0.24); c.closePath();
      c.moveTo(px+ts*0.64,py+ts*0.2); c.lineTo(px+ts*0.56,py+ts*0.18); c.lineTo(px+ts*0.58,py+ts*0.24); c.fill();
      c.fillStyle='#1a1010'; c.fillRect(px+ts*0.4,py+ts*0.28,ts*0.2,ts*0.05);
      c.fillStyle='#fff'; c.fillRect(px+ts*0.42,py+ts*0.28,ts*0.02,ts*0.04); c.fillRect(px+ts*0.56,py+ts*0.28,ts*0.02,ts*0.04);
      break;
    }

    // ---- FADRAKOR · SELVA DA FACALAN ----
    case '?': {                                        // samambaia / cipo
      grassBase(c,px,py,ts,gx,gy);
      c.strokeStyle='#2f6e34'; c.lineWidth=Math.max(1,ts*0.025);
      const cxp=px+ts*0.5, cyp=py+ts*0.8;
      for(let i=-2;i<=2;i++){ c.beginPath(); c.moveTo(cxp,cyp);
        c.quadraticCurveTo(cxp+i*ts*0.12,py+ts*0.4,cxp+i*ts*0.22,py+ts*0.2+Math.abs(i)*ts*0.06); c.stroke(); }
      c.fillStyle='#3a8040';
      for(let i=-2;i<=2;i++){ c.beginPath(); c.ellipse(cxp+i*ts*0.2,py+ts*0.24+Math.abs(i)*ts*0.05,ts*0.04,ts*0.08,i*0.3,0,Math.PI*2); c.fill(); }
      break;
    }

    // ---- FADRAKOR · VULCAO DO DRAZUN ----
    case '$': {                                        // obsidiana
      c.fillStyle='#1a1420'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#26202e';
      c.beginPath(); c.moveTo(px+ts*0.3,py+ts*0.9); c.lineTo(px+ts*0.42,py+ts*0.2); c.lineTo(px+ts*0.52,py+ts*0.9); c.closePath(); c.fill();
      c.fillStyle='#322a3c';
      c.beginPath(); c.moveTo(px+ts*0.5,py+ts*0.9); c.lineTo(px+ts*0.64,py+ts*0.35); c.lineTo(px+ts*0.78,py+ts*0.9); c.closePath(); c.fill();
      c.strokeStyle='rgba(155,109,255,0.5)'; c.lineWidth=1;
      c.beginPath(); c.moveTo(px+ts*0.44,py+ts*0.3); c.lineTo(px+ts*0.4,py+ts*0.8); c.stroke();
      c.strokeStyle='rgba(255,120,60,0.3)';
      c.beginPath(); c.moveTo(px+ts*0.66,py+ts*0.42); c.lineTo(px+ts*0.7,py+ts*0.85); c.stroke();
      break;
    }
    case '-': {                                        // tesouro de ouro do Drazun
      c.fillStyle='#3a2a10'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#c89a2a'; c.beginPath(); c.ellipse(px+ts*0.5,py+ts*0.7,ts*0.46,ts*0.28,0,0,Math.PI*2); c.fill();
      c.fillStyle='#e8c040'; c.beginPath(); c.ellipse(px+ts*0.45,py+ts*0.6,ts*0.32,ts*0.2,0,0,Math.PI*2); c.fill();
      const h=(gx*17+gy*23);
      for(let i=0;i<5;i++){ const mx=px+((h*7+i*41)%ts), my=py+ts*0.4+((h*13+i*29)%(ts*0.5));
        c.fillStyle=(i%2)?'#f0d860':'#d0a830'; c.beginPath(); c.arc(mx,my,ts*0.06,0,Math.PI*2); c.fill();
        c.fillStyle='#fff8d0'; c.fillRect(mx-1,my-1,1.5,1.5); }
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=0.2; c.fillStyle='#ffe080';
      c.beginPath(); c.arc(px+ts*0.5,py+ts*0.6,ts*0.4,0,Math.PI*2); c.fill(); c.restore();
      break;
    }

    // ---- FADRAKOR · passagem de borda ----
    case '+': {                                        // passagem (atravessa pro mapa vizinho)
      c.fillStyle='#4a3c28'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#5a4a32'; c.fillRect(px,py,ts,ts*0.5);
      c.fillStyle='#3a2e1e';
      c.fillRect(px+ts*0.3,py+ts*0.2,ts*0.1,ts*0.12); c.fillRect(px+ts*0.55,py+ts*0.5,ts*0.1,ts*0.12);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=0.18;
      const g=c.createLinearGradient(px,py,px,py+ts); g.addColorStop(0,'#9b6dff'); g.addColorStop(1,'rgba(155,109,255,0)');
      c.fillStyle=g; c.fillRect(px,py,ts,ts); c.restore();
      break;
    }
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
function drawInsectoid(c, sx, sy, ts, p){
  const cx=sx+ts/2, cy=sy+ts*0.52, t=performance.now();
  const scorp=(p.mtype==='escorpiao_gigante'); const col=scorp?'#7a5a2e':'#7a3a2a';
  const leg=((t/200+cx)%2<1)?1:-1;
  c.save();
  c.fillStyle='rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(cx,cy+ts*0.22,ts*0.3,ts*0.1,0,0,Math.PI*2); c.fill();
  c.strokeStyle=shade(col,-0.3); c.lineWidth=Math.max(1.6,ts*0.04); c.lineCap='round';
  for(let i=-2;i<=2;i++){ if(i===0)continue; const lx=cx+i*ts*0.1;
    c.beginPath(); c.moveTo(lx,cy); c.lineTo(lx+i*ts*0.12,cy+ts*0.18+leg*2*((i%2)?1:-1)); c.stroke();
    c.beginPath(); c.moveTo(lx,cy); c.lineTo(lx+i*ts*0.12,cy-ts*0.14-leg*2*((i%2)?1:-1)); c.stroke(); }
  c.fillStyle=col;
  for(let s2=0;s2<4;s2++){ c.beginPath(); c.ellipse(cx-ts*0.04+s2*ts*0.02,cy,ts*(0.2-s2*0.012),ts*(0.13-s2*0.006),0,0,Math.PI*2); c.fill(); }
  if(scorp){
    c.fillStyle=col;
    c.beginPath(); c.ellipse(cx-ts*0.22,cy-ts*0.06,ts*0.07,ts*0.04,0.4,0,Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(cx-ts*0.22,cy+ts*0.06,ts*0.07,ts*0.04,-0.4,0,Math.PI*2); c.fill();
    c.fillStyle=shade(col,0.15);
    c.beginPath(); c.ellipse(cx-ts*0.3,cy-ts*0.08,ts*0.05,ts*0.025,0,0,Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(cx-ts*0.3,cy+ts*0.08,ts*0.05,ts*0.025,0,0,Math.PI*2); c.fill();
    c.strokeStyle=col; c.lineWidth=ts*0.08; c.lineCap='round';
    c.beginPath(); c.moveTo(cx+ts*0.16,cy); c.quadraticCurveTo(cx+ts*0.34,cy-ts*0.1,cx+ts*0.26,cy-ts*0.28); c.stroke();
    c.fillStyle='#e8d8a0'; c.beginPath(); c.arc(cx+ts*0.24,cy-ts*0.32,ts*0.04,0,Math.PI*2); c.fill();
  } else {
    c.fillStyle=shade(col,0.1); c.beginPath(); c.arc(cx-ts*0.24,cy,ts*0.08,0,Math.PI*2); c.fill();
    c.strokeStyle=col; c.lineWidth=1.4;
    c.beginPath(); c.moveTo(cx-ts*0.3,cy-ts*0.03); c.lineTo(cx-ts*0.4,cy-ts*0.1); c.moveTo(cx-ts*0.3,cy+ts*0.03); c.lineTo(cx-ts*0.4,cy+ts*0.1); c.stroke();
    c.fillStyle='#1a0f0a'; c.beginPath(); c.arc(cx-ts*0.26,cy-ts*0.03,1.3,0,Math.PI*2); c.arc(cx-ts*0.26,cy+ts*0.03,1.3,0,Math.PI*2); c.fill();
  }
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawSerpent(c, sx, sy, ts, p){
  const cx=sx+ts/2, cy=sy+ts*0.5, t=performance.now();
  const worm=(p.mtype==='verme_areias'); const col=worm?'#c08a5a':'#6a8a3a';
  const wig=Math.sin(t/260+cx)*ts*0.06;
  c.save();
  c.fillStyle='rgba(0,0,0,.26)'; c.beginPath(); c.ellipse(cx,cy+ts*0.24,ts*0.26,ts*0.09,0,0,Math.PI*2); c.fill();
  if(worm){
    c.fillStyle=col;
    for(let s2=0;s2<5;s2++){ const yy=cy+ts*0.2-s2*ts*0.1;
      c.beginPath(); c.ellipse(cx+Math.sin(s2+t/300)*ts*0.04,yy,ts*0.16-s2*0.004*ts,ts*0.1,0,0,Math.PI*2); c.fill();
      c.strokeStyle=shade(col,-0.2); c.lineWidth=1; c.stroke(); }
    c.fillStyle='#3a1a14'; c.beginPath(); c.arc(cx,cy-ts*0.28,ts*0.12,0,Math.PI*2); c.fill();
    c.fillStyle='#e8d8c0';
    for(let k=0;k<8;k++){ const a=k/8*Math.PI*2; c.beginPath();
      c.moveTo(cx+Math.cos(a)*ts*0.12,cy-ts*0.28+Math.sin(a)*ts*0.12);
      c.lineTo(cx+Math.cos(a)*ts*0.06,cy-ts*0.28+Math.sin(a)*ts*0.06);
      c.lineTo(cx+Math.cos(a+0.3)*ts*0.1,cy-ts*0.28+Math.sin(a+0.3)*ts*0.1); c.fill(); }
  } else {
    c.strokeStyle=col; c.lineWidth=ts*0.12; c.lineCap='round';
    c.beginPath(); c.moveTo(cx-ts*0.1,cy+ts*0.26); c.quadraticCurveTo(cx+ts*0.2+wig,cy+ts*0.1,cx-ts*0.05,cy-ts*0.06); c.quadraticCurveTo(cx-ts*0.24-wig,cy-ts*0.18,cx,cy-ts*0.3); c.stroke();
    c.fillStyle=shade(col,0.12); c.beginPath(); c.ellipse(cx,cy-ts*0.28,ts*0.14,ts*0.1,0,0,Math.PI*2); c.fill();
    c.fillStyle=col; c.beginPath(); c.arc(cx,cy-ts*0.3,ts*0.07,0,Math.PI*2); c.fill();
    c.fillStyle='#1a0f0a'; c.beginPath(); c.arc(cx-ts*0.03,cy-ts*0.32,1.3,0,Math.PI*2); c.arc(cx+ts*0.03,cy-ts*0.32,1.3,0,Math.PI*2); c.fill();
    c.strokeStyle='#d65a6a'; c.lineWidth=1; c.beginPath(); c.moveTo(cx,cy-ts*0.36); c.lineTo(cx,cy-ts*0.42); c.stroke();
  }
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawElemental(c, sx, sy, ts, p){
  const cx=sx+ts/2, cy=sy+ts*0.5, t=performance.now()/300;
  c.save();
  c.fillStyle='rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(cx,cy+ts*0.28,ts*0.24,ts*0.08,0,0,Math.PI*2); c.fill();
  for(let i=0;i<5;i++){ const r=ts*(0.06+i*0.04), yy=cy+ts*0.26-i*ts*0.12, off=Math.sin(t+i)*ts*0.05;
    c.fillStyle=shade('#e3c486',i*0.04-0.08); c.globalAlpha=0.85;
    c.beginPath(); c.ellipse(cx+off,yy,r,r*0.5,0,0,Math.PI*2); c.fill(); }
  c.globalAlpha=1;
  c.fillStyle='#fff2c0'; c.shadowColor='#ffcf6a'; c.shadowBlur=6;
  c.beginPath(); c.arc(cx-ts*0.05,cy-ts*0.18,2,0,Math.PI*2); c.arc(cx+ts*0.05,cy-ts*0.18,2,0,Math.PI*2); c.fill();
  c.shadowBlur=0;
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawReptile(c, sx, sy, ts, p){
  const cx=sx+ts/2, cy=sy+ts*0.54;
  const d=_dirVec(p.facing||'down'), fx=d[0], fy=d[1], pxv=-fy, pyv=fx, ang=Math.atan2(fy,fx);
  const col='#5a7a3a';
  c.save();
  c.fillStyle='rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(cx,cy+ts*0.22,ts*0.32,ts*0.1,0,0,Math.PI*2); c.fill();
  c.strokeStyle=col; c.lineWidth=ts*0.1; c.lineCap='round';
  c.beginPath(); c.moveTo(cx-fx*ts*0.2,cy-fy*ts*0.2); c.lineTo(cx-fx*ts*0.42,cy-fy*ts*0.42); c.stroke();
  c.strokeStyle=shade(col,-0.3); c.lineWidth=Math.max(2,ts*0.05);
  for(const s2 of [1,-1]){ for(const a of [0.5,-0.5]){ const lx=cx+fx*ts*0.16*a+pxv*ts*0.16*s2, ly=cy+fy*ts*0.16*a+pyv*ts*0.16*s2;
    c.beginPath(); c.moveTo(lx,ly); c.lineTo(lx+pxv*ts*0.06*s2,ly+pyv*ts*0.06*s2+ts*0.1); c.stroke(); } }
  c.fillStyle=col; c.beginPath(); c.ellipse(cx,cy,ts*0.26,ts*0.16,ang,0,Math.PI*2); c.fill();
  c.fillStyle=shade(col,-0.2);
  for(let i=-2;i<=2;i++){ const bx=cx-pxv*i*2-fx*i, by=cy-pyv*i*2-fy*i;
    c.beginPath(); c.moveTo(bx,by); c.lineTo(bx-pyv*3,by+pxv*3); c.lineTo(bx+fx*4,by+fy*4); c.fill(); }
  const hx=cx+fx*ts*0.26, hy=cy+fy*ts*0.26;
  c.fillStyle=col; c.beginPath(); c.arc(hx,hy,ts*0.12,0,Math.PI*2); c.fill();
  c.fillStyle='#f4e04a'; c.shadowColor='#f4e04a'; c.shadowBlur=5;
  c.beginPath(); c.arc(hx+pxv*ts*0.05,hy+pyv*ts*0.05,2,0,Math.PI*2); c.arc(hx-pxv*ts*0.05,hy-pyv*ts*0.05,2,0,Math.PI*2); c.fill();
  c.shadowBlur=0;
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

const UNDEAD = {
  esqueleto_guerreiro: {skin:'#e0ddcf', cloth:'#6a6258', armor:'#8a8a92', eye:'#7fd0ff', kind:'bone'},
  zumbi_putrido:       {skin:'#7a8a5a', cloth:'#4a4434', armor:null,      eye:'#c8d860', kind:'rot'},
  ghoul_faminto:       {skin:'#b8a890', cloth:'#3a3026', armor:null,      eye:'#ff8a3a', kind:'ghoul'},
  carnical_profanador: {skin:'#9a8a6a', cloth:'#2e2820', armor:null,      eye:'#ffb84a', kind:'ghoul'},
  cavaleiro_morte:     {skin:'#cfc8b8', cloth:'#1e1a24', armor:'#2a2e3a', eye:'#b06bff', kind:'knight'},
};
function drawUndead(c, sx, sy, ts, p){
  const u=UNDEAD[p.mtype]||UNDEAD.esqueleto_guerreiro;
  const cx=sx+ts/2, t=performance.now(), bob=Math.sin(t/600+cx)*1.2;
  const cy=sy+ts*0.5+bob, knight=(u.kind==='knight'), bone=(u.kind==='bone');
  c.save();
  c.fillStyle='rgba(0,0,0,.30)'; c.beginPath(); c.ellipse(cx,sy+ts*0.84,ts*0.24,ts*0.09,0,0,Math.PI*2); c.fill();
  c.strokeStyle=u.armor||u.skin; c.lineWidth=Math.max(2,ts*0.06); c.lineCap='round';
  c.beginPath(); c.moveTo(cx-ts*0.07,cy+ts*0.1); c.lineTo(cx-ts*0.08,cy+ts*0.32); c.moveTo(cx+ts*0.07,cy+ts*0.1); c.lineTo(cx+ts*0.08,cy+ts*0.32); c.stroke();
  c.fillStyle=u.armor||u.cloth; roundRect(c,cx-ts*0.13,cy-ts*0.14,ts*0.26,ts*0.3,ts*0.06); c.fill();
  if(bone){ c.strokeStyle=u.skin; c.lineWidth=1.4;
    for(let i=0;i<3;i++){ c.beginPath(); c.moveTo(cx-ts*0.08,cy-ts*0.06+i*ts*0.06); c.lineTo(cx+ts*0.08,cy-ts*0.06+i*ts*0.06); c.stroke(); } }
  c.strokeStyle=u.armor||u.skin; c.lineWidth=Math.max(2,ts*0.05);
  c.beginPath(); c.moveTo(cx-ts*0.12,cy-ts*0.08); c.lineTo(cx-ts*0.2,cy+ts*0.08); c.stroke();
  c.beginPath(); c.moveTo(cx+ts*0.12,cy-ts*0.08); c.lineTo(cx+ts*0.22,cy-ts*0.04); c.stroke();
  if(knight){ c.strokeStyle='#15121a'; c.lineWidth=ts*0.05; c.beginPath(); c.moveTo(cx+ts*0.22,cy-ts*0.04); c.lineTo(cx+ts*0.22,cy-ts*0.34); c.stroke();
    c.fillStyle='#b06bff'; c.globalAlpha=0.5; c.fillRect(cx+ts*0.2,cy-ts*0.34,ts*0.04,ts*0.3); c.globalAlpha=1; }
  else if(bone){ c.strokeStyle='#cfc8b0'; c.lineWidth=ts*0.04; c.beginPath(); c.moveTo(cx+ts*0.22,cy-ts*0.04); c.lineTo(cx+ts*0.22,cy-ts*0.3); c.stroke(); }
  else { c.strokeStyle=u.skin; c.lineWidth=1.4; for(let k=-1;k<=1;k++){ c.beginPath(); c.moveTo(cx+ts*0.2,cy-ts*0.04); c.lineTo(cx+ts*0.26+k,cy+ts*0.02+k*2); c.stroke(); } }
  const hy=cy-ts*0.24;
  c.fillStyle=u.skin; c.beginPath(); c.arc(cx,hy,ts*0.1,0,Math.PI*2); c.fill();
  if(knight){ c.fillStyle=u.armor; c.beginPath(); c.arc(cx,hy,ts*0.11,Math.PI,0); c.fill(); c.fillRect(cx-ts*0.11,hy-1,ts*0.22,ts*0.08);
    c.fillStyle='#b06bff'; c.fillRect(cx-ts*0.07,hy,ts*0.14,2); }
  else if(bone||u.kind==='ghoul'){ c.fillStyle='#1a1610'; c.beginPath(); c.arc(cx-ts*0.035,hy,ts*0.022,0,Math.PI*2); c.arc(cx+ts*0.035,hy,ts*0.022,0,Math.PI*2); c.fill();
    c.fillStyle=u.eye; c.shadowColor=u.eye; c.shadowBlur=4; c.beginPath(); c.arc(cx-ts*0.035,hy,ts*0.011,0,Math.PI*2); c.arc(cx+ts*0.035,hy,ts*0.011,0,Math.PI*2); c.fill(); c.shadowBlur=0;
    c.strokeStyle='#1a1610'; c.lineWidth=1; for(let i=-1;i<=1;i++){ c.beginPath(); c.moveTo(cx+i*ts*0.025,hy+ts*0.05); c.lineTo(cx+i*ts*0.025,hy+ts*0.085); c.stroke(); } }
  else { c.fillStyle=u.eye; c.beginPath(); c.arc(cx-ts*0.035,hy,1.5,0,Math.PI*2); c.arc(cx+ts*0.035,hy,1.5,0,Math.PI*2); c.fill(); }
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawAbomination(c, sx, sy, ts, p){
  const cx=sx+ts/2, t=performance.now(), bob=Math.sin(t/500+cx)*1.5; const cy=sy+ts*0.5+bob;
  c.save();
  c.fillStyle='rgba(0,0,0,.34)'; c.beginPath(); c.ellipse(cx,sy+ts*0.86,ts*0.34,ts*0.12,0,0,Math.PI*2); c.fill();
  c.strokeStyle='#cfc8b0'; c.lineWidth=Math.max(3,ts*0.09); c.lineCap='round';
  c.beginPath(); c.moveTo(cx-ts*0.12,cy+ts*0.12); c.lineTo(cx-ts*0.14,cy+ts*0.36); c.moveTo(cx+ts*0.12,cy+ts*0.12); c.lineTo(cx+ts*0.14,cy+ts*0.36); c.stroke();
  c.fillStyle='#ddd6c0'; c.beginPath(); c.ellipse(cx,cy,ts*0.26,ts*0.24,0,0,Math.PI*2); c.fill();
  c.fillStyle=shade('#ddd6c0',-0.18);
  for(let i=0;i<4;i++){ const a=i/4*Math.PI*2+t/1000; c.beginPath(); c.arc(cx+Math.cos(a)*ts*0.12,cy+Math.sin(a)*ts*0.1,ts*0.06,0,Math.PI*2); c.fill(); }
  c.strokeStyle='#cfc8b0'; c.lineWidth=ts*0.08;
  c.beginPath(); c.moveTo(cx-ts*0.2,cy-ts*0.06); c.lineTo(cx-ts*0.34,cy+ts*0.14); c.stroke();
  c.beginPath(); c.moveTo(cx+ts*0.2,cy-ts*0.06); c.lineTo(cx+ts*0.34,cy+ts*0.14); c.stroke();
  c.strokeStyle='#e8e0c8'; c.lineWidth=1.6;
  for(const sgn of [-1,1]){ for(let k=-1;k<=1;k++){ c.beginPath(); c.moveTo(cx+sgn*ts*0.34,cy+ts*0.14); c.lineTo(cx+sgn*ts*0.38,cy+ts*0.2+k*2); c.stroke(); } }
  for(const hx of [cx-ts*0.1,cx+ts*0.1,cx]){ const hy=(hx===cx)?cy-ts*0.26:cy-ts*0.18;
    c.fillStyle='#e8e2cc'; c.beginPath(); c.arc(hx,hy,ts*0.075,0,Math.PI*2); c.fill();
    c.fillStyle='#1a1610'; c.beginPath(); c.arc(hx-ts*0.025,hy,1.4,0,Math.PI*2); c.arc(hx+ts*0.025,hy,1.4,0,Math.PI*2); c.fill();
    c.fillStyle='#ff5a3a'; c.shadowColor='#ff5a3a'; c.shadowBlur=4; c.beginPath(); c.arc(hx-ts*0.025,hy,0.7,0,Math.PI*2); c.arc(hx+ts*0.025,hy,0.7,0,Math.PI*2); c.fill(); c.shadowBlur=0; }
  c.restore();
  c.save(); c.font='800 8px Cinzel, serif'; c.textAlign='center'; c.textBaseline='bottom';
  const tw=c.measureText('ABOMINACAO').width+8, tagY=sy-12;
  c.fillStyle='rgba(20,8,8,0.92)'; roundRect(c,cx-tw/2,tagY-11,tw,11,3); c.fill();
  c.fillStyle='#e8b0a0'; c.fillText('ABOMINACAO',cx,tagY-1.5); c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawMonster(c, sx, sy, ts, p){
  // cada tipo tem sua arte; o resto cai no emoji.
  const t = p.mtype;
  if(t === 'maurao'){ drawBoss(c, sx, sy, ts, p); return; }
  if(t === 'dama_noite'){ drawBanshee(c, sx, sy, ts, p); return; }
  if(t === 'capanga' || t === 'capanga_brutamontes'){ drawThug(c, sx, sy, ts, p); return; }
  if(t === 'velho_bob' || t === 'rato_gigante' || t === 'lobo' || t === 'javali' || t === 'lobo_negro'){ drawBeast(c, sx, sy, ts, p); return; }
  if(t === 'harpia'){ drawHarpy(c, sx, sy, ts, p); return; }
  if(t === 'bruxa_louca'){ drawWitch(c, sx, sy, ts, p); return; }
  if(t === 'alma_errante' || t === 'assombracao' || t === 'espectro' || t === 'vulto' || t === 'alma_penada'){ drawSpirit(c, sx, sy, ts, p); return; }
  if(t === 'hiena_ermo'){ drawBeast(c, sx, sy, ts, p); return; }
  if(t === 'abutre_carniceiro'){ drawHarpy(c, sx, sy, ts, p); return; }
  if(t === 'lacraia_gigante' || t === 'escorpiao_gigante'){ drawInsectoid(c, sx, sy, ts, p); return; }
  if(t === 'naja_dunas' || t === 'verme_areias'){ drawSerpent(c, sx, sy, ts, p); return; }
  if(t === 'elemental_areia'){ drawElemental(c, sx, sy, ts, p); return; }
  if(t === 'basilisco_deserto'){ drawReptile(c, sx, sy, ts, p); return; }
  if(t === 'esqueleto_guerreiro' || t === 'zumbi_putrido' || t === 'ghoul_faminto' || t === 'carnical_profanador' || t === 'cavaleiro_morte'){ drawUndead(c, sx, sy, ts, p); return; }
  if(t === 'aparicao_sepulcral'){ drawSpirit(c, sx, sy, ts, p); return; }
  if(t === 'necromante_caido'){ drawWitch(c, sx, sy, ts, p); return; }
  if(t === 'abominacao_ossea'){ drawAbomination(c, sx, sy, ts, p); return; }
  const cx = sx + ts/2, cy = sy + ts/2;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath(); c.ellipse(cx, sy + ts*0.84, ts*0.30, ts*0.12, 0, 0, Math.PI*2); c.fill();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = Math.round(ts*0.82) + 'px serif';
  c.fillText(p.glyph || '👾', cx, cy + ts*0.04);
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawMonsterBarName(c, sx, sy, ts, p){
  const cx = sx + ts/2;
  const hp = (p.hp==null? 1 : p.hp), hpm = (p.hp_max || hp || 1);
  const frac = Math.max(0, Math.min(1, hp/hpm));
  const bw = ts*0.84, bh = 4, bx = cx - bw/2, by = sy - 1;
  c.save();
  c.fillStyle = 'rgba(10,8,18,0.85)'; c.fillRect(bx-1, by-1, bw+2, bh+2);
  c.fillStyle = '#3a2030'; c.fillRect(bx, by, bw, bh);
  c.fillStyle = frac>0.5? '#5ec27a' : (frac>0.25? '#e0b15a' : '#d65a5a');
  c.fillRect(bx, by, bw*frac, bh);
  const nm = p.name || '';
  c.font = '700 9px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
  c.lineWidth = 2.5; c.strokeStyle = 'rgba(8,7,15,0.85)'; c.strokeText(nm, cx, by - 3);
  c.fillStyle = '#f0d0a8'; c.fillText(nm, cx, by - 3);
  const st = p._status;
  if(st){
    const ks = Object.keys(st).filter(k=> st[k] > 0);
    if(ks.length){
      c.font = '11px serif'; c.textBaseline = 'bottom';
      c.fillText(ks.map(k=> (typeof STATUS_ICON!=='undefined' && STATUS_ICON[k]) || '✦').join(' '), cx, by - 14);
    }
  }
  c.restore();
}

// capanga de Sapopemba: humano negro de regata/bermuda, com facão (cria) ou
// marreta (traficante). Anda com balanço de pernas e olha pra direção do passo.
function drawThug(c, sx, sy, ts, p){
  const big = (p.mtype === 'capanga_brutamontes');
  const s = big ? 1.16 : 1.0;
  const skin = big ? '#5e3a23' : '#714829';
  const skinD = shade(skin, -0.32);
  const tank = big ? '#39222f' : '#e2bd45';      // traficante: regata escura · cria: regata amarela
  const shortc = big ? '#221b2c' : '#2d2742';
  const hair = '#150d13';
  const cx = sx + ts/2;
  const facing = p.facing || 'down';
  const moving = !!p._moving;
  const cyc = ((p.walk||0) % WALK_CYCLE) / WALK_CYCLE;
  const frame = cyc < 0.5 ? 0 : 1;
  const bob = moving ? -Math.abs(Math.sin(cyc*Math.PI*2))*1.5 : Math.sin(Date.now()/650)*0.6;

  c.save();
  c.fillStyle = 'rgba(0,0,0,.30)';
  c.beginPath(); c.ellipse(cx, sy+ts*0.86, ts*0.28*s, ts*0.10, 0, 0, Math.PI*2); c.fill();

  const bodyW = ts*0.40*s, bodyH = ts*0.32*s, bodyTop = sy+ts*0.46+bob;
  const hr = ts*0.175*s, hx = cx, hy = sy+ts*0.36+bob;
  const legY = bodyTop + bodyH - 1;
  const lof = moving ? (frame? -1.6:1.6) : 0;
  const rof = moving ? (frame? 1.6:-1.6) : 0;

  // pernas (bermuda) + canelas (pele)
  c.fillStyle = shortc;
  c.fillRect(cx-ts*0.12*s, legY+lof, ts*0.095*s, ts*0.12*s);
  c.fillRect(cx+ts*0.025*s, legY+rof, ts*0.095*s, ts*0.12*s);
  c.fillStyle = skinD;
  c.fillRect(cx-ts*0.115*s, legY+lof+ts*0.115*s, ts*0.085*s, ts*0.045*s);
  c.fillRect(cx+ts*0.03*s, legY+rof+ts*0.115*s, ts*0.085*s, ts*0.045*s);

  // arma na mao (lado conforme direção), atras do torso
  drawThugWeapon(c, cx, bodyTop, bodyW, ts, s, big, facing, frame, moving);

  // torso (regata)
  c.fillStyle = tank;
  roundRect(c, cx-bodyW/2, bodyTop, bodyW, bodyH, 3); c.fill();
  // braços expostos (pele)
  c.fillStyle = skin;
  c.fillRect(cx-bodyW/2-ts*0.028*s, bodyTop+2, ts*0.05*s, bodyH*0.66);
  c.fillRect(cx+bodyW/2-ts*0.022*s, bodyTop+2, ts*0.05*s, bodyH*0.66);
  // corrente de ouro do traficante
  if(big){
    c.strokeStyle = '#f4d06a'; c.lineWidth = 1.4;
    c.beginPath(); c.arc(hx, bodyTop+3, bodyW*0.30, 0.18*Math.PI, 0.82*Math.PI); c.stroke();
  }

  // cabeça
  c.fillStyle = skin;
  c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI*2); c.fill();
  // cabelo curto
  c.fillStyle = hair;
  c.beginPath(); c.arc(hx, hy-hr*0.15, hr*0.97, Math.PI, 0); c.fill();
  c.fillRect(hx-hr*0.97, hy-hr*0.15-1, hr*1.94, 2);

  if(!big){
    // boné da cria, com aba pra direção
    c.fillStyle = shade(tank, -0.18);
    c.beginPath(); c.arc(hx, hy-hr*0.30, hr*0.95, Math.PI, 0); c.fill();
    c.fillRect(hx-hr*0.95, hy-hr*0.30, hr*1.9, 2);
    const abaX = facing==='left' ? hx-hr*1.6 : (facing==='right' ? hx+hr*0.6 : hx-hr*0.5);
    c.fillRect(abaX, hy-hr*0.5, hr*1.0, 2.5);
  } else {
    // bandana vermelha do traficante
    c.fillStyle = '#a6342f';
    c.fillRect(hx-hr*0.97, hy-hr*0.46, hr*1.94, hr*0.5);
    c.fillRect(hx-hr*0.2, hy-hr*0.12, hr*0.4, hr*0.34);
  }

  // olhos conforme direção
  c.fillStyle = '#120c10'; const ey = hy + hr*0.10;
  if(facing==='up'){ /* nuca: sem olhos */ }
  else if(facing==='left'){ c.fillRect(hx-hr*0.5, ey, 2, 2); }
  else if(facing==='right'){ c.fillRect(hx+hr*0.32, ey, 2, 2); }
  else { c.fillRect(hx-hr*0.46, ey, 2, 2); c.fillRect(hx+hr*0.24, ey, 2, 2); }
  c.restore();

  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawThugWeapon(c, cx, bodyTop, bodyW, ts, s, big, facing, frame, moving){
  const side = (facing === 'left') ? -1 : 1;     // mão direita por padrão; espelha à esquerda
  const hx = cx + side*(bodyW*0.5 + ts*0.05*s);
  const hyo = moving ? (frame? -1.2:1.2) : 0;
  const hy = bodyTop + ts*0.07*s + hyo;
  c.save();
  c.translate(hx, hy);
  c.scale(side, 1);
  if(big){
    // marreta: cabo + cabeça de metal apoiada no ombro
    c.strokeStyle = '#6b4a2a'; c.lineWidth = 2.6*s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, ts*0.12*s); c.lineTo(ts*0.02*s, -ts*0.22*s); c.stroke();
    c.fillStyle = '#4a4550';
    roundRect(c, -ts*0.035*s, -ts*0.32*s, ts*0.13*s, ts*0.12*s, 2); c.fill();
    c.fillStyle = '#5d5865';
    c.fillRect(-ts*0.035*s, -ts*0.32*s, ts*0.045*s, ts*0.12*s);
  } else {
    // facão: cabo curto + lâmina prateada
    c.strokeStyle = '#3a2a1c'; c.lineWidth = 2.3*s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, ts*0.12*s); c.lineTo(0, ts*0.01*s); c.stroke();
    c.fillStyle = '#cdd2da';
    c.beginPath();
    c.moveTo(-ts*0.012*s, ts*0.01*s);
    c.lineTo(ts*0.055*s, -ts*0.24*s);
    c.lineTo(ts*0.095*s, -ts*0.22*s);
    c.lineTo(ts*0.03*s, ts*0.01*s);
    c.closePath(); c.fill();
    c.strokeStyle = '#9aa0aa'; c.lineWidth = 0.6; c.stroke();
  }
  c.restore();
}

// Maurão da Sapo: o patrão. Maior, correntões de ouro, grill, boné dourado de aba
// reta, marreta numa mão e microfone na outra, aura dourada (vermelha na fúria).
function drawBoss(c, sx, sy, ts, p){
  const s = 1.4;
  const enraged = !!p._enraged;
  const skin = '#5a3722', skinD = shade(skin, -0.32);
  const tank = enraged ? '#5a1e1e' : '#2b2230';
  const shortc = '#1d1726';
  const cx = sx + ts/2;
  const facing = p.facing || 'down';
  const moving = !!p._moving;
  const cyc = ((p.walk||0) % WALK_CYCLE) / WALK_CYCLE;
  const frame = cyc < 0.5 ? 0 : 1;
  const bob = moving ? -Math.abs(Math.sin(cyc*Math.PI*2))*1.6 : Math.sin(Date.now()/600)*0.8;

  c.save();
  const pulse = enraged ? (0.30 + 0.12*Math.abs(Math.sin(Date.now()/220))) : 0.28;
  const aur = c.createRadialGradient(cx, sy+ts*0.5, ts*0.18, cx, sy+ts*0.5, ts*0.95);
  aur.addColorStop(0, (enraged ? 'rgba(255,70,40,' : 'rgba(244,200,80,') + pulse + ')');
  aur.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = aur; c.fillRect(sx-ts*0.5, sy-ts*0.5, ts*2, ts*2);
  c.fillStyle = 'rgba(0,0,0,.34)';
  c.beginPath(); c.ellipse(cx, sy+ts*0.88, ts*0.34*s, ts*0.11, 0, 0, Math.PI*2); c.fill();

  const bodyW = ts*0.46*s, bodyH = ts*0.34*s, bodyTop = sy+ts*0.46+bob;
  const hr = ts*0.19*s, hx = cx, hy = sy+ts*0.35+bob;
  const legY = bodyTop + bodyH - 1;
  const lof = moving ? (frame? -1.7:1.7) : 0, rof = moving ? (frame? 1.7:-1.7) : 0;

  c.fillStyle = shortc;
  c.fillRect(cx-ts*0.13*s, legY+lof, ts*0.1*s, ts*0.13*s);
  c.fillRect(cx+ts*0.03*s, legY+rof, ts*0.1*s, ts*0.13*s);
  c.fillStyle = skinD;
  c.fillRect(cx-ts*0.125*s, legY+lof+ts*0.12*s, ts*0.09*s, ts*0.05*s);
  c.fillRect(cx+ts*0.035*s, legY+rof+ts*0.12*s, ts*0.09*s, ts*0.05*s);

  drawThugWeapon(c, cx, bodyTop, bodyW, ts, s, true, facing, frame, moving);  // marreta
  drawMic(c, cx, bodyTop, bodyW, ts, s, facing);                              // microfone

  c.fillStyle = tank; roundRect(c, cx-bodyW/2, bodyTop, bodyW, bodyH, 3); c.fill();
  c.fillStyle = skin;
  c.fillRect(cx-bodyW/2-ts*0.03*s, bodyTop+2, ts*0.06*s, bodyH*0.7);
  c.fillRect(cx+bodyW/2-ts*0.03*s, bodyTop+2, ts*0.06*s, bodyH*0.7);
  c.strokeStyle = '#f4d06a'; c.lineWidth = 1.8;                              // correntões
  c.beginPath(); c.arc(hx, bodyTop+3, bodyW*0.32, 0.15*Math.PI, 0.85*Math.PI); c.stroke();
  c.lineWidth = 1.3; c.beginPath(); c.arc(hx, bodyTop+6, bodyW*0.22, 0.2*Math.PI, 0.8*Math.PI); c.stroke();
  c.fillStyle = '#ffe08a'; c.fillRect(hx-1.5, bodyTop+bodyW*0.30, 3, 4);

  c.fillStyle = skin; c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI*2); c.fill();
  if(facing !== 'up'){ c.fillStyle = '#f4d06a'; c.fillRect(hx-hr*0.32, hy+hr*0.42, hr*0.64, 2.4); }  // grill
  c.fillStyle = '#150d13'; c.beginPath(); c.arc(hx, hy-hr*0.18, hr*0.97, Math.PI, 0); c.fill();
  c.fillRect(hx-hr*0.97, hy-hr*0.18-1, hr*1.94, 2);
  const cap = enraged ? '#7a2420' : '#caa23a';                               // boné dourado
  c.fillStyle = cap; c.beginPath(); c.arc(hx, hy-hr*0.32, hr*0.98, Math.PI, 0); c.fill();
  c.fillRect(hx-hr*0.98, hy-hr*0.32, hr*1.96, 2.5);
  const abaX = facing==='left' ? hx-hr*1.7 : (facing==='right' ? hx+hr*0.7 : hx-hr*0.55);
  c.fillStyle = shade(cap, -0.12); c.fillRect(abaX, hy-hr*0.55, hr*1.1, 3);
  c.fillStyle = enraged ? '#ff5a3a' : '#120c10'; const ey = hy+hr*0.08;
  if(facing==='up'){ }
  else if(facing==='left'){ c.fillRect(hx-hr*0.5, ey, 2.4, 2.4); }
  else if(facing==='right'){ c.fillRect(hx+hr*0.3, ey, 2.4, 2.4); }
  else { c.fillRect(hx-hr*0.48, ey, 2.4, 2.4); c.fillRect(hx+hr*0.22, ey, 2.4, 2.4); }
  c.restore();

  c.save();
  c.font = '800 8px Cinzel, serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
  const tw = c.measureText('PATRÃO').width + 8, tagY = sy - 12;
  c.fillStyle = 'rgba(20,14,6,0.92)'; roundRect(c, cx-tw/2, tagY-11, tw, 11, 3); c.fill();
  c.fillStyle = '#f4d06a'; c.fillText('PATRÃO', cx, tagY-1.5);
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawMic(c, cx, bodyTop, bodyW, ts, s, facing){
  const side = (facing === 'left') ? 1 : -1;     // mão oposta à da marreta
  const hx = cx + side*(bodyW*0.5 + ts*0.05*s), hy = bodyTop + ts*0.07*s;
  c.save(); c.translate(hx, hy); c.scale(side, 1);
  c.strokeStyle = '#2a2530'; c.lineWidth = 2*s; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, ts*0.1*s); c.lineTo(0, -ts*0.07*s); c.stroke();
  c.fillStyle = '#3a3540'; c.beginPath(); c.arc(0, -ts*0.12*s, ts*0.06*s, 0, Math.PI*2); c.fill();
  c.fillStyle = '#9aa0aa'; c.beginPath(); c.arc(0, -ts*0.12*s, ts*0.034*s, 0, Math.PI*2); c.fill();
  c.restore();
}

// ---- bichos do Descampado (quadrúpedes vistos de cima, orientados pela direção) ----
const BEAST = {
  rato_gigante: {body:'#6f6a62', belly:'#8c877e', size:0.60, ear:'round', tail:'rat',  snout:'#b08f86', tusk:false, bristle:false},
  lobo:         {body:'#7c7f88', belly:'#9aa0a8', size:0.86, ear:'point', tail:'bush', snout:'#5a5d66', tusk:false, bristle:false},
  lobo_negro:   {body:'#26242e', belly:'#3a3744', size:0.92, ear:'point', tail:'bush', snout:'#15131b', tusk:false, bristle:true},
  javali:       {body:'#5a4632', belly:'#6e573e', size:0.84, ear:'point', tail:'tuft', snout:'#3a2c1e', tusk:true,  bristle:true},
  hiena_ermo:   {body:'#9a8458', belly:'#b5a070', size:0.82, ear:'point', tail:'tuft', snout:'#5a4a30', tusk:false, bristle:true},
  urso:         {body:'#6b4a32', belly:'#856448', size:1.34, ear:'round', tail:'tuft', snout:'#3a2a1c', tusk:false, bristle:false},
  mainecoon:    {body:'#e8e0cf', belly:'#f6f0e2', size:1.04, ear:'point', tail:'bush', snout:'#caa86a', tusk:false, bristle:false},
};
function _dirVec(f){ return f==='up'?[0,-1] : f==='down'?[0,1] : f==='left'?[-1,0] : [1,0]; }

function drawBeast(c, sx, sy, ts, p){
  const boss = (p.mtype === 'velho_bob');
  const base = boss
    ? {body:'#6b6258', belly:'#7d756a', size:1.18, ear:'point', tail:'tuft', snout:'#2e2620', tusk:true, bristle:true}
    : (BEAST[p.mtype] || BEAST.javali);
  const enraged = !!p._enraged;
  const s = base.size;
  const cx = sx + ts/2, cy0 = sy + ts*0.54;
  const d = _dirVec(p.facing || 'down'); const fx = d[0], fy = d[1];
  const px = -fy, py = fx;
  const moving = !!p._moving;
  const cyc = ((p.walk||0) % WALK_CYCLE) / WALK_CYCLE; const frame = cyc < 0.5 ? 0 : 1;
  const bob = moving ? -Math.abs(Math.sin(cyc*Math.PI*2))*1.2 : Math.sin(Date.now()/700)*0.5;
  const L = ts*0.34*s, Wd = ts*0.22*s;
  const bcx = cx, bcy = cy0 + bob;
  const ang = Math.atan2(fy, fx);

  c.save();
  if(boss && enraged){
    const pulse = 0.28 + 0.12*Math.abs(Math.sin(Date.now()/220));
    const aur = c.createRadialGradient(cx, bcy, ts*0.2, cx, bcy, ts*0.9);
    aur.addColorStop(0, 'rgba(255,80,40,'+pulse+')'); aur.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = aur; c.fillRect(sx-ts*0.5, sy-ts*0.5, ts*2, ts*2);
  }
  c.fillStyle = 'rgba(0,0,0,.30)';
  c.beginPath(); c.ellipse(cx, cy0+ts*0.26, L*0.95, Wd*0.7, 0, 0, Math.PI*2); c.fill();

  // pernas (pares diagonais)
  function leg(along, across, ph){
    const lx = bcx + fx*L*along + px*Wd*across, ly = bcy + fy*L*along + py*Wd*across;
    const sw = moving ? (((frame ^ ph) ? 1 : -1) * 1.8) : 0;
    c.strokeStyle = shade(base.body, -0.45); c.lineWidth = Math.max(2, ts*0.05*s); c.lineCap = 'round';
    c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + fx*sw, ly + fy*sw + ts*0.12*s); c.stroke();
  }
  leg(0.5, 1, 0); leg(0.5, -1, 1); leg(-0.5, 1, 1); leg(-0.5, -1, 0);

  // cauda
  const tlx = bcx - fx*L*1.05, tly = bcy - fy*L*1.05;
  if(base.tail === 'rat'){ c.strokeStyle = base.snout; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(tlx, tly); c.lineTo(tlx - fx*ts*0.3, tly - fy*ts*0.3); c.stroke(); }
  else if(base.tail === 'bush'){ c.fillStyle = shade(base.body, -0.1);
    c.beginPath(); c.ellipse(tlx - fx*ts*0.05, tly - fy*ts*0.05, ts*0.1*s, ts*0.06*s, ang, 0, Math.PI*2); c.fill(); }
  else { c.fillStyle = shade(base.body, -0.2); c.fillRect(tlx-1.5, tly-1.5, 3, 3); }

  // corpo
  c.fillStyle = base.body; c.beginPath(); c.ellipse(bcx, bcy, L, Wd, ang, 0, Math.PI*2); c.fill();
  c.fillStyle = base.belly; c.beginPath(); c.ellipse(bcx, bcy-1, L*0.7, Wd*0.6, ang, 0, Math.PI*2); c.fill();
  if(base.bristle){ c.strokeStyle = shade(base.body, -0.4); c.lineWidth = 1;
    for(let i=-2;i<=2;i++){ const hx2 = bcx + px*i*2, hy2 = bcy + py*i*2;
      c.beginPath(); c.moveTo(hx2, hy2); c.lineTo(hx2, hy2-3); c.stroke(); } }

  // cabeça + focinho
  const hx = bcx + fx*L*0.92, hy = bcy + fy*L*0.92, hr = Wd*0.92;
  c.fillStyle = base.body; c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI*2); c.fill();
  const mx = hx + fx*hr*0.9, my = hy + fy*hr*0.9;
  c.fillStyle = base.snout; c.beginPath(); c.ellipse(mx, my, hr*0.5, hr*0.4, ang, 0, Math.PI*2); c.fill();

  // orelhas
  const e1x = hx + px*hr*0.7, e1y = hy + py*hr*0.7, e2x = hx - px*hr*0.7, e2y = hy - py*hr*0.7;
  c.fillStyle = shade(base.body, -0.12);
  if(base.ear === 'point'){
    c.beginPath(); c.moveTo(e1x, e1y); c.lineTo(e1x + px*3 - fx*2, e1y + py*3 - fy*2); c.lineTo(e1x - fx*3, e1y - fy*3); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(e2x, e2y); c.lineTo(e2x - px*3 - fx*2, e2y - py*3 - fy*2); c.lineTo(e2x - fx*3, e2y - fy*3); c.closePath(); c.fill();
  } else {
    c.beginPath(); c.arc(e1x, e1y, hr*0.42, 0, Math.PI*2); c.fill();
    c.beginPath(); c.arc(e2x, e2y, hr*0.42, 0, Math.PI*2); c.fill();
    c.fillStyle = base.snout;
    c.beginPath(); c.arc(e1x, e1y, hr*0.2, 0, Math.PI*2); c.fill();
    c.beginPath(); c.arc(e2x, e2y, hr*0.2, 0, Math.PI*2); c.fill();
  }

  // presas (javali / Bob com uma quebrada)
  if(base.tusk){
    c.fillStyle = '#efe6cf';
    const t1x = mx + px*hr*0.3, t1y = my + py*hr*0.3, t2x = mx - px*hr*0.3, t2y = my - py*hr*0.3;
    c.beginPath(); c.moveTo(t1x, t1y); c.lineTo(t1x + fx*4 - px, t1y + fy*4 - py); c.lineTo(t1x + fx*2, t1y + fy*2); c.closePath(); c.fill();
    const brk = boss ? 0.5 : 1;
    c.beginPath(); c.moveTo(t2x, t2y); c.lineTo(t2x + fx*4*brk + px, t2y + fy*4*brk + py); c.lineTo(t2x + fx*2*brk, t2y + fy*2*brk); c.closePath(); c.fill();
  }

  // olhos
  c.fillStyle = enraged ? '#ff5a3a' : '#15100e';
  const oxx = hx + fx*hr*0.15, oyy = hy + fy*hr*0.15;
  c.beginPath(); c.arc(oxx + px*hr*0.45, oyy + py*hr*0.45, 1.6, 0, Math.PI*2); c.fill();
  c.beginPath(); c.arc(oxx - px*hr*0.45, oyy - py*hr*0.45, 1.6, 0, Math.PI*2); c.fill();

  // crina grisalha + cicatriz do Velho Bob
  if(boss){
    c.strokeStyle = '#9a948a'; c.lineWidth = 1.4;
    for(let i=-2;i<=2;i++){ const cxx = bcx + px*i*3 - fx*L*0.2, cyy = bcy + py*i*3 - fy*L*0.2;
      c.beginPath(); c.moveTo(cxx, cyy); c.lineTo(cxx - fx*4, cyy - fy*4); c.stroke(); }
    c.strokeStyle = '#3a241c'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(hx - px*hr*0.6, hy - py*hr*0.6); c.lineTo(hx + px*hr*0.2, hy + py*hr*0.2 + 2); c.stroke();
  }
  c.restore();

  if(boss){
    c.save(); c.font = '800 8px Cinzel, serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
    const tw = c.measureText('PATRIARCA').width + 8, tagY = sy - 12;
    c.fillStyle = 'rgba(20,16,8,0.92)'; roundRect(c, cx-tw/2, tagY-11, tw, 11, 3); c.fill();
    c.fillStyle = '#d9cba0'; c.fillText('PATRIARCA', cx, tagY-1.5); c.restore();
  }
  drawMonsterBarName(c, sx, sy, ts, p);
}
function drawVarth(c, sx, sy, ts, p){
  const N = p.size || 4;
  const span = N*ts;
  const cx = sx + ts*0.5, cy = sy + ts*0.5;
  const R = span*0.42;
  const moving = !!p._moving;
  const accent = '#8a4ad0';
  const bob = moving ? Math.sin(((p.walk||0)/WALK_CYCLE)*Math.PI*2)*3 : Math.sin(Date.now()/700)*1.6;
  if(typeof _deityAura === 'function') _deityAura(c, cx, cy+bob, R, accent, moving);
  c.save(); c.translate(cx, cy+bob);
  drawValdrisGod(c, R, accent);                 // corpo de feiticeiro/necromante (4x4)
  c.restore();
  drawMonsterBarName(c, cx - ts/2, cy - R - 4, ts, p);   // nome + barra acima da figura
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
  else if(p.form === 'dwarf')     drawBragorGod(c, R, accent);
  else if(p.form === 'cat_black') drawJoseGod(c, R, accent);
  else if(p.form === 'hare')      drawNhareGod(c, R, accent);
  else if(p.form === 'orc')       drawKorgathGod(c, R, accent);
  else if(p.form === 'jaguar')    drawFacalanGod(c, R, accent);
  else if(p.form === 'dragon')    drawDrazunGod(c, R, accent);
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

// --- Bragor: o Forjador anao, martelo e barba trancada ---
function drawBragorGod(c, R, accent){
  const S = R;
  c.save(); c.globalAlpha = 0.25; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0,S*0.95,S*0.5,S*0.14,0,0,Math.PI*2); c.fill(); c.restore();
  c.fillStyle = '#3a2a1e';                                   // pernas curtas
  c.fillRect(-S*0.28,S*0.45,S*0.22,S*0.45); c.fillRect(S*0.06,S*0.45,S*0.22,S*0.45);
  c.fillStyle = '#241810'; c.fillRect(-S*0.3,S*0.82,S*0.26,S*0.1); c.fillRect(S*0.04,S*0.82,S*0.26,S*0.1);
  c.fillStyle = '#4a3324';                                   // corpo robusto
  c.beginPath(); c.moveTo(-S*0.42,-S*0.2); c.lineTo(S*0.42,-S*0.2); c.lineTo(S*0.5,S*0.5); c.lineTo(-S*0.5,S*0.5); c.closePath(); c.fill();
  c.fillStyle = '#5a3a20';                                   // avental de couro
  c.beginPath(); c.moveTo(-S*0.26,-S*0.12); c.lineTo(S*0.26,-S*0.12); c.lineTo(S*0.3,S*0.48); c.lineTo(-S*0.3,S*0.48); c.closePath(); c.fill();
  c.strokeStyle = '#3a2414'; c.lineWidth = Math.max(1,S*0.02);
  c.beginPath(); c.moveTo(0,-S*0.1); c.lineTo(0,S*0.46); c.stroke();
  c.fillStyle = '#caa15a';                                   // rebites
  for(const yy of [0.05,0.2,0.35]){ c.beginPath(); c.arc(-S*0.18,S*yy,S*0.02,0,Math.PI*2); c.arc(S*0.18,S*yy,S*0.02,0,Math.PI*2); c.fill(); }
  c.fillStyle = '#4a3324';                                   // ombros largos
  c.beginPath(); c.arc(-S*0.4,-S*0.18,S*0.16,0,Math.PI*2); c.arc(S*0.4,-S*0.18,S*0.16,0,Math.PI*2); c.fill();
  c.fillStyle = '#d8a574';                                   // cabeca
  c.beginPath(); c.arc(0,-S*0.4,S*0.22,0,Math.PI*2); c.fill();
  c.fillStyle = '#6a4a2a';                                   // cabelo lateral
  c.beginPath(); c.arc(0,-S*0.46,S*0.24,Math.PI*1.05,Math.PI*1.95); c.fill();
  c.fillStyle = '#c8956a'; c.beginPath(); c.ellipse(0,-S*0.36,S*0.05,S*0.06,0,0,Math.PI*2); c.fill();  // nariz
  c.fillStyle = '#2a1a10'; c.beginPath(); c.arc(-S*0.08,-S*0.42,S*0.025,0,Math.PI*2); c.arc(S*0.08,-S*0.42,S*0.025,0,Math.PI*2); c.fill();
  c.strokeStyle = '#5a3a1e'; c.lineWidth = Math.max(2,S*0.04);
  c.beginPath(); c.moveTo(-S*0.13,-S*0.47); c.lineTo(-S*0.03,-S*0.46); c.moveTo(S*0.13,-S*0.47); c.lineTo(S*0.03,-S*0.46); c.stroke();
  c.fillStyle = '#6a4a2a';                                   // BARBA trancada
  c.beginPath(); c.moveTo(-S*0.2,-S*0.3); c.quadraticCurveTo(-S*0.24,S*0.1,-S*0.1,S*0.16);
  c.lineTo(S*0.1,S*0.16); c.quadraticCurveTo(S*0.24,S*0.1,S*0.2,-S*0.3);
  c.quadraticCurveTo(0,-S*0.12,-S*0.2,-S*0.3); c.closePath(); c.fill();
  c.strokeStyle = '#523818'; c.lineWidth = Math.max(1,S*0.02);
  c.beginPath(); c.moveTo(-S*0.1,-S*0.1); c.lineTo(-S*0.1,S*0.14); c.moveTo(S*0.1,-S*0.1); c.lineTo(S*0.1,S*0.14); c.stroke();
  c.fillStyle = '#caa15a'; c.beginPath(); c.arc(-S*0.1,S*0.13,S*0.025,0,Math.PI*2); c.arc(S*0.1,S*0.13,S*0.025,0,Math.PI*2); c.fill();
  c.strokeStyle = '#3a2414'; c.lineWidth = Math.max(2,S*0.05);  // cabo do martelo
  c.beginPath(); c.moveTo(S*0.42,S*0.0); c.lineTo(S*0.6,S*0.4); c.stroke();
  c.fillStyle = '#4a4550'; c.fillRect(S*0.5,-S*0.12,S*0.22,S*0.16);
  c.fillStyle = '#5e5868'; c.fillRect(S*0.5,-S*0.12,S*0.22,4);
}

// --- Jose: o gato preto Mestre Cuscuz, sorriso cheshire e fumaca roxa ---
function drawJoseGod(c, R, accent){
  const S = R;
  c.save(); c.globalAlpha = 0.28; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0,S*0.92,S*0.48,S*0.13,0,0,Math.PI*2); c.fill(); c.restore();
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.25;  // fumaca roxa
  for(const sx of [-1,1]){ const g=c.createRadialGradient(sx*S*0.4,-S*0.2,1,sx*S*0.4,-S*0.2,S*0.4);
    g.addColorStop(0,accent); g.addColorStop(1,'rgba(0,0,0,0)'); c.fillStyle=g;
    c.beginPath(); c.arc(sx*S*0.4,-S*0.2,S*0.4,0,Math.PI*2); c.fill(); } c.restore();
  const black = '#161018', edge = '#2a2030';
  c.fillStyle = black;                                       // cauda enrolada
  c.beginPath(); c.moveTo(S*0.35,S*0.5); c.quadraticCurveTo(S*0.85,S*0.4,S*0.7,-S*0.1);
  c.quadraticCurveTo(S*0.62,S*0.2,S*0.3,S*0.55); c.closePath(); c.fill();
  c.beginPath(); c.ellipse(0,S*0.4,S*0.4,S*0.5,0,0,Math.PI*2); c.fill();   // corpo
  c.fillRect(-S*0.16,S*0.6,S*0.12,S*0.3); c.fillRect(S*0.04,S*0.6,S*0.12,S*0.3);
  c.fillStyle = edge; c.beginPath(); c.ellipse(-S*0.1,S*0.9,S*0.08,S*0.04,0,0,Math.PI*2); c.ellipse(S*0.1,S*0.9,S*0.08,S*0.04,0,0,Math.PI*2); c.fill();
  c.fillStyle = black;                                       // cabeca
  c.beginPath(); c.ellipse(0,-S*0.3,S*0.32,S*0.3,0,0,Math.PI*2); c.fill();
  c.beginPath(); c.moveTo(-S*0.28,-S*0.46); c.lineTo(-S*0.34,-S*0.74); c.lineTo(-S*0.1,-S*0.52); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.28,-S*0.46); c.lineTo(S*0.34,-S*0.74); c.lineTo(S*0.1,-S*0.52); c.closePath(); c.fill();
  c.fillStyle = '#3a2d44';
  c.beginPath(); c.moveTo(-S*0.26,-S*0.5); c.lineTo(-S*0.3,-S*0.66); c.lineTo(-S*0.16,-S*0.54); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.26,-S*0.5); c.lineTo(S*0.3,-S*0.66); c.lineTo(S*0.16,-S*0.54); c.closePath(); c.fill();
  for(const s of [-1,1]){ const ex=s*S*0.13;                 // olhos cheshire
    c.save(); c.globalCompositeOperation='lighter';
    const g=c.createRadialGradient(ex,-S*0.32,0,ex,-S*0.32,S*0.1);
    g.addColorStop(0,'#fff'); g.addColorStop(0.4,accent); g.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=g; c.beginPath(); c.ellipse(ex,-S*0.32,S*0.08,S*0.06,0,0,Math.PI*2); c.fill(); c.restore();
    c.fillStyle='#1a0a2a'; c.beginPath(); c.ellipse(ex,-S*0.32,S*0.015,S*0.05,0,0,Math.PI*2); c.fill();
  }
  c.fillStyle = '#e8d0e0'; c.beginPath(); c.ellipse(0,-S*0.18,S*0.06,S*0.04,0,0,Math.PI*2); c.fill();
  c.strokeStyle = '#caa15a'; c.lineWidth = Math.max(1.5,S*0.025);  // sorriso largo
  c.beginPath(); c.arc(0,-S*0.24,S*0.16,Math.PI*0.15,Math.PI*0.85); c.stroke();
  c.fillStyle = '#fff';                                      // dentinhos
  c.beginPath(); c.moveTo(-S*0.06,-S*0.12); c.lineTo(-S*0.03,-S*0.08); c.lineTo(0,-S*0.12); c.lineTo(S*0.03,-S*0.08); c.lineTo(S*0.06,-S*0.12); c.fill();
  c.strokeStyle = 'rgba(220,210,230,0.6)'; c.lineWidth = 1;  // bigodes
  c.beginPath(); c.moveTo(-S*0.06,-S*0.18); c.lineTo(-S*0.3,-S*0.22); c.moveTo(-S*0.06,-S*0.16); c.lineTo(-S*0.3,-S*0.14);
  c.moveTo(S*0.06,-S*0.18); c.lineTo(S*0.3,-S*0.22); c.moveTo(S*0.06,-S*0.16); c.lineTo(S*0.3,-S*0.14); c.stroke();
}

// --- Nhare: a Lebre de Mil Saidas, orelhas longas e olhar calmo ---
function drawNhareGod(c, R, accent){
  const S = R;
  c.save(); c.globalAlpha = 0.22; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0,S*0.94,S*0.42,S*0.12,0,0,Math.PI*2); c.fill(); c.restore();
  const fur = '#d8dce0', furD = '#a8b0b8', furW = '#eef2f4';
  c.fillStyle = furD; c.beginPath(); c.ellipse(-S*0.05,S*0.65,S*0.32,S*0.2,0.2,0,Math.PI*2); c.fill();  // pata traseira
  c.fillStyle = fur; c.beginPath(); c.ellipse(0,S*0.32,S*0.36,S*0.46,0.08,0,Math.PI*2); c.fill();        // corpo
  c.fillStyle = furW; c.beginPath(); c.ellipse(-S*0.06,S*0.3,S*0.22,S*0.34,0.08,0,Math.PI*2); c.fill();   // barriga
  c.fillStyle = fur; c.fillRect(-S*0.14,S*0.5,S*0.1,S*0.32); c.fillRect(S*0.04,S*0.52,S*0.1,S*0.3);
  c.fillStyle = furW; c.beginPath(); c.ellipse(-S*0.09,S*0.82,S*0.06,S*0.04,0,0,Math.PI*2); c.ellipse(S*0.09,S*0.82,S*0.06,S*0.04,0,0,Math.PI*2); c.fill();
  c.fillStyle = fur; c.beginPath(); c.ellipse(S*0.04,-S*0.28,S*0.26,S*0.28,0.1,0,Math.PI*2); c.fill();    // cabeca
  c.fillStyle = furW; c.beginPath(); c.ellipse(S*0.12,-S*0.18,S*0.14,S*0.14,0,0,Math.PI*2); c.fill();
  c.fillStyle = fur;                                         // ORELHA ereta
  c.save(); c.translate(-S*0.08,-S*0.5); c.rotate(-0.15);
  c.beginPath(); c.ellipse(0,-S*0.3,S*0.09,S*0.36,0,0,Math.PI*2); c.fill();
  c.fillStyle = '#e8b0c0'; c.beginPath(); c.ellipse(0,-S*0.3,S*0.045,S*0.28,0,0,Math.PI*2); c.fill(); c.restore();
  c.fillStyle = fur;                                         // ORELHA dobrada
  c.save(); c.translate(S*0.2,-S*0.5); c.rotate(0.4);
  c.beginPath(); c.ellipse(0,-S*0.28,S*0.085,S*0.34,0,0,Math.PI*2); c.fill();
  c.fillStyle = '#e8b0c0'; c.beginPath(); c.ellipse(0,-S*0.28,S*0.04,S*0.26,0,0,Math.PI*2); c.fill(); c.restore();
  c.fillStyle = '#2a2a30'; c.beginPath(); c.arc(S*0.12,-S*0.3,S*0.055,0,Math.PI*2); c.fill();  // olho calmo
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = accent; c.globalAlpha = 0.5;
  c.beginPath(); c.arc(S*0.12,-S*0.3,S*0.07,0,Math.PI*2); c.fill(); c.restore();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(S*0.14,-S*0.32,S*0.02,0,Math.PI*2); c.fill();
  c.fillStyle = '#d08a9a'; c.beginPath(); c.ellipse(S*0.2,-S*0.17,S*0.03,S*0.025,0,0,Math.PI*2); c.fill();  // nariz
  c.strokeStyle = 'rgba(150,150,160,0.6)'; c.lineWidth = 1;  // bigodes
  c.beginPath(); c.moveTo(S*0.2,-S*0.16); c.lineTo(S*0.45,-S*0.2); c.moveTo(S*0.2,-S*0.14); c.lineTo(S*0.45,-S*0.12); c.stroke();
}

// --- Korgath: o Punho, orc de guerra com presas e machado ---
function drawKorgathGod(c, R, accent){
  const S = R, skin = '#5a7a48', skinD = '#46603a';
  c.save(); c.globalAlpha = 0.28; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0,S*0.95,S*0.5,S*0.14,0,0,Math.PI*2); c.fill(); c.restore();
  c.fillStyle = '#3a2e22'; c.fillRect(-S*0.26,S*0.4,S*0.2,S*0.5); c.fillRect(S*0.06,S*0.4,S*0.2,S*0.5);
  c.fillStyle = '#241a12'; c.fillRect(-S*0.28,S*0.82,S*0.24,S*0.1); c.fillRect(S*0.04,S*0.82,S*0.24,S*0.1);
  c.fillStyle = skin;                                       // torso
  c.beginPath(); c.moveTo(-S*0.46,-S*0.16); c.lineTo(S*0.46,-S*0.16); c.lineTo(S*0.38,S*0.46); c.lineTo(-S*0.38,S*0.46); c.closePath(); c.fill();
  c.fillStyle = skinD; c.beginPath(); c.arc(-S*0.18,S*0.02,S*0.16,0,Math.PI*2); c.arc(S*0.18,S*0.02,S*0.16,0,Math.PI*2); c.fill();
  c.fillStyle = skin; c.beginPath(); c.arc(-S*0.18,-S*0.02,S*0.15,0,Math.PI*2); c.arc(S*0.18,-S*0.02,S*0.15,0,Math.PI*2); c.fill();
  c.fillStyle = '#3a2e22'; c.fillRect(-S*0.4,S*0.34,S*0.8,S*0.12);
  c.fillStyle = '#6a5038'; c.fillRect(-S*0.08,S*0.34,S*0.16,S*0.18);
  c.fillStyle = skin; c.beginPath(); c.arc(-S*0.44,-S*0.14,S*0.18,0,Math.PI*2); c.arc(S*0.44,-S*0.14,S*0.18,0,Math.PI*2); c.fill();
  c.fillRect(-S*0.6,-S*0.12,S*0.16,S*0.4); c.fillRect(S*0.44,-S*0.12,S*0.16,S*0.4);  // bracos
  c.fillStyle = skinD; c.beginPath(); c.arc(-S*0.52,S*0.3,S*0.13,0,Math.PI*2); c.fill();  // PUNHO
  c.strokeStyle = '#3a2414'; c.lineWidth = Math.max(2,S*0.05);  // machado
  c.beginPath(); c.moveTo(S*0.52,-S*0.1); c.lineTo(S*0.52,S*0.5); c.stroke();
  c.fillStyle = '#5e5868';
  c.beginPath(); c.moveTo(S*0.52,-S*0.1); c.quadraticCurveTo(S*0.86,-S*0.18,S*0.8,S*0.06); c.quadraticCurveTo(S*0.66,S*0.0,S*0.52,S*0.1); c.closePath(); c.fill();
  c.fillStyle = '#7a7488'; c.beginPath(); c.moveTo(S*0.52,-S*0.06); c.quadraticCurveTo(S*0.78,-S*0.12,S*0.74,S*0.0); c.lineTo(S*0.52,S*0.04); c.closePath(); c.fill();
  c.fillStyle = skin; c.beginPath(); c.arc(0,-S*0.36,S*0.22,0,Math.PI*2); c.fill();  // cabeca
  c.fillStyle = skinD; c.beginPath(); c.ellipse(0,-S*0.26,S*0.18,S*0.12,0,0,Math.PI*2); c.fill();
  c.fillStyle = '#f0ead8';                                  // PRESAS
  c.beginPath(); c.moveTo(-S*0.1,-S*0.2); c.lineTo(-S*0.07,-S*0.32); c.lineTo(-S*0.04,-S*0.2); c.closePath();
  c.moveTo(S*0.1,-S*0.2); c.lineTo(S*0.07,-S*0.32); c.lineTo(S*0.04,-S*0.2); c.fill();
  c.save(); c.globalCompositeOperation = 'lighter';         // olhos ferozes
  for(const s of [-1,1]){ const g=c.createRadialGradient(s*S*0.09,-S*0.42,0,s*S*0.09,-S*0.42,S*0.06);
    g.addColorStop(0,'#fff'); g.addColorStop(0.4,accent); g.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=g; c.beginPath(); c.arc(s*S*0.09,-S*0.42,S*0.05,0,Math.PI*2); c.fill(); }
  c.restore();
  c.fillStyle = '#2a1010'; c.beginPath(); c.arc(-S*0.09,-S*0.42,S*0.02,0,Math.PI*2); c.arc(S*0.09,-S*0.42,S*0.02,0,Math.PI*2); c.fill();
  c.strokeStyle = skinD; c.lineWidth = Math.max(2,S*0.04);
  c.beginPath(); c.moveTo(-S*0.16,-S*0.5); c.lineTo(-S*0.02,-S*0.47); c.moveTo(S*0.16,-S*0.5); c.lineTo(S*0.02,-S*0.47); c.stroke();
  c.fillStyle = '#2a2018'; c.fillRect(-S*0.04,-S*0.62,S*0.08,S*0.18);  // moicano
  c.strokeStyle = accent; c.lineWidth = Math.max(1,S*0.02);  // pintura de guerra
  c.beginPath(); c.moveTo(-S*0.16,-S*0.34); c.lineTo(-S*0.06,-S*0.34); c.moveTo(S*0.16,-S*0.34); c.lineTo(S*0.06,-S*0.34); c.stroke();
}

// --- Facalan: a Onca Sem Dono, jaguar de olhos amarelos e rosetas ---
function drawFacalanGod(c, R, accent){
  const S = R, fur = '#d9a441', furD = '#b8842e', furL = '#ecca78';
  c.save(); c.globalAlpha = 0.26; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0,S*0.9,S*0.55,S*0.13,0,0,Math.PI*2); c.fill(); c.restore();
  c.fillStyle = fur;                                        // cauda longa
  c.beginPath(); c.moveTo(S*0.4,S*0.5); c.quadraticCurveTo(S*0.9,S*0.45,S*0.8,-S*0.05);
  c.quadraticCurveTo(S*0.72,S*0.3,S*0.34,S*0.55); c.closePath(); c.fill();
  c.beginPath(); c.ellipse(0,S*0.42,S*0.46,S*0.32,0,0,Math.PI*2); c.fill();   // corpo
  c.fillStyle = furL; c.beginPath(); c.ellipse(0,S*0.52,S*0.36,S*0.18,0,0,Math.PI*2); c.fill();
  c.fillStyle = furD; c.fillRect(-S*0.34,S*0.55,S*0.14,S*0.35); c.fillRect(S*0.2,S*0.55,S*0.14,S*0.35);
  c.fillStyle = fur; c.fillRect(-S*0.14,S*0.58,S*0.12,S*0.32); c.fillRect(S*0.02,S*0.58,S*0.12,S*0.32);
  c.fillStyle = furD;                                       // rosetas
  for(const rc of [[-0.25,0.35],[-0.05,0.28],[0.18,0.36],[0.3,0.5],[-0.3,0.5],[0.05,0.5],[-0.15,0.42]]){
    c.beginPath(); c.arc(S*rc[0],S*rc[1],S*0.04,0,Math.PI*2); c.fill(); }
  c.fillStyle = fur; c.beginPath(); c.ellipse(0,-S*0.18,S*0.3,S*0.26,0,0,Math.PI*2); c.fill();  // cabeca
  c.beginPath(); c.arc(-S*0.22,-S*0.38,S*0.1,0,Math.PI*2); c.arc(S*0.22,-S*0.38,S*0.1,0,Math.PI*2); c.fill();
  c.fillStyle = furD; c.beginPath(); c.arc(-S*0.22,-S*0.37,S*0.05,0,Math.PI*2); c.arc(S*0.22,-S*0.37,S*0.05,0,Math.PI*2); c.fill();
  c.fillStyle = furL; c.beginPath(); c.ellipse(0,-S*0.06,S*0.16,S*0.12,0,0,Math.PI*2); c.fill();
  c.save(); c.globalCompositeOperation = 'lighter';         // OLHOS amarelos
  for(const s of [-1,1]){ const g=c.createRadialGradient(s*S*0.12,-S*0.2,0,s*S*0.12,-S*0.2,S*0.09);
    g.addColorStop(0,'#fff'); g.addColorStop(0.35,'#ffe24a'); g.addColorStop(0.7,accent); g.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=g; c.beginPath(); c.ellipse(s*S*0.12,-S*0.2,S*0.08,S*0.06,0,0,Math.PI*2); c.fill(); }
  c.restore();
  c.fillStyle = '#1a1206'; for(const s of [-1,1]){ c.beginPath(); c.ellipse(s*S*0.12,-S*0.2,S*0.018,S*0.05,0,0,Math.PI*2); c.fill(); }
  c.fillStyle = '#2a1810'; c.beginPath(); c.moveTo(-S*0.04,-S*0.04); c.lineTo(S*0.04,-S*0.04); c.lineTo(0,S*0.0); c.closePath(); c.fill();
  c.strokeStyle = '#2a1810'; c.lineWidth = Math.max(1,S*0.02);
  c.beginPath(); c.moveTo(0,S*0.0); c.lineTo(0,S*0.04); c.moveTo(0,S*0.04); c.quadraticCurveTo(-S*0.08,S*0.08,-S*0.12,S*0.04);
  c.moveTo(0,S*0.04); c.quadraticCurveTo(S*0.08,S*0.08,S*0.12,S*0.04); c.stroke();
  c.fillStyle = '#fff'; c.fillRect(-S*0.05,S*0.04,S*0.02,S*0.05); c.fillRect(S*0.03,S*0.04,S*0.02,S*0.05);
  c.strokeStyle = 'rgba(255,250,230,0.7)'; c.lineWidth = 1;  // bigodes
  c.beginPath(); c.moveTo(-S*0.1,-S*0.02); c.lineTo(-S*0.34,-S*0.06); c.moveTo(-S*0.1,0); c.lineTo(-S*0.34,S*0.04);
  c.moveTo(S*0.1,-S*0.02); c.lineTo(S*0.34,-S*0.06); c.moveTo(S*0.1,0); c.lineTo(S*0.34,S*0.04); c.stroke();
}

// --- Drazun: o Dragao Primevo, asas, chifres e olho de fogo ---
function drawDrazunGod(c, R, accent){
  const S = R, scale = '#8a3a1e', scaleD = '#6a2a14', scaleL = '#b04e26', belly = '#d9a441';
  c.save(); c.globalAlpha = 0.3; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0,S*0.95,S*0.6,S*0.15,0,0,Math.PI*2); c.fill(); c.restore();
  c.fillStyle = scaleD;                                     // ASAS
  c.beginPath(); c.moveTo(-S*0.3,-S*0.1); c.lineTo(-S*0.95,-S*0.5); c.lineTo(-S*0.9,S*0.05); c.lineTo(-S*0.7,-S*0.05);
  c.lineTo(-S*0.6,S*0.2); c.lineTo(-S*0.45,S*0.0); c.lineTo(-S*0.35,S*0.25); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.3,-S*0.1); c.lineTo(S*0.95,-S*0.5); c.lineTo(S*0.9,S*0.05); c.lineTo(S*0.7,-S*0.05);
  c.lineTo(S*0.6,S*0.2); c.lineTo(S*0.45,S*0.0); c.lineTo(S*0.35,S*0.25); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,120,60,0.15)';
  c.beginPath(); c.moveTo(-S*0.3,-S*0.1); c.lineTo(-S*0.95,-S*0.5); c.lineTo(-S*0.35,S*0.25); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.3,-S*0.1); c.lineTo(S*0.95,-S*0.5); c.lineTo(S*0.35,S*0.25); c.closePath(); c.fill();
  c.fillStyle = scale; c.beginPath(); c.ellipse(0,S*0.4,S*0.42,S*0.46,0,0,Math.PI*2); c.fill();  // corpo
  c.fillStyle = belly; c.beginPath(); c.ellipse(0,S*0.5,S*0.26,S*0.32,0,0,Math.PI*2); c.fill();
  c.strokeStyle = scaleD; c.lineWidth = Math.max(1,S*0.015);
  for(let i=0;i<4;i++){ c.beginPath(); c.moveTo(-S*0.22,S*0.3+i*S*0.12); c.lineTo(S*0.22,S*0.3+i*S*0.12); c.stroke(); }
  c.fillStyle = scale;                                      // cauda
  c.beginPath(); c.moveTo(S*0.35,S*0.55); c.quadraticCurveTo(S*0.9,S*0.6,S*0.78,S*0.15);
  c.quadraticCurveTo(S*0.7,S*0.5,S*0.3,S*0.6); c.closePath(); c.fill();
  c.fillStyle = scaleL; c.beginPath(); c.moveTo(S*0.78,S*0.15); c.lineTo(S*0.9,S*0.02); c.lineTo(S*0.86,S*0.2); c.closePath(); c.fill();
  c.fillStyle = scaleD;                                     // espinhos dorsais
  for(let i=0;i<5;i++){ const sx=-S*0.3+i*S*0.15; c.beginPath(); c.moveTo(sx,S*0.0); c.lineTo(sx+S*0.05,-S*0.18); c.lineTo(sx+S*0.1,S*0.0); c.closePath(); c.fill(); }
  c.fillStyle = scale; c.beginPath(); c.ellipse(0,-S*0.08,S*0.2,S*0.24,0,0,Math.PI*2); c.fill();  // pescoco
  c.beginPath(); c.ellipse(0,-S*0.4,S*0.24,S*0.2,0,0,Math.PI*2); c.fill();   // cabeca
  c.beginPath(); c.moveTo(-S*0.12,-S*0.44); c.lineTo(-S*0.32,-S*0.38); c.lineTo(-S*0.12,-S*0.3); c.closePath(); c.fill();
  c.fillStyle = scaleL; c.beginPath(); c.ellipse(-S*0.2,-S*0.4,S*0.06,S*0.04,0,0,Math.PI*2); c.fill();
  c.fillStyle = '#3a2a1e';                                  // CHIFRES
  c.beginPath(); c.moveTo(-S*0.16,-S*0.54); c.lineTo(-S*0.28,-S*0.78); c.lineTo(-S*0.08,-S*0.58); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.16,-S*0.54); c.lineTo(S*0.28,-S*0.78); c.lineTo(S*0.08,-S*0.58); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.18,-S*0.46); c.lineTo(S*0.34,-S*0.56); c.lineTo(S*0.16,-S*0.4); c.closePath(); c.fill();
  c.save(); c.globalCompositeOperation = 'lighter';         // OLHO de fogo
  const g=c.createRadialGradient(-S*0.06,-S*0.42,0,-S*0.06,-S*0.42,S*0.12);
  g.addColorStop(0,'#fff'); g.addColorStop(0.3,'#ffd84a'); g.addColorStop(0.6,accent); g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g; c.beginPath(); c.ellipse(-S*0.06,-S*0.42,S*0.09,S*0.07,0,0,Math.PI*2); c.fill(); c.restore();
  c.fillStyle = '#1a0a04'; c.beginPath(); c.ellipse(-S*0.06,-S*0.42,S*0.02,S*0.06,0,0,Math.PI*2); c.fill();
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.3;  // baforada de fogo
  const g2=c.createRadialGradient(-S*0.24,-S*0.36,1,-S*0.24,-S*0.36,S*0.18);
  g2.addColorStop(0,'#ff8a2a'); g2.addColorStop(1,'rgba(0,0,0,0)'); c.fillStyle=g2;
  c.beginPath(); c.arc(-S*0.24,-S*0.36,S*0.16,0,Math.PI*2); c.fill(); c.restore();
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

  const skin = look.skin, cloak = look.cloak;
  const skinDk = shade(skin,-0.16), skinLt = shade(skin,0.15);
  const cloakDk = shade(cloak,-0.30), cloakLt = shade(cloak,0.15);
  const ink = shade(cloak,-0.60);              // contorno escuro derivado da capa
  const hood = cloakDk;

  // sombra no chão (sem balanço)
  c.fillStyle = 'rgba(0,0,0,.26)';
  c.beginPath(); c.ellipse(cx, py+ts*0.87, ts*0.25, ts*0.085, 0, 0, Math.PI*2); c.fill();

  // botas (alternam ao andar) com brilho
  const baseFy = py+ts*0.74 + bob;
  const lf = baseFy + (moving ? (frame ? -1.5 : 1.5) : 0);
  const rf = baseFy + (moving ? (frame ? 1.5 : -1.5) : 0);
  const bootCol = shade(cloak,-0.5);
  c.fillStyle = bootCol;
  roundRect(c, cx-ts*0.16, lf, ts*0.11, ts*0.14, 2); c.fill();
  roundRect(c, cx+ts*0.05, rf, ts*0.11, ts*0.14, 2); c.fill();
  c.fillStyle = shade(bootCol,0.20);
  c.fillRect(cx-ts*0.15, lf+1, ts*0.09, 1.5);
  c.fillRect(cx+ts*0.06, rf+1, ts*0.09, 1.5);

  if(look.staff) drawStaff(c, cx, py, ts, bob);

  const bodyTop = py+ts*0.42 + bob, bodyH = ts*0.40, bodyW = ts*0.44;

  // ---- corpo (capa): preenche, sombreia embaixo, luz no peito, contorno ----
  c.fillStyle = cloak;
  roundRect(c, cx-bodyW/2, bodyTop, bodyW, bodyH, 5); c.fill();
  c.save(); roundRect(c, cx-bodyW/2, bodyTop, bodyW, bodyH, 5); c.clip();
  c.fillStyle = cloakDk; c.fillRect(cx-bodyW/2, bodyTop+bodyH*0.56, bodyW, bodyH*0.44);   // sombra base
  c.fillStyle = cloakLt; c.fillRect(cx-bodyW*0.30, bodyTop+2, bodyW*0.24, bodyH*0.5);     // luz no peito
  c.restore();
  c.strokeStyle = ink; c.lineWidth = 1.4;
  roundRect(c, cx-bodyW/2, bodyTop, bodyW, bodyH, 5); c.stroke();

  // ---- cabeça + pescoço ----
  const hr = ts*0.205, hy = py+ts*0.335 + bob, hx = cx;
  c.fillStyle = skinDk; c.fillRect(hx-ts*0.055, hy+hr*0.52, ts*0.11, ts*0.08);            // pescoço
  c.fillStyle = skin;
  c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI*2); c.fill();
  c.save(); c.beginPath(); c.arc(hx,hy,hr,0,Math.PI*2); c.clip();
  c.fillStyle = skinDk; c.beginPath(); c.ellipse(hx, hy+hr*0.55, hr, hr*0.55, 0, 0, Math.PI*2); c.fill();  // queixo
  c.fillStyle = skinLt; c.beginPath(); c.ellipse(hx-hr*0.30, hy-hr*0.35, hr*0.5, hr*0.4, 0, 0, Math.PI*2); c.fill(); // testa
  c.restore();
  c.strokeStyle = ink; c.lineWidth = 1.2; c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI*2); c.stroke();

  // ---- cabelo / capuz ----
  if(look.hood==='up'){
    c.fillStyle = hood;
    c.beginPath(); c.arc(hx, hy, hr+1.5, Math.PI*0.92, Math.PI*2.08); c.fill();
    c.fillRect(hx-hr-1.5, hy-1, (hr+1.5)*2, 2.5);
    c.strokeStyle = ink; c.lineWidth=1.2; c.beginPath(); c.arc(hx, hy, hr+1.5, Math.PI*0.92, Math.PI*2.08); c.stroke();
    c.strokeStyle = shade(hood,0.16); c.lineWidth=1.4;                                    // luz na borda do capuz
    c.beginPath(); c.arc(hx, hy, hr+0.4, Math.PI*1.12, Math.PI*1.6); c.stroke();
  } else {
    const hairDk = shade(look.hair,-0.22), hairLt = shade(look.hair,0.18);
    c.fillStyle = look.hair;
    c.beginPath(); c.arc(hx, hy-hr*0.12, hr*0.98, Math.PI, 0); c.fill();
    c.fillRect(hx-hr*0.98, hy-hr*0.12-1, hr*1.96, 3);
    c.fillStyle = hairDk; c.fillRect(hx-hr*0.98, hy-hr*0.12+1.5, hr*1.96, 1.5);
    c.strokeStyle = hairLt; c.lineWidth=1.6;                                              // mecha de luz
    c.beginPath(); c.arc(hx, hy-hr*0.12, hr*0.7, Math.PI*1.08, Math.PI*1.5); c.stroke();
    c.fillStyle = hood;                                                                   // gola
    roundRect(c, cx-bodyW*0.34, bodyTop-2, bodyW*0.68, 5, 3); c.fill();
  }

  // ---- olhos conforme direção ----
  const ey = hy + hr*0.16;
  if(facing==='up'){
    c.fillStyle = (look.hood==='up') ? hood : shade(look.hair,-0.08);
    c.beginPath(); c.arc(hx, hy, hr*0.99, 0, Math.PI*2); c.fill();
    c.strokeStyle = ink; c.lineWidth=1.1; c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI*2); c.stroke();
  } else {
    c.fillStyle = '#2a2233';
    if(facing==='left'){ c.fillRect(hx-hr*0.5, ey, 2.2, 2.6); }
    else if(facing==='right'){ c.fillRect(hx+hr*0.3, ey, 2.2, 2.6); }
    else { c.fillRect(hx-hr*0.42, ey, 2.2, 2.6); c.fillRect(hx+hr*0.2, ey, 2.2, 2.6); }
  }

  if(look.hat && look.hat!=='none') drawHat(c, hx, hy-hr*0.95, hr, look.hat, look.cloak, facing);

  // ---- luz de borda (rim light) no alto-esquerda ----
  if(facing!=='up'){
    c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=0.16; c.strokeStyle='#ffffff'; c.lineWidth=1.2;
    c.beginPath(); c.arc(hx, hy, hr-0.4, Math.PI*1.06, Math.PI*1.54); c.stroke();
    c.beginPath(); c.moveTo(cx-bodyW/2+1.6, bodyTop+3); c.lineTo(cx-bodyW/2+1.6, bodyTop+bodyH*0.58); c.stroke();
    c.restore();
  }

  // placa de nome (ancorada, sem balanço)
  if(name){
    c.font = '600 11px Inter, sans-serif'; c.textAlign='center'; c.textBaseline='middle';
    const w = c.measureText(name).width + 12; const ty = py - 1, th = 15;
    c.fillStyle = 'rgba(15,14,23,.8)'; roundRect(c, cx-w/2, ty-th, w, th, 5); c.fill();
    c.fillStyle = isSelf ? '#f4b860' : '#e8e4f0'; c.fillText(name, cx, ty-th/2+1);
  }
}

// O corvo: passarinho preto empoleirado, com um pulinho quando se move.
function drawWildForm(c, sx, sy, ts, p){
  const form = p.wild_form;
  const fake = { mtype: form, facing: p.facing, _moving: p._moving, walk: p.walk };
  if(form === 'mainecoon'){
    const t = Date.now()/600;                          // brilho dourado do Pofnir
    const a = 0.16 + 0.09*Math.abs(Math.sin(t));
    const gl = c.createRadialGradient(sx+ts/2, sy+ts*0.55, ts*0.12, sx+ts/2, sy+ts*0.55, ts*0.85);
    gl.addColorStop(0, 'rgba(255,226,150,'+a+')'); gl.addColorStop(1, 'rgba(255,226,150,0)');
    c.save(); c.fillStyle = gl; c.fillRect(sx-ts*0.6, sy-ts*0.6, ts*2.2, ts*2.2); c.restore();
    drawBeast(c, sx, sy, ts, fake);
  } else if(form === 'aguia'){
    drawCrow(c, sx, sy, ts, p.facing, p._moving, p.walk, p.look);
  } else {
    drawBeast(c, sx, sy, ts, fake);                    // lobo, urso
  }
  if(p.name){                                          // etiqueta com o nome
    c.save(); c.font = '600 11px Inter, sans-serif'; c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(p.name, sx+ts/2+0.7, sy-2.3);
    c.fillStyle = (p.id===myId) ? '#c9a0ff' : '#e8e4f0'; c.fillText(p.name, sx+ts/2, sy-3);
    c.restore();
  }
}
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
// ===== Repouso da Dama: harpia, bruxa, espiritos (5) e a banshee =====
function drawHarpy(c, sx, sy, ts, p){
  const cx = sx + ts/2, t = performance.now();
  const flap = Math.sin(t/170) * 0.55;
  const cy = sy + ts*0.46 + Math.sin(t/500)*2;
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath(); c.ellipse(cx, sy+ts*0.9, ts*0.24, ts*0.07, 0, 0, Math.PI*2); c.fill();
  const feather='#4a3d57', fdk='#352b40', flt='#6b5a7d', skin='#d8b48f';
  for(const sgn of [-1, 1]){
    c.save(); c.translate(cx, cy-ts*0.05); c.rotate(sgn*(0.45+flap));
    c.fillStyle = fdk; c.beginPath();
    c.moveTo(0,0); c.quadraticCurveTo(sgn*ts*0.5, -ts*0.3, sgn*ts*0.62, ts*0.06);
    c.quadraticCurveTo(sgn*ts*0.4, ts*0.12, 0, ts*0.04); c.closePath(); c.fill();
    c.fillStyle = feather; c.beginPath();
    c.moveTo(0,0); c.quadraticCurveTo(sgn*ts*0.4, -ts*0.2, sgn*ts*0.5, ts*0.02);
    c.quadraticCurveTo(sgn*ts*0.3, ts*0.07, 0, ts*0.02); c.closePath(); c.fill();
    c.strokeStyle = flt; c.lineWidth = 1;
    for(let i=1;i<=3;i++){ c.beginPath(); c.moveTo(sgn*ts*0.12*i, 0.5); c.lineTo(sgn*ts*0.16*i, ts*0.06); c.stroke(); }
    c.restore();
  }
  c.fillStyle = feather; c.beginPath(); c.ellipse(cx, cy+ts*0.08, ts*0.13, ts*0.2, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = fdk; c.beginPath(); c.ellipse(cx, cy+ts*0.14, ts*0.1, ts*0.12, 0, 0, Math.PI*2); c.fill();
  const hy = cy - ts*0.18;
  c.fillStyle = skin; c.beginPath(); c.arc(cx, hy, ts*0.11, 0, Math.PI*2); c.fill();
  c.fillStyle = fdk; c.beginPath(); c.arc(cx, hy-ts*0.03, ts*0.12, Math.PI, 0); c.fill();
  c.strokeStyle = fdk; c.lineWidth = 1.5;
  for(let i=-2;i<=2;i++){ c.beginPath(); c.moveTo(cx+i*ts*0.04, hy-ts*0.06); c.lineTo(cx+i*ts*0.05, hy-ts*0.17); c.stroke(); }
  c.fillStyle = '#f4d24a';
  c.fillRect(cx-ts*0.055, hy-ts*0.01, ts*0.03, ts*0.02); c.fillRect(cx+ts*0.025, hy-ts*0.01, ts*0.03, ts*0.02);
  c.strokeStyle = '#caa15a'; c.lineWidth = 2; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx-ts*0.06, cy+ts*0.26); c.lineTo(cx-ts*0.08, cy+ts*0.37);
  c.moveTo(cx+ts*0.06, cy+ts*0.26); c.lineTo(cx+ts*0.08, cy+ts*0.37); c.stroke();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawWitch(c, sx, sy, ts, p){
  const cx = sx + ts/2, t = performance.now();
  const sway = Math.sin(t/600) * 1.5;
  const cy = sy + ts*0.5;
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath(); c.ellipse(cx, sy+ts*0.92, ts*0.24, ts*0.07, 0, 0, Math.PI*2); c.fill();
  const cloak='#3a2f4a', cdk='#2a2138', skin='#9bbf8a', hat='#241c30';
  c.strokeStyle = '#5a3f28'; c.lineWidth = 2.4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx+ts*0.2, cy-ts*0.3); c.lineTo(cx+ts*0.22, cy+ts*0.34); c.stroke();
  c.save(); c.shadowColor='#7ad6a0'; c.shadowBlur=6;
  c.fillStyle = '#9ff0c0'; c.beginPath(); c.arc(cx+ts*0.2, cy-ts*0.32, ts*0.05, 0, Math.PI*2); c.fill(); c.restore();
  c.fillStyle = cloak; c.beginPath();
  c.moveTo(cx, cy-ts*0.12); c.lineTo(cx-ts*0.22, cy+ts*0.38); c.lineTo(cx+ts*0.22, cy+ts*0.38); c.closePath(); c.fill();
  c.fillStyle = cdk; c.beginPath();
  c.moveTo(cx, cy-ts*0.1); c.lineTo(cx-ts*0.06, cy+ts*0.38); c.lineTo(cx+ts*0.06, cy+ts*0.38); c.closePath(); c.fill();
  const hy = cy - ts*0.2;
  c.fillStyle = skin; c.beginPath(); c.ellipse(cx, hy, ts*0.1, ts*0.12, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = shade(skin,-0.2); c.beginPath();
  c.moveTo(cx, hy); c.lineTo(cx+ts*0.06, hy+ts*0.06); c.lineTo(cx, hy+ts*0.05); c.closePath(); c.fill();
  c.fillStyle = '#f4d24a';
  c.beginPath(); c.arc(cx-ts*0.035, hy-ts*0.01, ts*0.02, 0, Math.PI*2); c.arc(cx+ts*0.03, hy-ts*0.01, ts*0.02, 0, Math.PI*2); c.fill();
  c.fillStyle = '#000'; c.fillRect(cx-ts*0.04, hy-ts*0.012, 1.5, 1.5); c.fillRect(cx+ts*0.025, hy-ts*0.012, 1.5, 1.5);
  c.save(); c.translate(cx, hy-ts*0.08); c.rotate(-0.15+sway*0.02);
  c.fillStyle = hat; c.beginPath(); c.ellipse(0, 0, ts*0.18, ts*0.05, 0, 0, Math.PI*2); c.fill();
  c.beginPath(); c.moveTo(-ts*0.1, 0); c.lineTo(ts*0.04, -ts*0.3); c.lineTo(ts*0.08, 0); c.closePath(); c.fill();
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

const SPIRIT_KIND = {
  alma_errante: {body:'#cdd8ff', glow:'rgba(190,210,255,', eye:'#bfe0ff', a:0.70, face:'soft'},
  assombracao:  {body:'#9fd8b0', glow:'rgba(120,210,150,', eye:'#d8ffe0', a:0.68, face:'soft'},
  espectro:     {body:'#c9ccd6', glow:'rgba(200,205,220,', eye:'#ff5a5a', a:0.82, face:'skull'},
  vulto:        {body:'#1b1a26', glow:'rgba(120,70,170,',  eye:'#b06bff', a:0.92, face:'void'},
  alma_penada:  {body:'#c8a6e0', glow:'rgba(180,120,220,', eye:'#ffe070', a:0.74, face:'wail'},
  aparicao_sepulcral: {body:'#aeb6c0', glow:'rgba(150,170,190,', eye:'#9fe0ff', a:0.78, face:'wail'},
};
function drawSpirit(c, sx, sy, ts, p){
  const cx = sx + ts/2, t = performance.now();
  const k = SPIRIT_KIND[p.mtype] || SPIRIT_KIND.alma_errante;
  const cy = sy + ts*0.46 + Math.sin(t/600 + cx)*2.2;
  const grd = c.createRadialGradient(cx, cy, ts*0.08, cx, cy, ts*0.6);
  grd.addColorStop(0, k.glow+'0.4)'); grd.addColorStop(1, k.glow+'0)');
  c.fillStyle = grd; c.beginPath(); c.arc(cx, cy, ts*0.6, 0, Math.PI*2); c.fill();
  c.save(); c.globalAlpha = k.a;
  const wob = Math.sin(t/300)*ts*0.03;
  c.fillStyle = k.body;
  c.beginPath();
  c.moveTo(cx-ts*0.18, cy-ts*0.02);
  c.quadraticCurveTo(cx-ts*0.22, cy-ts*0.3, cx, cy-ts*0.34);
  c.quadraticCurveTo(cx+ts*0.22, cy-ts*0.3, cx+ts*0.18, cy-ts*0.02);
  c.quadraticCurveTo(cx+ts*0.12+wob, cy+ts*0.3, cx, cy+ts*0.42);
  c.quadraticCurveTo(cx-ts*0.12-wob, cy+ts*0.3, cx-ts*0.18, cy-ts*0.02);
  c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath(); c.ellipse(cx, cy-ts*0.16, ts*0.11, ts*0.14, 0, 0, Math.PI*2); c.fill();
  const ey = cy - ts*0.17;
  if(k.face === 'skull'){
    c.fillStyle = '#e8e6dc'; c.beginPath(); c.arc(cx, ey+ts*0.02, ts*0.09, 0, Math.PI*2); c.fill();
    c.fillStyle = '#000';
    c.beginPath(); c.arc(cx-ts*0.035, ey, ts*0.022, 0, Math.PI*2); c.arc(cx+ts*0.035, ey, ts*0.022, 0, Math.PI*2); c.fill();
    c.fillStyle = k.eye;
    c.beginPath(); c.arc(cx-ts*0.035, ey, ts*0.012, 0, Math.PI*2); c.arc(cx+ts*0.035, ey, ts*0.012, 0, Math.PI*2); c.fill();
    c.strokeStyle = '#000'; c.lineWidth = 1;
    for(let i=-1;i<=1;i++){ c.beginPath(); c.moveTo(cx+i*ts*0.025, ey+ts*0.05); c.lineTo(cx+i*ts*0.025, ey+ts*0.08); c.stroke(); }
  } else {
    c.shadowColor = k.eye; c.shadowBlur = 6; c.fillStyle = k.eye;
    c.beginPath(); c.arc(cx-ts*0.05, ey, ts*0.025, 0, Math.PI*2); c.arc(cx+ts*0.05, ey, ts*0.025, 0, Math.PI*2); c.fill();
    c.shadowBlur = 0;
    if(k.face === 'wail'){ c.fillStyle = '#000'; c.beginPath(); c.ellipse(cx, ey+ts*0.09, ts*0.025, ts*0.045, 0, 0, Math.PI*2); c.fill(); }
  }
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawBanshee(c, sx, sy, ts, p){
  const cx = sx + ts/2, t = performance.now();
  const enraged = !!p._enraged;
  const S = ts*1.5;
  const cy = sy + ts*0.5 + Math.sin(t/700)*3;
  const pulse = 0.3 + 0.14*Math.abs(Math.sin(t/300));
  const aur = c.createRadialGradient(cx, cy-ts*0.1, ts*0.1, cx, cy-ts*0.1, S*1.1);
  aur.addColorStop(0, (enraged?'rgba(190,90,220,':'rgba(150,180,255,')+pulse+')');
  aur.addColorStop(1, 'rgba(120,140,200,0)');
  c.fillStyle = aur; c.fillRect(sx-ts, sy-ts, ts*3, ts*3);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath(); c.ellipse(cx, sy+ts*0.96, ts*0.34, ts*0.09, 0, 0, Math.PI*2); c.fill();
  const gown='#b9c6ee', gdk='#8c9bd0', hair='#cdd6f4', skin='#e8ecfb';
  c.save(); c.globalAlpha = 0.92;
  c.strokeStyle = hair; c.lineWidth = S*0.05; c.lineCap = 'round';
  for(let i=-3;i<=3;i++){
    const ph = t/400 + i;
    c.beginPath();
    c.moveTo(cx+i*S*0.05, cy-S*0.42);
    c.quadraticCurveTo(cx+i*S*0.14+Math.sin(ph)*S*0.1, cy-S*0.1, cx+i*S*0.1+Math.sin(ph)*S*0.16, cy+S*0.2);
    c.stroke();
  }
  const wob = Math.sin(t/350)*S*0.06;
  c.fillStyle = gown;
  c.beginPath();
  c.moveTo(cx-S*0.26, cy-S*0.1);
  c.quadraticCurveTo(cx-S*0.3, cy-S*0.4, cx, cy-S*0.46);
  c.quadraticCurveTo(cx+S*0.3, cy-S*0.4, cx+S*0.26, cy-S*0.1);
  c.quadraticCurveTo(cx+S*0.2+wob, cy+S*0.34, cx, cy+S*0.5);
  c.quadraticCurveTo(cx-S*0.2-wob, cy+S*0.34, cx-S*0.26, cy-S*0.1);
  c.closePath(); c.fill();
  c.fillStyle = gdk;
  c.beginPath(); c.moveTo(cx, cy-S*0.4); c.quadraticCurveTo(cx-S*0.04, cy+S*0.1, cx, cy+S*0.48);
  c.quadraticCurveTo(cx+S*0.04, cy+S*0.1, cx, cy-S*0.4); c.closePath(); c.fill();
  const hy = cy - S*0.32;
  c.fillStyle = skin; c.beginPath(); c.ellipse(cx, hy, S*0.15, S*0.18, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = hair; c.beginPath(); c.arc(cx, hy-S*0.06, S*0.17, Math.PI*1.05, Math.PI*1.95); c.fill();
  c.save(); c.shadowColor = enraged?'#d06bff':'#bfe0ff'; c.shadowBlur = 10;
  c.fillStyle = enraged?'#e29bff':'#dff0ff';
  c.beginPath(); c.ellipse(cx-S*0.06, hy-S*0.01, S*0.03, S*0.045, 0, 0, Math.PI*2);
  c.ellipse(cx+S*0.06, hy-S*0.01, S*0.03, S*0.045, 0, 0, Math.PI*2); c.fill();
  c.restore();
  c.fillStyle = '#1a1426';
  c.beginPath(); c.ellipse(cx, hy+S*0.1, S*0.04, S*0.08, 0, 0, Math.PI*2); c.fill();
  c.restore();
  c.save(); c.font = '700 9px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
  c.lineWidth = 2.5; c.strokeStyle = 'rgba(8,7,15,0.9)';
  c.strokeText('A DAMA DA NOITE', cx, sy - 16); c.fillStyle = enraged?'#e6a3ff':'#bcd0ff';
  c.fillText('A DAMA DA NOITE', cx, sy - 16); c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

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
  } else if(def.visual && drawEquipVisual(c, cx, cy, size, def.visual, col)){
    // equipamento: icone proprio (capacete, arma, anel...) ja desenhado
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
//  CAMADA DE ATMOSFERA (sombras, vinheta, poca de luz, particulas, bloom)
//  + VFX de combate (projetil de magia, impacto, corte, cura, buff, marca)
//  + luz divina do Pofnir. Tudo desenhado por cima no frame(), sem mexer nos
//  tiles ja assados nem na arte dos personagens.
// ===========================================================================
function isNightish(t){ return t < 0.24 || t > 0.72; }   // crepusculo/noite

function entityShadow(c, sx, sy, ts, p){
  // personagens e monstros ja desenham sombra propria; aqui so os bichos que faltavam
  if(p.kind!=='cat' && p.kind!=='dog' && p.kind!=='toad') return;
  const w = ts*0.28, h = ts*0.10;
  const cx = sx + ts/2, cy = sy + ts*0.84;
  c.save(); c.globalAlpha = 0.22; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(cx, cy, w, h, 0, 0, Math.PI*2); c.fill(); c.restore();
}

// ---- particulas de ambiente (em coords de mundo, seguem a camera) ----
function spawnParticle(now){
  const margin = TS*2;
  const wx = camX - margin + Math.random()*(canvas.width + margin*2);
  const wy = camY - margin + Math.random()*(canvas.height + margin*2);
  const night = isNightish(dayTime);
  const amb = MAP_AMBIENT[mapName];
  const biomeHue = amb && amb.part;                     // cor das motas daquele bioma
  const glow = night || GLOW_MAPS.has(mapName);         // reinos/cemiterio/salao: brilho etereo
  particles.push({
    x:wx, y:wy,
    vx:(Math.random()-0.5)*6,
    vy: night ? -(4+Math.random()*6) : (2+Math.random()*4),
    r: glow ? 1.1+Math.random()*1.3 : 0.7+Math.random()*0.9,
    life: 4200+Math.random()*4200, t0:now,
    glow: glow, hue: biomeHue || (night ? (Math.random()<0.5?'#f4e08a':'#a9f0c0') : '#d8d2c2'),
    ph: Math.random()*6.283
  });
}
function updateParticles(now, dt){
  const indoors = mapName && (mapName.indexOf('casa_')===0 || mapName.indexOf('loja_')===0);
  const want = indoors ? Math.floor(ATMO.particlesMax*0.4) : ATMO.particlesMax;
  let guard = 0;
  while(particles.length < want && guard++ < 40) spawnParticle(now - Math.random()*2200);
  particles = particles.filter(p=>{
    if(now - p.t0 > p.life) return false;
    p.x += p.vx*dt/1000; p.y += p.vy*dt/1000;
    return true;
  });
}
function drawParticles(c, now){
  for(const p of particles){
    const sx = p.x - camX, sy = p.y - camY;
    if(sx<-8||sy<-8||sx>canvas.width+8||sy>canvas.height+8) continue;
    const k = (now - p.t0)/p.life;
    const fade = Math.sin(Math.min(Math.PI, Math.max(0,k)*Math.PI));
    const pulse = p.glow ? (0.55+0.45*Math.sin(now/500+p.ph)) : 0.5;
    c.save();
    if(p.glow){
      c.globalCompositeOperation='lighter'; c.globalAlpha = fade*pulse*0.55;
      const g=c.createRadialGradient(sx,sy,0,sx,sy,p.r*4);
      g.addColorStop(0,p.hue); g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g; c.beginPath(); c.arc(sx,sy,p.r*4,0,Math.PI*2); c.fill();
      c.globalAlpha=fade*pulse; c.fillStyle=p.hue; c.beginPath(); c.arc(sx,sy,p.r,0,Math.PI*2); c.fill();
    } else {
      c.globalAlpha = fade*0.20; c.fillStyle=p.hue; c.beginPath(); c.arc(sx,sy,p.r,0,Math.PI*2); c.fill();
    }
    c.restore();
  }
}

// ---- poca de luz quente em volta de voce + vinheta nas bordas ----
function drawAtmoPool(c){
  const me = players.get(myId); if(!me) return;
  const cx = me.rx - camX + TS/2, cy = me.ry - camY + TS/2, R = TS*5.5;
  c.save(); c.globalCompositeOperation='lighter';
  const g=c.createRadialGradient(cx,cy,TS*0.5,cx,cy,R);
  g.addColorStop(0,'rgba(255,224,160,'+ATMO.pool+')');
  g.addColorStop(0.6,'rgba(255,210,150,'+(ATMO.pool*0.35).toFixed(3)+')');
  g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g; c.fillRect(0,0,canvas.width,canvas.height); c.restore();
}
function drawVignette(c){
  const w=canvas.width,h=canvas.height;
  const g=c.createRadialGradient(w/2,h*0.46,Math.min(w,h)*0.32, w/2,h*0.5,Math.max(w,h)*0.72);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(0.68,'rgba(0,0,0,0)');
  g.addColorStop(1,'rgba(6,5,12,'+ATMO.vignette+')');
  c.save(); c.fillStyle=g; c.fillRect(0,0,w,h); c.restore();
}

// ---- bloom barato: downscale -> limiar (multiplica por si) -> borrao -> soma ----
function ensureBloom(){
  const bw=Math.max(1,Math.floor(canvas.width/4)), bh=Math.max(1,Math.floor(canvas.height/4));
  if(!bloomCanvas){ bloomCanvas=document.createElement('canvas'); bloomCtx=bloomCanvas.getContext('2d'); }
  if(bw!==bloomW||bh!==bloomH){ bloomCanvas.width=bw; bloomCanvas.height=bh; bloomW=bw; bloomH=bh; }
}
function applyBloom(c){
  if(!canvas.width||!canvas.height||ATMO.bloom<=0) return;
  ensureBloom();
  const bw=bloomW,bh=bloomH,bc=bloomCtx;
  bc.globalCompositeOperation='source-over'; bc.clearRect(0,0,bw,bh);
  bc.drawImage(canvas,0,0,canvas.width,canvas.height,0,0,bw,bh);
  bc.globalCompositeOperation='multiply'; bc.drawImage(bloomCanvas,0,0,bw,bh,0,0,bw,bh);  // limiar
  bc.globalCompositeOperation='source-over';
  try{ bc.filter='blur(2px)'; bc.drawImage(bloomCanvas,0,0); bc.filter='none'; }catch(e){ bc.filter='none'; }
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=ATMO.bloom; c.imageSmoothingEnabled=true;
  c.drawImage(bloomCanvas,0,0,bw,bh,0,0,canvas.width,canvas.height); c.restore();
}

// ---- luz divina do Pofnir (overlay animado sobre a estatua, no salao) ----
function computePofnirSpot(){
  for(let y=0;y<mapH;y++) for(let x=0;x<mapW;x++){
    if(mapRows[y] && mapRows[y][x]==='P') return {x,y};
  }
  return null;
}
function drawPofnirLight(c, now){
  if(!pofnirSpot) return;
  const cx=(pofnirSpot.x+1)*TS - camX, cy=(pofnirSpot.y+1)*TS - camY;
  if(cx<-TS*5||cy<-TS*5||cx>canvas.width+TS*5||cy>canvas.height+TS*5) return;
  const pulse=0.82+0.18*Math.sin(now/900), R=TS*4.4*pulse;
  c.save(); c.globalCompositeOperation='lighter';
  const g=c.createRadialGradient(cx,cy,TS*0.4,cx,cy,R);
  g.addColorStop(0,'rgba(255,228,150,0.40)'); g.addColorStop(0.4,'rgba(244,193,78,0.17)');
  g.addColorStop(0.75,'rgba(155,109,255,0.10)'); g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g; c.beginPath(); c.arc(cx,cy,R,0,Math.PI*2); c.fill();
  c.globalAlpha=0.09*pulse; c.strokeStyle='#ffe8a0'; c.lineWidth=2;     // raios divinos girando
  for(let i=0;i<10;i++){ const a=i*Math.PI/5 + now/4200;
    c.beginPath(); c.moveTo(cx+Math.cos(a)*TS*0.8,cy+Math.sin(a)*TS*0.8); c.lineTo(cx+Math.cos(a)*R*0.92,cy+Math.sin(a)*R*0.92); c.stroke(); }
  c.restore();
}

// ---- VFX de combate ----
function vfxColorFor(name, fallback){
  const s=(name||'').toLowerCase();
  if(/fog|chama|piro|fire|flame|brasa|incend/.test(s)) return '#ff8a3a';
  if(/gel|frost|neve|glaci|frio|cong/.test(s)) return '#7fd6ff';
  if(/raio|relamp|trovao|light|eletr|choque|relâmp/.test(s)) return '#ffe066';
  if(/veneno|poison|acido|toxic|ácido/.test(s)) return '#9bd16a';
  if(/sagr|radian|divin|cura|holy|luz/.test(s)) return '#ffe6a8';
  if(/sombr|necro|morte|trev|maldi/.test(s)) return '#b06bff';
  return fallback || '#c9a0ff';
}
function spawnBolt(fromId, toId, color){
  const a=players.get(fromId), b=players.get(toId); if(!b) return;
  const x0 = a ? a.x : b.x, y0 = a ? a.y : b.y;
  const t=performance.now();
  vfx.push({kind:'bolt', x0, y0, x1:b.x, y1:b.y, color, t0:t, life:340});
  vfx.push({kind:'impact', x1:b.x, y1:b.y, color, t0:t+290, life:380});
}
function spawnAt(atId, kind, color){
  const e=players.get(atId); if(!e) return;
  vfx.push({kind, x1:e.x, y1:e.y, color, t0:performance.now(), life:(kind==='slash'?260:(kind==='heal'?700:440))});
}
function updateVfx(now){ vfx = vfx.filter(v=> now < v.t0 + v.life); }
function drawVfx(c, now){
  for(const v of vfx){
    if(now < v.t0) continue;
    const k=(now - v.t0)/v.life; if(k>1) continue;
    if(v.kind==='bolt'){
      const x0=v.x0*TS-camX+TS/2, y0=v.y0*TS-camY+TS/2, x1=v.x1*TS-camX+TS/2, y1=v.y1*TS-camY+TS/2;
      const kk=Math.min(1,k*1.1), hx=x0+(x1-x0)*kk, hy=y0+(y1-y0)*kk;
      const tx=x0+(x1-x0)*Math.max(0,kk-0.25), ty=y0+(y1-y0)*Math.max(0,kk-0.25);
      c.save(); c.globalCompositeOperation='lighter';
      c.strokeStyle=v.color; c.globalAlpha=0.5*(1-k); c.lineWidth=Math.max(2,TS*0.12); c.lineCap='round';
      c.beginPath(); c.moveTo(tx,ty); c.lineTo(hx,hy); c.stroke();
      c.globalAlpha=0.9; const g=c.createRadialGradient(hx,hy,0,hx,hy,TS*0.5);
      g.addColorStop(0,'#ffffff'); g.addColorStop(0.4,v.color); g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g; c.beginPath(); c.arc(hx,hy,TS*0.5,0,Math.PI*2); c.fill(); c.restore();
    } else if(v.kind==='impact'){
      const cx=v.x1*TS-camX+TS/2, cy=v.y1*TS-camY+TS/2, r=TS*(0.3+k*0.7);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=(1-k)*0.85;
      const g=c.createRadialGradient(cx,cy,0,cx,cy,r);
      g.addColorStop(0,'#ffffff'); g.addColorStop(0.35,v.color); g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g; c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2); c.fill();
      c.strokeStyle=v.color; c.lineWidth=2; c.globalAlpha=(1-k)*0.7;
      for(let i=0;i<6;i++){ const a=i*Math.PI/3+k*2;
        c.beginPath(); c.moveTo(cx+Math.cos(a)*r*0.4,cy+Math.sin(a)*r*0.4); c.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r); c.stroke(); }
      c.restore();
    } else if(v.kind==='slash'){
      const cx=v.x1*TS-camX+TS/2, cy=v.y1*TS-camY+TS/2;
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=(1-k)*0.9;
      c.strokeStyle=v.color; c.lineWidth=Math.max(2,TS*0.14); c.lineCap='round';
      const a0=-0.7+k*0.5; c.beginPath(); c.arc(cx,cy,TS*0.5,a0,a0+2.2); c.stroke(); c.restore();
    } else if(v.kind==='heal'){
      const cx=v.x1*TS-camX+TS/2, cy=v.y1*TS-camY+TS;
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=(1-k)*0.85; c.fillStyle=v.color;
      for(let i=0;i<5;i++){ const px=cx+Math.sin(i*1.7+now/300)*TS*0.3, py=cy - k*TS*1.5 - i*4;
        c.beginPath(); c.arc(px,py,2.2,0,Math.PI*2); c.fill(); } c.restore();
    } else if(v.kind==='buff'){
      const cx=v.x1*TS-camX+TS/2, cy=v.y1*TS-camY+TS/2, r=TS*(0.6+k*0.3);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=(1-k)*0.8;
      c.strokeStyle=v.color; c.lineWidth=2.5; c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2); c.stroke(); c.restore();
    } else if(v.kind==='mark'){
      const cx=v.x1*TS-camX+TS/2, cy=v.y1*TS-camY+TS/2, r=TS*0.5;
      c.save(); c.strokeStyle=v.color; c.globalAlpha=(1-k)*0.9; c.lineWidth=2;
      c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2); c.stroke();
      for(let i=0;i<4;i++){ const a=i*Math.PI/2;
        c.beginPath(); c.moveTo(cx+Math.cos(a)*r*0.6,cy+Math.sin(a)*r*0.6); c.lineTo(cx+Math.cos(a)*r*1.3,cy+Math.sin(a)*r*1.3); c.stroke(); }
      c.restore();
    }
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
    if(p.kind === 'monster' && p._dead) continue;   // monstro derrotado some
    entityShadow(ctx, sx, sy, TS, p);               // sombra suave no chao (profundidade)
    // realce de alvos: mirando magia/habilidade (à distância = todos, corpo a corpo = adjacentes)
    // ou, no modo normal, inimigos ao lado que dá pra atacar.
    if(combat && combat.yourTurn && combat.snapshot && p.kind === 'monster' && !p._dead){
      const me = players.get(myId);
      const pend = combat.pending;
      const adj = me && Math.max(Math.abs(me.x - p.x), Math.abs(me.y - p.y)) <= 1;
      let show = false, col = '#ff6a6a';
      if(pend){ col = '#9b6dff'; show = (pend.range === 'ranged') ? true : adj; }
      else { show = combat.snapshot.your_action && adj; }
      if(show){
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([4,3]);
        ctx.strokeRect(sx+2, sy+2, TS-4, TS-4); ctx.restore();
      }
    }
    if(p.kind === 'deity') drawDeity(ctx, sx, sy, TS, p);
    else if(p.kind === 'bird') drawCrow(ctx, sx, sy, TS, p.facing, p._moving, p.walk, p.look);
    else if(p.kind === 'cat') drawCat(ctx, sx, sy, TS, p.facing, p._moving, p.walk, p.look);
    else if(p.kind === 'dog') drawDog(ctx, sx, sy, TS, p.facing, p._moving, p.walk, p.look);
    else if(p.kind === 'toad') drawToad(ctx, sx, sy, TS, p.facing, p._moving, p.walk, p.look);
    else if(p.kind === 'apparition') drawApparition(ctx, sx, sy, TS, p.facing, p._moving, p.walk, p.name);
    else if(p.kind === 'monster' && (p.size||0) >= 4) drawVarth(ctx, sx, sy, TS, p);
    else if(p.kind === 'monster') drawMonster(ctx, sx, sy, TS, p);
    else if(p.wild_form) drawWildForm(ctx, sx, sy, TS, p);
    else drawCharacter(ctx, sx, sy, TS, p.look, p.facing, p.name, p.id===myId, p._moving, p.walk);
  }

  // numeros de dano flutuantes (sobem e somem)
  if(dmgPops.length){
    const now = performance.now();
    dmgPops = dmgPops.filter(d=> now - d.t0 < 900);
    ctx.save(); ctx.textAlign = 'center'; ctx.font = '700 16px Inter, sans-serif';
    for(const d of dmgPops){
      const k = (now - d.t0) / 900;
      const px = d.x*TS + TS/2 - camX, py = d.y*TS - camY - k*26 + 6;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,7,15,0.85)'; ctx.strokeText(d.text, px, py);
      ctx.fillStyle = d.color; ctx.fillText(d.text, px, py);
    }
    ctx.restore();
  }

  // ---- VFX de combate (projetil de magia, impacto, corte) por cima das entidades ----
  updateVfx(now); drawVfx(ctx, now);

  // ---- atmosfera: particulas + luz do Pofnir + poca quente (entram na cena, brilham no bloom) ----
  dayTime = (((Date.now()/1000) + dayOffset) % dayLength) / dayLength;
  if(dayTime < 0) dayTime += 1;
  updateParticles(now, dt); drawParticles(ctx, now);
  if(mapName === 'salao') drawPofnirLight(ctx, now);
  drawAtmoPool(ctx);

  // ---- MOOD por bioma: um veu de cor unificado pra todos os 13 mapas ----
  const amb = MAP_AMBIENT[mapName];
  if(amb){
    ctx.fillStyle = 'rgba('+amb.r+','+amb.g+','+amb.b+','+amb.a+')';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // Repouso da Dama: o breu da mata AINDA fecha conforme entra no fundo (leste)
  if(mapName === 'repouso_dama'){
    const me = players.get(myId);
    const depth = me ? Math.max(0, Math.min(1, me.x / 100)) : 0.3;
    const g = 0.20 + depth * 0.5;                 // 0.20 na boca -> ~0.70 na clareira
    ctx.fillStyle = 'rgba(6,9,14,' + g.toFixed(2) + ')';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ---- ciclo de dia e noite: tinte por cima de tudo ----
  const tint = dayTint(dayTime);
  const indoors = mapName && (mapName.indexOf('casa_') === 0 || mapName.indexOf('loja_') === 0); // dentro: aconchegante
  if(tint && !indoors){ ctx.fillStyle = tint; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if(phaseEl){
    const ph = phaseName(dayTime);
    if(ph !== lastPhase){ phaseEl.textContent = ph; lastPhase = ph; }
  }

  // ---- pos: brilho geral suave + vinheta nas bordas ----
  applyBloom(ctx);
  drawVignette(ctx);

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
  if(combat){                 // em combate: 1 passo por tecla, sem repeticao
    if(combat.yourTurn) sendMove(dir);
    return;
  }
  if(!held.includes(dir)){
    held.push(dir); sendMove(dir);
    if(!ticker) ticker = setInterval(()=>{ if(held.length) sendMove(held[held.length-1]); }, STEP_MS);
  }
}
function releaseDir(dir){
  const i = held.indexOf(dir); if(i>=0) held.splice(i,1);
  if(!held.length && ticker){ clearInterval(ticker); ticker = null; }
}
function sendMove(dir){
  if(!(started && socket)) return;
  if(combat){ if(combat.yourTurn) socket.emit('combat_move', {dir}); return; }
  socket.emit('move', {dir});
}

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
  if(e.code === 'Space'){          // espaco: passa o turno no combate
    if(combat && combat.yourTurn){
      e.preventDefault();
      combat.pending = null;
      if(typeof closeSpellMenu === 'function') closeSpellMenu();
      socket.emit('combat_end_turn', {});
    }
    return;
  }
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

// clique/toque no canvas: ataca um inimigo (no combate, no seu turno) ou inicia a luta.
if(canvas) canvas.addEventListener('click', (e)=>{
  if(!started) return;
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
  const tx = Math.floor((cx + camX) / TS), ty = Math.floor((cy + camY) / TS);
  let mob = null;
  players.forEach(p=>{ if(p.kind === 'monster' && !p._dead && p.x === tx && p.y === ty) mob = p; });
  if(!combat){ if(mob) socket.emit('combat_engage', { target: mob.id }); return; }
  if(!combat.yourTurn){ if(mob) toastMsg('Não é seu turno.'); return; }
  const pend = combat.pending;
  if(!mob){ if(pend){ combat.pending = null; renderCombatHud(); } return; }
  if(pend && pend.type === 'spell'){
    socket.emit('combat_cast', { spell: pend.id, target: mob.id }); combat.pending = null; renderCombatHud();
  } else if(pend && pend.type === 'ability'){
    socket.emit('combat_ability', { ability: pend.id, target: mob.id }); combat.pending = null; renderCombatHud();
  } else {
    socket.emit('combat_attack', { target: mob.id });   // atalho: clicar inimigo = atacar
  }
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
    pofnirSpot = computePofnirSpot();
    applyZoom(zoom);   // define TS, viewport, dimensiona o canvas e desenha o mapa
    players.clear();
    bubbles.clear(); smites.clear();
    for(const p of data.players) addPlayer(p);

    inventory = Array.isArray(data.inventory) ? data.inventory : [];
    equipment = data.equipment || {};
    updateWallet(data.wallet || 0);
    Object.keys(catalog).forEach(k=> delete catalog[k]);
    Object.assign(catalog, data.items || {});
    classFeaturesData = data.class_features || {};
    transformsData = data.transforms || {};
    featsCatalog = data.feats || [];
    ground.clear();
    for(const it of (data.ground||[])) ground.set(it.x+','+it.y, it.item);
    refreshInventory();
    myFicha = data.ficha || {};
    renderFicha();
    if((myFicha.pending_asi||[]).length)
      setTimeout(()=> toastMsg('Você tem melhoria de nível pra escolher! Abra a ficha (📜).'), 1400);

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
    pofnirSpot = computePofnirSpot();
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
  socket.on('wallet', d=>{
    updateWallet(d.bronze || 0);
    if(d && d.picked) toastMsg('+ ' + (d.picked.name || 'moeda'));
    if(shopIsOpen()){ _updateShopWallet(); _renderShopBody(); }
  });
  socket.on('item_taken',   d=> ground.delete(d.x+','+d.y) );
  socket.on('item_spawned', d=> ground.set(d.x+','+d.y, d.item) );

  // loja (Armas Peteco): abre o painel de comprar/vender
  socket.on('shop_open', d=> openShop(d));
  socket.on('xama_open', d=> openXama(d));
  socket.on('couraria_open', d=> openCouraria(d));

  // equipamento
  socket.on('loadout', d=>{
    inventory = Array.isArray(d.bag) ? d.bag : inventory;
    equipment = d.equipment || {};
    refreshInventory();
    if(shopIsOpen()) _renderShopBody();
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
      if(d.asi_applied){ toastMsg('Melhoria aplicada!'); setTimeout(maybeOpenAsi, 300); }
    }
  });
  socket.on('grimoire', d=>{
    grimoireData = d || null;
    grimoireSel = null;                       // recarrega a selecao a partir do que veio
    if(fichaTab === 'grimorio' && fichaPanelOpen) renderFicha();
  });
  socket.on('toast', d=>{ if(d && d.text) toastMsg(d.text); });
  socket.on('form_set', d=>{
    if(myFicha){ myFicha.form = d.form || null; }
    if(typeof fichaPanelOpen === 'undefined' || fichaPanelOpen) renderFicha();
  });
  socket.on('player_form', d=>{
    const p = players.get(d.id);
    if(p) p.wild_form = d.form || null;
    if(d.id === myId && myFicha){ myFicha.form = d.form || null; }
  });
  socket.on('xp', d=>{
    if(!d) return;
    if(myFicha){
      myFicha.xp = d.xp; myFicha.level = d.level;
      if(d.hp!=null) myFicha.hp = d.hp;
      if(d.hp_max!=null) myFicha.hp_max = d.hp_max;
      if(d.prof!=null) myFicha.prof = d.prof;
      if(d.pending_asi) myFicha.pending_asi = d.pending_asi;
      if(d.reason === 'morte') myFicha.death_protect = 0;     // proteção consumida na morte
      renderFicha();
    }
    if(d.reason === 'morte' && d.protected){
      toastMsg('🛡️ Amarração da Xamã segurou o baque · perdeu só ' + Math.max(0,50-d.protected) + '% em vez de 50%', true);
    } else if(d.gained){
      toastMsg((d.gained > 0 ? '+' : '') + d.gained + ' XP' + (d.reason ? ' · ' + d.reason : ''), d.gained < 0);
    }
  });
  socket.on('levelup', d=>{
    if(!d) return;
    if(myFicha && d.pending_asi) myFicha.pending_asi = d.pending_asi;
    showLevelUp(d);
    setTimeout(maybeOpenAsi, 1600);   // deixa o popup aparecer antes da escolha
  });
  socket.on('asi_error', ()=> toastMsg('Escolha inválida.', true));
  socket.on('throne_warn', d=>{ if(d) throneWarn = {cx:d.cx, cy:d.cy, text:d.text||'', start:performance.now()}; });
  socket.on('class_error', d=>{
    toastMsg('Não rolou: ' + ((d && d.reason) || 'erro') , true);
  });

  // ---- combate por turnos ----
  socket.on('combat_start', d=>{ combat = {yourTurn:false}; showCombatUi(); applyCombatSnapshot(d && d.snapshot); });
  socket.on('combat_state', d=>{
    if(!d) return;
    if(d.player_action){
      if(d.player_action.transform) toastMsg('🐾 Você assumiu: '+d.player_action.transform, true);
      else showAttackResult(d.player_action);
    }
    if(d.spell_result) showSpellResult(d.spell_result);
    if(d.ability_result) showAbilityResult(d.ability_result);
    if(d.enemy_actions){
      for(const a of d.enemy_actions){
        if(!a) continue;
        if(a.status_fx) showStatusFx(a.status_fx);
        if(a.attack) showAttackResult(a.attack);
        if(a.skipped === 'atordoado') toastMsg((a.name||'Inimigo')+' atordoado, perdeu o turno', true);
      }
    }
    applyCombatSnapshot(d.snapshot);
  });
  socket.on('combat_over', d=>{
    endCombatUi();
    if(!d) return;
    if(d.hp!=null && myFicha){ myFicha.hp = d.hp; if(d.hp_max!=null) myFicha.hp_max = d.hp_max; renderFicha(); }
    if(d.outcome === 'victory'){
      combatBanner('Vitória!', d.xp ? ('+'+d.xp+' XP') : '', '#5ec27a');
      if((d.drops && d.drops.length) || d.bronze) showSpoils(d.drops || [], d.bronze || 0);
    } else {
      combatBanner('Você caiu...', 'renasceu no Ermo · perdeu metade do progresso do nível', '#d65a5a');
    }
  });
  socket.on('combat_msg', d=>{ if(d && d.text) toastMsg(d.text, true); });
  socket.on('res', d=>{ if(d && d.res && myFicha){ myFicha.res = d.res; } });
  socket.on('monsters_moved', d=>{
    if(!d || d.map !== mapName) return;
    for(const mv of (d.moves || [])){
      const e = players.get(mv.id);
      if(e){ e.x = mv.x; e.y = mv.y; if(mv.facing) e.facing = mv.facing; }
    }
  });
  socket.on('world_refresh', d=>{
    if(!d || d.map !== mapName) return;
    for(const [id, p] of players){ if(p.kind === 'monster') players.delete(id); }
    for(const e of (d.entities || [])){ if(e.kind === 'monster') addPlayer(e); }
    updateOnline();
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
  socket.on('kicked', ()=>{
    wasKicked = true;
    try{ socket.io.reconnection(false); }catch(e){}
    try{ socket.disconnect(); }catch(e){}
    setStatus('Sua conta foi aberta em outro dispositivo. Esta sessao foi encerrada aqui.');
  });
  socket.on('disconnect', ()=>{ if(started && !wasKicked) setStatus('Conexão perdida. Tentando voltar…'); });
}
function addPlayer(p){
  players.set(p.id, {
    id:p.id, x:p.x, y:p.y, rx:p.x*TS, ry:p.y*TS,
    facing:p.facing, name:p.name, look:p.look, walk:0, _moving:false,
    npc: !!p.npc, kind: p.kind || 'person', solid: (p.solid === false ? false : true),
    form: p.form, size: p.size, accent: p.accent, eyes: p.eyes,
    monster: !!p.monster, glyph: p.glyph, hp: p.hp, hp_max: p.hp_max, mtype: p.mtype,
  });
  updateOnline();
}
function updateOnline(){
  let n = 0; players.forEach(p=>{ if(!p.npc && !p.monster) n++; });
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
const EQUIP_SLOTS = ['head','neck','shoulder','back','chest','hand_r','hand_l','ring1','ring2','legs','feet'];
const SLOT_LABELS = { head:'Cabeça', neck:'Colar', shoulder:'Ombro', back:'Costa', chest:'Peito',
  hand_r:'Mão dir.', hand_l:'Mão esq.', ring1:'Anel', ring2:'Anel', legs:'Calça', feet:'Pé' };
// arranjo do boneco (grid 3 colunas x 6 linhas; silhueta no centro)
const DOLL_LAYOUT = {
  head:{col:2,row:1},
  neck:{col:1,row:2}, shoulder:{col:3,row:2},
  chest:{col:1,row:3}, back:{col:3,row:3},
  hand_r:{col:1,row:4}, hand_l:{col:3,row:4},
  ring1:{col:1,row:5}, ring2:{col:3,row:5},
  legs:{col:1,row:6}, feet:{col:3,row:6},
};
// visual fantasma de cada espaco vazio
const SLOT_GHOST = { head:'helmet', neck:'amulet', shoulder:'pauldron', back:'cloak', chest:'shirt',
  hand_r:'sword', hand_l:'shield', ring1:'ring', ring2:'ring', legs:'pants', feet:'sandal' };
const RARITY_COL = { comum:'#7c8290', incomum:'#5ec27a', raro:'#5a9bf4', epico:'#b06bff', lendario:'#f4b860' };

function equipItem(itemId){ if(socket) socket.emit('equip', { item: itemId }); }
function unequipSlot(slot){ if(socket) socket.emit('unequip', { slot }); }

function refreshEquip(){
  if(!equipRow) return;
  equipRow.innerHTML = '';
  equipRow.style.display = 'grid';
  equipRow.style.gridTemplateColumns = '60px 1fr 60px';
  equipRow.style.gap = '7px 8px';
  equipRow.style.alignItems = 'center';
  equipRow.style.justifyItems = 'center';

  // silhueta central: o proprio personagem, grande
  const sil = document.createElement('div');
  sil.style.gridColumn = '2'; sil.style.gridRow = '2 / span 5';
  sil.style.alignSelf = 'stretch';
  sil.style.display = 'flex'; sil.style.alignItems = 'center'; sil.style.justifyContent = 'center';
  sil.style.position = 'relative';
  const sc = document.createElement('canvas'); sc.width = 104; sc.height = 158;
  sc.style.width = '104px'; sc.style.height = '158px';
  const stx = sc.getContext('2d');
  // pedestal/halo sutil atras
  const grd = stx.createRadialGradient(52, 96, 8, 52, 96, 70);
  grd.addColorStop(0, 'rgba(155,109,255,.14)'); grd.addColorStop(1, 'rgba(155,109,255,0)');
  stx.fillStyle = grd; stx.fillRect(0, 0, 104, 158);
  const me = players.get(myId);
  if(me && me.look){ try{ drawCharacter(stx, 12, 30, 80, me.look, 'down', '', false, false, 0); }catch(e){} }
  sil.appendChild(sc);
  equipRow.appendChild(sil);

  for(const slot of EQUIP_SLOTS){
    const pos = DOLL_LAYOUT[slot] || {col:1,row:1};
    const cell = document.createElement('div'); cell.className = 'eq-slot';
    cell.style.gridColumn = String(pos.col); cell.style.gridRow = String(pos.row);
    const box = document.createElement('div'); box.className = 'slot';
    const itemId = equipment[slot];
    if(itemId){
      box.classList.add('full');
      const def = catalog[itemId];
      const rc = RARITY_COL[(def && def.rarity) || 'comum'] || RARITY_COL.comum;
      box.style.borderColor = rc;
      box.style.boxShadow = '0 0 9px ' + rc + '4d, inset 0 0 0 1px ' + rc + '66';
      box.title = (def ? def.name : itemId) + ' — clique pra tirar';
      const c = document.createElement('canvas'); c.width = 44; c.height = 44;
      c.style.width = '44px'; c.style.height = '44px';
      drawItemIcon(c.getContext('2d'), 22, 22, 44, itemId, false);
      box.appendChild(c);
      box.style.cursor = 'pointer';
      box.addEventListener('click', ()=> unequipSlot(slot));
    } else {
      box.classList.add('eq-empty');
      box.title = SLOT_LABELS[slot] || slot;
      const c = document.createElement('canvas'); c.width = 44; c.height = 44;
      c.style.width = '44px'; c.style.height = '44px';
      const gc = c.getContext('2d'); gc.globalAlpha = 0.16;
      drawEquipVisual(gc, 22, 22, 40, SLOT_GHOST[slot] || 'ring', '#b8b2cf');
    }
    const label = document.createElement('span'); label.className = 'eq-label';
    label.textContent = SLOT_LABELS[slot] || slot;
    cell.appendChild(box); cell.appendChild(label);
    equipRow.appendChild(cell);
  }
}

// desenha o icone de cada tipo de equipamento (usado nos espacos e na mochila)
function drawEquipVisual(c, cx, cy, s, visual, col){
  const d1 = shade(col, -0.28), hi = shade(col, 0.3);
  c.lineJoin = 'round'; c.lineCap = 'round';
  switch(visual){
    case 'shield': {
      c.fillStyle = shade(col,-0.15);
      c.beginPath();
      c.moveTo(cx, cy-s*0.36); c.lineTo(cx+s*0.27, cy-s*0.22);
      c.lineTo(cx+s*0.27, cy+s*0.12); c.lineTo(cx, cy+s*0.4);
      c.lineTo(cx-s*0.27, cy+s*0.12); c.lineTo(cx-s*0.27, cy-s*0.22);
      c.closePath(); c.fill();
      c.strokeStyle = shade(col,0.22); c.lineWidth = 1.4; c.stroke();
      c.strokeStyle = shade(col,0.1); c.lineWidth = 1;          // cruz/reforco
      c.beginPath(); c.moveTo(cx, cy-s*0.3); c.lineTo(cx, cy+s*0.34);
      c.moveTo(cx-s*0.22, cy-s*0.04); c.lineTo(cx+s*0.22, cy-s*0.04); c.stroke();
      c.fillStyle = hi;                                         // bossa central
      c.beginPath(); c.arc(cx, cy-s*0.02, s*0.07, 0, Math.PI*2); c.fill();
      return true; }
    case 'potion': {
      c.fillStyle = shade(col,-0.4);
      c.fillRect(cx-s*0.06, cy-s*0.34, s*0.12, s*0.14);                 // gargalo
      c.fillStyle = '#cdb892';
      c.fillRect(cx-s*0.075, cy-s*0.4, s*0.15, s*0.07);                 // rolha
      c.fillStyle = shade(col,0.12);                                    // vidro
      c.beginPath(); c.arc(cx, cy+s*0.08, s*0.27, 0, Math.PI*2); c.fill();
      c.fillStyle = col;                                               // liquido
      c.beginPath(); c.arc(cx, cy+s*0.12, s*0.21, 0, Math.PI*2); c.fill();
      c.fillStyle = hi;                                               // brilho
      c.beginPath(); c.arc(cx-s*0.09, cy+s*0.02, s*0.06, 0, Math.PI*2); c.fill();
      return true; }
    case 'helmet': {
      c.fillStyle = col;
      c.beginPath(); c.arc(cx, cy, s*0.32, Math.PI, 0); c.lineTo(cx+s*0.32, cy+s*0.1);
      c.lineTo(cx-s*0.32, cy+s*0.1); c.closePath(); c.fill();
      c.fillStyle = d1; c.fillRect(cx-s*0.36, cy+s*0.08, s*0.72, s*0.1);          // aba
      c.fillRect(cx-s*0.06, cy-s*0.26, s*0.12, s*0.34);                            // protetor nasal
      c.fillStyle = hi; c.beginPath(); c.arc(cx-s*0.12, cy-s*0.1, s*0.08, 0, 7); c.fill();
      return true; }
    case 'shirt': case 'armor': {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(cx-s*0.16, cy-s*0.3); c.lineTo(cx-s*0.34, cy-s*0.16); c.lineTo(cx-s*0.24, cy+s*0.02);
      c.lineTo(cx-s*0.2, cy+s*0.34); c.lineTo(cx+s*0.2, cy+s*0.34); c.lineTo(cx+s*0.24, cy+s*0.02);
      c.lineTo(cx+s*0.34, cy-s*0.16); c.lineTo(cx+s*0.16, cy-s*0.3); c.closePath(); c.fill();
      c.fillStyle = d1; c.beginPath();                                            // gola
      c.moveTo(cx-s*0.16, cy-s*0.3); c.lineTo(cx, cy-s*0.14); c.lineTo(cx+s*0.16, cy-s*0.3);
      c.lineTo(cx, cy-s*0.22); c.closePath(); c.fill();
      return true; }
    case 'pauldron': {
      c.fillStyle = col; c.beginPath(); c.ellipse(cx, cy-s*0.02, s*0.34, s*0.26, 0, Math.PI, 0); c.fill();
      c.fillStyle = d1; c.fillRect(cx-s*0.34, cy-s*0.02, s*0.68, s*0.14);
      c.fillStyle = hi; c.beginPath(); c.ellipse(cx, cy-s*0.04, s*0.2, s*0.14, 0, Math.PI, 0); c.fill();
      c.strokeStyle = d1; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx, cy-s*0.28); c.lineTo(cx, cy+s*0.1); c.stroke();
      return true; }
    case 'cloak': {
      c.fillStyle = col; c.beginPath();
      c.moveTo(cx-s*0.06, cy-s*0.32); c.lineTo(cx+s*0.06, cy-s*0.32);
      c.lineTo(cx+s*0.3, cy+s*0.34); c.lineTo(cx-s*0.3, cy+s*0.34); c.closePath(); c.fill();
      c.strokeStyle = d1; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(cx-s*0.1, cy-s*0.1); c.lineTo(cx-s*0.16, cy+s*0.3);
      c.moveTo(cx+s*0.1, cy-s*0.1); c.lineTo(cx+s*0.16, cy+s*0.3);
      c.moveTo(cx, cy-s*0.2); c.lineTo(cx, cy+s*0.32); c.stroke();
      c.fillStyle = d1; c.fillRect(cx-s*0.12, cy-s*0.34, s*0.24, s*0.07);          // colarinho
      return true; }
    case 'pants': {
      c.fillStyle = col;
      c.fillRect(cx-s*0.22, cy-s*0.3, s*0.44, s*0.16);                            // cintura
      c.beginPath(); c.moveTo(cx-s*0.22, cy-s*0.16); c.lineTo(cx-s*0.04, cy-s*0.16);
      c.lineTo(cx-s*0.06, cy+s*0.34); c.lineTo(cx-s*0.2, cy+s*0.34); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(cx+s*0.22, cy-s*0.16); c.lineTo(cx+s*0.04, cy-s*0.16);
      c.lineTo(cx+s*0.06, cy+s*0.34); c.lineTo(cx+s*0.2, cy+s*0.34); c.closePath(); c.fill();
      c.fillStyle = d1; c.fillRect(cx-s*0.02, cy-s*0.16, s*0.04, s*0.5);
      return true; }
    case 'sandal': {
      c.fillStyle = col; c.beginPath(); c.ellipse(cx, cy+s*0.16, s*0.3, s*0.13, 0, 0, 7); c.fill();
      c.strokeStyle = d1; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx-s*0.18, cy+s*0.08); c.lineTo(cx, cy-s*0.06); c.lineTo(cx+s*0.18, cy+s*0.08); c.stroke();
      c.beginPath(); c.moveTo(cx, cy-s*0.06); c.lineTo(cx, cy+s*0.1); c.stroke();
      return true; }
    case 'knife': {
      c.save(); c.translate(cx, cy); c.rotate(-Math.PI/4);
      c.fillStyle = col; c.beginPath();
      c.moveTo(-s*0.04, -s*0.3); c.lineTo(s*0.06, -s*0.26); c.lineTo(s*0.04, s*0.06); c.lineTo(-s*0.04, s*0.06); c.closePath(); c.fill();
      c.fillStyle = hi; c.fillRect(-s*0.04, -s*0.3, s*0.02, s*0.36);              // fio
      c.fillStyle = '#5a3f28'; c.fillRect(-s*0.05, s*0.06, s*0.1, s*0.2);         // cabo
      c.restore(); return true; }
    case 'bow': {
      c.save(); c.translate(cx, cy);
      c.strokeStyle = col; c.lineWidth = Math.max(2, s*0.07); c.lineCap = 'round';
      c.beginPath(); c.arc(s*0.06, 0, s*0.34, -Math.PI*0.62, Math.PI*0.62); c.stroke();
      const xa = s*0.06 + Math.cos(-Math.PI*0.62)*s*0.34;
      const ya = Math.sin(-Math.PI*0.62)*s*0.34, yb = Math.sin(Math.PI*0.62)*s*0.34;
      c.strokeStyle = '#e8e2cf'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(xa, ya); c.lineTo(xa, yb); c.stroke();
      c.strokeStyle = '#6b5a44'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(xa, 0); c.lineTo(xa - s*0.36, 0); c.stroke();
      c.fillStyle = '#cbd2d9'; c.beginPath();
      c.moveTo(xa - s*0.36, 0); c.lineTo(xa - s*0.29, -s*0.045); c.lineTo(xa - s*0.29, s*0.045); c.closePath(); c.fill();
      c.restore(); return true;
    }
    case 'staff_magic': {
      const h = s*0.66, w = Math.max(2, s*0.08);
      c.fillStyle = '#6b5a44'; c.fillRect(cx-w/2, cy-h*0.28, w, h*0.84);
      c.fillStyle = '#8a7659'; c.fillRect(cx-w/2, cy-h*0.28, w*0.4, h*0.84);
      const oy = cy-h*0.4, orb = s*0.18;
      c.save(); c.globalAlpha = 0.55;
      const g = c.createRadialGradient(cx, oy, 1, cx, oy, orb*2.1);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(122,214,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(cx, oy, orb*2.1, 0, 7); c.fill(); c.restore();
      c.fillStyle = shade(col, 0.18); c.beginPath(); c.arc(cx, oy, orb, 0, 7); c.fill();
      c.fillStyle = '#eafaff'; c.beginPath(); c.arc(cx-orb*0.3, oy-orb*0.3, orb*0.4, 0, 7); c.fill();
      c.strokeStyle = '#6b5a44'; c.lineWidth = Math.max(1.5, s*0.04); c.lineCap = 'round';
      for(const sg of [-1,1]){ c.beginPath(); c.moveTo(cx+sg*orb*0.7, oy+orb*0.5); c.quadraticCurveTo(cx+sg*orb*1.1, oy, cx+sg*orb*0.5, oy-orb*0.7); c.stroke(); }
      c.fillStyle = '#dffaff';
      for(let i=0;i<3;i++){ const a = i*2.1; c.fillRect(cx+Math.cos(a)*orb*1.4, oy+Math.sin(a)*orb*1.4, 1.5, 1.5); }
      return true;
    }
    case 'sword': case 'staff': {
      if(visual === 'staff'){
        const h = s*0.6, w = Math.max(2, s*0.08);
        c.fillStyle = '#5a3f28'; c.fillRect(cx-w/2, cy-h*0.3, w, h*0.85);
        const oy = cy-h*0.4, orb = s*0.17;
        c.save(); c.globalAlpha = 0.5; c.fillStyle = col; c.beginPath(); c.arc(cx, oy, orb*1.5, 0, 7); c.fill(); c.restore();
        c.fillStyle = shade(col, 0.12); c.beginPath(); c.arc(cx, oy, orb, 0, 7); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(cx-orb*0.28, oy-orb*0.28, orb*0.34, 0, 7); c.fill();
        return true;
      }
      c.save(); c.translate(cx, cy); c.rotate(-Math.PI/4);
      c.fillStyle = col; c.beginPath();
      c.moveTo(0, -s*0.34); c.lineTo(s*0.05, -s*0.28); c.lineTo(s*0.05, s*0.1); c.lineTo(-s*0.05, s*0.1); c.lineTo(-s*0.05, -s*0.28); c.closePath(); c.fill();
      c.fillStyle = hi; c.fillRect(-s*0.012, -s*0.32, s*0.024, s*0.4);
      c.fillStyle = d1; c.fillRect(-s*0.16, s*0.1, s*0.32, s*0.05);               // guarda
      c.fillStyle = '#5a3f28'; c.fillRect(-s*0.04, s*0.15, s*0.08, s*0.16);       // punho
      c.restore(); return true; }
    case 'shield': case 'lid': {
      if(visual === 'lid'){
        c.fillStyle = col; c.beginPath(); c.ellipse(cx, cy, s*0.34, s*0.3, 0, 0, 7); c.fill();
        c.strokeStyle = d1; c.lineWidth = 1.5; c.beginPath(); c.ellipse(cx, cy, s*0.34, s*0.3, 0, 0, 7); c.stroke();
        c.fillStyle = d1; c.beginPath(); c.arc(cx, cy-s*0.02, s*0.07, 0, 7); c.fill();   // pegador
        c.fillStyle = hi; c.beginPath(); c.ellipse(cx-s*0.1, cy-s*0.1, s*0.1, s*0.06, -0.5, 0, 7); c.fill();
        return true;
      }
      c.fillStyle = col; c.beginPath();
      c.moveTo(cx, cy-s*0.32); c.lineTo(cx+s*0.28, cy-s*0.22); c.lineTo(cx+s*0.22, cy+s*0.16);
      c.lineTo(cx, cy+s*0.34); c.lineTo(cx-s*0.22, cy+s*0.16); c.lineTo(cx-s*0.28, cy-s*0.22); c.closePath(); c.fill();
      c.strokeStyle = hi; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(cx, cy-s*0.28); c.lineTo(cx, cy+s*0.28); c.moveTo(cx-s*0.24, cy-s*0.06); c.lineTo(cx+s*0.24, cy-s*0.06); c.stroke();
      return true; }
    case 'ring': {
      c.strokeStyle = col; c.lineWidth = s*0.1;
      c.beginPath(); c.arc(cx, cy+s*0.06, s*0.2, 0, 7); c.stroke();
      c.fillStyle = hi; c.beginPath();                                           // gema
      c.moveTo(cx, cy-s*0.3); c.lineTo(cx+s*0.1, cy-s*0.18); c.lineTo(cx, cy-s*0.06); c.lineTo(cx-s*0.1, cy-s*0.18); c.closePath(); c.fill();
      return true; }
    case 'amulet': case 'chain': {
      c.strokeStyle = (visual === 'chain') ? col : shade(col, 0.1); c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy-s*0.12, s*0.26, Math.PI*0.15, Math.PI*0.85); c.stroke();
      if(visual === 'chain'){
        c.fillStyle = col;
        for(let i=-2;i<=2;i++){ const a = Math.PI*0.5 + i*0.32; const rx = cx+Math.cos(a)*s*0.26, ry = cy-s*0.12+Math.sin(a)*s*0.26;
          c.beginPath(); c.arc(rx, ry, s*0.05, 0, 7); c.fill(); }
      } else {
        c.fillStyle = col; c.beginPath();                                        // pingente
        c.moveTo(cx, cy+s*0.04); c.lineTo(cx+s*0.12, cy+s*0.16); c.lineTo(cx, cy+s*0.3); c.lineTo(cx-s*0.12, cy+s*0.16); c.closePath(); c.fill();
        c.fillStyle = hi; c.beginPath(); c.arc(cx, cy+s*0.16, s*0.04, 0, 7); c.fill();
      }
      return true; }
  }
  return false;
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
        const rc = RARITY_COL[def.rarity || 'comum'] || RARITY_COL.comum;
        slot.style.borderColor = rc;
        slot.style.boxShadow = 'inset 0 0 0 1px ' + rc + '55';
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
//  LOJA — Armas Peteco (Sapopemba): comprar sets por classe / vender itens
// ===========================================================================
let shopData = null, shopTab = 'buy', _shopEl = null, _shopBodyEl = null, _shopWalletEl = null;

function shopIsOpen(){ return !!_shopEl; }
function _updateShopWallet(){ if(_shopWalletEl) _shopWalletEl.textContent = walletBronze.toLocaleString('pt-BR') + ' 🟤'; }
function closeShop(){ if(_shopEl){ _shopEl.remove(); _shopEl = null; } shopData = null; }

function _shopStat(def){
  if(def.heal) return 'Cura ' + Math.round(def.heal*100) + '% da vida';
  if(def.dmg) return 'Dano ' + def.dmg.n + 'd' + def.dmg.d + (def.atk ? ' · +' + def.atk + ' atq' : '') + (def.ac ? ' · +' + def.ac + ' CA' : '');
  if(def.ac) return '+' + def.ac + ' CA';
  if(def.atk) return '+' + def.atk + ' atq';
  return '';
}
function _shopRow(it, mode){
  const def = Object.assign({}, catalog[it.item] || {}, it);
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:9px;background:#1b1828;margin-bottom:6px;';
  const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40;
  const rc = RARITY_COL[def.rarity || 'comum'] || RARITY_COL.comum;
  cv.style.cssText = 'flex:0 0 auto;border:1px solid ' + rc + ';border-radius:7px;background:#0f0e17;';
  drawItemIcon(cv.getContext('2d'), 20, 20, 40, it.item, false);
  row.appendChild(cv);
  const mid = document.createElement('div'); mid.style.cssText = 'flex:1 1 auto;min-width:0;';
  const nm = document.createElement('div'); nm.textContent = def.name || it.item;
  nm.style.cssText = 'font:600 13px Inter,sans-serif;color:' + rc + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  mid.appendChild(nm);
  const stt = _shopStat(def);
  if(stt){ const st = document.createElement('div'); st.textContent = stt; st.style.cssText = 'font-size:11px;color:#9b95b5;'; mid.appendChild(st); }
  if(def.desc){ const ds = document.createElement('div'); ds.textContent = def.desc; ds.style.cssText = 'font-size:10px;color:#716c88;margin-top:1px;line-height:1.25;'; mid.appendChild(ds); }
  row.appendChild(mid);
  const right = document.createElement('div'); right.style.cssText = 'flex:0 0 auto;text-align:right;';
  if(mode === 'buy'){
    const price = it.price || 0;
    const pr = document.createElement('div'); pr.textContent = price.toLocaleString('pt-BR') + ' 🟤';
    pr.style.cssText = 'font:600 12px Inter,sans-serif;color:#f4b860;margin-bottom:4px;';
    const can = walletBronze >= price;
    const b = _btn(can ? 'Comprar' : 'Sem grana', can);
    b.style.cssText += ';padding:5px 11px;font-size:12px;';
    if(!can){ b.disabled = true; b.style.opacity = '.5'; b.style.cursor = 'default'; }
    else b.onclick = ()=> socket.emit('shop_buy', { item: it.item });
    right.appendChild(pr); right.appendChild(b);
  } else {
    const val = (catalog[it.item] || {}).value || 1;
    const sell = Math.max(1, Math.floor(val * (shopData.sell_rate || 0.4)));
    const qty = it.qty || 1;
    const pr = document.createElement('div');
    pr.textContent = 'Vende: ' + sell.toLocaleString('pt-BR') + ' 🟤' + (qty > 1 ? (' cada (x' + qty + ')') : '');
    pr.style.cssText = 'font:600 12px Inter,sans-serif;color:#7ec27a;margin-bottom:4px;';
    right.appendChild(pr);
    const brow = document.createElement('div'); brow.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;';
    const b1 = _btn('Vender 1', false); b1.style.cssText += ';padding:5px 10px;font-size:12px;';
    b1.onclick = ()=> socket.emit('shop_sell', { item: it.item });
    brow.appendChild(b1);
    if(qty > 1){
      const ball = _btn('Vender todos', true); ball.style.cssText += ';padding:5px 10px;font-size:12px;';
      ball.onclick = ()=> socket.emit('shop_sell', { item: it.item, all: true });
      brow.appendChild(ball);
    }
    right.appendChild(brow);
  }
  row.appendChild(right);
  return row;
}
function _renderShopBody(){
  if(!_shopBodyEl || !shopData) return;
  _shopBodyEl.innerHTML = '';
  if(shopTab === 'buy'){
    (shopData.potions || []).forEach((pt, i)=>{
      if(i === 0){
        const h = document.createElement('div'); h.textContent = 'Poções';
        h.style.cssText = 'font:700 13px Cinzel,serif;color:#f4d8a0;margin:12px 2px 7px;border-bottom:1px solid #3a3556;padding-bottom:4px;';
        _shopBodyEl.appendChild(h);
      }
      _shopBodyEl.appendChild(_shopRow({ item: pt.item, price: pt.price, name: pt.name, heal: pt.heal, color: pt.color, rarity: 'raro' }, 'buy'));
    });
    (shopData.sets || []).forEach(sec=>{
      const h = document.createElement('div'); h.textContent = sec.name;
      h.style.cssText = 'font:700 13px Cinzel,serif;color:#f4d8a0;margin:12px 2px 7px;border-bottom:1px solid #3a3556;padding-bottom:4px;';
      _shopBodyEl.appendChild(h);
      (sec.items || []).forEach(it=> _shopBodyEl.appendChild(_shopRow(it, 'buy')));
    });
  } else {
    const sellable = (inventory || []).filter(s=> catalog[s.item]);
    if(!sellable.length){
      const e = document.createElement('div');
      e.textContent = 'Mochila vazia. Cace, junte troféus e volte pra vender.';
      e.style.cssText = 'color:#9b95b5;font-size:13px;padding:14px 4px;';
      _shopBodyEl.appendChild(e);
    } else sellable.forEach(s=> _shopBodyEl.appendChild(_shopRow(s, 'sell')));
  }
}
let _courariaEl = null, _courariaBodyEl = null;
function closeCouraria(){ if(_courariaEl){ _courariaEl.remove(); _courariaEl = null; _courariaBodyEl = null; } }
function openCouraria(d){
  d = d || {};
  if(typeof d.wallet === 'number') updateWallet(d.wallet);
  if(_courariaEl){ renderCourariaBody(_courariaBodyEl, d); return; }
  const ov = _overlay(); const box = _box(440);
  box.style.cssText += ';padding:0;display:flex;flex-direction:column;max-height:86vh;';
  const hd = document.createElement('div');
  hd.style.cssText = 'display:flex;align-items:center;gap:10px;padding:16px 18px 10px;border-bottom:1px solid #2a2540;';
  const ti = document.createElement('div'); ti.textContent = d.title || 'Couraria do Valdir';
  ti.style.cssText = 'font:700 19px Cinzel,serif;color:#d8a86a;flex:1 1 auto;';
  const wl = document.createElement('div'); wl.id = '_courwallet'; wl.style.cssText = 'font:600 13px Inter;color:#f4b860;';
  wl.textContent = (d.wallet||0).toLocaleString('pt-BR') + ' \ud83d\udfe4';
  const x = _btn('\u2715', false); x.style.cssText += ';padding:4px 10px;'; x.onclick = closeCouraria;
  hd.appendChild(ti); hd.appendChild(wl); hd.appendChild(x); box.appendChild(hd);
  _courariaBodyEl = document.createElement('div');
  _courariaBodyEl.style.cssText = 'padding:12px 18px 18px;overflow-y:auto;';
  box.appendChild(_courariaBodyEl);
  renderCourariaBody(_courariaBodyEl, d);
  ov.appendChild(box); document.body.appendChild(ov); _courariaEl = ov;
  ov.addEventListener('click', e=>{ if(e.target === ov) closeCouraria(); });
}
function renderCourariaBody(body, d){
  if(!body) return;
  const wl = document.getElementById('_courwallet'); if(wl && typeof d.wallet === 'number') wl.textContent = d.wallet.toLocaleString('pt-BR') + ' \ud83d\udfe4';
  let h = '';
  if(d.greet) h += '<div style="font-size:13px;color:#c9c4dc;font-style:italic;line-height:1.4;margin-bottom:12px">"'+esc(d.greet)+'"</div>';
  const list = d.items || [];
  if(!list.length){
    body.innerHTML = h + '<div style="color:#9b95b4;font-size:12.5px;line-height:1.5;padding:8px 0">Você não tem couro de bicho na mochila. O Valdir compra pele e presa de <b style="color:#d8a86a">lobo, javali, hiena, abutre</b> e afins por 5x o preço normal.</div>';
    return;
  }
  h += '<div style="font:600 11px Inter;color:#8a86a0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Couro de bicho · paga 5x</div>';
  body.innerHTML = h;
  list.forEach(it=>{
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px;border-radius:9px;background:#1b1828;margin-bottom:7px;';
    const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40;
    cv.style.cssText = 'flex:0 0 auto;border:1px solid #34304f;border-radius:7px;background:#0f0e17;';
    try{ drawItemIcon(cv.getContext('2d'), 20, 20, 40, it.item, false); }catch(e){}
    row.appendChild(cv);
    const mid = document.createElement('div'); mid.style.cssText = 'flex:1 1 auto;min-width:0;';
    mid.innerHTML = '<div style="font:600 13px Inter;color:#e8e2f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(it.name)+'</div>'+
      '<div style="font-size:11px;color:#d8a86a">'+it.unit+' \ud83d\udfe4 cada · você tem '+it.qty+'</div>';
    row.appendChild(mid);
    const btns = document.createElement('div'); btns.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:0 0 auto';
    const b1 = _btn('Vender', true); b1.style.cssText += ';padding:4px 10px;font-size:11px;';
    b1.onclick = ()=> socket.emit('couraria_sell', {item: it.item});
    btns.appendChild(b1);
    if(it.qty > 1){
      const ba = _btn('Tudo ('+it.qty+')', true); ba.style.cssText += ';padding:4px 10px;font-size:11px;';
      ba.onclick = ()=> socket.emit('couraria_sell', {item: it.item, all: true});
      btns.appendChild(ba);
    }
    row.appendChild(btns);
    body.appendChild(row);
  });
}
let _xamaEl = null, _xamaBodyEl = null;
function closeXama(){ if(_xamaEl){ _xamaEl.remove(); _xamaEl = null; _xamaBodyEl = null; } }
function openXama(d){
  d = d || {};
  if(myFicha && typeof d.protection === 'number') myFicha.death_protect = d.protection;
  if(_xamaEl){ renderXamaBody(_xamaBodyEl, d); return; }    // ja aberta: so atualiza
  const ov = _overlay(); const box = _box(440);
  box.style.cssText += ';padding:0;display:flex;flex-direction:column;max-height:86vh;';
  const hd = document.createElement('div');
  hd.style.cssText = 'display:flex;align-items:center;gap:10px;padding:16px 18px 10px;border-bottom:1px solid #2a2540;';
  const ti = document.createElement('div'); ti.textContent = d.title || 'Xamã Miranda';
  ti.style.cssText = 'font:700 19px Cinzel,serif;color:#9bd6a0;flex:1 1 auto;';
  const x = _btn('✕', false); x.style.cssText += ';padding:4px 10px;'; x.onclick = closeXama;
  hd.appendChild(ti); hd.appendChild(x); box.appendChild(hd);
  _xamaBodyEl = document.createElement('div');
  _xamaBodyEl.style.cssText = 'padding:12px 18px 18px;overflow-y:auto;';
  box.appendChild(_xamaBodyEl);
  renderXamaBody(_xamaBodyEl, d);
  ov.appendChild(box); document.body.appendChild(ov); _xamaEl = ov;
  ov.addEventListener('click', e=>{ if(e.target === ov) closeXama(); });
}
function renderXamaBody(body, d){
  if(!body) return;
  const prot = d.protection||0, max = d.max||50, eff = Math.max(0, 50-prot);
  let h = '';
  if(d.greet) h += '<div style="font-size:13px;color:#c9c4dc;font-style:italic;line-height:1.4;margin-bottom:12px">"'+esc(d.greet)+'"</div>';
  h += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">'+
    '<span style="font:600 11px Inter;color:#9bd6a0;text-transform:uppercase;letter-spacing:.5px">Proteção pra próxima morte</span>'+
    '<span style="font:700 14px Cinzel,serif;color:#9bd6a0">'+prot+'% / '+max+'%</span></div>';
  h += '<div style="height:10px;background:#1b1830;border:1px solid #34304f;border-radius:6px;overflow:hidden;margin-bottom:6px">'+
    '<div style="height:100%;width:'+Math.min(100,prot/max*100).toFixed(0)+'%;background:linear-gradient(90deg,#4a8a5a,#8fd6a0);border-radius:6px"></div></div>';
  h += '<div style="font-size:11px;color:#8a86a0;line-height:1.45;margin-bottom:14px">Ao morrer você perde metade do progresso do nível. A proteção desconta disso: com <b style="color:#9bd6a0">'+prot+'%</b> você perderia <b style="color:#e8e2f0">'+eff+'%</b> em vez de 50%. Vale por uma morte.</div>';
  h += '<div style="font:600 11px Inter;color:#8a86a0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Oferendas aceitas</div>';
  body.innerHTML = h;
  (d.items||[]).forEach(it=>{
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px;border-radius:9px;background:#1b1828;margin-bottom:7px;';
    const cv = document.createElement('canvas'); cv.width=40; cv.height=40;
    cv.style.cssText = 'flex:0 0 auto;border:1px solid #34304f;border-radius:7px;background:#0f0e17;';
    try{ drawItemIcon(cv.getContext('2d'), 20, 20, 40, it.item, false); }catch(e){}
    row.appendChild(cv);
    const mid = document.createElement('div'); mid.style.cssText='flex:1 1 auto;min-width:0;';
    mid.innerHTML = '<div style="font:600 13px Inter;color:#e8e2f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(it.name)+'</div>'+
      '<div style="font-size:11px;color:#9bd6a0">+'+it.protect+'% de proteção · você tem '+it.qty+'</div>';
    row.appendChild(mid);
    const can = it.qty>0 && prot<max;
    const b = _btn(can?'Oferecer':(prot>=max?'No máximo':'Não tem'), can);
    b.style.cssText += ';padding:5px 12px;font-size:12px;';
    if(!can){ b.disabled=true; b.style.opacity='.5'; b.style.cursor='default'; }
    else b.onclick = ()=> socket.emit('xama_offer', {item: it.item});
    row.appendChild(b);
    body.appendChild(row);
  });
}
function openShop(d){
  shopData = d || {}; shopTab = 'buy';
  if(typeof d.wallet === 'number') updateWallet(d.wallet);
  if(_shopEl) _shopEl.remove();
  const ov = _overlay(); const box = _box(440);
  box.style.cssText += ';padding:0;display:flex;flex-direction:column;max-height:86vh;';
  const hd = document.createElement('div');
  hd.style.cssText = 'display:flex;align-items:center;gap:10px;padding:16px 18px 10px;border-bottom:1px solid #2a2540;';
  const ti = document.createElement('div'); ti.textContent = d.title || 'Armas Peteco';
  ti.style.cssText = 'font:700 19px Cinzel,serif;color:#f4d8a0;flex:1 1 auto;';
  _shopWalletEl = document.createElement('div'); _shopWalletEl.style.cssText = 'font:600 13px Inter,sans-serif;color:#f4b860;';
  const x = _btn('✕', false); x.style.cssText += ';padding:4px 10px;'; x.onclick = closeShop;
  hd.appendChild(ti); hd.appendChild(_shopWalletEl); hd.appendChild(x); box.appendChild(hd);
  const tabs = document.createElement('div'); tabs.style.cssText = 'display:flex;gap:8px;padding:10px 18px 0;';
  const tBuy = _btn('Comprar', true), tSell = _btn('Vender', false);
  [tBuy, tSell].forEach(b=> b.style.cssText += ';padding:7px 16px;font-size:13px;');
  const setTab = (t)=>{ shopTab = t;
    tBuy.style.background = t === 'buy' ? 'linear-gradient(180deg,#9b6dff,#7d4fe0)' : '#241f36';
    tBuy.style.color = t === 'buy' ? '#fff' : '#c9c4dc';
    tSell.style.background = t === 'sell' ? 'linear-gradient(180deg,#9b6dff,#7d4fe0)' : '#241f36';
    tSell.style.color = t === 'sell' ? '#fff' : '#c9c4dc';
    _renderShopBody();
  };
  tBuy.onclick = ()=> setTab('buy'); tSell.onclick = ()=> setTab('sell');
  tabs.appendChild(tBuy); tabs.appendChild(tSell); box.appendChild(tabs);
  _shopBodyEl = document.createElement('div');
  _shopBodyEl.style.cssText = 'flex:1 1 auto;overflow-y:auto;padding:8px 18px 18px;';
  box.appendChild(_shopBodyEl);
  ov.appendChild(box); document.body.appendChild(ov); _shopEl = ov;
  ov.addEventListener('click', e=>{ if(e.target === ov) closeShop(); });
  _updateShopWallet(); _renderShopBody();
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
// Tabela de XP 5e (espelha o servidor) + progresso no nivel atual.
// MESMA curva do servidor (game/leveling.py). Tem que bater EXATO, senao a barra
// mostra nivel/progresso errado. Do 10 ao 20 a curva e brutal de proposito.
const XP_TABLE = [0, 0, 50, 150, 350, 700,
                  1300, 2300, 4000, 6500, 12000,
                  260000, 700000, 1400000, 2700000, 4800000,
                  8300000, 14400000, 24700000, 42200000, 72000000];
function xpProgress(xp){
  xp = xp||0; let lvl=1;
  for(let L=2;L<=20;L++){ if(xp>=XP_TABLE[L]) lvl=L; else break; }
  if(lvl>=20) return {lvl:20, cur:0, need:0, pct:1};
  const base=XP_TABLE[lvl], nxt=XP_TABLE[lvl+1];
  return {lvl, cur:xp-base, need:nxt-base, pct:(xp-base)/(nxt-base)};
}
function fmtXP(n){
  n = n||0;
  if(n >= 1000000) return (n/1000000).toFixed(n%1000000===0?0:1).replace('.',',')+'M';
  if(n >= 10000)   return Math.round(n/1000)+'k';
  return n.toLocaleString('pt-BR');
}
// Marcas/titulos (vindas de flags da ficha). Mais virao ao longo do dev.
const MARCAS = [
  {flag:'blessing_pofnir', icon:'🛡️', name:'Amigo do Pof', desc:'O Pofnir te abençoou em Valoran. Você carrega um pedaço da luz dele (+5 de vida máxima).'},
  {flag:'banned_valoran',  icon:'💀', name:'Deixou o Pofnir Ansioso', desc:'Você insistiu no trono do Criador. Foi obliterado e está banido de Valoran.'},
];
let fichaTab = 'geral';

function _fichaLine(k,v){
  return '<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;margin:3px 0">'+
    '<span style="color:#9b95b4">'+k+'</span><span style="color:#e8e4f0;text-align:right">'+esc(v)+'</span></div>';
}
function _bar(pct, grad){
  pct = Math.max(0, Math.min(1, pct||0));
  return '<div style="height:9px;background:#1b1830;border:1px solid #34304f;border-radius:6px;overflow:hidden">'+
    '<div style="height:100%;width:'+(pct*100).toFixed(1)+'%;background:'+grad+';border-radius:6px"></div></div>';
}
function _attrCells(attrs){
  return ATTR_ORDER.map(a=>{
    const v = attrs[a]; if(v==null) return '';
    const m = Math.floor((v-10)/2);
    return '<div style="text-align:center;padding:6px 2px;background:#1b1830;border:1px solid #34304f;border-radius:8px">'+
      '<div style="font:700 10px Inter;color:#9b6dff;letter-spacing:.5px">'+a+'</div>'+
      '<div style="font:700 17px Cinzel,serif;line-height:1.1">'+v+'</div>'+
      '<div style="font:600 10px Inter;color:#8a86a0">'+((m>=0?'+':'')+m)+'</div></div>';
  }).join('');
}

function _fichaGeral(f){
  const hasClass = !!f.class_id;
  const attrs = hasClass ? (f.attrs_final||{}) : (f.attrs||{});
  let h = _fichaLine('Raça', f.race_name || '—');
  if(hasClass){
    h += _fichaLine('Classe', f.class_name + (f.god ? ' · ' + f.god : ' · sem deus'));
    const pr = xpProgress(f.xp||0);
    h += '<div style="margin:10px 0 4px;display:flex;justify-content:space-between;align-items:baseline">'+
      '<span style="font:700 15px Cinzel,serif;color:#f4d8a0">Nível '+(f.level||1)+'</span>'+
      '<span style="font-size:11px;color:#8a86a0">'+(pr.need? (fmtXP(pr.cur)+' / '+fmtXP(pr.need)+' XP · '+Math.floor(pr.pct*100)+'%') : 'nível máximo')+'</span></div>';
    h += _bar(pr.pct, 'linear-gradient(90deg,#9b6dff,#c9a0ff)');
    h += '<div style="margin:10px 0 4px;display:flex;justify-content:space-between;align-items:baseline">'+
      '<span style="color:#9b95b4;font-size:13px">Vida</span>'+
      '<span style="font:700 14px Cinzel,serif;color:#e85d75">❤ '+(f.hp!=null?f.hp:'?')+' / '+(f.hp_max!=null?f.hp_max:'?')+'</span></div>';
    h += _bar(f.hp_max? (f.hp/f.hp_max):0, 'linear-gradient(90deg,#e85d75,#ff8aa0)');
    if(f.death_protect > 0){
      h += '<div style="margin:10px 0 2px;display:flex;justify-content:space-between;align-items:baseline;gap:8px">'+
        '<span style="color:#9bd6a0;font-size:13px">🛡️ Proteção da Xamã</span>'+
        '<span style="font:700 12px Cinzel,serif;color:#9bd6a0;text-align:right">'+f.death_protect+'% · perde '+Math.max(0,50-f.death_protect)+'% na próxima morte</span></div>';
    }
    h += '<div style="margin-top:8px">'+_fichaLine('Proficiência', '+'+(f.prof||2))+'</div>';
    if((f.pending_asi||[]).length){
      h += '<button id="ficha-asi" style="width:100%;margin-top:10px;padding:9px;border-radius:9px;border:1px solid #9b6dff;'+
        'background:linear-gradient(180deg,#7d4fe0,#5e3bb0);color:#fff;font:700 12.5px Inter;cursor:pointer">'+
        '⬆ Escolher melhoria de nível ('+f.pending_asi.length+')</button>';
    }
  } else {
    h += '<div style="font-size:12.5px;color:#9b95b4;margin:8px 0;line-height:1.4">'+
      'Sem classe ainda. Fale com o corvo (no Ermo) pra ir ao Salão das Classes e escolher um mestre.'+
      (f.xp? '<br><br>Você já tem <b style="color:#c9a0ff">'+f.xp+' XP</b> guardado de tanto explorar. Vira nível quando escolher a classe.':'')+'</div>';
  }
  h += '<div style="font:600 11px Inter;color:#8a86a0;margin:14px 0 6px;letter-spacing:.5px;text-transform:uppercase">'+
    (hasClass?'Atributos (com a classe)':'Atributos (da raça)')+'</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">'+_attrCells(attrs)+'</div>';
  return h;
}

function _fichaPassivas(f){
  let h = '<div style="font:600 11px Inter;color:#8a86a0;margin:2px 0 6px;letter-spacing:.5px;text-transform:uppercase">Traços de raça</div>';
  const race = (typeof RACES!=='undefined') ? RACES.find(r=>r.id===f.race) : null;
  if(race && race.traits){
    h += race.traits.split(';').map(s=>s.trim()).filter(Boolean).map(t=>{
      const m = t.match(/^([^(]+?)(\s*\((.+)\))?$/);
      const nome = m? m[1].trim() : t;
      const desc = (m && m[3]) ? m[3].trim() : '';
      return '<div style="margin:0 0 7px;padding:8px 10px;background:#1b1830;border:1px solid #2e2a47;border-radius:9px">'+
        '<div style="font:700 12.5px Inter;color:#c9a0ff">'+esc(nome)+'</div>'+
        (desc? '<div style="font-size:11.5px;color:#9b95b4;margin-top:2px;line-height:1.35">'+esc(desc)+'</div>':'')+'</div>';
    }).join('');
  } else {
    h += '<div style="font-size:12px;color:#9b95b4;margin-bottom:8px">Sem traços (ou raça não definida).</div>';
  }
  // habilidades de classe (features por nivel; liberadas em destaque, futuras esmaecidas)
  if(f.class_id && classFeaturesData[f.class_id]){
    const lvl = f.level||1;
    const list = classFeaturesData[f.class_id].slice().sort((a,b)=> a[0]-b[0]);
    h += '<div style="font:600 11px Inter;color:#8a86a0;margin:14px 0 6px;letter-spacing:.5px;text-transform:uppercase">Habilidades de '+esc(f.class_name||'classe')+'</div>';
    h += list.map(ft=>{
      const flv=ft[0], nome=ft[1], desc=ft[2], unlocked = flv<=lvl;
      return '<div style="margin:0 0 7px;padding:8px 10px;background:#1b1830;border:1px solid #2e2a47;border-radius:9px;opacity:'+(unlocked?'1':'0.42')+'">'+
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">'+
        '<span style="font:700 12.5px Inter;color:'+(unlocked?'#c9a0ff':'#8a86a0')+'">'+esc(nome)+'</span>'+
        '<span style="font:700 9.5px Inter;color:#7c7790;white-space:nowrap">Nv '+flv+'</span></div>'+
        '<div style="font-size:11.5px;color:#9b95b4;margin-top:2px;line-height:1.35">'+esc(desc)+'</div></div>';
    }).join('');
  } else if(f.class_id){
    h += '<div style="font-size:12px;color:#7c7790;margin-top:12px">Habilidades carregando…</div>';
  }
  // talentos pegos no feat-or-ASI
  if(f.feats && f.feats.length){
    h += '<div style="font:600 11px Inter;color:#8a86a0;margin:14px 0 6px;letter-spacing:.5px;text-transform:uppercase">Talentos</div>';
    h += f.feats.map(fid=>{
      const fd = featsCatalog.find(x=>x.id===fid);
      return fd? '<div style="margin:0 0 7px;padding:8px 10px;background:#1f1b33;border:1px solid #3a3556;border-radius:9px">'+
        '<div style="font:700 12.5px Inter;color:#f4d8a0">★ '+esc(fd.name)+'</div>'+
        '<div style="font-size:11.5px;color:#9b95b4;margin-top:2px;line-height:1.35">'+esc(fd.desc)+'</div></div>' : '';
    }).join('');
  }
  h += _fichaTransform(f);
  return h;
}

function _fichaTransform(f){
  let forms = (f.class_id && transformsData[f.class_id]) ? transformsData[f.class_id] : [];
  forms = forms.filter(fm=> !fm.requires || f[fm.requires]);   // respeita requisitos (ex: benção do Pof)
  if(!f.class_id) return '';                    // sem classe ainda
  if(!forms.length){                            // classe sem forma: mostra aviso (pra ser achavel)
    return '<div style="font:600 11px Inter;color:#8a86a0;margin:16px 0 6px;letter-spacing:.5px;text-transform:uppercase">Transformação</div>'+
      '<div style="font-size:11.5px;color:#7c7790;line-height:1.4;padding:3px 0">Sua classe não assume outras formas. Por enquanto só o <b style="color:#9b95b4">Druida</b> tem a Forma Selvagem (🐺 Lobo, 🐻 Urso, 🦅 Águia).</div>';
  }
  const active = f.form || null;
  let h = '<div style="font:600 11px Inter;color:#8a86a0;margin:16px 0 6px;letter-spacing:.5px;text-transform:uppercase">Transformação</div>';
  if(active){
    const af = forms.find(x=> x.id===active);
    h += '<div style="margin:0 0 8px;padding:9px 11px;background:linear-gradient(135deg,#2a2140,#1f1b33);border:1px solid #6d4ea0;border-radius:10px;display:flex;align-items:center;gap:10px">'+
      '<span style="font-size:22px;line-height:1">'+(af?af.icon:'✦')+'</span>'+
      '<div style="flex:1;min-width:0"><div style="font:700 13px Cinzel,serif;color:#c9a0ff">Transformado: '+esc(af?af.name:active)+'</div>'+
      '<div style="font-size:11px;color:#9b95b4;margin-top:1px;line-height:1.3">'+(af?esc(af.desc):'')+'</div></div></div>';
    h += '<button data-form="" style="width:100%;padding:8px;margin-bottom:10px;background:#2a2433;border:1px solid #4a4360;border-radius:9px;color:#d8d2e8;font:600 12px Inter;cursor:pointer">↺ Voltar à forma normal</button>';
  }
  h += forms.map(fm=>{
    const on = fm.id===active;
    return '<div style="margin:0 0 7px;padding:9px 11px;background:'+(on?'#241d38':'#1b1830')+';border:1px solid '+(on?'#6d4ea0':'#2e2a47')+';border-radius:9px;display:flex;align-items:center;gap:9px">'+
      '<span style="font-size:18px;line-height:1">'+fm.icon+'</span>'+
      '<div style="flex:1;min-width:0"><div style="font:700 12.5px Inter;color:#e0c98a">'+esc(fm.name)+'</div>'+
      '<div style="font-size:11px;color:#9b95b4;margin-top:1px;line-height:1.3">'+esc(fm.desc)+'</div></div>'+
      (on ? '<span style="font:700 10px Inter;color:#c9a0ff;white-space:nowrap">ATIVA</span>'
          : '<button data-form="'+esc(fm.id)+'" style="flex:0 0 auto;padding:5px 12px;background:#3a2f55;border:1px solid #6d4ea0;border-radius:7px;color:#e8e2ff;font:600 11px Inter;cursor:pointer">Assumir</button>')+
      '</div>';
  }).join('');
  h += '<div style="font-size:10.5px;color:#6f6a86;margin-top:2px;line-height:1.3">A forma vale no combate (muda armadura, dano, deslocamento ou acerto). Pode trocar quando quiser.</div>';
  return h;
}

function _fichaMarcas(f){
  const got = MARCAS.filter(m=> f[m.flag]);
  if(!got.length){
    return '<div style="font-size:12.5px;color:#9b95b4;line-height:1.5;padding:8px 0">'+
      'Nenhuma marca ainda.<br>As marcas são títulos que você ganha pelas suas escolhas e feitos no mundo do Ermo.</div>';
  }
  return got.map(m=>
    '<div style="display:flex;gap:10px;align-items:flex-start;margin:0 0 9px;padding:9px 11px;background:#1b1830;border:1px solid #2e2a47;border-radius:10px">'+
    '<div style="font-size:20px;line-height:1">'+m.icon+'</div>'+
    '<div><div style="font:700 13px Cinzel,serif;color:#f4d8a0">'+esc(m.name)+'</div>'+
    '<div style="font-size:11.5px;color:#9b95b4;margin-top:2px;line-height:1.35">'+esc(m.desc)+'</div></div></div>'
  ).join('');
}

function renderFicha(){
  if(!fichaPanel) return;
  const f = myFicha || {};
  const tabBtn = (name,label)=>{
    const on = fichaTab===name;
    return '<button data-tab="'+name+'" style="flex:1;padding:7px 4px;font:700 11.5px Inter;cursor:pointer;'+
      'border:none;border-bottom:2px solid '+(on?'#9b6dff':'transparent')+';background:none;'+
      'color:'+(on?'#e8e4f0':'#8a86a0')+'">'+label+'</button>';
  };
  let h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
    '<div style="font:700 16px Cinzel,serif;color:#f4d8a0">Ficha</div>'+
    '<button id="ficha-x" style="background:none;border:none;color:#9b95b4;font-size:18px;cursor:pointer">×</button></div>';
  const caster = f.class_id && SPELL_CLASSES.has(f.class_id);
  if(fichaTab==='grimorio' && !caster) fichaTab='geral';   // trocou de classe? volta
  h += '<div style="display:flex;gap:2px;margin-bottom:12px;border-bottom:1px solid #2a2742">'+
    tabBtn('geral','Geral')+tabBtn('passivas','Passivas')+
    (caster ? tabBtn('grimorio','Grimório') : '')+tabBtn('marcas','Marcas')+'</div>';
  if(fichaTab==='geral') h += _fichaGeral(f);
  else if(fichaTab==='passivas') h += _fichaPassivas(f);
  else if(fichaTab==='grimorio') h += _fichaGrimorio();
  else h += _fichaMarcas(f);
  fichaPanel.innerHTML = h;
  const x = document.getElementById('ficha-x'); if(x) x.onclick = ()=> toggleFicha(false);
  const ab = document.getElementById('ficha-asi'); if(ab) ab.onclick = ()=> maybeOpenAsi();
  fichaPanel.querySelectorAll('[data-tab]').forEach(b=>
    b.onclick = ()=>{ const t=b.getAttribute('data-tab'); if(t==='grimorio') grimoireData=null; fichaTab=t; renderFicha(); });
  fichaPanel.querySelectorAll('[data-gtog]').forEach(b=>
    b.onclick = ()=> toggleGrimoire(b.getAttribute('data-gtog')));
  fichaPanel.querySelectorAll('[data-form]').forEach(b=>
    b.onclick = ()=>{ const fid=b.getAttribute('data-form'); socket.emit('set_form', { form: fid || null }); });
  const gsv = document.getElementById('grim-save'); if(gsv) gsv.onclick = saveGrimoire;
  if(fichaTab==='grimorio' && grimoireData===null) socket.emit('grimoire_get');
}

function _fichaGrimorio(){
  const g = grimoireData;
  if(!g) return '<div style="padding:14px;text-align:center;color:#9b95b4;font-size:12px">Abrindo o grimório…</div>';
  if(!g.caster) return '<div style="padding:14px;color:#9b95b4;font-size:12px">Sua classe não conjura magias.</div>';
  if(!grimoireSel){ grimoireSel = { cantrips:new Set(g.chosen.cantrips||[]), spells:new Set(g.chosen.spells||[]) }; }
  const sel = grimoireSel, slots = g.slots || {};
  const slotFor = (lvl)=>{ for(let L=lvl; L<=9; L++){ const s=slots[String(L)]; if(s && s.cur>0) return true; } return false; };
  const kindTxt = g.kind==='prepare' ? 'Você <b style="color:#c9a0ff">prepara</b> magias da lista da classe.'
                : 'Você <b style="color:#c9a0ff">conhece</b> estas magias.';
  const spLabel = g.kind==='prepare' ? 'preparadas' : 'conhecidas';
  let h = '<div style="font:600 11.5px Inter;color:#9b95b4;margin:2px 0 8px;line-height:1.4">'+kindTxt+'</div>';
  const ctOk = sel.cantrips.size<=g.cantrip_limit, spOk = sel.spells.size<=g.spell_limit;
  h += '<div style="display:flex;gap:8px;margin-bottom:8px">'+
    '<div style="flex:1;text-align:center;background:#1b1830;border:1px solid #2e2a47;border-radius:9px;padding:6px">'+
      '<div style="font:700 10px Inter;color:#9b6dff">TRUQUES</div>'+
      '<div style="font:700 14px Cinzel,serif;color:'+(ctOk?'#e8e4f0':'#ff7a7a')+'">'+sel.cantrips.size+'/'+g.cantrip_limit+'</div></div>'+
    '<div style="flex:1;text-align:center;background:#1b1830;border:1px solid #2e2a47;border-radius:9px;padding:6px">'+
      '<div style="font:700 10px Inter;color:#9b6dff">'+spLabel.toUpperCase()+'</div>'+
      '<div style="font:700 14px Cinzel,serif;color:'+(spOk?'#e8e4f0':'#ff7a7a')+'">'+sel.spells.size+'/'+g.spell_limit+'</div></div></div>';
  const slvls = Object.keys(slots).map(Number).sort((a,b)=> a-b);
  if(slvls.length){
    h += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px">'+slvls.map(L=>{
      const s=slots[String(L)];
      return '<span style="font:600 10.5px Inter;color:#c9a0ff;background:#241d44;border:1px solid #473e6e;border-radius:7px;padding:3px 7px">N'+L+' '+s.cur+'/'+s.max+'</span>';
    }).join('')+'</div>';
  }
  const colHead = (left)=> '<div style="display:flex;align-items:center;justify-content:space-between;margin:11px 2px 3px;'+
    'font:700 10px Inter;color:#6c688a;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #2a2742;padding-bottom:3px">'+
    '<span>'+left+'</span><span>Usável</span></div>';
  const row = (sp, isCantrip)=>{
    const on = (isCantrip?sel.cantrips:sel.spells).has(sp.id);
    const usable = isCantrip ? true : (on && slotFor(sp.level));
    const tag = sp.range==='self'?'você':(sp.range==='ranged'?'distância':'corpo a corpo');
    const tagCol = sp.range==='self'?'#5ec27a':(sp.range==='ranged'?'#c9a0ff':'#f4b860');
    const ubadge = isCantrip
       ? '<span style="font:700 9.5px Inter;color:#5ec27a">à vontade</span>'
       : (on ? (usable? '<span style="font:700 9.5px Inter;color:#5ec27a">✓ sim</span>'
                      : '<span style="font:700 9.5px Inter;color:#6c688a">sem espaço</span>')
             : '<span style="font:700 9.5px Inter;color:#403c5a">—</span>');
    return '<div style="display:flex;align-items:center;gap:8px;margin:4px 0">'+
      '<button data-gtog="'+(isCantrip?'c':'s')+':'+sp.id+'" style="flex:1;text-align:left;padding:7px 9px;border-radius:9px;cursor:pointer;'+
        'border:1px solid '+(on?'#9b6dff':'#2e2a47')+';background:'+(on?'#241d44':'#15131f')+';color:'+(on?'#e8e4f0':'#b8b2cf')+'">'+
        '<div style="display:flex;align-items:center;gap:6px"><span style="font:700 12px Inter">'+(on?'◉ ':'○ ')+esc(sp.name)+'</span>'+
        '<span style="font:600 9.5px Inter;color:'+tagCol+'">'+tag+'</span></div>'+
        '<div style="font:500 10px Inter;color:#9b95b4;margin-top:2px">'+esc(sp.desc)+'</div></button>'+
      '<div style="width:62px;text-align:right">'+ubadge+'</div></div>';
  };
  if((g.pool.cantrips||[]).length){
    h += colHead('Truques');
    h += g.pool.cantrips.map(sp=> row(sp, true)).join('');
  }
  const byLvl = g.pool.by_level || {};
  Object.keys(byLvl).map(Number).sort((a,b)=> a-b).forEach(L=>{
    const s = slots[String(L)];
    h += colHead((g.kind==='prepare'?'Preparar':'Conhecer')+' · Nível '+L+(s?(' · '+s.cur+'/'+s.max):''));
    h += byLvl[String(L)].map(sp=> row(sp, false)).join('');
  });
  h += '<button id="grim-save" style="width:100%;margin-top:12px;padding:11px;border-radius:10px;border:none;cursor:pointer;'+
    'background:linear-gradient(180deg,#7d4fe0,#5e3bb0);color:#fff;font:700 14px Inter">Salvar Grimório</button>';
  h += '<div style="text-align:center;font-size:10px;color:#6c688a;margin-top:6px">'+
    (g.kind==='prepare'?'prepare suas magias antes de entrar em combate':'escolha quais magias você conhece')+'</div>';
  return h;
}

function toggleGrimoire(key){
  if(!grimoireData || !grimoireSel) return;
  const i = key.indexOf(':'); const typ = key.slice(0,i), id = key.slice(i+1);
  const set = typ==='c' ? grimoireSel.cantrips : grimoireSel.spells;
  const lim = typ==='c' ? grimoireData.cantrip_limit : grimoireData.spell_limit;
  if(set.has(id)){ set.delete(id); }
  else {
    if(set.size >= lim){ toastMsg('Limite atingido ('+lim+'). Remova uma antes.', true); return; }
    set.add(id);
  }
  renderFicha();
}

function saveGrimoire(){
  if(!grimoireSel) return;
  socket.emit('set_grimoire', { cantrips:[...grimoireSel.cantrips], spells:[...grimoireSel.spells] });
  toastMsg('Grimório salvo.');
}

// ---- escolha de melhoria de nível: +2/+1 em atributos OU um talento (BG3) ----
let asiChooserOpen = false;
function openAsiChooser(level){
  if(asiChooserOpen) return;
  asiChooserOpen = true;
  const st = { path:'asi', asiMode:'one', picks:[], feat:null, featAttr:null };
  const overlay = document.createElement('div');
  overlay.id = 'asi-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(8,7,15,.8);'+
    'display:flex;align-items:center;justify-content:center;padding:18px;font-family:Inter,sans-serif;';
  overlay.onclick = e=>{ if(e.target===overlay) closeAsiChooser(); };
  const card = document.createElement('div');
  card.style.cssText = 'width:382px;max-width:100%;max-height:88vh;overflow:auto;background:#15131f;'+
    'border:1px solid #3a3556;border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.6);padding:18px 20px;color:#e8e4f0;';
  overlay.appendChild(card); document.body.appendChild(overlay);
  const attrs = myFicha.attrs_final || {};

  function canConfirm(){
    if(st.path==='asi') return st.asiMode==='one' ? st.picks.length===1 : st.picks.length===2;
    if(!st.feat) return false;
    const fd = featsCatalog.find(x=>x.id===st.feat);
    if(fd && fd.plus1 && fd.plus1.length>1) return !!st.featAttr;
    return true;
  }
  function render(){
    let h = '<div style="font:700 12px Inter;letter-spacing:1.5px;color:#c9a0ff;text-transform:uppercase">Nível '+level+'</div>';
    h += '<div style="font:800 19px Cinzel,serif;color:#f4d8a0;margin:2px 0 12px">Escolha sua melhoria</div>';
    const pbtn=(p,l)=> '<button data-path="'+p+'" style="flex:1;padding:8px;border-radius:9px;cursor:pointer;border:1px solid '+(st.path===p?'#9b6dff':'#2e2a47')+';background:'+(st.path===p?'#241d44':'#1b1830')+';color:'+(st.path===p?'#e8e4f0':'#9b95b4')+';font:700 12.5px Inter">'+l+'</button>';
    h += '<div style="display:flex;gap:8px;margin-bottom:14px">'+pbtn('asi','Atributos')+pbtn('feat','Talento')+'</div>';
    if(st.path==='asi'){
      const mbtn=(m,l)=> '<button data-mode="'+m+'" style="flex:1;padding:6px;border-radius:8px;cursor:pointer;border:1px solid '+(st.asiMode===m?'#9b6dff':'#2e2a47')+';background:none;color:'+(st.asiMode===m?'#e8e4f0':'#8a86a0')+';font:600 11.5px Inter">'+l+'</button>';
      h += '<div style="display:flex;gap:6px;margin-bottom:10px">'+mbtn('one','+2 num atributo')+mbtn('two','+1 em dois')+'</div>';
      h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px">'+ATTR_ORDER.map(a=>{
        const sel=st.picks.includes(a), v=attrs[a]||10, inc=st.asiMode==='one'?2:1;
        return '<button data-attr="'+a+'" style="padding:8px 2px;border-radius:9px;cursor:pointer;text-align:center;border:1px solid '+(sel?'#9b6dff':'#34304f')+';background:'+(sel?'#241d44':'#1b1830')+'">'+
          '<div style="font:700 10px Inter;color:#9b6dff">'+a+'</div>'+
          '<div style="font:700 15px Cinzel,serif;color:#e8e4f0">'+v+(sel?' →'+Math.min(20,v+inc):'')+'</div></button>';
      }).join('')+'</div>';
      h += '<div style="font-size:11px;color:#8a86a0;margin-top:8px">'+(st.asiMode==='one'?'Escolha 1 atributo para +2.':'Escolha 2 atributos para +1 cada.')+'</div>';
    } else {
      h += featsCatalog.map(fd=>{
        const sel=st.feat===fd.id;
        let sub='';
        if(sel && fd.plus1 && fd.plus1.length>1){
          sub = '<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:5px">'+fd.plus1.map(a=>
            '<button data-featattr="'+a+'" style="padding:4px 9px;border-radius:7px;cursor:pointer;border:1px solid '+(st.featAttr===a?'#9b6dff':'#34304f')+';background:'+(st.featAttr===a?'#241d44':'#1b1830')+';color:#e8e4f0;font:700 11px Inter">+1 '+a+'</button>').join('')+'</div>';
        } else if(sel && fd.plus1 && fd.plus1.length===1){
          sub = '<div style="margin-top:5px;font-size:11px;color:#c9a0ff">+1 '+fd.plus1[0]+'</div>';
        }
        return '<div data-feat="'+fd.id+'" style="margin:0 0 7px;padding:9px 11px;border-radius:9px;cursor:pointer;border:1px solid '+(sel?'#9b6dff':'#2e2a47')+';background:'+(sel?'#241d44':'#1b1830')+'">'+
          '<div style="font:700 12.5px Inter;color:'+(sel?'#f4d8a0':'#c9a0ff')+'">'+esc(fd.name)+'</div>'+
          '<div style="font-size:11.5px;color:#9b95b4;margin-top:2px;line-height:1.35">'+esc(fd.desc)+'</div>'+sub+'</div>';
      }).join('');
    }
    const ok=canConfirm();
    h += '<button id="asi-confirm" '+(ok?'':'disabled')+' style="width:100%;margin-top:12px;padding:11px;border-radius:10px;border:none;cursor:'+(ok?'pointer':'not-allowed')+';background:'+(ok?'linear-gradient(180deg,#7d4fe0,#5e3bb0)':'#2a2640')+';color:'+(ok?'#fff':'#6c688a')+';font:700 14px Inter">Confirmar</button>';
    h += '<div style="text-align:center;font-size:10.5px;color:#6c688a;margin-top:7px">você pode escolher depois pela ficha</div>';
    card.innerHTML=h; wire();
  }
  function wire(){
    card.querySelectorAll('[data-path]').forEach(b=> b.onclick=()=>{ st.path=b.getAttribute('data-path'); st.picks=[]; st.feat=null; st.featAttr=null; render(); });
    card.querySelectorAll('[data-mode]').forEach(b=> b.onclick=()=>{ st.asiMode=b.getAttribute('data-mode'); st.picks=[]; render(); });
    card.querySelectorAll('[data-attr]').forEach(b=> b.onclick=()=>{
      const a=b.getAttribute('data-attr'), max=st.asiMode==='one'?1:2, i=st.picks.indexOf(a);
      if(i>=0) st.picks.splice(i,1); else { if(st.picks.length>=max) st.picks.shift(); st.picks.push(a); }
      render();
    });
    card.querySelectorAll('[data-feat]').forEach(b=> b.onclick=()=>{ st.feat=b.getAttribute('data-feat'); st.featAttr=null; render(); });
    card.querySelectorAll('[data-featattr]').forEach(b=> b.onclick=(e)=>{ e.stopPropagation(); st.featAttr=b.getAttribute('data-featattr'); render(); });
    const cf=card.querySelector('#asi-confirm'); if(cf) cf.onclick=()=>{
      if(!canConfirm()) return;
      let payload;
      if(st.path==='asi'){ const a={}; st.picks.forEach(x=> a[x]=st.asiMode==='one'?2:1); payload={kind:'asi', attrs:a}; }
      else { payload={kind:'feat', feat_id:st.feat}; const fd=featsCatalog.find(x=>x.id===st.feat); if(fd&&fd.plus1) payload.attr = fd.plus1.length>1?st.featAttr:fd.plus1[0]; }
      socket.emit('asi_choice', payload);
      closeAsiChooser();
    };
  }
  render();
}
function closeAsiChooser(){
  asiChooserOpen=false;
  const o=document.getElementById('asi-overlay'); if(o) o.remove();
}
function maybeOpenAsi(){
  const pend = (myFicha && myFicha.pending_asi) || [];
  if(pend.length && !asiChooserOpen) openAsiChooser(pend[0]);
}

// ===================== COMBATE POR TURNOS: interface =====================
let combatHud = null;
function ensureCombatHud(){
  if(combatHud) return combatHud;
  combatHud = document.createElement('div');
  combatHud.id = 'combat-hud';
  combatHud.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);'+
    'width:min(560px,94vw);z-index:8000;display:none;font-family:Inter,sans-serif;'+
    'background:rgba(16,14,23,.92);border:1px solid #3a3556;border-radius:14px;'+
    'box-shadow:0 14px 40px rgba(0,0,0,.5);padding:10px 12px;color:#e8e4f0';
  document.body.appendChild(combatHud);
  return combatHud;
}
function showCombatUi(){ ensureCombatHud().style.display = 'block'; }
function endCombatUi(){ combat = null; closeSpellMenu(); if(combatHud) combatHud.style.display = 'none'; }

function applyCombatSnapshot(snap){
  if(!snap) return;
  combat = combat || {};
  combat.snapshot = snap;
  combat.yourTurn = !!snap.your_turn;
  if(snap.your){ combat.your = snap.your; if(myFicha) myFicha.res = snap.your.res; }
  if(!combat.yourTurn){ combat.pending = null; closeSpellMenu(); }
  for(const c of snap.combatants){
    let e = players.get(c.cid);
    if(!e && c.kind === 'monster'){      // reforço invocado pelo chefe: cria a entidade
      addPlayer({ id:c.cid, x:c.x, y:c.y, facing:'down', monster:true, kind:'monster',
                  glyph:c.glyph, mtype:c.mtype, hp:c.hp, hp_max:c.hp_max });
      e = players.get(c.cid);
    }
    if(e){
      e.x = c.x; e.y = c.y; e.hp = c.hp; e.hp_max = c.hp_max; e._dead = !c.alive;
      e.boss = !!c.boss; e._enraged = !!c.enraged; if(c.mtype) e.mtype = c.mtype; if(c.size) e.size = c.size;
      e._status = c.status || null;
    }
    if(c.you && myFicha){ myFicha.hp = c.hp; myFicha.hp_max = c.hp_max; }
  }
  renderCombatHud();
}

function _playerStatusHtml(your){
  const st = your && your.status;
  if(!st) return '';
  const ks = Object.keys(st).filter(k=> st[k] > 0);
  if(!ks.length) return '';
  const tags = ks.map(k=> '<span style="background:#2a1f33;border:1px solid #5a3f6e;border-radius:6px;padding:2px 7px;font:700 10px Inter;color:#e6b3ff">'+
    (STATUS_ICON[k]||'✦')+' '+(STATUS_PT[k]||k)+' '+st[k]+'</span>').join(' ');
  return '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">'+tags+'</div>';
}
function renderCombatHud(){
  if(!combat || !combat.snapshot) return;
  const s = combat.snapshot;
  ensureCombatHud();
  const order = s.combatants.slice().sort((a,b)=> s.order.indexOf(a.cid) - s.order.indexOf(b.cid));
  const chips = order.map(c=>{
    const cur = c.cid === s.turn, dead = !c.alive;
    const ic = c.kind === 'monster' ? (c.glyph || '👾') : '🧝';
    return '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:8px;margin:2px;'+
      'font:700 11px Inter;opacity:'+(dead?'0.35':'1')+';border:1px solid '+(cur?'#9b6dff':'#2e2a47')+';'+
      'background:'+(cur?'#241d44':'#1b1830')+';color:'+(c.you?'#9bdcff':'#e8e4f0')+'">'+
      ic+' '+esc(c.name)+' <span style="color:#8a86a0">'+c.hp+'/'+c.hp_max+'</span></span>';
  }).join('');
  const your = s.your || {};
  let html = '<div style="font:700 10px Inter;letter-spacing:1px;color:#9b6dff;text-transform:uppercase">Combate · Rodada '+s.round+'</div>'+
    '<div style="margin-top:4px;line-height:1.8">'+chips+'</div>';

  if(combat.yourTurn){
    const badges = [];
    if(your.raging) badges.push('<span style="font:700 10px Inter;color:#ff8a5c">🔥 Furioso</span>');
    if(your.smite_armed) badges.push('<span style="font:700 10px Inter;color:#f4d8a0;animation:smiteBlink .8s ease-in-out infinite">⚔️ Castigo armado · próximo acerto</span>');
    if(your.mark) badges.push('<span style="font:700 10px Inter;color:#c9a0ff">🎯 '+esc(((your.mark||{}).name)||'Marca')+'</span>');
    const hasBonus = (your.abilities||[]).some(a=> a.slot==='bonus');
    html += '<div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap">'+
      '<div style="font:800 13px Cinzel,serif;color:#f4d8a0">Seu turno</div>'+
      '<div style="font:600 11px Inter;color:#9b95b4">Mov. <b style="color:#e8e4f0">'+s.your_move+'</b> · '+
        'Ação <b style="color:'+(your.action_used?'#d65a5a':'#5ec27a')+'">'+(your.action_used?'usada':'pronta')+'</b>'+
        (hasBonus?(' · Bônus <b style="color:'+(your.bonus_used?'#d65a5a':'#5ec27a')+'">'+(your.bonus_used?'usada':'pronta')+'</b>'):'')+'</div>'+
      (badges.length?('<div style="display:flex;gap:8px;flex-wrap:wrap">'+badges.join('')+'</div>'):'')+
      '</div>';
    let btns = cbBtn('attack','⚔ Atacar', {primary:true});
    for(const ab of (your.abilities||[])){
      if(ab.slot === 'passive') continue;
      const used = (ab.slot==='bonus' && your.bonus_used) || (ab.slot==='action' && your.action_used);
      btns += cbBtn('ab:'+ab.id, ab.name, {disabled: !ab.ready || used});
    }
    if((your.spells||[]).length) btns += cbBtn('spells','✦ Magias', {disabled: your.action_used});
    const _pot = (inventory.find(s=> s.item === 'pocao_vida') || {}).qty || 0;
    if(_pot > 0) btns += cbBtn('potion','🧪 Poção ('+_pot+')', {disabled: your.action_used});
    if(myFicha && transformsData[myFicha.class_id]){
      const cf = (transformsData[myFicha.class_id]||[]).find(x=> x.id === (myFicha.form||''));
      btns += cbBtn('transform', cf ? (cf.icon+' '+cf.name) : '🐾 Transformar', {});
    }
    btns += cbBtn('pass','Passar (espaço)', {});
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+btns+'</div>';
    if(combat.pending){
      html += '<div style="font-size:10.5px;color:#f4d8a0;margin-top:6px">▸ '+esc(combat.pending.label||'')+
        ': clique no inimigo '+(combat.pending.range==='ranged'?'(qualquer)':'(ao lado)')+' · ou clique fora pra cancelar</div>';
    } else {
      html += '<div style="font-size:10.5px;color:#6c688a;margin-top:5px">clique num inimigo · WASD pra mover</div>';
    }
    html += resPips(your.res);
  } else {
    const who = (s.combatants.find(c=> c.cid === s.turn) || {}).name || 'inimigo';
    html += '<div style="font:700 12px Inter;color:#9b95b4;margin-top:8px">Turno de '+esc(who)+'…</div>'+resPips(your.res);
  }
  html += _playerStatusHtml(your);
  combatHud.innerHTML = html;
  combatHud.querySelectorAll('button[data-cb]').forEach(b=>{ b.onclick = ()=> cbAction(b.getAttribute('data-cb')); });
}

// ---- helpers da barra de combate ----
const _RES_LABEL = {rage:'Fúria', ki:'Ki', second_wind:'Fôlego', action_surge:'Surto',
                    lay_on_hands:'Cura', sorcery:'Feit.', bardic:'Insp.'};
function _dots(cur, max){
  if(max > 6) return '<b style="color:#e8e4f0">'+cur+'</b><span style="color:#6c688a">/'+max+'</span>';
  let o=''; for(let i=0;i<max;i++) o += (i<cur ? '●' : '○');
  return '<span style="color:#c9a0ff;letter-spacing:1px">'+o+'</span>';
}
function resPips(res){
  if(!res) return '';
  const parts = [];
  for(const k of Object.keys(res)){
    if(k === 'slots'){
      const sl = res.slots;
      for(const lv of Object.keys(sl).sort())
        parts.push('<span style="font:600 10.5px Inter;color:#9b95b4">Esp.'+lv+' '+_dots(sl[lv].cur, sl[lv].max)+'</span>');
    } else {
      parts.push('<span style="font:600 10.5px Inter;color:#9b95b4">'+(_RES_LABEL[k]||k)+' '+_dots(res[k].cur, res[k].max)+'</span>');
    }
  }
  return parts.length ? '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;padding-top:6px;border-top:1px solid #241f3a">'+parts.join('')+'</div>' : '';
}
function cbBtn(id, label, opts){
  opts = opts || {};
  const dis = !!opts.disabled;
  const bg = opts.primary ? 'linear-gradient(180deg,#7d4fe0,#5e3bb0)' : (dis?'#221d36':'#2a2442');
  const bd = opts.primary ? '#9b6dff' : (dis?'#2e2a47':'#473e6e');
  const col = dis ? '#6c688a' : '#e8e4f0';
  return '<button data-cb="'+id+'"'+(dis?' disabled':'')+' style="padding:6px 11px;border-radius:9px;border:1px solid '+bd+';'+
    'background:'+bg+';color:'+col+';font:700 11.5px Inter;cursor:'+(dis?'default':'pointer')+'">'+esc(label)+'</button>';
}
function cbAction(id){
  if(!combat || !combat.yourTurn) return;
  const your = (combat.snapshot && combat.snapshot.your) || {};
  if(id === 'pass'){ combat.pending = null; socket.emit('combat_end_turn', {}); return; }
  if(id === 'potion'){ combat.pending = null; socket.emit('combat_use_potion', {}); return; }
  if(id === 'attack'){ combat.pending = {type:'attack', range:'melee', label:'Atacar'}; renderCombatHud(); return; }
  if(id === 'spells'){ openSpellMenu(); return; }
  if(id === 'transform'){ openFormMenu(); return; }
  if(id.indexOf('ab:') === 0){
    const aid = id.slice(3);
    const ab = (your.abilities||[]).find(a=> a.id === aid);
    if(!ab) return;
    if(ab.target){ combat.pending = {type:'ability', id:aid, range:'melee', label:ab.name}; renderCombatHud(); }
    else { socket.emit('combat_ability', {ability: aid}); }
  }
}
let formMenuEl = null;
function closeFormMenu(){ if(formMenuEl){ formMenuEl.remove(); formMenuEl = null; } }
function openFormMenu(){
  closeFormMenu();
  const f = myFicha || {};
  let forms = (f.class_id && transformsData[f.class_id]) ? transformsData[f.class_id] : [];
  forms = forms.filter(fm=> !fm.requires || f[fm.requires]);
  const active = f.form || null;
  formMenuEl = document.createElement('div');
  formMenuEl.style.cssText = 'position:fixed;left:50%;bottom:128px;transform:translateX(-50%);width:min(420px,92vw);z-index:8600;'+
    'background:rgba(20,17,30,.97);border:1px solid #6d4ea0;border-radius:14px;box-shadow:0 16px 44px rgba(0,0,0,.6);padding:10px 12px;font-family:Inter;max-height:62vh;overflow:auto';
  let html = '<div style="font:800 12px Cinzel,serif;color:#f4d8a0;margin-bottom:6px">Transformação</div>';
  forms.forEach(fm=>{
    const on = fm.id===active;
    html += '<button data-form="'+esc(fm.id)+'"'+(on?' disabled':'')+' style="display:flex;width:100%;align-items:center;gap:9px;margin:0 0 6px;padding:8px 10px;border-radius:9px;border:1px solid '+(on?'#6d4ea0':'#473e6e')+';background:'+(on?'#241d38':'#2a2442')+';color:#e8e4f0;font:600 12px Inter;cursor:'+(on?'default':'pointer')+';text-align:left">'+
      '<span style="font-size:18px;line-height:1">'+fm.icon+'</span>'+
      '<span style="flex:1;min-width:0"><div>'+esc(fm.name)+(on?' · <span style="color:#c9a0ff">ATIVA</span>':'')+'</div>'+
      '<div style="font-size:10px;color:#9b95b4;line-height:1.25">'+esc(fm.desc||'')+'</div></span></button>';
  });
  if(active){
    html += '<button data-form="" style="width:100%;padding:8px;border-radius:9px;border:1px solid #4a4360;background:#221d36;color:#d8d2e8;font:600 12px Inter;cursor:pointer">↺ Voltar à forma normal</button>';
  }
  html += '<button data-formclose="1" style="width:100%;margin-top:6px;padding:6px;border-radius:9px;border:none;background:none;color:#8a86a0;font:600 11px Inter;cursor:pointer">fechar</button>';
  formMenuEl.innerHTML = html;
  document.body.appendChild(formMenuEl);
  formMenuEl.querySelectorAll('[data-form]').forEach(b=> b.onclick = ()=>{ const fid=b.getAttribute('data-form'); socket.emit('combat_transform', {form: fid || null}); closeFormMenu(); });
  const xc = formMenuEl.querySelector('[data-formclose]'); if(xc) xc.onclick = closeFormMenu;
}
let spellMenuEl = null;
function closeSpellMenu(){ if(spellMenuEl){ spellMenuEl.remove(); spellMenuEl = null; } }
function openSpellMenu(){
  closeSpellMenu();
  const your = (combat.snapshot && combat.snapshot.your) || {};
  const list = your.spells || [];
  const slots = (your.res && your.res.slots) || {};
  spellMenuEl = document.createElement('div');
  spellMenuEl.style.cssText = 'position:fixed;left:50%;bottom:128px;transform:translateX(-50%);width:min(420px,92vw);z-index:8600;'+
    'background:rgba(20,17,30,.97);border:1px solid #473e6e;border-radius:14px;box-shadow:0 16px 44px rgba(0,0,0,.6);padding:10px 12px;'+
    'font-family:Inter;max-height:62vh;overflow:auto';
  const byLvl = {};
  for(const sp of list){ (byLvl[sp.level] = byLvl[sp.level] || []).push(sp); }
  const levels = Object.keys(byLvl).map(Number).sort((a,b)=> a-b);
  let html = '<div style="font:800 12px Cinzel,serif;color:#f4d8a0;margin-bottom:4px">Magias</div>';
  if(!levels.length){
    html += '<div style="color:#9b95b4;font-size:11px;padding:6px">Nenhuma magia disponível.</div>';
  }
  for(const lv of levels){
    let label, info;
    if(lv === 0){ label = 'Truques'; info = '<span style="color:#5ec27a">à vontade</span>'; }
    else {
      label = 'Nível '+lv;
      const s = slots[String(lv)];
      if(s){ const ok = s.cur > 0;
        info = '<span style="color:'+(ok?'#c9a0ff':'#6c688a')+'">'+s.cur+'/'+s.max+' espaços</span>'; }
      else info = '<span style="color:#6c688a">sem espaços</span>';
    }
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin:9px 2px 3px;'+
      'font:700 10.5px Inter;color:#9b6dff;border-bottom:1px solid #2a2742;padding-bottom:3px">'+
      '<span>'+label+'</span>'+info+'</div>';
    for(const sp of byLvl[lv]){
      const dis = !sp.castable;
      const tag = sp.range === 'self' ? ' <span style="color:#5ec27a;font-size:10px">você</span>'
                : (sp.range === 'ranged' ? ' <span style="color:#c9a0ff;font-size:10px">distância</span>'
                : ' <span style="color:#f4b860;font-size:10px">corpo a corpo</span>');
      html += '<button data-sp="'+sp.id+'"'+(dis?' disabled':'')+' style="display:block;width:100%;text-align:left;margin:4px 0;padding:8px 10px;'+
        'border-radius:10px;border:1px solid '+(dis?'#2e2a47':'#473e6e')+';background:'+(dis?'#1b1830':'#241d44')+';'+
        'color:'+(dis?'#6c688a':'#e8e4f0')+';cursor:'+(dis?'default':'pointer')+'">'+
        '<div style="font:700 12.5px Inter">'+esc(sp.name)+tag+'</div>'+
        '<div style="font:500 10.5px Inter;color:#9b95b4;margin-top:2px">'+esc(sp.desc)+'</div></button>';
    }
  }
  html += '<button data-sp="_cancel" style="width:100%;margin-top:8px;padding:7px;border-radius:9px;border:1px solid #2e2a47;'+
    'background:#1b1830;color:#9b95b4;font:700 11px Inter;cursor:pointer">Fechar</button>';
  spellMenuEl.innerHTML = html;
  document.body.appendChild(spellMenuEl);
  spellMenuEl.querySelectorAll('button[data-sp]').forEach(b=>{
    b.onclick = ()=>{
      const sid = b.getAttribute('data-sp');
      if(sid === '_cancel'){ closeSpellMenu(); return; }
      const sp = (your.spells||[]).find(x=> x.id === sid);
      closeSpellMenu();
      if(!sp || !sp.castable) return;
      if(sp.range === 'self'){ socket.emit('combat_cast', {spell: sid}); }
      else { combat.pending = {type:'spell', id:sid, range:sp.range, label:sp.name}; renderCombatHud(); }
    };
  });
}

function popDamage(cid, text, color){
  const e = players.get(cid); if(!e) return;
  dmgPops.push({ x:e.x, y:e.y, text:text, color:color||'#fff', t0:performance.now() });
}
const STATUS_ICON = { stunned:'💫', poison:'☠️', burning:'🔥', bleeding:'🩸',
  frightened:'😱', restrained:'🕸️', blinded:'⚫', slowed:'🐌' };
const STATUS_PT = { stunned:'atordoado', poison:'envenenado', burning:'queimando', bleeding:'sangrando',
  frightened:'amedrontado', restrained:'imobilizado', blinded:'cego', slowed:'lento' };
function showStatusFx(fx){
  if(!fx) return;
  for(const f of (fx.fx||[])){
    if(f.type === 'expire' || !f.dmg) continue;
    const col = f.type==='poison'?'#8bd450':(f.type==='burning'?'#ff8a3a':'#ff7a7a');
    popDamage(fx.cid, (STATUS_ICON[f.type]||'✦')+'-'+f.dmg, col);
  }
}
function showAttackResult(res){
  if(!res) return;
  // habilidade de monstro por resistencia (sem rolagem de ataque)
  if(res.mon_ability && res.gaze){
    spawnAt(res.target, 'mark', '#c9a0ff');
    if(res.applied) toastMsg('✦ '+(res.ability||'habilidade')+': '+(STATUS_PT[res.applied]||res.applied)+'!', true);
    else toastMsg('✦ '+(res.ability||'habilidade')+': resistiu');
    return;
  }
  spawnAt(res.target, 'slash', res.crit ? '#ffd86b' : '#fff2c2');
  if(res.hit){
    popDamage(res.target, '-'+res.dmg+(res.crit?'!':''), res.crit?'#ffd86b':'#ff7a7a');
    if(res.smite_dmg){ spawnAt(res.target, 'buff', '#ffe08a'); toastMsg('⚔️ Castigo Divino: +'+res.smite_dmg+' radiante (já no total)', true); }
  } else popDamage(res.target, 'errou', '#9b95b4');
  if(res.mon_ability && res.ability){
    toastMsg('✦ '+res.ability+(res.applied?(' · '+(STATUS_PT[res.applied]||res.applied)):'')+(res.self_heal?(' · curou '+res.self_heal):''), true);
  }
}
function popHeal(cid, text){
  const e = players.get(cid); if(!e) return;
  dmgPops.push({ x:e.x, y:e.y, text:text, color:'#5ec27a', t0:performance.now() });
}
function showSpellResult(r){
  if(!r) return;
  if(r.self && r.heal != null){ spawnAt(r.caster, 'heal', '#5ec27a'); popHeal(r.caster, '+'+r.heal); return; }
  if(r.mark){ spawnAt(r.target, 'mark', vfxColorFor(r.name,'#ffd86b')); toastMsg('🎯 '+(r.name||'Marca')+' em '+(r.target_name||'alvo')); return; }
  if(r.buff){ spawnAt(r.caster, 'buff', vfxColorFor(r.name,'#c9a0ff')); toastMsg('✦ '+(r.name||'Magia')+'!'); return; }
  if(r.auto){ spawnBolt(r.caster, r.target, vfxColorFor(r.name)); popDamage(r.target, '-'+r.dmg, '#c9a0ff'); return; }
  if(r.save){
    spawnBolt(r.caster, r.target, vfxColorFor(r.name));
    if(r.dmg > 0) popDamage(r.target, '-'+r.dmg+(r.success?' ½':''), r.success?'#c9a0ff':'#ff7a7a');
    else if(!r.status) popDamage(r.target, 'resistiu', '#9b95b4');
    if(r.control) toastMsg('✦ '+(r.name||'Magia')+': '+(STATUS_PT[r.control]||r.control)+'!', true);
    else if(r.status) popDamage(r.target, 'resistiu', '#9b95b4');
    return;
  }
  spawnBolt(r.caster, r.target, vfxColorFor(r.name));
  if(r.hit) popDamage(r.target, '-'+r.dmg+(r.crit?'!':''), r.crit?'#ffd86b':'#c9a0ff');
  else popDamage(r.target, 'errou', '#9b95b4');
}
function showAbilityResult(r){
  if(!r) return;
  if(r.attacks){ for(const a of r.attacks) showAttackResult(a); return; }
  if(r.heal != null){ spawnAt(r.actor, 'heal', '#5ec27a'); popHeal(r.actor, '+'+r.heal); if(r.name) toastMsg('✦ '+r.name); return; }
  if(r.rage){ spawnAt(r.actor, 'buff', '#ff8a3a'); toastMsg('🔥 Fúria!'); return; }
  if(r.surge){ spawnAt(r.actor, 'buff', '#ffe066'); toastMsg('⚡ Surto de Ação!'); return; }
  if(r.armed){ spawnAt(r.actor, 'buff', '#ffd86b'); toastMsg('⚔️ Castigo armado · próximo acerto'); return; }
  if(r.buff){ spawnAt(r.actor, 'buff', '#c9a0ff'); toastMsg('✦ '+(r.name||'Inspiração')+'!'); return; }
  if(r.name) toastMsg('✦ '+r.name);
}
function showSpoils(drops, bronze){
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;top:56%;transform:translate(-50%,-50%) scale(0.9);'+
    'z-index:9000;background:rgba(16,14,23,.95);border:1px solid #6b5a2a;border-radius:14px;'+
    'box-shadow:0 16px 44px rgba(0,0,0,.6);padding:12px 16px;min-width:190px;'+
    'opacity:0;transition:all .35s cubic-bezier(.2,1.4,.4,1);pointer-events:none;font-family:Inter';
  let html = '<div style="font:800 13px Cinzel,serif;color:#f4d06a;margin-bottom:8px;text-align:center">Espólio</div>';
  for(const it of (drops||[])){
    html += '<div class="spoil-row" data-item="'+esc(it.item)+'" style="display:flex;align-items:center;gap:8px;margin:5px 0">'+
      '<canvas width="24" height="24" class="spoil-ic"></canvas>'+
      '<span style="font:600 12.5px Inter;color:#e8e4f0">'+esc(it.name)+(it.qty>1?(' <b style="color:#9b95b4">x'+it.qty+'</b>'):'')+'</span></div>';
  }
  if(bronze) html += '<div style="display:flex;align-items:center;gap:8px;margin:5px 0">'+
    '<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:#cd7f32;margin-left:4px"></span>'+
    '<span style="font:700 12.5px Inter;color:#e0b15a">+'+bronze+' bronze</span></div>';
  el.innerHTML = html;
  document.body.appendChild(el);
  el.querySelectorAll('.spoil-row').forEach(r=>{
    const cv = r.querySelector('.spoil-ic');
    if(cv) drawItemIcon(cv.getContext('2d'), 12, 12, 24, r.getAttribute('data-item'), false);
  });
  requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translate(-50%,-50%) scale(1)'; });
  setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=> el.remove(), 400); }, 2800);
}
function combatBanner(title, sub, color){
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;top:36%;transform:translate(-50%,-50%) scale(0.8);'+
    'z-index:9000;text-align:center;opacity:0;transition:all .4s cubic-bezier(.2,1.4,.4,1);pointer-events:none';
  el.innerHTML = '<div style="font:800 38px Cinzel,serif;color:'+(color||'#f4d8a0')+';text-shadow:0 4px 24px rgba(0,0,0,.7)">'+esc(title)+'</div>'+
    (sub? '<div style="font:600 15px Inter,sans-serif;color:#e8e4f0;margin-top:6px">'+esc(sub)+'</div>' : '');
  document.body.appendChild(el);
  requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translate(-50%,-50%) scale(1)'; });
  setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=> el.remove(), 500); }, 1700);
}

function showLevelUp(d){
  let el = document.getElementById('levelup-pop');
  if(!el){
    el = document.createElement('div'); el.id = 'levelup-pop';
    el.style.cssText = 'position:fixed;left:50%;top:42%;transform:translate(-50%,-50%) scale(.7);z-index:9300;'+
      'padding:22px 30px;border-radius:18px;text-align:center;cursor:pointer;opacity:0;'+
      'background:radial-gradient(circle at 50% 0,#2a2150,#15131f 78%);border:1px solid #9b6dff;'+
      'box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 42px rgba(155,109,255,.4);'+
      'transition:opacity .25s, transform .25s;font-family:Inter,sans-serif;max-width:80vw;';
    el.onclick = ()=>{ el.style.opacity='0'; el.style.transform='translate(-50%,-50%) scale(.7)'; };
    document.body.appendChild(el);
  }
  el.innerHTML =
    '<div style="font:700 12px Inter;letter-spacing:2px;color:#c9a0ff;text-transform:uppercase">subiu de nível</div>'+
    '<div style="font:800 44px Cinzel,serif;color:#f4d8a0;line-height:1.1;margin:2px 0 6px;text-shadow:0 2px 12px rgba(244,216,160,.45)">Nível '+d.level+'</div>'+
    '<div style="font-size:13px;color:#e8e4f0">❤ vida máxima '+(d.hp_max!=null?d.hp_max:'?')+' · proficiência +'+(d.prof!=null?d.prof:'?')+'</div>'+
    '<div style="font-size:10.5px;color:#7c7790;margin-top:8px">(toque pra fechar)</div>';
  requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translate(-50%,-50%) scale(1)'; });
  clearTimeout(el._t); el._t = setTimeout(()=>{
    el.style.opacity='0'; el.style.transform='translate(-50%,-50%) scale(.7)'; }, 4200);
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
const SOLID_TILES = new Set(['~', 'T', '#', '^', 'H', 'M', 'm', 'L', 'W', 'V', '/', ';', '_']);  // iguais ao servidor
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
