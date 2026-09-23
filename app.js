const MANUAL_JOBS = window.JOB_DATA || [];
const AUTO_JOBS = window.AUTO_JOB_DATA || [];
const JOBS = (() => {
  const out=[], seen=new Set();
  for(const j of [...MANUAL_JOBS,...AUTO_JOBS]){
    const key=(j.applyUrl||"")+"|"+(j.title||"")+"|"+(j.company||"");
    if(seen.has(key)) continue;
    seen.add(key); out.push(j);
  }
  return out;
})();
const STAGES = ["未申请","已申请","被拒"];
function normalizeStage(stage){
  if(!stage || stage==="未申请") return "未申请";
  if(stage==="已拒绝" || stage==="已放弃" || stage==="被拒") return "被拒";
  return "已申请";
}
const CFG = window.SUPABASE_CONFIG || {};
const cloudConfigured = !!(CFG.url && CFG.anonKey && !CFG.url.startsWith("YOUR_") && !CFG.anonKey.startsWith("YOUR_"));
const sb = cloudConfigured ? window.supabase.createClient(CFG.url, CFG.anonKey) : null;

let session = null;
let mine = {};
let authMode = "login";
let onlyMine = false;
let deadlineFilter = "";
let noteJobId = null;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

function dateOnly(s){ return s ? new Date(s+"T23:59:59") : null; }
function daysLeft(s){
  if(!s) return null;
  const end=dateOnly(s);
  const now=new Date();
  const a=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const b=new Date(end.getFullYear(),end.getMonth(),end.getDate());
  return Math.ceil((b-a)/86400000);
}
function fmtDate(s){
  if(!s) return "滚动 / 待定";
  const d=new Date(s+"T00:00:00");
  return `${d.getMonth()+1}月${d.getDate()}日`;
}
function deadlineMeta(job){
  const d=daysLeft(job.deadline);
  if(d===null) return {cls:"rolling",label:"",days:null};
  if(d<0) return {cls:"rolling",label:"",days:d};
  if(d<=7) return {cls:d<=3?"urgent":"soon",label:"即将截止",days:d};
  return {cls:"normal",label:"",days:d};
}
function myState(id){
  const raw=mine[id] || {stage:"未申请",note:""};
  return {...raw,stage:normalizeStage(raw.stage)};
}
function tracked(id){ const x=myState(id); return x.stage!=="未申请" || !!x.note; }
function initials(name){ return String(name).replace(/中国|集团|股份有限公司|有限公司|科技|能源/g,"").slice(0,2) || "企"; }

function localUsers(){ return JSON.parse(localStorage.getItem("jt_local_users_v1") || "{}"); }
function localSessionEmail(){ return localStorage.getItem("jt_local_session_v1") || ""; }
function localDataKey(email){ return "jt_apps_v2:"+email.toLowerCase(); }
function bytesHex(a){ return [...a].map(x=>x.toString(16).padStart(2,"0")).join(""); }
async function sha256(text){
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return bytesHex(new Uint8Array(buf));
}
async function localSignup(email,password){
  const e=email.trim().toLowerCase(), users=localUsers();
  if(users[e]) throw new Error("这个邮箱已在本浏览器注册，请直接登录。");
  const salt=bytesHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash=await sha256(salt+"|"+password);
  users[e]={salt,hash,createdAt:new Date().toISOString()};
  localStorage.setItem("jt_local_users_v1",JSON.stringify(users));
  localStorage.setItem("jt_local_session_v1",e);
  session={user:{id:"local:"+await sha256(e),email:e}};
}
async function localLogin(email,password){
  const e=email.trim().toLowerCase(), users=localUsers(), u=users[e];
  if(!u) throw new Error("本浏览器没有这个账号，请先注册。");
  const hash=await sha256(u.salt+"|"+password);
  if(hash!==u.hash) throw new Error("密码不正确。");
  localStorage.setItem("jt_local_session_v1",e);
  session={user:{id:"local:"+await sha256(e),email:e}};
}
function localLogout(){ localStorage.removeItem("jt_local_session_v1"); session=null; mine={}; }
function loadLocalMine(){
  mine={};
  if(!session) return;
  mine=JSON.parse(localStorage.getItem(localDataKey(session.user.email)) || "{}");
}
function saveLocalMine(){ if(session) localStorage.setItem(localDataKey(session.user.email),JSON.stringify(mine)); }

async function initSession(){
  if(cloudConfigured){
    const {data}=await sb.auth.getSession();
    session=data.session;
    sb.auth.onAuthStateChange(async (_event,newSession)=>{
      session=newSession;
      await loadMine();
      updateUserUI();
      render();
    });
    await loadMine();
  }else{
    const email=localSessionEmail();
    if(email){
      session={user:{id:"local:"+await sha256(email),email}};
      loadLocalMine();
    }
  }
  updateUserUI();
}
async function loadMine(){
  mine={};
  if(!session) return;
  if(!cloudConfigured){ loadLocalMine(); return; }
  setSync("正在同步云端投递记录…");
  const {data,error}=await sb.from("user_applications").select("job_id,stage,note,updated_at");
  if(error){ setSync("同步失败："+error.message,true); return; }
  (data||[]).forEach(r=>mine[r.job_id]=r);
  setSync("云端已同步");
}
async function saveState(jobId,patch){
  if(!session){ openAuth(); return false; }
  const cur=myState(jobId);
  const row={job_id:jobId,stage:patch.stage ?? cur.stage ?? "未申请",note:patch.note ?? cur.note ?? ""};
  if(!cloudConfigured){
    mine[jobId]={...row,updated_at:new Date().toISOString()};
    saveLocalMine(); setSync("已保存在本机账户"); render(); return true;
  }
  setSync("正在保存…");
  const payload={...row,user_id:session.user.id};
  const {data,error}=await sb.from("user_applications").upsert(payload,{onConflict:"user_id,job_id"}).select().single();
  if(error){ setSync("保存失败："+error.message,true); return false; }
  mine[jobId]=data; setSync("云端已保存"); render(); return true;
}
async function deleteState(jobId){
  if(!session) return;
  if(!cloudConfigured){
    delete mine[jobId]; saveLocalMine(); $("#noteDialog").close(); render(); setSync("本机记录已删除"); return;
  }
  const {error}=await sb.from("user_applications").delete().eq("user_id",session.user.id).eq("job_id",jobId);
  if(error){ setSync("删除失败："+error.message,true); return; }
  delete mine[jobId]; $("#noteDialog").close(); render(); setSync("云端记录已删除");
}

function updateUserUI(){
  const logged=!!session;
  $("#loginBtn").classList.toggle("hidden",logged);
  $("#userBox").classList.toggle("hidden",!logged);
  $("#localModeNotice").classList.toggle("hidden",cloudConfigured);
  if(logged){
    $("#userName").textContent=session.user.email || "已登录";
    $("#accountMode").textContent=cloudConfigured ? "云端账号 · 跨设备同步" : "本机账号 · 仅此浏览器";
    setSync(cloudConfigured ? "已登录 · 云端同步" : "已登录 · 本机账户模式");
  }else{
    setSync(cloudConfigured ? "未登录 · 公共浏览" : "未登录 · 本机账户模式");
  }
}
function setSync(msg,bad=false){
  const el=$("#syncStatus"); el.textContent=msg; el.style.color=bad?"var(--red)":"";
}

function getTracks(){
  return [...new Set(JOBS.flatMap(j=>j.tracks||[]))].sort((a,b)=>a.localeCompare(b,"zh"));
}
function fillTrackFilter(){
  $("#trackFilter").innerHTML='<option value="">全部方向</option>'+getTracks().map(x=>`<option>${esc(x)}</option>`).join("");
}
function deadlinePass(job){
  if(!deadlineFilter) return true;
  const d=daysLeft(job.deadline);
  return d!==null && d>=0 && d<=7;
}
function filteredJobs(){
  const q=$("#searchInput").value.trim().toLowerCase();
  const track=$("#trackFilter").value, type=$("#typeFilter").value, stage=$("#stageFilter").value;
  return JOBS.filter(j=>{
    const hay=[j.company,j.unit,j.title,j.location,j.degree,j.majors,j.requirements,j.process,j.note,j.source,...(j.tracks||[])].join(" ").toLowerCase();
    const st=normalizeStage(myState(j.id).stage);
    return (!q||hay.includes(q)) && (!track||(j.tracks||[]).includes(track)) && (!type||j.type===type) && (!stage||st===stage) && (!onlyMine||tracked(j.id)) && deadlinePass(j);
  }).sort((a,b)=>{
    const ad=daysLeft(a.deadline), bd=daysLeft(b.deadline);
    const av=ad===null?99999:(ad<0?99998:ad), bv=bd===null?99999:(bd<0?99998:bd);
    if(av!==bv) return av-bv;
    return String(b.updated||"").localeCompare(String(a.updated||""));
  });
}
function render(){
  const list=filteredJobs();
  $("#jobRows").innerHTML=list.map(j=>{
    const m=deadlineMeta(j), st=myState(j.id), disabled=session?"":"disabled";
    return `<tr>
      <td><div class="deadline-box"><b>${esc(fmtDate(j.deadline))}</b>${m.label?`<span class="${m.cls}">${esc(m.label)}</span>`:""}<div class="sub">${esc(j.type)}</div></div></td>
      <td><div class="company-cell"><div class="logo">${esc(initials(j.company))}</div><div><div class="company-name">${esc(j.company)}</div><div class="job-title">${esc(j.title)}</div><div class="sub">${esc(j.unit||"")}</div></div></div></td>
      <td><div class="track-list">${(j.tracks||[]).map(t=>`<span class="track">${esc(t)}</span>`).join("")}</div></td>
      <td><b>${esc(j.location)}</b><div class="sub">更新 ${esc(j.updated||"—")}</div></td>
      <td class="edu"><b>${esc(j.degree)}</b><div class="sub">${esc(j.majors)}</div></td>
      <td class="req">${esc(j.requirements)}<div class="sub" style="margin-top:6px">${esc(j.note||"")}</div></td>
      <td class="official"><a class="btn primary" target="_blank" rel="noopener" href="${esc(j.applyUrl)}">官方投递 ↗</a><div class="sub">${esc(j.source)}</div></td>
      <td>
        <div class="status-actions">
          <button class="status-btn apply-btn ${st.stage==="已申请"?"active":""}" data-status="已申请" data-job="${j.id}" ${disabled} title="已申请">✓ <span>申请</span></button>
          <button class="status-btn reject-btn ${st.stage==="被拒"?"active":""}" data-status="被拒" data-job="${j.id}" ${disabled} title="被拒">✕ <span>被拒</span></button>
        </div>
        <button class="note-btn" data-note="${j.id}" ${disabled}>${st.note?"备注 ✓":"备注"}</button>
        ${!session?'<div class="sub">登录后标记</div>':""}
      </td>
      <td><button class="detail-btn" data-detail="${j.id}">查看详情</button></td>
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
  }else{
    $("#appliedCount").textContent="—"; $("#rejectedCount").textContent="—";
  }
  updateDeadlineStats();
  bindRows();
}
function updateDeadlineStats(){
  const future=JOBS.map(j=>daysLeft(j.deadline));
  $("#d7").textContent=future.filter(x=>x!==null&&x>=0&&x<=7).length;
}
function bindRows(){
  $("[data-status]").forEach(el=>el.onclick=async e=>{
    if(!session){ openAuth(); render(); return; }
    const btn=e.currentTarget;
    const id=btn.dataset.job;
    const wanted=btn.dataset.status;
    const current=myState(id).stage;
    await saveState(id,{stage:current===wanted?"未申请":wanted});
  });
  $$("[data-note]").forEach(el=>el.onclick=e=>{
    if(!session){ openAuth(); return; }
    noteJobId=e.target.dataset.note;
    const j=JOBS.find(x=>x.id===noteJobId);
    $("#noteTitle").textContent=(j?.company||"岗位")+" · 私人备注";
    $("#noteText").value=myState(noteJobId).note||"";
    $("#noteDialog").showModal();
  });
  $$("[data-detail]").forEach(el=>el.onclick=e=>openDetail(e.target.dataset.detail));
}
function openDetail(id){
  const j=JOBS.find(x=>x.id===id); if(!j) return;
  const m=deadlineMeta(j);
  $("#detailTitle").textContent=j.title;
  $("#detailCompany").textContent=(j.company||"")+" · "+(j.unit||"");
  $("#detailContent").innerHTML=[
    ["招聘类型",j.type],["工作地点",j.location],["学历要求",j.degree],["专业要求",j.majors],
    ["招聘人数",j.headcount||"未公开"],["开始时间",j.openDate||"未公开"],["截止时间",j.deadline?j.deadline+"（"+m.label+"）":"滚动 / 未公布"],
    ["适合方向",(j.tracks||[]).join(" / ")],["要求摘要",j.requirements],["招聘流程",j.process||"以官方通知为准"],["备注",j.note||"—"],["信息来源",j.source+" · 更新 "+(j.updated||"—")]
  ].map((x,i)=>`<div class="detail-item ${i>=8?"full":""}"><label>${esc(x[0])}</label><div>${esc(x[1])}</div></div>`).join("");
  $("#detailApply").href=j.applyUrl;
  $("#detailSource").href=j.sourceUrl||j.applyUrl;
  $("#detailDialog").showModal();
}

function setAuthMode(mode){
  authMode=mode;
  $("#tabLogin").classList.toggle("active",mode==="login");
  $("#tabSignup").classList.toggle("active",mode==="signup");
  $("#authSubmit").textContent=mode==="login"?"登录":"注册";
  $("#authMessage").textContent="";
}
function openAuth(){
  setAuthMode("login");
  $("#authModeHint").textContent=cloudConfigured ? "云端账号：可跨设备同步投递记录" : "本机账号：当前浏览器内可注册、登录和隔离不同用户";
  $("#authFine").textContent=cloudConfigured ? "账号由 Supabase Auth 管理；每个用户只能读取自己的投递记录。" : "当前尚未接入云端。请不要使用你其他网站的重要密码；以后接入 Supabase 后可升级为跨设备同步。";
  $("#authDialog").showModal();
}
async function submitAuth(){
  const email=$("#authEmail").value.trim(), password=$("#authPassword").value, msg=$("#authMessage");
  msg.style.color="var(--red)";
  if(!email || !email.includes("@") || password.length<6){ msg.textContent="请输入有效邮箱，密码至少6位。"; return; }
  msg.textContent="处理中…";
  try{
    if(cloudConfigured){
      const r=authMode==="signup" ? await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}) : await sb.auth.signInWithPassword({email,password});
      if(r.error) throw r.error;
      if(authMode==="signup" && !r.data.session){ msg.style.color="var(--green)"; msg.textContent="注册成功，请检查邮箱完成验证。"; return; }
      session=r.data.session;
      await loadMine();
    }else{
      if(authMode==="signup") await localSignup(email,password); else await localLogin(email,password);
      loadLocalMine();
    }
    $("#authDialog").close(); updateUserUI(); render();
  }catch(err){ msg.textContent=err.message||String(err); }
}

function bindStatic(){
  $("#themeBtn").onclick=()=>{const n=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=n;localStorage.setItem("jt-theme",n);};
  $("#loginBtn").onclick=openAuth;
  $("#logoutBtn").onclick=async()=>{
    if(cloudConfigured) await sb.auth.signOut(); else localLogout();
    if(!cloudConfigured){ updateUserUI(); render(); }
  };
  $("#tabLogin").onclick=()=>setAuthMode("login"); $("#tabSignup").onclick=()=>setAuthMode("signup"); $("#authSubmit").onclick=submitAuth;
  $("#authPassword").addEventListener("keydown",e=>{if(e.key==="Enter")submitAuth();});
  $("#searchInput").oninput=render; $("#trackFilter").onchange=render; $("#typeFilter").onchange=render; $("#stageFilter").onchange=render;
  $("#onlyMineBtn").onclick=()=>{onlyMine=!onlyMine;$("#onlyMineBtn").textContent=onlyMine?"✓ 只看已标记":"只看已标记";render();};
  $("#resetBtn").onclick=()=>{$("#searchInput").value="";$("#trackFilter").value="";$("#typeFilter").value="";$("#stageFilter").value="";onlyMine=false;deadlineFilter="";$("#onlyMineBtn").textContent="只看已标记";render();};
  $$(".deadline-card").forEach(btn=>btn.onclick=()=>{deadlineFilter=deadlineFilter===btn.dataset.deadline?"":btn.dataset.deadline;render();});
  $$("[data-close]").forEach(btn=>btn.onclick=()=>document.getElementById(btn.dataset.close).close());
  $("#saveNoteBtn").onclick=async()=>{ if(noteJobId){const ok=await saveState(noteJobId,{note:$("#noteText").value.trim()});if(ok)$("#noteDialog").close();} };
  $("#deleteStateBtn").onclick=async()=>{ if(noteJobId&&confirm("确定删除这个岗位的个人投递记录和备注吗？")) await deleteState(noteJobId); };
}

async function init(){
  document.documentElement.dataset.theme=localStorage.getItem("jt-theme")||"light";
  fillTrackFilter(); bindStatic(); await initSession(); render();
}
init();