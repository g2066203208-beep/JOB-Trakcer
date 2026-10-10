# Abaqus / ANSYS → 网页三维应力云图和变形动画

目前工作室除了图片、CSV、动画和报告，还提供 **CAE Field Viewer**，可操作真实数据（不是示意云图）：

- 旋转/缩放真实表面三角网格
- **位移云图 U, Magnitude**，按帧播放
- **应力等标量云图**，由导出文件中的节点数值着色
- **变形倍数 0—50×**（1× 为物理位移，不自动缩放）
- 显示或隐藏未变形原形与表面网格线
- 按帧切换、播放、固定当前帧查看节点插值值
- 结果色标及数值范围（当前帧自动计算）

**请勿混淆：这不是在线求解器，也不是完整版 Abaqus/Viewer 或 ANSYS Mechanical。** 不支持网页直接读取 ODB/RST，不支持完整积分点/截面/接触、单元内场、求解器特定平均与分层输出。云图展示的是**导出的外表面节点数据**，剖面和内部数据需扩展格式。

## 两种软件怎么导出

### A. ANSYS Mechanical / MAPDL 结构结果（.rst）

1. 确保 ANSYS 已计算完成，留存真实的 \`file.rst\` 及使用的单位制。
2. 在可使用 **PyDPF-Core** 且可连接匹配版本 DPF 服务的 Python 环境中安装 \`ansys-dpf-core\`、\`pyvista\`、\`numpy\`。
3. 在该环境执行：

    python 导出工具/ansys_rst_export.py "D:\models\file.rst" --out "ansys.cae.json" --max-frames 15 --length-unit mm --stress-unit MPa

4. 脚本从 RST 用 DPF 提取原始外表面、位移 \`U\` 和可用时的节点 Mises 应力，导出多个真实计算帧。
5. 将 \`ansys.cae.json\` 拖入网站，选择 **FE 云图 / 变形** 即可旋转、变形放大、选择变量和动画播放。

脚本基于官方 DPF 的 \`Model\`、\`meshed_region.grid\`、\`displacement\`、\`stress\` 和 PyVista 的表面提取。节点顺序不能校核一致时**直接停止导出**，不能猜测数据映射。不同版本、单元和应力位置可能限制提取，应以原生 ANSYS 后处理核验为准。

**单位不得猜测**：命令中的 \`--length-unit\`、\`--stress-unit\` 仅用于显示标签，必须由自己的求解模型确认；脚本不会替你做单位换算。

### B. Abaqus / Standard 或 Explicit（.odb）

1. 确认计算生成了真实 \`model.odb\`，并保存原始模型和工况记录。
2. 在 Abaqus 自带 Python 解释器中运行（不要用普通 Python，普通 Python 没有 \`odbAccess\`）：

    abaqus python abaqus_odb_export.py --odb model.odb --step Step-1 --out abaqus.cae.json --max-frames 15 --length-unit mm --stress-unit MPa

   或在 Abaqus/CAE noGUI 方式运行脚本。选择的分析步中必须包含 \`U\`，应力需要 \`S\` 输出。

3. 将 \`abaqus.cae.json\` 导入网站的 FE 云图功能。

脚本支持常见的 C3D8/C3D20、C3D4/C3D10、C3D6/C3D15、S3/S4 和部分二维连续体单元，并将二次单元边界按角节点线性显示。**不支持的单元会打印警告**，因此不适合直接用来声称复杂全模型已完整复现。

### 特别重要：应力云图不是原软件的“逐像素复刻”

- **ANSYS**：DPF 将 \`stress\` 请求到节点位置，计算 von Mises 不变量；根据单元类型和设置，节点平均/外推与 Mechanical 里的显示可能不同。
- **Abaqus**：如果输出包含存储的 NODAL 应力，脚本优先使用；否则使用 ELEMENT_NODAL 外推值，并取每个表面节点的**最大值包络**，会标为 \`S, Mises (nodal max)\`。它并不等于 Abaqus 的默认节点平均云图。
- 两者都应在网页上同时标注真实工况、材料、边界、坐标、单位、时间步和方法说明，再用于技术作品集。
- 不允许将自动提取文件的结果说成已与原求解器校核通过。

## 浏览器的结果文件结构

导出器目标是统一格式 \`*.cae.json\`。字段是：

~~~json
{
  "format": "cae-field-v1",
  "source": "ANSYS or Abaqus",
  "units": {"U, Magnitude":"mm","S, Mises":"MPa"},
  "nodes": [],
  "triangles": [],
  "frames": [
    {
      "label": "Step / Frame",
      "time": 0.0,
      "displacement": [],
      "scalars": {"S, Mises":[]}
    }
  ]
}
~~~

上面只是**字段结构说明，数组为空，不是仿真计算结果**。 \`nodes\` 必须由真实节点的三维坐标组成；\`triangles\` 是引用节点数组零起始索引的三角形；\`displacement\` 与 \`scalars\` 都对应表面节点一一对齐。

真实导出样式：\`nodes=[[x,y,z],...]\`、\`triangles=[[0,1,2],...]\`、每帧位移 \`[[ux,uy,uz],...]\`、节点标量 \`[value,...]\`。缺失的应力值可用 JSON \`null\` 标识，**不能偷偷填为 0**。

## 性能和公开发布

- 网页端当前限制不超过 **35 万表面节点、75 万个表面三角面、150 帧**；过大时先做局部裁剪或时间帧抽取。
- 长时间历程全部逐点放入 JSON 会膨胀得很快。可选代表时间步或单独用 CSV 绘制全时程曲线。
- 导出脚本是**首版适配器，尚未在你本机的实际 RST/ODB 上运行验证**。遇到接口版本或特定元素差异，必须在真实模型上修复并比较软件原生结果后才能说“导出闭合”。
- 文件上传到网页后默认**只在当前浏览器本地保存**，不会自动同步 GitHub；公开发布需要将 \`*.cae.json\` 写入 \`成果/案例ID\` 并在 \`data.js\` 中登记资产条目。

## 参考官方资料

- ANSYS DPF 模型与结果接口：https://dpf.docs.pyansys.com/version/stable/user_guide/model.html
- ANSYS DPF 导出 VTU：https://dpf.docs.pyansys.com/version/stable/api/ansys/dpf/core/operators/serialization/vtu_export/vtu_export.html
- ANSYS DPF 网格（PyVista grid）：https://dpf.docs.pyansys.com/version/stable/api/ansys/dpf/core/meshed_region/MeshedRegion.html
- Abaqus 文档请使用当前已安装软件对应版本的 Abaqus Scripting Reference 与 ODB API。
