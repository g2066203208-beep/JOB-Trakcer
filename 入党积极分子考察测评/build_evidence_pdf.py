#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""合并私有仓库内已经归档的积极分子测评证明原件，不改动原件内容。"""
import hashlib
import io
import os
import pathlib
import subprocess
import tempfile
import zipfile
from collections import defaultdict
from datetime import datetime

from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen.canvas import Canvas

BASE = pathlib.Path("入党积极分子考察测评")
OUTDIR = BASE / "06-证明汇编"
OUTPDF = OUTDIR / "积极分子考察测评证明材料汇编_37.5分.pdf"
MANIFEST = OUTDIR / "文件清单与核验说明.md"
SECTIONS = [
    "01 任职与在琼培养",
    "02 学术成果",
    "03 大型活动参与",
    "04 文体竞赛活动",
    "05 综合素质荣誉",
    "06 志愿服务",
]
pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))

def fix_name(s):
    try:
        if any("\u4e00" <= x <= "\u9fff" for x in s):
            return s
    except Exception:
        pass
    try:
        b = s.encode("cp437")
        for enc in ("utf-8", "gbk"):
            try:
                candidate = b.decode(enc)
                if any("\u4e00" <= x <= "\u9fff" for x in candidate):
                    return candidate
            except Exception:
                pass
    except Exception:
        pass
    return s

def page_of_text(title, lines):
    b = io.BytesIO()
    c = Canvas(b, pagesize=A4)
    w,h = A4
    c.setFont("STSong-Light", 19)
    c.drawString(44, h-64, title[:29])
    c.line(44, h-78, w-44, h-78)
    c.setFont("STSong-Light", 10.5)
    y = h-110
    for line in lines:
        s=str(line)
        # Wrap by Chinese-character count, keeping enough width.
        while s:
            piece, s=s[:64], s[64:]
            c.drawString(46, y, piece)
            y-=18
            if y < 54:
                c.showPage()
                c.setFont("STSong-Light", 10.5)
                y=h-60
        if not line:
            y-=8
    c.save()
    b.seek(0)
    return PdfReader(b).pages

def identify(group, name):
    t=name.lower()
    # 用实际材料的性质分类：班级“文体委员”是任职，不是文体竞赛。
    if any(k in t for k in ("任职", "文体委员", "在琼", "班干部", "班级干部", "学校证明")):
        return SECTIONS[0]
    if any(k in t for k in ("专利", "知识产权", "发明", "著作权")):
        return SECTIONS[1]
    if any(k in t for k in ("通报", "表扬", "优秀共青团员", "荣誉", "优秀团员", "奖状")):
        return SECTIONS[4]
    # 志愿证书出现“歌手大赛”“运动会”等字样，仍属于志愿服务。
    if ("新增志愿证书与截图" in group or "志愿" in t) and any(
        k in t for k in ("小时", "志愿", "服务", "运动会", "歌手", "飞盘", "研学谷", "自行车", "艺术节")
    ):
        return SECTIONS[5]
    if any(k in t for k in ("歌手", "合唱", "拔河", "文体", "运动会", "文明寝室", "唱响", "篮球", "排球", "比赛")):
        return SECTIONS[3]
    if "学校证明合集" in group:
        return SECTIONS[0]
    if any(k in t for k in ("志愿", "服务", "公益", "科普", "送餐", "理事会")):
        return SECTIONS[5]
    if any(k in t for k in ("活动", "讲座", "签到", "参与", "记录")):
        return SECTIONS[2]
    if "志愿" in group:
        return SECTIONS[5]
    return SECTIONS[2]

def collect():
    collected = []
    source_labels = []
    # ZIPs: encrypted/private repository, source originals as preserved by previous upload
    zip_paths = [
        BASE/"02-任职与在琼证明"/"学校证明合集.zip",
        BASE/"03-志愿服务"/"新增志愿证书与截图.zip",
    ]
    arch = BASE/"04-历史原件"
    chunks = sorted(arch.glob("志愿服务_原始上传包.zip.part*"))
    if chunks:
        zip_paths.append(("志愿服务_原始上传包.zip", b"".join(p.read_bytes() for p in chunks)))
    for z in zip_paths:
        if isinstance(z, tuple):
            label,data = z
        else:
            if not z.is_file():
                source_labels.append("找不到原始压缩包："+str(z))
                continue
            label,data = z.name,z.read_bytes()
        source_labels.append(label+"（"+str(len(data))+"字节）")
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as f:
                for info in f.infolist():
                    if info.is_dir() or info.file_size == 0:
                        continue
                    name=fix_name(info.filename)
                    ext=pathlib.Path(name).suffix.lower()
                    if ext not in (".pdf",".png",".jpg",".jpeg",".webp",".bmp",".tif",".tiff",".gif",".docx",".doc"):
                        continue
                    try:
                        raw=f.read(info)
                    except Exception as e:
                        source_labels.append("无法读取："+name+" "+str(e))
                        continue
                    collected.append((label,name,raw))
        except Exception as e:
            source_labels.append("解压失败："+label+" "+str(e))
    singing_parts=sorted((BASE/"05-文体获奖").glob("2025校园歌手比赛证明.pdf.part*"))
    if singing_parts:
        raw=b"".join(p.read_bytes() for p in singing_parts)
        collected.append(("2025校园歌手比赛证明.pdf（分段合并）","2025校园歌手比赛证明.pdf",raw))
        source_labels.append("2025校园歌手比赛证明.pdf（分段合并，"+str(len(raw))+"字节）")
    # Typhoon PDF path was previously a very short placeholder, not a valid scanned proof.
    bad = BASE/"证明材料"/"2025年抗击台风“蝴蝶”工作通报表扬.pdf"
    if bad.exists() and bad.stat().st_size < 100:
        source_labels.append("台风通报表扬原件：仓库中是 "+str(bad.stat().st_size)+" 字节占位文件，无法作为原件并入")
    return collected,source_labels

def into_pdf(name,raw):
    suffix=pathlib.Path(name).suffix.lower()
    if suffix==".pdf":
        if not raw.startswith(b"%PDF-"):
            raise ValueError("文件没有有效PDF文件头")
        return list(PdfReader(io.BytesIO(raw),strict=False).pages)
    if suffix in (".doc",".docx"):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/("source"+suffix)
            p.write_bytes(raw)
            r=subprocess.run(["libreoffice","-env:UserInstallation=file:///tmp/lo_cert_assemble","--headless","--convert-to","pdf","--outdir",d,str(p)],capture_output=True,timeout=80)
            result=pathlib.Path(d)/"source.pdf"
            if not result.exists():
                raise ValueError("Office文档转换失败："+r.stderr.decode(errors="ignore")[:180])
            return list(PdfReader(str(result),strict=False).pages)
    with Image.open(io.BytesIO(raw)) as image:
        frame=ImageOps.exif_transpose(image.convert("RGB"))
        # Preserve legibility, not distort scan's aspect ratio.
        w,h=frame.size
        max_pixels=18_000_000
        if w*h>max_pixels:
            fac=(max_pixels/(w*h))**0.5
            frame=frame.resize((max(1,int(w*fac)),max(1,int(h*fac))))
        b=io.BytesIO()
        frame.save(b,format="PDF",resolution=120.0)
        b.seek(0)
        return list(PdfReader(b).pages)

def main():
    OUTDIR.mkdir(parents=True,exist_ok=True)
    items,sources=collect()
    unique={}
    same=[]
    for group,name,raw in items:
        digest=hashlib.sha256(raw).hexdigest()
        if digest in unique:
            same.append(name+"  （与 "+unique[digest][1]+" 内容相同，去重）")
            continue
        unique[digest]=(group,name,raw)
    sections=defaultdict(list)
    for digest,(group,name,raw) in unique.items():
        sections[identify(group,name)].append((name,group,raw,digest))
    for s in sections:
        sections[s].sort(key=lambda a:(a[1],a[0]))
    writer=PdfWriter()
    cover_lines=[
        "申报人：梁羽   |   考察测评：积极分子",
        "申报参考分数：37.5分（任职3、学术1、大型活动10、文体6.5、综合4、志愿13）",
        "本件按六个类别汇集仓库中能够实际读取的证明材料。",
        "证明扫描件或截图保留其原有页面，不重制奖状或改造签章。",
        "相同内容去重；材料是否符合评分办法，以党组织审核为准。",
        "提示：此件可能含有他人信息，仅作申请与内部审核，不公开传播。",
        "",
        "汇编目录："
    ] + [s+" — "+str(len(sections[s]))+"个原始文件" for s in SECTIONS]
    writer.append_pages_from_reader(PdfReader(io.BytesIO(_pdfbytes("积极分子考察测评 — 证明材料汇编",cover_lines))))
    manifest=[
        "# 积极分子考察测评证明材料汇编 — 核验清单",
        "",
        "生成时间： "+datetime.now().strftime("%Y-%m-%d %H:%M"),
        "**注意：仅已读取的真实原始材料被合并；申报37.5分不代表党组织已经审核确认。**",
        "资料仅保存在用户私有仓库，禁止公开分享。",
        "",
        "## 来源压缩包"
    ]+["- "+v for v in sources]+["","## 合并明细"]
    ok=0;fail=[]
    for sec in SECTIONS:
        group=sections.get(sec,[])
        manifest.append("\n### "+sec+"（"+str(len(group))+"个文件）")
        writer.append_pages_from_reader(PdfReader(io.BytesIO(_pdfbytes(sec,["本节含原件 "+str(len(group))+" 份。","原件顺序见 PDF 后续页及同目录文件清单。"]))))
        writer.add_outline_item(sec,len(writer.pages)-1)
        for name,src,raw,digest in group:
            try:
                pages=into_pdf(name,raw)
                if not pages: raise ValueError("文档没有可读取的页面")
                writer.append_pages_from_reader(PdfReader(io.BytesIO(_pdfbytes("证明原件",["类别："+sec,"文件："+name,"来源："+src,"SHA-256："+digest[:24]+"…","随后为该证明原件的完整页面；不代表已获审核通过。"]))))
                for p in pages:writer.add_page(p)
                manifest.append("- "+name+" | 来源："+src+" | "+str(len(pages))+"页 | SHA256："+digest)
                ok+=1
            except Exception as e:
                fail.append(name+" | 来源："+src+" | "+str(e))
                manifest.append("- **未能合并**："+name+" | "+str(e))
    note_lines=[
        "已合并原件文件数："+str(ok),
        "重复内容去重："+str(len(same)),
        "读取失败文件数："+str(len(fail)),
        "",
        "资料缺失提醒：当前仓库中的“台风蝴蝶”通报PDF为占位文件，",
        "如其原件未包含在其他压缩包中，则本汇编不含该通报原件。",
        "学术成果、优秀共青团员等如在以上档案中无原件，也尚不能代替原件。",
        "请根据后附清单判断是否需要补充扫描证明。",
        "",
        "本汇编用于材料打包，不自动认定任何分数。"
    ]
    writer.append_pages_from_reader(PdfReader(io.BytesIO(_pdfbytes("核验与补充说明",note_lines))))
    writer.add_metadata({"/Title":"积极分子考察测评证明材料汇编（37.5分申报版）","/Author":"材料归档整理"})
    with OUTPDF.open("wb") as f:writer.write(f)
    manifest.extend(["","## 去重材料"]+["- "+x for x in same]+["","## 无法合并的文件"]+["- "+x for x in fail])
    manifest.extend(["","## PDF 信息","- PDF："+OUTPDF.name,"- 页面数："+str(len(writer.pages)),"- 已合并原始证明："+str(ok)])
    MANIFEST.write_text("\n".join(manifest)+"\n",encoding="utf-8")
    print("OUTPUT",OUTPDF,"bytes",OUTPDF.stat().st_size,"pages",len(writer.pages),"proofs",ok,"failures",len(fail))

def _pdfbytes(title,lines):
    # reportlab's built-in CJK CID font avoids dependence on system-wide Chinese fonts.
    b=io.BytesIO(); c=Canvas(b,pagesize=A4)
    width,height=A4
    c.setTitle(title)
    c.setFont("STSong-Light",18)
    c.drawString(38,height-55,title[:31])
    c.line(38,height-68,width-38,height-68)
    y=height-92
    c.setFont("STSong-Light",10)
    for line in lines:
        ss=str(line)
        if not ss: y-=11; continue
        while ss:
            part,ss=ss[:68],ss[68:]
            c.drawString(42,y,part)
            y-=19
            if y<50:
                c.showPage();c.setFont("STSong-Light",10);y=height-55
    c.save()
    return b.getvalue()
if __name__=="__main__":
    main()
