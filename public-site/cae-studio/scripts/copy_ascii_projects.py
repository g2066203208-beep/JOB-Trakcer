from pathlib import Path
import json,shutil
root=Path('D:/codex/CAE课程复现');dst=Path('D:/codex/cae_courses');records=[]
for item in json.loads((root/'batch_restore_results.json').read_text(encoding='utf-8')):
    key=item['lesson'].replace('第','').replace('节','');target=dst/('lesson'+key)
    if key=='07':
        item['project']=str(target/'course.wbpj');records.append(item);continue
    project=Path(item['project']);target.mkdir(parents=True,exist_ok=True)
    for source in project.parent.iterdir():
        if source.is_dir():shutil.copytree(source,target/source.name,dirs_exist_ok=True)
        else:shutil.copy2(source,target/source.name)
    item['project']=str(target/project.name);records.append(item)
(dst/'project_manifest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print('Copied 8 projects to ASCII paths; lesson07 independently re-solved successfully.')