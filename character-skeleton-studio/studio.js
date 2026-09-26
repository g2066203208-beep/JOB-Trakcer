const D=224;
const REF=Object.freeze({
  headDiameter:224,
  neckWidth:36,
  neckHeight:34,
  shoulderWidth:120,
  torsoHeight:276,
  upperArm:139,
  forearm:145,
  armWidth:34,
  elbowDiameter:48,
  thigh:216,
  shin:242,
  legWidth:80,
  kneeDiameter:70,
  handWidth:100,
  handHeight:104,
  footWidth:74,
  footHeight:91
});

const names=Object.freeze({
  head:"头中心",
  neck:"颈底",
  ls:"左肩",
  le:"左肘",
  lw:"左腕",
  rs:"右肩",
  re:"右肘",
  rw:"右腕",
  lh:"左髋",
  lk:"左膝",
  la:"左踝",
  rh:"右髋",
  rk:"右膝",
  ra:"右踝"
});

const INITIAL=Object.freeze({
  head:{x:0,y:0},
  neck:{x:0,y:146},
  ls:{x:-60,y:163},
  le:{x:-95,y:297},
  lw:{x:-128,y:438},
  rs:{x:60,y:163},
  re:{x:95,y:297},
  rw:{x:128,y:438},
  lh:{x:-36,y:422},
  lk:{x:-36,y:638},
  la:{x:-36,y:880},
  rh:{x:36,y:422},
  rk:{x:36,y:638},
  ra:{x:36,y:880}
});

const svg=document.getElementById("skeletonSvg");
const skeletonLayer=document.getElementById("skeletonLayer");
const jointLayer=document.getElementById("jointLayer");
const selectedName=document.getElementById("selectedName");
const selectedX=document.getElementById("selectedX");
const selectedY=document.getElementById("selectedY");
const dragState=document.getElementById("dragState");
const labelToggle=document.getElementById("labelToggle");
const lengthList=document.getElementById("lengthList");
const resetBtn=document.getElementById("resetBtn");
const centerBtn=document.getElementById("centerBtn");

let points=clonePose(INITIAL);
let selected=null;
let dragging=null;
let pointerId=null;

const SVG_NS="http://www.w3.org/2000/svg";
function node(tag,attrs={}){
  const el=document.createElementNS(SVG_NS,tag);
  for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
  return el;
}
function clonePose(source){
  return Object.fromEntries(Object.entries(source).map(([k,p])=>[k,{x:p.x,y:p.y}]));
}
function distance(a,b){return Math.hypot(b.x-a.x,b.y-a.y)}
function midpoint(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
function angleDeg(a,b){return Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI}
function segmentRect(a,b,width,klass="bone"){
  const len=distance(a,b),mid=midpoint(a,b),angle=angleDeg(a,b);
  return node("rect",{
    x:(mid.x-len/2).toFixed(2),
    y:(mid.y-width/2).toFixed(2),
    width:len.toFixed(2),
    height:width,
    rx:Math.min(width*.18,8),
    class:klass,
    transform:`rotate(${angle.toFixed(3)} ${mid.x.toFixed(2)} ${mid.y.toFixed(2)})`
  });
}
function attachedBox(anchor,from,width,height,klass="extremity"){
  const angle=angleDeg(from,anchor)-90;
  const g=node("g",{transform:`translate(${anchor.x} ${anchor.y}) rotate(${angle})`});
  g.appendChild(node("rect",{x:-width/2,y:0,width,height,rx:8,class:klass}));
  return g;
}
function circleAt(p,r,klass){
  return node("circle",{cx:p.x,cy:p.y,r,class:klass});
}
function torsoPoints(){
  const lOuter={x:points.lh.x-36,y:points.lh.y-53};
  const rOuter={x:points.rh.x+36,y:points.rh.y-53};
  return [points.ls,points.rs,rOuter,points.rh,points.lh,lOuter];
}
function neckStart(){
  const h=points.head,n=points.neck;
  const dx=n.x-h.x,dy=n.y-h.y,len=Math.hypot(dx,dy)||1;
  return {x:h.x+dx/len*(REF.headDiameter/2),y:h.y+dy/len*(REF.headDiameter/2)};
}
function render(){
  skeletonLayer.replaceChildren();
  jointLayer.replaceChildren();

  skeletonLayer.appendChild(node("line",{x1:0,y1:-120,x2:0,y2:980,class:"center-line"}));

  skeletonLayer.appendChild(circleAt(points.head,REF.headDiameter/2,"head"));
  skeletonLayer.appendChild(segmentRect(neckStart(),points.neck,REF.neckWidth,"bone"));

  const torso=node("polygon",{
    points:torsoPoints().map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "),
    class:"torso"
  });
  skeletonLayer.appendChild(torso);

  skeletonLayer.appendChild(segmentRect(points.ls,points.le,REF.armWidth));
  skeletonLayer.appendChild(circleAt(points.le,REF.elbowDiameter/2,"joint-shape"));
  skeletonLayer.appendChild(segmentRect(points.le,points.lw,REF.armWidth));
  skeletonLayer.appendChild(attachedBox(points.lw,points.le,REF.handWidth,REF.handHeight));

  skeletonLayer.appendChild(segmentRect(points.rs,points.re,REF.armWidth));
  skeletonLayer.appendChild(circleAt(points.re,REF.elbowDiameter/2,"joint-shape"));
  skeletonLayer.appendChild(segmentRect(points.re,points.rw,REF.armWidth));
  skeletonLayer.appendChild(attachedBox(points.rw,points.re,REF.handWidth,REF.handHeight));

  skeletonLayer.appendChild(segmentRect(points.lh,points.lk,REF.legWidth));
  skeletonLayer.appendChild(circleAt(points.lk,REF.kneeDiameter/2,"joint-shape"));
  skeletonLayer.appendChild(segmentRect(points.lk,points.la,REF.legWidth));
  skeletonLayer.appendChild(attachedBox(points.la,points.lk,REF.footWidth,REF.footHeight));

  skeletonLayer.appendChild(segmentRect(points.rh,points.rk,REF.legWidth));
  skeletonLayer.appendChild(circleAt(points.rk,REF.kneeDiameter/2,"joint-shape"));
  skeletonLayer.appendChild(segmentRect(points.rk,points.ra,REF.legWidth));
  skeletonLayer.appendChild(attachedBox(points.ra,points.rk,REF.footWidth,REF.footHeight));

  for(const [id,p] of Object.entries(points)){
    if(id===selected)jointLayer.appendChild(circleAt(p,18,"selected-ring"));
    const hit=circleAt(p,26,"joint-hit");
    hit.dataset.joint=id;
    jointLayer.appendChild(hit);
    const handle=circleAt(p,8,"joint-handle");
    handle.dataset.joint=id;
    jointLayer.appendChild(handle);
    if(labelToggle.checked){
      const t=node("text",{x:p.x+12,y:p.y-12,class:"joint-label"});
      t.textContent=names[id];
      jointLayer.appendChild(t);
    }
  }
  updateInspector();
  updateLengths();
}
function updateInspector(){
  if(!selected||!points[selected]){
    selectedName.textContent="未选择";
    selectedX.textContent="—";
    selectedY.textContent="—";
    return;
  }
  selectedName.textContent=names[selected];
  selectedX.textContent=points[selected].x.toFixed(1);
  selectedY.textContent=points[selected].y.toFixed(1);
}
function updateLengths(){
  const rows=[
    ["左上臂",distance(points.ls,points.le),REF.upperArm],
    ["左前臂",distance(points.le,points.lw),REF.forearm],
    ["右上臂",distance(points.rs,points.re),REF.upperArm],
    ["右前臂",distance(points.re,points.rw),REF.forearm],
    ["左大腿",distance(points.lh,points.lk),REF.thigh],
    ["左小腿",distance(points.lk,points.la),REF.shin],
    ["右大腿",distance(points.rh,points.rk),REF.thigh],
    ["右小腿",distance(points.rk,points.ra),REF.shin]
  ];
  lengthList.innerHTML=rows.map(([name,current,ref])=>
    `<div class="length-item"><span>${name}</span><b>${current.toFixed(1)} <small>/ ${ref}</small></b></div>`
  ).join("");
}
function svgPoint(clientX,clientY){
  const pt=new DOMPoint(clientX,clientY);
  const ctm=svg.getScreenCTM();
  return ctm?pt.matrixTransform(ctm.inverse()):{x:0,y:0};
}
function beginDrag(event){
  const id=event.target.dataset.joint;
  if(!id)return;
  event.preventDefault();
  selected=id;
  dragging=id;
  pointerId=event.pointerId;
  svg.setPointerCapture?.(pointerId);
  dragState.textContent="DRAGGING";
  render();
}
function moveDrag(event){
  if(!dragging||event.pointerId!==pointerId)return;
  event.preventDefault();
  const p=svgPoint(event.clientX,event.clientY);
  points[dragging].x=Math.max(-330,Math.min(330,p.x));
  points[dragging].y=Math.max(-130,Math.min(970,p.y));
  render();
}
function endDrag(event){
  if(event.pointerId!==pointerId)return;
  dragging=null;
  pointerId=null;
  dragState.textContent="READY";
}
jointLayer.addEventListener("pointerdown",beginDrag);
svg.addEventListener("pointermove",moveDrag);
svg.addEventListener("pointerup",endDrag);
svg.addEventListener("pointercancel",endDrag);
labelToggle.addEventListener("change",render);
resetBtn.addEventListener("click",()=>{
  points=clonePose(INITIAL);
  selected=null;
  dragging=null;
  render();
});
centerBtn.addEventListener("click",()=>{
  svg.setAttribute("viewBox","-360 -150 720 1160");
});
render();

window.CharacterSkeletonStudio=Object.freeze({
  reference:REF,
  getPose:()=>clonePose(points),
  reset:()=>{points=clonePose(INITIAL);render()},
  setJoint(id,x,y){
    if(!points[id])throw new Error("Unknown joint: "+id);
    points[id]={x:Number(x),y:Number(y)};
    render();
  }
});
