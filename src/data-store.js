const VERSION = "20260923-unijob-v4";
const DATA_FILES = {
  jobs: "./data/jobs.json",
  companies: "./data/companies.json",
  majors: "./data/majors.json",
  industries: "./data/industries.json",
  skills: "./data/skills.json",
  questions: "./data/question-bank.json",
  autoJobs: "./data/auto-jobs.json"
};

async function getJSON(url){
  const r = await fetch(url + "?v=" + VERSION, {cache:"no-store"});
  if(!r.ok) throw new Error(`加载失败 ${url}: ${r.status}`);
  return r.json();
}

export async function loadPlatformData(){
  const [jobs, companies, majors, industries, skills, questionBank, autoJobs] = await Promise.all([
    getJSON(DATA_FILES.jobs),
    getJSON(DATA_FILES.companies),
    getJSON(DATA_FILES.majors),
    getJSON(DATA_FILES.industries),
    getJSON(DATA_FILES.skills),
    getJSON(DATA_FILES.questions),
    getJSON(DATA_FILES.autoJobs)
  ]);
  const scanned = loadScannedJobs();
  const mergedJobs = dedupeJobs([...jobs, ...(autoJobs||[]), ...scanned]);
  const companyMap = new Map(companies.map(c=>[c.name,c]));
  for(const j of mergedJobs){
    if(!companyMap.has(j.company)){
      const c={
        id:"scan-company-"+slug(j.company),
        name:j.company,
        industry:j.industry||"其他",
        sector:"自动发现",
        tags:["全网扫描"],
        nature:"待核验",
        headquarters:"",
        careerUrl:"",
        website:"",
        description:"由全网扫描自动发现"
      };
      companyMap.set(c.name,c);
    }
  }
  return {jobs:mergedJobs, companies:[...companyMap.values()], majors, industries, skills, questionBank};
}

function dedupeJobs(rows){
  const by=new Map();
  for(const j of rows){
    const key=((j.applyUrl||"")+"|"+(j.title||"")+"|"+(j.company||"")).toLowerCase();
    if(!by.has(key) || (j.verified && !by.get(key).verified)) by.set(key,j);
  }
  return [...by.values()];
}
function slug(s){
  let h=2166136261;
  for(const ch of String(s||"")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}
  return (h>>>0).toString(16);
}

const PROFILE_KEY="unijob_profile_v1";
const APPLICATION_KEY="unijob_applications_v1";
const FAVORITES_KEY="unijob_favorites_v1";
const SCANNED_KEY="unijob_scanned_jobs_v1";

export function loadProfile(){
  try{
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || defaultProfile();
  }catch{return defaultProfile()}
}
export function saveProfile(profile){
  localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));
}
export function defaultProfile(){
  return {school:"",degree:"",major:"",graduationYear:"2027",cities:[],industries:[],skills:[],keywords:[]};
}

export function loadApplications(){
  try{return JSON.parse(localStorage.getItem(APPLICATION_KEY))||{}}catch{return{}}
}
export function saveApplications(v){localStorage.setItem(APPLICATION_KEY,JSON.stringify(v))}
export function setApplication(jobId,status){
  const all=loadApplications();
  if(!status || status==="未申请") delete all[jobId];
  else all[jobId]={...(all[jobId]||{}),status,updatedAt:new Date().toISOString()};
  saveApplications(all);
  return all;
}
export function setApplicationNote(jobId,note){
  const all=loadApplications();
  all[jobId]={...(all[jobId]||{}),status:(all[jobId]?.status||"未申请"),note,updatedAt:new Date().toISOString()};
  saveApplications(all);
  return all;
}

export function loadFavorites(){
  try{return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY))||[])}catch{return new Set()}
}
export function toggleFavorite(jobId){
  const set=loadFavorites();
  set.has(jobId)?set.delete(jobId):set.add(jobId);
  localStorage.setItem(FAVORITES_KEY,JSON.stringify([...set]));
  return set;
}

export function loadScannedJobs(){
  try{return JSON.parse(localStorage.getItem(SCANNED_KEY))||[]}catch{return[]}
}
export function saveScannedJobs(rows){
  const merged=dedupeJobs([...loadScannedJobs(),...rows]).slice(-1500);
  localStorage.setItem(SCANNED_KEY,JSON.stringify(merged));
  localStorage.setItem("unijob_last_scan_at",new Date().toISOString());
  return merged;
}
export function clearScannedJobs(){
  localStorage.removeItem(SCANNED_KEY);
}

export function lastScanAt(){
  return localStorage.getItem("unijob_last_scan_at")||"";
}
