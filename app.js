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
  source:document.createElement("canvas"),subject:document.createElement("canvas"),sam3:null,sam3Processor:null,sam3Image:null,
  parts:[],visionWorker:null,visionSeq:0,visionRequests:new Map()
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
  try{state.pose=await (await getPoseModel()).detect(state.img);state.poseNamed=normalizePose(state.pose)}
  catch(e){console.warn("pose",e);state.poseNamed=fallbackPose()}
}

function getVisionWorker(){
  if(state.visionWorker)return state.visionWorker;
  state.visionWorker=new Worker("./vision-worker.js",{type:"module"});
  state.visionWorker.addEventListener("message",e=>{
    const d=e.data||{},req=state.visionRequests.get(d.id);
    if(!req)return;
    if(d.type==="result"){state.visionRequests.delete(d.id);req.resolve(d)}
    else if(d.type==="error"){state.visionRequests.delete(d.id);req.reject(new Error(d.message))}
  });
  return state.visionWorker;
}
function visionRequest(message){
  return new Promise((resolve,reject)=>{
    const id=++state.visionSeq;
    state.visionRequests.set(id,{resolve,reject});
    getVisionWorker().postMessage({...message,id});
  });
}
const VISION_PHRASES=["hair","face","neck","shirt","top","dress","skirt","sleeve","glove","hand","left arm","right arm","left hand","right hand","left leg","right leg","left shoe","right shoe","ribbon","bow","accessory","bag","backpack","weapon","tail","wing","hat","jacket","coat","cape","stocking"];
const PHRASE_LABELS={hair:"头发",face:"脸",neck:"脖子",shirt:"上衣",top:"上衣",dress:"裙装",skirt:"裙子",sleeve:"衣袖",glove:"手套",hand:"手","left arm":"左手臂","right arm":"右手臂","left hand":"左手","right hand":"右手","left leg":"左腿","right leg":"右腿","left shoe":"左脚/鞋","right shoe":"右脚/鞋",ribbon:"丝带",bow:"蝴蝶结",accessory:"饰品",bag:"包",backpack:"背包",weapon:"武器",tail:"尾巴",wing:"翅膀",hat:"帽子",jacket:"外套",coat:"外套",cape:"披风",stocking:"长袜"};
function iouBox(a,b){
  const ax=Math.max(a[0],b[0]),ay=Math.max(a[1],b[1]),bx=Math.min(a[2],b[2]),by=Math.min(a[3],b[3]);
  const inter=Math.max(0,bx-ax)*Math.max(0,by-ay),aa=Math.max(1,(a[2]-a[0])*(a[3]-a[1])),ab=Math.max(1,(b[2]-b[0])*(b[3]-b[1]));
  return inter/Math.max(1,aa+ab-inter);
}
function normalizeVisionParts(parsed,w,h){
  const body=parsed?.["<CAPTION_TO_PHRASE_GROUNDING>"] ?? parsed?.["<OD>"] ?? Object.values(parsed||{})[0] ?? {};
  const boxes=body.bboxes||body.boxes||[],labels=body.bboxes_labels||body.labels||[],parts=[];
  for(let i=0;i<Math.min(boxes.length,labels.length);i++){
    const rawLabel=String(labels[i]??"object").trim().toLowerCase(),box=(boxes[i]||[]).map(Number);
    if(box.length!==4||box.some(n=>!Number.isFinite(n)))continue;
    const x1=Math.max(0,Math.min(w,box[0])),y1=Math.max(0,Math.min(h,box[1])),x2=Math.max(0,Math.min(w,box[2])),y2=Math.max(0,Math.min(h,box[3]));
    if(x2-x1<8||y2-y1<8||(x2-x1)*(y2-y1)<w*h*0.0015)continue;
    const canonical=PHRASE_LABELS[rawLabel]||rawLabel;
    if(parts.some(p=>p.label===canonical&&iouBox(p.box,[x1,y1,x2,y2])>.72))continue;
    parts.push({id:"part-"+(parts.length+1),label:canonical,query:rawLabel,box:[x1,y1,x2,y2],x:(x1+x2)/2,y:(y1+y2)/2,confidence:"Florence-2 grounded"});
  }
  return parts.slice(0,22);
}
async function runVisionParts(){
  step(2,"active");modelStatus("Florence-2 正在理解立绘部件…","busy");
  try{
    const result=await visionRequest({type:"run",imageUrl:state.url,text:VISION_PHRASES.join(", ")});
    state.parts=normalizeVisionParts(result.parsed,state.source.width,state.source.height);
    if(location.search.includes("demo"))state.parts=state.parts.slice(0,8);
    if(!state.parts.length)state.parts=[{id:"character",label:"角色主体",query:"character",box:[0,0,state.source.width,state.source.height],x:state.source.width/2,y:state.source.height/2,confidence:"主体兜底"}];
    step(2,"done");ui.mode.textContent="Florence-2";modelStatus("AI 部件理解完成 · "+state.parts.length+" 个候选部件","ready");
  }catch(e){
    console.warn("vision",e);state.parts=[{id:"character",label:"角色主体",query:"character",box:[0,0,state.source.width,state.source.height],x:state.source.width/2,y:state.source.height/2,confidence:"主体兜底"}];
    step(2,"done");ui.mode.textContent="主体兜底";modelStatus("视觉理解失败 · 只保留主体","busy");
  }
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
  if(!state.parts.length)return;
  step(3,"active");modelStatus("SAM3 正在沿真实轮廓拆分部件…","busy");
  await getSam3();
  const results=[];
  for(let i=0;i<state.parts.length;i++){
    const part=state.parts[i];
    if(part.id==="character"){
      const canvas=document.createElement("canvas");canvas.width=state.source.width;canvas.height=state.source.height;canvas.getContext("2d").drawImage(state.subject,0,0);
      results.push({...part,canvas,source:"ML subject"});continue;
    }
    try{
      const [x1,y1,x2,y2]=part.box;
      const inputs=await state.sam3Processor(state.sam3Image,{input_boxes:[[[x1,y1,x2,y2]]],return_tensors:"np"});
      const outputs=await state.sam3(inputs,{multimask_output:true});
      const processed=await state.sam3Processor.post_process_masks(outputs.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);
      const maskTensor=processed?.[0]?.[0];if(!maskTensor)throw new Error("empty mask");
      const maskImage=RawImage.fromTensor(maskTensor),scores=outputs.iou_scores?.data||[];
      const count=scores.length||1;let best=0;for(let j=1;j<count;j++)if(scores[j]>scores[best])best=j;
      const maskData=new Uint8Array(maskImage.width*maskImage.height);
      for(let p=0;p<maskData.length;p++)maskData[p]=maskImage.data[count*p+best]===1?255:0;
      const mc=document.createElement("canvas");mc.width=maskImage.width;mc.height=maskImage.height;const mi=mc.getContext("2d").createImageData(mc.width,mc.height);
      for(let p=0;p<maskData.length;p++){const o=p*4;mi.data[o]=255;mi.data[o+1]=255;mi.data[o+2]=255;mi.data[o+3]=maskData[p]}
      mc.getContext("2d").putImageData(mi,0,0);
      const canvas=applyMaskToSubject(mc),coverage=maskData.reduce((a,v)=>a+(v?1:0),0)/Math.max(1,maskData.length);
      const score=scores.length?("SAM3 "+scores[best].toFixed(2)):"SAM3";
      results.push({...part,canvas,source:"SAM3 mask ∩ Anime matte",confidence:score+(coverage<0.003?" · tiny":"")});
    }catch(e){
      console.warn("SAM3 part failed",part,e);
      const empty=document.createElement("canvas");empty.width=state.source.width;empty.height=state.source.height;
      results.push({...part,canvas:empty,source:"SAM3 failed",confidence:"待人工确认"});
    }
    modelStatus("SAM3 拆层 "+(i+1)+"/"+state.parts.length+" · "+part.label,"busy");
  }
  state.layers=results.map((p,i)=>({...p,z:i,zOrder:i,parent:i===0?"root":"character",pivot:"auto",bone:null}));
  const w=state.source.width,h=state.source.height;
  state.manifest.inference.sam3Model=SAM3_MODEL;
  state.manifest.inference.semanticModel="Florence-2 semantic grounding + SAM3 mask refinement";
  state.manifest.inference.decomposition="open-vocabulary region discovery → promptable mask extraction";
  state.manifest.layers=state.layers.map(l=>({id:l.id,label:l.label,parent:l.parent,pivot:l.pivot,zOrder:l.zOrder,x:l.x/w,y:l.y/h,box:l.box,source:l.source}));
  step(3,"done");step(4,"done");ui.mode.textContent="Florence-2 + SAM3";ui.layerCount.textContent=state.layers.length;
  ui.badge.textContent="真实轮廓层已生成";ui.badge.style.color="var(--accent)";ui.manifest.disabled=false;ui.all.disabled=false;renderLayers();drawView();modelStatus("AI 拆层完成 · "+state.layers.length+" 层","ready");
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

function buildLayers(){
  step(4,"active");
  const w=state.source.width,h=state.source.height;
  state.layers=state.parts.map((p,i)=>({
    ...p,z:i,zOrder:i,parent:"root",pivot:"auto",bone:null,
    canvas:(()=>{const c=document.createElement("canvas");c.width=w;c.height=h;return c})(),
    source:"waiting for SAM3 mask"
  }));
  state.manifest={schemaVersion:"0.3.0",studio:"Character Rig Forge",source:{name:state.file?.name??"unknown",width:w,height:h},
    inference:{subjectModel:MATTE_MODEL,poseModel:POSE_MODEL,mode:"vision-grounded",semanticModel:"Florence-2",decomposition:"grounded regions pending SAM3"},
    joints:Object.fromEntries(state.joints.map(j=>[j.id,{label:j.label,x:j.x/w,y:j.y/h}])),bones:state.bones,
    layers:state.layers.map(l=>({id:l.id,label:l.label,parent:l.parent,pivot:l.pivot,zOrder:l.zOrder,x:l.x/w,y:l.y/h,box:l.box,source:l.source}))
  };
  ui.jointCount.textContent=state.joints.length||"—";ui.boneCount.textContent=state.bones.length||"—";ui.layerCount.textContent=state.layers.length;ui.mode.textContent="Florence-2";
  ui.badge.textContent="待 SAM3 精修";ui.badge.style.color="var(--accent)";ui.manifest.disabled=false;ui.all.disabled=false;renderJoints();renderLayers();drawView();step(4,"done");
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

async function analyze(){if(!state.file)return;ui.analyze.disabled=true;ui.sam.disabled=true;try{await runMatte();await runVisionParts();await runPose();buildRig();buildLayers();await runSam3LayerDecomposition()}catch(e){console.error(e);modelStatus("解析出错 · 已保留当前结果","busy")}finally{ui.analyze.disabled=false;ui.sam.disabled=false}}
function reset(){if(state.url)URL.revokeObjectURL(state.url);state.file=null;state.img=null;state.pose=null;state.poseNamed=null;state.joints=[];state.bones=[];state.layers=[];state.parts=[];state.manifest=null;
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
  getParts: () => JSON.parse(JSON.stringify(state.parts)),
  getLayerData: async () => {
    const out = {};
    for (const layer of state.layers) {
      const blob = await new Promise((resolve,reject)=>layer.canvas.toBlob(b=>b?resolve(b):reject(new Error("PNG export failed")),"image/png"));
      out[layer.id] = Array.from(new Uint8Array(await blob.arrayBuffer()));
    }
    return out;
  }
};
