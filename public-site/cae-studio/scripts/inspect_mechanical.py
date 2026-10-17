# encoding: utf-8
import os,io,json,traceback
out=COURSE_OUT
if not os.path.isdir(out):os.makedirs(out)
def txt(v):
    try:return unicode(v)
    except:return '<unavailable>'
def dump(name,data):
    with io.open(os.path.join(out,name),'w',encoding='utf-8') as f:f.write(unicode(json.dumps(data,ensure_ascii=False,indent=2)))
def record(obj,depth=0):
    row={'name':txt(obj.Name),'type':txt(obj.GetType().FullName)}
    for key in ['ObjectId','ObjectState','Suppressed','Material','Thickness','CrossSection','Volume','Mass','ElementCount','NodeCount','ContactType','FrictionCoefficient','DefineBy','Magnitude','Minimum','Maximum','Average','SolverFilesDirectory','AnalysisType','State']:
        try:row[key]=txt(getattr(obj,key))
        except:pass
    try:
        row['properties']=[{'name':txt(p.Name),'value':txt(p.InternalValue)} for p in obj.VisibleProperties]
    except:pass
    row['fields']={}
    for key in ['XComponent','YComponent','ZComponent','Magnitude','Preload','Pressure','Temperature','Displacement','Rotation']:
        try:
            field=getattr(obj,key)
            row['fields'][key]={'output':[txt(v) for v in field.Output.DiscreteValues],'inputs':[[txt(v) for v in inp.DiscreteValues] for inp in field.Inputs]}
        except:pass
    for key in ['Location','SourceLocation','TargetLocation']:
        try:row[key]=[int(i) for i in getattr(obj,key).Ids]
        except:pass
    if depth<8:
        try:row['children']=[record(c,depth+1) for c in obj.Children]
        except:pass
    return row
try:
    model=ExtAPI.DataModel.Project.Model
    dump('mechanical_inventory.json',{'new_solve':False,'model':record(model)})
    try:
        model.Geometry.Activate()
        ExtAPI.Graphics.Camera.SetFit()
        ExtAPI.Graphics.ExportImage(os.path.join(out,'model_native.png'))
    except:dump('image_error.json',{'error':traceback.format_exc()})
except:dump('inspection_error.json',{'error':traceback.format_exc()})