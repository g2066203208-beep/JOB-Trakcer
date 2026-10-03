# Rig Motion Lab · 阿米娅 Spine 3.5 动作工作室

这是针对本仓库内 **阿米娅 Spine 3.5.51 原始工程** 重做的浏览器端工作室，不再使用自制的近似骨骼播放器。

## 先说明资源真实结构

上传包中的：

- `默认`
- `报童`
- `见习联结者`
- `播种者`

是 **4 套独立角色/外观工程**，不是同一个 Spine JSON 内的 4 个 Skin。每一套又各自分为：

- 战斗正面
- 战斗背面
- 基建

因此案例库一共是 **12 个独立 Spine 工程**。这些 JSON 内部的 `skins` 实际只有 `default`。

战斗工程中的动作也不是简单的一堆无关 Clip。工作室会把原始片段按工程语义组织为：

- `Attack_Begin → Attack → Attack_End`
- `Skill_Begin → Skill → [Skill_Loop_2] → Skill_End`
- `Skill_2_Begin → Skill_2 → Skill_2_End`

同时保留每一个原始 Spine Clip，方便逐段检查和编辑。

## 为什么必须使用真实 Spine 3.5 Runtime

这些动作不只包含 Bone 的 rotate / translate / scale。原工程同时使用：

- Bone：rotate / translate / scale / shear
- Slot：attachment / color
- IK Constraint
- Transform Constraint
- Path Constraint
- Deform
- Draw Order
- Event
- Region / Mesh / weighted Mesh attachment

其中复杂工程包含大量 Path Constraint。若只手算骨骼矩阵再贴图，动作、网格和约束结果都会失真。

因此当前版使用与 Spine 3.5 数据对应的 **pixi-spine 1.3.x runtime** 作为权威求值器；皮肤、约束、deform、drawOrder、attachment 动画都由 runtime 执行，Canvas 只负责编辑器网格和骨骼操作层。

## 当前工作室能力

- 12 套原始阿米娅工程案例库
- 真实 Spine 3.5 Runtime 播放
- 原始动作片段 + Begin/Main/End 动作组
- `.atlas + PNG + JSON` 皮肤与 Mesh 渲染
- IK / Transform / Path / Deform / DrawOrder / Event 的运行时求值
- 骨骼层级、当前 Runtime 姿态检查
- 对当前原始动画片段写入 translate / rotate / scale 关键帧
- Setup Pose 编辑并重建 Runtime
- Slot 显隐、Attachment 强制切换、透明度
- 播放、逐帧、时间线、阶段条、事件标记
- Spine JSON / ZIP 导入
- 浏览器 IndexedDB 工程保存、JSON 导出
- GitHub Pages 托管

## 编辑边界

当前版首先保证 **“看见的动作就是原文件真实运行结果”**。它已经不再伪造 Spine 求值。

仍需继续扩展的专业编辑能力包括：

- IK / Transform / Path Constraint 的可视控制器与关键帧编辑 UI
- Deform 顶点逐点编辑和曲线编辑器
- Mesh 权重刷与顶点工具
- Dope Sheet / Graph Editor
- Event 编辑器
- Spine 原生格式完整回写/导出验证

这些功能应建立在真实 Runtime 之上，而不是再写一套近似动画系统。