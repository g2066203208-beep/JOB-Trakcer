# Rig Motion Lab · 骨骼动画工作室

GitHub Pages 托管的浏览器端 2D 骨骼动画工作室。仓库内置用户提供的阿米娅 Spine 3.5.51 工程作为案例库。

## 当前能力

- 12 套阿米娅案例（4 外观 × 战斗正面 / 战斗背面 / 基建）
- **完整皮肤显示**：读取 Spine `.atlas + PNG + slots + skins`
- Region attachment 与 weighted Mesh attachment 实时蒙皮渲染
- Slot attachment 动画、slot 显隐、附件强制切换、drawOrder
- 皮肤透明度、皮肤/骨架独立开关
- Spine JSON + Atlas + PNG 多选导入
- 完整 ZIP 导入：自动匹配 JSON / Atlas / PNG
- 骨骼树、Setup Pose、动画播放、逐帧、时间线
- 骨骼创建 / 复制 / 删除 / 改父级 / 拖动 / 数值编辑
- 非破坏式当前帧关键帧覆盖、撤销 / 重做
- **动作学习**：按同一视角跨 4 套阿米娅工程统计同类动作的典型时长、关键帧密度与共同主运动骨骼
- **真实 Runtime 姿态训练**：直接读取 Spine 约束后的骨骼世界姿态，显示逐骨位移/角度误差
- 姿态快照、参考叠加、训练评分
- IndexedDB 浏览器本地工程保存与 JSON 导出
- GitHub Pages 静态托管

## Spine 兼容说明

当前渲染器支持 Spine 3.5 JSON 的骨骼动画、Region、weighted/unweighted Mesh、Slot attachment 和 drawOrder。`deform` 数据会保留在工程中，但暂未提供逐顶点 deform 曲线编辑器；这是后续专业网格编辑阶段要继续补齐的部分。

## v0.5.2

- 鼠标直接拖骨骼编辑，Shift 拖动旋转。
- Attack / Skill 循环播放与透视部件残留清理。
- 仓库案例只读，只能另存为工程。
