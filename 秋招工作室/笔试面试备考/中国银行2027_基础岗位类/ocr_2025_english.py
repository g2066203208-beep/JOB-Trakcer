#!/usr/bin/env python3
"""OCR scans already committed to GitHub; preserve page provenance."""
import subprocess, pathlib
import fitz
ROOT=pathlib.Path("秋招工作室/笔试面试备考/中国银行2027_基础岗位类/历年试题资料/2025")
FILES=sorted(ROOT.glob("2025_便携扫描版_第*.pdf"))
assert len(FILES)==5, f"expected 5 volumes; got {len(FILES)}"
out=ROOT/"2025_英语原卷扫描识别_按页校对稿.md"
lines=["# 2025招聘笔试练习卷：前29页扫描识别","","> GitHub中的2025资料5册扫描版。OCR为机器识别，不是最终校对原题；选项及符号需要复核。",""]
cnt=0
for vol,file in enumerate(FILES,1):
    doc=fitz.open(file)
    for i in range(len(doc)):
        cnt+=1
        if cnt>29:break
        pix=doc[i].get_pixmap(matrix=fitz.Matrix(2,2),alpha=False)
        raw=pix.tobytes("png")
        x=subprocess.run(["tesseract","stdin","stdout","-l","eng","--psm","3"],input=raw,capture_output=True,timeout=90)
        body=x.stdout.decode("utf-8",errors="replace").strip()
        lines+=["",f"## 原PDF第{cnt}页 · 第{vol}册第{i+1}页","","---",body,"---"]
        print(f"page {cnt:02d}, chars {len(body)}",flush=True)
    if cnt>29:break
out.write_text("\n".join(lines)+"\n",encoding="utf-8")
print("CREATED",out,"size",out.stat().st_size)
