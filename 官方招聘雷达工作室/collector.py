#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
官方招聘雷达：
1. 校验 companies.csv 中已知招聘入口
2. 从企业官网抓取招聘/人才相关链接
3. 对缺少招聘入口的企业使用 DDGS 搜索候选
4. 只有同官方主域名或企业官网直接反链的入口才自动升级为官方
5. 搜索结果仅进入 pending，不直接冒充官网
"""
from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

try:
    import tldextract
except Exception:
    tldextract = None

try:
    from ddgs import DDGS
except Exception:
    DDGS = None

ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / "companies.csv"
GEN = ROOT / "generated"
SITES_PATH = GEN / "sites.json"
PENDING_PATH = GEN / "pending.json"
STATUS_PATH = ROOT / "STATUS.md"

UA = "Mozilla/5.0 (compatible; OfficialRecruitmentRadar/1.0; +https://github.com/g2066203208-beep/JOB-Trakcer)"
TIMEOUT = 14
KEYWORDS = (
    "招聘", "校园招聘", "人才招聘", "诚聘英才", "加入我们",
    "career", "careers", "recruit", "recruitment", "job", "jobs",
    "campus", "zhaopin", "talent", "join-us", "joinus"
)
NOISE_DOMAINS = {
    "fenbi.com", "nowcoder.com", "zhihu.com", "weixin.qq.com",
    "gaoxiaojob.com", "shixiseng.com", "bosszhipin.com"
}

session = requests.Session()
session.headers.update({
    "User-Agent": UA,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5"
})


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def root_domain(url):
    try:
        host = (urlparse(url).hostname or "").lower().strip(".")
        if not host:
            return ""
        if tldextract:
            ext = tldextract.extract(host)
            if ext.domain and ext.suffix:
                return f"{ext.domain}.{ext.suffix}".lower()
        parts = host.split(".")
        if len(parts) >= 3 and parts[-1] == "cn" and parts[-2] in {"com", "net", "org", "gov", "edu"}:
            return ".".join(parts[-3:])
        return ".".join(parts[-2:]) if len(parts) >= 2 else host
    except Exception:
        return ""


def url_okish(url):
    try:
        p = urlparse(url)
        return p.scheme in {"http", "https"} and bool(p.netloc)
    except Exception:
        return False


def is_recruitment_signal(text):
    t = (text or "").lower()
    return any(k.lower() in t for k in KEYWORDS)


def clean_url(url):
    return (url or "").strip().replace(" ", "%20")


def page_probe(url):
    if not url_okish(url):
        return {
            "status": None, "final_url": url, "title": "",
            "sha256": "", "error": "invalid-url"
        }
    try:
        r = session.get(url, timeout=TIMEOUT, allow_redirects=True)
        body = r.text[:800000]
        soup = BeautifulSoup(body, "html.parser")
        title = soup.title.get_text(" ", strip=True) if soup.title else ""
        normalized = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))[:200000]
        digest = hashlib.sha256(normalized.encode("utf-8", "ignore")).hexdigest()
        return {
            "status": r.status_code,
            "final_url": r.url,
            "title": title[:240],
            "sha256": digest,
            "error": ""
        }
    except Exception as e:
        return {
            "status": None, "final_url": url, "title": "",
            "sha256": "", "error": type(e).__name__
        }


def links_from_official_home(home):
    if not url_okish(home):
        return []
    out = []
    try:
        r = session.get(home, timeout=TIMEOUT, allow_redirects=True)
        soup = BeautifulSoup(r.text, "html.parser")
        seen = set()
        for a in soup.find_all("a", href=True):
            href = urljoin(r.url, a.get("href", "").strip())
            label = a.get_text(" ", strip=True)
            clue = f"{label} {href}"
            if href in seen or not url_okish(href) or not is_recruitment_signal(clue):
                continue
            seen.add(href)
            out.append({
                "url": href,
                "label": label[:120],
                "source": r.url
            })
    except Exception:
        pass
    return out[:30]


def search_candidates(company, max_results=8):
    if DDGS is None or os.getenv("RADAR_SEARCH", "1") == "0":
        return []
    q = f"{company} 官方 招聘 校园招聘 人才招聘"
    items = []
    try:
        with DDGS() as ddgs:
            for x in ddgs.text(q, max_results=max_results, region="cn-zh"):
                url = clean_url(x.get("href") or x.get("url") or "")
                if not url_okish(url):
                    continue
                rd = root_domain(url)
                if rd in NOISE_DOMAINS:
                    continue
                clue = f"{x.get('title', '')} {x.get('body', '')} {url}"
                if not is_recruitment_signal(clue):
                    continue
                items.append({
                    "url": url,
                    "title": (x.get("title") or "")[:200],
                    "snippet": (x.get("body") or "")[:360],
                    "source": "web-search"
                })
    except Exception:
        return []
    return items


def load_previous():
    try:
        return json.loads(SITES_PATH.read_text("utf-8"))
    except Exception:
        return {"sites": []}


def previous_hashes(prev):
    ans = {}
    for x in prev.get("sites", []):
        key = (x.get("company", ""), x.get("recruitment_url", ""))
        ans[key] = x.get("sha256", "")
    return ans


def main():
    GEN.mkdir(parents=True, exist_ok=True)
    prev = load_previous()
    old_hash = previous_hashes(prev)

    with CSV_PATH.open(encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    verified_sites = []
    pending = []
    checked = now_iso()

    for row in rows:
        company = row["company"].strip()
        category = row.get("category", "").strip()
        priority = row.get("priority", "").strip()
        home = clean_url(row.get("official_home", ""))
        seeded_career = clean_url(row.get("career_url", ""))
        seeded_ver = row.get("career_verification", "").strip() or "verified_seed"
        focus = row.get("focus", "").strip()
        notes = row.get("notes", "").strip()

        company_sites = []
        seen = set()

        # 1) 已人工确认的招聘入口
        if seeded_career:
            company_sites.append((seeded_career, seeded_ver, "companies.csv"))
            seen.add(seeded_career)

        # 2) 从企业官网直接发现招聘链接
        home_links = links_from_official_home(home)
        hroot = root_domain(home)
        for item in home_links:
            u = clean_url(item["url"])
            if u in seen:
                continue
            uroot = root_domain(u)
            verification = "official-domain" if hroot and uroot == hroot else "official-linked"
            company_sites.append((u, verification, f"official-home:{item['source']}"))
            seen.add(u)

        # 3) 搜索。只有与企业官网同主域名才自动确认；其他一律pending
        need_search = not company_sites or os.getenv("RADAR_FULL_DISCOVERY", "0") == "1"
        if need_search:
            for item in search_candidates(company):
                u = item["url"]
                if u in seen:
                    continue
                uroot = root_domain(u)
                if hroot and uroot == hroot:
                    company_sites.append((u, "official-domain", "search+domain-match"))
                    seen.add(u)
                else:
                    pending.append({
                        "company": company,
                        "category": category,
                        "priority": priority,
                        "official_home": home,
                        "candidate_url": u,
                        "candidate_root_domain": uroot,
                        "title": item.get("title", ""),
                        "snippet": item.get("snippet", ""),
                        "reason": "搜索发现但尚无官方域名/官网反链证据",
                        "discovered_at": checked
                    })

        # 4) 探测已确认入口
        for u, verification, source in company_sites:
            probe = page_probe(u)
            key = (company, u)
            old = old_hash.get(key, "")
            changed = bool(old and probe["sha256"] and old != probe["sha256"])
            verified_sites.append({
                "company": company,
                "category": category,
                "priority": priority,
                "focus": focus,
                "official_home": home,
                "recruitment_url": u,
                "verification": verification,
                "evidence_source": source,
                "http_status": probe["status"],
                "final_url": probe["final_url"],
                "title": probe["title"],
                "sha256": probe["sha256"],
                "changed_since_last_scan": changed,
                "last_checked": checked,
                "notes": notes,
                "error": probe["error"]
            })
            time.sleep(0.15)

        if need_search:
            time.sleep(0.5)

    # 去重并排序
    uniq = {}
    for x in verified_sites:
        uniq[(x["company"], x["recruitment_url"])] = x
    priority_rank = {"A": 0, "B": 1, "C": 2}
    verified_sites = sorted(
        uniq.values(),
        key=lambda x: (
            priority_rank.get(x["priority"], 9),
            x["company"],
            x["recruitment_url"]
        )
    )

    puniq = {}
    for x in pending:
        puniq[(x["company"], x["candidate_url"])] = x
    pending = sorted(
        puniq.values(),
        key=lambda x: (
            priority_rank.get(x["priority"], 9),
            x["company"],
            x["candidate_url"]
        )
    )

    ok_count = sum(
        1 for x in verified_sites
        if isinstance(x["http_status"], int) and x["http_status"] < 400
    )
    changed_count = sum(
        1 for x in verified_sites if x["changed_since_last_scan"]
    )

    sites_payload = {
        "generated_at": checked,
        "company_count": len(rows),
        "site_count": len(verified_sites),
        "reachable_count": ok_count,
        "changed_count": changed_count,
        "sites": verified_sites
    }
    pending_payload = {
        "generated_at": checked,
        "candidate_count": len(pending),
        "candidates": pending
    }

    SITES_PATH.write_text(
        json.dumps(sites_payload, ensure_ascii=False, indent=2),
        "utf-8"
    )
    PENDING_PATH.write_text(
        json.dumps(pending_payload, ensure_ascii=False, indent=2),
        "utf-8"
    )

    lines = [
        "# 官方招聘雷达状态",
        "",
        f"- 扫描时间（UTC）：{checked}",
        f"- 公司种子：**{len(rows)}**",
        f"- 已确认/种子招聘入口：**{len(verified_sites)}**",
        f"- 当前可访问（HTTP < 400）：**{ok_count}**",
        f"- 本轮页面变化：**{changed_count}**",
        f"- 待核验候选：**{len(pending)}**",
        "",
        "## 已确认入口",
        "",
        "| 企业 | 招聘入口 | 验证级别 | HTTP | 页面变化 |",
        "|---|---|---|---:|---|"
    ]

    for x in verified_sites:
        http_value = x["http_status"] if x["http_status"] is not None else "ERR"
        changed_text = "⚠️ 有变化" if x["changed_since_last_scan"] else ""
        lines.append(
            f"| {x['company']} | {x['recruitment_url']} | "
            f"{x['verification']} | {http_value} | {changed_text} |"
        )

    lines += [
        "",
        "## 规则",
        "",
        "- official-domain：与企业官网同注册主域名。",
        "- official-linked：由企业官网直接链接到跨域招聘/ATS入口。",
        "- verified_seed：已通过官方公告或人工核查确认，持续自动巡检。",
        "- pending：只由搜索发现，未形成官方证据链，不得直接作为正式投递入口。",
        ""
    ]
    STATUS_PATH.write_text("\n".join(lines), "utf-8")


if __name__ == "__main__":
    main()
