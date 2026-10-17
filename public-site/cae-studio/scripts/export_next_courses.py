import os,sys,json,subprocess,time
from pathlib import Path
root=Path('D:/codex/cae_courses')
site=Path('D:/codex/cae-portfolio-publish/public-site/cae-studio')
env=os.environ.copy()
env.update(PYTHONHOME='D:/ansys/ANSYS Inc/v242/optiSLang/lib/python3.10',PYTHONPATH='D:/codex/2026-10-08/xian/work/cae_studio_audit/python-deps',DPF_SERVER_TYPE='LEGACYGRPC',AWP_ROOT242='D:/ansys/ANSYS Inc/v242',TEMP='D:/temp',TMP='D:/temp',PYTHONDONTWRITEBYTECODE='1',PYTHONIOENCODING='utf-8')
report=[]
for lesson in ['lesson11','lesson10','lesson09','lesson08','lesson06']:
 for rst in sorted((root/lesson).rglob('file.rst')):
  key=lesson+'-'+rst.parent.parent.name
  out=site/'results'/(key+'.cae.json')
  log=Path('D:/codex/CAE课程复现/04_网站验收')/(key+'-export.log')
  try:
   proc=subprocess.run(['D:/ansys/ANSYS Inc/v242/optiSLang/lib/python.exe',str(site/'scripts/ansys_rst_export.py'),str(rst),'--out',str(out),'--max-frames','12','--length-unit','mm','--stress-unit','MPa'],env=env,capture_output=True,text=True,encoding='utf8',errors='replace',timeout=180)
   log.write_text(proc.stdout+'\n'+proc.stderr,encoding='utf8')
   row=dict(id=key,lesson=lesson,status='exported' if proc.returncode==0 else 'blocked',log=str(log),source=str(rst))
   if proc.returncode==0:
    d=json.loads(out.read_text(encoding='utf8'));row.update(nodes=len(d['nodes']),frames=len(d['frames']),analysis=d['analysis'],fields=list(d['frames'][0]['scalars']),warnings=d['warnings'])
   else: row['reason']=proc.stderr[-1000:]
  except subprocess.TimeoutExpired: row=dict(id=key,lesson=lesson,status='blocked',reason='180 second export timeout')
  report.append(row)
  Path('D:/codex/CAE课程复现/04_网站验收/batch-3d-export.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
  print(json.dumps(row,ensure_ascii=False),flush=True)
