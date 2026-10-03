'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const q=(n)=>Number.isFinite(n)?n:0;

const studio={
  ready:false,error:null,meta:null,json:null,atlasText:'',atlasImage:null,masterImage:null,
  atlas:null,skeletonData:null,skeleton:null,stateData:null,animState:null,entry:null,
  active:'Idle',playing:true,speed:1,loop:true,time:0,lastT:performance.now(),
  showSkin:true,showRig:false,showNames:false,showMaster:false,explode:false,showGrid:true,
  hiddenParts:new Set(),selectedBone:null,inspector:'design',overrides:new Map(),
  cam:{zoom:1,panX:0,panY:0},drag:null,fps:60,fpsAccum:0,fpsFrames:0,fpsLast:performance.now(),
  rootSource:[151,218]
};
window.MONSTER_STUDIO=studio;

const canvas=$('#stageCanvas'),ctx=canvas.getContext('2d');
const wrap=$('#canvasWrap');
let dpr=Math.min(devicePixelRatio||1,2);

const animLabels={
  Idle:['待机','2.40s','呼吸 / 伞帽摆动 / 菌角延迟'],
  Move:['移动','0.80s','四足小跑 / 重心弹跳 / 尾巴反摆'],
  Attack:['攻击','0.75s','压缩蓄力 → 菌角突进 → 回收'],
  Hurt:['受击','0.45s','快速后缩 / 壳体惯性 / 二次回弹'],
  Death:['死亡','1.40s','失衡 → 侧倒 → 菌角与尾巴垂落']
};

async function loadImage(url){
  const im=new Image();
  im.decoding='async';
  await new Promise((res,rej)=>{im.onload=res;im.onerror=()=>rej(new Error('图片加载失败: '+url));im.src=url});
  return im;
}
async function boot(){
  try{
    if(!window.spine)throw new Error('Spine 4.3 Runtime 未加载');
    const [jsonRes,metaRes,atlasRes,atlasImg,masterImg]=await Promise.all([
      fetch('./data/mushhorn.json',{cache:'no-store'}).then(r=>r.json()),
      fetch('./data/parts.json',{cache:'no-store'}).then(r=>r.json()),
      fetch('./data/mushhorn.atlas',{cache:'no-store'}).then(r=>r.text()),
      loadImage('./assets/mushhorn.png'),
      loadImage('./assets/master_reference.png')
    ]);
    studio.json=jsonRes;studio.meta=metaRes;studio.atlasText=atlasRes;studio.atlasImage=atlasImg;studio.masterImage=masterImg;

    studio.atlas=new spine.TextureAtlas(atlasRes);
    const loader=new spine.AtlasAttachmentLoader(studio.atlas);
    const parser=new spine.SkeletonJson(loader);
    studio.skeletonData=parser.readSkeletonData(jsonRes);
    studio.skeleton=new spine.Skeleton(studio.skeletonData);
    studio.stateData=new spine.AnimationStateData(studio.skeletonData);
    studio.stateData.defaultMix=.10;
    studio.animState=new spine.AnimationState(studio.stateData);
    setAnimation('Idle',true);
    applyPose();

    studio.ready=true;
    $('#runtimeText').textContent='Spine 4.3 · PASS';
    $('.runtime-pill').classList.add('ok');
    $('#runtimePipe').classList.add('done');
    $('#runtimePipe i').textContent='✓';
    $('#runtimePipeText').textContent='SkeletonJson / AnimationState 验证通过';
    $('#boneCountLeft').textContent=studio.skeleton.bones.length;
    $('#slotCountLeft').textContent=studio.skeleton.slots.length;
    $('#partCountLeft').textContent=Object.keys(studio.meta.parts).length;
    $('#stageBones').textContent=studio.skeleton.bones.length+' bones';
    $('#stageSlots').textContent=studio.skeleton.slots.length+' slots';
    buildAnimations();
    renderInspector();
    renderTimeline();
    fitView();
    requestAnimationFrame(loop);
  }catch(e){
    console.error(e);studio.error=String(e?.message||e);
    $('#runtimeText').textContent='Runtime FAIL';
    $('.runtime-pill').classList.add('error');
    $('#runtimePipeText').textContent=studio.error;
    $('#runtimePipe i').textContent='!';
    $('#stageTitle').textContent='加载失败 · '+studio.error;
  }
}

function duration(){return studio.meta?.durations?.[studio.active]??studio.entry?.animation?.duration??0}
function loopFor(name){return !!studio.meta?.loops?.[name]}
function setAnimation(name,forceLoop=null){
  if(!studio.animState)return;
  studio.active=name;
  studio.loop=forceLoop==null?loopFor(name):forceLoop;
  studio.entry=studio.animState.setAnimation(0,name,studio.loop);
  studio.time=0;studio.playing=true;
  $('#loopBtn').classList.toggle('on',studio.loop);
  $('#loopBtn').textContent=studio.loop?'循环 ✓':'循环';
  $('#stageTitle').textContent=name+' · '+(animLabels[name]?.[0]||name);
  $('#timelineTitle').textContent=name;
  buildAnimations();
  renderTimeline();
  renderInspector();
  applyPose();
}

function applyOverrides(){
  if(!studio.skeleton)return;
  for(const [name,o] of studio.overrides){
    const b=studio.skeleton.findBone(name);if(!b?.pose)continue;
    b.pose.rotation+=q(o.rotation);
    b.pose.x+=q(o.x);
    b.pose.y+=q(o.y);
    b.pose.scaleX*=o.scaleX??1;
    b.pose.scaleY*=o.scaleY??1;
  }
}
function applyPose(){
  if(!studio.skeleton||!studio.animState)return;
  studio.animState.apply(studio.skeleton);
  applyOverrides();
  studio.skeleton.updateWorldTransform(spine.Physics.update);
}

function buildAnimations(){
  const root=$('#animList');if(!root||!studio.meta)return;
  root.innerHTML='';
  for(const name of Object.keys(studio.meta.durations)){
    const [cn,d,desc]=animLabels[name]||[name,studio.meta.durations[name]+'s',''];
    const b=document.createElement('button');b.className='anim-btn'+(studio.active===name?' active':'');
    b.innerHTML='<b>'+name.slice(0,2).toUpperCase()+'</b><div><strong>'+name+' · '+cn+'</strong><small>'+desc+'</small></div><em>'+d+'</em>';
    b.onclick=()=>setAnimation(name);
    root.appendChild(b);
  }
}

function resize(){
  const r=wrap.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);
  const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;canvas.style.width=r.width+'px';canvas.style.height=r.height+'px'}
}
function view(){
  const r=wrap.getBoundingClientRect();
  return {w:r.width,h:r.height,ox:r.width*.5+studio.cam.panX,oy:r.height*.76+studio.cam.panY,s:studio.cam.zoom};
}
function fitView(){
  if(!studio.meta)return;
  const r=wrap.getBoundingClientRect(),[mw,mh]=studio.meta.masterSize;
  const s=Math.min((r.width-110)/mw,(r.height-80)/mh);
  studio.cam.zoom=clamp(s,.35,4);studio.cam.panX=0;studio.cam.panY=0;
}
function worldToScreen(x,y){
  const v=view();return [v.ox+x*v.s,v.oy-y*v.s];
}
function boneScreen(b){
  const p=b.appliedPose;return worldToScreen(p.worldX,p.worldY);
}

function drawBackdrop(){
  const v=view();
  ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,v.w,v.h);
  const g=ctx.createRadialGradient(v.w*.5,v.h*.52,20,v.w*.5,v.h*.52,Math.max(v.w,v.h)*.55);
  g.addColorStop(0,'#141528');g.addColorStop(.55,'#0d1119');g.addColorStop(1,'#080b10');ctx.fillStyle=g;ctx.fillRect(0,0,v.w,v.h);
  if(studio.showGrid){
    ctx.strokeStyle='rgba(130,145,170,.075)';ctx.lineWidth=1;
    const step=Math.max(24,36*studio.cam.zoom);
    for(let x=((v.ox%step)+step)%step;x<v.w;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,v.h);ctx.stroke()}
    for(let y=((v.oy%step)+step)%step;y<v.h;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(v.w,y);ctx.stroke()}
    ctx.strokeStyle='rgba(110,126,151,.16)';ctx.beginPath();ctx.moveTo(0,v.oy);ctx.lineTo(v.w,v.oy);ctx.stroke();
  }
  const sh=ctx.createRadialGradient(v.ox,v.oy+5,4,v.ox,v.oy+5,125*v.s);sh.addColorStop(0,'rgba(0,0,0,.42)');sh.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sh;ctx.beginPath();ctx.ellipse(v.ox,v.oy+5,122*v.s,20*v.s,0,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawMaster(){
  if(!studio.showMaster||!studio.masterImage||!studio.meta)return;
  const v=view(),[rx,ry]=studio.rootSource,[mw,mh]=studio.meta.masterSize;
  ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=.26;
  ctx.drawImage(studio.masterImage,v.ox-rx*v.s,v.oy-ry*v.s,mw*v.s,mh*v.s);
  ctx.restore();
}
function explodeOffset(part){
  if(!studio.explode)return [0,0];
  const [mw,mh]=studio.meta.masterSize,[px,py]=part.sourcePivot;
  let dx=px-mw/2,dy=py-mh/2;const l=Math.hypot(dx,dy)||1;
  const amount=52;return [dx/l*amount,dy/l*amount];
}
function drawParts(){
  if(!studio.showSkin||!studio.meta||!studio.atlasImage||!studio.skeleton)return;
  const v=view();
  for(const name of studio.meta.drawOrder){
    if(studio.hiddenParts.has(name))continue;
    const part=studio.meta.parts[name];if(!part)continue;
    const bone=studio.skeleton.findBone(part.bone);if(!bone)continue;
    const p=bone.appliedPose,[sx0,sy0]=worldToScreen(p.worldX,p.worldY),[ex,ey]=explodeOffset(part);
    const [ax,ay,aw,ah]=part.atlas,[px,py]=part.pivot;
    ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.transform(v.s*p.a,-v.s*p.c,-v.s*p.b,v.s*p.d,sx0+ex,sy0+ey);
    if(name==='eye_glow'){ctx.globalCompositeOperation='screen';ctx.globalAlpha=.58}
    ctx.drawImage(studio.atlasImage,ax,ay,aw,ah,-px,-py,aw,ah);
    ctx.restore();
  }
}
function drawRig(){
  if(!studio.showRig||!studio.skeleton)return;
  ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
  for(const b of studio.skeleton.bones){
    const p=b.appliedPose,[x,y]=worldToScreen(p.worldX,p.worldY);
    let ex=p.worldX+p.a*(b.data.length||18),ey=p.worldY+p.c*(b.data.length||18);
    const [x2,y2]=worldToScreen(ex,ey);
    const active=b.data.name===studio.selectedBone;
    ctx.strokeStyle=active?'#ffd76b':'rgba(93,206,255,.78)';ctx.lineWidth=active?2.5:1.5;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();
    ctx.fillStyle=active?'#ffd76b':'#9be8ff';ctx.beginPath();ctx.arc(x,y,active?5:3.2,0,Math.PI*2);ctx.fill();
    if(studio.showNames){ctx.font='9px ui-monospace,monospace';ctx.fillStyle=active?'#ffe8a8':'#91a6bb';ctx.fillText(b.data.name,x+6,y-5)}
  }ctx.restore();
}
function render(){
  resize();drawBackdrop();drawMaster();drawParts();drawRig();
}

function currentTime(){
  const d=duration();
  if(!studio.entry)return 0;
  return studio.loop?((studio.entry.trackTime%d)+d)%d:Math.min(d,studio.entry.trackTime);
}
function updateUI(){
  const d=duration(),t=currentTime();studio.time=t;
  $('#timeText').textContent=t.toFixed(3)+' / '+d.toFixed(3);
  $('#timeSlider').max=d||1;$('#timeSlider').value=t;
  const body=$('.timeline-body');if(body){
    const lane=Math.max(650,body.clientWidth-150),frac=d?t/d:0;
    $('#playhead').style.left=(150+frac*lane-body.scrollLeft)+'px';
  }
  $('#stageFps').textContent=Math.round(studio.fps)+' FPS';
}
function loop(now){
  if(studio.ready){
    const dt=Math.min((now-studio.lastT)/1000,.05);studio.lastT=now;
    if(studio.playing&&studio.entry){
      studio.animState.update(dt*studio.speed);
      if(!studio.loop&&studio.entry.trackTime>=duration()){
        studio.entry.trackTime=duration();studio.playing=false;$('#playBtn').textContent='▶';
      }
      applyPose();
    }
    studio.fpsFrames++;studio.fpsAccum+=dt;
    if(now-studio.fpsLast>500){studio.fps=studio.fpsFrames/(studio.fpsAccum||1);studio.fpsFrames=0;studio.fpsAccum=0;studio.fpsLast=now}
    updateUI();render();
  }
  requestAnimationFrame(loop);
}

function setTime(t){
  if(!studio.entry)return;studio.playing=false;$('#playBtn').textContent='▶';
  studio.entry.trackTime=clamp(t,0,duration());
  applyPose();updateUI();render();
}
function stepFrame(dir){setTime(currentTime()+dir/30)}

function selectBone(name){
  studio.selectedBone=name;studio.showRig=true;$('#rigToggle').checked=true;renderInspector();render();
}
function boneDepth(b){let d=0,p=b.data.parent;while(p){d++;p=p.parent}return d}

function setInspector(tab){
  studio.inspector=tab;
  $$('.ins-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.ins===tab));
  const navMap={design:'overview',parts:'assets',bones:'rig',clip:'animation',files:'export'};
  $$('.top-nav button').forEach(b=>b.classList.toggle('active',b.dataset.panel===navMap[tab]));
  renderInspector();
}
function renderInspector(){
  const root=$('#inspector');if(!root)return;
  if(!studio.meta){root.innerHTML='<div class="note">正在读取项目…</div>';return}
  if(studio.inspector==='design'){
    const d=studio.meta.design;
    root.innerHTML=`
      <div class="eyebrow">CHARACTER DESIGN</div><h2>蘑角兽 · Mushhorn</h2>
      <p>一个围绕 Spine 生产设计的小型原创怪物。大蘑菇伞帽形成第一轮廓，单眼负责表情，两根发光菌角和卷曲菌丝尾负责 secondary motion。</p>
      <img src="./assets/master_reference.png" style="width:100%;max-height:190px;object-fit:contain;border:1px solid var(--line);border-radius:9px;background:#090d13;margin:5px 0 10px">
      <div class="kv"><div>定位</div><div>${d.role}</div><div>性格</div><div>${d.personality}</div><div>移动</div><div>${d.movement}</div><div>攻击</div><div>${d.attack}</div><div>轮廓记忆点</div><div>${d.silhouette}</div></div>
      <h3>制作原则</h3><div class="note">母版固定向右 3/4；硬部件在关节处保留重叠；伞帽、菌角、菌丝尾用错峰旋转产生跟随；攻击遵循 Anticipation → Action → Recovery。</div>`;
  }else if(studio.inspector==='parts'){
    root.innerHTML='<div class="section-title"><strong>透明拆件</strong><span>'+Object.keys(studio.meta.parts).length+' PARTS</span></div><div class="parts-grid" id="partsGrid"></div><div class="note" style="margin-top:10px">点击部件可在舞台中隐藏/显示。打开左侧「拆件爆炸图」可直接检查各部件 Pivot 与重叠。</div>';
    const grid=$('#partsGrid');
    for(const [name,p] of Object.entries(studio.meta.parts)){
      const card=document.createElement('div');card.className='part-card'+(studio.hiddenParts.has(name)?' hidden-part':'');card.dataset.part=name;
      card.innerHTML='<canvas class="part-thumb"></canvas><strong>'+name+'</strong>';
      card.onclick=()=>{studio.hiddenParts.has(name)?studio.hiddenParts.delete(name):studio.hiddenParts.add(name);renderInspector();render()};
      grid.appendChild(card);
      const c=card.querySelector('canvas'),r=c.getBoundingClientRect();c.width=120;c.height=96;const g=c.getContext('2d');g.imageSmoothingEnabled=true;
      const [x,y,w,h]=p.atlas,sc=Math.min(105/w,82/h,1.8),dw=w*sc,dh=h*sc;
      g.drawImage(studio.atlasImage,x,y,w,h,(120-dw)/2,(96-dh)/2,dw,dh);
    }
  }else if(studio.inspector==='bones'){
    const bones=studio.skeleton?.bones||[];
    let rows=bones.map(b=>'<div class="bone-row '+(b.data.name===studio.selectedBone?'active':'')+'" data-bone="'+b.data.name+'" style="padding-left:'+(7+boneDepth(b)*10)+'px"><i class="joint"></i><span>'+b.data.name+'</span></div>').join('');
    const sel=studio.selectedBone&&studio.skeleton.findBone(studio.selectedBone),o=studio.overrides.get(studio.selectedBone)||{rotation:0,x:0,y:0};
    root.innerHTML='<div class="section-title"><strong>骨骼结构</strong><span>'+bones.length+' BONES</span></div><div class="bone-tree">'+rows+'</div>'+
      (sel?`<h3>Pose Offset · ${sel.data.name}</h3>
       <label class="control"><span>Rotation <output id="rotOut">${q(o.rotation).toFixed(1)}°</output></span><input id="rotCtl" type="range" min="-90" max="90" step=".5" value="${q(o.rotation)}"></label>
       <label class="control"><span>X <output id="xOut">${q(o.x).toFixed(1)}</output></span><input id="xCtl" type="range" min="-40" max="40" step=".5" value="${q(o.x)}"></label>
       <label class="control"><span>Y <output id="yOut">${q(o.y).toFixed(1)}</output></span><input id="yCtl" type="range" min="-40" max="40" step=".5" value="${q(o.y)}"></label>
       <div class="button-row"><button id="resetBone">重置骨骼</button><button id="resetAll">重置全部</button></div>`:'<div class="note" style="margin-top:10px">点击舞台骨点或上方骨骼列表选择骨骼。</div>');
    $$('.bone-row').forEach(r=>r.onclick=()=>selectBone(r.dataset.bone));
    if(sel){
      const update=()=>{const ov=studio.overrides.get(studio.selectedBone)||{rotation:0,x:0,y:0};ov.rotation=+$('input#rotCtl').value;ov.x=+$('input#xCtl').value;ov.y=+$('input#yCtl').value;studio.overrides.set(studio.selectedBone,ov);$('#rotOut').textContent=ov.rotation.toFixed(1)+'°';$('#xOut').textContent=ov.x.toFixed(1);$('#yOut').textContent=ov.y.toFixed(1);applyPose();render()};
      ['rotCtl','xCtl','yCtl'].forEach(id=>$('#'+id)?.addEventListener('input',update));
      $('#resetBone').onclick=()=>{studio.overrides.delete(studio.selectedBone);applyPose();renderInspector();render()};
      $('#resetAll').onclick=()=>{studio.overrides.clear();applyPose();renderInspector();render()};
    }
  }else if(studio.inspector==='clip'){
    const a=studio.json.animations[studio.active]||{},bones=a.bones||{};let keyCount=0;
    for(const v of Object.values(bones))for(const arr of Object.values(v))keyCount+=Array.isArray(arr)?arr.length:0;
    root.innerHTML=`<div class="eyebrow">ANIMATION CLIP</div><h2>${studio.active} · ${animLabels[studio.active]?.[0]}</h2>
      <p>${animLabels[studio.active]?.[2]}</p>
      <div class="clip-stats"><div class="clip-stat"><b>${duration().toFixed(2)}s</b><small>时长</small></div><div class="clip-stat"><b>${Object.keys(bones).length}</b><small>动画骨骼</small></div><div class="clip-stat"><b>${keyCount}</b><small>关键帧</small></div></div>
      <h3>动作设计</h3><div class="note">${clipNote(studio.active)}</div>
      <h3>播放</h3><div class="button-row"><button id="clipPlay" class="accent-btn">${studio.playing?'暂停':'播放'}</button><button id="clipRestart">从头播放</button></div>`;
    $('#clipPlay').onclick=()=>togglePlay();$('#clipRestart').onclick=()=>{setTime(0);studio.playing=true;$('#playBtn').textContent='Ⅱ';renderInspector()};
  }else{
    root.innerHTML=`<div class="eyebrow">SPINE DELIVERY</div><h2>文件导出</h2><p>当前工程使用 Spine 4.3 SkeletonJson 结构，皮肤来自 GPT Image 母版拆件 Atlas。</p>
      <div class="file-list">
        ${fileRow('JSON','mushhorn.json','Spine 4.3 SkeletonJson','./data/mushhorn.json')}
        ${fileRow('ATL','mushhorn.atlas','纹理 Atlas 描述','./data/mushhorn.atlas')}
        ${fileRow('PNG','mushhorn.png','512×512 拆件纹理','./assets/mushhorn.png')}
        ${fileRow('REF','master_reference.png','GPT Image 母版','./assets/master_reference.png')}
        ${fileRow('META','parts.json','Pivot / Atlas / 设计元数据','./data/parts.json')}
      </div>
      <button class="wide-btn accent-btn" id="projectExport">导出工程描述 JSON</button>
      <h3>Runtime QA</h3><div class="qa">
        <div class="qa-row"><i>✓</i> Spine 4.3 JSON 解析</div>
        <div class="qa-row"><i>✓</i> ${studio.skeleton?.bones.length||0} Bones / ${studio.skeleton?.slots.length||0} Slots</div>
        <div class="qa-row"><i>✓</i> 5 个动作可由 AnimationState 播放</div>
        <div class="qa-row"><i>✓</i> Atlas 与 GPT Image 纹理加载</div>
      </div>`;
    $$('.file-row button').forEach(b=>b.onclick=()=>downloadUrl(b.dataset.url,b.dataset.name));
    $('#projectExport').onclick=()=>downloadText('mushhorn-project.json',JSON.stringify({format:'mushhorn-spine-workspace@1',skeleton:studio.json,parts:studio.meta,atlas:studio.atlasText},null,2),'application/json');
  }
}
function fileRow(icon,name,desc,url){return '<div class="file-row"><b>'+icon+'</b><div><strong>'+name+'</strong><small>'+desc+'</small></div><button data-url="'+url+'" data-name="'+name+'">下载</button></div>'}
function clipNote(name){
  return {
    Idle:'2.4 秒循环。Body 轻微 squash/stretch；伞帽比身体慢半拍；左右菌角使用不同相位；尾巴末端继续滞后，避免所有部位同步摆动。',
    Move:'0.8 秒小跑循环。对角腿组交替，Body 每 0.2 秒产生弹跳；Shell 与 Head 做反相补偿；Tail 用反向摆动平衡重心。',
    Attack:'0.18 秒压缩蓄力，0.34 秒达到最大前冲，随后 overshoot 并回收。Head 与菌角比 Body 更激进，Tail 反向甩动强化冲击。',
    Hurt:'0.08 秒内快速后缩，Shell 和 Head 继续惯性摆动；0.2 秒后反弹，再在 0.45 秒回到 Setup Pose。',
    Death:'先失衡抬起，再向侧面倒下；Shell、Head、菌角、尾巴按不同延迟继续坠落。非循环，最终停在压低姿态。'
  }[name]||'';
}

function renderTimeline(){
  if(!studio.meta||!studio.json)return;
  const root=$('#tracks'),ruler=$('#timeRuler'),d=duration(),anim=studio.json.animations[studio.active]||{},bones=anim.bones||{};
  root.innerHTML='';ruler.innerHTML='';
  const ticks=5;
  for(let i=0;i<=ticks;i++){const x=i/ticks*100,t=document.createElement('div');t.className='ruler-tick';t.style.left='calc(150px + '+x+'% * .65)';t.style.left=(150+x*6.5)+'px';t.textContent=(d*i/ticks).toFixed(2)+'s';ruler.appendChild(t)}
  for(const [boneName,channels] of Object.entries(bones)){
    const row=document.createElement('div');row.className='track-row';
    const name=document.createElement('div');name.className='track-name';name.textContent=boneName;
    const lane=document.createElement('div');lane.className='track-lane';
    for(const [type,frames] of Object.entries(channels)){
      if(!Array.isArray(frames))continue;
      for(const f of frames){const k=document.createElement('i');k.className='key '+(type==='rotate'?'rotate':type==='translate'?'translate':'scale');k.style.left=((+f.time||0)/(d||1)*100)+'%';k.title=type+' @ '+(+f.time||0).toFixed(3)+'s';lane.appendChild(k)}
    }
    row.append(name,lane);root.appendChild(row);
  }
  setTimeout(updateUI,0);
}

function togglePlay(){studio.playing=!studio.playing;$('#playBtn').textContent=studio.playing?'Ⅱ':'▶';if(studio.inspector==='clip')renderInspector()}
function downloadUrl(url,name){fetch(url).then(r=>r.blob()).then(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)})}
function downloadText(name,text,type='text/plain'){const blob=new Blob([text],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

function hitBone(cx,cy){
  if(!studio.skeleton)return null;let best=null,dist=14;
  const r=canvas.getBoundingClientRect(),x=cx-r.left,y=cy-r.top;
  for(const b of studio.skeleton.bones){const [bx,by]=boneScreen(b),d=Math.hypot(x-bx,y-by);if(d<dist){best=b;dist=d}}
  return best;
}
canvas.addEventListener('pointerdown',e=>{
  if(e.altKey||e.button===1){studio.drag={type:'pan',x:e.clientX,y:e.clientY,px:studio.cam.panX,py:studio.cam.panY};canvas.setPointerCapture(e.pointerId);return}
  const b=hitBone(e.clientX,e.clientY);if(b)selectBone(b.data.name);
});
canvas.addEventListener('pointermove',e=>{
  if(studio.drag?.type==='pan'){studio.cam.panX=studio.drag.px+(e.clientX-studio.drag.x);studio.cam.panY=studio.drag.py+(e.clientY-studio.drag.y);render()}
});
canvas.addEventListener('pointerup',e=>{studio.drag=null;canvas.releasePointerCapture?.(e.pointerId)});
canvas.addEventListener('wheel',e=>{e.preventDefault();studio.cam.zoom=clamp(studio.cam.zoom*(e.deltaY<0?1.08:.92),.25,5);render()},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

$('#playBtn').onclick=togglePlay;$('#prevBtn').onclick=()=>stepFrame(-1);$('#nextBtn').onclick=()=>stepFrame(1);
$('#timeSlider').oninput=e=>setTime(+e.target.value);
$('#speedSelect').onchange=e=>studio.speed=+e.target.value;
$('#loopBtn').onclick=()=>{studio.loop=!studio.loop;if(studio.entry)studio.entry.loop=studio.loop;$('#loopBtn').classList.toggle('on',studio.loop);$('#loopBtn').textContent=studio.loop?'循环 ✓':'循环'};
$('#fitBtn').onclick=()=>{fitView();render()};
for(const [id,key] of [['skinToggle','showSkin'],['rigToggle','showRig'],['nameToggle','showNames'],['masterToggle','showMaster'],['explodeToggle','explode'],['gridToggle','showGrid']]){
  $('#'+id).onchange=e=>{studio[key]=e.target.checked;render()};
}
$$('.ins-tabs button').forEach(b=>b.onclick=()=>setInspector(b.dataset.ins));
$$('.nav-btn').forEach(b=>b.onclick=()=>setInspector({overview:'design',assets:'parts',rig:'bones',animation:'clip',export:'files'}[b.dataset.panel]||'design'));
window.addEventListener('keydown',e=>{
  if(e.target.matches('input,select'))return;
  if(e.code==='Space'){e.preventDefault();togglePlay()}
  if(e.key==='ArrowLeft')stepFrame(-1);if(e.key==='ArrowRight')stepFrame(1);
  if(e.key.toLowerCase()==='r'){studio.showRig=!studio.showRig;$('#rigToggle').checked=studio.showRig}
});
new ResizeObserver(()=>{if(studio.ready){fitView();render()}}).observe(wrap);

boot();
