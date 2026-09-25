import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {Client,handle_file} from '@gradio/client';

const SPACE='wondervictor/evf-sam2';
const INPUT='character-puppet-lab/character.jpg';
const OUT='character-see-through-lab/static-result';
const PROMPT='red necktie';

function norm(v){return String(v??'').toLowerCase().replace(/[_-]+/g,' ').trim()}
function endpointMeta(api){
  const named=api?.named_endpoints||{};
  const keys=Object.keys(named);
  let key=keys.find(k=>/inference.image|image|predict|run/i.test(k))||keys[0]||'/predict';
  if(!key.startsWith('/'))key='/'+key;
  return {key,def:named[key]||named[key.slice(1)]||{}};
}
function argFromParam(p){
  const n=norm(p?.parameter_name||p?.label||p?.name||p?.component);
  if(/image|img|upload|input/.test(n))return handle_file(INPUT);
  if(/prompt|text/.test(n))return PROMPT;
  if(/semantic/.test(n))return false;
  const d=p?.parameter_default??p?.default;
  if(d!==undefined&&d!==null)return d;
  const t=norm(p?.python_type?.type||p?.type);
  if(t.includes('bool'))return false;
  if(t.includes('int')||t.includes('float'))return 0;
  return null;
}
function findImage(data){
  let found=null,seen=new Set();
  function walk(v){
    if(v==null||found)return;
    if(typeof v==='string'&&/^https?:\/\//i.test(v)&&/\.(png|jpg|jpeg|webp)(\?|$)/i.test(v)){found=v;return}
    if(typeof v==='object'){
      if(seen.has(v))return;seen.add(v);
      if(typeof v.url==='string'&&/^https?:\/\//i.test(v.url)){found=v.url;return}
      if(Array.isArray(v))for(const x of v)walk(x);else for(const x of Object.values(v))walk(x);
    }
  }
  walk(data);return found;
}
function edgeMask(mask,w,h,x,y){const i=y*w+x;if(!mask[i])return false;return x===0||y===0||x===w-1||y===h-1||!mask[i-1]||!mask[i+1]||!mask[i-w]||!mask[i+w]}
async function main(){
  fs.mkdirSync(OUT,{recursive:true});
  console.log('Connecting',SPACE);
  const client=await Client.connect(SPACE);
  const api=await client.view_api();
  const ep=endpointMeta(api);
  console.log('endpoint guess',ep.key);
  const params=ep.def?.parameters||[];
  const attempts=[];
  if(params.length)attempts.push({ep:ep.key,args:params.map(argFromParam)});
  for(const e of [ep.key,'/inference_image','/predict'].filter((x,i,a)=>x&&a.indexOf(x)===i)){
    attempts.push({ep:e,args:[handle_file(INPUT),PROMPT,false]});
    attempts.push({ep:e,args:[handle_file(INPUT),PROMPT,true]});
  }
  let result,lastErr,used;
  for(const a of attempts){try{console.log('trying',a.ep,a.args.length);result=await client.predict(a.ep,a.args);used=a;break}catch(e){lastErr=e;console.log('failed',e?.message||e)}}
  if(!result)throw lastErr||new Error('no endpoint succeeded');
  console.log('inference complete',used.ep);
  const url=findImage(result.data);if(!url)throw new Error('no image result '+JSON.stringify(result.data).slice(0,1500));
  console.log('result',url);
  const rr=await fetch(url);if(!rr.ok)throw new Error('download failed '+rr.status);
  const overlayBuf=Buffer.from(await rr.arrayBuffer());
  fs.writeFileSync(path.join(OUT,'refine-tie-overlay.png'),overlayBuf);

  const srcObj=await sharp(INPUT).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const outObj=await sharp(overlayBuf).resize(srcObj.info.width,srcObj.info.height,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h,channels:ch}=srcObj.info;const src=srcObj.data,out=outObj.data;
  const mask=new Uint8Array(w*h);
  let count=0;
  for(let i=0;i<w*h;i++){
    const k=i*ch;const d=Math.abs(src[k]-out[k])+Math.abs(src[k+1]-out[k+1])+Math.abs(src[k+2]-out[k+2]);
    if(d>38){mask[i]=1;count++}
  }
  console.log('mask pixels',count,'ratio',count/(w*h));
  if(count<50)throw new Error('mask too small');
  const rgba=Buffer.alloc(w*h*4),edge=Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,k=i*4;
    if(mask[i]){rgba[k]=255;rgba[k+1]=70;rgba[k+2]=95;rgba[k+3]=255}
    if(edgeMask(mask,w,h,x,y)){edge[k]=255;edge[k+1]=50;edge[k+2]=70;edge[k+3]=255}
  }
  await sharp(rgba,{raw:{width:w,height:h,channels:4}}).png().toFile(path.join(OUT,'refine-tie-mask.png'));
  await sharp(edge,{raw:{width:w,height:h,channels:4}}).png().toFile(path.join(OUT,'refine-tie-outline.png'));
  fs.writeFileSync(path.join(OUT,'refine-tie.json'),JSON.stringify({space:SPACE,prompt:PROMPT,endpoint:used.ep,width:w,height:h,pixels:count,ratio:count/(w*h)},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
