import fs from 'node:fs';
import path from 'node:path';
import 'ag-psd/initialize-canvas.js';
import {readPsd} from 'ag-psd';
import {PNG} from 'pngjs';

const IN='character-see-through-lab/result.psd';
const OUT='character-see-through-lab/static-result';
const palette={
 'front hair':[32,184,255],'back hair':[0,111,200],'hair':[21,159,224],
 'face':[255,173,107],'irides':[255,71,127],'eyebrow':[129,223,81],'eyewhite':[223,249,255],'eyelash':[114,85,255],
 'eyes':[85,220,255],'mouth':[255,91,135],'nose':[255,151,63],'ears':[94,224,160],'earwear':[241,207,76],
 'eyewear':[178,119,255],'headwear':[154,118,255],'neck':[80,214,140],'neckwear':[255,78,102],
 'topwear':[167,92,255],'handwear':[69,220,144],'bottomwear':[118,94,232],'legwear':[74,169,232],
 'footwear':[66,202,209],'objects':[245,202,69],'tail':[239,116,216],'wings':[120,184,255],'unknown':[154,161,170]
};
function norm(s){return String(s||'unnamed').toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim()}
function sem(name){const n=norm(name);const order=['front hair','back hair','eyewhite','eyelash','irides','eyebrow','eyewear','headwear','earwear','neckwear','topwear','handwear','bottomwear','legwear','footwear','face','mouth','nose','ears','neck','tail','wings','objects','hair','eyes'];return order.find(k=>n.includes(k))||'unknown'}
function collect(children,out=[],pathParts=[]){for(const l of children||[]){const p=[...pathParts,l.name||'unnamed'];if(l.imageData?.data)out.push({layer:l,path:p.join(' / ')});if(l.children)collect(l.children,out,p)}return out}
function alphaAt(id,x,y){
 if(x<0||y<0||x>=id.width||y>=id.height)return 0;
 const v=id.data[(y*id.width+x)*4+3]||0;
 return id.data.BYTES_PER_ELEMENT===2?v/257:id.data.BYTES_PER_ELEMENT===4&&v<=1?v*255:v;
}
function colorWrite(png,x,y,c,a=255){if(x<0||y<0||x>=png.width||y>=png.height)return;const i=(y*png.width+x)*4;png.data[i]=c[0];png.data[i+1]=c[1];png.data[i+2]=c[2];png.data[i+3]=a}
function writePng(p,file){fs.writeFileSync(file,PNG.sync.write(p))}
function safe(s){return norm(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'layer'}

if(!fs.existsSync(IN))throw new Error('missing '+IN);
fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(path.join(OUT,'layers'),{recursive:true});
const psd=readPsd(fs.readFileSync(IN),{useImageData:true,skipThumbnail:true,skipCompositeImageData:true});
if(psd.width>4096||psd.height>4096)throw new Error('PSD too large');
const layers=collect(psd.children||[]);
console.log('PSD',psd.width,psd.height,'layers',layers.length);
const semantic=new PNG({width:psd.width,height:psd.height});
const outline=new PNG({width:psd.width,height:psd.height});
for(let i=0;i<outline.data.length;i+=4){outline.data[i]=255;outline.data[i+1]=255;outline.data[i+2]=255;outline.data[i+3]=255}
const info=[];
layers.forEach((item,idx)=>{
 const l=item.layer,id=l.imageData,tag=sem(item.path),c=palette[tag]||palette.unknown,left=l.left||0,top=l.top||0,thr=20;
 let minX=id.width,minY=id.height,maxX=-1,maxY=-1,count=0;
 for(let y=0;y<id.height;y++)for(let x=0;x<id.width;x++){
   const a=alphaAt(id,x,y);if(a<=thr)continue;count++;if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;
   colorWrite(semantic,left+x,top+y,c,210);
   const edge=alphaAt(id,x-1,y)<=thr||alphaAt(id,x+1,y)<=thr||alphaAt(id,x,y-1)<=thr||alphaAt(id,x,y+1)<=thr;
   if(edge)colorWrite(outline,left+x,top+y,c,255);
 }
 if(count>0){
   const bw=maxX-minX+1,bh=maxY-minY+1,maxSide=360,scale=Math.min(1,maxSide/Math.max(bw,bh)),tw=Math.max(1,Math.round(bw*scale)),th=Math.max(1,Math.round(bh*scale));
   const thumb=new PNG({width:tw,height:th});
   for(let ty=0;ty<th;ty++)for(let tx=0;tx<tw;tx++){const sx=minX+Math.min(bw-1,Math.floor(tx/scale)),sy=minY+Math.min(bh-1,Math.floor(ty/scale)),a=alphaAt(id,sx,sy);if(a>thr)colorWrite(thumb,tx,ty,c,Math.round(a))}
   const file=String(idx+1).padStart(2,'0')+'-'+safe(item.path)+'.png';writePng(thumb,path.join(OUT,'layers',file));
   info.push({index:idx+1,path:item.path,semantic:tag,color:'#'+c.map(v=>v.toString(16).padStart(2,'0')).join(''),pixels:count,left:left+minX,top:top+minY,width:bw,height:bh,file:'static-result/layers/'+file});
 }
});
writePng(semantic,path.join(OUT,'semantic-mask.png'));writePng(outline,path.join(OUT,'semantic-outline.png'));
fs.writeFileSync(path.join(OUT,'layers.json'),JSON.stringify({width:psd.width,height:psd.height,count:info.length,layers:info},null,2));
console.log(info.map(x=>x.index+'. '+x.path+' -> '+x.semantic+' '+x.width+'x'+x.height).join('\n'));
