#!/usr/bin/env python3
from __future__ import annotations

import concurrent.futures
import hashlib
import html
import json
import os
import re
import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / "crawler" / "sources.json").read_text(encoding="utf-8"))
COMPANIES = json.loads((ROOT / "data" / "companies.json").read_text(encoding="utf-8"))
MANUAL_JOBS = json.loads((ROOT / "data" / "jobs.json").read_text(encoding="utf-8"))
MAJORS = json.loads((ROOT / "data" / "majors.json").read_text(encoding="utf-8"))
SKILL_GROUPS = json.loads((ROOT / "data" / "skills.json").read_text(encoding="utf-8"))
INDUSTRIES = json.loads((ROOT / "data" / "industries.json").read_text(encoding="utf-8"))

AUTO_JSON = ROOT / "data" / "auto-jobs.json"
LEGACY_JS = ROOT / "auto-jobs-data.js"
STATE = ROOT / "crawler" / "state.json"

CN_TZ = timezone(timedelta(hours=8))
NOW = datetime.now(CN_TZ)
TODAY = NOW.date()
UA = "Mozilla/5.0 (compatible; UniJobAI/2.0; +https://github.com/g2066203208-beep/JOB-Trakcer)"
HEADERS = {
    "User-Agent": UA,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.4",
}
OFFICIAL_DOMAINS = {x["domain"].lower(): x["company"] for x in CFG.get("official_sources", [])}
KNOWN_ATS = (
    "zhiye.com","hotjob.cn","mokahr.com","iguopin.com","chinahr.com","51job.com",
    "liepin.com","nowcoder.com","campus.51job.com","jobs.51job.com","talent.",
    "career.","recruit.","zhaopin."
)
RECRUIT_WORDS = ("2027","校招","校园招聘","秋招","应届","毕业生","招聘","career","campus","graduate")
JOB_TITLE_WORDS = (
    "工程师","开发","算法","产品","运营","销售","营销","市场","财务","会计","审计","税务","法务","合规",
    "管培","培训生","研究员","研发","设计","技术","项目","咨询","供应链","采购","人力","教师","医生",
    "药师","临床","分析师","投资","交易","风控","银行","机械","结构","土木","电气","电子","质量","工艺",
    "制造","测试","数据","安全","网络","芯片","嵌入式","硬件","软件","商务","客服","管理"
)
BAD_WORDS = (
    "培训班","课程","考研","公务员考试题","辅导班","简历模板","论文代写","加盟","高考志愿",
    "实习经验分享","求职攻略","薪资揭秘","面经汇总","题库出售","内推码"
)
ALL_SKILLS = sorted({x for g in SKILL_GROUPS for x in g.get("items", [])}, key=len, reverse=True)
ALL_MAJOR_NAMES = [m["name"] for m in MAJORS if m["name"] != "不限专业"]

BROAD_QUERIES = [
    "2027 校园招聘 计算机 软件 算法 人工智能 大模型",
    "2027 校园招聘 电子 信息 通信 硬件 嵌入式",
    "2027 校园招聘 电气 自动化 电力 能源",
    "2027 校园招聘 机械 车辆 CAE 仿真 NVH",
    "2027 校园招聘 土木 结构 岩土 工程管理 设计院",
    "2027 校园招聘 新能源 风电 光伏 储能 电池",
    "2027 校园招聘 半导体 芯片 集成电路 封装",
    "2027 校园招聘 金融 银行 证券 保险 投资",
    "2027 校园招聘 会计 财务 审计 税务 咨询",
    "2027 校园招聘 医药 生物 临床 药学 医疗器械",
    "2027 校园招聘 化学 化工 材料 环境",
    "2027 校园招聘 法学 法务 合规 知识产权",
    "2027 校园招聘 市场 营销 销售 商务 管培生",
    "2027 校园招聘 产品 运营 用户研究 设计",
    "2027 校园招聘 供应链 采购 物流 工业工程",
    "2027 校园招聘 教育 教师 教研",
    "2027 校园招聘 新闻 传媒 广告 内容 编辑",
    "2027 校园招聘 农业 食品 动物医学",
    "2027 校园招聘 建筑 城乡规划 景观 设计",
    "2027 校园招聘 航空 航天 船舶 海洋",
    "2027 秋招 央企 国企 应届生",
    "2027 秋招 外企 管培生 graduate program",
]

def norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip()

def domain(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.lower()
    except Exception:
        return ""

def stable_id(url: str, title: str) -> str:
    h = hashlib.sha1((url.strip().lower()+"|"+title.strip().lower()).encode("utf-8")).hexdigest()[:14]
    return "auto-" + h

def get_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def fetch_text(url: str, timeout=16) -> str:
    r = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
    r.raise_for_status()
    ct = r.headers.get("content-type","").lower()
    if not any(x in ct for x in ("text","html","json","xml","javascript")):
        return ""
    r.encoding = r.apparent_encoding or r.encoding
    return r.text

def company_core(name: str) -> str:
    s = name
    for x in ("股份有限公司","集团有限公司","有限责任公司","有限公司","集团","股份","科技","智能","控股",
              "设计研究院","勘察设计院","建筑设计院","研究院","研究所"):
        s=s.replace(x,"")
    return re.sub(r"^(中国|国家)","",s).strip()

def company_match(name: str, text: str) -> bool:
    if not name:
        return True
    a=re.sub(r"\s+","",name).lower()
    b=re.sub(r"\s+","",text or "").lower()
    if a in b:
        return True
    c=re.sub(r"\s+","",company_core(name)).lower()
    return len(c)>=3 and c in b

def find_known_company(text: str) -> str | None:
    for c in COMPANIES:
        if company_match(c["name"], text):
            return c["name"]
    return None

def company_from_title(title: str, url: str) -> str:
    known=find_known_company(f"{title} {url}")
    if known:
        return known
    t=re.sub(r"[\[\]【】]"," ",title)
    m=re.match(r"\s*(.{2,30}?)(?:2027(?:届|年)?|校园招聘|秋招|校招|招聘)",t)
    if m:
        name=re.sub(r"[|｜—\-_:：].*$","",m.group(1)).strip()
        if 2<=len(name)<=30 and not any(x in name for x in ("岗位","职位","招聘信息","公告","简章","就业")):
            return name
    d=domain(url)
    return d or "自动发现"

def looks_recruiting(text: str) -> bool:
    low=(text or "").lower()
    return any(x.lower() in low for x in RECRUIT_WORDS)

def looks_job_title(text: str) -> bool:
    return any(x.lower() in (text or "").lower() for x in JOB_TITLE_WORDS)

def bad_candidate(text: str) -> bool:
    return any(x in (text or "") for x in BAD_WORDS)

def search_brave(q: str, key: str) -> list[dict]:
    r=requests.get(
        "https://api.search.brave.com/res/v1/web/search",
        headers={"Accept":"application/json","X-Subscription-Token":key,"User-Agent":UA},
        params={"q":q,"count":12,"country":"CN","search_lang":"zh-hans","ui_lang":"zh-CN","freshness":"pm","safesearch":"moderate"},
        timeout=20,
    )
    r.raise_for_status()
    out=[]
    for item in (r.json().get("web",{}) or {}).get("results",[]) or []:
        out.append({
            "title":norm_space(item.get("title","")),
            "url":item.get("url",""),
            "snippet":norm_space(item.get("description","")),
            "provider":"brave"
        })
    return out

def search_bing_rss(q: str) -> list[dict]:
    r=requests.get("https://www.bing.com/search",headers=HEADERS,params={"q":q,"format":"rss","setlang":"zh-cn"},timeout=18)
    r.raise_for_status()
    root=ET.fromstring(r.text)
    out=[]
    for item in root.findall(".//item")[:12]:
        out.append({
            "title":norm_space(item.findtext("title") or ""),
            "url":norm_space(item.findtext("link") or ""),
            "snippet":norm_space(BeautifulSoup(item.findtext("description") or "","html.parser").get_text(" ",strip=True)),
            "provider":"bing-rss",
        })
    return out

def search_ddg(q: str) -> list[dict]:
    r=requests.get("https://html.duckduckgo.com/html/",headers=HEADERS,params={"q":q},timeout=18)
    r.raise_for_status()
    soup=BeautifulSoup(r.text,"html.parser")
    out=[]
    for block in soup.select(".result")[:12]:
        a=block.select_one(".result__a")
        if not a: continue
        href=a.get("href","")
        parsed=urllib.parse.urlparse(href)
        if "duckduckgo.com" in parsed.netloc:
            u=urllib.parse.parse_qs(parsed.query).get("uddg",[""])[0]
            if u: href=urllib.parse.unquote(u)
        sn=block.select_one(".result__snippet")
        out.append({"title":norm_space(a.get_text(" ",strip=True)),"url":href,"snippet":norm_space(sn.get_text(" ",strip=True) if sn else ""),"provider":"duckduckgo"})
    return out

def existing_company_counts() -> dict[str,int]:
    counts={}
    for j in MANUAL_JOBS + get_json(AUTO_JSON,[]):
        n=j.get("company","")
        if n: counts[n]=counts.get(n,0)+1
    return counts

def priority_companies(mode: str) -> list[str]:
    counts=existing_company_counts()
    one=os.getenv("MANUAL_COMPANY","").strip()
    if one: return [one]
    ranked=sorted(
        [c["name"] for c in COMPANIES],
        key=lambda n:(counts.get(n,0), hashlib.sha1((n+str(TODAY)).encode()).hexdigest())
    )
    if mode=="full": return ranked
    # Every 4h scan enough companies that the whole 445-company universe is revisited daily.
    slot=(NOW.hour//4)%6
    chunk=90
    start=(slot*chunk)%max(1,len(ranked))
    return (ranked[start:]+ranked[:start])[:chunk]

def build_queries() -> list[tuple[str,str|None]]:
    mode=(os.getenv("MANUAL_SCAN_MODE","") or "recent").strip().lower()
    one=os.getenv("MANUAL_COMPANY","").strip()
    queries=[] if one else [(q,None) for q in BROAD_QUERIES]
    for name in priority_companies(mode):
        queries.extend([
            (f'"{name}" 2027 校园招聘 岗位',name),
            (f'"{name}" 2027 秋招 应届 招聘',name),
        ])
        if one:
            queries.extend([
                (f'"{name}" 校园招聘 职位 site:zhiye.com',name),
                (f'"{name}" 校园招聘 职位 site:hotjob.cn',name),
                (f'"{name}" 校园招聘 职位 site:mokahr.com',name),
            ])
    seen=set();out=[]
    for q,h in queries:
        k=(q,h or "")
        if k not in seen:
            seen.add(k);out.append((q,h))
    return out

def accept_results(results: list[dict], hint: str|None) -> list[dict]:
    out=[]
    for it in results:
        title=it.get("title","");url=it.get("url","");sn=it.get("snippet","")
        if not title or not url: continue
        blob=f"{title} {sn} {url}"
        if bad_candidate(blob) or not looks_recruiting(blob): continue
        if hint and not company_match(hint,blob): continue
        company=hint or company_from_title(title,url)
        d=domain(url)
        verified=any(d==od or d.endswith("."+od) for od in OFFICIAL_DOMAINS)
        out.append({
            "title":title[:180],"url":url,"snippet":sn[:900],
            "company":company,"companyHinted":bool(hint),"verified":verified,
            "provider":it.get("provider","web"),"discovery":"搜索引擎发现"
        })
    return out

def discover_web() -> tuple[list[dict],dict]:
    key=os.getenv("BRAVE_SEARCH_API_KEY","").strip()
    queries=build_queries()
    found=[]
    stats={"queries":len(queries),"brave":0,"bing-rss":0,"duckduckgo":0,"errors":0}
    for i,(q,hint) in enumerate(queries,1):
        accepted=[]
        try:
            primary=search_brave(q,key) if key else search_bing_rss(q)
            accepted=accept_results(primary,hint)
        except Exception as e:
            stats["errors"]+=1
            print(f"[primary] {q!r}: {e}")
        if len(accepted)<2:
            try:
                fallback=accept_results(search_ddg(q),hint)
                known={x["url"] for x in accepted}
                accepted.extend(x for x in fallback if x["url"] not in known)
            except Exception as e:
                stats["errors"]+=1
                print(f"[ddg] {q!r}: {e}")
        for x in accepted:
            stats[x["provider"]]=stats.get(x["provider"],0)+1
        found.extend(accepted)
        if i%40==0:
            print(f"[search] {i}/{len(queries)} accepted={len(found)}")
        time.sleep(0.08 if key else 0.14)
    return found,stats

def discover_official() -> list[dict]:
    found=[]
    for src in CFG.get("official_sources",[]):
        try:
            body=fetch_text(src["url"])
            soup=BeautifulSoup(body,"html.parser")
            page_text=norm_space(soup.get_text(" ",strip=True))
            # Keep the root campaign page itself.
            if looks_recruiting(page_text):
                found.append({
                    "title":f'{src["company"]} 2027校园招聘',
                    "url":src["url"],"snippet":page_text[:900],"company":src["company"],
                    "companyHinted":True,"verified":True,"provider":"official","discovery":"官方招聘页"
                })
            # Extract concrete job-ish links from server-rendered pages.
            for a in soup.find_all("a",href=True):
                title=norm_space(a.get_text(" ",strip=True))
                if len(title)<4 or not looks_job_title(title): continue
                href=urllib.parse.urljoin(src["url"],a["href"])
                found.append({
                    "title":title[:180],"url":href,"snippet":title,"company":src["company"],
                    "companyHinted":True,"verified":True,"provider":"official","discovery":"官方职位链接"
                })
        except Exception as e:
            print(f"[official] {src['company']}: {e}")
    return found

def should_expand(item: dict) -> bool:
    d=domain(item.get("url",""))
    title=item.get("title","")
    return any(k in d for k in KNOWN_ATS) or any(x in title for x in ("校园招聘","校招","招聘","职位列表","招聘岗位"))

def expand_one(item: dict) -> list[dict]:
    if not should_expand(item): return []
    try:
        raw=fetch_text(item["url"],timeout=14)
        if not raw: return []
        soup=BeautifulSoup(raw,"html.parser")
        out=[]
        for a in soup.find_all("a",href=True):
            title=norm_space(a.get_text(" ",strip=True))
            if len(title)<4 or len(title)>120: continue
            if not looks_job_title(title) or bad_candidate(title): continue
            href=urllib.parse.urljoin(item["url"],a["href"])
            if href.startswith("javascript:") or href=="#": continue
            out.append({
                "title":title,"url":href,"snippet":title,
                "company":item["company"],"companyHinted":True,
                "verified":item.get("verified",False),"provider":"page-expand",
                "discovery":"招聘页职位展开"
            })
            if len(out)>=25: break
        return out
    except Exception:
        return []

def expand_candidates(items: list[dict]) -> list[dict]:
    seeds=[]
    seen=set()
    for x in items:
        if x["url"] in seen: continue
        seen.add(x["url"]);seeds.append(x)
        if len(seeds)>=180: break
    extra=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for rows in ex.map(expand_one,seeds):
            extra.extend(rows)
    return extra

def full_page_text(url: str) -> str:
    try:
        raw=fetch_text(url,timeout=12)
        if not raw:return ""
        soup=BeautifulSoup(raw,"html.parser")
        for bad in soup(["script","style","noscript"]): bad.decompose()
        return norm_space(soup.get_text(" ",strip=True))[:12000]
    except Exception:
        return ""

def parse_deadline(text: str) -> str|None:
    pats=[
        r"截止(?:至|到|时间[:：为是]?)?\s*(20\d{2})[年\-/\.](\d{1,2})[月\-/\.](\d{1,2})[日号]?",
        r"(20\d{2})[年\-/\.](\d{1,2})[月\-/\.](\d{1,2})[日号]?(?:\s*\d{1,2}[:：]\d{2})?\s*(?:截止|前)",
        r"截止(?:至|到)?\s*(\d{1,2})月(\d{1,2})日",
    ]
    for p in pats:
        m=re.search(p,text)
        if not m: continue
        try:
            if len(m.groups())==3:
                y,mo,da=map(int,m.groups())
            else:
                y=TODAY.year;mo,da=map(int,m.groups())
                if datetime(y,mo,da).date()<TODAY-timedelta(days=60):y+=1
            return f"{y:04d}-{mo:02d}-{da:02d}"
        except Exception: pass
    return None

def infer_degree(text: str) -> str:
    if "博士" in text: return "博士 / 硕士 / 本科" if "本科" in text else "博士"
    if "硕士" in text or "研究生" in text: return "硕士 / 研究生" if "本科" not in text else "本科 / 硕士"
    if "本科" in text: return "本科"
    return "待核验"

def infer_location(text: str) -> str:
    cities=["北京","上海","深圳","广州","武汉","杭州","南京","苏州","成都","西安","长沙","天津","重庆","合肥","青岛","宁波","厦门","济南","无锡","东莞","宁德","长春","珠海","佛山","郑州","大连","福州","南昌","昆明","贵阳","沈阳","哈尔滨","石家庄"]
    hits=[c for c in cities if c in text]
    return "、".join(hits[:4]) if hits else "待核验"

def infer_majors(text: str) -> list[str]:
    hits=[m for m in ALL_MAJOR_NAMES if m in text]
    aliases=[
        ("土木工程",r"土木|结构工程|岩土|桥梁|隧道"),
        ("机械设计制造及其自动化",r"机械类|机械工程"),
        ("工程力学",r"力学类|固体力学|工程力学"),
        ("计算机科学与技术",r"计算机类|计算机相关"),
        ("电气工程及其自动化",r"电气类|电气工程"),
        ("材料科学与工程",r"材料类|材料工程"),
        ("金融学",r"金融类|金融相关"),
        ("会计学",r"财会类|会计相关"),
        ("临床医学",r"临床医学|医学类"),
    ]
    for name,p in aliases:
        if re.search(p,text,re.I) and name not in hits: hits.append(name)
    return hits[:8]

def infer_skills(text: str) -> list[str]:
    low=text.lower()
    return [s for s in ALL_SKILLS if s.lower() in low][:12]

def infer_industry(text: str, company: str) -> str:
    c=next((x for x in COMPANIES if x["name"]==company),None)
    if c and c.get("industry"): return c["industry"]
    for ind in INDUSTRIES:
        if any(k.lower() in text.lower() for k in ind.get("keywords",[])):
            return ind["name"]
    return "其他"

def enrich_item(item: dict, page_text: str="") -> dict:
    title=item["title"];url=item["url"];snippet=item.get("snippet","")
    text=norm_space(f"{title} {snippet} {page_text}")
    company=item.get("company") or company_from_title(title,url)
    majors=infer_majors(text)
    skills=infer_skills(text)
    verified=bool(item.get("verified"))
    requirements=(page_text[:1200] if page_text and len(page_text)>len(snippet) else snippet) or "自动扫描发现招聘信息，请打开原始页面核验岗位要求。"
    return {
        "id":stable_id(url,title),
        "company":company,
        "companyId":None,
        "title":title,
        "unit":"自动发现",
        "industry":infer_industry(text,company),
        "tracks":["全网发现"],
        "type":"自动发现",
        "location":infer_location(text),
        "degree":infer_degree(text),
        "majorsText":"、".join(majors) if majors else "待核验",
        "majorTags":majors,
        "skills":skills,
        "headcount":"待核验",
        "openDate":str(TODAY),
        "deadline":parse_deadline(text),
        "updated":str(TODAY),
        "requirements":requirements,
        "process":"以原始招聘页面为准",
        "applyUrl":url,
        "sourceUrl":url,
        "source":("官方源自动发现" if verified else "全网自动发现")+(f" · {domain(url)}" if domain(url) else ""),
        "note":"自动发现条目；投递前请核验专业、学历、地点和截止时间。",
        "verified":verified,
        "auto":True,
        "provider":item.get("provider","web"),
        "firstSeen":NOW.isoformat(timespec="seconds"),
        "lastSeen":NOW.isoformat(timespec="seconds"),
    }

def reasonable(j: dict) -> bool:
    blob=f'{j.get("title","")} {j.get("requirements","")} {j.get("applyUrl","")}'
    if bad_candidate(blob): return False
    if len(j.get("title",""))<4: return False
    return looks_recruiting(blob) or looks_job_title(j.get("title",""))

def enrich_candidates(items: list[dict]) -> list[dict]:
    # Fetch page text for the most promising unique URLs; search snippets handle the rest.
    unique=[];seen=set()
    for x in items:
        if x["url"] in seen: continue
        seen.add(x["url"]);unique.append(x)
    fetch_set={x["url"] for x in unique[:220]}
    pages={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        future={ex.submit(full_page_text,u):u for u in fetch_set}
        for f in concurrent.futures.as_completed(future):
            pages[future[f]]=f.result()
    by={}
    for x in unique:
        j=enrich_item(x,pages.get(x["url"],""))
        if not reasonable(j): continue
        key=(j["applyUrl"].lower(),re.sub(r"\s+","",j["title"]).lower())
        old=by.get(key)
        if old is None or (j["verified"] and not old["verified"]):
            by[key]=j
    return list(by.values())

def merge_history(new_jobs: list[dict]) -> tuple[list[dict],int]:
    existing=get_json(AUTO_JSON,[])
    by={}
    for j in existing:
        dl=j.get("deadline")
        if dl:
            try:
                if (TODAY-datetime.fromisoformat(dl).date()).days>45: continue
            except Exception: pass
        by[j.get("id") or stable_id(j.get("applyUrl",""),j.get("title",""))]=j
    before=len(by)
    for j in new_jobs:
        old=by.get(j["id"])
        if old:j["firstSeen"]=old.get("firstSeen",j["firstSeen"])
        by[j["id"]]=j
    vals=list(by.values())
    vals.sort(key=lambda j:(not bool(j.get("verified")),j.get("deadline") is None,j.get("company",""),j.get("title","")))
    return vals[:2500],max(0,len(by)-before)

def main():
    mode=(os.getenv("MANUAL_SCAN_MODE","") or "recent").strip().lower()
    official=discover_official()
    web,stats=discover_web()
    expanded=expand_candidates(official+web)
    candidates=official+web+expanded
    jobs=enrich_candidates(candidates)
    merged,added=merge_history(jobs)

    meta={
        "updated_at":NOW.isoformat(timespec="seconds"),
        "mode":mode,
        "company":os.getenv("MANUAL_COMPANY","").strip() or None,
        "company_targets":len(COMPANIES),
        "queries":stats["queries"],
        "raw_results":len(candidates),
        "expanded_links":len(expanded),
        "qualified_jobs":len(jobs),
        "added":added,
        "total":len(merged),
        "providers":{k:v for k,v in stats.items() if k!="queries"},
    }
    AUTO_JSON.write_text(json.dumps(merged,ensure_ascii=False,indent=2),encoding="utf-8")
    LEGACY_JS.write_text(
        "window.AUTO_SCAN_META = "+json.dumps(meta,ensure_ascii=False,indent=2)+";\n"
        +"window.AUTO_JOB_DATA = "+json.dumps(merged,ensure_ascii=False,indent=2)+";\n",
        encoding="utf-8",
    )
    STATE.write_text(json.dumps({"updated_at":meta["updated_at"],"meta":meta},ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(meta,ensure_ascii=False))

if __name__=="__main__":
    main()
