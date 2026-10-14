#!/usr/bin/env python3
import fitz, subprocess, os, re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

base=Path("秋招工作室/笔试面试备考/中国银行2027_基础岗位类")
root=base/"历年试题资料/2025"
studio=base/"2025双卷语音授课工作室"
volumes=sorted(root.glob("2025_便携扫描版_第??册.pdf"))
assert len(volumes)==5
pages=[]
for vol in volumes:
 doc=fitz.open(vol)
 pages.extend([(str(vol),i) for i in range(len(doc))])
assert len(pages)==48
def readpage(num):
 vol,i=pages[num-1]
 doc=fitz.open(vol)
 pix=doc[i].get_pixmap(matrix=fitz.Matrix(2.8,2.8),alpha=False)
 env=dict(os.environ,OMP_THREAD_LIMIT="1")
 p=subprocess.run(["tesseract","stdin","stdout","-l","chi_sim+eng","--psm","3"],input=pix.tobytes("png"),capture_output=True,timeout=120,env=env)
 if p.returncode:raise RuntimeError(str(p.stderr[:100]))
 return num,p.stdout.decode("utf8",errors="replace")
with ThreadPoolExecutor(max_workers=4) as pool:
 page_text=dict(pool.map(readpage,range(1,49)))
print("OCR ALL 48",flush=True)
out=root/"B卷48页_原题全文OCR_待核对.md"
out.write_text("# 用户2025招聘笔试PDF·逐页文字识别\n\n> OCR不是人工校对；图形、分数、中文选项要对照原页。\n\n"+"\n\n".join("## PDF第"+str(p)+"页\n\n"+page_text[p] for p in range(1,49)),encoding="utf8")

groups=[
 ("金融",10,15,17,"B卷_02综合能力_金融与经济20题_口播.md"),
 ("经济",10,17,19,"B卷_02综合能力_金融与经济20题_口播.md"),
 ("言语第一组",10,19,22,"B卷_03综合能力_言语20题_口播.md"),
 ("言语第二组",10,22,26,"B卷_03综合能力_言语20题_口播.md"),
 ("数量",10,26,29,"B卷_04综合能力_数量与图形20题_口播.md"),
 ("图形",10,29,34,"B卷_04综合能力_数量与图形20题_口播.md"),
 ("判断推理",15,34,40,"B卷_05综合能力_判断推理15题_口播.md"),
 ("资料分析第一组",5,40,41,"B卷_06综合能力_资料分析20题_口播.md"),
 ("资料分析第二组",5,42,43,"B卷_06综合能力_资料分析20题_口播.md"),
 ("资料分析第三组",5,43,45,"B卷_06综合能力_资料分析20题_口播.md"),
 ("资料分析第四组",5,46,47,"B卷_06综合能力_资料分析20题_口播.md")
]
pattern=re.compile(r"题目\s*(\d{1,2})\s*[:：]?",re.M)
for group,n,first,last,notefile in groups:
 source="\n".join(f"\n【PDF第{i}页】\n"+page_text[i] for i in range(first,last+1))
 hits=list(pattern.finditer(source))
 cand=[(int(m.group(1)),source[m.start():hits[i+1].start() if i+1<len(hits) else len(source)]) for i,m in enumerate(hits)]
 old=(studio/notefile).read_text(encoding="utf8")
 md=["# B卷"+group+"｜全文题面+原答案+口播讲解", "", "来源：用户上传的2025招聘笔试完整版真题及答案解析PDF，第"+str(first)+"—"+str(last)+"页。", "", "【核对提醒】PDF扫描可能错识别，图形计算一定看原始图像。下面逐题引用原卷OCR和人工整理的专属解题思路，不要凭OCR错字新造题。",""]
 cursor=0
 for q in range(1,n+1):
  match=next(((i,b) for i,(num,b) in enumerate(cand[cursor:],cursor) if num==q),None)
  if match:
   pos,raw=match;cursor=pos+1
  else:raw="【这一题OCR未能准确分割，须以PDF原始页面核对，不得自编选项。】"
  ans=re.search(r"参考答案\s*[:：]\s*([A-D]{1,5})",raw)
  answer=ans.group(1) if ans else "见原PDF答案栏"
  # Include original previously written explanation, keyed by the question number.
  blocks=re.split(r"(?=^## .*第\d+题)",old,flags=re.M)
  candidates=[b for b in blocks if re.search(r"第"+str(q)+r"题\b",b.splitlines()[0])]
  if group=="金融":candidates=[b for b in candidates if "金融" in b.splitlines()[0]]
  if group=="经济":candidates=[b for b in candidates if "经济" in b.splitlines()[0]]
  if group.startswith("言语"):
   target="一" if group.endswith("一组") else "二"
   candidates=[b for b in candidates if ("第"+target+"组") in b.splitlines()[0]]
  note=candidates[0] if candidates else "此题旧版讲解段落未能定位，请核对原PDF后讲解。"
  md.extend([
  "## "+group+"第"+str(q)+"题","",
  "老师说：同学们，这一题我会完整讲题，不先让你答。先听原卷题干和A、B、C、D四个选项：","",
  "~~~text",raw[:5500],"~~~","",
  "原卷参考答案："+answer+"。","",
  "下面是这道题的详细解题思路。"+note,"",
  "老师说：现在我们把题目条件和答案逐一核对，记住这道题的判定方法，继续下一题。",""
  ])
 dst=studio/("B卷_全文校对口播_"+group+".md")
 dst.write_text("\n".join(md),encoding="utf8")
 print("WROTE",dst.name,flush=True)
