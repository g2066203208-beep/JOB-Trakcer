#!/usr/bin/env python3
from __future__ import annotations
import concurrent.futures, hashlib, html, json, os, re, urllib.parse, xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from pathlib import Path
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
COMPANIES=json.loads((ROOT/"data"/"companies.json").read_text(encoding="utf-8"))
OUT=ROOT/"data"/"question-source-backlog.json"
CN=timezone(timedelta(hours=8))
NOW=datetime.now(CN)
UA="Mozilla/5.0 (compatible; UniJobAI-QuestionSourceBot/1.0; +https://github.com/g2066203208-beep/JOB-Trakcer)"
HEADERS={"User-Agent":UA,"Accept-Language":"zh-CN,zh;q=0.9,en;q=0.4"}

GOOD=("面经","笔试","笔经","面试题","题库","真题","一面","二面","终面","群面","AI面试","校招")
BAD=("培训","付费","课程","代写","售卖","PDF下载","网盘","押题班")
PRIORITY_DOMAINS=("nowcoder.com","zhihu.com","juejin.cn","csdn.net","xiaohongshu.com")

def text(s): return re.sub(r"\s+"," ",html.unescape(s or "")).strip()
def domain(u):
    try:return urllib.parse.urlparse(u).netloc.lower()
    except:return ""
def load_existing():
    try:return json.loads(OUT.read_text(encoding="utf-8"))
    except:return {"updatedAt":None,"sources":[]}

def search_bing(q):
    r=requests.get("https://www.bing.com/search",headers=HEADERS,params={"q":q,"format":"rss","setlang":"zh-cn"},timeout=16)
    r.raise_for_status()
    root=ET.fromstring(r.text)
    out=[]
    for item in root.findall(".//item")[:15]:
        out.append({"title":text(item.findtext("title")),"url":text(item.findtext("link")),"snippet":text(BeautifulSoup(item.findtext("description") or "","html.parser").get_text(" ",strip=True))})
    return out

def search_ddg(q):
    r=requests.get("https://html.duckduckgo.com/html/",headers=HEADERS,params={"q":q},timeout=16)
    r.raise_for_status()
    soup=BeautifulSoup(r.text,"html.parser")
    out=[]
    for block in soup.select(".result")[:15]:
        a=block.select_one(".result__a")
        if not a:continue
        href=a.get("href","")
        p=urllib.parse.urlparse(href)
        if "duckduckgo.com" in p.netloc:
            vals=urllib.parse.parse_qs(p.query).get("uddg")
            if vals:href=urllib.parse.unquote(vals[0])
        sn=block.select_one(".result__snippet")
        out.append({"title":text(a.get_text(" ",strip=True)),"url":href,"snippet":text(sn.get_text(" ",strip=True) if sn else "")})
    return out

def valid(company,row):
    blob=f'{row.get("title","")} {row.get("snippet","")} {row.get("url","")}'
    if not any(x in blob for x in GOOD):return False
    if any(x in blob for x in BAD):return False
    core=re.sub(r"(中国|集团|股份有限公司|有限公司|科技|控股)","",company)
    return company in blob or (len(core)>=3 and core in blob)

def score(row):
    blob=f'{row["title"]} {row.get("snippet","")}'
    s=0
    if "2026" in blob or "2027" in blob:s+=6
    if "面经" in blob:s+=5
    if "笔试" in blob or "笔经" in blob:s+=4
    if "题库" in blob or "真题" in blob:s+=4
    if "一面" in blob or "二面" in blob:s+=2
    if any(d in domain(row["url"]) for d in PRIORITY_DOMAINS):s+=3
    return s

def companies_for_run():
    manual=os.getenv("MANUAL_COMPANY","").strip()
    if manual:return [manual]
    slot=(NOW.hour//4)%6
    chunk=85
    start=(slot*chunk)%len(COMPANIES)
    names=[c["name"] for c in COMPANIES]
    return (names[start:]+names[:start])[:chunk]

def query_company(company):
    queries=[
        f'"{company}" 面经 笔试 面试题 2026 2027',
        f'"{company}" 校招 面经 site:nowcoder.com',
        f'"{company}" 笔试 真题 题库 site:nowcoder.com',
    ]
    rows=[]
    for q in queries:
        got=[]
        try:got.extend(search_bing(q))
        except Exception as e:print("[bing]",company,e)
        if len(got)<3:
            try:got.extend(search_ddg(q))
            except Exception as e:print("[ddg]",company,e)
        for r in got:
            if valid(company,r):
                r["company"]=company
                r["score"]=score(r)
                rows.append(r)
    by={}
    for r in rows:
        u=r["url"].split("#")[0]
        if u not in by or r["score"]>by[u]["score"]:by[u]=r
    return sorted(by.values(),key=lambda x:(-x["score"],x["title"]))[:20]

def main():
    existing=load_existing()
    by={(x["company"],x["url"]):x for x in existing.get("sources",[])}
    targets=companies_for_run()
    found=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        futs={ex.submit(query_company,c):c for c in targets}
        for fut in concurrent.futures.as_completed(futs):
            c=futs[fut]
            try:
                rows=fut.result()
                found.extend(rows)
                print(c,len(rows))
            except Exception as e: print("[company]",c,e)
    for r in found:
        key=(r["company"],r["url"])
        old=by.get(key,{})
        by[key]={
          "id":"qs-"+hashlib.sha1((r["company"]+"|"+r["url"]).encode()).hexdigest()[:14],
          "company":r["company"],"title":r["title"],"url":r["url"],
          "snippet":r.get("snippet","")[:600],"domain":domain(r["url"]),
          "score":r["score"],"status":old.get("status","candidate"),
          "firstSeen":old.get("firstSeen",NOW.isoformat(timespec="seconds")),
          "lastSeen":NOW.isoformat(timespec="seconds")
        }
    vals=sorted(by.values(),key=lambda x:(x["company"],-x.get("score",0),x["title"]))
    payload={"updatedAt":NOW.isoformat(timespec="seconds"),"scannedCompanies":targets,"newCandidates":len(found),"sourceCount":len(vals),"sources":vals[:8000]}
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"targets":len(targets),"newCandidates":len(found),"totalSources":len(vals)},ensure_ascii=False))

if __name__=="__main__":
    main()
