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
  buildPills('row-staff',[[false,'Não'],[true,'Sim']], 'staff');
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

  const ordered = [...players.values()].sort((a,b)=> (a.ry - b.ry));
  for(const p of ordered){
    const sx = p.rx - camX, sy = p.ry - camY;
    if(sx < -TS || sy < -TS || sx > canvas.width+TS || sy > canvas.height+TS) continue;
    drawCharacter(ctx, sx, sy, TS, p.look, p.facing, p.name, p.id===myId, p._moving, p.walk);
  }

  if(me) coordsEl.textContent = `x ${me.x}, y ${me.y}`;
  requestAnimationFrame(frame);
}

// ===========================================================================
//  ENTRADA (teclado + direcional na tela)
// ===========================================================================
const KEYMAP = {
  ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down',
  ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right',
};
const held = []; let ticker = null;
function pressDir(dir){
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

window.addEventListener('keydown', e=>{
  const dir = KEYMAP[e.code]; if(!dir || e.repeat) return;
  e.preventDefault(); pressDir(dir);
});
window.addEventListener('keyup', e=>{
  const dir = KEYMAP[e.code]; if(!dir) return;
  e.preventDefault(); releaseDir(dir);
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
    for(const p of data.players) addPlayer(p);
    enterWorld();
  });
  socket.on('player_joined', p => addPlayer(p));
  socket.on('player_moved', m=>{
    const p = players.get(m.id); if(!p) return;
    p.x = m.x; p.y = m.y; p.facing = m.facing;
  });
  socket.on('player_left', m=>{ players.delete(m.id); updateOnline(); });

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
  });
  updateOnline();
}
function updateOnline(){ onlineEl.textContent = players.size; }
function enterWorld(){
  booting.style.display = 'none';
  gate.style.display = 'none';
  if(started) return;          // reconexao: estado ja refeito pelo 'init'
  started = true;
  stage.style.display = 'flex';
  hud.style.display = 'block';
  help.style.display = 'block';
  logoutB.style.display = 'block';
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
