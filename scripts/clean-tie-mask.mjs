import fs from 'node:fs';
import path from 'node:path';
import {PNG} from 'pngjs';

const src='character-see-through-lab/static-result/refine-tie-mask.png';
const outDir='character-see-through-lab/static-result';
const png=PNG.sync.read(fs.readFileSync(src));
const {width:w,height:h,data}=png;
const bin=new Uint8Array(w*h);
for(let i=0;i<w*h;i++) if(data[i*4+3]>20) bin[i]=1;

const seen=new Uint8Array(w*h), comps=[];
const dirs=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
for(let i=0;i<w*h;i++){
  if(!bin[i]||seen[i])continue;
  const q=[i];seen[i]=1;const pix=[];let minX=w,minY=h,maxX=0,maxY=0;
  for(let qi=0;qi<q.length;qi++){
    const p=q[qi],x=p%w,y=(p/w)|0;pix.push(p);
    if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;
    for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const ni=ny*w+nx;if(bin[ni]&&!seen[ni]){seen[ni]=1;q.push(ni)}}
  }
  comps.push({pix,size:pix.length,minX,minY,maxX,maxY,cx:(minX+maxX)/2,cy:(minY+maxY)/2});
}
comps.sort((a,b)=>b.size-a.size);
if(!comps.length)throw new Error('No components');
const largest=comps[0].size;
const keep=comps.filter((c,idx)=>idx===0 || (c.size>=largest*0.08 && c.cx>w*0.25 && c.cx<w*0.75 && c.cy>h*0.35));
const kept=new Uint8Array(w*h);for(const c of keep)for(const p of c.pix)kept[p]=1;
console.log('components',comps.map(c=>({size:c.size,bbox:[c.minX,c.minY,c.maxX,c.maxY]})).slice(0,12));
console.log('keeping',keep.length,'pixels',keep.reduce((s,c)=>s+c.size,0));

const mask=new PNG({width:w,height:h}),edge=new PNG({width:w,height:h});
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,k=i*4;if(!kept[i])continue;
  mask.data[k]=255;mask.data[k+1]=70;mask.data[k+2]=95;mask.data[k+3]=255;
  const e=x===0||y===0||x===w-1||y===h-1||!kept[i-1]||!kept[i+1]||!kept[i-w]||!kept[i+w];
  if(e){edge.data[k]=255;edge.data[k+1]=50;edge.data[k+2]=70;edge.data[k+3]=255}
}
fs.writeFileSync(path.join(outDir,'refine-tie-mask-clean.png'),PNG.sync.write(mask));
fs.writeFileSync(path.join(outDir,'refine-tie-outline-clean.png'),PNG.sync.write(edge));
fs.writeFileSync(path.join(outDir,'refine-tie-clean.json'),JSON.stringify({components:comps.length,kept:keep.length,largest,keptPixels:keep.reduce((s,c)=>s+c.size,0),keptBboxes:keep.map(c=>[c.minX,c.minY,c.maxX,c.maxY])},null,2));
