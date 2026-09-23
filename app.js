const MANUAL_JOBS = window.JOB_DATA || [];
const AUTO_JOBS = window.AUTO_JOB_DATA || [];
const JOBS = (() => {
  const out=[], seen=new Set();
  for(const j of [...MANUAL_JOBS,...AUTO_JOBS]){
    const key=((j.applyUrl||"")+"|"+(j.title||"")+"|"+(j.company||"")).toLowerCase();
    if(seen.has(key)) continue;
    seen.add(key); out.push(j);
  }
  return out;
})();

const STAGES = ["未申请","已申请","被拒"];
function normalizeStage(stage){
  if(!stage || stage==="未申请") return "未申请";
  if(["已拒绝","已放弃","被拒"].includes(stage)) return "被拒";
  return "已申请";
}

const CFG = window.SUPABASE_CONFIG || {};
const cloudConfigured = !!(CFG.url && CFG.anonKey && !CFG.url.startsWith("YOUR_") && !CFG.anonKey.startsWith("YOUR_"));
const sb = cloudConfigured ? window.supabase.createClient(CFG.url, CFG.anonKey) : null;

let session=null, mine={}, authMode="login", onlyMine=false, noteJobId=null, currentDetailId=null;
let deadlineDirection="asc";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

function daysLeft(s){
  if(!s) return null;
  const d=new Date(s+"T00:00:00");
  const now=new Date();
  const a=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const b=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  return Math.ceil((b-a)/86400000);
}
function fmtDate(s){
  if(!s) return "待定";
  const d=new Date(s+"T00:00:00");
  return `${d.getMonth()+1}月${d.getDate()}日`;
}
function deadlineMeta(j){
  const d=daysLeft(j.deadline);
  if(d===null) return {label:"",cls:"",expired:false};
  if(d<0) return {label:"已截止",cls:"expired",expired:true};
  if(d<=7) return {label:"即将截止",cls:"urgent",expired:false};
  return {label:"",cls:"",expired:false};
}
function isVerified(j){
  if(j.verified===true) return true;
  if(j.auto===true && j.verified!==true) return false;
  return /官方|集团官网|官方招聘|官方校园招聘|官方公告/.test(j.source||"");
}
function sourceLabel(j){ return isVerified(j) ? "官方 / 已核验" : "全网发现待核验"; }
function myState(id){
  const raw=mine[id] || {stage:"未申请",note:""};
  return {...raw,stage:normalizeStage(raw.stage)};
}
function tracked(id){ const x=myState(id); return x.stage!=="未申请" || !!x.note; }
function initials(name){ return String(name||"企").replace(/中国|集团|股份有限公司|有限公司|科技|能源/g,"").slice(0,2)||"企"; }

function localUsers(){ return JSON.parse(localStorage.getItem("jt_local_users_v1") || "{}"); }
function localSessionEmail(){ return localStorage.getItem("jt_local_session_v1") || ""; }
function localDataKey(email){ return "jt_apps_v2:"+email.toLowerCase(); }
function bytesHex(a){ return [...a].map(x=>x.toString(16).padStart(2,"0")).join(""); }
async function sha256(text){ const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)); return bytesHex(new Uint8Array(b)); }
async function localSignup(email,password){
  const e=email.trim().toLowerCase(), users=localUsers();
  if(users[e]) throw new Error("这个邮箱已在本浏览器注册，请直接登录。");
  const salt=bytesHex(crypto.getRandomValues(new Uint8Array(16)));
  users[e]={salt,hash:await sha256(salt+"|"+password),createdAt:new Date().toISOString()};
  localStorage.setItem("jt_local_users_v1",JSON.stringify(users));
  localStorage.setItem("jt_local_session_v1",e);
  session={user:{id:"local:"+await sha256(e),email:e}};
}
async function localLogin(email,password){
  const e=email.trim().toLowerCase(), users=localUsers(), u=users[e];
  if(!u) throw new Error("本浏览器没有这个账号，请先注册。");
  if(await sha256(u.salt+"|"+password)!==u.hash) throw new Error("密码不正确。");
  localStorage.setItem("jt_local_session_v1",e);
  session={user:{id:"local:"+await sha256(e),email:e}};
}
function localLogout(){ localStorage.removeItem("jt_local_session_v1"); session=null; mine={}; }
function loadLocalMine(){ mine=session ? JSON.parse(localStorage.getItem(localDataKey(session.user.email))||"{}") : {}; }
function saveLocalMine(){ if(session) localStorage.setItem(localDataKey(session.user.email),JSON.stringify(mine)); }

async function initSession(){
  if(cloudConfigured){
    const {data}=await sb.auth.getSession(); session=data.session; await loadMine();
    sb.auth.onAuthStateChange(async (_e,s)=>{session=s;await loadMine();updateUserUI();render();});
  }else{
    const email=localSessionEmail();
    if(email){ session={user:{id:"local:"+await sha256(email),email}}; loadLocalMine(); }
  }
  updateUserUI();
}
async function loadMine(){
  mine={}; if(!session) return;
  if(!cloudConfigured){ loadLocalMine(); return; }
  setSync("同步中…");
  const {data,error}=await sb.from("user_applications").select("job_id,stage,note,updated_at");
  if(error){setSync("同步失败",true);return;}
  (data||[]).forEach(r=>mine[r.job_id]=r);
  setSync("云端已同步");
}
async function saveState(jobId,patch){
  if(!session){openAuth();return false;}
  const cur=myState(jobId);
  const row={job_id:jobId,stage:patch.stage??cur.stage??"未申请",note:patch.note??cur.note??""};
  if(!cloudConfigured){
    mine[jobId]={...row,updated_at:new Date().toISOString()};saveLocalMine();setSync("本机已保存");render();return true;
  }
  const payload={...row,user_id:session.user.id};
  const {data,error}=await sb.from("user_applications").upsert(payload,{onConflict:"user_id,job_id"}).select().single();
  if(error){setSync("保存失败",true);return false;}
  mine[jobId]=data;setSync("云端已保存");render();return true;
}
async function deleteState(jobId){
  if(!session)return;
  if(!cloudConfigured){delete mine[jobId];saveLocalMine();$("#noteDialog").close();render();return;}
  const {error}=await sb.from("user_applications").delete().eq("user_id",session.user.id).eq("job_id",jobId);
  if(!error){delete mine[jobId];$("#noteDialog").close();render();}
}

function setSync(msg,bad=false){ const e=$("#syncStatus");e.textContent=msg;e.classList.toggle("bad",bad); }
function updateUserUI(){
  const on=!!session;
  $("#loginBtn").classList.toggle("hidden",on); $("#userBox").classList.toggle("hidden",!on);
  if(on){
    $("#userName").textContent=session.user.email||"已登录";
    $("#accountMode").textContent=cloudConfigured?"云端同步":"本机账户";
    setSync(cloudConfigured?"云端账号":"本机账户");
  }else setSync("未登录 · 仅浏览");
}

const REGIONS=["北京","上海","天津","重庆","广东","江苏","浙江","湖北","湖南","四川","陕西","山东","安徽","福建","河南","河北","江西","辽宁","吉林","黑龙江","广西","云南","贵州","海南","山西","内蒙古","甘肃","青海","宁夏","新疆","西藏","香港","澳门","海外","全国"];
function regionOf(j){
  const s=j.location||"";
  const hits=REGIONS.filter(r=>s.includes(r));
  if(hits.length) return hits;
  if(/全国|多地|各地|按岗位/.test(s)) return ["全国"];
  return s&&s!=="待核验"?[s]:["待核验"];
}
function degreePass(j,val){
  if(!val)return true;
  const s=j.degree||"";
  if(val==="待核验") return !s || /待核验|按岗位|未公开/.test(s);
  if(val==="本科") return /本科|大学本科|本科及以上|本科\/硕士|本科、硕士/.test(s);
  if(val==="硕士") return /硕士|研究生|硕士及以上|本科\/硕士|本科、硕士/.test(s);
  if(val==="博士") return /博士/.test(s);
  return true;
}
function fillDynamicFilters(){
  const tracks=[...new Set(JOBS.flatMap(j=>j.tracks||[]))].sort((a,b)=>a.localeCompare(b,"zh"));
  $("#trackFilter").innerHTML='<option value="">全部方向</option>'+tracks.map(x=>`<option>${esc(x)}</option>`).join("");
  const regions=[...new Set(JOBS.flatMap(regionOf))];
  const ordered=REGIONS.filter(r=>regions.includes(r)).concat(regions.filter(r=>!REGIONS.includes(r)).sort((a,b)=>a.localeCompare(b,"zh")));
  $("#regionFilter").innerHTML='<option value="">全部地区</option>'+ordered.map(x=>`<option>${esc(x)}</option>`).join("");
}
function filterCount(){
  const ids=["trackFilter","regionFilter","degreeFilter","stageFilter","typeFilter","sourceFilter"];
  let n=ids.filter(id=>$("#"+id).value).length;
  if($("#showExpired").checked)n++;
  if(onlyMine)n++;
  if($("#searchInput").value.trim())n++;
  return n;
}
function currentJobs(){
  const q=$("#searchInput").value.trim().toLowerCase();
  const track=$("#trackFilter").value,region=$("#regionFilter").value,degree=$("#degreeFilter").value,stage=$("#stageFilter").value;
  const type=$("#typeFilter").value,source=$("#sourceFilter").value,showExpired=$("#showExpired").checked;
  const sort=$("#sortFilter").value;

  const list=JOBS.filter(j=>{
    const hay=[j.company,j.unit,j.title,j.location,j.degree,j.majors,j.requirements,j.process,j.note,j.source,...(j.tracks||[])].join(" ").toLowerCase();
    const st=myState(j.id).stage;
    const meta=deadlineMeta(j);
    return (!q||hay.includes(q))
      && (!track||(j.tracks||[]).includes(track))
      && (!region||regionOf(j).includes(region))
      && degreePass(j,degree)
      && (!stage||st===stage)
      && (!type||j.type===type)
      && (!source||(source==="verified"?isVerified(j):!isVerified(j)))
      && (!onlyMine||tracked(j.id))
      && (showExpired||!meta.expired);
  });

  list.sort((a,b)=>{
    if(sort==="updated-desc") return String(b.updated||"").localeCompare(String(a.updated||""));
    if(sort==="company-asc") return String(a.company||"").localeCompare(String(b.company||""),"zh");
    const ad=daysLeft(a.deadline),bd=daysLeft(b.deadline);
    const av=ad===null?99998:(ad<0?99999:ad),bv=bd===null?99998:(bd<0?99999:bd);
    return deadlineDirection==="asc" ? av-bv : bv-av;
  });
  return list;
}

function compactReq(text,max=150){
  const s=String(text||"");
  return s.length>max?s.slice(0,max)+"…":s;
}
function render(){
  const list=currentJobs();
  $("#jobRows").innerHTML=list.map(j=>{
    const m=deadlineMeta(j),st=myState(j.id),disabled=session?"":"disabled",verified=isVerified(j);
    return `<tr class="${m.expired?"expired-row":""}">
      <td class="deadline-cell">
        <div class="deadline-box"><b>${esc(fmtDate(j.deadline))}</b>${m.label?`<span class="${m.cls}">${esc(m.label)}</span>`:""}<small>${esc(j.type||"")}</small></div>
      </td>
      <td>
        <div class="company-cell">
          <div class="logo">${esc(initials(j.company))}</div>
          <div>
            <div class="company-name">${esc(j.company)}</div>
            <div class="job-title">${esc(j.title)}</div>
            <div class="sub">${esc(j.unit||"")}</div>
            <div class="track-list">${(j.tracks||[]).slice(0,3).map(t=>`<span class="track">${esc(t)}</span>`).join("")}</div>
          </div>
        </div>
      </td>
      <td><b>${esc(j.location||"待核验")}</b><div class="sub">更新 ${esc(j.updated||"—")}</div></td>
      <td class="edu"><b>${esc(j.degree||"待核验")}</b><div class="sub line-clamp-2">${esc(j.majors||"待核验")}</div></td>
      <td class="req"><div class="line-clamp-3">${esc(compactReq(j.requirements||""))}</div></td>
      <td class="source-cell">
        <span class="source-badge ${verified?"verified":"unverified"}">${verified?"官方 / 已核验":"全网发现"}</span>
        <a class="btn ${verified?"primary":"secondary"}" target="_blank" rel="noopener" href="${esc(j.applyUrl)}">${verified?"去投递":"查看来源"} ↗</a>
      </td>
      <td>
        <div class="status-actions">
          <button class="status-btn apply-btn ${st.stage==="已申请"?"active":""}" data-status="已申请" data-job="${j.id}" ${disabled} title="已申请">✓</button>
          <button class="status-btn reject-btn ${st.stage==="被拒"?"active":""}" data-status="被拒" data-job="${j.id}" ${disabled} title="被拒">✕</button>
          <button class="status-btn note-icon ${st.note?"active":""}" data-note="${j.id}" ${disabled} title="私人备注">✎</button>
        </div>
      </td>
      <td><button class="detail-btn" data-detail="${j.id}">详情</button></td>
    </tr>`;
  }).join("");

  $("#emptyState").classList.toggle("hidden",list.length>0);
  $("#resultCount").textContent=list.length;
  $("#totalCount").textContent=JOBS.length;
  $("#companyCount").textContent=new Set(JOBS.map(x=>x.company)).size;
  if(session){
    const vals=Object.values(mine).map(x=>normalizeStage(x.stage));
    $("#appliedCount").textContent=vals.filter(x=>x==="已申请").length;
    $("#rejectedCount").textContent=vals.filter(x=>x==="被拒").length;
  }else{$("#appliedCount").textContent="—";$("#rejectedCount").textContent="—";}

  const n=filterCount();
  $("#filterHint").textContent=n?`· 已启用 ${n} 个筛选`:"· 默认隐藏已截止";
  $("#deadlineArrow").textContent=deadlineDirection==="asc"?"↑":"↓";
  bindRows();
}
function bindRows(){
  $$("[data-status]").forEach(el=>el.onclick=async e=>{
    if(!session){openAuth();return;}
    const btn=e.currentTarget,id=btn.dataset.job,wanted=btn.dataset.status,current=myState(id).stage;
    await saveState(id,{stage:current===wanted?"未申请":wanted});
  });
  $$("[data-note]").forEach(el=>el.onclick=e=>{
    if(!session){openAuth();return;}
    openNote(e.currentTarget.dataset.note);
  });
  $$("[data-detail]").forEach(el=>el.onclick=e=>openDetail(e.currentTarget.dataset.detail));
}
function openNote(id){
  noteJobId=id;
  const j=JOBS.find(x=>x.id===id);
  $("#noteTitle").textContent=(j?.company||"岗位")+" · 私人备注";
  $("#noteText").value=myState(id).note||"";
  $("#noteDialog").showModal();
}
function openDetail(id){
  currentDetailId=id;
  const j=JOBS.find(x=>x.id===id);if(!j)return;
  $("#detailTitle").textContent=j.title;
  $("#detailCompany").textContent=(j.company||"")+" · "+(j.unit||"");
  const m=deadlineMeta(j);
  $("#detailContent").innerHTML=[
    ["工作地点",j.location||"待核验"],["学历要求",j.degree||"待核验"],["专业要求",j.majors||"待核验"],["招聘人数",j.headcount||"未公开"],
    ["开始时间",j.openDate||"未公开"],["截止时间",j.deadline?(j.deadline+(m.label?" · "+m.label:"")):"未公布 / 滚动"],
    ["方向",(j.tracks||[]).join(" / ")],["信息来源",sourceLabel(j)+" · "+(j.source||"")],
    ["要求摘要",j.requirements||"待核验"],["招聘流程",j.process||"以原始页面为准"],["备注",j.note||"—"]
  ].map((x,i)=>`<div class="detail-item ${i>=8?"full":""}"><label>${esc(x[0])}</label><div>${esc(x[1])}</div></div>`).join("");
  $("#detailApply").href=j.applyUrl;
  $("#detailSource").href=j.sourceUrl||j.applyUrl;
  $("#detailApply").textContent=isVerified(j)?"去投递 ↗":"查看原始页面 ↗";
  $("#detailNoteBtn").classList.toggle("hidden",!session);
  $("#detailDialog").showModal();
}

function setAuthMode(mode){
  authMode=mode;$("#tabLogin").classList.toggle("active",mode==="login");$("#tabSignup").classList.toggle("active",mode==="signup");
  $("#authSubmit").textContent=mode==="login"?"登录":"注册";$("#authMessage").textContent="";
}
function openAuth(){
  setAuthMode("login");
  $("#authModeHint").textContent=cloudConfigured?"云端账号，可跨设备同步":"当前为本机账户，仅当前浏览器保存";
  $("#authFine").textContent=cloudConfigured?"每个用户只能读取自己的投递记录。":"请勿使用其他重要网站的相同密码；接入云端后可升级为跨设备同步。";
  $("#authDialog").showModal();
}
async function submitAuth(){
  const email=$("#authEmail").value.trim(),password=$("#authPassword").value,msg=$("#authMessage");msg.style.color="var(--red)";
  if(!email.includes("@")||password.length<6){msg.textContent="请输入有效邮箱，密码至少6位。";return;}
  msg.textContent="处理中…";
  try{
    if(cloudConfigured){
      const r=authMode==="signup"?await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}):await sb.auth.signInWithPassword({email,password});
      if(r.error)throw r.error;
      if(authMode==="signup"&&!r.data.session){msg.style.color="var(--green)";msg.textContent="注册成功，请检查邮箱完成验证。";return;}
      session=r.data.session;await loadMine();
    }else{
      if(authMode==="signup")await localSignup(email,password);else await localLogin(email,password);
      loadLocalMine();
    }
    $("#authDialog").close();updateUserUI();render();
  }catch(err){msg.textContent=err.message||String(err);}
}

function resetFilters(){
  ["searchInput","trackFilter","regionFilter","degreeFilter","stageFilter","typeFilter","sourceFilter"].forEach(id=>$("#"+id).value="");
  $("#sortFilter").value="deadline-asc";$("#showExpired").checked=false;onlyMine=false;deadlineDirection="asc";
  $("#onlyMineBtn").textContent="只看已标记";render();
}
function bindStatic(){
  $("#themeBtn").onclick=()=>{const n=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=n;localStorage.setItem("jt-theme",n);};
  $("#loginBtn").onclick=openAuth;
  $("#logoutBtn").onclick=async()=>{if(cloudConfigured)await sb.auth.signOut();else{localLogout();updateUserUI();render();}};
  $("#tabLogin").onclick=()=>setAuthMode("login");$("#tabSignup").onclick=()=>setAuthMode("signup");$("#authSubmit").onclick=submitAuth;
  $("#authPassword").addEventListener("keydown",e=>{if(e.key==="Enter")submitAuth();});

  ["searchInput","trackFilter","regionFilter","degreeFilter","stageFilter","typeFilter","sourceFilter","showExpired"].forEach(id=>{
    const el=$("#"+id);el.addEventListener(el.tagName==="INPUT"&&el.type==="text"?"input":"change",render);
  });
  $("#sortFilter").onchange=()=>{deadlineDirection=$("#sortFilter").value==="deadline-desc"?"desc":"asc";render();};
  $("#deadlineSortBtn").onclick=()=>{deadlineDirection=deadlineDirection==="asc"?"desc":"asc";$("#sortFilter").value="deadline-asc";render();};
  $("#moreFiltersBtn").onclick=()=>{const box=$("#advancedFilters");box.classList.toggle("hidden");$("#moreFiltersBtn").textContent=box.classList.contains("hidden")?"更多筛选":"收起筛选";};
  $("#onlyMineBtn").onclick=()=>{onlyMine=!onlyMine;$("#onlyMineBtn").textContent=onlyMine?"✓ 只看已标记":"只看已标记";render();};
  $("#resetBtn").onclick=resetFilters;

  $$("[data-close]").forEach(btn=>btn.onclick=()=>document.getElementById(btn.dataset.close).close());
  $("#saveNoteBtn").onclick=async()=>{if(noteJobId){const ok=await saveState(noteJobId,{note:$("#noteText").value.trim()});if(ok)$("#noteDialog").close();}};
  $("#deleteStateBtn").onclick=async()=>{if(noteJobId&&confirm("确定删除这个岗位的个人记录吗？"))await deleteState(noteJobId);};
  $("#detailNoteBtn").onclick=()=>{if(currentDetailId){$("#detailDialog").close();openNote(currentDetailId);}};
}

async function init(){
  document.documentElement.dataset.theme=localStorage.getItem("jt-theme")||"light";
  fillDynamicFilters();bindStatic();await initSession();render();
}
init();