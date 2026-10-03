
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)); const rad=d=>d*Math.PI/180; const deg=r=>r*180/Math.PI;
const deep=o=>structuredClone(o); const uid=()=>Math.random().toString(36).slice(2,10);
const state={manifest:[],project:null,sourceCase:null,selectedBone:null,selectedSlot:null,currentTime:0,playing:false,lastT:0,speed:1,fps:30,loop:true,showGrid:true,showNames:false,onion:false,showSkin:true,showRig:true,skinOpacity:1,leftTab:'cases',insTab:'bone',view:{x:0,y:0,zoom:1},drag:null,history:[],future:[],overrides:{},snapshots:[],reference:null,atlasRegions:new Map(),regionCanvases:new Map(),textureImage:null,textureReady:false,attachmentImages:new Map()};
const canvas=$('#stage'),ctx=canvas.getContext('2d');

const dbp=new Promise((resolve,reject)=>{const r=indexedDB.open('rig-motion-lab',1);r.onupgradeneeded=()=>{r.result.createObjectStore('projects',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
async function dbPut(p){const db=await dbp;return new Promise((res,rej)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(p);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function dbAll(){const db=await dbp;return new Promise((res,rej)=>{const q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function dbGet(id){const db=await dbp;return new Promise((res,rej)=>{const q=db.transaction('projects').objectStore('projects').get(id);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}

function normalizeProject(data,name='未命名工程'){
 const bones=(data.bones||[]).map((b,i)=>({name:b.name||`bone_${i}`,parent:b.parent||null,length:+b.length||0,x:+b.x||0,y:+b.y||0,rotation:+b.rotation||0,scaleX:b.scaleX==null?1:+b.scaleX,scaleY:b.scaleY==null?1:+b.scaleY,shearX:+b.shearX||0,shearY:+b.shearY||0,transform:b.transform||'normal',hidden:!!b.hidden,locked:!!b.locked}));
 const animations=data.animations||{}; const durations=data.durations||Object.fromEntries(Object.entries(animations).map(([n,a])=>[n,measureDuration(a)]));
 const skinNames=Object.keys(data.skins||{});
 return {id:data.id||uid(),name:data.name||name,createdAt:data.createdAt||Date.now(),updatedAt:Date.now(),schema:'rig-motion-lab/project@3',source:data.source||{},remote:data.remote||null,skeleton:data.skeleton||{},bones,slots:data.slots||[],skins:data.skins||{},atlas:data.atlas||null,sourceImages:data.sourceImages||{},activeSkin:data.activeSkin||skinNames[0]||'default',skinEdits:data.skinEdits||{slotVisibility:{},attachments:{}},ik:data.ik||[],transform:data.transform||[],path:data.path||[],events:data.events||{},animations,durations,activeAnimation:data.activeAnimation||Object.keys(animations)[0]||'Setup Pose',customKeys:data.customKeys||{},notes:data.notes||'',tags:data.tags||[]};
}
function measureDuration(a){let mx=0;const stack=[a];while(stack.length){const x=stack.pop();if(Array.isArray(x)) stack.push(...x);else if(x&&typeof x==='object'){if(typeof x.time==='number')mx=Math.max(mx,x.time);stack.push(...Object.values(x))}}return mx}
function historySnap(){return {bones:state.project.bones,animations:state.project.animations,durations:state.project.durations,customKeys:state.project.customKeys,skinEdits:state.project.skinEdits,activeSkin:state.project.activeSkin}}
function restoreSnap(x){state.project.bones=x.bones;if(x.animations)state.project.animations=x.animations;if(x.durations)state.project.durations=x.durations;state.project.customKeys=x.customKeys;state.project.skinEdits=x.skinEdits||{slotVisibility:{},attachments:{}};state.project.activeSkin=x.activeSkin||state.project.activeSkin;if(typeof spineRT!=='undefined'&&spineRT.ready)buildSpineRuntime().then(()=>{syncRuntimePose();renderAll()})}
function pushHistory(){if(!state.project)return;state.history.push(JSON.stringify(historySnap()));if(state.history.length>60)state.history.shift();state.future=[]}
function undo(){if(!state.history.length||!state.project)return;state.future.push(JSON.stringify(historySnap()));restoreSnap(JSON.parse(state.history.pop()));renderAll()}
function redo(){if(!state.future.length||!state.project)return;state.history.push(JSON.stringify(historySnap()));restoreSnap(JSON.parse(state.future.pop()));renderAll()}

const remoteCaseCache=new Map();
function remoteViewMeta(code){return ({b:{view:'基建',dir:'build'},r:{view:'战斗背面',dir:'back'},f:{view:'战斗正面',dir:'front'}})[code]}
function remoteAssetStem(code,stem){
 let s=String(stem||'');
 if(code==='b'&&!s.startsWith('build_'))s='build_'+s;
 return s
}
function remoteSkinFolder(remote){
 const stem=String(remote.stem||'').replace(/^build_/,'');
 return remote.costume==='默认'?'defaultskin':stem
}
function remoteAssetUrls(remote){
 const m=remoteViewMeta(remote.viewCode),stem=remoteAssetStem(remote.viewCode,remote.stem);
 const folder=remoteSkinFolder(remote);
 const root='https://torappu.prts.wiki/assets/char_spine/'+encodeURIComponent(remote.charKey)+'/'+encodeURIComponent(folder)+'/'+m.dir+'/';
 const base=root+encodeURIComponent(stem);
 return {stem,folder,skel:base+'.skel',atlas:base+'.atlas',png:base+'.png'}
}
function expandRemoteCases(builtins){
 const rows=window.RIG_ALL_CASES||[],views=['b','r','f'],builtKeys=new Set((builtins||[]).map(c=>[c.character,c.costume||c.appearance,c.view].join('|'))),out=[];let n=0;
 for(const row of rows){
  const [character,costume,charKey,map]=row;
  for(const code of views){
   const info=map?.[code];if(!info)continue;
   const vm=remoteViewMeta(code),dedupe=[character,costume,vm.view].join('|');
   if(builtKeys.has(dedupe))continue;
   const [stem,bones,slots]=info;
   out.push({
    id:'remote-'+(++n),title:character+' · '+costume+' · '+vm.view,
    character,costume,appearance:costume,view:vm.view,spine:'3.5.51',
    bones,slots,attachments:null,animations:[],
    remote:{provider:'PRTS Spine CDN',charKey,costume,viewCode:code,stem}
   })
  }
 }
 return out
}
async function ensureSkeletonBinaryConverter(){
 if(window.SkeletonBinary)return;
 await loadOneOf([
  'https://cdn.jsdelivr.net/gh/Aceship/AN-EN-Tags@d7264a3cc4e6455ad8fa87754d318cbd91a0f862/js/spine-skeleton-binary.js',
  'https://raw.githubusercontent.com/Aceship/AN-EN-Tags/d7264a3cc4e6455ad8fa87754d318cbd91a0f862/js/spine-skeleton-binary.js'
 ],'spine35-binary-converter');
 if(!window.SkeletonBinary)throw new Error('Spine 3.5 二进制转换器未初始化')
}
async function fetchRemoteCaseData(c){
 if(remoteCaseCache.has(c.id))return deep(remoteCaseCache.get(c.id));
 const urls=remoteAssetUrls(c.remote);
 $('#hud').textContent='正在加载 '+c.title+' …';
 const [skelRes,atlasRes]=await Promise.all([fetch(urls.skel,{cache:'force-cache'}),fetch(urls.atlas,{cache:'force-cache'})]);
 if(!skelRes.ok)throw new Error('骨骼资源加载失败 HTTP '+skelRes.status);
 if(!atlasRes.ok)throw new Error('Atlas 加载失败 HTTP '+atlasRes.status);
 await ensureSkeletonBinaryConverter();
 const bytes=new Uint8Array(await skelRes.arrayBuffer()),conv=new window.SkeletonBinary();
 conv.data=bytes;conv.nextNum=0;conv.json={};conv.initJson();
 const d=conv.json||{};
 if(!d.bones?.length)throw new Error('二进制骨骼解析为空');
 d.atlas={text:await atlasRes.text(),imageData:urls.png,imageName:urls.stem+'.png'};
 d.source={name:c.title,spine:d.skeleton?.spine||c.spine||'3.5.51',provider:'PRTS Spine CDN',remote:true};
 d.remote={...c.remote,urls};
 remoteCaseCache.set(c.id,deep(d));
 return d
}
async function loadManifest(){
 try{
  const r=await fetch('data/cases.json',{cache:'no-store'}),builtins=(await r.json()).cases||[];
  state.manifest=[...builtins,...expandRemoteCases(builtins)];
 }catch(e){console.error(e)}
 renderLeft()
}
async function loadCase(c){
 try{
  let d;
  if(c.remote)d=await fetchRemoteCaseData(c);
  else{
   const b64=window.RIG_CASE_PACK?.[c.id];if(!b64)throw new Error('案例数据不存在: '+c.id);
   const bin=Uint8Array.from(atob(b64),x=>x.charCodeAt(0));let raw;
   if('DecompressionStream' in window){const stream=new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));raw=await new Response(stream).text()}
   else throw new Error('当前浏览器不支持 gzip 解压，请使用最新版 Chrome / Edge / Safari');
   d=JSON.parse(raw)
  }
  state.sourceCase=c;
  state.project=normalizeProject({...d,name:c.title,id:'case-'+c.id},c.title);
  state.project.activeAnimation=state.project.animations.Idle?'Idle':Object.keys(state.project.animations)[0]||'Setup Pose';
  state.currentTime=0;state.playing=false;state.selectedBone=null;state.selectedSlot=state.project.slots[0]?.name||null;state.history=[];state.future=[];
  await prepareSkin();fitView();renderAll()
 }catch(e){
  console.error('Case load failed',c,e);
  $('#modal').innerHTML='<h2>案例加载失败</h2><div class="note warn">'+esc(c?.title||'案例')+'<br>'+esc(String(e?.message||e))+'</div><div class="actions"><button data-close class="primary">关闭</button></div>';
  showModal();wireClose();throw e
 }
}
async function loadProject(p){state.project=normalizeProject(p,p.name);state.sourceCase=null;state.currentTime=0;state.selectedBone=null;state.selectedSlot=state.project.slots[0]?.name||null;state.history=[];state.future=[];await prepareSkin();fitView();renderAll()}

function timelineFrames(anim,bone,type){return anim?.bones?.[bone]?.[type]||[]}
function bezierEase(t,c){if(!Array.isArray(c)||c.length<4)return t;const [x1,y1,x2,y2]=c;let lo=0,hi=1,u=t;for(let i=0;i<10;i++){u=(lo+hi)/2;const x=3*(1-u)*(1-u)*u*x1+3*(1-u)*u*u*x2+u*u*u;if(x<t)lo=u;else hi=u}return 3*(1-u)*(1-u)*u*y1+3*(1-u)*u*u*y2+u*u*u}
function sampleFrames(frames,t,keys,defaults){if(!frames?.length)return defaults;let a=frames[0],b=null;if(t<=+a.time||0)b=a;else{for(let i=0;i<frames.length-1;i++){if(t>=frames[i].time&&t<frames[i+1].time){a=frames[i];b=frames[i+1];break}}if(!b){a=frames[frames.length-1];b=a}}
 if(a===b)return Object.fromEntries(keys.map((k,i)=>[k,a[k]??defaults[k]??0]));const span=b.time-a.time||1;let u=clamp((t-a.time)/span,0,1);if(a.curve==='stepped')u=0;else if(Array.isArray(a.curve))u=bezierEase(u,a.curve);const out={};for(const k of keys){const av=+(a[k]??defaults[k]??0),bv=+(b[k]??av);out[k]=av+(bv-av)*u}return out}
function customFor(name,t){const arr=state.project?.customKeys?.[state.project.activeAnimation]?.[name]||[];if(!arr.length)return null;let best=null;for(const k of arr)if(k.time<=t+1e-4)best=k;return best}
function localPose(t){if(!state.project)return[];const anim=state.project.animations[state.project.activeAnimation];return state.project.bones.map(b=>{let p={...b};if(anim){const ro=sampleFrames(timelineFrames(anim,b.name,'rotate'),t,['angle'],{angle:0});p.rotation=b.rotation+ro.angle;const tr=sampleFrames(timelineFrames(anim,b.name,'translate'),t,['x','y'],{x:0,y:0});p.x=b.x+tr.x;p.y=b.y+tr.y;const sc=sampleFrames(timelineFrames(anim,b.name,'scale'),t,['x','y'],{x:1,y:1});if(timelineFrames(anim,b.name,'scale').length){p.scaleX=b.scaleX*sc.x;p.scaleY=b.scaleY*sc.y}const sh=sampleFrames(timelineFrames(anim,b.name,'shear'),t,['x','y'],{x:0,y:0});p.shearX=b.shearX+sh.x;p.shearY=b.shearY+sh.y}
 const c=customFor(b.name,t);if(c)Object.assign(p,c.pose);return p})}
function worldPose(t){const loc=localPose(t),map=new Map(),out=[];for(const b of loc){const rx=rad(b.rotation+b.shearX),ry=rad(b.rotation+90+b.shearY);let la=Math.cos(rx)*b.scaleX,lb=Math.cos(ry)*b.scaleY,lc=Math.sin(rx)*b.scaleX,ld=Math.sin(ry)*b.scaleY;let a=la,bb=lb,c=lc,d=ld,wx=b.x,wy=b.y;if(b.parent&&map.has(b.parent)){const p=map.get(b.parent);wx=p.a*b.x+p.b*b.y+p.wx;wy=p.c*b.x+p.d*b.y+p.wy;if(b.transform==='noScale'||b.transform==='noScaleOrReflection'){const pr=Math.atan2(p.c,p.a),ca=Math.cos(pr),sa=Math.sin(pr);a=ca*la-sa*lc;bb=ca*lb-sa*ld;c=sa*la+ca*lc;d=sa*lb+ca*ld}else{a=p.a*la+p.b*lc;bb=p.a*lb+p.b*ld;c=p.c*la+p.d*lc;d=p.c*lb+p.d*ld}}const wr=deg(Math.atan2(c,a)),wsx=Math.hypot(a,c),wsy=Math.hypot(bb,d);const w={...b,a,b:bb,c,d,wx,wy,wr,wsx,wsy};map.set(b.name,w);out.push(w)}return out}

function resizeCanvas(){const r=canvas.getBoundingClientRect(),d=window.devicePixelRatio||1;const w=Math.max(1,Math.floor(r.width*d)),h=Math.max(1,Math.floor(r.height*d));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;ctx.setTransform(d,0,0,d,0,0)}}
function toScreen(x,y){const r=canvas.getBoundingClientRect();return [r.width/2+state.view.x+x*state.view.zoom,r.height/2+state.view.y-y*state.view.zoom]}
function toWorld(x,y){const r=canvas.getBoundingClientRect();return [(x-r.width/2-state.view.x)/state.view.zoom,-(y-r.height/2-state.view.y)/state.view.zoom]}
function drawGrid(){if(!state.showGrid)return;const r=canvas.getBoundingClientRect(),z=state.view.zoom;let step=20;while(step*z<30)step*=2;while(step*z>100)step/=2;ctx.save();ctx.strokeStyle='#151b24';ctx.lineWidth=1;const [wx0,wy0]=toWorld(0,r.height),[wx1,wy1]=toWorld(r.width,0);for(let x=Math.floor(wx0/step)*step;x<=wx1;x+=step){const [sx]=toScreen(x,0);ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx,r.height);ctx.stroke()}for(let y=Math.floor(wy0/step)*step;y<=wy1;y+=step){const [,sy]=toScreen(0,y);ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(r.width,sy);ctx.stroke()}const [ox,oy]=toScreen(0,0);ctx.strokeStyle='#273247';ctx.beginPath();ctx.moveTo(ox,0);ctx.lineTo(ox,r.height);ctx.moveTo(0,oy);ctx.lineTo(r.width,oy);ctx.stroke();ctx.restore()}
function drawPose(pose,alpha=1,ghost=false){const sel=state.selectedBone;ctx.save();ctx.globalAlpha=alpha;for(const b of pose){if(b.hidden)continue;const [x,y]=toScreen(b.wx,b.wy),rr=rad(b.wr);const ex=b.wx+Math.cos(rr)*b.length*b.wsx,ey=b.wy+Math.sin(rr)*b.length*b.wsx,[x2,y2]=toScreen(ex,ey);ctx.lineCap='round';ctx.lineWidth=ghost?2:3;ctx.strokeStyle=ghost?'#5b7596':(b.name===sel?'#ffd43b':'#7891ad');ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();ctx.fillStyle=b.name===sel?'#ffd43b':'#c4d2e1';ctx.beginPath();ctx.arc(x,y,b.name===sel?5:3.2,0,Math.PI*2);ctx.fill();if(state.showNames&&!ghost){ctx.font='10px var(--mono)';ctx.fillStyle='#aeb9c8';ctx.fillText(b.name,x+6,y-6)}}ctx.restore()}

function parseAtlas(text){
 const lines=String(text||'').replace(/\r/g,'').split('\n'),regions=new Map();let i=0,page=null;
 while(i<lines.length&&!lines[i].trim())i++;if(i<lines.length)page=lines[i++].trim();
 const pageKeys=new Set(['size','format','filter','repeat','pma']);
 while(i<lines.length){let line=lines[i].trim();if(!line){i++;continue}if(line.includes(':')&&pageKeys.has(line.split(':')[0].trim())){i++;continue}if(line.includes(':')){i++;continue}
  const name=line;i++;const r={name,rotate:false,x:0,y:0,w:0,h:0,origW:0,origH:0,offsetX:0,offsetY:0};
  while(i<lines.length){const raw=lines[i];const t=raw.trim();if(!t){i++;break}const m=t.match(/^([^:]+):\s*(.*)$/);if(!m)break;const k=m[1].trim(),v=m[2].trim();if(k==='rotate')r.rotate=v==='true'||v==='90';else if(k==='xy'){const a=v.split(',').map(Number);r.x=a[0]||0;r.y=a[1]||0}else if(k==='size'){const a=v.split(',').map(Number);r.w=a[0]||0;r.h=a[1]||0}else if(k==='orig'){const a=v.split(',').map(Number);r.origW=a[0]||r.w;r.origH=a[1]||r.h}else if(k==='offset'){const a=v.split(',').map(Number);r.offsetX=a[0]||0;r.offsetY=a[1]||0}i++}
  if(!r.origW)r.origW=r.w;if(!r.origH)r.origH=r.h;regions.set(name,r);regions.set(name.split('/').pop(),r)
 }
 return {page,regions}
}
async function prepareSkin(){state.atlasRegions=new Map();state.regionCanvases=new Map();state.attachmentImages=new Map();state.textureImage=null;state.textureReady=false;if(!state.project?.atlas?.text||!state.project?.atlas?.imageData)return;const parsed=parseAtlas(state.project.atlas.text);state.atlasRegions=parsed.regions;const img=new Image();if(/^https?:/i.test(state.project.atlas.imageData))img.crossOrigin='anonymous';await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=state.project.atlas.imageData});state.textureImage=img;state.textureReady=true}
function regionFor(name){if(!name)return null;return state.atlasRegions.get(name)||state.atlasRegions.get(String(name).split('/').pop())||null}
function getRegionCanvas(region){if(!region||!state.textureImage)return null;const key=region.name;if(state.regionCanvases.has(key))return state.regionCanvases.get(key);const img=state.textureImage,piece=document.createElement('canvas');piece.width=Math.max(1,region.w);piece.height=Math.max(1,region.h);const pc=piece.getContext('2d');if(region.rotate){const tmp=document.createElement('canvas');tmp.width=Math.max(1,region.h);tmp.height=Math.max(1,region.w);tmp.getContext('2d').drawImage(img,region.x,region.y,region.h,region.w,0,0,region.h,region.w);pc.save();pc.translate(0,region.h);pc.rotate(-Math.PI/2);pc.drawImage(tmp,0,0);pc.restore()}else pc.drawImage(img,region.x,region.y,region.w,region.h,0,0,region.w,region.h);const full=document.createElement('canvas');full.width=Math.max(1,region.origW);full.height=Math.max(1,region.origH);const fy=region.origH-region.offsetY-region.h;full.getContext('2d').drawImage(piece,region.offsetX,fy);state.regionCanvases.set(key,full);return full}
function lastFrame(frames,t){let out=null;for(const f of frames||[]){if((+f.time||0)<=t+1e-6)out=f;else break}return out}
function currentAttachmentName(slot,t){const forced=state.project?.skinEdits?.attachments?.[slot.name];if(forced!==undefined&&forced!==null&&forced!=='__AUTO__')return forced||null;let name=slot.attachment??null;const fr=lastFrame(state.project?.animations?.[state.project.activeAnimation]?.slots?.[slot.name]?.attachment,t);if(fr)name=fr.name??null;return name}
function slotAlpha(slot,t){let a=1;const c=slot.color;if(c&&c.length>=8)a=parseInt(c.slice(6,8),16)/255;const fr=lastFrame(state.project?.animations?.[state.project.activeAnimation]?.slots?.[slot.name]?.color,t);if(fr?.color?.length>=8)a*=parseInt(fr.color.slice(6,8),16)/255;return a}
function slotVisible(slot){return state.project?.skinEdits?.slotVisibility?.[slot.name]!==false}
function skinAttachment(slot,name){const skin=state.project?.skins?.[state.project.activeSkin]||state.project?.skins?.default||{};return skin?.[slot.name]?.[name]||null}
function computeDrawOrder(t){const slots=state.project?.slots||[];const frames=state.project?.animations?.[state.project.activeAnimation]?.drawOrder||state.project?.animations?.[state.project.activeAnimation]?.draworder||[];const f=lastFrame(frames,t);if(!f?.offsets?.length)return slots;const n=slots.length,draw=new Array(n),unchanged=new Array(n-f.offsets.length);let originalIndex=0,unchangedIndex=0;for(const off of f.offsets){const slotIndex=slots.findIndex(s=>s.name===off.slot);if(slotIndex<0)continue;while(originalIndex!==slotIndex)unchanged[unchangedIndex++]=slots[originalIndex++];draw[originalIndex+(off.offset||0)]=slots[originalIndex];originalIndex++}while(originalIndex<n)unchanged[unchangedIndex++]=slots[originalIndex++];for(let i=n-1;i>=0;i--)if(!draw[i])draw[i]=unchanged[--unchangedIndex];return draw}
function mulAttachment(bone,att){const r=rad(+att.rotation||0),sx=att.scaleX==null?1:+att.scaleX,sy=att.scaleY==null?1:+att.scaleY,la=Math.cos(r)*sx,lb=-Math.sin(r)*sy,lc=Math.sin(r)*sx,ld=Math.cos(r)*sy;return {a:bone.a*la+bone.b*lc,b:bone.a*lb+bone.b*ld,c:bone.c*la+bone.d*lc,d:bone.c*lb+bone.d*ld,wx:bone.a*(+att.x||0)+bone.b*(+att.y||0)+bone.wx,wy:bone.c*(+att.x||0)+bone.d*(+att.y||0)+bone.wy}}
function sourceImageFor(name){const key=String(name||'').split('/').pop().replace(/\.png$/i,''),src=state.project?.sourceImages?.[key];if(!src)return null;if(state.attachmentImages.has(key))return state.attachmentImages.get(key);const img=new Image();img.src=src;state.attachmentImages.set(key,img);return img}
function drawRegionAttachment(slot,att,name,bone,alpha){const direct=sourceImageFor(att.path||name),region=regionFor(att.path||name),im=direct?.complete&&direct.naturalWidth?direct:getRegionCanvas(region);if(!im)return;const m=mulAttachment(bone,att),[sx,sy]=toScreen(m.wx,m.wy),z=state.view.zoom,w=+att.width||im.naturalWidth||im.width||region?.origW||1,h=+att.height||im.naturalHeight||im.height||region?.origH||1;ctx.save();ctx.globalAlpha=alpha*state.skinOpacity;ctx.transform(z*m.a,-z*m.c,z*m.b,-z*m.d,sx,sy);ctx.drawImage(im,-w/2,-h/2,w,h);ctx.restore()}
function meshWorldVertices(att,poses,slotBone){const verts=att.vertices||[],uvs=att.uvs||[],out=[];if(verts.length===uvs.length){for(let i=0;i<verts.length;i+=2){const x=+verts[i]||0,y=+verts[i+1]||0;out.push(slotBone.a*x+slotBone.b*y+slotBone.wx,slotBone.c*x+slotBone.d*y+slotBone.wy)}return out}let v=0;for(let i=0;i<uvs.length/2;i++){const count=verts[v++]|0;let wx=0,wy=0;for(let j=0;j<count;j++){const bi=verts[v++]|0,x=+verts[v++]||0,y=+verts[v++]||0,w=+verts[v++]||0,b=poses[bi];if(b){wx+=(b.a*x+b.b*y+b.wx)*w;wy+=(b.c*x+b.d*y+b.wy)*w}}out.push(wx,wy)}return out}
function atlasUv(region,u,v){if(region.rotate)return [region.x+v*region.h,region.y+(1-u)*region.w];return [region.x+u*region.w,region.y+v*region.h]}
function drawTexturedTriangle(img,s0,s1,s2,d0,d1,d2,alpha){const [u0,v0]=s0,[u1,v1]=s1,[u2,v2]=s2,[x0,y0]=d0,[x1,y1]=d1,[x2,y2]=d2,den=u0*(v1-v2)+u1*(v2-v0)+u2*(v0-v1);if(Math.abs(den)<1e-6)return;const a=(x0*(v1-v2)+x1*(v2-v0)+x2*(v0-v1))/den,c=(x0*(u2-u1)+x1*(u0-u2)+x2*(u1-u0))/den,e=(x0*(u1*v2-u2*v1)+x1*(u2*v0-u0*v2)+x2*(u0*v1-u1*v0))/den,b=(y0*(v1-v2)+y1*(v2-v0)+y2*(v0-v1))/den,d=(y0*(u2-u1)+y1*(u0-u2)+y2*(u1-u0))/den,f=(y0*(u1*v2-u2*v1)+y1*(u2*v0-u0*v2)+y2*(u0*v1-u1*v0))/den;ctx.save();ctx.globalAlpha=alpha*state.skinOpacity;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.lineTo(x2,y2);ctx.closePath();ctx.clip();ctx.transform(a,b,c,d,e,f);ctx.drawImage(img,0,0);ctx.restore()}
function drawMeshAttachment(slot,att,name,bone,poseList,alpha){const direct=sourceImageFor(att.path||name),region=regionFor(att.path||name),img=direct?.complete&&direct.naturalWidth?direct:state.textureImage;if(!img||(!direct&&!region))return;const verts=meshWorldVertices(att,poseList,bone),uvs=att.uvs||[],tris=att.triangles||[];for(let i=0;i<tris.length;i+=3){const ia=tris[i],ib=tris[i+1],ic=tris[i+2],d0=toScreen(verts[ia*2],verts[ia*2+1]),d1=toScreen(verts[ib*2],verts[ib*2+1]),d2=toScreen(verts[ic*2],verts[ic*2+1]);const conv=(idx)=>direct?.complete&&direct.naturalWidth?[uvs[idx*2]*direct.naturalWidth,uvs[idx*2+1]*direct.naturalHeight]:atlasUv(region,uvs[idx*2],uvs[idx*2+1]);drawTexturedTriangle(img,conv(ia),conv(ib),conv(ic),d0,d1,d2,alpha)}}
function drawSkin(t){if(!state.showSkin||!state.textureReady||!state.project?.slots?.length)return;const pose=worldPose(t),byName=new Map(pose.map(x=>[x.name,x]));for(const slot of computeDrawOrder(t)){if(!slotVisible(slot))continue;const name=currentAttachmentName(slot,t);if(!name)continue;const att=skinAttachment(slot,name);if(!att)continue;const bone=byName.get(slot.bone);if(!bone)continue;const alpha=slotAlpha(slot,t);if((att.type||'region')==='region')drawRegionAttachment(slot,att,name,bone,alpha);else if(att.type==='mesh')drawMeshAttachment(slot,att,name,bone,pose,alpha)}}

function draw(){resizeCanvas();const r=canvas.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);ctx.fillStyle='#0c0f14';ctx.fillRect(0,0,r.width,r.height);drawGrid();if(state.project){drawSkin(state.currentTime);if(state.showRig){if(state.onion){const f=1/state.fps;drawPose(worldPose(Math.max(0,state.currentTime-f)),.18,true);drawPose(worldPose(Math.min(duration(),state.currentTime+f)),.18,true)}drawPose(worldPose(state.currentTime),1,false);if(state.reference?.pose)drawPose(state.reference.pose,.26,true)}}requestAnimationFrame(draw)}
function hitBone(sx,sy){if(!state.project)return null;let best=null,bd=14;for(const b of worldPose(state.currentTime)){const [x,y]=toScreen(b.wx,b.wy),d=Math.hypot(x-sx,y-sy);if(d<bd){best=b;bd=d}}return best}
function duration(){return state.project?.durations?.[state.project.activeAnimation]??measureDuration(state.project?.animations?.[state.project?.activeAnimation]||{})??0}
function fitView(){if(!state.project)return;const p=worldPose(state.currentTime);if(!p.length)return;let xs=[],ys=[];for(const b of p){xs.push(b.wx);ys.push(b.wy);const rr=rad(b.wr);xs.push(b.wx+Math.cos(rr)*b.length);ys.push(b.wy+Math.sin(rr)*b.length)}const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);const r=canvas.getBoundingClientRect();state.view.zoom=clamp(Math.min((r.width-120)/(maxx-minx||100),(r.height-120)/(maxy-miny||100)),.15,8);state.view.x=-(minx+maxx)/2*state.view.zoom;state.view.y=(miny+maxy)/2*state.view.zoom}

function renderAll(){renderLeft();renderInspector();renderTimeline();renderAnimSelect();renderMeta()}
function renderMeta(){if(!state.project){$('#footProject').textContent='未加载工程';$('#hud').textContent='选择案例或新建工程';return}const d=duration();$('#timeRange').max=d||1;$('#timeRange').value=state.currentTime;$('#timeLabel').textContent=`${state.currentTime.toFixed(3)} / ${d.toFixed(3)}`;$('#footProject').textContent=`${state.project.name} · ${state.project.bones.length} bones`;$('#hud').textContent=`${state.project.activeAnimation}  |  t ${state.currentTime.toFixed(3)}s  |  ${(state.currentTime*state.fps).toFixed(0)}f  |  zoom ${(state.view.zoom*100).toFixed(0)}%`;$('#playBtn').textContent=state.playing?'❚❚':'▶'}
function renderAnimSelect(){const s=$('#animSelect');if(!state.project){s.innerHTML='<option>无动画</option>';return}const names=Object.keys(state.project.animations);s.innerHTML=(names.length?names:['Setup Pose']).map(n=>`<option ${n===state.project.activeAnimation?'selected':''}>${esc(n)}</option>`).join('')}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function renderLeft(){const q=$('#leftSearch').value?.trim().toLowerCase()||'',pane=$('#leftPane');if(state.leftTab==='cases'){const list=state.manifest.filter(c=>((c.title||'')+' '+(c.character||'')+' '+(c.costume||'')+' '+(c.view||'')+' '+(c.animations||[]).join(' ')).toLowerCase().includes(q));pane.innerHTML=`<div class="section-title"><span>全量案例 ${list.length}${q?' / '+state.manifest.length:''}</span><span class="badge">85 角色 · Spine 3.5</span></div><div class="note">共 ${state.manifest.length} 个可打开工程。阿米娅 12 个内置工程本地读取，其余案例按需加载原始 .skel / .atlas / PNG；案例均只读，修改请另存。</div>`+list.map(c=>`<div class="case-card ${state.sourceCase?.id===c.id?'active':''}" data-case="${c.id}"><div class="case-title">${esc(c.title)}</div><div class="case-meta"><span class="badge">${c.bones} bones</span><span class="badge">${c.slots||0} slots</span><span class="badge">${c.remote?'按需加载':'内置'}</span><span class="badge">${esc(c.view)}</span></div></div>`).join('')+`<div class="drop" id="dropZone">拖入 Spine JSON / ZIP<br>导入为新工程</div>`;document.querySelectorAll('[data-case]').forEach(el=>el.onclick=()=>loadCase(state.manifest.find(c=>c.id===el.dataset.case)));setupDrop();return}
 if(state.leftTab==='bones'){if(!state.project){pane.innerHTML='<div class="empty">先加载一个工程</div>';return}const bones=state.project.bones,children=new Map();bones.forEach(b=>{if(!children.has(b.parent))children.set(b.parent,[]);children.get(b.parent).push(b)});let html='<div class="section-title"><span>骨骼层级</span><button id="addBoneSmall">＋</button></div>';function walk(parent,depth){for(const b of children.get(parent)||[]){if(!b.name.toLowerCase().includes(q)&&q){}else html+=`<div class="tree-row ${b.name===state.selectedBone?'active':''}" data-bone="${esc(b.name)}" style="padding-left:${depth*13}px"><span class="tw">${(children.get(b.name)||[]).length?'›':''}</span><span class="bone-dot"></span><span class="name">${esc(b.name)}</span>${b.locked?'🔒':''}${b.hidden?'◌':''}</div>`;walk(b.name,depth+1)}}walk(null,0);pane.innerHTML=html;$$('[data-bone]').forEach(el=>el.onclick=()=>{state.selectedBone=el.dataset.bone;renderLeft();renderInspector();renderTimeline()});$('#addBoneSmall').onclick=addBone;return}
 dbAll().then(items=>{pane.innerHTML='<div class="section-title"><span>本地工程</span><span>'+items.length+'</span></div>'+items.filter(x=>x.name.toLowerCase().includes(q)).map(p=>`<div class="case-card" data-project="${p.id}"><div class="case-title">${esc(p.name)}</div><div class="case-meta"><span class="badge">${p.bones?.length||0} bones</span><span>${new Date(p.updatedAt||p.createdAt).toLocaleString()}</span></div></div>`).join('')+'<div class="note">工程保存在当前浏览器 IndexedDB。使用“导出”可生成可迁移的工程 JSON。</div>';$$('[data-project]').forEach(el=>el.onclick=async()=>loadProject(await dbGet(el.dataset.project)))})}

function selected(){return state.project?.bones.find(b=>b.name===state.selectedBone)}
function renderInspector(){const p=$('#insPane');if(!state.project){p.innerHTML='<div class="empty">暂无工程</div>';return}if(state.insTab==='bone'){const b=selected();if(!b){p.innerHTML='<div class="empty">选择一根骨骼</div>';return}p.innerHTML=`<div class="section-title"><span>${esc(b.name)}</span><span class="badge">${esc(b.parent||'root')}</span></div>${numField('X','x',b.x)}${numField('Y','y',b.y)}${numField('旋转','rotation',b.rotation)}${numField('长度','length',b.length)}${numField('Scale X','scaleX',b.scaleX)}${numField('Scale Y','scaleY',b.scaleY)}<div class="field"><label>父骨骼</label><select id="parentField"><option value="">— root —</option>${state.project.bones.filter(x=>x.name!==b.name).map(x=>`<option ${b.parent===x.name?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div><div class="toolbar-row"><button id="keyBone">◆ 当前帧</button><button id="dupBone">复制</button><button id="lockBone">${b.locked?'解锁':'锁定'}</button><button id="hideBone">${b.hidden?'显示':'隐藏'}</button><button id="delBone" class="danger">删除</button></div><div class="section-title"><span>Setup / Pose</span></div><div class="toolbar-row"><button id="resetBone">重设此骨</button><button id="mirrorPose">镜像姿态</button></div>`;$$('[data-prop]').forEach(i=>i.onchange=()=>{pushHistory();b[i.dataset.prop]=+i.value||0;renderTimeline()});$('#parentField').onchange=e=>{pushHistory();b.parent=e.target.value||null};$('#keyBone').onclick=addCurrentKey;$('#dupBone').onclick=duplicateBone;$('#lockBone').onclick=()=>{b.locked=!b.locked;renderInspector();renderLeft()};$('#hideBone').onclick=()=>{b.hidden=!b.hidden;renderInspector();renderLeft()};$('#delBone').onclick=deleteBone;$('#resetBone').onclick=()=>{state.project.customKeys[state.project.activeAnimation]&&(state.project.customKeys[state.project.activeAnimation][b.name]=[]);renderAll()};$('#mirrorPose').onclick=mirrorPose;return}
 if(state.insTab==='clip'){const a=state.project.activeAnimation,d=duration(),anim=state.project.animations[a]||{};const keyed=Object.keys(anim.bones||{}).length;p.innerHTML=`<div class="section-title"><span>动画片段</span><span class="badge">${esc(a)}</span></div><div class="metric"><span>时长</span><span>${d.toFixed(3)} s</span></div><div class="metric"><span>帧数 @ ${state.fps}fps</span><span>${Math.ceil(d*state.fps)}</span></div><div class="metric"><span>动画骨骼</span><span>${keyed}</span></div><div class="metric"><span>IK 约束</span><span>${state.project.ik.length}</span></div><div class="metric"><span>Transform 约束</span><span>${state.project.transform.length}</span></div><div class="field"><label>循环</label><select id="loopField"><option value="1" ${state.loop?'selected':''}>是</option><option value="0" ${!state.loop?'selected':''}>否</option></select></div><div class="toolbar-row"><button id="snapshotBtn">姿态快照</button><button id="setRefBtn">设为参考</button></div><div class="section-title"><span>工程信息</span></div><div class="note">来源：${esc(state.project.source?.name||'自建工程')}<br>Spine：${esc(state.project.source?.spine||state.project.skeleton?.spine||'—')}<br>工作室使用非破坏式覆盖关键帧，不改写原始案例文件。</div>`;$('#loopField').onchange=e=>state.loop=e.target.value==='1';$('#snapshotBtn').onclick=makeSnapshot;$('#setRefBtn').onclick=()=>{state.reference={pose:deep(worldPose(state.currentTime)),name:a+' @ '+state.currentTime.toFixed(3)};renderInspector()};return}
 if(state.insTab==='skin'){const skins=Object.keys(state.project.skins||{}),slots=state.project.slots||[],skin=state.project.skins?.[state.project.activeSkin]||state.project.skins?.default||{},meshCount=Object.values(skin).reduce((n,a)=>n+Object.values(a||{}).filter(x=>x.type==='mesh').length,0),regionCount=Object.values(skin).reduce((n,a)=>n+Object.values(a||{}).filter(x=>(x.type||'region')==='region').length,0),sel=slots.find(s=>s.name===state.selectedSlot)||slots[0],atts=sel?Object.keys(skin?.[sel.name]||{}):[],forced=sel?state.project.skinEdits.attachments?.[sel.name]:undefined;p.innerHTML=`<div class="section-title"><span>皮肤 / 附件</span><span class="badge">${state.textureReady?'贴图已加载':'无贴图'}</span></div><div class="field"><label>Skin</label><select id="skinSelect">${skins.map(x=>`<option ${x===state.project.activeSkin?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>透明度</label><input id="skinOpacityField" type="range" min="0" max="1" step="0.05" value="${state.skinOpacity}"></div><div class="metric"><span>Slots</span><span>${slots.length}</span></div><div class="metric"><span>Region</span><span>${regionCount}</span></div><div class="metric"><span>Mesh</span><span>${meshCount}</span></div><div class="toolbar-row"><button id="showAllSlots">全部显示</button><button id="hideAllSlots">全部隐藏</button></div>${sel?`<div class="section-title"><span>选中 Slot</span><span class="badge">${esc(sel.name)}</span></div><div class="field"><label>附件</label><select id="attachmentField"><option value="__AUTO__" ${forced==null||forced==='__AUTO__'?'selected':''}>跟随动画</option><option value="" ${forced===''?'selected':''}>隐藏</option>${atts.map(x=>`<option value="${esc(x)}" ${forced===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>`:''}<div class="section-title"><span>Slot 列表</span></div><div class="slot-list">${slots.map(s=>`<div class="slot-row ${s.name===state.selectedSlot?'active':''}" data-slot="${esc(s.name)}"><button data-slot-vis="${esc(s.name)}">${slotVisible(s)?'●':'○'}</button><span>${esc(s.name)}</span><small>${esc(s.bone||'')}</small></div>`).join('')}</div>`;if($('#skinSelect'))$('#skinSelect').onchange=e=>{pushHistory();state.project.activeSkin=e.target.value;renderInspector()};$('#skinOpacityField').oninput=e=>state.skinOpacity=+e.target.value;$('#showAllSlots').onclick=()=>{pushHistory();state.project.skinEdits.slotVisibility={};renderInspector()};$('#hideAllSlots').onclick=()=>{pushHistory();for(const s of slots)state.project.skinEdits.slotVisibility[s.name]=false;renderInspector()};$$('[data-slot]').forEach(r=>r.onclick=e=>{if(e.target.matches('[data-slot-vis]'))return;state.selectedSlot=r.dataset.slot;renderInspector()});$$('[data-slot-vis]').forEach(b=>b.onclick=e=>{e.stopPropagation();pushHistory();const n=b.dataset.slotVis;state.project.skinEdits.slotVisibility[n]=state.project.skinEdits.slotVisibility[n]===false?true:false;renderInspector()});if($('#attachmentField'))$('#attachmentField').onchange=e=>{pushHistory();state.project.skinEdits.attachments[sel.name]=e.target.value;renderInspector()};return}
 const score=state.reference?poseScore():null;p.innerHTML=`<div class="section-title"><span>训练模式</span><span class="badge">Pose Match</span></div>${state.reference?`<div class="score">${score}%</div><div class="note">参考：${esc(state.reference.name)}<br>基于同名骨骼的关节位置与旋转误差评分。</div><div class="toolbar-row"><button id="clearRef">清除参考</button><button id="saveTrain">记录本次</button></div>`:`<div class="note">在“动画”页把任意时刻设为参考姿态，然后修改/创建姿态并实时比较。</div>`}<div class="section-title"><span>训练工具</span></div><div class="toolbar-row"><button id="randomTime">随机参考帧</button><button id="hideNamesTrain">隐藏骨名</button><button id="toggleOnionTrain">洋葱皮</button></div>`;if($('#clearRef'))$('#clearRef').onclick=()=>{state.reference=null;renderInspector()};if($('#randomTime'))$('#randomTime').onclick=()=>{state.currentTime=Math.random()*duration();state.reference={pose:deep(worldPose(state.currentTime)),name:state.project.activeAnimation+' 随机帧'};renderMeta();renderInspector()};if($('#hideNamesTrain'))$('#hideNamesTrain').onclick=()=>state.showNames=false;if($('#toggleOnionTrain'))$('#toggleOnionTrain').onclick=()=>state.onion=!state.onion}
function numField(label,prop,val){return `<div class="field"><label>${label}</label><input data-prop="${prop}" type="number" step="0.1" value="${(+val||0).toFixed(3)}"></div>`}

function renderTimeline(){const box=$('#tracks');if(!state.project){box.innerHTML='';return}const anim=state.project.animations[state.project.activeAnimation],d=duration()||1,bones=state.project.bones.filter(b=>anim?.bones?.[b.name]||state.project.customKeys?.[state.project.activeAnimation]?.[b.name]);let html='';for(const b of bones.slice(0,100)){const times=new Set();for(const arr of Object.values(anim?.bones?.[b.name]||{}))if(Array.isArray(arr))arr.forEach(k=>times.add(+k.time||0));(state.project.customKeys?.[state.project.activeAnimation]?.[b.name]||[]).forEach(k=>times.add(k.time));html+=`<div class="track"><div class="track-label">${esc(b.name)}</div><div class="track-lane" data-lane="${esc(b.name)}">${[...times].sort((a,z)=>a-z).map(t=>`<i class="kf" style="left:${clamp(t/d*100,0,100)}%" title="${t.toFixed(3)}"></i>`).join('')}<i class="playhead" style="left:${clamp(state.currentTime/d*100,0,100)}%"></i></div></div>`}box.innerHTML=html||'<div class="empty">当前片段没有骨骼关键帧</div>';$$('[data-lane]').forEach(l=>l.onclick=e=>{const r=l.getBoundingClientRect();state.currentTime=clamp((e.clientX-r.left)/r.width*d,0,d);state.selectedBone=l.dataset.lane;renderMeta();renderTimeline();renderInspector()});renderMeta()}

function addBone(){if(!state.project)return;pushHistory();let base='bone',i=1;while(state.project.bones.some(b=>b.name===base+i))i++;const parent=state.selectedBone||null;state.project.bones.push({name:base+i,parent,length:40,x:0,y:0,rotation:0,scaleX:1,scaleY:1,shearX:0,shearY:0,transform:'normal',hidden:false,locked:false});state.selectedBone=base+i;renderAll()}
function duplicateBone(){const b=selected();if(!b)return;pushHistory();let n=b.name+'_copy',i=2;while(state.project.bones.some(x=>x.name===n))n=b.name+'_copy'+i++;state.project.bones.push({...deep(b),name:n,parent:b.parent});state.selectedBone=n;renderAll()}
function deleteBone(){const b=selected();if(!b)return;pushHistory();state.project.bones=state.project.bones.filter(x=>x.name!==b.name);state.project.bones.forEach(x=>{if(x.parent===b.name)x.parent=b.parent});state.selectedBone=b.parent||state.project.bones[0]?.name||null;renderAll()}
function addCurrentKey(){const b=selected();if(!b)return;pushHistory();const a=state.project.activeAnimation;state.project.customKeys[a]??={};state.project.customKeys[a][b.name]??=[];const arr=state.project.customKeys[a][b.name],pose={x:b.x,y:b.y,rotation:b.rotation,scaleX:b.scaleX,scaleY:b.scaleY,length:b.length};const old=arr.find(k=>Math.abs(k.time-state.currentTime)<1e-4);if(old)old.pose=pose;else arr.push({time:state.currentTime,pose});arr.sort((x,y)=>x.time-y.time);renderTimeline()}
function mirrorPose(){if(!state.project)return;pushHistory();for(const b of state.project.bones){b.x=-b.x;b.rotation=180-b.rotation;if(/^L_|_L_|Left/i.test(b.name)){const pair=b.name.replace(/L_/i,'R_').replace(/Left/i,'Right'),other=state.project.bones.find(x=>x.name===pair);if(other){const tmp={...b};Object.assign(b,{x:-other.x,y:other.y,rotation:180-other.rotation});Object.assign(other,{x:-tmp.x,y:tmp.y,rotation:180-tmp.rotation})}}}renderAll()}
function makeSnapshot(){state.snapshots.push({id:uid(),name:state.project.activeAnimation+' '+state.currentTime.toFixed(3),pose:deep(worldPose(state.currentTime)),time:state.currentTime});state.reference=state.snapshots.at(-1);renderInspector()}
function poseScore(){if(!state.reference)return 0;const cur=worldPose(state.currentTime),ref=new Map(state.reference.pose.map(b=>[b.name,b]));let sum=0,n=0;for(const b of cur){const r=ref.get(b.name);if(!r)continue;const dist=Math.hypot(b.wx-r.wx,b.wy-r.wy);let ad=Math.abs(((b.wr-r.wr+180)%360)-180);sum+=Math.exp(-dist/55)*.7+Math.exp(-ad/35)*.3;n++}return n?Math.round(sum/n*100):0}

function blankHumanoid(){const b=(name,parent,x,y,len,rot=0)=>({name,parent,x,y,length:len,rotation:rot,scaleX:1,scaleY:1,shearX:0,shearY:0,transform:'normal'});return normalizeProject({name:'Humanoid 新工程',bones:[b('root',null,0,0,0),b('pelvis','root',0,90,35,90),b('spine','pelvis',35,0,50,15),b('chest','spine',50,0,45,-15),b('neck','chest',42,0,18,0),b('head','neck',18,0,28,0),b('upper_arm_L','chest',35,20,45,145),b('forearm_L','upper_arm_L',45,0,42,10),b('hand_L','forearm_L',42,0,18,0),b('upper_arm_R','chest',35,-20,45,-145),b('forearm_R','upper_arm_R',45,0,42,-10),b('hand_R','forearm_R',42,0,18,0),b('thigh_L','pelvis',8,12,62,-95),b('shin_L','thigh_L',62,0,58,-2),b('foot_L','shin_L',58,0,25,82),b('thigh_R','pelvis',8,-12,62,-85),b('shin_R','thigh_R',62,0,58,2),b('foot_R','shin_R',58,0,25,88)],animations:{Pose:{bones:{}}},durations:{Pose:1}},'Humanoid 新工程')}
function newProjectModal(){$('#modal').innerHTML=`<h2>新建骨骼工程</h2><div class="two"><div class="case-card" id="humanoidPreset"><div class="case-title">Humanoid 2D</div><div class="case-meta">标准躯干 / 四肢层级，可立即改造</div></div><div class="case-card" id="emptyPreset"><div class="case-title">空白工程</div><div class="case-meta">只有 root，从零创建</div></div></div><div class="actions"><button data-close>取消</button></div>`;showModal();$('#humanoidPreset').onclick=()=>{loadProject(blankHumanoid());hideModal()};$('#emptyPreset').onclick=()=>{loadProject(normalizeProject({name:'空白工程',bones:[{name:'root',parent:null,x:0,y:0,length:50,rotation:0,scaleX:1,scaleY:1}],animations:{Pose:{bones:{}}},durations:{Pose:1}},'空白工程'));hideModal()};wireClose()}
function showHelp(){$('#modal').innerHTML=`<h2>Rig Motion Lab · Spine 3.5</h2><div class="note"><b>这个版本按你的原始动作文件运行，不再使用近似播放器。</b><br><br>“默认 / 报童 / 见习联结者 / 播种者”是 4 套独立工程，每套再分战斗正面、战斗背面、基建；JSON 内部 Skin 实际为 default。<br><br><b>战斗动作组</b><br>• Attack_Begin → Attack → Attack_End<br>• Skill_Begin → Skill → 可选 Skill_Loop_2 → Skill_End<br>• Skill_2_Begin → Skill_2 → Skill_2_End<br><br><b>Runtime 求值</b><br>Spine 3.5 Runtime 会执行 bone / slot / IK / transform / path / deform / drawOrder / event，因此画面以原文件真实约束结果为准。<br><br><b>操作</b><br>• Space 播放/暂停；←/→ 逐帧；F 适配视图。<br>• 动作下拉可选“动作组”或“原始 Spine 片段”。<br>• 骨骼 Inspector 的“当前动作姿态”可把 x/y/rotation/scale 直接写回当前原始片段的关键帧。<br>• Slot/Attachment 在“皮肤”页检查和临时覆盖。<br><br><b>仍在继续补的专业编辑器</b><br>Constraint 可视控制器、Deform 顶点编辑、Mesh 权重、Dope Sheet / Graph Editor、Event 编辑与完整 Spine 回写验证。</div><div class="actions"><button data-close class="primary">知道了</button></div>`;showModal();wireClose()}
function showModal(){$('#modalWrap').classList.add('show')}function hideModal(){$('#modalWrap').classList.remove('show')}function wireClose(){$$('[data-close]').forEach(b=>b.onclick=hideModal)}

let jszipPromise=null;function ensureJSZip(){if(window.JSZip)return Promise.resolve(window.JSZip);if(jszipPromise)return jszipPromise;jszipPromise=new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';sc.onload=()=>resolve(window.JSZip);sc.onerror=()=>reject(new Error('ZIP 模块加载失败，请检查网络后重试'));document.head.appendChild(sc)});return jszipPromise}
async function zipEntryForJson(z,jsonName,data){const dir=jsonName.includes('/')?jsonName.slice(0,jsonName.lastIndexOf('/')+1):'',base=jsonName.split('/').pop().replace(/\.json$/i,''),atlasEntry=z.file(dir+base+'.atlas')||Object.values(z.files).find(e=>!e.dir&&e.name.startsWith(dir)&&e.name.toLowerCase().endsWith('.atlas'));if(!atlasEntry)return {name:jsonName,data};const atlasText=await atlasEntry.async('text'),page=parseAtlas(atlasText).page,imgEntry=page?z.file(dir+page):null;if(!imgEntry)return {name:jsonName,data:{...data,atlas:{text:atlasText,imageName:page||'',imageData:null}}};const b64=await imgEntry.async('base64');return {name:jsonName,data:{...data,atlas:{text:atlasText,imageName:page,imageData:'data:image/png;base64,'+b64}}}}
async function importFiles(files){const arr=[...files];if(!arr.length)return;const zipFile=arr.find(f=>f.name.toLowerCase().endsWith('.zip'));if(zipFile){let Zip;try{Zip=await ensureJSZip()}catch(e){alert(e.message);return}const z=await Zip.loadAsync(zipFile),entries=[];for(const [name,e] of Object.entries(z.files)){if(!e.dir&&name.toLowerCase().endsWith('.json')){try{const txt=await e.async('text'),d=JSON.parse(txt);if(d.bones&&d.animations)entries.push(await zipEntryForJson(z,name,d))}catch(err){console.warn(name,err)}}}if(!entries.length){alert('ZIP 中没有识别到 Spine JSON');return}if(entries.length===1)await loadProject(normalizeProject(entries[0].data,entries[0].name));else chooseZip(entries);return}
 const jf=arr.find(f=>f.name.toLowerCase().endsWith('.json'));if(jf){try{let d=JSON.parse(await jf.text());const af=arr.find(f=>f.name.toLowerCase().endsWith('.atlas'));if(af){const at=await af.text(),page=parseAtlas(at).page,pf=arr.find(f=>f.name===page||f.name.toLowerCase().endsWith('.png'));if(pf){const dataURL=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(pf)});d={...d,atlas:{text:at,imageName:page||pf.name,imageData:dataURL}}}}await loadProject(normalizeProject(d,d.name||jf.name))}catch(e){alert('JSON 解析失败：'+e.message)}return}}
function chooseZip(entries){$('#modal').innerHTML=`<h2>ZIP 中发现 ${entries.length} 个骨骼工程</h2><div>${entries.map((e,i)=>`<div class="case-card" data-z="${i}"><div class="case-title">${esc(e.name)}</div><div class="case-meta"><span class="badge">${e.data.bones?.length||0} bones</span><span class="badge">${e.data.slots?.length||0} slots</span><span class="badge">${e.data.atlas?.imageData?'含皮肤':'仅骨骼'}</span></div></div>`).join('')}</div><div class="actions"><button data-close>取消</button></div>`;showModal();$$('[data-z]').forEach(x=>x.onclick=async()=>{await loadProject(normalizeProject(entries[+x.dataset.z].data,entries[+x.dataset.z].name));hideModal()});wireClose()}
async function saveProject(){
 if(!state.project)return;
 if(state.sourceCase){saveAsProject();return}
 state.project.updatedAt=Date.now();await dbPut(deep(state.project));
 $('#saveState').textContent='已保存 '+new Date().toLocaleTimeString();
 if(state.leftTab==='projects')renderLeft()
}
function saveAsProject(){
 if(!state.project)return;
 const sourceCase=state.sourceCase,base=sourceCase?.title||state.project.name||'骨骼工程';
 $('#modal').innerHTML=`<h2>另存为工程</h2><div class="note">${sourceCase?'仓库案例是只读模板，不能覆盖保存。你的修改会复制为独立工程，原案例保持不变。':'保存一个新的工程副本。'}</div><div class="field"><label>工程名</label><input id="saveAsName" value="${esc(sourceCase?base+' · 修改版':base+' · 副本')}"></div><div class="actions"><button data-close>取消</button><button id="confirmSaveAs" class="primary">另存</button></div>`;
 showModal();wireClose();
 $('#saveAsName').select();
 $('#confirmSaveAs').onclick=async()=>{
  const name=$('#saveAsName').value.trim()||base;
  const copy=deep(state.project),now=Date.now();
  copy.id=uid();copy.name=name;copy.createdAt=now;copy.updatedAt=now;
  copy.source={...(copy.source||{}),derivedFromCase:sourceCase?.id||copy.source?.derivedFromCase||null};
  state.project=copy;state.sourceCase=null;
  await dbPut(deep(copy));hideModal();renderAll();
  $('#saveState').textContent='已另存 '+new Date().toLocaleTimeString()
 }
}
function exportProject(){if(!state.project)return;const blob=new Blob([JSON.stringify(state.project,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(state.project.name||'rig-project').replace(/[\\/:*?"<>|]+/g,'_')+'.rig.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

function screenToSkeleton(sx,sy){
 if(!spineRT.ready||!spineRT.display||!window.PIXI)return null;
 return spineRT.display.toLocal(new PIXI.Point(sx,sy))
}
function skeletonToParentLocal(bone,pt){
 const p=bone?.parent;if(!p)return {x:pt.x,y:pt.y};
 const a=p.m00??p.a??1,b=p.m01??p.b??0,c=p.m10??p.c??0,d=p.m11??p.d??1;
 const dx=pt.x-(p.worldX??0),dy=pt.y-(p.worldY??0),det=a*d-b*c;
 if(Math.abs(det)<1e-8)return {x:bone.x,y:bone.y};
 return {x:(dx*d-dy*b)/det,y:(dy*a-dx*c)/det}
}
async function commitRuntimeBoneDrag(drag){
 if(!drag||!state.project)return;
 const setup=state.project.bones.find(b=>b.name===drag.name),pose=runtimeLocalPose(drag.name),seg=segmentAtTime();
 if(!setup||!pose||!seg.name)return;
 const anim=state.project.animations[seg.name];anim.bones??={};anim.bones[setup.name]??={};const bt=anim.bones[setup.name],t=seg.localTime;
 if(drag.mode==='rotate'){
  bt.rotate??=[];upsertFrame(bt.rotate,t,{angle:pose.rotation-(+setup.rotation||0)})
 }else{
  bt.translate??=[];upsertFrame(bt.translate,t,{x:pose.x-(+setup.x||0),y:pose.y-(+setup.y||0)})
 }
 state.project.durations[seg.name]=measureDuration(anim);
 await buildSpineRuntime();syncRuntimePose();renderTimeline();renderInspector();renderMeta()
}
canvas.addEventListener('wheel',e=>{e.preventDefault();const before=toWorld(e.offsetX,e.offsetY),factor=Math.exp(-e.deltaY*.001);state.view.zoom=clamp(state.view.zoom*factor,.05,20);const after=toWorld(e.offsetX,e.offsetY);state.view.x+=(after[0]-before[0])*state.view.zoom;state.view.y-=(after[1]-before[1])*state.view.zoom},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
 canvas.setPointerCapture(e.pointerId);
 if(e.button===1||e.altKey){state.drag={type:'pan',x:e.clientX,y:e.clientY,vx:state.view.x,vy:state.view.y};canvas.style.cursor='grabbing';return}
 const hit=hitBone(e.offsetX,e.offsetY);
 if(!hit){state.drag={type:'pan',x:e.clientX,y:e.clientY,vx:state.view.x,vy:state.view.y};canvas.style.cursor='grabbing';return}
 state.selectedBone=hit.name;state.playing=false;renderLeft();renderInspector();renderTimeline();renderMeta();
 const setup=selected(),rb=runtimeBone(hit.name);
 if(!setup||setup.locked||!spineRT.ready||!rb)return;
 syncRuntimePose();
 const live=runtimeBone(hit.name),screen=runtimePoseScreen().find(x=>x.name===hit.name),pose=runtimeLocalPose(hit.name);
 if(!live||!screen||!pose)return;
 pushHistory();
 try{spineRT.display.state?.clearTracks?.()}catch{}
 spineRT.currentClip=null;spineRT.entry=null;
 state.drag={
  type:'runtime-bone',mode:e.shiftKey?'rotate':'move',name:hit.name,
  startPose:pose,originScreen:{x:screen.x,y:screen.y},
  startPointer:{x:e.offsetX,y:e.offsetY},
  startAngle:Math.atan2(e.offsetY-screen.y,e.offsetX-screen.x)
 };
 canvas.style.cursor=e.shiftKey?'alias':'grabbing'
});
canvas.addEventListener('pointermove',e=>{
 if(!state.drag)return;
 if(state.drag.type==='pan'){
  state.view.x=state.drag.vx+e.clientX-state.drag.x;state.view.y=state.drag.vy+e.clientY-state.drag.y;return
 }
 if(state.drag.type!=='runtime-bone')return;
 const rb=runtimeBone(state.drag.name);if(!rb)return;
 if(state.drag.mode==='rotate'){
  const a=Math.atan2(e.offsetY-state.drag.originScreen.y,e.offsetX-state.drag.originScreen.x);
  let delta=deg(a-state.drag.startAngle);while(delta>180)delta-=360;while(delta<-180)delta+=360;
  rb.rotation=state.drag.startPose.rotation+delta
 }else{
  const pt=screenToSkeleton(e.offsetX,e.offsetY);if(!pt)return;
  const local=skeletonToParentLocal(rb,pt);rb.x=local.x;rb.y=local.y
 }
 try{spineRT.display.update(0)}catch{try{spineRT.display.skeleton.updateWorldTransform()}catch{}}
 applyRuntimeSlotEdits();syncRuntimeViewport();renderInspector()
});
async function finishPointer(){
 const d=state.drag;state.drag=null;canvas.style.cursor='crosshair';
 if(d?.type==='runtime-bone')await commitRuntimeBoneDrag(d)
}
canvas.addEventListener('pointerup',finishPointer);
canvas.addEventListener('pointercancel',finishPointer);

function setupDrop(){const z=$('#dropZone');if(!z)return;['dragenter','dragover'].forEach(n=>z.addEventListener(n,e=>{e.preventDefault();z.classList.add('drag')}));['dragleave','drop'].forEach(n=>z.addEventListener(n,e=>{e.preventDefault();z.classList.remove('drag')}));z.addEventListener('drop',e=>importFiles(e.dataTransfer.files))}



/* ================================================================
   Spine 3.5 authoritative playback layer
   The uploaded Amiya files are Spine 3.5.51. Playback below uses a
   matching pixi-spine 1.3.x runtime instead of the former approximate
   Canvas evaluator, so IK / transform / path / deform / drawOrder /
   attachment / color timelines are evaluated by the Spine runtime.
   ================================================================ */
const spineRT={host:null,renderer:null,stage:null,display:null,skeletonData:null,atlas:null,baseTexture:null,ready:false,error:null,currentClip:null,entry:null,token:0,libPromise:null};
state.activeMotion=null;

function loadExternalScript(url,id){return new Promise((resolve,reject)=>{if(id&&document.getElementById(id)){const el=document.getElementById(id);if(el.dataset.loaded==='1')return resolve();el.addEventListener('load',()=>resolve(),{once:true});el.addEventListener('error',()=>reject(new Error('加载失败 '+url)),{once:true});return}const sc=document.createElement('script');if(id)sc.id=id;sc.src=url;sc.async=true;sc.onload=()=>{sc.dataset.loaded='1';resolve()};sc.onerror=()=>reject(new Error('加载失败 '+url));document.head.appendChild(sc)})}
async function loadOneOf(urls,id){let err;for(const u of urls){try{await loadExternalScript(u,id);return}catch(e){err=e;document.getElementById(id)?.remove()}}throw err||new Error('依赖加载失败')}
async function ensureSpine35Libs(){if(window.PIXI?.spine?.Spine)return;if(spineRT.libPromise)return spineRT.libPromise;spineRT.libPromise=(async()=>{if(!window.PIXI)await loadOneOf(['https://unpkg.com/pixi.js@4.8.9/dist/pixi.min.js','https://cdn.jsdelivr.net/npm/pixi.js@4.8.9/dist/pixi.min.js'],'pixi-v4-runtime');if(!window.PIXI?.spine?.Spine)await loadOneOf(['https://unpkg.com/pixi-spine@1.3.8/bin/pixi-spine.js','https://cdn.jsdelivr.net/npm/pixi-spine@1.3.8/bin/pixi-spine.js'],'pixi-spine-35-runtime');if(!window.PIXI?.spine?.Spine)throw new Error('Spine 3.5 runtime 未初始化')})();try{await spineRT.libPromise}catch(e){spineRT.libPromise=null;throw e}}
function ensureSpineHost(){if(spineRT.host)return;const center=document.querySelector('.center');const host=document.createElement('div');host.id='spineHost';center.insertBefore(host,canvas);spineRT.host=host}
function runtimeRawSkeleton(){if(!state.project)return null;return {skeleton:state.project.skeleton||{},bones:deep(state.project.bones||[]),slots:deep(state.project.slots||[]),skins:deep(state.project.skins||{}),ik:deep(state.project.ik||[]),transform:deep(state.project.transform||[]),path:deep(state.project.path||[]),events:deep(state.project.events||{}),animations:deep(state.project.animations||{})}}
function runtimeClasses(){
 const P=window.PIXI?.spine||{},SR=P.SpineRuntime||{},core=P.core||{};
 return {
  P,SR,
  Atlas:P.Atlas||SR.Atlas||core.TextureAtlas||core.Atlas,
  Attachment:P.AtlasAttachmentParser||P.AtlasAttachmentLoader||SR.AtlasAttachmentLoader||core.AtlasAttachmentLoader||core.AtlasAttachmentParser,
  Parser:P.SkeletonJsonParser||P.SkeletonJson||SR.SkeletonJson||core.SkeletonJson||core.SkeletonJsonParser
 };
}
async function buildSpineRuntime(){const token=++spineRT.token;spineRT.ready=false;spineRT.error=null;spineRT.currentClip=null;spineRT.entry=null;if(!state.project?.atlas?.text||!state.project?.atlas?.imageData){spineRT.error='当前工程缺少 .atlas 或 atlas PNG';return}try{await ensureSpine35Libs();if(token!==spineRT.token)return;ensureSpineHost();const PIXI=window.PIXI;if(!spineRT.renderer){spineRT.renderer=PIXI.autoDetectRenderer(16,16,{transparent:true,antialias:true,resolution:window.devicePixelRatio||1,autoResize:true});spineRT.host.appendChild(spineRT.renderer.view);spineRT.stage=new PIXI.Container()}if(spineRT.display){spineRT.stage.removeChild(spineRT.display);try{spineRT.display.destroy({children:true})}catch{}}try{spineRT.baseTexture?.destroy?.(true)}catch{}const {P,SR,Atlas,Attachment,Parser}=runtimeClasses();if(!Atlas||!Attachment||!Parser)throw new Error('Spine 3.5 parser API 不完整');const imageData=state.project.atlas.imageData;const bt=PIXI.BaseTexture.fromImage(imageData);spineRT.baseTexture=bt;const atlas=new Atlas(state.project.atlas.text,(line,cb)=>cb(bt));spineRT.atlas=atlas;let attachmentLoader;try{attachmentLoader=new Attachment(atlas)}catch(e){attachmentLoader=Attachment(atlas)}const parser=new Parser(attachmentLoader);const skelData=parser.readSkeletonData(runtimeRawSkeleton());spineRT.skeletonData=skelData;const display=new P.Spine(skelData);display.autoUpdate=false;display.alpha=state.skinOpacity;spineRT.display=display;spineRT.stage.addChild(display);spineRT.ready=true;syncRuntimeViewport();syncRuntimePose();requestAnimationFrame(()=>{if(token===spineRT.token&&spineRT.ready){fitView();renderAll()}})}catch(e){console.error('Spine runtime build failed',e);spineRT.error=String(e?.message||e);spineRT.ready=false}}

// Old name kept because loaders already call prepareSkin(). It now prepares the real Spine runtime.
async function prepareSkin(){
 state.atlasRegions=new Map();state.regionCanvases=new Map();state.attachmentImages=new Map();state.textureImage=null;state.textureReady=false;
 if(state.project?.atlas?.text&&state.project?.atlas?.imageData){
  try{
   const parsed=parseAtlas(state.project.atlas.text);state.atlasRegions=parsed.regions;
   const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=state.project.atlas.imageData});
   state.textureImage=img;state.textureReady=true;
   fitView();renderAll();
  }catch(e){console.warn('Canvas skin fallback prepare failed',e)}
 }
 await buildSpineRuntime();
 if(spineRT.ready)state.textureReady=true;
}

function isCombatProject(){const A=state.project?.animations||{};return !!(A.Attack||A.Skill||A.Idle)}
function motionDefs(){const A=state.project?.animations||{},has=n=>!!A[n],defs=[];if(isCombatProject()){
 if(has('Default'))defs.push({id:'action:Default',label:'默认姿态 Default',segments:['Default'],kind:'action'});
 if(has('Start'))defs.push({id:'action:Start',label:'入场 Start',segments:['Start'],kind:'action'});
 if(has('Idle'))defs.push({id:'action:Idle',label:'待机 Idle',segments:['Idle'],kind:'action'});
 if(has('Attack'))defs.push({id:'action:Attack',label:'攻击 Attack · Begin → Main → End',segments:['Attack_Begin','Attack','Attack_End'].filter(has),kind:'action'});
 if(has('Skill'))defs.push({id:'action:Skill',label:'技能 Skill · Begin → Main'+(has('Skill_Loop_2')?' → Loop_2':'')+' → End',segments:['Skill_Begin','Skill','Skill_Loop_2','Skill_End'].filter(has),kind:'action'});
 if(has('Skill_2'))defs.push({id:'action:Skill_2',label:'技能 2 · Begin → Main → End',segments:['Skill_2_Begin','Skill_2','Skill_2_End'].filter(has),kind:'action'});
 if(has('Die'))defs.push({id:'action:Die',label:'死亡 Die',segments:['Die'],kind:'action'});
 if(has('Stun'))defs.push({id:'action:Stun',label:'眩晕 Stun',segments:['Stun'],kind:'action'});
 }else{for(const n of Object.keys(A))defs.push({id:'action:'+n,label:n,segments:[n],kind:'action'})}
 const covered=new Set(defs.flatMap(x=>x.segments));for(const n of Object.keys(A))defs.push({id:'clip:'+n,label:n,segments:[n],kind:'clip',covered:covered.has(n)});return defs}
function ensureMotionSelection(){const defs=motionDefs();if(!defs.length){state.activeMotion=null;return}if(!defs.some(x=>x.id===state.activeMotion))state.activeMotion=(defs.find(x=>x.id==='action:Idle')||defs.find(x=>x.id==='action:Default')||defs[0]).id}
function activeMotionDef(){ensureMotionSelection();return motionDefs().find(x=>x.id===state.activeMotion)||motionDefs()[0]||{id:'none',label:'无动画',segments:[]}}
function segmentList(){const d=activeMotionDef();let offset=0;return d.segments.map(name=>{const dur=state.project?.durations?.[name]??measureDuration(state.project?.animations?.[name]||{});const x={name,duration:dur,offset,end:offset+dur};offset+=dur;return x})}
function motionDuration(){const s=segmentList();return s.length?s[s.length-1].end:0}
function segmentAtTime(t=state.currentTime){const segs=segmentList();if(!segs.length)return {name:null,localTime:0,offset:0,duration:0,index:-1};const total=motionDuration();let tt=clamp(+t||0,0,total);for(let i=0;i<segs.length;i++){const s=segs[i];if(tt<s.end-1e-7||i===segs.length-1)return {...s,index:i,localTime:clamp(tt-s.offset,0,s.duration)}}return {...segs.at(-1),index:segs.length-1,localTime:segs.at(-1).duration}}
function duration(){return motionDuration()}
function currentRawClip(){const s=segmentAtTime();if(s.name)state.project.activeAnimation=s.name;return s}

function syncRuntimeViewport(){if(!spineRT.renderer||!spineRT.display)return;const r=canvas.getBoundingClientRect();const w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));if(spineRT.renderer.width!==(w*(window.devicePixelRatio||1))||spineRT.renderer.height!==(h*(window.devicePixelRatio||1)))spineRT.renderer.resize(w,h);spineRT.display.position.set(w/2+state.view.x,h/2+state.view.y);spineRT.display.scale.set(state.view.zoom);spineRT.display.alpha=state.skinOpacity;spineRT.host.style.display=state.showSkin?'block':'none'}
function resetRuntimePlayback(){
 const sp=spineRT.display;if(!sp)return;
 try{sp.state?.clearTracks?.()}catch{}
 spineRT.currentClip=null;spineRT.entry=null;
 try{sp.skeleton?.setToSetupPose?.()}catch{}
 try{sp.skeleton?.updateWorldTransform?.()}catch{}
 for(const c of sp.slotContainers||[])c.visible=false
}
function syncRuntimePose(){
 if(!spineRT.ready||!spineRT.display||!state.project||state.drag?.type==='runtime-bone')return;
 const seg=currentRawClip(),sp=spineRT.display;if(!seg.name)return;
 try{
  if(spineRT.currentClip!==seg.name){
   try{sp.state?.clearTracks?.()}catch{}
   spineRT.entry=sp.state.setAnimationByName(0,seg.name,false);spineRT.currentClip=seg.name
  }
  const e=sp.state.getCurrent?.(0)||spineRT.entry;
  if(e){
   const safeEnd=Math.max(0,seg.duration-0.000001),tt=seg.duration?Math.min(seg.localTime,safeEnd):0;
   e.time=tt;e.lastTime=Math.max(-1,tt-0.00001);e.loop=false;e.mix=1
  }
  sp.skeleton.setToSetupPose();
  sp.update(0);
  applyRuntimeSlotEdits();
  syncRuntimeViewport()
 }catch(e){console.error(e);spineRT.error=String(e?.message||e)}
}
function applyRuntimeSlotEdits(){
 const sp=spineRT.display;if(!sp?.skeleton)return;
 const slots=sp.skeleton.slots||[];
 for(let i=0;i<slots.length;i++){
  const slot=slots[i],name=slot.data?.name||state.project.slots?.[i]?.name,container=sp.slotContainers?.[i];
  const userVisible=state.project?.skinEdits?.slotVisibility?.[name]!==false;
  const forced=state.project?.skinEdits?.attachments?.[name];
  if(forced!==undefined&&forced!==null&&forced!=='__AUTO__'){try{sp.skeleton.setAttachment(name,forced||null)}catch{}}
  // Critical: never revive an empty slot container. pixi-spine hides it when
  // the current animation has no attachment; forcing it visible resurrects
  // stale sprites/meshes from previous perspective parts.
  if(container)container.visible=!!slot.attachment&&userVisible&&state.showSkin
 }
}
function runtimeBone(name){return spineRT.display?.skeleton?.bones?.find(b=>(b.data?.name||b.name)===name)||null}
function activeRuntimeBoneSet(){
 const sp=spineRT.display,skeleton=sp?.skeleton;if(!spineRT.ready||!skeleton)return null;
 const active=new Set(),addBone=b=>{
  while(b){const n=b.data?.name||b.name;if(!n||active.has(n))break;active.add(n);b=b.parent||null}
 };
 const slots=skeleton.slots||[];
 for(let i=0;i<slots.length;i++){
  const slot=slots[i],slotName=slot.data?.name||state.project?.slots?.[i]?.name,container=sp.slotContainers?.[i];
  if(state.project?.skinEdits?.slotVisibility?.[slotName]===false)continue;
  if(container&&container.visible===false)continue;
  const alpha=slot.color?.a??slot.a??1;if(alpha<=0.02)continue;
  if(!slot.attachment)continue;
  // Only the slot's owning bone defines the readable structure.
  // Weighted mesh influence bones are deformation internals and stay hidden
  // unless explicitly selected from the bone tree.
  addBone(slot.bone);
 }
 if(state.selectedBone)addBone(runtimeBone(state.selectedBone));
 return active;
}
function runtimePoseScreen(){
 const sp=spineRT.display;if(!spineRT.ready||!sp)return[];
 const PIXI=window.PIXI,active=activeRuntimeBoneSet(),out=[],map=new Map();
 for(const b of sp.skeleton.bones||[]){
  const name=b.data?.name||b.name;if(active&&!active.has(name))continue;
  const p=sp.toGlobal(new PIXI.Point(b.worldX??0,b.worldY??0));
  const row={name,x:p.x,y:p.y,bone:b,parentName:b.parent?(b.parent.data?.name||b.parent.name):null};
  out.push(row);map.set(name,row)
 }
 for(const r of out)r.parent=r.parentName?map.get(r.parentName)||null:null;
 return out
}
function drawRuntimeRig(alpha=1,ghost=false){
 const sel=state.selectedBone,rows=runtimePoseScreen(),byName=new Map(rows.map(x=>[x.name,x]));
 ctx.save();ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.lineJoin='round';
 // Draw actual parent -> child topology, never arbitrary bone.length guide bars.
 for(const b of rows){
  if(!b.parent)continue;
  const selected=b.name===sel||b.parent.name===sel;
  ctx.lineWidth=ghost?1.4:(selected?3:2);
  ctx.strokeStyle=ghost?'#5b7596':(selected?'#ffd43b':'#7891ad');
  ctx.beginPath();ctx.moveTo(b.parent.x,b.parent.y);ctx.lineTo(b.x,b.y);ctx.stroke();
 }
 for(const b of rows){
  const selected=b.name===sel,root=!b.parent;
  ctx.fillStyle=selected?'#ffd43b':(root?'#8290a3':'#c4d2e1');
  ctx.beginPath();ctx.arc(b.x,b.y,selected?4.5:(root?2.1:2.8),0,Math.PI*2);ctx.fill();
  if(state.showNames&&!ghost){ctx.font='10px ui-monospace,monospace';ctx.fillStyle='#aeb9c8';ctx.fillText(b.name,b.x+5,b.y-5)}
 }
 ctx.restore()
}
function pointSegmentDistance(px,py,x1,y1,x2,y2){
 const vx=x2-x1,vy=y2-y1,wx=px-x1,wy=py-y1,l2=vx*vx+vy*vy;
 if(l2<1e-6)return Math.hypot(px-x1,py-y1);
 const t=clamp((wx*vx+wy*vy)/l2,0,1),x=x1+t*vx,y=y1+t*vy;
 return Math.hypot(px-x,py-y)
}
function hitBone(sx,sy){
 if(spineRT.ready){
  const rows=runtimePoseScreen();let best=null,bd=14;
  // Joints get first priority.
  for(const b of rows){const d=Math.hypot(b.x-sx,b.y-sy);if(d<bd){best={name:b.name,runtime:b.bone};bd=d}}
  if(best)return best;
  // Then allow clicking directly on a bone segment. The child bone owns the segment.
  bd=8;
  for(const b of rows){if(!b.parent)continue;const d=pointSegmentDistance(sx,sy,b.parent.x,b.parent.y,b.x,b.y);if(d<bd){best={name:b.name,runtime:b.bone};bd=d}}
  return best
 }
 let best=null,bd=14;for(const b of worldPose(state.currentTime)){const [x,y]=toScreen(b.wx,b.wy),d=Math.hypot(x-sx,y-sy);if(d<bd){best=b;bd=d}}return best
}
function draw(){
 resizeCanvas();const r=canvas.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);
 if(state.project&&spineRT.ready){syncRuntimePose();spineRT.renderer.render(spineRT.stage)}
 drawGrid();
 if(state.project&&state.showRig){
  if(spineRT.ready)drawRuntimeRig(1,false);
  else{
   if(state.onion){const f=1/state.fps;drawPose(worldPose(Math.max(0,state.currentTime-f)),.18,true);drawPose(worldPose(Math.min(duration(),state.currentTime+f)),.18,true)}
   drawPose(worldPose(state.currentTime),1,false);
  }
 }
 requestAnimationFrame(draw)
}
function fitView(){if(spineRT.ready&&spineRT.display){syncRuntimePose();let b;try{b=spineRT.display.getLocalBounds()}catch{}if(b&&isFinite(b.width)&&b.width>0&&b.height>0){const r=canvas.getBoundingClientRect();state.view.zoom=clamp(Math.min((r.width-100)/b.width,(r.height-100)/b.height),.05,12);state.view.x=-(b.x+b.width/2)*state.view.zoom;state.view.y=-(b.y+b.height/2)*state.view.zoom;syncRuntimeViewport();return}}if(!state.project)return;const p=worldPose(state.currentTime);if(!p.length)return;let xs=[],ys=[];for(const b of p){xs.push(b.wx);ys.push(b.wy)}const r=canvas.getBoundingClientRect(),minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);state.view.zoom=clamp(Math.min((r.width-120)/(maxx-minx||100),(r.height-120)/(maxy-miny||100)),.15,8);state.view.x=-(minx+maxx)/2*state.view.zoom;state.view.y=(miny+maxy)/2*state.view.zoom}

async function loadCase(c){
 try{
  let d;
  if(c.remote)d=await fetchRemoteCaseData(c);
  else{
   const b64=window.RIG_CASE_PACK?.[c.id];if(!b64)throw new Error('案例数据不存在: '+c.id);
   const bin=Uint8Array.from(atob(b64),x=>x.charCodeAt(0));let raw;
   if('DecompressionStream' in window){const stream=new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));raw=await new Response(stream).text()}
   else throw new Error('当前浏览器不支持 gzip 解压，请使用最新版 Chrome / Edge / Safari');
   d=JSON.parse(raw)
  }
  state.sourceCase=c;state.project=normalizeProject({...d,name:c.title,id:'case-'+c.id},c.title);
  state.activeMotion=null;ensureMotionSelection();const seg=currentRawClip();
  state.project.activeAnimation=seg.name||Object.keys(state.project.animations)[0]||'Setup Pose';
  state.currentTime=0;state.playing=false;state.selectedBone=null;state.selectedSlot=state.project.slots[0]?.name||null;state.history=[];state.future=[];
  await prepareSkin();fitView();renderAll()
 }catch(e){
  console.error('Case load failed',c,e);
  $('#modal').innerHTML='<h2>案例加载失败</h2><div class="note warn">'+esc(c?.title||'案例')+'<br>'+esc(String(e?.message||e))+'</div><div class="actions"><button data-close class="primary">关闭</button></div>';
  showModal();wireClose();throw e
 }
}
async function loadProject(p){state.project=normalizeProject(p,p.name);state.sourceCase=null;state.activeMotion=null;ensureMotionSelection();const seg=currentRawClip();state.project.activeAnimation=seg.name||Object.keys(state.project.animations)[0]||'Setup Pose';state.currentTime=0;state.selectedBone=null;state.selectedSlot=state.project.slots[0]?.name||null;state.history=[];state.future=[];await prepareSkin();fitView();renderAll()}

function renderAnimSelect(){const s=$('#animSelect');if(!state.project){s.innerHTML='<option>无动画</option>';return}ensureMotionSelection();const defs=motionDefs(),actions=defs.filter(x=>x.kind==='action'),clips=defs.filter(x=>x.kind==='clip');s.innerHTML=`<optgroup label="动作组（按文件语义串联）">${actions.map(x=>`<option value="${esc(x.id)}" ${x.id===state.activeMotion?'selected':''}>${esc(x.label)}</option>`).join('')}</optgroup><optgroup label="原始 Spine 片段">${clips.map(x=>`<option value="${esc(x.id)}" ${x.id===state.activeMotion?'selected':''}>${esc(x.label)}</option>`).join('')}</optgroup>`;s.value=state.activeMotion}
function renderMeta(){if(!state.project){$('#footProject').textContent='未加载工程';$('#hud').textContent='选择案例或新建工程';return}const d=duration(),seg=segmentAtTime(),def=activeMotionDef();$('#timeRange').max=d||1;$('#timeRange').value=state.currentTime;$('#timeLabel').textContent=`${state.currentTime.toFixed(3)} / ${d.toFixed(3)}`;$('#footProject').textContent=`${state.project.name} · ${state.project.bones.length} bones · Spine ${state.project.skeleton?.spine||'?'}`;const rt=spineRT.ready?'Runtime ✓':(spineRT.error?'Runtime 错误 · '+spineRT.error:'Runtime 加载中');$('#hud').textContent=`${def.label}  ›  ${seg.name||'—'} ${seg.localTime.toFixed(3)}s  |  ${(state.currentTime*state.fps).toFixed(0)}f  |  zoom ${(state.view.zoom*100).toFixed(0)}%  |  ${rt}`;$('#playBtn').textContent=state.playing?'❚❚':'▶';if($('#loopBtn'))$('#loopBtn').textContent='循环 '+(state.loop?'✓':'');$('#saveBtn').textContent=state.sourceCase?'另存为':'保存';if(state.sourceCase&&!state.playing)$('#saveState').textContent='案例只读 · 修改请另存'}
function renderTimeline(){const box=$('#tracks');if(!state.project){box.innerHTML='';return}const d=duration()||.001,segs=segmentList(),active=segmentAtTime();let strip=`<div class="motion-strip">${segs.map((s,i)=>`<div class="motion-seg ${i===active.index?'active':''}" style="left:${s.offset/d*100}%;width:${Math.max(.4,s.duration/d*100)}%" title="${esc(s.name)} ${s.duration.toFixed(3)}s">${esc(s.name)}</div>`).join('')}`;for(const s of segs){for(const ev of state.project.animations?.[s.name]?.events||[]){const x=(s.offset+(+ev.time||0))/d*100;strip+=`<i class="event-mark" style="left:${x}%"></i><span class="event-label" style="left:${x}%">${esc(ev.name||'event')}</span>`}}strip+='</div>';
 const bones=state.project.bones.filter(b=>segs.some(s=>state.project.animations?.[s.name]?.bones?.[b.name]));let html=strip;for(const b of bones.slice(0,140)){const times=[];for(const s of segs){const td=state.project.animations?.[s.name]?.bones?.[b.name]||{};for(const arr of Object.values(td))if(Array.isArray(arr))arr.forEach(k=>times.push(s.offset+(+k.time||0)))}html+=`<div class="track"><div class="track-label">${esc(b.name)}</div><div class="track-lane" data-lane="${esc(b.name)}">${[...new Set(times.map(x=>x.toFixed(5)))].map(Number).sort((a,z)=>a-z).map(t=>`<i class="kf" style="left:${clamp(t/d*100,0,100)}%" title="${t.toFixed(3)}"></i>`).join('')}<i class="playhead" style="left:${clamp(state.currentTime/d*100,0,100)}%"></i></div></div>`}box.innerHTML=html;$$('[data-lane]').forEach(l=>l.onclick=e=>{const r=l.getBoundingClientRect();state.currentTime=clamp((e.clientX-r.left)/r.width*d,0,d);state.selectedBone=l.dataset.lane;currentRawClip();renderMeta();renderTimeline();renderInspector()});renderMeta()}

function upsertFrame(arr,t,values){const eps=1/10000;let f=arr.find(x=>Math.abs((+x.time||0)-t)<eps);if(!f){f={time:+t.toFixed(4)};arr.push(f);arr.sort((a,b)=>(+a.time||0)-(+b.time||0))}Object.assign(f,values);return f}
function sampleTimelineValues(boneName,type,t,keys,defaults){return sampleFrames(state.project.animations?.[state.project.activeAnimation]?.bones?.[boneName]?.[type]||[],t,keys,defaults)}
async function writePoseKey(prop,value){const setup=selected(),seg=segmentAtTime();if(!setup||!seg.name)return;pushHistory();state.project.activeAnimation=seg.name;const anim=state.project.animations[seg.name];anim.bones??={};anim.bones[setup.name]??={};const bt=anim.bones[setup.name],t=seg.localTime;
 if(prop==='rotation'){bt.rotate??=[];upsertFrame(bt.rotate,t,{angle:value-(+setup.rotation||0)})}
 else if(prop==='x'||prop==='y'){bt.translate??=[];const cur=sampleFrames(bt.translate,t,['x','y'],{x:0,y:0});cur[prop]=value-(+(setup[prop])||0);upsertFrame(bt.translate,t,{x:cur.x,y:cur.y})}
 else if(prop==='scaleX'||prop==='scaleY'){bt.scale??=[];const cur=sampleFrames(bt.scale,t,['x','y'],{x:1,y:1});const k=prop==='scaleX'?'x':'y',base=+(setup[prop])||1;cur[k]=value/base;upsertFrame(bt.scale,t,{x:cur.x,y:cur.y})}
 state.project.durations[seg.name]=measureDuration(anim);await buildSpineRuntime();syncRuntimePose();renderTimeline();renderInspector()}
function runtimeLocalPose(name){const b=runtimeBone(name);if(!b)return null;return {x:+b.x||0,y:+b.y||0,rotation:+b.rotation||0,scaleX:b.scaleX==null?1:+b.scaleX,scaleY:b.scaleY==null?1:+b.scaleY}}

const _legacyInspector=renderInspector;
renderInspector=function(){const p=$('#insPane');if(!state.project){p.innerHTML='<div class="empty">暂无工程</div>';return}
 if(state.insTab==='clip'){const def=activeMotionDef(),seg=segmentAtTime(),segs=segmentList(),anim=state.project.animations?.[seg.name]||{};const ev=(anim.events||[]);p.innerHTML=`<div class="section-title"><span>动作结构</span><span class="runtime-badge ${spineRT.ready?'':'bad'}">${spineRT.ready?'Spine 3.5 Runtime':'Runtime '+(spineRT.error?'错误':'加载中')}</span></div><div class="note"><b>${esc(def.label)}</b><br>${segs.map((s,i)=>`${i+1}. ${esc(s.name)} · ${s.duration.toFixed(3)}s`).join('<br>')}</div><div class="section-title"><span>当前原始片段</span><span class="badge">${esc(seg.name||'—')}</span></div><div class="metric"><span>本片段时间</span><span>${seg.localTime.toFixed(3)} / ${seg.duration.toFixed(3)}s</span></div><div class="metric"><span>骨骼轨道</span><span>${Object.keys(anim.bones||{}).length}</span></div><div class="metric"><span>Slot 轨道</span><span>${Object.keys(anim.slots||{}).length}</span></div><div class="metric"><span>IK 轨道</span><span>${Object.keys(anim.ik||{}).length}</span></div><div class="metric"><span>Transform 轨道</span><span>${Object.keys(anim.transform||{}).length}</span></div><div class="metric"><span>Path 轨道</span><span>${Object.keys(anim.paths||{}).length}</span></div><div class="metric"><span>Deform Skin</span><span>${Object.keys(anim.deform||{}).length}</span></div><div class="metric"><span>DrawOrder keys</span><span>${(anim.drawOrder||[]).length}</span></div><div class="section-title"><span>事件</span></div>${ev.length?ev.map(e=>`<div class="metric"><span>${esc(e.name)}</span><span>${(+e.time||0).toFixed(4)}s</span></div>`).join(''):'<div class="note">此片段没有事件</div>'}<div class="note warn">这里显示的是你 JSON 里的真实 Spine 片段和轨道，不再把 Begin / Main / End 当成互不相干的动作。</div>`;return}
 if(state.insTab==='skin'){const skins=Object.keys(state.project.skins||{}),slots=state.project.slots||[],skin=state.project.skins?.[state.project.activeSkin]||state.project.skins?.default||{},sel=slots.find(s=>s.name===state.selectedSlot)||slots[0],atts=sel?Object.keys(skin?.[sel.name]||{}):[],forced=sel?state.project.skinEdits.attachments?.[sel.name]:undefined;p.innerHTML=`<div class="section-title"><span>外观 / Attachment</span><span class="runtime-badge ${spineRT.ready?'':'bad'}">${spineRT.ready?'真实 Runtime':'未加载'}</span></div><div class="note"><b>重要：</b>“默认 / 报童 / 见习联结者 / 播种者”是四套独立 Spine 工程，不是这个 JSON 内的 Skin。当前工程内部 Skin：<b>${skins.map(esc).join(', ')||'无'}</b>。</div><div class="field"><label>透明度</label><input id="skinOpacityField" type="range" min="0" max="1" step="0.05" value="${state.skinOpacity}"></div>${sel?`<div class="section-title"><span>选中 Slot</span><span class="badge">${esc(sel.name)}</span></div><div class="field"><label>Attachment</label><select id="attachmentField"><option value="__AUTO__" ${forced==null||forced==='__AUTO__'?'selected':''}>跟随动画轨道</option><option value="" ${forced===''?'selected':''}>隐藏</option>${atts.map(x=>`<option value="${esc(x)}" ${forced===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>`:''}<div class="section-title"><span>Slot 列表</span></div><div class="slot-list">${slots.map(s=>`<div class="slot-row ${s.name===state.selectedSlot?'active':''}" data-slot="${esc(s.name)}"><button data-slot-vis="${esc(s.name)}">${slotVisible(s)?'●':'○'}</button><span>${esc(s.name)}</span><small>${esc(s.bone||'')}</small></div>`).join('')}</div>`;$('#skinOpacityField').oninput=e=>{state.skinOpacity=+e.target.value;syncRuntimeViewport()};$$('[data-slot]').forEach(r=>r.onclick=e=>{if(e.target.matches('[data-slot-vis]'))return;state.selectedSlot=r.dataset.slot;renderInspector()});$$('[data-slot-vis]').forEach(b=>b.onclick=e=>{e.stopPropagation();pushHistory();const n=b.dataset.slotVis;state.project.skinEdits.slotVisibility[n]=state.project.skinEdits.slotVisibility[n]===false?true:false;syncRuntimePose();renderInspector()});if($('#attachmentField'))$('#attachmentField').onchange=e=>{pushHistory();state.project.skinEdits.attachments[sel.name]=e.target.value;syncRuntimePose();renderInspector()};return}
 if(state.insTab==='bone'){const b=selected();if(!b){p.innerHTML='<div class="empty">选择一根骨骼</div>';return}const rp=runtimeLocalPose(b.name),seg=segmentAtTime();p.innerHTML=`<div class="section-title"><span>${esc(b.name)}</span><span class="badge">${esc(b.parent||'root')}</span></div><div class="section-title"><span>当前动作姿态</span><span class="badge">${esc(seg.name||'—')} @ ${seg.localTime.toFixed(3)}s</span></div>${rp?`<div class="pose-grid">${['x','y','rotation','scaleX','scaleY'].map(k=>`<div class="field"><label>${k}</label><input data-pose-prop="${k}" type="number" step="0.01" value="${rp[k].toFixed(4)}"></div>`).join('')}</div><div class="note">修改这里会直接写进当前原始 Spine 片段的骨骼关键帧（translate / rotate / scale），不是另建一套假关键帧。</div>`:'<div class="note">Runtime 骨骼尚未就绪。</div>'}<div class="section-title"><span>Setup Pose</span></div>${numField('X','x',b.x)}${numField('Y','y',b.y)}${numField('旋转','rotation',b.rotation)}${numField('长度','length',b.length)}${numField('Scale X','scaleX',b.scaleX)}${numField('Scale Y','scaleY',b.scaleY)}<div class="field"><label>父骨骼</label><select id="parentField"><option value="">— root —</option>${state.project.bones.filter(x=>x.name!==b.name).map(x=>`<option ${b.parent===x.name?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div><div class="toolbar-row"><button id="dupBone">复制骨骼</button><button id="lockBone">${b.locked?'解锁':'锁定'}</button><button id="hideBone">${b.hidden?'显示':'隐藏'}</button><button id="delBone" class="danger">删除</button></div>`;$$('[data-pose-prop]').forEach(i=>i.onchange=()=>writePoseKey(i.dataset.poseProp,+i.value));$$('[data-prop]').forEach(i=>i.onchange=async()=>{pushHistory();b[i.dataset.prop]=+i.value||0;await buildSpineRuntime();syncRuntimePose();renderTimeline();renderInspector()});$('#parentField').onchange=async e=>{pushHistory();b.parent=e.target.value||null;await buildSpineRuntime();renderInspector()};$('#dupBone').onclick=duplicateBone;$('#lockBone').onclick=()=>{b.locked=!b.locked;renderInspector();renderLeft()};$('#hideBone').onclick=()=>{b.hidden=!b.hidden;renderInspector();renderLeft()};$('#delBone').onclick=deleteBone;return}
 return _legacyInspector()};

$$('[data-left]').forEach(b=>b.onclick=()=>{$$('[data-left]').forEach(x=>x.classList.toggle('active',x===b));state.leftTab=b.dataset.left;renderLeft()});$$('[data-ins]').forEach(b=>b.onclick=()=>{$$('[data-ins]').forEach(x=>x.classList.toggle('active',x===b));state.insTab=b.dataset.ins;renderInspector()});
$('#leftSearch').oninput=renderLeft;$('#newBtn').onclick=newProjectModal;$('#importBtn').onclick=()=>$('#fileInput').click();$('#fileInput').onchange=e=>importFiles(e.target.files);$('#saveBtn').onclick=saveProject;$('#exportBtn').onclick=exportProject;$('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;$('#helpBtn').onclick=showHelp;$('#fitBtn').onclick=fitView;$('#gridBtn').onclick=()=>{state.showGrid=!state.showGrid;$('#gridBtn').textContent='网格 '+(state.showGrid?'✓':'')};$('#skinBtn').onclick=()=>{state.showSkin=!state.showSkin;$('#skinBtn').textContent='皮肤 '+(state.showSkin?'✓':'');syncRuntimeViewport()};$('#rigBtn').onclick=()=>{state.showRig=!state.showRig;$('#rigBtn').textContent='骨架 '+(state.showRig?'✓':'')};$('#namesBtn').onclick=()=>{state.showNames=!state.showNames;$('#namesBtn').textContent='骨名 '+(state.showNames?'✓':'')};$('#onionBtn').onclick=()=>{state.onion=!state.onion;$('#onionBtn').textContent='洋葱皮 '+(state.onion?'✓':'')};$('#animSelect').onchange=e=>{resetRuntimePlayback();state.activeMotion=e.target.value;state.currentTime=0;currentRawClip();syncRuntimePose();renderAll()};$('#speedSelect').onchange=e=>state.speed=+e.target.value;$('#playBtn').onclick=()=>{if(!state.playing&&state.currentTime>=duration()-1e-6){state.currentTime=0;resetRuntimePlayback();syncRuntimePose()}state.playing=!state.playing;renderMeta()};if($('#loopBtn'))$('#loopBtn').onclick=()=>{state.loop=!state.loop;$('#loopBtn').textContent='循环 '+(state.loop?'✓':'');renderInspector()};$('#timeRange').oninput=e=>{state.currentTime=+e.target.value;renderTimeline();renderInspector()};$('#fpsInput').onchange=e=>{state.fps=clamp(+e.target.value||30,1,120);renderInspector()};$('#prevFrame').onclick=()=>{state.currentTime=clamp(state.currentTime-1/state.fps,0,duration());renderTimeline();renderInspector()};$('#nextFrame').onclick=()=>{state.currentTime=clamp(state.currentTime+1/state.fps,0,duration());renderTimeline();renderInspector()};$('#addKeyBtn').onclick=addCurrentKey;
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.code==='Space'){e.preventDefault();state.playing=!state.playing;renderMeta()}else if(e.key==='f'||e.key==='F')fitView();else if(e.key==='ArrowLeft')$('#prevFrame').click();else if(e.key==='ArrowRight')$('#nextFrame').click();else if(e.key==='Delete')deleteBone();else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}});
function motionIsRest(){
 const id=activeMotionDef().id;return id==='action:Idle'||id==='action:Default'||id==='clip:Idle'||id==='clip:Default'
}
function returnToRestMotion(){
 const defs=motionDefs(),rest=defs.find(x=>x.id==='action:Idle')||defs.find(x=>x.id==='action:Default');
 if(!rest)return false;
 resetRuntimePlayback();state.activeMotion=rest.id;state.currentTime=0;state.playing=false;
 currentRawClip();syncRuntimePose();renderAnimSelect();renderTimeline();renderInspector();renderMeta();return true
}
function tick(t){
 if(state.playing&&state.project){
  if(!state.lastT)state.lastT=t;
  state.currentTime+=(t-state.lastT)/1000*state.speed;
  const d=duration();
  if(d>0&&state.currentTime>=d){
   if(state.loop){
    state.currentTime=state.currentTime%d;
    resetRuntimePlayback();syncRuntimePose()
   }else if(!motionIsRest()){
    if(!returnToRestMotion()){state.currentTime=0;state.playing=false;resetRuntimePlayback();syncRuntimePose()}
   }else{state.currentTime=d;state.playing=false}
  }
  renderMeta();if(Math.floor(t/80)!==Math.floor(state.lastT/80))renderTimeline()
 }
 state.lastT=t;requestAnimationFrame(tick)
}
window.addEventListener('resize',()=>resizeCanvas());

/* ================================================================
   Motion learning + runtime pose training
   Learns style statistics from the repository's embedded Amiya corpus
   and scores reference poses from the authoritative Spine runtime.
   ================================================================ */
const motionLearn={cache:new Map(),result:null,loading:false,error:null,requestKey:null};

function runtimePoseModel(){
 if(!spineRT.ready||!spineRT.display?.skeleton)return worldPose(state.currentTime).map(b=>({name:b.name,wx:b.wx,wy:b.wy,wr:b.wr,length:b.length||0}));
 try{syncRuntimePose()}catch{}
 return (spineRT.display.skeleton.bones||[]).map(b=>{
  const m00=b.m00??b.a??1,m10=b.m10??b.c??0;
  return {name:b.data?.name||b.name,wx:+(b.worldX??0)||0,wy:+(b.worldY??0)||0,wr:deg(Math.atan2(m10,m00)),length:+(b.data?.length||0)||0};
 });
}
function captureReference(name){
 state.reference={pose:deep(runtimePoseModel()),name:name||`${activeMotionDef().label} @ ${state.currentTime.toFixed(3)}s`,time:state.currentTime,runtime:spineRT.ready};
 renderInspector();
}
makeSnapshot=function(){
 const snap={id:uid(),name:`${activeMotionDef().label} ${state.currentTime.toFixed(3)}`,pose:deep(runtimePoseModel()),time:state.currentTime,runtime:spineRT.ready};
 state.snapshots.push(snap);state.reference=snap;renderInspector();
};
function poseErrorRows(){
 if(!state.reference?.pose?.length)return[];
 const cur=runtimePoseModel(),ref=new Map(state.reference.pose.map(b=>[b.name,b]));
 return cur.map(b=>{const r=ref.get(b.name);if(!r)return null;const dist=Math.hypot(b.wx-r.wx,b.wy-r.wy),angle=Math.abs(((b.wr-r.wr+540)%360)-180);const scale=Math.max(20,(b.length||r.length||40)*1.2);const score=(Math.exp(-dist/scale)*.68+Math.exp(-angle/28)*.32)*100;return {name:b.name,dist,angle,score}}).filter(Boolean).sort((a,b)=>a.score-b.score);
}
poseScore=function(){
 const rows=poseErrorRows();return rows.length?Math.round(rows.reduce((n,r)=>n+r.score,0)/rows.length):0;
};

async function unpackLearningCase(c){
 if(motionLearn.cache.has(c.id))return motionLearn.cache.get(c.id);
 const b64=window.RIG_CASE_PACK?.[c.id];if(!b64)throw new Error('案例数据不存在: '+c.id);
 const bin=Uint8Array.from(atob(b64),x=>x.charCodeAt(0));
 if(!('DecompressionStream' in window))throw new Error('浏览器不支持 gzip 解压');
 const stream=new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
 const data=JSON.parse(await new Response(stream).text());
 motionLearn.cache.set(c.id,data);return data;
}
function semanticLearningAction(name){
 const n=String(name||'');
 if(/^Attack/i.test(n))return 'Attack';
 if(/^Skill(?:_|)?3/i.test(n)||/^Skill3/i.test(n))return 'Skill_3';
 if(/^Skill(?:_|)?2/i.test(n)||/^Skill2/i.test(n))return 'Skill_2';
 if(/^Skill/i.test(n))return 'Skill';
 if(/^Idle/i.test(n))return 'Idle';
 if(/^Default$/i.test(n))return 'Default';
 if(/^Start/i.test(n))return 'Start';
 if(/^Die/i.test(n))return 'Die';
 if(/^Stun/i.test(n))return 'Stun';
 if(/^Interact/i.test(n))return 'Interact';
 if(/^Move/i.test(n))return 'Move';
 if(/^Relax/i.test(n))return 'Relax';
 if(/^Sit/i.test(n))return 'Sit';
 if(/^Sleep/i.test(n))return 'Sleep';
 if(/^Special/i.test(n))return 'Special';
 return n
}
function learningActionName(){
 const def=activeMotionDef();if(!def)return null;
 const raw=def.id?.startsWith('action:')?def.id.slice(7):(def.segments?.[0]||state.project?.activeAnimation||null);
 return semanticLearningAction(raw)
}
function learningFamilyCode(action){
 return ({Attack:'A',Skill:'S',Skill_2:'S2',Skill_3:'S3',Idle:'I',Default:'D',Start:'T',Die:'X',Stun:'U',Interact:'N',Move:'M',Relax:'R',Sit:'Q',Sleep:'L',Special:'P'})[action]||null
}
function inferLearningView(){
 if(state.sourceCase?.view)return state.sourceCase.view;
 const names=(state.project?.bones||[]).map(b=>b.name);
 const f=names.filter(n=>/^F[_-]/i.test(n)).length,b=names.filter(n=>/^B[_-]/i.test(n)).length;
 if(f>b*1.25)return '战斗正面';if(b>f*1.25)return '战斗背面';
 return isCombatProject()?'战斗正面':'基建'
}
function actionSegmentsForData(data,name){
 const A=data?.animations||{},names=Object.keys(A);
 const exact=n=>names.includes(n);
 if(name==='Attack'){
  const seq=['Attack_Begin','Attack_Pre','Attack_Start','Attack','Attack_Loop','Attack_End'].filter(exact);
  return seq.length?seq:names.filter(n=>/^Attack/i.test(n))
 }
 if(name==='Skill'){
  const seq=['Skill_Begin','Skill_Start','Skill','Skill_Loop','Skill_Loop_2','Skill_End'].filter(exact);
  return seq.length?seq:names.filter(n=>/^Skill(?![_ ]?[23]|[23])/i.test(n))
 }
 if(name==='Skill_2'){
  const seq=['Skill_2_Begin','Skill2_Begin','Skill_2','Skill2','Skill_2_Loop','Skill2_Loop','Skill_2_End','Skill2_End'].filter(exact);
  return seq.length?seq:names.filter(n=>/^Skill(?:_|)?2|^Skill2/i.test(n))
 }
 if(name==='Skill_3')return names.filter(n=>/^Skill(?:_|)?3|^Skill3/i.test(n));
 return names.filter(n=>semanticLearningAction(n)===name)
}
function signatureForData(data,action){
 const segs=actionSegmentsForData(data,action),bones=new Map();let duration=0,keyCount=0;
 for(const seg of segs){
  const anim=data.animations?.[seg]||{};duration+=measureDuration(anim);
  for(const [name,timelines] of Object.entries(anim.bones||{})){
   const st=bones.get(name)||{name,keys:0,rotSpan:0,moveSpan:0,segments:0};st.segments++;
   const rot=timelines.rotate||[];if(rot.length){const vals=rot.map(x=>+x.angle||0);st.rotSpan+=Math.max(...vals)-Math.min(...vals);st.keys+=rot.length;keyCount+=rot.length}
   const tr=timelines.translate||[];if(tr.length){const xs=tr.map(x=>+x.x||0),ys=tr.map(x=>+x.y||0);st.moveSpan+=Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));st.keys+=tr.length;keyCount+=tr.length}
   for(const k of ['scale','shear']){const arr=timelines[k]||[];st.keys+=arr.length;keyCount+=arr.length}
   bones.set(name,st);
  }
 }
 const ranked=[...bones.values()].map(b=>({...b,energy:b.rotSpan+b.moveSpan*.35+b.keys*.25})).sort((a,b)=>b.energy-a.energy);
 return {segments:segs,duration,keyCount,activeBones:bones.size,ranked}
}
function median(a){const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return 0;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2}
async function unpackLearningCase(c){
 if(motionLearn.cache.has(c.id))return motionLearn.cache.get(c.id);
 const b64=window.RIG_CASE_PACK?.[c.id];if(!b64)throw new Error('案例数据不存在: '+c.id);
 const bin=Uint8Array.from(atob(b64),x=>x.charCodeAt(0));
 if(!('DecompressionStream' in window))throw new Error('浏览器不支持 gzip 解压');
 const stream=new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
 const data=JSON.parse(await new Response(stream).text());
 motionLearn.cache.set(c.id,data);return data
}
function corpusCharacterRows(view,fam){
 const c=window.RIG_LEARNING_SUMMARY?.characters||[];
 return c.filter(row=>(row[3]?.[view]||0)>0&&(row[4]?.[fam]||0)>0)
}
async function learnMotionCorpus(force=false){
 if(!state.project)return;
 const action=learningActionName(),view=inferLearningView(),fam=learningFamilyCode(action),key=`${view}|${fam||action||'none'}`;
 if(!force&&motionLearn.requestKey===key&&motionLearn.result)return;
 if(motionLearn.loading)return;
 motionLearn.loading=true;motionLearn.error=null;motionLearn.requestKey=key;renderInspector();
 try{
  const big=window.RIG_LEARNING_SUMMARY;
  if(big&&fam){
   const row=(big.global||[]).find(x=>x[0]===view&&x[1]===fam);
   if(row){
    const chars=corpusCharacterRows(view,fam);
    motionLearn.result={
     key,action,view,fam,source:'bulk',
     projectCount:row[2],characterCount:row[3],
     medianDuration:+row[4]||0,medianKeys:+row[5]||0,medianBones:+row[6]||0,
     common:(row[7]||[]).map(([name,count])=>({name,count})),
     characters:chars,corpusStats:big.stats
    };
    return
   }
  }
  // Fallback for actions not represented in the large corpus.
  const candidates=state.manifest.filter(c=>(!view||c.view===view)&&c.animations?.some(n=>semanticLearningAction(n)===action));
  const profiles=[];
  for(const c of candidates){const data=await unpackLearningCase(c);profiles.push({caseInfo:c,...signatureForData(data,action)})}
  const aggregate=new Map();
  for(const p of profiles)for(const b of p.ranked){const x=aggregate.get(b.name)||{name:b.name,count:0,energy:0,keys:0};x.count++;x.energy+=b.energy;x.keys+=b.keys;aggregate.set(b.name,x)}
  const common=[...aggregate.values()].map(x=>({...x,avgEnergy:x.energy/x.count})).sort((a,b)=>(b.count-a.count)||(b.avgEnergy-a.avgEnergy)).slice(0,10);
  motionLearn.result={key,action,view,source:'legacy',projectCount:profiles.length,characterCount:profiles.length,profiles,common,medianDuration:median(profiles.map(x=>x.duration)),medianKeys:median(profiles.map(x=>x.keyCount)),medianBones:median(profiles.map(x=>x.activeBones)),characters:[]}
 }catch(e){motionLearn.error=String(e?.message||e);motionLearn.result=null}
 finally{motionLearn.loading=false;renderInspector()}
}
function currentMotionSignature(){return signatureForData(runtimeRawSkeleton()||{},learningActionName())}
function showLearningCorpusModal(){
 const big=window.RIG_LEARNING_SUMMARY;if(!big)return;
 const labels=big.labels||{},rows=big.characters||[];
 $('#modal').innerHTML=`<h2>动作学习语料库</h2><div class="note"><b>${big.stats.characters} 个有效角色 · ${big.stats.projects} 个 Spine 工程</b><br>战斗正面 ${big.stats.views?.['战斗正面']||0} · 战斗背面 ${big.stats.views?.['战斗背面']||0} · 基建 ${big.stats.views?.['基建']||0}<br>无法解析：${(big.stats.invalid||[]).map(esc).join('、')||'无'}</div><div style="max-height:55vh;overflow:auto">${rows.map(r=>`<div class="case-card"><div class="case-title">${esc(r[0])} <span class="badge">${r[1]} 工程</span></div><div class="case-meta">${r[2].map(esc).join(' · ')} · ${Object.entries(r[4]||{}).map(([k,v])=>`${esc(labels[k]||k)} ${v}`).join(' · ')}</div></div>`).join('')}</div><div class="actions"><button data-close class="primary">关闭</button></div>`;
 showModal();wireClose()
}
function renderLearningInspector(){
 const p=$('#insPane'),score=state.reference?poseScore():null,rows=state.reference?poseErrorRows().slice(0,6):[];
 const r=motionLearn.result,action=learningActionName(),view=inferLearningView(),current=currentMotionSignature(),big=window.RIG_LEARNING_SUMMARY;
 if(!motionLearn.loading&&!motionLearn.error&&(!r||r.action!==action||r.view!==view))queueMicrotask(()=>learnMotionCorpus());
 const corpusHtml=motionLearn.loading?'<div class="note">正在读取大批动作语料…</div>':motionLearn.error?`<div class="note warn">${esc(motionLearn.error)}</div>`:r?`<div class="metric"><span>学习范围</span><span>${esc(r.view)} · ${r.projectCount} 个工程</span></div><div class="metric"><span>有效角色</span><span>${r.characterCount} 个</span></div><div class="metric"><span>动作</span><span>${esc(r.action||'—')}</span></div><div class="metric"><span>典型时长</span><span>${r.medianDuration.toFixed(3)} s</span></div><div class="metric"><span>典型关键帧量</span><span>${Math.round(r.medianKeys)}</span></div><div class="metric"><span>典型参与骨骼</span><span>${Math.round(r.medianBones)}</span></div><div class="section-title"><span>共同主运动骨骼</span><span>跨角色</span></div>${r.common.map((b,i)=>`<div class="metric"><span>${i+1}. ${esc(b.name)}</span><span>${b.count} 工程</span></div>`).join('')}<div class="section-title"><span>当前动作结构</span><span>${current.segments.length} 段</span></div><div class="metric"><span>时长</span><span>${current.duration.toFixed(3)} s</span></div><div class="metric"><span>关键帧量</span><span>${current.keyCount}</span></div><div class="metric"><span>参与骨骼</span><span>${current.activeBones}</span></div>`:'<div class="note">当前动作没有可学习的同类案例。</div>';
 p.innerHTML=`<div class="section-title"><span>动作学习</span><span class="runtime-badge ${spineRT.ready?'':'bad'}">${spineRT.ready?'真实 Spine 姿态':'近似姿态'}</span></div><div class="note"><b>大批学习库已接入：</b>${big?.stats?.characters||0} 个有效角色 / ${big?.stats?.projects||0} 个 Spine 工程。按战斗正面、战斗背面、基建和动作类型统计，不再只学 4 套阿米娅。</div><div class="toolbar-row"><button id="showCorpusChars">查看语料角色</button><button id="relearnMotion">重新统计当前动作</button></div>${corpusHtml}<div class="toolbar-row"><button id="setRuntimeRef">当前帧设为参考</button></div><div class="section-title"><span>姿态复现训练</span><span class="badge">${state.reference?'Pose Match':'未设参考'}</span></div>${state.reference?`<div class="score">${score}%</div><div class="note">参考：${esc(state.reference.name)}<br>评分直接读取 Spine Runtime 约束后的骨骼世界姿态。</div>${rows.map(x=>`<div class="metric"><span>${esc(x.name)}</span><span>位移 ${x.dist.toFixed(1)} · 角度 ${x.angle.toFixed(1)}°</span></div>`).join('')}<div class="toolbar-row"><button id="clearRuntimeRef">清除参考</button></div>`:'<div class="note">把当前真实运行姿态设为参考，然后修改当前动作关键帧，就可以看复现误差。</div>'}`;
 $('#showCorpusChars').onclick=showLearningCorpusModal;
 $('#relearnMotion').onclick=()=>learnMotionCorpus(true);
 $('#setRuntimeRef').onclick=()=>captureReference(`${activeMotionDef().label} @ ${state.currentTime.toFixed(3)}s`);
 if($('#clearRuntimeRef'))$('#clearRuntimeRef').onclick=()=>{state.reference=null;renderInspector()}
}

const _learningInspectorBase=renderInspector;
renderInspector=function(){if(state.project&&state.insTab==='train'){renderLearningInspector();return}_learningInspectorBase()};

async function writeFullPoseKey(){
 const setup=selected(),rp=runtimeLocalPose(setup?.name),seg=segmentAtTime();if(!setup||!rp||!seg.name)return;
 pushHistory();const anim=state.project.animations[seg.name];anim.bones??={};anim.bones[setup.name]??={};const bt=anim.bones[setup.name],t=seg.localTime;
 bt.rotate??=[];upsertFrame(bt.rotate,t,{angle:rp.rotation-(+setup.rotation||0)});
 bt.translate??=[];upsertFrame(bt.translate,t,{x:rp.x-(+setup.x||0),y:rp.y-(+setup.y||0)});
 bt.scale??=[];upsertFrame(bt.scale,t,{x:rp.scaleX/(+setup.scaleX||1),y:rp.scaleY/(+setup.scaleY||1)});
 state.project.durations[seg.name]=measureDuration(anim);await buildSpineRuntime();syncRuntimePose();renderTimeline();renderInspector();
}
$('#addKeyBtn').onclick=()=>writeFullPoseKey();

loadManifest().then(async()=>{const locals=await dbAll();if(locals.length)await loadProject(locals.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0]);else if(state.manifest.length)await loadCase(state.manifest.find(c=>c.id==='amiya-default-front')||state.manifest[0])});renderAll();requestAnimationFrame(draw);requestAnimationFrame(tick);