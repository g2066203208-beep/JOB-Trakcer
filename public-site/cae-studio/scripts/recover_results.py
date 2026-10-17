# encoding: utf-8
import re,time
runs=[]
for idx,analysis in enumerate(model.Analyses):
    row={'analysis':txt(analysis.Name),'before_state':txt(analysis.ObjectState),'status':'checking','video_verified':False}
    runs.append(row)
    try:
        work=txt(analysis.WorkingDir)
        rst=os.path.join(work,'file.rst');log=os.path.join(work,'solve.out');deck=os.path.join(work,'ds.dat')
        row['solver_directory']=work
        if os.path.exists(rst) and os.path.exists(log):
            with open(log,'r') as f:logtext=f.read()
            if not re.search(r'NUMBER OF ERROR\s+MESSAGES ENCOUNTERED=\s+0',logtext):
                row['status']='solver_errors_require_review';continue
            with open(deck,'r') as f:decktext=f.read(12000)
            units=re.search(r'/units,([^\r\n]+)',decktext,re.I)
            unit=units.group(1).strip().upper() if units else ''
            if unit!='MKS':row['status']='unit_system_requires_review';row['units']=unit;continue
            row['status']='reading_local_recomputed_rst';dump('recovery_report.json',runs)
            analysis.Solution.ReadGivenAnsysResultFileByReference(rst,UnitSystemIDType.UnitsMKS)
            analysis.Solution.EvaluateAllResults()
            row['status']='read_complete'
        elif row['before_state'] in ['Solved','FullyDefined','SolveRequired'] and txt(analysis.AnalysisType)=='Modal':
            row['status']='solving_modal';dump('recovery_report.json',runs)
            analysis.Solution.ClearGeneratedData();analysis.Solution.Solve(True)
            row['status']='modal_solve_returned'
        else:
            row['status']='retained_requires_step_review';continue
        row['after_state']=txt(analysis.Solution.ObjectState)
        row['results']=[record(c) for c in analysis.Solution.Children]
        row['messages']=[txt(m.DisplayString) for m in ExtAPI.Application.Messages]
        if row['after_state']=='Solved':
            for k,result in enumerate(analysis.Solution.Children):
                if '.Results.' in txt(result.GetType().FullName):
                    try:
                        result.Activate();ExtAPI.Graphics.Camera.SetFit()
                        ExtAPI.Graphics.ExportImage(os.path.join(out,'verified_native_%02d_%02d.png'%(idx,k)))
                    except:row.setdefault('image_errors',[]).append(traceback.format_exc())
    except:row['status']='failed';row['error']=traceback.format_exc()
    finally:dump('recovery_report.json',runs)