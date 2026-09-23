const BROAD_QUERIES = [
  "2027届 校园招聘 计算机 软件 算法 人工智能",
  "2027届 校园招聘 电子 电气 自动化 通信",
  "2027届 校园招聘 机械 车辆 CAE 仿真",
  "2027届 校园招聘 土木 结构 工程管理 设计院",
  "2027届 校园招聘 新能源 风电 光伏 储能",
  "2027届 校园招聘 半导体 芯片 集成电路",
  "2027届 校园招聘 金融 银行 证券 会计",
  "2027届 校园招聘 医药 生物 医疗",
  "2027届 校园招聘 材料 化工 环境",
  "2027届 校园招聘 法学 法务 合规",
  "2027届 校园招聘 市场 运营 产品 管培生",
  "2027届 校园招聘 教育 教师 传媒 新闻"
];

export async function runWebScan({profile,companies,onProgress}={}){
  const queries=[...BROAD_QUERIES];
  if(profile?.major) queries.unshift(`2027届 校园招聘 "${profile.major}"`);
  if(profile?.industries?.length) queries.unshift(...profile.industries.slice(0,3).map(x=>`2027届 校园招聘 "${x}"`));
  const companyNames=(companies||[]).slice().sort(()=>Math.random()-.5).slice(0,24).map(c=>c.name);
  queries.push(...companyNames.map(n=>`"${n}" 2027 校园招聘`));

  const all=[];
  let completed=0, failures=0;
  await pool(queries,6,async(q)=>{
    let rows=[];
    try{ rows=await mwmbl(q); }catch{}
    if(!rows.length){
      try{ rows=await jinaBing(q); }catch{ failures++; }
    }
    for(const r of rows){
      const job=toJob(r,companies||[]);
      if(job) all.push(job);
    }
    completed++;
    onProgress?.({completed,total:queries.length,found:all.length,failures});
  });
  return dedupe(all);
}

async function mwmbl(q){
  const r=await fetch("https://api.mwmbl.org/api/v1/search/?s="+encodeURIComponent(q),{cache:"no-store"});
  if(!r.ok) throw new Error("search unavailable");
  const data=await r.json();
  const rows=Array.isArray(data)?data:(data.results||[]);
  return rows.slice(0,10).map(x=>({
    title:textVal(x.title),
    url:x.url||"",
    snippet:textVal(x.extract)
  })).filter(x=>x.title&&x.url);
}
function textVal(v){
  if(Array.isArray(v)) return v.map(x=>typeof x==="string"?x:(x?.value||"")).join("");
  if(v&&typeof v==="object") return v.value||"";
  return String(v||"");
}
async function jinaBing(q){
  const u="https://r.jina.ai/https://www.bing.com/search?q="+encodeURIComponent(q);
  const r=await fetch(u,{headers:{"Accept":"text/plain"},cache:"no-store"});
  if(!r.ok) throw new Error("reader unavailable");
  const text=await r.text(),out=[],seen=new Set();
  const re=/\[([^\]\n]{4,180})\]\((https?:\/\/[^)\s]+)\)/g;
  let m;
  while((m=re.exec(text))&&out.length<12){
    let url=m[2];
    let host="";
    try{host=new URL(url).hostname}catch{continue}
    if(/bing\.com|microsoft\.com|jina\.ai/.test(host)||seen.has(url))continue;
    seen.add(url);
    out.push({title:m[1].replace(/\s+/g," ").trim(),url,snippet:""});
  }
  return out;
}

function toJob(r,companies){
  const blob=`${r.title} ${r.snippet||""}`;
  if(!/2027|校招|校园招聘|秋招|应届|毕业生|招聘|career|campus/i.test(blob)) return null;
  const company=inferCompany(blob,r.url,companies);
  if(!company) return null;
  const id="scan-"+hash(r.url+"|"+r.title);
  const majorTags=inferMajors(blob);
  const skills=inferSkills(blob);
  return {
    id,company,companyId:null,title:r.title,unit:"全网扫描",industry:inferIndustry(blob),
    tracks:["全网发现"],type:"自动发现",location:inferLocation(blob),degree:inferDegree(blob),
    majorsText:majorTags.length?majorTags.join("、"):"待核验",majorTags,skills,headcount:"待核验",
    openDate:new Date().toISOString().slice(0,10),deadline:inferDeadline(blob),updated:new Date().toISOString().slice(0,10),
    requirements:r.snippet||"全网扫描发现的招聘页面，请进入原始页面核验岗位要求。",
    process:"以原始招聘页面为准",applyUrl:r.url,sourceUrl:r.url,source:"全网即时扫描",
    note:"自动发现，投递前请核验专业、学历、地点和截止时间。",verified:false,auto:true
  };
}
function inferCompany(text,url,companies){
  for(const c of companies){
    const core=coreName(c.name);
    if(text.includes(c.name) || (core.length>=3&&text.includes(core))) return c.name;
  }
  const title=String(text).replace(/[【】\[\]]/g," ");
  let m=title.match(/^(.{2,30}?)(?:2027(?:届|年)?|校园招聘|秋招|校招|招聘)/);
  let name=(m?.[1]||"").replace(/[|｜—\-_:：].*$/,"").trim();
  if(!name){
    try{
      const h=new URL(url).hostname.replace(/^www\./,"").split(".")[0];
      if(h.length>=3&&!/jobs?|career|campus|zhaopin|51job|liepin|boss/.test(h)) name=h;
    }catch{}
  }
  if(!name||name.length>30||/岗位|职位|招聘信息|就业|求职|公告|简章/.test(name))return null;
  return name;
}
function coreName(n){return String(n||"").replace(/中国|国家|股份有限公司|集团有限公司|有限公司|集团|股份|科技|智能|控股|研究院|设计院/g,"").trim()}
function inferIndustry(t){
  const rules=[["互联网 / AI",/人工智能|算法|互联网|软件开发|大模型|AI/i],["芯片 / 半导体",/芯片|半导体|集成电路/],["汽车 / 智能驾驶",/汽车|整车|车辆|底盘|智能驾驶/],["新能源",/新能源|风电|光伏|储能|氢能|电池/],["建筑 / 基建",/土木|建筑|中建|中铁|中交|施工|桥梁|隧道/],["金融 / 保险",/银行|证券|金融|保险|投资/],["医药 / 医疗",/医药|医疗|临床|药学|生物医药/],["化工 / 材料",/化工|材料|高分子/],["电子 / 智能硬件",/电子|通信|硬件|消费电子/]];
  return rules.find(x=>x[1].test(t))?.[0]||"其他";
}
function inferDegree(t){if(/博士/.test(t))return"博士";if(/硕士|研究生/.test(t))return"硕士 / 研究生";if(/本科/.test(t))return"本科";return"待核验"}
function inferLocation(t){const cities=["北京","上海","深圳","广州","武汉","杭州","南京","苏州","成都","西安","长沙","天津","重庆","合肥","青岛","宁波","厦门","济南","无锡","东莞"];return cities.find(c=>t.includes(c))||"待核验"}
function inferMajors(t){
  const ms=["计算机科学与技术","软件工程","人工智能","电气工程及其自动化","自动化","电子信息工程","通信工程","机械设计制造及其自动化","车辆工程","土木工程","工程力学","工程管理","材料科学与工程","化学工程与工艺","能源与动力工程","新能源科学与工程","金融学","会计学","法学","临床医学","药学","英语"];
  return ms.filter(m=>t.includes(m)||alias(m,t)).slice(0,6);
}
function alias(m,t){
  const map={"机械设计制造及其自动化":/机械工程|机械类/,"土木工程":/土木|结构工程/,"工程力学":/力学类|固体力学/,"计算机科学与技术":/计算机类/,"电气工程及其自动化":/电气类/,"材料科学与工程":/材料类/};
  return map[m]?.test(t)||false;
}
function inferSkills(t){
  const list=["Python","C++","Java","SQL","MATLAB","Abaqus","ANSYS","LS-DYNA","HyperMesh","Fluent","SolidWorks","AutoCAD","Revit","BIM","PyTorch","TensorFlow","Excel","CET-6"];
  return list.filter(s=>t.toLowerCase().includes(s.toLowerCase())).slice(0,10);
}
function inferDeadline(t){
  let m=t.match(/截止(?:至|到|时间[:：]?)?\s*(20\d{2})[年\/.-](\d{1,2})[月\/.-](\d{1,2})日?/);
  if(!m)m=t.match(/(20\d{2})[年\/.-](\d{1,2})[月\/.-](\d{1,2})日?\s*(?:截止|前)/);
  return m?`${m[1]}-${String(+m[2]).padStart(2,"0")}-${String(+m[3]).padStart(2,"0")}`:null;
}
function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(16)}
function dedupe(rows){const m=new Map();for(const r of rows){const k=(r.applyUrl+"|"+r.title).toLowerCase();if(!m.has(k))m.set(k,r)}return[...m.values()]}
async function pool(items,limit,fn){let i=0;async function w(){while(true){const n=i++;if(n>=items.length)return;await fn(items[n])}}await Promise.all(Array.from({length:Math.min(limit,items.length)},w))}
