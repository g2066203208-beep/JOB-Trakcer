(()=>{'use strict';
const S=window.CAE_SEED||{projects:[],assets:[]};
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EXTENSIONS={image:['png','jpg','jpeg','webp','gif','bmp'],video:['mp4','webm'],csv:['csv','tsv','txt'],pdf:['pdf'],model:['stl','obj','glb','gltf']};
const MAX_SIZE=150*1024*1024;
const state={db:null,memoryAssets:[],memoryProjects:[],projects:[],assets:[],selected:null,kind:'all',project:'all',pending:[],urls:new Map(),viewerDispose:null,viewerToken:0,toastTimer:null};
const basename=n=>(n||'').split(/[\\/]/).pop();
const ext=n=>(n||'').split('.').pop().toLowerCase();
const kindOf=n=>Object.keys(EXTENSIONS).find(k=>EXTENSIONS[k].includes(ext(n)))||null;
const prettyKind={image:'图片',video:'动画',csv:'数据',pdf:'报告',model:'三维'};
const uid=()=>('asset-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8));
function notice(message){const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.hidden=true,4300);}
function openDatabase(){return new Promise(resolve=>{if(!('indexedDB'in window))return resolve(null);let request;try{request=indexedDB.open('CAE_SIM_PORTFOLIO_V2',1);}catch(e){return resolve(null)}
 request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('assets'))db.createObjectStore('assets',{keyPath:'id'});if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);});}
function storeRead(store){return new Promise(resolve=>{if(!state.db)return resolve(store==='assets'?state.memoryAssets:state.memoryProjects);try{const request=state.db.transaction(store,'readonly').objectStore(store).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>resolve([]);}catch(e){resolve([])}});}
function storePut(store,item){return new Promise((resolve,reject)=>{if(!state.db){(store==='assets'?state.memoryAssets:state.memoryProjects).push(item);return resolve()}try{const tx=state.db.transaction(store,'readwrite');tx.objectStore(store).put(item);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('写入失败'));tx.onabort=()=>reject(tx.error||Error('数据库写入中断'));}catch(e){reject(e)}});}
function storeDelete(store,id){return new Promise((resolve,reject)=>{if(!state.db){const a=store==='assets'?state.memoryAssets:state.memoryProjects;const i=a.findIndex(v=>v.id===id);if(i>=0)a.splice(i,1);return resolve()}try{const tx=state.db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('删除失败'))}catch(e){reject(e)}});}
function makeUrl(a){if(a.src)return a.src;if(!a.blob)return '';if(!state.urls.has(a.id))state.urls.set(a.id,URL.createObjectURL(a.blob));return state.urls.get(a.id)}
function findProject(id){return state.projects.find(p=>p.id===id);}
function selectedAssets(){return state.assets.filter(a=>(state.kind==='all'||a.kind===state.kind)&&(state.project==='all'||a.projectId===state.project)).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));}
function updateIndexes(){
 $('archiveCount').innerHTML=String(state.projects.length).padStart(2,'0')+' <span>PROJECTS</span>';
 $('projectTotal').textContent='/ '+String(state.projects.length).padStart(2,'0');
 $('fileCount').textContent=state.assets.length+' 个已归档文件（本地与站内）';
}
function renderProjects(){
 const html=state.projects.map((p,i)=>{
  const cover=state.assets.find(a=>a.projectId===p.id&&a.kind==='image')||null;
  const coverUrl=cover?makeUrl(cover):(p.cover||'');
  const media=coverUrl?'<img loading="lazy" src="'+esc(coverUrl)+'" alt="'+esc(p.title)+' 真实仿真结果截图">':'<div class="media-empty"><strong>尚无已归档的结果截图</strong><small>上传真实的 Abaqus / ANSYS 云图后<br>将在这里直接展示</small></div>';
  const count=state.assets.filter(a=>a.projectId===p.id).length;
  const featured=(p.featured&&i===0);
  return '<article tabindex="0" role="button" aria-label="打开项目 '+esc(p.title)+'" data-project="'+esc(p.id)+'" class="project-card '+(featured?'featured':'')+'"><div class="project-media">'+media+'<div class="media-corner"><span>'+esc(p.software||'CAE')+'</span></div><span class="media-id">'+esc(p.id)+'</span></div><div class="project-meta"><div><div class="project-index"><span>PROJECT '+String(i+1).padStart(2,'0')+'</span><span>'+esc(p.subtitle||'')+'</span></div><h3>'+esc(p.title)+'</h3><p>'+esc(p.description||'')+'</p><div class="project-tags">'+(p.disciplines||[]).map(x=>'<span>'+esc(x)+'</span>').join('')+'</div></div><div class="project-bottom"><span>'+esc(p.status||'整理中')+' · '+count+' 个结果</span><strong>查看项目 ↗</strong></div></div></article>';
 }).join('');
 $('projectGrid').innerHTML=html||'<p>还没有项目，点击右上方「创建项目」开始。</p>';
 $('projectGrid').querySelectorAll('[data-project]').forEach(el=>{
  const activate=()=>{state.project=el.dataset.project;state.kind='all';fillFilters();renderAssets();$('results').scrollIntoView({behavior:'smooth',block:'start'});};
  el.addEventListener('click',activate);el.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();activate()}});
 });
 updateIndexes();
}
function fillFilters(){
 const opt=state.projects.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.title)+'</option>').join('');
 $('projectFilter').innerHTML='<option value="all">全部项目</option>'+opt;
 $('uploadProject').innerHTML=opt;
 if(!findProject(state.project)&&state.project!=='all')state.project='all';
 $('projectFilter').value=state.project;
 $('uploadProject').value=state.project==='all'?(state.projects[0]?.id||''):state.project;
 document.querySelectorAll('#typeFilters button').forEach(b=>b.classList.toggle('active',b.dataset.kind===state.kind));
}
function iconLabel(a){return {image:'IMG',csv:'CSV',model:'3D',video:'MP4',pdf:'PDF'}[a.kind]||'FILE';}
function renderAssets(){
 const filtered=selectedAssets();
 if(!filtered.length){$('assetList').innerHTML='<div class="asset-empty"><strong>还没有这一分类的真实文件</strong><span>从本机导入结果后，图片会生成缩略图；CSV 可绘制曲线；三维模型可旋转观察。</span><br><button id="assetImport" type="button">＋ 添加结果文件</button></div>';$('assetImport').onclick=openUpload;}
 else $('assetList').innerHTML=filtered.map(a=>'<button class="asset-row '+(state.selected===a.id?'active':'')+'" data-asset="'+esc(a.id)+'"><span class="asset-icon">'+(a.kind==='image'?'<img loading="lazy" src="'+esc(makeUrl(a))+'" alt="">':esc(iconLabel(a)))+'</span><span class="asset-desc"><strong>'+esc(a.title||basename(a.name))+'</strong><small>'+esc(a.software||'CAE')+' · '+esc(prettyKind[a.kind]||'文件')+'</small></span><b>↗</b></button>').join('');
 $('assetList').querySelectorAll('[data-asset]').forEach(b=>b.onclick=()=>{state.selected=b.dataset.asset;renderAssets();showAsset(state.assets.find(a=>a.id===state.selected));});
 if(!state.selected||!filtered.some(a=>a.id===state.selected)){state.selected=filtered[0]?.id||null;showAsset(state.assets.find(a=>a.id===state.selected));}
 else if(!state.assets.some(a=>a.id===state.selected))showAsset(null);
 updateIndexes();
}
function clearViewer(){state.viewerToken++;if(typeof state.viewerDispose==='function'){try{state.viewerDispose()}catch(e){}}state.viewerDispose=null;$('viewerFrame').replaceChildren();}
function viewerEmpty(){clearViewer();$('viewerFrame').innerHTML='<div class="viewer-empty"><span>CAE / VIEWER</span><h3>选择一个真实结果</h3><p>支持图片、CSV 曲线、动画、PDF 及 STL / OBJ / GLB 模型。还没有文件时不会显示假的有限元图。</p><button class="btn btn-light" id="emptyUpload" type="button">导入结果 →</button></div>';$('emptyUpload').onclick=openUpload;$('viewerInfo').innerHTML='<span>REAL DATA ONLY — NO SIMULATED PREVIEWS</span>';}
function showAsset(asset){
 if(!asset){viewerEmpty();return;}
 clearViewer();
 const frame=$('viewerFrame'),url=makeUrl(asset),token=state.viewerToken;
 const wrapper=document.createElement('div');wrapper.className='viewer-media';
 const typeTag=document.createElement('span');typeTag.className='viewer-overlay';typeTag.textContent=(asset.software||'CAE')+' / '+(prettyKind[asset.kind]||'RESULT');wrapper.append(typeTag);
 frame.append(wrapper);
 if(asset.kind==='image'){const img=new Image();img.alt=asset.title||asset.name;img.src=url;img.title='点击放大查看原图';img.onclick=()=>openLightbox(asset);wrapper.append(img);}
 else if(asset.kind==='video'){const video=document.createElement('video');video.src=url;video.controls=true;video.playsInline=true;video.preload='metadata';wrapper.append(video);}
 else if(asset.kind==='pdf'){const pdf=document.createElement('iframe');pdf.title=asset.title||'仿真技术报告';pdf.src=url;wrapper.append(pdf);}
 else if(asset.kind==='csv'){showCsv(wrapper,asset,token);}
 else if(asset.kind==='model'){
  const host=document.createElement('div');host.className='model-host';wrapper.append(host);
  const msg=document.createElement('div');msg.className='viewer-error';msg.textContent='正在读取三维模型…';host.append(msg);
  import('./viewer3d.js?v=2.0').then(module=>{if(token!==state.viewerToken)return;return module.mount(host,url,asset.name||asset.src).then(dispose=>{if(token===state.viewerToken)state.viewerDispose=dispose;else if(dispose)dispose();});}).catch(err=>{if(token===state.viewerToken){host.innerHTML='<div class="viewer-error">模型加载失败。请检查文件格式或三维库网络连接。<br>错误：'+esc(err.message||err)+'</div>';}});}
 const info=$('viewerInfo');info.replaceChildren();
 const meta=document.createElement('span');meta.innerHTML='<strong>'+esc(asset.title||asset.name)+'</strong>　'+esc(findProject(asset.projectId)?.title||'独立文件')+'　'+esc(asset.notes||'');
 const actions=document.createElement('div');actions.className='viewer-actions';
 function btn(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;actions.append(b);return b;}
 if(asset.kind==='image'){btn('放大原图 ↗',()=>openLightbox(asset));const peers=state.assets.filter(a=>a.projectId===asset.projectId&&a.kind==='image'&&a.id!==asset.id);if(peers.length)btn('左右对比',()=>setupCompare(asset,peers));}
 const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.download=basename(asset.name)||'result';link.textContent='打开 / 保存源文件 ↗';actions.append(link);
 if(asset.blob){const del=btn('删除本地文件',()=>deleteAsset(asset));del.classList.add('danger');}
 info.append(meta,actions);
}
function openLightbox(asset){if(!asset||asset.kind!=='image')return;$('lightboxImage').src=makeUrl(asset);$('lightboxImage').alt=asset.title||asset.name;$('lightboxTitle').textContent=asset.title||asset.name;$('lightbox').hidden=false;}
function closeLightbox(){$('lightbox').hidden=true;$('lightboxImage').removeAttribute('src');}
async function deleteAsset(asset){if(!confirm('从当前浏览器删除这个结果文件？不会影响 GitHub 仓库内容。'))return;
 try{if(asset.blob)await storeDelete('assets',asset.id);state.assets=state.assets.filter(a=>a.id!==asset.id);const url=state.urls.get(asset.id);if(url)URL.revokeObjectURL(url);state.urls.delete(asset.id);state.selected=null;renderProjects();renderAssets();notice('本地文件已删除')}catch(e){notice('删除失败：'+e.message);}}
function setupCompare(left,peers){
 const info=$('viewerInfo');const box=document.createElement('div');box.className='viewer-actions';box.style.width='100%';
 const select=document.createElement('select');select.setAttribute('aria-label','选择要对比的第二张图片');select.style.cssText='background:#2b4046;color:#e6eeeb;border:1px solid #536a6e;padding:9px;font-size:11px;max-width:240px';
 peers.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.title||p.name;select.append(o);});box.append(select);
 const b=document.createElement('button');b.textContent='开始图片对比';b.type='button';b.style.cssText='background:#2b4046;color:#e6eeeb;border:1px solid #536a6e;padding:9px;font-size:11px';
 b.onclick=()=>showCompare(left,state.assets.find(a=>a.id===select.value));box.append(b);info.append(box);
}
function showCompare(left,right){if(!left||!right)return;clearViewer();
 const frame=$('viewerFrame'),box=document.createElement('div');box.className='compare-stage';const a=document.createElement('img');a.src=makeUrl(left);a.alt='对比基准：'+(left.title||left.name);
 const wrap=document.createElement('div');wrap.className='compare-overlay';const b=document.createElement('img');b.src=makeUrl(right);b.alt='对比第二张：'+(right.title||right.name);wrap.append(b);box.append(a,wrap);frame.append(box);
 const badge=document.createElement('div');badge.className='compare-label';badge.innerHTML='<span>A / '+esc(left.title||left.name)+'</span><span>B / '+esc(right.title||right.name)+'</span>';frame.append(badge);
 const range=document.createElement('input');range.type='range';range.min='0';range.max='100';range.value='50';range.className='compare-slider';range.setAttribute('aria-label','调节左右对比图分割位置');range.oninput=()=>{wrap.style.clipPath='inset(0 '+(100-Number(range.value))+'% 0 0)';};frame.append(range);
 const actions=document.createElement('div');actions.className='viewer-actions';const reset=document.createElement('button');reset.textContent='← 返回单图';reset.onclick=()=>showAsset(left);actions.append(reset);
 $('viewerInfo').replaceChildren(document.createTextNode('仅供同一物理量、同一视角和同一色标下的结果对比；不会自动对齐或重采样。'),actions);
}
function splitCsvLine(line,delimiter){const out=[];let v='',inside=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(inside&&line[i+1]==='"'){v+='"';i++;}else inside=!inside;}else if(c===delimiter&&!inside){out.push(v.trim());v='';}else v+=c;}out.push(v.trim());return out;}
function parseCsv(content,filename){const lines=content.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/).filter(x=>x.trim()&& !x.trim().startsWith('#')).slice(0,60001);
 if(lines.length<2)throw Error('至少需要表头和一行数据');
 const first=lines[0],delimiter=ext(filename)==='tsv'?'\t':['\t',',',';'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
 const columns=splitCsvLine(first,delimiter);if(columns.length<2)throw Error('未识别到至少两列数据');
 const rows=lines.slice(1).map(line=>splitCsvLine(line,delimiter)).filter(r=>r.length>=2);
 if(!rows.length)throw Error('没有可绘制的数据行');return{columns,rows};}
function drawChart(canvas,data,xIndex,yIndex){
 const dpr=Math.min(window.devicePixelRatio||1,2),bounds=canvas.getBoundingClientRect(),width=Math.max(320,bounds.width||720),height=360;
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
 ctx.fillStyle='#111b21';ctx.fillRect(0,0,width,height);
 const numeric=s=>{const v=Number(String(s).replace(/\s/g,''));return Number.isFinite(v)?v:NaN;};
 const raw=data.rows.map((r,i)=>[numeric(r[xIndex]),numeric(r[yIndex]),i]).filter(p=>Number.isFinite(p[1]));
 if(!raw.length){ctx.fillStyle='#dbded8';ctx.fillText('所选 Y 列没有有效数字',35,40);return;}
 const validX=raw.filter(p=>Number.isFinite(p[0])).length;
 const points=raw.map(p=>[validX===raw.length?p[0]:p[2],p[1]]);
 let xmin=Math.min(...points.map(p=>p[0]).filter(Number.isFinite)),xmax=Math.max(...points.map(p=>p[0]).filter(Number.isFinite)),ymin=Math.min(...points.map(p=>p[1])),ymax=Math.max(...points.map(p=>p[1]));
 if(xmin===xmax){xmin-=1;xmax+=1}if(ymin===ymax){ymin-=1;ymax+=1}
 const pad={l:70,r:23,t:24,b:65},w=width-pad.l-pad.r,h=height-pad.t-pad.b,xx=x=>pad.l+(x-xmin)/(xmax-xmin)*w,yy=y=>pad.t+h-(y-ymin)/(ymax-ymin)*h;
 ctx.strokeStyle='#293c42';ctx.lineWidth=1;ctx.font='11px ui-monospace,monospace';ctx.fillStyle='#94aab0';
 for(let k=0;k<=5;k++){const py=pad.t+k*h/5,dy=ymax-k*(ymax-ymin)/5;ctx.beginPath();ctx.moveTo(pad.l,py);ctx.lineTo(width-pad.r,py);ctx.stroke();ctx.fillText(dy.toPrecision(4),7,py+4);}
 for(let k=0;k<=5;k++){const px=pad.l+k*w/5,dx=xmin+k*(xmax-xmin)/5;ctx.beginPath();ctx.moveTo(px,pad.t);ctx.lineTo(px,pad.t+h);ctx.stroke();ctx.fillText(dx.toPrecision(4),Math.max(0,px-16),height-41);}
 ctx.save();ctx.beginPath();ctx.rect(pad.l,pad.t,w,h);ctx.clip();ctx.strokeStyle='#c7d1c4';ctx.lineWidth=1.7;ctx.lineJoin='round';ctx.beginPath();const step=Math.max(1,Math.ceil(points.length/4000));points.forEach((p,i)=>{if(i%step!==0&&i!==points.length-1)return;const x=xx(p[0]),y=yy(p[1]);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();ctx.restore();
 ctx.font='12px sans-serif';ctx.fillStyle='#b6c8c8';ctx.textAlign='center';ctx.fillText(data.columns[xIndex]+(validX===raw.length?'':'（行号）'),pad.l+w/2,height-9);
 ctx.save();ctx.translate(17,pad.t+h/2);ctx.rotate(-Math.PI/2);ctx.fillText(data.columns[yIndex],0,0);ctx.restore();ctx.textAlign='left';
}
async function showCsv(wrapper,asset,token){
 try{
  const url=makeUrl(asset),content=asset.blob?await asset.blob.text():await fetch(url).then(r=>{if(!r.ok)throw Error('下载 CSV 失败');return r.text()});
  if(token!==state.viewerToken)return;
  const data=parseCsv(content,asset.name||asset.src);
  wrapper.style.display='block';wrapper.style.padding='40px 15px 18px';
  const controls=document.createElement('div');controls.className='chart-settings';
  const x=document.createElement('select'),y=document.createElement('select');
  data.columns.forEach((c,i)=>{for(const el of [x,y]){const opt=document.createElement('option');opt.value=i;opt.textContent=c||('列 '+(i+1));el.append(opt);}});
  x.value='0';y.value=String(Math.min(1,data.columns.length-1));
  controls.append(document.createTextNode('X 轴'),x,document.createTextNode('Y 轴'),y);
  const canvas=document.createElement('canvas');canvas.className='chart-canvas';canvas.setAttribute('aria-label','从上传 CSV 实际数据绘制的结果曲线');
  const caption=document.createElement('p');caption.className='chart-note';caption.textContent=data.rows.length+' 行真实数据；仅绘制数值列，超过 4000 点时屏幕预览会抽样。';
  wrapper.append(controls,canvas,caption);
  const repaint=()=>{if(token===state.viewerToken)drawChart(canvas,data,Number(x.value),Number(y.value))};x.onchange=repaint;y.onchange=repaint;
  requestAnimationFrame(repaint);const onResize=()=>repaint();window.addEventListener('resize',onResize);
  state.viewerDispose=()=>window.removeEventListener('resize',onResize);
 }catch(e){if(token===state.viewerToken)wrapper.innerHTML='<div class="viewer-error">CSV 无法绘制：'+esc(e.message)+'<br>请使用首行列名、其后数值数据的 CSV / TSV 文件。</div>';}
}
function toggleOverlay(name,on){const box=$(name==='upload'?'uploadOverlay':'projectOverlay');box.hidden=!on;document.body.style.overflow=(!($('uploadOverlay').hidden&&$('projectOverlay').hidden)||!$('lightbox').hidden)?'hidden':'';}
function openUpload(){fillFilters();$('uploadTitleInput').value='';$('uploadNotes').value='';state.pending=[];$('filesSelected').textContent='尚未选择文件';$('importFiles').disabled=true;$('uploadFiles').value='';toggleOverlay('upload',true);}
function closeOverlay(name){toggleOverlay(name,false);}
function setFiles(input){const files=Array.from(input||[]);const valid=files.filter(f=>kindOf(f.name)&&f.size<=MAX_SIZE);const invalid=files.filter(f=>!kindOf(f.name)||f.size>MAX_SIZE);state.pending=valid;
 $('filesSelected').textContent=valid.length?valid.map(f=>f.name+' ('+(f.size/1024/1024).toFixed(1)+' MB)').join(' · '):'尚未选择有效文件';
 $('importFiles').disabled=!valid.length;
 if(invalid.length)notice(invalid.length+' 个文件不支持或超过单文件 150 MB，请先从求解器导出支持的格式。');
}
async function importSelectedFiles(){
 if(!state.pending.length)return;const button=$('importFiles');button.disabled=true;button.textContent='正在保存…';let succeeded=0;let first=null;
 try{for(const file of state.pending){
 const asset={id:uid(),projectId:$('uploadProject').value,title:state.pending.length===1?($('uploadTitleInput').value.trim()||file.name):file.name,name:file.name,kind:kindOf(file.name),software:$('uploadSoftware').value,notes:$('uploadNotes').value.trim(),blob:file,createdAt:new Date().toISOString(),local:true};
 await storePut('assets',asset);state.assets.unshift(asset);if(!first)first=asset;succeeded++;
 }
 state.project=$('uploadProject').value;state.kind='all';state.selected=first?.id||null;closeOverlay('upload');fillFilters();renderProjects();renderAssets();$('results').scrollIntoView({behavior:'smooth'});notice('已导入 '+succeeded+' 个真实文件，保存在当前浏览器');
 }catch(e){notice('写入失败：'+(e.message||'存储容量不足')+'。已成功保存 '+succeeded+' 个文件。');renderProjects();renderAssets();}
 finally{button.disabled=!state.pending.length;button.textContent='导入到作品集 →';state.pending=[];}
}
async function addProject(){
 const title=$('newProjectName').value.trim();if(!title){notice('请填写项目名称');return;}
 const software=$('newProjectSoftware').value.trim()||'CAE',description=$('newProjectDesc').value.trim();
 const p={id:'LOCAL-'+Date.now().toString(36).toUpperCase(),title,subtitle:'PERSONAL PROJECT',description,software,disciplines:['本地案例'],status:'本地新建 · 待归档',featured:false,local:true,cover:null};
 try{await storePut('projects',p);state.projects.push(p);closeOverlay('project');state.project=p.id;fillFilters();renderProjects();renderAssets();notice('项目已在本地创建，可导入真实结果');}catch(e){notice('创建失败：'+e.message);}
}
function bind(){
 ['openUpload','heroUpload','addResult','bottomUpload'].forEach(id=>$(id).onclick=openUpload);
 $('newProject').onclick=()=>{['newProjectName','newProjectSoftware','newProjectDesc'].forEach(id=>$(id).value='');toggleOverlay('project',true);};
 $('saveNewProject').onclick=addProject;
 document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeOverlay(b.dataset.close));
 $('projectFilter').onchange=e=>{state.project=e.target.value;state.selected=null;renderAssets();};
 $('typeFilters').onclick=e=>{const b=e.target.closest('button[data-kind]');if(!b)return;state.kind=b.dataset.kind;state.selected=null;fillFilters();renderAssets();};
 $('uploadFiles').onchange=e=>setFiles(e.target.files);
 const dz=$('dropzone');
 dz.onclick=e=>{if(e.target.tagName!=='INPUT')$('uploadFiles').click()};
 dz.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('uploadFiles').click();}};
 dz.ondragover=e=>{e.preventDefault();dz.classList.add('dragover')};dz.ondragleave=()=>dz.classList.remove('dragover');
 dz.ondrop=e=>{e.preventDefault();dz.classList.remove('dragover');setFiles(e.dataTransfer.files)};
 const workspace=document.querySelector('.result-workspace');
 workspace.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault()});
 workspace.addEventListener('drop',e=>{if(e.dataTransfer.files.length){e.preventDefault();openUpload();setFiles(e.dataTransfer.files);}});
 $('importFiles').onclick=importSelectedFiles;
 $('lightboxClose').onclick=closeLightbox;
 $('lightbox').onclick=e=>{if(e.target===$('lightbox'))closeLightbox()};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeLightbox();closeOverlay('upload');closeOverlay('project');}});
 window.addEventListener('beforeunload',()=>state.urls.forEach(u=>URL.revokeObjectURL(u)));
}
async function init(){
 bind();state.db=await openDatabase();
 if(!state.db)notice('当前浏览器不支持持久保存：本次导入仅在页面打开期间有效');
 const [projects,assets]=await Promise.all([storeRead('projects'),storeRead('assets')]);
 state.projects=[...(S.projects||[]),...projects];state.assets=[...(S.assets||[]),...assets];fillFilters();renderProjects();renderAssets();
}
init().catch(e=>notice('作品集初始化失败：'+e.message));
})();