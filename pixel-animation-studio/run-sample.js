const W=96,H=96;
const rgba=(hex,a=255)=>{
  const h=hex.replace("#","");
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  return (((r&255)<<24)|((g&255)<<16)|((b&255)<<8)|(a&255))>>>0;
};
const C={
  outline:rgba("#332832"), outline2:rgba("#55434b"),
  skin:rgba("#f6cfbd"), skinShadow:rgba("#e8aa99"), blush:rgba("#ef9fa7"),
  hairDark:rgba("#49383b"), hair:rgba("#76605c"), hairLight:rgba("#a48a7f"),
  purpleDark:rgba("#5b4784"), purple:rgba("#8d74c8"), purpleLight:rgba("#c0a9ef"),
  blueDark:rgba("#5e8faa"), blue:rgba("#93cbe3"), blueLight:rgba("#c9eaf3"),
  cream:rgba("#f4e0b2"), white:rgba("#fff8f3"), skirtShadow:rgba("#d4d4df"),
  sock:rgba("#a9d7e9"), sockShadow:rgba("#7ab8d2"),
  shoe:rgba("#f8f1ef"), shoeShadow:rgba("#d7c9d0"), pink:rgba("#efa6bb"),
  bag:rgba("#d86257"), bagDark:rgba("#91443f"), gold:rgba("#d1a25d"),
  eye:rgba("#70558e"), eyeHi:rgba("#d8c4ff"), shadow:rgba("#000000",58)
};
const arr=()=>new Uint32Array(W*H);
const px=(a,x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<W&&y>=0&&y<H)a[y*W+x]=c;};
function disk(a,cx,cy,r,c){
  const rr=r*r;
  for(let y=Math.floor(cy-r);y<=Math.ceil(cy+r);y++)for(let x=Math.floor(cx-r);x<=Math.ceil(cx+r);x++)
    if((x-cx)*(x-cx)+(y-cy)*(y-cy)<=rr)px(a,x,y,c);
}
function line(a,x0,y0,x1,y1,r,c){
  const dx=x1-x0,dy=y1-y0,n=Math.max(Math.abs(dx),Math.abs(dy),1);
  for(let i=0;i<=n;i++){const t=i/n;disk(a,x0+dx*t,y0+dy*t,r,c);}
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
function rect(a,x,y,w,h,c){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)px(a,xx,yy,c);}
function outlinedLine(a,x0,y0,x1,y1,outer,inner,c){
  line(a,x0,y0,x1,y1,outer,C.outline);line(a,x0,y0,x1,y1,inner,c);
}
function ribbon(a,cx,cy,flip=1){
  poly(a,[[cx,cy],[cx-7*flip,cy-5],[cx-10*flip,cy-1],[cx-6*flip,cy+4]],C.outline);
  poly(a,[[cx,cy],[cx-6*flip,cy-4],[cx-8*flip,cy-1],[cx-5*flip,cy+3]],C.purple);
  poly(a,[[cx,cy],[cx+5*flip,cy-6],[cx+8*flip,cy-2],[cx+5*flip,cy+2]],C.outline);
  poly(a,[[cx,cy],[cx+4*flip,cy-5],[cx+6*flip,cy-2],[cx+4*flip,cy+1]],C.purpleLight);
  disk(a,cx,cy,2,C.outline);disk(a,cx,cy,1,C.purpleLight);
}
function shoe(a,x,y,dir=1){
  poly(a,[[x-4,y-3],[x+3,y-3],[x+7*dir,y-1],[x+8*dir,y+2],[x+5*dir,y+4],[x-4,y+4],[x-6,y+1]],C.outline);
  poly(a,[[x-3,y-2],[x+2,y-2],[x+6*dir,y],[x+6*dir,y+2],[x+4*dir,y+3],[x-3,y+3],[x-4,y+1]],C.shoe);
  line(a,x-2,y+2,x+5*dir,y+2,1,C.pink);
}
function legLayer(a,hip,knee,ankle,front=true){
  const skin=front?C.skin:C.skinShadow;
  outlinedLine(a,hip[0],hip[1],knee[0],knee[1],5,3,skin);
  // sock/leg warmer begins below knee.
  line(a,knee[0],knee[1]+2,ankle[0],ankle[1],6,C.outline);
  line(a,knee[0],knee[1]+2,ankle[0],ankle[1],5,C.sock);
  line(a,knee[0]+1,knee[1]+4,ankle[0]+1,ankle[1]-2,2,C.blueLight);
  shoe(a,ankle[0],ankle[1],ankle[0]>=knee[0]?1:-1);
}
function armLayer(a,shoulder,elbow,hand,front=true){
  const sleeve=front?C.blue:C.blueDark;
  outlinedLine(a,shoulder[0],shoulder[1],elbow[0],elbow[1],7,5,sleeve);
  outlinedLine(a,elbow[0],elbow[1],hand[0],hand[1],5,3,C.skin);
  disk(a,hand[0],hand[1],3,C.outline);disk(a,hand[0],hand[1],2,C.skin);
}
function pose(i){
  // 8-frame run cycle: contact, down, passing, up, contact, down, passing, up.
  return [
    {bob:0, lean:2, frontLeg:-28, frontKnee:-8, backLeg:26, backKnee:20, frontArm:22, backArm:-24, air:0},
    {bob:2, lean:3, frontLeg:-14, frontKnee:20, backLeg:14, backKnee:-16, frontArm:14, backArm:-15, air:0},
    {bob:1, lean:4, frontLeg:1, frontKnee:28, backLeg:-4, backKnee:-25, frontArm:4, backArm:-4, air:1},
    {bob:-2,lean:5, frontLeg:18, frontKnee:15, backLeg:-19, backKnee:-6, frontArm:-18, backArm:18, air:4},
    {bob:0, lean:2, frontLeg:27, frontKnee:18, backLeg:-27, backKnee:-8, frontArm:-23, backArm:24, air:0},
    {bob:2, lean:3, frontLeg:14, frontKnee:-16, backLeg:-14, backKnee:20, frontArm:-14, backArm:15, air:0},
    {bob:1, lean:4, frontLeg:-4, frontKnee:-25, backLeg:1, backKnee:28, frontArm:-4, backArm:4, air:1},
    {bob:-2,lean:5, frontLeg:-19, frontKnee:-6, backLeg:18, backKnee:15, frontArm:18, backArm:-18, air:4},
  ][i];
}
function limb(hip,angle1,angle2,l1,l2){
  const a1=(90+angle1)*Math.PI/180;
  const k=[hip[0]+Math.cos(a1)*l1,hip[1]+Math.sin(a1)*l1];
  const a2=(90+angle2)*Math.PI/180;
  const f=[k[0]+Math.cos(a2)*l2,k[1]+Math.sin(a2)*l2];
  return [k,f];
}
function arm(shoulder,angle,l1=12,l2=11){
  const a1=(90+angle)*Math.PI/180;
  const e=[shoulder[0]+Math.cos(a1)*l1,shoulder[1]+Math.sin(a1)*l1];
  const a2=(84+angle*.55)*Math.PI/180;
  const h=[e[0]+Math.cos(a2)*l2,e[1]+Math.sin(a2)*l2];
  return [e,h];
}
function makeFrame(i){
  const p=pose(i);
  const L={
    shadow:arr(), backHair:arr(), backLeg:arr(), bag:arr(), backArm:arr(),
    body:arr(), skirt:arr(), head:arr(), frontLeg:arr(), frontArm:arr(), ribbons:arr()
  };
  const cx=47, baseY=43+p.bob-p.air, lean=p.lean;
  const hip=[cx+lean*.12,baseY+14], shoulder=[cx+lean*.45,baseY-1], head=[cx+lean*.7,baseY-15];
  const [bk,bf]=limb(hip,p.backLeg,p.backKnee,14,14);
  const [fk,ff]=limb(hip,p.frontLeg,p.frontKnee,14,14);
  const [be,bh]=arm(shoulder,p.backArm);
  const [fe,fh]=arm(shoulder,p.frontArm);

  // Ground shadow changes on airborne frames.
  const shadowW=p.air?9:14;
  for(let y=82;y<=85;y++)for(let x=cx-shadowW;x<=cx+shadowW;x++){
    const dx=(x-cx)/shadowW,dy=(y-83.5)/2.2;
    if(dx*dx+dy*dy<=1)px(L.shadow,x,y,C.shadow);
  }

  // Back twin tails with frame lag / bounce.
  const sway=[-3,-1,2,4,3,1,-2,-4][i];
  line(L.backHair,head[0]-5,head[1]-2,head[0]-17-sway,head[1]+3,6,C.outline);
  line(L.backHair,head[0]-5,head[1]-2,head[0]-17-sway,head[1]+3,5,C.hair);
  line(L.backHair,head[0]-17-sway,head[1]+3,head[0]-23-sway,head[1]+14,5,C.outline);
  line(L.backHair,head[0]-17-sway,head[1]+3,head[0]-23-sway,head[1]+14,4,C.hair);
  line(L.backHair,head[0]+5,head[1]-2,head[0]+18-sway,head[1]+1,6,C.outline);
  line(L.backHair,head[0]+5,head[1]-2,head[0]+18-sway,head[1]+1,5,C.hair);
  line(L.backHair,head[0]+18-sway,head[1]+1,head[0]+25-sway,head[1]+11,5,C.outline);
  line(L.backHair,head[0]+18-sway,head[1]+1,head[0]+25-sway,head[1]+11,4,C.hair);
  // curled tips
  line(L.backHair,head[0]-24-sway,head[1]+13,head[0]-18-sway,head[1]+18,2,C.outline);
  line(L.backHair,head[0]+25-sway,head[1]+10,head[0]+19-sway,head[1]+17,2,C.outline);

  legLayer(L.backLeg,hip,bk,bf,false);

  // shoulder bag behind torso
  line(L.bag,shoulder[0]-2,shoulder[1],hip[0]-14,hip[1]+8,2,C.gold);
  disk(L.bag,hip[0]-16,hip[1]+10,6,C.outline);
  disk(L.bag,hip[0]-16,hip[1]+10,5,C.bag);
  rect(L.bag,hip[0]-20,hip[1]+8,8,3,C.bagDark);

  armLayer(L.backArm,shoulder,be,bh,false);

  // body / blue oversized jacket
  poly(L.body,[
    [shoulder[0]-9,shoulder[1]-2],[shoulder[0]+9,shoulder[1]-3],
    [hip[0]+11,hip[1]+2],[hip[0]+8,hip[1]+9],[hip[0]-10,hip[1]+9],[hip[0]-13,hip[1]+1]
  ],C.outline);
  poly(L.body,[
    [shoulder[0]-8,shoulder[1]-1],[shoulder[0]+8,shoulder[1]-2],
    [hip[0]+9,hip[1]+2],[hip[0]+7,hip[1]+7],[hip[0]-9,hip[1]+7],[hip[0]-11,hip[1]+1]
  ],C.blue);
  poly(L.body,[[shoulder[0]-5,shoulder[1]],[shoulder[0]+4,shoulder[1]-1],[hip[0]+2,hip[1]+6],[hip[0]-4,hip[1]+6]],C.blueLight);
  // cream collar / shoulder yoke
  poly(L.body,[[shoulder[0]+3,shoulder[1]-3],[shoulder[0]+10,shoulder[1]-1],[shoulder[0]+11,shoulder[1]+5],[shoulder[0]+5,shoulder[1]+4]],C.cream);
  // shirt buttons
  px(L.body,hip[0]-3,hip[1]-1,C.gold);px(L.body,hip[0]-2,hip[1]+3,C.gold);
  // chest bow & gem
  poly(L.body,[[shoulder[0]-4,shoulder[1]+2],[shoulder[0]-10,shoulder[1]-1],[shoulder[0]-8,shoulder[1]+5],[shoulder[0]-3,shoulder[1]+5]],C.purple);
  poly(L.body,[[shoulder[0]-2,shoulder[1]+2],[shoulder[0]+4,shoulder[1]-1],[shoulder[0]+3,shoulder[1]+5],[shoulder[0]-2,shoulder[1]+5]],C.purpleLight);
  disk(L.body,shoulder[0]-2,shoulder[1]+2,3,C.outline);disk(L.body,shoulder[0]-2,shoulder[1]+2,2,C.pink);

  // white pleated skirt
  poly(L.skirt,[
    [hip[0]-9,hip[1]+5],[hip[0]+8,hip[1]+5],[hip[0]+13,hip[1]+13],
    [hip[0]+7,hip[1]+16],[hip[0]+2,hip[1]+14],[hip[0]-3,hip[1]+16],
    [hip[0]-9,hip[1]+14],[hip[0]-13,hip[1]+11]
  ],C.outline);
  poly(L.skirt,[
    [hip[0]-8,hip[1]+6],[hip[0]+7,hip[1]+6],[hip[0]+11,hip[1]+12],
    [hip[0]+6,hip[1]+14],[hip[0]+2,hip[1]+12],[hip[0]-3,hip[1]+14],
    [hip[0]-8,hip[1]+13],[hip[0]-11,hip[1]+11]
  ],C.white);
  line(L.skirt,hip[0]-4,hip[1]+7,hip[0]-5,hip[1]+13,1,C.skirtShadow);
  line(L.skirt,hip[0]+2,hip[1]+7,hip[0]+3,hip[1]+13,1,C.skirtShadow);
  line(L.skirt,hip[0]-10,hip[1]+12,hip[0]+10,hip[1]+12,1,C.pink);

  // head / hair cap
  disk(L.head,head[0],head[1],12,C.outline);
  disk(L.head,head[0],head[1],11,C.skin);
  // hair cap and fringe
  poly(L.head,[
    [head[0]-11,head[1]-1],[head[0]-10,head[1]-8],[head[0]-4,head[1]-12],
    [head[0]+4,head[1]-12],[head[0]+10,head[1]-7],[head[0]+11,head[1]-1],
    [head[0]+8,head[1]-4],[head[0]+6,head[1]+1],[head[0]+2,head[1]-3],
    [head[0]-1,head[1]+2],[head[0]-4,head[1]-3],[head[0]-7,head[1]+1]
  ],C.hair);
  // hair highlights
  line(L.head,head[0]-5,head[1]-9,head[0]+1,head[1]-11,1,C.hairLight);
  // elf-like ear
  poly(L.head,[[head[0]+10,head[1]-1],[head[0]+15,head[1]+1],[head[0]+10,head[1]+3]],C.outline);
  poly(L.head,[[head[0]+10,head[1]],[head[0]+13,head[1]+1],[head[0]+10,head[1]+2]],C.skin);

  // eyes & expression
  rect(L.head,head[0]+1,head[1],3,2,C.outline);px(L.head,head[0]+2,head[1],C.eyeHi);
  rect(L.head,head[0]+6,head[1]-1,3,2,C.outline);px(L.head,head[0]+7,head[1]-1,C.eyeHi);
  px(L.head,head[0]+5,head[1]+5,C.blush);
  px(L.head,head[0]+3,head[1]+5,C.blush);

  legLayer(L.frontLeg,hip,fk,ff,true);
  armLayer(L.frontArm,shoulder,fe,fh,true);

  // main ribbons on twin tails
  ribbon(L.ribbons,head[0]-10,head[1]-6,-1);
  ribbon(L.ribbons,head[0]+9,head[1]-7,1);
  // hair clips
  px(L.ribbons,head[0]-1,head[1]-7,C.purpleLight);
  px(L.ribbons,head[0]+1,head[1]-8,C.blueLight);
  // trailing chest ribbon reacts opposite to body motion
  const trail=[6,8,10,12,10,8,6,5][i];
  line(L.ribbons,shoulder[0]-2,shoulder[1]+4,shoulder[0]-trail,shoulder[1]+9,2,C.outline);
  line(L.ribbons,shoulder[0]-2,shoulder[1]+4,shoulder[0]-trail,shoulder[1]+9,1,C.purple);
  return L;
}
export function createRunCycleSample(){
  const layers=[
    {id:"shadow",name:"地面阴影",visible:true,locked:false,opacity:1},
    {id:"backHair",name:"后发 / 双马尾",visible:true,locked:false,opacity:1},
    {id:"backLeg",name:"后腿",visible:true,locked:false,opacity:1},
    {id:"bag",name:"斜挎包",visible:true,locked:false,opacity:1},
    {id:"backArm",name:"后手臂",visible:true,locked:false,opacity:1},
    {id:"body",name:"蓝色外套 / 身体",visible:true,locked:false,opacity:1},
    {id:"skirt",name:"白色百褶裙",visible:true,locked:false,opacity:1},
    {id:"head",name:"头 / 刘海 / 五官",visible:true,locked:false,opacity:1},
    {id:"frontLeg",name:"前腿 / 腿套 / 鞋",visible:true,locked:false,opacity:1},
    {id:"frontArm",name:"前手臂",visible:true,locked:false,opacity:1},
    {id:"ribbons",name:"紫色蝴蝶结 / 飘带",visible:true,locked:false,opacity:1}
  ];
  const frames=[];
  for(let i=0;i<8;i++){
    const made=makeFrame(i),cells={};
    for(const l of layers)cells[l.id]=Array.from(made[l.id]);
    frames.push({id:`girl-run-${i+1}`,cells});
  }
  return {version:1,name:"双马尾蓝衣少女 · 8帧像素跑步",width:W,height:H,fps:12,layers,frames};
}
