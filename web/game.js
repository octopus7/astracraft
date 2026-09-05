(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const ui = Object.fromEntries(['best', 'coins', 'distance', 'speed', 'energy', 'boost-label', 'overlay', 'overlay-tag', 'overlay-title', 'overlay-copy', 'start', 'start-hint', 'pause', 'sound', 'toast'].map(id => [id, $(id)]));
  let width = 1200, height = 600, last = 0, clock = 0, scenery = 0;
  let mode = 'ready', lane = 0, playerX = 0, jumpY = 0, jumpV = 0;
  let distance = 0, coins = 0, energy = 100, speed = 0, spawnAt = 35, objects = [], sparks = [];
  let invincible = 0, toastTime = 0, audio = null, muted = true, dashLocked = false;
  let best = 0;
  try { best = Number(localStorage.getItem('astra-dash-best')) || 0; } catch { /* Storage is optional. */ }
  ui.best.textContent = String(best).padStart(5, '0');
  const held = new Set();
  const far = 145, playerZ = 8;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  function resize() {
    const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    width = box.width; height = box.height;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  function project(x, y, z) {
    const scale = height * .92 / (z + 9);
    return { x: width * .55 + x * scale, y: height * .35 + (5 - y) * scale, s: scale };
  }
  function polygon(points, color) {
    ctx.fillStyle = color; ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath(); ctx.fill();
  }
  function box(x, y, z, w, h, d, colors) {
    if (z < -4) return;
    const a = project(x-w/2,y,z-d/2), b = project(x+w/2,y,z-d/2);
    const c = project(x+w/2,y+h,z-d/2), e = project(x-w/2,y+h,z-d/2);
    const f = project(x-w/2,y+h,z+d/2), g = project(x+w/2,y+h,z+d/2);
    polygon([a,b,c,e], colors[0]);
    if (x > 0) polygon([a,e,f,project(x-w/2,y,z+d/2)], colors[1]);
    else polygon([b,project(x+w/2,y,z+d/2),g,c], colors[1]);
    polygon([e,c,g,f], colors[2]);
  }
  function tone(freq, duration = .08, type = 'sine', volume = .035) {
    if (muted || !audio) return;
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audio.currentTime);
    gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
  }
  function toast(message) { ui.toast.textContent = message; toastTime = 1.8; ui.toast.classList.add('visible'); }
  function start() {
    mode = 'running'; lane = playerX = jumpY = jumpV = distance = coins = 0;
    speed = 22; energy = 100; spawnAt = 30; invincible = 0; dashLocked = false;
    objects = []; sparks = []; held.clear();
    for (let z = 23; z < 130; z += 8) objects.push({type:'coin',x:0,z,y:1});
    ui.overlay.hidden = true; ui.pause.disabled = false; ui.pause.textContent = 'Ⅱ'; ui.pause.setAttribute('aria-label', '일시정지');
    canvas.focus({preventScroll:true}); tone(520);
  }
  function pause() {
    if (mode !== 'running' && mode !== 'paused') return;
    if (mode === 'running') {
      mode = 'paused'; held.clear(); ui.overlay.hidden = false;
      ui['overlay-tag'].textContent = 'TAKE A BREATHER'; ui['overlay-title'].innerHTML = '잠깐 쉬어가기.';
      ui['overlay-copy'].textContent = '준비되면 다시 초록빛 숲으로 달려보세요.';
      ui.start.innerHTML = '계속 달리기 <span>→</span>'; ui['start-hint'].textContent = 'P 또는 ESC로 계속';
      ui.pause.textContent = '▶'; ui.pause.setAttribute('aria-label', '계속하기');
    } else { mode = 'running'; ui.overlay.hidden = true; ui.pause.textContent = 'Ⅱ'; ui.pause.setAttribute('aria-label', '일시정지'); canvas.focus({preventScroll:true}); }
  }
  function finish() {
    mode = 'over'; held.clear(); tone(120,.3,'sawtooth');
    const score = Math.floor(distance) + coins * 25, isBest = score > best;
    if (isBest) { best = score; try { localStorage.setItem('astra-dash-best', String(best)); } catch {} }
    ui.best.textContent = String(best).padStart(5,'0'); ui.overlay.hidden = false; ui.pause.disabled = true;
    ui['overlay-tag'].textContent = isBest ? 'NEW PERSONAL BEST!' : 'ONE MORE ADVENTURE?';
    ui['overlay-title'].innerHTML = '멋진 질주였어요.<br><span>' + score.toLocaleString() + ' 점</span>';
    ui['overlay-copy'].textContent = `${Math.floor(distance)}m 달리기 · 코인 ${coins}개 수집. 다음 기록에 도전하세요!`;
    ui.start.innerHTML = '다시 달리기 <span>↗</span>'; ui['start-hint'].textContent = 'ENTER 또는 SPACE로 재시작';
  }
  function action(key) {
    if (mode !== 'running') return;
    if (key === 'left') lane = Math.max(-1,lane-1);
    if (key === 'right') lane = Math.min(1,lane+1);
    if (key === 'jump' && jumpY === 0) { jumpV = 12; tone(340,.1,'triangle'); }
  }
  ui.start.addEventListener('click', () => mode === 'paused' ? pause() : start());
  ui.pause.addEventListener('click', pause);
  ui.sound.addEventListener('click', () => {
    muted = !muted;
    if (!muted) { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) { audio ||= new Audio(); audio.resume().catch(() => {}); } }
    ui.sound.textContent = muted ? '♪ OFF' : '♪ ON'; ui.sound.setAttribute('aria-pressed',String(!muted)); ui.sound.setAttribute('aria-label', muted ? '효과음 켜기' : '효과음 끄기'); tone(660);
  });
  window.addEventListener('keydown', e => {
    if (e.target instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return;
    if (['Space','ArrowUp','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Enter','KeyP','Escape','KeyA','KeyD','KeyW'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') { pause(); return; }
    if ((e.code === 'Enter' || e.code === 'Space') && mode !== 'running') { mode === 'paused' ? pause() : start(); return; }
    held.add(e.code);
    if (['ArrowLeft','KeyA'].includes(e.code)) action('left');
    if (['ArrowRight','KeyD'].includes(e.code)) action('right');
    if (['Space','ArrowUp','KeyW'].includes(e.code)) action('jump');
  });
  window.addEventListener('keyup',e => held.delete(e.code));
  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('pointerdown',e => { e.preventDefault(); button.setPointerCapture(e.pointerId); if(button.dataset.action === 'dash') held.add('touchDash'); else action(button.dataset.action); });
    for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event,() => held.delete('touchDash'));
  });
  let touchStart = null;
  canvas.addEventListener('pointerdown',e => { touchStart = {x:e.clientX,y:e.clientY}; });
  canvas.addEventListener('pointerup',e => {
    if (!touchStart) return;
    const dx=e.clientX-touchStart.x, dy=e.clientY-touchStart.y;
    if (Math.abs(dx)>25 && Math.abs(dx)>Math.abs(dy)) action(dx>0?'right':'left'); else if(dy < -20 || Math.abs(dx)<15) action('jump');
    touchStart=null;
  });
  canvas.addEventListener('pointercancel',() => touchStart=null);
  window.addEventListener('blur',() => { held.clear(); if(mode==='running') pause(); });
  document.addEventListener('visibilitychange',() => { if(document.hidden && mode==='running') pause(); });
  function spawnRow() {
    const blocked = Math.floor(Math.random()*3)-1;
    objects.push({type:Math.random()>.3?'rock':'log',x:blocked*2.6,z:far,y:0});
    const rewardLane = Math.random()>.5 ? blocked : (blocked+2)%3-1;
    for(let i=0;i<5;i++) objects.push({type:'coin',x:rewardLane*2.6,z:far+i*3,y:rewardLane===blocked?2.8:1});
  }
  function update(dt) {
    if (mode !== 'running') { if(mode==='ready') scenery+=dt*3; return; }
    if (energy<=0) dashLocked=true;
    if (energy>=25) dashLocked=false;
    const dash = (held.has('ShiftLeft')||held.has('ShiftRight')||held.has('touchDash')) && !dashLocked && energy>0;
    speed = Math.min(36,22+distance/180) * (dash?1.65:1);
    const step=speed*dt; distance+=step; scenery+=step;
    energy=clamp(energy+dt*(dash?-32:9),0,100);
    playerX += (lane*2.6-playerX)*Math.min(1,dt*16);
    jumpY+=jumpV*dt; jumpV-=27*dt;
    if (jumpY<=0) {jumpY=0;jumpV=0;}
    invincible=Math.max(0,invincible-dt);
    spawnAt-=step; if(spawnAt<=0){spawnRow();spawnAt=28+Math.random()*14;}
    for(const object of objects) {
      const before=object.z; object.z-=step;
      if(!object.hit && before>=playerZ && object.z<=playerZ && Math.abs(object.x-playerX)<1.05) {
        if(object.type==='coin') {
          if(Math.abs(jumpY+1-object.y)<1.3) {
            object.hit=true;coins++;energy=clamp(energy+3,0,100);tone(750+(coins%5)*110,.065);
            for(let i=0;i<7;i++) sparks.push({x:object.x,y:object.y,z:playerZ,vx:(Math.random()-.5)*6,vy:Math.random()*6,life:.5});
          }
        } else if(jumpY<(object.type==='log'?.85:1.5) && invincible===0) {
          object.hit=true;
          if(dash){tone(180,.1,'square');toast('ϟ DASH BREAK! 장애물 돌파');}
          else if(coins>0){const loss=Math.min(coins,10);coins-=loss;invincible=1.7;tone(150,.18,'sawtooth');toast(`충돌! 코인 −${loss} · 잠시 무적`);}
          else {finish();break;}
        }
      }
    }
    objects=objects.filter(o=>o.z>-5&&!o.hit);
    for(const p of sparks){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy-=14*dt;}
    sparks=sparks.filter(p=>p.life>0);
    ui.coins.textContent=coins;ui.distance.textContent=Math.floor(distance);ui.speed.textContent=Math.round(speed*3.6);
    ui.energy.style.width=energy+'%';ui['boost-label'].textContent=dash?'BOOST ACTIVE':dashLocked?'에너지 충전 중':'SHIFT를 길게 눌러 대시';
  }
  function background() {
    const sky=ctx.createLinearGradient(0,0,0,height*.7);sky.addColorStop(0,'#8bbabc');sky.addColorStop(1,'#d2dfad');ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#f8edb5';ctx.fillRect(width*.76,height*.13,47,47);
    for(let i=0;i<7;i++){const x=((i*233-clock*2)%(width+300)+width+300)%(width+300)-130,y=height*(.08+hash(i)*.17);ctx.fillStyle='#e8edd2b0';ctx.fillRect(x,y,80+hash(i+4)*80,15);ctx.fillRect(x+20,y-13,60,15);}
    for(let layer=0;layer<3;layer++){
      const colors=['#85ad94','#719b77','#5d865a'];ctx.fillStyle=colors[layer];const base=height*(.36+layer*.025),unit=width/20;
      for(let i=0;i<22;i++){const h=(25+hash(i+layer*30)*90)*(height/600);ctx.fillRect(i*unit,base-h,unit+1,h+30);}
    }
    ctx.fillStyle='#659543';ctx.fillRect(0,height*.38,width,height);
    for(let z=far;z>=-2;z-=3){
      const pos=z-(scenery%3),index=Math.floor((scenery+z)/3);
      polygon([project(-4.5,0,pos),project(4.5,0,pos),project(4.5,0,pos+3),project(-4.5,0,pos+3)],index%2?'#b0a16e':'#b8a977');
      for(const side of [-1,1]){
        polygon([project(side*4.5,.03,pos),project(side*5,.03,pos),project(side*5,.03,pos+3),project(side*4.5,.03,pos+3)],index%2?'#bad477':'#94b95c');
        for(let col=0;col<5;col++){
          const x=side*(5+col*3);
          polygon([project(x,0,pos),project(x+side*3,0,pos),project(x+side*3,0,pos+3),project(x,0,pos+3)],['#729b47','#7fa34c','#87ac51','#6f9846'][Math.floor(hash(index*11+col)*4)]);
        }
      }
      if(index%3===0) for(const x of [-1.3,1.3]) polygon([project(x-.035,.02,pos),project(x+.035,.02,pos),project(x+.035,.02,pos+1.3),project(x-.035,.02,pos+1.3)],'#e3d7a666');
    }
  }
  function tree(x,z,seed) {
    const h=3.4+hash(seed)*2;
    box(x,0,z,.65,h,.65,['#705a39','#574b31','#8a714a']);
    box(x,h-1,z,3.2,2.1,2.9,['#38663d','#2b5535','#64924a']);
    box(x-.25,h+.8,z,2.4,1.6,2.2,['#477942','#355f38','#7caa54']);
    box(x-.35,h+2.1,z,1.4,.8,1.5,['#598846','#426f3d','#8dbb60']);
  }
  function coin(o) {
    const p=project(o.x,o.y+Math.sin(clock*4+o.z)*.1,o.z),r=p.s*.29;
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(.55+Math.abs(Math.sin(clock*3+o.z*.1))*.45,1);
    ctx.shadowColor='#ffdc5f';ctx.shadowBlur=12;ctx.fillStyle='#ffe282';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle='#b77c22';ctx.lineWidth=Math.max(1,r*.2);ctx.stroke();ctx.fillStyle='#b9852c';ctx.fillRect(-r*.12,-r*.48,r*.24,r*.96);ctx.restore();
  }
  function player() {
    if(invincible>0 && Math.floor(clock*12)%2===0)return;
    const x=playerX,y=jumpY,z=playerZ;
    const shadow=project(x,0,z);ctx.fillStyle='#20381e55';ctx.beginPath();ctx.ellipse(shadow.x,shadow.y,shadow.s*.65,shadow.s*.15,0,0,Math.PI*2);ctx.fill();
    if(speed>40){for(let i=0;i<5;i++){const p=project(x,y+.5,z+i*.65);ctx.fillStyle=`rgba(139,238,243,${.25-i*.04})`;ctx.fillRect(p.x-p.s*.3,p.y-p.s*.5,p.s*.6,p.s*.65);}}
    const stride=mode==='running'&&jumpY===0?Math.sin(clock*22)*.3:0;
    box(x-.25,y+.05+Math.max(0,stride),z,.4,.33,.8,['#e8eedc','#9badac','#fff9e6']);
    box(x+.25,y+.05+Math.max(0,-stride),z,.4,.33,.8,['#e8eedc','#9badac','#fff9e6']);
    box(x,y+.35,z,.78,.85,.55,['#287c9f','#195a80','#4bc4d2']);
    box(x-.52,y+.45-stride,z,.24,.6,.3,['#44b9cc','#277d9c','#69d8dd']);
    box(x+.52,y+.45+stride,z,.24,.6,.3,['#44b9cc','#277d9c','#69d8dd']);
    box(x,y+1.2,z,.85,.8,.75,['#46c4d5','#2d8eac','#82e6e4']);
    box(x,y+1.25,z-.41,.62,.18,.05,['#244e66','#244e66','#38758a']);
    box(x,y+1.05,z+.1,.95,.17,.8,['#f1b44e','#c68032','#ffe287']);
  }
  function render() {
    background();
    const drawables=[];
    for(let i=0;i<24;i++){
      const z=i*8-(scenery%8),seed=Math.floor(scenery/8)+i;
      for(const side of [-1,1]){
        const x=side*(7+hash(seed+side*70)*9);
        drawables.push({z,draw:()=>tree(x,z,seed+side*30)});
        if(i%3===0)drawables.push({z:z+3,draw:()=>box(side*5.6,0,z+3,1.2,.6,1,['#7d8975','#626f60','#a7b098'])});
      }
    }
    const shown=mode==='ready'?Array.from({length:15},(_,i)=>({type:'coin',x:0,y:1,z:17+i*6})):objects;
    for(const o of shown) if(o.z<far+10)drawables.push({z:o.z,draw:()=>{
      if(o.type==='coin')coin(o);
      else if(o.type==='rock'){box(o.x,0,o.z,1.7,1.5,1.4,['#69776b','#526253','#a5b09a']);box(o.x-.15,1.5,o.z,.95,.35,1,['#87927a','#6f7d66','#b9c3a2']);}
      else {box(o.x,0,o.z,2,.85,.9,['#936b41','#775030','#c19b5c']);box(o.x,.85,o.z,2,.12,.9,['#709344','#5b7d36','#a5c15f']);}
    }});
    drawables.push({z:playerZ,draw:player});drawables.sort((a,b)=>b.z-a.z).forEach(o=>o.draw());
    for(const p of sparks){const s=project(p.x,p.y,p.z);ctx.fillStyle='#ffe487';ctx.globalAlpha=p.life*2;ctx.fillRect(s.x,s.y,5,5);}ctx.globalAlpha=1;
    const shade=ctx.createLinearGradient(0,height*.7,0,height);shade.addColorStop(0,'#16382400');shade.addColorStop(1,'#112b2466');ctx.fillStyle=shade;ctx.fillRect(0,height*.7,width,height*.3);
  }
  function frame(time) {
    const dt=Math.min((time-last)/1000 || 0, .033);last=time;
    if(mode!=='paused')clock+=dt;
    toastTime-=dt;if(toastTime<=0)ui.toast.classList.remove('visible');
    update(dt);render();requestAnimationFrame(frame);
  }
  resize();requestAnimationFrame(frame);
})();
