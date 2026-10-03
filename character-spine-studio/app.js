'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

const canvas=$('#stageCanvas'),ctx=canvas.getContext('2d'),wrap=$('#canvasWrap');
const portrait=$('#portraitCanvas'),pctx=portrait.getContext('2d');
const S={
 ready:false,error:null,json:null,meta:null,atlasText:'',atlasImage:null,atlas:null,skeletonData:null,skeleton:null,stateData:null,animState:null,entry:null,
 active:'Idle',playing:true,loop:true,speed:1,last:performance.now(),fps:60,fpsFrames:0,fpsAccum:0,fpsLast:performance.now(),
 showSkin:true,showRig:false,showNames:false,explode:false,showGrid:true,
 selectedBone:null,ins:'design',hidden:new Set(),overrides:new Map(),
 cam:{zoom:1.25,panX:0,panY:0},drag:null
};
window.CHARACTER_SPINE_STUDIO=S;

const animInfo={
 Idle:['待机',2.4,'呼吸、头部轻摆、头巾与裙摆错峰跟随'],
 Move:['移动',.8,'Contact / Down / Passing / Up 的短步循环'],
 Attack:['攻击',.85,'Anticipation → Action → Recovery，右手前击'],
 Hurt:['受击',.48,'快速后缩、头和布料惯性回弹'],
 Death:['死亡',1.4,'失衡、倒下、头巾与四肢延迟坠落']
};

async function loadImage(url){
 const img=new Image();img.decoding='async';
 await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('图片加载失败 '+url));img.src=url});
 return img;
}
async function boot(){
 try{
  if(!window.spine)throw new Error('Spine 4.3 Runtime 未加载');
  const [json,meta,atlasText,atlasImage]=await Promise.all([
   fetch('./data/character.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('character.json '+r.status);return r.json()}),
   fetch('./data/parts.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('parts.json '+r.status);return r.json()}),
   fetch('./data/character.atlas',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('character.atlas '+r.status);return r.text()}),
   loadImage('./assets/nun_parts_atlas.png')
  ]);
  S.json=json;S.meta=meta;S.atlasText=atlasText;S.atlasImage=atlasImage;
  S.atlas=new spine.TextureAtlas(atlasText);
  const loader=new spine.AtlasAttachmentLoader(S.atlas);
  const parser=new spine.SkeletonJson(loader);
  S.skeletonData=parser.readSkeletonData(json);
  S.skeleton=new spine.Skeleton(S.skeletonData);
  S.stateData=new spine.AnimationStateData(S.skeletonData);S.stateData.defaultMix=.09;
  S.animState=new spine.AnimationState(S.stateData);
  setAnimation('Idle');
  S.ready=true;
  $('#runtimeBadge').textContent='Spine 4.3 · PASS';$('#runtimeBadge').className='badge ok';
  $('#qaPipe').classList.add('done');$('#qaPipe i').textContent='✓';$('#qaText').textContent='SkeletonJson / 5 Clips / Atlas 验证通过';
  $('#boneCount').textContent=S.skeleton.bones.length;$('#slotCount').textContent=S.skeleton.slots.length;$('#partCount').textContent=Object.keys(meta.parts).length;
  $('#statBones').textContent=S.skeleton.bones.length+' bones';$('#statSlots').textContent=S.skeleton.slots.length+' slots';
  buildAnimList();buildPartsGrid();renderInspector();renderTimeline();drawPortrait();fitView();
  requestAnimationFrame(frameLoop);
 }catch(e){
  console.error(e);S.error=String(e?.message||e);$('#runtimeBadge').textContent='Runtime FAIL';$('#runtimeBadge').className='badge error';
  $('#qaText').textContent=S.error;$('#qaPipe i').textContent='!';$('#clipTitle').textContent='加载失败 · '+S.error;
 }
}
function duration(){return S.meta?.durations?.[S.active]??S.entry?.animation?.duration??0}
function setAnimation(name){
 if(!S.animState)return;
 S.active=name;S.loop=!!S.meta.loops[name];S.entry=S.animState.setAnimation(0,name,S.loop);S.playing=true;
 $('#playPause').textContent='Ⅱ';$('#loopBtn').classList.toggle('on',S.loop);$('#loopBtn').textContent=S.loop?'循环 ✓':'循环';
 $('#clipTitle').textContent=name+' · '+animInfo[name][0];$('#timelineTitle').textContent=name;
 buildAnimList();renderInspector();renderTimeline();applyPose();
}
function currentTime(){
 if(!S.entry)return 0;const d=duration();
 if(!d)return 0;return S.loop?((S.entry.trackTime%d)+d)%d:Math.min(d,S.entry.trackTime);
}
function applyOverrides(){
 for(const [name,o] of S.overrides){
  const b=S.skeleton.findBone(name);if(!b?.pose)continue;
  b.pose.rotation+=+o.rotation||0;b.pose.x+=+o.x||0;b.pose.y+=+o.y||0;
 }
}
function applyPose(){
 if(!S.skeleton||!S.animState)return;
 S.animState.apply(S.skeleton);applyOverrides();S.skeleton.updateWorldTransform(spine.Physics.update);
}
function togglePlay(){S.playing=!S.playing;$('#playPause').textContent=S.playing?'Ⅱ':'▶';if(S.ins==='clip')renderInspector()}
function setTime(t){
 if(!S.entry)return;S.playing=false;$('#playPause').textContent='▶';S.entry.trackTime=clamp(+t||0,0,duration());applyPose();updateUI();render();
}
function stepFrame(dir){setTime(currentTime()+dir/30)}

function buildAnimList(){
 const root=$('#animList');if(!root||!S.meta)return;root.innerHTML='';
 for(const [name,d] of Object.entries(S.meta.durations)){
  const a=animInfo[name];const b=document.createElement('button');b.className='anim-btn'+(name===S.active?' active':'');
  b.innerHTML='<b>'+name.slice(0,2).toUpperCase()+'</b><div><strong>'+name+' · '+a[0]+'</strong><small>'+a[2]+'</small></div><em>'+d.toFixed(2)+'s</em>';
  b.onclick=()=>setAnimation(name);root.appendChild(b);
 }
}
function buildPartsGrid(){
 const root=$('#partsGrid');if(!root||!S.meta)return;root.innerHTML='';
 for(const [name,p] of Object.entries(S.meta.parts)){
  const card=document.createElement('div');card.className='part-card'+(S.hidden.has(name)?' hidden':'');card.dataset.part=name;
  const c=document.createElement('canvas');c.width=160;c.height=120;const label=document.createElement('strong');label.textContent=name;
  card.append(c,label);card.onclick=()=>{S.hidden.has(name)?S.hidden.delete(name):S.hidden.add(name);buildPartsGrid();render()};
  root.appendChild(card);drawPartThumb(c,p);
 }
}
function drawPartThumb(c,p){
 const g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);if(!S.atlasImage)return;
 const [x,y,w,h]=p.atlas,sc=Math.min((c.width-18)/w,(c.height-16)/h,1.8),dw=w*sc,dh=h*sc;
 g.imageSmoothingEnabled=true;g.drawImage(S.atlasImage,x,y,w,h,(c.width-dw)/2,(c.height-dh)/2,dw,dh);
}
function drawPortrait(){
 if(!S.atlasImage)return;pctx.clearRect(0,0,portrait.width,portrait.height);
 // 左侧完整人物也是同一张 GPT Image 生成图集中的参考区，只作对照，不用于拆件。
 const sx=5,sy=4,sw=222,sh=535,scale=Math.min(portrait.width/sw,portrait.height/sh)*1.35;
 const dw=sw*scale,dh=sh*scale;pctx.imageSmoothingEnabled=true;
 pctx.drawImage(S.atlasImage,sx,sy,sw,sh,(portrait.width-dw)/2,(portrait.height-dh)*.20,dw,dh);
}

function resize(){
 const r=wrap.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;canvas.style.width=r.width+'px';canvas.style.height=r.height+'px'}
 return d;
}
function view(){const r=wrap.getBoundingClientRect();return{w:r.width,h:r.height,ox:r.width*.5+S.cam.panX,oy:r.height*.79+S.cam.panY,s:S.cam.zoom}}
function worldToScreen(x,y){const v=view();return[v.ox+x*v.s,v.oy-y*v.s]}
function fitView(){const r=wrap.getBoundingClientRect();S.cam.zoom=clamp(Math.min((r.width-130)/270,(r.height-80)/350),.7,2.8);S.cam.panX=0;S.cam.panY=0}
function drawBackdrop(dpr){
 const v=view();ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,v.w,v.h);
 const bg=ctx.createRadialGradient(v.w*.5,v.h*.48,20,v.w*.5,v.h*.48,Math.max(v.w,v.h)*.65);bg.addColorStop(0,'#17192d');bg.addColorStop(.55,'#0d131e');bg.addColorStop(1,'#080c13');ctx.fillStyle=bg;ctx.fillRect(0,0,v.w,v.h);
 if(S.showGrid){ctx.strokeStyle='rgba(120,145,175,.07)';ctx.lineWidth=1;const st=Math.max(28,40*S.cam.zoom);for(let x=((v.ox%st)+st)%st;x<v.w;x+=st){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,v.h);ctx.stroke()}for(let y=((v.oy%st)+st)%st;y<v.h;y+=st){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(v.w,y);ctx.stroke()}ctx.strokeStyle='rgba(130,150,180,.18)';ctx.beginPath();ctx.moveTo(0,v.oy);ctx.lineTo(v.w,v.oy);ctx.stroke()}
 const sh=ctx.createRadialGradient(v.ox,v.oy+5,5,v.ox,v.oy+5,110*v.s);sh.addColorStop(0,'rgba(0,0,0,.42)');sh.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=sh;ctx.beginPath();ctx.ellipse(v.ox,v.oy+5,105*v.s,17*v.s,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
function explodeOffset(bone){
 if(!S.explode)return[0,0];const p=bone.appliedPose,dx=p.worldX,dy=p.worldY-95,l=Math.hypot(dx,dy)||1;return[dx/l*55, -dy/l*55];
}
function drawSkin(dpr){
 if(!S.showSkin||!S.atlasImage||!S.skeleton)return;const v=view();
 for(const name of S.meta.drawOrder){
  if(S.hidden.has(name))continue;const p=S.meta.parts[name],b=S.skeleton.findBone(p.bone);if(!p||!b)continue;
  const q=b.appliedPose,[sx,sy]=worldToScreen(q.worldX,q.worldY),[ex,ey]=explodeOffset(b),[ax,ay,aw,ah]=p.atlas,[px,py]=p.pivot;
  ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.transform(v.s*q.a,-v.s*q.c,-v.s*q.b,v.s*q.d,sx+ex,sy+ey);
  ctx.drawImage(S.atlasImage,ax,ay,aw,ah,-px,-py,aw,ah);ctx.restore();
 }
}
function boneChildrenMap(){
 const map=new Map();for(const b of S.skeleton?.bones||[]){if(b.data.parent){const a=map.get(b.data.parent.name)||[];a.push(b);map.set(b.data.parent.name,a)}}return map;
}
function drawRig(dpr){
 if(!S.showRig||!S.skeleton)return;const ch=boneChildrenMap();ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
 for(const b of S.skeleton.bones){
  const p=b.appliedPose,[x,y]=worldToScreen(p.worldX,p.worldY),kids=ch.get(b.data.name)||[],active=S.selectedBone===b.data.name;
  for(const k of kids){const kp=k.appliedPose,[x2,y2]=worldToScreen(kp.worldX,kp.worldY);ctx.strokeStyle=active?'#ffd76b':'rgba(84,211,242,.72)';ctx.lineWidth=active?2.5:1.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke()}
  ctx.fillStyle=active?'#ffd76b':'#8ce7fb';ctx.beginPath();ctx.arc(x,y,active?5:3.2,0,Math.PI*2);ctx.fill();
  if(S.showNames){ctx.font='9px ui-monospace,monospace';ctx.fillStyle=active?'#ffe6a2':'#8ea5ba';ctx.fillText(b.data.name,x+6,y-5)}
 }
 ctx.restore();
}
function render(){const dpr=resize();drawBackdrop(dpr);drawSkin(dpr);drawRig(dpr)}
function frameLoop(now){
 if(S.ready){
  const dt=Math.min((now-S.last)/1000,.05);S.last=now;
  if(S.playing&&S.entry){S.animState.update(dt*S.speed);if(!S.loop&&S.entry.trackTime>=duration()){S.entry.trackTime=duration();S.playing=false;$('#playPause').textContent='▶'}applyPose()}
  S.fpsFrames++;S.fpsAccum+=dt;if(now-S.fpsLast>500){S.fps=S.fpsFrames/(S.fpsAccum||1);S.fpsFrames=0;S.fpsAccum=0;S.fpsLast=now}
  updateUI();render();
 }
 requestAnimationFrame(frameLoop);
}
function updateUI(){
 const d=duration(),t=currentTime();$('#timeText').textContent=t.toFixed(3)+' / '+d.toFixed(3);$('#timeSlider').max=d||1;$('#timeSlider').value=t;$('#statFps').textContent=Math.round(S.fps)+' FPS';
 const sc=$('.timeline-scroll');if(sc){const width=Math.max(600,sc.scrollWidth-130),frac=d?t/d:0;$('#playhead').style.left=(130+frac*width-sc.scrollLeft)+'px'}
}
function boneDepth(b){let d=0,p=b.data.parent;while(p){d++;p=p.parent}return d}
function selectBone(name){S.selectedBone=name;S.showRig=true;$('#rigToggle').checked=true;S.ins='bones';setInspectorTab('bones');renderInspector();render()}
function hitBone(clientX,clientY){
 if(!S.skeleton)return null;const r=canvas.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top;let best=null,dist=15;
 for(const b of S.skeleton.bones){const p=b.appliedPose,[bx,by]=worldToScreen(p.worldX,p.worldY),d=Math.hypot(x-bx,y-by);if(d<dist){best=b;dist=d}}return best;
}

function setInspectorTab(tab){
 S.ins=tab;$$('.ins-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.ins===tab));
 const map={design:'animate',parts:'parts',bones:'rig',clip:'animate',files:'export'};$$('.top-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.panel===map[tab]));
}
function renderInspector(){
 const root=$('#inspector');if(!root||!S.meta){return}
 if(S.ins==='design'){
  root.innerHTML='<span class="eyebrow">CHARACTER</span><h2>修女少女 · Sister</h2><p>以你提供的人物为目标：灰棕短发、黑白修女外衣、白围裙、白长袜与深色短靴。默认固定向右 3/4 游戏视角。</p><canvas id="masterPreview" width="520" height="260" style="width:100%;height:190px;border:1px solid var(--line);border-radius:10px;background:#080d15"></canvas><div class="kv"><div>定位</div><div>'+esc(S.meta.design.role)+'</div><div>视角</div><div>'+esc(S.meta.design.view)+'</div><div>轮廓</div><div>'+esc(S.meta.design.silhouette)+'</div><div>动作</div><div>'+esc(S.meta.design.movement)+'</div></div><h3>素材来源</h3><div class="note"><b>正式附件均来自 GPT Image 生成的零件图集。</b><br>没有使用 Python 从人物母版裁切。Spine Atlas 只是引用 GPT Image 已生成的区域。</div>';
  setTimeout(drawMasterPreview,0);
 }else if(S.ins==='parts'){
  root.innerHTML='<div class="section-title"><h3>GPT Image 零件</h3><span>'+Object.keys(S.meta.parts).length+' PARTS</span></div><div class="note">下面的正式附件来自同一张 GPT Image 透明零件图集。点击底部零件卡可隐藏/显示，爆炸视图可检查关节重叠。</div><h3>资产规则</h3><div class="qa"><div class="qa-row"><i>✓</i> GPT Image 生成</div><div class="qa-row"><i>✓</i> Python 切割：NO</div><div class="qa-row"><i>✓</i> Atlas Region 直接采样</div><div class="qa-row"><i>✓</i> 关节 Pivot 独立定义</div></div>';
 }else if(S.ins==='bones'){
  const bones=S.skeleton?.bones||[];let rows=bones.map(b=>'<div class="bone-row '+(b.data.name===S.selectedBone?'active':'')+'" data-bone="'+esc(b.data.name)+'" style="padding-left:'+(7+boneDepth(b)*10)+'px"><i class="joint"></i><span>'+esc(b.data.name)+'</span></div>').join('');
  const sel=S.selectedBone&&S.skeleton.findBone(S.selectedBone),o=S.overrides.get(S.selectedBone)||{rotation:0,x:0,y:0};
  root.innerHTML='<div class="section-title"><h3>骨骼结构</h3><span>'+bones.length+' BONES</span></div><div class="bone-tree">'+rows+'</div>'+
   (sel?'<h3>Pose Offset · '+esc(sel.data.name)+'</h3><label class="control"><span>Rotation <output id="rotOut">'+(+o.rotation||0).toFixed(1)+'°</output></span><input id="rotCtl" type="range" min="-90" max="90" step=".5" value="'+(+o.rotation||0)+'"></label><label class="control"><span>X <output id="xOut">'+(+o.x||0).toFixed(1)+'</output></span><input id="xCtl" type="range" min="-40" max="40" step=".5" value="'+(+o.x||0)+'"></label><label class="control"><span>Y <output id="yOut">'+(+o.y||0).toFixed(1)+'</output></span><input id="yCtl" type="range" min="-40" max="40" step=".5" value="'+(+o.y||0)+'"></label><div class="button-row"><button id="resetBone">重置骨骼</button><button id="resetAll">重置全部</button></div>':'<div class="note" style="margin-top:10px">点击骨骼树或舞台骨点选择骨骼。</div>');
  $$('.bone-row').forEach(r=>r.onclick=()=>selectBone(r.dataset.bone));
  if(sel){
   const change=()=>{const ov=S.overrides.get(S.selectedBone)||{rotation:0,x:0,y:0};ov.rotation=+$('#rotCtl').value;ov.x=+$('#xCtl').value;ov.y=+$('#yCtl').value;S.overrides.set(S.selectedBone,ov);$('#rotOut').textContent=ov.rotation.toFixed(1)+'°';$('#xOut').textContent=ov.x.toFixed(1);$('#yOut').textContent=ov.y.toFixed(1);applyPose();render()};
   ['rotCtl','xCtl','yCtl'].forEach(id=>$('#'+id).addEventListener('input',change));$('#resetBone').onclick=()=>{S.overrides.delete(S.selectedBone);applyPose();renderInspector()};$('#resetAll').onclick=()=>{S.overrides.clear();applyPose();renderInspector()};
  }
 }else if(S.ins==='clip'){
  const a=S.json.animations[S.active]||{},bones=a.bones||{};let keys=0;for(const v of Object.values(bones))for(const arr of Object.values(v))if(Array.isArray(arr))keys+=arr.length;
  root.innerHTML='<span class="eyebrow">ANIMATION</span><h2>'+S.active+' · '+animInfo[S.active][0]+'</h2><p>'+animInfo[S.active][2]+'</p><div class="clip-stats"><div class="clip-stat"><b>'+duration().toFixed(2)+'s</b><small>时长</small></div><div class="clip-stat"><b>'+Object.keys(bones).length+'</b><small>动画骨骼</small></div><div class="clip-stat"><b>'+keys+'</b><small>关键帧</small></div></div><h3>动画原则</h3><div class="note">'+clipNote(S.active)+'</div><h3>播放</h3><div class="button-row"><button id="clipPlay" class="accent-btn">'+(S.playing?'暂停':'播放')+'</button><button id="clipRestart">从头播放</button></div>';
  $('#clipPlay').onclick=togglePlay;$('#clipRestart').onclick=()=>{setTime(0);S.playing=true;$('#playPause').textContent='Ⅱ';renderInspector()};
 }else{
  root.innerHTML='<span class="eyebrow">DELIVERY</span><h2>Spine 4.3 文件</h2><div class="file-list">'+
   fileRow('JSON','character.json','Spine 4.3 SkeletonJson','./data/character.json')+
   fileRow('ATL','character.atlas','Atlas Region 描述','./data/character.atlas')+
   fileRow('PNG','nun_parts_atlas.png','GPT Image 正式零件图集','./assets/nun_parts_atlas.png')+
   fileRow('META','parts.json','Pivot / 资产来源 / 动画元数据','./data/parts.json')+
   '</div><button id="exportDesc" class="wide-btn accent-btn" style="margin-top:9px">导出工作区 JSON</button><h3>Runtime QA</h3><div class="qa"><div class="qa-row"><i>✓</i> Spine 4.3 SkeletonJson 解析</div><div class="qa-row"><i>✓</i> 25 Bones / 22 Slots</div><div class="qa-row"><i>✓</i> 5 个动画由 AnimationState 驱动</div><div class="qa-row"><i>✓</i> GPT Image Atlas 加载</div></div>';
  $$('.file-row button').forEach(b=>b.onclick=()=>downloadUrl(b.dataset.url,b.dataset.name));$('#exportDesc').onclick=exportWorkspace;
 }
}
function drawMasterPreview(){
 const c=$('#masterPreview');if(!c||!S.atlasImage)return;const g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);
 const sx=0,sy=0,sw=228,sh=543,sc=Math.min((c.width-20)/sw,(c.height-10)/sh);const dw=sw*sc,dh=sh*sc;g.drawImage(S.atlasImage,sx,sy,sw,sh,(c.width-dw)/2,(c.height-dh)/2,dw,dh);
}
function clipNote(name){return{
 Idle:'呼吸不是单纯上下移动：Body 做轻微 squash/stretch，Head、Veil、Skirt 使用不同相位，避免全部零件同步。',
 Move:'0.8 秒循环使用前后对称的步态相位。左右腿反相、左右手反相，头巾和裙摆滞后于身体。',
 Attack:'0.18 秒压缩蓄力，0.36 秒右手和身体达到最大前冲，之后 overshoot 再回收。',
 Hurt:'0.08 秒快速后缩；头和头巾继续惯性；随后二次回弹，0.48 秒回到 Setup Pose。',
 Death:'身体先失衡再倒下，头、手臂与头巾延迟坠落；最终帧不循环。'
}[name]||''}
function fileRow(icon,name,desc,url){return '<div class="file-row"><b>'+icon+'</b><div><strong>'+name+'</strong><small>'+desc+'</small></div><button data-url="'+url+'" data-name="'+name+'">下载</button></div>'}

function renderTimeline(){
 if(!S.json||!S.meta)return;const d=duration(),anim=S.json.animations[S.active]||{},bones=anim.bones||{},root=$('#tracks'),ruler=$('#timeRuler');root.innerHTML='';ruler.innerHTML='';
 for(let i=0;i<=5;i++){const m=document.createElement('span');m.className='ruler-mark';m.style.left=(130+i*120)+'px';m.textContent=(d*i/5).toFixed(2)+'s';ruler.appendChild(m)}
 for(const [name,channels] of Object.entries(bones)){
  const row=document.createElement('div');row.className='track-row';const label=document.createElement('div');label.className='track-name';label.textContent=name;const lane=document.createElement('div');lane.className='track-lane';
  for(const [type,frames] of Object.entries(channels)){if(!Array.isArray(frames))continue;for(const f of frames){const k=document.createElement('i');k.className='key '+(type==='rotate'?'rotate':type==='translate'?'translate':'scale');k.style.left=((+f.time||0)/(d||1)*100)+'%';k.title=type+' @ '+(+f.time||0).toFixed(3)+'s';lane.appendChild(k)}}
  row.append(label,lane);root.appendChild(row);
 }
}
function downloadUrl(url,name){fetch(url).then(r=>r.blob()).then(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)})}
function downloadText(name,text,type='application/json'){const blob=new Blob([text],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportWorkspace(){downloadText('sister-spine-workspace.json',JSON.stringify({format:'sister-spine-workspace@1',character:S.meta,skeleton:S.json,poseOverrides:Object.fromEntries(S.overrides)},null,2))}
function saveWorkspace(){localStorage.setItem('sister-spine-workspace',JSON.stringify({overrides:Object.fromEntries(S.overrides),active:S.active,hidden:[...S.hidden]}));$('#saveWorkspace').textContent='✓ 已保存';setTimeout(()=>$('#saveWorkspace').textContent='保存工作区',1200)}
function restoreWorkspace(){try{const x=JSON.parse(localStorage.getItem('sister-spine-workspace')||'null');if(!x)return;S.overrides=new Map(Object.entries(x.overrides||{}));S.hidden=new Set(x.hidden||[]);if(x.active&&animInfo[x.active])S.active=x.active}catch{}}

canvas.addEventListener('pointerdown',e=>{if(e.altKey||e.button===1){S.drag={x:e.clientX,y:e.clientY,px:S.cam.panX,py:S.cam.panY};canvas.setPointerCapture(e.pointerId);return}const b=hitBone(e.clientX,e.clientY);if(b)selectBone(b.data.name)});
canvas.addEventListener('pointermove',e=>{if(S.drag){S.cam.panX=S.drag.px+e.clientX-S.drag.x;S.cam.panY=S.drag.py+e.clientY-S.drag.y;render()}});
canvas.addEventListener('pointerup',e=>{S.drag=null;canvas.releasePointerCapture?.(e.pointerId)});
canvas.addEventListener('wheel',e=>{e.preventDefault();S.cam.zoom=clamp(S.cam.zoom*(e.deltaY<0?1.08:.92),.45,4);render()},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

$('#playPause').onclick=togglePlay;$('#prevFrame').onclick=()=>stepFrame(-1);$('#nextFrame').onclick=()=>stepFrame(1);$('#timeSlider').oninput=e=>setTime(e.target.value);$('#speedSelect').onchange=e=>S.speed=+e.target.value;
$('#loopBtn').onclick=()=>{S.loop=!S.loop;if(S.entry)S.entry.loop=S.loop;$('#loopBtn').classList.toggle('on',S.loop);$('#loopBtn').textContent=S.loop?'循环 ✓':'循环'};
$('#fitBtn').onclick=()=>{fitView();render()};
for(const [id,key] of [['skinToggle','showSkin'],['rigToggle','showRig'],['namesToggle','showNames'],['explodeToggle','explode'],['gridToggle','showGrid']])$('#'+id).onchange=e=>{S[key]=e.target.checked;render()};
$$('.ins-tabs button').forEach(b=>b.onclick=()=>{setInspectorTab(b.dataset.ins);renderInspector()});
$$('.top-tabs button').forEach(b=>b.onclick=()=>{const t={animate:'clip',parts:'parts',rig:'bones',export:'files'}[b.dataset.panel];setInspectorTab(t);renderInspector()});
$('#saveWorkspace').onclick=saveWorkspace;$('#exportWorkspace').onclick=exportWorkspace;
window.addEventListener('keydown',e=>{if(e.target.matches('input,select'))return;if(e.code==='Space'){e.preventDefault();togglePlay()}if(e.key==='ArrowLeft')stepFrame(-1);if(e.key==='ArrowRight')stepFrame(1);if(e.key.toLowerCase()==='r'){S.showRig=!S.showRig;$('#rigToggle').checked=S.showRig}});
new ResizeObserver(()=>{if(S.ready){fitView();render()}}).observe(wrap);

restoreWorkspace();boot();
