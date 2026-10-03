const $ = (id) => document.getElementById(id);
const displayCanvas = $("displayCanvas");
const dctx = displayCanvas.getContext("2d", { alpha: true });
const previewCanvas = $("previewCanvas");
const pctx = previewCanvas.getContext("2d", { alpha: true });
const canvasHost = $("canvasHost");
const scroller = $("canvasScroller");

const paletteColors = [
  "#000000","#ffffff","#1f2430","#3b4252","#bf616a","#d08770",
  "#ebcb8b","#a3be8c","#88c0d0","#81a1c1","#5e81ac","#b48ead",
  "#2b2b2b","#5b4b49","#9c6b63","#d49a89","#f2c5b5","#ffe0c8",
  "#52425f","#786486","#a88faa","#c6b0c3","#6d7f59","#a8b47a"
];

const TOOL_LABELS = {
  pencil: "铅笔",
  eraser: "橡皮",
  fill: "填充",
  eyedropper: "吸管",
  move: "移动图层"
};

const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function packRGBA(r, g, b, a = 255) {
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;
}
function unpackRGBA(v) {
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
}
function hexToPacked(hex) {
  const h = hex.replace("#", "");
  return packRGBA(parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), 255);
}
function packedToHex(v) {
  const [r,g,b] = unpackRGBA(v);
  return "#" + [r,g,b].map(n => n.toString(16).padStart(2,"0")).join("");
}
function blend(dst, src, layerOpacity = 1) {
  const [sr,sg,sb,sa0] = unpackRGBA(src);
  const sa = (sa0 / 255) * layerOpacity;
  if (sa <= 0) return dst;
  if (sa >= 0.999) return packRGBA(sr,sg,sb,255);
  const [dr,dg,db,da0] = unpackRGBA(dst);
  const da = da0 / 255;
  const oa = sa + da * (1-sa);
  if (oa <= 0) return 0;
  const r = Math.round((sr*sa + dr*da*(1-sa))/oa);
  const g = Math.round((sg*sa + dg*da*(1-sa))/oa);
  const b = Math.round((sb*sa + db*da*(1-sa))/oa);
  return packRGBA(r,g,b,Math.round(oa*255));
}

function createBlankProject(width = 64, height = 64) {
  const baseLayer = { id: uid(), name: "角色线稿", visible: true, locked: false, opacity: 1 };
  return {
    version: 1,
    name: "未命名像素动画",
    width, height, fps: 8,
    layers: [baseLayer],
    frames: [{ id: uid(), cells: { [baseLayer.id]: new Uint32Array(width*height) } }]
  };
}

let project = createBlankProject();
let currentFrame = 0;
let currentLayerId = project.layers[0].id;
let tool = "pencil";
let color = hexToPacked("#1f2430");
let zoom = 8;
let playing = false;
let playTimer = null;
let pointerDown = false;
let lastPixel = null;
let moveStart = null;
let moveOriginal = null;
let history = [];
let future = [];
let autosaveTimer = null;

function frame() { return project.frames[currentFrame]; }
function layer() { return project.layers.find(l => l.id === currentLayerId) || project.layers[0]; }
function cells(frameObj = frame(), layerId = currentLayerId) {
  if (!frameObj.cells[layerId]) frameObj.cells[layerId] = new Uint32Array(project.width * project.height);
  return frameObj.cells[layerId];
}
function setStatus(msg) { $("status").textContent = msg; }

function snapshot() {
  return JSON.stringify(serializeProject());
}
function pushHistory() {
  history.push(snapshot());
  if (history.length > 40) history.shift();
  future = [];
}
function restoreSnapshot(raw) {
  const data = JSON.parse(raw);
  loadSerializedProject(data, false);
}
function undo() {
  if (!history.length) return;
  future.push(snapshot());
  restoreSnapshot(history.pop());
  setStatus("已撤销");
}
function redo() {
  if (!future.length) return;
  history.push(snapshot());
  restoreSnapshot(future.pop());
  setStatus("已重做");
}

function serializeProject() {
  return {
    version: 1,
    name: project.name,
    width: project.width,
    height: project.height,
    fps: project.fps,
    layers: project.layers.map(l => ({...l})),
    frames: project.frames.map(f => ({
      id: f.id,
      cells: Object.fromEntries(Object.entries(f.cells).map(([id, arr]) => [id, Array.from(arr)]))
    }))
  };
}
function loadSerializedProject(data, resetHistory = true) {
  if (!data || !Array.isArray(data.layers) || !Array.isArray(data.frames)) throw new Error("无效工程文件");
  const w = clamp(Number(data.width)||64, 8, 512);
  const h = clamp(Number(data.height)||64, 8, 512);
  project = {
    version: 1,
    name: data.name || "导入工程",
    width: w, height: h,
    fps: clamp(Number(data.fps)||8, 1, 60),
    layers: data.layers.map(l => ({
      id: l.id || uid(), name: l.name || "图层",
      visible: l.visible !== false, locked: !!l.locked,
      opacity: clamp(Number(l.opacity ?? 1),0,1)
    })),
    frames: data.frames.map(f => ({
      id: f.id || uid(),
      cells: Object.fromEntries(Object.entries(f.cells || {}).map(([id, arr]) => {
        const out = new Uint32Array(w*h);
        const src = Array.isArray(arr) ? arr : [];
        for (let i=0;i<Math.min(out.length,src.length);i++) out[i] = Number(src[i])>>>0;
        return [id,out];
      }))
    }))
  };
  if (!project.layers.length) {
    const l={id:uid(),name:"图层 1",visible:true,locked:false,opacity:1};
    project.layers=[l];
  }
  if (!project.frames.length) project.frames=[{id:uid(),cells:{}}];
  for (const f of project.frames) for (const l of project.layers) if (!f.cells[l.id]) f.cells[l.id]=new Uint32Array(w*h);
  currentFrame = 0;
  currentLayerId = project.layers[project.layers.length-1].id;
  $("fps").value = project.fps;
  $("canvasWidth").value = w;
  $("canvasHeight").value = h;
  if (resetHistory) { history=[]; future=[]; }
  refreshAll();
}

function compositeFrame(frameIndex) {
  const f = project.frames[frameIndex];
  const out = new Uint32Array(project.width * project.height);
  if (!f) return out;
  for (const l of project.layers) {
    if (!l.visible || l.opacity <= 0) continue;
    const src = f.cells[l.id];
    if (!src) continue;
    for (let i=0;i<out.length;i++) {
      if (src[i]) out[i] = blend(out[i], src[i], l.opacity);
    }
  }
  return out;
}

function arrayToSmallCanvas(arr) {
  const c = document.createElement("canvas");
  c.width = project.width; c.height = project.height;
  const cctx = c.getContext("2d");
  const img = cctx.createImageData(project.width, project.height);
  for (let i=0;i<arr.length;i++) {
    const [r,g,b,a] = unpackRGBA(arr[i]);
    const k=i*4; img.data[k]=r; img.data[k+1]=g; img.data[k+2]=b; img.data[k+3]=a;
  }
  cctx.putImageData(img,0,0);
  return c;
}

function renderEditor() {
  const w = project.width * zoom;
  const h = project.height * zoom;
  displayCanvas.width = w;
  displayCanvas.height = h;
  displayCanvas.style.width = w+"px";
  displayCanvas.style.height = h+"px";
  canvasHost.style.width = w+"px";
  canvasHost.style.height = h+"px";
  dctx.imageSmoothingEnabled = false;
  dctx.clearRect(0,0,w,h);

  if ($("onionSkin").checked) {
    const prev = currentFrame > 0 ? currentFrame-1 : null;
    const next = currentFrame < project.frames.length-1 ? currentFrame+1 : null;
    if (prev !== null) {
      dctx.globalAlpha=.22;
      dctx.drawImage(arrayToSmallCanvas(compositeFrame(prev)),0,0,w,h);
    }
    if (next !== null) {
      dctx.globalAlpha=.12;
      dctx.drawImage(arrayToSmallCanvas(compositeFrame(next)),0,0,w,h);
    }
  }
  dctx.globalAlpha=1;
  dctx.drawImage(arrayToSmallCanvas(compositeFrame(currentFrame)),0,0,w,h);

  if ($("showGrid").checked && zoom >= 5) {
    dctx.beginPath();
    dctx.strokeStyle="rgba(45,55,68,.34)";
    dctx.lineWidth=1;
    for(let x=0;x<=project.width;x++){dctx.moveTo(x*zoom+.5,0);dctx.lineTo(x*zoom+.5,h);}
    for(let y=0;y<=project.height;y++){dctx.moveTo(0,y*zoom+.5);dctx.lineTo(w,y*zoom+.5);}
    dctx.stroke();
  }
}

function renderPreview(frameIndex = currentFrame) {
  const arr = compositeFrame(frameIndex);
  const small = arrayToSmallCanvas(arr);
  pctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
  pctx.imageSmoothingEnabled = false;
  const scale = Math.min(previewCanvas.width/project.width, previewCanvas.height/project.height);
  const w=project.width*scale,h=project.height*scale;
  const x=(previewCanvas.width-w)/2,y=(previewCanvas.height-h)/2;
  pctx.drawImage(small,x,y,w,h);
  $("previewMeta").textContent = `Frame ${frameIndex+1}`;
}

function renderLayers() {
  const root=$("layersList"); root.innerHTML="";
  [...project.layers].reverse().forEach(l=>{
    const row=document.createElement("div");
    row.className="layer-item"+(l.id===currentLayerId?" active":"");
    row.dataset.id=l.id;
    const eye=document.createElement("button");eye.className="layer-eye";eye.textContent=l.visible?"◉":"○";eye.title="显示/隐藏";
    eye.onclick=(e)=>{e.stopPropagation();pushHistory();l.visible=!l.visible;refreshAll();scheduleAutosave();};
    const name=document.createElement("div");name.className="layer-name";name.textContent=l.name;name.title="双击重命名";
    name.ondblclick=(e)=>{e.stopPropagation();const v=prompt("图层名称",l.name);if(v){pushHistory();l.name=v.trim()||l.name;renderLayers();scheduleAutosave();}};
    const lock=document.createElement("button");lock.className="layer-lock";lock.textContent=l.locked?"🔒":"◇";lock.title="锁定/解锁";
    lock.onclick=(e)=>{e.stopPropagation();pushHistory();l.locked=!l.locked;renderLayers();scheduleAutosave();};
    row.append(eye,name,lock);
    row.onclick=()=>{currentLayerId=l.id;$("layerOpacity").value=l.opacity;renderLayers();};
    root.appendChild(row);
  });
  $("layerOpacity").value = layer()?.opacity ?? 1;
}

function renderTimeline() {
  const strip=$("timelineStrip"); strip.innerHTML="";
  project.frames.forEach((f,i)=>{
    const card=document.createElement("div");
    card.className="frame-card"+(i===currentFrame?" active":"");
    const thumb=document.createElement("canvas");thumb.className="frame-thumb";thumb.width=88;thumb.height=88;
    const t=thumb.getContext("2d");t.imageSmoothingEnabled=false;
    const small=arrayToSmallCanvas(compositeFrame(i));
    const scale=Math.min(88/project.width,88/project.height);
    const w=project.width*scale,h=project.height*scale;
    t.drawImage(small,(88-w)/2,(88-h)/2,w,h);
    const label=document.createElement("div");label.className="frame-label";label.innerHTML=`<span>F${i+1}</span><span>${Math.round(1000/project.fps)}ms</span>`;
    card.append(thumb,label);
    card.onclick=()=>{currentFrame=i;refreshAll();};
    strip.appendChild(card);
  });
  $("frameCounter").textContent=`${currentFrame+1} / ${project.frames.length}`;
}

function refreshMeta() {
  $("projectName").textContent=project.name;
  $("canvasMeta").textContent=`${project.width}×${project.height}`;
  $("zoomValue").textContent=`${zoom*100}%`;
  $("toolName").textContent=TOOL_LABELS[tool] || tool;
  $("hexLabel").textContent=packedToHex(color);
}
function refreshAll() {
  refreshMeta(); renderEditor(); renderPreview(); renderLayers(); renderTimeline();
}
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer=setTimeout(()=>{
    try{localStorage.setItem("pixel-motion-studio-autosave",snapshot());setStatus("已自动保存到浏览器");}catch{}
  },350);
}

function pixelFromEvent(e) {
  const rect=displayCanvas.getBoundingClientRect();
  const x=Math.floor((e.clientX-rect.left)/rect.width*project.width);
  const y=Math.floor((e.clientY-rect.top)/rect.height*project.height);
  return {x:clamp(x,0,project.width-1),y:clamp(y,0,project.height-1)};
}
function indexAt(x,y){return y*project.width+x;}
function canEdit(){const l=layer();return l&&!l.locked;}

function paintPixel(x,y,value) {
  if(!canEdit())return;
  cells()[indexAt(x,y)] = value;
}
function linePixels(x0,y0,x1,y1,value){
  let dx=Math.abs(x1-x0),sx=x0<x1?1:-1;
  let dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;
  let err=dx+dy;
  while(true){
    paintPixel(x0,y0,value);
    if(x0===x1&&y0===y1)break;
    const e2=2*err;
    if(e2>=dy){err+=dy;x0+=sx;}
    if(e2<=dx){err+=dx;y0+=sy;}
  }
}
function floodFill(x,y,newValue){
  if(!canEdit())return;
  const arr=cells(), target=arr[indexAt(x,y)];
  if(target===newValue)return;
  const stack=[[x,y]],w=project.width,h=project.height;
  while(stack.length){
    const [cx,cy]=stack.pop(),i=indexAt(cx,cy);
    if(arr[i]!==target)continue;
    arr[i]=newValue;
    if(cx>0)stack.push([cx-1,cy]);
    if(cx<w-1)stack.push([cx+1,cy]);
    if(cy>0)stack.push([cx,cy-1]);
    if(cy<h-1)stack.push([cx,cy+1]);
  }
}
function pickCompositeColor(x,y){
  const v=compositeFrame(currentFrame)[indexAt(x,y)];
  if(!v)return;
  color=packRGBA(...unpackRGBA(v).slice(0,3),255);
  $("colorPicker").value=packedToHex(color);
  refreshMeta();
}
function moveLayerBy(dx,dy){
  if(!moveOriginal)return;
  const out=new Uint32Array(project.width*project.height);
  for(let y=0;y<project.height;y++)for(let x=0;x<project.width;x++){
    const nx=x+dx,ny=y+dy;
    if(nx>=0&&nx<project.width&&ny>=0&&ny<project.height)out[ny*project.width+nx]=moveOriginal[y*project.width+x];
  }
  frame().cells[currentLayerId]=out;
}

displayCanvas.addEventListener("contextmenu",e=>e.preventDefault());
displayCanvas.addEventListener("pointerdown",e=>{
  const p=pixelFromEvent(e); pointerDown=true; lastPixel=p;
  displayCanvas.setPointerCapture?.(e.pointerId);
  if(e.button===2){pickCompositeColor(p.x,p.y);return;}
  if(!canEdit()&&tool!=="eyedropper"){setStatus("当前图层已锁定");return;}
  if(["pencil","eraser","fill","move"].includes(tool))pushHistory();
  if(tool==="pencil")paintPixel(p.x,p.y,color);
  else if(tool==="eraser")paintPixel(p.x,p.y,0);
  else if(tool==="fill")floodFill(p.x,p.y,color);
  else if(tool==="eyedropper")pickCompositeColor(p.x,p.y);
  else if(tool==="move"){moveStart=p;moveOriginal=cells().slice();}
  renderEditor();renderPreview();renderTimeline();scheduleAutosave();
});
displayCanvas.addEventListener("pointermove",e=>{
  const p=pixelFromEvent(e);
  $("cursorInfo").textContent=`x: ${p.x} y: ${p.y}`;
  if(!pointerDown)return;
  if(tool==="pencil"){linePixels(lastPixel.x,lastPixel.y,p.x,p.y,color);lastPixel=p;}
  else if(tool==="eraser"){linePixels(lastPixel.x,lastPixel.y,p.x,p.y,0);lastPixel=p;}
  else if(tool==="move"&&moveStart){moveLayerBy(p.x-moveStart.x,p.y-moveStart.y);}
  renderEditor();renderPreview();
});
function endPointer(e){
  pointerDown=false;lastPixel=null;moveStart=null;moveOriginal=null;
  displayCanvas.releasePointerCapture?.(e.pointerId);
  renderTimeline();scheduleAutosave();
}
displayCanvas.addEventListener("pointerup",endPointer);
displayCanvas.addEventListener("pointercancel",endPointer);
displayCanvas.addEventListener("pointerleave",()=>{$("cursorInfo").textContent="x: — y: —";});

document.querySelectorAll("[data-tool]").forEach(btn=>btn.addEventListener("click",()=>{
  tool=btn.dataset.tool;
  document.querySelectorAll("[data-tool]").forEach(b=>b.classList.toggle("active",b===btn));
  refreshMeta();
}));

$("colorPicker").addEventListener("input",e=>{color=hexToPacked(e.target.value);refreshMeta();});
const pal=$("palette");
paletteColors.forEach(hex=>{
  const b=document.createElement("button");b.className="swatch";b.style.background=hex;b.title=hex;
  b.onclick=()=>{color=hexToPacked(hex);$("colorPicker").value=hex;refreshMeta();};
  pal.appendChild(b);
});

$("zoom").addEventListener("input",e=>{zoom=Number(e.target.value);refreshMeta();renderEditor();});
$("showGrid").addEventListener("change",renderEditor);
$("onionSkin").addEventListener("change",renderEditor);
$("fitCanvas").addEventListener("click",()=>{
  const z=Math.floor(Math.min((scroller.clientWidth-80)/project.width,(scroller.clientHeight-80)/project.height));
  zoom=clamp(z,2,24);$("zoom").value=zoom;refreshMeta();renderEditor();
});

$("addLayer").onclick=()=>{
  pushHistory();
  const l={id:uid(),name:`图层 ${project.layers.length+1}`,visible:true,locked:false,opacity:1};
  project.layers.push(l);
  for(const f of project.frames)f.cells[l.id]=new Uint32Array(project.width*project.height);
  currentLayerId=l.id;refreshAll();scheduleAutosave();
};
$("duplicateLayer").onclick=()=>{
  const src=layer();if(!src)return;pushHistory();
  const l={...src,id:uid(),name:src.name+" 副本",locked:false};
  const idx=project.layers.findIndex(x=>x.id===src.id);
  project.layers.splice(idx+1,0,l);
  for(const f of project.frames)f.cells[l.id]=(f.cells[src.id]||new Uint32Array(project.width*project.height)).slice();
  currentLayerId=l.id;refreshAll();scheduleAutosave();
};
$("deleteLayer").onclick=()=>{
  if(project.layers.length<=1){setStatus("至少保留一个图层");return;}
  const src=layer();if(!src)return;if(!confirm(`删除图层“${src.name}”？`))return;pushHistory();
  project.layers=project.layers.filter(l=>l.id!==src.id);
  for(const f of project.frames)delete f.cells[src.id];
  currentLayerId=project.layers[project.layers.length-1].id;refreshAll();scheduleAutosave();
};
$("layerOpacity").oninput=e=>{const l=layer();if(!l)return;l.opacity=Number(e.target.value);renderEditor();renderPreview();renderTimeline();scheduleAutosave();};
$("layerOpacity").onchange=()=>pushHistory();
function moveLayerOrder(dir){
  const i=project.layers.findIndex(l=>l.id===currentLayerId),j=i+dir;
  if(i<0||j<0||j>=project.layers.length)return;pushHistory();
  [project.layers[i],project.layers[j]]=[project.layers[j],project.layers[i]];refreshAll();scheduleAutosave();
}
$("layerUp").onclick=()=>moveLayerOrder(1);
$("layerDown").onclick=()=>moveLayerOrder(-1);
$("clearLayer").onclick=()=>{if(!canEdit())return;if(!confirm("清空当前图层当前帧？"))return;pushHistory();frame().cells[currentLayerId]=new Uint32Array(project.width*project.height);refreshAll();scheduleAutosave();};

function blankFrame(){
  const f={id:uid(),cells:{}};
  for(const l of project.layers)f.cells[l.id]=new Uint32Array(project.width*project.height);
  return f;
}
$("addFrame").onclick=()=>{pushHistory();project.frames.splice(currentFrame+1,0,blankFrame());currentFrame++;refreshAll();scheduleAutosave();};
$("duplicateFrame").onclick=()=>{pushHistory();const src=frame();const f={id:uid(),cells:{}};for(const l of project.layers)f.cells[l.id]=(src.cells[l.id]||new Uint32Array(project.width*project.height)).slice();project.frames.splice(currentFrame+1,0,f);currentFrame++;refreshAll();scheduleAutosave();};
$("deleteFrame").onclick=()=>{if(project.frames.length<=1){setStatus("至少保留一帧");return;}pushHistory();project.frames.splice(currentFrame,1);currentFrame=clamp(currentFrame,0,project.frames.length-1);refreshAll();scheduleAutosave();};
$("prevFrame").onclick=()=>{currentFrame=(currentFrame-1+project.frames.length)%project.frames.length;refreshAll();};
$("nextFrame").onclick=()=>{currentFrame=(currentFrame+1)%project.frames.length;refreshAll();};
$("fps").addEventListener("change",e=>{project.fps=clamp(Number(e.target.value)||8,1,60);e.target.value=project.fps;renderTimeline();if(playing)startPlayback();scheduleAutosave();});

function stopPlayback(){playing=false;clearInterval(playTimer);playTimer=null;$("playPause").textContent="▶";setStatus("已暂停");}
function startPlayback(){
  clearInterval(playTimer);playing=true;$("playPause").textContent="Ⅱ";
  playTimer=setInterval(()=>{currentFrame=(currentFrame+1)%project.frames.length;renderEditor();renderPreview();renderTimeline();},1000/project.fps);
  setStatus("正在播放");
}
$("playPause").onclick=()=>playing?stopPlayback():startPlayback();

function downloadBlob(blob,name){
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
$("saveProject").onclick=()=>{
  const blob=new Blob([JSON.stringify(serializeProject())],{type:"application/json"});
  downloadBlob(blob,(project.name||"pixel-animation")+".json");setStatus("工程已导出");
};
$("importProject").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{loadSerializedProject(JSON.parse(await file.text()));setStatus("工程已导入");scheduleAutosave();}catch(err){alert("导入失败："+err.message);}
  e.target.value="";
});

$("exportPng").onclick=()=>{
  const c=arrayToSmallCanvas(compositeFrame(currentFrame));
  c.toBlob(blob=>downloadBlob(blob,`frame-${String(currentFrame+1).padStart(3,"0")}.png`),"image/png");
  setStatus("当前帧 PNG 已导出");
};
$("exportSheet").onclick=()=>{
  const count=project.frames.length;
  const cols=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/cols);
  const c=document.createElement("canvas");c.width=project.width*cols;c.height=project.height*rows;
  const x=c.getContext("2d");x.imageSmoothingEnabled=false;
  for(let i=0;i<count;i++)x.drawImage(arrayToSmallCanvas(compositeFrame(i)),(i%cols)*project.width,Math.floor(i/cols)*project.height);
  c.toBlob(blob=>downloadBlob(blob,(project.name||"animation")+"-spritesheet.png"),"image/png");
  const manifest={frameWidth:project.width,frameHeight:project.height,columns:cols,rows,frames:count,fps:project.fps};
  downloadBlob(new Blob([JSON.stringify(manifest,null,2)],{type:"application/json"}),(project.name||"animation")+"-spritesheet.json");
  setStatus("精灵图与 JSON 已导出");
};

$("importImage").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  const img=new Image();img.src=URL.createObjectURL(file);await img.decode();pushHistory();
  const c=document.createElement("canvas");c.width=project.width;c.height=project.height;
  const x=c.getContext("2d");x.imageSmoothingEnabled=false;
  const scale=Math.min(project.width/img.width,project.height/img.height,1);
  const w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
  x.drawImage(img,Math.floor((project.width-w)/2),Math.floor((project.height-h)/2),w,h);
  const data=x.getImageData(0,0,project.width,project.height).data,out=cells();
  for(let i=0;i<out.length;i++){const k=i*4;out[i]=packRGBA(data[k],data[k+1],data[k+2],data[k+3]);}
  URL.revokeObjectURL(img.src);refreshAll();scheduleAutosave();setStatus("图片已导入当前图层");e.target.value="";
});

$("resizeCanvas").onclick=()=>{
  const nw=clamp(Number($("canvasWidth").value)||64,8,512),nh=clamp(Number($("canvasHeight").value)||64,8,512);
  if(nw===project.width&&nh===project.height)return;
  pushHistory();const ow=project.width,oh=project.height;
  for(const f of project.frames)for(const l of project.layers){
    const src=f.cells[l.id]||new Uint32Array(ow*oh),out=new Uint32Array(nw*nh);
    for(let y=0;y<Math.min(oh,nh);y++)for(let x=0;x<Math.min(ow,nw);x++)out[y*nw+x]=src[y*ow+x];
    f.cells[l.id]=out;
  }
  project.width=nw;project.height=nh;refreshAll();scheduleAutosave();setStatus(`画布已调整为 ${nw}×${nh}`);
};

$("newProject").onclick=()=>{
  if(!confirm("新建工程？当前未导出的修改仍会保留在浏览器自动保存中。"))return;
  const w=clamp(Number(prompt("画布宽度（像素）","64"))||64,8,512);
  const h=clamp(Number(prompt("画布高度（像素）","64"))||64,8,512);
  project=createBlankProject(w,h);currentFrame=0;currentLayerId=project.layers[0].id;history=[];future=[];
  $("canvasWidth").value=w;$("canvasHeight").value=h;$("fps").value=project.fps;refreshAll();scheduleAutosave();
};

window.addEventListener("keydown",e=>{
  if(e.target.matches("input"))return;
  const k=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&k==="z"){e.preventDefault();e.shiftKey?redo():undo();return;}
  if((e.ctrlKey||e.metaKey)&&k==="y"){e.preventDefault();redo();return;}
  const map={p:"pencil",e:"eraser",f:"fill",i:"eyedropper",m:"move"};
  if(map[k]){tool=map[k];document.querySelectorAll("[data-tool]").forEach(b=>b.classList.toggle("active",b.dataset.tool===tool));refreshMeta();}
  if(e.code==="Space"){e.preventDefault();playing?stopPlayback():startPlayback();}
  if(e.key==="ArrowLeft"&&!e.shiftKey)$("prevFrame").click();
  if(e.key==="ArrowRight"&&!e.shiftKey)$("nextFrame").click();
});
displayCanvas.addEventListener("wheel",e=>{
  if(!e.shiftKey)return;e.preventDefault();zoom=clamp(zoom+(e.deltaY<0?1:-1),2,24);$("zoom").value=zoom;refreshMeta();renderEditor();
},{passive:false});

try{
  const saved=localStorage.getItem("pixel-motion-studio-autosave");
  if(saved) loadSerializedProject(JSON.parse(saved),true);
  else refreshAll();
}catch{refreshAll();}
