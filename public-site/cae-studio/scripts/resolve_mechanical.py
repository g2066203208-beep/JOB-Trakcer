# encoding: utf-8
import time
runs=[]
for idx,analysis in enumerate(model.Analyses):
    row={'analysis':txt(analysis.Name),'before_state':txt(analysis.ObjectState),'started':time.time(),'status':'checking','video_verified':False}
    runs.append(row);dump('solve_report.json',runs)
    try:
        if row['before_state'] not in ['Solved','FullyDefined','SolveRequired']:
            row['status']='not_run_requires_review';continue
        if txt(analysis.AnalysisType) not in ['Static','StaticStructural']:
            row['status']='not_run_analysis_type_requires_review';row['analysis_type']=txt(analysis.AnalysisType);continue
        solution=analysis.Solution
        solution.ClearGeneratedData()
        row['status']='solving';dump('solve_report.json',runs)
        solution.Solve(True)
        row['after_state']=txt(solution.ObjectState)
        row['solver_directory']=txt(analysis.WorkingDir)
        row['results']=[record(c) for c in solution.Children]
        row['status']='solve_returned'
        try:
            for k,result in enumerate(solution.Children):
                if '.Results.' in txt(result.GetType().FullName):
                    result.Activate()
                    ExtAPI.Graphics.Camera.SetFit()
                    ExtAPI.Graphics.ExportImage(os.path.join(out,'result_%02d_%02d.png'%(idx,k)))
        except:row['image_error']=traceback.format_exc()
    except:row['status']='failed';row['error']=traceback.format_exc()
    finally:
        row['finished']=time.time();dump('solve_report.json',runs)