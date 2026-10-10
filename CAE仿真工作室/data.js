/* 这里只登记研究案例背景；没有假图片、假云图或伪造的计算数据。
 * 本仓库项目的浏览器本地上传结果，由 app.js 的 IndexedDB 单独维护。
 * 公开作品图片放入 成果/项目ID/ 后，添加 assets: [{id,projectId,title,kind,src,...}]。
 */
window.CAE_SEED={
 projects:[
  {id:"CAE-001",title:"10 MW 风电机组混合塔架",subtitle:"158 m 预应力混凝土—钢混合塔架",description:"Abaqus 混塔结构分析与 OpenFAST 整机载荷工况。这里预留模态、应力时程、结构响应及疲劳评价成果的正式展示位置；原始图表需先核验再上架。",software:"ABAQUS / OPENFAST",disciplines:["结构有限元","动力响应","多工况分析"],status:"研究记录 · 图片待归档",featured:true,cover:null},
  {id:"CAE-002",title:"塔架刚度退化与监测点分析",subtitle:"STRUCTURAL HEALTH MONITORING",description:"多级等效刚度退化、虚拟测点与应变敏感性比较。等待归档可追溯的模型、云图和曲线后再作成果展示。",software:"ABAQUS",disciplines:["有限元","结构监测","响应对比"],status:"研究记录 · 图片待归档",featured:false,cover:null},
  {id:"CAE-003",title:"NAFEMS 标准算例验证",subtitle:"VERIFICATION / BENCHMARK",description:"面向有限元解算验证的标准算例档案。报告、题设、参考解和误差表尚未统一迁入本展示站。",software:"ABAQUS",disciplines:["标准算例","数值验证","误差分析"],status:"研究记录 · 图片待归档",featured:false,cover:null}
 ],
 assets:[]
};