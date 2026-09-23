import {
  loadPlatformData, loadProfile, saveProfile, loadApplications, setApplication,
  loadFavorites, toggleFavorite, saveScannedJobs, lastScanAt
} from "./data-store.js";
import { rankJobs, scoreJob } from "./matcher.js";
import { runWebScan } from "./scanner.js";

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

let data={jobs:[],companies:[],majors:[],industries:[],skills:[],questionBank:{companyKits:[],generalBank:[]}};
let profile=loadProfile();
let applications=loadApplications();
let favorites=loadFavorites();
let currentView="home";
let currentJob=null;
let selectedDiscipline="全部";
let myFilter="all";
let scanning=false;

const cityOrder=["北京","上海","深圳","广州","武汉","杭州","南京","苏州","成都","西安","长沙","天津","重庆","合肥","青岛","宁波","厦门","济南","无锡","东莞"];

function hasProfile(){
  return !!(profile.major || profile.degree || (profile.skills||[]).length || (profile.industries||[]).length || (profile.cities||[]).length);
}
function daysLeft(s){
  if(!s)return null;
  const d=new Date(s+"T00:00:00"), n=new Date();
  const a=new Date(n.getFullYear(),n.getMonth(),n.getDate());
  const b=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  return Math.ceil((b-a)/86400000);
}
function isExpired(j){const d=daysLeft(j.deadline);return d!==null&&d<0}
function isUrgent(j){const d=daysLeft(j.deadline);return d!==null&&d>=0&&d<=7}
function fmtDate(s){
  if(!s)return "截止待定";
  const d=new Date(s+"T00:00:00");
  return (d.getMonth()+1)+"月"+d.getDate()+"日";
}
function initials(name){
  return String(name||"企").replace(/中国|国家|集团|股份有限公司|有限公司|科技|能源/g,"").slice(0,2)||"企";
}
function jobState(id){return (applications[id]&&applications[id].status)||"未申请"}
function jobText(j){
  return [j.company,j.title,j.unit,j.industry,j.location,j.degree,j.majorsText,j.requirements]
    .concat(j.majorTags||[],j.skills||[],j.tracks||[]).join(" ").toLowerCase();
}
function degreePass(j,w){
  if(!w)return true;
  const s=j.degree||"";
  if(w==="本科")return /本科|大学本科|本科及以上|本科 \/ 硕士/.test(s);
  if(w==="硕士")return /硕士|研究生|硕士及以上|本科 \/ 硕士|按岗位|待核验/.test(s);
  if(w==="博士")return /博士|按岗位|待核验/.test(s);
  return true;
}
function getJobCompany(j){return data.companies.find(c=>c.name===j.company)}
function getIndustry(j){return j.industry || (getJobCompany(j)||{}).industry || "其他"}
function countJobsByCompany(){
  const m=new Map();
  data.jobs.forEach(j=>m.set(j.company,(m.get(j.company)||0)+1));
  return m;
}
function uniqueLocations(){
  const set=new Set();
  data.jobs.forEach(j=>cityOrder.forEach(c=>{if((j.location||"").includes(c))set.add(c)}));
  return Array.from(set);
}
function switchView(v){
  currentView=v;
  $$(".view").forEach(x=>x.classList.toggle("active-view",x.id==="view-"+v));
  $$("[data-view-link]").forEach(x=>x.classList.toggle("active",x.dataset.viewLink===v && x.classList.contains("nav-item")));
  if(v==="home")renderHome();
  if(v==="jobs")renderJobs();
  if(v==="companies")renderCompanies();
  if(v==="majors")renderMajors();
  if(v==="questions")renderQuestions();
  if(v==="my")renderMy();
  window.scrollTo({top:0,behavior:"smooth"});
}

function populateControls(){
  const industryOptions=data.industries.map(i=>'<option value="'+esc(i.name)+'">'+esc(i.name)+'</option>').join("");
  $("#jobIndustry").innerHTML='<option value="">全部行业</option>'+industryOptions;
  $("#companyIndustry").innerHTML='<option value="">全部行业</option>'+industryOptions;

  const groups=new Map();
  data.majors.forEach(m=>{
    if(m.name==="不限专业")return;
    if(!groups.has(m.group))groups.set(m.group,[]);
    groups.get(m.group).push(m);
  });
  let majorHTML='<option value="">全部专业</option>';
  groups.forEach((ms,g)=>{
    majorHTML+='<optgroup label="'+esc(g)+'">'+ms.map(m=>'<option>'+esc(m.name)+'</option>').join("")+'</optgroup>';
  });
  $("#jobMajor").innerHTML=majorHTML;
  $("#majorDatalist").innerHTML=data.majors.filter(m=>m.name!=="不限专业").map(m=>'<option value="'+esc(m.name)+'"></option>').join("");
  $("#jobCity").innerHTML='<option value="">全部地区</option>'+uniqueLocations().map(c=>'<option>'+esc(c)+'</option>').join("");
  $("#majorCount").textContent=data.majors.filter(m=>m.name!=="不限专业").length;

  const qb=data.questionBank||{companyKits:[],generalBank:[]};
  $("#questionCompany").innerHTML='<option value="">全部公司</option>'+(qb.companyKits||[]).map(k=>'<option>'+esc(k.company)+'</option>').join("");
  const cats=Array.from(new Set((qb.generalBank||[]).map(q=>q.category))).sort((a,b)=>a.localeCompare(b,"zh"));
  $("#questionCategory").innerHTML='<option value="">全部题类</option><option value="公司专项">公司专项</option>'+cats.map(x=>'<option>'+esc(x)+'</option>').join("");
  $("#questionCount").textContent=(qb.generalBank||[]).length+(qb.companyKits||[]).reduce((n,k)=>n+(k.questions||[]).length,0);
}

function renderHome(){
  const active=data.jobs.filter(j=>!isExpired(j));
  $("#metricJobs").textContent=data.jobs.length;
  $("#metricCompanies").textContent=data.companies.length;
  $("#metricMajors").textContent=data.majors.filter(m=>m.name!=="不限专业").length;
  $("#metricUrgent").textContent=active.filter(isUrgent).length;
  renderProfileSummary();

  const ranked=rankJobs(active,profile).slice(0,5);
  if(!ranked.length){
    $("#recommendationList").innerHTML='<div class="empty-state"><b>暂无岗位</b><p>点击全网扫描补充招聘信息。</p></div>';
  }else{
    $("#recommendationList").innerHTML=ranked.map(x=>{
      const job=x.job;
      const rs=(hasProfile()?x.reasons:["最新招聘信息"]).slice(0,3).map(r=>'<span>'+esc(r)+'</span>').join("");
      return '<article class="recommend-row"><div class="score-badge">'+(hasProfile()?x.score+"%":"新")+'</div><div><h3>'+esc(job.title)+'</h3><p>'+esc(job.company)+' · '+esc(job.location||"地点待定")+' · '+esc(job.degree||"学历待核验")+'</p><div class="recommend-reasons">'+rs+'</div></div><button class="mini-link" data-action="job-detail" data-job-id="'+esc(job.id)+'">详情 →</button></article>';
    }).join("");
  }

  const counts=new Map();
  active.forEach(j=>counts.set(getIndustry(j),(counts.get(getIndustry(j))||0)+1));
  $("#industryGrid").innerHTML=data.industries.map(ind=>{
    return '<button class="industry-card" data-action="industry" data-industry="'+esc(ind.name)+'"><b>'+esc(ind.name)+'</b><small>'+esc(ind.keywords.slice(0,3).join(" · "))+'</small><strong>'+(counts.get(ind.name)||0)+'</strong></button>';
  }).join("");

  const latest=active.slice().sort((a,b)=>String(b.updated||"").localeCompare(String(a.updated||""))).slice(0,7);
  $("#latestJobs").innerHTML=latest.length?latest.map(compactJobHTML).join(""):'<div class="empty-state"><b>暂无岗位</b></div>';
  renderLastScan();
}
function renderProfileSummary(){
  const box=$("#profileSummaryContent"),label=$("#profileLabel"),sub=$("#profileSub"),initial=$("#profileInitial");
  if(!hasProfile()){
    label.textContent="设置求职画像";sub.textContent="获得个性化推荐";initial.textContent="我";
    box.className="profile-empty";
    box.innerHTML='<b>还没有设置专业</b><p>填写专业、学历、目标城市和技能后，系统会自动计算岗位匹配度。</p><button class="secondary-button" data-action="edit-profile">现在设置</button>';
    return;
  }
  label.textContent=profile.major||profile.degree||"我的画像";
  sub.textContent=[profile.degree,profile.graduationYear?profile.graduationYear+"届":""].filter(Boolean).join(" · ");
  initial.textContent=(profile.major||profile.school||"我").slice(0,1);
  box.className="summary-profile";
  const chips=[].concat((profile.cities||[]).slice(0,3),(profile.skills||[]).slice(0,4)).map(x=>'<span>'+esc(x)+'</span>').join("");
  box.innerHTML='<h3>'+esc(profile.major||"未设置专业")+'</h3><p>'+esc([profile.school,profile.degree,profile.graduationYear?profile.graduationYear+"届":""].filter(Boolean).join(" · ")||"继续完善你的求职画像")+'</p><div class="summary-chips">'+chips+'</div>';
}
function compactJobHTML(j){
  const meta=[j.company,j.location,j.degree].filter(Boolean);
  const major=(j.majorTags||[]).slice(0,2).map(x=>'<span>'+esc(x)+'</span>').join("");
  return '<article class="compact-job"><div><h3>'+esc(j.title)+'</h3><p>'+esc(meta.join(" · "))+'</p><div class="job-meta">'+(isUrgent(j)?'<span>即将截止</span>':"")+major+'</div></div><button class="mini-link" data-action="job-detail" data-job-id="'+esc(j.id)+'">详情 →</button></article>';
}

function filteredJobs(){
  const q=$("#jobKeyword").value.trim().toLowerCase();
  const industry=$("#jobIndustry").value,major=$("#jobMajor").value,city=$("#jobCity").value,degree=$("#jobDegree").value;
  const urgent=$("#urgentOnly").checked,sort=$("#jobSort").value;
  let rows=data.jobs.filter(j=>{
    if(isExpired(j))return false;
    const text=jobText(j);
    const queryPass=!q||q.split(/\s+/).every(k=>text.includes(k));
    const majorPass=!major||(j.majorTags||[]).includes(major)||(j.majorsText||"").includes(major)||text.includes(major.toLowerCase());
    const cityPass=!city||(j.location||"").includes(city)||/全国|多地|按岗位/.test(j.location||"");
    return queryPass&&(!industry||getIndustry(j)===industry)&&majorPass&&cityPass&&degreePass(j,degree)&&(!urgent||isUrgent(j));
  });
  if(sort==="match")rows=rankJobs(rows,profile).map(x=>x.job);
  if(sort==="deadline")rows.sort((a,b)=>(daysLeft(a.deadline)??99999)-(daysLeft(b.deadline)??99999));
  if(sort==="updated")rows.sort((a,b)=>String(b.updated||"").localeCompare(String(a.updated||"")));
  return rows;
}
function renderJobs(){
  const rows=filteredJobs();
  $("#jobResultCount").textContent=rows.length;
  $("#jobList").innerHTML=rows.length?rows.slice(0,250).map(jobCardHTML).join(""):'<div class="empty-state"><b>没有符合条件的岗位</b><p>调整筛选条件，或者点击“扫描新岗位”。</p></div>';
}
function jobCardHTML(j){
  const match=scoreJob(j,profile),st=jobState(j.id),fav=favorites.has(j.id);
  const tags=[].concat((j.majorTags||[]).slice(0,2),(j.skills||[]).slice(0,2));
  return '<article class="job-card"><div class="job-card-top"><div class="job-company"><div class="company-logo">'+esc(initials(j.company))+'</div><div><h3>'+esc(j.title)+'</h3><p>'+esc(j.company)+(j.unit?' · '+esc(j.unit):'')+'</p></div></div>'+(hasProfile()?'<span class="match-pill">'+match.score+'% 匹配</span>':'')+'</div>'+
    '<div class="job-card-body"><div class="job-info"><b>地点</b>　'+esc(j.location||"待核验")+'</div><div class="job-info"><b>学历</b>　'+esc(j.degree||"待核验")+'</div><div class="job-info"><b>专业</b>　'+esc(j.majorsText||"待核验")+'</div><div class="job-info"><b>截止</b>　'+esc(fmtDate(j.deadline))+'</div></div>'+
    '<div class="job-tags">'+(isUrgent(j)?'<span class="job-tag urgent">7天内截止</span>':'')+'<span class="job-tag">'+esc(getIndustry(j))+'</span>'+tags.map(t=>'<span class="job-tag">'+esc(t)+'</span>').join("")+'</div>'+
    '<div class="job-card-actions"><button class="status-icon favorite '+(fav?'active':'')+'" data-action="favorite" data-job-id="'+esc(j.id)+'" title="收藏">'+(fav?'★':'☆')+'</button><button class="status-icon applied '+(st==="已申请"?'active':'')+'" data-action="status" data-status="已申请" data-job-id="'+esc(j.id)+'" title="已申请">✓</button><button class="status-icon rejected '+(st==="被拒"?'active':'')+'" data-action="status" data-status="被拒" data-job-id="'+esc(j.id)+'" title="被拒">✕</button><span class="spacer"></span><button class="secondary-button" data-action="job-detail" data-job-id="'+esc(j.id)+'">详情</button><a class="primary-button" href="'+esc(j.applyUrl)+'" target="_blank" rel="noopener">投递 ↗</a></div></article>';
}

function renderCompanies(){
  const q=$("#companyKeyword").value.trim().toLowerCase(),industry=$("#companyIndustry").value,nature=$("#companyNature").value,state=$("#companyJobState").value;
  const counts=countJobsByCompany();
  const rows=data.companies.filter(c=>{
    const hay=[c.name,c.industry,c.sector,c.nature].concat(c.tags||[]).join(" ").toLowerCase();
    const n=counts.get(c.name)||0;
    return (!q||hay.includes(q))&&(!industry||c.industry===industry)&&(!nature||c.nature===nature)&&(!state||(state==="has"?n>0:n===0));
  }).sort((a,b)=>(counts.get(b.name)||0)-(counts.get(a.name)||0)||a.name.localeCompare(b.name,"zh"));
  $("#companyResultCount").textContent=rows.length;
  $("#companyGrid").innerHTML=rows.length?rows.map(c=>{
    const n=counts.get(c.name)||0;
    return '<button class="company-card" data-action="company" data-company="'+esc(c.name)+'"><div class="company-card-head"><span class="company-type">'+esc(c.nature||"待核验")+'</span><span class="company-jobs">'+(n?n+" 条岗位":"待发现")+'</span></div><h3>'+esc(c.name)+'</h3><p>'+esc(c.industry||c.sector||"行业待核验")+'</p><div class="company-tags">'+(c.tags||[]).slice(0,4).map(t=>'<span>'+esc(t)+'</span>').join("")+'</div><div class="company-footer"><span>'+esc(c.sector||"")+'</span><b>查看 →</b></div></button>';
  }).join(""):'<div class="empty-state"><b>没有符合条件的企业</b></div>';
}

function renderMajors(){
  const groups=["全部"].concat(Array.from(new Set(data.majors.filter(m=>m.name!=="不限专业").map(m=>m.group))));
  $("#disciplineTabs").innerHTML=groups.map(g=>'<button class="'+(selectedDiscipline===g?'active':'')+'" data-action="discipline" data-discipline="'+esc(g)+'">'+esc(g)+'</button>').join("");
  const counts=new Map();
  data.jobs.forEach(j=>(j.majorTags||[]).forEach(m=>counts.set(m,(counts.get(m)||0)+1)));
  const majors=data.majors.filter(m=>m.name!=="不限专业"&&(selectedDiscipline==="全部"||m.group===selectedDiscipline));
  $("#majorGrid").innerHTML=majors.map(m=>'<button class="major-card" data-action="major" data-major="'+esc(m.name)+'"><b>'+esc(m.name)+'</b><small>'+esc(m.group)+' · '+(counts.get(m.name)||0)+' 条现有岗位</small></button>').join("");
}


function allQuestions(){
  const qb=data.questionBank||{companyKits:[],generalBank:[]};
  const company=(qb.companyKits||[]).flatMap(k=>(k.questions||[]).map(q=>Object.assign({},q,{
    company:k.company,category:"公司专项",process:k.process,sources:k.sources||[],companyQuestion:true
  })));
  const general=(qb.generalBank||[]).map(q=>Object.assign({},q,{
    company:"",sources:[],companyQuestion:false
  }));
  return company.concat(general);
}
function filteredQuestions(){
  const q=$("#questionKeyword").value.trim().toLowerCase();
  const company=$("#questionCompany").value,category=$("#questionCategory").value,type=$("#questionType").value,sort=$("#questionSort").value;
  let rows=allQuestions().filter(x=>{
    const text=[x.company,x.category,x.type,x.question,x.answerPoints].join(" ").toLowerCase();
    return (!q||q.split(/\s+/).every(k=>text.includes(k)))
      &&(!company||x.company===company)
      &&(!category||x.category===category)
      &&(!type||x.type===type);
  });
  if(sort==="company")rows.sort((a,b)=>(b.companyQuestion-a.companyQuestion)||String(a.company||a.category).localeCompare(String(b.company||b.category),"zh"));
  if(sort==="category")rows.sort((a,b)=>String(a.category).localeCompare(String(b.category),"zh")||String(a.type).localeCompare(String(b.type),"zh"));
  if(sort==="random")rows=rows.slice().sort(()=>Math.random()-.5);
  return rows;
}
function renderQuestions(){
  const qb=data.questionBank||{companyKits:[],generalBank:[]};
  const total=(qb.generalBank||[]).length+(qb.companyKits||[]).reduce((n,k)=>n+(k.questions||[]).length,0);
  $("#questionCount").textContent=total;

  $("#companyKitList").innerHTML=(qb.companyKits||[]).map(k=>{
    const n=(k.questions||[]).length;
    return '<button class="company-kit '+($("#questionCompany").value===k.company?'active':'')+'" data-action="question-company" data-company="'+esc(k.company)+'"><b>'+esc(k.company)+'</b><small>'+n+' 道专项题 · '+esc((k.sources||[]).some(s=>s.type==="official")?"含官方流程":"公开面经整理")+'</small></button>';
  }).join("");

  const selectedCompany=$("#questionCompany").value;
  if(selectedCompany){
    const kit=(qb.companyKits||[]).find(k=>k.company===selectedCompany);
    if(kit){
      const links=(kit.sources||[]).map(s=>'<a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.label)+' ↗</a>').join("");
      $("#questionBankMeta").innerHTML='<div class="question-company-meta"><div><span class="eyebrow">COMPANY GUIDE</span><h3>'+esc(kit.company)+'</h3><p>'+esc(kit.process||"")+'</p></div><div class="source-links">'+links+'</div></div>';
    }
  }else{
    $("#questionBankMeta").innerHTML='<div class="question-bank-summary"><b>题库共 '+total+' 道</b><span>公司专项 '+(qb.companyKits||[]).reduce((n,k)=>n+(k.questions||[]).length,0)+' 道 · 通用分类 '+(qb.generalBank||[]).length+' 道</span></div>';
  }

  const rows=filteredQuestions();
  $("#questionList").innerHTML=rows.length?rows.slice(0,300).map((x,i)=>{
    const badge=x.company?x.company:x.category;
    const src=x.companyQuestion?'<span class="question-source">公开流程/面经改写</span>':'<span class="question-source">通用练习</span>';
    return '<article class="question-card"><div class="question-num">'+String(i+1).padStart(2,"0")+'</div><div class="question-main"><div class="question-labels"><span>'+esc(badge)+'</span><span>'+esc(x.type||"练习")+'</span>'+src+'</div><h3>'+esc(x.question)+'</h3><div class="answer-panel hidden" id="answer-'+esc(x.id)+'"><b>答题要点</b><p>'+esc(x.answerPoints||"结合岗位和个人经历作答。")+'</p></div></div><button class="answer-toggle" data-action="toggle-answer" data-answer-id="'+esc(x.id)+'">看要点</button></article>';
  }).join(""):'<div class="empty-state"><b>没有符合筛选条件的题目</b><p>清空公司或题类筛选后再试。</p></div>';
}

function renderMy(){
  if(hasProfile()){
    $("#myProfileCard").innerHTML='<div class="profile-card-content"><span class="eyebrow">PROFILE</span><h2>'+esc(profile.major||"未设置专业")+'</h2><p>'+esc([profile.school,profile.degree,profile.graduationYear?profile.graduationYear+"届":""].filter(Boolean).join(" · "))+'</p><div class="profile-lines"><div class="profile-line"><span>目标城市</span><b>'+esc((profile.cities||[]).join(" / ")||"未设置")+'</b></div><div class="profile-line"><span>目标行业</span><b>'+esc((profile.industries||[]).join(" / ")||"未设置")+'</b></div><div class="profile-line"><span>技能</span><b>'+esc((profile.skills||[]).slice(0,6).join(" / ")||"未设置")+'</b></div><div class="profile-line"><span>毕业年份</span><b>'+esc(profile.graduationYear||"未设置")+'</b></div></div></div>';
  }else{
    $("#myProfileCard").innerHTML='<div class="empty-state"><b>先建立求职画像</b><p>设置专业、学历、技能和目标城市后，推荐会更准确。</p><button class="primary-button" data-action="edit-profile">设置画像</button></div>';
  }
  $("#myFavCount").textContent=favorites.size;
  $("#myAppliedCount").textContent=Object.values(applications).filter(x=>x.status==="已申请").length;
  $("#myRejectedCount").textContent=Object.values(applications).filter(x=>x.status==="被拒").length;
  $$("[data-my-filter]").forEach(b=>b.classList.toggle("active",b.dataset.myFilter===myFilter));
  const rows=data.jobs.filter(j=>{
    const st=jobState(j.id),fav=favorites.has(j.id);
    if(myFilter==="favorite")return fav;
    if(myFilter==="applied")return st==="已申请";
    if(myFilter==="rejected")return st==="被拒";
    return fav||st!=="未申请";
  });
  $("#myJobList").innerHTML=rows.length?rows.map(compactJobHTML).join(""):'<div class="empty-state"><b>还没有记录</b><p>在岗位卡片上点 ☆、✓ 或 ✕ 就会出现在这里。</p></div>';
}

function openProfile(){
  $("#profileSchool").value=profile.school||"";
  $("#profileDegree").value=profile.degree||"";
  $("#profileMajor").value=profile.major||"";
  $("#profileYear").value=profile.graduationYear||"2027";
  $("#profileCities").value=(profile.cities||[]).join(", ");
  $("#profileIndustries").value=(profile.industries||[]).join(", ");
  $("#profileSkills").value=(profile.skills||[]).join(", ");
  $("#profileDialog").showModal();
}
function splitList(s){return Array.from(new Set(String(s||"").split(/[,，、;/]+/).map(x=>x.trim()).filter(Boolean)))}
function saveProfileForm(){
  profile=Object.assign({},profile,{
    school:$("#profileSchool").value.trim(),
    degree:$("#profileDegree").value,
    major:$("#profileMajor").value.trim(),
    graduationYear:$("#profileYear").value.trim(),
    cities:splitList($("#profileCities").value),
    industries:splitList($("#profileIndustries").value),
    skills:splitList($("#profileSkills").value)
  });
  saveProfile(profile);$("#profileDialog").close();renderAll();
}

function detailCell(k,v,full){
  return '<div class="detail-cell '+(full?'full':'')+'"><span>'+esc(k)+'</span><b>'+esc(v)+'</b></div>';
}
function openJob(id){
  currentJob=data.jobs.find(j=>j.id===id);if(!currentJob)return;
  const j=currentJob,match=scoreJob(j,profile);
  $("#jobDialogTitle").textContent=j.title;
  $("#jobDialogCompany").textContent=[j.company,j.unit].filter(Boolean).join(" · ");
  let body='<div class="detail-grid">'+detailCell("行业",getIndustry(j))+detailCell("地点",j.location||"待核验")+detailCell("学历",j.degree||"待核验")+detailCell("截止",fmtDate(j.deadline))+detailCell("专业",j.majorsText||"待核验",true)+detailCell("技能",(j.skills||[]).join(" / ")||"未提取",true)+detailCell("岗位要求",j.requirements||"请查看原始招聘页面",true)+detailCell("招聘流程",j.process||"以企业通知为准",true)+detailCell("信息来源",j.source||"公开招聘信息",true)+'</div>';
  if(hasProfile())body+='<div class="match-explain"><strong>'+match.score+'% 匹配</strong><div>'+match.reasons.map(x=>'<span>'+esc(x)+'</span>').join("")+match.gaps.map(x=>'<span>'+esc(x)+'</span>').join("")+'</div></div>';
  $("#jobDialogBody").innerHTML=body;
  $("#jobDialogApplyLink").href=j.applyUrl||j.sourceUrl||"#";
  refreshDetailButtons();$("#jobDialog").showModal();
}
function refreshDetailButtons(){
  if(!currentJob)return;
  const st=jobState(currentJob.id),fav=favorites.has(currentJob.id);
  $("#jobDialogFavorite").textContent=fav?"★ 已收藏":"☆ 收藏";
  $("#jobDialogFavorite").classList.toggle("active",fav);
  $("#jobDialogApplied").classList.toggle("active",st==="已申请");
  $("#jobDialogRejected").classList.toggle("active",st==="被拒");
}

function showToast(title,text,done,error){
  const t=$("#scanToast");$("#scanToastTitle").textContent=title;$("#scanToastText").textContent=text;
  t.classList.remove("hidden","done","error");if(done)t.classList.add("done");if(error)t.classList.add("error");
  if(done||error)setTimeout(()=>t.classList.add("hidden"),6500);
}
function renderLastScan(){
  const at=lastScanAt();
  $("#lastScanText").textContent=at?"最近扫描："+new Date(at).toLocaleString("zh-CN"):"尚未手动扫描";
}
async function scanNow(){
  if(scanning)return;
  scanning=true;$("#scanButton").disabled=true;$("#scanButton").classList.add("scanning");
  showToast("正在全网扫描","准备多专业招聘搜索…");
  const beforeJobs=data.jobs.length,beforeCompanies=data.companies.length;
  try{
    const found=await runWebScan({
      profile,companies:data.companies,jobs:data.jobs,
      onProgress:p=>showToast("正在全网扫描",p.completed+"/"+p.total+" 个搜索任务 · 已发现 "+p.found+" 条候选")
    });
    saveScannedJobs(found);
    data=await loadPlatformData();populateControls();
    const nj=Math.max(0,data.jobs.length-beforeJobs),nc=Math.max(0,data.companies.length-beforeCompanies);
    showToast("扫描完成","发现 "+found.length+" 条候选 · 新增 "+nj+" 条岗位 · 新增 "+nc+" 家企业",true,false);
    renderAll();
  }catch(e){
    showToast("扫描失败",(e&&e.message)||"搜索源暂时不可用，请稍后再试",false,true);
  }finally{
    scanning=false;$("#scanButton").disabled=false;$("#scanButton").classList.remove("scanning");
  }
}

function renderAll(){
  renderHome();
  if(currentView==="jobs")renderJobs();
  if(currentView==="companies")renderCompanies();
  if(currentView==="majors")renderMajors();
  if(currentView==="questions")renderQuestions();
  if(currentView==="my")renderMy();
}
function handleClick(e){
  const el=e.target.closest("[data-action],[data-view-link],[data-quick-search],[data-my-filter]");
  if(!el)return;
  if(el.dataset.viewLink){e.preventDefault();switchView(el.dataset.viewLink);return}
  if(el.dataset.quickSearch){$("#jobKeyword").value=el.dataset.quickSearch;switchView("jobs");return}
  if(el.dataset.myFilter){myFilter=el.dataset.myFilter;renderMy();return}
  const a=el.dataset.action;
  if(a==="edit-profile"){openProfile();return}
  if(a==="hero-search"){$("#jobKeyword").value=$("#heroSearch").value.trim();switchView("jobs");return}
  if(a==="scan"){scanNow();return}
  if(a==="industry"){$("#jobIndustry").value=el.dataset.industry;switchView("jobs");return}
  if(a==="company"){$("#jobKeyword").value=el.dataset.company;switchView("jobs");return}
  if(a==="major"){$("#jobMajor").value=el.dataset.major;switchView("jobs");return}
  if(a==="discipline"){selectedDiscipline=el.dataset.discipline;renderMajors();return}
  if(a==="question-company"){
    $("#questionCompany").value=el.dataset.company||"";
    $("#questionCategory").value="公司专项";
    renderQuestions();return;
  }
  if(a==="toggle-answer"){
    const box=document.getElementById("answer-"+el.dataset.answerId);
    if(box){box.classList.toggle("hidden");el.textContent=box.classList.contains("hidden")?"看要点":"收起";}
    return;
  }
  if(a==="job-detail"){openJob(el.dataset.jobId);return}
  if(a==="favorite"){favorites=toggleFavorite(el.dataset.jobId);renderAll();return}
  if(a==="status"){
    const id=el.dataset.jobId,w=el.dataset.status,next=jobState(id)===w?"未申请":w;
    applications=setApplication(id,next);renderAll();return;
  }
  if(a==="favorite-detail"&&currentJob){favorites=toggleFavorite(currentJob.id);renderAll();refreshDetailButtons();return}
  if(a==="status-detail"&&currentJob){
    const w=el.dataset.status,next=jobState(currentJob.id)===w?"未申请":w;
    applications=setApplication(currentJob.id,next);renderAll();refreshDetailButtons();return;
  }
  if(a==="reset-jobs"){
    ["jobKeyword","jobIndustry","jobMajor","jobCity","jobDegree"].forEach(id=>$("#"+id).value="");
    $("#urgentOnly").checked=false;$("#jobSort").value="match";renderJobs();return;
  }
}
function bind(){
  document.addEventListener("click",handleClick);
  $$("[data-close-dialog]").forEach(b=>b.addEventListener("click",()=>document.getElementById(b.dataset.closeDialog).close()));
  $("#profileForm").addEventListener("submit",e=>{e.preventDefault();saveProfileForm()});
  $("#heroSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("#jobKeyword").value=e.target.value.trim();switchView("jobs")}});
  ["jobKeyword","jobIndustry","jobMajor","jobCity","jobDegree","jobSort","urgentOnly"].forEach(id=>{
    const el=$("#"+id);el.addEventListener(el.tagName==="INPUT"&&el.type==="text"?"input":"change",renderJobs);
  });
  ["companyKeyword","companyIndustry","companyNature","companyJobState"].forEach(id=>{
    const el=$("#"+id);el.addEventListener(el.tagName==="INPUT"?"input":"change",renderCompanies);
  });
  ["questionKeyword","questionCompany","questionCategory","questionType","questionSort"].forEach(id=>{
    const el=$("#"+id);el.addEventListener(el.tagName==="INPUT"?"input":"change",renderQuestions);
  });
  $("#randomPracticeBtn").addEventListener("click",()=>{
    $("#questionCompany").value="";
    $("#questionCategory").value="";
    $("#questionType").value="";
    $("#questionSort").value="random";
    renderQuestions();
    $("#questionList").scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("#scanButton").addEventListener("click",scanNow);
  $("#themeButton").addEventListener("click",()=>{
    const next=document.documentElement.dataset.theme==="dark"?"light":"dark";
    document.documentElement.dataset.theme=next;localStorage.setItem("unijob_theme",next);
  });
}
async function init(){
  document.documentElement.dataset.theme=localStorage.getItem("unijob_theme")||"light";
  try{
    data=await loadPlatformData();populateControls();bind();renderAll();
  }catch(e){
    document.body.innerHTML='<div style="padding:40px;font-family:sans-serif"><h2>UniJob AI 加载失败</h2><p>'+esc((e&&e.message)||String(e))+'</p><button onclick="location.reload()">重新加载</button></div>';
  }
}
init();
