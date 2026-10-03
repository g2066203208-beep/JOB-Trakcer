const W=64,H=64;
const rgba=(hex,a=255)=>{
  const h=hex.replace("#","");
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  return (((r&255)<<24)|((g&255)<<16)|((b&255)<<8)|(a&255))>>>0;
};
const C={
  outline:rgba("#241f2a"), skin:rgba("#f3c0a9"), skinShadow:rgba("#d99383"),
  hair:rgba("#4a3946"), hairHi:rgba("#735867"), shirt:rgba("#efe6d8"),
  shirtShadow:rgba("#c9bdb1"), shorts:rgba("#b84f5a"), shortsDark:rgba("#78333d"),
  shoe:rgba("#3a3442"), shoeHi:rgba("#625a69"), eye:rgba("#2c2630"),
  shadow:rgba("#000000",55)
};
const id=(s)=>s;
function arr(){return new Uint32Array(W*H)}
function px(a,x,y,c){x=Math.round(x);y=Math.round(y);if(x>=0&&x<W&&y>=0&&y<H)a[y*W+x]=c}
function disk(a,cx,cy,r,c){for(let y=Math.floor(cy-r);y<=Math.ceil(cy+r);y++)for(let x=Math.floor(cx-r);x<=Math.ceil(cx+r);x++)if((x-cx)*(x-cx)+(y-cy)*(y-cy)<=r*r)px(a,x,y,c)}
function line(a,x0,y0,x1,y1,r,c){
  const dx=x1-x0,dy=y1-y0,n=Math.max(Math.abs(dx),Math.abs(dy),1);
  for(let i=0;i<=n;i++){const t=i/n;disk(a,x0+dx*t,y0+dy*t,r,c)}
}
function poly(a,pts,c){
  let minY=Math.floor(Math.min(...pts.map(p=>p[1]))),maxY=Math.ceil(Math.max(...pts.map(p=>p[1])));
  for(let y=minY;y<=maxY;y++){
    const xs=[];
    for(let i=0,j=pts.length-1;i<pts.length;j=i++){
      const [xi,yi]=pts[i],[xj,yj]=pts[j];
      if((yi>y)!==(yj>y)) xs.push(xi+(y-yi)*(xj-xi)/(yj-yi));
    }
    xs.sort((m,n)=>m-n);
    for(let k=0;k+1<xs.length;k+=2)for(let x=Math.ceil(xs[k]);x<=Math.floor(xs[k+1]);x++)px(a,x,y,c);
  }
}
function outlinedLine(a,x0,y0,x1,y1,outer,inner,color){line(a,x0,y0,x1,y1,outer,C.outline);line(a,x0,y0,x1,y1,inner,color)}
function shoe(a,x,y,dir){
  poly(a,[[x-3,y-2],[x+2,y-2],[x+5*dir,y],[x+5*dir,y+2],[x-3,y+2]],C.outline);
  poly(a,[[x-2,y-1],[x+1,y-1],[x+4*dir,y],[x+4*dir,y+1],[x-2,y+1]],C.shoe);
}
function drawArm(a,shoulder,elbow,hand){
  outlinedLine(a,shoulder[0],shoulder[1],elbow[0],elbow[1],3,2,C.skin);
  outlinedLine(a,elbow[0],elbow[1],hand[0],hand[1],3,2,C.skin);
  disk(a,hand[0],hand[1],3,C.outline);disk(a,hand[0],hand[1],2,C.skin);
}
function drawLeg(a,hip,knee,foot,front){
  const col=front?C.skin:C.skinShadow;
  outlinedLine(a,hip[0],hip[1],knee[0],knee[1],4,3,col);
  outlinedLine(a,knee[0],knee[1],foot[0],foot[1],4,3,col);
  shoe(a,foot[0],foot[1],foot[0]>=knee[0]?1:-1);
}
function makeFrame(i){
  const layers={
    shadow:arr(), backLeg:arr(), backArm:arr(), body:arr(), head:arr(), frontLeg:arr(), frontArm:arr()
  };
  const phases=[
    {bob:0, hip:-17, knee:-5, rearHip:19,rearKnee:12, arm:18,rearArm:-19},
    {bob:2, hip:-9, knee:18, rearHip:10,rearKnee:-17, arm:11,rearArm:-10},
    {bob:1, hip:2, knee:25, rearHip:-3,rearKnee:-22, arm:2,rearArm:-2},
    {bob:-1,hip:15,knee:15, rearHip:-15,rearKnee:-8, arm:-15,rearArm:15},
    {bob:0, hip:19,knee:8, rearHip:-18,rearKnee:-1, arm:-19,rearArm:19},
    {bob:2, hip:10,knee:-17,rearHip:-9,rearKnee:18, arm:-10,rearArm:11},
    {bob:1, hip:-3,knee:-22,rearHip:2,rearKnee:25, arm:-2,rearArm:2},
    {bob:-1,hip:-15,knee:-8,rearHip:15,rearKnee:15, arm:15,rearArm:-15}
  ];
  const p=phases[i];
  const cx=32,bob=p.bob;
  const hip=[cx,37+bob], shoulder=[cx,26+bob], neck=[cx,22+bob];
  const leg=(ang1,ang2)=>{
    const L1=11,L2=11;
    const a1=(90+ang1)*Math.PI/180;
    const knee=[hip[0]+Math.cos(a1)*L1,hip[1]+Math.sin(a1)*L1];
    const a2=(90+ang2)*Math.PI/180;
    const foot=[knee[0]+Math.cos(a2)*L2,knee[1]+Math.sin(a2)*L2];
    return [knee,foot];
  };
  const arm=(ang)=>{
    const L1=8,L2=8;
    const a1=(90+ang)*Math.PI/180;
    const elbow=[shoulder[0]+Math.cos(a1)*L1,shoulder[1]+Math.sin(a1)*L1];
    const a2=(82+ang*.55)*Math.PI/180;
    const hand=[elbow[0]+Math.cos(a2)*L2,elbow[1]+Math.sin(a2)*L2];
    return [elbow,hand];
  };
  const [kRear,fRear]=leg(p.rearHip,p.rearKnee);
  const [kFront,fFront]=leg(p.hip,p.knee);
  const [eRear,hRear]=arm(p.rearArm);
  const [eFront,hFront]=arm(p.arm);

  // ground shadow
  for(let x=22;x<=43;x++)for(let y=56;y<=58;y++){
    const dx=(x-32)/11,dy=(y-57)/2;
    if(dx*dx+dy*dy<=1)px(layers.shadow,x,y,C.shadow);
  }

  drawLeg(layers.backLeg,hip,kRear,fRear,false);
  drawArm(layers.backArm,shoulder,eRear,hRear);

  // torso outline + shirt + shorts
  poly(layers.body,[[27,24+bob],[37,24+bob],[40,34+bob],[38,39+bob],[26,39+bob],[24,34+bob]],C.outline);
  poly(layers.body,[[28,25+bob],[36,25+bob],[38,34+bob],[36,36+bob],[28,36+bob],[26,34+bob]],C.shirt);
  poly(layers.body,[[26,35+bob],[38,35+bob],[39,40+bob],[33,42+bob],[31,42+bob],[25,40+bob]],C.outline);
  poly(layers.body,[[27,36+bob],[37,36+bob],[38,39+bob],[33,41+bob],[31,41+bob],[26,39+bob]],C.shorts);
  line(layers.body,32,36+bob,32,40+bob,1,C.shortsDark);

  // neck
  line(layers.body,31,23+bob,31,26+bob,2,C.outline);line(layers.body,31,23+bob,31,26+bob,1,C.skin);

  // head/hair
  disk(layers.head,32,17+bob,8,C.outline);
  disk(layers.head,32,17+bob,7,C.skin);
  poly(layers.head,[[25,17+bob],[25,12+bob],[28,9+bob],[33,8+bob],[38,10+bob],[40,14+bob],[39,18+bob],[37,14+bob],[35,12+bob],[33,15+bob],[30,12+bob],[28,16+bob]],C.hair);
  poly(layers.head,[[25,16+bob],[25,20+bob],[28,23+bob],[29,18+bob]],C.hair);
  poly(layers.head,[[39,15+bob],[39,20+bob],[36,23+bob],[36,18+bob]],C.hair);
  px(layers.head,35,17+bob,C.eye);px(layers.head,36,17+bob,C.eye);
  px(layers.head,38,20+bob,C.skinShadow);
  px(layers.head,30,11+bob,C.hairHi);px(layers.head,31,10+bob,C.hairHi);

  drawLeg(layers.frontLeg,hip,kFront,fFront,true);
  drawArm(layers.frontArm,shoulder,eFront,hFront);
  return layers;
}
export function createRunCycleSample(){
  const layers=[
    {id:id("shadow"),name:"地面阴影",visible:true,locked:false,opacity:1},
    {id:id("backLeg"),name:"后腿",visible:true,locked:false,opacity:1},
    {id:id("backArm"),name:"后手臂",visible:true,locked:false,opacity:1},
    {id:id("body"),name:"身体 / 衣服",visible:true,locked:false,opacity:1},
    {id:id("head"),name:"头 / 短发",visible:true,locked:false,opacity:1},
    {id:id("frontLeg"),name:"前腿",visible:true,locked:false,opacity:1},
    {id:id("frontArm"),name:"前手臂",visible:true,locked:false,opacity:1}
  ];
  const frames=[];
  for(let i=0;i<8;i++){
    const made=makeFrame(i),cells={};
    for(const l of layers)cells[l.id]=Array.from(made[l.id]);
    frames.push({id:`run-${i+1}`,cells});
  }
  return {version:1,name:"原创像素人物 · 8帧跑步循环",width:W,height:H,fps:12,layers,frames};
}
