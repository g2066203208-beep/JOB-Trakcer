#!/usr/bin/env python3
from __future__ import annotations
import json, os, re, time, hashlib, html, urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / "crawler" / "sources.json").read_text(encoding="utf-8"))
OUT = ROOT / "auto-jobs-data.js"
STATE = ROOT / "crawler" / "state.json"

UA = "JobTrackerCN/1.0 (+https://github.com/g2066203208-beep/JOB-Trakcer; recruitment aggregation)"
HEADERS = {"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.4"}
CN_TZ = timezone(timedelta(hours=8))
TODAY = datetime.now(CN_TZ).date()

def load_company_targets():
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

def norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip()

def stable_id(url: str, title: str) -> str:
    h = hashlib.sha1((url.strip().lower()+"|"+title.strip().lower()).encode("utf-8")).hexdigest()[:14]
    return "auto-" + h

def domain(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.lower()
    except Exception:
        return ""

OFFICIAL_DOMAINS = {x["domain"].lower(): x["company"] for x in CFG["official_sources"]}

def company_from(title: str, url: str) -> str:
    d = domain(url)
    for od, company in OFFICIAL_DOMAINS.items():
        if d == od or d.endswith("." + od):
            return company
    t = re.sub(r"[\[\]【】]", "", title)
    parts = re.split(r"[-_|｜—–·:：]", t)
    lead = norm_space(parts[0]) if parts else ""
    if 2 <= len(lead) <= 24:
        return lead
    return d or "自动发现"

TRACK_RULES = [
    ("土木直投", ["土木","结构","岩土","桥梁","隧道","道路","市政","水利","建筑工程"]),
    ("设计院", ["设计院","勘察设计","规划设计","工程设计"]),
    ("工程管理", ["工程管理","项目管理","造价","商务管理","工程经济"]),
    ("施工/项目", ["施工","项目部","项目技术","现场工程"]),
    ("智能建造", ["智能建造","BIM","数字建造","数字化工程"]),
    ("能源央企", ["国家能源","华能","华电","大唐","国家电投","中广核","中核","三峡"]),
    ("风电/新能源", ["风电","风机","新能源","光伏","储能","氢能"]),
    ("CAE/仿真", ["CAE","仿真","有限元","Abaqus","ANSYS","LS-DYNA","NVH","疲劳"]),
    ("转汽车/机械", ["汽车","整车","机械","车辆","底盘","NVH","制造"]),
]

def classify(text: str) -> list[str]:
    low = text.lower()
    tracks = []
    for label, keys in TRACK_RULES:
        if any(k.lower() in low for k in keys):
            tracks.append(label)
    if not tracks:
        tracks.append("其他可投")
    return tracks[:4]

def parse_deadline(text: str) -> str | None:
    text = norm_space(text)
    patterns = [
        r"(20\d{2})[年\-/\.](\d{1,2})[月\-/\.](\d{1,2})[日号]?",
        r"截止(?:至|到|时间[:：为是]?)?\s*(20\d{2})[年\-/\.](\d{1,2})[月\-/\.](\d{1,2})[日号]?",
        r"截止(?:至|到|时间[:：为是]?)?\s*(\d{1,2})月(\d{1,2})日",
        r"(\d{1,2})月(\d{1,2})日(?:\s*\d{1,2}[:：]\d{2})?\s*(?:截止|前)",
    ]
    for i,p in enumerate(patterns):
        m = re.search(p, text)
        if not m: 
            continue
        try:
            if len(m.groups()) == 3:
                y,mo,da = map(int,m.groups())
            else:
                mo,da = map(int,m.groups())
                y = TODAY.year
                dt = datetime(y,mo,da).date()
                if dt < TODAY - timedelta(days=60):
                    y += 1
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
    keys = ["土木工程","结构工程","岩土工程","工程管理","力学","机械","车辆工程","能源动力","电气","自动化","计算机","材料","海洋工程","水利水电","建筑学"]
    vals=[k for k in keys if k in text]
    return "、".join(vals[:6]) if vals else "待核验"

def fetch_text(url: str, timeout=15) -> str:
    r = requests.get(url, headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    ct = r.headers.get("content-type","")
    if "text" not in ct and "html" not in ct and "json" not in ct:
        return ""
    r.encoding = r.apparent_encoding or r.encoding
    return r.text

def discover_official() -> list[dict]:
    found=[]
    include = CFG["include_keywords"]
    role_keys = CFG["role_keywords"]
    for src in CFG["official_sources"]:
        try:
            body=fetch_text(src["url"])
            soup=BeautifulSoup(body,"html.parser")
            page_text=norm_space(soup.get_text(" ",strip=True))
            for a in soup.find_all("a", href=True):
                txt=norm_space(a.get_text(" ",strip=True))
                href=urllib.parse.urljoin(src["url"],a["href"])
                blob=f"{txt} {href}"
                if len(txt)<4: 
                    continue
                if not any(k in blob for k in include):
                    continue
                if not any(k.lower() in blob.lower() for k in role_keys):
                    continue
                context=txt
                found.append({
                    "title":txt[:120],
                    "url":href,
                    "snippet":context[:400],
                    "company":src["company"],
                    "verified":True,
                    "discovery":"官方招聘页自动发现",
                })
        except Exception as e:
            print(f"[official] {src['company']} failed: {e}")
        time.sleep(0.4)
    return found

def discover_brave() -> list[dict]:
    key=os.getenv("BRAVE_SEARCH_API_KEY","").strip()
    manual_company=os.getenv("MANUAL_COMPANY","").strip()
    mode=(os.getenv("MANUAL_SCAN_MODE","") or "recent").strip().lower()
    if not key:
        print("[search] BRAVE_SEARCH_API_KEY not set; skipping full-web discovery.")
        return []
    endpoint="https://api.search.brave.com/res/v1/web/search"
    out=[]
    queries=list(CFG["search_queries"])
    targets=load_company_targets()
    if manual_company:
        queries=[f"{manual_company} 2027 校园招聘", f"{manual_company} 2027 秋招", f"{manual_company} 招聘 应届 仿真 土木 结构"]
    elif mode=="full":
        queries += [f"{x.get('name','')} 2027 校园招聘" for x in targets if x.get('name')]
    else:
        # Daily scan rotates through a manageable batch of companies.
        if targets:
            start=(TODAY.toordinal()*23) % len(targets)
            batch=(targets[start:]+targets[:start])[:32]
            queries += [f"{x.get('name','')} 2027 校园招聘" for x in batch if x.get('name')]
    # Deduplicate while preserving order.
    queries=list(dict.fromkeys(queries))
    for q in queries:
        try:
            r=requests.get(endpoint,headers={
                "Accept":"application/json",
                "X-Subscription-Token":key,
                "User-Agent":UA,
            },params={
                "q":q,
                "count":20,
                "country":"CN",
                "search_lang":"zh-hans",
                "ui_lang":"zh-CN",
                "freshness":"pm",
                "safesearch":"moderate",
            },timeout=20)
            r.raise_for_status()
            data=r.json()
            for item in (data.get("web",{}) or {}).get("results",[]) or []:
                title=norm_space(item.get("title",""))
                url=item.get("url","")
                desc=norm_space(item.get("description",""))
                blob=f"{title} {desc}"
                if not url or not title:
                    continue
                if not any(k in blob for k in CFG["include_keywords"]):
                    continue
                if not any(k.lower() in blob.lower() for k in CFG["role_keywords"]):
                    continue
                d=domain(url)
                verified=any(d==od or d.endswith("."+od) for od in OFFICIAL_DOMAINS)
                out.append({
                    "title":title[:140],"url":url,"snippet":desc[:550],
                    "company":company_from(title,url),
                    "verified":verified,
                    "discovery":"全网搜索自动发现",
                })
        except Exception as e:
            print(f"[search] query failed {q!r}: {e}")
        time.sleep(0.25)
    return out

def enrich(item: dict) -> dict:
    title=item["title"]; url=item["url"]; snippet=item.get("snippet","")
    text=f"{title} {snippet}"
    deadline=parse_deadline(text)
    d=domain(url)
    verified=bool(item.get("verified"))
    company=item.get("company") or company_from(title,url)
    source_label = ("官方源自动发现" if verified else "全网自动发现") + (f" · {d}" if d else "")
    tracks=classify(text)
    if "自动发现" not in tracks:
        tracks.append("自动发现")
    return {
        "id":stable_id(url,title),
        "company":company,
        "unit":"自动发现",
        "title":title,
        "tracks":tracks[:5],
        "type":"自动发现",
        "location":"待核验",
        "degree":infer_degree(text),
        "majors":infer_majors(text),
        "headcount":"待核验",
        "openDate":str(TODAY),
        "deadline":deadline,
        "updated":str(TODAY),
        "requirements":snippet or "自动抓取到新的招聘信息，请点击来源核验岗位要求。",
        "process":"以原始招聘页面为准",
        "applyUrl":url,
        "sourceUrl":url,
        "source":source_label,
        "note":"自动发现条目；投递前请以原始页面核验专业、学历、地点和截止时间。",
        "auto":True,
        "verified":verified,
        "discovery":item.get("discovery","自动发现"),
    }

def is_reasonable(job: dict) -> bool:
    t=f"{job['title']} {job['requirements']}"
    # Ignore obvious training, course ads and unrelated result pages.
    bad=["培训班","课程","考研","公务员考试题","辅导班","简历模板","论文代写","加盟"]
    if any(x in t for x in bad): return False
    return True

def dedupe(items: list[dict]) -> list[dict]:
    by={}
    for x in items:
        j=enrich(x)
        if not is_reasonable(j): continue
        key=(re.sub(r"[\W_]+","",j["title"]).lower(), domain(j["applyUrl"]))
        old=by.get(key)
        if old is None or (j["verified"] and not old["verified"]):
            by[key]=j
    vals=list(by.values())
    # Prefer official, deadline known, then newest.
    vals.sort(key=lambda j:(not j["verified"], j["deadline"] is None, j["company"], j["title"]))
    return vals[:500]

def load_state():
    if not STATE.exists(): return {}
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception: return {}

def main():
    raw=discover_official()+discover_brave()
    jobs=dedupe(raw)
    # Keep last-seen metadata for audit/debugging.
    state=load_state()
    now=datetime.now(CN_TZ).isoformat(timespec="seconds")
    seen={}
    for j in jobs:
        old=(state.get("seen",{}) or {}).get(j["id"],{})
        seen[j["id"]]={"first_seen":old.get("first_seen",now),"last_seen":now,"url":j["applyUrl"],"title":j["title"]}
    STATE.write_text(json.dumps({"updated_at":now,"count":len(jobs),"seen":seen},ensure_ascii=False,indent=2),encoding="utf-8")
    OUT.write_text("window.AUTO_JOB_DATA = "+json.dumps(jobs,ensure_ascii=False,indent=2)+";\n",encoding="utf-8")
    print(f"Wrote {len(jobs)} auto-discovered jobs.")

if __name__=="__main__":
    main()
