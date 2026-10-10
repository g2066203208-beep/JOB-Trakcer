(function(){
 "use strict";
 const d=window.CAE_DATA;if(!d){document.body.insertAdjacentHTML("afterbegin","<p>资源数据加载失败，请刷新页面。</p>");return;}
 const $=id=>document.getElementById(id);
 const esc=value=>String(value==null?"":value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
 $("statSoftware").textContent=d.software.length;
 $("statCases").textContent=d.cases.filter(c=>c.category==="研究记录").length;
 $("statTracks").textContent=d.tracks.length;
 const KEY="cae-lab-learning-v1";
 let stored={};try{stored=JSON.parse(localStorage.getItem(KEY)||"{}")||{};}catch(e){stored={};}
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(stored));}catch(e){}}
 function updateProgress(){const all=d.tracks.reduce((n,t)=>n+t.tasks.length,0);const done=Object.values(stored).filter(Boolean).length;$("statProgress").textContent=done+" / "+all;}
 function renderTracks(){
  $("tracks").innerHTML=d.tracks.map((t,i)=>'<article class="track"><div class="num">STEP '+String(i+1).padStart(2,"0")+'</div><div><h3>'+esc(t.name)+'</h3><p>'+esc(t.desc)+'</p><div class="tasks">'+t.tasks.map((task,j)=>{const id=t.id+"-"+j;return '<label><input type="checkbox" data-task="'+esc(id)+'" '+(stored[id]?'checked':'')+'><span>'+esc(task)+'</span></label>';}).join("")+'</div></div></article>').join("");
  $("tracks").querySelectorAll("[data-task]").forEach(el=>el.addEventListener("change",()=>{stored[el.dataset.task]=el.checked;persist();updateProgress();}));
  updateProgress();
 }
 $("resetProgress").addEventListener("click",()=>{if(confirm("确定清除当前浏览器中的 CAE 学习勾选？")){stored={};persist();renderTracks();}});
 let currentType="全部";
 function renderSoftware(){
   const list=d.software.filter(x=>currentType==="全部"||x.type===currentType);
   $("softwareGrid").innerHTML=list.map(x=>'<article class="tool-card"><div class="tool-top"><div><h3>'+esc(x.name)+'</h3><div class="kind">'+esc(x.type.toUpperCase())+'</div></div><span class="level">'+esc(x.status)+'</span></div><p>'+esc(x.desc)+'</p></article>').join("");
   $("softwareFilters").querySelectorAll("button").forEach(b=>b.classList.toggle("selected",b.dataset.type===currentType));
 }
 $("softwareFilters").addEventListener("click",e=>{const b=e.target.closest("button[data-type]");if(!b)return;currentType=b.dataset.type;renderSoftware();});
 function renderCases(){
   const q=$("caseSearch").value.toLowerCase().trim(),status=$("caseStatus").value;
   const list=d.cases.filter(x=>(status==="全部"||x.category===status)&&[x.title,x.desc,x.tag,...x.software].join(" ").toLowerCase().includes(q));
   $("caseGrid").innerHTML=list.map(x=>'<article class="case"><div class="case-banner '+esc(x.banner)+'"><span>'+esc(x.tag.split(" / ")[0])+'</span><small>'+esc(x.id)+'</small></div><div class="case-body"><div class="case-title"><h3>'+esc(x.title)+'</h3><span class="case-state '+(x.category==="规划练习"?"planned":"")+'">'+esc(x.category)+'</span></div><p>'+esc(x.desc)+'</p><div class="metrics">'+x.metrics.map(m=>'<div><strong>'+esc(m[0])+'</strong><small>'+esc(m[1])+'</small></div>').join("")+'</div><div class="chips">'+x.software.map(s=>'<span>'+esc(s)+'</span>').join("")+'</div><details><summary>查看做法、验证与待补证据</summary><div class="case-details"><b>关键工作</b><ul>'+x.work.map(w=>'<li>'+esc(w)+'</li>').join("")+'</ul><b>已记录信息与验证限制</b><p>'+esc(x.verification)+'</p><b>待补原始证据</b><p>'+esc(x.missing)+'</p></div></details></div></article>').join("");
   $("caseEmpty").hidden=list.length>0;
 }
 $("caseSearch").addEventListener("input",renderCases);
 $("caseStatus").addEventListener("change",renderCases);
 $("resourceGrid").innerHTML=d.resources.map(x=>'<article class="resource"><span>'+esc(x.category.toUpperCase())+'</span><h3>'+esc(x.title)+'</h3><p>'+esc(x.desc)+'</p><a target="_blank" rel="noopener" href="'+esc(x.url)+'">打开资源 ↗</a></article>').join("");
 renderTracks();renderSoftware();renderCases();
})();