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

// ---------- viewport (câmera) ----------
const VIEW_COLS = 15, VIEW_ROWS = 19;   // tamanho da janela em tiles
const STEP_MS = 130;                    // cadência de passo ao segurar
const TAU = 55;                         // suavização do tween (ms)
const WALK_CYCLE = 320;                 // ms por ciclo de caminhada

// ---------- estado ----------
let socket = null, myId = null;
let TS = 32, mapRows = [], mapW = 0, mapH = 0, mapCanvas = null;
let camX = 0, camY = 0;
const players = new Map();
let started = false;

// ---------- inventario / itens ----------
let inventory = [];           // mochila local: lista de pilhas {item, qty}
let equipment = {};           // equipamento local: slot -> item_id
const catalog = {};           // definicoes de itens vindas do servidor
const ground = new Map();     // "x,y" -> item_id (itens no chao agora)
let invOpen = false;

// ---------- clique pra andar ----------
let autoPath = [];            // direcoes restantes do trajeto clicado
let autoTimer = null;
let clickFx = null;           // marcador visual do destino {x,y,start}

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
  const ts = 72, face = FACES[Math.floor(now/900) % 4];
  pctx.clearRect(0,0,pcanvas.width,pcanvas.height);
  drawCharacter(pctx, pcanvas.width/2 - ts/2, pcanvas.height - ts - 16, ts,
                currentLook, face, '', false, true, pWalk);
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
    default: grassBase(c,px,py,ts,gx,gy);
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
    if(sx < -TS || sy < -TS || sx > canvas.width+TS || sy > canvas.height+TS) continue;
    drawCharacter(ctx, sx, sy, TS, p.look, p.facing, p.name, p.id===myId, p._moving, p.walk);
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
  smites.forEach((fx, id)=>{                 // o raio do Valdris no(s) alvo(s)
    const age = now - fx.start;
    if(age > SMITE_MS){ smites.delete(id); return; }
    const p = players.get(id); if(!p) return;
    drawSmiteFx(ctx, p.rx - camX + TS/2, p.ry - camY + TS, age/SMITE_MS);
  });
  const myFx = smites.get(myId);             // se EU levei, flash violeta na tela
  if(myFx){
    const k = (now - myFx.start)/SMITE_MS;
    ctx.save(); ctx.fillStyle = `rgba(155,109,255,${(0.5*(1-k)).toFixed(3)})`;
    ctx.fillRect(0,0,canvas.width,canvas.height); ctx.restore();
  }
  const npc = getNpc();                       // dica "falar" quando voce esta colado
  if(npc && meNearNpc() && !bubbles.has(npc.id)){
    drawTalkHint(ctx, npc.rx - camX + TS/2, npc.ry - camY, now);
  }
  bubbles.forEach((b, id)=>{                   // baloes de fala
    if(now > b.until){ bubbles.delete(id); return; }
    const p = players.get(id); if(!p) return;
    const sx = p.rx - camX + TS/2, sy = p.ry - camY;
    if(sx < -120 || sx > canvas.width+120 || sy < -70 || sy > canvas.height+70) return;
    drawBubble(ctx, sx, sy, b.text);
  });

  if(me) coordsEl.textContent = `x ${me.x}, y ${me.y}`;
  requestAnimationFrame(frame);
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
function getNpc(){
  for(const p of players.values()) if(p.npc) return p;
  return null;
}
function chebyshev(a, b){ return Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y)); }
function meNearNpc(){
  const me = players.get(myId), npc = getNpc();
  return !!(me && npc && chebyshev(me, npc) <= 1);
}
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

function drawSmiteFx(c, cx, groundY, k){
  // k: 0..1 (progresso). clarao roxo no alvo + raio em ziguezague vindo do alto.
  c.save();
  const alpha = 1 - k;
  const r = TS*(0.6 + k*1.2);
  const grd = c.createRadialGradient(cx, groundY-TS*0.3, 2, cx, groundY-TS*0.3, r);
  grd.addColorStop(0,   `rgba(225,205,255,${0.9*alpha})`);
  grd.addColorStop(0.4, `rgba(155,109,255,${0.55*alpha})`);
  grd.addColorStop(1,   'rgba(155,109,255,0)');
  c.fillStyle = grd;
  c.beginPath(); c.arc(cx, groundY-TS*0.3, r, 0, Math.PI*2); c.fill();
  if(k < 0.55){                        // o raio so na primeira metade
    c.strokeStyle = `rgba(205,175,255,${alpha})`;
    c.lineWidth = 3; c.shadowColor = '#9b6dff'; c.shadowBlur = 12;
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

  socket.on('init', data=>{
    myId = data.id;
    TS = data.map.tilesize; mapRows = data.map.rows;
    mapW = data.map.width; mapH = data.map.height;
    canvas.width = VIEW_COLS*TS; canvas.height = VIEW_ROWS*TS;
    buildMapCanvas();
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

    // sincroniza o relogio do mundo (dia/noite) com o servidor
    dayLength = data.day_length || 480;
    dayOffset = (data.server_now || (Date.now()/1000)) - (Date.now()/1000);

    enterWorld();
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
    bubbles.set(d.id, { text: String(d.text||'').slice(0,120), until: performance.now() + BUBBLE_MS });
  });
  socket.on('smite', d=>{
    if(!d || !d.target) return;
    smites.set(d.target, { start: performance.now() });
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
    npc: !!p.npc,
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
  if(started) return;          // reconexao: estado ja refeito pelo 'init'
  started = true;
  stage.style.display = 'flex';
  hud.style.display = 'block';
  help.style.display = 'block';
  logoutB.style.display = 'block';
  bagBtn.style.display = 'block';
  if(chatOpenBtn) chatOpenBtn.style.display = 'block';
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

async function doRegister(){
  const email = regEmail.value.trim();
  const name = regName.value.trim() || 'Viajante';
  const pass = regPass.value;
  if(!email || !pass){ setStatus('Preencha email e senha.', true); return; }
  if(pass.length < 6){ setStatus('A senha precisa de pelo menos 6 caracteres.', true); return; }
  setBusy(true); setStatus('Criando sua conta…');
  try{
    const { token } = await api('/api/register', { email, name, password: pass, look: currentLook });
    localStorage.setItem(TOKEN_KEY, token);
    setStatus('Atravessando…');
    connectWithToken(token);
  }catch(err){ setStatus(err.message, true); }
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
const SOLID_TILES = new Set(['~', 'T', '#', '^', 'H']);  // iguais ao servidor
const STEPV = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };
function walkableTile(x, y){
  return y >= 0 && y < mapH && x >= 0 && x < mapW && !SOLID_TILES.has(mapRows[y][x]);
}
// algum OUTRO viajante esta parado neste tile agora?
function occupiedByOther(x, y){
  for(const p of players.values()){
    if(p.id !== myId && p.x === x && p.y === y) return true;
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

  // tocou no Valdris? perto = conversa; longe = anda ate um vizinho dele
  const npc = getNpc();
  if(npc && tx === npc.x && ty === npc.y){
    if(meNearNpc()){ if(socket) socket.emit('interact'); return; }
    const dest = nearestFreeNeighbor(npc.x, npc.y, me.x, me.y);
    if(dest){
      const path = findPath(me.x, me.y, dest[0], dest[1]);
      if(path && path.length){ clickFx = {x:dest[0], y:dest[1], start:performance.now()}; walkPath(path); }
    }
    return;
  }

  const path = findPath(me.x, me.y, tx, ty);
  if(path && path.length){
    clickFx = { x: tx, y: ty, start: performance.now() };
    walkPath(path);
  }
});
