from pathlib import Path
import shutil,json,hashlib,re
src=Path('D:/codex/JOB-Trakcer/CAE仿真工作室/portfolio');out=Path('D:/codex/cae-portfolio-publish/public-site/cae-studio')
shutil.copytree(src,out,dirs_exist_ok=True)
p=out/'index.html';s=p.read_text(encoding='utf-8').replace('href="../"','href="./"').replace('仿真工作室 ↗','13 节课程档案 ↗').replace('返回工作室','返回案例首页');p.write_text(s,encoding='utf-8')
p=out/'records/REFERENCES.md';s=p.read_text(encoding='utf-8');s=s[:s.index('## 能力规划')]+'## 内容范围\n\n严格按用户提供的13节课程原顺序组织。分析方向只作为分类标签，案例内容和步骤以实际课程与执行证据为准，不按岗位假设扩大范围。\n';p.write_text(s,encoding='utf-8')
manifest=json.loads((out/'manifest.json').read_text(encoding='utf-8'))
(out/'records/provenance.json').write_text(json.dumps({'date':'2026-10-17','source':'用户提供的华仿CAE课程归档','course_original_version':'2023 R1','execution_version':'2024 R2','course_complete':False,'figures':[f for c in manifest['cases'] for f in c['figures']]},ensure_ascii=False,indent=2),encoding='utf-8')
readme=out/'README.md';readme.write_text('''# CAE 课程复现作品集

按13节课程原顺序整理的公开展示页。每个案例有方向、内容、复现记录、参数证据和本人运行生成的原生图。当前是持续完善中的档案，**全部课程逐步骤复现尚未完成**。

- `index.html`：作品集页面，支持分类、详情、图片与记录查看。
- `records/`：全过程标准、执行日志摘要、案例操作记录及参数数据。
- `scripts/`：实际使用的自动化脚本；运行前检查本机路径与ANSYS版本。不得对唯一原始工程执行清理数据操作。
- `assets/`：本机生成的原生结果图；来源与SHA-256见`records/provenance.json`。
- `manifest.json`：结果状态与案例索引。Solved、数值验证、完整复现分别记录。

课程原视频、整套讲义、老师的工程归档及私人文件未放入公开网站。完整原始资料在本地保留。

真实操作记录包括API自动化，不冒充人工点击。尚缺的界面操作将重新演示并标记为补录。
''',encoding='utf-8')
p=Path('D:/codex/cae-portfolio-publish/README.md');s=p.read_text(encoding='utf-8');s+='\n## CAE课程复现作品集\n\n新增公开成果页：`public-site/cae-studio/`。按13节课程归档本人运行生成的结果、过程记录和验证状态；不发布课程原视频、原始工程包或个人申请资料。\n';p.write_text(s,encoding='utf-8')
print('Public portfolio prepared:',sum(p.stat().st_size for p in out.rglob('*') if p.is_file()),'bytes')