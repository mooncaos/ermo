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
let shakeUntil = 0, shakeMag = 0, shakeDur = 1;   // tremor de tela (Cataclisma)
function screenShake(mag, durMs){ shakeMag = mag; shakeDur = Math.max(1, durMs); shakeUntil = performance.now() + durMs; }
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
let posturesData = {};        // POSTURAS por classe (só Paladino): id -> [{id,name,icon,desc}]
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
  cova_colosso:     {r:228, g:150, b:78,  a:0.18, part:'#e8a860'},  // cova do colosso: pedra quente, poeira
  mina_avhur:       {r:60,  g:42,  b:18,  a:0.34, part:'#e8b860'},  // tumba egipcia: penumbra de tocha, poeira dourada
  camara_avhur:     {r:72,  g:50,  b:16,  a:0.30, part:'#f4cf6a'},  // sala do trono: brilho dourado dos braseiros
  valdarkram:       {r:28,  g:38,  b:48,  a:0.40, part:'#9fb4c0'},  // cemiterio: bruma fria
  torre_andar1:     {r:30,  g:22,  b:46,  a:0.36, part:'#b89bff'},  // torre: penumbra roxa gotica
  torre_andar2:     {r:32,  g:21,  b:48,  a:0.38, part:'#c0a0ff'},
  torre_andar3:     {r:36,  g:20,  b:52,  a:0.40, part:'#c9a0ff'},
  camara_varth:     {r:42,  g:18,  b:56,  a:0.44, part:'#caa6ff'},  // trono do Lorde: necrose densa
  salao:            {r:46,  g:34,  b:78,  a:0.12, part:'#caa6ff'},  // salao: penumbra sagrada
  rasharan:         {r:232, g:182, b:92,  a:0.14, part:'#ffe6a0'},  // reino dourado do trigo
  valoran:          {r:118, g:160, b:230, a:0.14, part:'#bfe0ff'},  // reino etereo azulado
  fundamento:       {r:78,  g:58,  b:120, a:0.20, part:'#c89cff'},  // trono sombrio
  falanor:          {r:150, g:210, b:200, a:0.12, part:'#d6fff4'},  // reino claro
  fadrakor_litoral: {r:120, g:190, b:222, a:0.10, part:'#cfeeff'},  // litoral
  fadrakor_selva:   {r:38,  g:108, b:58,  a:0.16, part:'#a9f0c0'},  // selva densa
  fadrakor_vulcao:  {r:230, g:90,  b:40,  a:0.18, part:'#ffb070'},  // vulcao
  repouso_dama:     {r:22,  g:44,  b:42,  a:0.10, part:'#a9f0c0'},  // mata fria esverdeada
  planaltos_ermais: {r:150, g:170, b:190, a:0.10, part:'#dfeaf2'},  // planalto frio, neblina clara
  floresta_ermo:    {r:16,  g:36,  b:28,  a:0.14, part:'#9fe0b0'},  // mata fechada, breu esverdeado (Ilex)
  bosque_atalech:   {r:12,  g:28,  b:30,  a:0.16, part:'#a7d8e0'},  // floresta negra alema: frio, sombrio, neblina azulada
  brasal:           {r:235, g:80,  b:25,  a:0.15, part:'#ffb070'},  // a Ferida do Mundo: ar de brasa
  goela_1:          {r:120, g:45,  b:15,  a:0.32, part:'#ff9a50'},  // goela: penumbra de forja
  goela_2:          {r:135, g:45,  b:12,  a:0.36, part:'#ff8a40'},  // mais fundo, mais quente
  covil_krezath:    {r:255, g:70,  b:20,  a:0.34, part:'#ffab60'},  // o covil: calor do Devorador
  costa_maravai:    {r:255, g:210, b:130, a:0.05, part:'#f6dfa8'},  // sol dourado da costa
  umbraval:         {r:14,  g:18,  b:52,  a:0.44, part:'#9ad0ff'},  // NOITE ETERNA: azul profundo
  vespera:          {r:110, g:16,  b:30,  a:0.30, part:'#c9a0b0'},  // a Cidade Morta: sangue velho
};
// mapas "magicos": as motas de ambiente brilham (faiscas etereas) mesmo de dia
const GLOW_MAPS = new Set(['valdarkram','salao','rasharan','valoran','fundamento','falanor','fadrakor_vulcao','torre_andar1','torre_andar2','torre_andar3','camara_varth','goela_1','goela_2','covil_krezath','umbraval','vespera']);
// TIPO de particula por bioma (rework visual): cada mapa tem a SUA vida no ar.
// leaf=folhas caindo | ember=brasas/cinzas subindo | sand=areia soprando | mist=flocos de bruma | petal=palha dourada | spark=faisca eterea
const MAP_PTYPE = {
  repouso_dama:'leaf', floresta_ermo:'leaf', bosque_atalech:'leaf', fadrakor_selva:'leaf',
  torre_andar1:'ember', torre_andar2:'ember', torre_andar3:'ember', camara_varth:'ember', fadrakor_vulcao:'ember',
  brasal:'ember', goela_1:'ember', goela_2:'ember', covil_krezath:'ember',
  costa_maravai:'sand', umbraval:'firefly', vespera:'mist',
  avasham:'sand', cova_colosso:'sand', mina_avhur:'sand',
  valdarkram:'mist', planaltos_ermais:'mist',
  rasharan:'petal',
  valoran:'spark', falanor:'spark', fundamento:'spark', salao:'spark',
};

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

const currentLook = { skin:SKINS[0], cloak:CLOAKS[0], hood:'up', hat:'none', hair:HAIRS[0], staff:false, sex:'M' };

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
  buildPills('row-sex', [['M','Masculino'],['F','Feminino']], 'sex');
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
function drawMineTile(c, ch, px, py, ts, gx, gy){
  // chao base de tumba: pedra arenosa empoeirada, iluminada por tochas (tom quente escuro)
  function tomb(rich){
    const h=((gx*7+gy*11)%4);
    const pal = rich ? ['#b89348','#ab863f','#b08c42','#9e7c3a']    // camara real (dourado)
                     : ['#7a6644','#6f5d3e','#746142','#665538'];   // tumba comum
    c.fillStyle=pal[h]; c.fillRect(px,py,ts,ts);
    c.strokeStyle='rgba(40,30,16,0.4)'; c.lineWidth=1; c.strokeRect(px+0.5,py+0.5,ts-1,ts-1);
    if((gx*5+gy*9)%5===0){ c.fillStyle='rgba(30,22,12,0.4)'; c.fillRect(px+ts*(0.25+(gx%3)*0.2),py+ts*(0.4+(gy%2)*0.3),1.6,1.4); }
    if(rich && (gx+gy)%2===0){ c.fillStyle='rgba(244,208,106,0.18)'; c.fillRect(px+ts*0.3,py+ts*0.3,ts*0.4,ts*0.4); }
  }
  switch(ch){
    case '.': tomb(false); return true;
    case 'd': {                                     // chao da camara real (decorado, inlay dourado)
      tomb(true);
      c.strokeStyle='rgba(244,212,110,0.32)'; c.lineWidth=1; c.strokeRect(px+ts*0.12,py+ts*0.12,ts*0.76,ts*0.76);
      if((gx+gy)%3===0){                            // medalhao sol-disco em algumas lajes
        c.strokeStyle='rgba(248,216,120,0.5)'; c.lineWidth=1.2;
        c.beginPath(); c.arc(px+ts*0.5,py+ts*0.5,ts*0.15,0,Math.PI*2); c.stroke();
        for(let a=0;a<8;a++){ const an=a/8*Math.PI*2; c.beginPath(); c.moveTo(px+ts*0.5+Math.cos(an)*ts*0.17,py+ts*0.5+Math.sin(an)*ts*0.17); c.lineTo(px+ts*0.5+Math.cos(an)*ts*0.23,py+ts*0.5+Math.sin(an)*ts*0.23); c.stroke(); }
        c.fillStyle='rgba(248,216,120,0.4)'; c.beginPath(); c.arc(px+ts*0.5,py+ts*0.5,ts*0.05,0,Math.PI*2); c.fill();
      }
      return true;
    }
    case ',': tomb(false);                          // entulho / ossos no chao
      c.strokeStyle='#d8cfb4'; c.lineWidth=1.3;
      c.beginPath(); c.moveTo(px+ts*0.28,py+ts*0.62); c.lineTo(px+ts*0.66,py+ts*0.54); c.stroke();
      c.fillStyle='#d8cfb4'; c.beginPath(); c.arc(px+ts*0.28,py+ts*0.62,1.6,0,Math.PI*2); c.arc(px+ts*0.66,py+ts*0.54,1.6,0,Math.PI*2); c.fill();
      return true;
    case '#': {                                     // parede de arenito (solido)
      const base='#5a4a30';
      c.fillStyle=base; c.fillRect(px,py,ts,ts);
      c.fillStyle=shade(base,0.12); c.fillRect(px,py,ts,ts*0.5);
      c.strokeStyle='rgba(28,20,10,0.55)'; c.lineWidth=1;
      const off=((gx+gy)%2)?ts*0.5:0;
      c.beginPath();
      c.moveTo(px,py+ts*0.5); c.lineTo(px+ts,py+ts*0.5);
      c.moveTo(px+off,py); c.lineTo(px+off,py+ts*0.5);
      c.moveTo(px+(off?0:ts*0.5),py+ts*0.5); c.lineTo(px+(off?0:ts*0.5),py+ts);
      c.stroke();
      if((gx*3+gy*5)%6===0){ c.fillStyle='rgba(214,178,90,0.42)'; c.strokeStyle='rgba(214,178,90,0.42)';
        const gl=(gx+gy)%4;
        if(gl===0){                                  // ankh
          c.lineWidth=2; c.beginPath(); c.arc(px+ts*0.5,py+ts*0.32,ts*0.055,0,Math.PI*2); c.stroke();
          c.fillRect(px+ts*0.48,py+ts*0.36,ts*0.04,ts*0.3); c.fillRect(px+ts*0.4,py+ts*0.44,ts*0.2,ts*0.04);
        } else if(gl===1){                           // olho de horus (simplificado)
          c.fillRect(px+ts*0.34,py+ts*0.46,ts*0.32,2); c.beginPath(); c.arc(px+ts*0.5,py+ts*0.46,ts*0.05,Math.PI,0); c.fill();
          c.fillRect(px+ts*0.49,py+ts*0.5,2,ts*0.12);
        } else if(gl===2){                           // barras verticais
          for(let k=0;k<3;k++) c.fillRect(px+ts*(0.38+k*0.1),py+ts*0.3,2,ts*0.4);
        } else {                                      // agua / onda
          c.fillRect(px+ts*0.34,py+ts*0.36,ts*0.32,2); c.fillRect(px+ts*0.34,py+ts*0.5,ts*0.32,2); c.fillRect(px+ts*0.34,py+ts*0.64,ts*0.32,2);
        }
      }
      return true;
    }
    case 'H': {                                     // sarcofago (solido)
      tomb(false);
      c.fillStyle='#9a7e3e'; roundRect(c,px+ts*0.22,py+ts*0.12,ts*0.56,ts*0.76,ts*0.16); c.fill();
      c.fillStyle=shade('#9a7e3e',0.18); roundRect(c,px+ts*0.3,py+ts*0.18,ts*0.4,ts*0.3,ts*0.14); c.fill();
      c.fillStyle='#3a2e16'; c.fillRect(px+ts*0.46,py+ts*0.5,ts*0.08,ts*0.3);
      c.strokeStyle=shade('#9a7e3e',-0.3); c.lineWidth=1; c.strokeRect(px+ts*0.22,py+ts*0.12,ts*0.56,ts*0.76);
      return true;
    }
    case 'L': {                                     // braseiro de parede (solido)
      c.fillStyle='#4a3a22'; c.fillRect(px,py,ts,ts);
      const g=c.createRadialGradient(px+ts*0.5,py+ts*0.36,1,px+ts*0.5,py+ts*0.36,ts*0.6);
      g.addColorStop(0,'rgba(255,224,130,0.95)'); g.addColorStop(0.5,'rgba(244,150,40,0.5)'); g.addColorStop(1,'rgba(244,150,40,0)');
      c.fillStyle=g; c.fillRect(px,py,ts,ts);
      c.fillStyle='#6a5230'; c.fillRect(px+ts*0.46,py+ts*0.5,ts*0.08,ts*0.4);          // haste
      c.fillStyle='#7a6238'; c.beginPath(); c.moveTo(px+ts*0.34,py+ts*0.46); c.lineTo(px+ts*0.66,py+ts*0.46); c.lineTo(px+ts*0.6,py+ts*0.56); c.lineTo(px+ts*0.4,py+ts*0.56); c.fill();  // tigela
      c.fillStyle='#f0922c'; c.beginPath(); c.moveTo(px+ts*0.5,py+ts*0.08); c.quadraticCurveTo(px+ts*0.66,py+ts*0.32,px+ts*0.5,py+ts*0.46); c.quadraticCurveTo(px+ts*0.34,py+ts*0.32,px+ts*0.5,py+ts*0.08); c.fill();  // chama externa
      c.fillStyle='#ffe07a'; c.beginPath(); c.moveTo(px+ts*0.5,py+ts*0.2); c.quadraticCurveTo(px+ts*0.58,py+ts*0.34,px+ts*0.5,py+ts*0.44); c.quadraticCurveTo(px+ts*0.42,py+ts*0.34,px+ts*0.5,py+ts*0.2); c.fill();  // chama interna
      return true;
    }
    case 'p': {                                     // boca de saida: escada subindo pro deserto
      c.fillStyle='#5a4a30'; c.fillRect(px,py,ts,ts);
      for(let i=0;i<4;i++){ c.fillStyle=shade('#b89348',-0.05*i); c.fillRect(px+ts*0.16,py+ts*(0.16+i*0.18),ts*0.68,ts*0.14); }
      c.fillStyle='rgba(255,240,190,0.35)'; c.fillRect(px+ts*0.16,py+ts*0.1,ts*0.68,ts*0.1);
      return true;
    }
    case '+': {                                     // ESCADA da torre (sobe/desce) com brilho roxo
      c.fillStyle='#241f30'; c.fillRect(px,py,ts,ts);
      for(let i=0;i<4;i++){ c.fillStyle=shade('#4a3f5e',0.08*i); c.fillRect(px+ts*0.12,py+ts*(0.7-i*0.16),ts*0.76,ts*0.12); }
      c.fillStyle='rgba(155,109,255,0.5)'; c.fillRect(px+ts*0.12,py+ts*0.08,ts*0.76,ts*0.1);
      c.fillStyle='rgba(201,160,255,0.25)'; c.fillRect(px+ts*0.3,py,ts*0.4,ts);
      return true;
    }
  }
  return false;
}

function drawTowerTile(c, ch, px, py, ts, gx, gy){
  // ===== TORRE DO LORDE NECROTICO: pedra gotica fria + necrose roxa =====
  function floor(){
    const h=((gx*7+gy*13)%4);
    c.fillStyle=['#26222f','#2a2633','#221e2a','#282431'][h];        // laje cinza-violacea escura
    c.fillRect(px,py,ts,ts);
    c.strokeStyle='rgba(10,8,16,0.6)'; c.lineWidth=1; c.strokeRect(px+0.5,py+0.5,ts-1,ts-1);  // juntas
    if((gx*11+gy*17)%5===0){ c.fillStyle='rgba(155,109,255,0.05)'; c.fillRect(px+2,py+2,ts-4,ts-4); }   // brilho difuso
    if((gx*13+gy*7)%4===0){                                          // rachaduras
      c.strokeStyle='rgba(6,4,12,0.5)'; c.lineWidth=1;
      c.beginPath(); c.moveTo(px+ts*0.2,py+ts*0.3); c.lineTo(px+ts*0.5,py+ts*0.55); c.lineTo(px+ts*0.42,py+ts*0.8); c.stroke();
    }
    if((gx*19+gy*23)%13===0){ c.fillStyle='rgba(70,90,70,0.16)'; c.beginPath(); c.arc(px+ts*0.62,py+ts*0.4,ts*0.16,0,Math.PI*2); c.fill(); }  // limo
  }
  switch(ch){
    case 'd': floor(); return true;
    case '.': floor(); return true;
    case ',': floor();
      c.strokeStyle='rgba(206,200,184,0.55)'; c.lineWidth=1.4;       // ossinho largado
      c.beginPath(); c.moveTo(px+ts*0.3,py+ts*0.62); c.lineTo(px+ts*0.62,py+ts*0.5); c.stroke();
      return true;
    case '#': {                                                      // parede gotica (pedra escura nervurada)
      c.fillStyle='#1a1724'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#241f30';
      for(let r=0;r<3;r++){ const off=(r%2)*ts*0.25;
        for(let k=-1;k<3;k++){ c.fillRect(px+off+k*ts*0.5+1,py+r*ts*0.34+1,ts*0.5-2,ts*0.32-1); } }
      c.strokeStyle='rgba(6,4,12,0.7)'; c.lineWidth=1; c.strokeRect(px,py,ts,ts);
      c.fillStyle='#2e2940'; c.fillRect(px+ts*0.44,py,ts*0.12,ts);                                  // nervura gotica
      c.fillStyle='rgba(155,109,255,0.07)'; c.fillRect(px+ts*0.47,py,ts*0.06,ts);
      return true;
    }
    case 'H': {                                                      // tumba/efigie gotica com cranio
      c.fillStyle='#1e1a28'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#2c2738'; roundRect(c,px+ts*0.12,py+ts*0.08,ts*0.76,ts*0.84,ts*0.06); c.fill();
      c.strokeStyle='#120f1a'; c.lineWidth=1.4; c.stroke();
      c.strokeStyle='rgba(155,109,255,0.4)'; c.lineWidth=2;          // cruz gravada
      c.beginPath(); c.moveTo(px+ts*0.5,py+ts*0.22); c.lineTo(px+ts*0.5,py+ts*0.58); c.moveTo(px+ts*0.37,py+ts*0.34); c.lineTo(px+ts*0.63,py+ts*0.34); c.stroke();
      c.fillStyle='#d8d2c0'; c.beginPath(); c.arc(px+ts*0.5,py+ts*0.72,ts*0.1,0,Math.PI*2); c.fill();   // cranio
      c.fillStyle='#120f1a'; c.beginPath(); c.arc(px+ts*0.455,py+ts*0.71,ts*0.022,0,Math.PI*2); c.arc(px+ts*0.545,py+ts*0.71,ts*0.022,0,Math.PI*2); c.fill();
      c.fillStyle='#15121d'; c.fillRect(px+ts*0.47,py+ts*0.8,ts*0.06,ts*0.05);
      return true;
    }
    case 'L': {                                                      // braseiro de chama NECROTICA (roxa)
      const t=performance.now();
      c.fillStyle='#1a1724'; c.fillRect(px,py,ts,ts);
      c.fillStyle='#2c2738'; c.fillRect(px+ts*0.4,py+ts*0.55,ts*0.2,ts*0.35);                        // pe
      c.fillStyle='#23202e'; roundRect(c,px+ts*0.26,py+ts*0.44,ts*0.48,ts*0.16,ts*0.04); c.fill();   // tigela
      const fl=Math.sin(t/170+gx*1.7)*0.12;
      const g=c.createRadialGradient(px+ts*0.5,py+ts*0.28,1,px+ts*0.5,py+ts*0.28,ts*0.36);
      g.addColorStop(0,'rgba(224,196,255,0.95)'); g.addColorStop(0.45,'rgba(155,109,255,0.85)'); g.addColorStop(1,'rgba(91,58,160,0)');
      c.fillStyle=g; c.beginPath();
      c.moveTo(px+ts*0.5,py+ts*(0.04+fl)); c.quadraticCurveTo(px+ts*0.73,py+ts*0.3,px+ts*0.5,py+ts*0.5);
      c.quadraticCurveTo(px+ts*0.27,py+ts*0.3,px+ts*0.5,py+ts*(0.04+fl)); c.fill();
      c.fillStyle='rgba(155,109,255,0.12)'; c.beginPath(); c.arc(px+ts*0.5,py+ts*0.3,ts*0.42,0,Math.PI*2); c.fill();   // halo
      return true;
    }
    case '+': {                                                      // ESCADA gotica brilhando roxo
      c.fillStyle='#14111d'; c.fillRect(px,py,ts,ts);
      for(let i=0;i<4;i++){ c.fillStyle=shade('#3a3450',0.1*i); c.fillRect(px+ts*0.1,py+ts*(0.72-i*0.16),ts*0.8,ts*0.12); }
      c.fillStyle='rgba(155,109,255,0.55)'; c.fillRect(px+ts*0.1,py+ts*0.06,ts*0.8,ts*0.1);
      c.fillStyle='rgba(201,160,255,0.22)'; c.fillRect(px+ts*0.28,py,ts*0.44,ts);
      return true;
    }
  }
  return false;
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
    case 'd': {                                   // areia rachada/queimada (arena do Colosso)
      const hh=((gx*7+gy*13)%4);
      c.fillStyle=['#8a6f50','#7d6347','#86694c','#74593f'][hh];
      c.fillRect(px,py,ts,ts);
      c.strokeStyle='rgba(40,28,18,0.55)'; c.lineWidth=1.1;   // rachaduras escuras
      c.beginPath();
      c.moveTo(px+ts*0.1,py+ts*(0.3+(gx%3)*0.12)); c.lineTo(px+ts*0.5,py+ts*0.5); c.lineTo(px+ts*0.9,py+ts*(0.35+(gy%3)*0.1));
      c.moveTo(px+ts*0.5,py+ts*0.5); c.lineTo(px+ts*(0.4+(gx%2)*0.2),py+ts*0.9);
      c.stroke();
      if((gx*5+gy*9)%7===0){ c.fillStyle='rgba(255,150,60,0.5)'; c.fillRect(px+ts*0.46,py+ts*0.46,2,2); }  // brasa presa
      return true;
    }
    case 'B': case 'b': {                          // bloco de arenito da Piramide de Avhur
      const base = (ch==='b') ? '#d9b25e' : '#c79a4e';   // apice 'b' mais claro (pega luz)
      c.fillStyle=base; c.fillRect(px,py,ts,ts);
      c.fillStyle=shade(base,0.20); c.fillRect(px,py,ts,ts*0.16);       // topo iluminado
      c.fillStyle=shade(base,-0.20); c.fillRect(px,py+ts*0.84,ts,ts*0.16); // base na sombra
      c.strokeStyle='rgba(90,64,28,0.45)'; c.lineWidth=1;               // juntas das pedras
      const off=((gx+gy)%2)?ts*0.5:0;
      c.beginPath();
      c.moveTo(px,py+ts*0.5); c.lineTo(px+ts,py+ts*0.5);
      c.moveTo(px+off,py); c.lineTo(px+off,py+ts*0.5);
      c.moveTo(px+(off?0:ts*0.5),py+ts*0.5); c.lineTo(px+(off?0:ts*0.5),py+ts);
      c.stroke();
      if((gx*5+gy*7)%6===0){ c.fillStyle='rgba(120,86,36,0.5)';        // hieroglifo gravado
        c.fillRect(px+ts*0.42,py+ts*0.3,ts*0.16,2); c.fillRect(px+ts*0.48,py+ts*0.3,2,ts*0.3); }
      return true;
    }
    case 'p': {                                    // PORTA da piramide (boca da Mina de Avhur)
      c.fillStyle='#c79a4e'; c.fillRect(px,py,ts,ts);
      c.fillStyle=shade('#c79a4e',0.2); c.fillRect(px,py,ts,ts*0.14);
      const grd=c.createLinearGradient(px,py,px,py+ts);               // vao escuro (entrada)
      grd.addColorStop(0,'#241a10'); grd.addColorStop(1,'#0c0805');
      c.fillStyle=grd; c.fillRect(px+ts*0.2,py+ts*0.16,ts*0.6,ts*0.84);
      c.fillStyle='rgba(244,184,96,0.5)';                              // brilho de tocha la dentro
      c.beginPath(); c.arc(px+ts*0.5,py+ts*0.72,ts*0.12,0,Math.PI*2); c.fill();
      c.fillStyle=shade('#c79a4e',-0.3); c.fillRect(px+ts*0.16,py+ts*0.1,ts*0.68,ts*0.07); // verga
      return true;
    }
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
    case 'Z': dead();   // ENTRADA: torre gotica imponente desenhada subindo do tile
      {
      const t=performance.now(), cx=px+ts*0.5;
      const bx0=px+ts*0.14, bx1=px+ts*0.86, bw=bx1-bx0;
      const baseY=py+ts, topY=py-ts*1.7;                 // corpo: da base ate ~1.7 tiles acima
      const STONE='#241f30', STONED='#171320', STONEL='#332c46';
      // halo necrotico atras da torre
      const halo=c.createRadialGradient(cx,py-ts*0.6,ts*0.3,cx,py-ts*0.6,ts*2.0);
      halo.addColorStop(0,'rgba(155,109,255,0.18)'); halo.addColorStop(1,'rgba(155,109,255,0)');
      c.fillStyle=halo; c.fillRect(px-ts*1.3,topY-ts*1.3,ts*3.6,ts*4.2);
      // corpo da torre
      c.fillStyle=STONE; c.fillRect(bx0,topY,bw,baseY-topY);
      c.fillStyle=STONED; c.fillRect(bx0,topY,bw*0.2,baseY-topY);
      c.fillStyle=STONEL; c.fillRect(bx1-bw*0.1,topY,bw*0.1,baseY-topY);
      c.strokeStyle=STONED; c.lineWidth=1;               // fiadas de pedra
      for(let yy=topY+ts*0.26; yy<baseY-2; yy+=ts*0.26){ c.beginPath(); c.moveTo(bx0,yy); c.lineTo(bx1,yy); c.stroke(); }
      // ameias no topo do corpo
      c.fillStyle=STONE; for(let i=0;i<4;i++){ c.fillRect(bx0+i*bw/4, topY-ts*0.16, bw/4*0.62, ts*0.16); }
      // pinaculos de canto
      c.fillStyle=STONEL;
      c.beginPath(); c.moveTo(bx0-ts*0.03,topY+ts*0.02); c.lineTo(bx0+ts*0.05,topY-ts*0.34); c.lineTo(bx0+ts*0.13,topY+ts*0.02); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(bx1+ts*0.03,topY+ts*0.02); c.lineTo(bx1-ts*0.05,topY-ts*0.34); c.lineTo(bx1-ts*0.13,topY+ts*0.02); c.closePath(); c.fill();
      // pinaculo CENTRAL pontudo (gotico) + finial brilhante
      c.fillStyle=STONE; c.beginPath(); c.moveTo(cx-ts*0.22,topY-ts*0.08); c.lineTo(cx,topY-ts*1.0); c.lineTo(cx+ts*0.22,topY-ts*0.08); c.closePath(); c.fill();
      c.fillStyle=STONED; c.beginPath(); c.moveTo(cx,topY-ts*1.0); c.lineTo(cx+ts*0.22,topY-ts*0.08); c.lineTo(cx,topY-ts*0.08); c.closePath(); c.fill();
      c.fillStyle='#c9a0ff'; c.shadowColor='#9b6dff'; c.shadowBlur=8; c.beginPath(); c.arc(cx,topY-ts*1.0,ts*0.05,0,Math.PI*2); c.fill(); c.shadowBlur=0;
      // janelas goticas (arco pontudo) brilhando roxo
      function gwin(wy){
        const ww=bw*0.3, wh=ts*0.46;
        c.fillStyle='#0a0810'; c.beginPath();
        c.moveTo(cx-ww/2,wy+wh); c.lineTo(cx-ww/2,wy+wh*0.42); c.lineTo(cx,wy); c.lineTo(cx+ww/2,wy+wh*0.42); c.lineTo(cx+ww/2,wy+wh); c.closePath(); c.fill();
        const fl=0.5+Math.sin(t/420+wy)*0.2;
        c.fillStyle='rgba(155,109,255,'+fl.toFixed(2)+')'; c.beginPath();
        c.moveTo(cx-ww*0.3,wy+wh); c.lineTo(cx-ww*0.3,wy+wh*0.46); c.lineTo(cx,wy+wh*0.14); c.lineTo(cx+ww*0.3,wy+wh*0.46); c.lineTo(cx+ww*0.3,wy+wh); c.closePath(); c.fill();
      }
      gwin(topY+ts*0.34); gwin(topY+ts*1.04);
      // PORTA gotica arqueada na base (a entrada) brilhando roxo
      c.fillStyle=STONED; c.fillRect(bx0+ts*0.04,baseY-ts*0.86,bw-ts*0.08,ts*0.86);
      c.fillStyle='#0a0810'; c.beginPath();
      c.moveTo(cx-ts*0.18,baseY); c.lineTo(cx-ts*0.18,baseY-ts*0.5); c.lineTo(cx,baseY-ts*0.78); c.lineTo(cx+ts*0.18,baseY-ts*0.5); c.lineTo(cx+ts*0.18,baseY); c.closePath(); c.fill();
      const dfl=0.44+Math.sin(t/360)*0.12;
      c.fillStyle='rgba(155,109,255,'+dfl.toFixed(2)+')'; c.beginPath();
      c.moveTo(cx-ts*0.12,baseY); c.lineTo(cx-ts*0.12,baseY-ts*0.44); c.lineTo(cx,baseY-ts*0.66); c.lineTo(cx+ts*0.12,baseY-ts*0.44); c.lineTo(cx+ts*0.12,baseY); c.closePath(); c.fill();
      }
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
    case 'F': {   // CACHOEIRA (agua caindo, animada)
      c.fillStyle = '#345f7a'; c.fillRect(px,py,ts,ts);                     // lamina d'agua escura ao fundo
      const t = Date.now()/110;
      for(let i=0;i<4;i++){
        const xx = px + ts*(0.16 + i*0.22);
        c.fillStyle = (i%2) ? 'rgba(225,242,255,0.9)' : 'rgba(195,224,248,0.72)';
        const off = ((t + i*7) % ts);
        for(let s=-ts; s<ts; s+=11){ c.fillRect(xx, py + ((s+off+ts)%ts), 2, 6); }   // listras caindo
      }
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(px+ts*0.28, py, ts*0.44, 2);  // crista no topo
      return true;
    }
    case '%': {   // SANTUARIO da floresta (pedra musgosa, estilo Ilex)
      forestFloor(c,px,py,ts,gx,gy,false);
      c.fillStyle='rgba(0,0,0,0.24)'; c.beginPath(); c.ellipse(px+ts*0.5,py+ts*0.85,ts*0.34,ts*0.12,0,0,Math.PI*2); c.fill();
      c.fillStyle='#6a6a5e'; c.fillRect(px+ts*0.27,py+ts*0.5,ts*0.46,ts*0.34);   // base
      c.fillStyle='#7c7c6e'; c.fillRect(px+ts*0.33,py+ts*0.2,ts*0.34,ts*0.34);   // corpo
      c.fillStyle='#565649'; c.fillRect(px+ts*0.27,py+ts*0.5,ts*0.46,3);          // sombra base
      c.fillStyle='#8a8a7a'; c.fillRect(px+ts*0.37,py+ts*0.16,ts*0.26,5);         // topo
      c.fillStyle='#3d6b34'; c.fillRect(px+ts*0.3,py+ts*0.46,4,3); c.fillRect(px+ts*0.63,py+ts*0.3,4,3); c.fillRect(px+ts*0.34,py+ts*0.24,3,3);   // musgo
      return true;
    }
  }
  return false;   // T, ^, 4 usam o desenho padrao (o breu por cima escurece tudo)
}

// ---------- bioma PLANALTO (Planaltos Ermais): rocha, penhasco, tarn, pinheiro ----------
const PCOL = {
  grass:'#6f8260', grassDk:'#5d6f50', grassLt:'#84976f',
  rock:'#8a8577', rockDk:'#6e695d', rockLt:'#a6a193',
  gravel:'#9a9384', gravelDk:'#827c6e',
  water:'#4a7a93', waterLt:'#6f9fb5', waterDk:'#3a6276',
  pine:'#2f4a36', pineDk:'#26402d', pineTip:'#4a6b46', ptrunk:'#3a2c1e',
  heather:['#9a6a9e','#c08fb0','#d6b36a'],
};
function plateauGrass(c,px,py,ts,gx,gy){
  const tone=rng(gx,gy,17);
  c.fillStyle = tone<0.25 ? PCOL.grassDk : (tone>0.78 ? PCOL.grassLt : PCOL.grass);
  c.fillRect(px,py,ts,ts);
  if(rng(gx,gy,29)>0.6){ c.fillStyle=PCOL.rockDk; c.fillRect(px+rng(gx,gy,3)*ts*0.9, py+rng(gx,gy,4)*ts*0.9, 2,2); }
  const sway=Math.sin(Date.now()/750 + (gx*0.8+gy*1.1))*1.2; c.lineWidth=1;
  for(let i=0;i<4;i++){ const bx=px+rng(gx,gy,i+1)*ts, by=py+ts*(0.4+rng(gx,gy,i+6)*0.5), h=2+rng(gx,gy,i+11)*2;
    c.strokeStyle = rng(gx,gy,i+16)>0.5 ? PCOL.grassLt : PCOL.grassDk;
    c.beginPath(); c.moveTo(bx,by); c.lineTo(bx+sway,by-h); c.stroke(); }
}
function plateauBoulder(c,px,py,ts,gx,gy){
  plateauGrass(c,px,py,ts,gx,gy);
  c.fillStyle='rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(px+ts*0.54,py+ts*0.78,ts*0.32,ts*0.12,0,0,Math.PI*2); c.fill();
  c.fillStyle=PCOL.rockDk; c.beginPath(); c.arc(px+ts*0.5,py+ts*0.52,ts*0.34,0,Math.PI*2); c.fill();
  c.fillStyle=PCOL.rock; c.beginPath(); c.arc(px+ts*0.45,py+ts*0.48,ts*0.27,0,Math.PI*2); c.fill();
  c.fillStyle=PCOL.rockLt; c.beginPath(); c.arc(px+ts*0.4,py+ts*0.42,ts*0.12,0,Math.PI*2); c.fill();
  c.fillStyle=shade(PCOL.rockDk,-0.08); c.fillRect(px+ts*0.5,py+ts*0.55,ts*0.2,2);
}
function drawPlateauTile(c, ch, px, py, ts, gx, gy){
  switch(ch){
    case '.': case '+': plateauGrass(c,px,py,ts,gx,gy); return true;
    case ',':
      plateauGrass(c,px,py,ts,gx,gy);
      { const col=PCOL.heather[Math.floor(rng(gx,gy,3)*PCOL.heather.length)]; const fx=px+ts*0.5, fy=py+ts*0.5;
        c.fillStyle=col; c.fillRect(fx-1,fy-2,2,2); c.fillRect(fx-2,fy,2,2); c.fillRect(fx+1,fy,2,2); }
      return true;
    case ':':
      plateauGrass(c,px,py,ts,gx,gy);
      c.fillStyle=PCOL.pineDk; c.beginPath(); c.arc(px+ts*0.5,py+ts*0.56,ts*0.26,0,Math.PI*2); c.fill();
      c.fillStyle=PCOL.pine; c.beginPath(); c.arc(px+ts*0.43,py+ts*0.48,ts*0.17,0,Math.PI*2); c.fill();
      return true;
    case 'r':
      plateauGrass(c,px,py,ts,gx,gy);
      for(let i=0;i<5;i++){ c.fillStyle = rng(gx,gy,i)>0.5?PCOL.rock:PCOL.rockDk;
        c.fillRect(px+rng(gx,gy,i+2)*ts*0.8, py+rng(gx,gy,i+7)*ts*0.8, 3,2); }
      return true;
    case '=': {
      c.fillStyle = rng(gx,gy,9)<0.5 ? PCOL.gravel : PCOL.gravelDk; c.fillRect(px,py,ts,ts);
      for(let i=0;i<6;i++){ c.fillStyle = rng(gx,gy,i+13)>0.5 ? shade(PCOL.gravel,0.10) : shade(PCOL.gravel,-0.12);
        c.fillRect(px+rng(gx,gy,i)*ts, py+rng(gx,gy,i+4)*ts, 2,2); }
      return true;
    }
    case '~': {
      c.fillStyle = rng(gx,gy,5)<0.5 ? PCOL.water : shade(PCOL.water,0.05); c.fillRect(px,py,ts,ts);
      const wt=Date.now()/900 + (gx*0.5+gy*0.8); c.strokeStyle='rgba(220,240,255,0.35)'; c.lineWidth=1;
      const wy=py+ts*0.45 + Math.sin(wt)*1.6;
      c.beginPath(); c.moveTo(px+3,wy); c.quadraticCurveTo(px+ts*0.5,wy-2,px+ts-3,wy); c.stroke();
      c.fillStyle=PCOL.waterDk; c.fillRect(px+ts*(0.2+rng(gx,gy,3)*0.5), py+ts*(0.55+rng(gx,gy,4)*0.3),2,1.5);
      return true;
    }
    case 'T': {
      plateauGrass(c,px,py,ts,gx,gy);
      c.fillStyle='rgba(0,0,0,0.16)'; c.beginPath(); c.ellipse(px+ts*0.52,py+ts*0.8,ts*0.22,ts*0.09,0,0,Math.PI*2); c.fill();
      c.fillStyle=PCOL.ptrunk; c.fillRect(px+ts*0.46,py+ts*0.56,ts*0.08,ts*0.28);
      c.fillStyle=PCOL.pineDk;
      for(let k=0;k<3;k++){ const yy=py+ts*(0.24+k*0.17), wsp=ts*(0.32-k*0.06);
        c.beginPath(); c.moveTo(px+ts*0.5,yy-ts*0.08); c.lineTo(px+ts*0.5-wsp,yy+ts*0.13); c.lineTo(px+ts*0.5+wsp,yy+ts*0.13); c.closePath(); c.fill(); }
      c.fillStyle=PCOL.pine; c.beginPath(); c.moveTo(px+ts*0.5,py+ts*0.18); c.lineTo(px+ts*0.37,py+ts*0.35); c.lineTo(px+ts*0.63,py+ts*0.35); c.closePath(); c.fill();
      c.fillStyle=PCOL.pineTip; c.fillRect(px+ts*0.48,py+ts*0.2,2,3);
      return true;
    }
    case 'H': {
      c.fillStyle=PCOL.rockDk; c.fillRect(px,py,ts,ts);
      c.fillStyle=PCOL.rock; c.fillRect(px,py,ts,ts*0.7);
      c.fillStyle=PCOL.rockLt; c.fillRect(px,py,ts,3);
      for(let i=0;i<3;i++){ c.fillStyle=shade(PCOL.rockDk,-0.1);
        c.fillRect(px+ts*(0.2+rng(gx,gy,i)*0.6), py+ts*0.15, 2, ts*0.5); }
      c.fillStyle='rgba(0,0,0,0.30)'; c.fillRect(px,py+ts-4,ts,4);
      return true;
    }
    case '^': plateauBoulder(c,px,py,ts,gx,gy); return true;
  }
  return false;
}

function drawTile(c, ch, px, py, ts, gx, gy){
  if(mapName === 'taverna' || (mapName && (mapName.indexOf('casa_')===0 || mapName.indexOf('loja_')===0))){ drawInteriorTile(c, mapName, ch, px, py, ts, gx, gy); return; }
  if(mapName === 'descampado' && drawCampTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'repouso_dama' && drawForestTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'floresta_ermo' && drawForestTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'bosque_atalech' && drawForestTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'brasal' && drawBrasalTile(c, ch, px, py, ts, gx, gy)) return;
  if((mapName === 'goela_1' || mapName === 'goela_2' || mapName === 'covil_krezath') && drawGoelaTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'costa_maravai' && drawCostaTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'umbraval' && drawUmbravalTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'vespera' && drawVesperaTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'planaltos_ermais' && drawPlateauTile(c, ch, px, py, ts, gx, gy)) return;
  if((mapName === 'avasham' || mapName === 'cova_colosso') && drawDesertTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'valdarkram' && drawCemeteryTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'mina_avhur' && drawMineTile(c, ch, px, py, ts, gx, gy)) return;
  if(mapName === 'camara_avhur' && drawMineTile(c, ch, px, py, ts, gx, gy)) return;
  if((mapName === 'torre_andar1' || mapName === 'torre_andar2' || mapName === 'torre_andar3' || mapName === 'camara_varth') && drawTowerTile(c, ch, px, py, ts, gx, gy)) return;
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
    case '{': {   // telhado da taverna enxaimel (telha escura em fileiras)
      c.fillStyle = '#7a3b2a'; c.fillRect(px,py,ts,ts);
      c.fillStyle = '#5e2c1f'; for(let i=0;i<ts;i+=5) c.fillRect(px, py+i, ts, 2);   // fileiras de telha
      c.fillStyle = '#9a5038'; c.fillRect(px,py,ts,2);                                // crista clara no topo
      break;
    }
    case '}': {   // parede enxaimel (Fachwerk): reboco claro + vigas escuras em X
      c.fillStyle = '#e6ddc8'; c.fillRect(px,py,ts,ts);                               // reboco claro
      c.fillStyle = '#5a3d28';
      c.fillRect(px, py, ts, 3); c.fillRect(px, py+ts-3, ts, 3);                      // travessas horizontais
      c.fillRect(px, py, 3, ts); c.fillRect(px+ts-3, py, 3, ts);                      // montantes verticais
      c.strokeStyle = '#5a3d28'; c.lineWidth = 2.5;                                   // cruz de Santo André
      c.beginPath(); c.moveTo(px+3, py+3); c.lineTo(px+ts-3, py+ts-3);
      c.moveTo(px+ts-3, py+3); c.lineTo(px+3, py+ts-3); c.stroke();
      break;
    }
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

function drawMummy(c, sx, sy, ts, p){
  const t=p.mtype, cx=sx+ts/2, now=performance.now();
  const bob=Math.sin(now/640+cx)*1.3, cy=sy+ts*0.5+bob;
  const LINEN='#d8cdb0', SH='#ab9f80', EYE=(t==='mumia_guerreira')?'#ffcaa0':'#f4b860';
  c.save();
  c.fillStyle='rgba(0,0,0,.30)'; c.beginPath(); c.ellipse(cx,sy+ts*0.85,ts*0.24,ts*0.09,0,0,Math.PI*2); c.fill();
  c.strokeStyle=LINEN; c.lineWidth=Math.max(2,ts*0.07); c.lineCap='round';
  c.beginPath(); c.moveTo(cx-ts*0.07,cy+ts*0.12); c.lineTo(cx-ts*0.08,cy+ts*0.34); c.moveTo(cx+ts*0.07,cy+ts*0.12); c.lineTo(cx+ts*0.09,cy+ts*0.34); c.stroke();
  c.fillStyle=LINEN; roundRect(c,cx-ts*0.13,cy-ts*0.16,ts*0.26,ts*0.32,ts*0.07); c.fill();
  c.fillStyle=SH; for(let i=0;i<4;i++){ c.fillRect(cx-ts*0.13,cy-ts*0.12+i*ts*0.07,ts*0.26,1.4); }
  c.strokeStyle=SH; c.lineWidth=1;
  c.beginPath(); c.moveTo(cx-ts*0.12,cy-ts*0.1); c.lineTo(cx+ts*0.12,cy+ts*0.02); c.moveTo(cx-ts*0.12,cy+ts*0.06); c.lineTo(cx+ts*0.12,cy-ts*0.04); c.stroke();
  const swg=Math.sin(now/400+cx)*ts*0.02;            // atadura solta balancando
  c.strokeStyle=LINEN; c.lineWidth=ts*0.03; c.beginPath(); c.moveTo(cx-ts*0.1,cy+ts*0.12); c.lineTo(cx-ts*0.13+swg,cy+ts*0.28); c.stroke();
  c.strokeStyle=LINEN; c.lineWidth=Math.max(2,ts*0.055);
  if(t==='mumia_guerreira'){
    c.beginPath(); c.moveTo(cx-ts*0.1,cy-ts*0.06); c.lineTo(cx-ts*0.22,cy+ts*0.02); c.stroke();
    c.beginPath(); c.moveTo(cx+ts*0.1,cy-ts*0.06); c.lineTo(cx+ts*0.2,cy-ts*0.16); c.stroke();
    c.strokeStyle='#b8902f'; c.lineWidth=ts*0.045; c.beginPath(); c.moveTo(cx+ts*0.2,cy-ts*0.16); c.lineTo(cx+ts*0.2,cy-ts*0.34); c.stroke(); c.beginPath(); c.arc(cx+ts*0.27,cy-ts*0.34,ts*0.08,Math.PI,Math.PI*1.9); c.stroke();
    c.fillStyle='#d8b24a'; c.fillRect(cx-ts*0.1,cy-ts*0.16,ts*0.2,ts*0.03);
  } else if(t==='escravo_amaldicoado'){
    c.beginPath(); c.moveTo(cx-ts*0.1,cy-ts*0.04); c.lineTo(cx-ts*0.2,cy+ts*0.12); c.stroke();
    c.beginPath(); c.moveTo(cx+ts*0.1,cy-ts*0.04); c.lineTo(cx+ts*0.2,cy+ts*0.12); c.stroke();
    c.strokeStyle='#6a6258'; c.lineWidth=2; c.beginPath(); c.arc(cx-ts*0.2,cy+ts*0.14,ts*0.03,0,Math.PI*2); c.stroke();
    c.fillStyle='#6a6258'; for(let i=0;i<3;i++){ c.beginPath(); c.arc(cx-ts*0.2,cy+ts*0.18+i*ts*0.05,1.6,0,Math.PI*2); c.fill(); }
  } else if(t==='carregador_canopo'){
    c.beginPath(); c.moveTo(cx-ts*0.1,cy-ts*0.04); c.lineTo(cx-ts*0.04,cy+ts*0.06); c.stroke();
    c.beginPath(); c.moveTo(cx+ts*0.1,cy-ts*0.04); c.lineTo(cx+ts*0.04,cy+ts*0.06); c.stroke();
    c.fillStyle='#cdbf96'; roundRect(c,cx-ts*0.07,cy+ts*0.02,ts*0.14,ts*0.16,ts*0.04); c.fill();
    c.fillStyle='#7a6644'; c.beginPath(); c.moveTo(cx-ts*0.05,cy+ts*0.02); c.lineTo(cx,cy-ts*0.06); c.lineTo(cx+ts*0.05,cy+ts*0.02); c.fill();
    c.strokeStyle='#8a7a50'; c.lineWidth=1; c.beginPath(); c.moveTo(cx-ts*0.07,cy+ts*0.1); c.lineTo(cx+ts*0.07,cy+ts*0.1); c.stroke();
  } else {
    c.beginPath(); c.moveTo(cx-ts*0.1,cy-ts*0.06); c.lineTo(cx-ts*0.24,cy-ts*0.02); c.stroke();
    c.beginPath(); c.moveTo(cx+ts*0.1,cy-ts*0.06); c.lineTo(cx+ts*0.24,cy-ts*0.02); c.stroke();
    c.strokeStyle=LINEN; c.lineWidth=1.4; for(const s of[-1,1]){ for(let k=-1;k<=1;k++){ c.beginPath(); c.moveTo(cx+s*ts*0.24,cy-ts*0.02); c.lineTo(cx+s*ts*0.28,cy+k*2); c.stroke(); } }
  }
  const hy=cy-ts*0.25;
  c.fillStyle=LINEN; c.beginPath(); c.arc(cx,hy,ts*0.1,0,Math.PI*2); c.fill();
  c.strokeStyle=SH; c.lineWidth=1.2; for(let i=-1;i<=2;i++){ c.beginPath(); c.moveTo(cx-ts*0.09,hy-ts*0.04+i*ts*0.04); c.lineTo(cx+ts*0.09,hy-ts*0.05+i*ts*0.04); c.stroke(); }
  c.fillStyle='#1a1610'; c.fillRect(cx-ts*0.06,hy-ts*0.01,ts*0.12,ts*0.025);
  c.fillStyle=EYE; c.shadowColor=EYE; c.shadowBlur=4; c.beginPath(); c.arc(cx-ts*0.03,hy,1.4,0,Math.PI*2); c.arc(cx+ts*0.03,hy,1.4,0,Math.PI*2); c.fill(); c.shadowBlur=0;
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawScarab(c, sx, sy, ts, p){
  const cx=sx+ts/2, now=performance.now();
  const cy=sy+ts*0.54+Math.sin(now/300+cx)*0.8;
  const G='#cda23e', GD='#9c7a2c', GL='#e8c862';
  const legph=Math.sin(now/120+cx)*ts*0.02;
  c.save();
  c.fillStyle='rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(cx,sy+ts*0.82,ts*0.26,ts*0.08,0,0,Math.PI*2); c.fill();
  c.strokeStyle=GD; c.lineWidth=Math.max(1.6,ts*0.04); c.lineCap='round';
  for(const s of [-1,1]){ for(let i=0;i<3;i++){ const ay=cy-ts*0.08+i*ts*0.1; c.beginPath(); c.moveTo(cx+s*ts*0.12,ay); c.lineTo(cx+s*ts*0.3,ay-ts*0.04+legph*(i%2?1:-1)); c.stroke(); }}
  c.fillStyle=G; c.beginPath(); c.ellipse(cx,cy,ts*0.2,ts*0.28,0,0,Math.PI*2); c.fill();
  c.fillStyle=GL; c.beginPath(); c.ellipse(cx,cy-ts*0.04,ts*0.13,ts*0.18,0,0,Math.PI*2); c.fill();
  c.strokeStyle=GD; c.lineWidth=1.4; c.beginPath(); c.moveTo(cx,cy-ts*0.22); c.lineTo(cx,cy+ts*0.24); c.stroke();
  c.lineWidth=1; for(let i=0;i<3;i++){ c.beginPath(); c.moveTo(cx-ts*0.12,cy-ts*0.06+i*ts*0.1); c.lineTo(cx-ts*0.02,cy-ts*0.02+i*ts*0.1); c.moveTo(cx+ts*0.12,cy-ts*0.06+i*ts*0.1); c.lineTo(cx+ts*0.02,cy-ts*0.02+i*ts*0.1); c.stroke(); }
  c.fillStyle=GD; c.beginPath(); c.ellipse(cx,cy-ts*0.26,ts*0.1,ts*0.07,0,0,Math.PI*2); c.fill();
  c.fillStyle=GL; c.beginPath(); c.moveTo(cx,cy-ts*0.3); c.lineTo(cx-ts*0.02,cy-ts*0.4); c.lineTo(cx+ts*0.02,cy-ts*0.4); c.fill();
  c.fillStyle='#1a1208'; c.beginPath(); c.arc(cx-ts*0.05,cy-ts*0.26,1.4,0,Math.PI*2); c.arc(cx+ts*0.05,cy-ts*0.26,1.4,0,Math.PI*2); c.fill();
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawCobra(c, sx, sy, ts, p){
  const cx=sx+ts/2, now=performance.now();
  const sway=Math.sin(now/420+cx)*ts*0.03;
  const S='#9aa758', SD='#6f7a3e';
  c.save();
  c.fillStyle='rgba(0,0,0,.26)'; c.beginPath(); c.ellipse(cx,sy+ts*0.84,ts*0.26,ts*0.08,0,0,Math.PI*2); c.fill();
  c.strokeStyle=S; c.lineWidth=ts*0.1; c.lineCap='round';
  c.beginPath(); c.arc(cx,sy+ts*0.72,ts*0.16,0.2,Math.PI*1.6); c.stroke();
  const topx=cx+sway;
  c.beginPath(); c.moveTo(cx-ts*0.02,sy+ts*0.7); c.quadraticCurveTo(cx+ts*0.14,sy+ts*0.5,topx,sy+ts*0.32); c.stroke();
  c.fillStyle=S; c.beginPath(); c.ellipse(topx,sy+ts*0.28,ts*0.16,ts*0.13,0,0,Math.PI*2); c.fill();
  c.fillStyle=SD; c.beginPath(); c.ellipse(topx,sy+ts*0.28,ts*0.16,ts*0.13,0,Math.PI*0.15,Math.PI*0.85); c.fill();
  c.strokeStyle='#1a1208'; c.lineWidth=1.4; c.beginPath(); c.arc(topx-ts*0.06,sy+ts*0.26,ts*0.03,0,Math.PI*2); c.arc(topx+ts*0.06,sy+ts*0.26,ts*0.03,0,Math.PI*2); c.stroke();
  c.fillStyle=SD; c.beginPath(); c.ellipse(topx,sy+ts*0.18,ts*0.07,ts*0.05,0,0,Math.PI*2); c.fill();
  c.fillStyle='#f4d24a'; c.beginPath(); c.arc(topx-ts*0.03,sy+ts*0.17,1.3,0,Math.PI*2); c.arc(topx+ts*0.03,sy+ts*0.17,1.3,0,Math.PI*2); c.fill();
  c.strokeStyle='#c0304a'; c.lineWidth=1.2; c.beginPath(); c.moveTo(topx,sy+ts*0.13); c.lineTo(topx,sy+ts*0.08); c.lineTo(topx-ts*0.015,sy+ts*0.06); c.moveTo(topx,sy+ts*0.08); c.lineTo(topx+ts*0.015,sy+ts*0.06); c.stroke();
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawAnubis(c, sx, sy, ts, p){
  const elite=(p.mtype==='anubis_guerreiro');
  const cx=sx+ts/2, now=performance.now();
  const bob=Math.sin(now/560+cx)*1.2, cy=sy+ts*0.5+bob;
  const SKIN=elite?'#3a2e22':'#46362a', JACK='#15141c', GOLD='#e8c14e', KILT='#e6dcc0';
  c.save();
  c.fillStyle='rgba(0,0,0,.30)'; c.beginPath(); c.ellipse(cx,sy+ts*0.85,ts*0.24,ts*0.09,0,0,Math.PI*2); c.fill();
  c.strokeStyle=SKIN; c.lineWidth=Math.max(2,ts*0.07); c.lineCap='round';
  c.beginPath(); c.moveTo(cx-ts*0.07,cy+ts*0.12); c.lineTo(cx-ts*0.08,cy+ts*0.34); c.moveTo(cx+ts*0.07,cy+ts*0.12); c.lineTo(cx+ts*0.09,cy+ts*0.34); c.stroke();
  c.fillStyle=KILT; c.beginPath(); c.moveTo(cx-ts*0.12,cy+ts*0.02); c.lineTo(cx+ts*0.12,cy+ts*0.02); c.lineTo(cx+ts*0.14,cy+ts*0.16); c.lineTo(cx-ts*0.14,cy+ts*0.16); c.fill();
  if(elite){ c.strokeStyle=GOLD; c.lineWidth=1.4; c.beginPath(); c.moveTo(cx,cy+ts*0.02); c.lineTo(cx,cy+ts*0.16); c.stroke(); }
  c.fillStyle=SKIN; roundRect(c,cx-ts*0.1,cy-ts*0.14,ts*0.2,ts*0.18,ts*0.05); c.fill();
  if(elite){ c.fillStyle=GOLD; c.beginPath(); c.arc(cx,cy-ts*0.12,ts*0.12,0.1,Math.PI-0.1); c.fill(); c.fillStyle=shade(GOLD,-0.2); c.beginPath(); c.arc(cx,cy-ts*0.12,ts*0.08,0.1,Math.PI-0.1); c.fill(); }
  c.strokeStyle=SKIN; c.lineWidth=Math.max(2,ts*0.055);
  c.beginPath(); c.moveTo(cx-ts*0.09,cy-ts*0.1); c.lineTo(cx-ts*0.18,cy+ts*0.04); c.stroke();
  if(elite){
    c.beginPath(); c.moveTo(cx+ts*0.09,cy-ts*0.1); c.lineTo(cx+ts*0.2,cy-ts*0.14); c.stroke();
    c.strokeStyle=GOLD; c.lineWidth=ts*0.045; c.beginPath(); c.moveTo(cx+ts*0.2,cy-ts*0.14); c.lineTo(cx+ts*0.22,cy-ts*0.32); c.stroke(); c.beginPath(); c.arc(cx+ts*0.29,cy-ts*0.32,ts*0.08,Math.PI,Math.PI*1.9); c.stroke();
  } else { c.beginPath(); c.moveTo(cx+ts*0.09,cy-ts*0.1); c.lineTo(cx+ts*0.18,cy+ts*0.04); c.stroke(); }
  const hy=cy-ts*0.26;
  c.fillStyle=JACK;
  c.beginPath(); c.ellipse(cx,hy,ts*0.08,ts*0.09,0,0,Math.PI*2); c.fill();
  c.beginPath(); c.moveTo(cx-ts*0.02,hy+ts*0.02); c.lineTo(cx-ts*0.04,hy+ts*0.14); c.lineTo(cx+ts*0.06,hy+ts*0.1); c.lineTo(cx+ts*0.05,hy); c.fill();
  c.beginPath(); c.moveTo(cx-ts*0.06,hy-ts*0.06); c.lineTo(cx-ts*0.08,hy-ts*0.2); c.lineTo(cx-ts*0.02,hy-ts*0.08); c.fill();
  c.beginPath(); c.moveTo(cx+ts*0.06,hy-ts*0.06); c.lineTo(cx+ts*0.08,hy-ts*0.2); c.lineTo(cx+ts*0.02,hy-ts*0.08); c.fill();
  if(elite){ c.strokeStyle=GOLD; c.lineWidth=1.2; c.beginPath(); c.moveTo(cx-ts*0.08,hy); c.lineTo(cx+ts*0.06,hy); c.stroke(); }
  c.fillStyle=elite?'#ffd24a':'#f4a040'; c.shadowColor=c.fillStyle; c.shadowBlur=4; c.beginPath(); c.arc(cx+ts*0.01,hy+ts*0.02,1.5,0,Math.PI*2); c.fill(); c.shadowBlur=0;
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawSandGuardian(c, sx, sy, ts, p){
  const cx=sx+ts/2, now=performance.now();
  const sway=Math.sin(now/780+cx)*1.0, cy=sy+ts*0.5;
  const ST='#c79a4e', STD='#9c7634', GLOW='#ffcf6a';
  c.save(); c.translate(sway,0);
  c.fillStyle='rgba(0,0,0,.32)'; c.beginPath(); c.ellipse(cx-sway,sy+ts*0.86,ts*0.3,ts*0.1,0,0,Math.PI*2); c.fill();
  c.fillStyle=STD; c.fillRect(cx-ts*0.14,cy+ts*0.1,ts*0.1,ts*0.28); c.fillRect(cx+ts*0.04,cy+ts*0.1,ts*0.1,ts*0.28);
  c.fillStyle=ST; roundRect(c,cx-ts*0.2,cy-ts*0.2,ts*0.4,ts*0.34,ts*0.04); c.fill();
  c.fillStyle=shade(ST,0.12); c.fillRect(cx-ts*0.2,cy-ts*0.2,ts*0.4,ts*0.06);
  c.strokeStyle=STD; c.lineWidth=1.2; c.beginPath();
  c.moveTo(cx-ts*0.2,cy-ts*0.04); c.lineTo(cx+ts*0.2,cy-ts*0.04); c.moveTo(cx,cy-ts*0.2); c.lineTo(cx,cy-ts*0.04); c.moveTo(cx-ts*0.1,cy-ts*0.04); c.lineTo(cx-ts*0.1,cy+ts*0.14); c.moveTo(cx+ts*0.1,cy-ts*0.04); c.lineTo(cx+ts*0.1,cy+ts*0.14); c.stroke();
  c.strokeStyle=GLOW; c.shadowColor=GLOW; c.shadowBlur=5; c.lineWidth=1.6;
  c.beginPath(); c.moveTo(cx-ts*0.04,cy-ts*0.16); c.lineTo(cx-ts*0.04,cy-ts*0.06); c.moveTo(cx-ts*0.08,cy-ts*0.16); c.lineTo(cx,cy-ts*0.16); c.moveTo(cx-ts*0.08,cy-ts*0.1); c.lineTo(cx,cy-ts*0.1); c.stroke(); c.shadowBlur=0;
  c.fillStyle=ST; c.fillRect(cx-ts*0.3,cy-ts*0.16,ts*0.1,ts*0.26); c.fillRect(cx+ts*0.2,cy-ts*0.16,ts*0.1,ts*0.26);
  const hy=cy-ts*0.28;
  c.fillStyle=ST; roundRect(c,cx-ts*0.1,hy-ts*0.08,ts*0.2,ts*0.18,ts*0.03); c.fill();
  c.fillStyle=shade(ST,0.1); c.fillRect(cx-ts*0.1,hy-ts*0.08,ts*0.2,ts*0.04);
  c.fillStyle=GLOW; c.shadowColor=GLOW; c.shadowBlur=5; c.beginPath(); c.arc(cx-ts*0.04,hy,ts*0.022,0,Math.PI*2); c.arc(cx+ts*0.04,hy,ts*0.022,0,Math.PI*2); c.fill(); c.shadowBlur=0;
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawSacerdote(c, sx, sy, ts, p){
  const cx=sx+ts/2, now=performance.now();
  const bob=Math.sin(now/620+cx)*1.4, cy=sy+ts*0.5+bob;
  const ROBE='#2c2740', ROBED='#1c1830', GOLD='#d8b24a', MAG='#8a5ad0';
  c.save();
  c.fillStyle='rgba(0,0,0,.30)'; c.beginPath(); c.ellipse(cx,sy+ts*0.86,ts*0.24,ts*0.09,0,0,Math.PI*2); c.fill();
  c.fillStyle=ROBE; c.beginPath(); c.moveTo(cx,cy-ts*0.2); c.lineTo(cx-ts*0.2,cy+ts*0.32); c.lineTo(cx+ts*0.2,cy+ts*0.32); c.closePath(); c.fill();
  c.fillStyle=ROBED; c.beginPath(); c.moveTo(cx,cy-ts*0.2); c.lineTo(cx-ts*0.04,cy+ts*0.32); c.lineTo(cx+ts*0.04,cy+ts*0.32); c.fill();
  c.strokeStyle=GOLD; c.lineWidth=2; c.beginPath(); c.moveTo(cx-ts*0.18,cy+ts*0.3); c.lineTo(cx+ts*0.18,cy+ts*0.3); c.stroke();
  c.fillStyle=GOLD; c.beginPath(); c.moveTo(cx-ts*0.1,cy-ts*0.14); c.lineTo(cx,cy-ts*0.04); c.lineTo(cx+ts*0.1,cy-ts*0.14); c.lineTo(cx,cy-ts*0.18); c.fill();
  c.strokeStyle=ROBE; c.lineWidth=Math.max(2,ts*0.06); c.beginPath(); c.moveTo(cx+ts*0.06,cy-ts*0.06); c.lineTo(cx+ts*0.16,cy+ts*0.06); c.stroke();
  c.strokeStyle='#7a6644'; c.lineWidth=ts*0.035; c.beginPath(); c.moveTo(cx+ts*0.2,cy+ts*0.2); c.lineTo(cx+ts*0.2,cy-ts*0.24); c.stroke();
  c.strokeStyle=GOLD; c.lineWidth=2; c.beginPath(); c.arc(cx+ts*0.2,cy-ts*0.28,ts*0.03,0,Math.PI*2); c.stroke();
  c.beginPath(); c.moveTo(cx+ts*0.2,cy-ts*0.25); c.lineTo(cx+ts*0.2,cy-ts*0.18); c.moveTo(cx+ts*0.16,cy-ts*0.22); c.lineTo(cx+ts*0.24,cy-ts*0.22); c.stroke();
  const pulse=0.7+Math.sin(now/240)*0.3;
  c.strokeStyle=ROBE; c.lineWidth=Math.max(2,ts*0.055); c.beginPath(); c.moveTo(cx-ts*0.06,cy-ts*0.06); c.lineTo(cx-ts*0.16,cy-ts*0.02); c.stroke();
  c.fillStyle=MAG; c.globalAlpha=pulse; c.shadowColor=MAG; c.shadowBlur=8; c.beginPath(); c.arc(cx-ts*0.16,cy-ts*0.02,ts*0.05,0,Math.PI*2); c.fill(); c.shadowBlur=0; c.globalAlpha=1;
  const hy=cy-ts*0.26;
  c.fillStyle=ROBED; c.beginPath(); c.moveTo(cx-ts*0.12,hy); c.quadraticCurveTo(cx,hy-ts*0.14,cx+ts*0.12,hy); c.lineTo(cx+ts*0.1,hy+ts*0.12); c.lineTo(cx-ts*0.1,hy+ts*0.12); c.fill();
  c.strokeStyle=GOLD; c.lineWidth=1.4; c.beginPath(); c.moveTo(cx-ts*0.1,hy+ts*0.02); c.lineTo(cx+ts*0.1,hy+ts*0.02); c.stroke();
  c.fillStyle='#d8cdb0'; c.beginPath(); c.ellipse(cx,hy+ts*0.06,ts*0.06,ts*0.07,0,0,Math.PI*2); c.fill();
  c.fillStyle=MAG; c.shadowColor=MAG; c.shadowBlur=4; c.beginPath(); c.arc(cx-ts*0.025,hy+ts*0.05,1.3,0,Math.PI*2); c.arc(cx+ts*0.025,hy+ts*0.05,1.3,0,Math.PI*2); c.fill(); c.shadowBlur=0;
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawGhostFarao(c, sx, sy, ts, p){
  const cx=sx+ts/2, now=performance.now();
  const fl=Math.sin(now/500+cx)*ts*0.02;
  const cy=sy+ts*0.46+Math.sin(now/700+cx)*1.5;
  const GH='#bfe6d8', GHD='#7fc8b8', GOLD='#e8d27a';
  const al=0.66+Math.sin(now/600)*0.08;
  c.save();
  c.globalAlpha=al;
  c.fillStyle=GH; c.beginPath(); c.moveTo(cx-ts*0.12,cy-ts*0.04);
  c.quadraticCurveTo(cx-ts*0.16+fl,cy+ts*0.2,cx-ts*0.06,cy+ts*0.34);
  c.quadraticCurveTo(cx,cy+ts*0.24,cx+ts*0.06,cy+ts*0.34);
  c.quadraticCurveTo(cx+ts*0.16-fl,cy+ts*0.2,cx+ts*0.12,cy-ts*0.04); c.closePath(); c.fill();
  c.fillStyle=GHD; roundRect(c,cx-ts*0.1,cy-ts*0.14,ts*0.2,ts*0.2,ts*0.06); c.fill();
  c.strokeStyle=GH; c.lineWidth=ts*0.05; c.lineCap='round';
  c.beginPath(); c.moveTo(cx-ts*0.09,cy-ts*0.08); c.lineTo(cx+ts*0.04,cy); c.moveTo(cx+ts*0.09,cy-ts*0.08); c.lineTo(cx-ts*0.04,cy); c.stroke();
  const hy=cy-ts*0.24;
  c.fillStyle=GOLD; c.globalAlpha=al*0.9;
  c.beginPath(); c.moveTo(cx-ts*0.12,hy+ts*0.02); c.quadraticCurveTo(cx,hy-ts*0.12,cx+ts*0.12,hy+ts*0.02); c.lineTo(cx+ts*0.1,hy+ts*0.12); c.lineTo(cx-ts*0.1,hy+ts*0.12); c.fill();
  c.fillStyle=GH; c.beginPath(); c.ellipse(cx,hy+ts*0.05,ts*0.06,ts*0.07,0,0,Math.PI*2); c.fill();
  c.globalAlpha=1; c.fillStyle='#eafffb'; c.shadowColor='#bfffe8'; c.shadowBlur=6; c.beginPath(); c.arc(cx-ts*0.025,hy+ts*0.04,1.4,0,Math.PI*2); c.arc(cx+ts*0.025,hy+ts*0.04,1.4,0,Math.PI*2); c.fill(); c.shadowBlur=0;
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawEmbalmed(c, sx, sy, ts, p){
  const cx=sx+ts/2, now=performance.now(), throb=Math.sin(now/440+cx)*1.6;
  const cy=sy+ts*0.5+throb;
  const LIN='#cabd9c', LIND='#a89a78', STAIN='#7a5a3a', EYE='#ff7a3a';
  c.save();
  c.fillStyle='rgba(0,0,0,.34)'; c.beginPath(); c.ellipse(cx,sy+ts*0.87,ts*0.34,ts*0.11,0,0,Math.PI*2); c.fill();
  c.strokeStyle=LIN; c.lineWidth=Math.max(3,ts*0.1); c.lineCap='round';
  c.beginPath(); c.moveTo(cx-ts*0.12,cy+ts*0.14); c.lineTo(cx-ts*0.14,cy+ts*0.36); c.moveTo(cx+ts*0.12,cy+ts*0.14); c.lineTo(cx+ts*0.14,cy+ts*0.36); c.stroke();
  c.fillStyle=LIN; c.beginPath(); c.ellipse(cx,cy,ts*0.26,ts*0.24,0,0,Math.PI*2); c.fill();
  c.fillStyle=LIND; for(let i=0;i<4;i++){ const a=i/4*Math.PI*2+now/1100; c.beginPath(); c.arc(cx+Math.cos(a)*ts*0.13,cy+Math.sin(a)*ts*0.1,ts*0.06,0,Math.PI*2); c.fill(); }
  c.strokeStyle=LIND; c.lineWidth=1.4; for(let i=0;i<4;i++){ c.beginPath(); c.moveTo(cx-ts*0.24,cy-ts*0.12+i*ts*0.08); c.lineTo(cx+ts*0.24,cy-ts*0.1+i*ts*0.08); c.stroke(); }
  c.fillStyle=STAIN; c.globalAlpha=0.5; c.beginPath(); c.arc(cx+ts*0.06,cy+ts*0.06,ts*0.05,0,Math.PI*2); c.fill(); c.globalAlpha=1;
  c.strokeStyle=LIN; c.lineWidth=ts*0.09;
  c.beginPath(); c.moveTo(cx-ts*0.2,cy-ts*0.06); c.lineTo(cx-ts*0.34,cy+ts*0.16); c.stroke();
  c.beginPath(); c.moveTo(cx+ts*0.2,cy-ts*0.06); c.lineTo(cx+ts*0.34,cy+ts*0.16); c.stroke();
  for(const hh of [[cx-ts*0.1,cy-ts*0.2],[cx+ts*0.1,cy-ts*0.2],[cx,cy-ts*0.28]]){
    const hx=hh[0], hyo=hh[1];
    c.fillStyle=LIN; c.beginPath(); c.arc(hx,hyo,ts*0.075,0,Math.PI*2); c.fill();
    c.fillStyle='#1a1208'; c.fillRect(hx-ts*0.04,hyo-ts*0.005,ts*0.08,ts*0.02);
    c.fillStyle=EYE; c.shadowColor=EYE; c.shadowBlur=4; c.beginPath(); c.arc(hx-ts*0.02,hyo,1.1,0,Math.PI*2); c.arc(hx+ts*0.02,hyo,1.1,0,Math.PI*2); c.fill(); c.shadowBlur=0;
  }
  c.restore();
  c.save(); c.font='800 7px Cinzel, serif'; c.textAlign='center'; c.textBaseline='bottom';
  const tw=c.measureText('EMBALSAMADA').width+8, tagY=sy-12;
  c.fillStyle='rgba(20,12,4,0.9)'; roundRect(c,cx-tw/2,tagY-11,tw,11,3); c.fill();
  c.fillStyle='#d8c2a0'; c.fillText('EMBALSAMADA',cx,tagY-1.5); c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawFarao(c, sx, sy, ts, p){
  const cx=sx+ts/2, t=performance.now();
  const GOLD='#e8c14e', GOLDD='#b8902f', GOLDL='#f6df8e', LINEN='#e6dcc0', BLUE='#2f6fb0';
  const footY=sy+ts*0.86;                                  // pes: ancora do crescimento 1x3
  // sombra na base (tamanho normal)
  c.save(); c.fillStyle='rgba(0,0,0,.36)'; c.beginPath();
  c.ellipse(cx,footY,ts*0.4,ts*0.13,0,0,Math.PI*2); c.fill(); c.restore();
  // AURA ROXA grande ao redor da figura alta
  c.save();
  const acy=sy-ts*0.55;
  const aurOut=c.createRadialGradient(cx,acy,ts*0.3,cx,acy,ts*1.8);
  aurOut.addColorStop(0,'rgba(155,109,255,0.26)');
  aurOut.addColorStop(0.55,'rgba(123,74,208,0.13)');
  aurOut.addColorStop(1,'rgba(155,109,255,0)');
  c.fillStyle=aurOut; c.fillRect(sx-ts*1.6,sy-ts*2.6,ts*4.2,ts*4.6);
  c.translate(cx,acy); c.rotate(t/900*0.4);
  c.strokeStyle='rgba(201,160,255,0.16)'; c.lineWidth=ts*0.035;
  for(let i=0;i<10;i++){ c.rotate(Math.PI/5); c.beginPath(); c.moveTo(0,ts*1.0); c.lineTo(0,ts*1.5); c.stroke(); }
  c.restore();
  // ================= FIGURA ALTA (1 de largura x ~3 de altura) =================
  c.save();
  c.translate(cx,footY); c.scale(2.4,3.0); c.translate(-cx,-footY);   // cresce ancorado nos pes
  const bob=Math.sin(t/700+cx)*0.5, cy=sy+ts*0.5+bob-ts*0.02;
  // pernas enfaixadas
  c.strokeStyle=LINEN; c.lineWidth=Math.max(1.2,ts*0.05); c.lineCap='round';
  c.beginPath(); c.moveTo(cx-ts*0.08,cy+ts*0.14); c.lineTo(cx-ts*0.09,cy+ts*0.36); c.moveTo(cx+ts*0.08,cy+ts*0.14); c.lineTo(cx+ts*0.1,cy+ts*0.36); c.stroke();
  // corpo / saiote dourado (shendyt)
  c.fillStyle=GOLD; roundRect(c,cx-ts*0.15,cy-ts*0.16,ts*0.3,ts*0.34,ts*0.06); c.fill();
  c.fillStyle=GOLDD; c.fillRect(cx-ts*0.15,cy+ts*0.04,ts*0.3,ts*0.05);
  c.strokeStyle=shade(LINEN,-0.1); c.lineWidth=0.8;
  for(let i=0;i<3;i++){ c.beginPath(); c.moveTo(cx-ts*0.12,cy-ts*0.08+i*ts*0.06); c.lineTo(cx+ts*0.12,cy-ts*0.06+i*ts*0.06); c.stroke(); }
  // colar usekh
  for(let r=0;r<3;r++){ c.strokeStyle=[GOLDL,GOLD,GOLDD][r]; c.lineWidth=ts*0.024;
    c.beginPath(); c.arc(cx,cy-ts*0.18,ts*0.15-r*ts*0.024,Math.PI*0.12,Math.PI*0.88); c.stroke(); }
  // bracos cruzados
  c.strokeStyle=LINEN; c.lineWidth=Math.max(1.2,ts*0.045);
  c.beginPath(); c.moveTo(cx-ts*0.12,cy-ts*0.06); c.lineTo(cx-ts*0.02,cy+ts*0.04); c.stroke();
  c.beginPath(); c.moveTo(cx+ts*0.12,cy-ts*0.06); c.lineTo(cx+ts*0.02,cy+ts*0.04); c.stroke();
  // cetro (heka) e mangual (nekhakha)
  c.strokeStyle=GOLD; c.lineWidth=ts*0.038;
  c.beginPath(); c.moveTo(cx-ts*0.06,cy+ts*0.08); c.lineTo(cx-ts*0.13,cy-ts*0.24); c.stroke();
  c.strokeStyle=GOLDL; c.lineWidth=ts*0.042; c.beginPath(); c.arc(cx-ts*0.13,cy-ts*0.26,ts*0.03,Math.PI*0.5,Math.PI*1.8); c.stroke();
  c.strokeStyle=GOLD; c.lineWidth=ts*0.038; c.beginPath(); c.moveTo(cx+ts*0.06,cy+ts*0.08); c.lineTo(cx+ts*0.13,cy-ts*0.24); c.stroke();
  c.fillStyle=GOLDL; for(let k=-1;k<=1;k++){ c.beginPath(); c.arc(cx+ts*0.13+k*ts*0.03,cy-ts*0.26,ts*0.013,0,Math.PI*2); c.fill(); }
  // halo ROXO atras da cabeca
  const hy=cy-ts*0.30;
  const halo=c.createRadialGradient(cx,hy+ts*0.04,ts*0.03,cx,hy+ts*0.04,ts*0.24);
  halo.addColorStop(0,'rgba(201,160,255,0.45)'); halo.addColorStop(1,'rgba(155,109,255,0)');
  c.fillStyle=halo; c.beginPath(); c.arc(cx,hy+ts*0.04,ts*0.24,0,Math.PI*2); c.fill();
  // cabeca + nemes
  c.fillStyle=GOLD; c.beginPath();
  c.moveTo(cx-ts*0.17,hy+ts*0.03); c.quadraticCurveTo(cx,hy-ts*0.20,cx+ts*0.17,hy+ts*0.03);
  c.lineTo(cx+ts*0.15,hy+ts*0.15); c.lineTo(cx-ts*0.15,hy+ts*0.15); c.closePath(); c.fill();
  c.strokeStyle=BLUE; c.lineWidth=0.9;
  for(let i=-3;i<=3;i++){ c.beginPath(); c.moveTo(cx+i*ts*0.042,hy-ts*0.04); c.lineTo(cx+i*ts*0.048,hy+ts*0.14); c.stroke(); }
  c.fillStyle=GOLD; c.fillRect(cx-ts*0.16,hy+ts*0.03,ts*0.045,ts*0.2); c.fillRect(cx+ts*0.115,hy+ts*0.03,ts*0.045,ts*0.2);
  c.fillStyle=GOLDD; c.fillRect(cx-ts*0.16,hy+ts*0.03,ts*0.045,ts*0.03); c.fillRect(cx+ts*0.115,hy+ts*0.03,ts*0.045,ts*0.03);
  // mascara dourada
  c.fillStyle=shade(GOLD,0.1); c.beginPath(); c.ellipse(cx,hy+ts*0.06,ts*0.088,ts*0.105,0,0,Math.PI*2); c.fill();
  c.strokeStyle=GOLDD; c.lineWidth=0.8; c.stroke();
  // uraeus
  c.fillStyle=GOLDL; c.beginPath(); c.arc(cx,hy-ts*0.03,ts*0.022,0,Math.PI*2); c.fill();
  c.fillStyle=BLUE; c.beginPath(); c.arc(cx,hy-ts*0.035,ts*0.012,0,Math.PI*2); c.fill();
  // olhos ROXOS brilhando (morto-vivo amaldicoado)
  c.fillStyle='#d8b4ff'; c.shadowColor='#b06bff'; c.shadowBlur=7;
  c.beginPath(); c.arc(cx-ts*0.032,hy+ts*0.05,ts*0.017,0,Math.PI*2); c.arc(cx+ts*0.032,hy+ts*0.05,ts*0.017,0,Math.PI*2); c.fill(); c.shadowBlur=0;
  // barba postica
  c.fillStyle=GOLDD; c.fillRect(cx-ts*0.016,hy+ts*0.15,ts*0.032,ts*0.1);
  c.fillStyle=GOLD; for(let i=0;i<3;i++){ c.fillRect(cx-ts*0.016,hy+ts*0.16+i*ts*0.03,ts*0.032,ts*0.012); }
  c.restore();   // fim da figura alta
  // tag AVHUR acima da cabeca alta
  c.save(); c.font='800 8px Cinzel, serif'; c.textAlign='center'; c.textBaseline='bottom';
  const tw=c.measureText('AVHUR').width+10, tagY=sy-ts*1.74;
  c.fillStyle='rgba(40,20,60,0.92)'; roundRect(c,cx-tw/2,tagY-11,tw,11,3); c.fill();
  c.fillStyle='#c9a0ff'; c.fillText('AVHUR',cx,tagY-1.5); c.restore();
  drawMonsterBarName(c, sx, sy-ts*1.9, ts, p);
}
// ============ MONSTROS DA TORRE DO LORDE NECROTICO (arte custom) ============
function drawTumular(c, sx, sy, ts, p){          // morto-vivo inchado da tumba
  const cx=sx+ts/2, t=performance.now(), bob=Math.sin(t/650+cx)*1.0, cy=sy+ts*0.5+bob;
  const ROT='#5a6b3a', ROTD='#3e4d28', SKIN='#7a8a5a', BONE='#d8d2bc';
  c.save();
  c.fillStyle='rgba(0,0,0,.32)'; c.beginPath(); c.ellipse(cx,sy+ts*0.85,ts*0.27,ts*0.1,0,0,Math.PI*2); c.fill();
  c.strokeStyle=ROTD; c.lineWidth=Math.max(2,ts*0.08); c.lineCap='round';
  c.beginPath(); c.moveTo(cx-ts*0.08,cy+ts*0.12); c.lineTo(cx-ts*0.1,cy+ts*0.34); c.moveTo(cx+ts*0.08,cy+ts*0.12); c.lineTo(cx+ts*0.11,cy+ts*0.34); c.stroke();
  c.fillStyle=ROT; c.beginPath(); c.ellipse(cx,cy,ts*0.18,ts*0.2,0,0,Math.PI*2); c.fill();
  c.strokeStyle=BONE; c.lineWidth=1.4;
  for(let i=0;i<3;i++){ c.beginPath(); c.arc(cx,cy-ts*0.02,ts*0.1-i*ts*0.025,Math.PI*0.15,Math.PI*0.85); c.stroke(); }
  c.fillStyle=ROTD; c.beginPath(); c.arc(cx-ts*0.08,cy+ts*0.06,ts*0.04,0,Math.PI*2); c.arc(cx+ts*0.1,cy-ts*0.04,ts*0.03,0,Math.PI*2); c.fill();
  c.strokeStyle=SKIN; c.lineWidth=Math.max(2,ts*0.06);
  c.beginPath(); c.moveTo(cx-ts*0.15,cy-ts*0.02); c.lineTo(cx-ts*0.26,cy+ts*0.1); c.stroke();
  c.beginPath(); c.moveTo(cx+ts*0.15,cy-ts*0.02); c.lineTo(cx+ts*0.26,cy+ts*0.08); c.stroke();
  c.strokeStyle=BONE; c.lineWidth=1.3;
  for(let k=-1;k<=1;k++){ c.beginPath(); c.moveTo(cx-ts*0.26,cy+ts*0.1); c.lineTo(cx-ts*0.31+k,cy+ts*0.14+k*2); c.stroke();
    c.beginPath(); c.moveTo(cx+ts*0.26,cy+ts*0.08); c.lineTo(cx+ts*0.31+k,cy+ts*0.12+k*2); c.stroke(); }
  const hy=cy-ts*0.26;
  c.fillStyle=SKIN; c.beginPath(); c.arc(cx,hy,ts*0.1,0,Math.PI*2); c.fill();
  c.fillStyle=ROTD; c.beginPath(); c.arc(cx-ts*0.04,hy+ts*0.02,ts*0.02,0,Math.PI*2); c.fill();
  c.fillStyle='#c8e070'; c.shadowColor='#c8e070'; c.shadowBlur=4;
  c.beginPath(); c.arc(cx-ts*0.035,hy,ts*0.014,0,Math.PI*2); c.arc(cx+ts*0.035,hy,ts*0.014,0,Math.PI*2); c.fill(); c.shadowBlur=0;
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawCarniceiro(c, sx, sy, ts, p){       // carniceiro-acougueiro morto-vivo
  const cx=sx+ts/2, t=performance.now(), bob=Math.sin(t/700+cx)*0.8, cy=sy+ts*0.5+bob;
  const FLESH='#8a5a4a', APRON='#9a8a7a', BLOOD='#7a1f1f', STEEL='#b8bcc4';
  c.save();
  c.fillStyle='rgba(0,0,0,.32)'; c.beginPath(); c.ellipse(cx,sy+ts*0.85,ts*0.27,ts*0.1,0,0,Math.PI*2); c.fill();
  c.strokeStyle='#4a3a32'; c.lineWidth=Math.max(2,ts*0.08); c.lineCap='round';
  c.beginPath(); c.moveTo(cx-ts*0.08,cy+ts*0.14); c.lineTo(cx-ts*0.09,cy+ts*0.34); c.moveTo(cx+ts*0.08,cy+ts*0.14); c.lineTo(cx+ts*0.1,cy+ts*0.34); c.stroke();
  c.fillStyle=FLESH; roundRect(c,cx-ts*0.16,cy-ts*0.16,ts*0.32,ts*0.32,ts*0.05); c.fill();
  c.fillStyle=APRON; roundRect(c,cx-ts*0.12,cy-ts*0.1,ts*0.24,ts*0.28,ts*0.04); c.fill();
  c.fillStyle=BLOOD; c.beginPath(); c.arc(cx-ts*0.04,cy,ts*0.025,0,Math.PI*2); c.arc(cx+ts*0.05,cy+ts*0.08,ts*0.02,0,Math.PI*2); c.arc(cx,cy-ts*0.06,ts*0.018,0,Math.PI*2); c.fill();
  c.strokeStyle=FLESH; c.lineWidth=Math.max(2,ts*0.06);
  c.beginPath(); c.moveTo(cx-ts*0.15,cy-ts*0.06); c.lineTo(cx-ts*0.24,cy+ts*0.06); c.stroke();
  c.beginPath(); c.moveTo(cx+ts*0.15,cy-ts*0.06); c.lineTo(cx+ts*0.24,cy-ts*0.12); c.stroke();
  c.strokeStyle='#6a5038'; c.lineWidth=ts*0.04; c.beginPath(); c.moveTo(cx+ts*0.24,cy-ts*0.12); c.lineTo(cx+ts*0.24,cy-ts*0.28); c.stroke();
  c.fillStyle=STEEL; roundRect(c,cx+ts*0.2,cy-ts*0.42,ts*0.14,ts*0.16,ts*0.02); c.fill();
  c.fillStyle=shade(STEEL,-0.2); c.fillRect(cx+ts*0.2,cy-ts*0.42,ts*0.03,ts*0.16);
  c.fillStyle=BLOOD; c.fillRect(cx+ts*0.31,cy-ts*0.4,ts*0.03,ts*0.12);
  const hy=cy-ts*0.24;
  c.fillStyle=FLESH; c.beginPath(); c.arc(cx,hy,ts*0.095,0,Math.PI*2); c.fill();
  c.fillStyle='#5a4434'; c.beginPath(); c.arc(cx,hy+ts*0.02,ts*0.095,Math.PI*0.1,Math.PI*0.9); c.fill();
  c.fillStyle='#c8d070'; c.shadowColor='#c8d070'; c.shadowBlur=4;
  c.beginPath(); c.arc(cx-ts*0.035,hy-ts*0.01,ts*0.013,0,Math.PI*2); c.arc(cx+ts*0.035,hy-ts*0.01,ts*0.013,0,Math.PI*2); c.fill(); c.shadowBlur=0;
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawCavaleiroProfano(c, sx, sy, ts, p){  // cavaleiro da morte (armadura escura)
  const cx=sx+ts/2, t=performance.now(), bob=Math.sin(t/750+cx)*0.7, cy=sy+ts*0.5+bob;
  const PLATE='#2e2a3a', PLATEL='#46405a', PUR='#9b6dff', STEEL='#8a8496';
  c.save();
  c.fillStyle='rgba(0,0,0,.34)'; c.beginPath(); c.ellipse(cx,sy+ts*0.85,ts*0.26,ts*0.1,0,0,Math.PI*2); c.fill();
  const au=c.createRadialGradient(cx,cy,ts*0.1,cx,cy,ts*0.4); au.addColorStop(0,'rgba(155,109,255,0.14)'); au.addColorStop(1,'rgba(155,109,255,0)');
  c.fillStyle=au; c.fillRect(sx-ts*0.2,sy-ts*0.2,ts*1.4,ts*1.4);
  c.strokeStyle=PLATE; c.lineWidth=Math.max(2,ts*0.09); c.lineCap='round';
  c.beginPath(); c.moveTo(cx-ts*0.08,cy+ts*0.12); c.lineTo(cx-ts*0.09,cy+ts*0.34); c.moveTo(cx+ts*0.08,cy+ts*0.12); c.lineTo(cx+ts*0.1,cy+ts*0.34); c.stroke();
  c.fillStyle=PLATE; roundRect(c,cx-ts*0.15,cy-ts*0.16,ts*0.3,ts*0.32,ts*0.05); c.fill();
  c.fillStyle=PLATEL; roundRect(c,cx-ts*0.12,cy-ts*0.13,ts*0.24,ts*0.14,ts*0.03); c.fill();
  c.fillStyle=PUR; c.globalAlpha=0.6; c.fillRect(cx-ts*0.02,cy-ts*0.1,ts*0.04,ts*0.22); c.globalAlpha=1;
  c.fillStyle=PLATEL; c.beginPath(); c.arc(cx-ts*0.15,cy-ts*0.12,ts*0.07,0,Math.PI*2); c.arc(cx+ts*0.15,cy-ts*0.12,ts*0.07,0,Math.PI*2); c.fill();
  c.strokeStyle=PLATE; c.lineWidth=Math.max(2,ts*0.06);
  c.beginPath(); c.moveTo(cx+ts*0.15,cy-ts*0.04); c.lineTo(cx+ts*0.24,cy+ts*0.04); c.stroke();
  c.beginPath(); c.moveTo(cx-ts*0.15,cy-ts*0.04); c.lineTo(cx-ts*0.23,cy+ts*0.06); c.stroke();
  c.strokeStyle=STEEL; c.lineWidth=ts*0.05; c.beginPath(); c.moveTo(cx+ts*0.24,cy+ts*0.08); c.lineTo(cx+ts*0.24,cy-ts*0.34); c.stroke();
  c.strokeStyle=PUR; c.lineWidth=ts*0.015; c.shadowColor=PUR; c.shadowBlur=6; c.beginPath(); c.moveTo(cx+ts*0.24,cy+ts*0.06); c.lineTo(cx+ts*0.24,cy-ts*0.32); c.stroke(); c.shadowBlur=0;
  c.fillStyle=PLATEL; c.fillRect(cx+ts*0.18,cy-ts*0.06,ts*0.12,ts*0.03);
  const hy=cy-ts*0.26;
  c.fillStyle=PLATE; c.beginPath(); c.arc(cx,hy,ts*0.1,Math.PI,0); c.fill(); c.fillRect(cx-ts*0.1,hy,ts*0.2,ts*0.12);
  c.fillStyle=PLATEL; c.fillRect(cx-ts*0.1,hy+ts*0.02,ts*0.2,ts*0.02);
  c.fillStyle=PUR; c.shadowColor=PUR; c.shadowBlur=6; c.fillRect(cx-ts*0.06,hy+ts*0.04,ts*0.12,ts*0.025); c.shadowBlur=0;
  c.strokeStyle=PLATEL; c.lineWidth=ts*0.03; c.beginPath(); c.moveTo(cx-ts*0.08,hy-ts*0.04); c.lineTo(cx-ts*0.14,hy-ts*0.14); c.moveTo(cx+ts*0.08,hy-ts*0.04); c.lineTo(cx+ts*0.14,hy-ts*0.14); c.stroke();
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawAlgoz(c, sx, sy, ts, p){             // algoz/carrasco com machado
  const cx=sx+ts/2, t=performance.now(), bob=Math.sin(t/720+cx)*0.7, cy=sy+ts*0.5+bob;
  const SKIN='#6a5a4a', HOOD='#1e1a22', STEEL='#9a96a4', PUR='#9b6dff';
  c.save();
  c.fillStyle='rgba(0,0,0,.34)'; c.beginPath(); c.ellipse(cx,sy+ts*0.85,ts*0.27,ts*0.1,0,0,Math.PI*2); c.fill();
  c.strokeStyle='#2a2420'; c.lineWidth=Math.max(2,ts*0.08); c.lineCap='round';
  c.beginPath(); c.moveTo(cx-ts*0.08,cy+ts*0.14); c.lineTo(cx-ts*0.09,cy+ts*0.34); c.moveTo(cx+ts*0.08,cy+ts*0.14); c.lineTo(cx+ts*0.1,cy+ts*0.34); c.stroke();
  c.fillStyle=SKIN; roundRect(c,cx-ts*0.15,cy-ts*0.14,ts*0.3,ts*0.3,ts*0.06); c.fill();
  c.strokeStyle=shade(SKIN,-0.2); c.lineWidth=1.2; c.beginPath(); c.moveTo(cx,cy-ts*0.1); c.lineTo(cx,cy+ts*0.12); c.stroke();
  c.fillStyle='#3a2a1e'; c.fillRect(cx-ts*0.15,cy+ts*0.08,ts*0.3,ts*0.05);
  c.strokeStyle=SKIN; c.lineWidth=Math.max(2,ts*0.07);
  c.beginPath(); c.moveTo(cx-ts*0.14,cy-ts*0.06); c.lineTo(cx-ts*0.22,cy+ts*0.04); c.stroke();
  c.beginPath(); c.moveTo(cx+ts*0.14,cy-ts*0.06); c.lineTo(cx+ts*0.26,cy-ts*0.08); c.stroke();
  c.strokeStyle='#5a4030'; c.lineWidth=ts*0.045; c.beginPath(); c.moveTo(cx+ts*0.26,cy+ts*0.2); c.lineTo(cx+ts*0.26,cy-ts*0.34); c.stroke();
  c.fillStyle=STEEL; c.beginPath();
  c.moveTo(cx+ts*0.26,cy-ts*0.28); c.quadraticCurveTo(cx+ts*0.46,cy-ts*0.24,cx+ts*0.42,cy-ts*0.08); c.lineTo(cx+ts*0.26,cy-ts*0.14); c.closePath(); c.fill();
  c.beginPath();
  c.moveTo(cx+ts*0.26,cy-ts*0.28); c.quadraticCurveTo(cx+ts*0.06,cy-ts*0.24,cx+ts*0.1,cy-ts*0.08); c.lineTo(cx+ts*0.26,cy-ts*0.14); c.closePath(); c.fill();
  c.strokeStyle=PUR; c.lineWidth=1; c.globalAlpha=0.6; c.stroke(); c.globalAlpha=1;
  const hy=cy-ts*0.25;
  c.fillStyle=HOOD; c.beginPath(); c.arc(cx,hy,ts*0.1,0,Math.PI*2); c.fill();
  c.fillRect(cx-ts*0.1,hy-ts*0.02,ts*0.2,ts*0.12);
  c.fillStyle='#ff5a4a'; c.shadowColor='#ff5a4a'; c.shadowBlur=5;
  c.beginPath(); c.arc(cx-ts*0.035,hy,ts*0.013,0,Math.PI*2); c.arc(cx+ts*0.035,hy,ts*0.013,0,Math.PI*2); c.fill(); c.shadowBlur=0;
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawNecromanteProfano(c, sx, sy, ts, p){  // necromante de manto, orbe roxo
  const cx=sx+ts/2, t=performance.now(), bob=Math.sin(t/800+cx)*1.0, cy=sy+ts*0.5+bob;
  const ROBE='#241e30', ROBEL='#382e4a', PUR='#9b6dff', PURL='#c9a0ff';
  c.save();
  c.fillStyle='rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(cx,sy+ts*0.86,ts*0.24,ts*0.09,0,0,Math.PI*2); c.fill();
  const au=c.createRadialGradient(cx,cy,ts*0.1,cx,cy,ts*0.45); au.addColorStop(0,'rgba(155,109,255,0.18)'); au.addColorStop(1,'rgba(155,109,255,0)');
  c.fillStyle=au; c.fillRect(sx-ts*0.3,sy-ts*0.3,ts*1.6,ts*1.6);
  c.fillStyle=ROBE; c.beginPath(); c.moveTo(cx,cy-ts*0.24); c.lineTo(cx-ts*0.2,cy+ts*0.34); c.lineTo(cx+ts*0.2,cy+ts*0.34); c.closePath(); c.fill();
  c.fillStyle=ROBEL; c.beginPath(); c.moveTo(cx,cy-ts*0.18); c.lineTo(cx-ts*0.06,cy+ts*0.34); c.lineTo(cx+ts*0.06,cy+ts*0.34); c.closePath(); c.fill();
  c.fillStyle=PUR; c.globalAlpha=0.5;
  for(let i=0;i<3;i++){ c.fillRect(cx-ts*0.015,cy-ts*0.05+i*ts*0.1,ts*0.03,ts*0.03); } c.globalAlpha=1;
  c.strokeStyle=ROBE; c.lineWidth=Math.max(2,ts*0.07);
  c.beginPath(); c.moveTo(cx-ts*0.1,cy-ts*0.08); c.lineTo(cx-ts*0.22,cy+ts*0.06); c.stroke();
  c.beginPath(); c.moveTo(cx+ts*0.1,cy-ts*0.08); c.lineTo(cx+ts*0.2,cy-ts*0.02); c.stroke();
  c.strokeStyle='#4a3a2a'; c.lineWidth=ts*0.035; c.beginPath(); c.moveTo(cx-ts*0.24,cy+ts*0.16); c.lineTo(cx-ts*0.24,cy-ts*0.34); c.stroke();
  c.fillStyle=PUR; c.shadowColor=PUR; c.shadowBlur=8; c.beginPath(); c.arc(cx-ts*0.24,cy-ts*0.36,ts*0.05,0,Math.PI*2); c.fill(); c.shadowBlur=0;
  c.fillStyle=PURL; c.beginPath(); c.arc(cx-ts*0.25,cy-ts*0.37,ts*0.02,0,Math.PI*2); c.fill();
  const hy=cy-ts*0.28;
  c.fillStyle=ROBE; c.beginPath(); c.moveTo(cx-ts*0.1,hy+ts*0.06); c.quadraticCurveTo(cx,hy-ts*0.16,cx+ts*0.1,hy+ts*0.06); c.lineTo(cx+ts*0.07,hy+ts*0.1); c.lineTo(cx-ts*0.07,hy+ts*0.1); c.closePath(); c.fill();
  c.fillStyle='#0a0810'; c.beginPath(); c.ellipse(cx,hy+ts*0.04,ts*0.05,ts*0.06,0,0,Math.PI*2); c.fill();
  c.fillStyle=PUR; c.shadowColor=PUR; c.shadowBlur=5;
  c.beginPath(); c.arc(cx-ts*0.025,hy+ts*0.03,ts*0.012,0,Math.PI*2); c.arc(cx+ts*0.025,hy+ts*0.03,ts*0.012,0,Math.PI*2); c.fill(); c.shadowBlur=0;
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawProfanador(c, sx, sy, ts, p){        // profanador de almas (cranio flutuante + almas)
  const cx=sx+ts/2, t=performance.now(), bob=Math.sin(t/600+cx)*1.6, cy=sy+ts*0.46+bob;
  const ROBE='#1e1a28', SKULL='#e8e2d0', PUR='#9b6dff';
  c.save();
  c.fillStyle='rgba(0,0,0,.26)'; c.beginPath(); c.ellipse(cx,sy+ts*0.86,ts*0.2,ts*0.08,0,0,Math.PI*2); c.fill();
  c.save(); c.translate(cx,cy); c.rotate(t/700);
  for(let i=0;i<3;i++){ c.rotate(Math.PI*2/3); c.fillStyle='rgba(184,155,255,0.5)'; c.beginPath(); c.arc(0,ts*0.3,ts*0.03,0,Math.PI*2); c.fill(); }
  c.restore();
  c.fillStyle=ROBE; c.beginPath(); c.moveTo(cx,cy-ts*0.1); c.lineTo(cx-ts*0.18,cy+ts*0.28);
  c.lineTo(cx-ts*0.1,cy+ts*0.22); c.lineTo(cx-ts*0.04,cy+ts*0.3); c.lineTo(cx+ts*0.04,cy+ts*0.22); c.lineTo(cx+ts*0.1,cy+ts*0.3); c.lineTo(cx+ts*0.18,cy+ts*0.28); c.closePath(); c.fill();
  const au=c.createRadialGradient(cx,cy-ts*0.1,ts*0.05,cx,cy-ts*0.1,ts*0.4); au.addColorStop(0,'rgba(155,109,255,0.22)'); au.addColorStop(1,'rgba(155,109,255,0)');
  c.fillStyle=au; c.fillRect(sx-ts*0.3,sy-ts*0.3,ts*1.6,ts*1.6);
  c.strokeStyle=SKULL; c.lineWidth=Math.max(2,ts*0.045);
  c.beginPath(); c.moveTo(cx-ts*0.08,cy-ts*0.02); c.lineTo(cx-ts*0.24,cy-ts*0.1); c.stroke();
  c.beginPath(); c.moveTo(cx+ts*0.08,cy-ts*0.02); c.lineTo(cx+ts*0.24,cy-ts*0.1); c.stroke();
  c.strokeStyle=SKULL; c.lineWidth=1.2;
  for(let s=-1;s<=1;s+=2){ for(let k=-1;k<=1;k++){ c.beginPath(); c.moveTo(cx+s*ts*0.24,cy-ts*0.1); c.lineTo(cx+s*ts*0.28+k,cy-ts*0.14+k*2); c.stroke(); } }
  const hy=cy-ts*0.18;
  c.fillStyle=SKULL; c.beginPath(); c.arc(cx,hy,ts*0.12,0,Math.PI*2); c.fill();
  c.fillStyle=shade(SKULL,-0.15); c.fillRect(cx-ts*0.04,hy+ts*0.08,ts*0.08,ts*0.06);
  c.strokeStyle=shade(SKULL,-0.2); c.lineWidth=1; for(let i=-1;i<=1;i++){ c.beginPath(); c.moveTo(cx+i*ts*0.025,hy+ts*0.08); c.lineTo(cx+i*ts*0.025,hy+ts*0.14); c.stroke(); }
  c.fillStyle=PUR; c.shadowColor=PUR; c.shadowBlur=8;
  c.beginPath(); c.arc(cx-ts*0.045,hy-ts*0.01,ts*0.025,0,Math.PI*2); c.arc(cx+ts*0.045,hy-ts*0.01,ts*0.025,0,Math.PI*2); c.fill(); c.shadowBlur=0;
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

// aura SOMBRIA compartilhada dos monstros da Torre do Varth (halo pulsante + brasas necróticas)
const TOWER_AURA = {tumular_torre:'#7a9a4a', carniceiro_torre:'#8a3a3a', cavaleiro_torre:'#7a4ab0',
                    algoz_torre:'#9a3a5a', necromante_torre:'#9a40d0', profanador_torre:'#7a50c0', lorde_varth:'#9a30c0'};
function _towerAura(c, cx, cy, ts, color){
  const t=performance.now();
  c.save(); c.globalCompositeOperation='lighter';
  const pulse=0.5+0.5*Math.sin(t/600+cx), r=ts*(0.52+pulse*0.12);
  const g=c.createRadialGradient(cx,cy,ts*0.08,cx,cy,r);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(0.45,color); g.addColorStop(1,'rgba(0,0,0,0)');
  c.globalAlpha=0.24+pulse*0.12; c.fillStyle=g; c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2); c.fill();
  c.globalAlpha=0.55; c.fillStyle=color;
  for(let i=0;i<5;i++){ const ph=((t/12)+i*200)%(ts*1.5);
    const px=cx+Math.sin(i*2.1+t/700)*ts*0.32, py=cy+ts*0.4 - ph;
    c.beginPath(); c.arc(px,py,1.7,0,Math.PI*2); c.fill(); }
  c.restore();
}
function drawLordeVarth(c, sx, sy, ts, p){       // Lorde Varth: senhor necromante da torre
  const cx=sx+ts/2, t=performance.now(), bob=Math.sin(t/800+cx)*1.4, cy=sy+ts*0.5+bob;
  const ROBE='#1f1430', ROBE2='#2e1f48', TRIM='#7a40c0', BONE='#e8e0d0', GLOW='#b070ff', SOUL='#c8b0ff';
  c.save();
  // MANTO DE VARGO: aura ROXA pulsante (igual o brilho do Pofnir) enquanto toma metade do dano
  const _manto = (p._status && p._status.couraca_vargo) || (p._purpleAura && t < p._purpleAura);
  if(_manto){
    c.save(); c.globalCompositeOperation='lighter';
    const rg=c.createRadialGradient(cx,cy,0,cx,cy,ts*0.98);
    rg.addColorStop(0,'rgba(176,112,255,0.50)'); rg.addColorStop(0.5,'rgba(155,47,224,0.32)'); rg.addColorStop(1,'rgba(0,0,0,0)');
    c.globalAlpha=0.55+0.25*Math.sin(t/240); c.fillStyle=rg;
    c.beginPath(); c.arc(cx,cy,ts*0.98,0,Math.PI*2); c.fill();
    c.globalAlpha=0.8; c.strokeStyle='#c8b0ff'; c.lineWidth=Math.max(1.5,ts*0.022);
    for(let i=0;i<8;i++){ const a=t/500+i*Math.PI/4; c.beginPath();
      c.arc(cx+Math.cos(a)*ts*0.52, cy+Math.sin(a)*ts*0.52, ts*0.035, 0, Math.PI*2); c.stroke(); }
    c.restore();
  }
  c.fillStyle='rgba(0,0,0,.38)'; c.beginPath(); c.ellipse(cx,sy+ts*0.9,ts*0.34,ts*0.12,0,0,Math.PI*2); c.fill();
  // caveiras de alma orbitando
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=0.5; c.fillStyle=SOUL;
  for(let i=0;i<3;i++){ const a=t/700+i*Math.PI*2/3, ox=cx+Math.cos(a)*ts*0.42, oy=cy-ts*0.1+Math.sin(a)*ts*0.16;
    c.beginPath(); c.arc(ox,oy,ts*0.07,0,Math.PI*2); c.fill(); }
  c.restore();
  // manto longo
  const g=c.createLinearGradient(cx,cy-ts*0.3,cx,cy+ts*0.42);
  g.addColorStop(0,ROBE2); g.addColorStop(1,ROBE);
  c.fillStyle=g; c.beginPath();
  c.moveTo(cx-ts*0.1,cy-ts*0.26); c.lineTo(cx+ts*0.1,cy-ts*0.26);
  c.lineTo(cx+ts*0.3,cy+ts*0.42); c.lineTo(cx-ts*0.3,cy+ts*0.42); c.closePath(); c.fill();
  c.strokeStyle=TRIM; c.lineWidth=Math.max(1.5,ts*0.03);
  c.beginPath(); c.moveTo(cx-ts*0.05,cy-ts*0.2); c.lineTo(cx-ts*0.12,cy+ts*0.4);
  c.moveTo(cx+ts*0.05,cy-ts*0.2); c.lineTo(cx+ts*0.12,cy+ts*0.4); c.stroke();
  // capuz
  const hy=cy-ts*0.32;
  c.fillStyle=ROBE; c.beginPath(); c.moveTo(cx-ts*0.13,hy+ts*0.1); c.quadraticCurveTo(cx,hy-ts*0.18,cx+ts*0.13,hy+ts*0.1);
  c.lineTo(cx+ts*0.1,hy+ts*0.14); c.quadraticCurveTo(cx,hy-ts*0.02,cx-ts*0.1,hy+ts*0.14); c.closePath(); c.fill();
  c.fillStyle='#0a0410'; c.beginPath(); c.ellipse(cx,hy+ts*0.04,ts*0.08,ts*0.1,0,0,Math.PI*2); c.fill();
  // olhos brilhantes
  c.save(); c.globalCompositeOperation='lighter'; c.fillStyle=GLOW; c.shadowColor=GLOW; c.shadowBlur=6;
  c.beginPath(); c.arc(cx-ts*0.04,hy+ts*0.04,ts*0.018,0,Math.PI*2); c.arc(cx+ts*0.04,hy+ts*0.04,ts*0.018,0,Math.PI*2); c.fill();
  c.restore();
  // coroa de ossos
  c.strokeStyle=BONE; c.lineWidth=Math.max(1.5,ts*0.025); c.lineCap='round';
  for(let k=-2;k<=2;k++){ const bx=cx+k*ts*0.05; c.beginPath(); c.moveTo(bx,hy-ts*0.08); c.lineTo(bx,hy-ts*0.16-(k===0?ts*0.04:0)); c.stroke(); }
  // cajado com orbe necrótico
  c.strokeStyle='#3a2a1a'; c.lineWidth=Math.max(2,ts*0.04); c.lineCap='round';
  const stx=cx+ts*0.26; c.beginPath(); c.moveTo(stx,cy-ts*0.3); c.lineTo(stx,cy+ts*0.34); c.stroke();
  c.save(); c.globalCompositeOperation='lighter';
  const orb=c.createRadialGradient(stx,cy-ts*0.34,0,stx,cy-ts*0.34,ts*0.12);
  orb.addColorStop(0,'#ffffff'); orb.addColorStop(0.4,GLOW); orb.addColorStop(1,'rgba(0,0,0,0)');
  c.globalAlpha=0.85+0.15*Math.sin(t/300); c.fillStyle=orb; c.beginPath(); c.arc(stx,cy-ts*0.34,ts*0.12,0,Math.PI*2); c.fill();
  c.restore();
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}
function drawMonster(c, sx, sy, ts, p){
  // cada tipo tem sua arte; o resto cai no emoji.
  const t = p.mtype;
  if(TOWER_AURA[t]) _towerAura(c, sx+ts/2, sy+ts*0.46, ts, TOWER_AURA[t]);   // aura sombria da torre
  if(t === 'maurao'){ drawBoss(c, sx, sy, ts, p); return; }
  if(t === 'dama_noite'){ drawBanshee(c, sx, sy, ts, p); return; }
  if(t === 'capanga' || t === 'capanga_brutamontes'){ drawThug(c, sx, sy, ts, p); return; }
  if(t === 'velho_bob' || t === 'rato_gigante' || t === 'lobo' || t === 'javali' || t === 'lobo_negro'){ drawBeast(c, sx, sy, ts, p); return; }
  if(t === 'coelho' || t === 'lebre' || t === 'veado' || t === 'cervo' || t === 'lobo_cinzento_ermo' || t === 'urso_pardo' || t === 'urso_negro' || t === 'urso_rei'){ drawBeast(c, sx, sy, ts, p); return; }
  if(t === 'cinzal'){ drawCinzal(c, sx, sy, ts, p); return; }
  if(t === 'salamandra_brasal'){ drawSalamandra(c, sx, sy, ts, p); return; }
  if(t === 'serpe_magma'){ drawSerpeMagma(c, sx, sy, ts, p); return; }
  if(t === 'cria_krezath'){ drawDragonete(c, sx, sy, ts, p); return; }
  if(t === 'imp_brasal' || t === 'forjado_krezath' || t === 'templario_magma' || t === 'devoto_krezath'){ drawMagmaConstruct(c, sx, sy, ts, p); return; }
  if(t === 'hiena_rubra' || t === 'bufalo_ermal' || t === 'capivara' || t === 'antilope' || t === 'lobo_umbrio'){ drawBeast(c, sx, sy, ts, p); return; }
  if(t === 'leao_ermal'){ drawLeao(c, sx, sy, ts, p); return; }
  if(t === 'avestruz_brava'){ drawAvestruz(c, sx, sy, ts, p); return; }
  if(t === 'caranguejo_gigante'){ drawCaranguejo(c, sx, sy, ts, p); return; }
  if(t === 'medusa_de_areia'){ drawMedusa(c, sx, sy, ts, p); return; }
  if(t === 'cria_vampirica' || t === 'vampiro_nobre' || t === 'vampiro_anciao'){ drawVampiro(c, sx, sy, ts, p); return; }
  if(t === 'lobisomem_ferino' || t === 'lobisomem_uivador' || t === 'lobisomem_ancestral'){ drawLobisomem(c, sx, sy, ts, p); return; }
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
  // --- MINA DE AVHUR (mortos-vivos egipcios, arte propria) ---
  if(t === 'farao_avhur'){ drawFarao(c, sx, sy, ts, p); return; }
  if(t === 'servo_envolto' || t === 'escravo_amaldicoado' || t === 'mumia_guerreira' || t === 'carregador_canopo'){ drawMummy(c, sx, sy, ts, p); return; }
  if(t === 'sacerdote_sombrio'){ drawSacerdote(c, sx, sy, ts, p); return; }
  if(t === 'abominacao_embalsamada'){ drawEmbalmed(c, sx, sy, ts, p); return; }
  if(t === 'espirito_faraonico'){ drawGhostFarao(c, sx, sy, ts, p); return; }
  if(t === 'escaravelho_praga'){ drawScarab(c, sx, sy, ts, p); return; }
  if(t === 'naja_tumular'){ drawCobra(c, sx, sy, ts, p); return; }
  if(t === 'chacal_anubita' || t === 'anubis_guerreiro'){ drawAnubis(c, sx, sy, ts, p); return; }
  if(t === 'guardiao_arenito'){ drawSandGuardian(c, sx, sy, ts, p); return; }
  if(t === 'tumular_torre'){ drawTumular(c, sx, sy, ts, p); return; }
  if(t === 'carniceiro_torre'){ drawCarniceiro(c, sx, sy, ts, p); return; }
  if(t === 'cavaleiro_torre'){ drawCavaleiroProfano(c, sx, sy, ts, p); return; }
  if(t === 'algoz_torre'){ drawAlgoz(c, sx, sy, ts, p); return; }
  if(t === 'necromante_torre'){ drawNecromanteProfano(c, sx, sy, ts, p); return; }
  if(t === 'profanador_torre'){ drawProfanador(c, sx, sy, ts, p); return; }
  if(t === 'lorde_varth'){ drawLordeVarth(c, sx, sy, ts, p); return; }
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
  coelho:       {body:'#b8a890', belly:'#ece4d6', size:0.50, ear:'point', tail:'tuft', snout:'#d8b0a0', tusk:false, bristle:false, longear:true},
  lebre:        {body:'#a08868', belly:'#d8c8b0', size:0.56, ear:'point', tail:'tuft', snout:'#c8a090', tusk:false, bristle:false, longear:true},
  veado:        {body:'#a87c50', belly:'#d8c0a0', size:1.02, ear:'point', tail:'tuft', snout:'#5a4030', tusk:false, bristle:false, antler:true},
  cervo:        {body:'#8c6240', belly:'#c0a078', size:1.28, ear:'point', tail:'tuft', snout:'#4a3020', tusk:false, bristle:false, antler:true},
  lobo_cinzento_ermo: {body:'#8a8d96', belly:'#aab0b8', size:1.72, ear:'point', tail:'bush', snout:'#4a4d56', tusk:false, bristle:true},
  urso_pardo:   {body:'#6b4a30', belly:'#876848', size:2.60, ear:'round', tail:'tuft', snout:'#3a2a1c', tusk:false, bristle:false},
  urso_negro:   {body:'#221c20', belly:'#3a323a', size:2.80, ear:'round', tail:'tuft', snout:'#100c10', tusk:false, bristle:false},
  urso_rei:     {body:'#4a3424', belly:'#6a4e36', size:3.40, ear:'round', tail:'tuft', snout:'#281a10', tusk:false, bristle:true, crown:true},
  hiena_rubra:  {body:'#8a4838', belly:'#a86450', size:0.86, ear:'point', tail:'tuft', snout:'#4a2418', tusk:false, bristle:true},
  bufalo_ermal: {body:'#3a3230', belly:'#544a44', size:2.60, ear:'round', tail:'tuft', snout:'#221c18', tusk:true, bristle:false},
  capivara:     {body:'#8a6a44', belly:'#a8875c', size:1.30, ear:'round', tail:'tuft', snout:'#5a4228', tusk:false, bristle:false},
  antilope:     {body:'#b08a58', belly:'#d8b888', size:1.20, ear:'point', tail:'tuft', snout:'#6a4a2a', tusk:false, bristle:false, antler:true},
  lobo_umbrio:  {body:'#1c2030', belly:'#2e3448', size:1.80, ear:'point', tail:'bush', snout:'#10121e', tusk:false, bristle:true},
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

  // orelhas LONGAS (coelho/lebre)
  if(base.longear){
    for(const sgn of [-1, 1]){
      const ex = hx + px*hr*0.4*sgn + fx*hr*0.1, ey = hy + py*hr*0.4*sgn + fy*hr*0.1;
      c.save(); c.translate(ex, ey); c.rotate(ang + sgn*0.2);
      c.fillStyle = shade(base.body, -0.05);
      c.beginPath(); c.ellipse(0, -hr*0.85, hr*0.26, hr*1.05, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = base.snout;
      c.beginPath(); c.ellipse(0, -hr*0.85, hr*0.12, hr*0.78, 0, 0, Math.PI*2); c.fill();
      c.restore();
    }
  }
  // GALHADA (veado/cervo): chifres ramificados apontando pra cima
  if(base.antler){
    c.strokeStyle = '#cdb287'; c.lineWidth = Math.max(1.5, ts*0.028*s); c.lineCap = 'round';
    for(const sgn of [-1, 1]){
      const bx0 = hx + sgn*hr*0.32, by0 = hy - hr*0.25;
      const ax = bx0 + sgn*hr*0.35, ay = by0 - hr*0.75;
      c.beginPath(); c.moveTo(bx0, by0); c.lineTo(ax, ay);
      c.lineTo(ax + sgn*hr*0.45, ay - hr*0.5); c.stroke();
      c.beginPath(); c.moveTo(ax - sgn*hr*0.02, ay + hr*0.05); c.lineTo(ax + sgn*hr*0.6, ay - hr*0.02); c.stroke();
      c.beginPath(); c.moveTo(bx0 + sgn*hr*0.15, by0 - hr*0.35); c.lineTo(bx0 + sgn*hr*0.55, by0 - hr*0.5); c.stroke();
    }
  }
  // COROA do Rei do Planalto
  if(base.crown){
    const cwy = hy - hr*0.95, cw = hr*1.25;
    c.fillStyle = '#f4c84a';
    c.beginPath(); c.moveTo(hx - cw/2, cwy);
    c.lineTo(hx - cw/2, cwy - hr*0.32); c.lineTo(hx - cw*0.24, cwy - hr*0.06);
    c.lineTo(hx, cwy - hr*0.44); c.lineTo(hx + cw*0.24, cwy - hr*0.06);
    c.lineTo(hx + cw/2, cwy - hr*0.32); c.lineTo(hx + cw/2, cwy);
    c.closePath(); c.fill();
    c.strokeStyle = '#b8881c'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#e0405a'; c.beginPath(); c.arc(hx, cwy - hr*0.14, Math.max(1.5, hr*0.12), 0, Math.PI*2); c.fill();
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
  if(p.mtype === 'urso_rei'){
    c.save(); c.font = '800 9px Cinzel, serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
    const lbl = '👑 REI DO PLANALTO', tw = c.measureText(lbl).width + 10, tagY = sy - 14;
    c.fillStyle = 'rgba(24,16,8,0.92)'; roundRect(c, cx-tw/2, tagY-12, tw, 12, 3); c.fill();
    c.fillStyle = '#f4c84a'; c.fillText(lbl, cx, tagY-2); c.restore();
  }
  drawMonsterBarName(c, sx, sy, ts, p);
}
function _smokeAura(c, sx, sy, ts){
  // Botas de Vargo: fumaça preta subindo aos pés do jogador
  const t=performance.now(), cx=sx+ts/2, base=sy+ts*0.78;
  c.save();
  for(let i=0;i<5;i++){ const ph=((t/16+i*60)%80)/80;
    const px=cx+Math.sin(t/360+i*1.7)*ts*0.18*(0.4+ph), py=base-ph*ts*0.85, r=ts*0.13*(0.5+ph*0.8);
    c.globalAlpha=(1-ph)*0.42; c.fillStyle='#0c0a14';
    c.beginPath(); c.arc(px,py,r,0,Math.PI*2); c.fill(); }
  c.restore();
}
function drawLordeVarthBoss(c, sx, sy, ts, p){
  // LORDE VARTH (lich): senhor necrótico do topo da Torre. Esquelético, alto e MAGRO.
  const N = p.size || 5;
  const span = N*ts;
  const cx = sx + ts*0.5, cy = sy + ts*0.5;
  const S = span*0.42;                              // "raio" da figura
  const t = performance.now();
  const moving = !!p._moving;
  const bob = moving ? Math.sin(((p.walk||0)/WALK_CYCLE)*Math.PI*2)*3 : Math.sin(t/780)*2.0;
  const ROBE='#190f28', ROBE2='#241636', TRIM='#7a40c0', BONE='#e6ddc8', GLOW='#b070ff', SOUL='#c8b0ff', EYE='#c060ff';

  // sombra no chão
  c.save(); c.fillStyle='rgba(0,0,0,.42)';
  c.beginPath(); c.ellipse(cx, cy+S*0.96, S*0.5, S*0.15, 0, 0, Math.PI*2); c.fill(); c.restore();
  // aura necrótica pulsante + brasas subindo
  c.save(); c.globalCompositeOperation='lighter';
  const pulse=0.5+0.5*Math.sin(t/520);
  const ag=c.createRadialGradient(cx, cy+S*0.5, 0, cx, cy+S*0.5, S*0.95);
  ag.addColorStop(0,'rgba(150,60,200,'+(0.16+0.12*pulse)+')'); ag.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=ag; c.beginPath(); c.ellipse(cx, cy+S*0.5, S*0.95, S*0.5, 0, 0, Math.PI*2); c.fill();
  for(let i=0;i<7;i++){ const ph=((t/22+i*70)%100)/100; c.globalAlpha=(1-ph)*0.5;
    c.fillStyle=i%2?SOUL:GLOW; const ex=cx+Math.sin(t/300+i)*S*0.5;
    c.beginPath(); c.arc(ex, cy+S*0.7-ph*S*1.3, 2.2*(1-ph*0.5), 0, Math.PI*2); c.fill(); }
  c.restore();
  // MANTO DE VARGO: aura ROXA intensa (igual o brilho do Pofnir) enquanto Varth toma metade do dano
  const _manto = (p._status && p._status.couraca_vargo) || (p._purpleAura && t < p._purpleAura);
  if(_manto){
    c.save(); c.globalCompositeOperation='lighter';
    const mg=c.createRadialGradient(cx, cy, 0, cx, cy, S*1.25);
    mg.addColorStop(0,'rgba(190,130,255,0.55)'); mg.addColorStop(0.5,'rgba(155,47,224,0.34)'); mg.addColorStop(1,'rgba(0,0,0,0)');
    c.globalAlpha=0.6+0.25*Math.sin(t/230); c.fillStyle=mg;
    c.beginPath(); c.arc(cx, cy, S*1.25, 0, Math.PI*2); c.fill();
    c.globalAlpha=0.85; c.strokeStyle='#d8c0ff'; c.lineWidth=Math.max(2,S*0.05);
    for(let i=0;i<10;i++){ const a=t/520+i*Math.PI/5; c.beginPath();
      c.arc(cx+Math.cos(a)*S*0.95, cy+Math.sin(a)*S*0.95, S*0.05, 0, Math.PI*2); c.stroke(); }
    c.restore();
  }

  c.save(); c.translate(cx, cy+bob);
  // caveiras de alma orbitando (só as de trás)
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=0.55; c.fillStyle=SOUL;
  for(let i=0;i<4;i++){ const a=t/640+i*Math.PI/2;
    if(Math.sin(a)<0){ c.beginPath(); c.arc(Math.cos(a)*S*0.62, -S*0.1+Math.sin(a)*S*0.2, S*0.06, 0, Math.PI*2); c.fill(); } }
  c.restore();
  // CAJADO atrás com orbe necrótico
  c.strokeStyle='#2a1c10'; c.lineWidth=Math.max(2,S*0.04); c.lineCap='round';
  const stx=-S*0.5; c.beginPath(); c.moveTo(stx,-S*0.5); c.lineTo(stx,S*0.85); c.stroke();
  c.save(); c.globalCompositeOperation='lighter';
  const orb=c.createRadialGradient(stx,-S*0.56,0,stx,-S*0.56,S*0.18);
  orb.addColorStop(0,'#ffffff'); orb.addColorStop(0.4,GLOW); orb.addColorStop(1,'rgba(0,0,0,0)');
  c.globalAlpha=0.85+0.15*Math.sin(t/300); c.fillStyle=orb;
  c.beginPath(); c.arc(stx,-S*0.56,S*0.18,0,Math.PI*2); c.fill(); c.restore();

  // MANTO longo e ESTREITO (silhueta magra) com barra rasgada
  const g=c.createLinearGradient(0,-S*0.45,0,S*0.95);
  g.addColorStop(0,ROBE2); g.addColorStop(1,ROBE);
  c.fillStyle=g; c.beginPath();
  c.moveTo(-S*0.16,-S*0.42); c.lineTo(S*0.16,-S*0.42);
  c.quadraticCurveTo(S*0.30,S*0.2,S*0.26,S*0.9);
  c.lineTo(S*0.16,S*0.78); c.lineTo(S*0.08,S*0.92); c.lineTo(0,S*0.78);
  c.lineTo(-S*0.08,S*0.92); c.lineTo(-S*0.16,S*0.78); c.lineTo(-S*0.26,S*0.9);
  c.quadraticCurveTo(-S*0.30,S*0.2,-S*0.16,-S*0.42); c.closePath(); c.fill();
  c.strokeStyle=TRIM; c.lineWidth=Math.max(1.2,S*0.02);
  c.beginPath(); c.moveTo(-S*0.06,-S*0.36); c.lineTo(-S*0.14,S*0.7);
  c.moveTo(S*0.06,-S*0.36); c.lineTo(S*0.14,S*0.7); c.moveTo(0,-S*0.34); c.lineTo(0,S*0.75); c.stroke();
  // MÃOS ESQUELÉTICAS saindo das mangas
  for(const sgn of [-1,1]){ const hx=sgn*S*0.2, hyh=S*0.34;
    c.fillStyle=BONE; c.beginPath(); c.ellipse(hx,hyh,S*0.05,S*0.07,0,0,Math.PI*2); c.fill();
    c.strokeStyle=BONE; c.lineWidth=Math.max(1.2,S*0.022); c.lineCap='round';
    for(let f=-1;f<=2;f++){ c.beginPath(); c.moveTo(hx+f*S*0.018,hyh+S*0.02); c.lineTo(hx+f*S*0.03,hyh+S*0.12); c.stroke(); } }
  // gola alta pontiaguda
  c.fillStyle=ROBE; c.beginPath();
  c.moveTo(-S*0.16,-S*0.34); c.lineTo(-S*0.26,-S*0.02); c.lineTo(-S*0.05,-S*0.2);
  c.lineTo(0,-S*0.36); c.lineTo(S*0.05,-S*0.2); c.lineTo(S*0.26,-S*0.02); c.lineTo(S*0.16,-S*0.34); c.closePath(); c.fill();

  // CABEÇA: CRÂNIO descarnado
  const hy=-S*0.5, hr=S*0.2;
  c.fillStyle=ROBE; c.beginPath(); c.ellipse(0,hy,hr*1.25,hr*1.4,0,0,Math.PI*2); c.fill();   // sombra do capuz atrás
  c.fillStyle=BONE; c.beginPath();
  c.moveTo(-hr,hy);
  c.quadraticCurveTo(-hr,hy-hr*1.05, 0,hy-hr*1.05);
  c.quadraticCurveTo(hr,hy-hr*1.05, hr,hy);
  c.quadraticCurveTo(hr,hy+hr*0.5, hr*0.45,hy+hr*0.62);
  c.quadraticCurveTo(0,hy+hr*0.74, -hr*0.45,hy+hr*0.62);
  c.quadraticCurveTo(-hr,hy+hr*0.5, -hr,hy); c.closePath(); c.fill();
  c.fillStyle='#d2c6ab'; c.beginPath();                                                       // maçãs do rosto
  c.ellipse(-hr*0.5,hy+hr*0.2,hr*0.16,hr*0.24,0.3,0,Math.PI*2);
  c.ellipse(hr*0.5,hy+hr*0.2,hr*0.16,hr*0.24,-0.3,0,Math.PI*2); c.fill();
  c.fillStyle='#150a20'; c.beginPath();                                                       // órbitas fundas
  c.ellipse(-hr*0.44,hy-hr*0.04,hr*0.27,hr*0.32,0.18,0,Math.PI*2);
  c.ellipse(hr*0.44,hy-hr*0.04,hr*0.27,hr*0.32,-0.18,0,Math.PI*2); c.fill();
  c.save(); c.globalCompositeOperation='lighter';                                             // olhos brilhantes
  for(const sgn of [-1,1]){ const ex=sgn*hr*0.44, ey=hy-hr*0.04;
    const eg=c.createRadialGradient(ex,ey,0,ex,ey,hr*0.22);
    eg.addColorStop(0,'#ffffff'); eg.addColorStop(0.4,EYE); eg.addColorStop(1,'rgba(0,0,0,0)');
    c.globalAlpha=0.6+0.3*Math.sin(t/260); c.fillStyle=eg;
    c.beginPath(); c.arc(ex,ey,hr*0.22,0,Math.PI*2); c.fill();
    c.globalAlpha=1; c.fillStyle=EYE; c.beginPath(); c.arc(ex,ey,hr*0.08,0,Math.PI*2); c.fill(); }
  c.restore();
  c.fillStyle='#150a20'; c.beginPath();                                                       // cavidade nasal
  c.moveTo(0,hy+hr*0.16); c.lineTo(-hr*0.1,hy+hr*0.4); c.lineTo(hr*0.1,hy+hr*0.4); c.closePath(); c.fill();
  c.fillStyle=BONE; c.fillRect(-hr*0.3,hy+hr*0.5,hr*0.6,hr*0.14);                              // dentes
  c.strokeStyle='#9a8f76'; c.lineWidth=Math.max(0.8,S*0.012);
  for(let i=-2;i<=2;i++){ c.beginPath(); c.moveTo(i*hr*0.12,hy+hr*0.5); c.lineTo(i*hr*0.12,hy+hr*0.64); c.stroke(); }
  // COROA de espinhos de osso
  c.strokeStyle=BONE; c.lineWidth=Math.max(1.4,S*0.022); c.lineCap='round';
  for(let kk=-3;kk<=3;kk++){ const bx=kk*hr*0.26, bh=(kk%2===0?hr*0.52:hr*0.32);
    c.beginPath(); c.moveTo(bx,hy-hr*0.95); c.lineTo(bx,hy-hr*0.95-bh); c.stroke(); }
  c.strokeStyle=TRIM; c.lineWidth=Math.max(1.4,S*0.03);
  c.beginPath(); c.arc(0,hy-hr*0.3,hr*0.92,Math.PI*1.15,Math.PI*1.85); c.stroke();
  c.restore();
  drawMonsterBarName(c, cx - ts/2, cy - S - 6, ts, p);
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

function drawColosso(c, sx, sy, ts, p){
  // O COLOSSO DE AVASHAM: golem de pedra colossal (4x4), com fendas de energia
  // ambar pulsando entre as placas e cascalho flutuando ao redor.
  const N = p.size || 4;
  const span = N*ts;
  const cx = sx + ts*0.5, cy = sy + ts*0.5;
  const t = performance.now();
  const moving = !!p._moving;
  const bob = moving ? Math.sin(((p.walk||0)/WALK_CYCLE)*Math.PI*2)*3 : Math.sin(t/950)*2.2;
  const pulse = 0.5 + 0.5*Math.sin(t/520);
  const S = span*0.42;                               // "raio" da figura
  const STONE='#8d8275', STONE_D=shade('#8d8275',-0.24), STONE_L=shade('#8d8275',0.18);
  const GLOW='#f4b860', HOT='#ff9a3a';

  // sombra grande no chao
  c.save();
  c.fillStyle='rgba(0,0,0,.40)';
  c.beginPath(); c.ellipse(cx, cy+S*0.96, S*0.78, S*0.22, 0, 0, Math.PI*2); c.fill();
  c.restore();

  // cascalho / poeira flutuando ao redor (ele desperta a terra)
  c.save();
  for(let i=0;i<7;i++){
    const a=t/1500+i*0.9, rr=S*(0.85+0.12*Math.sin(t/650+i));
    const dx=Math.cos(a)*rr, dy=Math.sin(a*1.2)*S*0.5 + bob;
    c.fillStyle='rgba(150,138,118,'+(0.30+0.25*Math.sin(t/480+i))+')';
    c.fillRect(cx+dx, cy+dy, 3, 3);
  }
  c.restore();

  c.save();
  c.translate(cx, cy+bob);

  // pernas (pilares de pedra) + pes
  c.fillStyle=STONE_D;
  c.fillRect(-S*0.34, S*0.30, S*0.26, S*0.62);
  c.fillRect( S*0.08, S*0.30, S*0.26, S*0.62);
  c.fillStyle=shade(STONE_D,-0.15);
  c.fillRect(-S*0.38, S*0.86, S*0.32, S*0.12);
  c.fillRect( S*0.06, S*0.86, S*0.32, S*0.12);

  // tronco macico + placas (textura)
  c.fillStyle=STONE;
  c.beginPath();
  c.moveTo(-S*0.46,-S*0.10); c.lineTo(-S*0.40,S*0.40); c.lineTo(S*0.40,S*0.40);
  c.lineTo(S*0.46,-S*0.10); c.lineTo(S*0.32,-S*0.34); c.lineTo(-S*0.32,-S*0.34);
  c.closePath(); c.fill();
  c.strokeStyle=STONE_D; c.lineWidth=Math.max(1.4,S*0.025);
  c.beginPath();
  c.moveTo(-S*0.30,-S*0.06); c.lineTo(S*0.30,-S*0.06);
  c.moveTo(-S*0.22,S*0.18); c.lineTo(S*0.22,S*0.18);
  c.moveTo(0,-S*0.34); c.lineTo(0,S*0.40); c.stroke();

  // nucleo brilhante no peito (energia presa na pedra)
  c.save(); c.globalAlpha=0.55+0.4*pulse;
  const cg=c.createRadialGradient(0,S*0.02,1,0,S*0.02,S*0.40);
  cg.addColorStop(0,HOT); cg.addColorStop(0.5,'rgba(244,184,96,0.5)'); cg.addColorStop(1,'rgba(244,184,96,0)');
  c.fillStyle=cg; c.beginPath(); c.arc(0,S*0.02,S*0.40,0,Math.PI*2); c.fill();
  c.restore();

  // ombros (matacoes) + picos de pedra
  c.fillStyle=STONE_L;
  c.beginPath(); c.arc(-S*0.46,-S*0.16,S*0.24,0,Math.PI*2); c.fill();
  c.beginPath(); c.arc( S*0.46,-S*0.16,S*0.24,0,Math.PI*2); c.fill();
  c.fillStyle=shade(STONE_L,-0.22);
  for(const sgn of [-1,1]){
    for(const ox of [0.40,0.55]){
      c.beginPath();
      c.moveTo(sgn*S*ox,-S*0.34);
      c.lineTo(sgn*(S*ox+S*0.05),-S*0.08);
      c.lineTo(sgn*(S*ox-S*0.06),-S*0.20);
      c.closePath(); c.fill();
    }
  }

  // bracos + punhos gigantes
  c.strokeStyle=STONE; c.lineWidth=S*0.20; c.lineCap='round';
  c.beginPath(); c.moveTo(-S*0.46,-S*0.08); c.lineTo(-S*0.60,S*0.30); c.stroke();
  c.beginPath(); c.moveTo( S*0.46,-S*0.08); c.lineTo( S*0.60,S*0.30); c.stroke();
  c.fillStyle=STONE_L;
  c.beginPath(); c.arc(-S*0.62,S*0.36,S*0.18,0,Math.PI*2); c.fill();
  c.beginPath(); c.arc( S*0.62,S*0.36,S*0.18,0,Math.PI*2); c.fill();
  c.fillStyle=shade(STONE_L,-0.25);
  for(const sgn of [-1,1]){
    c.fillRect(sgn*S*0.66-S*0.04, S*0.26, S*0.08, S*0.07);
    c.fillRect(sgn*S*0.66-S*0.04, S*0.37, S*0.08, S*0.06);
  }

  // fendas de energia pelo corpo
  c.strokeStyle=GLOW; c.lineWidth=Math.max(1.6,S*0.04); c.shadowColor=HOT; c.shadowBlur=8+6*pulse;
  c.globalAlpha=0.7+0.3*pulse; c.lineCap='round';
  c.beginPath();
  c.moveTo(-S*0.22,-S*0.30); c.lineTo(-S*0.08,-S*0.04); c.lineTo(-S*0.18,S*0.22);
  c.moveTo( S*0.20,-S*0.26); c.lineTo( S*0.04,S*0.06); c.lineTo(S*0.12,S*0.34);
  c.moveTo(-S*0.40,S*0.10); c.lineTo(-S*0.20,S*0.04);
  c.stroke();
  c.shadowBlur=0; c.globalAlpha=1;

  // cabeca (bloco com coroa de picos)
  c.fillStyle=STONE;
  c.beginPath();
  c.moveTo(-S*0.22,-S*0.34); c.lineTo(-S*0.20,-S*0.64); c.lineTo(S*0.20,-S*0.64);
  c.lineTo(S*0.22,-S*0.34); c.closePath(); c.fill();
  c.fillStyle=STONE_D;
  c.fillRect(-S*0.18,-S*0.42, S*0.36, S*0.08);
  c.fillStyle=shade(STONE_L,-0.05);
  for(const ox of [-0.14,-0.05,0.05,0.14]){
    c.beginPath();
    c.moveTo(S*ox-S*0.05,-S*0.64); c.lineTo(S*ox,-S*0.80); c.lineTo(S*ox+S*0.05,-S*0.64);
    c.closePath(); c.fill();
  }
  // olhos + boca brilhantes
  c.fillStyle=HOT; c.shadowColor=HOT; c.shadowBlur=10;
  c.beginPath();
  c.arc(-S*0.09,-S*0.51,S*0.05,0,Math.PI*2);
  c.arc( S*0.09,-S*0.51,S*0.05,0,Math.PI*2); c.fill();
  c.lineWidth=Math.max(1.4,S*0.03); c.strokeStyle=HOT;
  c.beginPath(); c.moveTo(-S*0.10,-S*0.40); c.lineTo(S*0.10,-S*0.40); c.stroke();
  c.shadowBlur=0;

  c.restore();

  drawMonsterBarName(c, cx - ts/2, cy - S - 6, ts, p);   // nome + barra acima
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

  const fem = (look.sex === 'F');                              // gênero: muda a silhueta
  const bodyTop = py+ts*0.42 + bob, bodyH = ts*0.40, bodyW = ts*(fem ? 0.395 : 0.44);

  // ---- corpo (capa): preenche, sombreia embaixo, luz no peito, contorno ----
  c.fillStyle = cloak;
  roundRect(c, cx-bodyW/2, bodyTop, bodyW, bodyH, 5); c.fill();
  c.save(); roundRect(c, cx-bodyW/2, bodyTop, bodyW, bodyH, 5); c.clip();
  c.fillStyle = cloakDk; c.fillRect(cx-bodyW/2, bodyTop+bodyH*0.56, bodyW, bodyH*0.44);   // sombra base
  c.fillStyle = cloakLt; c.fillRect(cx-bodyW*0.30, bodyTop+2, bodyW*0.24, bodyH*0.5);     // luz no peito
  c.restore();
  c.strokeStyle = ink; c.lineWidth = 1.4;
  roundRect(c, cx-bodyW/2, bodyTop, bodyW, bodyH, 5); c.stroke();

  // ---- saia/vestido (silhueta feminina): trapézio que abre na base, cobrindo as pernas ----
  if(fem){
    const skTop = bodyTop + bodyH*0.50, skBot = py+ts*0.80 + bob;
    const skTw = bodyW*0.50, skBw = bodyW*0.92;               // meias-larguras: estreito no quadril, largo na barra
    c.fillStyle = cloak;
    c.beginPath();
    c.moveTo(cx-skTw, skTop); c.lineTo(cx+skTw, skTop);
    c.lineTo(cx+skBw, skBot); c.lineTo(cx-skBw, skBot); c.closePath(); c.fill();
    c.save(); c.clip();                                        // sombra na barra + dobras do tecido
    c.fillStyle = cloakDk; c.fillRect(cx-skBw, skBot-ts*0.07, skBw*2, ts*0.07);
    c.fillStyle = cloakLt; c.fillRect(cx-skTw*0.6, skTop, skTw*0.5, (skBot-skTop)*0.7);
    c.strokeStyle = cloakDk; c.lineWidth = 1;
    for(let i=-1;i<=1;i++){ c.beginPath(); c.moveTo(cx+i*skTw*0.7, skTop+2); c.lineTo(cx+i*skBw*0.7, skBot); c.stroke(); }
    c.restore();
    c.strokeStyle = ink; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(cx-skTw, skTop); c.lineTo(cx-skBw, skBot);
    c.lineTo(cx+skBw, skBot); c.lineTo(cx+skTw, skTop); c.stroke();
    c.fillStyle = shade(cloak,-0.5);                          // pezinhos espiando sob a barra
    roundRect(c, cx-ts*0.11, skBot-1.5, ts*0.085, ts*0.05, 2); c.fill();
    roundRect(c, cx+ts*0.025, skBot-1.5, ts*0.085, ts*0.05, 2); c.fill();
  }

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
    if(fem){                                                                              // cabelo longo: mechas até os ombros
      c.fillStyle = look.hair;
      roundRect(c, hx-hr*1.02, hy-hr*0.12, hr*0.40, hr*1.55, 3); c.fill();
      roundRect(c, hx+hr*0.62, hy-hr*0.12, hr*0.40, hr*1.55, 3); c.fill();
      c.fillStyle = hairDk;
      c.fillRect(hx-hr*1.02, hy+hr*1.0, hr*0.40, 2);
      c.fillRect(hx+hr*0.62, hy+hr*1.0, hr*0.40, 2);
    }
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
function drawFacalanPanther(c, sx, sy, ts, p){
  // a Forma de Facalan: pantera dourada divina, vista de lado
  const t = Date.now()/1000;
  const dir = (p.facing === 'left') ? -1 : 1;
  const cx = sx + ts*0.5, cy = sy + ts*0.5;
  const stride = p._moving ? Math.sin((p.walk/WALK_CYCLE)*Math.PI*2) : 0;
  const bob = p._moving ? Math.abs(stride)*1.4 : Math.sin(t*1.5)*0.6;
  const goldD = '#9c6b1e', goldM = '#d99a2b', goldL = '#f7c85a', goldH = '#ffe9a8';
  c.save();
  c.translate(cx, cy - bob);
  if(dir < 0) c.scale(-1, 1);                                   // espelha pra esquerda
  // --- aura divina dourada pulsante ---
  const a = 0.2 + 0.1*Math.abs(Math.sin(t*2));
  const gl = c.createRadialGradient(0, ts*0.08, ts*0.1, 0, ts*0.08, ts*0.92);
  gl.addColorStop(0, 'rgba(255,224,140,'+a.toFixed(3)+')');
  gl.addColorStop(1, 'rgba(255,200,90,0)');
  c.fillStyle = gl; c.fillRect(-ts*0.85, -ts*0.75, ts*1.7, ts*1.6);
  // --- sombra no chao ---
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath(); c.ellipse(0, ts*0.43, ts*0.42, ts*0.1, 0, 0, 7); c.fill();
  // --- cauda (curva atras, balançando) ---
  const tail = Math.sin(t*2.6)*ts*0.09;
  c.strokeStyle = goldM; c.lineWidth = ts*0.085; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-ts*0.3, ts*0.06);
  c.quadraticCurveTo(-ts*0.62, ts*0.02 + tail, -ts*0.5, -ts*0.34 + tail); c.stroke();
  c.fillStyle = goldD;
  c.beginPath(); c.arc(-ts*0.5, -ts*0.34 + tail, ts*0.055, 0, 7); c.fill();   // ponta escura
  // --- patas traseiras ---
  const sw = stride*ts*0.1;
  c.fillStyle = goldD;
  c.beginPath(); c.ellipse(-ts*0.18 - sw, ts*0.35, ts*0.065, ts*0.14, 0, 0, 7); c.fill();
  c.beginPath(); c.ellipse(-ts*0.06 + sw, ts*0.35, ts*0.065, ts*0.14, 0, 0, 7); c.fill();
  // --- corpo: tronco + lombo arqueado em gradiente ---
  const bg = c.createLinearGradient(0, -ts*0.18, 0, ts*0.3);
  bg.addColorStop(0, goldL); bg.addColorStop(0.55, goldM); bg.addColorStop(1, goldD);
  c.fillStyle = bg;
  c.beginPath(); c.ellipse(-ts*0.02, ts*0.13, ts*0.33, ts*0.19, 0, 0, 7); c.fill();
  c.beginPath();
  c.moveTo(-ts*0.32, ts*0.13);
  c.quadraticCurveTo(-ts*0.08, -ts*0.2, ts*0.28, -ts*0.04);
  c.quadraticCurveTo(ts*0.35, ts*0.1, ts*0.27, ts*0.22);
  c.lineTo(-ts*0.28, ts*0.26); c.closePath(); c.fill();
  // brilho no lombo
  c.fillStyle = 'rgba(255,233,168,0.5)';
  c.beginPath(); c.ellipse(ts*0.02, -ts*0.04, ts*0.2, ts*0.05, -0.25, 0, 7); c.fill();
  // --- patas dianteiras ---
  c.fillStyle = goldM;
  c.beginPath(); c.ellipse(ts*0.18 + sw, ts*0.35, ts*0.065, ts*0.15, 0, 0, 7); c.fill();
  c.beginPath(); c.ellipse(ts*0.28 - sw, ts*0.35, ts*0.065, ts*0.15, 0, 0, 7); c.fill();
  // --- rosetas (padrao de pantera) ---
  c.fillStyle = 'rgba(120,72,14,0.42)';
  for(const m of [[-ts*0.14,ts*0.1,ts*0.035],[ts*0.0,ts*0.17,ts*0.03],[ts*0.13,ts*0.07,ts*0.032],[-ts*0.04,ts*0.0,ts*0.027],[ts*0.08,ts*0.18,ts*0.026]]){
    c.beginPath(); c.arc(m[0], m[1], m[2], 0, 7); c.fill();
  }
  // --- pescoço + cabeça ---
  c.fillStyle = bg;
  c.beginPath(); c.ellipse(ts*0.3, ts*0.0, ts*0.12, ts*0.14, -0.3, 0, 7); c.fill();
  const hg = c.createLinearGradient(ts*0.3, -ts*0.22, ts*0.52, ts*0.05);
  hg.addColorStop(0, goldH); hg.addColorStop(1, goldM);
  c.fillStyle = hg;
  c.beginPath(); c.ellipse(ts*0.43, -ts*0.09, ts*0.15, ts*0.13, 0, 0, 7); c.fill();
  // focinho
  c.fillStyle = goldL;
  c.beginPath(); c.ellipse(ts*0.55, -ts*0.02, ts*0.07, ts*0.055, 0, 0, 7); c.fill();
  c.fillStyle = '#3a2410';                                       // nariz
  c.beginPath(); c.moveTo(ts*0.59, -ts*0.045); c.lineTo(ts*0.62, -ts*0.02); c.lineTo(ts*0.59, ts*0.005); c.closePath(); c.fill();
  // orelhas
  c.fillStyle = goldD;
  c.beginPath(); c.moveTo(ts*0.35, -ts*0.21); c.lineTo(ts*0.39, -ts*0.34); c.lineTo(ts*0.45, -ts*0.21); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(ts*0.46, -ts*0.2); c.lineTo(ts*0.52, -ts*0.31); c.lineTo(ts*0.54, -ts*0.18); c.closePath(); c.fill();
  c.fillStyle = '#5a3a12';                                       // interior das orelhas
  c.beginPath(); c.moveTo(ts*0.375, -ts*0.22); c.lineTo(ts*0.4, -ts*0.3); c.lineTo(ts*0.43, -ts*0.22); c.closePath(); c.fill();
  // olho divino (branco, íris verde-dourada, pupila, brilho)
  c.fillStyle = '#fff7d8';
  c.beginPath(); c.ellipse(ts*0.47, -ts*0.11, ts*0.038, ts*0.03, 0, 0, 7); c.fill();
  c.fillStyle = '#2f7a44';
  c.beginPath(); c.arc(ts*0.485, -ts*0.11, ts*0.019, 0, 7); c.fill();
  c.fillStyle = '#0a0a0a';
  c.beginPath(); c.ellipse(ts*0.488, -ts*0.11, ts*0.007, ts*0.017, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.beginPath(); c.arc(ts*0.478, -ts*0.118, ts*0.009, 0, 7); c.fill();
  // bigodes
  c.strokeStyle = 'rgba(255,242,205,0.7)'; c.lineWidth = 1;
  for(let i=-1;i<=1;i++){ c.beginPath(); c.moveTo(ts*0.56, -ts*0.01+i*ts*0.018); c.lineTo(ts*0.72, -ts*0.03+i*ts*0.045); c.stroke(); }
  // --- partículas douradas subindo ---
  for(let i=0;i<5;i++){ const prog = ((t*0.5 + i*0.21) % 1); const px = (i-2)*ts*0.14 + Math.sin(t+i)*ts*0.03;
    const py = ts*0.32 - prog*ts*0.85;
    c.globalAlpha = 0.7*(1-prog); c.fillStyle = 'rgba(255,231,150,0.9)';
    c.beginPath(); c.arc(px, py, ts*0.022, 0, 7); c.fill(); }
  c.globalAlpha = 1;
  c.restore();
  // nome
  if(p.name){
    c.save(); c.font = '600 11px Inter, sans-serif'; c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(p.name, cx+0.7, sy-2.3);
    c.fillStyle = (p.id===myId) ? '#ffe08a' : '#f0d8a0'; c.fillText(p.name, cx, sy-3);
    if(p.title){
      c.save(); c.font = '600 8.5px Inter';
      c.fillStyle = 'rgba(0,0,0,.65)'; c.fillText(p.title, cx+0.6, sy-12.4);
      c.fillStyle = '#c9a860'; c.fillText(p.title, cx, sy-13);
      c.restore();
    }
    c.restore();
  }
}
function drawAuroraGlow(c, sx, sy, ts){
  // brilho de amanhecer da Valíria em volta do paladino (Aurora de Valíria)
  const t = Date.now()/500, a = 0.24 + 0.12*Math.abs(Math.sin(t));
  const cx = sx + ts/2, cy = sy + ts*0.5;
  const gl = c.createRadialGradient(cx, cy, ts*0.1, cx, cy, ts);
  gl.addColorStop(0, 'rgba(255,238,180,'+a+')');
  gl.addColorStop(0.6, 'rgba(255,206,110,'+(a*0.45).toFixed(3)+')');
  gl.addColorStop(1, 'rgba(255,206,110,0)');
  c.save();
  c.fillStyle = gl; c.fillRect(sx-ts*0.75, sy-ts*0.75, ts*2.5, ts*2.5);
  c.globalAlpha = a; c.strokeStyle = 'rgba(255,242,196,0.85)'; c.lineWidth = 2;
  c.beginPath(); c.arc(cx, cy, ts*0.5 + Math.sin(t)*2, 0, 7); c.stroke();   // halo pulsante
  c.globalAlpha = a*0.8; c.strokeStyle = 'rgba(255,228,160,0.7)'; c.lineWidth = 1.4;
  for(let i=0;i<6;i++){ const an = t*0.4 + i*Math.PI/3;                     // raios de aurora subindo
    c.beginPath(); c.moveTo(cx+Math.cos(an)*ts*0.42, cy+Math.sin(an)*ts*0.42);
    c.lineTo(cx+Math.cos(an)*ts*0.62, cy+Math.sin(an)*ts*0.62); c.stroke(); }
  c.restore();
}
function drawCancaoGlow(c, sx, sy, ts){
  // brilho de cabaré do José + notas musicais subindo (Canção do Cabaré)
  const t = Date.now()/1000;
  const cx = sx + ts/2, cy = sy + ts*0.5;
  const a = 0.16 + 0.08*Math.abs(Math.sin(t*1.6));
  c.save();
  const gl = c.createRadialGradient(cx, cy, ts*0.1, cx, cy, ts*0.95);   // glow quente de palco
  gl.addColorStop(0, 'rgba(255,210,140,'+a+')');
  gl.addColorStop(0.55, 'rgba(214,120,170,'+(a*0.4).toFixed(3)+')');     // toque de rosa-cabaré
  gl.addColorStop(1, 'rgba(214,120,170,0)');
  c.fillStyle = gl; c.fillRect(sx-ts*0.7, sy-ts*0.7, ts*2.4, ts*2.4);
  const notes = ['\u266a','\u266b','\u266c'];   // ♪ ♫ ♬ subindo em volta
  c.textAlign = 'center';
  for(let i=0;i<4;i++){
    const prog = ((t*0.45 + i*0.27) % 1);
    const ang = i*Math.PI/2 + t*0.5;
    const nx = cx + Math.cos(ang)*ts*0.38;
    const ny = cy - prog*ts*0.85 + ts*0.2;
    c.globalAlpha = (0.85*(1-prog)) * (0.6+0.4*Math.sin(t*2+i));
    c.fillStyle = (i%2) ? '#ffd27a' : '#e89ac0';
    c.font = ((ts*0.26)|0)+'px serif';
    c.fillText(notes[i%3], nx, ny);
  }
  c.globalAlpha = 1;
  c.restore();
}
function drawCorujaForm(c, sx, sy, ts, p){
  // Coruja Demoníaca de Nherith, envolta na luz roxa do Faraó
  const t = Date.now()/1000;
  const cx = sx + ts*0.5, cy = sy + ts*0.5;
  const dir = (p.facing === 'left') ? -1 : 1;
  const bob = Math.sin(t*2)*ts*0.03 + (p._moving ? Math.abs(Math.sin((p.walk/WALK_CYCLE)*Math.PI*2))*ts*0.04 : 0);
  const flutter = p._moving ? Math.sin((p.walk/WALK_CYCLE)*Math.PI*4)*0.32 : Math.sin(t*3)*0.12;
  const dark='#2a2335', mid='#463a5c', lite='#6b5a87', plum='#7b4ad0', glow='#c9a0ff';
  c.save();
  // --- AURA ROXA DO FARAÓ (gradiente + raios girando) ---
  const acy = cy - ts*0.1;
  const aur = c.createRadialGradient(cx, acy, ts*0.2, cx, acy, ts*1.1);
  aur.addColorStop(0, 'rgba(155,109,255,0.28)');
  aur.addColorStop(0.55, 'rgba(123,74,208,0.14)');
  aur.addColorStop(1, 'rgba(155,109,255,0)');
  c.fillStyle = aur; c.fillRect(sx-ts*0.9, sy-ts*0.9, ts*2.8, ts*2.8);
  c.save(); c.translate(cx, acy); c.rotate(t*0.4);
  c.strokeStyle = 'rgba(201,160,255,0.18)'; c.lineWidth = ts*0.03;
  for(let i=0;i<8;i++){ c.rotate(Math.PI/4); c.beginPath(); c.moveTo(0, ts*0.55); c.lineTo(0, ts*0.85); c.stroke(); }
  c.restore();
  // --- sombra ---
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath(); c.ellipse(cx, sy+ts*0.82, ts*0.3, ts*0.08, 0, 0, 7); c.fill();
  c.translate(cx, cy - bob);
  if(dir < 0) c.scale(-1, 1);
  // --- asa (atrás, batendo) ---
  c.save(); c.rotate(flutter);
  const wg = c.createLinearGradient(0,-ts*0.2,0,ts*0.2);
  wg.addColorStop(0, mid); wg.addColorStop(1, dark);
  c.fillStyle = wg;
  c.beginPath(); c.moveTo(-ts*0.05, -ts*0.12);
  c.quadraticCurveTo(-ts*0.52, -ts*0.1, -ts*0.42, ts*0.24);
  c.quadraticCurveTo(-ts*0.2, ts*0.1, -ts*0.05, ts*0.16); c.closePath(); c.fill();
  c.strokeStyle = dark; c.lineWidth = 1;
  for(let i=0;i<3;i++){ c.beginPath(); c.moveTo(-ts*0.12-i*ts*0.1, -ts*0.04); c.lineTo(-ts*0.34-i*ts*0.05, ts*0.18); c.stroke(); }
  c.restore();
  // --- corpo (penas em gradiente) ---
  const bg = c.createLinearGradient(0,-ts*0.25,0,ts*0.28);
  bg.addColorStop(0, lite); bg.addColorStop(0.5, mid); bg.addColorStop(1, dark);
  c.fillStyle = bg;
  c.beginPath(); c.ellipse(0, ts*0.08, ts*0.25, ts*0.3, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(150,130,180,0.38)';                       // peito mais claro
  c.beginPath(); c.ellipse(0, ts*0.12, ts*0.16, ts*0.22, 0, 0, 7); c.fill();
  c.strokeStyle = dark; c.lineWidth = 1;                        // padrão de penas (V)
  for(let i=0;i<4;i++){ const yy=ts*(0.0+i*0.08); c.beginPath(); c.moveTo(-ts*0.09, yy); c.lineTo(0, yy+ts*0.03); c.lineTo(ts*0.09, yy); c.stroke(); }
  // --- garras ---
  c.strokeStyle = plum; c.lineWidth = ts*0.03; c.lineCap='round';
  for(const gx of [-ts*0.1, ts*0.1]){
    c.beginPath(); c.moveTo(gx, ts*0.34); c.lineTo(gx, ts*0.42); c.stroke();
    c.fillStyle = glow;
    for(const dx of [-0.04,0,0.04]){ c.beginPath(); c.moveTo(gx+dx*ts, ts*0.42); c.lineTo(gx+dx*ts*1.5, ts*0.47); c.lineTo(gx+dx*ts, ts*0.445); c.closePath(); c.fill(); }
  }
  // --- cabeça (larga, tufos demoníacos) ---
  c.fillStyle = bg;
  c.beginPath(); c.ellipse(0, -ts*0.18, ts*0.25, ts*0.21, 0, 0, 7); c.fill();
  c.fillStyle = dark;                                           // tufos/chifres
  c.beginPath(); c.moveTo(-ts*0.19, -ts*0.3); c.lineTo(-ts*0.3, -ts*0.47); c.lineTo(-ts*0.09, -ts*0.34); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(ts*0.19, -ts*0.3); c.lineTo(ts*0.3, -ts*0.47); c.lineTo(ts*0.09, -ts*0.34); c.closePath(); c.fill();
  c.fillStyle = 'rgba(40,32,55,0.55)';                          // disco facial
  c.beginPath(); c.ellipse(-ts*0.1, -ts*0.16, ts*0.11, ts*0.13, 0, 0, 7); c.fill();
  c.beginPath(); c.ellipse(ts*0.1, -ts*0.16, ts*0.11, ts*0.13, 0, 0, 7); c.fill();
  // --- olhos demoníacos (halo roxo + íris dourada do Faraó + pupila) ---
  const eg = 0.7 + 0.3*Math.abs(Math.sin(t*3));
  for(const ex of [-ts*0.1, ts*0.1]){
    c.fillStyle = 'rgba(123,74,208,'+(0.5*eg).toFixed(2)+')';
    c.beginPath(); c.arc(ex, -ts*0.16, ts*0.085, 0, 7); c.fill();
    c.fillStyle = '#ffe9a8';
    c.beginPath(); c.arc(ex, -ts*0.16, ts*0.058, 0, 7); c.fill();
    c.fillStyle = '#7b4ad0';
    c.beginPath(); c.arc(ex, -ts*0.16, ts*0.034, 0, 7); c.fill();
    c.fillStyle = '#160c1e';
    c.beginPath(); c.arc(ex, -ts*0.16, ts*0.017, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(ex-ts*0.012, -ts*0.172, ts*0.01, 0, 7); c.fill();
  }
  // bico afiado
  c.fillStyle = '#160c16';
  c.beginPath(); c.moveTo(0, -ts*0.12); c.lineTo(ts*0.035, -ts*0.05); c.lineTo(-ts*0.035, -ts*0.05); c.closePath(); c.fill();
  c.fillStyle = plum;
  c.beginPath(); c.moveTo(0, -ts*0.05); c.lineTo(ts*0.014, -ts*0.02); c.lineTo(-ts*0.014, -ts*0.02); c.closePath(); c.fill();
  // --- partículas roxas subindo ---
  for(let i=0;i<5;i++){ const prog = ((t*0.5 + i*0.2) % 1); const px=(i-2)*ts*0.12; const py=ts*0.2 - prog*ts*0.8;
    c.globalAlpha = 0.6*(1-prog); c.fillStyle = 'rgba(201,160,255,0.9)';
    c.beginPath(); c.arc(px, py, ts*0.02, 0, 7); c.fill(); }
  c.globalAlpha = 1;
  c.restore();
}
function drawLebreForm(c, sx, sy, ts, p){
  // a forma de lebre de Nharé: translúcida (invisível) com brilho divino
  const t = Date.now()/300;
  const cx = sx + ts*0.5;
  const hop = p._moving ? Math.abs(Math.sin((p.walk/WALK_CYCLE)*Math.PI*2))*3 : 0;
  const by = sy + ts*0.72 - hop;
  const dir = (p.facing === 'left') ? -1 : 1;
  c.save();
  c.globalAlpha = 0.16; c.fillStyle = '#000';                       // sombra
  c.beginPath(); c.ellipse(cx, sy+ts*0.84, ts*0.2, ts*0.06, 0, 0, 7); c.fill();
  c.globalAlpha = 0.72;                                             // semi-transparente
  c.fillStyle = '#e8e6ee';                                          // corpo
  c.beginPath(); c.ellipse(cx, by, ts*0.2, ts*0.15, 0, 0, 7); c.fill();
  c.beginPath(); c.arc(cx+dir*ts*0.15, by-ts*0.1, ts*0.1, 0, 7); c.fill();   // cabeça
  c.fillStyle = '#dcdae4';                                          // orelhas longas
  c.beginPath(); c.ellipse(cx+dir*ts*0.13, by-ts*0.27, ts*0.035, ts*0.13, dir*0.18, 0, 7); c.fill();
  c.beginPath(); c.ellipse(cx+dir*ts*0.21, by-ts*0.27, ts*0.035, ts*0.13, -dir*0.05, 0, 7); c.fill();
  c.fillStyle = '#c9a0ff';                                          // interior das orelhas
  c.beginPath(); c.ellipse(cx+dir*ts*0.13, by-ts*0.27, ts*0.014, ts*0.09, dir*0.18, 0, 7); c.fill();
  c.fillStyle = '#2a2535';                                          // olho
  c.beginPath(); c.arc(cx+dir*ts*0.18, by-ts*0.11, ts*0.02, 0, 7); c.fill();
  c.fillStyle = '#fff';                                             // rabo de algodão
  c.beginPath(); c.arc(cx-dir*ts*0.18, by, ts*0.05, 0, 7); c.fill();
  c.globalAlpha = 0.45; c.fillStyle = 'hsl('+((t*30)%360)+',90%,82%)';      // brilho divino
  c.beginPath(); c.arc(cx+Math.cos(t)*ts*0.12, by-ts*0.1+Math.sin(t)*ts*0.06, ts*0.028, 0, 7); c.fill();
  c.restore();
}
function drawMesaParty(c, sx, sy, ts, p){
  const cx = sx + ts/2, cy = sy + ts/2;
  c.fillStyle = 'rgba(0,0,0,0.22)';                                  // sombra
  c.beginPath(); c.ellipse(cx, cy+ts*0.34, ts*0.42, ts*0.14, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = '#5a3d28'; c.fillRect(cx-ts*0.06, cy+ts*0.04, ts*0.12, ts*0.3);   // pé central
  c.fillStyle = '#6e4a2e';                                           // tampo redondo
  c.beginPath(); c.ellipse(cx, cy, ts*0.46, ts*0.3, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = '#86603c';
  c.beginPath(); c.ellipse(cx, cy-ts*0.03, ts*0.42, ts*0.26, 0, 0, Math.PI*2); c.fill();
  c.strokeStyle = 'rgba(74,49,32,0.55)'; c.lineWidth = 1;            // veios da madeira
  c.beginPath(); c.ellipse(cx, cy-ts*0.03, ts*0.28, ts*0.17, 0, 0, Math.PI*2); c.stroke();
  c.beginPath(); c.ellipse(cx, cy-ts*0.03, ts*0.15, ts*0.09, 0, 0, Math.PI*2); c.stroke();
  const mugs = [[-0.22,-0.04],[0.18,-0.1],[0.02,0.08]];             // canecas em cima
  for(const m of mugs){
    c.fillStyle = '#c8a868'; c.fillRect(cx+m[0]*ts-2, cy+m[1]*ts-4, 5, 6);
    c.fillStyle = '#e8d49a'; c.fillRect(cx+m[0]*ts-2, cy+m[1]*ts-4, 5, 2);
    c.fillStyle = '#a8884a'; c.fillRect(cx+m[0]*ts+3, cy+m[1]*ts-3, 1.5, 3);
  }
  const pul = 0.28 + 0.22*Math.abs(Math.sin(Date.now()/650));        // brilho pulsante (clicável)
  c.strokeStyle = 'rgba(244,184,96,'+pul.toFixed(2)+')'; c.lineWidth = 2;
  c.beginPath(); c.ellipse(cx, cy, ts*0.52, ts*0.36, 0, 0, Math.PI*2); c.stroke();
  const label = '\ud83c\udf7b Mesa de Confraterniza\u00e7\u00f5es';  // rótulo flutuante
  c.font = '600 11px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const tw = c.measureText(label).width, ly = cy - ts*0.5;
  c.fillStyle = 'rgba(20,16,30,0.82)';
  if(c.roundRect){ c.beginPath(); c.roundRect(cx-tw/2-6, ly-9, tw+12, 18, 5); c.fill(); }
  else c.fillRect(cx-tw/2-6, ly-9, tw+12, 18);
  c.fillStyle = '#f4d8a0'; c.fillText(label, cx, ly);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
}

function drawMaineCoon(c, sx, sy, ts, p){
  // A forma abençoada por Pofnir: um Maine Coon majestoso (tabby marrom, juba
  // creme, cauda emplumada, orelhas com tufo de lince, olhos dourados) e a aura.
  const cx = sx + ts*0.5, cy = sy + ts*0.5, S = ts*0.95;
  const dir = (p.facing === 'left') ? -1 : 1;
  const hop = (p._moving) ? Math.abs(Math.sin((p.walk/WALK_CYCLE)*Math.PI*2))*ts*0.05 : 0;
  const t = Date.now()/1000;
  const fur = '#8a6a44', furDk = '#5d4528', cream = '#ece0c4', pink = '#e0a0a8';
  c.save();
  c.translate(cx, cy - hop);
  // --- aura dourada do Pofnir (pulsante) + halo ---
  const aa = 0.18 + 0.10*Math.abs(Math.sin(t*1.6));
  c.save(); c.globalCompositeOperation = 'lighter';
  const gl = c.createRadialGradient(0, -S*0.1, S*0.1, 0, -S*0.1, S*0.95);
  gl.addColorStop(0, 'rgba(255,222,140,'+aa+')'); gl.addColorStop(1, 'rgba(255,222,140,0)');
  c.fillStyle = gl; c.beginPath(); c.arc(0, -S*0.1, S*0.95, 0, Math.PI*2); c.fill();
  c.strokeStyle = 'rgba(255,228,150,0.75)'; c.lineWidth = Math.max(1.5, S*0.035);
  c.shadowColor = '#ffe09a'; c.shadowBlur = 10;
  c.beginPath(); c.ellipse(0, -S*0.78, S*0.4, S*0.12, 0, 0, Math.PI*2); c.stroke();
  c.restore();
  // --- sombra ---
  c.save(); c.globalAlpha = 0.26; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0, S*0.62, S*0.5, S*0.13, 0, 0, Math.PI*2); c.fill(); c.restore();
  // --- cauda emplumada (atrás, curvando pra cima) com ponta creme ---
  c.save(); c.lineCap = 'round';
  c.strokeStyle = fur; c.lineWidth = S*0.28;
  c.beginPath(); c.moveTo(-dir*S*0.3, S*0.44);
  c.quadraticCurveTo(-dir*S*0.76, S*0.14, -dir*S*0.62, -S*0.36); c.stroke();
  c.strokeStyle = furDk; c.lineWidth = S*0.06; c.globalAlpha = 0.45;
  for(let i=0;i<3;i++){ const yy=(0.2-i*0.18)*S; c.beginPath(); c.moveTo(-dir*S*(0.5+i*0.04), yy); c.lineTo(-dir*S*(0.66+i*0.04), yy+S*0.04); c.stroke(); }
  c.globalAlpha = 1;
  c.strokeStyle = cream; c.lineWidth = S*0.24;
  c.beginPath(); c.moveTo(-dir*S*0.66, -S*0.16); c.lineTo(-dir*S*0.61, -S*0.36); c.stroke();
  c.restore();
  // --- corpo fofo (tabby) ---
  c.fillStyle = fur;
  c.beginPath(); c.ellipse(0, S*0.28, S*0.5, S*0.54, 0, 0, Math.PI*2); c.fill();
  c.strokeStyle = furDk; c.lineWidth = Math.max(1, S*0.045); c.globalAlpha = 0.5;   // listras no flanco
  for(let i=0;i<4;i++){ const yy=S*(0.02+i*0.16);
    c.beginPath(); c.moveTo(-S*0.46,yy); c.quadraticCurveTo(-S*0.3,yy+S*0.05,-S*0.16,yy); c.stroke();
    c.beginPath(); c.moveTo(S*0.46,yy);  c.quadraticCurveTo(S*0.3,yy+S*0.05,S*0.16,yy);  c.stroke(); }
  c.globalAlpha = 1;
  // --- juba/peito creme (a marca do Maine Coon) ---
  c.fillStyle = cream;
  c.beginPath(); c.moveTo(-S*0.3,-S*0.05);
  c.quadraticCurveTo(-S*0.42,S*0.5,0,S*0.62);
  c.quadraticCurveTo(S*0.42,S*0.5,S*0.3,-S*0.05);
  c.quadraticCurveTo(0,S*0.12,-S*0.3,-S*0.05); c.closePath(); c.fill();
  c.fillStyle = '#f4ead0';
  for(let i=-2;i<=2;i++){ c.beginPath(); c.moveTo(i*S*0.13,S*0.02);
    c.lineTo(i*S*0.13-S*0.05,S*0.5); c.lineTo(i*S*0.13+S*0.05,S*0.5); c.closePath(); c.fill(); }
  // --- cabeça + bochechas tufadas ---
  c.fillStyle = fur;
  c.beginPath(); c.ellipse(0,-S*0.28,S*0.4,S*0.36,0,0,Math.PI*2); c.fill();
  c.beginPath(); c.moveTo(-S*0.36,-S*0.28); c.lineTo(-S*0.56,-S*0.12); c.lineTo(-S*0.33,-S*0.02); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.36,-S*0.28);  c.lineTo(S*0.56,-S*0.12);  c.lineTo(S*0.33,-S*0.02);  c.closePath(); c.fill();
  c.strokeStyle = furDk; c.lineWidth = Math.max(1, S*0.035); c.globalAlpha = 0.7;   // "M" tabby na testa
  for(let i=-1;i<=1;i++){ c.beginPath(); c.moveTo(i*S*0.1,-S*0.58); c.lineTo(i*S*0.1,-S*0.42); c.stroke(); }
  c.globalAlpha = 1;
  c.fillStyle = cream;
  c.beginPath(); c.ellipse(0,-S*0.14,S*0.18,S*0.14,0,0,Math.PI*2); c.fill();
  // --- orelhas grandes com tufo de lince ---
  function ear(dx){
    c.fillStyle = fur;
    c.beginPath(); c.moveTo(dx-S*0.06,-S*0.5); c.lineTo(dx+S*0.05,-S*0.92); c.lineTo(dx+S*0.2,-S*0.48); c.closePath(); c.fill();
    c.fillStyle = pink;
    c.beginPath(); c.moveTo(dx+S*0.01,-S*0.54); c.lineTo(dx+S*0.06,-S*0.8); c.lineTo(dx+S*0.13,-S*0.52); c.closePath(); c.fill();
    c.strokeStyle = cream; c.lineWidth = Math.max(1, S*0.025); c.lineCap = 'round';
    c.beginPath(); c.moveTo(dx+S*0.05,-S*0.92); c.lineTo(dx+S*0.08,-S*1.04); c.stroke();
    c.beginPath(); c.moveTo(dx+S*0.05,-S*0.92); c.lineTo(dx+S*0.0,-S*1.0); c.stroke();
  }
  ear(-S*0.28); ear(S*0.08);
  // --- olhos dourados/esverdeados brilhantes (pupila vertical) ---
  function eye(dx){
    c.fillStyle = '#1a1408';
    c.beginPath(); c.ellipse(dx,-S*0.28,S*0.12,S*0.14,0,0,Math.PI*2); c.fill();
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(dx,-S*0.28,1,dx,-S*0.28,S*0.15);
    g.addColorStop(0,'#fff0b0'); g.addColorStop(0.5,'#bfe86a'); g.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(dx,-S*0.28,S*0.11,S*0.13,0,0,Math.PI*2); c.fill();
    c.restore();
    c.fillStyle = '#0a1206'; c.beginPath(); c.ellipse(dx,-S*0.28,S*0.03,S*0.11,0,0,Math.PI*2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(dx-S*0.04,-S*0.33,S*0.025,0,Math.PI*2); c.fill();
  }
  eye(-S*0.16); eye(S*0.16);
  // --- nariz + boca + bigodes ---
  c.fillStyle = '#c87a86';
  c.beginPath(); c.moveTo(-S*0.04,-S*0.16); c.lineTo(S*0.04,-S*0.16); c.lineTo(0,-S*0.11); c.closePath(); c.fill();
  c.strokeStyle = furDk; c.lineWidth = Math.max(1, S*0.02);
  c.beginPath(); c.moveTo(0,-S*0.11); c.lineTo(0,-S*0.06);
  c.moveTo(0,-S*0.06); c.quadraticCurveTo(-S*0.05,-S*0.03,-S*0.08,-S*0.06);
  c.moveTo(0,-S*0.06); c.quadraticCurveTo(S*0.05,-S*0.03,S*0.08,-S*0.06); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = Math.max(1, S*0.012);
  for(let i=0;i<3;i++){ const wy=-S*0.13+i*S*0.05;
    c.beginPath(); c.moveTo(-S*0.1,-S*0.1+i*S*0.03); c.lineTo(-S*0.42,wy); c.stroke();
    c.beginPath(); c.moveTo(S*0.1,-S*0.1+i*S*0.03);  c.lineTo(S*0.42,wy);  c.stroke(); }
  c.restore();
}
function drawWildForm(c, sx, sy, ts, p){
  const form = p.wild_form;
  const fake = { mtype: form, facing: p.facing, _moving: p._moving, walk: p.walk };
  if(form === 'mainecoon'){
    drawMaineCoon(c, sx, sy, ts, p);
  } else if(form === 'aguia'){
    drawCrow(c, sx, sy, ts, p.facing, p._moving, p.walk, p.look);
  } else if(form === 'lebre'){
    drawLebreForm(c, sx, sy, ts, p);
  } else if(form === 'coruja'){
    drawCorujaForm(c, sx, sy, ts, p);
  } else {
    drawBeast(c, sx, sy, ts, fake);                    // lobo, urso
  }
  if(p.name){                                          // etiqueta com o nome
    c.save(); c.font = '600 11px Inter, sans-serif'; c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(p.name, sx+ts/2+0.7, sy-2.3);
    c.fillStyle = (p.id===myId) ? '#c9a0ff' : '#e8e4f0'; c.fillText(p.name, sx+ts/2, sy-3);
    if(p.title){
      c.save(); c.font = '600 8.5px Inter';
      c.fillStyle = 'rgba(0,0,0,.65)'; c.fillText(p.title, sx+ts/2+0.6, sy-12.4);
      c.fillStyle = '#c9a860'; c.fillText(p.title, sx+ts/2, sy-13);
      c.restore();
    }
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
function isNightish(t){ if(typeof mapName !== 'undefined' && (mapName === 'umbraval' || mapName === 'vespera')) return true; return t < 0.24 || t > 0.72; }   // crepusculo/noite (Umbraval e Véspera: noite ETERNA)

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
  const ptype = MAP_PTYPE[mapName] || (night ? 'firefly' : 'dust');
  const glow = night || GLOW_MAPS.has(mapName);         // reinos/cemiterio/salao: brilho etereo
  const p = {
    x:wx, y:wy, ptype: ptype,
    vx:(Math.random()-0.5)*6,
    vy: night ? -(4+Math.random()*6) : (2+Math.random()*4),
    r: glow ? 1.1+Math.random()*1.3 : 0.7+Math.random()*0.9,
    life: 4200+Math.random()*4200, t0:now,
    glow: glow, hue: biomeHue || (night ? (Math.random()<0.5?'#f4e08a':'#a9f0c0') : '#d8d2c2'),
    ph: Math.random()*6.283, spin:(Math.random()-0.5)*3,
  };
  // comportamento POR BIOMA (rework visual)
  if(ptype==='leaf'){                                    // folha: cai devagar balançando
    p.vy = 7+Math.random()*8; p.vx = (Math.random()-0.5)*10; p.r = 2.2+Math.random()*1.8;
    p.life = 6000+Math.random()*5000; p.glow=false;
  } else if(ptype==='ember'){                            // brasa necrótica: sobe tremulando
    p.vy = -(9+Math.random()*12); p.vx = (Math.random()-0.5)*8; p.r = 1.0+Math.random()*1.2;
    p.life = 3200+Math.random()*2600; p.glow=true;
  } else if(ptype==='sand'){                             // areia: sopra na horizontal
    p.vx = 26+Math.random()*30; p.vy = (Math.random()-0.5)*4; p.r = 0.8+Math.random()*0.8;
    p.life = 2600+Math.random()*2200; p.glow=false;
  } else if(ptype==='mist'){                             // floco de bruma: enorme, quase parado
    p.vx = 3+Math.random()*4; p.vy = (Math.random()-0.5)*2; p.r = 7+Math.random()*9;
    p.life = 9000+Math.random()*7000; p.glow=false;
  } else if(ptype==='petal'){                            // palha dourada do trigo: cai dançando
    p.vy = 5+Math.random()*6; p.vx = (Math.random()-0.5)*14; p.r = 1.6+Math.random()*1.2;
    p.life = 6500+Math.random()*4500; p.glow=true;
  } else if(ptype==='firefly'){                          // vagalume: vaga devagar, pulsa
    p.vx = (Math.random()-0.5)*8; p.vy = (Math.random()-0.5)*8; p.r = 1.2+Math.random()*1.0;
    p.life = 5200+Math.random()*4200; p.glow=true;
  }
  particles.push(p);
}
function updateParticles(now, dt){
  const indoors = mapName && (mapName.indexOf('casa_')===0 || mapName.indexOf('loja_')===0);
  const pt = MAP_PTYPE[mapName];
  let want = indoors ? Math.floor(ATMO.particlesMax*0.4) : ATMO.particlesMax;
  if(pt==='sand') want = Math.floor(ATMO.particlesMax*1.7);        // vendaval de areia
  else if(pt==='leaf') want = Math.floor(ATMO.particlesMax*1.25);  // mata viva
  else if(pt==='ember') want = Math.floor(ATMO.particlesMax*1.3);  // cinzas por toda parte
  else if(pt==='mist') want = Math.floor(ATMO.particlesMax*0.75);  // brumas grandes, poucas
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
    if(sx<-24||sy<-24||sx>canvas.width+24||sy>canvas.height+24) continue;
    const k = (now - p.t0)/p.life;
    const fade = Math.sin(Math.min(Math.PI, Math.max(0,k)*Math.PI));
    const pulse = p.glow ? (0.55+0.45*Math.sin(now/500+p.ph)) : 0.5;
    c.save();
    if(p.ptype==='leaf'){
      // folha girando: elipse com veio central, balanço lateral no vento
      const wob = Math.sin(now/600+p.ph)*4;
      const rot = now/900*p.spin + p.ph;
      c.translate(sx+wob, sy); c.rotate(rot);
      c.globalAlpha = fade*0.55;
      c.fillStyle = p.hue;
      c.beginPath(); c.ellipse(0, 0, p.r*1.7, p.r*0.85, 0, 0, Math.PI*2); c.fill();
      c.globalAlpha = fade*0.35; c.strokeStyle = 'rgba(10,20,12,0.8)'; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(-p.r*1.5, 0); c.lineTo(p.r*1.5, 0); c.stroke();
    } else if(p.ptype==='ember'){
      // brasa: núcleo quente com rastro vertical de calor
      const flick = 0.6+0.4*Math.sin(now/120+p.ph*7);
      c.globalCompositeOperation='lighter'; c.globalAlpha = fade*flick*0.8;
      const g=c.createRadialGradient(sx,sy,0,sx,sy,p.r*4);
      g.addColorStop(0,'#fff'); g.addColorStop(0.35,p.hue); g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g; c.beginPath(); c.arc(sx,sy,p.r*4,0,Math.PI*2); c.fill();
      c.globalAlpha = fade*flick*0.35; c.strokeStyle=p.hue; c.lineWidth=1;
      c.beginPath(); c.moveTo(sx,sy); c.lineTo(sx+Math.sin(now/200+p.ph)*2, sy+p.r*6); c.stroke();
    } else if(p.ptype==='sand'){
      // grão de areia: risco horizontal veloz
      c.globalAlpha = fade*0.30; c.strokeStyle = p.hue; c.lineWidth = Math.max(0.8, p.r);
      c.beginPath(); c.moveTo(sx-6, sy); c.lineTo(sx+2, sy+0.6); c.stroke();
    } else if(p.ptype==='mist'){
      // floco de bruma: blob difuso enorme, quase invisível, dá VOLUME ao ar
      c.globalAlpha = fade*0.10;
      const g=c.createRadialGradient(sx,sy,0,sx,sy,p.r*3);
      g.addColorStop(0,p.hue); g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g; c.beginPath(); c.arc(sx,sy,p.r*3,0,Math.PI*2); c.fill();
    } else if(p.ptype==='petal'){
      // palha dourada do trigo: fiapinho girando, brilha ao sol
      const rot = now/700*p.spin + p.ph, wob = Math.sin(now/500+p.ph)*5;
      c.translate(sx+wob, sy); c.rotate(rot);
      c.globalCompositeOperation='lighter'; c.globalAlpha = fade*pulse*0.7;
      c.fillStyle=p.hue; c.fillRect(-p.r*2, -p.r*0.4, p.r*4, p.r*0.8);
    } else if(p.glow){
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
  const amb = MAP_AMBIENT[mapName];
  // vinheta COLORIDA: a borda escurece puxando pro clima do bioma (rework visual)
  const vr = amb ? Math.round(6+amb.r*0.10) : 6, vg = amb ? Math.round(5+amb.g*0.10) : 5, vb = amb ? Math.round(12+amb.b*0.14) : 12;
  const g=c.createRadialGradient(w/2,h*0.46,Math.min(w,h)*0.32, w/2,h*0.5,Math.max(w,h)*0.72);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(0.68,'rgba(0,0,0,0)');
  g.addColorStop(1,'rgba('+vr+','+vg+','+vb+','+ATMO.vignette+')');
  c.save(); c.fillStyle=g; c.fillRect(0,0,w,h); c.restore();
}

// ---- NÉVOA RASTEIRA (rework visual): lençóis de bruma que derivam devagar ----
// dá VOLUME e mistério aos mapas sombrios; desenhada POR CIMA das entidades.
const MAP_FOG = {
  valdarkram:       {hue:'166,186,200', a:0.070, n:5},   // bruma fria do cemitério
  bosque_atalech:   {hue:'150,190,200', a:0.080, n:5},   // floresta negra: neblina azulada
  planaltos_ermais: {hue:'210,225,240', a:0.055, n:4},   // neblina clara de altitude
  floresta_ermo:    {hue:'140,190,150', a:0.040, n:3},   // hálito verde da mata fechada
  camara_varth:     {hue:'150,90,200',  a:0.060, n:4},   // miasma necrótico do trono
  mina_avhur:       {hue:'190,160,90',  a:0.045, n:3},   // pó dourado suspenso da tumba
  brasal:           {hue:'70,50,45',    a:0.075, n:5},   // fumaça da Ferida do Mundo
  covil_krezath:    {hue:'255,120,50',  a:0.055, n:4},   // ondas de calor do covil
  umbraval:         {hue:'110,140,220', a:0.075, n:6},   // névoa fria da Noite Eterna
  vespera:          {hue:'170,60,80',   a:0.075, n:5},   // bruma de sangue de Véspera
};
function drawGroundFog(c, now){
  const f = MAP_FOG[mapName]; if(!f) return;
  const w=canvas.width, h=canvas.height;
  c.save(); 
  for(let i=0;i<f.n;i++){
    // cada lençol deriva num ritmo próprio, ancorado no MUNDO (parallax sutil com a câmera)
    const ph = i*2.4;
    const fx = ((Math.sin(now/17000+ph)*0.5+0.5)*(w+400) - 200) - (camX*0.15)%(w+400);
    const fy = h*(0.28+0.55*((Math.sin(now/23000+ph*1.7)*0.5+0.5))) - (camY*0.10)%(h*0.5);
    const R = Math.max(w,h)*(0.34+0.14*Math.sin(now/9000+ph));
    const g=c.createRadialGradient(fx,fy,R*0.15,fx,fy,R);
    g.addColorStop(0,'rgba('+f.hue+','+f.a+')');
    g.addColorStop(1,'rgba('+f.hue+',0)');
    c.fillStyle=g; c.beginPath(); c.arc(fx,fy,R,0,Math.PI*2); c.fill();
  }
  c.restore();
}

// ---- GOD RAYS (rework visual): feixes de sol vazando pela copa das matas, só DE DIA ----
const RAY_MAPS = new Set(['floresta_ermo','repouso_dama','bosque_atalech','fadrakor_selva']);
function drawGodRays(c, now){
  if(!RAY_MAPS.has(mapName) || isNightish(dayTime)) return;
  const w=canvas.width, h=canvas.height;
  c.save(); c.globalCompositeOperation='lighter';
  for(let i=0;i<4;i++){
    const ph=i*1.9;
    const sway = Math.sin(now/12000+ph)*w*0.06;
    const bx = w*(0.12+0.25*i) + sway - (camX*0.08)%(w*0.3);
    const wTop = w*0.030, wBot = w*0.085, lean = w*0.16;   // feixe inclinado (sol alto a nordeste)
    const a = 0.045 + 0.02*Math.sin(now/5000+ph);
    const g=c.createLinearGradient(bx,0,bx-lean,h);
    g.addColorStop(0,'rgba(255,240,190,'+a.toFixed(3)+')');
    g.addColorStop(1,'rgba(255,240,190,0)');
    c.fillStyle=g; c.beginPath();
    c.moveTo(bx-wTop,0); c.lineTo(bx+wTop,0);
    c.lineTo(bx-lean+wBot,h); c.lineTo(bx-lean-wBot,h); c.closePath(); c.fill();
  }
  c.restore();
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
  vfx.push({kind:'bolt', x0, y0, x1:b.x, y1:b.y, color, t0:t, life:360});
  vfx.push({kind:'impact', x1:b.x, y1:b.y, color, t0:t+300, life:420});
}
function spawnBlast(atId, radius, color, delay){   // EXPLOSÃO de área (magias de AoE)
  const e=players.get(atId); if(!e) return;
  vfx.push({kind:'blast', x1:e.x, y1:e.y, color:color||'#ff8a3a', radius:Math.max(1,radius||2),
            t0:performance.now()+(delay||0), life:760});
}
function spawnRay(fromId, toId, color){            // feixe contínuo (raio/luz)
  const a=players.get(fromId), b=players.get(toId); if(!b) return;
  const x0 = a ? a.x : b.x, y0 = a ? a.y : b.y;
  vfx.push({kind:'ray', x0, y0, x1:b.x, y1:b.y, color:color||'#cde6ff', t0:performance.now(), life:460});
}
function spawnDrain(fromId, toId, color){          // dreno de vida: feixe do alvo -> monstro
  const a=players.get(fromId), b=players.get(toId); if(!a||!b) return;
  vfx.push({kind:'drain', x0:a.x, y0:a.y, x1:b.x, y1:b.y, color:color||'#c84a7a', t0:performance.now(), life:540});
}
function spawnDarkBlast(atId, radius, color, delay){   // EXPLOSÃO sombria (magias da torre)
  const e=players.get(atId); if(!e) return;
  vfx.push({kind:'shadowblast', x1:e.x, y1:e.y, color:color||'#a050ff', radius:Math.max(1,radius||2),
            t0:performance.now()+(delay||0), life:840});
}
function spawnRing(atId, radius, color, delay){   // onda de choque (rework visual)
  const e=players.get(atId); if(!e) return;
  vfx.push({kind:'ring', x1:e.x, y1:e.y, color:color||'#ffd86b', radius:radius||1.6,
            t0:performance.now()+(delay||0), life:520});
}
function spawnSparks(atId, color, n){             // faíscas de impacto (rework visual)
  const e=players.get(atId); if(!e) return;
  vfx.push({kind:'sparks', x1:e.x, y1:e.y, color:color||'#ffd86b', n:n||8,
            ph:Math.random()*6.283, t0:performance.now(), life:560});
}
function spawnAtalechPlague(atId){   // PRAGA DE ATALECH: miasma roxo-esverdeado do bosque profano (camadas)
  const e=players.get(atId); if(!e) return;
  const now=performance.now();
  vfx.push({kind:'shadowblast', x1:e.x, y1:e.y, color:'#7a1fb0', radius:3, t0:now,     life:960});
  vfx.push({kind:'blast',       x1:e.x, y1:e.y, color:'#4ad06a', radius:3, t0:now+150,  life:880});
  vfx.push({kind:'shadowblast', x1:e.x, y1:e.y, color:'#c01890', radius:2, t0:now+320,  life:820});
  vfx.push({kind:'blast',       x1:e.x, y1:e.y, color:'#9be36a', radius:2, t0:now+460,  life:700});
}
function spawnSoulDrain(fromId, toId, color){      // dreno de ALMA: wisps do alvo -> monstro
  const a=players.get(fromId), b=players.get(toId); if(!a||!b) return;
  vfx.push({kind:'souldrain', x0:a.x, y0:a.y, x1:b.x, y1:b.y, color:color||'#b070ff', t0:performance.now(), life:640});
}
function spawnDarkBolt(fromId, toId, color){       // RAIO necrótico (monstro -> alvo) + estouro sombrio
  const a=players.get(fromId), b=players.get(toId); if(!b) return;
  const x0 = a ? a.x : b.x, y0 = a ? a.y : b.y; const t=performance.now();
  vfx.push({kind:'darkbolt', x0, y0, x1:b.x, y1:b.y, color:color||'#a050ff', t0:t, life:380});
  vfx.push({kind:'shadowblast', x1:b.x, y1:b.y, color:color||'#a050ff', radius:1, t0:t+330, life:520});
}
function spawnCataclysm(atId){                      // CATACLISMA DE VARGO: nova necrótica suprema 10x10 (o efeito mais elaborado do jogo)
  const e=players.get(atId); if(!e) return;
  const t=performance.now();
  screenShake(9, 1000);                             // o chao treme quando o vazio erupciona
  vfx.push({kind:'cataclysm', x1:e.x, y1:e.y, color:'#b060ff', t0:t, life:1700});
  for(let i=0;i<14;i++){                            // chuva de caveiras ao redor
    const ang=Math.random()*Math.PI*2, dist=Math.random()*4.6;
    vfx.push({kind:'skullfall', x1:e.x+Math.cos(ang)*dist, y1:e.y+Math.sin(ang)*dist,
              color:'#b060ff', t0:t+240+Math.random()*520, life:780});
  }
}
function spawnAt(atId, kind, color){
  const e=players.get(atId); if(!e) return;
  const LIFE={slash:300, heal:760, buff:640, mark:540, rage:740, venom:700, vanish:660, armed:700, surge:620, impact:420,
              slam:560, fear:780, gaze:660, summon:840, cursesigil:760};
  vfx.push({kind, x1:e.x, y1:e.y, color, t0:performance.now(), life:(LIFE[kind]||500)});
}
function updateVfx(now){ vfx = vfx.filter(v=> now < v.t0 + v.life); }
function drawVfx(c, now){
  for(const v of vfx){
    if(now < v.t0) continue;
    const k=(now - v.t0)/v.life; if(k>1) continue;
    const cx=v.x1*TS-camX+TS/2, cy=v.y1*TS-camY+TS/2;

    if(v.kind==='ring'){
      // ONDA DE CHOQUE (rework): anel que expande com espessura e alpha decaindo
      const ease = 1-Math.pow(1-k,3);
      const R = (v.radius||1.6)*TS*ease + TS*0.2;
      c.save(); c.globalCompositeOperation='lighter';
      c.globalAlpha = (1-k)*0.85; c.strokeStyle = v.color; c.lineWidth = Math.max(1.5, TS*0.14*(1-k));
      c.beginPath(); c.arc(cx,cy,R,0,Math.PI*2); c.stroke();
      c.globalAlpha = (1-k)*0.4; c.lineWidth = Math.max(1, TS*0.06*(1-k));
      c.beginPath(); c.arc(cx,cy,R*0.72,0,Math.PI*2); c.stroke();
      c.restore();

    } else if(v.kind==='sparks'){
      // FAÍSCAS de impacto (rework): estilhaços radiais com gravidade
      c.save(); c.globalCompositeOperation='lighter';
      const n = v.n||8;
      for(let i=0;i<n;i++){
        const a=(i/n)*Math.PI*2 + (v.ph||0), sp=TS*(0.9+((i*37)%10)/9);
        const gx=cx+Math.cos(a)*sp*k, gy=cy+Math.sin(a)*sp*k*0.7 + TS*1.3*k*k;   // arqueia e cai
        c.globalAlpha=(1-k)*0.9; c.strokeStyle=v.color; c.lineWidth=Math.max(1,TS*0.05*(1-k));
        c.beginPath(); c.moveTo(gx,gy);
        c.lineTo(gx-Math.cos(a)*4*(1-k), gy-Math.sin(a)*4*(1-k)*0.7 - 2*k); c.stroke();
      }
      c.restore();

    } else if(v.kind==='bolt'){
      // projétil mágico: cabeça luminosa + rastro afilado + faíscas
      const x0=v.x0*TS-camX+TS/2, y0=v.y0*TS-camY+TS/2;
      const kk=Math.min(1,k*1.12), hx=x0+(cx-x0)*kk, hy=y0+(cy-y0)*kk;
      const ang=Math.atan2(cy-y0,cx-x0), tl=TS*0.95;
      const tx=hx-Math.cos(ang)*tl, ty=hy-Math.sin(ang)*tl;
      c.save(); c.globalCompositeOperation='lighter';
      const tg=c.createLinearGradient(tx,ty,hx,hy);
      tg.addColorStop(0,'rgba(0,0,0,0)'); tg.addColorStop(1,v.color);
      c.strokeStyle=tg; c.globalAlpha=0.85*(1-k*0.3); c.lineWidth=Math.max(2,TS*0.16); c.lineCap='round';
      c.beginPath(); c.moveTo(tx,ty); c.lineTo(hx,hy); c.stroke();
      c.globalAlpha=0.95; const g=c.createRadialGradient(hx,hy,0,hx,hy,TS*0.42);
      g.addColorStop(0,'#ffffff'); g.addColorStop(0.4,v.color); g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g; c.beginPath(); c.arc(hx,hy,TS*0.42,0,Math.PI*2); c.fill();
      c.fillStyle=v.color; c.globalAlpha=0.7*(1-k);
      for(let i=0;i<4;i++){ const a2=ang+Math.PI+(((i*53)%10)/10-0.5)*1.4, d=TS*(0.2+((i*31)%10)/22);
        c.beginPath(); c.arc(hx+Math.cos(a2)*d, hy+Math.sin(a2)*d, 1.6, 0, Math.PI*2); c.fill(); }
      c.restore();

    } else if(v.kind==='ray'){
      // feixe: linha grossa pulsante caster -> alvo, com núcleo branco
      const x0=v.x0*TS-camX+TS/2, y0=v.y0*TS-camY+TS/2;
      const a=(k<0.18)?k/0.18:(1-k)/0.82;
      c.save(); c.globalCompositeOperation='lighter';
      c.globalAlpha=0.8*a; c.strokeStyle=v.color; c.lineWidth=Math.max(3,TS*0.22); c.lineCap='round';
      c.beginPath(); c.moveTo(x0,y0); c.lineTo(cx,cy); c.stroke();
      c.globalAlpha=a; c.strokeStyle='#ffffff'; c.lineWidth=Math.max(1.5,TS*0.08);
      c.beginPath(); c.moveTo(x0,y0); c.lineTo(cx,cy); c.stroke();
      c.restore();

    } else if(v.kind==='blast'){
      // EXPLOSÃO DE ÁREA: clarão + onda de choque + detritos radiantes + brasas
      const R=TS*(0.6+v.radius*0.95);
      const ease=1-Math.pow(1-k,2.2), rr=R*ease;
      const seed=v.x1*7+v.y1*13;
      c.save(); c.globalCompositeOperation='lighter';
      const core=R*0.5*(0.7+ease*0.6), cg=c.createRadialGradient(cx,cy,0,cx,cy,core);
      cg.addColorStop(0,'rgba(255,255,255,'+(0.95*(1-k))+')'); cg.addColorStop(0.4,v.color); cg.addColorStop(1,'rgba(0,0,0,0)');
      c.globalAlpha=1; c.fillStyle=cg; c.beginPath(); c.arc(cx,cy,core,0,Math.PI*2); c.fill();
      c.globalAlpha=(1-k)*0.9; c.strokeStyle=v.color; c.lineWidth=Math.max(3,TS*0.2*(1-k)+2);
      c.beginPath(); c.arc(cx,cy,rr,0,Math.PI*2); c.stroke();
      c.globalAlpha=(1-k)*0.7; c.strokeStyle='#fff7e0'; c.lineWidth=Math.max(1.5,TS*0.06);
      c.beginPath(); c.arc(cx,cy,rr*0.82,0,Math.PI*2); c.stroke();
      c.strokeStyle=v.color; c.globalAlpha=(1-k)*0.8; c.lineWidth=Math.max(2,TS*0.1); c.lineCap='round';
      for(let i=0;i<10;i++){ const a=i*Math.PI/5+seed, d0=rr*0.45, d1=rr*(0.8+((i*37)%10)/25);
        c.beginPath(); c.moveTo(cx+Math.cos(a)*d0,cy+Math.sin(a)*d0); c.lineTo(cx+Math.cos(a)*d1,cy+Math.sin(a)*d1); c.stroke(); }
      if(k>0.3){ c.fillStyle=v.color; c.globalAlpha=(1-k)*0.5;
        for(let i=0;i<8;i++){ const a=seed+i*0.9, d=rr*(0.3+((i*53)%10)/20);
          c.beginPath(); c.arc(cx+Math.cos(a)*d, cy+Math.sin(a)*d - (k-0.3)*TS*1.2, 2.2, 0, Math.PI*2); c.fill(); } }
      c.restore();

    } else if(v.kind==='impact'){
      // impacto nítido: clarão + estilhaços curtos
      const r=TS*(0.25+k*0.6);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=(1-k)*0.9;
      const g=c.createRadialGradient(cx,cy,0,cx,cy,r);
      g.addColorStop(0,'#ffffff'); g.addColorStop(0.35,v.color); g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g; c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2); c.fill();
      c.strokeStyle=v.color; c.lineWidth=2.2; c.globalAlpha=(1-k)*0.8; c.lineCap='round';
      for(let i=0;i<7;i++){ const a=i*Math.PI/3.5+k*1.5;
        c.beginPath(); c.moveTo(cx+Math.cos(a)*r*0.5,cy+Math.sin(a)*r*0.5); c.lineTo(cx+Math.cos(a)*r*1.15,cy+Math.sin(a)*r*1.15); c.stroke(); }
      c.restore();

    } else if(v.kind==='slash'){
      // golpe: arco varrendo com rastro branco + cor
      c.save(); c.globalCompositeOperation='lighter'; c.lineCap='round';
      const a0=-0.9+k*1.6;
      c.globalAlpha=(1-k)*0.95; c.strokeStyle='#ffffff'; c.lineWidth=Math.max(2,TS*0.1);
      c.beginPath(); c.arc(cx,cy,TS*0.52,a0,a0+1.9); c.stroke();
      c.globalAlpha=(1-k)*0.7; c.strokeStyle=v.color; c.lineWidth=Math.max(3,TS*0.18);
      c.beginPath(); c.arc(cx,cy,TS*0.52,a0-0.1,a0+1.7); c.stroke();
      c.restore();

    } else if(v.kind==='heal'){
      // cura: brilho suave + cruz + faíscas subindo
      c.save(); c.globalCompositeOperation='lighter';
      const gr=c.createRadialGradient(cx,cy,0,cx,cy,TS*0.7);
      gr.addColorStop(0,v.color); gr.addColorStop(1,'rgba(0,0,0,0)');
      c.globalAlpha=(1-k)*0.45; c.fillStyle=gr; c.beginPath(); c.arc(cx,cy,TS*0.7,0,Math.PI*2); c.fill();
      c.globalAlpha=(1-k)*0.9; c.fillStyle=v.color;
      for(let i=0;i<6;i++){ const px=cx+Math.sin(i*1.7+now/300)*TS*0.34, py=cy+TS*0.4 - k*TS*1.7 - i*5;
        c.beginPath(); c.arc(px,py,2.3,0,Math.PI*2); c.fill(); }
      const ty=cy - k*TS*0.8; c.strokeStyle='#eafff0'; c.lineWidth=2.4; c.globalAlpha=(1-k)*0.85;
      c.beginPath(); c.moveTo(cx,ty-5); c.lineTo(cx,ty+5); c.moveTo(cx-5,ty); c.lineTo(cx+5,ty); c.stroke();
      c.restore();

    } else if(v.kind==='buff'){
      // benção/postura: anel no chão + colunas de luz + partículas subindo
      c.save(); c.globalCompositeOperation='lighter';
      const rr=TS*(0.5+k*0.35); c.globalAlpha=(1-k)*0.8; c.strokeStyle=v.color; c.lineWidth=2.6;
      c.beginPath(); c.ellipse(cx,cy+TS*0.42,rr,rr*0.4,0,0,Math.PI*2); c.stroke();
      c.globalAlpha=(1-k)*0.6; c.lineWidth=Math.max(2,TS*0.08); c.lineCap='round';
      for(let i=0;i<5;i++){ const a=i*Math.PI*2/5+now/600, px=cx+Math.cos(a)*rr*0.7;
        const y1=cy+TS*0.42, y2=y1 - (0.4+k*0.8)*TS*1.2;
        c.beginPath(); c.moveTo(px,y1); c.lineTo(px+Math.cos(a)*4,y2); c.stroke(); }
      c.fillStyle=v.color; c.globalAlpha=(1-k)*0.85;
      for(let i=0;i<6;i++){ const a=i*1.4+now/280, d=rr*(0.3+(i%3)*0.25);
        c.beginPath(); c.arc(cx+Math.cos(a)*d, cy+TS*0.3 - k*TS*1.4 - i*3, 1.9, 0, Math.PI*2); c.fill(); }
      c.restore();

    } else if(v.kind==='rage'){
      // FÚRIA: aura ardente + línguas de fogo subindo + brasas
      c.save(); c.globalCompositeOperation='lighter';
      const gr=c.createRadialGradient(cx,cy,0,cx,cy,TS*0.85);
      gr.addColorStop(0,'rgba(255,180,80,'+((1-k)*0.5)+')'); gr.addColorStop(0.6,v.color); gr.addColorStop(1,'rgba(0,0,0,0)');
      c.globalAlpha=1; c.fillStyle=gr; c.beginPath(); c.arc(cx,cy,TS*0.85,0,Math.PI*2); c.fill();
      c.fillStyle=v.color; c.globalAlpha=(1-k)*0.9;
      for(let i=0;i<7;i++){ const a=-Math.PI/2+(i-3)*0.35, d=TS*(0.5+k*0.5);
        const fx=cx+Math.cos(a)*TS*0.3, fy=cy+Math.sin(a)*d - k*TS*0.6;
        c.beginPath(); c.ellipse(fx,fy,3.5*(1-k*0.5),7*(1-k*0.4),a,0,Math.PI*2); c.fill(); }
      c.fillStyle='#ffd070'; c.globalAlpha=(1-k)*0.8;
      for(let i=0;i<6;i++){ const a=i*1.1+now/200;
        c.beginPath(); c.arc(cx+Math.cos(a)*TS*0.45, cy - k*TS*1.3 + Math.sin(a)*6, 1.8, 0, Math.PI*2); c.fill(); }
      c.restore();

    } else if(v.kind==='venom'){
      // VENENO: brilho na lâmina + gotas verdes escorrendo
      c.save(); c.globalCompositeOperation='lighter';
      c.globalAlpha=(1-k)*0.6; const gr=c.createRadialGradient(cx,cy-TS*0.1,0,cx,cy-TS*0.1,TS*0.42);
      gr.addColorStop(0,'#dfffa0'); gr.addColorStop(0.5,v.color); gr.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=gr; c.beginPath(); c.arc(cx,cy-TS*0.1,TS*0.42,0,Math.PI*2); c.fill();
      c.globalAlpha=(1-k)*0.85; c.fillStyle=v.color;
      for(let i=0;i<7;i++){ const px=cx+Math.sin(i*2.1)*TS*0.3, py=cy - TS*0.1 + k*TS*1.0 + i*4;
        c.beginPath(); c.ellipse(px,py,2.4,3.6,0,0,Math.PI*2); c.fill(); }
      c.restore();

    } else if(v.kind==='vanish'){
      // SOME NAS SOMBRAS: volutas de fumaça subindo + brilho roxo
      c.save();
      c.globalAlpha=(1-k)*0.55; c.fillStyle=v.color;
      for(let i=0;i<8;i++){ const a=i*0.8+now/300, d=TS*(0.2+k*0.45);
        const px=cx+Math.cos(a)*d, py=cy+TS*0.2 - k*TS*1.1 + Math.sin(a)*4;
        c.beginPath(); c.ellipse(px,py,5*(1-k*0.4),7*(1-k*0.3),a,0,Math.PI*2); c.fill(); }
      c.globalCompositeOperation='lighter'; c.globalAlpha=(1-k)*0.5;
      const gr=c.createRadialGradient(cx,cy,0,cx,cy,TS*0.55);
      gr.addColorStop(0,'#caa6ff'); gr.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=gr; c.beginPath(); c.arc(cx,cy,TS*0.55,0,Math.PI*2); c.fill();
      c.restore();

    } else if(v.kind==='armed'){
      // CASTIGO ARMADO: brilho dourado + runas orbitando
      c.save(); c.globalCompositeOperation='lighter';
      const rr=TS*(0.4+k*0.3); c.globalAlpha=(1-k)*0.85; c.strokeStyle=v.color; c.lineWidth=2.4;
      for(let i=0;i<6;i++){ const a=i*Math.PI/3+now/500, px=cx+Math.cos(a)*rr, py=cy+Math.sin(a)*rr;
        c.beginPath(); c.arc(px,py,2.5,0,Math.PI*2); c.stroke(); }
      c.globalAlpha=(1-k)*0.7; const gr=c.createRadialGradient(cx,cy,0,cx,cy,TS*0.5);
      gr.addColorStop(0,'#fff4c0'); gr.addColorStop(0.5,v.color); gr.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=gr; c.beginPath(); c.arc(cx,cy,TS*0.5,0,Math.PI*2); c.fill();
      c.restore();

    } else if(v.kind==='surge'){
      // SURTO DE AÇÃO: linhas de velocidade em rajada
      c.save(); c.globalCompositeOperation='lighter'; c.strokeStyle=v.color; c.lineCap='round';
      c.globalAlpha=(1-k)*0.85; c.lineWidth=Math.max(2,TS*0.1);
      for(let i=0;i<8;i++){ const a=i*Math.PI/4, d0=TS*0.2+k*TS*0.3, d1=d0+TS*0.5;
        c.beginPath(); c.moveTo(cx+Math.cos(a)*d0,cy+Math.sin(a)*d0); c.lineTo(cx+Math.cos(a)*d1,cy+Math.sin(a)*d1); c.stroke(); }
      c.restore();

    } else if(v.kind==='mark'){
      // alvo marcado: retícula girando dupla
      const r=TS*0.5;
      c.save(); c.strokeStyle=v.color; c.globalAlpha=(1-k)*0.9; c.lineWidth=2;
      c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2); c.stroke();
      c.beginPath(); c.arc(cx,cy,r*0.6,0,Math.PI*2); c.stroke();
      for(let i=0;i<4;i++){ const a=i*Math.PI/2+now/700;
        c.beginPath(); c.moveTo(cx+Math.cos(a)*r*0.5,cy+Math.sin(a)*r*0.5); c.lineTo(cx+Math.cos(a)*r*1.35,cy+Math.sin(a)*r*1.35); c.stroke(); }
      c.restore();

    } else if(v.kind==='slam'){
      // GOLPE PESADO: clarão de impacto + anel de choque no chão + rachaduras
      const r=TS*(0.3+k*0.7);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=(1-k)*0.9;
      const g=c.createRadialGradient(cx,cy,0,cx,cy,r);
      g.addColorStop(0,'#ffffff'); g.addColorStop(0.3,v.color); g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g; c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2); c.fill();
      c.globalAlpha=(1-k)*0.8; c.strokeStyle=v.color; c.lineWidth=Math.max(2,TS*0.12);
      c.beginPath(); c.ellipse(cx,cy+TS*0.3,r*1.1,r*0.45,0,0,Math.PI*2); c.stroke();
      c.lineWidth=2.4; c.lineCap='round'; c.globalAlpha=(1-k)*0.7;
      for(let i=0;i<6;i++){ const a=i*Math.PI/3+0.3, d=r*1.2;
        c.beginPath(); c.moveTo(cx,cy+TS*0.3); c.lineTo(cx+Math.cos(a)*d,cy+TS*0.3+Math.sin(a)*d*0.45); c.stroke(); }
      c.restore();

    } else if(v.kind==='fear'){
      // MEDO: brilho sombrio + tentáculos subindo + caveira flutuante
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=(1-k)*0.5;
      const gr=c.createRadialGradient(cx,cy,0,cx,cy,TS*0.7);
      gr.addColorStop(0,v.color); gr.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=gr; c.beginPath(); c.arc(cx,cy,TS*0.7,0,Math.PI*2); c.fill();
      c.globalCompositeOperation='source-over'; c.globalAlpha=(1-k)*0.6; c.fillStyle=v.color;
      for(let i=0;i<7;i++){ const a=-Math.PI/2+(i-3)*0.4, d=TS*(0.3+k*0.5);
        const px=cx+Math.cos(a)*TS*0.3, py=cy+Math.sin(a)*d - k*TS*0.5;
        c.beginPath(); c.ellipse(px,py,3*(1-k*0.4),9*(1-k*0.3),a,0,Math.PI*2); c.fill(); }
      c.globalAlpha=(1-k)*0.85; c.fillStyle='#e8def5'; const sy=cy - k*TS*0.7, sr=TS*0.16;
      c.beginPath(); c.arc(cx,sy,sr,0,Math.PI*2); c.fill();
      c.fillStyle='#3a2a4a'; c.beginPath(); c.arc(cx-sr*0.4,sy-sr*0.1,sr*0.28,0,Math.PI*2);
      c.arc(cx+sr*0.4,sy-sr*0.1,sr*0.28,0,Math.PI*2); c.fill();
      c.restore();

    } else if(v.kind==='gaze'){
      // OLHAR: anéis hipnóticos concêntricos + clarão central
      c.save(); c.globalCompositeOperation='lighter'; c.strokeStyle=v.color; c.lineCap='round';
      for(let i=0;i<3;i++){ const rr=TS*0.25*(i+1)*(0.7+k*0.6); c.globalAlpha=(1-k)*0.8/(i*0.4+1); c.lineWidth=2.4;
        c.beginPath(); c.arc(cx,cy,rr,0,Math.PI*2); c.stroke(); }
      c.globalAlpha=(1-k)*0.7; const g=c.createRadialGradient(cx,cy,0,cx,cy,TS*0.35);
      g.addColorStop(0,'#ffffff'); g.addColorStop(0.5,v.color); g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g; c.beginPath(); c.arc(cx,cy,TS*0.35,0,Math.PI*2); c.fill();
      c.restore();

    } else if(v.kind==='summon'){
      // INVOCAÇÃO: portal sombrio girando + sombras subindo
      const rr=TS*(0.4+k*0.4);
      c.save();
      c.globalAlpha=(1-k)*0.6; c.fillStyle='#1a0f24';
      c.beginPath(); c.ellipse(cx,cy+TS*0.3,rr,rr*0.4,0,0,Math.PI*2); c.fill();
      c.globalCompositeOperation='lighter'; c.globalAlpha=(1-k)*0.8; c.strokeStyle=v.color; c.lineWidth=2.6;
      for(let i=0;i<2;i++){ c.beginPath(); c.ellipse(cx,cy+TS*0.3,rr*(1-i*0.3),rr*0.4*(1-i*0.3),now/500+i,0,Math.PI*2); c.stroke(); }
      c.globalAlpha=(1-k)*0.7; c.fillStyle=v.color;
      for(let i=0;i<5;i++){ const a=-Math.PI/2+(i-2)*0.5, px=cx+Math.cos(a)*rr*0.6;
        c.beginPath(); c.ellipse(px,cy+TS*0.3 - k*TS*0.9,3,8*(1-k*0.3),0,0,Math.PI*2); c.fill(); }
      c.restore();

    } else if(v.kind==='drain'){
      // DRENO: feixe do alvo -> monstro + partículas fluindo
      const x0=v.x0*TS-camX+TS/2, y0=v.y0*TS-camY+TS/2;
      c.save(); c.globalCompositeOperation='lighter';
      const a=(k<0.2)?k/0.2:(1-k)/0.8;
      c.globalAlpha=0.7*a; c.strokeStyle=v.color; c.lineWidth=Math.max(2,TS*0.12); c.lineCap='round';
      c.beginPath(); c.moveTo(x0,y0); c.lineTo(cx,cy); c.stroke();
      c.fillStyle=v.color; c.globalAlpha=a;
      for(let i=0;i<5;i++){ const t=(k*1.6+i*0.2)%1, px=x0+(cx-x0)*t, py=y0+(cy-y0)*t;
        c.beginPath(); c.arc(px,py,2.4,0,Math.PI*2); c.fill(); }
      c.restore();

    } else if(v.kind==='shadowblast'){
      // EXPLOSÃO SOMBRIA: vácuo negro + ondas roxas/verdes + almas subindo
      const R=TS*(0.6+v.radius*0.95);
      const ease=1-Math.pow(1-k,2.2), rr=R*ease, seed=v.x1*7+v.y1*13;
      c.save();
      c.globalAlpha=(1-k)*0.85; const vg=c.createRadialGradient(cx,cy,0,cx,cy,Math.max(1,rr*0.6));
      vg.addColorStop(0,'#0a0410'); vg.addColorStop(0.6,'rgba(30,10,45,0.6)'); vg.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=vg; c.beginPath(); c.arc(cx,cy,Math.max(1,rr*0.6),0,Math.PI*2); c.fill();
      c.globalCompositeOperation='lighter';
      const core=R*0.4*(0.7+ease*0.6), cg=c.createRadialGradient(cx,cy,0,cx,cy,Math.max(1,core));
      cg.addColorStop(0,'rgba(190,255,180,'+(0.8*(1-k))+')'); cg.addColorStop(0.4,v.color); cg.addColorStop(1,'rgba(0,0,0,0)');
      c.globalAlpha=1; c.fillStyle=cg; c.beginPath(); c.arc(cx,cy,Math.max(1,core),0,Math.PI*2); c.fill();
      c.globalAlpha=(1-k)*0.9; c.strokeStyle=v.color; c.lineWidth=Math.max(3,TS*0.18*(1-k)+2);
      c.beginPath(); c.arc(cx,cy,rr,0,Math.PI*2); c.stroke();
      c.globalAlpha=(1-k)*0.55; c.strokeStyle='#8aff9a'; c.lineWidth=Math.max(1.5,TS*0.05);
      c.beginPath(); c.arc(cx,cy,rr*0.78,0,Math.PI*2); c.stroke();
      c.fillStyle='#cfe8ff'; c.globalAlpha=(1-k)*0.7;
      for(let i=0;i<7;i++){ const a=seed+i*0.9, d=rr*(0.3+((i*53)%10)/18);
        c.beginPath(); c.arc(cx+Math.cos(a)*d, cy+Math.sin(a)*d - k*TS*1.4, 2.2*(1-k*0.4), 0, Math.PI*2); c.fill(); }
      c.restore();

    } else if(v.kind==='souldrain'){
      // DRENO DE ALMA: wisps fantasmas fluindo do alvo -> monstro
      const x0=v.x0*TS-camX+TS/2, y0=v.y0*TS-camY+TS/2;
      c.save(); c.globalCompositeOperation='lighter';
      const a=(k<0.2)?k/0.2:(1-k)/0.8;
      c.globalAlpha=0.5*a; c.strokeStyle=v.color; c.lineWidth=Math.max(2,TS*0.1); c.lineCap='round';
      c.beginPath(); c.moveTo(x0,y0); c.lineTo(cx,cy); c.stroke();
      c.fillStyle='#cfe8ff'; c.globalAlpha=a*0.9;
      for(let i=0;i<6;i++){ const tt=(k*1.4+i*0.18)%1, bx=x0+(cx-x0)*tt, by=y0+(cy-y0)*tt;
        const off=Math.sin(tt*Math.PI*3+i)*TS*0.12;
        c.beginPath(); c.arc(bx+off, by-off*0.5, 2.6*(1-tt*0.4), 0, Math.PI*2); c.fill(); }
      c.restore();

    } else if(v.kind==='cursesigil'){
      // SIGILO AMALDIÇOADO: círculo + pentagrama girando + chamas roxas
      c.save(); c.globalCompositeOperation='lighter'; c.strokeStyle=v.color; c.lineCap='round';
      const rr=TS*0.42, rot=now/700, by=cy+TS*0.2;
      c.globalAlpha=(1-k)*0.85; c.lineWidth=2.2;
      c.beginPath(); c.arc(cx,by,rr,0,Math.PI*2); c.stroke();
      c.beginPath();
      for(let i=0;i<=5;i++){ const a=rot+i*Math.PI*4/5, px=cx+Math.cos(a)*rr, py=by+Math.sin(a)*rr;
        if(i===0) c.moveTo(px,py); else c.lineTo(px,py); }
      c.stroke();
      c.globalAlpha=(1-k)*0.7; c.fillStyle=v.color;
      for(let i=0;i<5;i++){ const a=rot+i*1.25, px=cx+Math.cos(a)*rr*0.7;
        c.beginPath(); c.ellipse(px, by - k*TS*0.6, 2.5, 6*(1-k*0.3), 0, 0, Math.PI*2); c.fill(); }
      c.restore();

    } else if(v.kind==='darkbolt'){
      // RAIO NECRÓTICO: orbe negro com rastro roxo + halo
      const x0=v.x0*TS-camX+TS/2, y0=v.y0*TS-camY+TS/2;
      const kk=Math.min(1,k*1.12), hx=x0+(cx-x0)*kk, hy=y0+(cy-y0)*kk;
      const ang=Math.atan2(cy-y0,cx-x0), tl=TS*0.95, tx=hx-Math.cos(ang)*tl, ty=hy-Math.sin(ang)*tl;
      c.save();
      c.globalCompositeOperation='lighter';
      const tg=c.createLinearGradient(tx,ty,hx,hy);
      tg.addColorStop(0,'rgba(0,0,0,0)'); tg.addColorStop(1,v.color);
      c.strokeStyle=tg; c.globalAlpha=0.8*(1-k*0.3); c.lineWidth=Math.max(2,TS*0.16); c.lineCap='round';
      c.beginPath(); c.moveTo(tx,ty); c.lineTo(hx,hy); c.stroke();
      c.globalCompositeOperation='source-over'; c.globalAlpha=0.92; c.fillStyle='#0a0410';
      c.beginPath(); c.arc(hx,hy,TS*0.2,0,Math.PI*2); c.fill();
      c.globalCompositeOperation='lighter'; c.globalAlpha=0.9;
      const g=c.createRadialGradient(hx,hy,TS*0.1,hx,hy,TS*0.4);
      g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(0.5,v.color); g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g; c.beginPath(); c.arc(hx,hy,TS*0.4,0,Math.PI*2); c.fill();
      c.restore();

    } else if(v.kind==='cataclysm'){
      // ☠ CATACLISMA DE VARGO: nova necrótica suprema (10x10) — o efeito mais elaborado do jogo
      const R=TS*5;                                  // raio ~5 tiles (cobre 10x10)
      const P=v.color||'#b060ff', P2='#7a30c0', G='#7affb0';
      c.save();
      // (1) CAMPO DE ESCURIDÃO: o vazio engole a área inteira
      const dark=Math.min(1, k<0.7 ? (k/0.16) : (1-k)/0.3);
      c.globalAlpha=0.6*dark;
      const vg=c.createRadialGradient(cx,cy,0,cx,cy,R);
      vg.addColorStop(0,'rgba(8,3,16,0.97)'); vg.addColorStop(0.55,'rgba(20,8,36,0.78)');
      vg.addColorStop(0.85,'rgba(42,16,76,0.32)'); vg.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=vg; c.beginPath(); c.arc(cx,cy,R,0,Math.PI*2); c.fill();
      c.globalCompositeOperation='lighter';
      // (2) GATILHO: energia convergindo pra dentro (k<0.18)
      if(k<0.18){ const g=k/0.18; c.globalAlpha=0.7*(1-g); c.strokeStyle=P; c.lineWidth=3;
        for(let i=0;i<4;i++){ const rr=R*(1-g)*(0.4+i*0.2); c.beginPath(); c.arc(cx,cy,rr,0,Math.PI*2); c.stroke(); } }
      // (3) CLARÃO de erupção (0.12<k<0.42)
      if(k>0.12 && k<0.42){ const g=(k-0.12)/0.3, fa=Math.sin(g*Math.PI);
        c.globalAlpha=0.92*fa; const fg=c.createRadialGradient(cx,cy,0,cx,cy,R*0.72*g);
        fg.addColorStop(0,'#ffffff'); fg.addColorStop(0.3,P); fg.addColorStop(0.7,P2); fg.addColorStop(1,'rgba(0,0,0,0)');
        c.fillStyle=fg; c.beginPath(); c.arc(cx,cy,R*0.72*g,0,Math.PI*2); c.fill(); }
      // (4) ANÉIS DE CHOQUE expandindo (3, escalonados; o do meio em verde-alma)
      for(let i=0;i<3;i++){ const stt=0.16+i*0.16, g=(k-stt)/0.5;
        if(g>0 && g<1){ c.globalAlpha=(1-g)*0.85; c.strokeStyle=i===1?G:P;
          c.lineWidth=Math.max(2,TS*0.22*(1-g)); c.beginPath(); c.arc(cx,cy,R*g,0,Math.PI*2); c.stroke(); } }
      // (5) RELÂMPAGOS necróticos irradiando (0.2<k<0.78)
      if(k>0.2 && k<0.78){ const fa=Math.sin(((k-0.2)/0.58)*Math.PI), seed=Math.floor(now/90);
        c.globalAlpha=0.85*fa; c.strokeStyle=P; c.lineWidth=2.2; c.lineCap='round';
        for(let i=0;i<10;i++){ const a=i*Math.PI/5+seed*0.3; c.beginPath(); c.moveTo(cx,cy);
          for(let s=1;s<=4;s++){ const rr=R*0.92*s/4, jit=Math.sin(seed+i*3+s)*0.4;
            c.lineTo(cx+Math.cos(a+jit)*rr, cy+Math.sin(a+jit)*rr); } c.stroke(); } }
      // (6) COLUNA central de energia subindo (0.18<k<0.7)
      if(k>0.18 && k<0.7){ const fa=Math.sin(((k-0.18)/0.52)*Math.PI), cw=TS*0.7*fa;
        c.globalAlpha=0.68*fa; const cg=c.createLinearGradient(cx,cy+TS*0.5,cx,cy-R*1.1);
        cg.addColorStop(0,P); cg.addColorStop(0.5,P2); cg.addColorStop(1,'rgba(0,0,0,0)');
        c.fillStyle=cg; c.beginPath(); c.moveTo(cx-cw,cy+TS*0.3); c.lineTo(cx+cw,cy+TS*0.3);
        c.lineTo(cx+cw*0.3,cy-R*1.05); c.lineTo(cx-cw*0.3,cy-R*1.05); c.closePath(); c.fill(); }
      // (7) ALMAS/wisps subindo
      c.globalAlpha=0.8*Math.min(1,(1-k)*1.6);
      for(let i=0;i<16;i++){ const a=i*0.4+now/600, rr=R*((i%5)+1)/6*(0.5+0.5*Math.sin(now/400+i));
        const px=cx+Math.cos(a)*rr, py=cy+Math.sin(a)*rr-((now/8+i*60)%R);
        c.fillStyle=i%3===0?G:P; c.beginPath(); c.arc(px,py,2.4,0,Math.PI*2); c.fill(); }
      c.restore();

    } else if(v.kind==='skullfall'){
      // caveira despencando do céu + impacto (acompanha o cataclisma)
      const fall=Math.min(1,k*1.4), sr=TS*0.22, dy=-(1-fall)*TS*2.2;
      c.save(); c.globalAlpha=(1-k)*0.95;
      c.fillStyle='#e8def5'; c.beginPath(); c.arc(cx,cy+dy,sr,0,Math.PI*2); c.fill();
      c.beginPath(); c.ellipse(cx,cy+dy+sr*0.7,sr*0.6,sr*0.5,0,0,Math.PI*2); c.fill();
      c.fillStyle='#2a1840'; c.beginPath(); c.arc(cx-sr*0.4,cy+dy-sr*0.05,sr*0.26,0,Math.PI*2);
      c.arc(cx+sr*0.4,cy+dy-sr*0.05,sr*0.26,0,Math.PI*2); c.fill();
      c.globalCompositeOperation='lighter'; c.globalAlpha=(1-k)*0.8; c.fillStyle=v.color||'#b060ff';
      c.beginPath(); c.arc(cx-sr*0.4,cy+dy-sr*0.05,sr*0.12,0,Math.PI*2);
      c.arc(cx+sr*0.4,cy+dy-sr*0.05,sr*0.12,0,Math.PI*2); c.fill();
      if(fall>=1){ c.globalAlpha=(1-k)*0.6; c.strokeStyle=v.color||'#b060ff'; c.lineWidth=2;
        c.beginPath(); c.ellipse(cx,cy+sr*0.8,sr*1.6*k,sr*0.6*k,0,0,Math.PI*2); c.stroke(); }
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
    if(p.wild_form === 'lebre' && p.id !== myId) return;   // lebre de Nharé: invisível pros outros
    const tx = p.x*TS, ty = p.y*TS;
    const moving = Math.abs(tx-p.rx) > 0.5 || Math.abs(ty-p.ry) > 0.5;
    p.rx += (tx - p.rx)*t; p.ry += (ty - p.ry)*t;
    if(Math.abs(tx-p.rx)<0.4) p.rx = tx;
    if(Math.abs(ty-p.ry)<0.4) p.ry = ty;
    if(moving && (!p.kind || p.kind === 'person') && (!p._lastPuff || now - p._lastPuff > 190)){
      p._lastPuff = now;
      stepDust.push({x: p.rx + TS/2 + (Math.random()-0.5)*4, y: p.ry + TS*0.92, born: now});
      if(stepDust.length > 80) stepDust.shift();
    }
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
  if(now < shakeUntil){                              // tremor: decai ao longo da duracao
    const s = shakeMag * ((shakeUntil - now) / shakeDur);
    camX += (Math.random() - 0.5) * s * 2;
    camY += (Math.random() - 0.5) * s * 2;
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

  try{
    if(mapName === 'ermo') drawErmoDecor(ctx, now);
  else if(mapName && (mapName.indexOf('oficina_') === 0 || mapName === 'templo_doze' || mapName === 'fenda' || mapName === 'arena' || mapName === 'ossuario')) drawInteriorDecor(ctx, now);
    drawFaunaAndPet(ctx, now);
    // pontos de coleta das profissões (veios, árvores nobres, ervas)
    for(const nd of worldNodes){
      const nsx = nd.x*TS - camX, nsy = nd.y*TS - camY;
      if(nsx < -TS*2 || nsy < -TS*2 || nsx > canvas.width+TS*2 || nsy > canvas.height+TS*2) continue;
      drawNode(ctx, nsx, nsy, TS, nd, now);
    }
  }catch(err){ /* decoração nunca derruba o mundo */ }

  const ordered = [...players.values()].sort((a,b)=> (a.ry - b.ry));
  for(const p of ordered){
    const sx = p.rx - camX, sy = p.ry - camY;
    const cull = (p.size ? p.size*TS : TS);
    if(sx < -cull || sy < -cull || sx > canvas.width+cull || sy > canvas.height+cull) continue;
    if(p.kind === 'monster' && p._dead) continue;   // monstro derrotado some
    entityShadow(ctx, sx, sy, TS, p);               // sombra suave no chao (profundidade)
    // AURA DE PRESENÇA dos chefes (rework): brasa pulsante no chão sob TODO boss
    if(p.kind === 'monster' && p.boss && !p._dead){
      const BOSS_AURA = { urso_rei:'244,200,74', farao_avhur:'255,217,138', maurao:'255,138,90',
                          velho_bob:'192,176,144', colosso_avasham:'255,154,80', lorde_varth:'176,112,255',
                          krezath:'255,90,30', vulkar:'255,150,60', maraja:'255,240,200' };
      const col = BOSS_AURA[p.mtype] || '232,184,96';
      const span = Math.max(1, p.size||1) * TS;
      const bx = sx + span/2, by = sy + span*0.82;
      const pulse = 0.5 + 0.5*Math.sin(now/460 + (p.x||0));
      ctx.save(); ctx.globalCompositeOperation='lighter';
      const ag = ctx.createRadialGradient(bx, by, 0, bx, by, span*0.72);
      ag.addColorStop(0, 'rgba('+col+','+(0.16+0.10*pulse).toFixed(3)+')');
      ag.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ag; ctx.beginPath();
      ctx.ellipse(bx, by, span*0.72, span*0.30, 0, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
    // realce de alvos: mirando magia/habilidade (à distância = todos, corpo a corpo = adjacentes)
    // ou, no modo normal, inimigos ao lado que dá pra atacar.
    if(combat && combat.yourTurn && combat.snapshot && p.kind === 'monster' && !p._dead){
      const me = players.get(myId);
      const pend = combat.pending;
      const dist = me ? Math.max(Math.abs(me.x - p.x), Math.abs(me.y - p.y)) : 99;
      const adj = dist <= 1;
      const reach = (combat.snapshot.your && combat.snapshot.your.reach) || 1;
      let show = false, col = '#ff6a6a';
      if(pend){ col = '#9b6dff'; show = (pend.range === 'ranged') ? true : adj; }
      else { show = combat.snapshot.your_action && (dist <= reach); }
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
    else if(p.kind === 'mesa') drawMesaParty(ctx, sx, sy, TS, p);
    else if(p.kind === 'monster' && (p.size||0) >= 4 && !BEAST[p.mtype]){
      if(p.mtype === 'colosso_avasham') drawColosso(ctx, sx, sy, TS, p);
      else if(p.mtype === 'lorde_varth') drawLordeVarthBoss(ctx, sx, sy, TS, p);
      else if(p.mtype === 'krezath') drawKrezath(ctx, sx, sy, TS, p);
      else if(p.mtype === 'vulkar' || p.mtype === 'golem_obsidiana') drawMagmaConstruct(ctx, sx, sy, TS, p);
      else if(p.mtype === 'maraja') drawLeao(ctx, sx, sy, TS, p);
      else drawVarth(ctx, sx, sy, TS, p);
    }
    else if(p.kind === 'monster') drawMonster(ctx, sx, sy, TS, p);
    else if(p._status && p._status.facalan) drawFacalanPanther(ctx, sx, sy, TS, p);
    else if(p.wild_form) drawWildForm(ctx, sx, sy, TS, p);
    else {
      if(p._status && (p._status.aurora || p._status.aurora_fraca)) drawAuroraGlow(ctx, sx, sy, TS);
      if(p._status && p._status.cancao) drawCancaoGlow(ctx, sx, sy, TS);
      if(p.smoke) _smokeAura(ctx, sx, sy, TS);                 // Botas de Vargo: fumaça preta
      drawCharacter(ctx, sx, sy, TS, p.look, p.facing, p.name, p.id===myId, p._moving, p.walk);
    }
    // HIT FLASH global (rework): clarão rápido na entidade atingida, qualquer tipo/tamanho
    if(p._hitFlash && now < p._hitFlash){
      const fk = (p._hitFlash - now) / 150;                    // 1 -> 0
      const span = Math.max(1, p.size||1) * TS;
      const fx2 = sx + span/2, fy2 = sy + span/2, R = span*0.72;
      ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha = 0.55*fk;
      const fg = ctx.createRadialGradient(fx2,fy2,0,fx2,fy2,R);
      fg.addColorStop(0, p._hitFlashCol||'#ffffff'); fg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fx2,fy2,R,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    // GLOW DE EQUIPAR (rework): brilho pulsante da raridade envolvendo o personagem
    if(p._equipGlow && now < p._equipGlow){
      const gk = (p._equipGlow - now) / 900;
      const pulse = 0.6 + 0.4*Math.sin(now/90);
      const gx2 = sx + TS/2, gy2 = sy + TS/2, GR = TS*0.95;
      ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha = 0.45*gk*pulse;
      const gg = ctx.createRadialGradient(gx2,gy2,0,gx2,gy2,GR);
      gg.addColorStop(0, p._equipGlowCol||'#f4b860'); gg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx2,gy2,GR,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  // numeros de dano flutuantes (rework: POP de escala + subida com easing + espalhamento)
  if(dmgPops.length){
    const now = performance.now();
    dmgPops = dmgPops.filter(d=> now - d.t0 < 1000);
    ctx.save(); ctx.textAlign = 'center';
    for(const d of dmgPops){
      const k = (now - d.t0) / 1000;
      const rise = 1 - Math.pow(1-k, 2.4);                      // sobe rápido e desacelera
      const px = d.x*TS + TS/2 - camX + (d.ox||0)*rise;
      const py = d.y*TS - camY - rise*34 + 6;
      const popS = k < 0.16 ? (0.6 + 2.9*k) : (k < 0.3 ? (1.064 - 0.457*(k-0.16)) : 1.0);   // estica e assenta
      const base = d.big ? 21 : 16;
      ctx.font = '800 ' + Math.round(base*popS) + 'px Inter, sans-serif';
      ctx.globalAlpha = k < 0.75 ? 1 : (1-k)/0.25;
      ctx.lineWidth = d.big ? 4 : 3; ctx.strokeStyle = 'rgba(8,7,15,0.9)'; ctx.strokeText(d.text, px, py);
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
  drawGroundFog(ctx, now);                          // névoa rasteira dos mapas sombrios (rework)
  drawGodRays(ctx, now);                            // feixes de sol nas matas, de dia (rework)
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
  drawWorldOverlays(ctx, now);                  // ERMO 2.0: vinheta, bússola, poeira, minimapa
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
function tryInteract(){ if(socket) socket.emit('interact'); }  // o SERVIDOR decide o que há por perto (alçapão, bigorna, altar, portal, mastro, NPC, node...)

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
  if(isGM && gmTeleport && !combat){            // GM em modo teleporte: clica no mapa e vai
    gmSend('tp', { x: tx, y: ty });
    return;
  }
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
//  GM (Mestre) — painel de administração, só aparece pra conta GM (Portuz)
// ===========================================================================
let isGM = false, gmMonsters = [], gmTeleport = false, gmGod = false, gmFly = false;
let gmBtnEl = null, gmPanelEl = null;

function gmSend(action, params){ if(socket) socket.emit('gm_command', { action, params: params || {} }); }

function setupGM(){
  if(gmBtnEl) { gmBtnEl.style.display = 'block'; return; }
  const st = document.createElement('style');
  st.textContent = `
  #gm-btn{position:fixed;right:12px;bottom:140px;z-index:60;width:46px;height:46px;border-radius:50%;
    border:2px solid #e7b23c;background:#1a1320;color:#e7b23c;font-size:22px;cursor:pointer;box-shadow:0 2px 10px #000a}
  #gm-panel{position:fixed;right:10px;bottom:196px;z-index:61;width:300px;max-height:74vh;overflow-y:auto;
    display:none;background:#140f1b;border:2px solid #e7b23c;border-radius:12px;padding:10px;
    color:#eee;font-size:13px;box-shadow:0 6px 24px #000c}
  #gm-panel h3{margin:0 0 8px;font-size:14px;color:#e7b23c;display:flex;justify-content:space-between;align-items:center}
  #gm-panel h3 .x{cursor:pointer;color:#c66;font-size:16px;padding:0 4px}
  .gm-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
  .gm-row button,.gm-sec button{flex:1;min-width:84px;padding:7px 6px;border-radius:8px;border:1px solid #3a2f44;
    background:#221a2c;color:#eee;cursor:pointer;font-size:12px}
  .gm-row button.on{background:#2c5a2c;border-color:#5fbf5f;color:#dfffdf}
  .gm-row button#gm-tp-btn.on{background:#3a3a6a;border-color:#8a8aff;color:#dfdfff}
  .gm-sec{border-top:1px solid #2a2233;padding-top:8px;margin-bottom:8px}
  .gm-sec-title{font-size:12px;color:#e7b23c;margin-bottom:6px;display:flex;justify-content:space-between}
  .gm-sec input{width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #3a2f44;
    background:#0e0a14;color:#eee;margin-bottom:6px;font-size:12px}
  .gm-list{max-height:130px;overflow-y:auto;border:1px solid #2a2233;border-radius:6px}
  .gm-it{display:flex;align-items:center;gap:7px;padding:5px 7px;cursor:pointer;border-bottom:1px solid #1c1626}
  .gm-it:hover{background:#231b30}
  .gm-it .dot{width:12px;height:12px;border-radius:3px;flex:none}
  .gm-it .nm{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gm-it .boss{color:#ff6;font-size:10px}
  .gm-pl{display:flex;align-items:center;gap:5px;padding:5px 7px;border-bottom:1px solid #1c1626}
  .gm-pl .nm{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gm-pl button{padding:3px 7px;font-size:11px;border-radius:6px;border:1px solid #3a2f44;background:#221a2c;color:#eee;cursor:pointer}
  .gm-lvl-wrap{display:flex;gap:6px;align-items:center}
  .gm-lvl-wrap input{width:64px}`;
  document.head.appendChild(st);

  gmBtnEl = document.createElement('button');
  gmBtnEl.id = 'gm-btn'; gmBtnEl.textContent = '🛠️'; gmBtnEl.title = 'Painel de GM';
  gmBtnEl.addEventListener('click', ()=>{
    gmPanelEl.style.display = (gmPanelEl.style.display === 'block') ? 'none' : 'block';
  });
  document.body.appendChild(gmBtnEl);

  gmPanelEl = document.createElement('div');
  gmPanelEl.id = 'gm-panel';
  gmPanelEl.innerHTML = `
    <h3>🛠️ GM <span class="x">✕</span></h3>
    <div class="gm-row">
      <button data-act="god">🛡️ God: OFF</button>
      <button data-act="fly">✈️ Voar: OFF</button>
      <button id="gm-tp-btn">📍 Teleporte: OFF</button>
    </div>
    <div class="gm-row">
      <button data-act="money">💰 Grana ∞</button>
      <button data-act="heal">💚 Curar</button>
      <button data-act="killall">🧹 Limpar bichos</button>
    </div>
    <div class="gm-row gm-lvl-wrap">
      <span>Nível:</span><input id="gm-lvl" type="number" min="1" max="20" value="20">
      <button id="gm-lvl-btn" style="flex:none">⚡ Setar</button>
    </div>
    <div class="gm-sec">
      <div class="gm-sec-title"><span>🎁 Dar item</span><span>qtd:<input id="gm-qty" type="number" min="1" max="99" value="1" style="width:46px;display:inline-block;margin:0 0 0 4px"></span></div>
      <input id="gm-item-search" placeholder="buscar item...">
      <div id="gm-item-list" class="gm-list"></div>
    </div>
    <div class="gm-sec">
      <div class="gm-sec-title">👹 Invocar monstro</div>
      <input id="gm-mob-search" placeholder="buscar monstro...">
      <div id="gm-mob-list" class="gm-list"></div>
    </div>
    <div class="gm-sec">
      <div class="gm-sec-title"><span>👁️ Jogadores</span><button id="gm-pl-refresh" style="flex:none;padding:2px 8px">🔄</button></div>
      <div id="gm-players-list" class="gm-list"></div>
    </div>`;
  document.body.appendChild(gmPanelEl);

  gmPanelEl.querySelector('.x').addEventListener('click', ()=> gmPanelEl.style.display='none');
  gmPanelEl.querySelectorAll('.gm-row button[data-act]').forEach(b=>{
    b.addEventListener('click', ()=> gmSend(b.getAttribute('data-act')));
  });
  document.getElementById('gm-tp-btn').addEventListener('click', ()=>{
    gmTeleport = !gmTeleport; updateGmToggles();
    toastMsg(gmTeleport ? '📍 Modo teleporte: clique no mapa.' : 'Teleporte desligado.');
  });
  document.getElementById('gm-lvl-btn').addEventListener('click', ()=>{
    const v = parseInt(document.getElementById('gm-lvl').value, 10);
    if(v >= 1 && v <= 20) gmSend('setlevel', { level: v });
  });
  document.getElementById('gm-item-search').addEventListener('input', e=> renderGmItems(e.target.value));
  document.getElementById('gm-mob-search').addEventListener('input', e=> renderGmMobs(e.target.value));
  document.getElementById('gm-pl-refresh').addEventListener('click', ()=> gmSend('players'));
  renderGmItems(''); renderGmMobs(''); gmSend('players');
}

function updateGmToggles(){
  if(!gmPanelEl) return;
  const g = gmPanelEl.querySelector('[data-act="god"]'); if(g){ g.classList.toggle('on', gmGod); g.textContent = '🛡️ God: ' + (gmGod?'ON':'OFF'); }
  const f = gmPanelEl.querySelector('[data-act="fly"]'); if(f){ f.classList.toggle('on', gmFly); f.textContent = '✈️ Voar: ' + (gmFly?'ON':'OFF'); }
  const t = document.getElementById('gm-tp-btn'); if(t){ t.classList.toggle('on', gmTeleport); t.textContent = '📍 Teleporte: ' + (gmTeleport?'ON':'OFF'); }
}

function renderGmItems(filter){
  const box = document.getElementById('gm-item-list'); if(!box) return;
  const q = (filter||'').toLowerCase().trim();
  const ids = Object.keys(catalog).filter(id=>{
    const d = catalog[id]; if(!d) return false;
    return !q || (d.name||id).toLowerCase().includes(q) || id.includes(q);
  }).slice(0, 60);
  box.innerHTML = '';
  ids.forEach(id=>{
    const d = catalog[id];
    const row = document.createElement('div'); row.className = 'gm-it';
    row.innerHTML = `<span class="dot" style="background:${d.color||'#888'}"></span><span class="nm">${d.name||id}</span>`;
    row.addEventListener('click', ()=>{
      const qty = Math.max(1, Math.min(99, parseInt(document.getElementById('gm-qty').value,10)||1));
      gmSend('give', { item: id, qty });
    });
    box.appendChild(row);
  });
  if(!ids.length) box.innerHTML = '<div class="gm-it" style="opacity:.6">nada encontrado</div>';
}

function renderGmMobs(filter){
  const box = document.getElementById('gm-mob-list'); if(!box) return;
  const q = (filter||'').toLowerCase().trim();
  const list = gmMonsters.filter(m=> !q || m.name.toLowerCase().includes(q) || m.id.includes(q)).slice(0, 60);
  box.innerHTML = '';
  list.forEach(m=>{
    const row = document.createElement('div'); row.className = 'gm-it';
    row.innerHTML = `<span class="nm">${m.name}</span>${m.boss?'<span class="boss">CHEFE</span>':''}`;
    row.addEventListener('click', ()=> gmSend('spawn', { monster: m.id }));
    box.appendChild(row);
  });
  if(!list.length) box.innerHTML = '<div class="gm-it" style="opacity:.6">nada encontrado</div>';
}

function renderGmPlayers(list){
  const box = document.getElementById('gm-players-list'); if(!box) return;
  box.innerHTML = '';
  (list||[]).forEach(pl=>{
    const row = document.createElement('div'); row.className = 'gm-pl';
    const mine = (pl.id === myId);
    row.innerHTML = `<span class="nm">${pl.name}${mine?' (você)':''}</span><span style="opacity:.6;font-size:10px">${pl.map}</span>`;
    if(!mine){
      const go = document.createElement('button'); go.textContent = 'ir'; go.title='teleportar até';
      go.addEventListener('click', ()=> gmSend('goto', { id: pl.id }));
      const br = document.createElement('button'); br.textContent = 'trazer';
      br.addEventListener('click', ()=> gmSend('bring', { id: pl.id }));
      const kk = document.createElement('button'); kk.textContent = 'kick'; kk.style.color='#f88';
      kk.addEventListener('click', ()=>{ if(confirm('Expulsar '+pl.name+'?')) gmSend('kick', { id: pl.id }); });
      row.appendChild(go); row.appendChild(br); row.appendChild(kk);
    }
    box.appendChild(row);
  });
  if(!(list||[]).length) box.innerHTML = '<div class="gm-pl" style="opacity:.6">ninguém online</div>';
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
    posturesData = data.postures || {};
    featsCatalog = data.feats || [];
    ground.clear();
    for(const it of (data.ground||[])) ground.set(it.x+','+it.y, it.item);
    refreshInventory();
    myFicha = data.ficha || {};
    renderFicha();
    isGM = !!data.is_gm; gmMonsters = data.gm_monsters || [];
    if(isGM) setupGM();
    else if(gmBtnEl){ gmBtnEl.style.display='none'; if(gmPanelEl) gmPanelEl.style.display='none'; }
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
  socket.on('map_change', d=>{
    worldNodes = d.nodes || [];
    mapEdges = d.edges || {};
    _minimapCache = null;                        // reconstrói o minimapa do mapa novo
    const nm = (d.map && d.map.map) || 'ermo';
    fadeTransition();
    showMapBanner(nm);
  });
  socket.on('node_update', d=>{
    const nd = worldNodes.find(n=>n.id === d.id);
    if(nd){ nd.depleted = true; setTimeout(()=>{ nd.depleted = false; }, (d.cd||90)*1000); }
  });
  socket.on('craft_open', openCraft);
  socket.on('map_change', data=>{
    if(_partyEl) closePartyTable(true);   // saiu da taverna: fecha o lobby (servidor já te tirou)
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
  socket.on('party_open', d=> openPartyTable(d));
  socket.on('party_update', d=>{ _partyData = d; if(_partyEl) renderPartyTableBody(_partyBodyEl, d); });
  socket.on('party_formed', d=> onPartyFormed(d));

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
  socket.on('gm_state', s=>{
    if('god' in s) gmGod = s.god;
    if('fly' in s) gmFly = s.fly;
    updateGmToggles();
  });
  socket.on('gm_players', d=> renderGmPlayers(d.players || []));
  socket.on('gm_tp', d=>{                       // GM se teleportou: cola a própria posição e recentraliza
    const me = players.get(myId); if(!me) return;
    me.x = d.x; me.y = d.y; me.rx = d.x*TS; me.ry = d.y*TS;
  });
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
    form: p.form, wild_form: p.wild_form || null, size: p.size, accent: p.accent, eyes: p.eyes,
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

// Resumo das passivas que FUNCIONAM de verdade no combate (espelha game/races.py).
function racePassivesText(r){
  const tl = (r.traits||'').toLowerCase(), sp = (r.speed||''), out = [];
  let m = tl.match(/\+(\d+)\s*pv por n[íi]vel/); if(m) out.push('+'+m[1]+' PV/nível');
  const res=[];
  if(tl.indexOf('dano de veneno')>=0 || tl.indexOf('resili')>=0 || tl.indexOf('resistência robusta')>=0) res.push('veneno');
  if(tl.indexOf('dano de fogo')>=0 || tl.indexOf('infernal')>=0) res.push('fogo');
  if(res.length) out.push('resistência a '+res.join(', '));
  const imu=[];
  if(tl.indexOf('imune a veneno')>=0 || tl.indexOf('imunidade a veneno')>=0) imu.push('veneno');
  if(tl.indexOf('feérica')>=0 || tl.indexOf('feerica')>=0) imu.push('sono');
  if(imu.length) out.push('imune a '+imu.join(', '));
  const wd=[];
  if(tl.indexOf('bravura')>=0) wd.push('medo');
  if(tl.indexOf('feérica')>=0 || tl.indexOf('feerica')>=0) wd.push('encanto');
  if(tl.indexOf('resili')>=0 || tl.indexOf('resistência robusta')>=0) wd.push('veneno');
  if(wd.length) out.push('defesa contra '+wd.join(', '));
  if(tl.indexOf('sortudo')>=0) out.push('Sortudo (rerrola o 1)');
  if(tl.indexOf('implac')>=0) out.push('Implacável (cai em 1 PV)');
  if(tl.indexOf('armadura natural')>=0) out.push('armadura natural +3');
  if(tl.indexOf('mordida')>=0 || tl.indexOf('garra')>=0 || tl.indexOf('talão')>=0 || tl.indexOf('talões')>=0 || tl.indexOf('talao')>=0 || tl.indexOf('chifre')>=0 || tl.indexOf('presas')>=0) out.push('ataque natural (+2 dano)');
  if(tl.indexOf('sopro')>=0) out.push('Sopro Dracônico (área, 1x/combate)');
  if(sp.indexOf('10,5')===0 || sp.indexOf('12')===0) out.push('mais veloz');
  else if(sp.indexOf('7,5')===0) out.push('mais lento');
  return out.join(' · ');
}

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
    (racePassivesText(r) ? '<div class="fsec">⚙️ Passivas ativas no combate</div><div class="ftext" style="color:#9fd6a8">' + esc(racePassivesText(r)) + '</div>' : '') +
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
const RARITY_COL = { comum:'#7c8290', incomum:'#5ec27a', raro:'#5a9bf4', epico:'#b06bff', lendario:'#f4b860', divino:'#f7d6ff', maldito:'#b81d1d' };
const DIVINO_GRAD = 'linear-gradient(90deg,#ff6e6e,#f6c453,#5ec27a,#5a9bf4,#b06bff,#ff6e6e)';
// borda multicolorida do tier DIVINO (anéis de cor via box-shadow, respeitam o canto arredondado)
function applyRarityBorder(el, rarity){
  const rc = RARITY_COL[rarity || 'comum'] || RARITY_COL.comum;
  if(rarity === 'divino'){
    el.style.borderColor = 'transparent';
    el.style.boxShadow = '0 0 0 1px #ff6e6e, 0 0 0 2px #f6c453, 0 0 0 3px #5ec27a, 0 0 0 4px #5a9bf4, 0 0 9px 1px #b06bff';
  } else if(rarity === 'maldito'){
    el.style.borderColor = '#b81d1d';
    el.style.boxShadow = '0 0 8px 1px #7a1414, inset 0 0 6px #5a0d0d';   // brilho rubro amaldiçoado
  } else {
    el.style.borderColor = rc;
  }
  return rc;
}
// cor do nome conforme a raridade (divino = nome arco-íris)
function applyRarityName(el, rarity, rc){
  if(rarity === 'divino'){
    el.style.background = DIVINO_GRAD;
    el.style.webkitBackgroundClip = 'text'; el.style.backgroundClip = 'text';
    el.style.color = 'transparent';
  } else {
    el.style.color = rc;
  }
}

function equipItem(itemId){
  if(socket) socket.emit('equip', { item: itemId });
  // EFEITO DE EQUIPAR (rework): o personagem brilha na cor da raridade
  const def = catalog[itemId]; if(!def) return;
  const rar = def.rarity || 'comum';
  const col = RARITY_COL[rar] || RARITY_COL.comum;
  const e = players.get(myId);
  const now = performance.now();
  if(rar === 'divino'){                                  // DIVINO: anéis arco-íris em cascata
    const cores = ['#ff6e6e','#f6c453','#5ec27a','#5a9bf4','#b06bff'];
    cores.forEach((cc,i)=> spawnRing(myId, 1.0+i*0.35, cc, i*90));
    spawnSparks(myId, '#ffffff', 12);
    if(e){ e._equipGlow = now + 1000; e._equipGlowCol = '#f7d6ff'; }
  } else if(rar === 'maldito'){                          // MALDITO: pulso rubro e o chão treme
    spawnRing(myId, 1.6, '#b81d1d'); spawnRing(myId, 1.0, '#7a1414', 120);
    spawnSparks(myId, '#ff5a4a', 10);
    screenShake(2, 220);
    if(e){ e._equipGlow = now + 900; e._equipGlowCol = '#b81d1d'; }
  } else if(rar === 'lendario' || rar === 'epico'){
    spawnRing(myId, 1.5, col); spawnSparks(myId, col, 10);
    if(e){ e._equipGlow = now + 750; e._equipGlowCol = col; }
  } else {
    spawnRing(myId, 1.1, col); spawnSparks(myId, col, 6);
    if(e){ e._equipGlow = now + 550; e._equipGlowCol = col; }
  }
}
function unequipSlot(slot){
  if(socket) socket.emit('unequip', { slot });
  spawnRing(myId, 0.9, '#7c8290');                       // tirar peça: anel cinza discreto
}

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
    case 'divine_orb': {                          // Bola de Lã do Pofnir: esfera multicolorida
      const t = performance.now();
      c.strokeStyle = shade(col, 0.1); c.lineWidth = 1.6;                        // correntinha
      c.beginPath(); c.arc(cx, cy-s*0.14, s*0.24, Math.PI*0.2, Math.PI*0.8); c.stroke();
      const oy = cy + s*0.12, orad = s*0.2, hue = (t/20) % 360;
      const g = c.createRadialGradient(cx-orad*0.3, oy-orad*0.3, 1, cx, oy, orad);
      g.addColorStop(0, 'hsl('+hue+',90%,80%)');
      g.addColorStop(0.5, 'hsl('+((hue+120)%360)+',85%,62%)');
      g.addColorStop(1, 'hsl('+((hue+240)%360)+',80%,48%)');
      c.fillStyle = g; c.beginPath(); c.arc(cx, oy, orad, 0, 7); c.fill();        // esfera
      c.globalAlpha = 0.5; c.fillStyle = 'hsl('+((hue+60)%360)+',95%,85%)';       // brilho
      c.beginPath(); c.arc(cx-orad*0.3, oy-orad*0.3, orad*0.3, 0, 7); c.fill(); c.globalAlpha = 1;
      c.strokeStyle = 'hsl('+((hue+200)%360)+',70%,78%)'; c.lineWidth = 1;        // fiapos de la
      for(let i=0;i<3;i++){ const a=t/600+i*2.1; c.beginPath(); c.moveTo(cx+Math.cos(a)*orad, oy+Math.sin(a)*orad); c.lineTo(cx+Math.cos(a)*orad*1.5, oy+Math.sin(a)*orad*1.5); c.stroke(); }
      return true; }
    case 'divine_boot': {                         // Botas de Vargo: bota amaldiçoada vermelho-sangue + fumaça preta + brasas
      const t = performance.now();
      // fumaça preta subindo
      c.save(); c.globalAlpha = 0.36; c.fillStyle = '#0a0a12';
      for(let i=0;i<3;i++){ const ph=((t/14+i*40)%50)/50, px=cx+Math.sin(t/500+i*2.1)*s*0.14, py=cy-s*0.08-ph*s*0.4;
        c.beginPath(); c.arc(px, py, s*0.09*(1-ph), 0, 7); c.fill(); }
      c.restore();
      // raios necróticos rubros
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=0.5;
      for(let i=0;i<8;i++){ const a=i*Math.PI/4+t/900; c.strokeStyle = i%2? '#b81d1d':'#7a1414'; c.lineWidth=1.4;
        c.beginPath(); c.moveTo(cx+Math.cos(a)*s*0.18, cy+s*0.06+Math.sin(a)*s*0.1); c.lineTo(cx+Math.cos(a)*s*0.34, cy+s*0.06+Math.sin(a)*s*0.18); c.stroke(); }
      c.restore();
      // silhueta da bota com gradiente vermelho-escuro
      const bg = c.createLinearGradient(cx-s*0.25, cy-s*0.22, cx+s*0.25, cy+s*0.2);
      bg.addColorStop(0,'#d23030'); bg.addColorStop(0.5,'#7a1414'); bg.addColorStop(1,'#3a0808');
      c.fillStyle=bg; c.beginPath();
      c.moveTo(cx-s*0.12, cy-s*0.22); c.lineTo(cx+s*0.06, cy-s*0.22);
      c.lineTo(cx+s*0.08, cy+s*0.06); c.lineTo(cx+s*0.26, cy+s*0.08);
      c.lineTo(cx+s*0.26, cy+s*0.2); c.lineTo(cx-s*0.14, cy+s*0.2);
      c.closePath(); c.fill();
      c.strokeStyle='#e85a5a'; c.lineWidth=1.4; c.stroke();
      // brilho pulsante de brasa
      c.save(); c.globalAlpha=0.55+0.25*Math.sin(t/300); c.fillStyle='#ff5a4a';
      c.beginPath(); c.ellipse(cx-s*0.02, cy-s*0.08, s*0.05, s*0.1, 0, 0, 7); c.fill(); c.restore();
      // faíscas rubras flutuando
      c.save(); c.globalCompositeOperation='lighter';
      for(let i=0;i<4;i++){ const a=t/400+i*1.6; c.fillStyle = i%2? '#ff6a4a':'#c01818';
        c.beginPath(); c.arc(cx+Math.cos(a)*s*0.28, cy+s*0.02+Math.sin(a)*s*0.2, 1.6, 0, 7); c.fill(); }
      c.restore();
      return true; }
  }
  return false;
}

function refreshInventory(){
  refreshEquip();
  if(!invGrid) return;
  invGrid.style.display = 'block';        // vira lista (sobrescreve o grid)
  invGrid.innerHTML = '';
  if(!inventory.length){
    const e = document.createElement('div');
    e.className = 'inv-empty';
    e.textContent = 'Mochila vazia. Ache itens espalhados pelo mundo.';
    invGrid.appendChild(e);
    return;
  }
  inventory.forEach(stack=>{
    const def = catalog[stack.item] || {};
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:9px;background:#1b1828;margin-bottom:6px;';
    const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40;
    const rc = RARITY_COL[def.rarity || 'comum'] || RARITY_COL.comum;
    cv.style.cssText = 'flex:0 0 auto;border:1px solid ' + rc + ';border-radius:7px;background:#0f0e17;';
    applyRarityBorder(cv, def.rarity);
    drawItemIcon(cv.getContext('2d'), 20, 20, 40, stack.item, false);
    row.appendChild(cv);
    const mid = document.createElement('div'); mid.style.cssText = 'flex:1 1 auto;min-width:0;';
    const nm = document.createElement('div');
    nm.textContent = (def.name || stack.item) + (stack.qty > 1 ? ('  ×' + stack.qty) : '');
    nm.style.cssText = 'font:600 13px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    applyRarityName(nm, def.rarity, rc);
    mid.appendChild(nm);
    const stt = _shopStat(def);
    if(stt){ const st = document.createElement('div'); st.textContent = stt; st.style.cssText = 'font-size:11px;color:#9b95b5;'; mid.appendChild(st); }
    if(def.desc){ const ds = document.createElement('div'); ds.textContent = def.desc; ds.style.cssText = 'font-size:10px;color:#716c88;margin-top:1px;line-height:1.25;'; mid.appendChild(ds); }
    row.appendChild(mid);
    if(def.equippable){
      const right = document.createElement('div'); right.style.cssText = 'flex:0 0 auto;';
      const b = _btn('Equipar', true); b.style.cssText += ';padding:5px 11px;font-size:12px;white-space:nowrap;';
      b.onclick = ()=> equipItem(stack.item);
      right.appendChild(b);
      row.appendChild(right);
    }
    invGrid.appendChild(row);
  });
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
  const b = [];
  if(def.dmg) b.push('Dano ' + def.dmg.n + 'd' + def.dmg.d + (def.dmg.flat ? '+' + def.dmg.flat : ''));
  if(def.rng) b.push(def.rng >= 50 ? 'à distância' : ('alcance ' + def.rng));
  if(def.atk) b.push('+' + def.atk + ' atq');
  if(def.spell_pow) b.push('+' + def.spell_pow + ' poder mág.');
  if(def.spell_hit) b.push('+' + def.spell_hit + ' acerto mág.');
  if(def.ac) b.push('+' + def.ac + ' CA');
  if(def.armor) b.push('mitiga ' + def.armor);
  if(def.dodge) b.push(Math.round(def.dodge*100) + '% esquiva');
  if(def.ward) b.push('barreira ' + def.ward);
  if(def.mres) b.push(Math.round(def.mres*100) + '% res. mág.');
  if(def.block) b.push('bloqueia ' + def.block);
  return b.join(' · ');
}
function _shopRow(it, mode){
  const def = Object.assign({}, catalog[it.item] || {}, it);
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:9px;background:#1b1828;margin-bottom:6px;';
  const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40;
  const rc = RARITY_COL[def.rarity || 'comum'] || RARITY_COL.comum;
  cv.style.cssText = 'flex:0 0 auto;border:1px solid ' + rc + ';border-radius:7px;background:#0f0e17;';
  applyRarityBorder(cv, def.rarity);
  drawItemIcon(cv.getContext('2d'), 20, 20, 40, it.item, false);
  row.appendChild(cv);
  const mid = document.createElement('div'); mid.style.cssText = 'flex:1 1 auto;min-width:0;';
  const nm = document.createElement('div'); nm.textContent = def.name || it.item;
  nm.style.cssText = 'font:600 13px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  applyRarityName(nm, def.rarity, rc);
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
    const _sd = catalog[it.item] || {};
    const sell = (_sd.sell_value != null) ? _sd.sell_value : Math.max(1, Math.floor((_sd.value || 1) * (shopData.sell_rate || 0.4)));
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
    if(shopData.extra && shopData.extra.item){
      const ex = shopData.extra;
      const have = (inventory||[]).reduce((n,s)=> n + (s.item===ex.item ? (s.qty||0) : 0), 0);
      const enough = have >= (ex.qty||0);
      const b = document.createElement('div');
      b.style.cssText = 'background:#241a33;border:1px solid #5a3a8a;border-radius:9px;padding:9px 11px;margin:4px 2px 11px;font-size:12.5px;line-height:1.45;color:#d8c8f0;';
      b.innerHTML = 'Cada peça também custa <b style="color:#c79bff">'+(ex.qty||0)+' '+esc(ex.name||'símbolos')+'</b> \ud83d\udfe3 — você tem <b style="color:'+(enough?'#9be3a0':'#e89090')+'">'+have+'</b>.';
      _shopBodyEl.appendChild(b);
    }
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
    const sellable = (inventory || []).filter(s=> catalog[s.item] && !catalog[s.item].couraria_only);
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
  const accent = d.accent || '#d8a86a';
  if(typeof d.wallet === 'number') updateWallet(d.wallet);
  if(_courariaEl){ renderCourariaBody(_courariaBodyEl, d); return; }
  const ov = _overlay(); const box = _box(440);
  box.style.cssText += ';padding:0;display:flex;flex-direction:column;max-height:86vh;';
  const hd = document.createElement('div');
  hd.style.cssText = 'display:flex;align-items:center;gap:10px;padding:16px 18px 10px;border-bottom:1px solid #2a2540;';
  const ti = document.createElement('div'); ti.textContent = d.title || 'Couraria do Valdir';
  ti.style.cssText = 'font:700 19px Cinzel,serif;color:'+accent+';flex:1 1 auto;';
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
  const accent = d.accent || '#d8a86a';
  const sellEvent = d.sellEvent || 'couraria_sell';
  const header = d.header || 'Couro de bicho · paga 5x';
  const empty = d.empty || 'Você não tem couro de bicho na mochila. O Valdir compra pele e presa de <b style="color:#d8a86a">lobo, javali, hiena, abutre</b> e afins por 5x o preço normal.';
  const wl = document.getElementById('_courwallet'); if(wl && typeof d.wallet === 'number') wl.textContent = d.wallet.toLocaleString('pt-BR') + ' \ud83d\udfe4';
  let h = '';
  if(d.greet) h += '<div style="font-size:13px;color:#c9c4dc;font-style:italic;line-height:1.4;margin-bottom:12px">"'+esc(d.greet)+'"</div>';
  const list = d.items || [];
  if(!list.length){
    body.innerHTML = h + '<div style="color:#9b95b4;font-size:12.5px;line-height:1.5;padding:8px 0">'+empty+'</div>';
    return;
  }
  h += '<div style="font:600 11px Inter;color:#8a86a0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">'+esc(header)+'</div>';
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
      '<div style="font-size:11px;color:'+accent+'">'+it.unit+' \ud83d\udfe4 cada · você tem '+it.qty+'</div>';
    row.appendChild(mid);
    const btns = document.createElement('div'); btns.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:0 0 auto';
    const b1 = _btn('Vender', true); b1.style.cssText += ';padding:4px 10px;font-size:11px;';
    b1.onclick = ()=> socket.emit(sellEvent, {item: it.item});
    btns.appendChild(b1);
    if(it.qty > 1){
      const ba = _btn('Tudo ('+it.qty+')', true); ba.style.cssText += ';padding:4px 10px;font-size:11px;';
      ba.onclick = ()=> socket.emit(sellEvent, {item: it.item, all: true});
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
// ===========================================================================
//  PARTY — a Mesa de Confraternizações: lobby de formação (ready check mútuo).
//  Dois lados: "Na mesa" (esperando) e "No grupo" (aceito por todos). Cada um
//  clica no nome dos OUTROS; quando todos se aceitam (2 a 6), o grupo forma.
// ===========================================================================
let _partyEl = null, _partyBodyEl = null, _partyData = null, myParty = null;

function closePartyTable(silent){
  if(_partyEl){ _partyEl.remove(); _partyEl = null; _partyBodyEl = null; }
  if(!silent) socket.emit('party_leave');
}

function openPartyTable(d){
  _partyData = d || {};
  if(_partyEl){ renderPartyTableBody(_partyBodyEl, _partyData); return; }
  const ov = _overlay(); const box = _box(460);
  box.style.cssText += ';padding:0;display:flex;flex-direction:column;max-height:86vh;';
  const hd = document.createElement('div');
  hd.style.cssText = 'display:flex;align-items:center;gap:10px;padding:16px 18px 10px;border-bottom:1px solid #2a2540;';
  const ti = document.createElement('div'); ti.textContent = 'Mesa de Confraternizações';
  ti.style.cssText = 'font:700 18px Cinzel,serif;color:#f4d8a0;flex:1 1 auto;';
  const x = _btn('\u2715', false); x.style.cssText += ';padding:4px 10px;'; x.onclick = ()=> closePartyTable(false);
  hd.appendChild(ti); hd.appendChild(x); box.appendChild(hd);
  _partyBodyEl = document.createElement('div');
  _partyBodyEl.style.cssText = 'padding:12px 18px 18px;overflow-y:auto;';
  box.appendChild(_partyBodyEl);
  renderPartyTableBody(_partyBodyEl, _partyData);
  ov.appendChild(box); document.body.appendChild(ov); _partyEl = ov;
  ov.addEventListener('click', e=>{ if(e.target === ov) closePartyTable(false); });
}

function renderPartyTableBody(body, d){
  if(!body) return;
  const members = d.members || [];
  const waiting = members.filter(m=> !m.confirmed);
  const grouped = members.filter(m=> m.confirmed);
  let h = '<div style="font-size:12px;color:#9b95b4;line-height:1.45;margin-bottom:12px">Cada um clica no nome dos <b style="color:#e8e2f0">outros</b> pra aceitar. Quando todos se aceitarem (2 a '+(d.max||6)+'), o grupo é formado.</div>';
  h += '<div style="display:flex;gap:8px;align-items:stretch">';
  h += '<div style="flex:1 1 0;min-width:0"><div style="font:600 11px Inter;color:#8a86a0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px">Na mesa</div><div id="_pt_wait"></div></div>';
  h += '<div style="flex:0 0 auto;display:flex;align-items:center;color:#6a6488;font-size:20px">&raquo;</div>';
  h += '<div style="flex:1 1 0;min-width:0"><div style="font:600 11px Inter;color:#8fd6a0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px">No grupo</div><div id="_pt_group"></div></div>';
  h += '</div>';
  if(d.ready) h += '<div style="margin-top:14px;text-align:center;font:700 13px Cinzel,serif;color:#8fd6a0">Prontos! Formando o grupo...</div>';
  else h += '<div style="margin-top:14px;text-align:center;font-size:12px;color:#9b95b4">'+grouped.length+' de '+members.length+' no grupo</div>';
  body.innerHTML = h;
  const mkRow = (m)=>{
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:8px;background:'+(m.confirmed?'#16261b':'#1b1828')+';margin-bottom:6px';
    const nm = document.createElement('div');
    nm.style.cssText = 'flex:1 1 auto;min-width:0;font:600 12.5px Inter;color:#e8e2f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    nm.innerHTML = esc(m.name) + (m.you ? ' <span style="color:#f4d8a0;font-size:10px">(você)</span>' : '');
    row.appendChild(nm);
    if(!m.you){
      const b = _btn(m.accepted ? '\u2713 Aceito' : 'Aceitar', m.accepted);
      b.style.cssText += ';padding:4px 9px;font-size:11px';
      b.onclick = ()=> socket.emit('party_accept', {target: m.id});
      row.appendChild(b);
    } else if(m.confirmed){
      const ok = document.createElement('span'); ok.textContent = '\u2713';
      ok.style.cssText = 'color:#8fd6a0;font-size:13px;padding:0 6px'; row.appendChild(ok);
    }
    return row;
  };
  const wEl = body.querySelector('#_pt_wait'), gEl = body.querySelector('#_pt_group');
  if(wEl){ if(!waiting.length) wEl.innerHTML = '<div style="font-size:11px;color:#6a6488;padding:6px 2px">(ninguém esperando)</div>'; else waiting.forEach(m=> wEl.appendChild(mkRow(m))); }
  if(gEl){ if(!grouped.length) gEl.innerHTML = '<div style="font-size:11px;color:#6a6488;padding:6px 2px">(vazio)</div>'; else grouped.forEach(m=> gEl.appendChild(mkRow(m))); }
}

function onPartyFormed(d){
  myParty = d || null;
  closePartyTable(true);
  renderPartyHud();
  const names = (d.members||[]).filter(m=>!m.you).map(m=>m.name);
  toastMsg('Grupo formado' + (names.length ? ' com ' + names.join(', ') : '') + '!');
}

function renderPartyHud(){
  let el = document.getElementById('_partyhud');
  if(!myParty || !(myParty.members||[]).length){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div'); el.id = '_partyhud';
    el.style.cssText = 'position:fixed;left:10px;top:118px;z-index:40;background:rgba(20,16,30,0.82);border:1px solid #2a2540;border-radius:10px;padding:8px 11px;font-family:Inter,sans-serif;pointer-events:none;max-width:180px';
    document.body.appendChild(el);
  }
  let h = '<div style="font:700 11px Cinzel,serif;color:#f4d8a0;margin-bottom:5px">\ud83e\udd1d Grupo</div>';
  (myParty.members||[]).forEach(m=>{
    h += '<div style="font-size:12px;color:'+(m.you?'#f4d8a0':'#d8d2e8')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(m.name)+(m.you?' (você)':'')+'</div>';
  });
  el.innerHTML = h;
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
  {flag:'primeira_lenda', icon:'🏆', name:'Pioneiro das Lendas', desc:'Você foi o PRIMEIRO do servidor a derrubar um chefe. A relíquia é sua, o título é seu, e isso nunca mais vai se repetir.'},
  {flag:'blessing_pofnir', icon:'🛡️', name:'Amigo do Pof', desc:'O Pofnir te abençoou em Valoran. Você carrega um pedaço da luz dele (+5 de vida máxima).'},
  {flag:'slayer_varth',    icon:'☠️', name:'Flagelo de Varth', desc:'Você derrotou Lorde Varth no topo da Torre e sobreviveu à Praga de Atalech. O bosque sussurra o seu nome.'},
  {flag:'banned_valoran',  icon:'💀', name:'Deixou o Pofnir Ansioso', desc:'Você insistiu no trono do Criador. Foi obliterado e está banido de Valoran.'},
  {flag:'dom_nhare',   icon:'🐇', name:'Nharé sabe se esconder', desc:'Nharé, a Lebre de Mil Saídas, te ensinou a Milésima Saída e a virar uma lebre invisível. Quando não houver mais saída, sempre existe mais uma.'},
  {flag:'bola_pofnir', icon:'🧶', name:'Pofnir deixou você brincar', desc:'Você ofereceu uma Fagulha ao gato branco e ele te deu a Bola de Lã dele. Poucos no Ermo já ouviram o Pofnir ronronar.'},
  {flag:'dom_valiria', icon:'☀️', name:'Aurora de Valíria', desc:'Valíria, a Serena, fez a aurora descer sobre você e te deu o dom de mesmo nome. Quando os seus precisarem, você vira o escudo que nenhum golpe atravessa.'},
  {flag:'dom_facalan', icon:'🐆', name:'A onça reconhece você', desc:'Facalan, a onça dourada, aceitou o seu sangue e te deu a Forma de Facalan. Quando a luta aperta, você vira a própria fera e a morte espera a sua vez.'},
  {flag:'dom_nherith', icon:'🦉', name:'O pacto da coruja', desc:'Nherith, a coruja que tudo vê, selou um pacto com você e te deu a forma da Coruja Demoníaca: garras necróticas no lugar das magias, e a luz roxa do Faraó nos olhos.'},
  {flag:'dom_jose', icon:'🎵', name:'José trapaceia a seu favor', desc:'José, o gato preto selado do cabaré da Dona Beth, te ensinou a Canção do Cabaré. Enquanto você canta, o dano em área e as maldições do inimigo se voltam contra ele mesmo.'},
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
      '<div style="font-size:11.5px;color:#7c7790;line-height:1.4;padding:3px 0">Sua classe não assume outras formas. Por enquanto só o <b style="color:#9b95b4">Druida</b> tem a Forma Selvagem (🐺 Lobo, 🐻 Urso, 🦅 Águia).</div>' + _fichaPosturas(f);
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
  return h + _fichaPosturas(f);
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
    (caster ? tabBtn('grimorio','Grimório') : '')+tabBtn('oficios','Ofícios')+tabBtn('marcas','Marcas')+'</div>';
  if(fichaTab==='geral') h += _fichaGeral(f);
  else if(fichaTab==='passivas') h += _fichaPassivas(f);
  else if(fichaTab==='grimorio') h += _fichaGrimorio();
  else if(fichaTab==='oficios') h += _fichaOficios(f);
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
  fichaPanel.querySelectorAll('[data-posture]').forEach(b=>
    b.onclick = ()=>{ const pid=b.getAttribute('data-posture'); socket.emit('set_posture', { posture: pid || null }); });
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
  if(!combat.yourTurn){ combat.pending = null; closeSpellMenu(); closePostureMenu(); }
  for(const c of snap.combatants){
    let e = players.get(c.cid);
    if(!e && c.kind === 'monster'){      // reforço invocado pelo chefe: cria a entidade
      addPlayer({ id:c.cid, x:c.x, y:c.y, facing:'down', monster:true, kind:'monster',
                  glyph:c.glyph, mtype:c.mtype, hp:c.hp, hp_max:c.hp_max });
      e = players.get(c.cid);
    }
    if(e){
      if(c.kind==='monster' && !e._dead && !c.alive){          // MORREU AGORA: dissolução da alma (rework)
        spawnRing(c.cid, Math.max(1.2, (c.size||1)*0.8), '#cfc8e6');
        spawnSparks(c.cid, '#b8b0d8', 10);
      }
      e.x = c.x; e.y = c.y; e.hp = c.hp; e.hp_max = c.hp_max; e._dead = !c.alive;
      e.boss = !!c.boss; e._enraged = !!c.enraged; if(c.mtype) e.mtype = c.mtype; if(c.size) e.size = c.size;
      e.smoke = !!c.smoke;
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
    '<div style="margin-top:4px;line-height:1.8">'+chips+'</div>'+
    _defenseLine(your);

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
    const _dpot = (inventory.find(s=> s.item === 'pocao_divina') || {}).qty || 0;
    if(_dpot > 0) btns += cbBtn('divine','✨ Poção Divina ('+_dpot+')', {disabled: your.action_used});
    if(myFicha && transformsData[myFicha.class_id]){
      const cf = (transformsData[myFicha.class_id]||[]).find(x=> x.id === (myFicha.form||''));
      btns += cbBtn('transform', cf ? (cf.icon+' '+cf.name) : '🐾 Transformar', {});
    }
    if(myFicha && posturesData[myFicha.class_id]){
      const ap = (posturesData[myFicha.class_id]||[]).find(x=> x.id === (your.posture||''));
      btns += cbBtn('posture', ap ? (ap.icon+' '+ap.name) : '🛡 Postura', {});
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
function _defenseLine(your){
  if(!your) return '';
  const p = [];
  if(your.armor) p.push('🛡 armadura ' + your.armor);                    // mitigação por golpe
  if(your.dodge) p.push('💨 esquiva ' + Math.round(your.dodge*100) + '%'); // chance de anular
  if(your.block) p.push('⛨ bloqueio ' + your.block);                     // escudo
  if(your.ward) p.push('🔮 barreira ' + your.ward);                      // absorve dano (caster)
  if(your.mres) p.push('✦ res. mágica ' + Math.round(your.mres*100) + '%'); // resistência a magia
  if(!p.length) return '';
  return '<div style="margin-top:5px;font:600 10px Inter;color:#8fb3c8;line-height:1.5">' + p.join('  ·  ') + '</div>';
}
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
  if(id === 'divine'){ combat.pending = null; socket.emit('combat_use_divine', {}); return; }
  if(id === 'attack'){ combat.pending = {type:'attack', range:'melee', label:'Atacar'}; renderCombatHud(); return; }
  if(id === 'spells'){ openSpellMenu(); return; }
  if(id === 'transform'){ openFormMenu(); return; }
  if(id === 'posture'){ openPostureMenu(); return; }
  if(id.indexOf('ab:') === 0){
    const aid = id.slice(3);
    const ab = (your.abilities||[]).find(a=> a.id === aid);
    if(!ab) return;
    if(ab.target){ combat.pending = {type:'ability', id:aid, range:(ab.ranged?'ranged':'melee'), label:ab.name}; renderCombatHud(); }
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
let postureMenuEl = null;
function closePostureMenu(){ if(postureMenuEl){ postureMenuEl.remove(); postureMenuEl = null; } }
function openPostureMenu(){
  closePostureMenu();
  const f = myFicha || {};
  const list = (f.class_id && posturesData[f.class_id]) ? posturesData[f.class_id] : [];
  const active = (combat && combat.your && combat.your.posture) || null;
  postureMenuEl = document.createElement('div');
  postureMenuEl.style.cssText = 'position:fixed;left:50%;bottom:128px;transform:translateX(-50%);width:min(440px,92vw);z-index:8600;'+
    'background:rgba(20,17,30,.97);border:1px solid #c79b4a;border-radius:14px;box-shadow:0 16px 44px rgba(0,0,0,.6);padding:10px 12px;font-family:Inter;max-height:62vh;overflow:auto';
  let html = '<div style="font:800 12px Cinzel,serif;color:#f4d8a0;margin-bottom:2px">Postura · Devoção a Valíria</div>'+
             '<div style="font-size:10px;color:#9b95b4;margin-bottom:7px">Muda seu papel na luta. Vale só dentro do combate.</div>';
  list.forEach(ps=>{
    const on = ps.id===active;
    html += '<button data-posture="'+esc(ps.id)+'"'+(on?' disabled':'')+' style="display:flex;width:100%;align-items:center;gap:9px;margin:0 0 6px;padding:8px 10px;border-radius:9px;border:1px solid '+(on?'#c79b4a':'#5a4e2e')+';background:'+(on?'#2e2818':'#2a2620')+';color:#e8e4f0;font:600 12px Inter;cursor:'+(on?'default':'pointer')+';text-align:left">'+
      '<span style="font-size:18px;line-height:1">'+ps.icon+'</span>'+
      '<span style="flex:1;min-width:0"><div>'+esc(ps.name)+(on?' · <span style="color:#f4d88a">ATIVA</span>':'')+'</div>'+
      '<div style="font-size:10px;color:#9b95b4;line-height:1.25">'+esc(ps.desc||'')+'</div></span></button>';
  });
  if(active){
    html += '<button data-posture="" style="width:100%;padding:8px;border-radius:9px;border:1px solid #4a4360;background:#221d36;color:#d8d2e8;font:600 12px Inter;cursor:pointer">↺ Voltar à postura normal</button>';
  }
  html += '<button data-postclose="1" style="width:100%;margin-top:6px;padding:6px;border-radius:9px;border:none;background:none;color:#8a86a0;font:600 11px Inter;cursor:pointer">fechar</button>';
  postureMenuEl.innerHTML = html;
  document.body.appendChild(postureMenuEl);
  postureMenuEl.querySelectorAll('[data-posture]').forEach(b=> b.onclick = ()=>{ const pid=b.getAttribute('data-posture'); socket.emit('combat_posture', {posture: pid || null}); closePostureMenu(); });
  const xc = postureMenuEl.querySelector('[data-postclose]'); if(xc) xc.onclick = closePostureMenu;
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
  // HIT FLASH global (rework): a entidade PISCA ao tomar dano de verdade
  if(typeof text==='string' && text.indexOf('-')>=0){
    const now = performance.now();
    e._hitFlash = now + 150;
    e._hitFlashCol = (color==='#ffd86b'||color==='#ffe08a') ? '#ffd86b' : '#ffffff';
  }
  const num = parseInt(String(text).replace(/[^0-9]/g,''), 10) || 0;   // valor do dano (pro destaque)
  dmgPops.push({ x:e.x, y:e.y, text:text, color:color||'#fff', t0:performance.now(),
                 ox:(Math.random()-0.5)*TS*0.8, big:num>=80 });
}
const STATUS_ICON = { stunned:'💫', poison:'☠️', burning:'🔥', bleeding:'🩸',
  frightened:'😱', restrained:'🕸️', blinded:'⚫', slowed:'🐌', maldicao:'🟣', veneno_varth:'☠️', praga_atalech:'☣️', couraca_vargo:'🟣', chama_eterna:'🔥', escamas_krezath:'🐉', aurora:'☀️', aurora_fraca:'🕯️', facalan:'🐆', facalan_folego:'💛', cancao:'🎵' };
const STATUS_PT = { stunned:'atordoado', poison:'envenenado', burning:'queimando', bleeding:'sangrando',
  frightened:'amedrontado', restrained:'imobilizado', blinded:'cego', slowed:'lento', maldicao:'amaldiçoado', veneno_varth:'Veneno de Varth', praga_atalech:'Praga de Atalech', couraca_vargo:'Manto de Vargo', chama_eterna:'Chama Eterna', escamas_krezath:'Escamas de Obsidiana', aurora:'aura de Valíria', aurora_fraca:'luz consumida', facalan:'Forma de Facalan', facalan_folego:'fôlego de Facalan', cancao:'Canção do Cabaré' };
const TOWER_MOBS = new Set(['tumular_torre','carniceiro_torre','cavaleiro_torre','algoz_torre','necromante_torre','profanador_torre','lorde_varth']);
function _isDark(res){ return !!res.vfx || TOWER_MOBS.has((players.get(res.attacker)||{}).mtype); }
function showStatusFx(fx){
  if(!fx) return;
  for(const f of (fx.fx||[])){
    if(f.type === 'expire' || !f.dmg) continue;
    const col = f.type==='poison'?'#8bd450':(f.type==='burning'?'#ff8a3a':(f.type==='maldicao'?'#b06bff':(f.type==='veneno_varth'?'#a060e0':(f.type==='praga_atalech'?'#7ee07a':(f.type==='chama_eterna'?'#ff9a40':'#ff7a7a')))));
    popDamage(fx.cid, (STATUS_ICON[f.type]||'✦')+'-'+f.dmg, col);
  }
}
function showAttackResult(res){
  if(!res) return;
  const dark = (res.mon_ability && _isDark(res));   // monstros da torre + magias sombrias
  if(res.summon){
    spawnAt(res.attacker, 'summon', '#a86bd6');
    toastMsg('💀 '+(res.ability||'Invocação')+': '+((res.summon_count||0)>0?(res.summon_count+' '):'')+'reforço(s) chegaram!', true);
    return;
  }
  // Manto de Vargo: o lorde se envolve numa aura ROXA e passa a tomar metade do dano
  if(res.selfbuff){
    const ember = (res.selfbuff === 'escamas_krezath');
    spawnAt(res.attacker, 'heal', ember ? '#ff9a40' : '#b06bff');
    spawnDarkBlast(res.attacker, 2, ember ? '#ff6a20' : '#9b2fe0');
    spawnRing(res.attacker, 2.0, ember ? '#ffb060' : '#c9a0ff');
    const e = players.get(res.attacker);
    if(e){ if(ember) e._emberAura = performance.now() + (res.buff_turns||3)*1100 + 600;
           else e._purpleAura = performance.now() + (res.buff_turns||3)*1100 + 600; }
    toastMsg(ember ? ('🐉 '+(res.ability||'Escamas de Obsidiana')+'! As escamas endurecem: metade do dano.')
                   : ('🟣 '+(res.ability||'Manto de Vargo')+'! Lorde Varth brilha em roxo e passa a tomar metade do dano.'), true);
    return;
  }
  // AoE: explosão (SOMBRIA na torre, CATACLISMA do Varth, PRAGA DE ATALECH) + dano em todos os alvos
  if(res.aoe && Array.isArray(res.splash)){
    const cata = (res.vfx === 'cataclysm');
    const atalech = (res.vfx === 'atalech');
    const magma = (res.vfx === 'magmastorm');
    const dfire = (res.vfx === 'dragonfire');
    if(cata) spawnCataclysm(res.target);
    else if(dfire){ spawnDragonfire(res.target); screenShake(7, 520); }
    else if(magma){ spawnMagmaStorm(res.target); screenShake(6, 460); }
    else if(atalech){ spawnAtalechPlague(res.target); spawnRing(res.target, 3.2, '#7ee07a', 180); screenShake(6, 450); }
    else if(dark){ spawnDarkBlast(res.target, 2, '#a050ff'); spawnRing(res.target, 2.4, '#c79bff', 80); screenShake(4, 320); }
    else { spawnBlast(res.target, 2, '#ff7a30'); spawnRing(res.target, 2.4, '#ffb060', 80); screenShake(4, 320); }
    const _pcol = dfire ? '#ffd090' : (magma ? '#ff9a40' : (atalech ? '#7ee07a' : (cata?'#d49bff':(dark?'#c79bff':'#ff9a4a'))));
    const _ptag = dfire ? '🔥 -' : (atalech ? '☣ -' : (cata?'☠ -':'-'));
    setTimeout(()=>{ for(const s of res.splash){
      if(s.blocked) popDamage(s.cid, 'refletiu', '#9be36a');
      else popDamage(s.cid, _ptag+s.dmg, _pcol);
    } if(res.reflected) popDamage(res.attacker, '-'+res.reflected, '#9be36a'); }, (cata||atalech||magma||dfire)?640:220);
    if(dfire) toastMsg('🐉 '+(res.ability||'Hálito do Fim')+'! 65 de dano que FURA toda defesa + Chama Eterna por 8 turnos. O fogo de antes do sol.', true);
    else if(magma) toastMsg('🌋 '+(res.ability||'Tempestade de Magma')+'! O chão erupciona sobre todos!', true);
    else if(atalech) toastMsg('☣️ '+(res.ability||'Praga de Atalech')+'! 50 de dano que FURA toda defesa + veneno por 10 turnos. Não há cura para o bosque.', true);
    else if(cata) toastMsg('☠️ '+(res.ability||'CATACLISMA DE VARGO')+'! O vazio engole o campo — '+(STATUS_PT[res.applied]||'Veneno de Varth')+'!', true);
    else toastMsg('💥 '+(res.ability||'Explosão')+'!'+(res.applied?(' · '+(STATUS_PT[res.applied]||res.applied)):''), true);
    return;
  }
  // monstro se cura (type heal)
  if(res.self && res.self_heal != null){
    spawnAt(res.attacker, 'heal', dark?'#b070ff':'#b06bff');
    setTimeout(()=> popHeal(res.attacker, '+'+res.self_heal), 60);
    toastMsg('🩸 '+(res.ability||'')+' · +'+res.self_heal+' vida', true);
    return;
  }
  // habilidade por resistência (medo/olhar/maldição, sem rolagem de ataque)
  if(res.mon_ability && res.gaze){
    const eff = res.vfx==='cursesigil' ? 'cursesigil' : (res.atype==='fear' ? 'fear' : 'gaze');
    spawnAt(res.target, eff, res.atype==='fear' ? '#7a3aa0' : '#b06bff');
    if(res.applied) toastMsg((res.atype==='fear'?'😱 ':'🟣 ')+(res.ability||'habilidade')+': '+(STATUS_PT[res.applied]||res.applied)+'!', true);
    else toastMsg('✦ '+(res.ability||'habilidade')+': resistiu');
    return;
  }
  // impacto conforme o tipo: dreno/raio/pesado (SOMBRIOS na torre) ou golpe padrão
  if(res.mon_ability && res.atype === 'drain'){
    if(dark) spawnSoulDrain(res.target, res.attacker, '#b070ff'); else spawnDrain(res.target, res.attacker, '#c84a7a');
  } else if(res.mon_ability && res.vfx === 'darkbolt'){
    spawnDarkBolt(res.attacker, res.target, '#a050ff');
  } else if(res.mon_ability && res.atype === 'heavy'){
    spawnAt(res.target, 'slam', dark ? '#8a4adf' : (res.crit ? '#ffd86b' : '#d0834a'));
    spawnRing(res.target, 1.5, dark ? '#a878e8' : '#e8a060');       // pancada pesada: onda de choque
    spawnSparks(res.target, dark ? '#c9a0ff' : '#ffcf7a', 9);
    screenShake(3, 240);
  } else if(dark){
    spawnAt(res.target, 'slash', '#b06bff');
    if(res.vfx === 'cursesigil') spawnAt(res.target, 'cursesigil', '#b06bff');
  } else spawnAt(res.target, 'slash', res.crit ? '#ffd86b' : '#fff2c2');
  if(res.crit && res.hit){ spawnSparks(res.target, '#ffd86b', 10); screenShake(2, 170); }   // CRÍTICO: faíscas douradas
  if(res.dodged){                                  // ESQUIVA: o golpe passou da CA mas foi desviado (anula o dano)
    popDamage(res.target, '✦ Esquivou!', '#6bd4ff');
  } else if(res.hit){
    const _rad = res.radiant_dmg || 0;
    const _basic = Math.max(0, (res.dmg||0) - _rad);
    popDamage(res.target, '-'+_basic+(res.crit?'!':''), res.crit?'#ffd86b':'#ff7a7a');
    if(_rad > 0){                                   // Castigo Divino: dano radiante em AMARELO, separado do básico
      spawnAt(res.target, 'buff', '#ffe08a');
      setTimeout(()=> popDamage(res.target, '✦ -'+_rad, '#ffdf3a'), 220);
    }
    if(res.self_heal){                              // Combatente Valiriano: cura por golpe
      spawnAt(res.attacker, 'buff', '#7be3a0');
      setTimeout(()=> popDamage(res.attacker, '+'+res.self_heal, '#7be3a0'), 120);
    }
    if(res.strike2_dmg){                            // Forma de Facalan: 2º golpe do ataque duplo
      spawnAt(res.target, 'slash', '#ffd86b');
      setTimeout(()=> popDamage(res.target, '⚔ -'+res.strike2_dmg, '#ffb060'), 320);
    }
  } else popDamage(res.target, 'errou', '#9b95b4');
  if(res.lucky){                                   // Sortudo: re-rolou a errada
    spawnAt(res.attacker, 'buff', '#9be36a');
    setTimeout(()=> popDamage(res.attacker, '🍀', '#9be36a'), 60);
  }
  if(res.poisoned){ spawnAt(res.target, 'buff', '#8bd450'); }   // Lâmina Venenosa: envenenou
  if(res.assassinate){ spawnAt(res.target, 'slash', '#c060ff'); toastMsg('🗡️ ASSASSINATO! Golpe das sombras.', true); }
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
    if(r.aoe){                                   // magia de ÁREA: arremesso + explosão + dano em todos
      const col=vfxColorFor(r.name);
      const a=players.get(r.caster), b=players.get(r.target);
      if(a && b) vfx.push({kind:'bolt', x0:a.x, y0:a.y, x1:b.x, y1:b.y, color:col, t0:performance.now(), life:300});
      spawnBlast(r.target, r.aoe, col, 230);
      setTimeout(()=>{ for(const h of (r.hits||[])){
        if(h.dmg > 0) popDamage(h.cid, '-'+h.dmg+(h.success?' ½':''), h.success?'#ffb060':'#ff7a7a');
        else popDamage(h.cid, 'resistiu', '#9b95b4');
      } }, 230);
      toastMsg('💥 '+(r.name||'Explosão')+((r.hits&&r.hits.length>1)?(' — '+r.hits.length+' alvos!'):'!'));
      return;
    }
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
  if(r.breath && Array.isArray(r.splash)){           // Sopro Dracônico: fogo em área em todos os inimigos
    spawnAt(r.actor, 'rage', '#ff7a30');
    setTimeout(()=>{ for(const s of r.splash){ popDamage(s.cid, '🔥-'+s.dmg, '#ff9a4a'); } }, 160);
    toastMsg('🐉 '+(r.name||'Sopro Dracônico')+' · fogo em área!', true);
    return;
  }
  if(r.heal != null){ spawnAt(r.actor, 'heal', '#5ec27a'); popHeal(r.actor, '+'+r.heal); if(r.name) toastMsg('✦ '+r.name); return; }
  if(r.rage){ spawnAt(r.actor, 'rage', '#ff5a2a'); toastMsg('🔥 Fúria!'); return; }
  if(r.surge){ spawnAt(r.actor, 'surge', '#ffe066'); toastMsg('⚡ Surto de Ação!'); return; }
  if(r.armed){ spawnAt(r.actor, 'armed', '#ffd86b'); toastMsg('⚔️ Castigo armado · próximo acerto'); return; }
  if(r.venom){ spawnAt(r.actor, 'venom', '#8bd450'); toastMsg('🗡️ Lâmina Venenosa! Seus golpes envenenam.'); return; }
  if(r.vanish){ spawnAt(r.actor, 'vanish', '#9a6ad0'); toastMsg('👻 Some nas Sombras! Seu próximo golpe é um assassinato.'); return; }
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
const SOLID_TILES = new Set(['~', 'T', '#', '^', 'H', 'M', 'm', 'L', 'W', 'V', '/', ';', '_', '{', '}', 'F', 'k', 'h', 'q']);  // iguais ao servidor
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

// ===========================================================================
//  BRASAL, A FERIDA DO MUNDO + GOELA DE KREZATH (rework: tiles, feras e o Devorador)
// ===========================================================================
function _lavaTile(c, px, py, ts, gx, gy){
  // LAVA VIVA: gradiente pulsante + crosta escura + bolhas que estouram
  const t = performance.now();
  const pulse = 0.5 + 0.5*Math.sin(t/900 + (gx*1.7 + gy*2.3));
  const g = c.createLinearGradient(px, py, px+ts, py+ts);
  g.addColorStop(0, pulse > 0.5 ? '#ff7a20' : '#e85a10');
  g.addColorStop(0.5, '#c03a08');
  g.addColorStop(1, '#ff9a30');
  c.fillStyle = g; c.fillRect(px, py, ts, ts);
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.25 + 0.2*pulse;
  const rg = c.createRadialGradient(px+ts/2, py+ts/2, 0, px+ts/2, py+ts/2, ts*0.8);
  rg.addColorStop(0, '#ffd070'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = rg; c.fillRect(px, py, ts, ts); c.restore();
  // placas de crosta escura
  c.fillStyle = 'rgba(40,14,6,0.55)';
  if(rng(gx,gy,3) > 0.5) c.fillRect(px + rng(gx,gy,4)*ts*0.5, py + rng(gx,gy,5)*ts*0.5, ts*0.34, ts*0.2);
  if(rng(gx,gy,6) > 0.5) c.fillRect(px + rng(gx,gy,7)*ts*0.4, py + rng(gx,gy,8)*ts*0.5, ts*0.25, ts*0.16);
  // bolha estourando (ciclo por tile)
  const ph = ((t/16 + (gx*37+gy*91)) % 220) / 220;
  if(ph < 0.3){
    const bx = px + (0.25 + rng(gx,gy,9)*0.5)*ts, by = py + (0.25 + rng(gx,gy,10)*0.5)*ts;
    c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = (0.3-ph)/0.3 * 0.9;
    c.fillStyle = '#ffd070'; c.beginPath(); c.arc(bx, by, ts*0.06 + ph*ts*0.3, 0, Math.PI*2); c.fill(); c.restore();
  }
}
function drawBrasalTile(c, ch, px, py, ts, gx, gy){
  const t = performance.now();
  const base = () => {                                     // chão de cinza vulcânica
    c.fillStyle = rng(gx,gy,1) > 0.5 ? '#2c2428' : '#251e23'; c.fillRect(px, py, ts, ts);
    c.fillStyle = 'rgba(60,50,56,0.5)';
    for(let i=0;i<3;i++) c.fillRect(px + rng(gx,gy,i+2)*ts, py + rng(gx,gy,i+6)*ts, 2, 1.4);
    if(rng(gx,gy,12) > 0.86){                              // brasinha respirando na cinza
      const gl = 0.4 + 0.5*Math.sin(t/700 + gx*3 + gy*5);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = gl*0.7;
      c.fillStyle = '#ff7a30'; c.beginPath();
      c.arc(px + (0.2+rng(gx,gy,13)*0.6)*ts, py + (0.2+rng(gx,gy,14)*0.6)*ts, 1.4, 0, Math.PI*2); c.fill(); c.restore();
    }
  };
  switch(ch){
    case '.': case '+': base(); return true;
    case ',': {                                            // leito de brasas
      base();
      c.save(); c.globalCompositeOperation='lighter';
      for(let i=0;i<4;i++){
        const gl = 0.35 + 0.5*Math.sin(t/500 + i*2 + gx + gy);
        c.globalAlpha = gl*0.8; c.fillStyle = i%2 ? '#ff8a30' : '#e8541a';
        c.beginPath(); c.arc(px + rng(gx,gy,i+20)*ts, py + rng(gx,gy,i+25)*ts, 1.6, 0, Math.PI*2); c.fill();
      } c.restore(); return true; }
    case 'd': {                                            // terra rachada de magma
      c.fillStyle = '#1e1517'; c.fillRect(px, py, ts, ts);
      const gl = 0.5 + 0.4*Math.sin(t/800 + gx*2 + gy*3);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.55*gl;
      c.strokeStyle = '#ff6a20'; c.lineWidth = 1.4; c.beginPath();
      c.moveTo(px + rng(gx,gy,30)*ts, py);
      c.lineTo(px + ts*0.4 + rng(gx,gy,31)*ts*0.3, py + ts*0.45);
      c.lineTo(px + rng(gx,gy,32)*ts, py + ts); c.stroke();
      c.beginPath(); c.moveTo(px, py + rng(gx,gy,33)*ts);
      c.lineTo(px + ts*0.5, py + ts*0.5 + rng(gx,gy,34)*ts*0.2); c.stroke();
      c.restore();
      c.fillStyle = 'rgba(52,42,46,0.6)';
      c.fillRect(px + rng(gx,gy,35)*ts*0.5, py + rng(gx,gy,36)*ts*0.5, ts*0.3, ts*0.2);
      return true; }
    case 'l': _lavaTile(c, px, py, ts, gx, gy); return true;
    case 'B': {                                            // rocha de obsidiana facetada
      base();
      c.fillStyle = '#171020'; c.beginPath();
      c.moveTo(px+ts*0.5, py+ts*0.08); c.lineTo(px+ts*0.9, py+ts*0.42);
      c.lineTo(px+ts*0.78, py+ts*0.92); c.lineTo(px+ts*0.2, py+ts*0.88);
      c.lineTo(px+ts*0.08, py+ts*0.4); c.closePath(); c.fill();
      c.strokeStyle = '#4a3a6a'; c.lineWidth = 1; c.stroke();
      c.strokeStyle = 'rgba(150,120,220,0.45)'; c.beginPath();
      c.moveTo(px+ts*0.5, py+ts*0.08); c.lineTo(px+ts*0.44, py+ts*0.9); c.stroke();
      c.beginPath(); c.moveTo(px+ts*0.12, py+ts*0.44); c.lineTo(px+ts*0.86, py+ts*0.5); c.stroke();
      c.save(); c.globalAlpha = 0.5; c.fillStyle = '#9a80d0';
      c.fillRect(px+ts*0.3, py+ts*0.2, ts*0.14, ts*0.08); c.restore();
      return true; }
    case 'Y': {                                            // árvore carbonizada com brasa
      base();
      c.strokeStyle = '#0e0a0c'; c.lineWidth = Math.max(2, ts*0.12); c.lineCap='round';
      c.beginPath(); c.moveTo(px+ts*0.5, py+ts*0.95); c.lineTo(px+ts*0.46, py+ts*0.3); c.stroke();
      c.lineWidth = Math.max(1.4, ts*0.06);
      c.beginPath(); c.moveTo(px+ts*0.47, py+ts*0.45); c.lineTo(px+ts*0.2, py+ts*0.2); c.stroke();
      c.beginPath(); c.moveTo(px+ts*0.46, py+ts*0.34); c.lineTo(px+ts*0.75, py+ts*0.12); c.stroke();
      c.beginPath(); c.moveTo(px+ts*0.48, py+ts*0.6); c.lineTo(px+ts*0.78, py+ts*0.48); c.stroke();
      const gl = 0.4 + 0.5*Math.sin(t/600 + gx*7);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = gl;
      c.fillStyle = '#ff7a30'; c.beginPath(); c.arc(px+ts*0.75, py+ts*0.12, 1.6, 0, Math.PI*2); c.fill(); c.restore();
      return true; }
    case 'k': {                                            // ossada gigante (costelas)
      base();
      c.strokeStyle = '#cfc4ae'; c.lineWidth = Math.max(1.6, ts*0.08); c.lineCap='round';
      for(let i=0;i<3;i++){
        const bx = px + ts*(0.22 + i*0.26);
        c.beginPath(); c.arc(bx, py + ts*0.85, ts*0.42, Math.PI*1.05, Math.PI*1.75); c.stroke();
      }
      c.strokeStyle = '#a89c86'; c.lineWidth = Math.max(1.2, ts*0.05);
      c.beginPath(); c.moveTo(px+ts*0.1, py+ts*0.86); c.lineTo(px+ts*0.92, py+ts*0.84); c.stroke();
      return true; }
    case 'G': {                                            // gêiser: cratera que cospe brasas
      base();
      c.fillStyle = '#151013'; c.beginPath();
      c.ellipse(px+ts/2, py+ts*0.6, ts*0.32, ts*0.2, 0, 0, Math.PI*2); c.fill();
      c.strokeStyle = '#3a2c30'; c.lineWidth = 1.4; c.stroke();
      const cyc = ((t/16 + (gx*53+gy*17)) % 260) / 260;
      if(cyc < 0.35){                                      // erupção!
        const k = cyc/0.35;
        c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = (1-k)*0.9;
        for(let i=0;i<5;i++){
          const a = -Math.PI/2 + (i-2)*0.28, d = ts*(0.2 + k*1.1);
          c.fillStyle = i%2 ? '#ffd070' : '#ff7a20';
          c.beginPath(); c.arc(px+ts/2 + Math.cos(a)*d*0.5, py+ts*0.55 + Math.sin(a)*d, 1.8*(1-k*0.5), 0, Math.PI*2); c.fill();
        } c.restore();
      }
      return true; }
  }
  return false;
}
function drawGoelaTile(c, ch, px, py, ts, gx, gy){
  const t = performance.now();
  switch(ch){
    case '.': case '+': case ',': {                        // chão de basalto
      c.fillStyle = rng(gx,gy,1) > 0.5 ? '#241c20' : '#1f181c'; c.fillRect(px, py, ts, ts);
      c.fillStyle = 'rgba(64,52,58,0.5)';
      for(let i=0;i<3;i++) c.fillRect(px + rng(gx,gy,i+3)*ts, py + rng(gx,gy,i+7)*ts, 2, 1.4);
      if(ch === ','){                                       // cascalho quente
        c.fillStyle = 'rgba(120,70,50,0.5)';
        for(let i=0;i<4;i++){ c.beginPath();
          c.arc(px + rng(gx,gy,i+11)*ts, py + rng(gx,gy,i+15)*ts, 1.3, 0, Math.PI*2); c.fill(); }
      }
      return true; }
    case '#': case 'v': {                                  // parede de basalto (com veio de magma no 'v')
      c.fillStyle = '#120d10'; c.fillRect(px, py, ts, ts);
      c.fillStyle = '#1e161a';
      c.fillRect(px, py + ts*0.15, ts, ts*0.14);
      c.fillRect(px, py + ts*0.55, ts, ts*0.12);
      c.strokeStyle = 'rgba(70,55,62,0.6)'; c.lineWidth = 1;
      c.strokeRect(px+0.5, py+0.5, ts-1, ts-1);
      if(ch === 'v'){
        const gl = 0.5 + 0.45*Math.sin(t/700 + gx*3 + gy*2);
        c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = gl;
        c.strokeStyle = '#ff6a20'; c.lineWidth = 1.8; c.beginPath();
        c.moveTo(px + rng(gx,gy,20)*ts, py);
        c.lineTo(px + ts*0.5 + (rng(gx,gy,21)-0.5)*ts*0.4, py + ts*0.5);
        c.lineTo(px + rng(gx,gy,22)*ts, py + ts); c.stroke();
        c.globalAlpha = gl*0.4; c.lineWidth = 4; c.stroke();
        c.restore();
      }
      return true; }
    case 'l': _lavaTile(c, px, py, ts, gx, gy); return true;
    case 'B': {                                            // estalagmite / coluna de obsidiana
      c.fillStyle = '#1f181c'; c.fillRect(px, py, ts, ts);
      c.fillStyle = '#171020'; c.beginPath();
      c.moveTo(px+ts*0.5, py+ts*0.05); c.lineTo(px+ts*0.82, py+ts*0.95);
      c.lineTo(px+ts*0.18, py+ts*0.95); c.closePath(); c.fill();
      c.strokeStyle = '#4a3a6a'; c.lineWidth = 1; c.stroke();
      c.strokeStyle = 'rgba(150,120,220,0.4)';
      c.beginPath(); c.moveTo(px+ts*0.5, py+ts*0.08); c.lineTo(px+ts*0.5, py+ts*0.9); c.stroke();
      return true; }
  }
  return false;
}

// ---------- CONSTRUTOS DE MAGMA: rocha negra com rachaduras vivas ----------
function drawMagmaConstruct(c, sx, sy, ts, p){
  const t = performance.now();
  const kind = p.mtype;
  const N = (p.size && p.size >= 3) ? p.size : 1.6;
  const S = ts * N * 0.5;
  const cx = sx + (p.size ? p.size*ts/2 : ts/2), cy = sy + (p.size ? p.size*ts/2 : ts/2);
  const bob = Math.sin(t/520 + (p.x||0)) * S*0.03;
  const pulse = 0.5 + 0.5*Math.sin(t/430 + (p.x||0)*2);
  const enr = p._enraged;
  const ROCK='#241a20', ROCK2='#332630', MAG = enr ? '#ff4a10' : '#ff7a20', EDGE='#4a3844';
  c.save();
  c.fillStyle='rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(cx, cy+S*0.85, S*0.7, S*0.22, 0, 0, Math.PI*2); c.fill();
  c.translate(cx, cy+bob);
  // pernas de pedra
  c.fillStyle = ROCK;
  c.fillRect(-S*0.42, S*0.25, S*0.3, S*0.55); c.fillRect(S*0.12, S*0.25, S*0.3, S*0.55);
  // torso rochoso
  const wide = (kind === 'golem_obsidiana' || kind === 'vulkar');
  c.fillStyle = ROCK2; c.beginPath();
  c.moveTo(-S*(wide?0.72:0.55), -S*0.35); c.lineTo(S*(wide?0.72:0.55), -S*0.35);
  c.lineTo(S*(wide?0.6:0.45), S*0.35); c.lineTo(-S*(wide?0.6:0.45), S*0.35);
  c.closePath(); c.fill();
  c.strokeStyle = EDGE; c.lineWidth = Math.max(1.5, S*0.05); c.stroke();
  // RACHADURAS DE MAGMA pulsantes no torso
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.55 + 0.4*pulse;
  c.strokeStyle = MAG; c.lineWidth = Math.max(1.4, S*0.05); c.lineCap='round';
  c.beginPath(); c.moveTo(-S*0.3, -S*0.25); c.lineTo(-S*0.1, 0); c.lineTo(-S*0.24, S*0.28); c.stroke();
  c.beginPath(); c.moveTo(S*0.16, -S*0.3); c.lineTo(S*0.3, -S*0.02); c.lineTo(S*0.14, S*0.26); c.stroke();
  c.beginPath(); c.moveTo(-S*0.05, -S*0.32); c.lineTo(0, S*0.3); c.stroke();
  c.restore();
  // braços
  c.fillStyle = ROCK;
  c.fillRect(-S*(wide?0.95:0.8), -S*0.3, S*0.26, S*0.7);
  c.fillRect(S*(wide?0.69:0.54), -S*0.3, S*0.26, S*0.7);
  // cabeça (por variante)
  if(kind === 'devoto_krezath'){                            // capuz com olhos de brasa
    c.fillStyle = '#2c1418'; c.beginPath();
    c.moveTo(-S*0.34, -S*0.35); c.lineTo(0, -S*0.95); c.lineTo(S*0.34, -S*0.35); c.closePath(); c.fill();
    c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.9;
    c.fillStyle = MAG; c.beginPath(); c.arc(-S*0.1, -S*0.52, S*0.05, 0, Math.PI*2); c.fill();
    c.beginPath(); c.arc(S*0.1, -S*0.52, S*0.05, 0, Math.PI*2); c.fill(); c.restore();
  } else if(kind === 'imp_brasal'){                         // cabeça pequena com chifres
    c.fillStyle = ROCK2; c.beginPath(); c.arc(0, -S*0.55, S*0.26, 0, Math.PI*2); c.fill();
    c.strokeStyle = '#c9885a'; c.lineWidth = Math.max(1.4, S*0.06);
    c.beginPath(); c.moveTo(-S*0.18, -S*0.72); c.lineTo(-S*0.32, -S*0.98); c.stroke();
    c.beginPath(); c.moveTo(S*0.18, -S*0.72); c.lineTo(S*0.32, -S*0.98); c.stroke();
    c.save(); c.globalCompositeOperation='lighter'; c.fillStyle = MAG;
    c.beginPath(); c.arc(-S*0.09, -S*0.57, S*0.045, 0, Math.PI*2); c.fill();
    c.beginPath(); c.arc(S*0.09, -S*0.57, S*0.045, 0, Math.PI*2); c.fill(); c.restore();
  } else if(kind === 'templario_magma'){                    // elmo com pluma de fogo
    c.fillStyle = ROCK; c.fillRect(-S*0.26, -S*0.85, S*0.52, S*0.5);
    c.fillStyle = '#0c080a'; c.fillRect(-S*0.2, -S*0.68, S*0.4, S*0.12);
    c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.85;
    c.fillStyle = MAG; c.fillRect(-S*0.16, -S*0.66, S*0.32, S*0.07); c.restore();
    for(let i=0;i<4;i++){                                   // pluma flamejante
      const fy = -S*(0.9 + i*0.09), fw = S*(0.16 - i*0.03);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.7 - i*0.12;
      c.fillStyle = i%2 ? '#ffd070' : MAG;
      c.beginPath(); c.ellipse(Math.sin(t/180+i)*S*0.04, fy, fw, S*0.07, 0, 0, Math.PI*2); c.fill(); c.restore();
    }
  } else {                                                  // golem / forjado / vulkar: bloco com fenda ocular
    const hw = wide ? S*0.4 : S*0.3;
    c.fillStyle = ROCK; c.fillRect(-hw, -S*0.8, hw*2, S*0.45);
    c.strokeStyle = EDGE; c.strokeRect(-hw, -S*0.8, hw*2, S*0.45);
    c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.75 + 0.25*pulse;
    c.fillStyle = MAG; c.fillRect(-hw*0.7, -S*0.66, hw*1.4, S*0.09); c.restore();
  }
  // arma por variante
  c.strokeStyle = '#161014'; c.lineWidth = Math.max(2, S*0.09); c.lineCap='round';
  if(kind === 'forjado_krezath'){                           // lâmina de obsidiana
    c.beginPath(); c.moveTo(S*0.82, S*0.3); c.lineTo(S*1.05, -S*0.75); c.stroke();
    c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha=0.6;
    c.strokeStyle = MAG; c.lineWidth = Math.max(1, S*0.03);
    c.beginPath(); c.moveTo(S*0.84, S*0.25); c.lineTo(S*1.03, -S*0.7); c.stroke(); c.restore();
  } else if(kind === 'templario_magma'){                    // espadão
    c.lineWidth = Math.max(3, S*0.12);
    c.beginPath(); c.moveTo(S*0.8, S*0.4); c.lineTo(S*0.8, -S*1.0); c.stroke();
    c.strokeStyle = '#3a2c34'; c.lineWidth = Math.max(2, S*0.07);
    c.beginPath(); c.moveTo(S*0.62, -S*0.55); c.lineTo(S*0.98, -S*0.55); c.stroke();
  } else if(kind === 'imp_brasal'){                         // tridente
    c.lineWidth = Math.max(1.6, S*0.05);
    c.beginPath(); c.moveTo(S*0.7, S*0.35); c.lineTo(S*0.7, -S*0.7); c.stroke();
    c.beginPath(); c.moveTo(S*0.58, -S*0.5); c.lineTo(S*0.58, -S*0.75); c.stroke();
    c.beginPath(); c.moveTo(S*0.82, -S*0.5); c.lineTo(S*0.82, -S*0.75); c.stroke();
  } else if(kind === 'vulkar'){                             // MARTELO da fornalha + coroa de brasas
    c.lineWidth = Math.max(3, S*0.1);
    c.beginPath(); c.moveTo(S*0.85, S*0.4); c.lineTo(S*0.85, -S*0.8); c.stroke();
    c.fillStyle = '#2c2026'; c.fillRect(S*0.6, -S*1.05, S*0.5, S*0.32);
    c.strokeStyle = EDGE; c.lineWidth = 1.4; c.strokeRect(S*0.6, -S*1.05, S*0.5, S*0.32);
    c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.6 + 0.35*pulse;
    c.fillStyle = MAG; c.fillRect(S*0.64, -S*0.94, S*0.42, S*0.08); c.restore();
    for(let i=0;i<5;i++){                                   // coroa de brasas orbitando
      const a = t/800 + i*Math.PI*2/5;
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.75;
      c.fillStyle = i%2 ? '#ffd070' : MAG;
      c.beginPath(); c.arc(Math.cos(a)*S*0.55, -S*0.95 + Math.sin(a)*S*0.12, S*0.05, 0, Math.PI*2); c.fill(); c.restore();
    }
  }
  // égide das Escamas (Fúria da Forja): casca ígnea
  if((p._status && p._status.escamas_krezath) || (p._emberAura && t < p._emberAura)){
    c.save(); c.globalCompositeOperation='lighter';
    const eg = c.createRadialGradient(0, 0, 0, 0, 0, S*1.35);
    eg.addColorStop(0,'rgba(255,150,60,0.4)'); eg.addColorStop(1,'rgba(0,0,0,0)');
    c.globalAlpha = 0.6 + 0.3*Math.sin(t/210); c.fillStyle = eg;
    c.beginPath(); c.arc(0, 0, S*1.35, 0, Math.PI*2); c.fill(); c.restore();
  }
  c.restore();
  if(kind === 'vulkar'){
    c.save(); c.font = '800 9px Cinzel, serif'; c.textAlign='center'; c.textBaseline='bottom';
    const lbl = '🔥 GUARDIÃO DA GOELA', tw = c.measureText(lbl).width + 10, tagY = sy - 14;
    c.fillStyle = 'rgba(24,10,4,0.92)'; roundRect(c, cx - tw/2, tagY-12, tw, 12, 3); c.fill();
    c.fillStyle = '#ffab60'; c.fillText(lbl, cx, tagY-2); c.restore();
  }
  drawMonsterBarName(c, sx, sy, ts, p);
}

// ---------- KREZATH 2.0: O DEVORADOR SOTERRADO, agora digno do título ----------
function drawKrezath(c, sx, sy, ts, p){
  const t = performance.now();
  const N = p.size || 5, S = ts * N * 0.5;
  const cx = sx + N*ts/2, cy = sy + N*ts/2;
  const breathe = Math.sin(t/900) * S*0.03;
  const pulse = 0.5 + 0.5*Math.sin(t/380);
  const heart = 0.5 + 0.5*Math.sin(t/430);                       // batida do coração de magma
  const enr = p._enraged;
  const MAG = enr ? '#ff3a08' : '#ff6a18';
  const MAG2 = enr ? '#ff6a30' : '#ffab50';
  const HORN='#d8cbb4', HORN2='#b8a888';
  c.save();
  // sombra + brasa refletida do lago
  c.fillStyle='rgba(0,0,0,.5)'; c.beginPath(); c.ellipse(cx, cy+S*0.82, S*1.1, S*0.3, 0, 0, Math.PI*2); c.fill();
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.22 + 0.15*pulse;
  const ug = c.createRadialGradient(cx, cy+S*0.6, 0, cx, cy+S*0.6, S*1.3);
  ug.addColorStop(0, MAG); ug.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = ug; c.beginPath(); c.ellipse(cx, cy+S*0.6, S*1.3, S*0.42, 0, 0, Math.PI*2); c.fill(); c.restore();
  c.translate(cx, cy + breathe);

  // ==== ASAS 2.0: membranas com DEDOS, garra no polegar e brilho de magma ====
  for(const sgn of [-1, 1]){
    const flap = Math.sin(t/1100 + (sgn>0?0:1.2)) * 0.07;
    c.save(); c.rotate(sgn * (0.05 + flap));
    // pontos-chave da asa (ombro -> polegar -> 3 pontas de dedo -> base)
    const sh = [sgn*S*0.18, -S*0.28];
    const th = [sgn*S*1.0,  -S*1.15];
    const f1 = [sgn*S*1.62, -S*0.85];
    const f2 = [sgn*S*1.5,  -S*0.38];
    const f3 = [sgn*S*1.18, -S*0.02];
    const bs = [sgn*S*0.3,   S*0.12];
    // membrana (gradiente translúcido escuro -> quente na borda)
    const wg = c.createLinearGradient(sh[0], sh[1], f2[0], f2[1]);
    wg.addColorStop(0, 'rgba(22,12,18,0.96)');
    wg.addColorStop(0.7, 'rgba(46,20,22,0.94)');
    wg.addColorStop(1, 'rgba(90,30,20,0.9)');
    c.fillStyle = wg; c.beginPath();
    c.moveTo(sh[0], sh[1]);
    c.quadraticCurveTo(sgn*S*0.55, -S*0.95, th[0], th[1]);
    c.quadraticCurveTo((th[0]+f1[0])/2, th[1] - S*0.06, f1[0], f1[1]);
    c.quadraticCurveTo(sgn*S*1.28, -S*0.62, f2[0], f2[1]);
    c.quadraticCurveTo(sgn*S*1.2, -S*0.18, f3[0], f3[1]);
    c.quadraticCurveTo(sgn*S*0.7, -S*0.02, bs[0], bs[1]);
    c.closePath(); c.fill();
    c.strokeStyle = '#3a2226'; c.lineWidth = Math.max(1.5, S*0.028); c.stroke();
    // DEDOS da asa (raios ósseos)
    c.strokeStyle = '#5a4038'; c.lineWidth = Math.max(1.6, S*0.032); c.lineCap='round';
    for(const f of [f1, f2, f3]){ c.beginPath(); c.moveTo(th[0], th[1]); c.lineTo(f[0], f[1]); c.stroke(); }
    c.beginPath(); c.moveTo(sh[0], sh[1]); c.lineTo(th[0], th[1]); c.stroke();
    // garra no polegar
    c.fillStyle = HORN; c.save(); c.translate(th[0], th[1]); c.rotate(sgn*-0.5);
    c.beginPath(); c.moveTo(0,0); c.quadraticCurveTo(sgn*S*0.06, -S*0.12, sgn*S*0.02, -S*0.16);
    c.lineTo(sgn*S*-0.03, -S*0.03); c.closePath(); c.fill(); c.restore();
    // veias de magma na membrana (pulsando)
    c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.35 + 0.3*pulse;
    c.strokeStyle = MAG; c.lineWidth = Math.max(1, S*0.018);
    c.beginPath(); c.moveTo(sh[0], sh[1]); c.quadraticCurveTo(sgn*S*0.9, -S*0.7, f1[0]*0.96, f1[1]*0.96); c.stroke();
    c.beginPath(); c.moveTo(sgn*S*0.4, -S*0.2); c.quadraticCurveTo(sgn*S*0.95, -S*0.4, f2[0]*0.95, f2[1]*0.95); c.stroke();
    c.restore();
    c.restore();
  }

  // ==== CAUDA longa com espinhos ao longo ====
  const tw1 = Math.sin(t/700)*S*0.12;
  const tg = c.createLinearGradient(-S*0.3, S*0.3, -S*1.45, S*0.05);
  tg.addColorStop(0, '#2e2028'); tg.addColorStop(1, '#1a1218');
  c.strokeStyle = '#241a20'; c.lineWidth = Math.max(5, S*0.18); c.lineCap='round';
  c.beginPath(); c.moveTo(-S*0.35, S*0.32);
  c.quadraticCurveTo(-S*1.0, S*0.58 + tw1, -S*1.45, S*0.12 + tw1*1.6); c.stroke();
  c.strokeStyle = tg; c.lineWidth = Math.max(3.4, S*0.13);
  c.beginPath(); c.moveTo(-S*0.35, S*0.32);
  c.quadraticCurveTo(-S*1.0, S*0.58 + tw1, -S*1.45, S*0.12 + tw1*1.6); c.stroke();
  // espinhos da cauda
  c.fillStyle = HORN2;
  for(let i=1;i<=3;i++){
    const u = i/4;
    const tx = -S*0.35 + (-S*1.1)*u, ty = S*0.32 + (S*0.26 + tw1)*Math.sin(u*Math.PI);
    c.save(); c.translate(tx, ty); c.rotate(-0.5 - u*0.5);
    c.beginPath(); c.moveTo(0,0); c.lineTo(-S*0.06, S*0.02); c.lineTo(-S*0.005, -S*(0.1 - u*0.02)); c.closePath(); c.fill();
    c.restore();
  }
  // ponta-lâmina
  c.fillStyle = HORN; c.save(); c.translate(-S*1.45, S*0.12 + tw1*1.6); c.rotate(-0.75);
  c.beginPath(); c.moveTo(0, 0); c.lineTo(-S*0.2, S*0.06); c.lineTo(-S*0.03, -S*0.2); c.closePath(); c.fill(); c.restore();

  // ==== CORPO: massa escamada com volume ====
  const bodg = c.createRadialGradient(-S*0.1, -S*0.05, S*0.1, 0, S*0.15, S*0.85);
  bodg.addColorStop(0, '#3a2a34'); bodg.addColorStop(0.55, '#241a22'); bodg.addColorStop(1, '#120c10');
  c.fillStyle = bodg; c.beginPath();
  c.ellipse(0, S*0.12, S*0.75, S*0.52, 0, 0, Math.PI*2); c.fill();
  c.strokeStyle = '#0a0608'; c.lineWidth = Math.max(1.5, S*0.03); c.stroke();
  // rim light do magma por baixo (borda inferior quente)
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.35 + 0.2*pulse;
  c.strokeStyle = MAG; c.lineWidth = Math.max(2, S*0.04);
  c.beginPath(); c.ellipse(0, S*0.12, S*0.72, S*0.5, 0, Math.PI*0.15, Math.PI*0.85); c.stroke();
  c.restore();
  // barriga com placas
  c.fillStyle = '#3c2a30'; c.beginPath();
  c.ellipse(0, S*0.32, S*0.46, S*0.26, 0, 0, Math.PI*2); c.fill();
  c.strokeStyle = '#241419'; c.lineWidth = Math.max(1, S*0.02);
  for(let i=-2;i<=2;i++){ c.beginPath(); c.ellipse(0, S*0.32 + i*S*0.075, S*0.42, S*0.05, 0, Math.PI*0.15, Math.PI*0.85); c.stroke(); }
  // GLOW DO CORAÇÃO DE MAGMA no peito (visível pelas rachaduras)
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.35 + 0.4*heart;
  const hg = c.createRadialGradient(S*0.12, S*0.02, 0, S*0.12, S*0.02, S*0.34);
  hg.addColorStop(0, MAG2); hg.addColorStop(0.5, MAG); hg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = hg; c.beginPath(); c.arc(S*0.12, S*0.02, S*0.34, 0, Math.PI*2); c.fill(); c.restore();
  // fileiras de escamas (arcos, mais densas)
  c.strokeStyle = 'rgba(10,6,8,0.85)'; c.lineWidth = Math.max(1, S*0.02);
  for(let r=0;r<4;r++) for(let i=-3;i<=3;i++){
    c.beginPath(); c.arc(i*S*0.19, -S*0.12 + r*S*0.15, S*0.09, 0.12*Math.PI, 0.88*Math.PI); c.stroke();
  }
  // RACHADURAS de magma (o núcleo vazando)
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.55 + 0.4*pulse;
  c.strokeStyle = MAG; c.lineWidth = Math.max(1.7, S*0.045); c.lineCap='round';
  c.beginPath(); c.moveTo(-S*0.48, -S*0.08); c.lineTo(-S*0.22, S*0.14); c.lineTo(-S*0.36, S*0.42); c.stroke();
  c.beginPath(); c.moveTo(S*0.02, -S*0.16); c.lineTo(S*0.2, S*0.08); c.lineTo(S*0.08, S*0.34); c.stroke();
  c.beginPath(); c.moveTo(S*0.38, -S*0.02); c.lineTo(S*0.52, S*0.2); c.stroke();
  c.lineWidth = Math.max(0.8, S*0.02); c.globalAlpha = 0.4 + 0.3*pulse;
  c.beginPath(); c.moveTo(-S*0.32, S*0.02); c.lineTo(-S*0.44, S*0.22); c.stroke();
  c.beginPath(); c.moveTo(S*0.14, -S*0.06); c.lineTo(S*0.32, -S*0.14); c.stroke();
  c.restore();
  // espinhos dorsais (fileira dupla, curvos)
  for(let i=-3;i<=3;i++){
    const bx = i*S*0.16, by = -S*0.36 - Math.cos(i*0.5)*S*0.06;
    const hgt = S*(0.2 - Math.abs(i)*0.02);
    const grd = c.createLinearGradient(bx, by, bx, by - hgt);
    grd.addColorStop(0, HORN2); grd.addColorStop(1, HORN);
    c.fillStyle = grd; c.beginPath();
    c.moveTo(bx - S*0.045, by);
    c.quadraticCurveTo(bx - S*0.01, by - hgt*0.7, bx + S*0.02, by - hgt);
    c.quadraticCurveTo(bx + S*0.03, by - hgt*0.4, bx + S*0.045, by);
    c.closePath(); c.fill();
  }
  // GARRAS dianteiras apoiadas (patas à mostra)
  for(const sgn of [-1, 1]){
    const gx = sgn*S*0.5, gy = S*0.56;
    c.fillStyle = '#1c1218'; c.beginPath(); c.ellipse(gx, gy, S*0.16, S*0.1, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = HORN;
    for(let f=-1; f<=1; f++){
      c.save(); c.translate(gx + f*S*0.08, gy + S*0.05); c.rotate(f*0.2);
      c.beginPath(); c.moveTo(-S*0.025, 0); c.quadraticCurveTo(0, S*0.1, S*0.015, S*0.11);
      c.lineTo(S*0.03, 0); c.closePath(); c.fill(); c.restore();
    }
  }

  // ==== PESCOÇO com placas ventrais + CABEÇA 2.0 ====
  const ng = c.createLinearGradient(S*0.3, -S*0.15, S*0.78, -S*0.95);
  ng.addColorStop(0, '#241a22'); ng.addColorStop(1, '#2e2028');
  c.strokeStyle = ng; c.lineWidth = Math.max(7, S*0.26); c.lineCap='round';
  c.beginPath(); c.moveTo(S*0.3, -S*0.12); c.quadraticCurveTo(S*0.6, -S*0.55, S*0.72, -S*0.88); c.stroke();
  // placas ventrais no pescoço
  c.strokeStyle = 'rgba(255,140,60,0.35)'; c.lineWidth = Math.max(1, S*0.02);
  for(let i=0;i<5;i++){
    const u = i/5;
    const nx = S*0.3 + (S*0.42)*u + Math.sin(u*2)*S*0.06, ny = -S*0.12 - S*0.72*u;
    c.beginPath(); c.arc(nx + S*0.06, ny, S*0.1, Math.PI*0.55, Math.PI*1.1); c.stroke();
  }
  const hx = S*0.76, hy = -S*1.0;
  c.save(); c.translate(hx, hy);
  // crânio com gradiente
  const skg = c.createLinearGradient(-S*0.3, -S*0.15, S*0.55, S*0.12);
  skg.addColorStop(0, '#2e2028'); skg.addColorStop(1, '#1a1216');
  c.fillStyle = skg; c.beginPath();
  c.moveTo(-S*0.3, -S*0.02);
  c.quadraticCurveTo(-S*0.18, -S*0.2, S*0.08, -S*0.2);       // testa
  c.quadraticCurveTo(S*0.32, -S*0.18, S*0.56, -S*0.05);      // topo do focinho
  c.lineTo(S*0.6, 0);
  c.quadraticCurveTo(S*0.42, S*0.05, S*0.18, S*0.06);        // maxilar superior
  c.quadraticCurveTo(-S*0.1, S*0.12, -S*0.26, S*0.14);
  c.closePath(); c.fill();
  c.strokeStyle = '#0a0608'; c.lineWidth = Math.max(1.2, S*0.022); c.stroke();
  // MANDÍBULA entreaberta com brilho de forno na garganta
  const jaw = 0.06 + 0.04*Math.sin(t/620);
  c.fillStyle = '#1a1014'; c.beginPath();
  c.moveTo(-S*0.16, S*0.12);
  c.quadraticCurveTo(S*0.14, S*(0.16 + jaw), S*0.5, S*(0.1 + jaw));
  c.lineTo(S*0.46, S*(0.16 + jaw));
  c.quadraticCurveTo(S*0.1, S*(0.24 + jaw), -S*0.16, S*0.18);
  c.closePath(); c.fill();
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.5 + 0.3*pulse;
  c.fillStyle = MAG; c.beginPath();
  c.ellipse(S*0.14, S*(0.14 + jaw*0.5), S*0.22, S*0.045, 0, 0, Math.PI*2); c.fill(); c.restore();
  // DENTES (superiores e inferiores)
  c.fillStyle = HORN;
  for(let i=0;i<5;i++){
    const dx = S*(0.08 + i*0.1);
    c.beginPath(); c.moveTo(dx - S*0.018, S*0.06); c.lineTo(dx, S*(0.13 + jaw*0.4)); c.lineTo(dx + S*0.018, S*0.06); c.closePath(); c.fill();
  }
  for(let i=0;i<4;i++){
    const dx = S*(0.14 + i*0.1);
    c.beginPath(); c.moveTo(dx - S*0.015, S*(0.17 + jaw)); c.lineTo(dx, S*(0.11 + jaw*0.6)); c.lineTo(dx + S*0.015, S*(0.17 + jaw)); c.closePath(); c.fill();
  }
  // narina fumegante
  c.fillStyle = '#0c080a'; c.beginPath(); c.ellipse(S*0.48, -S*0.02, S*0.03, S*0.02, 0.3, 0, Math.PI*2); c.fill();
  // OLHO de réptil: globo incandescente + pupila vertical
  c.save(); c.globalCompositeOperation='lighter';
  const eg2 = c.createRadialGradient(-S*0.02, -S*0.07, 0, -S*0.02, -S*0.07, S*0.13);
  eg2.addColorStop(0, enr ? '#ff4a10' : '#ffc860'); eg2.addColorStop(0.5, enr ? '#e02a00' : '#ff8a20'); eg2.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = eg2; c.beginPath(); c.arc(-S*0.02, -S*0.07, S*0.13, 0, Math.PI*2); c.fill();
  c.globalAlpha = 1; c.fillStyle = enr ? '#ffd0a0' : '#fff0c0';
  c.beginPath(); c.ellipse(-S*0.02, -S*0.07, S*0.055, S*0.04, -0.15, 0, Math.PI*2); c.fill();
  c.restore();
  c.fillStyle = '#0a0608'; c.beginPath(); c.ellipse(-S*0.02, -S*0.07, S*0.012, S*0.038, -0.1, 0, Math.PI*2); c.fill();
  // arcada da sobrancelha (placa)
  c.strokeStyle = '#3c2c34'; c.lineWidth = Math.max(1.4, S*0.03);
  c.beginPath(); c.moveTo(-S*0.14, -S*0.14); c.quadraticCurveTo(-S*0.02, -S*0.18, S*0.1, -S*0.13); c.stroke();
  // CHIFRES principais curvos (gradiente) + coroa de chifres menores
  for(const [ox, oy, len, rot] of [[-S*0.16, -S*0.12, 1.0, 0], [-S*0.05, -S*0.16, 0.85, 0.18]]){
    const hgr = c.createLinearGradient(ox, oy, ox - S*0.55*len, oy - S*0.5*len);
    hgr.addColorStop(0, HORN2); hgr.addColorStop(1, HORN);
    c.strokeStyle = hgr; c.lineWidth = Math.max(2.6, S*0.075); c.lineCap='round';
    c.beginPath(); c.moveTo(ox, oy);
    c.quadraticCurveTo(ox - S*0.3*len, oy - S*(0.4+rot)*len, ox - S*0.62*len, oy - S*(0.36+rot)*len);
    c.stroke();
    c.lineWidth = Math.max(1.4, S*0.04);
    c.beginPath(); c.moveTo(ox - S*0.45*len, oy - S*(0.41+rot)*len);
    c.lineTo(ox - S*0.62*len, oy - S*(0.36+rot)*len); c.stroke();
  }
  c.fillStyle = HORN2;                                          // coroa: espículas na nuca
  for(let i=0;i<3;i++){
    const kx = -S*(0.22 + i*0.05), ky = -S*(0.02 + i*0.05);
    c.save(); c.translate(kx, ky); c.rotate(-0.9 - i*0.15);
    c.beginPath(); c.moveTo(0,0); c.lineTo(-S*0.035, S*0.015); c.lineTo(-S*0.005, -S*(0.1 + i*0.015)); c.closePath(); c.fill();
    c.restore();
  }
  c.restore();
  // fumaça das narinas (subindo da ponta do focinho)
  c.save(); c.globalCompositeOperation='lighter';
  for(let i=0;i<3;i++){
    const ph = ((t/14 + i*45) % 100) / 100;
    c.globalAlpha = (1-ph) * 0.5;
    c.fillStyle = i%2 ? '#c9c0c8' : MAG2;
    c.beginPath(); c.arc(hx + S*0.5 + Math.sin(t/300+i)*S*0.05, hy - S*0.02 - ph*S*0.55, (1.6 + ph*2.2), 0, Math.PI*2); c.fill();
  }
  c.restore();
  // brasas subindo do corpo (o Devorador nunca esfria)
  c.save(); c.globalCompositeOperation='lighter';
  for(let i=0;i<5;i++){
    const ph = ((t/22 + i*53) % 190) / 190;
    const bx = Math.sin(i*2.1 + t/900)*S*0.55;
    c.globalAlpha = (1-ph)*0.55;
    c.fillStyle = i%2 ? '#ffd070' : MAG;
    c.beginPath(); c.arc(bx, S*0.1 - ph*S*1.1, 1.7*(1-ph*0.5), 0, Math.PI*2); c.fill();
  }
  c.restore();
  // égide: Escamas de Obsidiana (metade do dano)
  if((p._status && p._status.escamas_krezath) || (p._emberAura && t < p._emberAura)){
    c.save(); c.globalCompositeOperation='lighter';
    const eg = c.createRadialGradient(0, -S*0.1, 0, 0, -S*0.1, S*1.6);
    eg.addColorStop(0,'rgba(255,140,50,0.5)'); eg.addColorStop(0.6,'rgba(255,90,20,0.28)'); eg.addColorStop(1,'rgba(0,0,0,0)');
    c.globalAlpha = 0.6 + 0.3*Math.sin(t/200); c.fillStyle = eg;
    c.beginPath(); c.arc(0, -S*0.1, S*1.6, 0, Math.PI*2); c.fill();
    c.globalAlpha = 0.85; c.strokeStyle = '#ffd090'; c.lineWidth = Math.max(2, S*0.04);
    for(let i=0;i<9;i++){ const a = t/560 + i*Math.PI*2/9;
      c.beginPath(); c.arc(Math.cos(a)*S*1.15, -S*0.1 + Math.sin(a)*S*1.15, S*0.05, 0, Math.PI*2); c.stroke(); }
    c.restore();
  }
  c.restore();
  // título flutuante
  c.save(); c.font = '800 10px Cinzel, serif'; c.textAlign='center'; c.textBaseline='bottom';
  const lbl = '🔥 O DEVORADOR SOTERRADO', tw2 = c.measureText(lbl).width + 12, tagY = sy - 16;
  c.fillStyle = 'rgba(26,8,2,0.94)'; roundRect(c, cx - tw2/2, tagY-13, tw2, 13, 3); c.fill();
  c.fillStyle = '#ff9a40'; c.fillText(lbl, cx, tagY-2.5); c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

// ---------- VFX do Brasal ----------
function spawnMagmaStorm(atId){            // Tempestade de Magma: erupção em camadas + rochas
  const e=players.get(atId); if(!e) return;
  const now=performance.now();
  vfx.push({kind:'blast',       x1:e.x, y1:e.y, color:'#ff6a18', radius:3.2, t0:now,      life:920});
  vfx.push({kind:'shadowblast', x1:e.x, y1:e.y, color:'#7a1e08', radius:2.6, t0:now+140,  life:860});
  vfx.push({kind:'blast',       x1:e.x, y1:e.y, color:'#ffd070', radius:2.0, t0:now+300,  life:760});
  vfx.push({kind:'ring',        x1:e.x, y1:e.y, color:'#ff9a40', radius:3.4, t0:now+120,  life:560});
  vfx.push({kind:'sparks',      x1:e.x, y1:e.y, color:'#ffb060', n:12, ph:Math.random()*6.283, t0:now+180, life:640});
}
function spawnDragonfire(atId){            // HÁLITO DO FIM: o fogo de antes do sol
  const e=players.get(atId); if(!e) return;
  const now=performance.now();
  vfx.push({kind:'blast',       x1:e.x, y1:e.y, color:'#ffffff', radius:2.2, t0:now,      life:700});
  vfx.push({kind:'blast',       x1:e.x, y1:e.y, color:'#ffd070', radius:3.2, t0:now+120,  life:880});
  vfx.push({kind:'blast',       x1:e.x, y1:e.y, color:'#ff6a18', radius:4.0, t0:now+260,  life:940});
  vfx.push({kind:'shadowblast', x1:e.x, y1:e.y, color:'#8a1e04', radius:3.0, t0:now+420,  life:860});
  vfx.push({kind:'ring',        x1:e.x, y1:e.y, color:'#ffd090', radius:4.2, t0:now+200,  life:640});
  vfx.push({kind:'ring',        x1:e.x, y1:e.y, color:'#ff7a20', radius:3.0, t0:now+380,  life:560});
  vfx.push({kind:'sparks',      x1:e.x, y1:e.y, color:'#ffd070', n:14, ph:Math.random()*6.283, t0:now+240, life:720});
}

// ===========================================================================
//  FAUNA DO BRASAL 2.0: cada bicho com o corpo que merece (nada de urso pintado)
// ===========================================================================
function drawCinzal(c, sx, sy, ts, p){          // ESPREITADOR DE CINZAS: felino espectral
  const t = performance.now();
  const N = p.size || 2, S = ts * N * 0.5;
  const cx = sx + N*ts/2, cy = sy + N*ts/2;
  const d = _dirVec(p.facing || 'down'); const ang = Math.atan2(d[1], d[0]);
  const moving = !!p._moving;
  const cyc = ((p.walk||0) % WALK_CYCLE) / WALK_CYCLE;
  const bob = moving ? -Math.abs(Math.sin(cyc*Math.PI*2))*1.5 : Math.sin(t/650)*0.6;
  c.save();
  c.fillStyle='rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(cx, cy+S*0.55, S*0.75, S*0.2, 0, 0, Math.PI*2); c.fill();
  // rastro de cinza atrás dele
  c.save(); c.globalCompositeOperation='lighter';
  for(let i=0;i<4;i++){
    const ph = ((t/18 + i*40) % 160) / 160;
    c.globalAlpha = (1-ph)*0.28;
    c.fillStyle = '#8a8490';
    c.beginPath(); c.arc(cx - Math.cos(ang)*S*(0.5+ph*0.9), cy - Math.sin(ang)*S*(0.5+ph*0.9) - ph*S*0.25, S*0.09*(1-ph*0.4), 0, Math.PI*2); c.fill();
  }
  c.restore();
  c.translate(cx, cy + bob); c.rotate(ang);
  // corpo esguio de felino em espreita (baixo, alongado)
  const bg = c.createLinearGradient(-S*0.7, 0, S*0.7, 0);
  bg.addColorStop(0, '#2c2a32'); bg.addColorStop(0.6, '#3c3a44'); bg.addColorStop(1, '#4a4754');
  c.fillStyle = bg; c.beginPath();
  c.ellipse(0, 0, S*0.68, S*0.26, 0, 0, Math.PI*2); c.fill();
  // ancas + ombros
  c.fillStyle = '#34323c';
  c.beginPath(); c.ellipse(-S*0.45, 0, S*0.24, S*0.24, 0, 0, Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(S*0.38, 0, S*0.2, S*0.2, 0, 0, Math.PI*2); c.fill();
  // patas (finas, felinas)
  c.strokeStyle = '#221f28'; c.lineWidth = Math.max(2, S*0.07); c.lineCap='round';
  const sw = moving ? Math.sin(cyc*Math.PI*2)*S*0.14 : 0;
  c.beginPath(); c.moveTo(S*0.36, S*0.16); c.lineTo(S*0.42 + sw, S*0.36); c.stroke();
  c.beginPath(); c.moveTo(S*0.36, -S*0.16); c.lineTo(S*0.42 - sw, -S*0.36); c.stroke();
  c.beginPath(); c.moveTo(-S*0.44, S*0.16); c.lineTo(-S*0.5 - sw, S*0.36); c.stroke();
  c.beginPath(); c.moveTo(-S*0.44, -S*0.16); c.lineTo(-S*0.5 + sw, -S*0.36); c.stroke();
  // cauda LONGA com ponta de brasa
  const tw1 = Math.sin(t/300)*S*0.16;
  c.strokeStyle = '#2c2a32'; c.lineWidth = Math.max(2, S*0.06);
  c.beginPath(); c.moveTo(-S*0.62, 0);
  c.quadraticCurveTo(-S*1.05, tw1, -S*1.25, -S*0.18 + tw1); c.stroke();
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.6 + 0.35*Math.sin(t/240);
  c.fillStyle = '#ff8a30'; c.beginPath(); c.arc(-S*1.25, -S*0.18 + tw1, S*0.06, 0, Math.PI*2); c.fill(); c.restore();
  // listras de brasa fraca no dorso
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.3 + 0.2*Math.sin(t/500);
  c.strokeStyle = '#c96a3a'; c.lineWidth = Math.max(1, S*0.03);
  for(let i=-1;i<=1;i++){ c.beginPath(); c.moveTo(i*S*0.2, -S*0.2); c.quadraticCurveTo(i*S*0.2 + S*0.06, 0, i*S*0.2, S*0.2); c.stroke(); }
  c.restore();
  // cabeça felina: focinho curto, orelhas pontudas
  c.fillStyle = '#3c3a44'; c.beginPath(); c.ellipse(S*0.62, 0, S*0.2, S*0.17, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = '#2c2a32';
  c.beginPath(); c.moveTo(S*0.55, -S*0.14); c.lineTo(S*0.48, -S*0.32); c.lineTo(S*0.66, -S*0.2); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.55, S*0.14); c.lineTo(S*0.48, S*0.32); c.lineTo(S*0.66, S*0.2); c.closePath(); c.fill();
  // olhos de brasa (espreita)
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.95;
  c.fillStyle = '#ffb040';
  c.beginPath(); c.ellipse(S*0.7, -S*0.06, S*0.035, S*0.05, 0, 0, Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(S*0.7, S*0.06, S*0.035, S*0.05, 0, 0, Math.PI*2); c.fill();
  c.restore();
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawSalamandra(c, sx, sy, ts, p){      // SALAMANDRA DO BRASAL: lagarto de fogo
  const t = performance.now();
  const N = p.size || 2, S = ts * N * 0.5;
  const cx = sx + N*ts/2, cy = sy + N*ts/2;
  const d = _dirVec(p.facing || 'down'); const ang = Math.atan2(d[1], d[0]);
  const moving = !!p._moving;
  const cyc = ((p.walk||0) % WALK_CYCLE) / WALK_CYCLE;
  const wig = moving ? Math.sin(cyc*Math.PI*2)*0.08 : Math.sin(t/800)*0.03;
  c.save();
  c.fillStyle='rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(cx, cy+S*0.45, S*0.85, S*0.22, 0, 0, Math.PI*2); c.fill();
  c.translate(cx, cy); c.rotate(ang + wig);
  // cauda grossa afinando (balança)
  const tsw = Math.sin(t/280)*S*0.2;
  c.fillStyle = '#7a2412'; c.beginPath();
  c.moveTo(-S*0.5, -S*0.14);
  c.quadraticCurveTo(-S*1.0, tsw*0.5, -S*1.3, tsw);
  c.quadraticCurveTo(-S*1.0, tsw*0.5 + S*0.06, -S*0.5, S*0.14);
  c.closePath(); c.fill();
  // 4 patas curtas ABERTAS pros lados (lagarto de verdade)
  c.strokeStyle = '#5a1c0e'; c.lineWidth = Math.max(2.4, S*0.09); c.lineCap='round';
  const psw = moving ? Math.sin(cyc*Math.PI*2)*S*0.18 : 0;
  c.beginPath(); c.moveTo(S*0.3, S*0.2); c.lineTo(S*0.42 + psw, S*0.48); c.stroke();
  c.beginPath(); c.moveTo(S*0.3, -S*0.2); c.lineTo(S*0.42 - psw, -S*0.48); c.stroke();
  c.beginPath(); c.moveTo(-S*0.32, S*0.2); c.lineTo(-S*0.44 - psw, S*0.48); c.stroke();
  c.beginPath(); c.moveTo(-S*0.32, -S*0.2); c.lineTo(-S*0.44 + psw, -S*0.48); c.stroke();
  // dedos
  c.lineWidth = Math.max(1.2, S*0.035);
  for(const [lx, ly] of [[S*0.42+psw, S*0.48],[S*0.42-psw,-S*0.48],[-S*0.44-psw,S*0.48],[-S*0.44+psw,-S*0.48]]){
    for(let f=-1; f<=1; f++){ c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + S*0.07, ly + f*S*0.06 + Math.sign(ly)*S*0.05); c.stroke(); }
  }
  // corpo achatado alongado com gradiente (barriga clara nas bordas)
  const bg = c.createLinearGradient(0, -S*0.3, 0, S*0.3);
  bg.addColorStop(0, '#8a2c14'); bg.addColorStop(0.5, '#a83a1e'); bg.addColorStop(1, '#8a2c14');
  c.fillStyle = bg; c.beginPath();
  c.ellipse(0, 0, S*0.62, S*0.3, 0, 0, Math.PI*2); c.fill();
  c.strokeStyle = '#4a1408'; c.lineWidth = 1.2; c.stroke();
  // manchas incandescentes na pele
  c.save(); c.globalCompositeOperation='lighter';
  for(let i=0;i<5;i++){
    const gl = 0.4 + 0.4*Math.sin(t/420 + i*1.7);
    c.globalAlpha = gl;
    c.fillStyle = i%2 ? '#ff8a30' : '#ffb050';
    const mx = (i-2)*S*0.22, my = (i%2 ? 1 : -1)*S*0.12;
    c.beginPath(); c.ellipse(mx, my, S*0.07, S*0.05, 0, 0, Math.PI*2); c.fill();
  }
  c.restore();
  // CRISTA dorsal de fogo (chamas ao longo da espinha)
  c.save(); c.globalCompositeOperation='lighter';
  for(let i=0;i<5;i++){
    const fx = S*(0.4 - i*0.22);
    const fl = 0.7 + 0.3*Math.sin(t/160 + i*2);
    c.globalAlpha = 0.75*fl;
    c.fillStyle = i%2 ? '#ffd070' : '#ff7a20';
    c.beginPath();
    c.moveTo(fx - S*0.06, 0); c.quadraticCurveTo(fx + Math.sin(t/140+i)*S*0.04, -S*0.22*fl, fx + S*0.06, 0);
    c.closePath(); c.fill();
  }
  c.restore();
  // cabeça achatada, olhos no topo
  c.fillStyle = '#a83a1e'; c.beginPath();
  c.moveTo(S*0.5, -S*0.2); c.quadraticCurveTo(S*0.95, -S*0.14, S*1.0, 0);
  c.quadraticCurveTo(S*0.95, S*0.14, S*0.5, S*0.2); c.closePath(); c.fill();
  c.strokeStyle = '#4a1408'; c.lineWidth = 1.1; c.stroke();
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.95;
  c.fillStyle = '#ffd050';
  c.beginPath(); c.arc(S*0.72, -S*0.11, S*0.045, 0, Math.PI*2); c.fill();
  c.beginPath(); c.arc(S*0.72, S*0.11, S*0.045, 0, Math.PI*2); c.fill();
  c.restore();
  // narinas soltando brasa
  const ph = ((t/16) % 120) / 120;
  if(ph < 0.5){ c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = (0.5-ph);
    c.fillStyle = '#ff9a40'; c.beginPath(); c.arc(S*1.02, 0, 1.6, 0, Math.PI*2); c.fill(); c.restore(); }
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawSerpeMagma(c, sx, sy, ts, p){      // SERPE DE MAGMA: serpente ondulante
  const t = performance.now();
  const N = p.size || 3, S = ts * N * 0.5;
  const cx = sx + N*ts/2, cy = sy + N*ts/2;
  const d = _dirVec(p.facing || 'down'); const ang = Math.atan2(d[1], d[0]);
  c.save();
  c.fillStyle='rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(cx, cy+S*0.5, S*0.9, S*0.22, 0, 0, Math.PI*2); c.fill();
  c.translate(cx, cy); c.rotate(ang);
  // corpo em S: cadeia de segmentos ondulando (cabeça na frente, cauda atrás)
  const SEG = 11;
  const pts = [];
  for(let i=0;i<SEG;i++){
    const u = i/(SEG-1);                          // 0=cabeça 1=cauda
    const x = S*(0.85 - u*1.9);
    const y = Math.sin(u*4.4 + t/260) * S*0.24 * (0.35 + u*0.65);
    pts.push([x, y]);
  }
  // corpo: passes de traço grosso->fino com gradiente de cor
  for(let pass=0; pass<2; pass++){
    for(let i=0;i<SEG-1;i++){
      const u = i/(SEG-1);
      const w = (S*0.24)*(1-u*0.75) * (pass? 0.55 : 1);
      c.strokeStyle = pass ? '#ff8a30' : '#8a2810';
      if(pass){ c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.35 + 0.25*Math.sin(t/300 + i); }
      c.lineWidth = Math.max(2, w); c.lineCap='round';
      c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[i+1][0], pts[i+1][1]); c.stroke();
      if(pass) c.restore();
    }
  }
  // padrão de diamantes incandescentes ao longo do dorso
  c.save(); c.globalCompositeOperation='lighter';
  for(let i=1;i<SEG-1;i+=2){
    const gl = 0.5 + 0.4*Math.sin(t/380 + i*1.3);
    c.globalAlpha = gl; c.fillStyle = '#ffd060';
    const w = S*0.06*(1 - i/(SEG-1)*0.6);
    c.save(); c.translate(pts[i][0], pts[i][1]); c.rotate(Math.PI/4);
    c.fillRect(-w/2, -w/2, w, w); c.restore();
  }
  c.restore();
  // cabeça triangular com mandíbula
  const hx = pts[0][0], hy = pts[0][1];
  c.save(); c.translate(hx, hy);
  const hg = c.createLinearGradient(0, -S*0.16, 0, S*0.16);
  hg.addColorStop(0, '#a8341a'); hg.addColorStop(1, '#7a2410');
  c.fillStyle = hg; c.beginPath();
  c.moveTo(-S*0.08, -S*0.16); c.lineTo(S*0.34, -S*0.05); c.lineTo(S*0.4, 0);
  c.lineTo(S*0.34, S*0.05); c.lineTo(-S*0.08, S*0.16); c.closePath(); c.fill();
  c.strokeStyle = '#3a1006'; c.lineWidth = 1.1; c.stroke();
  // olhos de fenda
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.95; c.fillStyle = '#ffd050';
  c.beginPath(); c.ellipse(S*0.1, -S*0.09, S*0.05, S*0.03, 0, 0, Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(S*0.1, S*0.09, S*0.05, S*0.03, 0, 0, Math.PI*2); c.fill();
  c.restore();
  // língua bífida (aparece em ciclos)
  const lph = ((t/16) % 170) / 170;
  if(lph < 0.25){
    const lk = Math.sin(lph/0.25*Math.PI);
    c.strokeStyle = '#ff4a5a'; c.lineWidth = Math.max(1, S*0.02); c.lineCap='round';
    c.beginPath(); c.moveTo(S*0.4, 0); c.lineTo(S*0.4 + S*0.18*lk, 0); c.stroke();
    c.beginPath(); c.moveTo(S*0.4 + S*0.18*lk, 0); c.lineTo(S*0.4 + S*0.26*lk, -S*0.045*lk); c.stroke();
    c.beginPath(); c.moveTo(S*0.4 + S*0.18*lk, 0); c.lineTo(S*0.4 + S*0.26*lk, S*0.045*lk); c.stroke();
  }
  c.restore();
  // brasas caindo do corpo
  c.save(); c.globalCompositeOperation='lighter';
  for(let i=0;i<3;i++){
    const ph = ((t/18 + i*55) % 150) / 150;
    const seg = pts[2 + i*3] || pts[SEG-1];
    c.globalAlpha = (1-ph)*0.5; c.fillStyle = '#ff9a40';
    c.beginPath(); c.arc(seg[0], seg[1] + ph*S*0.3, 1.6*(1-ph*0.5), 0, Math.PI*2); c.fill();
  }
  c.restore();
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawDragonete(c, sx, sy, ts, p){       // CRIA DE KREZATH: dragonete bípede alado
  const t = performance.now();
  const N = p.size || 2, S = ts * N * 0.5;
  const cx = sx + N*ts/2, cy = sy + N*ts/2;
  const bob = Math.sin(t/380 + (p.x||0)) * S*0.06;    // paira quicando (filhote elétrico)
  c.save();
  c.fillStyle='rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(cx, cy+S*0.6, S*0.5, S*0.16, 0, 0, Math.PI*2); c.fill();
  c.translate(cx, cy + bob);
  // asinhas de morcego batendo RÁPIDO
  const flap = Math.sin(t/130) * 0.45;
  for(const sgn of [-1, 1]){
    c.save(); c.rotate(sgn * (0.25 + flap * sgn * 0));
    c.fillStyle = 'rgba(58,20,20,0.9)';
    c.beginPath();
    c.moveTo(sgn*S*0.14, -S*0.12);
    c.quadraticCurveTo(sgn*S*0.62, -S*(0.55 + flap*0.25), sgn*S*0.88, -S*(0.3 + flap*0.3));
    c.quadraticCurveTo(sgn*S*0.6, -S*0.08, sgn*S*0.3, S*0.04);
    c.closePath(); c.fill();
    c.strokeStyle = '#2a0e0e'; c.lineWidth = 1; c.stroke();
    c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.4;
    c.strokeStyle = '#ff7a30'; c.beginPath();
    c.moveTo(sgn*S*0.18, -S*0.1); c.quadraticCurveTo(sgn*S*0.55, -S*(0.4 + flap*0.2), sgn*S*0.82, -S*(0.28 + flap*0.28)); c.stroke();
    c.restore(); c.restore();
  }
  // cauda com pontinha
  const tw2 = Math.sin(t/320)*S*0.12;
  c.strokeStyle = '#5a1e1e'; c.lineWidth = Math.max(2, S*0.08); c.lineCap='round';
  c.beginPath(); c.moveTo(0, S*0.3); c.quadraticCurveTo(-S*0.3, S*0.55 + tw2, -S*0.55, S*0.42 + tw2); c.stroke();
  c.fillStyle = '#d8cbb4'; c.save(); c.translate(-S*0.55, S*0.42 + tw2); c.rotate(-0.6);
  c.beginPath(); c.moveTo(0,0); c.lineTo(-S*0.1, S*0.04); c.lineTo(-S*0.02, -S*0.1); c.closePath(); c.fill(); c.restore();
  // corpo pequeno ereto com gradiente + barriga
  const bg = c.createRadialGradient(0, 0, 0, 0, 0, S*0.45);
  bg.addColorStop(0, '#7a2c24'); bg.addColorStop(1, '#4a1616');
  c.fillStyle = bg; c.beginPath(); c.ellipse(0, S*0.05, S*0.3, S*0.38, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = '#a85838'; c.beginPath(); c.ellipse(0, S*0.14, S*0.17, S*0.24, 0, 0, Math.PI*2); c.fill();
  // patinhas
  c.strokeStyle = '#3a1010'; c.lineWidth = Math.max(1.6, S*0.06); c.lineCap='round';
  c.beginPath(); c.moveTo(-S*0.12, S*0.38); c.lineTo(-S*0.16, S*0.56); c.stroke();
  c.beginPath(); c.moveTo(S*0.12, S*0.38); c.lineTo(S*0.16, S*0.56); c.stroke();
  // cabecinha com focinho e mini chifres
  c.fillStyle = '#6a2420'; c.beginPath(); c.ellipse(0, -S*0.38, S*0.22, S*0.19, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = '#7a2c24'; c.beginPath(); c.ellipse(S*0.14, -S*0.36, S*0.13, S*0.09, 0, 0, Math.PI*2); c.fill();
  c.strokeStyle = '#d8cbb4'; c.lineWidth = Math.max(1.2, S*0.04); c.lineCap='round';
  c.beginPath(); c.moveTo(-S*0.08, -S*0.52); c.lineTo(-S*0.16, -S*0.66); c.stroke();
  c.beginPath(); c.moveTo(S*0.02, -S*0.54); c.lineTo(-S*0.02, -S*0.7); c.stroke();
  // olhão de filhote (brasa)
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.95;
  c.fillStyle = '#ffb040'; c.beginPath(); c.arc(S*0.06, -S*0.4, S*0.055, 0, Math.PI*2); c.fill();
  c.fillStyle = '#fff'; c.globalAlpha = 0.8; c.beginPath(); c.arc(S*0.075, -S*0.415, S*0.018, 0, Math.PI*2); c.fill();
  c.restore();
  // baforadinha de brasa da boca (ciclo)
  const ph = ((t/16 + (p.x||0)*31) % 140) / 140;
  if(ph < 0.3){ c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = (0.3-ph)/0.3*0.8;
    c.fillStyle = '#ff9a40'; c.beginPath(); c.arc(S*0.28 + ph*S*0.5, -S*0.36, 2.2*(1-ph), 0, Math.PI*2); c.fill(); c.restore(); }
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

// ===========================================================================
//  COSTA DE MARAVAI: um mapa, dois mundos (a LINHA gy decide o bioma)
// ===========================================================================
function drawCostaTile(c, ch, px, py, ts, gx, gy){
  const t = performance.now();
  const praia = gy >= 186, trans = gy >= 159 && gy < 186;
  const chao = () => {
    if(praia || (trans && ch === ':')){                       // AREIA clara
      c.fillStyle = rng(gx,gy,1) > 0.5 ? '#e8d8a8' : '#e0cf9c'; c.fillRect(px, py, ts, ts);
      c.fillStyle = 'rgba(200,180,130,0.5)';
      for(let i=0;i<3;i++) c.fillRect(px + rng(gx,gy,i+3)*ts, py + rng(gx,gy,i+7)*ts, 1.6, 1.2);
      if(rng(gx,gy,11) > 0.9){                                // conchinha na areia
        c.fillStyle = rng(gx,gy,12) > 0.5 ? '#f0d8e8' : '#f6f0e0';
        c.beginPath(); c.arc(px + rng(gx,gy,13)*ts, py + rng(gx,gy,14)*ts, 1.6, 0, Math.PI); c.fill();
      }
    } else {                                                  // CAPIM da savana
      c.fillStyle = rng(gx,gy,1) > 0.5 ? '#b8a050' : '#ac9648'; c.fillRect(px, py, ts, ts);
      c.strokeStyle = 'rgba(140,120,60,0.6)'; c.lineWidth = 1;
      for(let i=0;i<3;i++){
        const bx2 = px + rng(gx,gy,i+3)*ts, by2 = py + rng(gx,gy,i+7)*ts;
        c.beginPath(); c.moveTo(bx2, by2); c.lineTo(bx2 + 1, by2 - 3); c.stroke();
      }
    }
  };
  switch(ch){
    case '.': case ':': case '+': chao(); return true;
    case ',': {
      chao();
      if(praia){ c.fillStyle = 'rgba(214,196,150,0.8)';       // areia fofa (montinhos)
        c.beginPath(); c.ellipse(px+ts*0.5, py+ts*0.6, ts*0.3, ts*0.14, 0, 0, Math.PI*2); c.fill();
      } else {                                                // capim ALTO balançando
        c.strokeStyle = '#8a7a34'; c.lineWidth = 1.3;
        const sw = Math.sin(t/900 + gx)*1.5;
        for(let i=0;i<4;i++){
          const bx2 = px + (0.2 + i*0.2)*ts;
          c.beginPath(); c.moveTo(bx2, py+ts*0.9); c.quadraticCurveTo(bx2 + sw, py+ts*0.5, bx2 + sw*1.6, py+ts*0.25); c.stroke();
        }
      }
      return true; }
    case 'd': {                                               // terra batida / areia molhada
      c.fillStyle = praia ? '#c9b088' : '#9a7a4a'; c.fillRect(px, py, ts, ts);
      c.fillStyle = praia ? 'rgba(170,150,110,0.6)' : 'rgba(120,95,58,0.6)';
      for(let i=0;i<3;i++) c.fillRect(px + rng(gx,gy,i+2)*ts, py + rng(gx,gy,i+5)*ts, 2.4, 1.4);
      return true; }
    case 'W': {                                               // ÁGUA: lagoa ou MAR com ondas
      const deep = Math.min(1, Math.max(0, (gy - 258) / 30));
      const g1 = praia ? `rgb(${40+20*(1-deep)},${120+40*(1-deep)},${170+30*(1-deep)})` : '#3a7a9a';
      c.fillStyle = g1; c.fillRect(px, py, ts, ts);
      const w1 = Math.sin(t/800 + gx*0.9 + gy*1.4)*0.5 + 0.5;
      c.save(); c.globalAlpha = 0.2 + 0.15*w1; c.strokeStyle = '#cfe8f0'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(px, py + ts*(0.3 + 0.2*w1));
      c.quadraticCurveTo(px+ts/2, py + ts*(0.2 + 0.2*w1), px+ts, py + ts*(0.3 + 0.2*w1)); c.stroke();
      c.restore();
      if(praia && gy <= 264){                                 // espuma na linha da costa
        const f = Math.sin(t/1100 + gx*0.7)*0.5 + 0.5;
        c.save(); c.globalAlpha = 0.35 + 0.3*f; c.fillStyle = '#f0f6f8';
        c.beginPath(); c.ellipse(px+ts/2, py + ts*0.25, ts*0.42, ts*0.1 + f*2, 0, 0, Math.PI*2); c.fill(); c.restore();
      }
      return true; }
    case 'T': {                                               // acácia (savana) ou COQUEIRO (praia)
      chao();
      if(praia){
        const lean = (rng(gx,gy,20) - 0.5) * 0.5;
        c.strokeStyle = '#8a6a44'; c.lineWidth = Math.max(2, ts*0.1); c.lineCap='round';
        c.beginPath(); c.moveTo(px+ts*0.5, py+ts*0.95);
        c.quadraticCurveTo(px+ts*(0.5+lean*0.5), py+ts*0.5, px+ts*(0.5+lean), py+ts*0.18); c.stroke();
        const tx = px+ts*(0.5+lean), ty = py+ts*0.18;
        c.strokeStyle = '#3a7a3a'; c.lineWidth = Math.max(1.6, ts*0.06);
        for(let i=0;i<5;i++){
          const a = -Math.PI/2 + (i-2)*0.55 + Math.sin(t/1400+gx)*0.05;
          c.beginPath(); c.moveTo(tx, ty);
          c.quadraticCurveTo(tx + Math.cos(a)*ts*0.3, ty + Math.sin(a)*ts*0.3 - 2, tx + Math.cos(a)*ts*0.45, ty + Math.sin(a)*ts*0.42 + 3); c.stroke();
        }
        c.fillStyle = '#6a4a2a';                              // cocos
        c.beginPath(); c.arc(tx-2, ty+3, 2, 0, Math.PI*2); c.fill();
        c.beginPath(); c.arc(tx+2, ty+3.5, 2, 0, Math.PI*2); c.fill();
      } else {                                                // acácia de copa CHATA
        c.strokeStyle = '#5a4028'; c.lineWidth = Math.max(2, ts*0.09); c.lineCap='round';
        c.beginPath(); c.moveTo(px+ts*0.5, py+ts*0.95); c.lineTo(px+ts*0.44, py+ts*0.4); c.stroke();
        c.lineWidth = Math.max(1.2, ts*0.045);
        c.beginPath(); c.moveTo(px+ts*0.45, py+ts*0.5); c.lineTo(px+ts*0.22, py+ts*0.32); c.stroke();
        c.beginPath(); c.moveTo(px+ts*0.45, py+ts*0.46); c.lineTo(px+ts*0.72, py+ts*0.3); c.stroke();
        c.fillStyle = '#6a7a30'; c.beginPath();                // copa achatada
        c.ellipse(px+ts*0.48, py+ts*0.26, ts*0.42, ts*0.13, 0, 0, Math.PI*2); c.fill();
        c.fillStyle = '#7a8a3a'; c.beginPath();
        c.ellipse(px+ts*0.44, py+ts*0.21, ts*0.32, ts*0.09, 0, 0, Math.PI*2); c.fill();
      }
      return true; }
    case '^': {                                               // rochedo
      chao();
      c.fillStyle = praia ? '#a89a88' : '#8a7a68'; c.beginPath();
      c.moveTo(px+ts*0.5, py+ts*0.15); c.lineTo(px+ts*0.88, py+ts*0.85);
      c.lineTo(px+ts*0.12, py+ts*0.85); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath();
      c.moveTo(px+ts*0.5, py+ts*0.15); c.lineTo(px+ts*0.64, py+ts*0.5); c.lineTo(px+ts*0.4, py+ts*0.5); c.closePath(); c.fill();
      return true; }
    case 'Y': {                                               // cupinzeiro da savana
      chao();
      c.fillStyle = '#9a6a3a'; c.beginPath();
      c.moveTo(px+ts*0.5, py+ts*0.1);
      c.quadraticCurveTo(px+ts*0.78, py+ts*0.5, px+ts*0.7, py+ts*0.9);
      c.lineTo(px+ts*0.3, py+ts*0.9);
      c.quadraticCurveTo(px+ts*0.22, py+ts*0.5, px+ts*0.5, py+ts*0.1); c.fill();
      c.fillStyle = 'rgba(60,40,20,0.5)';
      c.beginPath(); c.arc(px+ts*0.45, py+ts*0.45, 1.6, 0, Math.PI*2); c.fill();
      c.beginPath(); c.arc(px+ts*0.55, py+ts*0.65, 1.4, 0, Math.PI*2); c.fill();
      return true; }
    case '#': {                                               // casa de pescador: madeira + palha
      c.fillStyle = '#8a6a44'; c.fillRect(px, py, ts, ts);
      c.strokeStyle = '#5a4228'; c.lineWidth = 1;
      for(let i=1;i<4;i++){ c.beginPath(); c.moveTo(px, py+ts*i/4); c.lineTo(px+ts, py+ts*i/4); c.stroke(); }
      c.fillStyle = '#c9a86a';                                 // beiral de palha no topo
      c.fillRect(px, py, ts, ts*0.22);
      c.strokeStyle = '#a8854a';
      for(let i=0;i<5;i++){ c.beginPath(); c.moveTo(px+ts*i/5+2, py); c.lineTo(px+ts*i/5, py+ts*0.22); c.stroke(); }
      return true; }
    case '=': {                                               // PÍER: tábuas sobre o mar
      c.fillStyle = '#3a7a9a'; c.fillRect(px, py, ts, ts);
      c.fillStyle = '#9a7a4e'; c.fillRect(px+1, py, ts-2, ts);
      c.strokeStyle = '#6a5232'; c.lineWidth = 1;
      for(let i=1;i<4;i++){ c.beginPath(); c.moveTo(px+1, py+ts*i/4); c.lineTo(px+ts-1, py+ts*i/4); c.stroke(); }
      c.fillStyle = 'rgba(40,28,16,0.6)';
      c.fillRect(px+2, py+2, 2, 2); c.fillRect(px+ts-5, py+ts-5, 2, 2);
      return true; }
    case 'b': {                                               // barco encalhado
      chao();
      c.fillStyle = '#7a5232'; c.beginPath();
      c.moveTo(px+ts*0.08, py+ts*0.4);
      c.quadraticCurveTo(px+ts*0.5, py+ts*0.85, px+ts*0.92, py+ts*0.4);
      c.lineTo(px+ts*0.8, py+ts*0.35); c.lineTo(px+ts*0.2, py+ts*0.35); c.closePath(); c.fill();
      c.strokeStyle = '#4a3018'; c.lineWidth = 1.2; c.stroke();
      c.strokeStyle = '#5a4228';
      c.beginPath(); c.moveTo(px+ts*0.5, py+ts*0.35); c.lineTo(px+ts*0.5, py+ts*0.08); c.stroke();
      return true; }
    case 'j': {                                               // rede de pesca armada
      chao();
      c.strokeStyle = '#5a4a30'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(px+ts*0.15, py+ts*0.85); c.lineTo(px+ts*0.15, py+ts*0.2); c.stroke();
      c.beginPath(); c.moveTo(px+ts*0.85, py+ts*0.85); c.lineTo(px+ts*0.85, py+ts*0.2); c.stroke();
      c.strokeStyle = 'rgba(220,210,180,0.7)'; c.lineWidth = 0.8;
      for(let i=0;i<4;i++){
        c.beginPath(); c.moveTo(px+ts*0.15, py+ts*(0.25+i*0.15));
        c.quadraticCurveTo(px+ts*0.5, py+ts*(0.3+i*0.15), px+ts*0.85, py+ts*(0.25+i*0.15)); c.stroke();
      }
      for(let i=1;i<4;i++){ c.beginPath(); c.moveTo(px+ts*(0.15+i*0.175), py+ts*0.25); c.lineTo(px+ts*(0.15+i*0.175), py+ts*0.72); c.stroke(); }
      return true; }
    case 'F': {                                               // fogueira da vila (viva!)
      chao();
      c.fillStyle = '#6a5a48';
      for(let i=0;i<5;i++){ const a2 = i*Math.PI*2/5;
        c.beginPath(); c.arc(px+ts*0.5 + Math.cos(a2)*ts*0.24, py+ts*0.62 + Math.sin(a2)*ts*0.12, 2, 0, Math.PI*2); c.fill(); }
      c.save(); c.globalCompositeOperation='lighter';
      for(let i=0;i<3;i++){
        const fl = 0.6 + 0.4*Math.sin(t/150 + i*2.1);
        c.globalAlpha = 0.8*fl;
        c.fillStyle = i===0 ? '#ffd070' : (i===1 ? '#ff9a30' : '#ff6a18');
        c.beginPath();
        c.moveTo(px+ts*0.38, py+ts*0.6);
        c.quadraticCurveTo(px+ts*0.5 + Math.sin(t/120+i)*2, py+ts*(0.18 + i*0.08), px+ts*0.62, py+ts*0.6);
        c.closePath(); c.fill();
      }
      c.restore();
      return true; }
  }
  return false;
}

// ===========================================================================
//  UMBRAVAL: a mata da NOITE ETERNA (escura, fria, e os cogumelos são as estrelas)
// ===========================================================================
function drawUmbravalTile(c, ch, px, py, ts, gx, gy){
  const t = performance.now();
  const chao = () => {
    c.fillStyle = rng(gx,gy,1) > 0.5 ? '#141824' : '#10141e'; c.fillRect(px, py, ts, ts);
    c.fillStyle = 'rgba(40,50,72,0.5)';
    for(let i=0;i<2;i++) c.fillRect(px + rng(gx,gy,i+3)*ts, py + rng(gx,gy,i+6)*ts, 2, 1.3);
  };
  switch(ch){
    case '.': case '+': chao(); return true;
    case ',': {                                               // folhas mortas azuladas
      chao();
      c.fillStyle = 'rgba(60,70,110,0.55)';
      for(let i=0;i<4;i++){
        c.save(); c.translate(px + rng(gx,gy,i+10)*ts, py + rng(gx,gy,i+14)*ts);
        c.rotate(rng(gx,gy,i+18)*6.28);
        c.beginPath(); c.ellipse(0, 0, 2.4, 1.2, 0, 0, Math.PI*2); c.fill(); c.restore();
      }
      return true; }
    case 'T': {                                               // árvore da noite: alta, densa, fria
      chao();
      c.strokeStyle = '#0a0c14'; c.lineWidth = Math.max(2.4, ts*0.13); c.lineCap='round';
      c.beginPath(); c.moveTo(px+ts*0.5, py+ts); c.lineTo(px+ts*0.48, py+ts*0.3); c.stroke();
      c.fillStyle = '#161c2e'; c.beginPath();                  // copa densa (camadas)
      c.ellipse(px+ts*0.5, py+ts*0.3, ts*0.46, ts*0.34, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = '#1c2438'; c.beginPath();
      c.ellipse(px+ts*0.42, py+ts*0.2, ts*0.3, ts*0.22, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = '#10141f'; c.beginPath();
      c.ellipse(px+ts*0.62, py+ts*0.4, ts*0.26, ts*0.18, 0, 0, Math.PI*2); c.fill();
      return true; }
    case 'c': {                                               // COGUMELO LUMINOSO (a estrela do chão)
      chao();
      const gl = 0.55 + 0.45*Math.sin(t/700 + gx*3 + gy*5);
      c.strokeStyle = '#c9d8e8'; c.lineWidth = Math.max(1.2, ts*0.05); c.lineCap='round';
      c.beginPath(); c.moveTo(px+ts*0.5, py+ts*0.8); c.lineTo(px+ts*0.5, py+ts*0.5); c.stroke();
      c.save(); c.globalCompositeOperation='lighter';
      c.globalAlpha = 0.5*gl;                                  // halo
      const hg = c.createRadialGradient(px+ts*0.5, py+ts*0.45, 0, px+ts*0.5, py+ts*0.45, ts*0.55);
      hg.addColorStop(0, '#6ad8ff'); hg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = hg; c.beginPath(); c.arc(px+ts*0.5, py+ts*0.45, ts*0.55, 0, Math.PI*2); c.fill();
      c.globalAlpha = 0.95;                                    // chapéu brilhante
      c.fillStyle = gl > 0.7 ? '#8ae8ff' : '#5ac0ea';
      c.beginPath(); c.ellipse(px+ts*0.5, py+ts*0.48, ts*0.2, ts*0.13, 0, Math.PI, 0); c.fill();
      c.globalAlpha = 0.8*gl; c.fillStyle = '#d0f4ff';
      c.beginPath(); c.arc(px+ts*0.44, py+ts*0.44, 1.2, 0, Math.PI*2); c.fill();
      c.restore();
      return true; }
    case '^': {                                               // pedra com musgo frio
      chao();
      c.fillStyle = '#1e2434'; c.beginPath();
      c.moveTo(px+ts*0.5, py+ts*0.2); c.lineTo(px+ts*0.85, py+ts*0.85);
      c.lineTo(px+ts*0.15, py+ts*0.85); c.closePath(); c.fill();
      c.fillStyle = 'rgba(60,110,110,0.45)';
      c.beginPath(); c.ellipse(px+ts*0.45, py+ts*0.7, ts*0.15, ts*0.06, 0, 0, Math.PI*2); c.fill();
      return true; }
  }
  return false;
}

// ===========================================================================
//  FAUNA DA COSTA: leão de juba, avestruz, caranguejo e medusa
// ===========================================================================
function drawLeao(c, sx, sy, ts, p){            // LEÃO ERMAL (e o MARAJÁ, o Leão Branco)
  const t = performance.now();
  const boss = (p.mtype === 'maraja');
  const N = p.size || 2, S = ts * N * 0.5;
  const cx = sx + N*ts/2, cy = sy + N*ts/2;
  const d = _dirVec(p.facing || 'down'); const ang = Math.atan2(d[1], d[0]);
  const moving = !!p._moving;
  const cyc = ((p.walk||0) % WALK_CYCLE) / WALK_CYCLE;
  const bob = moving ? -Math.abs(Math.sin(cyc*Math.PI*2))*1.6 : Math.sin(t/700)*0.6;
  const BODY = boss ? '#e8e0cc' : '#c9a05a';
  const BODY2 = boss ? '#d0c6ae' : '#b08a48';
  const MANE = boss ? '#f6f0e0' : '#7a5228';
  const enr = p._enraged;
  c.save();
  if(boss && enr){
    const pl = 0.3 + 0.14*Math.abs(Math.sin(t/220));
    const au = c.createRadialGradient(cx, cy, ts*0.3, cx, cy, S*1.5);
    au.addColorStop(0, 'rgba(255,220,140,'+pl+')'); au.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = au; c.fillRect(sx - ts, sy - ts, N*ts + ts*2, N*ts + ts*2);
  }
  c.fillStyle='rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(cx, cy+S*0.55, S*0.8, S*0.22, 0, 0, Math.PI*2); c.fill();
  c.translate(cx, cy + bob); c.rotate(ang);
  // cauda com tufo
  const twl = Math.sin(t/420)*S*0.12;
  c.strokeStyle = BODY2; c.lineWidth = Math.max(2, S*0.06); c.lineCap='round';
  c.beginPath(); c.moveTo(-S*0.6, 0); c.quadraticCurveTo(-S*0.95, twl, -S*1.1, -S*0.12 + twl); c.stroke();
  c.fillStyle = MANE; c.beginPath(); c.arc(-S*1.1, -S*0.12 + twl, S*0.07, 0, Math.PI*2); c.fill();
  // patas musculosas
  c.strokeStyle = BODY2; c.lineWidth = Math.max(2.6, S*0.1); c.lineCap='round';
  const sw = moving ? Math.sin(cyc*Math.PI*2)*S*0.14 : 0;
  c.beginPath(); c.moveTo(S*0.32, S*0.18); c.lineTo(S*0.4 + sw, S*0.42); c.stroke();
  c.beginPath(); c.moveTo(S*0.32, -S*0.18); c.lineTo(S*0.4 - sw, -S*0.42); c.stroke();
  c.beginPath(); c.moveTo(-S*0.42, S*0.18); c.lineTo(-S*0.5 - sw, S*0.42); c.stroke();
  c.beginPath(); c.moveTo(-S*0.42, -S*0.18); c.lineTo(-S*0.5 + sw, -S*0.42); c.stroke();
  // corpo felino com gradiente
  const bg = c.createLinearGradient(-S*0.6, 0, S*0.6, 0);
  bg.addColorStop(0, BODY2); bg.addColorStop(1, BODY);
  c.fillStyle = bg; c.beginPath();
  c.ellipse(-S*0.05, 0, S*0.62, S*0.3, 0, 0, Math.PI*2); c.fill();
  // JUBA: coroa de tufos em volta da cabeça
  const hx = S*0.5, hy = 0;
  c.fillStyle = MANE;
  for(let i=0;i<10;i++){
    const a = i*Math.PI*2/10 + Math.sin(t/1600)*0.06;
    const mr = S*(0.3 + (i%2)*0.06);
    c.beginPath();
    c.ellipse(hx + Math.cos(a)*mr*0.7, hy + Math.sin(a)*mr*0.7, S*0.14, S*0.1, a, 0, Math.PI*2); c.fill();
  }
  c.fillStyle = boss ? '#e0d6ba' : '#6a4620';                  // sombra interna da juba
  c.beginPath(); c.arc(hx, hy, S*0.26, 0, Math.PI*2); c.fill();
  // cabeça
  c.fillStyle = BODY; c.beginPath(); c.ellipse(hx + S*0.05, hy, S*0.2, S*0.17, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = BODY2; c.beginPath(); c.ellipse(hx + S*0.18, hy, S*0.1, S*0.07, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = '#2a1c10'; c.beginPath(); c.arc(hx + S*0.26, hy, S*0.028, 0, Math.PI*2); c.fill();
  // olhos
  c.fillStyle = enr ? '#ff5a20' : (boss ? '#c9a030' : '#3a2a14');
  c.beginPath(); c.arc(hx + S*0.1, -S*0.07, S*0.028, 0, Math.PI*2); c.fill();
  c.beginPath(); c.arc(hx + S*0.1, S*0.07, S*0.028, 0, Math.PI*2); c.fill();
  c.restore();
  if(boss){
    c.save(); c.font = '800 9px Cinzel, serif'; c.textAlign='center'; c.textBaseline='bottom';
    const lbl = '👑 O LEÃO BRANCO', tw = c.measureText(lbl).width + 10, tagY = sy - 14;
    c.fillStyle = 'rgba(30,24,8,0.92)'; roundRect(c, cx - tw/2, tagY-12, tw, 12, 3); c.fill();
    c.fillStyle = '#f0e0a8'; c.fillText(lbl, cx, tagY-2); c.restore();
  }
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawAvestruz(c, sx, sy, ts, p){        // AVESTRUZ BRAVA: bípede pescoçudo e furioso
  const t = performance.now();
  const N = p.size || 2, S = ts * N * 0.5;
  const cx = sx + N*ts/2, cy = sy + N*ts/2;
  const moving = !!p._moving;
  const cyc = ((p.walk||0) % WALK_CYCLE) / WALK_CYCLE;
  const bob = moving ? -Math.abs(Math.sin(cyc*Math.PI*4))*2 : Math.sin(t/500)*0.8;
  c.save();
  c.fillStyle='rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(cx, cy+S*0.62, S*0.42, S*0.14, 0, 0, Math.PI*2); c.fill();
  c.translate(cx, cy + bob);
  // pernas COMPRIDAS (alterna no passo)
  const st = moving ? Math.sin(cyc*Math.PI*4)*S*0.2 : 0;
  c.strokeStyle = '#c9a878'; c.lineWidth = Math.max(1.8, S*0.05); c.lineCap='round';
  c.beginPath(); c.moveTo(-S*0.08, S*0.12); c.lineTo(-S*0.12 + st, S*0.62); c.stroke();
  c.beginPath(); c.moveTo(S*0.08, S*0.12); c.lineTo(S*0.12 - st, S*0.62); c.stroke();
  // corpo bolota de penas
  const bg = c.createRadialGradient(0, 0, 0, 0, 0, S*0.4);
  bg.addColorStop(0, '#4a4048'); bg.addColorStop(1, '#2e2830');
  c.fillStyle = bg; c.beginPath(); c.ellipse(0, 0, S*0.36, S*0.28, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = '#e8e0d8';                                     // penas brancas na cauda
  c.beginPath(); c.ellipse(-S*0.3, 0, S*0.14, S*0.12, 0.4, 0, Math.PI*2); c.fill();
  // pescoço LONGO oscilando + cabeça pequena
  const nod = Math.sin(t/300)*S*0.06;
  c.strokeStyle = '#d8b890'; c.lineWidth = Math.max(2, S*0.07);
  c.beginPath(); c.moveTo(S*0.2, -S*0.1);
  c.quadraticCurveTo(S*0.34, -S*0.5, S*0.3 + nod, -S*0.78); c.stroke();
  c.fillStyle = '#d8b890'; c.beginPath(); c.arc(S*0.3 + nod, -S*0.82, S*0.1, 0, Math.PI*2); c.fill();
  c.fillStyle = '#e8a030';                                     // bico
  c.beginPath(); c.moveTo(S*0.38 + nod, -S*0.84); c.lineTo(S*0.52 + nod, -S*0.8); c.lineTo(S*0.38 + nod, -S*0.77); c.closePath(); c.fill();
  c.fillStyle = '#1a1410';                                     // olho bravo
  c.beginPath(); c.arc(S*0.32 + nod, -S*0.85, S*0.025, 0, Math.PI*2); c.fill();
  c.strokeStyle = '#1a1410'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(S*0.26 + nod, -S*0.9); c.lineTo(S*0.36 + nod, -S*0.87); c.stroke();
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawCaranguejo(c, sx, sy, ts, p){      // CARANGUEJO GIGANTE: casco e GARRAS
  const t = performance.now();
  const N = p.size || 2, S = ts * N * 0.5;
  const cx = sx + N*ts/2, cy = sy + N*ts/2;
  const bob = Math.sin(t/600 + (p.x||0)) * S*0.03;
  const snip = 0.14 + 0.12*Math.sin(t/280);                    // pinças abrindo/fechando
  c.save();
  c.fillStyle='rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(cx, cy+S*0.42, S*0.7, S*0.18, 0, 0, Math.PI*2); c.fill();
  c.translate(cx, cy + bob);
  // 6 perninhas articuladas
  c.strokeStyle = '#a84a2e'; c.lineWidth = Math.max(1.8, S*0.055); c.lineCap='round';
  for(const sgn of [-1, 1]) for(let i=0;i<3;i++){
    const a = sgn * (0.5 + i*0.42);
    const kx = Math.cos(a)*S*0.42*sgn* (sgn>0?1:-1), ky = Math.sin(Math.abs(a))*S*0.3 * (i-1>=0?1:1);
    const bx2 = sgn*S*(0.34 + i*0.05), by2 = S*(0.05 + i*0.1) * (1);
    const wig = Math.sin(t/240 + i*2 + (sgn>0?0:3))*S*0.05;
    c.beginPath(); c.moveTo(sgn*S*0.3, S*(0.02 + i*0.08));
    c.lineTo(sgn*S*0.55, S*(0.12 + i*0.12) + wig);
    c.lineTo(sgn*S*0.68, S*(0.3 + i*0.1) + wig); c.stroke();
  }
  // casco oval com gradiente
  const bg = c.createRadialGradient(-S*0.1, -S*0.12, 0, 0, 0, S*0.55);
  bg.addColorStop(0, '#e06840'); bg.addColorStop(0.7, '#c04a28'); bg.addColorStop(1, '#8a2e18');
  c.fillStyle = bg; c.beginPath(); c.ellipse(0, 0, S*0.46, S*0.34, 0, 0, Math.PI*2); c.fill();
  c.strokeStyle = '#5a1c0e'; c.lineWidth = 1.2; c.stroke();
  c.strokeStyle = 'rgba(90,28,14,0.6)';                        // marcas do casco
  c.beginPath(); c.arc(0, -S*0.04, S*0.22, Math.PI*0.2, Math.PI*0.8); c.stroke();
  c.beginPath(); c.arc(0, S*0.04, S*0.3, Math.PI*1.25, Math.PI*1.75); c.stroke();
  // GARRAS enormes (abrindo e fechando)
  for(const sgn of [-1, 1]){
    const gx2 = sgn*S*0.52, gy2 = -S*0.22;
    c.strokeStyle = '#a84a2e'; c.lineWidth = Math.max(2.2, S*0.07);
    c.beginPath(); c.moveTo(sgn*S*0.3, -S*0.14); c.lineTo(gx2, gy2); c.stroke();
    c.fillStyle = '#d05830';
    c.save(); c.translate(gx2, gy2); c.rotate(sgn * -0.5);
    c.beginPath(); c.ellipse(0, 0, S*0.18, S*0.13, 0, 0, Math.PI*2); c.fill();
    c.strokeStyle = '#5a1c0e'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#e8784a';                                   // dedos da pinça
    c.beginPath(); c.moveTo(S*0.05, -S*0.05);
    c.quadraticCurveTo(sgn>0? S*0.3 : S*0.3, -S*(0.12+snip), S*0.32, -S*(0.02+snip*0.5));
    c.lineTo(S*0.12, S*0.0); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(S*0.05, S*0.05);
    c.quadraticCurveTo(S*0.3, S*(0.12+snip), S*0.32, S*(0.02+snip*0.5));
    c.lineTo(S*0.12, 0); c.closePath(); c.fill();
    c.restore();
  }
  // olhinhos em haste
  c.strokeStyle = '#5a1c0e'; c.lineWidth = Math.max(1.2, S*0.03);
  c.beginPath(); c.moveTo(-S*0.1, -S*0.3); c.lineTo(-S*0.12, -S*0.44); c.stroke();
  c.beginPath(); c.moveTo(S*0.1, -S*0.3); c.lineTo(S*0.12, -S*0.44); c.stroke();
  c.fillStyle = '#1a0e08';
  c.beginPath(); c.arc(-S*0.12, -S*0.46, S*0.04, 0, Math.PI*2); c.fill();
  c.beginPath(); c.arc(S*0.12, -S*0.46, S*0.04, 0, Math.PI*2); c.fill();
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

function drawMedusa(c, sx, sy, ts, p){          // MEDUSA DE AREIA: cúpula translúcida pulsante
  const t = performance.now();
  const N = p.size || 1, S = ts * Math.max(N, 1.4) * 0.5;
  const cx = sx + N*ts/2, cy = sy + N*ts/2;
  const puls = 0.9 + 0.12*Math.sin(t/500 + (p.x||0));
  const hover = Math.sin(t/700)*S*0.05;
  c.save();
  c.fillStyle='rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(cx, cy+S*0.5, S*0.45, S*0.12, 0, 0, Math.PI*2); c.fill();
  c.translate(cx, cy + hover);
  // tentáculos ondulando
  c.lineCap='round';
  for(let i=0;i<6;i++){
    const bx2 = (i-2.5)*S*0.14;
    const wig = Math.sin(t/260 + i*1.2)*S*0.08;
    c.strokeStyle = i%2 ? 'rgba(160,110,200,0.7)' : 'rgba(120,150,220,0.7)';
    c.lineWidth = Math.max(1.2, S*0.035);
    c.beginPath(); c.moveTo(bx2, S*0.05);
    c.quadraticCurveTo(bx2 + wig, S*0.3, bx2 + wig*1.8, S*0.52); c.stroke();
  }
  // cúpula translúcida (pulsando)
  c.save(); c.globalAlpha = 0.85;
  const bg = c.createRadialGradient(0, -S*0.12, 0, 0, -S*0.05, S*0.42*puls);
  bg.addColorStop(0, 'rgba(200,170,240,0.9)');
  bg.addColorStop(0.7, 'rgba(140,110,210,0.75)');
  bg.addColorStop(1, 'rgba(90,80,180,0.35)');
  c.fillStyle = bg; c.beginPath();
  c.ellipse(0, -S*0.05, S*0.4*puls, S*0.3*puls, 0, Math.PI, 0); c.fill();
  c.beginPath(); c.ellipse(0, -S*0.05, S*0.4*puls, S*0.1*puls, 0, 0, Math.PI); c.fill();
  c.restore();
  // brilho interno venenoso
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.4 + 0.3*Math.sin(t/380);
  c.fillStyle = '#c9a0ff'; c.beginPath();
  c.ellipse(0, -S*0.1, S*0.14, S*0.09, 0, 0, Math.PI*2); c.fill(); c.restore();
  // pontinhos na borda da cúpula
  c.fillStyle = 'rgba(230,210,255,0.8)';
  for(let i=0;i<5;i++){ const a = Math.PI + i*Math.PI/4;
    c.beginPath(); c.arc(Math.cos(a)*S*0.38*puls, -S*0.05 + Math.sin(a)*S*0.26*puls, 1.1, 0, Math.PI*2); c.fill(); }
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

// ===========================================================================
//  VÉSPERA, A CIDADE MORTA: calçamento rachado, ruínas góticas, lampiões mortos
// ===========================================================================
var worldNodes = [];

function drawVesperaTile(c, ch, px, py, ts, gx, gy){
  const t = performance.now();
  const chao = () => {
    c.fillStyle = rng(gx,gy,1) > 0.5 ? '#2a2430' : '#241f2a'; c.fillRect(px, py, ts, ts);
    c.strokeStyle = 'rgba(12,10,16,0.7)'; c.lineWidth = 1;      // juntas do calçamento
    if(rng(gx,gy,2) > 0.5){ c.beginPath(); c.moveTo(px, py+ts/2); c.lineTo(px+ts, py+ts/2); c.stroke(); }
    if(rng(gx,gy,3) > 0.5){ c.beginPath(); c.moveTo(px+ts/2, py); c.lineTo(px+ts/2, py+ts); c.stroke(); }
    if(rng(gx,gy,4) > 0.82){                                    // rachadura
      c.strokeStyle = 'rgba(10,8,12,0.9)';
      c.beginPath(); c.moveTo(px+rng(gx,gy,5)*ts, py);
      c.lineTo(px+rng(gx,gy,6)*ts, py+ts*0.6); c.lineTo(px+rng(gx,gy,7)*ts, py+ts); c.stroke();
    }
  };
  switch(ch){
    case '.': case '+': chao(); return true;
    case ',': {                                                 // entulho
      chao();
      c.fillStyle = 'rgba(70,60,80,0.7)';
      for(let i=0;i<4;i++) c.fillRect(px+rng(gx,gy,i+8)*ts, py+rng(gx,gy,i+12)*ts, 2.4, 1.8);
      return true; }
    case 'd': {                                                 // cinza acumulada
      c.fillStyle = '#332c38'; c.fillRect(px, py, ts, ts);
      c.fillStyle = 'rgba(90,80,100,0.4)';
      c.beginPath(); c.ellipse(px+ts*0.5, py+ts*0.55, ts*0.32, ts*0.18, 0, 0, Math.PI*2); c.fill();
      return true; }
    case '#': {                                                 // parede gótica arruinada
      c.fillStyle = '#3c3444'; c.fillRect(px, py, ts, ts);
      c.strokeStyle = '#241f2a'; c.lineWidth = 1;               // blocos de pedra
      for(let i=1;i<3;i++){ c.beginPath(); c.moveTo(px, py+ts*i/3); c.lineTo(px+ts, py+ts*i/3); c.stroke(); }
      c.beginPath(); c.moveTo(px+ts*0.5, py); c.lineTo(px+ts*0.5, py+ts/3); c.stroke();
      c.beginPath(); c.moveTo(px+ts*0.25, py+ts/3); c.lineTo(px+ts*0.25, py+ts*2/3); c.stroke();
      c.beginPath(); c.moveTo(px+ts*0.75, py+ts/3); c.lineTo(px+ts*0.75, py+ts*2/3); c.stroke();
      c.fillStyle = 'rgba(140,40,60,0.10)';                     // mancha antiga
      if(rng(gx,gy,9) > 0.7) c.fillRect(px, py+ts*0.5, ts, ts*0.5);
      c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(px, py, ts, 2);
      return true; }
    case '^': {                                                 // escombro
      chao();
      c.fillStyle = '#443a4c'; c.beginPath();
      c.moveTo(px+ts*0.5, py+ts*0.25); c.lineTo(px+ts*0.82, py+ts*0.82);
      c.lineTo(px+ts*0.18, py+ts*0.82); c.closePath(); c.fill();
      c.fillStyle = '#332c38'; c.beginPath();
      c.moveTo(px+ts*0.3, py+ts*0.5); c.lineTo(px+ts*0.5, py+ts*0.82); c.lineTo(px+ts*0.12, py+ts*0.82);
      c.closePath(); c.fill();
      return true; }
    case 'T': {                                                 // árvore morta retorcida
      chao();
      c.strokeStyle = '#1a1620'; c.lineWidth = Math.max(2, ts*0.09); c.lineCap='round';
      c.beginPath(); c.moveTo(px+ts*0.5, py+ts*0.95);
      c.quadraticCurveTo(px+ts*0.4, py+ts*0.5, px+ts*0.55, py+ts*0.2); c.stroke();
      c.lineWidth = Math.max(1.2, ts*0.045);
      c.beginPath(); c.moveTo(px+ts*0.5, py+ts*0.5); c.lineTo(px+ts*0.22, py+ts*0.26); c.stroke();
      c.beginPath(); c.moveTo(px+ts*0.52, py+ts*0.38); c.lineTo(px+ts*0.8, py+ts*0.18); c.stroke();
      c.beginPath(); c.moveTo(px+ts*0.55, py+ts*0.2); c.lineTo(px+ts*0.62, py+ts*0.06); c.stroke();
      return true; }
    case 'Y': {                                                 // lampião apagado
      chao();
      c.strokeStyle = '#1c1824'; c.lineWidth = Math.max(1.6, ts*0.06); c.lineCap='round';
      c.beginPath(); c.moveTo(px+ts*0.5, py+ts*0.9); c.lineTo(px+ts*0.5, py+ts*0.2); c.stroke();
      c.strokeStyle = '#2a2432'; c.lineWidth = 1.4;
      c.strokeRect(px+ts*0.38, py+ts*0.08, ts*0.24, ts*0.2);
      const flick = rng(gx,gy,10) > 0.85 && Math.sin(t/900 + gx*7) > 0.92;
      c.fillStyle = flick ? 'rgba(255,180,90,0.8)' : 'rgba(30,26,40,0.9)';
      c.fillRect(px+ts*0.41, py+ts*0.11, ts*0.18, ts*0.14);
      return true; }
    case 'b': {                                                 // carroça quebrada
      chao();
      c.fillStyle = '#2e2836'; c.fillRect(px+ts*0.15, py+ts*0.35, ts*0.7, ts*0.3);
      c.strokeStyle = '#1a1620'; c.lineWidth = 1.4;
      c.beginPath(); c.arc(px+ts*0.3, py+ts*0.7, ts*0.14, 0, Math.PI*2); c.stroke();
      c.beginPath(); c.moveTo(px+ts*0.62, py+ts*0.65); c.lineTo(px+ts*0.78, py+ts*0.85); c.stroke();
      c.beginPath(); c.moveTo(px+ts*0.78, py+ts*0.65); c.lineTo(px+ts*0.62, py+ts*0.85); c.stroke();
      return true; }
    case 'W': {                                                 // água parada da fonte
      c.fillStyle = '#141020'; c.fillRect(px, py, ts, ts);
      const sh = 0.15 + 0.1*Math.sin(t/1600 + gx);
      c.fillStyle = 'rgba(120,60,80,'+sh+')';
      c.beginPath(); c.ellipse(px+ts/2, py+ts/2, ts*0.34, ts*0.22, 0, 0, Math.PI*2); c.fill();
      return true; }
  }
  return false;
}

// ===========================================================================
//  OS VAMPIROS DE VÉSPERA (cria / nobre / ancião)
// ===========================================================================
function drawVampiro(c, sx, sy, ts, p){
  const t = performance.now();
  const N = p.size || 2, S = ts * N * 0.5;
  const cx = sx + N*ts/2, cy = sy + N*ts/2;
  const tipo = p.mtype === 'vampiro_anciao' ? 2 : (p.mtype === 'vampiro_nobre' ? 1 : 0);
  const moving = !!p._moving;
  const cyc = ((p.walk||0) % WALK_CYCLE) / WALK_CYCLE;
  const hover = tipo === 2 ? Math.sin(t/600)*S*0.06 - S*0.08 : 0;   // o ancião LEVITA
  const bob = tipo === 2 ? hover : (moving ? -Math.abs(Math.sin(cyc*Math.PI*2))*1.5 : Math.sin(t/800)*0.5);
  const PELE = '#ddd6cf', CAPA = tipo===2 ? '#2a1020' : (tipo===1 ? '#3a1428' : '#241220');
  const FORRO = tipo===2 ? '#8a1830' : '#6a1428';
  c.save();
  c.fillStyle='rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(cx, cy+S*0.6, S*0.5, S*0.16, 0, 0, Math.PI*2); c.fill();
  if(tipo === 2){                                              // aura de sangue do ancião
    const pl = 0.16 + 0.1*Math.abs(Math.sin(t/300));
    const au = c.createRadialGradient(cx, cy, S*0.2, cx, cy, S*1.2);
    au.addColorStop(0, 'rgba(200,30,50,'+pl+')'); au.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = au; c.fillRect(sx - ts, sy - ts, N*ts + ts*2, N*ts + ts*2);
  }
  c.translate(cx, cy + bob);
  // CAPA de gola alta (a silhueta do vampiro)
  const sway = Math.sin(t/700 + (p.x||0))*S*0.05;
  c.fillStyle = CAPA; c.beginPath();
  c.moveTo(-S*0.34, -S*0.34);
  c.quadraticCurveTo(-S*(0.5+0.06*(tipo>0?1:0)) + sway, S*0.1, -S*0.4 + sway, S*0.58);
  c.lineTo(S*0.4 - sway, S*0.58);
  c.quadraticCurveTo(S*(0.5) - sway, S*0.1, S*0.34, -S*0.34);
  c.closePath(); c.fill();
  c.fillStyle = FORRO; c.beginPath();                          // forro vermelho aparecendo
  c.moveTo(-S*0.2, -S*0.1); c.lineTo(0, S*0.5); c.lineTo(S*0.2, -S*0.1); c.closePath(); c.fill();
  // corpo/traje
  c.fillStyle = tipo===0 ? '#2a2028' : '#1c1420';
  c.fillRect(-S*0.18, -S*0.24, S*0.36, S*0.62);
  if(tipo >= 1){                                               // nobre: botões e cinto
    c.fillStyle = '#c9a860';
    for(let i=0;i<3;i++){ c.beginPath(); c.arc(0, -S*0.1 + i*S*0.14, S*0.02, 0, Math.PI*2); c.fill(); }
  }
  // GOLA ALTA
  c.fillStyle = CAPA;
  c.beginPath(); c.moveTo(-S*0.3, -S*0.3); c.lineTo(-S*0.14, -S*0.52); c.lineTo(-S*0.08, -S*0.3); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.3, -S*0.3); c.lineTo(S*0.14, -S*0.52); c.lineTo(S*0.08, -S*0.3); c.closePath(); c.fill();
  // cabeça pálida
  c.fillStyle = PELE; c.beginPath(); c.ellipse(0, -S*0.42, S*0.15, S*0.17, 0, 0, Math.PI*2); c.fill();
  c.fillStyle = '#1a1016';                                     // cabelo puxado
  c.beginPath(); c.ellipse(0, -S*0.52, S*0.15, S*0.09, 0, Math.PI, 0); c.fill();
  if(tipo===2){ c.beginPath(); c.moveTo(-S*0.15,-S*0.52); c.lineTo(0,-S*0.63); c.lineTo(S*0.15,-S*0.52); c.closePath(); c.fill(); }
  // olhos vermelhos brilhando
  const gl = 0.6 + 0.4*Math.sin(t/400);
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = gl;
  c.fillStyle = '#ff2a40';
  c.beginPath(); c.arc(-S*0.06, -S*0.44, S*0.022, 0, Math.PI*2); c.fill();
  c.beginPath(); c.arc(S*0.06, -S*0.44, S*0.022, 0, Math.PI*2); c.fill();
  c.restore();
  // PRESAS
  c.fillStyle = '#f6f2ea';
  c.beginPath(); c.moveTo(-S*0.05, -S*0.36); c.lineTo(-S*0.03, -S*0.3); c.lineTo(-S*0.01, -S*0.36); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.05, -S*0.36); c.lineTo(S*0.03, -S*0.3); c.lineTo(S*0.01, -S*0.36); c.closePath(); c.fill();
  // detalhes por tipo
  if(tipo === 0){                                              // cria: garras compridas caídas
    c.strokeStyle = PELE; c.lineWidth = Math.max(1.4, S*0.035); c.lineCap='round';
    for(const sgn of [-1,1]){
      c.beginPath(); c.moveTo(sgn*S*0.26, S*0.0); c.lineTo(sgn*S*0.38, S*0.3); c.stroke();
      for(let i=0;i<3;i++){ c.beginPath(); c.moveTo(sgn*S*0.38, S*0.3);
        c.lineTo(sgn*(S*0.34 + i*S*0.04), S*0.42); c.stroke(); }
    }
  } else if(tipo === 1){                                       // nobre: florete
    c.strokeStyle = '#c9d0d8'; c.lineWidth = Math.max(1.6, S*0.04); c.lineCap='round';
    c.beginPath(); c.moveTo(S*0.3, S*0.05); c.lineTo(S*0.62, -S*0.4); c.stroke();
    c.fillStyle = '#c9a860'; c.beginPath(); c.arc(S*0.3, S*0.05, S*0.05, 0, Math.PI*2); c.fill();
  } else {                                                     // ancião: mão erguida com brasa de sangue
    c.strokeStyle = PELE; c.lineWidth = Math.max(1.6, S*0.04); c.lineCap='round';
    c.beginPath(); c.moveTo(-S*0.26, -S*0.05); c.lineTo(-S*0.48, -S*0.34); c.stroke();
    c.save(); c.globalCompositeOperation='lighter';
    const org = c.createRadialGradient(-S*0.5, -S*0.4, 0, -S*0.5, -S*0.4, S*0.16);
    org.addColorStop(0, 'rgba(255,60,80,0.9)'); org.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = org; c.beginPath(); c.arc(-S*0.5, -S*0.4, S*0.16, 0, Math.PI*2); c.fill();
    c.restore();
  }
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

// ===========================================================================
//  OS LOBISOMENS DO UMBRAVAL (ferino / uivador / ancestral)
// ===========================================================================
function drawLobisomem(c, sx, sy, ts, p){
  const t = performance.now();
  const N = p.size || 2, S = ts * N * 0.5;
  const cx = sx + N*ts/2, cy = sy + N*ts/2;
  const tipo = p.mtype === 'lobisomem_ancestral' ? 2 : (p.mtype === 'lobisomem_uivador' ? 1 : 0);
  const PELO = tipo===2 ? '#3a3648' : (tipo===1 ? '#2e2a3a' : '#46405a');
  const PELO2 = tipo===2 ? '#55506a' : (tipo===1 ? '#443e52' : '#5c5474');
  const moving = !!p._moving;
  const cyc = ((p.walk||0) % WALK_CYCLE) / WALK_CYCLE;
  const bob = moving ? -Math.abs(Math.sin(cyc*Math.PI*2))*2 : Math.sin(t/500)*0.8;
  const breath = 1 + 0.03*Math.sin(t/380);
  c.save();
  c.fillStyle='rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(cx, cy+S*0.6, S*0.55, S*0.16, 0, 0, Math.PI*2); c.fill();
  c.translate(cx, cy + bob);
  // pernas digitígradas (joelho invertido)
  const st = moving ? Math.sin(cyc*Math.PI*2)*S*0.12 : 0;
  c.strokeStyle = PELO; c.lineWidth = Math.max(2.6, S*0.09); c.lineCap='round';
  for(const sgn of [-1,1]){
    c.beginPath(); c.moveTo(sgn*S*0.16, S*0.1);
    c.lineTo(sgn*S*0.3 + st*sgn, S*0.34);
    c.lineTo(sgn*S*0.22 + st*sgn, S*0.58); c.stroke();
  }
  // cauda
  c.beginPath(); c.moveTo(-S*0.22, S*0.05);
  c.quadraticCurveTo(-S*0.5, S*0.1 + Math.sin(t/420)*S*0.06, -S*0.6, S*0.3); c.stroke();
  // torso curvado pra frente, PELAGEM ERIÇADA
  c.save(); c.scale(breath, breath);
  const bg = c.createLinearGradient(0, -S*0.5, 0, S*0.3);
  bg.addColorStop(0, PELO2); bg.addColorStop(1, PELO);
  c.fillStyle = bg; c.beginPath();
  c.moveTo(-S*0.3, S*0.15);
  c.quadraticCurveTo(-S*0.36, -S*0.3, -S*0.05, -S*0.44);
  c.quadraticCurveTo(S*0.3, -S*0.5, S*0.34, -S*0.15);
  c.quadraticCurveTo(S*0.34, S*0.15, 0, S*0.24);
  c.closePath(); c.fill();
  c.fillStyle = PELO;                                          // espinhos de pelo nas costas
  for(let i=0;i<5;i++){
    const bx2 = -S*0.28 + i*S*0.12, by2 = -S*0.28 - i*S*0.03;
    c.beginPath(); c.moveTo(bx2, by2); c.lineTo(bx2+S*0.05, by2-S*0.14); c.lineTo(bx2+S*0.1, by2); c.closePath(); c.fill();
  }
  c.restore();
  // braços LONGOS com garras
  c.strokeStyle = PELO2; c.lineWidth = Math.max(2.4, S*0.08); c.lineCap='round';
  const rag = Math.sin(t/300)*S*0.03;
  for(const sgn of [-1,1]){
    c.beginPath(); c.moveTo(sgn*S*0.24, -S*0.2);
    c.lineTo(sgn*S*0.44, S*0.05 + rag);
    c.lineTo(sgn*S*0.4, S*0.34 + rag); c.stroke();
    c.strokeStyle = '#e8e2d8'; c.lineWidth = Math.max(1.2, S*0.03);
    for(let i=0;i<3;i++){
      c.beginPath(); c.moveTo(sgn*S*0.4, S*0.34 + rag);
      c.lineTo(sgn*(S*0.36 + i*S*0.05), S*0.46 + rag); c.stroke();
    }
    c.strokeStyle = PELO2; c.lineWidth = Math.max(2.4, S*0.08);
  }
  // cabeça lupina: focinho, orelhas, olhos amarelos
  const hy = -S*0.5, howl = tipo===1 && Math.sin(t/2400) > 0.55;   // o uivador UIVA
  c.save(); c.translate(S*0.08, hy); if(howl) c.rotate(-0.5);
  c.fillStyle = PELO2; c.beginPath(); c.ellipse(0, 0, S*0.18, S*0.15, 0, 0, Math.PI*2); c.fill();
  c.beginPath(); c.moveTo(S*0.1, -S*0.02);                     // focinho
  c.lineTo(S*0.34, S*0.02); c.lineTo(S*0.1, S*0.1); c.closePath(); c.fill();
  c.fillStyle = '#14101c'; c.beginPath(); c.arc(S*0.33, S*0.02, S*0.03, 0, Math.PI*2); c.fill();
  c.fillStyle = PELO;                                          // orelhas
  c.beginPath(); c.moveTo(-S*0.1, -S*0.1); c.lineTo(-S*0.16, -S*0.3); c.lineTo(-S*0.0, -S*0.14); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(S*0.02, -S*0.12); c.lineTo(S*0.02, -S*0.3); c.lineTo(S*0.12, -S*0.13); c.closePath(); c.fill();
  const gl = 0.6 + 0.4*Math.sin(t/350);                        // olhos amarelos
  c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = gl;
  c.fillStyle = tipo===2 ? '#ffd040' : '#e8c030';
  c.beginPath(); c.arc(0, -S*0.04, S*0.024, 0, Math.PI*2); c.fill();
  c.beginPath(); c.arc(S*0.09, -S*0.03, S*0.022, 0, Math.PI*2); c.fill();
  c.restore();
  if(howl){                                                    // dentes no uivo
    c.fillStyle = '#f0ead8';
    c.beginPath(); c.moveTo(S*0.14, S*0.06); c.lineTo(S*0.18, S*0.12); c.lineTo(S*0.22, S*0.06); c.closePath(); c.fill();
  }
  c.restore();
  if(tipo === 2){                                              // ancestral: cicatriz de lua no peito
    c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.5 + 0.3*Math.sin(t/500);
    c.strokeStyle = '#c9d8ff'; c.lineWidth = Math.max(1.4, S*0.035);
    c.beginPath(); c.arc(0, -S*0.1, S*0.12, Math.PI*0.3, Math.PI*1.4); c.stroke();
    c.restore();
  }
  c.restore();
  drawMonsterBarName(c, sx, sy, ts, p);
}

// ===========================================================================
//  NODES DE COLETA: veios, árvores nobres e ervas (as fontes das profissões)
// ===========================================================================
function drawNode(c, sx, sy, ts, nd, now){
  const t = now || performance.now();
  const cx = sx + ts/2, cy = sy + ts/2;
  const dep = nd.depleted;
  const tipo = nd.type;
  c.save();
  c.fillStyle='rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(cx, sy+ts*0.85, ts*0.36, ts*0.1, 0, 0, Math.PI*2); c.fill();
  if(tipo.startsWith('veio_')){                                // VEIO: rocha com cristais
    const cor = tipo==='veio_ferro' ? '#b06a50' : (tipo==='veio_prata' ? '#d8e0e8' : '#7a6ae8');
    c.fillStyle = '#4a4450'; c.beginPath();
    c.moveTo(cx, sy+ts*0.2); c.lineTo(sx+ts*0.88, sy+ts*0.62); c.lineTo(sx+ts*0.76, sy+ts*0.88);
    c.lineTo(sx+ts*0.22, sy+ts*0.88); c.lineTo(sx+ts*0.1, sy+ts*0.56); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.1)'; c.beginPath();
    c.moveTo(cx, sy+ts*0.2); c.lineTo(sx+ts*0.68, sy+ts*0.45); c.lineTo(sx+ts*0.4, sy+ts*0.5); c.closePath(); c.fill();
    if(!dep){
      const gl = 0.55 + 0.45*Math.sin(t/600 + nd.x*3);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = gl;
      c.fillStyle = cor;
      for(const [dx2, dy2, r] of [[0.35,0.55,0.09],[0.58,0.62,0.07],[0.48,0.74,0.06]]){
        c.save(); c.translate(sx+ts*dx2, sy+ts*dy2); c.rotate(0.6);
        c.beginPath(); c.moveTo(0,-ts*r); c.lineTo(ts*r*0.6,0); c.lineTo(0,ts*r); c.lineTo(-ts*r*0.6,0);
        c.closePath(); c.fill(); c.restore();
      }
      c.restore();
    }
  } else if(tipo.startsWith('arvore_')){                       // ÁRVORE NOBRE: copa com aura
    const cor = tipo==='arvore_carvalho' ? '#5a8a3a' : (tipo==='arvore_rubra' ? '#c05838' : '#3a4a8a');
    if(dep){                                                   // esgotada: só o toco
      c.fillStyle = '#5a4a34'; c.beginPath();
      c.ellipse(cx, sy+ts*0.7, ts*0.2, ts*0.12, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = '#8a7050'; c.beginPath();
      c.ellipse(cx, sy+ts*0.66, ts*0.16, ts*0.09, 0, 0, Math.PI*2); c.fill();
    } else {
      c.strokeStyle = '#4a3a26'; c.lineWidth = Math.max(2.4, ts*0.11); c.lineCap='round';
      c.beginPath(); c.moveTo(cx, sy+ts*0.9); c.lineTo(cx-ts*0.03, sy+ts*0.34); c.stroke();
      const sw2 = Math.sin(t/1300 + nd.x)*0.03;
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.25 + 0.15*Math.sin(t/700+nd.y);
      const au = c.createRadialGradient(cx, sy+ts*0.3, 0, cx, sy+ts*0.3, ts*0.5);
      au.addColorStop(0, cor); au.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = au; c.beginPath(); c.arc(cx, sy+ts*0.3, ts*0.5, 0, Math.PI*2); c.fill();
      c.restore();
      c.fillStyle = cor; c.beginPath();
      c.ellipse(cx-ts*0.03, sy+ts*0.28, ts*0.34*(1+sw2), ts*0.26, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.14)'; c.beginPath();
      c.ellipse(cx-ts*0.12, sy+ts*0.2, ts*0.16, ts*0.11, 0, 0, Math.PI*2); c.fill();
    }
  } else {                                                     // ERVA / MOITA: tufo brilhante
    const cor = tipo==='erva_solar' ? '#e8c840' : (tipo==='erva_lunar' ? '#a0c0e8' : '#c9b868');
    if(dep){
      c.strokeStyle = '#5a5244'; c.lineWidth = 1.4; c.lineCap='round';
      for(let i=0;i<3;i++){ c.beginPath(); c.moveTo(cx-4+i*4, sy+ts*0.8);
        c.lineTo(cx-4+i*4, sy+ts*0.68); c.stroke(); }
    } else {
      const gl = 0.5 + 0.5*Math.sin(t/650 + nd.x*2);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.3*gl;
      const au = c.createRadialGradient(cx, sy+ts*0.6, 0, cx, sy+ts*0.6, ts*0.42);
      au.addColorStop(0, cor); au.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = au; c.beginPath(); c.arc(cx, sy+ts*0.6, ts*0.42, 0, Math.PI*2); c.fill();
      c.restore();
      c.strokeStyle = cor; c.lineWidth = Math.max(1.4, ts*0.05); c.lineCap='round';
      const sw3 = Math.sin(t/900 + nd.y)*2;
      for(let i=0;i<5;i++){
        const bx2 = cx - ts*0.2 + i*ts*0.1;
        c.beginPath(); c.moveTo(bx2, sy+ts*0.85);
        c.quadraticCurveTo(bx2 + sw3, sy+ts*0.6, bx2 + sw3*1.4, sy+ts*0.44 - (i%2)*3); c.stroke();
      }
      c.fillStyle = cor;
      c.beginPath(); c.arc(cx + sw3, sy+ts*0.42, 1.8, 0, Math.PI*2); c.fill();
    }
  }
  c.restore();
}

// ===========================================================================
//  BANCADA DE CRIAÇÃO (profissões): modal autocontido
// ===========================================================================
function openCraft(pl){
  const RCOL = (typeof RARITY_COL !== 'undefined') ? RARITY_COL : { comum:'#cfd6dd', raro:'#6db3ff', epico:'#c98aff', lendario:'#ffb84a' };
  let m = document.getElementById('craftModal');
  if(m) m.remove();
  m = document.createElement('div');
  m.id = 'craftModal';
  m.style.cssText = 'position:fixed;inset:0;z-index:260;display:flex;align-items:center;justify-content:center;background:rgba(6,8,14,0.72);backdrop-filter:blur(3px);font-family:inherit;';
  const lvlPct = pl.next_xp ? Math.min(100, Math.round((pl.xp % 120) / 1.2)) : 100;
  let h = '<div style="width:min(480px,94vw);max-height:86vh;overflow:auto;background:#151a26;border:1px solid #3a4a66;border-radius:14px;padding:16px 16px 12px;box-shadow:0 18px 60px rgba(0,0,0,.6);">';
  h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">';
  h += '<div style="font-size:26px;">' + pl.icon + '</div>';
  h += '<div style="flex:1;"><div style="font-weight:800;font-size:17px;color:#f0e8d8;">' + pl.name + ' — nível ' + pl.level + '</div>';
  h += '<div style="font-size:11px;color:#9aa8c0;">' + pl.master + ' te observa trabalhar</div></div>';
  h += '<button onclick="document.getElementById(\'craftModal\').remove()" style="background:none;border:none;color:#8a97b0;font-size:22px;cursor:pointer;">✕</button></div>';
  h += '<div style="height:7px;background:#0e1220;border-radius:4px;overflow:hidden;margin:6px 0 12px;">';
  h += '<div style="height:100%;width:' + lvlPct + '%;background:linear-gradient(90deg,#6db3ff,#c98aff);"></div></div>';
  for(const r of pl.recipes){
    const cor = RCOL[r.rarity] || '#cfd6dd';
    const trava = pl.level < r.lvl;
    h += '<div style="border:1px solid ' + (r.can ? '#3a5a3a' : '#2a3348') + ';border-radius:10px;padding:10px;margin-bottom:8px;background:#101522;' + (trava ? 'opacity:.55;' : '') + '">';
    h += '<div style="display:flex;align-items:center;gap:8px;">';
    h += '<div style="flex:1;font-weight:700;color:' + cor + ';">' + r.name + (trava ? ' <span style="font-size:10px;color:#c07a5a;">(nível ' + r.lvl + ')</span>' : '') + '</div>';
    h += '<button ' + (r.can ? '' : 'disabled ') + 'onclick="socket.emit(\'craft_make\',{prof:\'' + pl.prof + '\',out:\'' + r.out + '\'})" style="padding:6px 14px;border-radius:8px;border:none;font-weight:800;cursor:' + (r.can ? 'pointer' : 'default') + ';background:' + (r.can ? 'linear-gradient(180deg,#6db36d,#3f7a44)' : '#242c3e') + ';color:' + (r.can ? '#0c1408' : '#5a6680') + ';">Craftar</button></div>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;">';
    for(const ing of r.need){
      const ok = ing.have >= ing.qty;
      h += '<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:#0c1120;border:1px solid ' + (ok ? '#2f4a30' : '#4a2a2a') + ';color:' + (ok ? '#8fd08f' : '#e08a7a') + ';">' + ing.have + '/' + ing.qty + ' ' + ing.name + '</span>';
    }
    h += '</div></div>';
  }
  h += '<div style="font-size:10px;color:#6a7690;text-align:center;margin-top:4px;">Colete recursos pelo mundo (veios, árvores nobres, ervas) e drops de criaturas.</div>';
  h += '</div>';
  m.innerHTML = h;
  m.addEventListener('click', ev=>{ if(ev.target === m) m.remove(); });
  document.body.appendChild(m);
}

// ===========================================================================
//  ERMO 2.0: PACOTE POLIMENTO TOTAL
//  banner de mapa, fade de viagem, bússola de saídas, vinheta cinematográfica,
//  poeira nos passos, MINIMAPA ao vivo e a aba de Ofícios na ficha.
// ===========================================================================
var mapEdges = {};
var stepDust = [];
var _minimapCache = null;
var minimapOn = true;

const MAP_TITLES = {
  ermo:'O Ermo', descampado:'O Descampado', planaltos_ermais:'Planaltos Ermais',
  floresta_ermo:'Floresta do Ermo', bosque_atalech:'Bosque de Atalech',
  umbraval:'Umbraval, a Noite Eterna', vespera:'Véspera, a Cidade Morta',
  costa_maravai:'Costa de Maravaí', brasal:'O Brasal', goela_1:'Goela de Krezath',
  goela_2:'Goela Profunda', covil_krezath:'Covil do Devorador',
  avasham:'Avasham', cova_colosso:'Cova do Colosso', valdarkram:'Valdarkram',
  mina_avhur:'Mina de Avhur', camara_avhur:'Câmara de Avhur',
  torre_andar1:'Torre de Varth — 1º Andar', torre_andar2:'Torre de Varth — 2º Andar',
  torre_andar3:'Torre de Varth — 3º Andar', camara_varth:'Câmara do Lorde Varth',
  repouso_dama:'Repouso da Dama', salao:'Salão das Classes', taverna:'Taverna do Ermo',
  loja_armas:'Armas Peteco', sapopemba:'Sapopemba do Caíque',
};
function mapTitle(nm){
  if(MAP_TITLES[nm]) return MAP_TITLES[nm];
  return (nm||'').replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase());
}

// ---------- banner do nome do mapa (entrada cinematográfica) ----------
function showMapBanner(nm){
  let el = document.getElementById('mapBanner');
  if(!el){
    el = document.createElement('div');
    el.id = 'mapBanner';
    el.style.cssText = 'position:fixed;top:14%;left:0;right:0;text-align:center;z-index:180;'+
      'pointer-events:none;opacity:0;transition:opacity .7s ease;';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div style="display:inline-block;padding:10px 30px;">'+
    '<div style="font:800 24px Cinzel,serif;color:#f4e4c0;letter-spacing:4px;'+
    'text-shadow:0 2px 14px rgba(0,0,0,.9),0 0 40px rgba(244,216,160,.25);">'+ mapTitle(nm).toUpperCase() +'</div>'+
    '<div style="height:1px;margin:7px auto 0;width:70%;background:linear-gradient(90deg,transparent,#c9a860,transparent);"></div></div>';
  clearTimeout(el._t1); clearTimeout(el._t2);
  requestAnimationFrame(()=>{ el.style.opacity = '1'; });
  el._t1 = setTimeout(()=>{ el.style.opacity = '0'; }, 2400);
}

// ---------- fade de viagem (transição suave entre mapas) ----------
function fadeTransition(){
  let el = document.getElementById('mapFade');
  if(!el){
    el = document.createElement('div');
    el.id = 'mapFade';
    el.style.cssText = 'position:fixed;inset:0;background:#05060c;z-index:170;'+
      'pointer-events:none;opacity:0;transition:opacity .45s ease;';
    document.body.appendChild(el);
  }
  el.style.transition = 'none'; el.style.opacity = '0.95';
  requestAnimationFrame(()=>{ requestAnimationFrame(()=>{
    el.style.transition = 'opacity .45s ease'; el.style.opacity = '0';
  }); });
}

// ---------- bússola de saídas (setas pulsantes nas bordas) ----------
function drawExitArrows(c, now){
  if(!mapEdges) return;
  const pul = 0.55 + 0.35*Math.sin(now/420);
  c.save(); c.font = '700 10px Inter, sans-serif'; c.textAlign = 'center';
  const W = canvas.width, H = canvas.height;
  const draw = (bx, by, ang, dst)=>{
    c.save(); c.translate(bx, by); c.rotate(ang);
    c.globalAlpha = pul;
    c.fillStyle = '#f0d8a0';
    c.beginPath(); c.moveTo(0, -9); c.lineTo(7, 3); c.lineTo(-7, 3); c.closePath(); c.fill();
    c.restore();
    c.globalAlpha = Math.min(1, pul + 0.25);
    c.fillStyle = 'rgba(8,10,16,0.75)';
    const lbl = mapTitle(dst), tw = c.measureText(lbl).width + 10;
    let lx = bx, ly = by + (ang === 0 ? 26 : (ang === Math.PI ? -18 : 0));
    if(ang === -Math.PI/2) lx = bx + tw/2 + 14;
    if(ang ===  Math.PI/2) lx = bx - tw/2 - 14;
    c.fillRect(lx - tw/2, ly - 9, tw, 13);
    c.fillStyle = '#e8d8b0'; c.fillText(lbl, lx, ly + 1);
    c.globalAlpha = 1;
  };
  if(mapEdges.north) draw(W/2, 20, 0, mapEdges.north);
  if(mapEdges.south) draw(W/2, H - 20, Math.PI, mapEdges.south);
  if(mapEdges.west)  draw(20, H/2, -Math.PI/2, mapEdges.west);
  if(mapEdges.east)  draw(W - 20, H/2, Math.PI/2, mapEdges.east);
  c.restore();
}

// ---------- vinheta cinematográfica ----------
let _vigCache = null, _vigKey = '';
function drawVignette(c, now){
  const key = canvas.width + 'x' + canvas.height;
  if(_vigKey !== key){
    _vigKey = key;
    _vigCache = document.createElement('canvas');
    _vigCache.width = canvas.width; _vigCache.height = canvas.height;
    const vc = _vigCache.getContext('2d');
    const g = vc.createRadialGradient(canvas.width/2, canvas.height/2, Math.min(canvas.width, canvas.height)*0.42,
                                      canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height)*0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(4,5,10,0.34)');
    vc.fillStyle = g; vc.fillRect(0, 0, canvas.width, canvas.height);
  }
  c.drawImage(_vigCache, 0, 0);
}

// ---------- poeira nos passos ----------
function drawStepDust(c, now){
  if(!stepDust.length) return;
  c.save();
  for(let i = stepDust.length - 1; i >= 0; i--){
    const d = stepDust[i];
    const age = (now - d.born) / 520;
    if(age >= 1){ stepDust.splice(i, 1); continue; }
    const sx = d.x - camX, sy = d.y - camY;
    c.globalAlpha = 0.22 * (1 - age);
    c.fillStyle = '#cfc4ae';
    c.beginPath(); c.arc(sx, sy - age*5, 1.6 + age*3.4, 0, Math.PI*2); c.fill();
  }
  c.restore();
}

// ---------- MINIMAPA ao vivo ----------
function _miniColor(ch){
  if(ch === '~') return null;
  if(ch === 'W') return '#2a5a8a';
  if(ch === 'L' || ch === 'M') return '#a83a1c';
  if(ch === 'T') return '#2c4a30';
  if(ch === '+') return '#d8b060';
  if(ch === '=' || ch === 'd') return '#6a5c48';
  if(typeof SOLID !== 'undefined' && SOLID.has && SOLID.has(ch)) return '#3a3644';
  if('#^YbjFhHsfgkPQRUAlqNIvyzGBK456&X87J{}/;_'.indexOf(ch) >= 0) return '#3a3644';
  return '#514c5c';
}
function buildMinimapCache(){
  if(!mapRows || !mapRows.length) return null;
  const w = mapW, h = mapH;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const mc = cv.getContext('2d');
  for(let y = 0; y < h; y++){
    const row = mapRows[y];
    for(let x = 0; x < w; x++){
      const col = _miniColor(row[x]);
      if(!col) continue;
      mc.fillStyle = col; mc.fillRect(x, y, 1, 1);
    }
  }
  const scale = Math.min(148 / w, 148 / h, 3);
  return { cv, scale, w, h };
}
function drawMinimap(c, now){
  if(!minimapOn) return;
  if(!_minimapCache) _minimapCache = buildMinimapCache();
  const m = _minimapCache; if(!m) return;
  const dw = m.w * m.scale, dh = m.h * m.scale;
  const ox = canvas.width - dw - 14, oy = 14;
  c.save();
  c.fillStyle = 'rgba(6,8,14,0.72)';
  c.strokeStyle = 'rgba(200,170,110,0.5)'; c.lineWidth = 1;
  c.beginPath(); c.roundRect ? c.roundRect(ox-5, oy-5, dw+10, dh+10, 7) : c.rect(ox-5, oy-5, dw+10, dh+10);
  c.fill(); c.stroke();
  c.imageSmoothingEnabled = false;
  c.drawImage(m.cv, ox, oy, dw, dh);
  // entidades
  players.forEach(p=>{
    if(p._dead) return;
    const px = ox + (p.x||0)*m.scale, py = oy + (p.y||0)*m.scale;
    if(p.id === myId) return;                                    // o dono desenha por último
    if(p.kind === 'monster'){
      c.fillStyle = p.boss ? '#ffd060' : '#e0584a';
      c.fillRect(px-1, py-1, p.boss ? 4 : 2.4, p.boss ? 4 : 2.4);
    } else if(p.kind){                                           // npcs e afins
      c.fillStyle = '#e8c860'; c.fillRect(px-1, py-1, 2, 2);
    } else {
      c.fillStyle = '#6adf6a'; c.fillRect(px-1, py-1, 2.6, 2.6);
    }
  });
  for(const nd of worldNodes){
    if(nd.depleted) continue;
    c.fillStyle = '#5ad8e8';
    c.fillRect(ox + nd.x*m.scale - 0.8, oy + nd.y*m.scale - 0.8, 2, 2);
  }
  const me = players.get(myId);
  if(me){
    const px = ox + me.x*m.scale, py = oy + me.y*m.scale;
    const pl = 2.4 + 0.9*Math.sin(now/300);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(px, py, pl, 0, Math.PI*2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
    // janela da câmera
    const vw = canvas.width / TS * m.scale, vh = canvas.height / TS * m.scale;
    c.strokeRect(ox + camX/TS*m.scale, oy + camY/TS*m.scale, vw, vh);
  }
  c.fillStyle = 'rgba(220,205,170,0.55)';
  c.font = '600 8px Inter, sans-serif'; c.textAlign = 'right';
  c.fillText('M', ox + dw, oy + dh + 9);
  c.restore();
}

// ---------- o maestro dos overlays (chamado no fim do frame) ----------
function drawWorldOverlays(c, now){
  try{
    drawStepDust(c, now);
    drawWeather(c, now);
    drawQuestMarks(c, now);
    drawRtAoes(c, now);
    drawGarden(c, now);
    drawIlhaDecor(c, now);
    drawRtCombat(c, now);
    drawExitArrows(c, now);
    drawVignette(c, now);
    drawMinimap(c, now);
  }catch(err){ /* nunca derruba o render */ }
}

// tecla M: liga/desliga o minimapa
window.addEventListener('keydown', e=>{
  if(e.code === 'KeyM' && typeof started !== 'undefined' && started && !typingInField(e)){
    minimapOn = !minimapOn;
  }
});

// ---------- FICHA: aba de Ofícios ----------
const PROF_META = {
  ferreiro:   {n:'Ferreiro',    i:'⚒️'},
  coureiro:   {n:'Coureiro',    i:'🟤'},
  costureiro: {n:'Costureiro',  i:'🧵'},
  carpinteiro:{n:'Carpinteiro', i:'🪵'},
  alquimista: {n:'Alquimista',  i:'⚗️'},
  joalheiro:  {n:'Joalheiro',   i:'💎'},
  cozinheiro: {n:'Cozinheiro',  i:'🍲'},
};
function _fichaOficios(f){
  const profs = (f && f.profs) || {};
  let h = '<div style="font:600 11px Inter;color:#8a86a0;margin-bottom:10px;">'+
    'Aprenda com os mestres do Ermo: colete recursos pelo mundo e crie nas oficinas.</div>';
  for(const id in PROF_META){
    const xp = Math.max(0, parseInt(profs[id] || 0, 10));
    const lvl = 1 + Math.min(4, Math.floor(xp / 120));
    const pct = lvl >= 5 ? 100 : Math.round((xp % 120) / 1.2);
    h += '<div style="display:flex;align-items:center;gap:9px;margin-bottom:9px;">';
    h += '<div style="font-size:19px;width:26px;text-align:center;">'+ PROF_META[id].i +'</div>';
    h += '<div style="flex:1;">';
    h += '<div style="display:flex;justify-content:space-between;font:700 12px Inter;color:#e4e0ee;">'+
      '<span>'+ PROF_META[id].n +'</span><span style="color:'+ (lvl>=5?'#ffd060':'#9b6dff') +';">nível '+ lvl + (lvl>=5?' ★':'') +'</span></div>';
    h += '<div style="height:5px;background:#191527;border-radius:3px;overflow:hidden;margin-top:3px;">'+
      '<div style="height:100%;width:'+ pct +'%;background:linear-gradient(90deg,#6db3ff,#c98aff);"></div></div>';
    h += '</div></div>';
  }
  return h;
}

// ===========================================================================
//  COMBATE EM TEMPO REAL (cliente): alvo, marcador Tibia, dano flutuante
// ===========================================================================
var rtTargetId = null;
var rtFloats = [];

function rtAddFloat(wx, wy, txt, color, big){
  rtFloats.push({x: wx, y: wy, txt, color, big: !!big, born: performance.now()});
  if(rtFloats.length > 40) rtFloats.shift();
}

function rtPickNearest(){
  const me = players.get(myId); if(!me) return null;
  let best = null, bd = 1e9;
  players.forEach(p=>{
    if(p.kind !== 'monster' || p._dead) return;
    const d = Math.max(Math.abs(p.x - me.x), Math.abs(p.y - me.y));
    if(d < bd && d <= 9){ bd = d; best = p; }
  });
  return best;
}

// Tab: mira o monstro vivo mais próximo (e Esc solta o alvo)
window.addEventListener('keydown', e=>{
  if(typeof started === 'undefined' || !started || typingInField(e)) return;
  if(e.code === 'Tab'){
    e.preventDefault();
    const alvo = rtPickNearest();
    if(alvo){ rtTargetId = alvo.id; socket.emit('rt_target', { target: alvo.id }); }
  } else if(e.code === 'Escape' && rtTargetId){
    rtTargetId = null; socket.emit('rt_target', {});
  }
});

function bindRtSocket(){
  if(typeof socket === 'undefined' || !socket || socket._rtBound) return;
  socket._rtBound = true;
  socket.on('rt_engage', d=>{ if(d) rtTargetId = d.target || null; });
  socket.on('rt_hit', d=>{
    if(!d) return;
    if(d.fx && d.magic){
      const DCOL = {fogo:'#ff8a30', gelo:'#7ad0ff', energia:'#c98aff', acido:'#8ae06a',
                    trovao:'#ffd24a', necrotico:'#9a5adf', radiante:'#fff0b0', psiquico:'#ff7ad0'};
      let style = 'bolt';
      if((d.sid||'').indexOf('misseis') >= 0) style = 'missiles';
      else if(d.dtype === 'fogo') style = 'fire';
      else if(d.dtype === 'gelo' || d.dtype === 'frio') style = 'ice';
      else if(d.dtype === 'trovao' || d.dtype === 'eletrico') style = 'lightning';
      else if(d.dtype === 'acido' || d.dtype === 'veneno') style = 'acid';
      else if(d.dtype === 'necrotico') style = 'necro';
      else if(d.dtype === 'radiante') style = 'holy';
      else if(d.dtype === 'psiquico') style = 'psi';
      rtFxs.push({x1: d.fx[0]*TS + TS/2, y1: d.fx[1]*TS + TS/2,
                  x2: d.fx[2]*TS + TS/2, y2: d.fx[3]*TS + TS/2, style: style,
                  col: DCOL[d.dtype] || '#c98aff', born: performance.now()});
      if(rtFxs.length > 20) rtFxs.shift();
    }
    const p = players.get(d.id);
    if(p){
      p.hp = d.hp; p.hp_max = d.hp_max;
      const wx = (p.rx||p.x*TS) + (p.size||1)*TS/2, wy = (p.ry||p.y*TS);
      if(d.miss) rtAddFloat(wx, wy, d.magic ? 'resistiu' : 'errou', '#9aa0b0', false);
      else {
        rtAddFloat(wx, wy, '-' + d.dmg + (d.crit ? '!' : ''),
                   d.magic ? '#c98aff' : (d.crit ? '#ffd24a' : '#ffffff'), d.crit || d.magic);
        if(d.magic && d.spell) rtAddFloat(wx, wy - 16, d.spell, '#e0c9ff', false);
      }
      if(d.crit && d.by === myId) shakeTiny();
    }
  });
  socket.on('rt_dead', d=>{
    if(!d) return;
    const p = players.get(d.id);
    if(p){ p._dead = true;
      rtAddFloat((p.rx||p.x*TS) + (p.size||1)*TS/2, (p.ry||p.y*TS), '☠', '#ffb84a', true); }
    if(rtTargetId === d.id) rtTargetId = null;
  });
  socket.on('rt_phit', d=>{
    if(!d) return;
    const me = players.get(myId);
    if(me){
      const wx = (me.rx||me.x*TS) + TS/2, wy = (me.ry||me.y*TS);
      if(d.miss) rtAddFloat(wx, wy, 'esquivou', '#8fd08f', false);
      else { rtAddFloat(wx, wy, '-' + d.dmg + (d.crit ? '!' : ''), '#ff5a4a', d.crit); shakeTiny(); }
    }
  });
}
var _rtShake = 0;
function shakeTiny(){ _rtShake = performance.now(); }
setInterval(bindRtSocket, 800);   // liga assim que o socket existir

var rtFxs = [];
function drawRtCombat(c, now){
  for(let i = rtFxs.length - 1; i >= 0; i--){
    const f = rtFxs[i];
    const dur = f.style === 'missiles' ? 700 : 520;
    const age = (now - f.born) / dur;
    if(age >= 1){ rtFxs.splice(i, 1); continue; }
    const ex = f.x2 - camX, ey = f.y2 - camY, sx = f.x1 - camX, sy = f.y1 - camY;
    c.save(); c.globalCompositeOperation = 'lighter';
    const impact = age > 0.55, k = Math.min(1, age/0.55), ik = impact ? (age-0.55)/0.45 : 0;
    if(f.style === 'fire'){
      if(!impact){
        for(let t=0;t<5;t++){ const kk = Math.max(0, k - t*0.05);
          c.globalAlpha = 0.8-(t*0.15); c.fillStyle = t<2?'#ffd070':'#ff7a20';
          c.beginPath(); c.arc(sx+(ex-sx)*kk, sy+(ey-sy)*kk, 5.5-t*0.8+Math.sin(now/60), 0, Math.PI*2); c.fill(); }
      } else {
        c.globalAlpha = (1-ik)*0.95;
        const g = c.createRadialGradient(ex,ey,0,ex,ey,6+ik*TS*1.1);
        g.addColorStop(0,'#fff0b0'); g.addColorStop(0.5,'#ff8a20'); g.addColorStop(1,'rgba(200,40,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(ex,ey,6+ik*TS*1.1,0,Math.PI*2); c.fill();
        c.fillStyle = '#ffb040';
        for(let s=0;s<7;s++){ const a=s*0.9+ik*2;
          c.beginPath(); c.arc(ex+Math.cos(a)*(4+ik*TS*0.9), ey+Math.sin(a)*(4+ik*TS*0.9)-ik*8, 2.4*(1-ik),0,Math.PI*2); c.fill(); }
      }
    } else if(f.style === 'ice'){
      if(!impact){
        c.save(); c.translate(sx+(ex-sx)*k, sy+(ey-sy)*k); c.rotate(now/90);
        c.fillStyle = '#bfe8ff'; c.globalAlpha = 0.95;
        c.beginPath(); c.moveTo(0,-7); c.lineTo(4,0); c.lineTo(0,7); c.lineTo(-4,0); c.closePath(); c.fill();
        c.restore();
      } else {
        c.globalAlpha = (1-ik); c.strokeStyle = '#bfe8ff'; c.lineWidth = 2;
        for(let s=0;s<6;s++){ const a=s*Math.PI/3;
          c.beginPath(); c.moveTo(ex,ey);
          c.lineTo(ex+Math.cos(a)*(5+ik*TS*0.8), ey+Math.sin(a)*(5+ik*TS*0.8)); c.stroke();
          c.fillStyle='#e8f6ff';
          c.beginPath(); c.arc(ex+Math.cos(a)*(5+ik*TS*0.8), ey+Math.sin(a)*(5+ik*TS*0.8),1.8,0,Math.PI*2); c.fill(); }
      }
    } else if(f.style === 'lightning'){
      c.globalAlpha = (1-age)*0.95;
      c.strokeStyle = '#ffe870'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(sx,sy);
      for(let s2=1;s2<=5;s2++){ const kk=s2/5;
        c.lineTo(sx+(ex-sx)*kk+((s2<5)?Math.sin(now/30+s2*7)*10:0), sy+(ey-sy)*kk+((s2<5)?((s2%2)?6:-6):0)); }
      c.stroke();
      c.strokeStyle='rgba(255,255,255,0.8)'; c.lineWidth=1; c.stroke();
      c.globalAlpha=(1-age)*0.6; c.fillStyle='#fff8d0';
      c.beginPath(); c.arc(ex,ey,3+age*TS*0.7,0,Math.PI*2); c.fill();
    } else if(f.style === 'acid'){
      if(!impact){
        const px2 = sx+(ex-sx)*k, py2 = sy+(ey-sy)*k - Math.sin(k*Math.PI)*TS*0.9;
        c.fillStyle = '#8ae06a'; c.globalAlpha = 0.9;
        c.beginPath(); c.ellipse(px2,py2,5,6+Math.sin(now/70)*1.4,0,0,Math.PI*2); c.fill();
      } else {
        c.globalAlpha = (1-ik)*0.85; c.fillStyle = '#6ac04a';
        c.beginPath(); c.ellipse(ex, ey+4, 6+ik*TS*0.7, 3+ik*TS*0.25, 0,0,Math.PI*2); c.fill();
        c.fillStyle = '#b0ff8a';
        for(let s=0;s<3;s++){ c.beginPath(); c.arc(ex+(s-1)*7, ey - ik*10 - s*3, 2*(1-ik),0,Math.PI*2); c.fill(); }
      }
    } else if(f.style === 'necro'){
      c.globalAlpha = 0.9;
      const px2 = impact ? ex : sx+(ex-sx)*k, py2 = impact ? ey : sy+(ey-sy)*k;
      for(let s=0;s<5;s++){
        const a = now/120 + s*1.25, r = impact ? (10*(1-ik)) : 7;
        c.fillStyle = s%2 ? '#9a5adf' : '#3a2050';
        c.beginPath(); c.arc(px2+Math.cos(a)*r, py2+Math.sin(a)*r, 2.6,0,Math.PI*2); c.fill();
      }
      if(impact){ c.globalAlpha=(1-ik); c.strokeStyle='#c99aff'; c.lineWidth=1.6;
        c.beginPath(); c.arc(ex,ey,TS*0.8*(1-ik),0,Math.PI*2); c.stroke(); }
    } else if(f.style === 'holy'){
      c.globalAlpha = age<0.3 ? age/0.3 : (1-age)/0.7;
      const g = c.createLinearGradient(ex, ey-TS*2.4, ex, ey);
      g.addColorStop(0,'rgba(255,244,190,0)'); g.addColorStop(1,'rgba(255,240,170,0.9)');
      c.fillStyle = g; c.fillRect(ex-7, ey-TS*2.4, 14, TS*2.4);
      c.fillStyle = '#fff6d0';
      c.beginPath(); c.ellipse(ex, ey, 10*(0.4+age), 3.4*(0.4+age),0,0,Math.PI*2); c.fill();
    } else if(f.style === 'psi'){
      c.globalAlpha = 0.85;
      for(let s=0;s<3;s++){
        const kk = (age*1.4 + s*0.33) % 1;
        c.strokeStyle = '#ff8ad8'; c.lineWidth = 2*(1-kk);
        c.beginPath(); c.arc(ex, ey, TS*1.1*(1-kk), 0, Math.PI*2); c.stroke();
      }
    } else if(f.style === 'missiles'){
      for(let m2=0;m2<3;m2++){
        const mk = Math.max(0, Math.min(1, (age*1.5) - m2*0.22));
        if(mk <= 0 || mk >= 1) continue;
        const curve = Math.sin(mk*Math.PI)*(m2-1)*TS*0.5;
        const px2 = sx+(ex-sx)*mk + curve*0.3, py2 = sy+(ey-sy)*mk + curve;
        c.fillStyle = '#c98aff'; c.globalAlpha = 0.95;
        c.beginPath(); c.arc(px2,py2,3.2,0,Math.PI*2); c.fill();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(px2,py2,1.4,0,Math.PI*2); c.fill();
      }
      if(age > 0.7){ c.globalAlpha=(1-age)/0.3; c.strokeStyle='#c98aff'; c.lineWidth=2;
        c.beginPath(); c.arc(ex,ey,4+(age-0.7)*TS*1.4,0,Math.PI*2); c.stroke(); }
    } else {
      if(!impact){ c.fillStyle=f.col; c.globalAlpha=0.9;
        c.beginPath(); c.arc(sx+(ex-sx)*k, sy+(ey-sy)*k, 4.2,0,Math.PI*2); c.fill();
      } else { c.globalAlpha=(1-ik)*0.9; c.strokeStyle=f.col; c.lineWidth=2.2;
        c.beginPath(); c.arc(ex,ey,4+ik*TS*0.8,0,Math.PI*2); c.stroke(); }
    }
    c.restore();
  }

  bindRtSocket();
  // marcador do alvo (4 cantos girando, estilo Tibia)
  if(rtTargetId){
    const p = players.get(rtTargetId);
    if(!p || p._dead){ rtTargetId = null; }
    else {
      const N = p.size || 1;
      const sx = (p.rx||p.x*TS) - camX, sy = (p.ry||p.y*TS) - camY;
      const cx = sx + N*TS/2, cy = sy + N*TS/2, R = N*TS*0.62;
      const rot = now/600;
      c.save(); c.translate(cx, cy); c.rotate(rot);
      c.strokeStyle = '#ff4a3a'; c.lineWidth = 2.4; c.lineCap = 'round';
      c.shadowColor = 'rgba(255,70,50,0.8)'; c.shadowBlur = 6;
      for(let i = 0; i < 4; i++){
        c.save(); c.rotate(i*Math.PI/2);
        c.beginPath(); c.moveTo(R, R*0.45); c.lineTo(R, R); c.lineTo(R*0.45, R); c.stroke();
        c.restore();
      }
      c.restore();
      // barra do alvo no topo
      const bw = 230, bx = canvas.width/2 - bw/2, by = 12;
      const pct = Math.max(0, Math.min(1, (p.hp||0)/(p.hp_max||1)));
      c.save();
      c.fillStyle = 'rgba(8,10,16,0.8)';
      c.strokeStyle = 'rgba(255,80,60,0.55)'; c.lineWidth = 1;
      c.beginPath(); c.roundRect ? c.roundRect(bx-6, by-4, bw+12, 30, 7) : c.rect(bx-6, by-4, bw+12, 30);
      c.fill(); c.stroke();
      c.fillStyle = '#f0e4d0'; c.font = '700 11px Inter, sans-serif'; c.textAlign = 'center';
      c.fillText((p.name || 'Alvo'), canvas.width/2, by + 8);
      c.fillStyle = '#241016'; c.fillRect(bx, by + 13, bw, 8);
      const g = c.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, '#e0483a'); g.addColorStop(1, '#ff7a50');
      c.fillStyle = g; c.fillRect(bx, by + 13, bw*pct, 8);
      c.restore();
    }
  }
  // números de dano flutuantes
  for(let i = rtFloats.length - 1; i >= 0; i--){
    const fl = rtFloats[i];
    const age = (now - fl.born) / 950;
    if(age >= 1){ rtFloats.splice(i, 1); continue; }
    const sx = fl.x - camX, sy = fl.y - camY - age*26;
    c.save();
    c.globalAlpha = age < 0.75 ? 1 : (1 - age)/0.25;
    c.font = (fl.big ? '900 19px' : '800 13px') + ' Inter, sans-serif';
    c.textAlign = 'center';
    c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineWidth = 3;
    c.strokeText(fl.txt, sx, sy);
    c.fillStyle = fl.color; c.fillText(fl.txt, sx, sy);
    c.restore();
  }
  // shake curtinho no impacto
  if(_rtShake && now - _rtShake < 130){
    const k = 1 - (now - _rtShake)/130;
    canvas.style.transform = 'translate(' + ((Math.random()-0.5)*4*k) + 'px,' + ((Math.random()-0.5)*4*k) + 'px)';
  } else if(canvas.style.transform){
    canvas.style.transform = '';
  }
}

// ===========================================================================
//  ERMO REFORMADO: exteriores temáticos das oficinas + o Templo dos Doze
// ===========================================================================
const ERMO_DECOR = [
  {x:41, y:14, t:'forja',    icon:'⚒️'},
  {x:41, y:19, t:'couraria', icon:'🟤'},
  {x:41, y:24, t:'serraria', icon:'🪵'},
  {x:41, y:29, t:'alquimia', icon:'⚗️'},
  {x:51, y:16, t:'costura',  icon:'🧵'},
  {x:51, y:22, t:'joalheria',icon:'💎'},
  {x:51, y:28, t:'cozinha',  icon:'🍲'},
];
function drawErmoDecor(c, now){
  for(const d of ERMO_DECOR){
    const bx = d.x*TS - camX, by = d.y*TS - camY;
    if(bx < -TS*8 || by < -TS*5 || bx > canvas.width+TS*2 || by > canvas.height+TS*2) continue;
    // ÍCONE do ofício sobre a faixa dourada do toldo
    c.save();
    c.font = Math.round(TS*0.6) + 'px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(d.icon, bx + 3.5*TS, by + TS*0.66);
    c.restore();
    // detalhe vivo por ofício
    if(d.t === 'forja'){
      c.save();
      for(let i=0;i<3;i++){
        const ph = ((now/70) + i*13) % 40;
        c.globalAlpha = 0.35 * (1 - ph/40);
        c.fillStyle = '#b8b0ae';
        c.beginPath(); c.arc(bx + 5.8*TS + Math.sin((now/600)+i)*3, by - 3 - ph*0.8, 3 + ph*0.14, 0, Math.PI*2); c.fill();
      }
      c.restore();
    } else if(d.t === 'alquimia'){
      const bub = Math.sin(now/300);
      c.save();
      c.fillStyle = '#22261e'; c.beginPath();
      c.ellipse(bx - TS*0.55, by + TS*3.3, TS*0.36, TS*0.24, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = '#5ad86a'; c.globalAlpha = 0.85;
      c.beginPath(); c.ellipse(bx - TS*0.55, by + TS*3.18, TS*0.26, TS*0.09, 0, 0, Math.PI*2); c.fill();
      if(bub > 0.4){ c.globalAlpha = 0.7;
        c.beginPath(); c.arc(bx - TS*0.55 + bub*4, by + TS*3.0, 2, 0, Math.PI*2); c.fill(); }
      c.restore();
    } else if(d.t === 'couraria'){
      c.save();
      c.strokeStyle = '#4a3820'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(bx + 7.3*TS, by + TS*1.7); c.lineTo(bx + 8.5*TS, by + TS*1.7); c.stroke();
      const sw = Math.sin(now/800)*2;
      for(let i=0;i<2;i++){
        c.fillStyle = i ? '#8a5a34' : '#a8703c';
        c.fillRect(bx + (7.5 + i*0.55)*TS + sw*(i?1:-1)*0.4, by + TS*1.75, TS*0.4, TS*0.72);
      }
      c.restore();
    } else if(d.t === 'serraria'){
      c.save();
      for(const [ox, oy] of [[0,0],[0.55,0],[0.27,-0.4]]){
        c.fillStyle = '#8a6438';
        c.beginPath(); c.ellipse(bx + 7.7*TS + ox*TS, by + 2.9*TS + oy*TS, TS*0.26, TS*0.2, 0, 0, Math.PI*2); c.fill();
        c.fillStyle = '#c9a464';
        c.beginPath(); c.ellipse(bx + 7.7*TS + ox*TS, by + 2.9*TS + oy*TS, TS*0.15, TS*0.11, 0, 0, Math.PI*2); c.fill();
      }
      c.restore();
    } else if(d.t === 'costura'){
      c.save();
      const cores = ['#e089a8', '#89a8e0', '#e0cf89'];
      for(let i=0;i<3;i++){
        c.fillStyle = cores[i];
        c.fillRect(bx + TS*(1.4 + i*1.5), by + TS*1.15 + Math.sin(now/700+i)*1.2, TS*0.5, TS*0.7);
      }
      c.restore();
    } else if(d.t === 'joalheria'){
      const sp = (now/450 + d.x) % 3;
      c.save(); c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.85;
      c.fillStyle = '#fff0c0';
      const spx = bx + TS*(1.6 + sp*1.6), spy = by + TS*1.45;
      c.beginPath();
      c.moveTo(spx, spy-4); c.lineTo(spx+1.6, spy); c.lineTo(spx, spy+4); c.lineTo(spx-1.6, spy);
      c.closePath(); c.fill();
      c.restore();
    } else if(d.t === 'cozinha'){
      c.save();
      for(let i=0;i<2;i++){
        const ph = ((now/90) + i*20) % 34;
        c.globalAlpha = 0.3 * (1 - ph/34);
        c.fillStyle = '#f0e8d8';
        c.beginPath(); c.arc(bx + 1.3*TS + Math.sin(now/500+i)*2, by - 2 - ph*0.7, 2.4 + ph*0.1, 0, Math.PI*2); c.fill();
      }
      c.restore();
    }
  }
  // ---- TEMPLO DOS DOZE (fachada 52,4 .. 66,7): chamas na cornija + símbolo ----
  const tx = 52*TS - camX, ty = 4*TS - camY;
  if(tx > -TS*16 && ty > -TS*7 && tx < canvas.width+TS*2 && ty < canvas.height+TS*2){
    const ax = tx + 7.5*TS;
    c.save(); c.globalCompositeOperation = 'lighter';
    for(let i=0;i<12;i++){                          // 12 chamas dançando na cornija
      const vx = tx + (1.1 + i*1.16)*TS;
      const vy = ty + TS*0.12;
      const fl = 0.55 + 0.45*Math.sin(now/160 + i*1.7);
      c.globalAlpha = 0.85*fl;
      c.fillStyle = i%2 ? '#ffd070' : '#ffb040';
      c.beginPath();
      c.moveTo(vx - 2.2, vy);
      c.quadraticCurveTo(vx + Math.sin(now/110+i)*1.4, vy - 6 - fl*3, vx + 2.2, vy);
      c.closePath(); c.fill();
    }
    const pl = 0.5 + 0.3*Math.sin(now/700);         // símbolo dos Doze sobre o portal
    c.globalAlpha = pl;
    c.strokeStyle = '#f6dfa0'; c.lineWidth = 1.8;
    c.beginPath(); c.arc(ax, ty + TS*2.4, TS*0.5, 0, Math.PI*2); c.stroke();
    for(let i=0;i<12;i++){
      const a = i*Math.PI/6 + now/4000;
      c.fillStyle = '#f6dfa0';
      c.beginPath(); c.arc(ax + Math.cos(a)*TS*0.5, ty + TS*2.4 + Math.sin(a)*TS*0.5, 1.5, 0, Math.PI*2); c.fill();
    }
    c.restore();
    // aura quente saindo do portal
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.14 + 0.07*Math.sin(now/900);
    const g = c.createRadialGradient(ax, ty + TS*4.2, 0, ax, ty + TS*4.2, TS*2.2);
    g.addColorStop(0, '#f6dfa0'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(ax, ty + TS*4.2, TS*2.2, 0, Math.PI*2); c.fill();
    c.restore();
  }
}

// PORTAL DA FENDA DO CAOS (leste do Ermo)
(function(){
  const orig2 = drawErmoDecor;
  drawErmoDecor = function(c, now){
    orig2(c, now);
    return;                    // o portal migrou pro Ossuário, sob o templo
    const fx = 72.5*TS - camX, fy = 20.5*TS - camY;
    if(fx < -TS*3 || fy < -TS*3 || fx > canvas.width+TS*3 || fy > canvas.height+TS*3) return;
    c.save();
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath(); c.ellipse(fx, fy + TS*0.55, TS*0.75, TS*0.2, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = '#3a3444';                                        // as pedras eretas
    for(const [ox, h] of [[-0.62, 0.9], [0.62, 0.9], [-0.3, 1.25], [0.3, 1.25]]){
      c.fillRect(fx + ox*TS - 3, fy + TS*0.5 - h*TS, 6, h*TS);
    }
    c.save(); c.globalCompositeOperation = 'lighter';               // o vórtice
    for(let i=0;i<3;i++){
      const a2 = now/700 + i*2.1;
      c.globalAlpha = 0.5 + 0.3*Math.sin(now/300 + i);
      c.strokeStyle = i%2 ? '#a06aff' : '#6a3adf'; c.lineWidth = 2.2;
      c.beginPath(); c.ellipse(fx, fy - TS*0.25, TS*0.42*(0.6+i*0.22), TS*0.6*(0.6+i*0.22), a2, 0, Math.PI*1.6); c.stroke();
    }
    const g = c.createRadialGradient(fx, fy - TS*0.25, 0, fx, fy - TS*0.25, TS*1.1);
    g.addColorStop(0, 'rgba(150,90,255,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 0.6 + 0.3*Math.sin(now/500);
    c.fillStyle = g; c.beginPath(); c.arc(fx, fy - TS*0.25, TS*1.1, 0, Math.PI*2); c.fill();
    c.restore(); c.restore();
  };
})();

// obelisco do MEMORIAL DOS HERÓIS (ao lado do templo)
(function(){
  const orig = drawErmoDecor;
  drawErmoDecor = function(c, now){
    orig(c, now);
    const mx = 62.5*TS - camX, my = 9.6*TS - camY;
    if(mx < -TS*3 || my < -TS*3 || mx > canvas.width+TS || my > canvas.height+TS) return;
    c.save();
    c.fillStyle='rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(mx, my + TS*0.5, TS*0.5, TS*0.14, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = '#6c667a';                                     // o obelisco
    c.beginPath(); c.moveTo(mx - TS*0.28, my + TS*0.5); c.lineTo(mx - TS*0.14, my - TS*1.1);
    c.lineTo(mx + TS*0.14, my - TS*1.1); c.lineTo(mx + TS*0.28, my + TS*0.5); c.closePath(); c.fill();
    c.fillStyle = '#8a8498';
    c.beginPath(); c.moveTo(mx - TS*0.14, my - TS*1.1); c.lineTo(mx, my - TS*1.4); c.lineTo(mx + TS*0.14, my - TS*1.1); c.closePath(); c.fill();
    const gl = 0.5 + 0.5*Math.sin(now/700);                      // a estrela dos heróis
    c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.7*gl;
    c.fillStyle = '#ffd870';
    c.beginPath();
    for(let i=0;i<5;i++){ const a2 = -Math.PI/2 + i*Math.PI*2/5;
      c.lineTo(mx + Math.cos(a2)*5, my - TS*1.5 + Math.sin(a2)*5);
      const a3 = a2 + Math.PI/5;
      c.lineTo(mx + Math.cos(a3)*2.2, my - TS*1.5 + Math.sin(a3)*2.2); }
    c.closePath(); c.fill(); c.restore();
    c.restore();
  };
})();

// ===========================================================================
//  MUNDO VIVO (restaurado): clima, fauna ambiente, pet e pesca
// ===========================================================================
var _weather = {type: null, k: 0};
var _serverWx = 'limpo';
function _applyWeather(t){
  if(t === 'chuva') _weather = {type: 'chuva', k: 0.75};
  else if(t === 'tempestade') _weather = {type: 'chuva', k: 1};
  else if(t === 'neblina') _weather = {type: 'nevoa', k: 1};
  else if(t === 'neve') _weather = {type: 'neve', k: 1};
  else _weather = {type: null, k: 0};
}
var _fauna = [];
var _petTrail = [];

var socketOnReady_weather = setInterval(()=>{
  if(typeof socket === 'undefined' || !socket || socket._wxBound) return;
  socket._wxBound = true;
  socket.on('map_change', d=>{
    const nm = (d && d.map && d.map.map) || 'ermo';
    _fauna = []; _petTrail = [];
    if(nm === 'fenda'){ _fendaOpen = false; } else { _fendaFloor = 0; }
    _applyWeather(_serverWx);       // o CLIMA agora é lei do servidor
    if(nm === 'vilalbina'){
      for(let i=0;i<5;i++) _fauna.push({t:'gaivota', x: 30+Math.random()*250, y: 150+Math.random()*60, ph: Math.random()*9, voa: 0});
    }
    if(nm === 'trigal_dourado'){
      for(let i=0;i<9;i++) _fauna.push({t:'borboleta', x: 20+Math.random()*300, y: 20+Math.random()*200, ph: Math.random()*9});
    }
    if(nm === 'costa_maravai'){
      for(let i=0;i<10;i++) _fauna.push({t:'borboleta', x: 20+Math.random()*260, y: 10+Math.random()*130, ph: Math.random()*9});
      for(let i=0;i<6;i++)  _fauna.push({t:'gaivota', x: 30+Math.random()*250, y: 200+Math.random()*50, ph: Math.random()*9, voa: 0});
    }
  });
  socket.on('weather', d=>{ _serverWx = (d && d.type) || 'limpo'; _applyWeather(_serverWx); });
  socket.on('rare_drop', d=>{
    if(!d) return;
    const me = players.get(myId);
    if(me) rtAddFloat((me.rx||0)+TS/2, (me.ry||0)-6, '✨ ' + (d.rarity||'').toUpperCase() + '!', d.color || '#c98aff', true);
    toastMsg('✨ Drop ' + d.rarity + ': ' + d.name + '!');
  });
  socket.on('fish_start', ()=> openFishing());
}, 800);

function drawWeather(c, now){
  if(!_weather.type) return;
  if(_weather.type === 'chuva'){
    c.save(); c.strokeStyle = 'rgba(170,200,230,0.35)'; c.lineWidth = 1;
    const n = Math.floor(70 * _weather.k);
    for(let i=0;i<n;i++){
      const rx = ((i*997 + now*0.5) % (canvas.width + 60)) - 30;
      const ry = ((i*641 + now*0.9) % (canvas.height + 40)) - 20;
      c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx - 3, ry + 11); c.stroke();
    }
    c.fillStyle = 'rgba(90,120,160,0.06)'; c.fillRect(0, 0, canvas.width, canvas.height);
    c.restore();
  } else if(_weather.type === 'neve'){
    c.save();
    const n = Math.floor(90 * _weather.k);
    for(let i = 0; i < n; i++){
      const sz = 1.2 + (i % 3) * 0.9;
      const fx = ((i*769 + now*(0.06 + (i%4)*0.02)) % (canvas.width + 40)) - 20
                 + Math.sin(now/900 + i)*14;
      const fy = ((i*523 + now*(0.05 + (i%3)*0.018)) % (canvas.height + 40)) - 20;
      c.globalAlpha = 0.55 + (i % 4) * 0.1;
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(fx, fy, sz, 0, Math.PI*2); c.fill();
    }
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(190,210,240,0.07)';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.restore();
  } else if(_weather.type === 'nevoa'){
    c.save();
    const g = c.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, 'rgba(120,140,200,0.05)');
    g.addColorStop(1, 'rgba(120,140,200,0.13)');
    c.fillStyle = g; c.fillRect(0, 0, canvas.width, canvas.height);
    c.restore();
  }
}

function drawFaunaAndPet(c, now){
  const me = players.get(myId);
  for(const f of _fauna){
    const sx = f.x*TS - camX, sy = f.y*TS - camY;
    if(sx < -TS*3 || sy < -TS*3 || sx > canvas.width+TS*3 || sy > canvas.height+TS*3) continue;
    if(f.t === 'borboleta'){
      f.x += Math.sin(now/900 + f.ph)*0.012; f.y += Math.cos(now/1100 + f.ph)*0.01;
      const wing = Math.abs(Math.sin(now/120 + f.ph));
      c.save(); c.translate(sx, sy);
      c.fillStyle = f.ph % 2 < 1 ? '#e8a040' : '#c060c0';
      c.beginPath(); c.ellipse(-2.2*wing, 0, 2.6*wing, 1.7, -0.4, 0, Math.PI*2); c.fill();
      c.beginPath(); c.ellipse(2.2*wing, 0, 2.6*wing, 1.7, 0.4, 0, Math.PI*2); c.fill();
      c.restore();
    } else if(f.t === 'gaivota'){
      if(!f.voa && me && Math.max(Math.abs(me.x - f.x), Math.abs(me.y - f.y)) < 4) f.voa = now;
      if(f.voa){
        const k = Math.min(1, (now - f.voa)/1600);
        f.y -= 0.06; f.x += 0.05;
        if(k >= 1){ f.voa = 0; f.x = 30+Math.random()*250; f.y = 205+Math.random()*45; }
      }
      const flap = f.voa ? Math.sin(now/90)*4 : 0;
      c.save(); c.strokeStyle = '#e8e8ea'; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(sx-5, sy - flap); c.quadraticCurveTo(sx, sy - 3 - flap*0.4, sx+5, sy - flap); c.stroke();
      c.restore();
    }
  }
  if(mapName === 'costa_maravai' && Math.floor(now/700) % 5 === 0 && (now % 700) < 40){
    _fauna.push({t:'peixe', x: 20 + Math.random()*260, y: 266 + Math.random()*20, born: now});
  }
  for(let i=_fauna.length-1; i>=0; i--){
    const f = _fauna[i];
    if(f.t !== 'peixe') continue;
    const age = (now - f.born)/800;
    if(age >= 1){ _fauna.splice(i,1); continue; }
    const sx = f.x*TS - camX, sy = f.y*TS - camY - Math.sin(age*Math.PI)*14;
    c.save(); c.globalAlpha = 0.85;
    c.fillStyle = '#a8c8d8'; c.beginPath();
    c.ellipse(sx, sy, 4, 2, age*3, 0, Math.PI*2); c.fill();
    if(age > 0.8){ c.strokeStyle = 'rgba(230,245,250,0.6)';
      c.beginPath(); c.arc(f.x*TS - camX, f.y*TS - camY, 5*(age-0.8)*5, 0, Math.PI); c.stroke(); }
    c.restore();
  }
  if(me && typeof inventory !== 'undefined' &&
     (inventory||[]).some(s=> s.item === 'filhote_capivara')){
    _petTrail.push({x: me.rx, y: me.ry});
    if(_petTrail.length > 14) _petTrail.shift();
    const pos = _petTrail[0];
    if(pos){
      const sx = pos.x - camX + TS/2, sy = pos.y - camY + TS/2;
      const bob = Math.sin(now/300)*1.2;
      c.save(); c.translate(sx, sy + bob);
      c.fillStyle='rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(0, 6, 7, 2.4, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = '#a8875c';
      c.beginPath(); c.ellipse(0, 0, 7, 5.4, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = '#8a6a44';
      c.beginPath(); c.ellipse(6, -2, 4, 3.4, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = '#5a4228';
      c.beginPath(); c.ellipse(9, -1.4, 1.6, 1.2, 0, 0, Math.PI*2); c.fill();
      c.beginPath(); c.arc(5, -5, 1.3, 0, Math.PI*2); c.fill();
      c.fillStyle = '#1a1410';
      c.beginPath(); c.arc(7, -3, 0.8, 0, Math.PI*2); c.fill();
      c.restore();
    }
  }
}

var _fishing = null;
function openFishing(){
  if(_fishing) return;
  _fishing = {born: performance.now()};
  let el = document.createElement('div');
  el.id = 'fishUI';
  el.style.cssText = 'position:fixed;left:50%;bottom:24%;transform:translateX(-50%);z-index:240;'+
    'background:rgba(8,10,18,0.88);border:1px solid #3a5a7a;border-radius:12px;padding:12px 16px;text-align:center;';
  el.innerHTML = '<div style="font:700 12px Inter;color:#c9e0f0;margin-bottom:8px;">🎣 Crave na zona verde! (Espaço ou toque)</div>'+
    '<div id="fishTrack" style="position:relative;width:240px;height:16px;background:#101828;border-radius:8px;overflow:hidden;">'+
    '<div style="position:absolute;left:'+(240*0.33)+'px;width:'+(240*0.34)+'px;top:0;bottom:0;background:rgba(80,200,110,0.35);border-left:1px solid #4aa86a;border-right:1px solid #4aa86a;"></div>'+
    '<div id="fishCur" style="position:absolute;top:1px;width:5px;height:14px;background:#f0d870;border-radius:2px;box-shadow:0 0 6px #f0d870;"></div></div>';
  document.body.appendChild(el);
  el.addEventListener('pointerdown', fishStrike);
  _fishing.frame = ()=>{
    if(!_fishing) return;
    const t = (performance.now() - _fishing.born)/1000;
    _fishing.pos = 0.5 + 0.5*Math.sin(t*3.4);
    const cur = document.getElementById('fishCur');
    if(cur) cur.style.left = (_fishing.pos*235) + 'px';
    if(t > 10){ closeFishing(); return; }
    requestAnimationFrame(_fishing.frame);
  };
  requestAnimationFrame(_fishing.frame);
}
function fishStrike(){
  if(!_fishing) return;
  socket.emit('fish_hit', {pos: _fishing.pos || 0});
  closeFishing();
}
function closeFishing(){
  _fishing = null;
  const el = document.getElementById('fishUI');
  if(el) el.remove();
}
window.addEventListener('keydown', e=>{
  if(_fishing && e.code === 'Space'){ e.preventDefault(); fishStrike(); }
});

// ===========================================================================
//  MAGIA EM TEMPO REAL (cliente): hotbar 1-5, mana e efeitos
// ===========================================================================
var rtMana = {mana: 0, max: 0};
var rtSpells = [];
var _rtCastAt = 0;

function buildHotbar(){
  let el = document.getElementById('rtHotbar');
  if(el) el.remove();
  if(!rtSpells.length) return;
  el = document.createElement('div');
  el.id = 'rtHotbar';
  el.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:60;'+
    'display:flex;flex-direction:column;gap:5px;align-items:center;pointer-events:auto;';
  let mana = '<div id="rtManaWrap" style="width:'+(rtSpells.length*52)+'px;height:7px;background:#0c1224;'+
    'border:1px solid #2a3a66;border-radius:4px;overflow:hidden;">'+
    '<div id="rtManaFill" style="height:100%;width:0%;background:linear-gradient(90deg,#3a7ae0,#7ab0ff);"></div></div>';
  let slots = '<div style="display:flex;gap:6px;">';
  rtSpells.forEach((sp, i)=>{
    slots += '<div class="rtSlot" data-sp="'+sp.id+'" style="position:relative;width:46px;height:46px;'+
      'background:rgba(10,14,26,0.88);border:1px solid #3a4a7a;border-radius:9px;cursor:pointer;'+
      'display:flex;flex-direction:column;align-items:center;justify-content:center;user-select:none;">'+
      '<div style="font:800 13px Inter;color:#c9d8ff;line-height:1;">'+(i+1)+'</div>'+
      '<div style="font:600 7.5px Inter;color:#8a97c0;text-align:center;padding:0 2px;line-height:1.1;">'+sp.name+'</div>'+
      '<div style="font:700 8px Inter;color:'+(sp.cost?'#7ab0ff':'#8fd08f')+';">'+(sp.cost||'livre')+'</div>'+
      '<div class="rtCd" style="position:absolute;inset:0;border-radius:9px;background:rgba(6,8,14,0.75);display:none;"></div></div>';
  });
  slots += '</div>';
  el.innerHTML = mana + slots +
    '<div style="font:600 9px Inter;color:#7a86a8;text-shadow:0 1px 3px #000;">1-5 conjurar · Tab alvo · Esc soltar · M mapa</div>';
  document.body.appendChild(el);
  el.querySelectorAll('.rtSlot').forEach((s, idx)=>{
    s.addEventListener('pointerdown', ev=>{
      if(ev.button === 2) return;
      s._lp = setTimeout(()=> openSlotPicker(idx), 550);
      ev.preventDefault(); rtCast(s.getAttribute('data-sp'));
    });
    s.addEventListener('pointerup', ()=> clearTimeout(s._lp));
    s.addEventListener('contextmenu', ev=>{ ev.preventDefault(); openSlotPicker(idx); });
  });
  updateManaBar();
}
function updateManaBar(){
  const fl = document.getElementById('rtManaFill');
  if(fl && rtMana.max) fl.style.width = Math.round(100*rtMana.mana/rtMana.max) + '%';
}
function rtCast(spellId){
  const now = performance.now();
  if(now - _rtCastAt < 1500) return;
  _rtCastAt = now;
  socket.emit('rt_cast', {spell: spellId, target: rtTargetId});
  document.querySelectorAll('#rtHotbar .rtCd').forEach(cd=>{
    cd.style.display = 'block';
    setTimeout(()=>{ cd.style.display = 'none'; }, 1500);
  });
}
window.addEventListener('keydown', e=>{
  if(typeof started === 'undefined' || !started || typingInField(e)) return;
  const n = {'Digit1':0,'Digit2':1,'Digit3':2,'Digit4':3,'Digit5':4}[e.code];
  if(n != null && rtSpells[n]){ e.preventDefault(); rtCast(rtSpells[n].id); }
});

var _gotGrimoire = false;
var bindArcano = setInterval(()=>{
  if(typeof socket === 'undefined' || !socket) return;
  // pede o grimório em loop até o servidor responder (só depois do login)
  if(socket._arcBound){
    if(!_gotGrimoire && typeof started !== 'undefined' && started) socket.emit('grimoire_get');
    if(!_gotQuests && typeof started !== 'undefined' && started) socket.emit('quests_get');
    if(typeof myFicha !== 'undefined' && myFicha && myFicha.posture && !document.getElementById('postureBadge')){
      const _lp = ((posturesData||{})[myFicha.class_id]||[]).find(x=> x.id === myFicha.posture);
      if(_lp) updatePostureBadge(_lp.icon, _lp.name);
    }
    return;
  }
  socket._arcBound = true;
  socket.on('mana', d=>{ if(d){ rtMana = {mana: d.mana, max: d.max}; updateManaBar(); } });
  socket.on('grimoire', g=>{
    if(!g) return;
    _gotGrimoire = true;
    if(!g.caster || !g.chosen) return;              // classe sem magia: sem hotbar mesmo
    const CUSTO = lv => lv === 0 ? 0 : 8 + 6*lv;
    const det = id => {
      let sp = null;
      (g.pool.cantrips||[]).forEach(s=>{ if(s.id===id) sp = s; });
      Object.values(g.pool.by_level||{}).forEach(arr=> arr.forEach(s=>{ if(s.id===id) sp = s; }));
      return sp;
    };
    const usaveis = [];
    [].concat(g.chosen.cantrips||[], g.chosen.spells||[]).forEach(id=>{
      const sp = det(id);
      if(sp && ['attack','save','auto','heal'].includes(sp.kind))
        usaveis.push({id: sp.id, name: sp.name, cost: CUSTO(sp.level||0), kind: sp.kind});
    });
    usaveis.sort((a,b)=> a.cost - b.cost);
    rtSpellsAll = usaveis;
    let salvos = null;
    try{ salvos = JSON.parse(localStorage.getItem('ermo_hotbar') || 'null'); }catch(e){}
    if(salvos && salvos.length){
      const fix = salvos.map(id => usaveis.find(s=>s.id===id)).filter(Boolean).slice(0,5);
      if(fix.length){ rtSpells = fix; buildHotbar(); return; }
    }
    const antes = rtSpells.length;
    rtSpells = usaveis.slice(0, 5);
    buildHotbar();
    if(rtSpells.length && !antes)
      toastMsg('✨ Hotbar arcana ativa! Teclas 1-5 conjuram · Tab mira o alvo');
    else if(!rtSpells.length)
      toastMsg('Suas magias preparadas são de suporte. Escolha ataques/curas no Grimório (Ficha) pra hotbar.', true);
  });
  socket.on('quests', d=>{ if(d){ _questsData = d; _gotQuests = true; if(_diaryEl) renderDiary(); } });
  socket.on('quest_marks', d=>{ questMarks = (d && d.marks) || {}; });
  socket.on('party_hp', d=>{ if(d) renderPartyHud(d.members || []); });
  socket.on('player_title', d=>{ const p = players.get(d && d.id); if(p) p.title = (d && d.title) || ''; });
  socket.on('forge_open', d=>{ if(d) openForge(d); });
  socket.on('skills', d=>{ if(d){ _skillsData = d; if(_skillsEl) renderSkills(); if(d.mode) updateFightBtns(d.mode); } });
  socket.on('fight_mode', d=>{ if(d && d.mode) updateFightBtns(d.mode); });
  socket.on('arena_open', d=>{ if(d) openArena(d); });
  socket.on('duel_offer', d=>{ if(d) showDuelOffer(d); });
  socket.on('duel_start', d=>{ if(d){ showDuelBanner(d.foe, d.bet); startMusic('boss'); } });
  socket.on('duel_end', d=>{ hideDuelBanner(); stopMusic(); sfx(d && d.win ? 'legend' : 'mydeath'); });
  socket.on('fenda_open', d=>{ _fendaOpen = true; if(d && d.floor) _fendaFloor = d.floor; sfx('event'); });
  socket.on('plaza', d=>{ if(d) _plazaData = d; });
  socket.on('garden', d=>{ if(d) _gardenPlots = d.plots || []; });
  socket.on('rt_aoe', d=>{
    if(!d) return;
    rtAoes.push({x: d.x, y: d.y, r: d.r || 1, dtype: d.dtype || 'energia', t0: performance.now()});
    spellSfx(d.dtype || 'energia');
    if(_sfxOn && _audio()){ _noise(0.3, {freq: 320, vol: 0.2}); _tone(52, 0.32, {type: 'sine', vol: 0.18}); }
  });
  socket.on('codex', d=>{ if(d){ _codexData = d; if(_codexEl) renderCodex(); } });
  socket.on('market_open', d=>{ if(d) openMarket(d); });
  socket.on('market_update', d=>{ if(d && _mktEl){ _mktData = d; renderMarket(); } });
  socket.on('trade_offer', d=>{ if(d) showTradeOffer(d); });
  socket.on('posture_set', d=>{
    if(typeof myFicha !== 'undefined' && myFicha) myFicha.posture = (d && d.posture) || null;
    updatePostureBadge(d && d.icon, d && d.name);
  });
  socket.on('rt_selfheal', d=>{
    if(!d) return;
    const me = players.get(myId);
    if(me) rtAddFloat((me.rx||0)+TS/2, (me.ry||0), '+' + d.amount, '#6adf6a', true);
  });
  socket.on('rt_mheal', d=>{
    if(!d) return;
    const p = players.get(d.id);
    if(p){ p.hp = d.hp; p.hp_max = d.hp_max;
      rtAddFloat((p.rx||p.x*TS)+(p.size||1)*TS/2, (p.ry||p.y*TS), '+' + d.amount, '#6adf6a', false);
      if(d.ab) rtAddFloat((p.rx||p.x*TS)+(p.size||1)*TS/2, (p.ry||p.y*TS)-14, d.ab, '#a8ffb0', false); }
  });
  socket.emit('grimoire_get');            // popula a hotbar ao entrar
}, 900);

// ===========================================================================
//  INTERIORES CUSTOMIZADOS: cada oficina com alma própria (arte à mão)
// ===========================================================================
function drawInteriorDecor(c, now){
  const P = (tx, ty)=> [tx*TS - camX, ty*TS - camY];
  c.save();
  if(mapName === 'oficina_ferreiro'){
    let [x, y] = P(10.5, 3.2);                       // A FORJA acesa
    c.fillStyle = '#3a3238'; c.fillRect(x - TS*0.9, y - TS*0.5, TS*1.8, TS*1.3);
    c.fillStyle = '#241f26'; c.fillRect(x - TS*0.6, y - TS*0.2, TS*1.2, TS*0.7);
    c.save(); c.globalCompositeOperation = 'lighter';
    for(let i=0;i<3;i++){
      const fl = 0.6 + 0.4*Math.sin(now/140 + i*2);
      c.globalAlpha = 0.85*fl;
      c.fillStyle = i===0 ? '#ffd070' : (i===1 ? '#ff9a30' : '#ff5a18');
      c.beginPath();
      c.moveTo(x - TS*0.4, y + TS*0.4);
      c.quadraticCurveTo(x + Math.sin(now/110+i)*4, y - TS*(0.1 + i*0.14), x + TS*0.4, y + TS*0.4);
      c.closePath(); c.fill();
    }
    c.restore();
    [x, y] = P(5.5, 3.6);                            // a BIGORNA clássica
    c.fillStyle = '#2a2a32'; c.fillRect(x - TS*0.32, y + TS*0.18, TS*0.64, TS*0.2);
    c.fillStyle = '#4a4a56';
    c.beginPath(); c.moveTo(x - TS*0.55, y - TS*0.05); c.lineTo(x + TS*0.35, y - TS*0.05);
    c.lineTo(x + TS*0.62, y - TS*0.22); c.lineTo(x + TS*0.62, y - TS*0.05);
    c.lineTo(x + TS*0.35, y + TS*0.18); c.lineTo(x - TS*0.4, y + TS*0.18); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(x - TS*0.5, y - TS*0.05, TS*0.9, 2);
    const sp = (now % 900) < 90;                     // fagulhas do martelo
    if(sp){ c.save(); c.globalCompositeOperation='lighter'; c.fillStyle='#ffd070';
      for(let i=0;i<4;i++) c.fillRect(x + (Math.random()-0.5)*TS, y - TS*0.3 - Math.random()*8, 2, 2);
      c.restore(); }
  } else if(mapName === 'oficina_coureiro'){
    let [x, y] = P(3.2, 5.2);                        // couro esticado na armação
    c.strokeStyle = '#4a3820'; c.lineWidth = 3;
    c.strokeRect(x - TS*0.7, y - TS*0.9, TS*1.4, TS*1.8);
    c.fillStyle = '#a8703c';
    c.beginPath(); c.ellipse(x, y, TS*0.52, TS*0.72, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = '#8a5a30';
    c.beginPath(); c.ellipse(x - TS*0.1, y - TS*0.15, TS*0.2, TS*0.28, 0.3, 0, Math.PI*2); c.fill();
    [x, y] = P(10.6, 3.4);                           // mesa com facas e pele
    c.fillStyle = '#c9a05a'; c.fillRect(x - TS*0.8, y, TS*1.6, TS*0.5);
    c.fillStyle = '#d8e0e8'; c.fillRect(x - TS*0.4, y + TS*0.12, TS*0.5, 3);
    c.fillRect(x + TS*0.15, y + TS*0.22, TS*0.4, 3);
  } else if(mapName === 'oficina_costureiro'){
    let [x, y] = P(3.8, 3.4);                        // o TEAR com fios
    c.strokeStyle = '#6a4a2c'; c.lineWidth = 3.4;
    c.strokeRect(x - TS*0.75, y - TS*0.65, TS*1.5, TS*1.35);
    const cores = ['#e089a8', '#89a8e0', '#e0cf89', '#8fd08f'];
    for(let i=0;i<9;i++){
      c.strokeStyle = cores[i % 4]; c.lineWidth = 1.6;
      const fx = x - TS*0.6 + i*TS*0.15;
      c.beginPath(); c.moveTo(fx, y - TS*0.6);
      c.lineTo(fx + Math.sin(now/700 + i)*1.5, y + TS*0.62); c.stroke();
    }
    c.fillStyle = '#8a5a30'; c.fillRect(x - TS*0.7, y - TS*0.05 + Math.sin(now/500)*TS*0.2, TS*1.4, 4);
    [x, y] = P(10.2, 5.4);                           // rolos de pano
    for(let i=0;i<3;i++){
      c.fillStyle = cores[i];
      c.beginPath(); c.ellipse(x + i*TS*0.5, y, TS*0.2, TS*0.42, 0.2, 0, Math.PI*2); c.fill();
    }
  } else if(mapName === 'oficina_carpinteiro'){
    let [x, y] = P(7.2, 4.3);                        // bancada com tora e SERRA
    c.fillStyle = '#8a6438';
    c.beginPath(); c.ellipse(x - TS*0.9, y - TS*0.1, TS*0.55, TS*0.26, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = '#c9a464';
    c.beginPath(); c.ellipse(x - TS*0.9, y - TS*0.1, TS*0.34, TS*0.15, 0, 0, Math.PI*2); c.fill();
    const sw = Math.sin(now/260)*TS*0.16;            // serrote indo e vindo
    c.fillStyle = '#c9ccd4';
    c.beginPath(); c.moveTo(x + TS*0.1 + sw, y - TS*0.34);
    c.lineTo(x + TS*1.15 + sw, y - TS*0.22); c.lineTo(x + TS*1.15 + sw, y - TS*0.1);
    for(let i=6;i>=0;i--) c.lineTo(x + TS*0.15 + i*TS*0.14 + sw, y - TS*(0.1 - (i%2)*0.05));
    c.closePath(); c.fill();
    c.fillStyle = '#6a4a2c'; c.fillRect(x + TS*1.1 + sw, y - TS*0.3, TS*0.28, TS*0.14);
    c.fillStyle = 'rgba(216,196,150,0.5)';           // serragem
    for(let i=0;i<7;i++) c.fillRect(x - TS*0.4 + (i*37 % 60), y + TS*0.3 + (i*17 % 14), 2.4, 1.6);
    [x, y] = P(11.6, 6.3);                           // pilha de tábuas
    for(let i=0;i<3;i++){ c.fillStyle = i%2 ? '#a8824a' : '#8a6438';
      c.fillRect(x - TS*0.7, y - i*5, TS*1.4, 4.4); }
  } else if(mapName === 'oficina_alquimista'){
    let [x, y] = P(7.5, 3.5);                        // CALDEIRÃO borbulhando
    c.fillStyle = '#22261e';
    c.beginPath(); c.ellipse(x, y + TS*0.15, TS*0.7, TS*0.5, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = '#3a4034';
    c.beginPath(); c.ellipse(x, y - TS*0.15, TS*0.66, TS*0.24, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = '#5ad86a';
    c.beginPath(); c.ellipse(x, y - TS*0.15, TS*0.52, TS*0.16, 0, 0, Math.PI*2); c.fill();
    c.save(); c.globalCompositeOperation='lighter';
    for(let i=0;i<3;i++){                            // bolhas + vapor
      const ph = ((now/60) + i*20) % 50;
      c.globalAlpha = 0.5*(1 - ph/50);
      c.fillStyle = '#8affa0';
      c.beginPath(); c.arc(x + Math.sin(now/300+i*2)*TS*0.3, y - TS*0.2 - ph*0.5, 2.4 + ph*0.06, 0, Math.PI*2); c.fill();
    }
    c.restore();
    for(const [px2, py2] of [P(3.4, 2.4), P(11.6, 2.4)]){   // prateleiras de frascos
      c.fillStyle = '#5a4228'; c.fillRect(px2 - TS*0.7, py2 + TS*0.3, TS*1.4, 3);
      const fc = ['#e05858', '#58a8e0', '#e0c958', '#a858e0'];
      for(let i=0;i<4;i++){
        c.fillStyle = fc[i];
        const gl = 0.7 + 0.3*Math.sin(now/500 + i + px2);
        c.globalAlpha = gl;
        c.fillRect(px2 - TS*0.55 + i*TS*0.32, py2 + TS*0.02, TS*0.16, TS*0.28);
        c.globalAlpha = 1;
      }
    }
  } else if(mapName === 'oficina_joalheiro'){
    let [x, y] = P(7.5, 4.3);                        // VITRINE com gemas girando
    c.fillStyle = '#2a2436'; c.fillRect(x - TS*1.5, y - TS*0.4, TS*3, TS*0.9);
    c.fillStyle = 'rgba(160,190,230,0.22)'; c.fillRect(x - TS*1.4, y - TS*0.34, TS*2.8, TS*0.5);
    const gc = ['#d060c0', '#60c0d0', '#e0c040'];
    for(let i=0;i<3;i++){
      const gx2 = x - TS*0.9 + i*TS*0.9;
      const rot = now/800 + i*2;
      c.save(); c.translate(gx2, y - TS*0.06); c.rotate(rot);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = 0.5 + 0.4*Math.sin(now/300 + i);
      c.fillStyle = gc[i];
      c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 0); c.lineTo(0, 6); c.lineTo(-4.5, 0);
      c.closePath(); c.fill(); c.restore(); c.restore();
    }
    [x, y] = P(7.5, 6.4);                            // tapete de veludo
    c.fillStyle = 'rgba(90,40,90,0.4)';
    c.beginPath(); c.ellipse(x, y, TS*1.6, TS*0.6, 0, 0, Math.PI*2); c.fill();
  } else if(mapName === 'oficina_cozinheiro'){
    let [x, y] = P(4.8, 3.3);                        // FOGÃO com panela fumegando
    c.fillStyle = '#3a3238'; c.fillRect(x - TS*1.0, y - TS*0.2, TS*2.0, TS*0.8);
    c.fillStyle = '#22262a';
    c.beginPath(); c.ellipse(x - TS*0.4, y - TS*0.22, TS*0.34, TS*0.14, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = '#5a3020';
    c.beginPath(); c.ellipse(x + TS*0.45, y - TS*0.24, TS*0.3, TS*0.13, 0, 0, Math.PI*2); c.fill();
    c.save(); c.globalCompositeOperation='lighter';
    for(let i=0;i<2;i++){                            // vapor da panela
      const ph = ((now/70) + i*22) % 44;
      c.globalAlpha = 0.35*(1 - ph/44);
      c.fillStyle = '#f0e8d8';
      c.beginPath(); c.arc(x - TS*0.4 + Math.sin(now/400+i)*3, y - TS*0.35 - ph*0.55, 2.6 + ph*0.09, 0, Math.PI*2); c.fill();
    }
    c.restore();
    [x, y] = P(10.4, 3.2);                           // presuntos pendurados
    c.strokeStyle = '#4a3820'; c.lineWidth = 1.4;
    for(let i=0;i<2;i++){
      const hx2 = x + i*TS*0.7, sw2 = Math.sin(now/900 + i)*2;
      c.beginPath(); c.moveTo(hx2, y - TS*0.4); c.lineTo(hx2 + sw2, y); c.stroke();
      c.fillStyle = '#a84a3a';
      c.beginPath(); c.ellipse(hx2 + sw2, y + TS*0.22, TS*0.16, TS*0.28, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = '#e8d0b8';
      c.beginPath(); c.ellipse(hx2 + sw2, y + TS*0.06, TS*0.1, TS*0.06, 0, 0, Math.PI*2); c.fill();
    }
  } else if(mapName === 'templo_doze'){
    let [x, y] = P(10.5, 2.6);                       // O ALTAR DOS DOZE
    c.fillStyle = '#55506a'; c.fillRect(x - TS*2.2, y - TS*0.5, TS*4.4, TS*1.0);
    c.fillStyle = '#6c667a'; c.fillRect(x - TS*2.4, y - TS*0.66, TS*4.8, TS*0.26);
    c.save(); c.globalCompositeOperation='lighter';   // chama sagrada central
    const fl = 0.6 + 0.4*Math.sin(now/180);
    c.globalAlpha = 0.9*fl;
    c.fillStyle = '#f6dfa0';
    c.beginPath(); c.moveTo(x - 5, y - TS*0.6);
    c.quadraticCurveTo(x + Math.sin(now/130)*3, y - TS*1.3 - fl*6, x + 5, y - TS*0.6);
    c.closePath(); c.fill();
    const g = c.createRadialGradient(x, y - TS*0.7, 0, x, y - TS*0.7, TS*3.2);
    g.addColorStop(0, 'rgba(246,223,160,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 1; c.fillStyle = g;
    c.beginPath(); c.arc(x, y - TS*0.7, TS*3.2, 0, Math.PI*2); c.fill();
    c.restore();
    // tapete vermelho da porta ao altar
    c.fillStyle = 'rgba(140,40,50,0.34)';
    c.fillRect(10*TS - camX + TS*0.06, 3.6*TS - camY, TS*0.9, TS*10.4);
    c.fillStyle = 'rgba(220,180,90,0.4)';
    c.fillRect(10*TS - camX + TS*0.06, 3.6*TS - camY, TS*0.9, 2);
    // 12 NICHOS dos deuses nas paredes laterais (símbolos dourados pulsando)
    c.save();
    for(let i=0;i<12;i++){
      const lado = i < 6 ? 1.0 : 19.0;
      const ny = 3.4 + (i % 6) * 1.85;
      const [nx2, ny2] = P(lado + (i < 6 ? 0.5 : -0.5), ny);
      c.fillStyle = '#2a2440';
      c.fillRect(nx2 - 7, ny2 - 10, 14, 20);
      c.strokeStyle = '#c9a860'; c.lineWidth = 1; c.strokeRect(nx2 - 7, ny2 - 10, 14, 20);
      const gl = 0.5 + 0.5*Math.sin(now/600 + i*1.3);
      c.save(); c.globalCompositeOperation='lighter'; c.globalAlpha = gl;
      c.fillStyle = '#f0d888';
      c.beginPath(); c.arc(nx2, ny2 - 1, 3.4, 0, Math.PI*2); c.fill();
      c.beginPath(); c.arc(nx2, ny2 - 1, 5.6 + gl*1.4, 0, Math.PI*2);
      c.strokeStyle = 'rgba(240,216,136,0.5)'; c.stroke();
      c.restore();
    }
    c.restore();
  }
  c.restore();
}

// ---------- editor da hotbar: toque longo ou clique direito no slot ----------
var rtSpellsAll = rtSpellsAll || [];
function openSlotPicker(idx){
  let m = document.getElementById('slotPicker');
  if(m) m.remove();
  if(!rtSpellsAll.length) return;
  m = document.createElement('div');
  m.id = 'slotPicker';
  m.style.cssText = 'position:fixed;inset:0;z-index:270;display:flex;align-items:flex-end;justify-content:center;'+
    'background:rgba(6,8,14,0.6);padding-bottom:90px;';
  let h = '<div style="width:min(340px,92vw);max-height:56vh;overflow:auto;background:#141a28;'+
    'border:1px solid #3a4a7a;border-radius:12px;padding:12px;">'+
    '<div style="font:800 13px Inter;color:#e8e4f0;margin-bottom:8px;">Slot '+(idx+1)+': escolha a magia</div>';
  for(const sp of rtSpellsAll){
    h += '<div class="pickSp" data-id="'+sp.id+'" style="display:flex;justify-content:space-between;'+
      'padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid #26314e;margin-bottom:5px;background:#101624;">'+
      '<span style="font:700 12px Inter;color:#c9d8ff;">'+sp.name+'</span>'+
      '<span style="font:700 11px Inter;color:'+(sp.cost?'#7ab0ff':'#8fd08f')+';">'+(sp.cost||'livre')+'</span></div>';
  }
  h += '</div>';
  m.innerHTML = h;
  m.addEventListener('click', ev=>{ if(ev.target === m) m.remove(); });
  m.querySelectorAll('.pickSp').forEach(el=>{
    el.addEventListener('click', ()=>{
      const sp = rtSpellsAll.find(s=>s.id === el.getAttribute('data-id'));
      if(sp){
        while(rtSpells.length <= idx) rtSpells.push(rtSpellsAll[rtSpells.length] || sp);
        rtSpells[idx] = sp;
        try{ localStorage.setItem('ermo_hotbar', JSON.stringify(rtSpells.map(s=>s.id))); }catch(e){}
        buildHotbar();
        toastMsg('Slot ' + (idx+1) + ': ' + sp.name);
      }
      m.remove();
    });
  });
  document.body.appendChild(m);
}

// ===========================================================================
//  POSTURAS DE VALÍRIA: passiva FIXA do Paladino (padrão da Forma Selvagem)
// ===========================================================================
function _fichaPosturas(f){
  const lista = (typeof posturesData !== 'undefined' && posturesData[f.class_id]) || [];
  if(!lista.length) return '';
  const ativa = f.posture || null;
  let h = '<div style="font:600 11px Inter;color:#8a86a0;margin:16px 0 6px;letter-spacing:.5px;text-transform:uppercase">Posturas de Valíria</div>';
  if(ativa){
    const ap = lista.find(x=> x.id===ativa);
    h += '<div style="margin:0 0 8px;padding:9px 11px;background:linear-gradient(135deg,#3a2c14,#2a2110);border:1px solid #c9a860;border-radius:10px;display:flex;align-items:center;gap:10px">'+
      '<span style="font-size:22px;line-height:1">'+(ap?ap.icon:'🛡️')+'</span>'+
      '<div style="flex:1;min-width:0"><div style="font:700 13px Cinzel,serif;color:#f0d888">Postura fixa: '+esc(ap?ap.name:ativa)+'</div>'+
      '<div style="font-size:11px;color:#b0a88a;margin-top:1px;line-height:1.3">'+(ap?esc(ap.desc):'')+'</div></div></div>';
    h += '<button data-posture="" style="width:100%;padding:8px;margin-bottom:10px;background:#2a2433;border:1px solid #4a4360;border-radius:9px;color:#d8d2e8;font:600 12px Inter;cursor:pointer">↺ Voltar à postura neutra</button>';
  }
  h += lista.map(p=>{
    const on = p.id===ativa;
    return '<div style="margin:0 0 7px;padding:9px 11px;background:'+(on?'#2e2513':'#1b1830')+';border:1px solid '+(on?'#c9a860':'#2e2a47')+';border-radius:9px;display:flex;align-items:center;gap:9px">'+
      '<span style="font-size:18px;line-height:1">'+p.icon+'</span>'+
      '<div style="flex:1;min-width:0"><div style="font:700 12.5px Inter;color:#e0c98a">'+esc(p.name)+'</div>'+
      '<div style="font-size:11px;color:#9b95b4;margin-top:1px;line-height:1.3">'+esc(p.desc)+'</div></div>'+
      (on ? '<span style="font:700 10px Inter;color:#f0d888;white-space:nowrap">FIXA</span>'
          : '<button data-posture="'+esc(p.id)+'" style="flex:0 0 auto;padding:5px 12px;background:#4a3a1a;border:1px solid #c9a860;border-radius:7px;color:#f6e8c0;font:600 11px Inter;cursor:pointer">Assumir</button>')+
      '</div>';
  }).join('');
  h += '<div style="font-size:10.5px;color:#6f6a86;margin-top:2px;line-height:1.3">A postura é PASSIVA e fica gravada na ficha: vale em todo combate até você trocar aqui.</div>';
  return h;
}

function updatePostureBadge(icon, name){
  let el = document.getElementById('postureBadge');
  if(!icon || !name){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div');
    el.id = 'postureBadge';
    el.style.cssText = 'position:fixed;left:12px;bottom:14px;z-index:59;background:rgba(22,17,8,0.85);'+
      'border:1px solid #c9a860;border-radius:9px;padding:6px 10px;font:700 11px Inter;color:#f0d888;pointer-events:none;text-shadow:0 1px 3px #000;';
    document.body.appendChild(el);
  }
  el.textContent = icon + ' ' + name;
}

// ===========================================================================
//  MISSÕES (cliente): marcas ! e ? sobre NPCs + Diário na tecla J
// ===========================================================================
var questMarks = {};
var _questsData = null;
var _gotQuests = false;
var _diaryEl = null;

function drawQuestMarks(c, now){
  if(!questMarks) return;
  const bob = Math.sin(now/280) * 2.4;
  for(const [nid, mark] of Object.entries(questMarks)){
    const p = players.get(nid);
    if(!p) continue;
    const sx = (p.rx != null ? p.rx : p.x*TS) + TS/2 - camX;
    const sy = (p.ry != null ? p.ry : p.y*TS) - camY - 14 + bob;
    if(sx < -TS || sy < -TS || sx > canvas.width+TS || sy > canvas.height+TS) continue;
    c.save();
    c.font = '800 15px Inter';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const col = mark === '?' ? '#8fe08f' : '#ffd24a';
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35 + 0.2*Math.sin(now/300);
    c.fillStyle = col;
    c.beginPath(); c.arc(sx, sy, 9, 0, Math.PI*2); c.fill();
    c.restore();
    c.lineWidth = 3; c.strokeStyle = 'rgba(10,8,4,0.9)';
    c.strokeText(mark, sx, sy);
    c.fillStyle = col;
    c.fillText(mark, sx, sy);
    c.restore();
  }
}

function openDiary(){
  if(_diaryEl){ closeDiary(); return; }
  _diaryEl = document.createElement('div');
  _diaryEl.id = 'questDiary';
  _diaryEl.style.cssText = 'position:fixed;inset:0;z-index:230;display:flex;align-items:center;justify-content:center;background:rgba(6,8,14,0.62);';
  _diaryEl.addEventListener('click', ev=>{ if(ev.target === _diaryEl) closeDiary(); });
  document.body.appendChild(_diaryEl);
  renderDiary();
  socket.emit('quests_get');
}
function closeDiary(){ if(_diaryEl){ _diaryEl.remove(); _diaryEl = null; } }
function renderDiary(){
  if(!_diaryEl) return;
  const d = _questsData || {active: [], done: 0};
  let h = '<div style="width:min(420px,94vw);max-height:74vh;overflow:auto;background:#141126;'+
    'border:1px solid #6d5a30;border-radius:14px;padding:16px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'+
    '<div style="font:800 15px Cinzel,serif;color:#f0d888;">📜 Diário de Missões</div>'+
    '<div style="font:600 11px Inter;color:#8a86a0;">'+(d.done||0)+' concluída(s)</div></div>';
  if(!d.active.length){
    h += '<div style="font:500 12px Inter;color:#9b95b4;line-height:1.5;padding:8px 0;">Nenhuma missão ativa. Procure NPCs com <b style="color:#ffd24a">!</b> dourado pelo mundo: cada um tem uma história (e uma relíquia) pra você.</div>';
  }
  for(const q of d.active){
    h += '<div style="margin:0 0 10px;padding:11px 12px;background:'+(q.ready?'#1e2412':'#191630')+';border:1px solid '+(q.ready?'#7aa84a':'#2e2a47')+';border-radius:10px;">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;">'+
      '<div style="font:700 13px Inter;color:#e0c98a;">'+q.name+'</div>'+
      (q.ready?'<div style="font:800 10px Inter;color:#a8e07a;white-space:nowrap;">✅ ENTREGAR</div>':'')+'</div>'+
      '<div style="font:500 11px Inter;color:#9b95b4;line-height:1.45;margin:5px 0 7px;">'+q.story+'</div>';
    for(const s of (q.steps||[])){
      h += '<div style="font:600 11.5px Inter;color:'+(s.done?'#8fe08f':'#c9d8ff')+';margin:2px 0;">'+
        (s.done?'✓ ':'• ')+s.text+(s.count>1?' <span style="color:#8a86a0">('+s.n+'/'+s.count+')</span>':'')+'</div>';
    }
    for(const cItem of (q.collect||[])){
      const ok = cItem.have >= cItem.need;
      h += '<div style="font:600 11.5px Inter;color:'+(ok?'#8fe08f':'#c9d8ff')+';margin:2px 0;">'+
        (ok?'✓ ':'• ')+'Levar '+cItem.need+'x '+cItem.name+' <span style="color:#8a86a0">('+cItem.have+'/'+cItem.need+')</span></div>';
    }
    h += '<div style="font:600 10.5px Inter;color:#c9a860;margin-top:6px;">→ Entregar: fale com '+q.npc+'</div></div>';
  }
  h += '<div style="font:500 10px Inter;color:#6f6a86;margin-top:4px;">Tecla J abre e fecha o Diário.</div></div>';
  _diaryEl.innerHTML = h;
}
window.addEventListener('keydown', e=>{
  if(typeof started === 'undefined' || !started || typingInField(e)) return;
  if(e.code === 'KeyJ'){ e.preventDefault(); openDiary(); }
});

// ===========================================================================
//  ERMO ÁUDIO: motor procedural completo (Web Audio, zero arquivos)
//  Combate + magias por elemento + interface + ambiente por mapa +
//  música só nos momentos (boss, taverna, templo).
// ===========================================================================
var _ac = null, _masterG = null, _noiseBuf = null;
var _sfxOn = true;
try{ _sfxOn = localStorage.getItem('ermo_sound') !== 'off'; }catch(e){}
var _ambNodes = [], _ambKey = '';
var _musicMode = null, _musicTimer = null, _musicStep = 0;
var _lastLevelSnd = 0, _lastCoinSnd = 0, _prevQuestSnap = null;

function _audio(){
  if(_ac) return _ac;
  try{
    _ac = new (window.AudioContext || window.webkitAudioContext)();
    _masterG = _ac.createGain();
    _masterG.gain.value = _sfxOn ? 0.5 : 0.0001;
    _masterG.connect(_ac.destination);
    const len = _ac.sampleRate;
    _noiseBuf = _ac.createBuffer(1, len, _ac.sampleRate);
    const ch = _noiseBuf.getChannelData(0);
    for(let i=0;i<len;i++) ch[i] = Math.random()*2 - 1;
  }catch(e){ _ac = null; }
  return _ac;
}
window.addEventListener('pointerdown', ()=>{ const a=_audio(); if(a && a.state==='suspended') a.resume(); });
window.addEventListener('keydown', ()=>{ const a=_audio(); if(a && a.state==='suspended') a.resume(); });

function _tone(freq, dur, o){
  const a = _audio(); if(!a) return;
  o = o || {};
  const t0 = a.currentTime + (o.delay || 0);
  const osc = a.createOscillator(), g = a.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if(o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(o.vol || 0.16, t0 + (o.attack || 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(_masterG);
  osc.start(t0); osc.stop(t0 + dur + 0.03);
}
function _noise(dur, o){
  const a = _audio(); if(!a || !_noiseBuf) return;
  o = o || {};
  const t0 = a.currentTime + (o.delay || 0);
  const src = a.createBufferSource(); src.buffer = _noiseBuf; src.loop = true;
  const f = a.createBiquadFilter();
  f.type = o.hp ? 'highpass' : 'lowpass';
  f.frequency.setValueAtTime(o.freq || 900, t0);
  if(o.slideF) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.slideF), t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(o.vol || 0.12, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(_masterG);
  src.start(t0); src.stop(t0 + dur + 0.03);
}

function sfx(name){
  if(!_sfxOn || !_audio()) return;
  switch(name){
    case 'hit':    _noise(0.09, {freq: 500, vol: 0.16}); _tone(95, 0.08, {type:'square', vol: 0.08}); break;
    case 'crit':   _noise(0.12, {freq: 420, vol: 0.2}); _tone(70, 0.14, {type:'square', vol: 0.12});
                   _noise(0.08, {freq: 700, vol: 0.12, delay: 0.07}); break;
    case 'miss':   _noise(0.16, {freq: 1100, slideF: 260, vol: 0.07}); break;
    case 'phit':   _tone(72, 0.12, {type:'sawtooth', vol: 0.1}); _noise(0.08, {freq: 300, vol: 0.1}); break;
    case 'die':    _tone(230, 0.34, {type:'triangle', vol: 0.12, slide: 42}); break;
    case 'mydeath':_tone(330, 0.9, {type:'triangle', vol: 0.16, slide: 50});
                   _tone(220, 0.9, {type:'sine', vol: 0.1, slide: 38, delay: 0.05}); break;
    case 'selfheal': _tone(392, 0.16, {vol: 0.08}); _tone(523, 0.2, {vol: 0.08, delay: 0.08}); break;
    case 'levelup': [523,659,784,1046].forEach((f,i)=> _tone(f, 0.22, {vol: 0.12, delay: i*0.09})); break;
    case 'coin':   _tone(1320, 0.05, {type:'square', vol: 0.05}); _tone(1760, 0.07, {type:'square', vol: 0.05, delay: 0.05}); break;
    case 'rare':   [880,1108,1318].forEach((f,i)=> _tone(f, 0.14, {vol: 0.09, delay: i*0.07})); break;
    case 'legend': [523,659,784,1046,1318].forEach((f,i)=> _tone(f, 0.26, {type:'triangle', vol: 0.13, delay: i*0.11})); break;
    case 'quest_new':  _tone(660, 0.12, {vol: 0.09}); _tone(880, 0.18, {vol: 0.09, delay: 0.1}); break;
    case 'quest_done': [523,659,784].forEach((f,i)=> _tone(f, 0.2, {vol: 0.11, delay: i*0.08}));
                       _tone(1760, 0.08, {type:'square', vol: 0.05, delay: 0.3}); break;
    case 'fish':   _noise(0.28, {freq: 500, slideF: 140, vol: 0.1}); break;
    case 'event':  _tone(131, 0.55, {type:'sawtooth', vol: 0.1}); _tone(165, 0.55, {type:'sawtooth', vol: 0.07, delay: 0.04}); break;
    case 'posture':_noise(0.05, {freq: 2400, hp: true, vol: 0.08}); _tone(196, 0.14, {type:'square', vol: 0.08}); break;
    case 'fear':   _tone(440, 0.4, {type:'sawtooth', vol: 0.08, slide: 110}); break;
  }
}
function spellSfx(dt){
  if(!_sfxOn || !_audio()) return;
  if(dt === 'fogo'){ _noise(0.22, {freq: 700, slideF: 180, vol: 0.14});
    for(let i=0;i<3;i++) _tone(140 + Math.random()*120, 0.05, {type:'square', vol: 0.05, delay: 0.05 + i*0.05}); }
  else if(dt === 'gelo' || dt === 'frio'){ _tone(1500, 0.18, {vol: 0.08, slide: 2100});
    _tone(1900, 0.22, {vol: 0.06, delay: 0.09}); _noise(0.1, {freq: 4200, hp: true, vol: 0.04, delay: 0.12}); }
  else if(dt === 'trovao' || dt === 'eletrico' || dt === 'relampago'){ _noise(0.07, {freq: 5200, hp: true, vol: 0.22});
    _noise(0.16, {freq: 480, vol: 0.14, delay: 0.03}); }
  else if(dt === 'acido' || dt === 'veneno'){ _tone(280, 0.2, {type:'sine', vol: 0.09, slide: 190});
    _tone(210, 0.16, {vol: 0.07, delay: 0.1, slide: 320}); }
  else if(dt === 'necrotico'){ _tone(116, 0.34, {type:'sawtooth', vol: 0.11, slide: 58}); }
  else if(dt === 'radiante'){ [523,659,784].forEach((f,i)=> _tone(f, 0.28, {vol: 0.07, delay: i*0.03})); }
  else if(dt === 'psiquico'){ _tone(440, 0.16, {vol: 0.08, slide: 620}); _tone(620, 0.16, {vol: 0.08, delay: 0.12, slide: 440}); }
  else { _tone(720, 0.14, {type:'triangle', vol: 0.09, slide: 380}); }
}

// ---------- AMBIENTE por mapa (nós contínuos) ----------
function _stopAmb(){ for(const n of _ambNodes){ try{ n.stop ? n.stop() : n.disconnect(); }catch(e){} } _ambNodes = []; }
function _ambLoop(freq, vol, lfoHz){
  const a = _audio(); if(!a || !_noiseBuf) return;
  const src = a.createBufferSource(); src.buffer = _noiseBuf; src.loop = true;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = a.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(_masterG); src.start();
  _ambNodes.push(src, f, g);
  if(lfoHz){
    const lfo = a.createOscillator(), lg = a.createGain();
    lfo.frequency.value = lfoHz; lg.gain.value = vol * 0.7;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    _ambNodes.push(lfo, lg);
  }
}
function updateAmbience(){
  if(!_sfxOn || !_audio() || typeof mapName === 'undefined') return;
  const chuva = (typeof _weather !== 'undefined' && _weather && _weather.type === 'chuva');
  const key = mapName + '|' + (chuva ? 'r' : '');
  if(key === _ambKey) return;
  _ambKey = key;
  _stopAmb();
  if(mapName === 'costa_maravai') _ambLoop(420, 0.045, 0.14);          // ondas
  else if(mapName === 'umbraval' || mapName === 'vespera') _ambLoop(170, 0.04, 0.07);  // vento noturno
  else if(mapName === 'brasal') _ambLoop(95, 0.05, 0.05);              // rumor da Ferida
  if(chuva) _ambLoop(950, 0.05, 0);                                    // chuva
}
setInterval(()=>{ try{ updateAmbience(); }catch(e){} }, 2500);
// pássaros de dia nos campos (chirps raros)
setInterval(()=>{
  if(!_sfxOn || !_audio() || typeof mapName === 'undefined') return;
  if((mapName === 'ermo' || mapName === 'floresta_ermo' || mapName === 'costa_maravai') && Math.random() < 0.4){
    const b = 2100 + Math.random()*900;
    _tone(b, 0.06, {vol: 0.03}); _tone(b*1.25, 0.05, {vol: 0.025, delay: 0.08});
  }
}, 9000);

// ---------- MÚSICA nos momentos (taverna / templo / boss) ----------
function stopMusic(){ if(_musicTimer){ clearInterval(_musicTimer); _musicTimer = null; } _musicMode = null; }
function startMusic(mode){
  if(_musicMode === mode || !_sfxOn || !_audio()) return;
  stopMusic();
  _musicMode = mode; _musicStep = 0;
  if(mode === 'taverna'){
    _musicTimer = setInterval(()=>{
      const prog = [[294,370,440],[392,494,587],[440,554,659],[294,370,440]];
      const ch = prog[_musicStep % 4]; _musicStep++;
      ch.forEach((f,i)=> _tone(f, 0.5, {type:'triangle', vol: 0.045, delay: i*0.16}));
      _tone(ch[0]/2, 0.9, {type:'sine', vol: 0.04});
    }, 1700);
  } else if(mode === 'templo'){
    _musicTimer = setInterval(()=>{
      const prog = [[220,262,330],[175,220,262],[196,247,294],[165,196,247]];
      const ch = prog[_musicStep % 4]; _musicStep++;
      ch.forEach(f=>{ _tone(f, 3.4, {vol: 0.035, attack: 0.9}); _tone(f*2, 3.4, {vol: 0.015, attack: 0.9}); });
    }, 3600);
  } else if(mode === 'boss'){
    _musicTimer = setInterval(()=>{
      _tone(52, 0.12, {type:'sine', vol: 0.18});                        // o coração
      _noise(0.03, {freq: 6000, hp: true, vol: 0.04, delay: 0.24});     // hat
      const bass = (_musicStep % 4 < 2) ? 110 : 98; _musicStep++;
      _tone(bass, 0.4, {type:'sawtooth', vol: 0.06, delay: 0.02});
    }, 480);
  }
}
setInterval(()=>{
  try{
    if(typeof mapName === 'undefined') return;
    if(mapName === 'taverna') startMusic('taverna');
    else if(mapName === 'templo_doze') startMusic('templo');
    else if(_musicMode === 'boss'){
      if(!rtTargetId){ stopMusic(); }
    } else if(_musicMode) stopMusic();
  }catch(e){}
}, 1200);

// ---------- ligação nos eventos do jogo (listeners paralelos) ----------
var bindSound = setInterval(()=>{
  if(typeof socket === 'undefined' || !socket || socket._sndBound) return;
  socket._sndBound = true;
  socket.on('rt_hit', d=>{
    if(!d) return;
    if(d.magic){ if(!d.miss) spellSfx(d.dtype || 'energia'); else sfx('miss'); }
    else sfx(d.miss ? 'miss' : (d.crit ? 'crit' : 'hit'));
  });
  socket.on('rt_phit', d=>{ if(d && !d.miss) sfx('phit'); });
  socket.on('rt_dead', ()=> sfx('die'));
  socket.on('rt_selfheal', ()=> sfx('selfheal'));
  socket.on('rare_drop', d=> sfx(d && d.rarity === 'lendario' ? 'legend' : 'rare'));
  socket.on('world_event', d=>{ if(d && d.id) sfx('event'); });
  socket.on('posture_set', d=>{ if(d && d.posture) sfx('posture'); });
  socket.on('fish_start', ()=> sfx('fish'));
  socket.on('rt_engage', d=>{ if(d && d.boss) startMusic('boss'); });
  socket.on('wallet', ()=>{
    const now = performance.now();
    if(now - _lastCoinSnd > 350){ _lastCoinSnd = now; sfx('coin'); }
  });
  socket.on('xp', d=>{
    if(!d) return;
    if(_lastLevelSnd && d.level > _lastLevelSnd) sfx('levelup');
    _lastLevelSnd = d.level || _lastLevelSnd;
    if(d.hp !== undefined && d.hp <= 0) sfx('mydeath');
  });
  socket.on('quests', d=>{
    if(!d) return;
    if(_prevQuestSnap){
      if((d.done || 0) > _prevQuestSnap.done) sfx('quest_done');
      else if((d.active || []).length > _prevQuestSnap.n) sfx('quest_new');
    }
    _prevQuestSnap = {done: d.done || 0, n: (d.active || []).length};
  });
  socket.on('toast', d=>{
    const t0 = (d && d.text) || '';
    if(t0.indexOf('😱') === 0) sfx('fear');
    else if(t0.indexOf('👑') === 0) sfx('event');
    else if(t0.indexOf('🏆') === 0) sfx('legend');
    else if(t0.indexOf('🏅') === 0) sfx('quest_done');
    else if(t0.indexOf('🌀') === 0) sfx('event');
    else if(t0.indexOf('💔') === 0) sfx('fear');
    else if(t0.indexOf('🔨✨') === 0 || t0.indexOf('🔨🌟') === 0) sfx('quest_done');
    else if(t0.indexOf('🗝️') === 0) sfx('coin');
    else if(t0.indexOf('🏟️') === 0) sfx('event');
    else if(t0.indexOf('📈') === 0) sfx('levelup');
    else if(t0.indexOf('🔮') === 0) sfx('quest_new');
  });
}, 850);

// ---------- botão de som (🔊/🔇) ----------
(function(){
  const b = document.createElement('div');
  b.id = 'soundToggle';
  b.style.cssText = 'position:fixed;top:10px;right:10px;z-index:120;width:34px;height:34px;'+
    'display:flex;align-items:center;justify-content:center;background:rgba(10,14,26,0.8);'+
    'border:1px solid #3a4a7a;border-radius:9px;cursor:pointer;font-size:16px;user-select:none;';
  b.textContent = _sfxOn ? '🔊' : '🔇';
  b.addEventListener('pointerdown', ev=>{
    ev.stopPropagation();
    _sfxOn = !_sfxOn;
    b.textContent = _sfxOn ? '🔊' : '🔇';
    try{ localStorage.setItem('ermo_sound', _sfxOn ? 'on' : 'off'); }catch(e){}
    if(_audio()) _masterG.gain.value = _sfxOn ? 0.5 : 0.0001;
    if(!_sfxOn){ stopMusic(); _stopAmb(); _ambKey = ''; }
  });
  document.body.appendChild(b);
})();

// ===========================================================================
//  FASE SOCIAL (cliente): HUD do grupo + Mesa de Negócios
// ===========================================================================
function renderPartyHud(members){
  let el = document.getElementById('partyHud');
  if(!members || members.length < 2){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div');
    el.id = 'partyHud';
    el.style.cssText = 'position:fixed;left:12px;top:52px;z-index:58;display:flex;flex-direction:column;'+
      'gap:4px;pointer-events:none;';
    document.body.appendChild(el);
  }
  let h = '<div style="font:800 9.5px Inter;color:#c9a860;letter-spacing:.6px;text-shadow:0 1px 3px #000;">⚔️ GRUPO</div>';
  for(const m of members){
    if(m.id === myId) continue;
    const pct = m.hp_max ? Math.max(0, Math.min(100, Math.round(100*m.hp/m.hp_max))) : 0;
    const cor = pct > 55 ? '#5ad86a' : (pct > 25 ? '#e0c040' : '#e05858');
    h += '<div style="background:rgba(10,12,22,0.78);border:1px solid #2e3a5e;border-radius:7px;padding:4px 7px;min-width:118px;">'+
      '<div style="display:flex;justify-content:space-between;gap:6px;">'+
      '<span style="font:700 10px Inter;color:#c9d8ff;">'+m.name+'</span>'+
      '<span style="font:600 9px Inter;color:#7a86a8;">'+(m.hp!=null?m.hp:'?')+'</span></div>'+
      '<div style="height:5px;background:#101828;border-radius:3px;overflow:hidden;margin-top:3px;">'+
      '<div style="height:100%;width:'+pct+'%;background:'+cor+';"></div></div></div>';
  }
  el.innerHTML = h;
}

var _mktEl = null, _mktData = null, _mktTab = 'mercado';
function openMarket(d){
  _mktData = d;
  if(_mktEl){ renderMarket(); return; }
  _mktEl = document.createElement('div');
  _mktEl.id = 'marketPanel';
  _mktEl.style.cssText = 'position:fixed;inset:0;z-index:235;display:flex;align-items:center;justify-content:center;background:rgba(6,8,14,0.66);';
  _mktEl.addEventListener('click', ev=>{ if(ev.target === _mktEl) closeMarket(); });
  document.body.appendChild(_mktEl);
  renderMarket();
}
function closeMarket(){ if(_mktEl){ _mktEl.remove(); _mktEl = null; } }
function renderMarket(){
  if(!_mktEl || !_mktData) return;
  const d = _mktData;
  const tabBtn = (id, label)=> '<div data-tab="'+id+'" style="flex:1;text-align:center;padding:8px 4px;cursor:pointer;'+
    'font:700 12px Inter;border-bottom:2px solid '+(_mktTab===id?'#c9a860':'transparent')+';color:'+(_mktTab===id?'#f0d888':'#8a86a0')+';">'+label+'</div>';
  let h = '<div style="width:min(440px,95vw);max-height:78vh;overflow:auto;background:#141126;border:1px solid #6d5a30;border-radius:14px;padding:14px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;">'+
    '<div style="font:800 15px Cinzel,serif;color:#f0d888;">🍺 Mesa de Negócios</div>'+
    '<div style="font:600 10px Inter;color:#8a86a0;">🏛️ Cofre da Cidade: '+(d.chest||0)+'</div></div>'+
    '<div style="font:600 10.5px Inter;color:#7a86a8;margin:2px 0 8px;">Seu bronze: '+(d.wallet||0)+' · taxa do mercado: 5%</div>'+
    '<div style="display:flex;margin-bottom:10px;">'+tabBtn('mercado','📋 Mercado')+tabBtn('oferta','🤝 Oferta Direta')+'</div>';
  if(_mktTab === 'mercado'){
    h += '<div style="font:600 11px Inter;color:#8a86a0;margin-bottom:5px;">ANÚNCIOS ('+(d.listings||[]).length+')</div>';
    if(!(d.listings||[]).length) h += '<div style="font:500 11px Inter;color:#6f6a86;padding:6px 0;">Nenhum anúncio. Seja o primeiro a vender!</div>';
    for(const l of (d.listings||[])){
      h += '<div style="display:flex;align-items:center;gap:8px;padding:7px 9px;margin-bottom:5px;background:#191630;border:1px solid #2e2a47;border-radius:8px;">'+
        '<div style="flex:1;min-width:0;"><div style="font:700 12px Inter;color:#c9d8ff;">'+l.qty+'x '+l.name+'</div>'+
        '<div style="font:500 10px Inter;color:#7a86a8;">por '+l.seller+'</div></div>'+
        '<div style="font:800 12px Inter;color:#e0c040;white-space:nowrap;">'+l.price+' 🥉</div>'+
        (l.mine
          ? '<button data-cancel="'+l.id+'" style="padding:6px 10px;background:#3a2433;border:1px solid #6a4360;border-radius:7px;color:#e8c9d8;font:700 11px Inter;cursor:pointer;">Cancelar</button>'
          : '<button data-buy="'+l.id+'" style="padding:6px 12px;background:#1e3a1e;border:1px solid #4a8a4a;border-radius:7px;color:#c9f0c9;font:700 11px Inter;cursor:pointer;">Comprar</button>')+
        '</div>';
    }
    h += '<div style="font:600 11px Inter;color:#8a86a0;margin:12px 0 5px;">VENDER (os itens ficam guardados na mesa até vender ou cancelar)</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">'+
      '<select id="mktItem" style="flex:2;min-width:130px;padding:7px;background:#101624;border:1px solid #2e3a5e;border-radius:7px;color:#c9d8ff;font:600 11px Inter;">'+
      (d.bag||[]).map(b=> '<option value="'+b.item+'">'+b.name+' (x'+b.qty+')</option>').join('')+'</select>'+
      '<input id="mktQty" type="number" min="1" value="1" style="width:56px;padding:7px;background:#101624;border:1px solid #2e3a5e;border-radius:7px;color:#c9d8ff;font:600 11px Inter;">'+
      '<input id="mktPrice" type="number" min="1" placeholder="preço" style="width:78px;padding:7px;background:#101624;border:1px solid #2e3a5e;border-radius:7px;color:#e0c040;font:600 11px Inter;">'+
      '<button id="mktListBtn" style="padding:7px 12px;background:#3a2f14;border:1px solid #c9a860;border-radius:7px;color:#f6e8c0;font:700 11px Inter;cursor:pointer;">Anunciar</button></div>';
  } else {
    h += '<div style="font:600 11px Inter;color:#8a86a0;margin-bottom:5px;">OFERECER A ALGUÉM NA TAVERNA (sem taxa)</div>';
    if(!(d.near||[]).length){
      h += '<div style="font:500 11px Inter;color:#6f6a86;padding:6px 0;">Ninguém mais na taverna agora. Chame alguém pra mesa!</div>';
    } else {
      h += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">'+
        '<select id="ofTo" style="flex:1;min-width:110px;padding:7px;background:#101624;border:1px solid #2e3a5e;border-radius:7px;color:#c9d8ff;font:600 11px Inter;">'+
        (d.near||[]).map(p=> '<option value="'+p.id+'">'+p.name+'</option>').join('')+'</select>'+
        '<select id="ofItem" style="flex:2;min-width:130px;padding:7px;background:#101624;border:1px solid #2e3a5e;border-radius:7px;color:#c9d8ff;font:600 11px Inter;">'+
        (d.bag||[]).map(b=> '<option value="'+b.item+'">'+b.name+' (x'+b.qty+')</option>').join('')+'</select>'+
        '<input id="ofQty" type="number" min="1" value="1" style="width:56px;padding:7px;background:#101624;border:1px solid #2e3a5e;border-radius:7px;color:#c9d8ff;font:600 11px Inter;">'+
        '<input id="ofPrice" type="number" min="0" placeholder="preço" style="width:78px;padding:7px;background:#101624;border:1px solid #2e3a5e;border-radius:7px;color:#e0c040;font:600 11px Inter;">'+
        '<button id="ofSendBtn" style="padding:7px 12px;background:#1e3a1e;border:1px solid #4a8a4a;border-radius:7px;color:#c9f0c9;font:700 11px Inter;cursor:pointer;">Oferecer</button></div>'+
        '<div style="font:500 10px Inter;color:#6f6a86;margin-top:6px;">A pessoa vê a oferta na tela e decide. Preço 0 = presente.</div>';
    }
  }
  h += '<div style="font:500 10px Inter;color:#6f6a86;margin-top:10px;">Toque fora pra fechar.</div></div>';
  _mktEl.innerHTML = h;
  _mktEl.querySelectorAll('[data-tab]').forEach(t=> t.addEventListener('click', ()=>{ _mktTab = t.getAttribute('data-tab'); renderMarket(); }));
  _mktEl.querySelectorAll('[data-buy]').forEach(b=> b.addEventListener('click', ()=> socket.emit('market_buy', {id: parseInt(b.getAttribute('data-buy'))})));
  _mktEl.querySelectorAll('[data-cancel]').forEach(b=> b.addEventListener('click', ()=> socket.emit('market_cancel', {id: parseInt(b.getAttribute('data-cancel'))})));
  const lb = document.getElementById('mktListBtn');
  if(lb) lb.addEventListener('click', ()=>{
    const item = (document.getElementById('mktItem')||{}).value;
    const qty = parseInt((document.getElementById('mktQty')||{}).value || '1');
    const price = parseInt((document.getElementById('mktPrice')||{}).value || '0');
    if(item && price > 0) socket.emit('market_list', {item, qty, price});
  });
  const ob = document.getElementById('ofSendBtn');
  if(ob) ob.addEventListener('click', ()=>{
    const to = (document.getElementById('ofTo')||{}).value;
    const item = (document.getElementById('ofItem')||{}).value;
    const qty = parseInt((document.getElementById('ofQty')||{}).value || '1');
    const price = parseInt((document.getElementById('ofPrice')||{}).value || '0');
    if(to && item) socket.emit('offer_send', {to, item, qty, price});
  });
}

function showTradeOffer(d){
  const old = document.getElementById('tradeOffer');
  if(old) old.remove();
  const el = document.createElement('div');
  el.id = 'tradeOffer';
  el.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:260;'+
    'background:#141126;border:1px solid #c9a860;border-radius:12px;padding:14px 16px;width:min(320px,92vw);';
  el.innerHTML = '<div style="font:800 13px Inter;color:#f0d888;margin-bottom:6px;">🤝 Oferta de '+d.from_name+'</div>'+
    '<div style="font:600 12px Inter;color:#c9d8ff;margin-bottom:10px;">'+d.qty+'x '+d.item_name+' por <b style="color:#e0c040">'+d.price+' de bronze</b></div>'+
    '<div style="display:flex;gap:8px;">'+
    '<button id="ofYes" style="flex:1;padding:9px;background:#1e3a1e;border:1px solid #4a8a4a;border-radius:8px;color:#c9f0c9;font:700 12px Inter;cursor:pointer;">Aceitar</button>'+
    '<button id="ofNo" style="flex:1;padding:9px;background:#3a2433;border:1px solid #6a4360;border-radius:8px;color:#e8c9d8;font:700 12px Inter;cursor:pointer;">Recusar</button></div>';
  document.body.appendChild(el);
  const done = acc=>{ socket.emit('offer_answer', {id: d.id, accept: acc}); el.remove(); };
  document.getElementById('ofYes').addEventListener('click', ()=> done(true));
  document.getElementById('ofNo').addEventListener('click', ()=> done(false));
  setTimeout(()=>{ if(document.getElementById('tradeOffer') === el) el.remove(); }, 85000);
}

// ===========================================================================
//  CODEX (tecla K): Bestiário, Itens, Lugares e Títulos
// ===========================================================================
var _codexEl = null, _codexData = null, _codexTab = 'm';
function openCodex(){
  if(_codexEl){ closeCodex(); return; }
  _codexEl = document.createElement('div');
  _codexEl.id = 'codexPanel';
  _codexEl.style.cssText = 'position:fixed;inset:0;z-index:232;display:flex;align-items:center;justify-content:center;background:rgba(6,8,14,0.66);';
  _codexEl.addEventListener('click', ev=>{ if(ev.target === _codexEl) closeCodex(); });
  document.body.appendChild(_codexEl);
  renderCodex();
  socket.emit('codex_get');
}
function closeCodex(){ if(_codexEl){ _codexEl.remove(); _codexEl = null; } }
function renderCodex(){
  if(!_codexEl) return;
  const d = _codexData || {m: [], i: [], l: [], titles: [], title: '', tot_m: 0, tot_i: 0, tot_l: 0};
  const RC = {comum:'#c9d8ff', raro:'#6db3ff', epico:'#c98aff', lendario:'#ffb84a'};
  const tb = (id, label)=> '<div data-ctab="'+id+'" style="flex:1;text-align:center;padding:8px 2px;cursor:pointer;'+
    'font:700 11px Inter;border-bottom:2px solid '+(_codexTab===id?'#c9a860':'transparent')+';color:'+(_codexTab===id?'#f0d888':'#8a86a0')+';">'+label+'</div>';
  let h = '<div style="width:min(430px,95vw);max-height:78vh;overflow:auto;background:#141126;border:1px solid #6d5a30;border-radius:14px;padding:14px;">'+
    '<div style="font:800 15px Cinzel,serif;color:#f0d888;margin-bottom:8px;">📖 Codex do Ermo</div>'+
    '<div style="display:flex;margin-bottom:10px;">'+
    tb('m','🐺 Bestiário '+d.m.length+'/'+d.tot_m)+
    tb('i','⚔️ Itens '+d.i.length+'/'+d.tot_i)+
    tb('l','🗺️ Lugares '+d.l.length+'/'+d.tot_l)+
    tb('t','🏅 Títulos '+(d.titles||[]).length)+'</div>';
  if(_codexTab === 'm'){
    if(!d.m.length) h += '<div style="font:500 11px Inter;color:#6f6a86;padding:6px 0;">Nenhuma criatura registrada. Vá caçar!</div>';
    for(const m of d.m){
      h += '<div style="display:flex;justify-content:space-between;padding:6px 9px;margin-bottom:4px;background:#191630;border:1px solid #2e2a47;border-radius:7px;">'+
        '<span style="font:600 11.5px Inter;color:#c9d8ff;">'+m.name+'</span>'+
        '<span style="font:800 11px Inter;color:#e0c98a;">'+m.kills+' ✕</span></div>';
    }
  } else if(_codexTab === 'i'){
    if(!d.i.length) h += '<div style="font:500 11px Inter;color:#6f6a86;padding:6px 0;">Nenhum item descoberto ainda.</div>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:5px;">';
    for(const it of d.i){
      h += '<span style="font:600 10.5px Inter;color:'+(RC[it.rarity]||'#c9d8ff')+';background:#191630;'+
        'border:1px solid #2e2a47;border-radius:6px;padding:4px 8px;">'+it.name+'</span>';
    }
    h += '</div>';
  } else if(_codexTab === 'l'){
    if(!d.l.length) h += '<div style="font:500 11px Inter;color:#6f6a86;padding:6px 0;">Nenhum lugar registrado.</div>';
    for(const l of d.l){
      h += '<div style="font:600 11.5px Inter;color:#c9d8ff;padding:5px 9px;margin-bottom:4px;background:#191630;border:1px solid #2e2a47;border-radius:7px;">📍 '+l+'</div>';
    }
  } else {
    if(!(d.titles||[]).length) h += '<div style="font:500 11px Inter;color:#6f6a86;padding:6px 0;">Nenhum título ainda. Cace, explore, colecione e derrube chefes primeiro que todo mundo!</div>';
    if(d.title) h += '<button data-title="" style="width:100%;padding:8px;margin-bottom:8px;background:#2a2433;border:1px solid #4a4360;border-radius:9px;color:#d8d2e8;font:600 12px Inter;cursor:pointer;">↺ Remover título</button>';
    for(const t of (d.titles||[])){
      const on = t === d.title;
      h += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:5px;background:'+(on?'#2e2513':'#191630')+';border:1px solid '+(on?'#c9a860':'#2e2a47')+';border-radius:8px;">'+
        '<span style="flex:1;font:700 12px Inter;color:#e0c98a;">'+t+'</span>'+
        (on ? '<span style="font:800 10px Inter;color:#f0d888;">ATIVO</span>'
            : '<button data-title="'+t+'" style="padding:5px 12px;background:#3a2f14;border:1px solid #c9a860;border-radius:7px;color:#f6e8c0;font:700 11px Inter;cursor:pointer;">Usar</button>')+'</div>';
    }
  }
  h += '<div style="font:500 10px Inter;color:#6f6a86;margin-top:8px;">Tecla K abre e fecha o Codex.</div></div>';
  _codexEl.innerHTML = h;
  _codexEl.querySelectorAll('[data-ctab]').forEach(t=> t.addEventListener('click', ()=>{ _codexTab = t.getAttribute('data-ctab'); renderCodex(); }));
  _codexEl.querySelectorAll('[data-title]').forEach(b=> b.addEventListener('click', ()=>{
    socket.emit('set_title', {title: b.getAttribute('data-title')});
    setTimeout(()=> socket.emit('codex_get'), 350);
  }));
}
window.addEventListener('keydown', e=>{
  if(typeof started === 'undefined' || !started || typingInField(e)) return;
  if(e.code === 'KeyK'){ e.preventDefault(); openCodex(); }
});

// ===========================================================================
//  A FENDA (interior) + A BIGORNA DO BRAGAN (painel de forja)
// ===========================================================================
var _fendaOpen = false, _fendaFloor = 0;
(function(){
  const orig3 = drawInteriorDecor;
  drawInteriorDecor = function(c, now){
    orig3(c, now);
    if(mapName !== 'fenda') return;
    const px = 8.5*TS - camX, py = 2.5*TS - camY;
    c.save();
    c.fillStyle = '#0c0a14';                                        // o POÇO
    c.beginPath(); c.ellipse(px, py, TS*1.1, TS*0.7, 0, 0, Math.PI*2); c.fill();
    c.strokeStyle = '#3a3444'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(px, py, TS*1.1, TS*0.7, 0, 0, Math.PI*2); c.stroke();
    if(_fendaOpen){
      c.save(); c.globalCompositeOperation = 'lighter';
      for(let i=0;i<3;i++){
        const a2 = now/500 + i*2.1;
        c.globalAlpha = 0.55 + 0.3*Math.sin(now/260 + i);
        c.strokeStyle = i%2 ? '#a06aff' : '#6adfff'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(px, py, TS*(0.35+i*0.25), TS*(0.22+i*0.16), a2, 0, Math.PI*1.7); c.stroke();
      }
      for(let i=0;i<4;i++){
        const ph = ((now/60) + i*17) % 44;
        c.globalAlpha = 0.6*(1 - ph/44);
        c.fillStyle = '#c9a0ff';
        c.fillRect(px - TS*0.6 + (i*23 % (TS*1.2)), py - 4 + ph*0.35, 2.4, 2.4);
      }
      c.restore();
      c.font = '700 10px Inter'; c.textAlign = 'center';
      c.fillStyle = '#c9a0ff'; c.fillText('▼ DESCER (E)', px, py - TS*1.0);
    } else {
      c.fillStyle = '#2a2434';                                      // o selo de pedra
      c.beginPath(); c.ellipse(px, py, TS*0.7, TS*0.42, 0, 0, Math.PI*2); c.fill();
      c.strokeStyle = '#4a4458'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(px - TS*0.5, py); c.lineTo(px + TS*0.5, py); c.stroke();
      c.beginPath(); c.moveTo(px, py - TS*0.3); c.lineTo(px, py + TS*0.3); c.stroke();
    }
    if(_fendaFloor > 0){
      c.font = '800 12px Cinzel, serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,.7)'; c.fillText('ANDAR ' + _fendaFloor, canvas.width/2 + 1, 25);
      c.fillStyle = '#c9a0ff'; c.fillText('ANDAR ' + _fendaFloor, canvas.width/2, 24);
    }
    const ey = 11*TS - camY;                                        // a saída
    c.font = '700 9px Inter'; c.textAlign = 'center';
    c.globalAlpha = 0.6 + 0.2*Math.sin(now/400);
    c.fillStyle = '#8fe08f'; c.fillText('▲ emergir (E na borda)', 8.5*TS - camX, ey + TS*0.8);
    c.restore();
  };
})();

// ---------- A BIGORNA: painel de forja +1/+2/+3 ----------
var _forgeEl = null, _forgeData = null;
function openForge(d){
  _forgeData = d;
  if(_forgeEl){ renderForge(); return; }
  _forgeEl = document.createElement('div');
  _forgeEl.id = 'forgePanel';
  _forgeEl.style.cssText = 'position:fixed;inset:0;z-index:236;display:flex;align-items:center;justify-content:center;background:rgba(6,8,14,0.66);';
  _forgeEl.addEventListener('click', ev=>{ if(ev.target === _forgeEl) closeForge(); });
  document.body.appendChild(_forgeEl);
  renderForge();
}
function closeForge(){ if(_forgeEl){ _forgeEl.remove(); _forgeEl = null; } }
function renderForge(){
  if(!_forgeEl || !_forgeData) return;
  const d = _forgeData;
  let h = '<div style="width:min(430px,95vw);max-height:76vh;overflow:auto;background:#161018;border:1px solid #6a4a2c;border-radius:14px;padding:14px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'+
    '<div style="font:800 15px Cinzel,serif;color:#ffb060;">🔨 A Bigorna do Bragan</div>'+
    '<div style="font:600 10px Inter;color:#8a86a0;">Seu bronze: '+(d.wallet||0)+'</div></div>'+
    '<div style="font:500 10.5px Inter;color:#9b8a7a;line-height:1.4;margin-bottom:10px;">+1 é certo. +2 pode falhar (perde os materiais). '+
    '<b style="color:#e05858">+3 pode PARTIR o item pra sempre.</b> A bigorna não tem pena.</div>';
  if(!(d.items||[]).length){
    h += '<div style="font:500 11px Inter;color:#6f6a86;padding:8px 0;">Nada forjável na mochila (equipamentos de valor 500+ podem subir até +3).</div>';
  }
  for(const it of (d.items||[])){
    const matsOk = it.mats.every(m2=> m2.have >= m2.need);
    const podeGrana = (d.wallet||0) >= it.bronze;
    const pode = matsOk && podeGrana;
    h += '<div style="margin:0 0 8px;padding:10px 11px;background:#1c1420;border:1px solid '+(it.quebra?'#6a3040':'#3a2f26')+';border-radius:10px;">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;">'+
      '<div style="font:700 12.5px Inter;color:#e0c98a;">'+it.name+' <span style="color:#8a86a0">→ +'+it.next+'</span></div>'+
      '<div style="font:800 11px Inter;color:'+(it.quebra?'#e05858':'#8fd08f')+';">'+it.chance+'%'+(it.quebra?' ⚠️':'')+'</div></div>'+
      '<div style="font:600 10.5px Inter;color:#9b95b4;margin:4px 0;">'+it.bronze+' 🥉 + '+
      it.mats.map(m2=> '<span style="color:'+(m2.have>=m2.need?'#8fe08f':'#e05858')+'">'+m2.need+'x '+m2.name+' ('+m2.have+')</span>').join(' + ')+'</div>'+
      '<button data-forge="'+it.item+'" '+(pode?'':'disabled')+' style="width:100%;padding:8px;margin-top:3px;'+
      'background:'+(pode?(it.quebra?'#4a1e28':'#3a2f14'):'#241f26')+';border:1px solid '+(pode?(it.quebra?'#a04058':'#c9a860'):'#3a3440')+';'+
      'border-radius:8px;color:'+(pode?'#f6e8c0':'#6f6a86')+';font:800 11.5px Inter;cursor:'+(pode?'pointer':'default')+';">'+
      (it.quebra ? '⚠️ FORJAR +3 (PODE QUEBRAR)' : 'FORJAR +'+it.next)+'</button></div>';
  }
  h += '<div style="font:500 10px Inter;color:#6f6a86;margin-top:6px;">Toque fora pra fechar. Fragmentos Estelares caem dos chefes.</div></div>';
  _forgeEl.innerHTML = h;
  _forgeEl.querySelectorAll('[data-forge]').forEach(b=> b.addEventListener('click', ()=>{
    if(!b.disabled) socket.emit('forge_try', {item: b.getAttribute('data-forge')});
  }));
}

// ===========================================================================
//  A ARENA (cliente): ringue, mastro, painel de desafios e o banner de duelo
// ===========================================================================
(function(){
  const orig4 = drawInteriorDecor;
  drawInteriorDecor = function(c, now){
    orig4(c, now);
    if(mapName !== 'arena') return;
    const cx2 = 10.5*TS - camX, cy2 = 7.5*TS - camY;
    c.save();
    c.fillStyle = 'rgba(200,170,110,0.28)';                          // a AREIA do ringue
    c.beginPath(); c.ellipse(cx2, cy2, TS*5.2, TS*3.4, 0, 0, Math.PI*2); c.fill();
    c.strokeStyle = 'rgba(240,216,136,0.5)'; c.lineWidth = 2.4;
    c.beginPath(); c.ellipse(cx2, cy2, TS*5.2, TS*3.4, 0, 0, Math.PI*2); c.stroke();
    c.setLineDash([6, 8]);
    c.strokeStyle = 'rgba(240,216,136,0.28)';
    c.beginPath(); c.moveTo(cx2, cy2 - TS*3.2); c.lineTo(cx2, cy2 + TS*3.2); c.stroke();
    c.setLineDash([]);
    for(let i=0;i<14;i++){                                           // o PÚBLICO
      const px2 = (2.6 + (i % 7)*2.6)*TS - camX;
      const py2 = (i < 7 ? 1.5 : 13.2)*TS - camY;
      c.fillStyle = ['#8a6a4a','#6a7a8a','#7a5a6a','#5a7a5a'][i % 4];
      c.beginPath(); c.arc(px2, py2 + Math.sin(now/400 + i)*1.2, 3.4, 0, Math.PI*2); c.fill();
    }
    c.fillStyle = '#5a4228';                                         // o MASTRO
    c.fillRect(cx2 - 2, cy2 - TS*2.6, 4, TS*2.6);
    const w = Math.sin(now/250);
    c.fillStyle = '#a02838';                                         // a bandeira tremulando
    c.beginPath();
    c.moveTo(cx2 + 2, cy2 - TS*2.55);
    c.quadraticCurveTo(cx2 + TS*0.7 + w*3, cy2 - TS*2.4, cx2 + TS*1.1 + w*5, cy2 - TS*2.3);
    c.lineTo(cx2 + TS*1.0 + w*5, cy2 - TS*1.95);
    c.quadraticCurveTo(cx2 + TS*0.6 + w*3, cy2 - TS*2.0, cx2 + 2, cy2 - TS*2.05);
    c.closePath(); c.fill();
    c.font = '700 9px Inter'; c.textAlign = 'center';
    c.fillStyle = '#f0d888';
    c.fillText('⚔️ MASTRO DE DESAFIOS (E)', cx2, cy2 - TS*2.8);
    c.restore();
  };
})();

var _arenaEl = null, _arenaData = null;
function openArena(d){
  _arenaData = d;
  if(_arenaEl){ renderArena(); return; }
  _arenaEl = document.createElement('div');
  _arenaEl.id = 'arenaPanel';
  _arenaEl.style.cssText = 'position:fixed;inset:0;z-index:236;display:flex;align-items:center;justify-content:center;background:rgba(6,8,14,0.66);';
  _arenaEl.addEventListener('click', ev=>{ if(ev.target === _arenaEl) closeArena(); });
  document.body.appendChild(_arenaEl);
  renderArena();
}
function closeArena(){ if(_arenaEl){ _arenaEl.remove(); _arenaEl = null; } }
function renderArena(){
  if(!_arenaEl || !_arenaData) return;
  const d = _arenaData;
  let h = '<div style="width:min(420px,95vw);max-height:78vh;overflow:auto;background:#160f12;border:1px solid #a02838;border-radius:14px;padding:14px;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;">'+
    '<div style="font:800 15px Cinzel,serif;color:#ff8a9a;">🏟️ Arena do Ermo</div>'+
    '<div style="font:600 10px Inter;color:#8a86a0;">🏛️ Cofre: '+(d.chest||0)+'</div></div>'+
    '<div style="font:600 10.5px Inter;color:#9b8a8a;margin:3px 0 10px;">Seu cartel: <b style="color:#8fe08f">'+d.me.w+'V</b> / <b style="color:#e05858">'+d.me.l+'D</b> · vitória leva 20% do Cofre</div>';
  h += '<div style="font:600 11px Inter;color:#8a86a0;margin-bottom:5px;">DESAFIAR</div>';
  if(!(d.near||[]).length){
    h += '<div style="font:500 11px Inter;color:#6f6a86;padding:4px 0 10px;">Ninguém disponível no ringue. Chame alguém pra arena!</div>';
  } else {
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">'+
      '<select id="arTo" style="flex:1;min-width:100px;padding:7px;background:#101624;border:1px solid #4a2e3a;border-radius:7px;color:#c9d8ff;font:600 11px Inter;">'+
      (d.near||[]).map(p=> '<option value="'+p.id+'">'+p.name+'</option>').join('')+'</select>'+
      '<input id="arBet" type="number" min="0" value="0" placeholder="aposta" style="width:80px;padding:7px;background:#101624;border:1px solid #4a2e3a;border-radius:7px;color:#e0c040;font:600 11px Inter;">'+
      '<button id="arSend" style="padding:7px 14px;background:#4a1e28;border:1px solid #a02838;border-radius:7px;color:#ffd8de;font:800 11px Inter;cursor:pointer;">⚔️ Desafiar</button></div>'+
      '<div style="font:500 10px Inter;color:#6f6a86;margin-bottom:10px;">Aposta 0 = amistoso. O perdedor fica com 1 de vida: ninguém morre no ringue.</div>';
  }
  h += '<div style="font:600 11px Inter;color:#8a86a0;margin-bottom:5px;">🏆 RANKING DA ARENA</div>';
  if(!(d.ranking||[]).length) h += '<div style="font:500 11px Inter;color:#6f6a86;">Nenhum duelo registrado. Faça história.</div>';
  (d.ranking||[]).forEach((r, i)=>{
    h += '<div style="display:flex;gap:8px;padding:5px 9px;margin-bottom:3px;background:#1c1216;border:1px solid #3a2028;border-radius:7px;">'+
      '<span style="font:800 11px Inter;color:'+(i===0?'#ffd24a':(i<3?'#c9a860':'#8a86a0'))+';width:22px;">'+(i+1)+'º</span>'+
      '<span style="flex:1;font:700 11.5px Inter;color:#e8d8dc;">'+r[0]+'</span>'+
      '<span style="font:700 11px Inter;color:#8fe08f;">'+r[1]+'V</span>'+
      '<span style="font:600 11px Inter;color:#e05858;">'+r[2]+'D</span></div>';
  });
  h += '<div style="font:500 10px Inter;color:#6f6a86;margin-top:8px;">10 vitórias: Gladiador do Ermo · 50: Campeão da Arena</div></div>';
  _arenaEl.innerHTML = h;
  const b = document.getElementById('arSend');
  if(b) b.addEventListener('click', ()=>{
    const to = (document.getElementById('arTo')||{}).value;
    const bet = parseInt((document.getElementById('arBet')||{}).value || '0');
    if(to){ socket.emit('duel_send', {to, bet}); closeArena(); }
  });
}

function showDuelOffer(d){
  const old = document.getElementById('duelOffer');
  if(old) old.remove();
  const el = document.createElement('div');
  el.id = 'duelOffer';
  el.style.cssText = 'position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:262;'+
    'background:#160f12;border:2px solid #a02838;border-radius:12px;padding:14px 16px;width:min(320px,92vw);';
  el.innerHTML = '<div style="font:800 14px Cinzel,serif;color:#ff8a9a;margin-bottom:6px;">⚔️ '+d.from_name+' te desafia!</div>'+
    '<div style="font:600 12px Inter;color:#e8d8dc;margin-bottom:10px;">'+(d.bet ? 'Aposta: <b style="color:#e0c040">'+d.bet+' de bronze</b> (o pote é '+(d.bet*2)+')' : 'Duelo amistoso: só a honra em jogo.')+'</div>'+
    '<div style="display:flex;gap:8px;">'+
    '<button id="duYes" style="flex:1;padding:10px;background:#4a1e28;border:1px solid #a02838;border-radius:8px;color:#ffd8de;font:800 12px Inter;cursor:pointer;">ACEITAR</button>'+
    '<button id="duNo" style="flex:1;padding:10px;background:#241f26;border:1px solid #4a4360;border-radius:8px;color:#d8d2e8;font:700 12px Inter;cursor:pointer;">Recusar</button></div>';
  document.body.appendChild(el);
  const done = acc=>{ socket.emit('duel_answer', {id: d.id, accept: acc}); el.remove(); };
  document.getElementById('duYes').addEventListener('click', ()=> done(true));
  document.getElementById('duNo').addEventListener('click', ()=> done(false));
  setTimeout(()=>{ if(document.getElementById('duelOffer') === el) el.remove(); }, 85000);
}

function showDuelBanner(foe, bet){
  hideDuelBanner();
  const el = document.createElement('div');
  el.id = 'duelBanner';
  el.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:118;'+
    'background:rgba(26,10,14,0.9);border:1px solid #a02838;border-radius:10px;padding:6px 14px;'+
    'font:800 12px Cinzel,serif;color:#ff8a9a;pointer-events:none;text-shadow:0 1px 3px #000;';
  el.textContent = '⚔️ DUELO vs ' + foe + (bet ? ' · pote ' + (bet*2) : '');
  document.body.appendChild(el);
}
function hideDuelBanner(){ const el = document.getElementById('duelBanner'); if(el) el.remove(); }

// ===========================================================================
//  SKILLS (tecla L) + MODOS DE LUTA + BOLSA DE RUNAS (tecla R)
// ===========================================================================
var _skillsEl = null, _skillsData = null;
function openSkills(){
  if(_skillsEl){ closeSkills(); return; }
  _skillsEl = document.createElement('div');
  _skillsEl.id = 'skillsPanel';
  _skillsEl.style.cssText = 'position:fixed;inset:0;z-index:233;display:flex;align-items:center;justify-content:center;background:rgba(6,8,14,0.66);';
  _skillsEl.addEventListener('click', ev=>{ if(ev.target === _skillsEl) closeSkills(); });
  document.body.appendChild(_skillsEl);
  renderSkills();
  socket.emit('skills_get');
}
function closeSkills(){ if(_skillsEl){ _skillsEl.remove(); _skillsEl = null; } }
function renderSkills(){
  if(!_skillsEl) return;
  const d = _skillsData || {skills: [], mode: 'bal'};
  const IC = {fist:'👊', sword:'🗡️', axe:'🪓', club:'🔨', distance:'🏹', shielding:'🛡️', magic:'🔮'};
  let h = '<div style="width:min(380px,94vw);max-height:76vh;overflow:auto;background:#101828;border:1px solid #3a5a8a;border-radius:14px;padding:14px;">'+
    '<div style="font:800 15px Cinzel,serif;color:#8ac0f0;margin-bottom:3px;">⚔️ Skills</div>'+
    '<div style="font:500 10.5px Inter;color:#7a86a8;margin-bottom:10px;">Skill sobe COM USO: golpeie, bloqueie, gaste mana. A arma na mão decide qual treina.</div>';
  for(const s of (d.skills||[])){
    h += '<div style="margin-bottom:8px;">'+
      '<div style="display:flex;justify-content:space-between;">'+
      '<span style="font:700 12px Inter;color:#c9d8ff;">'+(IC[s.id]||'')+' '+s.name+'</span>'+
      '<span style="font:800 13px Inter;color:#e0c98a;">'+s.lvl+'</span></div>'+
      '<div style="height:6px;background:#0a1220;border-radius:3px;overflow:hidden;margin-top:3px;">'+
      '<div style="height:100%;width:'+s.pct+'%;background:linear-gradient(90deg,#3a6aaa,#8ac0f0);"></div></div>'+
      '<div style="font:500 9px Inter;color:#5a6a88;text-align:right;">'+s.pct+'% pro próximo</div></div>';
  }
  h += '<div style="font:600 11px Inter;color:#8a86a0;margin:10px 0 5px;">MODO DE LUTA</div>'+
    '<div style="display:flex;gap:6px;">'+
    [['off','⚔️ Ofensivo'],['bal','⚖️ Equilíbrio'],['def','🛡️ Defensivo']].map(mm=>
      '<button data-fm="'+mm[0]+'" style="flex:1;padding:8px 4px;background:'+(d.mode===mm[0]?'#2a3a5a':'#141c2e')+';'+
      'border:1px solid '+(d.mode===mm[0]?'#8ac0f0':'#2a3a5a')+';border-radius:8px;color:#c9d8ff;font:700 10.5px Inter;cursor:pointer;">'+mm[1]+'</button>').join('')+'</div>'+
    '<div style="font:500 9.5px Inter;color:#5a6a88;margin-top:6px;">Ofensivo: dano cheio, defesa fraca. Defensivo: o contrário. Teclas L abre/fecha.</div></div>';
  _skillsEl.innerHTML = h;
  _skillsEl.querySelectorAll('[data-fm]').forEach(b=> b.addEventListener('click', ()=>{
    socket.emit('fight_mode', {mode: b.getAttribute('data-fm')});
    if(_skillsData) _skillsData.mode = b.getAttribute('data-fm');
    renderSkills();
  }));
}

// os 3 botõezinhos fixos de modo (abaixo do som)
(function(){
  const wrap = document.createElement('div');
  wrap.id = 'fightBtns';
  wrap.style.cssText = 'position:fixed;top:50px;right:10px;z-index:120;display:flex;flex-direction:column;gap:4px;';
  wrap.innerHTML = [['off','⚔️'],['bal','⚖️'],['def','🛡️']].map(mm=>
    '<div class="fmB" data-fm2="'+mm[0]+'" style="width:34px;height:30px;display:flex;align-items:center;justify-content:center;'+
    'background:rgba(10,14,26,0.8);border:1px solid #3a4a7a;border-radius:8px;cursor:pointer;font-size:14px;user-select:none;">'+mm[1]+'</div>').join('');
  document.body.appendChild(wrap);
  wrap.querySelectorAll('[data-fm2]').forEach(b=> b.addEventListener('pointerdown', ev=>{
    ev.stopPropagation();
    socket.emit('fight_mode', {mode: b.getAttribute('data-fm2')});
  }));
})();
function updateFightBtns(mode){
  document.querySelectorAll('#fightBtns [data-fm2]').forEach(b=>{
    b.style.border = '1px solid ' + (b.getAttribute('data-fm2') === mode ? '#8ac0f0' : '#3a4a7a');
    b.style.background = b.getAttribute('data-fm2') === mode ? 'rgba(42,58,90,0.92)' : 'rgba(10,14,26,0.8)';
  });
}

// ---------- BOLSA DE RUNAS (tecla R): quebra no alvo marcado ----------
var _runesEl = null;
function openRunes(){
  if(_runesEl){ closeRunes(); return; }
  const runas = (typeof inventory !== 'undefined' ? inventory : []).filter(s=> s.item && s.item.indexOf('runa_') === 0 && s.item !== 'runa_em_branco');
  _runesEl = document.createElement('div');
  _runesEl.id = 'runesPanel';
  _runesEl.style.cssText = 'position:fixed;inset:0;z-index:234;display:flex;align-items:flex-end;justify-content:center;background:rgba(6,8,14,0.5);padding-bottom:96px;';
  _runesEl.addEventListener('click', ev=>{ if(ev.target === _runesEl) closeRunes(); });
  let h = '<div style="width:min(330px,92vw);max-height:52vh;overflow:auto;background:#181228;border:1px solid #6a4adf;border-radius:12px;padding:12px;">'+
    '<div style="font:800 13px Inter;color:#c9a0ff;margin-bottom:3px;">🪨 Bolsa de Runas</div>'+
    '<div style="font:500 10px Inter;color:#8a86a0;margin-bottom:8px;">Marque o alvo (Tab) e quebre a runa. Curas são em você. Tecla R abre/fecha.</div>';
  if(!runas.length) h += '<div style="font:500 11px Inter;color:#6f6a86;padding:6px 0;">Nenhuma runa. O alquimista grava, os monstros arcanos derrubam.</div>';
  for(const s of runas){
    const nm = s.item.replace('runa_','').replace(/_/g,' ').replace(/\b\w/g, c=> c.toUpperCase());
    h += '<div data-rune="'+s.item+'" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;'+
      'margin-bottom:5px;background:#221a38;border:1px solid #3a2e58;border-radius:8px;cursor:pointer;">'+
      '<span style="font:700 12px Inter;color:#d8c9ff;">🪨 '+nm+'</span>'+
      '<span style="font:800 11px Inter;color:#8a86a0;">x'+(s.qty||1)+'</span></div>';
  }
  h += '</div>';
  _runesEl.innerHTML = h;
  document.body.appendChild(_runesEl);
  _runesEl.querySelectorAll('[data-rune]').forEach(b=> b.addEventListener('click', ()=>{
    socket.emit('rune_use', {item: b.getAttribute('data-rune'), target: rtTargetId});
    sfx('posture');
    closeRunes();
  }));
}
function closeRunes(){ if(_runesEl){ _runesEl.remove(); _runesEl = null; } }

window.addEventListener('keydown', e=>{
  if(typeof started === 'undefined' || !started || typingInField(e)) return;
  if(e.code === 'KeyL'){ e.preventDefault(); openSkills(); }
  if(e.code === 'KeyR'){ e.preventDefault(); openRunes(); }
});

// ===========================================================================
//  O OSSUÁRIO DOS DOZE: subsolo do templo (crânios, velas, névoa e a FENDA)
//  + o alçapão de descida desenhado dentro do próprio templo
// ===========================================================================
(function(){
  const orig5 = drawInteriorDecor;
  drawInteriorDecor = function(c, now){
    orig5(c, now);
    if(mapName === 'templo_doze'){
      const ax = 3.5*TS - camX, ay = 12.5*TS - camY;      // o alçapão (3,12)
      c.save();
      c.fillStyle = '#0c0a10';
      c.fillRect(ax - TS*0.65, ay - TS*0.5, TS*1.3, TS*0.95);
      c.strokeStyle = '#4a4030'; c.lineWidth = 2;
      c.strokeRect(ax - TS*0.65, ay - TS*0.5, TS*1.3, TS*0.95);
      for(let i=0;i<3;i++){                                // os degraus sumindo
        c.fillStyle = 'rgba(120,104,80,' + (0.5 - i*0.14) + ')';
        c.fillRect(ax - TS*0.5 + i*4, ay - TS*0.32 + i*8, TS - i*8, 5);
      }
      c.font = '700 9px Inter'; c.textAlign = 'center';
      c.globalAlpha = 0.75 + 0.2*Math.sin(now/450);
      c.fillStyle = '#c9b890';
      c.fillText('🦴 Ossuário (E)', ax, ay - TS*0.7);
      c.restore();
      return;
    }
    if(mapName !== 'ossuario') return;
    c.save();
    // ---- paredes de CRÂNIOS: fileiras no topo e na base ----
    for(let i=0;i<9;i++){
      for(const wy of [0.62, 12.38]){
        const sx = (1.6 + i*1.9)*TS - camX, sy = wy*TS - camY;
        c.fillStyle = '#c9bda4';
        c.beginPath(); c.arc(sx, sy, 5.2, 0, Math.PI*2); c.fill();
        c.fillRect(sx - 3.4, sy + 2.5, 6.8, 3.2);
        c.fillStyle = '#161018';
        c.beginPath(); c.arc(sx - 1.9, sy - 0.6, 1.5, 0, Math.PI*2);
        c.arc(sx + 1.9, sy - 0.6, 1.5, 0, Math.PI*2); c.fill();
      }
    }
    // ---- nichos laterais com pilhas de ossos ----
    for(const ny of [2, 6, 10]){
      for(const nx of [0.55, 17.45]){
        const bx = nx*TS - camX, by = (ny + 0.5)*TS - camY;
        c.fillStyle = 'rgba(10,8,12,0.8)';
        c.fillRect(bx - 7, by - 12, 14, 24);
        c.fillStyle = '#b8ac92';
        for(let k=0;k<4;k++) c.fillRect(bx - 5.5, by + 6 - k*4.4, 11, 2.6);
      }
    }
    // ---- velas tremulando junto aos braseiros ----
    for(const [vx, vy] of [[3,2],[15,2],[3,6],[15,6],[3,10],[15,10]]){
      const cx3 = (vx + 0.5)*TS - camX, cy3 = (vy + 0.1)*TS - camY;
      c.save(); c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.5 + 0.3*Math.sin(now/160 + vx*3 + vy);
      const g = c.createRadialGradient(cx3, cy3, 0, cx3, cy3, TS*0.8);
      g.addColorStop(0, 'rgba(240,190,110,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(cx3, cy3, TS*0.8, 0, Math.PI*2); c.fill();
      c.restore();
    }
    // ---- O PORTAL DA FENDA (9,3): o vórtice no fundo da cripta ----
    const fx = 9.5*TS - camX, fy = 3.4*TS - camY;
    c.fillStyle = '#3a3444';
    for(const [ox, hh] of [[-0.62, 0.9], [0.62, 0.9], [-0.3, 1.2], [0.3, 1.2]]){
      c.fillRect(fx + ox*TS - 3, fy + TS*0.4 - hh*TS, 6, hh*TS);
    }
    c.save(); c.globalCompositeOperation = 'lighter';
    for(let i=0;i<3;i++){
      const a2 = now/700 + i*2.1;
      c.globalAlpha = 0.5 + 0.3*Math.sin(now/300 + i);
      c.strokeStyle = i%2 ? '#a06aff' : '#6a3adf'; c.lineWidth = 2.2;
      c.beginPath(); c.ellipse(fx, fy - TS*0.3, TS*0.4*(0.6+i*0.22), TS*0.55*(0.6+i*0.22), a2, 0, Math.PI*1.6); c.stroke();
    }
    const pg = c.createRadialGradient(fx, fy - TS*0.3, 0, fx, fy - TS*0.3, TS*1.0);
    pg.addColorStop(0, 'rgba(150,90,255,0.3)'); pg.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 0.6 + 0.3*Math.sin(now/500);
    c.fillStyle = pg; c.beginPath(); c.arc(fx, fy - TS*0.3, TS*1.0, 0, Math.PI*2); c.fill();
    c.restore();
    c.font = '700 9px Inter'; c.textAlign = 'center';
    c.fillStyle = '#c9a0ff';
    c.fillText('🌀 A FENDA (E com a Chave)', fx, fy - TS*1.35);
    // ---- a escada de volta + a placa + névoa baixa ----
    c.globalAlpha = 0.6 + 0.2*Math.sin(now/400);
    c.fillStyle = '#c9b890';
    c.fillText('▲ subir ao templo (E na parte de baixo)', 9.5*TS - camX, 11.3*TS - camY);
    c.globalAlpha = 1;
    c.font = '800 12px Cinzel, serif';
    c.fillStyle = 'rgba(0,0,0,.7)'; c.fillText('🦴 OSSUÁRIO DOS DOZE', canvas.width/2 + 1, 25);
    c.fillStyle = '#c9bda4'; c.fillText('🦴 OSSUÁRIO DOS DOZE', canvas.width/2, 24);
    c.save(); c.globalAlpha = 0.09;
    c.fillStyle = '#c9bda4';
    for(let i=0;i<4;i++){
      const mx = ((now/40 + i*160) % (canvas.width + 240)) - 120;
      c.beginPath(); c.ellipse(mx, (10.6 + (i%2)*0.7)*TS - camY, 90, 16, 0, 0, Math.PI*2); c.fill();
    }
    c.restore(); c.restore();
  };
})();

// ===========================================================================
//  EXPLOSÕES DE ÁREA (rt_aoe): flash, núcleo, anéis de choque e fagulhas,
//  com personalidade por elemento. O glamour de volta.
// ===========================================================================
var rtAoes = [];
var _AOE_PAL = {
  fogo:      ['#ff9a3c', '#ff5a2c', '#ffd9a0'],
  gelo:      ['#8ad8f0', '#4a9ad0', '#e8faff'],
  frio:      ['#8ad8f0', '#4a9ad0', '#e8faff'],
  raio:      ['#ffe66a', '#a0d8ff', '#fffbe0'],
  trovao:    ['#ffe66a', '#a0d8ff', '#fffbe0'],
  eletrico:  ['#ffe66a', '#a0d8ff', '#fffbe0'],
  acido:     ['#a0e05a', '#4a8a2a', '#e0ffb0'],
  veneno:    ['#7ac04a', '#2a6a1a', '#c9f0a0'],
  necrotico: ['#8a5adf', '#3a2a58', '#d0b8ff'],
  radiante:  ['#ffd97a', '#e0a030', '#fff4d0'],
  psiquico:  ['#df7ad0', '#7a3a9a', '#ffd0f8'],
  cortante:  ['#c9d0da', '#7a8494', '#f0f4fa'],
  energia:   ['#7ab0ff', '#3a5adf', '#d0e4ff'],
};
function drawRtAoes(c, now){
  if(!rtAoes.length) return;
  for(let i = rtAoes.length - 1; i >= 0; i--){
    const a = rtAoes[i];
    const t = (now - a.t0) / 750;
    if(t >= 1){ rtAoes.splice(i, 1); continue; }
    const cx2 = (a.x + 0.5) * TS - camX, cy2 = (a.y + 0.5) * TS - camY;
    const R = (a.r + 0.6) * TS;
    if(cx2 < -R*2 || cy2 < -R*2 || cx2 > canvas.width + R*2 || cy2 > canvas.height + R*2) continue;
    const pal = _AOE_PAL[a.dtype] || _AOE_PAL.energia;
    const raio = (a.dtype === 'raio' || a.dtype === 'trovao' || a.dtype === 'eletrico');
    c.save();
    c.globalCompositeOperation = 'lighter';
    if(t < 0.16){                                             // o FLASH
      c.globalAlpha = (1 - t/0.16) * 0.85;
      const fg = c.createRadialGradient(cx2, cy2, 0, cx2, cy2, R*1.15);
      fg.addColorStop(0, pal[2]); fg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = fg;
      c.beginPath(); c.arc(cx2, cy2, R*1.15, 0, Math.PI*2); c.fill();
    }
    const nR = R * (0.35 + t*0.75);                           // o NÚCLEO crescendo
    c.globalAlpha = Math.max(0, 0.8 - t*0.9);
    const ng = c.createRadialGradient(cx2, cy2, 0, cx2, cy2, nR);
    ng.addColorStop(0, pal[2]); ng.addColorStop(0.45, pal[0]); ng.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = ng;
    c.beginPath(); c.arc(cx2, cy2, nR, 0, Math.PI*2); c.fill();
    for(const [k0, w0] of [[0.35, 3.2], [0.12, 1.8]]){        // ANÉIS de choque
      const rr = R * (0.35 + t*1.55) * (1 - k0*0.4);
      c.globalAlpha = Math.max(0, (1 - t) * 0.75);
      c.strokeStyle = pal[0]; c.lineWidth = Math.max(0.8, w0 * (1 - t));
      c.beginPath(); c.arc(cx2, cy2, rr, 0, Math.PI*2); c.stroke();
    }
    for(let p = 0; p < 16; p++){                              // as FAGULHAS radiais
      const ang = (p / 16) * Math.PI * 2 + (a.t0 % 7) + p*0.13;
      const dist = t * R * 1.45 * (0.7 + ((p*37) % 10) / 18);
      const px2 = cx2 + Math.cos(ang) * dist, py2 = cy2 + Math.sin(ang) * dist;
      c.globalAlpha = Math.max(0, 1 - t*1.15);
      c.fillStyle = pal[p % 2];
      const sz = Math.max(1, 3.4 * (1 - t));
      if(raio){                                               // raio: zigue-zague
        c.strokeStyle = pal[p % 2]; c.lineWidth = Math.max(0.8, 1.8*(1 - t));
        c.beginPath(); c.moveTo(cx2, cy2);
        c.lineTo(cx2 + Math.cos(ang + 0.14)*dist*0.55, cy2 + Math.sin(ang + 0.14)*dist*0.55);
        c.lineTo(px2, py2); c.stroke();
      } else {
        c.fillRect(px2 - sz/2, py2 - sz/2, sz, sz);
      }
    }
    if(a.dtype === 'fogo' && t > 0.35){                       // fumaça sobe
      c.globalCompositeOperation = 'source-over';
      for(let s2 = 0; s2 < 4; s2++){
        c.globalAlpha = Math.max(0, (t - 0.35) * 0.35 * (1 - t));
        c.fillStyle = '#5a5a62';
        const sx2 = cx2 + ((s2*53) % 40) - 20;
        c.beginPath();
        c.arc(sx2, cy2 - (t - 0.35) * 60 - s2*7, 7 + s2*2.5, 0, Math.PI*2);
        c.fill();
      }
    }
    c.restore();
  }
}

// ===========================================================================
//  A PRAÇA DOS HERÓIS: três estátuas douradas com os nomes dos maiores
// ===========================================================================
var _plazaData = null;
(function(){
  const orig6 = drawErmoDecor;
  drawErmoDecor = function(c, now){
    orig6(c, now);
    const defs = [[53, 45, '⚔️ ARENA', 'arena'], [56, 45, '🌀 FENDA', 'fenda'], [59, 45, '🎣 PESCA', 'pesca']];
    for(const [gx, gy, titulo, chave] of defs){
      const sx = (gx + 0.5)*TS - camX, sy = (gy + 0.5)*TS - camY;
      if(sx < -TS*2 || sy < -TS*2 || sx > canvas.width+TS*2 || sy > canvas.height+TS*2) continue;
      c.save();
      c.fillStyle = 'rgba(0,0,0,.3)';
      c.beginPath(); c.ellipse(sx, sy + TS*0.45, TS*0.55, TS*0.16, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = '#8a8a94';                                     // o pedestal
      c.fillRect(sx - TS*0.42, sy - TS*0.05, TS*0.84, TS*0.5);
      c.fillStyle = '#a0a0aa';
      c.fillRect(sx - TS*0.5, sy + TS*0.32, TS*1.0, TS*0.14);
      const g = c.createLinearGradient(sx, sy - TS*1.15, sx, sy);   // a figura dourada
      g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#c9931a');
      c.fillStyle = g;
      c.beginPath(); c.arc(sx, sy - TS*0.95, TS*0.16, 0, Math.PI*2); c.fill();
      c.beginPath();
      c.moveTo(sx - TS*0.26, sy - TS*0.05);
      c.lineTo(sx - TS*0.14, sy - TS*0.75);
      c.lineTo(sx + TS*0.14, sy - TS*0.75);
      c.lineTo(sx + TS*0.26, sy - TS*0.05);
      c.closePath(); c.fill();
      c.save(); c.globalCompositeOperation = 'lighter';             // o brilho
      c.globalAlpha = 0.25 + 0.15*Math.sin(now/600 + gx);
      c.fillStyle = '#ffd97a';
      c.beginPath(); c.arc(sx, sy - TS*0.55, TS*0.7, 0, Math.PI*2); c.fill();
      c.restore();
      c.font = '700 8.5px Inter'; c.textAlign = 'center';
      c.fillStyle = '#c9a860';
      c.fillText(titulo, sx, sy + TS*0.7);
      const nome = (_plazaData && _plazaData[chave]) || '—';
      c.fillStyle = 'rgba(0,0,0,.65)'; c.fillText(nome, sx + 0.6, sy + TS*0.99);
      c.fillStyle = '#f0e4c0'; c.fillText(nome, sx, sy + TS*0.98);
      c.restore();
    }
  };
})();

// ===========================================================================
//  OS JARDINS: canteiros de terra, brotos crescendo e colheitas brilhando
// ===========================================================================
var _gardenPlots = [];
function drawGarden(c, now){
  if(!_gardenPlots.length || typeof mapName === 'undefined') return;
  for(const p of _gardenPlots){
    if(p.map !== mapName) continue;
    const sx = p.x*TS - camX, sy = p.y*TS - camY;
    if(sx < -TS*2 || sy < -TS*2 || sx > canvas.width+TS*2 || sy > canvas.height+TS*2) continue;
    c.save();
    c.fillStyle = '#5a4228';                                     // a terra
    c.fillRect(sx + 2, sy + 3, TS*2 - 4, TS - 6);
    c.strokeStyle = '#7a5a38'; c.lineWidth = 2;
    c.strokeRect(sx + 2, sy + 3, TS*2 - 4, TS - 6);
    c.strokeStyle = 'rgba(30,20,12,0.5)'; c.lineWidth = 1;
    for(let i=1;i<4;i++){ c.beginPath(); c.moveTo(sx + 4, sy + 3 + i*(TS-6)/4); c.lineTo(sx + TS*2 - 4, sy + 3 + i*(TS-6)/4); c.stroke(); }
    if(p.stage === 'broto'){
      c.strokeStyle = '#6aa84a'; c.lineWidth = 2;
      for(const ox of [0.4, 1.0, 1.6]){
        const bx = sx + ox*TS, by = sy + TS*0.62;
        c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + Math.sin(now/500+ox)*2, by - 8, bx, by - 12); c.stroke();
      }
    } else if(p.stage === 'pronto'){
      for(const ox of [0.4, 1.0, 1.6]){
        const bx = sx + ox*TS, by = sy + TS*0.6;
        c.strokeStyle = '#4a8a3a'; c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, by - 16); c.stroke();
        c.fillStyle = '#8fe08f';
        c.beginPath(); c.arc(bx, by - 18, 4.5, 0, Math.PI*2); c.fill();
      }
      c.save(); c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.3 + 0.2*Math.sin(now/350);
      c.fillStyle = '#a0ffb0';
      c.beginPath(); c.ellipse(sx + TS, sy + TS*0.35, TS*1.1, TS*0.5, 0, 0, Math.PI*2); c.fill();
      c.restore();
      c.font = '700 9px Inter'; c.textAlign = 'center';
      c.fillStyle = '#c9f0a0'; c.fillText('🌾 (E)', sx + TS, sy - 4);
    }
    c.restore();
  }
}


// ===== casas e torres da ilha (geradas pelos mapas, pro decor) =====
var _ILHA_CASAS = {"vilalbina": [[3, 3, 5, 3, "branca"], [10, 3, 4, 3, "branca"], [30, 3, 5, 3, "branca"], [37, 3, 4, 3, "branca"], [3, 9, 4, 3, "branca"], [37, 9, 4, 3, "branca"], [3, 15, 5, 3, "branca"], [36, 15, 5, 3, "branca"], [10, 20, 4, 3, "branca"], [30, 20, 4, 3, "branca"]], "trigal_dourado": [[8, 7, 6, 4, "fazenda"], [38, 25, 6, 4, "fazenda"]], "vinhedo": [[42, 12, 5, 3, "adega"]], "pastos": [[31, 20, 10, 6, "celeiro"]], "prospera": [[4, 4, 6, 4, "nobre"], [13, 4, 5, 3, "comum"], [21, 4, 5, 4, "comum"], [50, 4, 6, 4, "nobre"], [59, 4, 5, 3, "comum"], [67, 4, 6, 4, "nobre"], [76, 4, 6, 3, "comum"], [4, 12, 5, 3, "comum"], [13, 12, 6, 4, "comum"], [67, 12, 5, 3, "comum"], [76, 11, 6, 4, "nobre"], [4, 20, 5, 3, "comum"], [22, 20, 5, 3, "comum"], [58, 20, 5, 3, "comum"], [4, 44, 6, 4, "comum"], [13, 44, 5, 3, "comum"], [22, 44, 6, 4, "nobre"], [50, 44, 5, 3, "comum"], [59, 44, 6, 4, "comum"], [68, 44, 5, 3, "comum"], [77, 44, 5, 4, "nobre"], [4, 53, 5, 3, "comum"], [13, 53, 6, 3, "comum"], [50, 53, 5, 3, "comum"], [59, 53, 6, 3, "comum"], [68, 53, 5, 3, "comum"]], "_torres_templo": [[27, 10], [35, 12], [41, 18], [44, 27], [41, 35], [35, 41], [27, 44], [18, 41], [12, 35], [10, 27], [12, 18], [18, 12]], "jardim_templo": [], "cidade_alta": [[4, 4, 5, 3, "nobre"], [4, 12, 6, 4, "nobre"], [38, 4, 6, 4, "nobre"], [38, 12, 5, 3, "nobre"], [4, 30, 5, 3, "nobre"], [38, 30, 6, 4, "nobre"], [12, 30, 5, 3, "nobre"]], "farol_margem": [[4, 6, 12, 8, "mansao"]]};

// ===========================================================================
//  PROSPERINA, A ILHA-CELEIRO: o grande decor. Telhados de verdade, fonte,
//  vitrais das doze torres, a Torre da Alvorada, o Farol do Âmbar.
// ===========================================================================
var _ILHA_PAL = {
  branca:  {roof:'#c4553a', roofHi:'#d96a4c', wall:'#f2eee2', door:'#6a4326', win:'#ffd98a'},
  comum:   {roof:'#6a7280', roofHi:'#7e8794', wall:'#d8d2c2', door:'#5a4430', win:'#ffd98a'},
  nobre:   {roof:'#3a4e8a', roofHi:'#4a62a8', wall:'#e4ddc9', door:'#3a2c1a', win:'#ffe9a8', gold:true},
  fazenda: {roof:'#8a4a3a', roofHi:'#a05a46', wall:'#c9b490', door:'#4a3018', win:'#ffd98a'},
  celeiro: {roof:'#a33d30', roofHi:'#bf4c3c', wall:'#b5432f', door:'#f0ead8', win:'#f0ead8', barn:true},
  adega:   {roof:'#5a3a5a', roofHi:'#6e4a6e', wall:'#d8ccb8', door:'#3a2438', win:'#e8c9ff'},
  mansao:  {roof:'#b8963a', roofHi:'#d4b04c', wall:'#efe7d2', door:'#4a3416', win:'#fff0b8', gold:true},
};
var _DEUS_CORES = ['#f2c14e','#e05a4e','#5aa9e0','#7ac06a','#b06ae0','#e0865a',
                   '#5ae0c9','#e05aa0','#c9e05a','#8a7ae0','#e0c95a','#7a8a99'];

function _telhado(c, x, y, w, h, st, now){
  const p = _ILHA_PAL[st] || _ILHA_PAL.comum;
  const px = x*TS - camX, py = y*TS - camY, pw = w*TS, ph = h*TS;
  if(px > canvas.width + TS || py > canvas.height + TS || px + pw < -TS || py + ph < -TS) return;
  const wallH = Math.min(TS*0.55, ph*0.28);                 // a face sul aparente
  c.fillStyle = p.wall;
  c.fillRect(px, py + ph - wallH, pw, wallH);
  c.fillStyle = 'rgba(0,0,0,0.12)';
  c.fillRect(px, py + ph - wallH, pw, 3);
  const doorW = Math.min(12, pw*0.2);                       // a porta
  c.fillStyle = p.door;
  c.fillRect(px + pw/2 - doorW/2, py + ph - wallH + 4, doorW, wallH - 4);
  const nwin = Math.max(0, Math.floor(w/2) - 1);            // janelas acesas
  for(let i = 0; i < nwin; i++){
    const wx = px + (i + 0.75) * (pw/(nwin + 1)) - 3;
    if(Math.abs(wx - (px + pw/2)) < doorW) continue;
    c.fillStyle = p.win; c.fillRect(wx, py + ph - wallH + 6, 6, 7);
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.strokeRect(wx, py + ph - wallH + 6, 6, 7);
  }
  const roofH = ph - wallH;                                  // o telhado de duas águas
  c.fillStyle = p.roof;  c.fillRect(px - 3, py - 3, pw + 6, roofH + 3);
  c.fillStyle = p.roofHi; c.fillRect(px - 3, py - 3, pw + 6, (roofH + 3) * 0.46);
  if(typeof _serverWx !== 'undefined' && _serverWx === 'neve'){
    c.fillStyle = 'rgba(245,250,255,0.85)';
    c.fillRect(px - 3, py - 3, pw + 6, (roofH + 3) * 0.34);
    c.fillStyle = 'rgba(245,250,255,0.6)';
    for(let sx2 = px - 3; sx2 < px + pw + 3; sx2 += 7)
      c.fillRect(sx2, py - 3 + (roofH + 3)*0.34, 4, 2.5);
  }
  c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 1;
  for(let i = 1; i < w + 1; i++){                            // as telhas
    c.beginPath(); c.moveTo(px - 3 + i*TS, py - 3); c.lineTo(px - 3 + i*TS, py - 3 + roofH + 3); c.stroke();
  }
  c.fillStyle = 'rgba(0,0,0,0.28)';                          // a cumeeira e o beiral
  c.fillRect(px - 3, py - 3 + (roofH + 3) * 0.46 - 1.5, pw + 6, 3);
  c.fillRect(px - 3, py + roofH - 2, pw + 6, 3);
  if(p.gold){ c.fillStyle = '#ffd97a'; c.fillRect(px - 3, py - 3, pw + 6, 2.5); }
  if(p.barn){                                                // o X branco do celeiro
    c.strokeStyle = '#f0ead8'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(px + pw*0.25, py + 2); c.lineTo(px + pw*0.75, py + roofH - 4);
    c.moveTo(px + pw*0.75, py + 2); c.lineTo(px + pw*0.25, py + roofH - 4); c.stroke();
  }
  if(st === 'mansao'){                                       // a bandeira Prosperi
    const fx = px + pw - 6, fy = py - 3;
    c.strokeStyle = '#7a6a4a'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, fy - 22); c.stroke();
    c.fillStyle = '#ffd24a';
    c.beginPath(); c.moveTo(fx, fy - 22);
    c.lineTo(fx + 14 + Math.sin(now/300)*2, fy - 18);
    c.lineTo(fx, fy - 14); c.closePath(); c.fill();
  }
}

function drawIlhaDecor(c, now){
  if(typeof mapName === 'undefined' || !_ILHA_CASAS) return;
  const casas = _ILHA_CASAS[mapName];
  const naIlha = !!casas || mapName === 'jardim_templo' || mapName === 'farol_margem' || mapName === 'cidade_alta';
  if(!naIlha) return;
  c.save();

  // ---- TRIGAL: o ouro balançando ----
  if(mapName === 'trigal_dourado'){
    c.fillStyle = 'rgba(224,182,74,0.32)';
    for(let ty = 1; ty < 35; ty++){
      if(ty === 17 || ty === 18) continue;
      const sy = ty*TS - camY;
      if(sy < -TS || sy > canvas.height + TS) continue;
      c.fillRect(-camX + TS, sy, 54*TS, TS);
    }
    c.strokeStyle = '#c9982e'; c.lineWidth = 1.6;
    for(let gx = 2; gx < 54; gx += 2){
      const sx = gx*TS - camX;
      if(sx < -TS || sx > canvas.width + TS) continue;
      for(let gy = 2; gy < 34; gy += 2){
        if(gy >= 16 && gy <= 19) continue;
        const sy = gy*TS - camY;
        if(sy < -TS || sy > canvas.height + TS) continue;
        const sw = Math.sin(now/600 + gx*0.7 + gy*0.4)*2.5;
        c.beginPath(); c.moveTo(sx + TS*0.5, sy + TS*0.85);
        c.quadraticCurveTo(sx + TS*0.5 + sw, sy + TS*0.45, sx + TS*0.5 + sw*1.4, sy + TS*0.18);
        c.stroke();
        c.fillStyle = '#e8c050';
        c.beginPath(); c.ellipse(sx + TS*0.5 + sw*1.4, sy + TS*0.14, 2.6, 4.6, sw*0.1, 0, Math.PI*2); c.fill();
      }
    }
  }

  // ---- VINHEDO: as parreiras ----
  if(mapName === 'vinhedo'){
    for(let vy = 7; vy < 28; vy++){
      if(vy % 3 === 0 || vy === 16 || vy === 17) continue;
      const sy = vy*TS - camY;
      if(sy < -TS*2 || sy > canvas.height + TS) continue;
      const x0 = 5*TS - camX, x1 = 47*TS - camX;
      c.strokeStyle = '#6a4a2a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x0, sy + TS*0.35); c.lineTo(x1, sy + TS*0.35); c.stroke();
      for(let vx = 6; vx < 47; vx += 2){
        const sx = vx*TS - camX;
        if(sx < -TS || sx > canvas.width + TS) continue;
        c.fillStyle = '#3a6a2a';
        c.beginPath(); c.arc(sx, sy + TS*0.32, 6.5, 0, Math.PI*2); c.fill();
        c.fillStyle = '#4a8a34';
        c.beginPath(); c.arc(sx - 4, sy + TS*0.26, 4.5, 0, Math.PI*2);
        c.arc(sx + 4, sy + TS*0.28, 4.5, 0, Math.PI*2); c.fill();
        if((vx + vy) % 3 === 0){
          c.fillStyle = '#6a3a8a';
          c.beginPath(); c.arc(sx + 1, sy + TS*0.46, 2, 0, Math.PI*2);
          c.arc(sx - 2, sy + TS*0.5, 2, 0, Math.PI*2);
          c.arc(sx + 3, sy + TS*0.51, 2, 0, Math.PI*2); c.fill();
        }
      }
    }
  }

  // ---- PASTOS: fardos de feno ----
  if(mapName === 'pastos'){
    for(const [hx, hy] of [[24, 6], [26, 9], [23, 24], [12, 15.6], [44, 15.6], [46, 3]]){
      const sx = hx*TS - camX, sy = hy*TS - camY;
      if(sx < -TS || sx > canvas.width + TS || sy < -TS || sy > canvas.height + TS) continue;
      c.fillStyle = '#d8b04c';
      c.beginPath(); c.arc(sx, sy, TS*0.36, 0, Math.PI*2); c.fill();
      c.strokeStyle = '#a8842e'; c.lineWidth = 1.5;
      for(let r = 4; r < TS*0.36; r += 4){ c.beginPath(); c.arc(sx, sy, r, 0, Math.PI*2); c.stroke(); }
    }
  }

  // ---- os TELHADOS de todas as casas do mapa ----
  if(casas){
    for(const [x, y, w, h, st] of casas) _telhado(c, x, y, w, h, st, now);
  }

  // ---- VILALBINA: bandeirinhas da festa eterna ----
  if(mapName === 'vilalbina'){
    const fios = [[16, 9.6, 29, 9.6], [16, 16.4, 29, 16.4], [16, 9.6, 16, 16.4], [29, 9.6, 29, 16.4]];
    const cores = ['#e05a4e', '#f2c14e', '#5aa9e0', '#7ac06a', '#e08ae0'];
    for(const [ax, ay, bx, by] of fios){
      const x0 = ax*TS - camX, y0 = ay*TS - camY, x1 = bx*TS - camX, y1 = by*TS - camY;
      c.strokeStyle = 'rgba(90,70,50,0.8)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0+x1)/2, (y0+y1)/2 + 8, x1, y1); c.stroke();
      const n = 8;
      for(let i = 1; i < n; i++){
        const t = i/n;
        const fx = x0 + (x1-x0)*t, fy = y0 + (y1-y0)*t + 8*Math.sin(Math.PI*t)*0.9;
        const sw2 = Math.sin(now/280 + i*1.3)*1.6;
        c.fillStyle = cores[i % cores.length];
        c.beginPath(); c.moveTo(fx - 4, fy); c.lineTo(fx + 4, fy); c.lineTo(fx + sw2, fy + 7); c.closePath(); c.fill();
      }
    }
  }

  // ---- PROSPERA: a fonte, os lampiões e as bandeiras ----
  if(mapName === 'prospera'){
    const fx = 37.5*TS - camX, fy = 25.5*TS - camY;      // A FONTE
    if(fx > -TS*3 && fx < canvas.width + TS*3 && fy > -TS*3 && fy < canvas.height + TS*3){
      c.fillStyle = '#8a8a94';
      c.beginPath(); c.arc(fx, fy, TS*1.15, 0, Math.PI*2); c.fill();
      c.fillStyle = '#5a8ac9';
      c.beginPath(); c.arc(fx, fy, TS*0.92, 0, Math.PI*2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      for(let i = 0; i < 3; i++){
        const rr = ((now/26 + i*38) % 100) / 100;
        c.globalAlpha = 0.5*(1 - rr);
        c.beginPath(); c.arc(fx, fy, TS*0.2 + rr*TS*0.7, 0, Math.PI*2); c.stroke();
      }
      c.globalAlpha = 1;
      c.fillStyle = '#a0a0aa';
      c.beginPath(); c.arc(fx, fy, TS*0.22, 0, Math.PI*2); c.fill();
      for(let j = 0; j < 5; j++){                        // os jatos
        const jt = (now/380 + j*1.7) % 2;
        c.fillStyle = 'rgba(190,220,255,0.85)';
        c.beginPath(); c.arc(fx + Math.cos(j*1.26)*6, fy - 10 - Math.sin(Math.min(1, jt)*Math.PI)*10, 2.2, 0, Math.PI*2); c.fill();
      }
    }
    for(let lx = 6; lx < 84; lx += 8){                   // lampiões da avenida
      for(const ly of [29.2, 32.2]){
        const sx = lx*TS - camX, sy = ly*TS - camY;
        if(sx < -TS || sx > canvas.width + TS || sy < -TS*2 || sy > canvas.height + TS) continue;
        c.strokeStyle = '#3a3a42'; c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx, sy - 18); c.stroke();
        c.save(); c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.55 + 0.18*Math.sin(now/300 + lx);
        const g = c.createRadialGradient(sx, sy - 20, 0, sx, sy - 20, 13);
        g.addColorStop(0, 'rgba(255,214,130,0.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(sx, sy - 20, 13, 0, Math.PI*2); c.fill();
        c.restore();
        c.fillStyle = '#ffe9b0';
        c.beginPath(); c.arc(sx, sy - 20, 3, 0, Math.PI*2); c.fill();
      }
    }
    for(const [gx, gy] of [[41, 2.4], [45, 2.4], [41, 59.6], [45, 59.6], [2.4, 29], [2.4, 33], [83.6, 29], [83.6, 33]]){
      const sx = gx*TS - camX, sy = gy*TS - camY;        // bandeiras dos portões
      if(sx < -TS || sx > canvas.width + TS || sy < -TS*2 || sy > canvas.height + TS) continue;
      c.strokeStyle = '#7a6a4a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx, sy - 26); c.stroke();
      c.fillStyle = '#ffd24a';
      c.beginPath(); c.moveTo(sx, sy - 26);
      c.lineTo(sx + 15 + Math.sin(now/260 + gx)*2.5, sy - 21);
      c.lineTo(sx, sy - 16); c.closePath(); c.fill();
    }
  }

  // ---- JARDIM: as 12 torres com vitrais (a luz pinta o chão) ----
  if(mapName === 'jardim_templo' && _ILHA_CASAS._torres_templo){
    _ILHA_CASAS._torres_templo.forEach(([tx, ty], i) => {
      const sx = (tx + 1)*TS - camX, base = (ty + 2)*TS - camY;
      if(sx < -TS*3 || sx > canvas.width + TS*3 || base < -TS*6 || base > canvas.height + TS*6) return;
      const cor = _DEUS_CORES[i % 12];
      c.save(); c.globalCompositeOperation = 'lighter';       // a luz no chão
      c.globalAlpha = 0.16 + 0.07*Math.sin(now/700 + i);
      const lg = c.createRadialGradient(sx, base + TS*0.6, 0, sx, base + TS*0.6, TS*2.2);
      lg.addColorStop(0, cor); lg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = lg;
      c.beginPath(); c.ellipse(sx, base + TS*0.6, TS*2.2, TS*1.1, 0, 0, Math.PI*2); c.fill();
      c.restore();
      const alt = TS*3.4;                                     // o corpo da torre
      c.fillStyle = '#e8e2d4';
      c.fillRect(sx - TS*0.8, base - alt, TS*1.6, alt);
      c.fillStyle = 'rgba(0,0,0,0.14)';
      c.fillRect(sx + TS*0.25, base - alt, TS*0.55, alt);
      c.fillStyle = '#c9c2b0';                                // o topo cônico
      c.beginPath(); c.moveTo(sx - TS*0.95, base - alt);
      c.lineTo(sx, base - alt - TS*0.9); c.lineTo(sx + TS*0.95, base - alt); c.closePath(); c.fill();
      c.save(); c.globalAlpha = 0.85 + 0.15*Math.sin(now/450 + i*2);   // O VITRAL
      c.fillStyle = cor;
      c.beginPath(); c.ellipse(sx, base - alt*0.62, TS*0.34, TS*0.52, 0, 0, Math.PI*2); c.fill();
      c.strokeStyle = 'rgba(40,32,20,0.7)'; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.moveTo(sx, base - alt*0.62 - TS*0.52); c.lineTo(sx, base - alt*0.62 + TS*0.52);
      c.moveTo(sx - TS*0.34, base - alt*0.62); c.lineTo(sx + TS*0.34, base - alt*0.62); c.stroke();
      c.restore();
    });
    const ax = 27.5*TS - camX, ay = 27.5*TS - camY;           // o feixe do altar
    c.save(); c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.10 + 0.05*Math.sin(now/900);
    const ag = c.createLinearGradient(ax, ay - TS*7, ax, ay);
    ag.addColorStop(0, 'rgba(255,244,200,0)'); ag.addColorStop(1, 'rgba(255,244,200,0.85)');
    c.fillStyle = ag;
    c.beginPath(); c.moveTo(ax - TS*0.4, ay); c.lineTo(ax - TS*1.6, ay - TS*7);
    c.lineTo(ax + TS*1.6, ay - TS*7); c.lineTo(ax + TS*0.4, ay); c.closePath(); c.fill();
    c.restore();
  }

  // ---- CIDADE ALTA: a Torre da Alvorada e os grifos ----
  if(mapName === 'cidade_alta'){
    const cx2 = 25*TS - camX, base = 11*TS - camY;
    if(cx2 > -TS*8 && cx2 < canvas.width + TS*8){
      const alt = TS*5.2;
      c.fillStyle = '#ece6d6';                                 // o corpo monumental
      c.fillRect(cx2 - TS*3.2, base - alt, TS*6.4, alt);
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.fillRect(cx2 + TS*1.2, base - alt, TS*2, alt);
      c.strokeStyle = 'rgba(90,80,60,0.5)'; c.lineWidth = 1.5;
      for(let fl = 1; fl <= 4; fl++){
        c.beginPath(); c.moveTo(cx2 - TS*3.2, base - fl*alt/5); c.lineTo(cx2 + TS*3.2, base - fl*alt/5); c.stroke();
        for(const wx of [-2.1, -0.7, 0.7, 2.1]){               // janelas em arco
          const jx = cx2 + wx*TS, jy = base - fl*alt/5 + alt/10;
          c.fillStyle = '#ffdf9a';
          c.beginPath(); c.arc(jx, jy - 4, 4.5, Math.PI, 0);
          c.rect(jx - 4.5, jy - 4, 9, 9); c.fill();
        }
      }
      c.fillStyle = '#d4c9a8';                                 // o coroamento
      c.beginPath(); c.moveTo(cx2 - TS*3.5, base - alt);
      c.lineTo(cx2, base - alt - TS*1.4); c.lineTo(cx2 + TS*3.5, base - alt); c.closePath(); c.fill();
      c.save(); c.globalCompositeOperation = 'lighter';        // A ALVORADA no topo
      c.globalAlpha = 0.65 + 0.25*Math.sin(now/500);
      const tg = c.createRadialGradient(cx2, base - alt - TS*1.2, 0, cx2, base - alt - TS*1.2, TS*2.4);
      tg.addColorStop(0, 'rgba(255,224,138,0.95)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = tg;
      c.beginPath(); c.arc(cx2, base - alt - TS*1.2, TS*2.4, 0, Math.PI*2); c.fill();
      c.restore();
      c.fillStyle = '#fff2c0';
      c.beginPath(); c.arc(cx2, base - alt - TS*1.2, 5, 0, Math.PI*2); c.fill();
    }
    for(const gx of [22, 27]){                                 // OS GRIFOS
      const sx = (gx + 0.5)*TS - camX, sy = 12.6*TS - camY;
      if(sx < -TS*2 || sx > canvas.width + TS*2) continue;
      c.fillStyle = '#b5ada0';
      c.fillRect(sx - 9, sy - 4, 18, 10);                      // o pedestal
      c.beginPath(); c.ellipse(sx, sy - 12, 7, 9, 0, 0, Math.PI*2); c.fill();   // corpo
      c.beginPath(); c.arc(sx + 5, sy - 20, 4.5, 0, Math.PI*2); c.fill();       // cabeça
      c.fillStyle = '#c5bdb0';                                 // as asas abertas
      c.beginPath(); c.moveTo(sx - 5, sy - 15); c.quadraticCurveTo(sx - 18, sy - 26, sx - 8, sy - 28);
      c.quadraticCurveTo(sx - 6, sy - 20, sx - 3, sy - 17); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(sx + 7, sy - 16); c.quadraticCurveTo(sx + 19, sy - 27, sx + 10, sy - 29);
      c.quadraticCurveTo(sx + 8, sy - 21, sx + 5, sy - 18); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,220,120,' + (0.5 + 0.4*Math.sin(now/700 + gx)) + ')';
      c.beginPath(); c.arc(sx + 6.5, sy - 21, 1.2, 0, Math.PI*2); c.fill();     // o olho
    }
  }

  // ---- FAROL: a luz do Âmbar girando sobre o mar ----
  if(mapName === 'farol_margem'){
    const fx = 25*TS - camX, base = 23*TS - camY;
    if(fx > -TS*6 && fx < canvas.width + TS*6){
      const alt = TS*6;
      c.fillStyle = '#e8e0d0';
      c.fillRect(fx - TS*1.6, base - alt, TS*3.2, alt);        // o fuste
      c.fillStyle = '#c04a3a';                                 // as faixas
      for(let b = 0; b < 3; b++) c.fillRect(fx - TS*1.6, base - alt + (b*2 + 0.7)*alt/6, TS*3.2, alt/9);
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.fillRect(fx + TS*0.5, base - alt, TS*1.1, alt);
      c.fillStyle = '#5a5248';                                 // a galeria
      c.fillRect(fx - TS*1.9, base - alt - 6, TS*3.8, 8);
      c.fillStyle = '#3a352e';
      c.fillRect(fx - TS*1.1, base - alt - TS*1.1, TS*2.2, TS*1.1);
      const ang = now/900;                                     // O FEIXE DO ÂMBAR
      c.save(); c.globalCompositeOperation = 'lighter';
      for(const dir of [0, Math.PI]){
        const a = ang + dir;
        const bx = fx, by = base - alt - TS*0.55;
        const g2 = c.createLinearGradient(bx, by, bx + Math.cos(a)*TS*9, by + Math.sin(a)*TS*4.5);
        g2.addColorStop(0, 'rgba(255,196,90,0.5)'); g2.addColorStop(1, 'rgba(255,196,90,0)');
        c.fillStyle = g2;
        c.beginPath(); c.moveTo(bx, by);
        c.lineTo(bx + Math.cos(a - 0.16)*TS*9, by + Math.sin(a - 0.16)*TS*4.5);
        c.lineTo(bx + Math.cos(a + 0.16)*TS*9, by + Math.sin(a + 0.16)*TS*4.5);
        c.closePath(); c.fill();
      }
      c.globalAlpha = 0.75 + 0.25*Math.sin(now/220);
      const ag2 = c.createRadialGradient(fx, base - alt - TS*0.55, 0, fx, base - alt - TS*0.55, TS*1.5);
      ag2.addColorStop(0, 'rgba(255,214,110,1)'); ag2.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = ag2;
      c.beginPath(); c.arc(fx, base - alt - TS*0.55, TS*1.5, 0, Math.PI*2); c.fill();
      c.restore();
      c.save(); c.globalAlpha = 0.25 + 0.1*Math.sin(now/400);  // o reflexo no mar
      c.fillStyle = '#ffce7a';
      c.beginPath(); c.ellipse(fx, (26.5)*TS - camY, TS*1.8, TS*0.35, 0, 0, Math.PI*2); c.fill();
      c.restore();
    }
  }
  c.restore();
}

// ===========================================================================
//  O SOPRO DE VIDA: chaminés, ameias e as partículas únicas de cada mapa.
// ===========================================================================
(function(){
  const base = drawIlhaDecor;
  drawIlhaDecor = function(c, now){
    base(c, now);
    if(typeof mapName === 'undefined') return;
    const casas = _ILHA_CASAS && _ILHA_CASAS[mapName];
    c.save();

    // ---- chaminés fumegando (todas as casas da ilha) ----
    if(casas){
      for(const [x, y, w, h] of casas){
        const cx2 = (x + w - 0.6)*TS - camX, cy2 = (y + 0.3)*TS - camY;
        if(cx2 < -TS || cx2 > canvas.width + TS || cy2 < -TS*2 || cy2 > canvas.height + TS) continue;
        c.fillStyle = '#6a5a4a';
        c.fillRect(cx2 - 3, cy2 - 6, 6, 8);
        for(let s = 0; s < 3; s++){
          const t = ((now/1400 + s*0.33 + x*0.1) % 1);
          c.globalAlpha = 0.28 * (1 - t);
          c.fillStyle = '#c9c4bc';
          c.beginPath();
          c.arc(cx2 + Math.sin(now/700 + s + x)*3*t, cy2 - 8 - t*22, 2.5 + t*4.5, 0, Math.PI*2);
          c.fill();
        }
        c.globalAlpha = 1;
      }
    }

    // ---- ameias da muralha de Prospera ----
    if(mapName === 'prospera'){
      c.fillStyle = '#b6a079';
      const W2 = 86, H2 = 62;
      for(let mx = 0; mx < W2; mx += 2){
        for(const my of [0, H2 - 1]){
          const sx = mx*TS - camX, sy = my*TS - camY;
          if(sx < -TS || sx > canvas.width + TS || sy < -TS || sy > canvas.height + TS) continue;
          c.fillRect(sx + 2, sy - 4, TS - 8, 6);
        }
      }
      for(let my = 0; my < H2; my += 2){
        for(const mx of [0, W2 - 1]){
          const sx = mx*TS - camX, sy = my*TS - camY;
          if(sx < -TS || sx > canvas.width + TS || sy < -TS || sy > canvas.height + TS) continue;
          c.fillRect(sx - 2, sy + 2, 6, TS - 8);
        }
      }
    }

    // ---- as partículas ÚNICAS de cada mapa ----
    const P = (i, k, spd) => ((i*k + now*spd) % 1000) / 1000;
    if(mapName === 'vilalbina'){                              // confetes da festa
      const cores = ['#e05a4e','#f2c14e','#5aa9e0','#7ac06a','#e08ae0'];
      for(let i = 0; i < 22; i++){
        const px = (14 + P(i, 337, 0.006) * 17)*TS - camX;
        const py = (8 + P(i, 211, 0.02) * 10)*TS - camY;
        if(px < -TS || px > canvas.width + TS || py < -TS || py > canvas.height + TS) continue;
        c.globalAlpha = 0.7;
        c.fillStyle = cores[i % cores.length];
        c.save(); c.translate(px, py); c.rotate(now/400 + i);
        c.fillRect(-2.2, -1.4, 4.4, 2.8); c.restore();
      }
    }
    if(mapName === 'trigal_dourado'){                          // palha ao vento
      for(let i = 0; i < 26; i++){
        const px = (P(i, 431, 0.05) * 58 - 1)*TS - camX;
        const py = (2 + (i*7 % 32) + Math.sin(now/800 + i)*0.7)*TS - camY;
        if(px < -TS || px > canvas.width + TS || py < -TS || py > canvas.height + TS) continue;
        c.globalAlpha = 0.55;
        c.strokeStyle = '#e8c86a'; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + 5, py - 1.6); c.stroke();
      }
    }
    if(mapName === 'vinhedo'){                                 // folhinhas em espiral
      for(let i = 0; i < 16; i++){
        const t = P(i, 277, 0.018);
        const px = ((i*13 % 50) + 2 + Math.sin(t*9 + i)*1.2)*TS - camX;
        const py = (t * 34)*TS - camY;
        if(px < -TS || px > canvas.width + TS || py < -TS || py > canvas.height + TS) continue;
        c.globalAlpha = 0.6*(1 - t*0.4);
        c.fillStyle = i % 3 ? '#6aa84a' : '#8a6a3a';
        c.save(); c.translate(px, py); c.rotate(t*12 + i);
        c.beginPath(); c.ellipse(0, 0, 3.4, 1.8, 0, 0, Math.PI*2); c.fill(); c.restore();
      }
    }
    if(mapName === 'pastos'){                                  // penugem de dente-de-leão
      for(let i = 0; i < 14; i++){
        const t = P(i, 353, 0.012);
        const px = ((i*11 % 50) + 1 + Math.sin(now/600 + i)*1.6)*TS - camX;
        const py = ((1 - t) * 30 + 1)*TS - camY;
        if(px < -TS || px > canvas.width + TS || py < -TS || py > canvas.height + TS) continue;
        c.globalAlpha = 0.55*(0.4 + t*0.6);
        c.fillStyle = '#f4f2ea';
        c.beginPath(); c.arc(px, py, 1.6, 0, Math.PI*2); c.fill();
        c.strokeStyle = 'rgba(244,242,234,0.5)'; c.lineWidth = 0.8;
        for(let r = 0; r < 5; r++){
          const a = r*1.256 + now/900;
          c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a)*3.4, py + Math.sin(a)*3.4); c.stroke();
        }
      }
    }
    if(mapName === 'jardim_templo' && _ILHA_CASAS._torres_templo){   // motas dos deuses
      _ILHA_CASAS._torres_templo.forEach(([tx, ty], di) => {
        const bx = (tx + 1)*TS - camX, by = (ty + 1)*TS - camY;
        if(bx < -TS*3 || bx > canvas.width + TS*3 || by < -TS*5 || by > canvas.height + TS*3) return;
        c.save(); c.globalCompositeOperation = 'lighter';
        for(let i = 0; i < 4; i++){
          const t = P(i + di*4, 191, 0.02);
          c.globalAlpha = 0.6*(1 - t);
          c.fillStyle = _DEUS_CORES[di % 12];
          c.beginPath();
          c.arc(bx + Math.sin(t*7 + i + di)*TS*0.9, by + TS - t*TS*3.4, 1.8, 0, Math.PI*2);
          c.fill();
        }
        c.restore();
      });
      for(let i = 0; i < 10; i++){                             // pétalas no círculo
        const t = P(i, 449, 0.01);
        const px = (23 + (i*3.1 % 9) + Math.sin(t*8 + i)*1.4)*TS - camX;
        const py = (22 + t*11)*TS - camY;
        if(px < -TS || px > canvas.width + TS || py < -TS || py > canvas.height + TS) continue;
        c.globalAlpha = 0.65*(1 - t*0.5);
        c.fillStyle = '#fdf6ec';
        c.save(); c.translate(px, py); c.rotate(t*9 + i);
        c.beginPath(); c.ellipse(0, 0, 2.8, 1.5, 0, 0, Math.PI*2); c.fill(); c.restore();
      }
    }
    if(mapName === 'cidade_alta'){                             // poeira de luz da Alvorada
      const ax = 25*TS - camX, top = (11*TS - camY) - TS*6.4;
      c.save(); c.globalCompositeOperation = 'lighter';
      for(let i = 0; i < 12; i++){
        const t = P(i, 269, 0.016);
        c.globalAlpha = 0.55*(1 - t);
        c.fillStyle = '#ffe4a0';
        c.beginPath();
        c.arc(ax + Math.sin(t*6 + i)*TS*2.4, top + t*TS*7, 1.6 + (i%3)*0.6, 0, Math.PI*2);
        c.fill();
      }
      c.restore();
      const pt = (now/9000) % 1;                                // a página voando
      if(pt < 0.5){
        const px = pt*2*(canvas.width + 100) - 50;
        const py = canvas.height*0.35 + Math.sin(pt*14)*40;
        c.globalAlpha = 0.85;
        c.fillStyle = '#f6f1e2';
        c.save(); c.translate(px, py); c.rotate(Math.sin(pt*20)*0.6);
        c.fillRect(-5, -6.5, 10, 13);
        c.strokeStyle = 'rgba(90,80,60,0.5)'; c.lineWidth = 0.8;
        for(let l = -3; l <= 3; l += 2){ c.beginPath(); c.moveTo(-3.5, l); c.lineTo(3.5, l); c.stroke(); }
        c.restore();
      }
    }
    if(mapName === 'farol_margem'){                            // spray do mar + motas no feixe
      for(let i = 0; i < 8; i++){
        const t = P(i, 199, 0.03);
        const px = (19 + (i*1.6 % 12))*TS - camX;
        const py = (25.4 - Math.sin(t*Math.PI)*0.9)*TS - camY;
        if(px < -TS || px > canvas.width + TS) continue;
        c.globalAlpha = 0.5*(1 - t);
        c.fillStyle = '#dceefc';
        c.beginPath(); c.arc(px, py, 1.6, 0, Math.PI*2); c.fill();
      }
      c.save(); c.globalCompositeOperation = 'lighter';
      const bx = 25*TS - camX, by = (23*TS - camY) - TS*6.55;
      const ang = now/900;
      for(let i = 0; i < 6; i++){
        const t = P(i, 157, 0.04);
        const d = t*TS*8;
        c.globalAlpha = 0.5*(1 - t);
        c.fillStyle = '#ffdf9a';
        c.beginPath(); c.arc(bx + Math.cos(ang)*d, by + Math.sin(ang)*d*0.5, 1.6, 0, Math.PI*2); c.fill();
      }
      c.restore();
    }
    c.restore();
  };
})();
