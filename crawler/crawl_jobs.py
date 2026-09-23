#!/usr/bin/env python3
from __future__ import annotations

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
OUT = ROOT / "auto-jobs-data.js"
STATE = ROOT / "crawler" / "state.json"

UA = "Mozilla/5.0 (compatible; JobTrackerCN/1.0; +https://github.com/g2066203208-beep/JOB-Trakcer)"
HEADERS = {
    "User-Agent": UA,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.4",
}
CN_TZ = timezone(timedelta(hours=8))
NOW = datetime.now(CN_TZ)
TODAY = NOW.date()

OFFICIAL_DOMAINS = {x["domain"].lower(): x["company"] for x in CFG["official_sources"]}
INCLUDE = CFG["include_keywords"]
ROLE_KEYS = CFG["role_keywords"]

TRACK_RULES = [
    ("土木直投", ["土木","结构","岩土","桥梁","隧道","道路","市政","水利","建筑工程"]),
    ("设计院", ["设计院","勘察设计","规划设计","工程设计"]),
    ("工程管理", ["工程管理","项目管理","造价","商务管理","工程经济"]),
    ("施工/项目", ["施工","项目部","项目技术","现场工程"]),
    ("智能建造", ["智能建造","BIM","数字建造","数字化工程"]),
    ("能源央企", ["国家能源","华能","华电","大唐","国家电投","中广核","中核","三峡","国家电网","南方电网"]),
    ("风电/新能源", ["风电","风机","新能源","光伏","储能","氢能"]),
    ("CAE/仿真", ["CAE","仿真","有限元","Abaqus","ANSYS","LS-DYNA","NVH","疲劳","CFD","多体动力学"]),
    ("转汽车/机械", ["汽车","整车","机械","车辆","底盘","NVH","制造"]),
    ("轨道交通", ["中车","轨道","铁路车辆"]),
    ("热流体", ["热管理","流体","CFD","传热"]),
    ("工业软件", ["CAE软件","工业软件","求解器"]),
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

def fetch_text(url: str, timeout=16) -> str:
    r = requests.get(url, headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    ct = r.headers.get("content-type","")
    if not any(x in ct for x in ("text","html","json","xml")):
        return ""
    r.encoding = r.apparent_encoding or r.encoding
    return r.text

def load_company_targets() -> list[dict]:
    p = ROOT / "companies-data.js"
    if not p.exists():
        return []
    raw = p.read_text(encoding="utf-8").strip()
    m = re.search(r"window\.COMPANY_TARGETS\s*=\s*(\[.*\])\s*;?\s*$", raw, re.S)
    if not m:
        return []
    try:
        return json.loads(m.group(1))
    except Exception:
        return []

def load_existing_jobs() -> list[dict]:
    if not OUT.exists():
        return []
    raw = OUT.read_text(encoding="utf-8")
    m = re.search(r"window\.AUTO_JOB_DATA\s*=\s*(\[.*\])\s*;?\s*$", raw, re.S)
    if not m:
        return []
    try:
        return json.loads(m.group(1))
    except Exception:
        return []

def company_match(hint: str, text: str) -> bool:
    if not hint:
        return True
    h=hint.lower().replace(" ","")
    t=(text or "").lower().replace(" ","")
    if h in t:
        return True
    core=hint
    for x in ["股份有限公司","集团有限公司","有限责任公司","有限公司","集团","股份","研究总院","设计研究总院","设计研究院","勘察设计院","建筑设计院","设计院","研究所","研究院","科技","智能","控股"]:
        core=core.replace(x,"")
    core=core.strip()
    if len(core)>=4 and core.lower().replace(" ","") in t:
        return True
    # For long SOE names, retain a meaningful 4+ char prefix after common country prefix.
    alt=re.sub(r"^(中国|国家)","",core)
    return len(alt)>=4 and alt.lower().replace(" ","") in t

def company_from(title: str, url: str) -> str:
    d = domain(url)
    for od, company in OFFICIAL_DOMAINS.items():
        if d == od or d.endswith("." + od):
            return company
    t = re.sub(r"[\[\]【】]", "", title)
    parts = re.split(r"[-_|｜—–·:：]", t)
    lead = norm_space(parts[0]) if parts else ""
    if 2 <= len(lead) <= 28:
        return lead
    return d or "自动发现"

def classify(text: str) -> list[str]:
    low = text.lower()
    out=[]
    for label,keys in TRACK_RULES:
        if any(k.lower() in low for k in keys):
            out.append(label)
    if not out:
        out=["其他可投"]
    if "自动发现" not in out:
        out.append("自动发现")
    return out[:5]

def parse_deadline(text: str) -> str | None:
    text=norm_space(text)
    pats=[
        r"截止(?:至|到|时间[:：为是]?)?\s*(20\d{2})[年\-/\.](\d{1,2})[月\-/\.](\d{1,2})[日号]?",
        r"(20\d{2})[年\-/\.](\d{1,2})[月\-/\.](\d{1,2})[日号]?(?:\s*\d{1,2}[:：]\d{2})?\s*(?:截止|前)",
        r"截止(?:至|到|时间[:：为是]?)?\s*(\d{1,2})月(\d{1,2})日",
        r"(\d{1,2})月(\d{1,2})日(?:\s*\d{1,2}[:：]\d{2})?\s*(?:截止|前)",
    ]
    for p in pats:
        m=re.search(p,text)
        if not m:
            continue
        try:
            if len(m.groups())==3:
                y,mo,da=map(int,m.groups())
            else:
                mo,da=map(int,m.groups())
                y=TODAY.year
                if datetime(y,mo,da).date()<TODAY-timedelta(days=60):
                    y+=1
            return f"{y:04d}-{mo:02d}-{da:02d}"
        except Exception:
            pass
    return None

def infer_degree(text: str) -> str:
    vals=[]
    for x in ["博士","硕士","研究生","本科","大专"]:
        if x in text and x not in vals:
            vals.append(x)
    return " / ".join(vals[:3]) if vals else "待核验"

def infer_majors(text: str) -> str:
    keys=["土木工程","结构工程","岩土工程","工程管理","力学","机械","车辆工程","能源动力","电气","自动化","计算机","材料","海洋工程","水利水电","建筑学","流体力学","热能工程"]
    vals=[k for k in keys if k in text]
    return "、".join(vals[:7]) if vals else "待核验"

def looks_recruiting(text: str) -> bool:
    return any(k.lower() in text.lower() for k in INCLUDE)

def looks_relevant(text: str) -> bool:
    return any(k.lower() in text.lower() for k in ROLE_KEYS) or any(k.lower() in text.lower() for k in ["仿真","CAE","NVH","CFD","设计院","工程师","研发"])

def discover_official() -> list[dict]:
    found=[]
    for src in CFG["official_sources"]:
        try:
            body=fetch_text(src["url"])
            soup=BeautifulSoup(body,"html.parser")
            for a in soup.find_all("a",href=True):
                title=norm_space(a.get_text(" ",strip=True))
                if len(title)<4:
                    continue
                href=urllib.parse.urljoin(src["url"],a["href"])
                blob=f"{title} {href}"
                if not looks_recruiting(blob):
                    continue
                if not looks_relevant(blob):
                    continue
                found.append({
                    "title":title[:140],"url":href,"snippet":title[:550],
                    "company":src["company"],"verified":True,
                    "discovery":"官方招聘页自动发现","provider":"official",
                })
        except Exception as e:
            print(f"[official] {src['company']}: {e}")
        time.sleep(0.18)
    return found

def search_brave(q: str, key: str) -> list[dict]:
    r=requests.get(
        "https://api.search.brave.com/res/v1/web/search",
        headers={"Accept":"application/json","X-Subscription-Token":key,"User-Agent":UA},
        params={"q":q,"count":10,"country":"CN","search_lang":"zh-hans","ui_lang":"zh-CN","freshness":"pm","safesearch":"moderate"},
        timeout=20,
    )
    r.raise_for_status()
    out=[]
    for item in (r.json().get("web",{}) or {}).get("results",[]) or []:
        out.append({"title":norm_space(item.get("title","")),"url":item.get("url",""),"snippet":norm_space(item.get("description","")),"provider":"brave"})
    return out

def search_bing_rss(q: str) -> list[dict]:
    r=requests.get(
        "https://www.bing.com/search",
        headers=HEADERS,
        params={"q":q,"format":"rss","setlang":"zh-cn"},
        timeout=18,
    )
    r.raise_for_status()
    root=ET.fromstring(r.text)
    out=[]
    for item in root.findall(".//item")[:10]:
        title=norm_space(item.findtext("title") or "")
        url=norm_space(item.findtext("link") or "")
        desc=BeautifulSoup(item.findtext("description") or "","html.parser").get_text(" ",strip=True)
        out.append({"title":title,"url":url,"snippet":norm_space(desc),"provider":"bing-rss"})
    return out

def search_ddg(q: str) -> list[dict]:
    r=requests.get("https://html.duckduckgo.com/html/",headers=HEADERS,params={"q":q},timeout=18)
    r.raise_for_status()
    soup=BeautifulSoup(r.text,"html.parser")
    out=[]
    for block in soup.select(".result")[:10]:
        a=block.select_one(".result__a")
        if not a:
            continue
        href=a.get("href","")
        parsed=urllib.parse.urlparse(href)
        if "duckduckgo.com" in parsed.netloc:
            u=urllib.parse.parse_qs(parsed.query).get("uddg",[""])[0]
            if u:
                href=urllib.parse.unquote(u)
        sn=block.select_one(".result__snippet")
        out.append({"title":norm_space(a.get_text(" ",strip=True)),"url":href,"snippet":norm_space(sn.get_text(" ",strip=True) if sn else ""),"provider":"duckduckgo"})
    return out

def build_queries() -> list[tuple[str,str|None]]:
    mode=(os.getenv("MANUAL_SCAN_MODE","") or "recent").strip().lower()
    one=os.getenv("MANUAL_COMPANY","").strip()
    targets=load_company_targets()
    queries=[(q,None) for q in CFG["search_queries"]]
    if one:
        queries=[
            (f'"{one}" 2027 校园招聘',one),
            (f'"{one}" 2027 秋招',one),
            (f'"{one}" 应届 招聘 仿真 结构 土木',one),
        ]
    elif mode=="full":
        queries += [(f'"{x.get("name","")}" 2027 校园招聘 秋招',x.get("name")) for x in targets if x.get("name")]
    else:
        if targets:
            start=(TODAY.toordinal()*37)%len(targets)
            batch=(targets[start:]+targets[:start])[:40]
            queries += [(f'"{x.get("name","")}" 2027 校园招聘 秋招',x.get("name")) for x in batch if x.get("name")]
    seen=set(); out=[]
    for q,hint in queries:
        key=(q,hint or "")
        if key not in seen:
            seen.add(key);out.append((q,hint))
    return out

def discover_web() -> tuple[list[dict],dict]:
    key=os.getenv("BRAVE_SEARCH_API_KEY","").strip()
    queries=build_queries()
    found=[]
    stats={"queries":len(queries),"brave":0,"bing-rss":0,"duckduckgo":0,"errors":0}

    def accept(results, hint):
        accepted=[]
        for it in results:
            title=it.get("title","")
            url=it.get("url","")
            sn=it.get("snippet","")
            if not title or not url:
                continue
            blob=f"{title} {sn}"
            if not looks_recruiting(blob):
                continue
            if hint is None and not looks_relevant(blob):
                continue
            if hint is not None and not company_match(hint, blob+" "+url):
                continue
            d=domain(url)
            verified=any(d==od or d.endswith("."+od) for od in OFFICIAL_DOMAINS)
            provider=it.get("provider","web")
            stats[provider]=stats.get(provider,0)+1
            accepted.append({
                "title":title[:150],"url":url,"snippet":sn[:650],
                "company":hint or company_from(title,url),
                "companyHinted":bool(hint),
                "verified":verified,
                "discovery":"全网自动扫描",
                "provider":provider,
            })
        return accepted

    for i,(q,hint) in enumerate(queries,1):
        accepted=[]
        try:
            primary=search_brave(q,key) if key else search_bing_rss(q)
            accepted=accept(primary,hint)
        except Exception as e:
            stats["errors"]+=1
            print(f"[search-primary] {q!r}: {e}")

        # If the primary engine returned nothing useful, try DuckDuckGo HTML.
        if not accepted:
            try:
                accepted=accept(search_ddg(q),hint)
            except Exception as e:
                stats["errors"]+=1
                print(f"[search-ddg] {q!r}: {e}")

        found.extend(accepted)
        if i%25==0:
            print(f"[search] {i}/{len(queries)} queries; accepted={len(found)}")
        time.sleep(0.12 if key else 0.18)

    return found,stats

def enrich(item: dict) -> dict:
    title=item["title"];url=item["url"];snippet=item.get("snippet","")
    text=f"{title} {snippet}"
    d=domain(url)
    verified=bool(item.get("verified"))
    return {
        "id":stable_id(url,title),
        "company":item.get("company") or company_from(title,url),
        "unit":"自动发现",
        "title":title,
        "tracks":classify(text),
        "type":"自动发现",
        "location":"待核验",
        "degree":infer_degree(text),
        "majors":infer_majors(text),
        "headcount":"待核验",
        "openDate":str(TODAY),
        "deadline":parse_deadline(text),
        "updated":str(TODAY),
        "requirements":snippet or "自动扫描发现招聘信息，请点击原始来源核验岗位要求。",
        "process":"以原始招聘页面为准",
        "applyUrl":url,
        "sourceUrl":url,
        "source":("官方源自动发现" if verified else "全网自动发现")+(f" · {d}" if d else ""),
        "note":"自动发现条目；投递前请核验专业、学历、地点和截止时间。",
        "auto":True,
        "verified":verified,
        "discovery":item.get("discovery","自动发现"),
        "provider":item.get("provider","web"),
        "companyHinted":bool(item.get("companyHinted")),
        "lastSeen":NOW.isoformat(timespec="seconds"),
    }

def reasonable(job: dict) -> bool:
    text=f"{job.get('title','')} {job.get('requirements','')} {job.get('applyUrl','')}"
    bad=["培训班","课程","考研","公务员考试题","辅导班","简历模板","论文代写","加盟","高考志愿"]
    if any(x in text for x in bad):
        return False
    if job.get("companyHinted") and not company_match(job.get("company",""), text):
        return False
    return True

def dedupe_new(items: list[dict]) -> list[dict]:
    by={}
    for x in items:
        j=enrich(x)
        if not reasonable(j):
            continue
        key=(re.sub(r"[\W_]+","",j["title"]).lower(),domain(j["applyUrl"]))
        old=by.get(key)
        if old is None or (j["verified"] and not old["verified"]):
            by[key]=j
    return list(by.values())

def merge_history(new_jobs: list[dict]) -> tuple[list[dict],int]:
    existing=load_existing_jobs()
    by={}
    for j in existing:
        if not reasonable(j):
            continue
        # Drop jobs that clearly expired more than 45 days ago.
        dl=j.get("deadline")
        if dl:
            try:
                if (TODAY-datetime.fromisoformat(dl).date()).days>45:
                    continue
            except Exception:
                pass
        by[j.get("id") or stable_id(j.get("applyUrl",""),j.get("title",""))]=j
    before=len(by)
    for j in new_jobs:
        old=by.get(j["id"])
        if old:
            j["firstSeen"]=old.get("firstSeen",old.get("openDate",str(TODAY)))
        else:
            j["firstSeen"]=NOW.isoformat(timespec="seconds")
        by[j["id"]]=j
    vals=list(by.values())
    vals.sort(key=lambda j:(not bool(j.get("verified")),j.get("deadline") is None,j.get("company",""),j.get("title","")))
    return vals[:1000],max(0,len(by)-before)

def main():
    mode=(os.getenv("MANUAL_SCAN_MODE","") or "recent").strip().lower()
    company=os.getenv("MANUAL_COMPANY","").strip()
    official=discover_official()
    web,stats=discover_web()
    new_jobs=dedupe_new(official+web)
    jobs,added=merge_history(new_jobs)

    meta={
        "updated_at":NOW.isoformat(timespec="seconds"),
        "mode":mode,
        "company":company or None,
        "company_targets":len(load_company_targets()),
        "queries":stats.get("queries",0),
        "raw_results":len(official)+len(web),
        "new_candidates":len(new_jobs),
        "added":added,
        "total":len(jobs),
        "providers":{k:v for k,v in stats.items() if k!="queries"},
    }
    state={"updated_at":meta["updated_at"],"meta":meta,"seen":{j["id"]:{"url":j["applyUrl"],"title":j["title"],"lastSeen":j.get("lastSeen")} for j in jobs}}
    STATE.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding="utf-8")
    OUT.write_text(
        "window.AUTO_SCAN_META = "+json.dumps(meta,ensure_ascii=False,indent=2)+";\n"
        +"window.AUTO_JOB_DATA = "+json.dumps(jobs,ensure_ascii=False,indent=2)+";\n",
        encoding="utf-8",
    )
    print(json.dumps(meta,ensure_ascii=False))

if __name__=="__main__":
    main()
