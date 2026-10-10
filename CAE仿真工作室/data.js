/* 内容均为工作室索引，状态不代表原始证据已经入库。 */
window.CAE_DATA={
 tracks:[
  {id:"foundation",name:"有限元理论与验证基础",desc:"建立力学模型、单元、自由度、刚度矩阵、边界条件与数值误差的基本判断力。",tasks:["结构力学与有限元基本方程","网格收敛性与单元选择","手算/解析解对照","形成标准计算报告"]},
  {id:"abaqus",name:"Abaqus 结构仿真实操",desc:"静力、模态、接触、材料非线性和时程；围绕输入文件、步骤控制和 ODB 结果做复现。",tasks:["悬臂梁静力与网格敏感性","模态提取与质量参与系数","接触/几何非线性案例","应力时程与报告输出"]},
  {id:"explicit",name:"显式动力学与 LS-DYNA",desc:"学习时间步、质量缩放、接触、能量平衡与冲击响应，先做公开标准算例再扩展。",tasks:["显式中心差分与稳定时间步","接触与材料本构检查","能量平衡和异常排查","完成一套验证算例"]},
  {id:"cross",name:"跨行业与多工具扩展",desc:"面向机械结构、动力疲劳和新能源：几何、网格、载荷、疲劳、优化形成软件间工作流。",tasks:["SolidWorks/CAD 几何清理","ANSYS 求解流程对照","MATLAB 数据与曲线分析","振动/疲劳工况评估"]},
  {id:"portfolio",name:"工业级验证与作品集",desc:"以可重复、可审计、能解释设计决策为验收标准，而非只展示漂亮的应力云图。",tasks:["配置/模型版本与单位核对","载荷/材料/边界证据表","网格与敏感性验证","一页案例展示与完整报告"]}
 ],
 software:[
  {name:"Abaqus",type:"求解器",status:"已有项目实践",desc:"结构有限元：混塔、模态、非线性分析；继续加强接触、材料与后处理。"},
  {name:"LS-DYNA",type:"求解器",status:"有接触经历",desc:"显式动力学、接触和材料本构；独立、可公开的验证案例待建设。"},
  {name:"ANSYS",type:"求解器",status:"基础接触",desc:"结构分析工具；以独立算例检验熟练程度，不直接标为精通。"},
  {name:"SolidWorks",type:"前处理",status:"已有使用经验",desc:"参数化建模与装配、模型简化、CAE 几何准备。"},
  {name:"AutoCAD",type:"前处理",status:"已有接触",desc:"二维工程图与几何信息整理，为前处理提供基础。"},
  {name:"OpenFAST",type:"动力学",status:"已有项目实践",desc:"整机风机载荷与动力响应，多风况时程和疲劳相关指标。"},
  {name:"Simpack",type:"动力学",status:"已有项目实践",desc:"多体动力学与柔性体分析；在项目边界内单独积累方法。"},
  {name:"MATLAB",type:"工具",status:"已有接触",desc:"数值分析、信号与结果可视化，实际熟练度通过练习进一步验证。"},
  {name:"Excel / 数据处理",type:"工具",status:"已有项目实践",desc:"仿真结果统计、工况筛选、误差与疲劳指标汇总。"}
 ],
 cases:[
  {id:"DTU10-TOWER",tag:"STRUCTURAL / WIND",banner:"a",category:"研究记录",title:"10 MW 风机 158 m 混合塔架",desc:"基于 DTU 10 MW 整机与预应力混凝土—钢混塔，建立结构有限元与整机载荷分析链条。",software:["Abaqus","OpenFAST","SolidWorks"],metrics:[["158 m","混合塔架高度"],["36 组","随机风工况记录"]],work:["混塔几何与材料、边界及有限元设置","整机载荷时程筛选、模态与结构响应","统计与疲劳等效载荷分析"],verification:"现有研究记录提及首阶水平弯曲频率偏差约 0.79%；需将参考值、模型版本、求解结果及图表原文件逐一归档后，才可作为公开可复现成果。",missing:"完整原始 CAE 模型、可公开的载荷/输出、网格校核材料、图表及正式技术报告尚未在本工作室登记。"},
  {id:"MONITOR-15MW",tag:"HEALTH MONITORING",banner:"b",category:"研究记录",title:"塔架刚度退化与虚拟测点",desc:"围绕结构健康监测，比较多级等效刚度退化条件下的应变敏感性与测点位置。",software:["Abaqus","Excel"],metrics:[["D00–D30","等效退化级别"],["20 个","虚拟测点记录"]],work:["正常/退化工况建模与计算","近场、远场响应差异分析","提取识别敏感性与监测指标"],verification:"研究记录给出 D30 时近场应变增幅约 38.6%，远场约 0.084%；结果表、测点坐标、计算条件等仍待移入并审查。",missing:"模型、测点清单、后处理表、应变云图和误差分析待补。"},
  {id:"NAFEMS",tag:"VERIFICATION / BENCHMARK",banner:"c",category:"研究记录",title:"NAFEMS 标准算例方法验证",desc:"把公开基准问题引入有限元验证，重点训练解算精度、边界条件与对比报告。",software:["Abaqus"],metrics:[["5H / 5R","研究记录提及"],["待归档","输入与结果"]],work:["核对公开算例定义与单位体系","按标准条件建立数值模型","与参考解逐项比较并解释偏差"],verification:"当前仅有既往方法验证记录；尚无可在本工作室审阅的基准输入、结果及完整误差表，不能标为已复核通过。",missing:"原始文献、输入文件、参考解、误差计算与图表。"},
  {id:"CANTILEVER",tag:"TRAINING / STATIC",banner:"d",category:"规划练习",title:"悬臂梁网格收敛练习",desc:"建立一套从解析解到有限元后处理的入门基准，以此检验网格和单元选型。",software:["Abaqus","ANSYS"],metrics:[["0 项","实际计算归档"],["待执行","练习状态"]],work:["明确尺寸、材料、荷载与解析解","采用至少三档网格进行收敛检查","输出位移、应力和误差表"],verification:"练习方案，未声明已有仿真或结果。",missing:"所有输入与结果均待完成。"}
 ],
 resources:[
  {category:"工作室",title:"CAE 资料总说明",desc:"目录结构、状态规则、素材命名与学习-验证-发布流程。",url:"https://github.com/g2066203208-beep/JOB-Trakcer/blob/main/CAE仿真工作室/README.md"},
  {category:"工作模板",title:"标准仿真案例记录模板",desc:"问题、单位、材料、边界、网格、计算、校核、文件索引。",url:"https://github.com/g2066203208-beep/JOB-Trakcer/blob/main/CAE仿真工作室/模板/CAE案例记录模板.md"},
  {category:"案例档案",title:"案例目录与归档规范",desc:"按案例 ID 管理输入/输出和状态，不混用“计划”和“已验证”。",url:"https://github.com/g2066203208-beep/JOB-Trakcer/blob/main/CAE仿真工作室/案例/README.md"},
  {category:"学习路线",title:"CAE 分阶段训练路线",desc:"按技能与可验收的模拟任务推进，面向机械与结构仿真通用能力。",url:"https://github.com/g2066203208-beep/JOB-Trakcer/blob/main/CAE仿真工作室/学习路线.md"},
  {category:"官方文档",title:"Abaqus 文档入口",desc:"实际版本和可访问权限以软件安装与官方帮助为准。",url:"https://help.3ds.com/"},
  {category:"官方文档",title:"Ansys 帮助中心",desc:"使用官方帮助核对求解器功能、单元及限制条件。",url:"https://ansyshelp.ansys.com/"},
  {category:"官方文档",title:"OpenFAST 官方仓库",desc:"风机开源模型、文档、示例和版本变更。",url:"https://github.com/OpenFAST/openfast"},
  {category:"官方资源",title:"NAFEMS 官网",desc:"有限元验证、基准算例和工程仿真质量相关资源。",url:"https://www.nafems.org/"},
  {category:"成果归档",title:"模型与图表上传规范",desc:"优先记录来源、许可、版本、原始数据和生成方法。",url:"https://github.com/g2066203208-beep/JOB-Trakcer/blob/main/CAE仿真工作室/成果/README.md"}
 ]
};