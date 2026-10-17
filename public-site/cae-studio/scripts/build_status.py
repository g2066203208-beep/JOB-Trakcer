from pathlib import Path
import json,html,re,datetime
root=Path('D:/codex/CAE课程复现')
projects=json.loads((root/'batch_restore_results.json').read_text(encoding='utf-8'))
lookup={p['lesson']:p for p in projects}
rows=[]
for i in range(1,14):
    lesson=f'第{i:02d}节';p=lookup.get('第04-05节' if i in (4,5) else lesson)
    checks=root/'02_课程核对'/('第04-05节' if i in (4,5) else lesson)
    items=[]
    for inv in checks.glob('Mechanical/*/mechanical_inventory.json'):
        sr=inv.with_name('solve_report.json')
        runs=json.loads(sr.read_text(encoding='utf-8')) if sr.exists() else []
        items.append({'system':inv.parent.name,'report':str(inv),'runs':[{'analysis':r.get('analysis'),'status':r.get('status'),'state':r.get('after_state',r.get('before_state'))} for r in runs]})
    rows.append({'lesson':lesson,'project':p['project'] if p else None,'system_count':len(p['systems']) if p else 0,'mechanical':items,'video_fully_verified':False,'course_complete':False})
(root/'课程执行汇总.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
lines=['# 课程执行记录','',f'更新时间：{datetime.datetime.now():%Y-%m-%d %H:%M:%S}','', '9 个配套 Workbench 工程全部恢复并打开，共 50 个系统。13 节视频已制作每课 12 帧的时间戳索引；这不代表完整观看或逐操作复现。','', '第一轮 Mechanical 检查和可用静力分支重算已执行。多份模型出现求解器生成 RST、但 Mechanical 状态为 SolveFailed 的问题，正在排查。失败状态下的截图与结果数值不能作为已验收云图或计算结论。','', '|课次|工作工程|系统数|读取模型数|课程全部完成|','|---|---|---:|---:|---|']
for r in rows:lines.append('|%s|%s|%d|%d|否|'%(r['lesson'],('[打开工程]('+r['project'].replace('\\','/')+')') if r['project'] else '未提供独立工程',r['system_count'],len(r['mechanical'])))
lines+=['','第03节的视频抽样显示主要为网格和单元类型理论讲解；第12、13节为升降机模型与连接简化，当前配套目录缺少对应几何与工程，视频参数尚未完整提取，未使用猜测尺寸冒充复现。','','原始下载压缩包保持不变。每个系统的 Mechanical 对象树、属性、重算状态见 02_课程核对/<课次>/Mechanical/<系统>。']
(root/'当前执行状态.md').write_text('\n'.join(lines),encoding='utf-8')
body=['<!doctype html><html lang="zh"><meta charset="utf-8"><title>CAE课程复现记录</title><style>body{font:16px system-ui;margin:32px;max-width:1400px;background:#f5f7fa;color:#17233a}article{background:white;padding:24px;margin:20px 0;border-radius:12px}img{max-width:100%}a{color:#095baf}small{color:#526078}</style><h1>CAE课程复现记录</h1><p>工程恢复与计算复核工作区。课程逐步骤复现尚未全部完成。失败求解不作为有效结果。</p>']
for r in rows:
    lesson=r['lesson'];body.append('<article><h2>'+lesson+'</h2>')
    if r['project']:body.append('<p><a href="'+Path(r['project']).as_uri()+'">打开 Workbench 工程</a> · '+str(r['system_count'])+' 个系统</p>')
    else:body.append('<p>未提供独立工程；需继续核对课程内容。</p>')
    frame=root/'02_课程核对'/lesson/'视频索引/contact_sheet.png'
    if frame.exists():body.append('<details><summary>查看视频时间戳索引（课程原画面）</summary><img src="'+frame.as_uri()+'"></details>')
    for x in r['mechanical']:
        status='；'.join(y['analysis']+': '+str(y['state']) for y in x['runs']) or '模型已读取'
        body.append('<p><a href="'+Path(x['report']).as_uri()+'">'+html.escape(x['system'])+'</a> '+html.escape(status)+'</p>')
    body.append('</article>')
body.append('</html>')
(root/'课程总览.html').write_text('\n'.join(body),encoding='utf-8')
print('Saved course index and truthful status for 13 lessons')