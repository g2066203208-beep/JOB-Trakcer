const MANUAL_JOBS=window.JOB_DATA||[];
const AUTO_JOBS=window.AUTO_JOB_DATA||[];
const AUTO_META=window.AUTO_SCAN_META||{};
const TARGETS=window.COMPANY_TARGETS||[];
const JOBS=(()=>{const out=[],seen=new Set();for(const j of [...MANUAL_JOBS,...AUTO_JOBS]){const k=((j.applyUrl||"")+"|"+(j.title||"")+"|"+(j.company||"")).toLowerCase();if(!seen.has(k)){seen.add(k);out.push(j)}}return out})();
const CFG=window.SUPABASE_CONFIG||{};
const cloudConfigured=!!(CFG.url&&CFG.anonKey&&!CFG.url.startsWith("YOUR_")&&!CFG.anonKey.startsWith("YOUR_"));
const sb=cloudConfigured?window.supabase.createClient(CFG.url,CFG.anonKey):null;
let session=null,mine={},authMode="login",onlyMine=false,noteJobId=null,currentDetailId=null,currentView="jobs",deadlineDirection="asc";

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function normalizeStage(s){if(!s||s==="未申请")return"未申请";if(["被拒","已拒绝","已放弃"].includes(s))return"被拒";return"已申请"}
function myState(id){const r=mine[id]||{stage:"未申请",note:""};return{...r,stage:normalizeStage(r.stage)}}
function tracked(id){const s=myState(id);return s.stage!=="未申请"||!!s.note}
function daysLeft(s){if(!s)return null;const d=new Date(s+"T00:00:00"),n=new Date(),a=new Date(n.getFullYear(),n.getMonth(),n.getDate()),b=new Date(d.getFullYear(),d.getMonth(),d.getDate());return Math.ceil((b-a)/86400000)}
function fmtDate(s){if(!s)return"待定";const d=new Date(s+"T00:00:00");return`${d.getMonth()+1}月${d.getDate()}日`}
function isVerified(j){if(j.verified===true)return true;if(j.auto===true&&j.verified!==true)return false;return/官方|集团官网|官方招聘|官方 Careers|官方校园招聘|官方公告|招聘官网/.test(j.source||"")}
function initials(n){return String(n||"企").replace(/中国|集团|股份有限公司|有限公司|科技|能源/g,"").slice(0,2)||"企"}
function deadlineMeta(j){const d=daysLeft(j.deadline);return{expired:d!==null&&d<0,urgent:d!==null&&d>=0&&d<=7}}
function compact(s,n=145){s=String(s||"");return s.length>n?s.slice(0,n)+"…":s}

function localUsers(){return JSON.parse(localStorage.getItem("jt_local_users_v1")||"{}")}
function localSessionEmail(){return localStorage.getItem("jt_local_session_v1")||""}
function localDataKey(e){return"jt_apps_v2:"+e.toLowerCase()}
function bytesHex(a){return[...a].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function sha256(t){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t));return bytesHex(new Uint8Array(b))}
async function localSignup(email,pw){const e=email.trim().toLowerCase(),u=localUsers();if(u[e])throw new Error("这个邮箱已注册，请直接登录。");const salt=bytesHex(crypto.getRandomValues(new Uint8Array(16)));u[e]={salt,hash:await sha256(salt+"|"+pw)};localStorage.setItem("jt_local_users_v1",JSON.stringify(u));localStorage.setItem("jt_local_session_v1",e);session={user:{id:"local:"+await sha256(e),email:e}}}
async function localLogin(email,pw){const e=email.trim().toLowerCase(),u=localUsers()[e];if(!u)throw new Error("本浏览器没有这个账号，请先注册。");if(await sha256(u.salt+"|"+pw)!==u.hash)throw new Error("密码不正确。");localStorage.setItem("jt_local_session_v1",e);session={user:{id:"local:"+await sha256(e),email:e}}}
function localLogout(){localStorage.removeItem("jt_local_session_v1");session=null;mine={}}
function loadLocalMine(){mine=session?JSON.parse(localStorage.getItem(localDataKey(session.user.email))||"{}"):{}}
function saveLocalMine(){if(session)localStorage.setItem(localDataKey(session.user.email),JSON.stringify(mine))}
async function initSession(){if(cloudConfigured){const{data}=await sb.auth.getSession();session=data.session;await loadMine();sb.auth.onAuthStateChange(async(_e,s)=>{session=s;await loadMine();updateUserUI();renderAll()})}else{const e=localSessionEmail();if(e){session={user:{id:"local:"+await sha256(e),email:e}};loadLocalMine()}}updateUserUI()}
async function loadMine(){mine={};if(!session)return;if(!cloudConfigured){loadLocalMine();return}const{data}=await sb.from("user_applications").select("job_id,stage,note,updated_at");(data||[]).forEach(r=>mine[r.job_id]=r)}
async function saveState(id,patch){if(!session){openAuth();return false}const c=myState(id),row={job_id:id,stage:patch.stage??c.stage,note:patch.note??c.note??""};if(!cloudConfigured){mine[id]={...row,updated_at:new Date().toISOString()};saveLocalMine();renderAll();return true}const{data,error}=await sb.from("user_applications").upsert({...row,user_id:session.user.id},{onConflict:"user_id,job_id"}).select().single();if(error)return false;mine[id]=data;renderAll();return true}
async function deleteState(id){if(!session)return;if(!cloudConfigured){delete mine[id];saveLocalMine();$("#noteDialog").close();renderAll();return}await sb.from("user_applications").delete().eq("user_id",session.user.id).eq("job_id",id);delete mine[id];$("#noteDialog").close();renderAll()}

const REGIONS=["北京","上海","天津","重庆","广东","江苏","浙江","湖北","湖南","四川","陕西","山东","安徽","福建","河南","河北","江西","辽宁","吉林","黑龙江","广西","云南","贵州","海南","山西","内蒙古","甘肃","青海","宁夏","新疆","西藏","海外","全国"];
function regionOf(j){const s=j.location||"";const h=REGIONS.filter(r=>s.includes(r));if(h.length)return h;if(/全国|多地|按岗位/.test(s))return["全国"];return s&&s!=="待核验"?[s]:["待核验"]}
function degreePass(j,v){if(!v)return true;const s=j.degree||"";if(v==="本科")return/本科|大学本科/.test(s);if(v==="硕士")return/硕士|研究生/.test(s);if(v==="博士")return/博士/.test(s);return true}
function fillFilters(){const tracks=[...new Set(JOBS.flatMap(j=>j.tracks||[]))].sort((a,b)=>a.localeCompare(b,"zh"));$("#trackFilter").innerHTML='<option value="">全部方向</option>'+tracks.map(x=>`<option>${esc(x)}</option>`).join("");const regions=[...new Set(JOBS.flatMap(regionOf))];$("#regionFilter").innerHTML='<option value="">全部地区</option>'+REGIONS.filter(x=>regions.includes(x)).concat(regions.filter(x=>!REGIONS.includes(x))).map(x=>`<option>${esc(x)}</option>`).join("");const sectors=[...new Set(TARGETS.map(x=>x.sector))].sort((a,b)=>a.localeCompare(b,"zh"));$("#sectorFilter").innerHTML='<option value="">全部行业</option>'+sectors.map(x=>`<option>${esc(x)}</option>`).join("")}

function filteredJobs(){
 const q=$("#searchInput").value.trim().toLowerCase(),track=$("#trackFilter").value,region=$("#regionFilter").value,degree=$("#degreeFilter").value,stage=$("#stageFilter").value,source=$("#sourceFilter").value,type=$("#typeFilter").value,showExpired=$("#showExpired").checked,sort=$("#sortFilter").value;
 const list=JOBS.filter(j=>{const hay=[j.company,j.unit,j.title,j.location,j.degree,j.majors,j.requirements,j.note,j.source,...(j.tracks||[])].join(" ").toLowerCase(),m=deadlineMeta(j),st=myState(j.id).stage;return(!q||hay.includes(q))&&(!track||(j.tracks||[]).includes(track))&&(!region||regionOf(j).includes(region))&&degreePass(j,degree)&&(!stage||st===stage)&&(!source||(source==="verified"?isVerified(j):!isVerified(j)))&&(!type||j.type===type)&&(!onlyMine||tracked(j.id))&&(showExpired||!m.expired)});
 list.sort((a,b)=>{if(sort==="updated-desc")return String(b.updated||"").localeCompare(String(a.updated||""));if(sort==="company-asc")return String(a.company).localeCompare(String(b.company),"zh");const ad=daysLeft(a.deadline),bd=daysLeft(b.deadline),av=ad===null?99998:(ad<0?99999:ad),bv=bd===null?99998:(bd<0?99999:bd);return deadlineDirection==="asc"?av-bv:bv-av});return list
}
function renderJobs(){
 const list=filteredJobs();$("#jobRows").innerHTML=list.map(j=>{const m=deadlineMeta(j),st=myState(j.id),v=isVerified(j);return`<tr>
 <td><div class="deadline"><b>${esc(fmtDate(j.deadline))}</b>${m.urgent?'<em>即将截止</em>':""}</div></td>
 <td><div class="company-cell"><div class="logo">${esc(initials(j.company))}</div><div><div class="company-name">${esc(j.company)}</div><div class="job-title">${esc(j.title)}</div><div class="sub">${esc(j.unit||"")}</div><div class="tags">${(j.tracks||[]).slice(0,3).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div></div></div></td>
 <td><b>${esc(j.location||"待核验")}</b><div class="sub">更新 ${esc(j.updated||"—")}</div></td>
 <td class="edu"><b>${esc(j.degree||"待核验")}</b><div class="sub">${esc(j.majors||"待核验")}</div></td>
 <td class="req"><div class="clamp">${esc(compact(j.requirements))}</div></td>
 <td class="source-cell"><span class="source-badge ${v?"ok":"web"}">${v?"官方 / 已核验":"全网发现"}</span><a class="btn ${v?"primary":"light"}" target="_blank" rel="noopener" href="${esc(j.applyUrl)}">${v?"投递":"来源"} ↗</a></td>
 <td><div class="status-actions"><button class="status-btn apply ${st.stage==="已申请"?"active":""}" data-status="已申请" data-job="${j.id}" title="已申请">✓</button><button class="status-btn reject ${st.stage==="被拒"?"active":""}" data-status="被拒" data-job="${j.id}" title="被拒">✕</button><button class="status-btn note ${st.note?"active":""}" data-note="${j.id}" title="备注">✎</button></div></td>
 <td><button class="detail-btn" data-detail="${j.id}">详情</button></td></tr>`}).join("");
 $("#resultCount").textContent=list.length;$("#emptyState").classList.toggle("hidden",list.length>0);$("#deadlineArrow").textContent=deadlineDirection==="asc"?"↑":"↓";bindRowActions()
}
function companyRows(){
 const counts={};for(const j of JOBS)counts[j.company]=(counts[j.company]||0)+1;
 const union=[...TARGETS];for(const name of Object.keys(counts)){if(!union.some(x=>x.name===name))union.push({id:"job-"+name,name,sector:"其他",tags:[]})}
 const q=$("#searchInput").value.trim().toLowerCase(),sector=$("#sectorFilter").value,status=$("#companyStatusFilter").value,sort=$("#companySortFilter").value;
 const rows=union.map(c=>({...c,jobs:counts[c.name]||0})).filter(c=>(!q||[c.name,c.sector,...(c.tags||[])].join(" ").toLowerCase().includes(q))&&(!sector||c.sector===sector)&&(!status||(status==="hasJobs"?c.jobs>0:c.jobs===0)));
 rows.sort((a,b)=>sort==="name-asc"?a.name.localeCompare(b.name,"zh"):(b.jobs-a.jobs||a.name.localeCompare(b.name,"zh")));return rows
}
function renderCompanies(){
 const rows=companyRows();
 $("#companyGrid").innerHTML=rows.map(c=>`<article class="company-card" data-company="${esc(c.name)}">
   <div class="company-top"><span class="sector">${esc(c.sector)}</span><span class="${c.jobs?"has-jobs":"pending"}">${c.jobs?c.jobs+" 条岗位":"待扫描"}</span></div>
   <h3>${esc(c.name)}</h3>
   <div class="company-tags">${esc((c.tags||[]).join(" · "))}</div>
   <div class="company-bottom">
     <button class="company-scan" data-scan-company="${esc(c.name)}">${c.jobs?"扫描更新":"扫描企业"}</button>
     <span class="company-open">${c.jobs?"查看岗位 →":"暂无岗位"}</span>
   </div>
 </article>`).join("");
 $("#companyResultCount").textContent=rows.length;
 $("#companyEmpty").classList.toggle("hidden",rows.length>0);
 const metaText=AUTO_META.updated_at
   ? `最近扫描 ${String(AUTO_META.updated_at).replace("T"," ").slice(0,16)} · 自动库 ${AUTO_META.total??AUTO_JOBS.length} 条 · 企业池 ${TARGETS.length} 家`
   : `企业池 ${TARGETS.length} 家 · 等待首次自动扫描`;
 $("#scanMeta").textContent=metaText;
 $("[data-company]").forEach(x=>x.onclick=e=>{
   if(e.target.closest("[data-scan-company]"))return;
   const name=x.dataset.company;setView("jobs");$("#searchInput").value=name;renderAll();window.scrollTo({top:0,behavior:"smooth"});
 });
 $("[data-scan-company]").forEach(x=>x.onclick=e=>{e.stopPropagation();runDirectScan(x.dataset.scanCompany)});
}
function renderStats(){const names=new Set([...TARGETS.map(x=>x.name),...JOBS.map(x=>x.company)]);$("#totalCount").textContent=JOBS.length;$("#companyCount").textContent=names.size;$("#jobsTabCount").textContent=JOBS.length;$("#companiesTabCount").textContent=names.size;if(session){const vals=Object.values(mine).map(x=>normalizeStage(x.stage));$("#appliedCount").textContent=vals.filter(x=>x==="已申请").length;$("#rejectedCount").textContent=vals.filter(x=>x==="被拒").length}else{$("#appliedCount").textContent="—";$("#rejectedCount").textContent="—"}}
function renderAll(){renderStats();if(currentView==="jobs")renderJobs();else renderCompanies()}

function setView(v){currentView=v;const jobs=v==="jobs";$("#jobsView").classList.toggle("hidden",!jobs);$("#companiesView").classList.toggle("hidden",jobs);$("#jobFilters").classList.toggle("hidden",!jobs);$("#companyFilters").classList.toggle("hidden",jobs);$("#advancedFilters").classList.add("hidden");$("#moreFiltersBtn").textContent="筛选";$("#jobsTab").classList.toggle("active",jobs);$("#companiesTab").classList.toggle("active",!jobs);$("#viewTitle").textContent=jobs?"岗位库":"企业库";$("#viewSubtitle").textContent=jobs?"土木本专业、能源、新能源、CAE、汽车机械转行都放进来。默认隐藏已截止岗位。":"先把值得关注的企业全部放进池子，再由自动扫描持续补岗位。";$("#searchInput").placeholder=jobs?"搜索企业、岗位、地区、专业、技能、要求……":"搜索企业、行业、方向……";renderAll()}
function bindRowActions(){$("[data-status]").forEach(x=>x.onclick=async()=>{if(!session){openAuth();return}const id=x.dataset.job,w=x.dataset.status;await saveState(id,{stage:myState(id).stage===w?"未申请":w})});$("[data-note]").forEach(x=>x.onclick=()=>{if(!session){openAuth();return}openNote(x.dataset.note)});$("[data-detail]").forEach(x=>x.onclick=()=>openDetail(x.dataset.detail))}
function openNote(id){noteJobId=id;const j=JOBS.find(x=>x.id===id);$("#noteTitle").textContent=(j?.company||"岗位")+" · 备注";$("#noteText").value=myState(id).note||"";$("#noteDialog").showModal()}
function openDetail(id){currentDetailId=id;const j=JOBS.find(x=>x.id===id);if(!j)return;const d=daysLeft(j.deadline);$("#detailTitle").textContent=j.title;$("#detailCompany").textContent=(j.company||"")+" · "+(j.unit||"");$("#detailContent").innerHTML=[["地点",j.location||"待核验"],["学历",j.degree||"待核验"],["专业",j.majors||"待核验"],["人数",j.headcount||"未公开"],["开始",j.openDate||"未公开"],["截止",j.deadline?(j.deadline+(d!==null&&d>=0&&d<=7?" · 即将截止":"")):"未公布"],["方向",(j.tracks||[]).join(" / ")],["来源",j.source||""],["要求",j.requirements||""],["流程",j.process||""],["备注",j.note||"—"]].map((x,i)=>`<div class="detail-item ${i>=8?"full":""}"><label>${esc(x[0])}</label><div>${esc(x[1])}</div></div>`).join("");$("#detailApply").href=j.applyUrl;$("#detailSource").href=j.sourceUrl||j.applyUrl;$("#detailNoteBtn").classList.toggle("hidden",!session);$("#detailDialog").showModal()}

/* ---------- one-click direct browser scan ---------- */
let scanRunning=false;
let DIRECT_JOBS=[];
try{DIRECT_JOBS=JSON.parse(localStorage.getItem("jt_direct_scan_jobs_v1")||"[]")}catch(e){DIRECT_JOBS=[]}
for(const j of DIRECT_JOBS){
  const k=((j.applyUrl||"")+"|"+(j.title||"")+"|"+(j.company||"")).toLowerCase();
  if(!JOBS.some(x=>((x.applyUrl||"")+"|"+(x.title||"")+"|"+(x.company||"")).toLowerCase()===k))JOBS.push(j);
}

function scanToast(title,text,done,error){
  const box=$("#scanToast");
  if(!box)return;
  $("#scanToastTitle").textContent=title;
  $("#scanToastText").textContent=text;
  box.classList.remove("hidden","done","error");
  if(done)box.classList.add("done");
  if(error)box.classList.add("error");
  if(done||error)setTimeout(()=>box.classList.add("hidden"),5000);
}
function mwmblText(v){
  if(Array.isArray(v))return v.map(x=>typeof x==="string"?x:(x&&x.value)||"").join("");
  if(v&&typeof v==="object")return v.value||"";
  return String(v||"");
}
async function mwmblSearch(q){
  const r=await fetch("https://api.mwmbl.org/api/v1/search/?s="+encodeURIComponent(q),{cache:"no-store"});
  if(!r.ok)throw new Error("search "+r.status);
  const data=await r.json();
  const rows=Array.isArray(data)?data:(data.results||[]);
  return rows.map(x=>({title:mwmblText(x.title),url:x.url||"",snippet:mwmblText(x.extract)})).filter(x=>x.title&&x.url);
}
async function jinaSearch(q){
  const target="https://www.bing.com/search?q="+encodeURIComponent(q);
  const r=await fetch("https://r.jina.ai/"+target,{headers:{"Accept":"text/plain"},cache:"no-store"});
  if(!r.ok)throw new Error("reader "+r.status);
  const text=await r.text(), out=[], seen=new Set();
  const re=/\[([^\]\n]{3,180})\]\((https?:\/\/[^)\s]+)\)/g;
  let m;
  while((m=re.exec(text))&&out.length<12){
    let u=m[2];
    try{u=decodeURIComponent(u)}catch(e){}
    let host="";
    try{host=new URL(u).hostname}catch(e){continue}
    if(/bing\.com|microsoft\.com|jina\.ai/.test(host)||seen.has(u))continue;
    seen.add(u);
    out.push({title:m[1].replace(/\s+/g," ").trim(),url:u,snippet:""});
  }
  return out;
}
function companyCore(n){
  return String(n||"").replace(/中国|国家|股份有限公司|集团有限公司|有限责任公司|有限公司|集团|股份|研究总院|设计研究总院|设计研究院|勘察设计院|建筑设计院|设计院|研究所|研究院|科技|智能|控股/g,"").trim();
}
function companyMatches(n,text){
  const a=String(n||"").replace(/\s/g,"").toLowerCase();
  const b=String(text||"").replace(/\s/g,"").toLowerCase();
  if(a&&b.includes(a))return true;
  const c=companyCore(n).replace(/\s/g,"").toLowerCase();
  return c.length>=3&&b.includes(c);
}
function recruitingText(t){return /2027|校招|校园招聘|秋招|应届|毕业生|招聘|career|campus/i.test(t||"")}
function scanTracks(t){
  const out=[];
  if(/土木|结构|岩土|桥梁|隧道|市政|水利/.test(t))out.push("土木直投");
  if(/设计院|勘察设计|规划设计/.test(t))out.push("设计院");
  if(/工程管理|项目管理|造价/.test(t))out.push("工程管理");
  if(/CAE|仿真|有限元|Abaqus|ANSYS|LS-DYNA|NVH|CFD|疲劳/i.test(t))out.push("CAE/仿真");
  if(/风电|风机|新能源|储能|光伏|氢能/.test(t))out.push("风电/新能源");
  if(/汽车|车辆|机械|底盘|制造/.test(t))out.push("转汽车/机械");
  out.push("即时扫描");
  return [...new Set(out)].slice(0,4);
}
function scanDeadline(t){
  let m=String(t||"").match(/截止(?:至|到|时间[:：]?)?\s*(20\d{2})[年\/.-](\d{1,2})[月\/.-](\d{1,2})日?/);
  if(!m)m=String(t||"").match(/(20\d{2})[年\/.-](\d{1,2})[月\/.-](\d{1,2})日?\s*(?:截止|前)/);
  if(!m)return null;
  return m[1]+"-"+String(+m[2]).padStart(2,"0")+"-"+String(+m[3]).padStart(2,"0");
}
function directId(u,t){
  let h=2166136261,s=u+"|"+t;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return "direct-"+(h>>>0).toString(16);
}
function toDirectJob(company,r){
  const blob=(r.title||"")+" "+(r.snippet||"");
  return {
    id:directId(r.url,r.title),company,unit:"即时全网扫描",title:r.title,
    tracks:scanTracks(blob),type:"自动发现",location:"待核验",
    degree:/硕士|研究生/.test(blob)?"硕士 / 研究生":(/本科/.test(blob)?"本科":"待核验"),
    majors:"待核验",headcount:"待核验",openDate:new Date().toISOString().slice(0,10),
    deadline:scanDeadline(blob),updated:new Date().toISOString().slice(0,10),
    requirements:r.snippet||"即时扫描发现招聘相关页面，请打开来源核验岗位详情。",
    process:"以原始招聘页面为准",applyUrl:r.url,sourceUrl:r.url,
    source:"即时全网扫描",note:"浏览器即时搜索结果；投递前请核验专业、学历、地点和截止时间。",
    direct:true,verified:false
  };
}
function mergeDirect(rows){
  const by=new Map(DIRECT_JOBS.map(j=>[j.id,j]));
  for(const j of rows)by.set(j.id,j);
  DIRECT_JOBS=[...by.values()].slice(-800);
  localStorage.setItem("jt_direct_scan_jobs_v1",JSON.stringify(DIRECT_JOBS));
  localStorage.setItem("jt_direct_scan_at_v1",new Date().toISOString());
  for(const j of rows){
    const k=((j.applyUrl||"")+"|"+(j.title||"")+"|"+(j.company||"")).toLowerCase();
    if(!JOBS.some(x=>((x.applyUrl||"")+"|"+(x.title||"")+"|"+(x.company||"")).toLowerCase()===k))JOBS.push(j);
  }
  fillFilters();
  renderAll();
}
async function scanOneCompany(company,useFallback){
  const q='"'+company+'" 2027 校园招聘 秋招';
  let rows=[];
  try{rows=await mwmblSearch(q)}catch(e){}
  rows=rows.filter(r=>companyMatches(company,(r.title||"")+" "+(r.snippet||"")+" "+(r.url||""))&&recruitingText((r.title||"")+" "+(r.snippet||"")));
  if(!rows.length&&useFallback){
    try{rows=(await jinaSearch(q)).filter(r=>companyMatches(company,(r.title||"")+" "+(r.url||""))&&recruitingText(r.title||""))}catch(e){}
  }
  return rows.slice(0,6).map(r=>toDirectJob(company,r));
}
async function scanPool(items,limit,onProgress){
  let next=0,done=0;
  const out=[];
  async function worker(){
    while(true){
      const i=next++;
      if(i>=items.length)return;
      try{out.push(...await scanOneCompany(items[i],false))}catch(e){}
      done++;
      if(onProgress)onProgress(done,items.length,out.length);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return out;
}
async function runDirectScan(company){
  if(scanRunning)return;
  scanRunning=true;
  const btn=$("#scanBtn"),old=btn.textContent;
  btn.disabled=true;
  btn.textContent=company?"↻ 扫描 "+company:"↻ 扫描中 0%";
  scanToast("正在全网扫描",company?"正在搜索 "+company+"…":"正在扫描 "+TARGETS.length+" 家企业…",false,false);
  try{
    let found=[];
    if(company){
      found=await scanOneCompany(company,true);
      mergeDirect(found);
    }else{
      const names=TARGETS.map(x=>x.name);
      found=await scanPool(names,10,(done,total,count)=>{
        const pct=Math.round(done/total*100);
        btn.textContent="↻ 扫描中 "+pct+"%";
        scanToast("正在全网扫描",done+"/"+total+" 家企业 · 已发现 "+count+" 条候选",false,false);
      });
      mergeDirect(found);
      const broad=["2027 校园招聘 土木 结构 设计院","2027 校招 CAE 仿真 NVH 有限元","2027 校招 风电 新能源 结构","2027 校招 汽车 结构 仿真","2027 校招 工程管理 智能建造"];
      const extra=[];
      for(let i=0;i<broad.length;i++){
        try{
          const rr=await jinaSearch(broad[i]);
          for(const r of rr){
            const blob=(r.title||"")+" "+(r.url||"");
            const hit=TARGETS.find(t=>companyMatches(t.name,blob));
            if(hit&&recruitingText(r.title||""))extra.push(toDirectJob(hit.name,r));
          }
        }catch(e){}
        scanToast("正在补充扫描","全网补充 "+(i+1)+"/"+broad.length,false,false);
      }
      if(extra.length){mergeDirect(extra);found.push(...extra)}
    }
    const unique=new Set(found.map(x=>x.id)).size;
    scanToast("扫描完成",company?company+"：发现 "+unique+" 条招聘相关结果":"已扫描 "+TARGETS.length+" 家企业，发现 "+unique+" 条招聘相关结果",true,false);
    if(currentView==="companies")renderCompanies();
  }catch(e){
    scanToast("扫描失败",(e&&e.message)||"网络搜索暂时不可用，请稍后再点一次。",false,true);
  }finally{
    scanRunning=false;
    btn.disabled=false;
    btn.textContent=old;
  }
}

function updateUserUI(){const on=!!session;$("#loginBtn").classList.toggle("hidden",on);$("#userBox").classList.toggle("hidden",!on);if(on){$("#userName").textContent=session.user.email;$("#syncStatus").textContent=cloudConfigured?"云端账户":"本机账户"}else $("#syncStatus").textContent="未登录 · 浏览模式"}
function setAuthMode(m){authMode=m;$("#tabLogin").classList.toggle("active",m==="login");$("#tabSignup").classList.toggle("active",m==="signup");$("#authSubmit").textContent=m==="login"?"登录":"注册";$("#authMessage").textContent=""}
function openAuth(){setAuthMode("login");$("#authModeHint").textContent=cloudConfigured?"云端账号，可跨设备同步":"当前为本机账户，仅当前浏览器保存";$("#authFine").textContent=cloudConfigured?"每个用户只能读取自己的记录。":"请不要使用其他重要网站的相同密码。";$("#authDialog").showModal()}
async function submitAuth(){const email=$("#authEmail").value.trim(),pw=$("#authPassword").value,msg=$("#authMessage");if(!email.includes("@")||pw.length<6){msg.textContent="请输入有效邮箱，密码至少6位。";return}try{if(cloudConfigured){const r=authMode==="signup"?await sb.auth.signUp({email,password:pw,options:{emailRedirectTo:location.origin+location.pathname}}):await sb.auth.signInWithPassword({email,password:pw});if(r.error)throw r.error;if(authMode==="signup"&&!r.data.session){msg.textContent="注册成功，请检查邮箱完成验证。";return}session=r.data.session;await loadMine()}else{if(authMode==="signup")await localSignup(email,pw);else await localLogin(email,pw);loadLocalMine()}$("#authDialog").close();updateUserUI();renderAll()}catch(e){msg.textContent=e.message||String(e)}}
function resetFilters(){["searchInput","trackFilter","regionFilter","degreeFilter","stageFilter","sourceFilter","typeFilter","sectorFilter","companyStatusFilter"].forEach(id=>{const e=$("#"+id);if(e)e.value=""});$("#sortFilter").value="deadline-asc";$("#companySortFilter").value="jobs-desc";$("#showExpired").checked=false;onlyMine=false;deadlineDirection="asc";renderAll()}
function bindStatic(){$("#scanBtn").onclick=()=>runDirectScan();$("#jobsTab").onclick=()=>setView("jobs");$("#companiesTab").onclick=()=>setView("companies");$("#themeBtn").onclick=()=>{const n=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=n;localStorage.setItem("jt-theme",n)};$("#loginBtn").onclick=openAuth;$("#logoutBtn").onclick=async()=>{if(cloudConfigured)await sb.auth.signOut();else{localLogout();updateUserUI();renderAll()}};$("#tabLogin").onclick=()=>setAuthMode("login");$("#tabSignup").onclick=()=>setAuthMode("signup");$("#authSubmit").onclick=submitAuth;$("#authPassword").addEventListener("keydown",e=>{if(e.key==="Enter")submitAuth()});["searchInput","trackFilter","regionFilter","degreeFilter","stageFilter","sortFilter","sourceFilter","typeFilter","showExpired","sectorFilter","companyStatusFilter","companySortFilter"].forEach(id=>{const e=$("#"+id);e.addEventListener(e.tagName==="INPUT"&&e.type==="text"?"input":"change",renderAll)});$("#moreFiltersBtn").onclick=()=>{$("#advancedFilters").classList.toggle("hidden");$("#moreFiltersBtn").textContent=$("#advancedFilters").classList.contains("hidden")?"筛选":"收起"};$("#onlyMineBtn").onclick=()=>{onlyMine=!onlyMine;$("#onlyMineBtn").textContent=onlyMine?"✓ 只看已标记":"只看已标记";renderAll()};$("#resetBtn").onclick=resetFilters;$("#deadlineSortBtn").onclick=()=>{deadlineDirection=deadlineDirection==="asc"?"desc":"asc";$("#sortFilter").value="deadline-asc";renderJobs()};$("[data-close]").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());$("#saveNoteBtn").onclick=async()=>{if(noteJobId){const ok=await saveState(noteJobId,{note:$("#noteText").value.trim()});if(ok)$("#noteDialog").close()}};$("#deleteStateBtn").onclick=async()=>{if(noteJobId&&confirm("确定删除这个岗位的个人记录吗？"))await deleteState(noteJobId)};$("#detailNoteBtn").onclick=()=>{if(currentDetailId){$("#detailDialog").close();openNote(currentDetailId)}}}
async function init(){document.documentElement.dataset.theme=localStorage.getItem("jt-theme")||"light";fillFilters();bindStatic();await initSession();setView("jobs")}
init();