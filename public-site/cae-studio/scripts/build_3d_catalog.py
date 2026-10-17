import json,re
from pathlib import Path
site=Path('D:/codex/cae-portfolio-publish/public-site/cae-studio')
root=Path('D:/codex/cae_courses')
manifest=json.loads((root/'project_manifest.json').read_text(encoding='utf-8-sig'))
catalog=[]
for path in sorted((site/'results').glob('*.cae.json')):
 key=path.stem.removesuffix('.cae');lesson=key.split('-')[0]
 name='法兰螺栓连接' if key=='lesson07' else key
 if '-' in key:
  sysfolder=key.split('-',1)[1]
  for inv in (root/lesson/'evidence').glob('*/mechanical_inventory.json'):
   text=inv.read_text(encoding='utf-8-sig')
   if re.search(r'SolverFilesDirectory[^\n]*'+re.escape(sysfolder)+r'\\\\MECH',text):
    sysname=inv.parent.name.replace('_',' ')
    for proj in manifest:
     if Path(proj['project']).parent.name==lesson:
      name=next((s['display_text'] for s in proj['systems'] if s['name']==sysname),name)
    break
 d=json.loads(path.read_text(encoding='utf8'))
 kind={'modal':'模态','static':'静力','transient':'瞬态'}.get(d['analysis']['type'],'结果')
 catalog.append(dict(id=key,lesson=lesson,title=f'第{lesson[-2:]}节 · {name} · {kind} · {key}',url='results/'+path.name,nodes=len(d['nodes']),frames=len(d['frames']),analysis=d['analysis']['type']))
(site/'results/catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf8')
p=site/'portfolio.js';s=p.read_text(encoding='utf-8-sig')
old='${c.id==="lesson07"?`<p><a class="button" href="result.html">打开真实三维位移云图与加载帧播放 ↗</a></p>`:""}'
mapping={c['lesson']:c['id'] for c in catalog}
new='${'+json.dumps(mapping)+'[c.id]?`<p><a class="button" href="result.html?case=${'+json.dumps(mapping)+'[c.id]}">打开真实三维结果与动画 ↗</a></p>`:""}'
if old in s:p.write_text(s.replace(old,new),encoding='utf8')
p=site/'result.html';s=p.read_text(encoding='utf-8-sig')
s=re.sub(r'<h1>.*?</h1>','<h1>课程真实三维结果</h1><label>选择工程分支 <select id="choose" aria-label="选择工程分支" style="max-width:100%;padding:12px"></select></label>',s)
s=re.sub(r'<p class="note">.*?</p>','<p class="note" id="limits"></p>',s)
s=s.replace('<a href="results/lesson07.cae.json" download>','<a id="download" download>')
s=re.sub(r'<script type="module">.*?</script>','<script type="module" src="result-page.js"></script>',s,flags=re.S)
p.write_text(s,encoding='utf8')
print(json.dumps(catalog,ensure_ascii=False))
