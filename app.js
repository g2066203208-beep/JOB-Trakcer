import { pipeline, env as hfEnv, Sam3TrackerModel, AutoProcessor, RawImage } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm";
import { FilesetResolver, PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm";

hfEnv.allowLocalModels=false;
hfEnv.useBrowserCache=true;

const MATTE_MODEL="onnx-community/BEN2-ONNX";
const SAM3_MODEL="onnx-community/sam3-tracker-ONNX";
const POSE_MODEL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const WASM_ROOT="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const $=id=>document.getElementById(id);

const ui={
  drop:$("dropZone"),input:$("fileInput"),choose:$("chooseBtn"),analyze:$("analyzeBtn"),sam:$("samBtn"),reset:$("resetBtn"),
  canvas:$("viewCanvas"),frame:$("canvasFrame"),dot:$("modelDot"),status:$("modelStatus"),progress:$("progressText"),
  meta:$("imageMeta"),jointCount:$("jointCount"),boneCount:$("boneCount"),layerCount:$("layerCount"),mode:$("inferenceMode"),
  joints:$("jointList"),layers:$("layerList"),manifest:$("manifestBtn"),all:$("downloadAllBtn"),skeleton:$("showSkeleton"),subject:$("showSubject"),badge:$("rigBadge")
};

const state={
  file:null,img:null,url:null,matte:null,poseModel:null,pose:null,poseNamed:null,joints:[],bones:[],layers:[],manifest:null,
  source:document.createElement("canvas"),subject:document.createElement("canvas"),sam3:null,sam3Processor:null,sam3Image:null
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
  state.matte=await pipeline("background-removal",MATTE_MODEL,{device:navigator.gpu?"webgpu":"wasm",dtype:navigator.gpu?"fp16":"q8"});return state.matte;
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

async function getSam3(){
  if(state.sam3 && state.sam3Processor)return;
  modelStatus("加载 SAM3 智能拆层…","busy");
  const opts={device:navigator.gpu?"webgpu":"wasm",dtype:navigator.gpu?"fp16":"q4"};
  state.sam3=await Sam3TrackerModel.from_pretrained(SAM3_MODEL,opts);
  state.sam3Processor=await AutoProcessor.from_pretrained(SAM3_MODEL);
  state.sam3Image=RawImage.fromCanvas(state.source);
}
function samplePoints(a,b){
  const m=mid(a,b);
  return [[Math.round(m.x),Math.round(m.y)]];
}
function boxFor(a,b,padX,padY){
  const x1=Math.max(0,Math.min(a.x,b.x)-padX),y1=Math.max(0,Math.min(a.y,b.y)-padY);
  const x2=Math.min(state.source.width,Math.max(a.x,b.x)+padX),y2=Math.min(state.source.height,Math.max(a.y,b.y)+padY);
  return [Math.round(x1),Math.round(y1),Math.round(x2),Math.round(y2)];
}
function pointPair(a,b){return [[Math.round((a.x+b.x)/2),Math.round((a.y+b.y)/2)]]}
function semanticPromptSet(){
  const q=state.poseNamed, m=state.meta, cx=m.head.x, cy=m.head.y;
  const shoulder=mid(q.leftShoulder,q.rightShoulder), hip=mid(q.leftHip,q.rightHip);
  const headBox=[Math.max(0,Math.round(cx-m.r*1.15)),Math.max(0,Math.round(cy-m.r*1.35)),Math.min(state.source.width,Math.round(cx+m.r*1.15)),Math.min(state.source.height,Math.round(cy+m.r*1.35))];
  const eyeY=cy+m.r*.14, eyeDX=Math.max(10,m.r*.28), mouthY=cy+m.r*.48;
  return [
    {id:"back-hair",points:[[Math.round(cx),Math.round(cy-m.r*.62)]],box:headBox},
    {id:"head",points:[[Math.round(cx),Math.round(cy)]],box:headBox},
    {id:"face",points:[[Math.round(cx),Math.round(cy+m.r*.18)]],box:[...headBox]},
    {id:"eye-L",points:[[Math.round(cx-eyeDX),Math.round(eyeY)]],box:[Math.max(0,Math.round(cx-m.r*.55)),Math.max(0,Math.round(eyeY-m.r*.23)),Math.round(cx),Math.round(eyeY+m.r*.23)]},
    {id:"eye-R",points:[[Math.round(cx+eyeDX),Math.round(eyeY)]],box:[Math.round(cx),Math.max(0,Math.round(eyeY-m.r*.23)),Math.min(state.source.width,Math.round(cx+m.r*.55)),Math.round(eyeY+m.r*.23)]},
    {id:"mouth",points:[[Math.round(cx),Math.round(mouthY)]],box:[Math.max(0,Math.round(cx-m.r*.42)),Math.max(0,Math.round(mouthY-m.r*.18)),Math.min(state.source.width,Math.round(cx+m.r*.42)),Math.min(state.source.height,Math.round(mouthY+m.r*.18))]},
    {id:"front-hair",points:[[Math.round(cx),Math.round(cy-m.r*.9)]],box:headBox},
    {id:"neck",points:[[Math.round(mid(q.leftShoulder,q.rightShoulder).x),Math.round(mid(q.leftShoulder,q.rightShoulder).y)]],box:boxFor(q.leftShoulder,q.rightShoulder,Math.max(8,m.r*.16),Math.max(8,m.r*.18))},
    {id:"torso",points:pointPair(shoulder,hip),box:boxFor(shoulder,hip,Math.max(10,m.r*.3),Math.max(14,m.r*.25))},
    {id:"clothes",points:pointPair(shoulder,hip),box:boxFor(shoulder,hip,Math.max(16,m.r*.48),Math.max(12,m.r*.3))},
    {id:"accessory",points:[[Math.round(cx),Math.round(hip.y-m.r*.1)]],box:boxFor(shoulder,hip,Math.max(22,m.r*.55),Math.max(12,m.r*.2))},
    {id:"upper-arm-L",points:pointPair(q.leftShoulder,q.leftElbow),box:boxFor(q.leftShoulder,q.leftElbow,Math.max(12,len(q.leftShoulder,q.leftElbow)*.24),Math.max(12,len(q.leftShoulder,q.leftElbow)*.24))},
    {id:"forearm-L",points:pointPair(q.leftElbow,q.leftWrist),box:boxFor(q.leftElbow,q.leftWrist,Math.max(12,len(q.leftElbow,q.leftWrist)*.26),Math.max(12,len(q.leftElbow,q.leftWrist)*.26))},
    {id:"hand-L",points:[[Math.round(q.leftWrist.x),Math.round(q.leftWrist.y)]],box:boxFor(q.leftWrist,q.leftWrist,Math.max(16,m.r*.16),Math.max(16,m.r*.16))},
    {id:"upper-arm-R",points:pointPair(q.rightShoulder,q.rightElbow),box:boxFor(q.rightShoulder,q.rightElbow,Math.max(12,len(q.rightShoulder,q.rightElbow)*.24),Math.max(12,len(q.rightShoulder,q.rightElbow)*.24))},
    {id:"forearm-R",points:pointPair(q.rightElbow,q.rightWrist),box:boxFor(q.rightElbow,q.rightWrist,Math.max(12,len(q.rightElbow,q.rightWrist)*.26),Math.max(12,len(q.rightElbow,q.rightWrist)*.26))},
    {id:"hand-R",points:[[Math.round(q.rightWrist.x),Math.round(q.rightWrist.y)]],box:boxFor(q.rightWrist,q.rightWrist,Math.max(16,m.r*.16),Math.max(16,m.r*.16))},
    {id:"thigh-L",points:pointPair(q.leftHip,q.leftKnee),box:boxFor(q.leftHip,q.leftKnee,Math.max(18,len(q.leftHip,q.leftKnee)*.22),Math.max(18,len(q.leftHip,q.leftKnee)*.22))},
    {id:"shin-L",points:pointPair(q.leftKnee,q.leftAnkle),box:boxFor(q.leftKnee,q.leftAnkle,Math.max(18,len(q.leftKnee,q.leftAnkle)*.24),Math.max(18,len(q.leftKnee,q.leftAnkle)*.24))},
    {id:"foot-L",points:[[Math.round(q.leftFoot.x),Math.round(q.leftFoot.y)]],box:boxFor(q.leftAnkle,q.leftFoot,Math.max(18,m.r*.22),Math.max(14,m.r*.18))},
    {id:"thigh-R",points:pointPair(q.rightHip,q.rightKnee),box:boxFor(q.rightHip,q.rightKnee,Math.max(18,len(q.rightHip,q.rightKnee)*.22),Math.max(18,len(q.rightHip,q.rightKnee)*.22))},
    {id:"shin-R",points:pointPair(q.rightKnee,q.rightAnkle),box:boxFor(q.rightKnee,q.rightAnkle,Math.max(18,len(q.rightKnee,q.rightAnkle)*.24),Math.max(18,len(q.rightKnee,q.rightAnkle)*.24))},
    {id:"foot-R",points:[[Math.round(q.rightFoot.x),Math.round(q.rightFoot.y)]],box:boxFor(q.rightAnkle,q.rightFoot,Math.max(18,m.r*.22),Math.max(14,m.r*.18))}
  ];
}
function rigPromptPoints(){ return semanticPromptSet(); }

function tensorMaskToCanvas(mask,w,h){
  const c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d"),img=ctx.createImageData(w,h);
  const data=mask.data ?? mask, mdims=mask.dims ?? [];
  let mw=w,mh=h;
  if(mdims.length>=2){mh=mdims[mdims.length-2];mw=mdims[mdims.length-1]}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sx=Math.min(mw-1,Math.floor(x*mw/w)),sy=Math.min(mh-1,Math.floor(y*mh/h));
    const v=data[sy*mw+sx] ? 255 : 0, i=(y*w+x)*4;img.data[i]=255;img.data[i+1]=255;img.data[i+2]=255;img.data[i+3]=v;
  }
  ctx.putImageData(img,0,0);return c;
}
function applyMaskToSubject(maskCanvas){
  const c=document.createElement("canvas");c.width=state.source.width;c.height=state.source.height;const ctx=c.getContext("2d");
  ctx.drawImage(state.subject,0,0);ctx.globalCompositeOperation="destination-in";ctx.drawImage(maskCanvas,0,0);ctx.globalCompositeOperation="source-over";return c;
}
async function runSam3LayerDecomposition(){
  if(!state.joints.length)return;
  step(3,"active");modelStatus("SAM3 正在生成部件 mask…","busy");
  await getSam3();
  const prompts=rigPromptPoints();
  const inputPoints=[prompts.map(x=>x.points)];
  const inputLabels=[prompts.map(()=>[1])];
  const inputBoxes=[prompts.map(x=>x.box)];
  const inputs=await state.sam3Processor({images:state.sam3Image,input_points:inputPoints,input_labels:inputLabels,input_boxes:inputBoxes,return_tensors:"np"});
  const outputs=await state.sam3(inputs,{multimask_output:false});
  const processed=await state.sam3Processor.post_process_masks(outputs.pred_masks,inputs.original_sizes);
  const packed=processed?.[0];
  if(!packed)throw new Error("SAM3 returned no masks");
  const dims=packed.dims??[], count=prompts.length;
  const masks=[];
  for(let i=0;i<count;i++){
    let mask;
    if(dims.length===4){const h=dims[2],w=dims[3];const sliceSize=h*w;mask={data:packed.data.slice(i*sliceSize,(i+1)*sliceSize),dims:[h,w]}}
    else if(dims.length===3){const h=dims[1],w=dims[2];const sliceSize=h*w;mask={data:packed.data.slice(i*sliceSize,(i+1)*sliceSize),dims:[h,w]}}
    else mask=packed;
    masks.push(mask);
  }
  const byId=new Map(prompts.map((p,i)=>[p.id,masks[i]]));
  for(const layer of state.layers){
    const mask=byId.get(layer.id);
    if(!mask)continue;
    layer.canvas=applyMaskToSubject(tensorMaskToCanvas(mask,state.source.width,state.source.height));
    layer.source="SAM3 mask ∩ ML subject";layer.confidence="model-mask";
  }
  state.manifest.inference.sam3Model=SAM3_MODEL;state.manifest.inference.semanticModel="SAM3 promptable visual segmentation";
  state.manifest.inference.decomposition="SAM3 tracker multi-object point prompts";
  state.manifest.layers=state.layers.map(l=>({id:l.id,label:l.label,parent:l.parent,pivot:l.pivot,bone:l.bone,x:l.x/state.source.width,y:l.y/state.source.height,source:l.source}));
  step(3,"done");step(4,"done");ui.mode.textContent="SAM3 + ML";renderLayers();drawView();modelStatus("SAM3 智能拆层完成","ready");
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
  const centerHead={x:m.head.x,y:m.head.y};
  switch(name){
    case"back-hair":ellipse({x:m.head.x,y:m.head.y-m.r*.28},m.r*1.18,m.r*.98);break;
    case"head":ellipse(m.head,m.r,m.r*1.10);break;
    case"front-hair":ellipse({x:m.head.x,y:m.head.y-m.r*.50},m.r*1.10,m.r*.52);break;
    case"face":ellipse({x:m.head.x,y:m.head.y+m.r*.12},m.r*.76,m.r*.86);break;
    case"eye-L":circle({x:m.head.x-m.r*.30,y:m.head.y+m.r*.12},Math.max(5,m.r*.09));break;
    case"eye-R":circle({x:m.head.x+m.r*.30,y:m.head.y+m.r*.12},Math.max(5,m.r*.09));break;
    case"mouth":capsule({x:m.head.x-m.r*.18,y:m.head.y+m.r*.48},{x:m.head.x+m.r*.18,y:m.head.y+m.r*.48},Math.max(4,m.r*.065));break;
    case"neck":capsule(q.leftShoulder,q.rightShoulder,Math.max(10,len(q.leftShoulder,q.rightShoulder)*.18));break;
    case"torso":{const a=q.leftShoulder,b=q.rightShoulder,c1=q.rightHip,d=q.leftHip,p=Math.max(10,len(a,b)*.08);ctx.beginPath();ctx.moveTo(a.x-p,a.y-p);ctx.lineTo(b.x+p,b.y-p);ctx.lineTo(c1.x+p,c1.y+p);ctx.lineTo(d.x-p,d.y+p);ctx.closePath();ctx.fill();break}
    case"clothes":{const a=q.leftShoulder,b=q.rightShoulder,c1=q.rightHip,d=q.leftHip,p=Math.max(16,len(a,b)*.18);ctx.beginPath();ctx.moveTo(a.x-p,a.y-p);ctx.lineTo(b.x+p,b.y-p);ctx.lineTo(c1.x+p,c1.y+p);ctx.lineTo(d.x-p,d.y+p);ctx.closePath();ctx.fill();break}
    case"accessory":{circle(mid(q.leftHip,q.rightHip),Math.max(12,m.r*.14));break}
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
  const q=state.poseNamed;
  const pivotMap={
    "back-hair":"neck","front-hair":"head","head":"neck","face":"head","eye-L":"head","eye-R":"head","mouth":"head","neck":"neck","torso":"neck","clothes":"neck","accessory":"neck",
    "upper-arm-L":"shoulderL","forearm-L":"elbowL","hand-L":"wristL","upper-arm-R":"shoulderR","forearm-R":"elbowR","hand-R":"wristR",
    "thigh-L":"hipL","shin-L":"kneeL","foot-L":"ankleL","thigh-R":"hipR","shin-R":"kneeR","foot-R":"ankleR"
  };
  const parentMap={
    "back-hair":"body","head":"body","front-hair":"head","face":"head","eye-L":"face","eye-R":"face","mouth":"face","neck":"root","torso":"root","clothes":"torso","accessory":"torso",
    "upper-arm-L":"torso","forearm-L":"upper-arm-L","hand-L":"forearm-L","upper-arm-R":"torso","forearm-R":"upper-arm-R","hand-R":"forearm-R",
    "thigh-L":"torso","shin-L":"thigh-L","foot-L":"shin-L","thigh-R":"torso","shin-R":"thigh-R","foot-R":"shin-R"
  };
  const labels={
    "back-hair":"后发","front-hair":"前发","head":"头","face":"脸","eye-L":"左眼","eye-R":"右眼","mouth":"嘴","neck":"脖子","torso":"躯干","clothes":"衣服","accessory":"饰品",
    "upper-arm-L":"左上臂","forearm-L":"左前臂","hand-L":"左手","upper-arm-R":"右上臂","forearm-R":"右前臂","hand-R":"右手",
    "thigh-L":"左大腿","shin-L":"左小腿","foot-L":"左脚","thigh-R":"右大腿","shin-R":"右小腿","foot-R":"右脚"
  };
  const order=["back-hair","thigh-L","thigh-R","torso","upper-arm-L","upper-arm-R","forearm-L","forearm-R","clothes","neck","head","face","eye-L","eye-R","mouth","front-hair","hand-L","hand-R","shin-L","shin-R","foot-L","foot-R","accessory"];
  const promptSet=semanticPromptSet();
  const pivots=state.joints;
  const guessPoint={
    "back-hair":q.nose,"front-hair":q.nose,"head":q.nose,"face":q.nose,"eye-L":{x:q.nose.x-len(q.leftShoulder,q.rightShoulder)*.28,y:q.nose.y+len(q.leftShoulder,q.rightShoulder)*.08},
    "eye-R":{x:q.nose.x+len(q.leftShoulder,q.rightShoulder)*.28,y:q.nose.y+len(q.leftShoulder,q.rightShoulder)*.08},"mouth":{x:q.nose.x,y:q.nose.y+len(q.leftShoulder,q.rightShoulder)*.30},
    "neck":mid(q.leftShoulder,q.rightShoulder),"torso":mid(mid(q.leftShoulder,q.rightShoulder),mid(q.leftHip,q.rightHip)),"clothes":mid(mid(q.leftShoulder,q.rightShoulder),mid(q.leftHip,q.rightHip)),
    "accessory":mid(q.leftHip,q.rightHip),"upper-arm-L":mid(q.leftShoulder,q.leftElbow),"forearm-L":mid(q.leftElbow,q.leftWrist),"hand-L":q.leftWrist,
    "upper-arm-R":mid(q.rightShoulder,q.rightElbow),"forearm-R":mid(q.rightElbow,q.rightWrist),"hand-R":q.rightWrist,
    "thigh-L":mid(q.leftHip,q.leftKnee),"shin-L":mid(q.leftKnee,q.leftAnkle),"foot-L":q.leftFoot,"thigh-R":mid(q.rightHip,q.rightKnee),"shin-R":mid(q.rightKnee,q.rightAnkle),"foot-R":q.rightFoot
  };
  const promptById=new Map(promptSet.map(x=>[x.id,x]));
  state.layers=order.map((id,z)=>{
    const canvas=buildLayerMask(id) || document.createElement("canvas");
    const j=pivots.find(x=>x.id===pivotMap[id]);
    return {id,label:labels[id],pivot:pivotMap[id],parent:parentMap[id],canvas,x:j?.x??guessPoint[id]?.x??0,y:j?.y??guessPoint[id]?.y??0,z,zOrder:z,source:"ml-subject ∩ semantic-rig-region",prompt:promptById.get(id)};
  });
  const w=state.source.width,h=state.source.height;
  state.manifest={schemaVersion:"0.2.0",studio:"Character Rig Forge",source:{name:state.file?.name??"unknown",width:w,height:h},
    inference:{subjectModel:MATTE_MODEL,poseModel:POSE_MODEL,mode:state.pose?.landmarks?.length?"ml+geometric":"fallback+geometric",semanticModel:null,decomposition:"semantic candidates pending SAM3"},
    joints:Object.fromEntries(state.joints.map(j=>[j.id,{label:j.label,x:j.x/w,y:j.y/h}])),bones:state.bones,
    layers:state.layers.map(l=>({id:l.id,label:l.label,parent:l.parent,pivot:l.pivot,zOrder:l.zOrder,x:l.x/w,y:l.y/h,source:l.source}))
  };
  step(4,"done");ui.jointCount.textContent=state.joints.length;ui.boneCount.textContent=state.bones.length;ui.layerCount.textContent=state.layers.length;ui.mode.textContent=state.pose?.landmarks?.length?"ML":"Fallback";
  ui.badge.textContent="语义候选已生成";ui.badge.style.color="var(--accent)";ui.manifest.disabled=false;ui.all.disabled=false;ui.sam.disabled=false;renderJoints();renderLayers();drawView();modelStatus("语义拆层候选就绪 · 等待 SAM3","ready");
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
  ui.layers.className="layer-gallery";
  ui.layers.innerHTML=state.layers.map(l=>'<article class="layer-card" data-layer-card="'+l.id+'"><div class="layer-thumb-wrap"><canvas class="layer-thumb" width="96" height="96" data-thumb="'+l.id+'"></canvas></div><div class="layer-info"><div class="layer-title">'+l.label+'</div><div class="layer-meta">Z '+l.zOrder+' · '+(l.confidence??"候选")+'</div></div><div class="layer-actions"><button class="mini-btn" data-preview="'+l.id+'">查看</button><button class="mini-btn" data-layer="'+l.id+'">PNG</button></div></article>').join("");
  ui.layers.querySelectorAll("[data-thumb]").forEach(t=>{const l=state.layers.find(x=>x.id===t.dataset.thumb);if(!l?.canvas)return;const ctx=t.getContext("2d");const s=Math.min(92/l.canvas.width,92/l.canvas.height);const w=Math.max(1,Math.round(l.canvas.width*s)),h=Math.max(1,Math.round(l.canvas.height*s));ctx.clearRect(0,0,96,96);ctx.drawImage(l.canvas,Math.round((96-w)/2),Math.round((96-h)/2),w,h)});
  ui.layers.querySelectorAll("[data-layer]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();downloadLayer(b.dataset.layer)}));
  ui.layers.querySelectorAll("[data-preview]").forEach(b=>b.addEventListener("click",()=>showLayerPreview(b.dataset.preview)));
}
function showLayerPreview(id){const l=state.layers.find(x=>x.id===id);if(!l?.canvas)return;ui.canvas.width=state.source.width;ui.canvas.height=state.source.height;const ctx=ui.canvas.getContext("2d");ctx.clearRect(0,0,ui.canvas.width,ui.canvas.height);ctx.drawImage(l.canvas,0,0);ui.meta.textContent=l.label+" · "+state.source.width+" × "+state.source.height;ui.mode.textContent=(l.confidence==="model-mask"?"SAM3":"候选")+" · 单层预览";}
function blobOf(c){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error("PNG export failed")),"image/png"))}
async function downloadLayer(id){const l=state.layers.find(x=>x.id===id);if(!l)return;const u=URL.createObjectURL(await blobOf(l.canvas)),a=document.createElement("a");a.href=u;a.download=id+".png";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
async function downloadAll(){for(const l of state.layers)await downloadLayer(l.id)}
function downloadManifest(){if(!state.manifest)return;const u=URL.createObjectURL(new Blob([JSON.stringify(state.manifest,null,2)],{type:"application/json"})),a=document.createElement("a");a.href=u;a.download="rig-manifest.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}

async function analyze(){if(!state.file)return;ui.analyze.disabled=true;ui.sam.disabled=true;try{await runMatte();await runPose();buildRig();buildLayers()}catch(e){console.error(e);modelStatus("解析出错 · 查看控制台","busy")}finally{ui.analyze.disabled=false}}
function reset(){if(state.url)URL.revokeObjectURL(state.url);state.file=null;state.img=null;state.pose=null;state.poseNamed=null;state.joints=[];state.bones=[];state.layers=[];state.manifest=null;
  ui.input.value="";ui.analyze.disabled=true;ui.manifest.disabled=true;ui.all.disabled=true;ui.sam.disabled=true;ui.jointCount.textContent="—";ui.boneCount.textContent="—";ui.layerCount.textContent="—";ui.mode.textContent="—";ui.meta.textContent="等待立绘";ui.badge.textContent="未生成";ui.badge.style.color="";
  ui.joints.className="list empty-list";ui.joints.textContent="上传并解析后显示关节。";ui.layers.className="list empty-list";ui.layers.textContent="上传并解析后生成图层。";resetSteps();ui.canvas.width=1;ui.canvas.height=1;ui.frame.classList.add("empty");ui.frame.querySelector(".empty-stage").style.display="flex";modelStatus("等待立绘");
}
async function accept(file){if(!file||!file.type.startsWith("image/"))return;state.file=file;setupSource(await loadImage(file));ui.analyze.disabled=false;modelStatus("图片已载入","ready")}
ui.choose.addEventListener("click",e=>{e.stopPropagation();ui.input.click()});ui.drop.addEventListener("click",e=>{if(!e.target.closest("button"))ui.input.click()});ui.input.addEventListener("change",e=>accept(e.target.files?.[0]));
["dragenter","dragover"].forEach(ev=>ui.drop.addEventListener(ev,e=>{e.preventDefault();ui.drop.classList.add("dragover")}));["dragleave","drop"].forEach(ev=>ui.drop.addEventListener(ev,e=>{e.preventDefault();ui.drop.classList.remove("dragover")}));
ui.drop.addEventListener("drop",e=>accept(e.dataTransfer.files?.[0]));ui.analyze.addEventListener("click",analyze);ui.sam.addEventListener("click",async()=>{ui.sam.disabled=true;try{await runSam3LayerDecomposition()}catch(e){console.error(e);modelStatus("SAM3 失败 · 保留当前 mask","busy")}finally{ui.sam.disabled=false}});ui.reset.addEventListener("click",reset);ui.skeleton.addEventListener("change",drawView);ui.subject.addEventListener("change",drawView);ui.manifest.addEventListener("click",downloadManifest);ui.all.addEventListener("click",downloadAll);
reset();

window.CharacterRigForge = {
  getManifest: () => state.manifest ? JSON.parse(JSON.stringify(state.manifest)) : null,
  getLayerData: async () => {
    const out = {};
    for (const layer of state.layers) {
      const blob = await new Promise((resolve,reject)=>layer.canvas.toBlob(b=>b?resolve(b):reject(new Error("PNG export failed")),"image/png"));
      out[layer.id] = Array.from(new Uint8Array(await blob.arrayBuffer()));
    }
    return out;
  }
};
