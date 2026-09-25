import fs from 'node:fs';
import path from 'node:path';
import {Client,handle_file} from '@gradio/client';

const SPACE='24yearsold/see-through-demo';
const INPUT='character-puppet-lab/character.jpg';
const OUTDIR='character-see-through-lab';
const OUTPSD=path.join(OUTDIR,'result.psd');
const OUTMETA=path.join(OUTDIR,'result-meta.json');

function norm(v){return String(v??'').toLowerCase().replace(/[_-]+/g,' ').trim()}
function endpointMeta(api){
  const named=api?.named_endpoints||{};
  const keys=Object.keys(named);
  let key=keys.find(k=>/infer|predict|run/i.test(k))||keys[0]||'/predict';
  if(!key.startsWith('/'))key='/'+key;
  return {key,def:named[key]||named[key.slice(1)]||{}};
}
function argFromParam(p){
  const n=norm(p?.parameter_name||p?.label||p?.name||p?.component);
  if(/image|img|upload|input/.test(n))return handle_file(INPUT);
  if(/resolution|size/.test(n))return 768;
  if(/seed/.test(n))return 42;
  if(/tblr|left right|split/.test(n))return true;
  const d=p?.parameter_default??p?.default;
  if(d!==undefined&&d!==null)return d;
  const t=norm(p?.python_type?.type||p?.type);
  if(t.includes('bool'))return false;
  if(t.includes('int')||t.includes('float'))return 0;
  return null;
}
function walk(v,fn,seen=new Set()){
  if(v==null)return;
  if(typeof v==='object'){
    if(seen.has(v))return;seen.add(v);fn(v);
    if(Array.isArray(v))for(const x of v)walk(x,fn,seen);
    else for(const x of Object.values(v))walk(x,fn,seen);
  }
}
function findPsd(data){
  let found=null;
  walk(data,o=>{
    if(found)return;
    if(typeof o==='string'&&o.toLowerCase().includes('.psd'))found={url:o};
    if(typeof o==='object')for(const k of ['url','path','name','orig_name']){
      const v=o?.[k];
      if(typeof v==='string'&&v.toLowerCase().includes('.psd')){found=o.url?o:{...o,url:v};break}
    }
  });
  return found;
}
async function main(){
  if(!fs.existsSync(INPUT))throw new Error('Missing input '+INPUT);
  fs.mkdirSync(OUTDIR,{recursive:true});
  console.log('Connecting',SPACE);
  const client=await Client.connect(SPACE);
  const api=await client.view_api();
  const ep=endpointMeta(api);
  console.log('API endpoint guess',ep.key);
  const params=ep.def?.parameters||[];
  const attempts=[];
  if(params.length)attempts.push({ep:ep.key,args:params.map(argFromParam),why:'view_api'});
  const endpoints=[ep.key,'/inference','/predict'].filter((x,i,a)=>x&&a.indexOf(x)===i);
  for(const e of endpoints){
    attempts.push({ep:e,args:[handle_file(INPUT),768,42,true],why:'4 args'});
    attempts.push({ep:e,args:[handle_file(INPUT),768,42],why:'3 args'});
    attempts.push({ep:e,args:[handle_file(INPUT),42],why:'2 args'});
  }
  let result,lastErr,used;
  for(const a of attempts){
    try{
      console.log('Trying',a.ep,a.why,'argc',a.args.length);
      result=await client.predict(a.ep,a.args);
      used=a;break;
    }catch(e){
      lastErr=e;
      console.log('Attempt failed:',e?.message||e);
    }
  }
  if(!result)throw lastErr||new Error('No endpoint succeeded');
  console.log('Inference returned from',used.ep);
  fs.writeFileSync(OUTMETA,JSON.stringify({space:SPACE,endpoint:used.ep,when:new Date().toISOString(),data:result.data},null,2));
  const psd=findPsd(result.data);
  if(!psd)throw new Error('No PSD found in result: '+JSON.stringify(result.data).slice(0,2000));
  let url=psd.url||psd.path;
  if(!/^https?:\/\//i.test(url))throw new Error('PSD URL is not absolute: '+url);
  console.log('Downloading PSD',url);
  const r=await fetch(url);
  if(!r.ok)throw new Error('PSD download failed '+r.status);
  const buf=Buffer.from(await r.arrayBuffer());
  if(buf.length<1024)throw new Error('PSD suspiciously small: '+buf.length);
  fs.writeFileSync(OUTPSD,buf);
  console.log('Saved',OUTPSD,buf.length,'bytes');
}
main().catch(e=>{console.error(e);process.exit(1)});
