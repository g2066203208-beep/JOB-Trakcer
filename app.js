import { pipeline, env as hfEnv } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";
import { FilesetResolver, PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm";

hfEnv.allowLocalModels=false;
hfEnv.useBrowserCache=true;

const MATTE_MODEL="Xenova/modnet";
const POSE_MODEL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const WASM_ROOT="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const $=id=>document.getElementById(id);

const ui={
  drop:$("dropZone"),input:$("fileInput"),choose:$("chooseBtn"),analyze:$("analyzeBtn"),reset:$("resetBtn"),
  canvas:$("viewCanvas"),frame:$("canvasFrame"),dot:$("modelDot"),status:$("modelStatus"),progress:$("progressText"),
  meta:$("imageMeta"),jointCount:$("jointCount"),boneCount:$("boneCount"),layerCount:$("layerCount"),mode:$("inferenceMode"),
  joints:$("jointList"),layers:$("layerList"),manifest:$("manifestBtn"),all:$("downloadAllBtn"),skeleton:$("showSkeleton"),subject:$("showSubject"),badge:$("rigBadge")
};

const state={
  file:null,img:null,url:null,matte:null,poseModel:null,pose:null,poseNamed:null,joints:[],bones:[],layers:[],manifest:null,
  source:document.createElement("canvas"),subject:document.createElement("canvas")
};

function modelStatus(text,kind=""){ui.status.textContent=text;ui.dot.className=kind}
function step(n,status){
  const el=document.querySelector(`.step[data-step="${n}"]`); if(!el)return;
  el.classList.toggle("active",status==="active");el.classList.toggle("done",status==="done");
  el.querySelector("i").textContent=status==="done"?"完成":status==="active"?"处理中":status==="error"?"失败":"待机";
  ui.progress.textContent=`${[...document.querySelectorAll(".step")].filter(x=>x.classList.contains("done")).length} / 4`;
}
function resetSteps(){document.querySelectorAll(".step").forEach(x=>{x.classList.remove("active","done");x.querySelector("i").textContent="待机"});ui.progress.textContent="0 / 4"}

function loadImage(file){
  return new Promise((resolve,reject)=>{
    if(state.url)URL.revokeObjectURL(state.url);
    state.url=URL.createObjectURL(file);const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=state.url;
  });
}
function setupSource(img){
  state.img=img;const w=img.naturalWidth,h=img.naturalHeight;state.source.width=w;state.source.height=h;
  state.source.getContext("2d").drawImage(img,0,0);ui.canvas.width=w;ui.canvas.height=h;ui.frame.classList.remove("empty");ui.frame.querySelector(".empty-stage").style.display="none";
  ui.meta.textContent=w+" × "+h+" · "+(state.file?.name??"");drawView();
}

function rawToImageData(raw){
  const c=raw.channels,d=raw.data,out=new Uint8ClampedArray(raw.width*raw.height*4);
  for(let i=0,j=0;i<d.length;i+=c,j+=4){out[j]=d[i];out[j+1]=d[i+1]??d[i];out[j+2]=d[i+2]??d[i];out[j+3]=c===4?d[i+3]:255}
  return new ImageData(out,raw.width,raw.height);
}
function put(canvas,imageData){canvas.width=imageData.width;canvas.height=imageData.height;canvas.getContext("2d").putImageData(imageData,0,0)}

async function getMatte(){
  if(state.matte)return state.matte;modelStatus("加载主体 ML…","busy");
  state.matte=await pipeline("background-removal",MATTE_MODEL,{dtype:"q8"});return state.matte;
}
async function getPoseModel(){
  if(state.poseModel)return state.poseModel;modelStatus("加载骨骼 ML…","busy");
  const vision=await FilesetResolver.forVisionTasks(WASM_ROOT);
  state.poseModel=await PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:POSE_MODEL},runningMode:"IMAGE",numPoses:1,minPoseDetectionConfidence:.35,minPosePresenceConfidence:.35,minTrackingConfidence:.35,outputSegmentationMasks:false});
  return state.poseModel;
}

async function runMatte(){
  step(1,"active");
  try{
    const raw=await (await getMatte())(state.source);put(state.subject,rawToImageData(raw));step(1,"done");
  }catch(e){
    console.warn("matte",e);put(state.subject,state.source.getContext("2d").getImageData(0,0,state.source.width,state.source.height));step(1,"done");modelStatus("主体 ML 失败 · 原图兜底","busy");
  }
}

function point(lm,w,h){return{x:lm.x*w,y:lm.y*h,visibility:lm.visibility??1}}
function mid(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
function len(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}

function fallbackPose(){
  const w=state.subject.width,h=state.subject.height,d=state.subject.getContext("2d").getImageData(0,0,w,h).data;let minX=w,minY=h,maxX=0,maxY=0,ok=false;
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){if(d[(y*w+x)*4+3]>30){ok=true;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}}
  if(!ok){minX=w*.2;maxX=w*.8;minY=h*.1;maxY=h*.95}
  const W=maxX-minX,H=maxY-minY,c=(minX+maxX)/2,t=minY,b=maxY;
  const sy=t+H*.28,hy=t+H*.58,ey=t+H*.38,wy=t+H*.47,ky=t+H*.77,ay=t+H*.95;
  return{
    nose:{x:c,y:t+H*.16,visibility:.45},
    leftShoulder:{x:c-W*.22,y:sy,visibility:.45},rightShoulder:{x:c+W*.22,y:sy,visibility:.45},
    leftElbow:{x:c-W*.38,y:ey,visibility:.45},rightElbow:{x:c+W*.38,y:ey,visibility:.45},
    leftWrist:{x:c-W*.49,y:wy,visibility:.45},rightWrist:{x:c+W*.49,y:wy,visibility:.45},
    leftHip:{x:c-W*.16,y:hy,visibility:.45},rightHip:{x:c+W*.16,y:hy,visibility:.45},
    leftKnee:{x:c-W*.17,y:ky,visibility:.45},rightKnee:{x:c+W*.17,y:ky,visibility:.45},
    leftAnkle:{x:c-W*.18,y:ay,visibility:.45},rightAnkle:{x:c+W*.18,y:ay,visibility:.45},
    leftFoot:{x:c-W*.20,y:b,visibility:.45},rightFoot:{x:c+W*.20,y:b,visibility:.45}
  };
}
function normalizePose(result){
  const l=result?.landmarks?.[0];if(!l||l.length<33)return fallbackPose();const w=state.source.width,h=state.source.height;
  const map={nose:0,leftShoulder:11,rightShoulder:12,leftElbow:13,rightElbow:14,leftWrist:15,rightWrist:16,leftHip:23,rightHip:24,leftKnee:25,rightKnee:26,leftAnkle:27,rightAnkle:28,leftFoot:31,rightFoot:32};
  const out={};for(const[n,i]of Object.entries(map))out[n]=point(l[i],w,h);
  return Object.values(out).filter(v=>v.visibility>=.2).length>=8?out:fallbackPose();
}
async function runPose(){
  step(2,"active");
  try{state.pose=await (await getPoseModel()).detect(state.img);state.poseNamed=normalizePose(state.pose);step(2,"done")}
  catch(e){console.warn("pose",e);state.poseNamed=fallbackPose();step(2,"done");modelStatus("姿态 ML 失败 · 比例兜底","busy")}
}

function buildRig(){
  step(3,"active");const q=state.poseNamed,neck=mid(q.leftShoulder,q.rightShoulder),pelvis=mid(q.leftHip,q.rightHip),head=q.nose;
  const r=Math.max(24,len(q.leftShoulder,q.rightShoulder)*.46),j=[
    ["head","头",head],["neck","颈",neck],["shoulderL","左肩",q.leftShoulder],["elbowL","左肘",q.leftElbow],["wristL","左腕",q.leftWrist],
    ["hipL","左髋",q.leftHip],["kneeL","左膝",q.leftKnee],["ankleL","左踝",q.leftAnkle],["shoulderR","右肩",q.rightShoulder],["elbowR","右肘",q.rightElbow],["wristR","右腕",q.rightWrist],
    ["hipR","右髋",q.rightHip],["kneeR","右膝",q.rightKnee],["ankleR","右踝",q.rightAnkle]
  ].map(([id,label,p])=>({id,label,x:p.x,y:p.y}));
  const bones=[["neck","shoulderL"],["shoulderL","elbowL"],["elbowL","wristL"],["neck","shoulderR"],["shoulderR","elbowR"],["elbowR","wristR"],["neck","hipL"],["hipL","kneeL"],["kneeL","ankleL"],["neck","hipR"],["hipR","kneeR"],["kneeR","ankleR"]];
  const by=new Map(j.map(x=>[x.id,x]));state.joints=j;state.bones=bones.map(([a,b])=>({a,b,length:len(by.get(a),by.get(b))}));
  state.meta={neck,pelvis,head,r,w:state.source.width,h:state.source.height};step(3,"done");
}

function buildLayerMask(name){
  const q=state.poseNamed,m=state.meta,w=state.source.width,h=state.source.height,c=document.createElement("canvas");c.width=w;c.height=h;
  const ctx=c.getContext("2d");ctx.drawImage(state.subject,0,0);ctx.globalCompositeOperation="destination-in";ctx.fillStyle="#fff";
  const capsule=(a,b,s)=>{ctx.save();ctx.lineCap="round";ctx.lineWidth=s;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore()};
  const circle=(p,r)=>{ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill()};
  const ellipse=(p,rx,ry)=>{ctx.beginPath();ctx.ellipse(p.x,p.y,rx,ry,0,0,Math.PI*2);ctx.fill()};
  const lw=(a,b,k,min)=>Math.max(min,len(a,b)*k);
  switch(name){
    case"head":ellipse(m.head,m.r,m.r*1.12);break;
    case"hair-candidate":ellipse({x:m.head.x,y:m.head.y-m.r*.26},m.r*1.12,m.r*.92);break;
    case"torso":{const a=q.leftShoulder,b=q.rightShoulder,c1=q.rightHip,d=q.leftHip,p=Math.max(10,len(a,b)*.08);ctx.beginPath();ctx.moveTo(a.x-p,a.y-p);ctx.lineTo(b.x+p,b.y-p);ctx.lineTo(c1.x+p,c1.y+p);ctx.lineTo(d.x-p,d.y+p);ctx.closePath();ctx.fill();break}
    case"upper-arm-L":capsule(q.leftShoulder,q.leftElbow,lw(q.leftShoulder,q.leftElbow,.20,14));break;
    case"forearm-L":capsule(q.leftElbow,q.leftWrist,lw(q.leftElbow,q.leftWrist,.22,13));break;
    case"hand-L":circle(q.leftWrist,Math.max(12,len(q.leftElbow,q.leftWrist)*.16));break;
    case"upper-arm-R":capsule(q.rightShoulder,q.rightElbow,lw(q.rightShoulder,q.rightElbow,.20,14));break;
    case"forearm-R":capsule(q.rightElbow,q.rightWrist,lw(q.rightElbow,q.rightWrist,.22,13));break;
    case"hand-R":circle(q.rightWrist,Math.max(12,len(q.rightElbow,q.rightWrist)*.16));break;
    case"thigh-L":capsule(q.leftHip,q.leftKnee,lw(q.leftHip,q.leftKnee,.30,22));break;
    case"shin-L":capsule(q.leftKnee,q.leftAnkle,lw(q.leftKnee,q.leftAnkle,.28,20));break;
    case"foot-L":capsule(q.leftAnkle,q.leftFoot,Math.max(18,len(q.leftAnkle,q.leftFoot)*.9));break;
    case"thigh-R":capsule(q.rightHip,q.rightKnee,lw(q.rightHip,q.rightKnee,.30,22));break;
    case"shin-R":capsule(q.rightKnee,q.rightAnkle,lw(q.rightKnee,q.rightAnkle,.28,20));break;
    case"foot-R":capsule(q.rightAnkle,q.rightFoot,Math.max(18,len(q.rightAnkle,q.rightFoot)*.9));break;
  }
  ctx.globalCompositeOperation="source-over";return c;
}

function buildLayers(){
  step(4,"active");
  const defs=[
    ["head","头","neck","head","body"],["hair-candidate","头发候选","neck","head","body"],["torso","躯干","neck","neck","root"],
    ["upper-arm-L","左上臂","shoulderL","shoulderL","torso"],["forearm-L","左前臂","elbowL","elbowL","upper-arm-L"],["hand-L","左手","wristL","wristL","forearm-L"],
    ["upper-arm-R","右上臂","shoulderR","shoulderR","torso"],["forearm-R","右前臂","elbowR","elbowR","upper-arm-R"],["hand-R","右手","wristR","wristR","forearm-R"],
    ["thigh-L","左大腿","hipL","hipL","torso"],["shin-L","左小腿","kneeL","kneeL","thigh-L"],["foot-L","左脚","ankleL","ankleL","shin-L"],
    ["thigh-R","右大腿","hipR","hipR","torso"],["shin-R","右小腿","kneeR","kneeR","thigh-R"],["foot-R","右脚","ankleR","ankleR","shin-R"]
  ];
  state.layers=defs.map(([id,label,pivot,bone,parent])=>{const c=buildLayerMask(id),j=state.joints.find(x=>x.id===pivot);return{id,label,pivot,bone,parent,canvas:c,x:j?.x??0,y:j?.y??0,source:"ml-subject ∩ rig-region"}});
  const w=state.source.width,h=state.source.height;
  state.manifest={schemaVersion:"0.1.0",studio:"Character Rig Forge",source:{name:state.file?.name??"unknown",width:w,height:h},
    inference:{subjectModel:MATTE_MODEL,poseModel:POSE_MODEL,mode:state.pose?.landmarks?.length?"ml+geometric":"fallback+geometric"},
    joints:Object.fromEntries(state.joints.map(j=>[j.id,{label:j.label,x:j.x/w,y:j.y/h}])),
    bones:state.bones,layers:state.layers.map(l=>({id:l.id,label:l.label,parent:l.parent,pivot:l.pivot,bone:l.bone,x:l.x/w,y:l.y/h,source:l.source}))};
  step(4,"done");ui.jointCount.textContent=state.joints.length;ui.boneCount.textContent=state.bones.length;ui.layerCount.textContent=state.layers.length;
  ui.mode.textContent=state.pose?.landmarks?.length?"ML":"Fallback";ui.badge.textContent="已生成";ui.badge.style.color="var(--accent)";ui.manifest.disabled=false;ui.all.disabled=false;
  renderJoints();renderLayers();drawView();modelStatus("ML 解析完成","ready");
}

function drawView(){
  const c=ui.canvas,ctx=c.getContext("2d"),w=c.width,h=c.height;if(!w||!h)return;ctx.clearRect(0,0,w,h);
  if(ui.subject.checked&&state.subject.width){ctx.globalAlpha=.95;ctx.drawImage(state.subject,0,0)}else if(state.source.width)ctx.drawImage(state.source,0,0);ctx.globalAlpha=1;
  if(ui.skeleton.checked&&state.joints.length){ctx.lineWidth=Math.max(2,Math.min(w,h)/500);ctx.lineCap="round";ctx.strokeStyle="#7de2ff";const m=new Map(state.joints.map(j=>[j.id,j]));
    for(const b of state.bones){const a=m.get(b.a),d=m.get(b.b);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(d.x,d.y);ctx.stroke()}
    for(const j of state.joints){ctx.fillStyle="#d6ff67";ctx.beginPath();ctx.arc(j.x,j.y,Math.max(4,Math.min(w,h)/180),0,Math.PI*2);ctx.fill()}
  }
}
function renderJoints(){if(!state.joints.length){ui.joints.className="list empty-list";ui.joints.textContent="上传并解析后显示关节。";return}
  ui.joints.className="list";ui.joints.innerHTML=state.joints.map(j=>'<div class="joint-row"><span class="dot"></span><div><div class="row-name">'+j.label+'</div><div class="row-meta">'+j.x.toFixed(0)+', '+j.y.toFixed(0)+'</div></div><span class="row-meta">'+j.id+'</span></div>').join("");
}
function renderLayers(){if(!state.layers.length){ui.layers.className="list empty-list";ui.layers.textContent="上传并解析后生成图层。";return}
  ui.layers.className="list";ui.layers.innerHTML=state.layers.map(l=>'<div class="layer-row"><span class="layer-dot"></span><div><div class="row-name">'+l.label+'</div><div class="row-meta">pivot: '+l.pivot+' · parent: '+l.parent+'</div></div><button class="mini-btn" data-layer="'+l.id+'">PNG</button></div>').join("");
  ui.layers.querySelectorAll("[data-layer]").forEach(b=>b.addEventListener("click",()=>downloadLayer(b.dataset.layer)));
}
function blobOf(c){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error("PNG export failed")),"image/png"))}
async function downloadLayer(id){const l=state.layers.find(x=>x.id===id);if(!l)return;const u=URL.createObjectURL(await blobOf(l.canvas)),a=document.createElement("a");a.href=u;a.download=id+".png";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
async function downloadAll(){for(const l of state.layers)await downloadLayer(l.id)}
function downloadManifest(){if(!state.manifest)return;const u=URL.createObjectURL(new Blob([JSON.stringify(state.manifest,null,2)],{type:"application/json"})),a=document.createElement("a");a.href=u;a.download="rig-manifest.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}

async function analyze(){if(!state.file)return;ui.analyze.disabled=true;try{await runMatte();await runPose();buildRig();buildLayers()}catch(e){console.error(e);modelStatus("解析出错 · 查看控制台","busy")}finally{ui.analyze.disabled=false}}
function reset(){if(state.url)URL.revokeObjectURL(state.url);state.file=null;state.img=null;state.pose=null;state.poseNamed=null;state.joints=[];state.bones=[];state.layers=[];state.manifest=null;
  ui.input.value="";ui.analyze.disabled=true;ui.manifest.disabled=true;ui.all.disabled=true;ui.jointCount.textContent="—";ui.boneCount.textContent="—";ui.layerCount.textContent="—";ui.mode.textContent="—";ui.meta.textContent="等待立绘";ui.badge.textContent="未生成";ui.badge.style.color="";
  ui.joints.className="list empty-list";ui.joints.textContent="上传并解析后显示关节。";ui.layers.className="list empty-list";ui.layers.textContent="上传并解析后生成图层。";resetSteps();ui.canvas.width=1;ui.canvas.height=1;ui.frame.classList.add("empty");ui.frame.querySelector(".empty-stage").style.display="flex";modelStatus("等待立绘");
}
async function accept(file){if(!file||!file.type.startsWith("image/"))return;state.file=file;setupSource(await loadImage(file));ui.analyze.disabled=false;modelStatus("图片已载入","ready")}
ui.choose.addEventListener("click",e=>{e.stopPropagation();ui.input.click()});ui.drop.addEventListener("click",e=>{if(!e.target.closest("button"))ui.input.click()});ui.input.addEventListener("change",e=>accept(e.target.files?.[0]));
["dragenter","dragover"].forEach(ev=>ui.drop.addEventListener(ev,e=>{e.preventDefault();ui.drop.classList.add("dragover")}));["dragleave","drop"].forEach(ev=>ui.drop.addEventListener(ev,e=>{e.preventDefault();ui.drop.classList.remove("dragover")}));
ui.drop.addEventListener("drop",e=>accept(e.dataTransfer.files?.[0]));ui.analyze.addEventListener("click",analyze);ui.reset.addEventListener("click",reset);ui.skeleton.addEventListener("change",drawView);ui.subject.addEventListener("change",drawView);ui.manifest.addEventListener("click",downloadManifest);ui.all.addEventListener("click",downloadAll);
reset();
