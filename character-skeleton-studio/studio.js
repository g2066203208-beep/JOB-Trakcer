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

const RIGID_CHAINS=Object.freeze({
  leftArm:Object.freeze({root:"ls",mid:"le",end:"lw",l1:REF.upperArm,l2:REF.forearm,maxFlexDeg:155,defaultBend:1}),
  rightArm:Object.freeze({root:"rs",mid:"re",end:"rw",l1:REF.upperArm,l2:REF.forearm,maxFlexDeg:155,defaultBend:-1}),
  leftLeg:Object.freeze({root:"lh",mid:"lk",end:"la",l1:REF.thigh,l2:REF.shin,maxFlexDeg:135,defaultBend:-1}),
  rightLeg:Object.freeze({root:"rh",mid:"rk",end:"ra",l1:REF.thigh,l2:REF.shin,maxFlexDeg:135,defaultBend:1})
});
const CHAIN_LIST=Object.values(RIGID_CHAINS);
const CHAIN_BY_END=new Map(CHAIN_LIST.map(chain=>[chain.end,chain]));
const CHAIN_BY_MID=new Map(CHAIN_LIST.map(chain=>[chain.mid,chain]));
const BODY_ANCHORS=new Set(["neck","ls","rs","lh","rh"]);
const HEAD_NECK_DISTANCE=REF.headDiameter/2+REF.neckHeight;

const SVG_NS="http://www.w3.org/2000/svg";
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

function pointFrom(a,angle,length){
  return {x:a.x+Math.cos(angle)*length,y:a.y+Math.sin(angle)*length};
}
function createInitialPose(){
  const pose={
    head:{x:0,y:0},
    neck:{x:0,y:146},
    ls:{x:-60,y:163},
    rs:{x:60,y:163},
    lh:{x:-36,y:422},
    rh:{x:36,y:422}
  };
  const lua=Math.atan2(134,-35);
  const lfa=Math.atan2(141,-33);
  const rua=Math.atan2(134,35);
  const rfa=Math.atan2(141,33);
  pose.le=pointFrom(pose.ls,lua,REF.upperArm);
  pose.lw=pointFrom(pose.le,lfa,REF.forearm);
  pose.re=pointFrom(pose.rs,rua,REF.upperArm);
  pose.rw=pointFrom(pose.re,rfa,REF.forearm);
  pose.lk=pointFrom(pose.lh,Math.PI/2,REF.thigh);
  pose.la=pointFrom(pose.lk,Math.PI/2,REF.shin);
  pose.rk=pointFrom(pose.rh,Math.PI/2,REF.thigh);
  pose.ra=pointFrom(pose.rk,Math.PI/2,REF.shin);
  return pose;
}
const INITIAL=Object.freeze(createInitialPose());

let points=clonePose(INITIAL);
let selected=null;
let dragging=null;
let pointerId=null;
let dragStartPose=null;
let dragContext=null;

function node(tag,attrs={}){
  const el=document.createElementNS(SVG_NS,tag);
  for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
  return el;
}
function clonePose(source){
  return Object.fromEntries(Object.entries(source).map(([k,p])=>[k,{x:p.x,y:p.y}]));
}
function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
function distance(a,b){return Math.hypot(b.x-a.x,b.y-a.y)}
function midpoint(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
function angleRad(a,b){return Math.atan2(b.y-a.y,b.x-a.x)}
function angleDeg(a,b){return angleRad(a,b)*180/Math.PI}
function normalized(from,to,fallback={x:0,y:1}){
  const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy);
  if(len<1e-8)return {...fallback};
  return {x:dx/len,y:dy/len};
}
function crossSign(root,mid,end,fallback){
  const ax=end.x-root.x,ay=end.y-root.y;
  const bx=mid.x-root.x,by=mid.y-root.y;
  const cross=ax*by-ay*bx;
  return Math.abs(cross)<1e-6?fallback:Math.sign(cross);
}
function minReachForFlex(l1,l2,maxFlexDeg){
  const internal=Math.PI-maxFlexDeg*Math.PI/180;
  return Math.sqrt(Math.max(0,l1*l1+l2*l2-2*l1*l2*Math.cos(internal)));
}
function solveTwoBone(chain,target,bendSign){
  const root=points[chain.root];
  let ux=target.x-root.x,uy=target.y-root.y;
  let raw=Math.hypot(ux,uy);
  if(raw<1e-8){
    const fallback=normalized(root,points[chain.end]);
    ux=fallback.x;uy=fallback.y;raw=1;
  }else{
    ux/=raw;uy/=raw;
  }
  const minReach=minReachForFlex(chain.l1,chain.l2,chain.maxFlexDeg);
  const maxReach=chain.l1+chain.l2;
  const d=clamp(raw,minReach,maxReach);
  const a=(chain.l1*chain.l1-chain.l2*chain.l2+d*d)/(2*d);
  const h=Math.sqrt(Math.max(0,chain.l1*chain.l1-a*a));
  const px=-uy,py=ux;
  points[chain.mid]={
    x:root.x+ux*a+px*h*bendSign,
    y:root.y+uy*a+py*h*bendSign
  };
  points[chain.end]={x:root.x+ux*d,y:root.y+uy*d};
}
function rotateRigidSubchain(chain,target,startPose){
  const root=points[chain.root];
  const startRoot=startPose[chain.root];
  const startMid=startPose[chain.mid];
  const startEnd=startPose[chain.end];
  const baseAngle=angleRad(startRoot,startMid);
  const childAngle=angleRad(startMid,startEnd);
  const relative=childAngle-baseAngle;
  const nextAngle=angleRad(root,target);
  points[chain.mid]=pointFrom(root,nextAngle,chain.l1);
  points[chain.end]=pointFrom(points[chain.mid],nextAngle+relative,chain.l2);
}
function translateWholeSkeleton(target,anchorId,startPose){
  const origin=startPose[anchorId];
  const dx=target.x-origin.x,dy=target.y-origin.y;
  for(const id of Object.keys(points)){
    points[id]={x:startPose[id].x+dx,y:startPose[id].y+dy};
  }
}
function constrainHead(target){
  const neck=points.neck;
  const u=normalized(neck,target,{x:0,y:-1});
  points.head={x:neck.x+u.x*HEAD_NECK_DISTANCE,y:neck.y+u.y*HEAD_NECK_DISTANCE};
}
function applyJointTarget(id,target,startPose=clonePose(points),context=null){
  const safe={x:clamp(target.x,-330,330),y:clamp(target.y,-130,970)};
  if(BODY_ANCHORS.has(id)){
    translateWholeSkeleton(safe,id,startPose);
    return "BODY";
  }
  if(id==="head"){
    constrainHead(safe);
    return "HEAD";
  }
  const endChain=CHAIN_BY_END.get(id);
  if(endChain){
    const bend=context?.bendSign??crossSign(points[endChain.root],points[endChain.mid],points[endChain.end],endChain.defaultBend);
    solveTwoBone(endChain,safe,bend);
    return "IK";
  }
  const midChain=CHAIN_BY_MID.get(id);
  if(midChain){
    rotateRigidSubchain(midChain,safe,startPose);
    return "FK";
  }
  throw new Error("Unknown joint: "+id);
}
function getBoneLengths(){
  return Object.freeze({
    leftUpperArm:distance(points.ls,points.le),
    leftForearm:distance(points.le,points.lw),
    rightUpperArm:distance(points.rs,points.re),
    rightForearm:distance(points.re,points.rw),
    leftThigh:distance(points.lh,points.lk),
    leftShin:distance(points.lk,points.la),
    rightThigh:distance(points.rh,points.rk),
    rightShin:distance(points.rk,points.ra)
  });
}
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
  const u=normalized(h,n,{x:0,y:1});
  return {x:h.x+u.x*(REF.headDiameter/2),y:h.y+u.y*(REF.headDiameter/2)};
}
function render(){
  skeletonLayer.replaceChildren();
  jointLayer.replaceChildren();

  skeletonLayer.appendChild(node("line",{x1:points.neck.x,y1:-120,x2:points.neck.x,y2:980,class:"center-line"}));
  skeletonLayer.appendChild(circleAt(points.head,REF.headDiameter/2,"head"));
  skeletonLayer.appendChild(segmentRect(neckStart(),points.neck,REF.neckWidth,"bone"));

  skeletonLayer.appendChild(node("polygon",{
    points:torsoPoints().map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "),
    class:"torso"
  }));

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
  const l=getBoneLengths();
  const rows=[
    ["左上臂",l.leftUpperArm,REF.upperArm],
    ["左前臂",l.leftForearm,REF.forearm],
    ["右上臂",l.rightUpperArm,REF.upperArm],
    ["右前臂",l.rightForearm,REF.forearm],
    ["左大腿",l.leftThigh,REF.thigh],
    ["左小腿",l.leftShin,REF.shin],
    ["右大腿",l.rightThigh,REF.thigh],
    ["右小腿",l.rightShin,REF.shin]
  ];
  lengthList.innerHTML=rows.map(([name,current,ref])=>{
    const locked=Math.abs(current-ref)<0.05;
    return `<div class="length-item"><span>${name}</span><b>${current.toFixed(1)} <small>/ ${ref}</small> <em>${locked?"LOCK":"!"}</em></b></div>`;
  }).join("");
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
  dragStartPose=clonePose(points);
  const chain=CHAIN_BY_END.get(id);
  dragContext=chain?{
    bendSign:crossSign(points[chain.root],points[chain.mid],points[chain.end],chain.defaultBend)
  }:null;
  svg.setPointerCapture?.(pointerId);
  dragState.textContent=chain?"IK":"RIGID";
  render();
}
function moveDrag(event){
  if(!dragging||event.pointerId!==pointerId)return;
  event.preventDefault();
  const p=svgPoint(event.clientX,event.clientY);
  const mode=applyJointTarget(dragging,p,dragStartPose,dragContext);
  dragState.textContent=mode;
  render();
}
function endDrag(event){
  if(event.pointerId!==pointerId)return;
  dragging=null;
  pointerId=null;
  dragStartPose=null;
  dragContext=null;
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
  dragStartPose=null;
  dragContext=null;
  dragState.textContent="READY";
  render();
});
centerBtn.addEventListener("click",()=>svg.setAttribute("viewBox","-360 -150 720 1160"));
render();

window.CharacterSkeletonStudio=Object.freeze({
  reference:REF,
  chains:RIGID_CHAINS,
  getPose:()=>clonePose(points),
  getBoneLengths,
  reset:()=>{
    points=clonePose(INITIAL);
    selected=null;
    dragState.textContent="READY";
    render();
  },
  setJoint(id,x,y){
    if(!points[id])throw new Error("Unknown joint: "+id);
    const start=clonePose(points);
    const chain=CHAIN_BY_END.get(id);
    const context=chain?{bendSign:crossSign(points[chain.root],points[chain.mid],points[chain.end],chain.defaultBend)}:null;
    const mode=applyJointTarget(id,{x:Number(x),y:Number(y)},start,context);
    render();
    return mode;
  }
});
